BEGIN;

-- Multi-slot add-on checkout.
-- A customer can buy several VPS add-on slots in one payment. The paid parent
-- order keeps the financial amount, while zero-value child orders represent
-- the additional slots so existing worker/runtime ownership queries continue
-- to work per slot without changing their safety semantics.
ALTER TABLE cloud_orders
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS runner_allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES cloud_orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS bundle_index integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='cloud_orders_quantity_check'
  ) THEN
    ALTER TABLE cloud_orders
      ADD CONSTRAINT cloud_orders_quantity_check
      CHECK (quantity BETWEEN 1 AND 10);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_order_bundle_child
  ON cloud_orders(parent_order_id,bundle_index)
  WHERE parent_order_id IS NOT NULL;

UPDATE cloud_orders
SET runner_allocations=jsonb_build_array(runner_id)
WHERE jsonb_array_length(COALESCE(runner_allocations,'[]'::jsonb))=0
  AND runner_id IS NOT NULL;

COMMIT;
