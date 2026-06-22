# Seguridad

## Controles implementados

- Sesiones JWT de ocho horas mediante Auth.js.
- Contraseñas con bcrypt y factor de costo 12 en el seed.
- RBAC centralizado; las mutaciones tRPC verifican rol en servidor.
- Zod valida límites, formatos y reglas cruzadas.
- Audit log insert-only a nivel de aplicación.
- Uploads fuera de `public/`; extensiones y MIME deben validarse antes de encolar.
- Claves de idempotencia para movimientos e importaciones.
- El override de stock negativo requiere rol `ADMIN`, comentario y auditoría.

## Antes de producción

- Definir `AUTH_SECRET` aleatorio, credenciales de base y claves IA en un secret store.
- Desactivar `NEXT_PUBLIC_DEMO_MODE`.
- Añadir rate limiting distribuido a login y uploads.
- Aplicar antivirus a archivos cargados y límites por cliente.
- Configurar CSP, HSTS, cookies `Secure` y proxy confiable en Nginx.
- Cifrar backups y probar restauración mensualmente.
- Restringir PostgreSQL y Redis a red privada.
