DO $email_verification$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='users'
      AND column_name='email_verified_at'
  ) THEN
    ALTER TABLE users
      ADD COLUMN email_verified_at timestamptz DEFAULT now();
    ALTER TABLE users
      ALTER COLUMN email_verified_at DROP DEFAULT;
  END IF;
END
$email_verification$;

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  request_ip varchar(96),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user_sent
  ON email_verification_codes(user_id,sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verification_active
  ON email_verification_codes(user_id,expires_at DESC)
  WHERE consumed_at IS NULL;
