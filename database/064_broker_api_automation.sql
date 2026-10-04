BEGIN;

CREATE TABLE IF NOT EXISTS broker_api_connections (
  broker_code varchar(32) PRIMARY KEY,
  base_url text NOT NULL,
  auth_path text NOT NULL DEFAULT '/api/auth',
  summary_path text NOT NULL DEFAULT '/api/partner/summary/',
  client_report_path text NOT NULL DEFAULT '',
  commission_report_path text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  auto_verify_clients boolean NOT NULL DEFAULT false,
  auto_import_commissions boolean NOT NULL DEFAULT false,
  auto_release_rebates boolean NOT NULL DEFAULT false,
  sync_interval_minutes integer NOT NULL DEFAULT 15
    CHECK (sync_interval_minutes BETWEEN 5 AND 1440),
  last_test_status varchar(24) NOT NULL DEFAULT 'NOT_TESTED',
  last_test_detail text NOT NULL DEFAULT '',
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  updated_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broker_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_code varchar(32) NOT NULL,
  trigger_type varchar(24) NOT NULL
    CHECK (trigger_type IN ('MANUAL','SCHEDULED')),
  status varchar(24) NOT NULL
    CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED','SKIPPED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  clients_seen integer NOT NULL DEFAULT 0,
  clients_verified integer NOT NULL DEFAULT 0,
  commissions_seen integer NOT NULL DEFAULT 0,
  commissions_imported integer NOT NULL DEFAULT 0,
  rebates_released integer NOT NULL DEFAULT 0,
  error_detail text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_broker_sync_runs_code
  ON broker_sync_runs(broker_code,started_at DESC);

INSERT INTO broker_api_connections(
  broker_code,base_url,auth_path,summary_path
) VALUES(
  'EXNESS','https://my.exnessaffiliates.com','/api/auth','/api/partner/summary/'
)
ON CONFLICT(broker_code) DO NOTHING;

COMMIT;
