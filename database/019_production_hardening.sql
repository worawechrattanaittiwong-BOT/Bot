BEGIN;

ALTER TABLE worker_nodes
  ADD COLUMN IF NOT EXISTS health_state text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS capacity_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capacity_block_reason varchar(64),
  ADD COLUMN IF NOT EXISTS last_healthy_at timestamptz,
  ADD COLUMN IF NOT EXISTS quarantined boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quarantine_reason varchar(160),
  ADD COLUMN IF NOT EXISTS recovery_paused boolean NOT NULL DEFAULT false;
ALTER TABLE worker_nodes ALTER COLUMN health_state TYPE text USING health_state::text;

ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS cloud_recovery_state varchar(24) NOT NULL DEFAULT 'IDLE',
  ADD COLUMN IF NOT EXISTS cloud_recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cloud_recovery_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_recovery_next_at timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_recovery_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS cloud_recovery_last_error varchar(64);

-- Once a missing Cloud terminal is authorized for recovery, the old EA
-- heartbeat can no longer prove success. Only a fresh heartbeat from the
-- restarted runtime may repopulate last_seen_at and reset the recovery budget.
CREATE OR REPLACE FUNCTION scenova_clear_pre_recovery_heartbeat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cloud_recovery_state='AUTHORIZED'
     AND OLD.cloud_recovery_state IS DISTINCT FROM 'AUTHORIZED' THEN
    NEW.last_seen_at=NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clear_pre_recovery_heartbeat ON bot_instances;
CREATE TRIGGER trg_clear_pre_recovery_heartbeat
BEFORE UPDATE OF cloud_recovery_state ON bot_instances
FOR EACH ROW
EXECUTE FUNCTION scenova_clear_pre_recovery_heartbeat();

CREATE TABLE IF NOT EXISTS production_controls (
  id smallint PRIMARY KEY CHECK(id=1),
  cloud_provisioning_paused boolean NOT NULL DEFAULT false,
  cloud_recovery_paused boolean NOT NULL DEFAULT false,
  reason varchar(240),
  updated_by varchar(120),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO production_controls(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS runtime_incidents (
  id bigserial PRIMARY KEY,
  incident_key varchar(220) NOT NULL,
  category varchar(48) NOT NULL,
  severity varchar(16) NOT NULL CHECK(severity IN ('INFO','WARN','CRITICAL')),
  runner_id varchar(120),
  bot_instance_id uuid REFERENCES bot_instances(id) ON DELETE CASCADE,
  state varchar(16) NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','RESOLVED')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_incident_open_key
  ON runtime_incidents(incident_key) WHERE state='OPEN';
CREATE INDEX IF NOT EXISTS idx_runtime_incident_recent
  ON runtime_incidents(state,severity,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_incident_instance
  ON runtime_incidents(bot_instance_id,last_seen_at DESC);


-- Cloud Server software updates are declared here as a compatibility baseline
-- because Phase 4 integration starts the current Cloud API against migration 019.
-- Migration 040 owns the feature-specific indexes/forward additions.
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

COMMIT;
