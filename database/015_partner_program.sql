-- Partner Program v2: Partner capacity is separate from customer membership.
-- Existing legacy PARTNER_LOCAL_* plans are retired from new sales but kept for history.
UPDATE plans
SET active=false
WHERE code IN ('PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50');

CREATE TABLE IF NOT EXISTS partner_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'READY'
    CHECK (status IN ('READY','ACTIVE','SUSPENDED','EXPIRED')),
  seat_limit integer NOT NULL CHECK (seat_limit BETWEEN 1 AND 500),
  customer_duration_days integer NOT NULL DEFAULT 30
    CHECK (customer_duration_days BETWEEN 1 AND 3660),
  partner_duration_days integer NOT NULL DEFAULT 30
    CHECK (partner_duration_days BETWEEN 1 AND 3660),
  granted_at timestamptz NOT NULL DEFAULT now(),
  activation_deadline_at timestamptz NOT NULL,
  activated_at timestamptz,
  expires_at timestamptz,
  created_by varchar(120) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_accounts_status
  ON partner_accounts(status,expires_at,activation_deadline_at);

CREATE TABLE IF NOT EXISTS partner_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id uuid NOT NULL REFERENCES partner_accounts(user_id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','EXPIRED','DIRECT','REVOKED')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_customers_partner
  ON partner_customers(partner_user_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_partner_customers_customer
  ON partner_customers(customer_user_id,status,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_customer_one_active
  ON partner_customers(customer_user_id)
  WHERE status='ACTIVE';
