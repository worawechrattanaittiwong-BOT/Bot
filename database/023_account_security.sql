CREATE TABLE IF NOT EXISTS user_security (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_ciphertext text,
  totp_secret_iv text,
  totp_secret_auth_tag text,
  two_factor_enabled_at timestamptz,
  recovery_code_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_password_changed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    two_factor_enabled_at IS NULL OR
    (totp_secret_ciphertext IS NOT NULL AND totp_secret_iv IS NOT NULL AND totp_secret_auth_tag IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS two_factor_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  request_ip varchar(96),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_challenge_user_created
  ON two_factor_login_challenges(user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_two_factor_challenge_active
  ON two_factor_login_challenges(token_hash,expires_at)
  WHERE consumed_at IS NULL;
