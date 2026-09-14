CREATE TABLE IF NOT EXISTS system_maintenance (
  id smallint PRIMARY KEY CHECK (id=1),
  status varchar(20) NOT NULL DEFAULT 'OFF' CHECK (status IN ('OFF','SCHEDULED','DRAINING','MAINTENANCE')),
  title varchar(160),
  message text,
  maintenance_at timestamptz,
  force_close_at timestamptz,
  expected_resume_at timestamptz,
  force_close boolean NOT NULL DEFAULT true,
  announced_at timestamptz,
  drain_started_at timestamptz,
  maintenance_started_at timestamptz,
  resumed_at timestamptz,
  updated_by varchar(120),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_maintenance(id,status,force_close)
VALUES(1,'OFF',true)
ON CONFLICT (id) DO NOTHING;
