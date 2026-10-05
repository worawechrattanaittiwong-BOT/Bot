ALTER TABLE mt5_accounts
  ADD COLUMN IF NOT EXISTS display_name varchar(80);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mt5_account_display_name_user
  ON mt5_accounts(user_id, lower(display_name))
  WHERE display_name IS NOT NULL;
