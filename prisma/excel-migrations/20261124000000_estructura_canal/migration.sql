-- Estructura de costos por canal (Producteca): cada banco tiene su propio precio para el mismo código.
-- canal queda vacío (NULL) en los demás clientes. comision_canal_pct: cuotas, tarjeta y comisión del banco, en % del PVC s/IVA.
ALTER TABLE "base_estructura_costos_santander" ADD COLUMN IF NOT EXISTS "canal" VARCHAR(100);
ALTER TABLE "base_estructura_costos_santander" ADD COLUMN IF NOT EXISTS "comision_canal_pct" DECIMAL(9, 4);
