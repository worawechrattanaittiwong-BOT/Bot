CREATE TABLE IF NOT EXISTS user_phone_numbers (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  country_code varchar(8) NOT NULL,
  national_number varchar(24) NOT NULL,
  e164 varchar(24) NOT NULL UNIQUE,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_phone_verified
  ON user_phone_numbers(verified_at)
  WHERE verified_at IS NOT NULL;
