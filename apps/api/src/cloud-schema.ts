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
CREATE TABLE IF NOT EXISTS runtime_migrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
 source_slot_id uuid NOT NULL REFERENCES license_slots(id) ON DELETE RESTRICT,
 target_slot_id uuid NOT NULL REFERENCES license_slots(id) ON DELETE RESTRICT,
 source_mode varchar(16) NOT NULL CHECK (source_mode IN ('LOCAL','CLOUD')),
 target_mode varchar(16) NOT NULL CHECK (target_mode IN ('LOCAL','CLOUD')),
 state text NOT NULL CHECK (state IN ('REQUESTED','STOPPING_LOCAL','STOPPING_CLOUD','SOURCE_STOP_CONFIRMED','TARGET_PROVISIONING','WAITING_LOCAL_INSTALL','COMPLETED','FAILED','CANCELLED')),
 execution_generation bigint NOT NULL,
 source_runner_id varchar(120),
 target_runner_id varchar(120),
 source_stop_confirmed_at timestamptz,
 lease_rotated_at timestamptz,
 target_ready_at timestamptz,
 error_code varchar(64),
 error_detail varchar(240),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (source_mode<>target_mode),
 CHECK (source_slot_id<>target_slot_id)
);
ALTER TABLE runtime_migrations ALTER COLUMN state TYPE text USING state::text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_migration_one_active
 ON runtime_migrations(bot_instance_id)
 WHERE state NOT IN ('COMPLETED','FAILED','CANCELLED');
CREATE INDEX IF NOT EXISTS idx_runtime_migration_user_created
 ON runtime_migrations(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_migration_target_slot
 ON runtime_migrations(target_slot_id,state);
CREATE OR REPLACE FUNCTION scenova_block_start_during_runtime_migration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
 IF NEW.desired_state='RUNNING'
    AND OLD.desired_state IS DISTINCT FROM 'RUNNING'
    AND EXISTS (
      SELECT 1 FROM runtime_migrations rm
      WHERE rm.bot_instance_id=NEW.id
        AND rm.state NOT IN ('COMPLETED','FAILED','CANCELLED')
    ) THEN
   RAISE EXCEPTION 'runtime migration is active for this bot instance' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_block_start_during_runtime_migration ON bot_instances;
CREATE TRIGGER trg_block_start_during_runtime_migration
BEFORE UPDATE OF desired_state ON bot_instances
FOR EACH ROW
EXECUTE FUNCTION scenova_block_start_during_runtime_migration();
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
