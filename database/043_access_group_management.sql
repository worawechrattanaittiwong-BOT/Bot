ALTER TABLE access_groups
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 1;

ALTER TABLE access_groups
  DROP CONSTRAINT IF EXISTS access_groups_trial_days_check;

ALTER TABLE access_groups
  ADD CONSTRAINT access_groups_trial_days_check
  CHECK (trial_days BETWEEN 1 AND 365);
