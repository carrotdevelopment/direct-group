-- Historial de cambios de producto en canjes ya cargados.
CREATE TABLE "egresos_cambios_producto" (
    "id" BIGSERIAL NOT NULL,
    "egreso_id" BIGINT NOT NULL,
    "cliente" VARCHAR(255) NOT NULL,
    "codigo_anterior" VARCHAR(255) NOT NULL,
    "producto_anterior" TEXT,
    "cantidad_anterior" DECIMAL(18,4) NOT NULL,
    "codigo_nuevo" VARCHAR(255) NOT NULL,
    "producto_nuevo" TEXT,
    "cantidad_nueva" DECIMAL(18,4) NOT NULL,
    "motivo" TEXT,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "egresos_cambios_producto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "egresos_cambios_producto_egreso_id_idx" ON "egresos_cambios_producto"("egreso_id");
