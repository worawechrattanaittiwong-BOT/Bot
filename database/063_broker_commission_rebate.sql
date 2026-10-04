BEGIN;

-- Phase 3: Broker commission + rebate accounting.
-- This ledger is intentionally separate from SCENOVA Invite & Earn commission
-- tables and does not modify Trading/EA runtime tables.

CREATE TABLE IF NOT EXISTS broker_rebate_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  benefit_level_id uuid NOT NULL REFERENCES broker_benefit_levels(id) ON DELETE CASCADE,
  rebate_bps integer NOT NULL DEFAULT 0
    CHECK (rebate_bps BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  updated_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(broker_id,benefit_level_id)
);

CREATE TABLE IF NOT EXISTS broker_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE RESTRICT,
  partner_client_id uuid NOT NULL REFERENCES broker_partner_clients(id) ON DELETE RESTRICT,
  external_event_id varchar(180) NOT NULL,
  symbol varchar(64),
  volume_lots numeric(18,4),
  gross_commission_minor bigint NOT NULL CHECK (gross_commission_minor>=0),
  currency varchar(8) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'CONFIRMED'
    CHECK (status IN ('CONFIRMED','REVERSED')),
  occurred_at timestamptz NOT NULL,
  imported_by varchar(160) NOT NULL,
  raw_reference text,
  reversed_at timestamptz,
  reversed_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(broker_id,external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_broker_commission_client
  ON broker_commission_events(partner_client_id,occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_broker_commission_status
  ON broker_commission_events(broker_id,status,occurred_at DESC);

CREATE TABLE IF NOT EXISTS broker_rebate_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_event_id uuid NOT NULL UNIQUE REFERENCES broker_commission_events(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  partner_client_id uuid NOT NULL REFERENCES broker_partner_clients(id) ON DELETE RESTRICT,
  rebate_bps integer NOT NULL CHECK (rebate_bps BETWEEN 0 AND 10000),
  rebate_amount_minor bigint NOT NULL CHECK (rebate_amount_minor>=0),
  currency varchar(8) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','AVAILABLE','PAID','REVERSED')),
  available_at timestamptz,
  paid_at timestamptz,
  payout_reference varchar(220),
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_rebate_user
  ON broker_rebate_entries(user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS broker_rebate_wallet_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rebate_entry_id uuid NOT NULL REFERENCES broker_rebate_entries(id) ON DELETE RESTRICT,
  event_type varchar(32) NOT NULL
    CHECK (event_type IN ('REBATE_EARN','REBATE_RELEASE','REBATE_PAID','REBATE_REVERSE')),
  pending_delta_minor bigint NOT NULL DEFAULT 0,
  available_delta_minor bigint NOT NULL DEFAULT 0,
  paid_delta_minor bigint NOT NULL DEFAULT 0,
  currency varchar(8) NOT NULL,
  actor varchar(160) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_broker_rebate_ledger_event
  ON broker_rebate_wallet_ledger(rebate_entry_id,event_type);

CREATE INDEX IF NOT EXISTS idx_broker_rebate_wallet_user
  ON broker_rebate_wallet_ledger(user_id,currency,created_at DESC);

-- Safe default: Phase 3 never starts paying rebate until Owner/Admin
-- explicitly chooses a percentage for each benefit level.
INSERT INTO broker_rebate_policies(broker_id,benefit_level_id,rebate_bps,active)
SELECT b.id,l.id,0,true
FROM brokers b
JOIN broker_benefit_levels l ON l.broker_id=b.id
WHERE b.code='EXNESS'
ON CONFLICT(broker_id,benefit_level_id) DO NOTHING;

COMMIT;
