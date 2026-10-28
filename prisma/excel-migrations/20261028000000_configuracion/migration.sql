-- Configuración de la organización editable desde Sistema > Configuración.
CREATE TABLE "configuracion" (
    "clave" VARCHAR(100) NOT NULL,
    "valor" JSONB NOT NULL,
    "updated_by" VARCHAR(255),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "configuracion_pkey" PRIMARY KEY ("clave")
);
