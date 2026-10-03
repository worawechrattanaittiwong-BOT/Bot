-- This historical migration is intentionally forward-compatible because
-- production replays additive migrations on every deploy. Never narrow the
-- command constraint below commands introduced by later migrations.
ALTER TABLE worker_commands
  DROP CONSTRAINT IF EXISTS worker_commands_command_check;

ALTER TABLE worker_commands
  ADD CONSTRAINT worker_commands_command_check
  CHECK (command IN ('STOP_INSTANCE','RELOAD_INSTANCE','REBUILD_INSTANCE'));
