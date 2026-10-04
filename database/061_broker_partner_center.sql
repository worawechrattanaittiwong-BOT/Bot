BEGIN;

-- Phase 1: Broker Center / Exness Partner Link configuration.
-- This migration is intentionally isolated from MT5 execution, subscriptions,
-- SCENOVA Partner Seats, Invite & Earn, and trading runtime tables.

INSERT INTO brokers(code,name,active,sort_order)
VALUES('EXNESS','Exness',true,10)
ON CONFLICT(code) DO NOTHING;

CREATE TABLE IF NOT EXISTS broker_partner_settings (
  broker_id uuid PRIMARY KEY REFERENCES brokers(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT false,
  partner_code varchar(120) NOT NULL DEFAULT '',
  web_partner_link text NOT NULL DEFAULT '',
  mobile_partner_link text NOT NULL DEFAULT '',
  updated_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broker_registration_clicks (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  platform varchar(16) NOT NULL
    CHECK (platform IN ('WEB','MOBILE')),
  source varchar(64) NOT NULL DEFAULT 'BROKER_CENTER',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broker_registration_clicks_broker
  ON broker_registration_clicks(broker_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broker_registration_clicks_user
  ON broker_registration_clicks(user_id,created_at DESC)
  WHERE user_id IS NOT NULL;

INSERT INTO broker_partner_settings(broker_id)
SELECT id
FROM brokers
WHERE code='EXNESS'
ON CONFLICT(broker_id) DO NOTHING;

COMMIT;
