ALTER TABLE trial_grants
  DROP CONSTRAINT IF EXISTS trial_grants_mt5_account_id_fkey;

ALTER TABLE trial_grants
  ALTER COLUMN mt5_account_id DROP NOT NULL;

ALTER TABLE trial_grants
  ADD CONSTRAINT trial_grants_mt5_account_id_fkey
  FOREIGN KEY (mt5_account_id)
  REFERENCES mt5_accounts(id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_identity_case_insensitive
ON trial_grants(lower(account_number), lower(broker_server));
