CREATE TABLE IF NOT EXISTS admin_api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key varchar(96) NOT NULL UNIQUE,
  category varchar(32) NOT NULL DEFAULT 'OTHER',
  label varchar(140) NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  last_four varchar(8) NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  updated_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_api_credentials_category
  ON admin_api_credentials(category,updated_at DESC);
