# Login y permisos

- `/login`: ingreso con email y contraseña; `/inicio` abre el primer módulo habilitado.
- `/permisos`: administración de usuarios, exclusiva de administradores.
- Los administradores pueden crear usuarios, cambiar contraseñas, habilitar o deshabilitar cuentas y asignar módulos.
- Compras incluye Ingresos; Precios incluye Pricing y Estructura de costos; Clientes incluye Códigos cliente; Ventas incluye Egresos.
- Productos, Proveedores, Stock e Importaciones tienen permisos propios. Dashboard, Auditoría, Integraciones, Configuración y Permisos requieren administrador.
- Operador y Depósito pueden operar los módulos asignados. Solo lectura permite consultas. Ningún rol no administrador obtiene módulos implícitamente.
- Las páginas, las API y tRPC verifican los permisos en el servidor. La sesión obtiene el estado y los módulos actuales desde PostgreSQL en cada solicitud. Los cambios y las deshabilitaciones afectan a sesiones abiertas.
- Cambiar una contraseña invalida las sesiones anteriores. Las nuevas contraseñas requieren al menos 12 caracteres y no pueden superar los 72 bytes UTF-8 que admite bcrypt.
- `/api/lookups` proporciona únicamente consultas auxiliares para los módulos autorizados (por ejemplo, clientes y tasas para calcular precios). No habilita las API de administración de esas entidades.
- Las modificaciones de usuarios quedan registradas en `AuditLog`, sin hashes ni contraseñas. No se puede deshabilitar la propia cuenta administradora ni quitar el último administrador activo.

## Instalación

Aplicar las migraciones de Prisma antes de iniciar la versión nueva. La migración `20260915000000_user_module_access` agrega un arreglo de módulos al usuario, vacío por defecto. Los administradores existentes conservan acceso completo; los demás usuarios requieren asignación explícita desde Permisos.

Ejecutar `npm run db:admin` para crear el administrador sin cargar datos de ejemplo. Por defecto crea `juanmartin@directgroup.local`, con nombre Juan Martín y contraseña aleatoria. Las credenciales se guardan en `local-data/private/admin-access.txt`, ignorado por Git. Puede configurarse `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` y `SEED_ADMIN_PASSWORD` antes de ejecutar el comando. Si el usuario ya existe, se habilita como administrador conservando su contraseña.

Configurar `AUTH_SECRET` con un valor aleatorio privado y `AUTH_URL` con el origen de la aplicación. El login requiere PostgreSQL aunque los datos operativos se consulten desde Excel.

## Verificación

`npm run lint`, `npm run typecheck` y `npm test`. Las pruebas de módulos comprueban aislamiento, rechazo de solicitudes anónimas, restricciones de lectura y revocación de permisos.
