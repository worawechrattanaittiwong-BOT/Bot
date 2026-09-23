CREATE TABLE IF NOT EXISTS trial_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  duration_minutes integer NOT NULL DEFAULT 1440,
  status varchar(24) NOT NULL DEFAULT 'PENDING_BIND',
  approved_by varchar(120),
  approved_at timestamptz NOT NULL DEFAULT now(),
  claimed_mt5_account_id uuid REFERENCES mt5_accounts(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  blocked_reason varchar(80),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_authorizations_status
  ON trial_authorizations(status,updated_at DESC);
