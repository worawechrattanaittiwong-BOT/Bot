-- SCENOVA Commission Wallet Phase 3: advanced fraud controls, dual approval,
-- payout worker separation, anomaly alerts and reconciliation.

ALTER TABLE commission_withdrawal_settings
  ADD COLUMN IF NOT EXISTS kill_switch_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kill_switch_reason text,
  ADD COLUMN IF NOT EXISTS kill_switch_triggered_by varchar(160),
  ADD COLUMN IF NOT EXISTS kill_switch_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS global_daily_limit_satang integer NOT NULL DEFAULT 10000000,
  ADD COLUMN IF NOT EXISTS dual_approval_threshold_satang integer NOT NULL DEFAULT 2000000,
  ADD COLUMN IF NOT EXISTS high_risk_score_threshold integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS critical_risk_score_threshold integer NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS risk_engine_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_payout_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE commission_withdrawal_settings
  DROP CONSTRAINT IF EXISTS commission_withdrawal_settings_global_daily_limit_check,
  DROP CONSTRAINT IF EXISTS commission_withdrawal_settings_dual_threshold_check,
  DROP CONSTRAINT IF EXISTS commission_withdrawal_settings_risk_threshold_check;

ALTER TABLE commission_withdrawal_settings
  ADD CONSTRAINT commission_withdrawal_settings_global_daily_limit_check
    CHECK (global_daily_limit_satang>=100),
  ADD CONSTRAINT commission_withdrawal_settings_dual_threshold_check
    CHECK (dual_approval_threshold_satang>=100),
  ADD CONSTRAINT commission_withdrawal_settings_risk_threshold_check
    CHECK (
      high_risk_score_threshold BETWEEN 1 AND 99
      AND critical_risk_score_threshold BETWEEN high_risk_score_threshold+1 AND 100
    );

ALTER TABLE commission_withdrawals
  ADD COLUMN IF NOT EXISTS request_device_hash char(64),
  ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_level varchar(12) NOT NULL DEFAULT 'LOW',
  ADD COLUMN IF NOT EXISTS risk_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_required smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_payout_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_status varchar(24) NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

ALTER TABLE commission_withdrawals
  DROP CONSTRAINT IF EXISTS commission_withdrawals_risk_score_check,
  DROP CONSTRAINT IF EXISTS commission_withdrawals_risk_level_check,
  DROP CONSTRAINT IF EXISTS commission_withdrawals_approval_required_check,
  DROP CONSTRAINT IF EXISTS commission_withdrawals_approval_count_check,
  DROP CONSTRAINT IF EXISTS commission_withdrawals_reconciliation_status_check;

ALTER TABLE commission_withdrawals
  ADD CONSTRAINT commission_withdrawals_risk_score_check CHECK (risk_score BETWEEN 0 AND 100),
  ADD CONSTRAINT commission_withdrawals_risk_level_check CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  ADD CONSTRAINT commission_withdrawals_approval_required_check CHECK (approval_required BETWEEN 1 AND 2),
  ADD CONSTRAINT commission_withdrawals_approval_count_check CHECK (approval_count BETWEEN 0 AND 2),
  ADD CONSTRAINT commission_withdrawals_reconciliation_status_check
    CHECK (reconciliation_status IN ('NOT_REQUIRED','PENDING','MATCHED','MISMATCH','MANUAL_REVIEW'));

CREATE INDEX IF NOT EXISTS idx_commission_withdrawals_risk
  ON commission_withdrawals(risk_level,risk_score DESC,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commission_withdrawals_ip
  ON commission_withdrawals(request_ip,created_at DESC)
  WHERE request_ip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_withdrawals_device
  ON commission_withdrawals(request_device_hash,created_at DESC)
  WHERE request_device_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS commission_withdrawal_user_controls (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  withdrawal_paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  daily_limit_satang integer,
  updated_by varchar(160),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (daily_limit_satang IS NULL OR daily_limit_satang>=100)
);

CREATE TABLE IF NOT EXISTS commission_withdrawal_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES commission_withdrawals(id) ON DELETE RESTRICT,
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  admin_label varchar(160) NOT NULL,
  decision varchar(16) NOT NULL DEFAULT 'APPROVE' CHECK (decision IN ('APPROVE')),
  note text,
  ip_address varchar(96),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(withdrawal_id,admin_user_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_withdrawal_approvals_withdrawal
  ON commission_withdrawal_approvals(withdrawal_id,created_at);

CREATE TABLE IF NOT EXISTS commission_withdrawal_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid REFERENCES commission_withdrawals(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  severity varchar(12) NOT NULL CHECK (severity IN ('INFO','MEDIUM','HIGH','CRITICAL')),
  alert_type varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  title varchar(180) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_by varchar(160),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_withdrawal_alerts_open
  ON commission_withdrawal_alerts(status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS commission_payout_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL UNIQUE REFERENCES commission_withdrawals(id) ON DELETE RESTRICT,
  status varchar(24) NOT NULL DEFAULT 'READY'
    CHECK (status IN ('READY','CLAIMED','SUBMITTED','SUCCEEDED','FAILED','RECONCILE_REQUIRED','CANCELLED')),
  worker_id varchar(100),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  provider_reference varchar(180),
  provider_amount_satang integer,
  provider_currency varchar(8),
  provider_status varchar(80),
  error_code varchar(80),
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  last_attempt_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_payout_jobs_queue
  ON commission_payout_jobs(status,created_at)
  WHERE status IN ('READY','CLAIMED','SUBMITTED','RECONCILE_REQUIRED');

CREATE TABLE IF NOT EXISTS commission_payout_reconciliation (
  id bigserial PRIMARY KEY,
  payout_job_id uuid NOT NULL REFERENCES commission_payout_jobs(id) ON DELETE RESTRICT,
  withdrawal_id uuid NOT NULL REFERENCES commission_withdrawals(id) ON DELETE RESTRICT,
  event_type varchar(32) NOT NULL
    CHECK (event_type IN ('CLAIMED','SUBMITTED','MATCHED','MISMATCH','FAILED','MANUAL_REVIEW')),
  provider_reference varchar(180),
  expected_amount_satang integer NOT NULL,
  provider_amount_satang integer,
  expected_currency varchar(8) NOT NULL DEFAULT 'THB',
  provider_currency varchar(8),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_payout_reconciliation_job
  ON commission_payout_reconciliation(payout_job_id,created_at);

CREATE OR REPLACE FUNCTION reject_commission_withdrawal_approval_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commission_withdrawal_approvals is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_withdrawal_approvals_immutable
  ON commission_withdrawal_approvals;

CREATE TRIGGER trg_commission_withdrawal_approvals_immutable
BEFORE UPDATE OR DELETE ON commission_withdrawal_approvals
FOR EACH ROW
EXECUTE FUNCTION reject_commission_withdrawal_approval_mutation();

CREATE OR REPLACE FUNCTION reject_commission_payout_reconciliation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commission_payout_reconciliation is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_payout_reconciliation_immutable
  ON commission_payout_reconciliation;

CREATE TRIGGER trg_commission_payout_reconciliation_immutable
BEFORE UPDATE OR DELETE ON commission_payout_reconciliation
FOR EACH ROW
EXECUTE FUNCTION reject_commission_payout_reconciliation_mutation();

-- Extend the Phase 2 identity guard. Risk/approval/reconciliation fields may change,
-- but financial identity remains immutable.
CREATE OR REPLACE FUNCTION guard_commission_withdrawal_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.destination_id IS DISTINCT FROM OLD.destination_id
     OR NEW.amount_satang IS DISTINCT FROM OLD.amount_satang
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.client_request_key IS DISTINCT FROM OLD.client_request_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.request_ip IS DISTINCT FROM OLD.request_ip
     OR NEW.request_device_hash IS DISTINCT FROM OLD.request_device_hash THEN
    RAISE EXCEPTION 'withdrawal financial/request identity is immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status='REQUESTED' AND NEW.status IN ('HOLD','APPROVED','REJECTED','CANCELLED') THEN
      RETURN NEW;
    ELSIF OLD.status='HOLD' AND NEW.status IN ('APPROVED','REJECTED') THEN
      RETURN NEW;
    ELSIF OLD.status='APPROVED' AND NEW.status IN ('PAID','REJECTED','HOLD') THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'invalid withdrawal status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
