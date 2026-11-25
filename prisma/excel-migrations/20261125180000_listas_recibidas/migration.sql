-- Listas de precios que llegan por correo, para revisarlas antes de cargar los precios.
-- estado: pendiente, cargada, descartada o repetida (mismo archivo ya recibido para ese período).
-- contenido se vacía cuando la lista se carga o se descarta.
CREATE TABLE IF NOT EXISTS "listas_precios_recibidas" (
  "id" UUID PRIMARY KEY,
  "proveedor" VARCHAR(255) NOT NULL,
  "periodo" VARCHAR(7) NOT NULL,
  "archivo" VARCHAR(255) NOT NULL,
  "remitente" VARCHAR(255) NOT NULL,
  "recibida_at" TIMESTAMPTZ(6) NOT NULL,
  "mensaje_id" VARCHAR(64) NOT NULL,
  "adjunto" INTEGER NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "contenido" BYTEA,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  "resuelta_por" VARCHAR(255),
  "resuelta_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "listas_precios_recibidas_mensaje_adjunto_key" ON "listas_precios_recibidas" ("mensaje_id", "adjunto", "proveedor");
CREATE INDEX IF NOT EXISTS "listas_precios_recibidas_estado_idx" ON "listas_precios_recibidas" ("estado");
CREATE INDEX IF NOT EXISTS "listas_precios_recibidas_sha256_idx" ON "listas_precios_recibidas" ("proveedor", "periodo", "sha256");
