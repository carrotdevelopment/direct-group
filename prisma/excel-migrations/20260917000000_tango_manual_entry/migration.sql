ALTER TABLE tango_ingresos ADD COLUMN pending_tango_entry boolean NOT NULL DEFAULT false;
ALTER TABLE tango_ingresos ADD COLUMN created_by varchar(255);
CREATE INDEX tango_ingresos_pending_tango_entry_idx ON tango_ingresos(pending_tango_entry);
