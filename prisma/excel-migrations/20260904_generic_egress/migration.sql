-- CreateTable
CREATE TABLE "egresos_perfiles_importacion" (
    "id" BIGSERIAL NOT NULL,
    "cliente" VARCHAR(255) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "nombre_hoja" VARCHAR(255),
    "fila_encabezado" INTEGER NOT NULL DEFAULT 1,
    "columnas" JSONB NOT NULL,
    "mapeo" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "egresos_perfiles_importacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egresos_lotes_importacion" (
    "id" BIGSERIAL NOT NULL,
    "cliente" VARCHAR(255) NOT NULL,
    "tipo_origen" VARCHAR(30) NOT NULL,
    "nombre_archivo" VARCHAR(255),
    "hash_archivo" VARCHAR(64),
    "nombre_hoja" VARCHAR(255),
    "encabezados" JSONB,
    "status" VARCHAR(30) NOT NULL,
    "filas_totales" INTEGER NOT NULL DEFAULT 0,
    "filas_importadas" INTEGER NOT NULL DEFAULT 0,
    "detalle_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    CONSTRAINT "egresos_lotes_importacion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egresos_raw_backup" (
    "id" BIGSERIAL NOT NULL,
    "lote_id" BIGINT NOT NULL,
    "cliente" VARCHAR(255) NOT NULL,
    "numero_fila_origen" INTEGER,
    "encabezados" JSONB,
    "valores" JSONB,
    "datos_originales" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "egresos_raw_backup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "egresos" (
    "id" BIGSERIAL NOT NULL,
    "cliente" VARCHAR(255) NOT NULL,
    "operacion" VARCHAR(50) NOT NULL,
    "fecha" DATE,
    "codigo_cliente" VARCHAR(255),
    "codigo_unico" VARCHAR(255),
    "producto" TEXT,
    "cantidad" DECIMAL(18,4),
    "destino" TEXT,
    "comentarios" TEXT,
    "raw_row_id" BIGINT,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "egresos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "egresos_perfiles_importacion_cliente_version_key" ON "egresos_perfiles_importacion"("cliente", "version");
CREATE INDEX "egresos_perfiles_importacion_cliente_activo_idx" ON "egresos_perfiles_importacion"("cliente", "activo");
CREATE UNIQUE INDEX "egresos_lotes_importacion_cliente_hash_archivo_key" ON "egresos_lotes_importacion"("cliente", "hash_archivo");
CREATE INDEX "egresos_lotes_importacion_cliente_created_at_idx" ON "egresos_lotes_importacion"("cliente", "created_at");
CREATE INDEX "egresos_lotes_importacion_status_idx" ON "egresos_lotes_importacion"("status");
CREATE INDEX "egresos_raw_backup_lote_id_idx" ON "egresos_raw_backup"("lote_id");
CREATE INDEX "egresos_raw_backup_cliente_idx" ON "egresos_raw_backup"("cliente");
CREATE UNIQUE INDEX "egresos_raw_row_id_key" ON "egresos"("raw_row_id");
CREATE INDEX "egresos_cliente_fecha_idx" ON "egresos"("cliente", "fecha");
CREATE INDEX "egresos_codigo_cliente_idx" ON "egresos"("codigo_cliente");
CREATE INDEX "egresos_codigo_unico_idx" ON "egresos"("codigo_unico");
CREATE INDEX "egresos_operacion_idx" ON "egresos"("operacion");
CREATE INDEX "egresos_deleted_at_idx" ON "egresos"("deleted_at");

ALTER TABLE "egresos_raw_backup" ADD CONSTRAINT "egresos_raw_backup_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "egresos_lotes_importacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "egresos" ADD CONSTRAINT "egresos_raw_row_id_fkey" FOREIGN KEY ("raw_row_id") REFERENCES "egresos_raw_backup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
