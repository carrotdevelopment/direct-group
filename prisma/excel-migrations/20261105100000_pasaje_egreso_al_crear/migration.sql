-- Los pasajes egresan del origen al crearse y dejan el ingreso del destino pendiente hasta que se
-- confirma lo que informó Urbano. pasaje_id vincula esos movimientos con su pasaje, para ajustarlos
-- al confirmar o revertirlos al rechazar. Los pasajes ya abiertos quedan con egreso_impactado = false
-- y siguen como antes: egresan recién al confirmarse.
ALTER TABLE "pasaje_requests" ADD COLUMN "egreso_impactado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "egresos" ADD COLUMN "pasaje_id" UUID;
ALTER TABLE "tango_ingresos" ADD COLUMN "pasaje_id" UUID;
CREATE INDEX "egresos_pasaje_id_idx" ON "egresos"("pasaje_id");
CREATE INDEX "tango_ingresos_pasaje_id_idx" ON "tango_ingresos"("pasaje_id");
