CREATE TABLE IF NOT EXISTS cloud_server_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_server_enrollment_active
ON cloud_server_enrollments(runner_id)
WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cloud_server_enrollment_expiry
ON cloud_server_enrollments(expires_at)
WHERE used_at IS NULL AND revoked_at IS NULL;


CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_nodes_runner_id_ci
ON worker_nodes(lower(runner_id));
