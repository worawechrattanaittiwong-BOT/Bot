ALTER TABLE production_controls
  ADD COLUMN IF NOT EXISTS sales_paused boolean NOT NULL DEFAULT false;
