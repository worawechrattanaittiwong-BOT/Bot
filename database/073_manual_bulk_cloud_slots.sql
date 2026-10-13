-- Manual multi-slot request: independent of legacy checkout and its order tables.
CREATE TABLE IF NOT EXISTS cloud_bulk_discount_tiers (
  quantity integer PRIMARY KEY CHECK (quantity IN (5,10,20)),
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent BETWEEN 0 AND 90),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cloud_bulk_discount_tiers(quantity,discount_percent)
VALUES (5,10),(10,15),(20,25) ON CONFLICT (quantity) DO NOTHING;

CREATE TABLE IF NOT EXISTS cloud_bulk_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  customer_user_id uuid NOT NULL REFERENCES users(id),
  quantity integer NOT NULL CHECK (quantity IN (5,10,20)),
  months integer NOT NULL CHECK (months IN (1,3,6,12)),
  unit_price_usd_cents integer NOT NULL CHECK (unit_price_usd_cents >= 0),
  discount_percent numeric(5,2) NOT NULL,
  total_price_usd_cents integer NOT NULL CHECK (total_price_usd_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_bulk_grants_customer ON cloud_bulk_grants(customer_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS cloud_bulk_grant_slots (
  grant_id uuid NOT NULL REFERENCES cloud_bulk_grants(id),
  slot_id uuid PRIMARY KEY REFERENCES license_slots(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cloud_bulk_grant_slots_grant ON cloud_bulk_grant_slots(grant_id);
