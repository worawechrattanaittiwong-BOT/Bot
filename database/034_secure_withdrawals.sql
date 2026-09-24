-- SCENOVA Commission Wallet Phase 2: secure manual withdrawals.
-- Money leaves Available only through an append-only withdrawal ledger.
-- Bank account numbers are encrypted by the API before storage.

CREATE TABLE IF NOT EXISTS commission_withdrawal_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id=1),
  requests_enabled boolean NOT NULL DEFAULT true,
  min_amount_satang integer NOT NULL DEFAULT 10000 CHECK (min_amount_satang>=100),
  max_amount_satang integer NOT NULL DEFAULT 5000000 CHECK (max_amount_satang>=min_amount_satang),
  destination_cooldown_hours integer NOT NULL DEFAULT 24 CHECK (destination_cooldown_hours BETWEEN 0 AND 720),
  updated_by varchar(160),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO commission_withdrawal_settings(id)
VALUES(1)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS commission_payout_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  bank_code varchar(32) NOT NULL,
  bank_name varchar(120) NOT NULL,
  account_name varchar(180) NOT NULL,
  account_ciphertext text NOT NULL,
  account_iv text NOT NULL,
  account_auth_tag text NOT NULL,
  account_last4 varchar(8) NOT NULL,
  account_hash char(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'PENDING_COOLDOWN'
    CHECK (status IN ('PENDING_COOLDOWN','ACTIVE','DISABLED')),
  usable_at timestamptz NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payout_one_current
  ON commission_payout_destinations(user_id)
  WHERE status IN ('PENDING_COOLDOWN','ACTIVE');

CREATE INDEX IF NOT EXISTS idx_commission_payout_account_hash
  ON commission_payout_destinations(account_hash,status);

CREATE TABLE IF NOT EXISTS commission_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  destination_id uuid NOT NULL REFERENCES commission_payout_destinations(id) ON DELETE RESTRICT,
  amount_satang integer NOT NULL CHECK (amount_satang>0),
  currency varchar(8) NOT NULL DEFAULT 'THB',
  status varchar(20) NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','HOLD','APPROVED','REJECTED','PAID','CANCELLED')),
  client_request_key varchar(100) NOT NULL,
  request_ip varchar(96),
  review_reason text,
  reviewed_by varchar(160),
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  paid_at timestamptz,
  payout_reference varchar(180),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,client_request_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_withdrawal_one_open
  ON commission_withdrawals(user_id)
  WHERE status IN ('REQUESTED','HOLD','APPROVED');

CREATE INDEX IF NOT EXISTS idx_commission_withdrawal_admin_queue
  ON commission_withdrawals(status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commission_withdrawal_user
  ON commission_withdrawals(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS commission_withdrawal_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_key varchar(220) NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  withdrawal_id uuid NOT NULL REFERENCES commission_withdrawals(id) ON DELETE RESTRICT,
  event_type varchar(24) NOT NULL CHECK (event_type IN ('LOCK','UNLOCK','PAID')),
  available_delta_satang integer NOT NULL DEFAULT 0,
  locked_delta_satang integer NOT NULL DEFAULT 0,
  paid_delta_satang integer NOT NULL DEFAULT 0,
  currency varchar(8) NOT NULL DEFAULT 'THB',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (available_delta_satang<>0 OR locked_delta_satang<>0 OR paid_delta_satang<>0)
    AND available_delta_satang + locked_delta_satang + paid_delta_satang = 0
  )
);

CREATE INDEX IF NOT EXISTS idx_commission_withdrawal_ledger_user
  ON commission_withdrawal_ledger(user_id,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS commission_withdrawal_audit (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  withdrawal_id uuid REFERENCES commission_withdrawals(id) ON DELETE SET NULL,
  destination_id uuid REFERENCES commission_payout_destinations(id) ON DELETE SET NULL,
  actor_type varchar(16) NOT NULL CHECK (actor_type IN ('USER','ADMIN','SYSTEM')),
  actor_label varchar(160),
  event_type varchar(48) NOT NULL,
  ip_address varchar(96),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_withdrawal_audit_user
  ON commission_withdrawal_audit(user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commission_withdrawal_audit_withdrawal
  ON commission_withdrawal_audit(withdrawal_id,created_at);

CREATE OR REPLACE FUNCTION reject_commission_withdrawal_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commission_withdrawal_ledger is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_withdrawal_ledger_immutable
  ON commission_withdrawal_ledger;

CREATE TRIGGER trg_commission_withdrawal_ledger_immutable
BEFORE UPDATE OR DELETE ON commission_withdrawal_ledger
FOR EACH ROW
EXECUTE FUNCTION reject_commission_withdrawal_ledger_mutation();

CREATE OR REPLACE FUNCTION reject_commission_withdrawal_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commission_withdrawal_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_withdrawal_audit_immutable
  ON commission_withdrawal_audit;

CREATE TRIGGER trg_commission_withdrawal_audit_immutable
BEFORE UPDATE OR DELETE ON commission_withdrawal_audit
FOR EACH ROW
EXECUTE FUNCTION reject_commission_withdrawal_audit_mutation();


-- Financial identity and state transitions are guarded at database level.
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
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'withdrawal financial identity is immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status='REQUESTED' AND NEW.status IN ('HOLD','APPROVED','REJECTED','CANCELLED') THEN
      RETURN NEW;
    ELSIF OLD.status='HOLD' AND NEW.status IN ('APPROVED','REJECTED') THEN
      RETURN NEW;
    ELSIF OLD.status='APPROVED' AND NEW.status IN ('PAID','REJECTED') THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'invalid withdrawal status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_withdrawal_update_guard
  ON commission_withdrawals;

CREATE TRIGGER trg_commission_withdrawal_update_guard
BEFORE UPDATE ON commission_withdrawals
FOR EACH ROW
EXECUTE FUNCTION guard_commission_withdrawal_update();

CREATE OR REPLACE FUNCTION guard_commission_payout_destination_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.bank_code IS DISTINCT FROM OLD.bank_code
     OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
     OR NEW.account_name IS DISTINCT FROM OLD.account_name
     OR NEW.account_ciphertext IS DISTINCT FROM OLD.account_ciphertext
     OR NEW.account_iv IS DISTINCT FROM OLD.account_iv
     OR NEW.account_auth_tag IS DISTINCT FROM OLD.account_auth_tag
     OR NEW.account_last4 IS DISTINCT FROM OLD.account_last4
     OR NEW.account_hash IS DISTINCT FROM OLD.account_hash
     OR NEW.usable_at IS DISTINCT FROM OLD.usable_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'payout destination identity is immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status='PENDING_COOLDOWN' AND NEW.status IN ('ACTIVE','DISABLED') THEN
      RETURN NEW;
    ELSIF OLD.status='ACTIVE' AND NEW.status='DISABLED' THEN
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'invalid payout destination status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_payout_destination_update_guard
  ON commission_payout_destinations;

CREATE TRIGGER trg_commission_payout_destination_update_guard
BEFORE UPDATE ON commission_payout_destinations
FOR EACH ROW
EXECUTE FUNCTION guard_commission_payout_destination_update();
