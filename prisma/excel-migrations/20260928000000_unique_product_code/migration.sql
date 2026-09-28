-- El código único de Productos solo se validaba en el navegador contra el
-- estado cargado en esa pestaña, sin ninguna restricción en la base. Dos
-- altas casi simultáneas (dos pestañas, o la misma persona con la pestaña
-- vieja abierta) podían crear el mismo código sin que nadie se diera cuenta.
-- Antes de esta migración se relabelearon y desactivaron los 36 duplicados
-- ya existentes (sufijo "-DUPn"), dejando un único código_unico activo por
-- grupo.
ALTER TABLE "base_productos" ADD CONSTRAINT "base_productos_codigo_unico_key" UNIQUE ("codigo_unico");
