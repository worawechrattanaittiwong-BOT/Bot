CREATE TABLE IF NOT EXISTS bot_instance_secrets (
  bot_instance_id uuid PRIMARY KEY REFERENCES bot_instances(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cloud_unassigned
ON bot_instances(mode, runner_id)
WHERE mode='CLOUD';
