CREATE TABLE IF NOT EXISTS promotion_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(20) NOT NULL UNIQUE,
  discount_percent integer NOT NULL CHECK(discount_percent BETWEEN 0 AND 100),
  usage_limit integer NOT NULL CHECK(usage_limit BETWEEN 1 AND 1000000),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK(per_user_limit BETWEEN 1 AND 1000),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  applies_to_all_packages boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS promotion_package_rules (
  promotion_id uuid NOT NULL REFERENCES promotion_codes(id) ON DELETE CASCADE,
  mode varchar(16) NOT NULL CHECK(mode IN ('LOCAL','CLOUD')),
  months integer NOT NULL CHECK(months IN (1,3,6,12)),
  PRIMARY KEY(promotion_id,mode,months)
);

CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotion_codes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purchase_type varchar(16) NOT NULL CHECK(purchase_type IN ('LOCAL','CLOUD')),
  months integer NOT NULL CHECK(months IN (1,3,6,12)),
  order_id uuid,
  original_amount_satang integer NOT NULL CHECK(original_amount_satang >= 0),
  discount_amount_satang integer NOT NULL CHECK(discount_amount_satang >= 0),
  final_amount_satang integer NOT NULL CHECK(final_amount_satang >= 0),
  status varchar(16) NOT NULL DEFAULT 'RESERVED'
    CHECK(status IN ('RESERVED','USED','RELEASED','CANCELLED')),
  reserved_until timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_codes_active
  ON promotion_codes(active,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_promo
  ON promotion_redemptions(promotion_id,status,reserved_until);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_user
  ON promotion_redemptions(user_id,promotion_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_redemption_order
  ON promotion_redemptions(purchase_type,order_id)
  WHERE order_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.local_orders') IS NOT NULL THEN
    ALTER TABLE local_orders DROP CONSTRAINT IF EXISTS local_orders_amount_check;
    ALTER TABLE local_orders ADD CONSTRAINT local_orders_amount_check CHECK(amount >= 0);
    ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS original_amount integer;
    ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0;
    ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS promotion_code varchar(20);
    ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS promotion_redemption_id uuid REFERENCES promotion_redemptions(id) ON DELETE SET NULL;
    UPDATE local_orders SET original_amount=amount WHERE original_amount IS NULL;
    ALTER TABLE local_orders ALTER COLUMN original_amount SET NOT NULL;
    ALTER TABLE local_orders ALTER COLUMN original_amount SET DEFAULT 0;
  END IF;

  IF to_regclass('public.cloud_orders') IS NOT NULL THEN
    ALTER TABLE cloud_orders DROP CONSTRAINT IF EXISTS cloud_orders_amount_check;
    ALTER TABLE cloud_orders ADD CONSTRAINT cloud_orders_amount_check CHECK(amount >= 0);
    ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS original_amount integer;
    ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0;
    ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS promotion_code varchar(20);
    ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS promotion_redemption_id uuid REFERENCES promotion_redemptions(id) ON DELETE SET NULL;
    UPDATE cloud_orders SET original_amount=amount WHERE original_amount IS NULL;
    ALTER TABLE cloud_orders ALTER COLUMN original_amount SET NOT NULL;
    ALTER TABLE cloud_orders ALTER COLUMN original_amount SET DEFAULT 0;
  END IF;
END $$;
