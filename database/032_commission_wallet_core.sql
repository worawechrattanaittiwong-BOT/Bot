-- SCENOVA Commission Wallet Core (Phase 1)
-- Append-only money movement ledger. Balances are represented as bucket deltas
-- in satang. Existing referral commissions are imported as one current-state
-- snapshot each so migration does not manufacture historical transitions.

CREATE TABLE IF NOT EXISTS commission_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_key varchar(220) NOT NULL UNIQUE,
  beneficiary_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  commission_id uuid NOT NULL REFERENCES referral_commissions(id) ON DELETE RESTRICT,
  event_type varchar(32) NOT NULL
    CHECK (event_type IN (
      'MIGRATION_SNAPSHOT',
      'COMMISSION_EARN',
      'COMMISSION_RELEASE',
      'COMMISSION_PAID',
      'COMMISSION_VOID'
    )),
  pending_delta_satang integer NOT NULL DEFAULT 0,
  available_delta_satang integer NOT NULL DEFAULT 0,
  paid_delta_satang integer NOT NULL DEFAULT 0,
  currency varchar(8) NOT NULL DEFAULT 'THB',
  source_type varchar(40) NOT NULL,
  source_id uuid NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 4),
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    pending_delta_satang<>0 OR
    available_delta_satang<>0 OR
    paid_delta_satang<>0 OR
    event_type='COMMISSION_VOID'
  )
);

CREATE INDEX IF NOT EXISTS idx_commission_wallet_ledger_user
  ON commission_wallet_ledger(beneficiary_user_id,created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_commission_wallet_ledger_commission
  ON commission_wallet_ledger(commission_id,created_at,id);

CREATE INDEX IF NOT EXISTS idx_commission_wallet_ledger_source
  ON commission_wallet_ledger(source_type,source_id);

-- Import existing commissions exactly as their current bucket state.
INSERT INTO commission_wallet_ledger(
  entry_key,beneficiary_user_id,commission_id,event_type,
  pending_delta_satang,available_delta_satang,paid_delta_satang,
  currency,source_type,source_id,level,rate_bps,metadata,created_at
)
SELECT
  'migration:' || rc.id::text,
  rc.beneficiary_user_id,
  rc.id,
  'MIGRATION_SNAPSHOT',
  CASE WHEN rc.status='PENDING' THEN rc.commission_amount_satang ELSE 0 END,
  CASE WHEN rc.status='AVAILABLE' THEN rc.commission_amount_satang ELSE 0 END,
  CASE WHEN rc.status='PAID' THEN rc.commission_amount_satang ELSE 0 END,
  rc.currency,
  rc.source_type,
  rc.source_id,
  rc.level,
  rc.rate_bps,
  jsonb_build_object(
    'importedStatus',rc.status,
    'availableAt',rc.available_at,
    'source','referral_commissions'
  ),
  rc.created_at
FROM referral_commissions rc
WHERE rc.status<>'VOID'
ON CONFLICT(entry_key) DO NOTHING;

-- Ledger rows are immutable at the application database layer.
CREATE OR REPLACE FUNCTION reject_commission_wallet_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'commission_wallet_ledger is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_commission_wallet_ledger_immutable
  ON commission_wallet_ledger;

CREATE TRIGGER trg_commission_wallet_ledger_immutable
BEFORE UPDATE OR DELETE ON commission_wallet_ledger
FOR EACH ROW
EXECUTE FUNCTION reject_commission_wallet_ledger_mutation();
