ALTER TABLE egresos ADD COLUMN IF NOT EXISTS source_hash varchar(64);
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS created_by varchar(255);
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS modified_by varchar(255);
ALTER TABLE egresos ADD COLUMN IF NOT EXISTS deleted_by varchar(255);
CREATE INDEX IF NOT EXISTS egresos_cliente_source_hash_idx ON egresos(cliente, source_hash);
