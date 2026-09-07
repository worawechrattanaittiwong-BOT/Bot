BEGIN;

ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS account_change_requested_at timestamptz;

COMMIT;
