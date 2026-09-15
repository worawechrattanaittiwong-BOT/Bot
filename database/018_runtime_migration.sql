BEGIN;

CREATE TABLE IF NOT EXISTS runtime_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
  source_slot_id uuid NOT NULL REFERENCES license_slots(id) ON DELETE RESTRICT,
  target_slot_id uuid NOT NULL REFERENCES license_slots(id) ON DELETE RESTRICT,
  source_mode varchar(16) NOT NULL CHECK (source_mode IN ('LOCAL','CLOUD')),
  target_mode varchar(16) NOT NULL CHECK (target_mode IN ('LOCAL','CLOUD')),
  state text NOT NULL CHECK (state IN (
    'REQUESTED',
    'STOPPING_LOCAL',
    'STOPPING_CLOUD',
    'SOURCE_STOP_CONFIRMED',
    'TARGET_PROVISIONING',
    'WAITING_LOCAL_INSTALL',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
  )),
  execution_generation bigint NOT NULL,
  source_runner_id varchar(120),
  target_runner_id varchar(120),
  source_stop_confirmed_at timestamptz,
  lease_rotated_at timestamptz,
  target_ready_at timestamptz,
  error_code varchar(64),
  error_detail varchar(240),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_mode<>target_mode),
  CHECK (source_slot_id<>target_slot_id)
);

ALTER TABLE runtime_migrations ALTER COLUMN state TYPE text USING state::text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_migration_one_active
  ON runtime_migrations(bot_instance_id)
  WHERE state NOT IN ('COMPLETED','FAILED','CANCELLED');

CREATE INDEX IF NOT EXISTS idx_runtime_migration_user_created
  ON runtime_migrations(user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_migration_target_slot
  ON runtime_migrations(target_slot_id,state);

CREATE OR REPLACE FUNCTION scenova_block_start_during_runtime_migration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.desired_state='RUNNING'
     AND OLD.desired_state IS DISTINCT FROM 'RUNNING'
     AND EXISTS (
       SELECT 1
       FROM runtime_migrations rm
       WHERE rm.bot_instance_id=NEW.id
         AND rm.state NOT IN ('COMPLETED','FAILED','CANCELLED')
     ) THEN
    RAISE EXCEPTION 'runtime migration is active for this bot instance'
      USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_start_during_runtime_migration ON bot_instances;
CREATE TRIGGER trg_block_start_during_runtime_migration
BEFORE UPDATE OF desired_state ON bot_instances
FOR EACH ROW
EXECUTE FUNCTION scenova_block_start_during_runtime_migration();

COMMIT;
