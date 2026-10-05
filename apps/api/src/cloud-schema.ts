// Applied once per API startup; additive and safe for existing installations.
export const CLOUD_SCHEMA = `
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS provisioning_error text;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS execution_generation bigint NOT NULL DEFAULT 1;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS lease_rotated_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS runtime_stop_state varchar(24) NOT NULL DEFAULT 'NONE';
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS runtime_stop_requested_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS runtime_stop_confirmed_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS runtime_stop_error varchar(64);
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS cloud_recovery_state varchar(24) NOT NULL DEFAULT 'IDLE';
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS cloud_recovery_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS cloud_recovery_window_started_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS cloud_recovery_next_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS cloud_recovery_last_at timestamptz;
ALTER TABLE bot_instances ADD COLUMN IF NOT EXISTS cloud_recovery_last_error varchar(64);
CREATE OR REPLACE FUNCTION scenova_clear_pre_recovery_heartbeat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
 IF NEW.cloud_recovery_state='AUTHORIZED'
    AND OLD.cloud_recovery_state IS DISTINCT FROM 'AUTHORIZED' THEN
   NEW.last_seen_at=NULL;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_clear_pre_recovery_heartbeat ON bot_instances;
CREATE TRIGGER trg_clear_pre_recovery_heartbeat
BEFORE UPDATE OF cloud_recovery_state ON bot_instances
FOR EACH ROW
EXECUTE FUNCTION scenova_clear_pre_recovery_heartbeat();
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS accepting_jobs boolean NOT NULL DEFAULT false;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS worker_key_hash text;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS monthly_cost integer NOT NULL DEFAULT 0;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS spec text NOT NULL DEFAULT '';
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS telemetry jsonb NOT NULL DEFAULT '{}';
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS health_state text NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE worker_nodes ALTER COLUMN health_state TYPE text USING health_state::text;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS capacity_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS capacity_block_reason varchar(64);
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS last_healthy_at timestamptz;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS quarantine_reason varchar(160);
ALTER TABLE worker_nodes ADD COLUMN IF NOT EXISTS recovery_paused boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_nodes_runner_id_ci
 ON worker_nodes(lower(runner_id));
CREATE TABLE IF NOT EXISTS cloud_server_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id) ON DELETE CASCADE,
 token_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 revoked_at timestamptz,
 created_by varchar(160),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_server_enrollment_active
 ON cloud_server_enrollments(runner_id)
 WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cloud_server_enrollment_expiry
 ON cloud_server_enrollments(expires_at)
 WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS production_controls (
 id smallint PRIMARY KEY CHECK(id=1),
 cloud_provisioning_paused boolean NOT NULL DEFAULT false,
 cloud_recovery_paused boolean NOT NULL DEFAULT false,
 sales_paused boolean NOT NULL DEFAULT false,
 reason varchar(240),
 updated_by varchar(120),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE production_controls
 ADD COLUMN IF NOT EXISTS sales_paused boolean NOT NULL DEFAULT false;
INSERT INTO production_controls(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS runtime_incidents (
 id bigserial PRIMARY KEY,
 incident_key varchar(220) NOT NULL,
 category varchar(48) NOT NULL,
 severity varchar(16) NOT NULL CHECK(severity IN ('INFO','WARN','CRITICAL')),
 runner_id varchar(120),
 bot_instance_id uuid REFERENCES bot_instances(id) ON DELETE CASCADE,
 state varchar(16) NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','RESOLVED')),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 opened_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_incident_open_key ON runtime_incidents(incident_key) WHERE state='OPEN';
CREATE INDEX IF NOT EXISTS idx_runtime_incident_recent ON runtime_incidents(state,severity,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_incident_instance ON runtime_incidents(bot_instance_id,last_seen_at DESC);
CREATE TABLE IF NOT EXISTS promotion_codes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code varchar(20) NOT NULL UNIQUE,
 discount_percent integer NOT NULL CHECK(discount_percent BETWEEN 0 AND 100),
 usage_limit integer NOT NULL CHECK(usage_limit BETWEEN 1 AND 1000000),
 per_user_limit integer NOT NULL DEFAULT 1 CHECK(per_user_limit BETWEEN 1 AND 1000),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 applies_to_all_packages boolean NOT NULL DEFAULT true,
 active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS promotion_package_rules (
 promotion_id uuid NOT NULL REFERENCES promotion_codes(id) ON DELETE CASCADE,
 mode varchar(16) NOT NULL CHECK(mode IN ('LOCAL','CLOUD')),
 months integer NOT NULL CHECK(months IN (1,3,6,12)),
 PRIMARY KEY(promotion_id,mode,months)
);
CREATE TABLE IF NOT EXISTS promotion_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 promotion_id uuid NOT NULL REFERENCES promotion_codes(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 purchase_type varchar(16) NOT NULL CHECK(purchase_type IN ('LOCAL','CLOUD')),
 months integer NOT NULL CHECK(months IN (1,3,6,12)),
 order_id uuid,
 original_amount_satang integer NOT NULL CHECK(original_amount_satang >= 0),
 discount_amount_satang integer NOT NULL CHECK(discount_amount_satang >= 0),
 final_amount_satang integer NOT NULL CHECK(final_amount_satang >= 0),
 status varchar(16) NOT NULL DEFAULT 'RESERVED'
   CHECK(status IN ('RESERVED','USED','RELEASED','CANCELLED')),
 reserved_until timestamptz,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotion_codes_active
 ON promotion_codes(active,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_promo
 ON promotion_redemptions(promotion_id,status,reserved_until);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_user
 ON promotion_redemptions(user_id,promotion_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_redemption_order
 ON promotion_redemptions(purchase_type,order_id)
 WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cloud_packages (
 months integer PRIMARY KEY CHECK(months IN (1,3,6,12)),
 price_satang integer NOT NULL DEFAULT 0 CHECK(price_satang>=0),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cloud_packages(months) VALUES(1),(3),(6),(12) ON CONFLICT DO NOTHING;
ALTER TABLE cloud_packages ADD COLUMN IF NOT EXISTS price_usd_cents integer CHECK(price_usd_cents>=0);
UPDATE cloud_packages
SET price_usd_cents=CASE months
  WHEN 1 THEN 2050
  WHEN 3 THEN 5625
  WHEN 6 THEN 10390
  WHEN 12 THEN 17825
  ELSE 0
END
WHERE price_usd_cents IS NULL;
ALTER TABLE cloud_packages ALTER COLUMN price_usd_cents SET DEFAULT 0;
ALTER TABLE cloud_packages ALTER COLUMN price_usd_cents SET NOT NULL;
CREATE TABLE IF NOT EXISTS cloud_addon_packages (
 months integer PRIMARY KEY CHECK(months IN (1,3,6,12)),
 price_satang integer NOT NULL DEFAULT 0 CHECK(price_satang>=0),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cloud_addon_packages(months,price_satang,enabled)
SELECT months,price_satang,enabled FROM cloud_packages
ON CONFLICT(months) DO NOTHING;
ALTER TABLE cloud_addon_packages ADD COLUMN IF NOT EXISTS price_usd_cents integer CHECK(price_usd_cents>=0);
UPDATE cloud_addon_packages
SET price_usd_cents=CASE months
  WHEN 1 THEN 860
  WHEN 3 THEN 2350
  WHEN 6 THEN 4430
  WHEN 12 THEN 7410
  ELSE 0
END
WHERE price_usd_cents IS NULL;
ALTER TABLE cloud_addon_packages ALTER COLUMN price_usd_cents SET DEFAULT 0;
ALTER TABLE cloud_addon_packages ALTER COLUMN price_usd_cents SET NOT NULL;
INSERT INTO plans(code,name_th,mode,max_mt5_accounts)
 VALUES ('CLOUD_1M','Cloud 1 เดือน','CLOUD',1),('CLOUD_3M','Cloud 3 เดือน','CLOUD',1),
 ('CLOUD_6M','Cloud 6 เดือน','CLOUD',1),('CLOUD_12M','Cloud 12 เดือน','CLOUD',1)
 ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS cloud_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 months integer NOT NULL REFERENCES cloud_packages(months),
 amount integer NOT NULL CHECK(amount>=0),
 original_amount integer NOT NULL DEFAULT 0 CHECK(original_amount>=0),
 discount_amount integer NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
 promotion_code varchar(20),
 promotion_redemption_id uuid REFERENCES promotion_redemptions(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'CREATING' CHECK(status IN ('CREATING','PENDING','PAID','FAILED','REVIEW')),
 purchase_type varchar(16) NOT NULL DEFAULT 'PACKAGE' CHECK(purchase_type IN ('PACKAGE','ADDON')),
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
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS payment_provider varchar(32);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS purchase_type varchar(16) NOT NULL DEFAULT 'PACKAGE';
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS list_price_usd_cents integer CHECK(list_price_usd_cents>=0);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS final_price_usd_cents integer CHECK(final_price_usd_cents>=0);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS fx_rate_usd_thb numeric(12,6);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS fx_source varchar(40);
ALTER TABLE cloud_orders ADD COLUMN IF NOT EXISTS fx_quoted_at timestamptz;

CREATE TABLE IF NOT EXISTS local_packages (
 months integer PRIMARY KEY CHECK(months IN (1,3,6,12)),
 price_satang integer NOT NULL DEFAULT 0 CHECK(price_satang>=0),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO local_packages(months) VALUES(1),(3),(6),(12) ON CONFLICT DO NOTHING;
ALTER TABLE local_packages ADD COLUMN IF NOT EXISTS price_usd_cents integer CHECK(price_usd_cents>=0);
UPDATE local_packages
SET price_usd_cents=ROUND(price_satang::numeric / 33.60)::integer
WHERE price_usd_cents IS NULL;
ALTER TABLE local_packages ALTER COLUMN price_usd_cents SET DEFAULT 0;
ALTER TABLE local_packages ALTER COLUMN price_usd_cents SET NOT NULL;
INSERT INTO plans(code,name_th,mode,max_mt5_accounts)
 VALUES ('LOCAL_1M','Local MT5 1 เดือน','LOCAL',1),('LOCAL_3M','Local MT5 3 เดือน','LOCAL',1),
 ('LOCAL_6M','Local MT5 6 เดือน','LOCAL',1),('LOCAL_12M','Local MT5 12 เดือน','LOCAL',1)
 ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS local_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 months integer NOT NULL REFERENCES local_packages(months),
 amount integer NOT NULL CHECK(amount>=0),
 original_amount integer NOT NULL DEFAULT 0 CHECK(original_amount>=0),
 discount_amount integer NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
 promotion_code varchar(20),
 promotion_redemption_id uuid REFERENCES promotion_redemptions(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'CREATING' CHECK(status IN ('CREATING','PENDING','PAID','FAILED','REVIEW')),
 slot_id uuid REFERENCES license_slots(id),
 subscription_id uuid REFERENCES subscriptions(id),
 charge_id text UNIQUE,
 qr_url text,
 expires_at timestamptz,
 paid_at timestamptz,
 checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS local_order_user_pending ON local_orders(user_id)
 WHERE status IN ('CREATING','PENDING','REVIEW');
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS payment_provider varchar(32);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS list_price_usd_cents integer CHECK(list_price_usd_cents>=0);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS final_price_usd_cents integer CHECK(final_price_usd_cents>=0);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS fx_rate_usd_thb numeric(12,6);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS fx_source varchar(40);
ALTER TABLE local_orders ADD COLUMN IF NOT EXISTS fx_quoted_at timestamptz;
CREATE TABLE IF NOT EXISTS worker_commands (
 id bigserial PRIMARY KEY,
 runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id) ON DELETE CASCADE,
 bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
 execution_generation bigint NOT NULL,
 command varchar(32) NOT NULL CHECK (command IN ('STOP_INSTANCE','RELOAD_INSTANCE','REBUILD_INSTANCE')),
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
CREATE TABLE IF NOT EXISTS access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  note text,
  created_by varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_groups_name_unique
  ON access_groups(lower(name));

CREATE TABLE IF NOT EXISTS access_group_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_group_id uuid NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode varchar(16) NOT NULL CHECK (mode IN ('LOCAL','CLOUD')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  created_by varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(access_group_id,user_id,mode)
);
CREATE INDEX IF NOT EXISTS idx_access_group_grants_user_mode
  ON access_group_grants(user_id,mode,status,expires_at DESC);

CREATE OR REPLACE VIEW cloud_node_load AS
WITH eligible_slots AS (
  SELECT ls.id AS slot_id
  FROM license_slots ls
  JOIN users u ON u.id=ls.assigned_user_id
  LEFT JOIN subscriptions sub ON sub.id=ls.subscription_id
  LEFT JOIN LATERAL (
    SELECT (
      primary_sub.id IS NOT NULL
      AND primary_sub.status='ACTIVE'
      AND primary_sub.starts_at<=now()
      AND primary_sub.expires_at>now()
    ) AS primary_active
    FROM license_slots primary_slot
    LEFT JOIN subscriptions primary_sub ON primary_sub.id=primary_slot.subscription_id
    WHERE primary_slot.owner_user_id=ls.owner_user_id
      AND primary_slot.assigned_user_id=ls.assigned_user_id
      AND primary_slot.mode='CLOUD'
      AND primary_slot.slot_type='PERSONAL'
      AND primary_slot.status<>'DELETED'
    ORDER BY primary_slot.slot_number,primary_slot.created_at
    LIMIT 1
  ) primary_access ON true
  WHERE ls.mode='CLOUD'
    AND ls.status<>'DELETED'
    AND u.role NOT IN ('OWNER','ADMIN')
    AND primary_access.primary_active IS TRUE
    AND (
      (
        sub.id IS NOT NULL
        AND sub.status='ACTIVE'
        AND sub.starts_at<=now()
        AND sub.expires_at>now()
      )
      OR EXISTS (
        SELECT 1
        FROM access_group_grants gg
        JOIN access_groups ag ON ag.id=gg.access_group_id
        WHERE gg.user_id=ls.assigned_user_id
          AND gg.mode='CLOUD'
          AND gg.status='ACTIVE'
          AND gg.starts_at<=now()
          AND gg.expires_at>now()
          AND ag.enabled=true
      )
    )
),
seats AS (
  SELECT bi.runner_id, COALESCE(bi.slot_id::text,bi.id::text) AS seat
  FROM bot_instances bi
  JOIN license_slots ls ON ls.id=bi.slot_id
  JOIN users u ON u.id=ls.assigned_user_id
  WHERE bi.mode='CLOUD'
    AND bi.runner_id IS NOT NULL
    AND ls.mode='CLOUD'
    AND ls.status<>'DELETED'
    AND (
      (
        u.role IN ('OWNER','ADMIN')
        AND bi.last_seen_at>now()-interval '30 seconds'
      )
      OR EXISTS (
        SELECT 1 FROM eligible_slots es WHERE es.slot_id=ls.id
      )
    )
  UNION
  SELECT co.runner_id,co.slot_id::text AS seat
  FROM cloud_orders co
  JOIN eligible_slots es ON es.slot_id=co.slot_id
  WHERE co.runner_id IS NOT NULL
    AND co.slot_id IS NOT NULL
    AND co.status='PAID'
    AND NOT EXISTS (
      SELECT 1
      FROM bot_instances bi
      WHERE bi.slot_id=co.slot_id
        AND bi.mode='CLOUD'
        AND bi.runner_id IS NOT NULL
    )
)
SELECT w.runner_id,count(s.seat)::int AS occupied
FROM worker_nodes w
LEFT JOIN seats s ON s.runner_id=w.runner_id
GROUP BY w.runner_id;

CREATE TABLE IF NOT EXISTS ea_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version varchar(32) NOT NULL,
 sha256 varchar(64) NOT NULL,
 runtime_contract varchar(96),
 build_id varchar(64),
 artifact_name varchar(120) NOT NULL DEFAULT 'FastBasketBot.ex5',
 source_commit varchar(64),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(version,sha256)
);
ALTER TABLE ea_releases ADD COLUMN IF NOT EXISTS artifact_bytes bytea;
ALTER TABLE ea_releases ADD COLUMN IF NOT EXISTS build_id varchar(64);
CREATE TABLE IF NOT EXISTS server_update_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 runner_id varchar(120) NOT NULL REFERENCES worker_nodes(runner_id) ON DELETE CASCADE,
 action varchar(16) NOT NULL CHECK(action IN ('UPDATE','ROLLBACK')),
 source_job_id uuid REFERENCES server_update_jobs(id) ON DELETE SET NULL,
 release_id uuid REFERENCES ea_releases(id) ON DELETE RESTRICT,
 mode varchar(16) NOT NULL DEFAULT 'SAFE' CHECK(mode IN ('SAFE')),
 state varchar(24) NOT NULL DEFAULT 'RUNNING'
   CHECK(state IN ('RUNNING','COMPLETED','PARTIAL_FAILED','FAILED','CANCELLED')),
 created_by varchar(160),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_server_update_one_active
 ON server_update_jobs(runner_id)
 WHERE state='RUNNING';
CREATE TABLE IF NOT EXISTS instance_update_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 server_update_job_id uuid NOT NULL REFERENCES server_update_jobs(id) ON DELETE CASCADE,
 bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
 action varchar(16) NOT NULL CHECK(action IN ('UPDATE','ROLLBACK')),
 source_instance_update_id uuid REFERENCES instance_update_jobs(id) ON DELETE SET NULL,
 target_version varchar(32) NOT NULL,
 target_sha256 varchar(64),
 target_build_id varchar(64),
 previous_version varchar(32),
 previous_sha256 varchar(64),
 previous_build_id varchar(64),
 original_desired_state varchar(24) NOT NULL DEFAULT 'STOPPED',
 state varchar(24) NOT NULL DEFAULT 'WAITING_SAFE'
   CHECK(state IN ('WAITING_SAFE','DELIVERED','VERIFYING','COMPLETED','FAILED','CANCELLED')),
 result_code varchar(64),
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 applied_at timestamptz,
 completed_at timestamptz
);
ALTER TABLE instance_update_jobs ADD COLUMN IF NOT EXISTS target_build_id varchar(64);
ALTER TABLE instance_update_jobs ADD COLUMN IF NOT EXISTS previous_build_id varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_instance_update_one_active
 ON instance_update_jobs(bot_instance_id)
 WHERE state IN ('WAITING_SAFE','DELIVERED','VERIFYING');
CREATE INDEX IF NOT EXISTS idx_instance_update_parent
 ON instance_update_jobs(server_update_job_id,state,created_at);


`;
