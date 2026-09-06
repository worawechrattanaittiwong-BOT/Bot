ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS agent_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_version varchar(32),
  ADD COLUMN IF NOT EXISTS agent_terminal_path text,
  ADD COLUMN IF NOT EXISTS agent_ea_hash varchar(128);

CREATE INDEX IF NOT EXISTS idx_bot_instances_agent_seen
ON bot_instances(agent_last_seen_at);
