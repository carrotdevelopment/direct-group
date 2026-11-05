-- Movimientos de depósito que informa la API de Urbano (picking, recepción, ajuste y transferencia).
-- "clave" evita repetir un movimiento: la API devuelve los últimos días en cada consulta.
CREATE TABLE "urbano_movimientos" (
    "id" BIGSERIAL NOT NULL,
    "clave" VARCHAR(64) NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL,
    "comprobante" VARCHAR(100),
    "referencia" VARCHAR(100),
    "compania" VARCHAR(20),
    "codigo_urbano" VARCHAR(255) NOT NULL,
    "codigo_cliente" VARCHAR(255) NOT NULL,
    "producto" TEXT,
    "lote" VARCHAR(100),
    "serie" VARCHAR(100),
    "entrada" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "salida" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cliente" VARCHAR(255),
    "codigo_unico" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "urbano_movimientos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "urbano_movimientos_clave_key" ON "urbano_movimientos"("clave");
CREATE INDEX "urbano_movimientos_fecha_idx" ON "urbano_movimientos"("fecha");
CREATE INDEX "urbano_movimientos_codigo_cliente_idx" ON "urbano_movimientos"("codigo_cliente");
CREATE INDEX "urbano_movimientos_cliente_fecha_idx" ON "urbano_movimientos"("cliente", "fecha");
