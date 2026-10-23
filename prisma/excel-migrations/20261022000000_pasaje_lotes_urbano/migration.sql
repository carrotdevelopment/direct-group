-- Solicitudes de pasaje de stock a Urbano cargadas desde Excel, y la tabla de shippers de Urbano.
CREATE TABLE "pasaje_lotes" (
    "id" UUID NOT NULL,
    "nombre_archivo" VARCHAR(255),
    "hash_archivo" VARCHAR(64),
    "fecha_solicitud" DATE,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pasaje_lotes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pasaje_lotes_hash_archivo_key" ON "pasaje_lotes"("hash_archivo");

ALTER TABLE "pasaje_requests"
    ADD COLUMN "lote_id" UUID,
    ADD COLUMN "fecha_solicitud" DATE,
    ADD COLUMN "shipper_origen" VARCHAR(20),
    ADD COLUMN "shipper_destino" VARCHAR(20),
    ADD COLUMN "fila_origen" INTEGER,
    ADD COLUMN "aviso" TEXT;
ALTER TABLE "pasaje_requests" ADD CONSTRAINT "pasaje_requests_lote_id_fkey"
    FOREIGN KEY ("lote_id") REFERENCES "pasaje_lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "pasaje_requests_lote_id_idx" ON "pasaje_requests"("lote_id");

CREATE TABLE "urbano_shippers" (
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "clientes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "urbano_shippers_pkey" PRIMARY KEY ("codigo")
);

-- Hoja "SH" de la solicitud de pasaje de stock (01/10/2026). Los nombres son los de la tabla Clientes.
INSERT INTO "urbano_shippers" ("codigo", "nombre", "clientes", "activo") VALUES
    ('3102', 'UMILES/MACRO', ARRAY['Umiles', 'Macro'], true),
    ('3817', 'SYNGENTA', ARRAY['Syngenta'], true),
    ('1247', 'CREDICOOP', ARRAY['Credicoop'], true),
    ('1258', 'AMEX', ARRAY['Amex'], true),
    ('1315', 'BCO LA PAMPA', ARRAY['Pampa'], true),
    ('1369', 'MASSALIN', ARRAY['Massalin'], true),
    ('1955', 'PRODUCTECA/COMAFI', ARRAY['Producteca', 'Comafi'], true),
    ('3720', 'SUPERVIELLE', ARRAY['Supervielle'], false),
    ('2885', 'CENTURION', ARRAY[]::TEXT[], false),
    ('3628', 'BAPRO', ARRAY['Provincia'], false)
ON CONFLICT ("codigo") DO NOTHING;
