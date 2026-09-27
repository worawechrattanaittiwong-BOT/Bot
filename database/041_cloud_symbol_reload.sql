ALTER TABLE worker_commands
  DROP CONSTRAINT IF EXISTS worker_commands_command_check;

ALTER TABLE worker_commands
  ADD CONSTRAINT worker_commands_command_check
  CHECK (command IN ('STOP_INSTANCE','RELOAD_INSTANCE'));
