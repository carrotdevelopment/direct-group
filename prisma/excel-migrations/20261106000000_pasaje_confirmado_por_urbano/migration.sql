-- Los pasajes se confirman con la recepción que informa Urbano. pasaje_id evita usar dos veces la misma
-- recepción y comprobante_urbano deja a la vista de qué comprobante salió cada confirmación automática.
ALTER TABLE "urbano_movimientos" ADD COLUMN "pasaje_id" UUID;
ALTER TABLE "pasaje_requests" ADD COLUMN "comprobante_urbano" VARCHAR(255);
CREATE INDEX "urbano_movimientos_pasaje_id_idx" ON "urbano_movimientos"("pasaje_id");
