ALTER TABLE trial_authorizations
  ADD COLUMN IF NOT EXISTS phone_hash text,
  ADD COLUMN IF NOT EXISTS phone_last4 varchar(4),
  ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'OWNER';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_authorizations_phone_unique
  ON trial_authorizations(phone_hash)
  WHERE phone_hash IS NOT NULL;

ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS device_fingerprint_hash text;

CREATE TABLE IF NOT EXISTS trial_sms_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_hash text NOT NULL,
  phone_last4 varchar(4) NOT NULL,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  request_ip varchar(96),
  sent_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_sms_user_created
  ON trial_sms_codes(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trial_sms_phone_created
  ON trial_sms_codes(phone_hash,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trial_sms_ip_created
  ON trial_sms_codes(request_ip,created_at DESC);

CREATE TABLE IF NOT EXISTS trial_identity_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trial_grant_id uuid REFERENCES trial_grants(id) ON DELETE SET NULL,
  phone_hash text,
  phone_last4 varchar(4),
  device_fingerprint_hash text,
  device_public_id varchar(160),
  mt5_account_id uuid REFERENCES mt5_accounts(id) ON DELETE SET NULL,
  account_number varchar(64),
  broker_server varchar(160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_identity_phone
  ON trial_identity_registry(phone_hash)
  WHERE phone_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_identity_device
  ON trial_identity_registry(device_fingerprint_hash)
  WHERE device_fingerprint_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_identity_mt5
  ON trial_identity_registry(lower(account_number),lower(broker_server))
  WHERE account_number IS NOT NULL AND broker_server IS NOT NULL;

