-- Estructura de costos de Amex: porcentaje que carga quien arma la estructura, uno por período.
-- Se guarda en todas las filas del cliente y período. Solo informativo: no cambia la utilidad.
ALTER TABLE "base_estructura_costos_santander" ADD COLUMN IF NOT EXISTS "porcentaje_amex" DECIMAL(9, 4);
