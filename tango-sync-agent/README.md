# Conector Tango → Plataforma DG

Esta carpeta es autónoma: no necesita el resto del proyecto `dg_platform`, ni Git. Se puede copiar entera (por ejemplo, comprimida en un .zip) a la máquina que tiene acceso a la red de Tango, e instalarse ahí sola.

## 1. Instalar Node.js (si no lo tiene)

Descargar e instalar la versión LTS desde https://nodejs.org (el instalador de Windows es "Next, Next, Finish"). Después, verificar en una terminal (cmd o PowerShell):

```bash
node -v
```

## 2. Copiar esta carpeta

Copiá toda la carpeta `tango-sync-agent` (con `agent.js`, `package.json` y `.env.example`) a esa máquina, por ejemplo a `C:\tango-sync-agent`.

## 3. Instalar dependencias

Abrí una terminal parada en esa carpeta y corré:

```bash
npm install
```

## 4. Configurar

Copiá `.env.example` a un archivo nuevo llamado `.env`, en la misma carpeta, y completá:

- `TANGO_SQL_PASSWORD`: la contraseña del usuario `dg_platform_reader`.
- `TANGO_CONNECTOR_TOKEN`: tiene que ser **exactamente** el mismo valor que `TANGO_CONNECTOR_TOKEN` en el `.env` del proyecto `dg_platform`.
- `TANGO_AGENT_API_URL`: ya está en producción → usar `https://directgroupgestion.com.ar` (con `https`, sin barra al final).

## 5. Probar la conexión a Tango primero

Antes de probar `agent.js` completo, probá solo la parte de SQL Server:

```bash
node test-sql.js
```

Si todo está bien, va a mostrar las últimas 20 filas de la consulta de ingresos. Si falla, el mensaje de error va a decir si es un problema de red (no encuentra el servidor) o de usuario/contraseña.

## 6. Probar el conector completo (cuando la plataforma esté accesible)

```bash
npm start
```

Si no hay ninguna importación pedida todavía desde la web, el conector arma una automáticamente para el rango "ayer hasta hoy" y la procesa. Volver a ejecutarlo el mismo día no hace nada nuevo (ya generó la del día).

## 7. Programar la ejecución automática (para que quede corriendo solo)

Opción rápida — importar la tarea ya armada:

1. Abrí el "Programador de tareas" de Windows (buscá "Task Scheduler" en el menú Inicio).
2. Panel derecho → **Importar tarea...**
3. Elegí el archivo `tarea-programada.xml` que está en esta misma carpeta.
4. Si la carpeta no es exactamente `C:\tango-sync-agent`, abrí la tarea importada, pestaña **Acciones**, editá la acción y corregí "Iniciar en" con la ruta real donde copiaste esta carpeta.
5. Guardar. Corre aunque nadie haya iniciado sesión. Consulta cada 2 minutos si alguien tocó "Actualizar" en Ingresos y, en la primera consulta desde las 5:30, trae sola los ingresos desde ayer hasta hoy.

Si ya estaba la tarea anterior (una vez por día), en lugar de importarla de nuevo: abrila → **Desencadenadores** → **Editar** → tildar **Repetir cada** y escribir `2 minutos`, **durante** `1 día`.

Para probarla ya, sin esperar a las 6 AM: click derecho sobre la tarea → **Ejecutar**.

Opción manual (si preferís armarla vos): Desencadenador → diario a las 6:00, repetir cada 2 minutos durante 1 día; Acción → iniciar `node.exe` con el argumento `agent.js`, "Iniciar en" apuntando a esta carpeta; en Configuración general marcar **"Ejecutar tanto si el usuario inició sesión como si no"**.

## OC pendientes

Además de los ingresos, en cada corrida el conector manda los renglones de órdenes de compra con cantidad pendiente de recibir (`CPA36.CAN_PENDIE > 0`). En la plataforma suman solo al stock teórico; cuando la mercadería se recibe, entra como ingreso y deja de figurar como pendiente.

El usuario de solo lectura necesita permiso sobre `CPA35` y `CPA36`:

```sql
GRANT SELECT ON dbo.CPA36 TO dg_platform_reader;
```

Si la consulta de OC pendientes falla, por ejemplo por falta de permiso, el conector lo avisa en la consola e importa igual los ingresos.

## Nota de mantenimiento

`agent.js` es una copia independiente de `dg_platform/scripts/tango-sync-agent.ts`. Si la consulta SQL o el formato de los datos cambia en el proyecto principal, hay que actualizar este archivo a mano también — no se sincronizan solos.
