// Applied once per API startup; additive and safe for existing installations.
export const CLOUD_SCHEMA = `
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS provisioning_error text;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS execution_generation bigint NOT NULL DEFAULT 1;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS lease_rotated_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS runtime_stop_state varchar(24) NOT NULL DEFAULT 'NONE';
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS runtime_stop_requested_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS runtime_stop_confirmed_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS runtime_stop_error varchar(64);
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS accepting_jobs boolean NOT NULL DEFAULT false;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS worker_key_hash text;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS monthly_cost integer NOT NULL DEFAULT 0;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS spec text NOT NULL DEFAULT '';
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS telemetry jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS cloud_packages (
 months integer PRIMARY KEY CHECK(months IN (1,3,6,12)),
 price_satang integer NOT NULL DEFAULT 0 CHECK(price_satang>=0),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cloud_packages(months) VALUES(1),(3),(6),(12) ON CONFLICT DO NOTHING;
INSERT INTO plans(code,name_th,mode,max_mt5_accounts)
 VALUES ('CLOUD_1M','Cloud 1 เดือน','CLOUD',1),('CLOUD_3M','Cloud 3 เดือน','CLOUD',1),
 ('CLOUD_6M','Cloud 6 เดือน','CLOUD',1),('CLOUD_12M','Cloud 12 เดือน','CLOUD',1)
 ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS cloud_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 months integer NOT NULL REFERENCES cloud_packages(months),
 amount integer NOT NULL CHECK(amount>0),
 status text NOT NULL DEFAULT 'CREATING' CHECK(status IN ('CREATING','PENDING','PAID','FAILED','REVIEW')),
 runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id),
 slot_id uuid REFERENCES license_slots(id),
 subscription_id uuid REFERENCES subscriptions(id),
 charge_id text UNIQUE,
 qr_url text,
 expires_at timestamptz,
 paid_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cloud_order_user_pending ON cloud_orders(user_id)
 WHERE status IN ('CREATING','PENDING','REVIEW');
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS checked_at timestamptz;
CREATE TABLE IF NOT EXISTS worker_commands (
 id bigserial PRIMARY KEY,
 runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id) ON DELETE CASCADE,
 bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
 execution_generation bigint NOT NULL,
 command varchar(32) NOT NULL CHECK (command IN ('STOP_INSTANCE')),
 status varchar(20) NOT NULL DEFAULT 'PENDING'
   CHECK (status IN ('PENDING','DELIVERED','ACKED','FAILED','CANCELLED')),
 result_code varchar(64),
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 acked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_worker_commands_runner_pending
 ON worker_commands(runner_id,status,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_stop_one_active
 ON worker_commands(bot_instance_id,command)
 WHERE status IN ('PENDING','DELIVERED');
CREATE OR REPLACE VIEW cloud_node_load AS
 SELECT w.runner_id, count(s.seat)::int occupied FROM worker_nodes w
 LEFT JOIN (
   SELECT runner_id,COALESCE(slot_id::text,id::text) seat FROM cloud_orders
   WHERE status IN ('CREATING','PENDING','PAID','REVIEW')
   UNION
   SELECT runner_id,COALESCE(slot_id::text,id::text) seat FROM bot_instances
   WHERE mode='CLOUD' AND runner_id IS NOT NULL
 ) s ON s.runner_id=w.runner_id GROUP BY w.runner_id;
`;
