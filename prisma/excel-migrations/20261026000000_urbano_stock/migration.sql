-- Cargas del reporte "Stock en línea" (Warehousing) del portal de clientes de Urbano.
CREATE TABLE "urbano_stock_cargas" (
    "id" UUID NOT NULL,
    "fecha_reporte" DATE NOT NULL,
    "origen" VARCHAR(20) NOT NULL DEFAULT 'excel',
    "nombre_archivo" VARCHAR(255),
    "hash_archivo" VARCHAR(64),
    "filas" INTEGER NOT NULL,
    "cantidad_total" DECIMAL(18,4) NOT NULL,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "urbano_stock_cargas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "urbano_stock_cargas_hash_archivo_key" ON "urbano_stock_cargas"("hash_archivo");
CREATE INDEX "urbano_stock_cargas_fecha_reporte_idx" ON "urbano_stock_cargas"("fecha_reporte");

CREATE TABLE "urbano_stock_items" (
    "id" BIGSERIAL NOT NULL,
    "carga_id" UUID NOT NULL,
    "codigo_cliente" VARCHAR(255) NOT NULL,
    "producto" TEXT,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "no_disponible" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "pendiente_recogida" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "compania" VARCHAR(20),
    "cliente" VARCHAR(255),
    "codigo_unico" VARCHAR(255),
    "fila_origen" INTEGER,
    CONSTRAINT "urbano_stock_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "urbano_stock_items_carga_id_idx" ON "urbano_stock_items"("carga_id");
CREATE INDEX "urbano_stock_items_codigo_cliente_idx" ON "urbano_stock_items"("codigo_cliente");
ALTER TABLE "urbano_stock_items" ADD CONSTRAINT "urbano_stock_items_carga_id_fkey"
    FOREIGN KEY ("carga_id") REFERENCES "urbano_stock_cargas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
