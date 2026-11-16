-- Descripción comercial del producto, aparte del nombre. Se carga en el maestro de Productos.
ALTER TABLE base_productos ADD COLUMN IF NOT EXISTS descripcion TEXT;
