-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "source_files" (
    "id" BIGSERIAL NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "relative_path" TEXT NOT NULL,
    "checksum_sha256" VARCHAR(64),
    "file_modified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" BIGSERIAL NOT NULL,
    "source_file_id" BIGINT NOT NULL,
    "sheet_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "total_rows" INTEGER,
    "imported_rows" INTEGER,
    "rejected_rows" INTEGER,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "error_detail" TEXT,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_categorias" (
    "id" BIGSERIAL NOT NULL,
    "legacy_id" VARCHAR(100),
    "codigo_categoria" VARCHAR(20) NOT NULL,
    "categoria" VARCHAR(255),
    "activo" BOOLEAN,
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_clientes" (
    "id" BIGSERIAL NOT NULL,
    "legacy_id" VARCHAR(100),
    "nombre" VARCHAR(255),
    "activo" BOOLEAN,
    "creado" TIMESTAMPTZ(6),
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_proveedores" (
    "id" BIGSERIAL NOT NULL,
    "codigo_proveedor" VARCHAR(20) NOT NULL,
    "legacy_id" VARCHAR(100),
    "proveedor" VARCHAR(255),
    "activo" BOOLEAN,
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcas" (
    "id" BIGSERIAL NOT NULL,
    "codigo_marca" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "import_batch_id" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_productos" (
    "id" BIGSERIAL NOT NULL,
    "legacy_id" VARCHAR(100),
    "producto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "marca_id" BIGINT,
    "marca_original" VARCHAR(255),
    "codigo_unico" VARCHAR(255),
    "codigo_unico_proveedor" VARCHAR(255),
    "proveedor_id" BIGINT,
    "proveedor_original" VARCHAR(255),
    "categoria_id" BIGINT,
    "categoria_original" VARCHAR(255),
    "bulto" DECIMAL(18,4),
    "creado" TIMESTAMPTZ(6),
    "actualizado" TIMESTAMPTZ(6),
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_codigo_cliente" (
    "id" BIGSERIAL NOT NULL,
    "legacy_id" VARCHAR(100),
    "cliente" VARCHAR(255),
    "codigo_unico" VARCHAR(255),
    "codigo_cliente" VARCHAR(255),
    "mes_asignacion" SMALLINT,
    "anio_asignacion" SMALLINT,
    "activo" BOOLEAN,
    "reactivado" TIMESTAMPTZ(6),
    "corregido" TIMESTAMPTZ(6),
    "motivo_correccion" TEXT,
    "anulado" TIMESTAMPTZ(6),
    "motivo_anulacion" TEXT,
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_codigo_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_config_tasas_clientes" (
    "id" BIGSERIAL NOT NULL,
    "legacy_id" VARCHAR(100),
    "cliente_id" VARCHAR(100),
    "cliente" VARCHAR(255),
    "vigente_desde" DATE,
    "nombre_tasa" VARCHAR(255),
    "clave" VARCHAR(255),
    "aplica" BOOLEAN,
    "valor_porcentaje" DECIMAL(18,6),
    "aplica_sobre" VARCHAR(255),
    "orden" INTEGER,
    "creado" TIMESTAMPTZ(6),
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_config_tasas_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_precios" (
    "id" BIGSERIAL NOT NULL,
    "legacy_id" VARCHAR(100),
    "proveedor" VARCHAR(255),
    "codigo_unico" VARCHAR(255),
    "dia" SMALLINT,
    "mes" SMALLINT,
    "anio" SMALLINT,
    "costo_dg" DECIMAL(18,4),
    "iva" DECIMAL(18,6),
    "precio_publico" DECIMAL(18,4),
    "mark_up" DECIMAL(18,6),
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_precios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_ingresos" (
    "id" BIGSERIAL NOT NULL,
    "cliente" VARCHAR(255),
    "operacion" VARCHAR(255),
    "dia_pedido" SMALLINT,
    "mes_pedido" SMALLINT,
    "anio_pedido" SMALLINT,
    "orden_de_compra" VARCHAR(255),
    "codigo_cliente" VARCHAR(255),
    "cantidad" DECIMAL(18,4),
    "origen_del_pasaje" VARCHAR(255),
    "dia_entrega" SMALLINT,
    "mes_entrega" SMALLINT,
    "anio_entrega" SMALLINT,
    "entregado" DECIMAL(18,4),
    "comentarios" TEXT,
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_ingresos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_egresos_santander" (
    "id" BIGSERIAL NOT NULL,
    "dia" SMALLINT,
    "mes" SMALLINT,
    "anio" SMALLINT,
    "nro_guia" VARCHAR(255),
    "fecha" DATE,
    "legacy_id" VARCHAR(100),
    "sku" VARCHAR(255),
    "localidad" VARCHAR(255),
    "provincia" VARCHAR(255),
    "cp" VARCHAR(50),
    "cantidad" DECIMAL(18,4),
    "cantidad_original" TEXT,
    "migration_warning" TEXT,
    "operacion" VARCHAR(255),
    "destino" TEXT,
    "comentario" TEXT,
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_egresos_santander_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_estructura_costos_santander" (
    "id" BIGSERIAL NOT NULL,
    "cliente" VARCHAR(255),
    "periodo" VARCHAR(50),
    "mes" SMALLINT,
    "anio" SMALLINT,
    "fecha" DATE,
    "codigo_cliente" VARCHAR(255),
    "codigo_unico" VARCHAR(255),
    "costo_actualizado" VARCHAR(50),
    "producto" TEXT,
    "proveedor" VARCHAR(255),
    "categoria" VARCHAR(255),
    "precio_publico" DECIMAL(18,4),
    "iva" DECIMAL(18,6),
    "mark_up" DECIMAL(18,6),
    "pp_sin_iva" DECIMAL(18,4),
    "costo_dg_sin_iva" DECIMAL(18,4),
    "seguro" DECIMAL(18,4),
    "ingresos_brutos" DECIMAL(18,4),
    "impuesto_debito" DECIMAL(18,4),
    "impuesto_credito" DECIMAL(18,4),
    "flete_sin_iva" DECIMAL(18,4),
    "costo_total" DECIMAL(18,4),
    "pvc_sin_iva" DECIMAL(18,4),
    "pvc_con_iva" DECIMAL(18,4),
    "utilidad" DECIMAL(18,4),
    "porcentaje" DECIMAL(18,6),
    "impuesto_misiones" DECIMAL(18,4),
    "peso_volumetrico" DECIMAL(18,4),
    "bultos" DECIMAL(18,4),
    "origen" VARCHAR(255),
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_estructura_costos_santander_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criterios_flete" (
    "id" BIGSERIAL NOT NULL,
    "codigo_unico" VARCHAR(255),
    "modo" VARCHAR(20),
    "valor" DECIMAL(18,6),
    "vigente_desde" VARCHAR(7),
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "criterios_flete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "base_stock_santander" (
    "id" BIGSERIAL NOT NULL,
    "cliente" VARCHAR(255),
    "grupo" VARCHAR(255),
    "comentarios" TEXT,
    "codigo_cliente" VARCHAR(255),
    "producto" TEXT,
    "proveedor" VARCHAR(255),
    "codigo_unico" VARCHAR(255),
    "categoria" VARCHAR(255),
    "pedido_total" DECIMAL(18,4),
    "ingreso_fisico" DECIMAL(18,4),
    "egreso" DECIMAL(18,4),
    "stock_teorico" DECIMAL(18,4),
    "stock_real" DECIMAL(18,4),
    "entregas_pendientes" DECIMAL(18,4),
    "transacciones_totales" DECIMAL(18,4),
    "fecha_primer_ingreso" DATE,
    "stock_informado" DECIMAL(18,4),
    "dispone_web" DECIMAL(18,4),
    "ajuste" DECIMAL(18,4),
    "vigencia" DECIMAL(18,4),
    "transacciones_por_dia" DECIMAL(18,6),
    "dias_de_stock" DECIMAL(18,4),
    "stock_necesario" DECIMAL(18,4),
    "sobra_falta" DECIMAL(18,4),
    "sobra_falta_segun_bulto" DECIMAL(18,4),
    "porcentaje" DECIMAL(18,6),
    "cantidad" DECIMAL(18,4),
    "bulto" DECIMAL(18,4),
    "compra_final" DECIMAL(18,4),
    "costo_dg_sin_iva" DECIMAL(18,4),
    "total_costo" DECIMAL(18,4),
    "stock_valorizado" DECIMAL(18,4),
    "utilidad_unitaria" DECIMAL(18,4),
    "utilidad_total" DECIMAL(18,4),
    "pv" DECIMAL(18,4),
    "restantes" DECIMAL(18,4),
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "base_stock_santander_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tango_clientes" (
    "id" BIGSERIAL NOT NULL,
    "cliente" VARCHAR(255),
    "codigo_cliente" VARCHAR(255),
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tango_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tango_ingresos" (
    "id" BIGSERIAL NOT NULL,
    "cliente" VARCHAR(255),
    "operacion" VARCHAR(255),
    "fecha_pedido" DATE,
    "orden_de_compra" VARCHAR(255),
    "codigo_cliente" VARCHAR(255),
    "cantidad" DECIMAL(18,4),
    "origen_del_pasaje" VARCHAR(255),
    "fecha_entrega" DATE,
    "entregado" DECIMAL(18,4),
    "comentarios" TEXT,
    "import_batch_id" BIGINT,
    "source_row_number" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tango_ingresos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_source_file_id_sheet_name_idx" ON "import_batches"("source_file_id", "sheet_name");

-- CreateIndex
CREATE INDEX "import_batches_status_idx" ON "import_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "base_categorias_codigo_categoria_key" ON "base_categorias"("codigo_categoria");

-- CreateIndex
CREATE UNIQUE INDEX "base_proveedores_codigo_proveedor_key" ON "base_proveedores"("codigo_proveedor");

-- CreateIndex
CREATE INDEX "base_proveedores_proveedor_idx" ON "base_proveedores"("proveedor");

-- CreateIndex
CREATE UNIQUE INDEX "marcas_codigo_marca_key" ON "marcas"("codigo_marca");

-- CreateIndex
CREATE UNIQUE INDEX "marcas_nombre_key" ON "marcas"("nombre");

-- CreateIndex
CREATE INDEX "base_productos_codigo_unico_idx" ON "base_productos"("codigo_unico");

-- CreateIndex
CREATE INDEX "base_productos_marca_id_idx" ON "base_productos"("marca_id");

-- CreateIndex
CREATE INDEX "base_productos_proveedor_id_idx" ON "base_productos"("proveedor_id");

-- CreateIndex
CREATE INDEX "base_productos_categoria_id_idx" ON "base_productos"("categoria_id");

-- CreateIndex
CREATE INDEX "base_codigo_cliente_cliente_idx" ON "base_codigo_cliente"("cliente");

-- CreateIndex
CREATE INDEX "base_codigo_cliente_codigo_unico_idx" ON "base_codigo_cliente"("codigo_unico");

-- CreateIndex
CREATE INDEX "base_codigo_cliente_codigo_cliente_idx" ON "base_codigo_cliente"("codigo_cliente");

-- CreateIndex
CREATE INDEX "base_config_tasas_clientes_cliente_id_idx" ON "base_config_tasas_clientes"("cliente_id");

-- CreateIndex
CREATE INDEX "base_config_tasas_clientes_cliente_id_vigente_desde_idx" ON "base_config_tasas_clientes"("cliente_id", "vigente_desde");

-- CreateIndex
CREATE INDEX "base_precios_codigo_unico_idx" ON "base_precios"("codigo_unico");

-- CreateIndex
CREATE INDEX "base_precios_proveedor_idx" ON "base_precios"("proveedor");

-- CreateIndex
CREATE INDEX "base_precios_anio_mes_dia_idx" ON "base_precios"("anio", "mes", "dia");

-- CreateIndex
CREATE INDEX "base_ingresos_cliente_idx" ON "base_ingresos"("cliente");

-- CreateIndex
CREATE INDEX "base_ingresos_operacion_idx" ON "base_ingresos"("operacion");

-- CreateIndex
CREATE INDEX "base_ingresos_codigo_cliente_idx" ON "base_ingresos"("codigo_cliente");

-- CreateIndex
CREATE INDEX "base_ingresos_orden_de_compra_idx" ON "base_ingresos"("orden_de_compra");

-- CreateIndex
CREATE INDEX "base_egresos_santander_fecha_idx" ON "base_egresos_santander"("fecha");

-- CreateIndex
CREATE INDEX "base_egresos_santander_nro_guia_idx" ON "base_egresos_santander"("nro_guia");

-- CreateIndex
CREATE INDEX "base_egresos_santander_sku_idx" ON "base_egresos_santander"("sku");

-- CreateIndex
CREATE INDEX "base_egresos_santander_operacion_idx" ON "base_egresos_santander"("operacion");

-- CreateIndex
CREATE INDEX "base_estructura_costos_santander_codigo_unico_idx" ON "base_estructura_costos_santander"("codigo_unico");

-- CreateIndex
CREATE INDEX "base_estructura_costos_santander_codigo_cliente_idx" ON "base_estructura_costos_santander"("codigo_cliente");

-- CreateIndex
CREATE INDEX "base_estructura_costos_santander_anio_mes_idx" ON "base_estructura_costos_santander"("anio", "mes");

-- CreateIndex
CREATE INDEX "criterios_flete_codigo_unico_vigente_desde_idx" ON "criterios_flete"("codigo_unico", "vigente_desde");

-- CreateIndex
CREATE INDEX "base_stock_santander_codigo_unico_idx" ON "base_stock_santander"("codigo_unico");

-- CreateIndex
CREATE INDEX "base_stock_santander_codigo_cliente_idx" ON "base_stock_santander"("codigo_cliente");

-- CreateIndex
CREATE INDEX "base_stock_santander_cliente_idx" ON "base_stock_santander"("cliente");

-- CreateIndex
CREATE INDEX "tango_clientes_cliente_idx" ON "tango_clientes"("cliente");

-- CreateIndex
CREATE INDEX "tango_clientes_codigo_cliente_idx" ON "tango_clientes"("codigo_cliente");

-- CreateIndex
CREATE INDEX "tango_ingresos_fecha_pedido_idx" ON "tango_ingresos"("fecha_pedido");

-- CreateIndex
CREATE INDEX "tango_ingresos_cliente_idx" ON "tango_ingresos"("cliente");

-- CreateIndex
CREATE INDEX "tango_ingresos_operacion_idx" ON "tango_ingresos"("operacion");

-- CreateIndex
CREATE INDEX "tango_ingresos_codigo_cliente_idx" ON "tango_ingresos"("codigo_cliente");

-- CreateIndex
CREATE INDEX "tango_ingresos_orden_de_compra_idx" ON "tango_ingresos"("orden_de_compra");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "source_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_categorias" ADD CONSTRAINT "base_categorias_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_clientes" ADD CONSTRAINT "base_clientes_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_proveedores" ADD CONSTRAINT "base_proveedores_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcas" ADD CONSTRAINT "marcas_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_productos" ADD CONSTRAINT "base_productos_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_productos" ADD CONSTRAINT "base_productos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "base_proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_productos" ADD CONSTRAINT "base_productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "base_categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_productos" ADD CONSTRAINT "base_productos_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_codigo_cliente" ADD CONSTRAINT "base_codigo_cliente_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_config_tasas_clientes" ADD CONSTRAINT "base_config_tasas_clientes_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_precios" ADD CONSTRAINT "base_precios_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_ingresos" ADD CONSTRAINT "base_ingresos_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_egresos_santander" ADD CONSTRAINT "base_egresos_santander_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_estructura_costos_santander" ADD CONSTRAINT "base_estructura_costos_santander_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterios_flete" ADD CONSTRAINT "criterios_flete_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "base_stock_santander" ADD CONSTRAINT "base_stock_santander_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tango_clientes" ADD CONSTRAINT "tango_clientes_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tango_ingresos" ADD CONSTRAINT "tango_ingresos_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
