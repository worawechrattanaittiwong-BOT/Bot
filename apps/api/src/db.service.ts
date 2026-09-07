import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, QueryResultRow } from "pg";

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://bot:bot@localhost:5432/bot"
  });

  async onModuleInit() {
    // Production deployments already have a live database, so keep this migration
    // idempotent and run it on API startup. database/002_slots_devices.sql remains
    // the canonical migration for manual/fresh deployments.
    await this.pool.query(`
      ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS allow_resale boolean NOT NULL DEFAULT false;

      INSERT INTO plans(code,name_th,mode,max_mt5_accounts,active,allow_resale)
      VALUES
        ('LOCAL_3SLOT','Local MT5 3 Slots','LOCAL',3,true,false),
        ('LOCAL_5SLOT','Local MT5 5 Slots','LOCAL',5,true,false),
        ('PARTNER_LOCAL_10','Partner Local 10 Slots','LOCAL',10,true,true),
        ('PARTNER_LOCAL_25','Partner Local 25 Slots','LOCAL',25,true,true),
        ('PARTNER_LOCAL_50','Partner Local 50 Slots','LOCAL',50,true,true)
      ON CONFLICT (code) DO UPDATE SET
        name_th=EXCLUDED.name_th,
        mode=EXCLUDED.mode,
        max_mt5_accounts=EXCLUDED.max_mt5_accounts,
        active=EXCLUDED.active,
        allow_resale=EXCLUDED.allow_resale;

      CREATE TABLE IF NOT EXISTS license_slots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
        mode varchar(16) NOT NULL CHECK (mode IN ('CLOUD','LOCAL')),
        slot_number integer NOT NULL,
        slot_type varchar(20) NOT NULL DEFAULT 'PERSONAL',
        status varchar(20) NOT NULL DEFAULT 'AVAILABLE',
        label varchar(120),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_license_slots_owner ON license_slots(owner_user_id,mode,status);
      CREATE INDEX IF NOT EXISTS idx_license_slots_assigned ON license_slots(assigned_user_id,mode,status);
      CREATE INDEX IF NOT EXISTS idx_license_slots_subscription ON license_slots(subscription_id);

      CREATE TABLE IF NOT EXISTS install_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slot_id uuid NOT NULL REFERENCES license_slots(id) ON DELETE CASCADE,
        requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash text UNIQUE NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'PENDING',
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_install_enrollments_slot ON install_enrollments(slot_id,status,expires_at);

      CREATE TABLE IF NOT EXISTS trial_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mt5_account_id uuid REFERENCES mt5_accounts(id) ON DELETE SET NULL,
        line_contact varchar(160) NOT NULL,
        request_ip varchar(96),
        status varchar(20) NOT NULL DEFAULT 'PENDING',
        reviewed_by varchar(120),
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_trial_requests_user ON trial_requests(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_trial_requests_line ON trial_requests(lower(line_contact));
      CREATE INDEX IF NOT EXISTS idx_trial_requests_ip ON trial_requests(request_ip);

      CREATE TABLE IF NOT EXISTS auth_events (
        id bigserial PRIMARY KEY,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        email varchar(320),
        event varchar(32) NOT NULL,
        ip_address varchar(96),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_auth_events_ip ON auth_events(ip_address,created_at DESC);

      ALTER TABLE trial_grants
        ADD COLUMN IF NOT EXISTS line_contact varchar(160),
        ADD COLUMN IF NOT EXISTS request_ip varchar(96);

      ALTER TABLE bot_instances ALTER COLUMN mt5_account_id DROP NOT NULL;
      ALTER TABLE bot_instances
        ADD COLUMN IF NOT EXISTS slot_id uuid,
        ADD COLUMN IF NOT EXISTS agent_last_seen_at timestamptz,
        ADD COLUMN IF NOT EXISTS agent_version varchar(32),
        ADD COLUMN IF NOT EXISTS agent_terminal_path text,
        ADD COLUMN IF NOT EXISTS agent_ea_hash varchar(128),
        ADD COLUMN IF NOT EXISTS device_public_id varchar(160),
        ADD COLUMN IF NOT EXISTS device_secret_hash text,
        ADD COLUMN IF NOT EXISTS device_status varchar(20) NOT NULL DEFAULT 'UNREGISTERED',
        ADD COLUMN IF NOT EXISTS device_hostname varchar(160),
        ADD COLUMN IF NOT EXISTS device_registered_at timestamptz,
        ADD COLUMN IF NOT EXISTS device_last_seen_at timestamptz,
        ADD COLUMN IF NOT EXISTS device_last_ip varchar(96),
        ADD COLUMN IF NOT EXISTS ea_last_ip varchar(96),
        ADD COLUMN IF NOT EXISTS pending_account_number varchar(64),
        ADD COLUMN IF NOT EXISTS pending_broker varchar(120),
        ADD COLUMN IF NOT EXISTS pending_broker_server varchar(160),
        ADD COLUMN IF NOT EXISTS pending_account_ip varchar(96),
        ADD COLUMN IF NOT EXISTS pending_account_seen_at timestamptz,
        ADD COLUMN IF NOT EXISTS account_change_requested_at timestamptz;

      DO $migration$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bot_instances_slot_fk') THEN
          ALTER TABLE bot_instances
            ADD CONSTRAINT bot_instances_slot_fk
            FOREIGN KEY (slot_id) REFERENCES license_slots(id) ON DELETE SET NULL;
        END IF;
      END
      $migration$;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_instances_slot_unique
        ON bot_instances(slot_id) WHERE slot_id IS NOT NULL;

      INSERT INTO license_slots(
        id,owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label
      )
      SELECT
        bi.id,
        a.user_id,
        a.user_id,
        (
          SELECT s.id
          FROM subscriptions s
          JOIN plans p ON p.id=s.plan_id
          WHERE s.user_id=a.user_id
            AND p.mode=bi.mode
            AND s.status='ACTIVE'
            AND s.starts_at<=now()
            AND s.expires_at>now()
          ORDER BY s.expires_at DESC
          LIMIT 1
        ),
        bi.mode,
        ROW_NUMBER() OVER (PARTITION BY a.user_id,bi.mode ORDER BY bi.created_at,bi.id)::int,
        CASE WHEN u.role IN ('OWNER','ADMIN') THEN 'OWNER' ELSE 'PERSONAL' END,
        'ACTIVE',
        'Existing installation'
      FROM bot_instances bi
      JOIN mt5_accounts a ON a.id=bi.mt5_account_id
      JOIN users u ON u.id=a.user_id
      ON CONFLICT (id) DO NOTHING;

      UPDATE bot_instances
      SET slot_id=id
      WHERE slot_id IS NULL
        AND EXISTS (SELECT 1 FROM license_slots ls WHERE ls.id=bot_instances.id);


      -- One MT5 identity may belong to only one active SCENOVA slot at a time.
      -- Older production data allowed the same account/server pair under
      -- different users, which could make a newer test installation receive
      -- heartbeats while the original binding appeared stopped. Resolve any
      -- historical duplicates deterministically before adding the global guard:
      -- OWNER/ADMIN wins first, then an actually-linked instance, then the
      -- earliest original account record.
      CREATE TEMP TABLE IF NOT EXISTS scenova_duplicate_mt5_losers(id uuid PRIMARY KEY) ON COMMIT DROP;
      TRUNCATE scenova_duplicate_mt5_losers;

      INSERT INTO scenova_duplicate_mt5_losers(id)
      SELECT id
      FROM (
        SELECT
          a.id,
          ROW_NUMBER() OVER (
            PARTITION BY lower(a.account_number), lower(a.broker_server)
            ORDER BY
              CASE WHEN u.role IN ('OWNER','ADMIN') THEN 0 ELSE 1 END,
              CASE WHEN bi.id IS NOT NULL THEN 0 ELSE 1 END,
              a.created_at ASC,
              a.id ASC
          ) AS rn
        FROM mt5_accounts a
        JOIN users u ON u.id=a.user_id
        LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
        WHERE a.status='ACTIVE'
      ) ranked
      WHERE rn>1
      ON CONFLICT (id) DO NOTHING;

      UPDATE bot_instances bi
      SET
        mt5_account_id=NULL,
        desired_state='SAFE_STOP',
        actual_state='OFFLINE',
        last_seen_at=NULL,
        pending_account_number=NULL,
        pending_broker=NULL,
        pending_broker_server=NULL,
        pending_account_ip=NULL,
        pending_account_seen_at=NULL
      WHERE bi.mt5_account_id IN (SELECT id FROM scenova_duplicate_mt5_losers);

      UPDATE mt5_accounts a
      SET status='INACTIVE'
      WHERE a.id IN (SELECT id FROM scenova_duplicate_mt5_losers);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_mt5_active_identity_unique
        ON mt5_accounts(lower(account_number),lower(broker_server))
        WHERE status='ACTIVE';
    `);
  }

  async query<T extends QueryResultRow = any>(text: string, params: any[] = []) {
    return this.pool.query<T>(text, params);
  }

  async one<T extends QueryResultRow = any>(text: string, params: any[] = []) {
    const result = await this.pool.query<T>(text, params);
    return result.rows[0] ?? null;
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
