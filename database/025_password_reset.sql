CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  requested_by varchar(160),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_created
  ON password_reset_tokens(user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_active
  ON password_reset_tokens(token_hash,expires_at)
  WHERE consumed_at IS NULL;
