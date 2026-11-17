-- Encargado del proveedor: id del usuario de la plataforma (tabla "User" de la base dg_platform). Solo se
-- muestra y se usa para filtrar en Proveedores.
ALTER TABLE base_proveedores ADD COLUMN IF NOT EXISTS encargado_usuario_id VARCHAR(40);
