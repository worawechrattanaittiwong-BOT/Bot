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

-- Recovery for a lost CLOSE_ALL ACK. An authenticated EA heartbeat updates
-- last_seen_at + ea_last_ip + runtime metrics. If that live heartbeat proves the
-- currently-bound MT5 account is flat while the bot is already STOPPED, it is
-- equivalent to a real EA confirmation that there is nothing left to close.
-- This never trusts browser state, stale metrics, an unbound account, or a
-- heartbeat from a different MT5 identity.
CREATE OR REPLACE FUNCTION scenova_reconcile_close_all_from_flat_ea_heartbeat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_matches boolean := false;
  reconciled_count integer := 0;
BEGIN
  IF NEW.desired_state <> 'STOPPED'
     OR NEW.actual_state NOT IN ('STOPPED','SAFE_STOP')
     OR NEW.last_seen_at IS NULL
     OR NEW.last_seen_at IS NOT DISTINCT FROM OLD.last_seen_at
     OR NEW.ea_last_ip IS NULL
     OR NEW.mt5_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.metrics->>'positions','') !~ '^[0-9]+$'
     OR (NEW.metrics->>'positions')::int <> 0 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.metrics->>'accountNumber','') = ''
     OR COALESCE(NEW.metrics->>'server','') = '' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM mt5_accounts a
    WHERE a.id=NEW.mt5_account_id
      AND a.status='ACTIVE'
      AND lower(a.account_number)=lower(NEW.metrics->>'accountNumber')
      AND lower(a.broker_server)=lower(NEW.metrics->>'server')
  ) INTO account_matches;

  IF NOT account_matches THEN
    RETURN NEW;
  END IF;

  UPDATE bot_commands
  SET status='ACKED',
      acked_at=now(),
      payload=COALESCE(payload,'{}'::jsonb) || jsonb_build_object(
        'ackSource','EA',
        'ackReason','FLAT_HEARTBEAT_RECONCILE',
        'reconciledAt',now()
      )
  WHERE bot_instance_id=NEW.id
    AND command='CLOSE_ALL'
    AND status IN ('PENDING','DELIVERED');

  GET DIAGNOSTICS reconciled_count = ROW_COUNT;

  IF reconciled_count > 0 THEN
    INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
    VALUES(
      'EA:' || NEW.id::text,
      'CLOSE_ALL_FLAT_HEARTBEAT_RECONCILE',
      'bot_instance',
      NEW.id,
      jsonb_build_object(
        'positions',0,
        'accountNumber',NEW.metrics->>'accountNumber',
        'brokerServer',NEW.metrics->>'server',
        'reconciledCommands',reconciled_count
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scenova_reconcile_close_all_flat_heartbeat ON bot_instances;
CREATE TRIGGER trg_scenova_reconcile_close_all_flat_heartbeat
AFTER UPDATE OF last_seen_at,actual_state,metrics ON bot_instances
FOR EACH ROW EXECUTE FUNCTION scenova_reconcile_close_all_from_flat_ea_heartbeat();
