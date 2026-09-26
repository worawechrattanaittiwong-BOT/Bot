BEGIN;

CREATE TABLE IF NOT EXISTS ea_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version varchar(32) NOT NULL,
  sha256 varchar(64) NOT NULL,
  runtime_contract varchar(96),
  artifact_name varchar(120) NOT NULL DEFAULT 'FastBasketBot.ex5',
  source_commit varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(version,sha256)
);

CREATE TABLE IF NOT EXISTS server_update_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id) ON DELETE CASCADE,
  action varchar(16) NOT NULL CHECK(action IN ('UPDATE','ROLLBACK')),
  source_job_id uuid REFERENCES server_update_jobs(id) ON DELETE SET NULL,
  release_id uuid REFERENCES ea_releases(id) ON DELETE RESTRICT,
  mode varchar(16) NOT NULL DEFAULT 'SAFE' CHECK(mode IN ('SAFE')),
  state varchar(24) NOT NULL DEFAULT 'RUNNING'
    CHECK(state IN ('RUNNING','COMPLETED','PARTIAL_FAILED','FAILED','CANCELLED')),
  created_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_update_one_active
ON server_update_jobs(runner_id)
WHERE state='RUNNING';

CREATE TABLE IF NOT EXISTS instance_update_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_update_job_id uuid NOT NULL REFERENCES server_update_jobs(id) ON DELETE CASCADE,
  bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
  action varchar(16) NOT NULL CHECK(action IN ('UPDATE','ROLLBACK')),
  source_instance_update_id uuid REFERENCES instance_update_jobs(id) ON DELETE SET NULL,
  target_version varchar(32) NOT NULL,
  target_sha256 varchar(64),
  previous_version varchar(32),
  previous_sha256 varchar(64),
  original_desired_state varchar(24) NOT NULL DEFAULT 'STOPPED',
  state varchar(24) NOT NULL DEFAULT 'WAITING_SAFE'
    CHECK(state IN ('WAITING_SAFE','DELIVERED','VERIFYING','COMPLETED','FAILED','CANCELLED')),
  result_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  applied_at timestamptz,
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instance_update_one_active
ON instance_update_jobs(bot_instance_id)
WHERE state IN ('WAITING_SAFE','DELIVERED','VERIFYING');

CREATE INDEX IF NOT EXISTS idx_instance_update_parent
ON instance_update_jobs(server_update_job_id,state,created_at);

COMMIT;
