ALTER TABLE tango_ingresos ADD COLUMN external_key varchar(255);
ALTER TABLE tango_ingresos ADD COLUMN source_header_id varchar(64);
CREATE UNIQUE INDEX tango_ingresos_external_key_key ON tango_ingresos(external_key);

CREATE TABLE tango_sync_jobs (
  id uuid PRIMARY KEY,
  date_from date NOT NULL,
  date_to date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  requested_by varchar(255) NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  claim_token uuid,
  lease_until timestamptz,
  row_count integer NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT tango_sync_dates CHECK (date_to >= date_from),
  CONSTRAINT tango_sync_status CHECK (status IN ('pending','running','completed','failed','cancelled'))
);
CREATE INDEX tango_sync_jobs_status_created_at_idx ON tango_sync_jobs(status, created_at);
CREATE TABLE tango_sync_batches (
  job_id uuid NOT NULL REFERENCES tango_sync_jobs(id) ON DELETE CASCADE,
  index integer NOT NULL,
  rows jsonb NOT NULL,
  PRIMARY KEY (job_id, index)
);
CREATE TABLE tango_connector_state (id varchar(64) PRIMARY KEY, last_seen_at timestamptz NOT NULL);
