ALTER TABLE admin_api_credentials
  ADD COLUMN IF NOT EXISTS provider varchar(140) NOT NULL DEFAULT '';

ALTER TABLE admin_api_credentials
  ADD COLUMN IF NOT EXISTS test_url text NOT NULL DEFAULT '';

ALTER TABLE admin_api_credentials
  ADD COLUMN IF NOT EXISTS auth_mode varchar(32) NOT NULL DEFAULT 'BEARER';

ALTER TABLE admin_api_credentials
  ADD COLUMN IF NOT EXISTS header_name varchar(80) NOT NULL DEFAULT '';

ALTER TABLE admin_api_credentials
  ADD COLUMN IF NOT EXISTS last_test_status varchar(16) NOT NULL DEFAULT '';

ALTER TABLE admin_api_credentials
  ADD COLUMN IF NOT EXISTS last_test_detail text NOT NULL DEFAULT '';

ALTER TABLE admin_api_credentials
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz;
