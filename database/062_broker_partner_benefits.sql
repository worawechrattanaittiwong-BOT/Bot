BEGIN;

-- Phase 2: manual Exness Partner verification + SCENOVA Benefit levels.
-- This is additive only. Existing Trading/Cloud/Local/EA/Subscription flows are
-- not rewritten; checkout reads the benefit opportunistically and fails open.

CREATE TABLE IF NOT EXISTS broker_benefit_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  code varchar(32) NOT NULL,
  name varchar(80) NOT NULL,
  discount_bps integer NOT NULL DEFAULT 0
    CHECK (discount_bps BETWEEN 0 AND 5000),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(broker_id,code)
);

CREATE TABLE IF NOT EXISTS broker_partner_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(24) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','VERIFIED','NOT_LINKED','SUSPENDED')),
  benefit_level_id uuid REFERENCES broker_benefit_levels(id) ON DELETE SET NULL,
  verification_source varchar(24) NOT NULL DEFAULT 'MANUAL'
    CHECK (verification_source IN ('MANUAL','API')),
  external_client_ref varchar(180),
  note text NOT NULL DEFAULT '',
  verified_at timestamptz,
  verified_by varchar(160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(broker_id,user_id)
);

CREATE INDEX IF NOT EXISTS idx_broker_partner_clients_status
  ON broker_partner_clients(broker_id,status,updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_broker_partner_clients_user
  ON broker_partner_clients(user_id,updated_at DESC);

INSERT INTO broker_benefit_levels(broker_id,code,name,discount_bps,sort_order)
SELECT id,'STANDARD','Standard',1000,10 FROM brokers WHERE code='EXNESS'
ON CONFLICT(broker_id,code) DO UPDATE SET
  name=EXCLUDED.name,discount_bps=EXCLUDED.discount_bps,sort_order=EXCLUDED.sort_order;

INSERT INTO broker_benefit_levels(broker_id,code,name,discount_bps,sort_order)
SELECT id,'PLUS','Plus',2000,20 FROM brokers WHERE code='EXNESS'
ON CONFLICT(broker_id,code) DO UPDATE SET
  name=EXCLUDED.name,discount_bps=EXCLUDED.discount_bps,sort_order=EXCLUDED.sort_order;

INSERT INTO broker_benefit_levels(broker_id,code,name,discount_bps,sort_order)
SELECT id,'VIP','VIP',3000,30 FROM brokers WHERE code='EXNESS'
ON CONFLICT(broker_id,code) DO UPDATE SET
  name=EXCLUDED.name,discount_bps=EXCLUDED.discount_bps,sort_order=EXCLUDED.sort_order;

ALTER TABLE local_orders
  ADD COLUMN IF NOT EXISTS discount_source varchar(24) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS broker_partner_client_id uuid REFERENCES broker_partner_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_benefit_level varchar(32),
  ADD COLUMN IF NOT EXISTS broker_benefit_discount_bps integer NOT NULL DEFAULT 0;

ALTER TABLE cloud_orders
  ADD COLUMN IF NOT EXISTS discount_source varchar(24) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS broker_partner_client_id uuid REFERENCES broker_partner_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_benefit_level varchar(32),
  ADD COLUMN IF NOT EXISTS broker_benefit_discount_bps integer NOT NULL DEFAULT 0;

COMMIT;
