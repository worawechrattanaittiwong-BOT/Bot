CREATE TABLE IF NOT EXISTS production_controls (
  id smallint PRIMARY KEY CHECK(id=1),
  cloud_provisioning_paused boolean NOT NULL DEFAULT false,
  cloud_recovery_paused boolean NOT NULL DEFAULT false,
  reason varchar(240),
  updated_by varchar(120),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO production_controls(id)
VALUES(1)
ON CONFLICT(id) DO NOTHING;

ALTER TABLE production_controls
  ADD COLUMN IF NOT EXISTS sales_paused boolean NOT NULL DEFAULT false;
