BEGIN;

ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS execution_generation bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lease_rotated_at timestamptz,
  ADD COLUMN IF NOT EXISTS runtime_stop_state varchar(24) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS runtime_stop_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS runtime_stop_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS runtime_stop_error varchar(64);

CREATE TABLE IF NOT EXISTS worker_commands (
  id bigserial PRIMARY KEY,
  runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id) ON DELETE CASCADE,
  bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
  execution_generation bigint NOT NULL,
  command varchar(32) NOT NULL CHECK (command IN ('STOP_INSTANCE')),
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','DELIVERED','ACKED','FAILED','CANCELLED')),
  result_code varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  acked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_worker_commands_runner_pending
  ON worker_commands(runner_id,status,id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_stop_one_active
  ON worker_commands(bot_instance_id,command)
  WHERE status IN ('PENDING','DELIVERED');

COMMIT;
