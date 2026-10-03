-- This migration is replayed on every deploy. Keep its command CHECK
-- forward-compatible with all command types introduced by later migrations,
-- otherwise an existing REBUILD_INSTANCE row would make deploys fail here
-- before database/058_cloud_runtime_rebuild.sql can run.
ALTER TABLE worker_commands
  DROP CONSTRAINT IF EXISTS worker_commands_command_check;

ALTER TABLE worker_commands
  ADD CONSTRAINT worker_commands_command_check
  CHECK (command IN ('STOP_INSTANCE','RELOAD_INSTANCE','REBUILD_INSTANCE'));
