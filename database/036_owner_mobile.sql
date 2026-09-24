-- SCENOVA Owner Mobile + Omise owner transfer
CREATE TABLE IF NOT EXISTS owner_mobile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id varchar(180) NOT NULL,
  device_name varchar(120),
  pin_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  failed_pin_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(owner_user_id,device_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_mobile_devices_owner
  ON owner_mobile_devices(owner_user_id,status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_mobile_one_active_device
  ON owner_mobile_devices(owner_user_id)
  WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS owner_mobile_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_row_id uuid NOT NULL REFERENCES owner_mobile_devices(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_owner_mobile_sessions_active
  ON owner_mobile_sessions(owner_user_id,expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS owner_omise_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_satang integer NOT NULL CHECK(amount_satang > 0),
  currency varchar(8) NOT NULL DEFAULT 'THB',
  status varchar(20) NOT NULL DEFAULT 'CREATING'
    CHECK(status IN ('CREATING','SUBMITTED','SUCCEEDED','FAILED','REVIEW')),
  client_request_key varchar(100) NOT NULL UNIQUE,
  omise_transfer_id varchar(180) UNIQUE,
  provider_status varchar(80),
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_ip varchar(96),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_omise_transfers_recent
  ON owner_omise_transfers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_omise_transfers_incomplete
  ON owner_omise_transfers(status,created_at)
  WHERE status IN ('CREATING','SUBMITTED','REVIEW');
