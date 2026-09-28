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

COMMIT;
