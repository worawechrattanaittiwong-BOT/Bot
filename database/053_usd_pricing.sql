BEGIN;

ALTER TABLE cloud_packages ADD COLUMN IF NOT EXISTS price_usd_cents integer CHECK(price_usd_cents>=0);
UPDATE cloud_packages
SET price_usd_cents=CASE months
  WHEN 1 THEN 2050
  WHEN 3 THEN 5625
  WHEN 6 THEN 10390
  WHEN 12 THEN 17825
  ELSE 0
END
WHERE price_usd_cents IS NULL;
ALTER TABLE cloud_packages ALTER COLUMN price_usd_cents SET DEFAULT 0;
ALTER TABLE cloud_packages ALTER COLUMN price_usd_cents SET NOT NULL;

ALTER TABLE cloud_addon_packages ADD COLUMN IF NOT EXISTS price_usd_cents integer CHECK(price_usd_cents>=0);
UPDATE cloud_addon_packages
SET price_usd_cents=CASE months
  WHEN 1 THEN 860
  WHEN 3 THEN 2350
  WHEN 6 THEN 4430
  WHEN 12 THEN 7410
  ELSE 0
END
WHERE price_usd_cents IS NULL;
ALTER TABLE cloud_addon_packages ALTER COLUMN price_usd_cents SET DEFAULT 0;
ALTER TABLE cloud_addon_packages ALTER COLUMN price_usd_cents SET NOT NULL;

ALTER TABLE local_packages ADD COLUMN IF NOT EXISTS price_usd_cents integer CHECK(price_usd_cents>=0);
UPDATE local_packages
SET price_usd_cents=ROUND(price_satang::numeric / 33.60)::integer
WHERE price_usd_cents IS NULL;
ALTER TABLE local_packages ALTER COLUMN price_usd_cents SET DEFAULT 0;
ALTER TABLE local_packages ALTER COLUMN price_usd_cents SET NOT NULL;

ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS list_price_usd_cents integer CHECK(list_price_usd_cents>=0);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS final_price_usd_cents integer CHECK(final_price_usd_cents>=0);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS fx_rate_usd_thb numeric(12,6);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS fx_source varchar(40);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS fx_quoted_at timestamptz;

ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS list_price_usd_cents integer CHECK(list_price_usd_cents>=0);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS final_price_usd_cents integer CHECK(final_price_usd_cents>=0);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS fx_rate_usd_thb numeric(12,6);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS fx_source varchar(40);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS fx_quoted_at timestamptz;

COMMIT;
