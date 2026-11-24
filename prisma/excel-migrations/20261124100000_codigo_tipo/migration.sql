-- Regular o especial de cada código (hoy solo Credicoop, como sus dos hojas de stock). Va aparte de
-- base_codigo_cliente porque esa tabla se reescribe entera al guardar códigos. codigo_cliente en minúsculas.
CREATE TABLE IF NOT EXISTS "base_codigo_tipo" (
  "cliente" VARCHAR(100) NOT NULL,
  "codigo_cliente" VARCHAR(100) NOT NULL,
  "tipo" VARCHAR(20) NOT NULL CHECK ("tipo" IN ('REGULAR', 'ESPECIAL')),
  "updated_by" VARCHAR(255),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("cliente", "codigo_cliente")
);
