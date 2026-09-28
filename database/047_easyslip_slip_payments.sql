CREATE TABLE IF NOT EXISTS payment_slip_claims (
  trans_ref varchar(180) PRIMARY KEY,
  provider varchar(32) NOT NULL DEFAULT 'EASYSLIP',
  order_type varchar(16) NOT NULL CHECK (order_type IN ('LOCAL','CLOUD')),
  order_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount_satang bigint NOT NULL CHECK (amount_satang >= 0),
  slip_date timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_type, order_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_slip_claims_user
  ON payment_slip_claims(user_id, verified_at DESC);
