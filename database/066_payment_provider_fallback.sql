ALTER TABLE cloud_orders
  ADD COLUMN IF NOT EXISTS payment_provider varchar(32);

ALTER TABLE local_orders
  ADD COLUMN IF NOT EXISTS payment_provider varchar(32);
