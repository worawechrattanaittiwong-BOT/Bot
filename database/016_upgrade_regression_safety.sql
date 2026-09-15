-- Regression safety for FORCE FLAT, Partner direct transitions, and retired customer multi-slot plans.

UPDATE plans
SET active=false
WHERE code IN (
  'LOCAL_3SLOT','LOCAL_5SLOT',
  'PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50'
);

ALTER TABLE partner_customers
  ADD COLUMN IF NOT EXISTS direct_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_reason varchar(64);

CREATE INDEX IF NOT EXISTS idx_partner_customers_direct_subscription
  ON partner_customers(direct_subscription_id)
  WHERE direct_subscription_id IS NOT NULL;

-- Database-level defense in depth: no code path may reopen a bot while maintenance
-- is draining/closed. FORCE FLAT additionally keeps every desired state STOPPED.
CREATE OR REPLACE FUNCTION scenova_guard_maintenance_bot_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  maintenance_status text;
  maintenance_title text;
BEGIN
  SELECT status,title INTO maintenance_status,maintenance_title
  FROM system_maintenance WHERE id=1;

  IF maintenance_status IN ('DRAINING','MAINTENANCE') THEN
    IF NEW.desired_state='RUNNING' THEN
      RAISE EXCEPTION 'SCENOVA_MAINTENANCE_BLOCKS_START';
    END IF;
    IF maintenance_title='EMERGENCY FORCE FLAT' AND NEW.desired_state<>'STOPPED' THEN
      NEW.desired_state='STOPPED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scenova_guard_maintenance_bot_state ON bot_instances;
CREATE TRIGGER trg_scenova_guard_maintenance_bot_state
BEFORE INSERT OR UPDATE OF desired_state ON bot_instances
FOR EACH ROW EXECUTE FUNCTION scenova_guard_maintenance_bot_state();

CREATE OR REPLACE FUNCTION scenova_guard_maintenance_start_command()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  maintenance_status text;
BEGIN
  IF NEW.command='START' THEN
    SELECT status INTO maintenance_status FROM system_maintenance WHERE id=1;
    IF maintenance_status IN ('DRAINING','MAINTENANCE') THEN
      RAISE EXCEPTION 'SCENOVA_MAINTENANCE_BLOCKS_START_COMMAND';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scenova_guard_maintenance_start_command ON bot_commands;
CREATE TRIGGER trg_scenova_guard_maintenance_start_command
BEFORE INSERT ON bot_commands
FOR EACH ROW EXECUTE FUNCTION scenova_guard_maintenance_start_command();
