# ADR-002 — Integración de Ingresos desde Tango Gestión

## Estado

Definido para implementación futura.

## Contexto

Direct Group usa Tango Gestión como sistema operativo principal para registrar ingresos, facturación y procesos administrativos asociados.

La Plataforma DG no debe reemplazar esa carga operativa. Para el módulo de Ingresos, la plataforma debe funcionar como una vista de consulta, control y análisis sobre la información registrada en Tango.

Tango corre sobre SQL Server dentro del servidor/red de la empresa. La web DG debe poder usarse desde cualquier computadora sin que cada usuario tenga que entrar al servidor ni conectarse directamente a SQL Server.

## Decisión

La integración se hará mediante un sincronizador interno instalado dentro de la red/servidor donde vive Tango.

La arquitectura objetivo será:

```txt
Tango Gestión
  ↓
SQL Server Tango, solo lectura
  ↓
DG Tango Sync Agent, dentro de la red de la empresa
  ↓ HTTPS seguro
DG Platform API
  ↓
PostgreSQL DG
  ↓
Panel Ingresos web
```

El navegador nunca se conectará directamente a SQL Server/Tango.

La Plataforma DG no escribirá en Tango. Toda corrección de ingresos seguirá realizándose en Tango Gestión.

## Responsabilidades por componente

### Tango Gestión / SQL Server

- Sigue siendo la fuente de verdad operativa.
- Contiene los ingresos cargados por los usuarios.
- Expone datos mediante una consulta SQL de solo lectura.
- No recibe escrituras desde Plataforma DG.

### DG Tango Sync Agent

Servicio liviano instalado en el servidor o en una máquina interna con acceso a SQL Server Tango.

Responsabilidades:

- Ejecutar la consulta SQL definida para ingresos.
- Normalizar tipos básicos: fechas, cantidades, códigos.
- Detectar cambios desde la última sincronización.
- Enviar datos a DG Platform por HTTPS.
- Registrar errores de conexión, consulta o envío.
- Reintentar automáticamente ante fallas temporales.

Puede implementarse como:

- Windows Service en Node.js.
- Windows Service en .NET.
- Tarea programada inicialmente, si se quiere una primera versión más simple.

Preferencia: Windows Service, porque permite ejecución continua, logs y reintentos más controlados.

### DG Platform API

Responsabilidades:

- Recibir lotes del sincronizador.
- Validar estructura.
- Persistir corrida de sincronización.
- Guardar raw data recibida.
- Normalizar a tablas operativas.
- Enriquecer cada fila con información propia de DG.
- Exponer datos al panel de Ingresos.

### PostgreSQL DG

Será la base de lectura de la web.

Tablas sugeridas:

```txt
tango_sync_runs
tango_income_raw_rows
tango_income_rows
```

Opcional futuro:

```txt
tango_income_row_events
```

## Modelo conceptual

### tango_sync_runs

Registra cada ejecución del sincronizador.

Campos sugeridos:

```txt
id
source
started_at
finished_at
status
rows_received
rows_inserted
rows_updated
rows_failed
error_message
agent_version
query_hash
created_at
```

### tango_income_raw_rows

Guarda el dato tal como vino desde Tango.

Campos sugeridos:

```txt
id
sync_run_id
external_hash
payload_json
received_at
```

### tango_income_rows

Tabla normalizada para consultar desde la web.

Campos sugeridos:

```txt
id
external_hash
cliente
operacion
fecha_pedido
orden_de_compra
codigo_cliente
codigo_unico
cantidad
origen_del_pasaje
fecha_entrega
entregado
pendiente
comentarios
match_status
last_seen_at
created_at
updated_at
```

## Identificación e idempotencia

La sincronización debe ser idempotente. Si el mismo dato llega dos veces, no debe duplicarse.

Como mínimo, se calculará un `external_hash` con una combinación estable de campos de Tango.

Ejemplo inicial:

```txt
operacion
fecha_pedido
orden_de_compra
codigo_cliente
cantidad
fecha_entrega
entregado
comentarios
```

Si más adelante se identifica un ID interno estable de Tango para cada línea, ese ID debe reemplazar o complementar el hash.

## Enriquecimiento con datos DG

Tango no necesariamente conoce el cliente DG de forma explícita. La Plataforma DG puede derivarlo desde `codigo_cliente` usando la base propia de Códigos Cliente.

Regla:

- Para cada ingreso Tango, buscar asignación activa de `codigo_cliente`.
- Si existe match, completar:
  - cliente DG
  - código único DG
- Si no existe match, mostrar la fila como `Sin match DG`.

El panel de Ingresos debe permitir detectar rápido filas sin match para corregir la asignación en el módulo de Códigos Cliente.

## Frecuencia de sincronización

Objetivo: casi en vivo, sin castigar SQL Server Tango.

Frecuencia inicial recomendada:

```txt
cada 1 a 5 minutos
```

Recomendación práctica:

- Empezar con cada 5 minutos.
- Medir tiempo de consulta, tamaño de respuesta y carga en SQL Server.
- Bajar a 1 minuto si el servidor responde bien.

No se recomienda consultar Tango en cada request del usuario.

Motivos:

- La experiencia web queda atada a la latencia de Tango.
- Aumenta riesgo de carga sobre SQL Server.
- Complica seguridad.
- Hace más frágil el uso desde cualquier computadora.

## Estrategia incremental

### Fase 0 — Actual

La UI de Ingresos lee:

```txt
local-data/BASE DE DATOS DG/Consulta ingresos Tango.xlsx
```

Sirve para validar columnas, filtros, KPIs y experiencia de usuario antes de conectar SQL Server.

### Fase 1 — Simular sincronización

Crear un endpoint interno que reciba filas con la misma forma que la consulta actual.

El Excel puede usarse como fuente para probar el proceso completo:

```txt
Excel Consulta1 → API sync → PostgreSQL → UI
```

### Fase 2 — Sync Agent contra SQL Server

Instalar el agente en el entorno interno.

El agente:

- Lee SQL Server.
- Ejecuta la consulta de ingresos.
- Envía lotes a DG Platform.
- Reporta estado de sync.

### Fase 3 — Monitoreo operativo

Agregar panel de integración:

- Última sincronización exitosa.
- Cantidad de filas recibidas.
- Errores.
- Duración.
- Versión del agente.
- Botón de resincronización manual, solo admin.

## Seguridad

Requisitos mínimos:

- Usuario SQL Server de solo lectura.
- Permisos limitados a las tablas/vistas necesarias.
- Conexión del agente hacia DG Platform por HTTPS.
- Token o API key rotativa para el agente.
- Firma HMAC por request o autenticación equivalente.
- Rate limit del endpoint de sync.
- Logs sin credenciales ni datos sensibles innecesarios.
- No exponer SQL Server Tango a internet.
- No abrir acceso directo desde navegadores.

## Manejo de errores

Si Tango no responde:

- La web sigue mostrando la última información sincronizada.
- El panel muestra alerta de sincronización vencida.
- El agente reintenta automáticamente.

Si una fila no matchea con Códigos Cliente:

- Se guarda igual.
- Se muestra en UI como `Sin match DG`.
- No se corrige en Tango por la plataforma.
- Se corrige en Plataforma DG si el problema es la equivalencia código cliente → código único/cliente.

Si el dato de negocio está mal:

- Se corrige en Tango Gestión.
- La siguiente sincronización actualiza Plataforma DG.

## Criterio de aceptación futuro

La integración estará lista cuando:

- La web muestre ingresos sin depender del Excel local.
- La sincronización funcione automáticamente.
- La última corrida sea visible desde la plataforma.
- Los usuarios puedan consultar ingresos desde cualquier computadora.
- SQL Server Tango no esté expuesto a internet.
- Plataforma DG no tenga permisos de escritura sobre Tango.
- Las filas duplicadas no se inserten dos veces por reintentos.

