# Arquitectura Técnica — Plataforma Web B2B de Compra, Venta, Stock, ERP e IA

## 1. Objetivo del documento

Este documento define la arquitectura técnica de una plataforma web comercial B2B orientada a la gestión de productos terminados, clientes, proveedores, precios, compras, ventas, stock e integraciones con sistemas externos como Tango Gestión.

La plataforma debe permitir:

* Gestionar productos terminados.
* Generar códigos únicos internos de productos.
* Asociar códigos de producto específicos por cliente.
* Gestionar precios por cliente y proveedor.
* Cargar listas de precios desde PDF o Excel.
* Procesar archivos de proveedores mediante IA.
* Importar compras desde Tango Gestión.
* Cargar ventas masivamente desde Excel con estructuras variables según cliente.
* Controlar stock mediante movimientos de ingresos, egresos y transferencias.
* Permitir pasaje de productos entre clientes con trazabilidad completa.
* Auditar todas las operaciones relevantes.
* Mantener seguridad, escalabilidad y capacidad de testeo local en cada etapa del desarrollo.

---

## 2. Contexto del negocio

La empresa opera en un entorno B2B donde se gestionan productos terminados, clientes, proveedores, compras, ventas, precios y stock.

Cada cliente puede manejar sus propios códigos de producto, distintos al código interno de la empresa y al código del proveedor. Por eso, el sistema debe soportar múltiples equivalencias de producto.

Los precios se actualizan desde documentos de proveedores, principalmente PDFs y Excels, que pueden tener estructuras no estandarizadas. La plataforma debe usar IA para interpretar esos documentos, mapearlos a una estructura interna y permitir revisión manual antes de confirmar los datos.

Las ventas llegan en archivos Excel provistos por clientes. Cada cliente puede tener una estructura de columnas distinta. El sistema debe identificar, mapear y validar esos archivos antes de generar ventas y movimientos de stock.

Las compras se importan desde Tango Gestión. La plataforma debe normalizar esa información, vincularla con productos internos y generar los movimientos de ingreso de stock correspondientes.

El stock no debe calcularse directamente como una resta simple entre compras y ventas, sino como un ledger de movimientos. La tabla de movimientos de stock será la fuente de verdad.

---

## 3. Principios de arquitectura

### 3.1. Monolito modular antes que microservicios

La primera etapa se implementará como un monolito modular sobre Next.js 14 App Router, TypeScript, tRPC, Prisma, PostgreSQL y BullMQ.

No se utilizarán microservicios en la fase inicial para evitar sobreingeniería, reducir costos operativos y facilitar el desarrollo.

La arquitectura debe permitir separar responsabilidades por módulos internos:

* Productos.
* Clientes.
* Proveedores.
* Pricing.
* Compras.
* Ventas.
* Stock.
* Importaciones.
* IA.
* Tango.
* Auditoría.
* Seguridad.

### 3.2. Procesamiento asincrónico para tareas pesadas

Toda tarea pesada debe ejecutarse fuera del request HTTP principal.

Ejemplos:

* Procesamiento de PDFs.
* Lectura de Excels grandes.
* Mapeo de columnas por IA.
* Importación desde Tango.
* Normalización de datos.
* Recalculo de stock.
* Generación de previews.
* Confirmación masiva de ventas o precios.

Para esto se utilizará BullMQ + Redis.

### 3.3. Stock basado en movimientos

El stock se modelará como una suma de movimientos. No se actualizará stock de manera manual sobre una tabla mutable sin trazabilidad.

La fuente de verdad será:

```sql
stock_movimientos
```

La vista o tabla calculada:

```sql
stock_actual
```

se podrá regenerar desde los movimientos.

### 3.4. IA asistida, no automática sin control

La IA podrá proponer mapeos, extracciones y normalizaciones, pero los cambios críticos deberán pasar por una instancia de revisión o confirmación.

Aplica especialmente para:

* Listas de precios de proveedores.
* Ventas cargadas desde Excel.
* Matching de productos.
* Normalización de datos provenientes de Tango.

### 3.5. Auditoría desde el primer día

Toda operación sensible debe quedar registrada:

* Creación de productos.
* Edición de precios.
* Alta o baja de códigos por cliente.
* Confirmación de importaciones.
* Movimientos manuales de stock.
* Transferencias de stock entre clientes.
* Cambios de roles o permisos.
* Importaciones desde Tango.
* Correcciones manuales posteriores a una lectura por IA.

---

## 4. Stack tecnológico definitivo

### 4.1. Framework principal

```txt
Next.js 14 App Router + TypeScript
```

Next.js será el framework principal para:

* Frontend.
* Backend API.
* Middleware de autenticación.
* Server Components.
* Server Actions donde aplique.
* Rutas protegidas.
* Deploy unificado.

### 4.2. API

```txt
tRPC + Zod
```

tRPC permitirá una API tipada de punta a punta entre frontend y backend, evitando duplicación de tipos.

Zod se utilizará para validar datos tanto en cliente como en servidor.

### 4.3. Autenticación

```txt
NextAuth.js v5
```

La autenticación será propia, basada en:

* JWT.
* Refresh tokens.
* Sesiones.
* Roles.
* Middleware de protección.
* Control de acceso por módulo.

Roles iniciales:

```txt
admin
vendedor
deposito
lectura
```

### 4.4. Base de datos

```txt
PostgreSQL 15
Prisma ORM
```

PostgreSQL será la base relacional principal.

Prisma se utilizará para:

* Modelado del esquema.
* Migraciones versionadas.
* Queries type-safe.
* Transacciones ACID.
* Seeds locales.
* Sincronización de estructura entre ambientes.

### 4.5. Procesamiento asincrónico

```txt
BullMQ + Redis
```

BullMQ se utilizará para:

* Procesamiento de archivos.
* Jobs de IA.
* Importaciones desde Tango.
* Reintentos automáticos.
* Control de progreso.
* Manejo de errores.
* Ejecución diferida.

### 4.6. IA

```txt
Claude API / OpenAI GPT-4o
```

La IA se utilizará para:

* Interpretar PDFs de proveedores.
* Interpretar Excels con estructuras variables.
* Sugerir mapeo de columnas.
* Normalizar datos.
* Resolver equivalencias entre códigos externos e internos.
* Detectar inconsistencias.

### 4.7. UI

```txt
Tailwind CSS
shadcn/ui
TanStack Table
Recharts
```

Uso esperado:

* Tailwind CSS para estilos.
* shadcn/ui para componentes accesibles y rápidos de construir.
* TanStack Table para tablas grandes, filtros, paginación y sorting.
* Recharts para gráficos de stock, compras, ventas y alertas.

### 4.8. Infraestructura inicial

```txt
Digital Ocean Droplet único
Nginx
Let's Encrypt
PM2
GitHub Actions
```

El ambiente inicial corre en un único Droplet:

```txt
Next.js app
BullMQ worker
PostgreSQL
Redis
Nginx
PM2
```

---

## 5. Topología de arquitectura

```txt
Usuario Web
   |
   | HTTPS
   v
Nginx + Let's Encrypt
   |
   v
Next.js 14 App Router
   |
   |-- Middleware Auth
   |-- Server Components
   |-- tRPC API
   |-- Upload endpoints
   |
   |---------------------> PostgreSQL 15
   |---------------------> Redis
   |---------------------> File Storage local / DO Spaces opcional
   |
   v
BullMQ Workers
   |
   |-- Procesamiento Excel
   |-- Procesamiento PDF
   |-- Jobs de IA
   |-- Sync Tango
   |-- Recalculo stock
   |-- Auditoría técnica
```

---

## 6. Estructura del repositorio

Se recomienda una estructura monorepo simple, aunque inicialmente todo viva dentro del mismo proyecto Next.js.

```txt
/app
  /(auth)
    /login
  /(dashboard)
    /dashboard
    /productos
    /clientes
    /proveedores
    /precios
    /compras
    /ventas
    /stock
    /importaciones
    /integraciones
    /auditoria
    /configuracion
  /api
    /auth
    /trpc
    /upload

/components
  /ui
  /forms
  /tables
  /charts
  /layout
  /domain

/server
  /auth
  /trpc
    root.ts
    context.ts
    routers
      productos.router.ts
      clientes.router.ts
      proveedores.router.ts
      pricing.router.ts
      compras.router.ts
      ventas.router.ts
      stock.router.ts
      importaciones.router.ts
      tango.router.ts
      audit.router.ts
  /services
    productos.service.ts
    clientes.service.ts
    pricing.service.ts
    stock.service.ts
    ventas.service.ts
    compras.service.ts
    tango.service.ts
    ia.service.ts
    files.service.ts
  /jobs
    queues.ts
    processors
      processProveedorFile.job.ts
      processVentasExcel.job.ts
      syncTangoCompras.job.ts
      recalculateStock.job.ts
  /lib
    prisma.ts
    redis.ts
    logger.ts
    permissions.ts
    audit.ts

/prisma
  schema.prisma
  migrations
  seed.ts

/scripts
  dev-reset-db.ts
  import-sample-data.ts
  create-admin-user.ts
  backup-db.sh
  restore-db.sh

/tests
  /unit
  /integration
  /e2e

/docs
  ARCHITECTURE.md
  DATABASE.md
  SECURITY.md
  LOCAL_DEVELOPMENT.md
  DEPLOYMENT.md
```

---

## 7. Módulos funcionales

## 7.1. Módulo de autenticación y usuarios

### Responsabilidades

* Login.
* Logout.
* Sesiones.
* Refresh token.
* Roles.
* Permisos por módulo.
* Usuario creador/modificador.
* Protección de rutas.
* Protección de procedimientos tRPC.

### Roles iniciales

```txt
admin
vendedor
deposito
lectura
```

### Permisos sugeridos

| Módulo        |   Admin |      Vendedor |       Depósito | Lectura |
| ------------- | ------: | ------------: | -------------: | ------: |
| Productos     |    CRUD |       Lectura |        Lectura | Lectura |
| Clientes      |    CRUD | CRUD limitado |        Lectura | Lectura |
| Proveedores   |    CRUD |       Lectura |        Lectura | Lectura |
| Pricing       |    CRUD |       Lectura |             No | Lectura |
| Ventas        |    CRUD |          CRUD |        Lectura | Lectura |
| Compras       |    CRUD |       Lectura |        Lectura | Lectura |
| Stock         |    CRUD |       Lectura | CRUD operativo | Lectura |
| Importaciones |    CRUD |   CRUD ventas |        Lectura | Lectura |
| Auditoría     | Lectura |            No |             No |      No |
| Configuración |    CRUD |            No |             No |      No |

---

## 7.2. Módulo de productos

### Responsabilidades

* ABM de productos.
* Generación de código único interno.
* Relación con marca.
* Relación con proveedor.
* Relación con categoría.
* Bulto.
* Código único proveedor.
* Estado del producto.
* Detección de duplicados.
* Historial de cambios relevantes.

### Entidades principales

```txt
productos
proveedores
categorias
marcas
codigos_producto
```

### Reglas

* Cada producto debe tener un código único interno.
* El código único interno no debe cambiar una vez generado.
* Si se necesita corregir un código, debe quedar registrado en auditoría.
* Puede existir más de un código externo asociado al producto.
* Puede existir más de un proveedor asociado, si el negocio lo requiere en una etapa posterior.

---

## 7.3. Módulo de códigos de producto por cliente

### Responsabilidades

* Asociar un producto interno a un código usado por un cliente.
* Mantener historial temporal de cambios.
* Permitir que un código cliente quede inactivo sin eliminarlo.
* Resolver ventas importadas usando código cliente.
* Alertar inconsistencias cuando un código cliente no matchea con producto interno.

### Reglas

* Un cliente puede tener códigos propios.
* Un producto puede tener distintos códigos según cliente.
* El mismo código cliente no debería apuntar a dos productos activos para el mismo cliente.
* Se debe guardar marca temporal de alta, baja y modificación.
* La baja debe ser lógica, no física.

---

## 7.4. Módulo de pricing por cliente

### Responsabilidades

* Gestionar precios por producto y cliente.
* Guardar todos los componentes del costo.
* Mantener vigencia de precios.
* Permitir comparar precio vigente contra precio anterior.
* Calcular utilidad y porcentaje de utilidad.
* Registrar impuestos, flete y componentes logísticos.

### Componentes del pricing

```txt
Costo DG
IVA
Costo Público
Mark Up
Seguro
Ingresos Brutos
Impuesto Débito/Crédito
Flete
Costo Total
PVC sin IVA
PVC con IVA
Utilidad
% Utilidad
Impuesto Misiones
Peso Volumétrico
Bultos
```

### Reglas

* Un precio debe tener vigencia desde una fecha.
* Puede existir historial de precios por cliente y producto.
* Solo un precio puede estar vigente para una combinación cliente-producto-fecha.
* Las modificaciones deben quedar auditadas.
* Los precios sugeridos por IA deben pasar por revisión antes de publicarse.

---

## 7.5. Módulo de carga de ventas desde Excel

### Responsabilidades

* Cargar archivos Excel provistos por clientes.
* Detectar estructura de columnas.
* Proponer mapeo mediante IA.
* Permitir ajuste manual del mapeo.
* Validar filas.
* Generar preview.
* Confirmar carga.
* Crear ventas.
* Crear movimientos de egreso de stock.

### Flujo

```txt
1. Usuario selecciona cliente.
2. Usuario carga archivo Excel.
3. Sistema guarda archivo.
4. Se crea registro en archivos_cargados.
5. Se crea job BullMQ.
6. Worker lee primeras filas.
7. IA propone mapeo de columnas.
8. Usuario revisa y ajusta si corresponde.
9. Sistema procesa todas las filas.
10. Sistema valida productos, cantidades, fechas y códigos.
11. Usuario confirma importación.
12. Sistema crea ventas.
13. Sistema crea movimientos SALE_OUT.
14. Sistema actualiza estado de importación.
15. Sistema registra auditoría.
```

### Estados de importación

```txt
UPLOADED
PROCESSING
WAITING_USER_MAPPING
VALIDATING
WAITING_CONFIRMATION
CONFIRMED
COMPLETED
FAILED
CANCELLED
```

---

## 7.6. Módulo de ingresos desde Tango Gestión

La decisión vigente para la integración de ingresos desde Tango está documentada en:

```txt
docs/ADR-002-TANGO-INGRESOS-INTEGRATION.md
```

Principio rector:

* Tango Gestión sigue siendo la fuente de verdad.
* La Plataforma DG no carga, edita ni elimina ingresos en Tango.
* La web consume datos ya sincronizados en PostgreSQL DG.
* La conexión a SQL Server Tango no se realiza desde el navegador.
* La sincronización se hará mediante un agente interno de solo lectura instalado dentro de la red/servidor de la empresa.

Flujo objetivo:

```txt
Tango Gestión
  ↓
SQL Server Tango, solo lectura
  ↓
DG Tango Sync Agent, dentro de la red
  ↓ HTTPS seguro
DG Platform API
  ↓
PostgreSQL DG
  ↓
Panel Ingresos web
```

La etapa actual usa el archivo local `Consulta ingresos Tango.xlsx` únicamente como fuente transitoria para validar UI, filtros y reglas de negocio antes de implementar la conexión directa.

---

## 7.6.1. Módulo de compras desde Tango Gestión

### Responsabilidades

* Importar compras desde Tango Gestión.
* Normalizar datos.
* Matchear cliente.
* Matchear producto.
* Matchear código cliente.
* Crear compras.
* Crear movimientos de ingreso de stock.
* Registrar errores de matching.
* Permitir corrección manual.

### Campos requeridos

```txt
Cliente
Operación
Fecha pedido
Fecha entrega
Orden de compra
Código cliente
Cantidad
Origen del pasaje
Entregado
Comentarios
```

### Flujo

```txt
1. Usuario ejecuta sincronización manual o programada.
2. Sistema crea sync_run.
3. Worker consulta o recibe datos de Tango.
4. Se guarda raw data.
5. IA/reglas normalizan campos.
6. Sistema intenta matchear cliente y producto.
7. Filas válidas quedan listas para confirmar.
8. Filas con error quedan en revisión.
9. Usuario corrige errores si existen.
10. Sistema confirma compras.
11. Sistema genera movimientos PURCHASE_IN.
12. Sistema audita operación.
```

---

## 7.7. Módulo de precios de proveedores desde PDF/Excel

### Responsabilidades

* Cargar PDFs o Excels de proveedores.
* Extraer datos.
* Mapear columnas.
* Detectar producto, código proveedor, precio, IVA, moneda y vigencia.
* Proponer estructura normalizada.
* Permitir corrección manual.
* Confirmar actualización de precios.

### Flujo

```txt
1. Usuario carga archivo proveedor.
2. Sistema guarda archivo.
3. Se crea job BullMQ.
4. Worker extrae contenido.
5. IA interpreta estructura.
6. IA devuelve JSON normalizado.
7. Sistema valida datos con Zod.
8. Se genera preview.
9. Usuario corrige o confirma.
10. Sistema actualiza precios_proveedor.
11. Sistema recalcula pricing_cliente si corresponde.
12. Sistema registra auditoría.
```

---

## 7.8. Módulo de stock

### Responsabilidades

* Controlar stock por movimientos.
* Registrar ingresos.
* Registrar egresos.
* Registrar ajustes.
* Registrar transferencias entre clientes.
* Consultar stock actual.
* Alertar faltantes.
* Alertar inconsistencias por código único y código cliente.
* Ver trazabilidad de cada movimiento.

### Fuente de verdad

```txt
stock_movimientos
```

### Vista de consulta

```txt
stock_actual
```

### Tipos de movimiento

```txt
PURCHASE_IN
SALE_OUT
TRANSFER_OUT
TRANSFER_IN
MANUAL_ADJUSTMENT_IN
MANUAL_ADJUSTMENT_OUT
RETURN_IN
RETURN_OUT
RESERVATION
RELEASE_RESERVATION
```

### Regla principal

El stock actual se calcula como:

```txt
stock_actual = SUM(ingresos) - SUM(egresos)
```

agrupado por:

```txt
producto
cliente
depósito
lote, si aplica
fecha, si aplica
```

### Pasaje de stock entre clientes

El pasaje de stock entre clientes debe generar dos movimientos atómicos dentro de una misma transacción:

```txt
TRANSFER_OUT desde cliente_origen
TRANSFER_IN hacia cliente_destino
```

Ambos movimientos deben compartir una misma referencia de transferencia.

---

## 7.9. Módulo de dashboard

### Responsabilidades

* Mostrar stock actual.
* Mostrar alertas.
* Mostrar productos con faltante.
* Mostrar productos con stock comprometido.
* Mostrar movimientos recientes.
* Mostrar cargas recientes.
* Mostrar errores de importación.
* Mostrar evolución de compras y ventas.
* Mostrar estado de jobs.

### Vistas sugeridas

```txt
Stock actual por cliente
Stock actual por producto
Stock crítico
Movimientos recientes
Ventas importadas
Compras importadas
Archivos pendientes de revisión
Errores de IA
Errores de matching
```

---

## 8. Modelo de datos conceptual

## 8.1. Tablas migradas y extendidas

### DB_Producto → productos

Tabla actual:

```txt
DB_Producto
```

Nueva tabla:

```txt
productos
```

Campos base:

```txt
id
codigo_unico
producto
marca_id
proveedor_id
categoria_id
bulto
codigo_unico_proveedor
estado
created_at
updated_at
created_by
updated_by
```

### DB_Cliente → codigos_cliente

Tabla actual:

```txt
DB_Cliente
```

Nueva tabla:

```txt
codigos_cliente
```

Campos base:

```txt
id
cliente_id
producto_id
codigo_unico
codigo_cliente
descripcion_cliente
activo
vigente_desde
vigente_hasta
created_at
updated_at
created_by
updated_by
```

### DB_Costo → precios_proveedor

Tabla actual:

```txt
DB_Costo
```

Nueva tabla:

```txt
precios_proveedor
```

Campos base:

```txt
id
producto_id
proveedor_id
codigo_unico
fecha
costo_dg
iva
costo_publico
mark_up
moneda
vigente_desde
vigente_hasta
archivo_origen_id
created_at
created_by
```

### Estructura_Costo → pricing_cliente

Tabla actual:

```txt
Estructura_Costo
```

Nueva tabla:

```txt
pricing_cliente
```

Campos base:

```txt
id
cliente_id
producto_id
precio_proveedor_id
fecha
costo_dg
iva
costo_publico
mark_up
seguro
ingresos_brutos
impuesto_debito_credito
flete
costo_total
pvc_sin_iva
pvc_con_iva
utilidad
porcentaje_utilidad
impuesto_misiones
peso_volumetrico
bultos
vigente_desde
vigente_hasta
created_at
updated_at
created_by
updated_by
```

---

## 8.2. Tablas operativas

### compras

```txt
id
cliente_id
producto_id
codigo_cliente_id
operacion
fecha_pedido
fecha_entrega
orden_compra
codigo_cliente
cantidad
origen_pasaje
entregado
comentarios
tango_external_id
import_batch_id
created_at
updated_at
created_by
updated_by
```

### ventas_general

```txt
id
cliente_id
producto_id
codigo_cliente_id
fecha_venta
codigo_cliente
cantidad
precio_unitario
importe_total
archivo_origen_id
import_batch_id
fila_origen
estado
created_at
created_by
```

### ventas_cliente_raw

```txt
id
cliente_id
archivo_origen_id
import_batch_id
row_number
raw_data_json
normalized_data_json
validation_errors_json
estado
created_at
```

---

## 8.3. Tablas de stock

### stock_movimientos

```txt
id
producto_id
cliente_origen_id
cliente_destino_id
cliente_stock_id
deposito_id
tipo_movimiento
direccion
cantidad
referencia_tipo
referencia_id
transferencia_id
comentarios
metadata_json
created_at
created_by
```

### stock_actual

Puede implementarse inicialmente como vista SQL.

```txt
producto_id
cliente_id
deposito_id
cantidad_actual
ultima_actualizacion
```

Vista conceptual:

```sql
SELECT
  producto_id,
  cliente_stock_id AS cliente_id,
  deposito_id,
  SUM(
    CASE
      WHEN direccion = 'IN' THEN cantidad
      WHEN direccion = 'OUT' THEN -cantidad
      ELSE 0
    END
  ) AS cantidad_actual
FROM stock_movimientos
GROUP BY producto_id, cliente_stock_id, deposito_id;
```

---

## 8.4. Tablas de archivos, jobs e IA

### archivos_cargados

```txt
id
nombre_original
nombre_storage
tipo_archivo
mime_type
size_bytes
cliente_id
proveedor_id
tipo_carga
estado
resultado_ia_json
errores_json
uploaded_by
created_at
updated_at
```

Tipos de carga:

```txt
VENTAS_CLIENTE
PRECIOS_PROVEEDOR
COMPRAS_TANGO
OTRO
```

### jobs_procesamiento

```txt
id
queue_name
job_name
bullmq_job_id
archivo_id
estado
progreso
errores_json
reintentos
started_at
finished_at
created_at
updated_at
```

### ia_extractions

```txt
id
archivo_id
tipo_extraccion
provider
model
prompt_version
input_sample_json
output_json
confidence_score
estado
created_at
created_by
```

---

## 8.5. Auditoría

### audit_log

```txt
id
usuario_id
accion
tabla
registro_id
dato_anterior_json
dato_nuevo_json
ip
user_agent
created_at
```

Reglas:

* Insert-only.
* Sin updates.
* Sin deletes.
* Solo usuarios admin pueden consultar.
* Debe registrar cambios relevantes de negocio.
* No debe guardar secrets ni tokens.

---

## 9. Modelo Prisma sugerido

Ejemplo parcial orientativo:

```prisma
model Producto {
  id                    String   @id @default(cuid())
  codigoUnico            String   @unique
  producto               String
  marcaId                String?
  proveedorId            String?
  categoriaId            String?
  bulto                  Int?
  codigoUnicoProveedor   String?
  estado                 String   @default("ACTIVO")

  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  createdBy              String?
  updatedBy              String?

  codigosCliente         CodigoCliente[]
  preciosProveedor       PrecioProveedor[]
  pricingCliente         PricingCliente[]
  stockMovimientos       StockMovimiento[]
}

model Cliente {
  id              String   @id @default(cuid())
  nombre          String
  razonSocial     String?
  cuit            String?
  estado          String   @default("ACTIVO")

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  codigosProducto CodigoCliente[]
  pricing         PricingCliente[]
}

model CodigoCliente {
  id                 String   @id @default(cuid())
  clienteId           String
  productoId          String
  codigoUnico         String
  codigoCliente       String
  descripcionCliente  String?
  activo              Boolean  @default(true)
  vigenteDesde        DateTime @default(now())
  vigenteHasta        DateTime?

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  createdBy           String?
  updatedBy           String?

  cliente             Cliente  @relation(fields: [clienteId], references: [id])
  producto            Producto @relation(fields: [productoId], references: [id])

  @@index([clienteId])
  @@index([productoId])
  @@index([codigoCliente])
  @@unique([clienteId, codigoCliente, activo])
}

model StockMovimiento {
  id                 String   @id @default(cuid())
  productoId          String
  clienteOrigenId     String?
  clienteDestinoId    String?
  clienteStockId      String?
  depositoId          String?
  tipoMovimiento      String
  direccion           String
  cantidad            Decimal  @db.Decimal(18, 4)
  referenciaTipo      String?
  referenciaId        String?
  transferenciaId     String?
  comentarios         String?
  metadataJson        Json?

  createdAt           DateTime @default(now())
  createdBy           String?

  producto            Producto @relation(fields: [productoId], references: [id])

  @@index([productoId])
  @@index([clienteStockId])
  @@index([depositoId])
  @@index([referenciaTipo, referenciaId])
  @@index([transferenciaId])
}
```

---

## 10. Flujos de IA

## 10.1. PDF/Excel proveedor → precios

### Objetivo

Convertir documentos de proveedor en datos estructurados compatibles con precios_proveedor y pricing_cliente.

### Entrada

```txt
PDF
Excel
Proveedor
Fecha de vigencia
Moneda, si aplica
```

### Salida esperada

```json
{
  "supplier": "Proveedor X",
  "currency": "ARS",
  "valid_from": "2026-01-01",
  "rows": [
    {
      "supplier_code": "ABC123",
      "description": "Producto terminado 1",
      "cost_dg": 1000,
      "iva": 21,
      "public_cost": 1210,
      "markup": 30
    }
  ]
}
```

### Reglas

* La IA no confirma precios automáticamente.
* El usuario debe revisar el preview.
* Los datos se validan con Zod.
* Los productos no encontrados se marcan como pendientes de matching.
* El archivo original queda asociado al precio generado.

---

## 10.2. Excel ventas cliente → ventas_general

### Objetivo

Procesar archivos Excel de ventas con estructuras variables por cliente.

### Entrada

```txt
Cliente
Archivo Excel
Primera hoja o selección de hoja
```

### Proceso

```txt
1. Leer primeras 20 filas.
2. Detectar headers.
3. Enviar muestra a IA.
4. IA propone mapping.
5. Usuario revisa mapping.
6. Sistema procesa archivo completo.
7. Sistema valida filas.
8. Usuario confirma.
9. Sistema crea ventas y movimientos de stock.
```

### Campos internos esperados

```txt
fecha_venta
codigo_cliente
producto
cantidad
precio_unitario
importe_total
observaciones
```

### Salida IA esperada

```json
{
  "detected_header_row": 3,
  "sheet_name": "Ventas",
  "mapping": {
    "fecha_venta": "Fecha",
    "codigo_cliente": "Cod Producto",
    "cantidad": "Unidades",
    "precio_unitario": "Precio Unit.",
    "importe_total": "Total"
  },
  "confidence": 0.92,
  "warnings": []
}
```

---

## 10.3. Datos Tango → compras

### Objetivo

Normalizar compras importadas desde Tango y vincularlas con clientes, productos y códigos internos.

### Entrada

```txt
Datos de Tango
Cliente
Operación
Fechas
Orden de compra
Código cliente
Cantidad
Origen del pasaje
Entregado
Comentarios
```

### Proceso

```txt
1. Importar raw data.
2. Normalizar fechas, cantidades y códigos.
3. Buscar cliente.
4. Buscar código cliente.
5. Buscar producto interno.
6. Generar preview.
7. Confirmar compras.
8. Crear movimientos PURCHASE_IN.
```

### Reglas

* Si el producto no matchea, la fila queda en estado NEEDS_REVIEW.
* Si el cliente no matchea, la fila queda en estado NEEDS_REVIEW.
* No se genera movimiento de stock hasta que la compra esté confirmada.
* Toda corrección manual queda auditada.

---

## 11. Diseño de stock

## 11.1. Stock como ledger

La tabla stock_movimientos es la única fuente de verdad.

Cada movimiento representa un hecho de negocio:

```txt
Entró mercadería
Salió mercadería
Se transfirió entre clientes
Se ajustó manualmente
Se devolvió mercadería
Se reservó stock
```

## 11.2. Movimiento de compra

Cuando se confirma una compra:

```txt
tipo_movimiento = PURCHASE_IN
direccion = IN
cliente_stock_id = cliente asociado
referencia_tipo = COMPRA
referencia_id = compra.id
cantidad = cantidad comprada
```

## 11.3. Movimiento de venta

Cuando se confirma una venta:

```txt
tipo_movimiento = SALE_OUT
direccion = OUT
cliente_stock_id = cliente asociado
referencia_tipo = VENTA
referencia_id = venta.id
cantidad = cantidad vendida
```

## 11.4. Transferencia de stock entre clientes

Debe ejecutarse dentro de una transacción.

```txt
Movimiento 1:
tipo_movimiento = TRANSFER_OUT
direccion = OUT
cliente_stock_id = cliente_origen
cliente_origen_id = cliente_origen
cliente_destino_id = cliente_destino
transferencia_id = uuid común

Movimiento 2:
tipo_movimiento = TRANSFER_IN
direccion = IN
cliente_stock_id = cliente_destino
cliente_origen_id = cliente_origen
cliente_destino_id = cliente_destino
transferencia_id = uuid común
```

## 11.5. Validación de stock negativo

Regla recomendada:

* Por defecto, no permitir stock negativo.
* Permitir override solo a usuarios admin.
* Todo override debe requerir comentario obligatorio.
* Todo override debe quedar auditado.

---

## 12. Seguridad

## 12.1. Autenticación

* NextAuth.js v5.
* JWT de corta duración.
* Refresh token.
* Password hashing seguro.
* Rotación de tokens.
* Logout invalidando sesión.
* Cookies seguras HTTP-only.

## 12.2. Autorización

* RBAC en middleware tRPC.
* Validación de permisos por procedimiento.
* Validación de permisos por módulo.
* Validación de acceso a entidad antes de lectura o escritura.

Ejemplo conceptual:

```ts
protectedProcedure
  .use(requireRole(["admin", "vendedor"]))
  .input(createVentaSchema)
  .mutation(async ({ ctx, input }) => {
    return ventasService.create(ctx.user, input)
  })
```

## 12.3. Validación

* Zod en cliente.
* Zod en servidor.
* Validación de archivos.
* Validación de tamaño máximo.
* Validación de MIME type.
* Validación de extensión.
* Validación de datos antes de persistir.

## 12.4. Uploads

Reglas:

* No ejecutar archivos subidos.
* Guardar archivos fuera del directorio público.
* Usar nombres internos generados.
* Mantener nombre original solo como metadata.
* Limitar tamaño por tipo de archivo.
* Rate limiting en endpoints de upload.
* Registrar usuario, IP y fecha de carga.

## 12.5. Secrets

* Nunca commitear secrets.
* Usar `.env` local.
* Usar variables de entorno en producción.
* Separar `.env.example`.
* Rotar API keys de IA si hay sospecha de exposición.

## 12.6. CORS

* CORS estricto.
* Permitir solo dominio oficial.
* No usar wildcard en producción.

## 12.7. Audit log

* Insert-only.
* Sin updates.
* Sin deletes.
* Registro de dato anterior y nuevo cuando aplique.
* No guardar passwords, tokens ni API keys.

---

## 13. Jobs y procesamiento asincrónico

## 13.1. Colas sugeridas

```txt
queue:files
queue:ai
queue:tango
queue:stock
queue:notifications
```

## 13.2. Jobs iniciales

```txt
processProveedorFile
processVentasExcel
syncTangoCompras
normalizeTangoData
recalculateStock
generateImportPreview
confirmImportBatch
```

## 13.3. Estados de job

```txt
PENDING
ACTIVE
WAITING_USER_INPUT
COMPLETED
FAILED
RETRYING
CANCELLED
```

## 13.4. Retry

Política sugerida:

```txt
maxAttempts: 3
backoff: exponential
```

## 13.5. Idempotencia

Los jobs deben ser idempotentes siempre que sea posible.

Ejemplo:

* No duplicar ventas si el job se reintenta.
* No duplicar movimientos de stock si ya fueron generados.
* No duplicar precios si el archivo ya fue confirmado.
* Usar claves de importación y referencias únicas.

---

## 14. Local development y testeo local

Es fundamental que cada ajuste pueda probarse localmente antes de desplegar.

## 14.1. Objetivo

Cualquier desarrollador debe poder correr el proyecto localmente con:

```bash
docker compose up -d
npm install
npm run dev
npm run worker:dev
```

## 14.2. Servicios locales

Se recomienda usar Docker Compose para levantar:

```txt
PostgreSQL
Redis
Adminer o pgAdmin opcional
```

Ejemplo:

```yaml
services:
  postgres:
    image: postgres:15
    container_name: b2b_postgres
    restart: always
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: b2b_platform
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    container_name: b2b_redis
    restart: always
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

## 14.3. Variables de entorno locales

Archivo:

```txt
.env.local
```

Ejemplo:

```env
DATABASE_URL="postgresql://app:app@localhost:5432/b2b_platform"
REDIS_URL="redis://localhost:6379"

NEXTAUTH_SECRET="local-secret"
NEXTAUTH_URL="http://localhost:3000"

OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""

UPLOAD_DIR="./storage/uploads"
NODE_ENV="development"
```

## 14.4. Scripts recomendados

```json
{
  "scripts": {
    "dev": "next dev",
    "worker:dev": "tsx server/jobs/worker.ts",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:e2e": "playwright test",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

## 14.5. Flujo local para cada cambio

Cada ajuste debe seguir este flujo:

```txt
1. Crear branch.
2. Implementar cambio.
3. Agregar o ajustar schema Zod.
4. Agregar o ajustar procedimiento tRPC.
5. Agregar o ajustar tests.
6. Correr migración Prisma si aplica.
7. Probar localmente con datos seed.
8. Probar caso feliz.
9. Probar caso con error.
10. Correr lint, typecheck y tests.
11. Crear PR.
12. Deploy a producción solo desde main.
```

## 14.6. Datos seed

El ambiente local debe tener datos mínimos:

```txt
Usuario admin
Usuario vendedor
Usuario depósito
Clientes demo
Productos demo
Códigos cliente demo
Proveedor demo
Precios proveedor demo
Pricing cliente demo
Movimientos de stock demo
Archivos de ejemplo
Excels de venta de ejemplo
PDF proveedor de ejemplo
```

## 14.7. Archivos de prueba

Mantener una carpeta:

```txt
/test-fixtures
  /ventas
    cliente_a_formato_1.xlsx
    cliente_b_formato_2.xlsx
  /proveedores
    lista_precios_proveedor_a.pdf
    lista_precios_proveedor_b.xlsx
  /tango
    compras_sample.json
```

Esto permite probar localmente todos los flujos críticos sin depender de datos reales.

---

## 15. Testing

## 15.1. Unit tests

Aplican a:

* Cálculos de pricing.
* Validaciones Zod.
* Generación de código único.
* Matching de código cliente.
* Cálculo de stock.
* Normalización de fechas.
* Normalización de cantidades.
* Parseo de columnas.

## 15.2. Integration tests

Aplican a:

* Crear producto.
* Crear código cliente.
* Importar ventas.
* Confirmar importación.
* Generar movimiento de stock.
* Transferir stock entre clientes.
* Importar compras desde Tango.
* Confirmar precios de proveedor.

## 15.3. E2E tests

Herramienta recomendada:

```txt
Playwright
```

Flujos críticos:

```txt
Login
Carga de producto
Carga de código cliente
Carga de Excel de ventas
Corrección manual de mapping
Confirmación de venta
Consulta de stock
Transferencia entre clientes
Carga de PDF proveedor
Confirmación de precios
```

## 15.4. Typecheck obligatorio

Antes de deploy:

```bash
npm run typecheck
npm run lint
npm run test
```

---

## 16. CI/CD

## 16.1. GitHub Actions

Pipeline recomendado:

```txt
on push to main:
  install dependencies
  run typecheck
  run lint
  run tests
  build Next.js
  deploy to Droplet
  run Prisma migrations
  PM2 graceful reload
```

## 16.2. Deploy sin downtime

Usar PM2:

```bash
pm2 reload ecosystem.config.js --update-env
```

Procesos PM2:

```txt
b2b-web
b2b-worker
```

Ejemplo conceptual:

```js
module.exports = {
  apps: [
    {
      name: "b2b-web",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "b2b-worker",
      script: "dist/server/jobs/worker.js",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
```

---

## 17. Infraestructura inicial

## 17.1. Droplet único

Configuración inicial:

```txt
Digital Ocean Droplet
2 vCPU
4 GB RAM
Ubuntu LTS
Nginx
Node.js LTS
PM2
PostgreSQL 15
Redis
Certbot / Let's Encrypt
```

## 17.2. Servicios en el Droplet

```txt
Nginx       -> Reverse proxy + SSL + rate limiting
Next.js     -> Aplicación web + API
Worker      -> BullMQ processors
PostgreSQL  -> Base de datos
Redis       -> Cola de jobs
Storage     -> Archivos locales privados
```

## 17.3. Storage

Inicialmente puede usarse storage local privado:

```txt
/var/app/storage/uploads
```

Si el volumen crece, migrar a:

```txt
Digital Ocean Spaces
```

## 17.4. Backups

Backups diarios automáticos de PostgreSQL.

Recomendación:

```txt
Backup diario
Retención 7 días
Backup semanal
Retención 4 semanas
Backup mensual
Retención 6 meses
```

Script conceptual:

```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

Los backups no deben quedar únicamente en el mismo Droplet.

---

## 18. Escalabilidad progresiva

## 18.1. Etapa 1 — Inicio

```txt
Un solo Droplet:
- Next.js
- Worker
- PostgreSQL
- Redis
- Nginx
```

Ventajas:

* Bajo costo.
* Simplicidad.
* Fácil mantenimiento.
* Deploy directo.
* Ideal para MVP y primeras operaciones.

Riesgo:

* Recursos compartidos.
* Jobs pesados pueden afectar performance web.
* Backups y monitoreo deben configurarse bien.

## 18.2. Etapa 2 — Base de datos administrada

Cuando PostgreSQL crezca o sea crítico:

```txt
Mover PostgreSQL a Digital Ocean Managed Database
```

Cambio esperado:

```txt
DATABASE_URL
```

La aplicación no debería requerir cambios de código.

## 18.3. Etapa 3 — Workers separados

Cuando los jobs pesados afecten la app:

```txt
Droplet app
Droplet worker
PostgreSQL managed
Redis managed o dedicado
```

## 18.4. Etapa 4 — Alta disponibilidad

Cuando haya más tráfico:

```txt
DO Load Balancer
2+ Droplets de app
Workers separados
PostgreSQL managed
Redis managed
DO Spaces
```

---

## 19. Observabilidad

## 19.1. Logs

Registrar:

```txt
Errores de API
Errores de jobs
Errores de IA
Errores de Tango
Errores de importación
Errores de stock
Accesos sensibles
```

## 19.2. Métricas recomendadas

```txt
Cantidad de archivos cargados
Tiempo promedio de procesamiento
Jobs fallidos
Jobs reintentados
Errores de IA
Errores de matching
Cantidad de movimientos de stock
Productos con stock negativo
Importaciones pendientes de revisión
```

## 19.3. Alertas

Alertar ante:

```txt
Job crítico fallido
DB sin espacio
Redis caído
Worker detenido
Backup fallido
Uso alto de CPU
Uso alto de RAM
Error repetido de IA
Error repetido de Tango
```

---

## 20. Convenciones de desarrollo

## 20.1. Naming

Usar nombres de dominio claros.

Ejemplos:

```txt
Producto
Cliente
Proveedor
CodigoCliente
PrecioProveedor
PricingCliente
Compra
Venta
StockMovimiento
ArchivoCargado
JobProcesamiento
AuditLog
```

## 20.2. tRPC routers

```txt
productosRouter
clientesRouter
proveedoresRouter
pricingRouter
comprasRouter
ventasRouter
stockRouter
importacionesRouter
tangoRouter
auditRouter
```

## 20.3. Services

La lógica de negocio debe vivir en services, no dentro de componentes ni routers.

Ejemplo:

```txt
stock.service.ts
ventas.service.ts
pricing.service.ts
```

El router valida input y permisos. El service ejecuta la lógica.

## 20.4. Transacciones

Usar transacciones Prisma para operaciones críticas:

```txt
Confirmar venta + movimiento de stock
Confirmar compra + movimiento de stock
Transferencia entre clientes
Confirmar importación masiva
Actualizar precios vigentes
```

---

## 21. Reglas críticas de negocio

## 21.1. Producto

* El código único interno es obligatorio.
* El código único interno no debe duplicarse.
* El código único interno no debe modificarse sin auditoría.
* Un producto inactivo no puede usarse en nuevas ventas sin override.

## 21.2. Código cliente

* Un cliente puede tener su propio código de producto.
* Un código cliente activo debe apuntar a un único producto.
* Los cambios deben mantener historial.
* Las ventas importadas deben matchear preferentemente por código cliente.

## 21.3. Pricing

* Un precio tiene vigencia temporal.
* No debe haber dos precios vigentes para mismo cliente-producto-fecha.
* La IA solo sugiere.
* El usuario confirma.

## 21.4. Ventas

* Una venta confirmada genera egreso de stock.
* Una venta anulada debe generar reversa, no borrar movimiento original.
* No borrar ventas confirmadas físicamente.
* Corregir mediante ajustes o reversas auditadas.

## 21.5. Compras

* Una compra confirmada genera ingreso de stock.
* Una compra importada desde Tango debe mantener referencia externa.
* No duplicar compras por reintentos de sync.

## 21.6. Stock

* El stock se calcula por movimientos.
* No editar movimientos confirmados.
* Corregir mediante movimiento de ajuste.
* Las transferencias entre clientes deben ser atómicas.
* Evitar stock negativo salvo override autorizado.

---

## 22. Riesgos técnicos y mitigaciones

| Riesgo                             |    Impacto | Mitigación                                     |
| ---------------------------------- | ---------: | ---------------------------------------------- |
| IA interpreta mal un archivo       |       Alto | Preview + confirmación manual + validación Zod |
| Excel de cliente cambia estructura | Medio/Alto | Mapeo IA + mappings guardados por cliente      |
| Jobs pesados afectan la web        |       Alto | BullMQ + worker separado cuando escale         |
| Stock inconsistente                |       Alto | Ledger inmutable + transacciones               |
| Duplicación en imports             |       Alto | Idempotencia + referencias únicas              |
| Droplet único falla                |       Alto | Backups + plan de migración + monitoreo        |
| Archivos grandes saturan disco     |      Medio | Límites + DO Spaces cuando crezca              |
| Errores de permisos                |       Alto | RBAC centralizado + tests                      |
| Secrets expuestos                  |       Alto | Variables de entorno + rotación                |
| Migraciones rompen producción      |       Alto | Prisma migrations + backup previo              |

---

## 23. Roadmap técnico sugerido

## Fase 1 — Base técnica

```txt
Setup Next.js 14 + TypeScript
Setup Tailwind + shadcn/ui
Setup Prisma + PostgreSQL
Setup NextAuth.js v5
Setup tRPC + Zod
Setup roles
Setup layout dashboard
Setup Docker Compose local
Setup seed local
```

## Fase 2 — Core comercial

```txt
ABM clientes
ABM proveedores
ABM productos
Generador de código único
Códigos por cliente
Pricing proveedor
Pricing cliente
Audit log básico
```

## Fase 3 — Stock

```txt
Stock movimientos
Stock actual
Ingreso manual
Egreso manual
Transferencia entre clientes
Alertas de stock
Dashboard inicial
```

## Fase 4 — Importaciones

```txt
Carga archivos
Archivos cargados
BullMQ + Redis
Importación Excel ventas
Preview de ventas
Confirmación de ventas
Movimientos SALE_OUT
```

## Fase 5 — IA

```txt
IA para mapping Excel ventas
IA para PDF/Excel proveedor
Preview IA
Corrección manual
Confirmación de precios
Historial de procesamiento
```

## Fase 6 — Tango

```txt
Import raw Tango
Normalización
Matching cliente/producto
Preview compras
Confirmación compras
Movimientos PURCHASE_IN
Logs de sync
```

## Fase 7 — Producción

```txt
Nginx
SSL Let's Encrypt
PM2
GitHub Actions
Backups automáticos
Monitoreo básico
Rate limiting
Hardening seguridad
```

---

## 24. Definition of Done técnica

Un desarrollo se considera terminado cuando cumple:

```txt
1. Tiene validación Zod.
2. Tiene control de permisos.
3. Tiene manejo de errores.
4. Tiene audit log si modifica datos sensibles.
5. Tiene test unitario o integración si aplica.
6. Se puede probar localmente.
7. No rompe typecheck.
8. No rompe lint.
9. No duplica lógica de negocio en frontend.
10. No expone secrets.
11. No genera inconsistencias de stock.
12. Tiene migración Prisma si modifica DB.
13. Tiene seed o fixture si aplica.
14. Tiene estado de carga/procesamiento si es asincrónico.
```

---

## 25. Comandos base para desarrollo local

```bash
# Instalar dependencias
npm install

# Levantar PostgreSQL y Redis
docker compose up -d

# Generar cliente Prisma
npm run db:generate

# Ejecutar migraciones
npm run db:migrate

# Cargar datos iniciales
npm run db:seed

# Levantar app
npm run dev

# Levantar worker
npm run worker:dev

# Abrir Prisma Studio
npm run db:studio

# Correr tests
npm run test

# Correr typecheck
npm run typecheck

# Correr lint
npm run lint
```

---

## 26. Criterio final de arquitectura

La arquitectura seleccionada prioriza:

```txt
Velocidad de desarrollo
Control de costos
Tipado fuerte
Seguridad
Trazabilidad
Procesamiento asincrónico
Stock consistente
Capacidad de testeo local
Escalabilidad progresiva
```

La decisión de usar Next.js 14 como framework principal permite mantener frontend, API, middleware y lógica server-side en un único repo y deploy inicial.

El uso de tRPC + Zod reduce errores entre cliente y servidor.

PostgreSQL + Prisma aporta consistencia transaccional, migraciones y type safety.

BullMQ + Redis permite procesar archivos, IA e integraciones sin bloquear la experiencia del usuario.

El modelo de stock por movimientos evita inconsistencias y permite reconstruir la historia completa.

El enfoque de IA asistida con revisión manual reduce el riesgo de impacto operativo por errores de interpretación.

La infraestructura inicial en un único Droplet permite arrancar con costo fijo y predecible, manteniendo un camino claro de escalabilidad a medida que el sistema crezca.

---
