ALTER TABLE "pasaje_requests" ADD COLUMN "cantidad_confirmada" DECIMAL(18,4), ADD COLUMN "confirmed_by" VARCHAR(255), ADD COLUMN "confirmed_at" TIMESTAMPTZ(6);

-- Los pasajes ya aceptados con el flujo anterior ejecutaron ingreso y egreso completos: equivalen a confirmados.
UPDATE "pasaje_requests" SET "status" = 'confirmed', "cantidad_confirmada" = "cantidad", "confirmed_by" = "responded_by", "confirmed_at" = "responded_at" WHERE "status" = 'accepted';
