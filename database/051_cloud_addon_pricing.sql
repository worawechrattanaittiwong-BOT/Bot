BEGIN;

CREATE TABLE IF NOT EXISTS cloud_addon_packages (
  months integer PRIMARY KEY CHECK(months IN (1,3,6,12)),
  price_satang integer NOT NULL DEFAULT 0 CHECK(price_satang>=0),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO cloud_addon_packages(months,price_satang,enabled)
SELECT months,price_satang,enabled
FROM cloud_packages
ON CONFLICT(months) DO NOTHING;

ALTER TABLE cloud_orders
  ADD COLUMN IF NOT EXISTS purchase_type varchar(16) NOT NULL DEFAULT 'PACKAGE';

UPDATE cloud_orders o
SET purchase_type=CASE
  WHEN EXISTS (
    SELECT 1 FROM license_slots ls
    WHERE ls.id=o.slot_id AND ls.mode='CLOUD' AND ls.slot_type='ADDON'
  ) THEN 'ADDON'
  ELSE 'PACKAGE'
END
WHERE purchase_type NOT IN ('PACKAGE','ADDON')
   OR purchase_type IS NULL
   OR (
     purchase_type='PACKAGE'
     AND EXISTS (
       SELECT 1 FROM license_slots ls
       WHERE ls.id=o.slot_id AND ls.mode='CLOUD' AND ls.slot_type='ADDON'
     )
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='cloud_orders_purchase_type_check'
  ) THEN
    ALTER TABLE cloud_orders
      ADD CONSTRAINT cloud_orders_purchase_type_check
      CHECK (purchase_type IN ('PACKAGE','ADDON'));
  END IF;
END $$;

COMMIT;
