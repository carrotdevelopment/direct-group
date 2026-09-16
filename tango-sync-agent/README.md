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
- `TANGO_AGENT_API_URL`: la dirección donde esté corriendo la Plataforma DG, accesible desde esta máquina (por ejemplo `http://192.168.x.x:3000` si corre en otra PC de la misma red, o la URL pública si ya está desplegada). **Importante:** hoy la plataforma solo corre en `localhost` en la compu de desarrollo, así que esta pieza no va a poder mandar datos hasta que la app esté accesible desde esta máquina.

## 5. Probar la conexión a Tango primero

Antes de probar `agent.js` completo (que necesita que la Plataforma DG esté accesible, algo todavía pendiente), probá solo la parte de SQL Server:

```bash
node test-sql.js
```

Si todo está bien, va a mostrar las últimas 20 filas de la consulta de ingresos. Si falla, el mensaje de error va a decir si es un problema de red (no encuentra el servidor) o de usuario/contraseña.

## 6. Probar el conector completo (cuando la plataforma esté accesible)

```bash
npm start
```

Si no hay ninguna importación pedida todavía desde la web, va a decir "No hay ninguna importación pendiente." — eso es correcto y significa que la conexión con la plataforma funciona.

## 7. Programar la ejecución automática

En el "Programador de tareas" de Windows (Task Scheduler):

1. Crear una tarea nueva.
2. Desencadenador: repetir cada 5 a 15 minutos, indefinidamente.
3. Acción: iniciar un programa.
   - Programa: la ruta a `node.exe` (normalmente `C:\Program Files\nodejs\node.exe`).
   - Argumentos: `agent.js`
   - Iniciar en: la carpeta donde está esta copia (ej. `C:\tango-sync-agent`).
4. En "Configuración general", marcar **"Ejecutar tanto si el usuario inició sesión como si no"**, para que funcione aunque nadie esté conectado por Escritorio Remoto en ese momento.

## Nota de mantenimiento

`agent.js` es una copia independiente de `dg_platform/scripts/tango-sync-agent.ts`. Si la consulta SQL o el formato de los datos cambia en el proyecto principal, hay que actualizar este archivo a mano también — no se sincronizan solos.
