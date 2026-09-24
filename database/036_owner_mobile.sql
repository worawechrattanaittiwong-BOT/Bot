-- SCENOVA Owner Mobile: device-bound PIN sessions and Owner Omise transfer ledger.
-- The API also runs these statements idempotently on bootstrap so existing installs can upgrade safely.

CREATE TABLE IF NOT EXISTS owner_mobile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id_hash char(64) NOT NULL UNIQUE,
  device_name varchar(160) NOT NULL,
  device_secret_hash char(64) NOT NULL,
  pin_hash text NOT NULL,
  failed_pin_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_unlocked_at timestamptz,
  last_seen_at timestamptz,
  disabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_mobile_devices_user
  ON owner_mobile_devices(user_id,disabled_at,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS owner_omise_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES owner_mobile_devices(id) ON DELETE RESTRICT,
  client_request_key varchar(100) NOT NULL,
  amount_satang integer NOT NULL CHECK(amount_satang>0),
  currency varchar(8) NOT NULL DEFAULT 'THB',
  status varchar(20) NOT NULL DEFAULT 'CREATING'
    CHECK(status IN ('CREATING','SUBMITTED','SENT','FAILED','REVIEW')),
  provider_transfer_id varchar(180),
  provider_status varchar(80),
  failure_code varchar(120),
  failure_message text,
  request_ip varchar(96),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id,client_request_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_omise_transfer_provider
  ON owner_omise_transfers(provider_transfer_id)
  WHERE provider_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_owner_omise_transfer_recent
  ON owner_omise_transfers(created_at DESC);
