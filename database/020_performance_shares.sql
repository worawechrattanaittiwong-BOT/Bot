CREATE TABLE IF NOT EXISTS performance_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mt5_account_id uuid REFERENCES mt5_accounts(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  public_slug varchar(96) NOT NULL UNIQUE,
  from_at timestamptz NOT NULL,
  to_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_performance_shares_owner_created
  ON performance_shares(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_shares_account_created
  ON performance_shares(mt5_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_performance_shares_public
  ON performance_shares(public_slug)
  WHERE is_active=true;
