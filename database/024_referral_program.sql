-- SCENOVA Referral Program
-- Four-level invite rewards: L1 7%, L2 5%, L3 3%, L4 1%.
-- Commission is only created from a recorded paid sale amount. Trials and
-- internal Partner Seat allocations do not create commission.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code varchar(40),
  ADD COLUMN IF NOT EXISTS referred_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at timestamptz;

UPDATE users
SET referral_code='SCN-' || upper(regexp_replace(user_code,'^BOT-','','i'))
WHERE referral_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique
  ON users(lower(referral_code))
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_referred_by
  ON users(referred_by_user_id,created_at DESC)
  WHERE referred_by_user_id IS NOT NULL;

DO $referral_self_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='users_referral_not_self'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_referral_not_self
      CHECK (referred_by_user_id IS NULL OR referred_by_user_id<>id);
  END IF;
END
$referral_self_guard$;

CREATE TABLE IF NOT EXISTS referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_type varchar(40) NOT NULL,
  source_id uuid NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 4),
  rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  gross_amount_satang integer NOT NULL CHECK (gross_amount_satang>0),
  commission_amount_satang integer NOT NULL CHECK (commission_amount_satang>=0),
  currency varchar(8) NOT NULL DEFAULT 'THB',
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','AVAILABLE','PAID','VOID')),
  available_at timestamptz NOT NULL,
  paid_at timestamptz,
  payout_reference varchar(160),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type,source_id,beneficiary_user_id,level)
);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_beneficiary
  ON referral_commissions(beneficiary_user_id,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_source
  ON referral_commissions(source_user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_available
  ON referral_commissions(status,available_at)
  WHERE status IN ('PENDING','AVAILABLE');
