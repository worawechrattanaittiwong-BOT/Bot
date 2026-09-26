BEGIN;

CREATE TABLE IF NOT EXISTS server_software_update_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id) ON DELETE CASCADE,
  target_worker_version varchar(32) NOT NULL,
  target_setup_version varchar(32) NOT NULL,
  setup_url text NOT NULL,
  setup_sha256 varchar(64),
  state varchar(24) NOT NULL DEFAULT 'REQUESTED'
    CHECK(state IN ('REQUESTED','DELIVERED','RESTARTING','COMPLETED','FAILED')),
  original_accepting_jobs boolean NOT NULL DEFAULT false,
  result_code varchar(64),
  created_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE server_software_update_jobs
  ADD COLUMN IF NOT EXISTS setup_sha256 varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_software_update_one_active
ON server_software_update_jobs(runner_id)
WHERE state IN ('REQUESTED','DELIVERED','RESTARTING');

CREATE INDEX IF NOT EXISTS idx_server_software_update_runner_created
ON server_software_update_jobs(runner_id,created_at DESC);

COMMIT;
