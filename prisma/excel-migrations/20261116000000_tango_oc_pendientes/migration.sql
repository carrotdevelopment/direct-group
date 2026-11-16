-- Renglones de órdenes de compra de Tango con cantidad pendiente de recibir (CPA36.CAN_PENDIE > 0).
-- Es una foto: cada importación del conector la reemplaza entera. Suma solo al stock teórico.
CREATE TABLE tango_oc_pendientes (
  source_id varchar(32) PRIMARY KEY,
  orden_de_compra varchar(255) NOT NULL,
  renglon integer,
  codigo_cliente varchar(255) NOT NULL,
  deposito varchar(255) NOT NULL DEFAULT '',
  cliente varchar(255) NOT NULL DEFAULT '',
  fecha_pedido date,
  cantidad_pedida numeric(18,4) NOT NULL,
  cantidad_recibida numeric(18,4) NOT NULL,
  cantidad_pendiente numeric(18,4) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tango_oc_pendientes_codigo_cliente_idx ON tango_oc_pendientes(codigo_cliente);
CREATE INDEX tango_oc_pendientes_orden_de_compra_idx ON tango_oc_pendientes(orden_de_compra);

-- Los lotes de un trabajo ahora pueden ser de ingresos o de OC pendientes.
ALTER TABLE tango_sync_batches ADD COLUMN kind varchar(20) NOT NULL DEFAULT 'ingresos';
ALTER TABLE tango_sync_batches DROP CONSTRAINT tango_sync_batches_pkey;
ALTER TABLE tango_sync_batches ADD PRIMARY KEY (job_id, kind, index);
ALTER TABLE tango_sync_batches ADD CONSTRAINT tango_sync_batches_kind CHECK (kind IN ('ingresos', 'pendientes'));

-- NULL: el conector no mandó OC pendientes en ese trabajo (versión vieja o falló la consulta).
ALTER TABLE tango_sync_jobs ADD COLUMN pending_row_count integer;
