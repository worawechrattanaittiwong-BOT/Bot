import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, PoolClient, QueryResultRow } from "pg";
import { CLOUD_SCHEMA } from "./cloud-schema";

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
        ('LOCAL_3SLOT','Local MT5 3 Slots','LOCAL',3,false,false),
        ('LOCAL_5SLOT','Local MT5 5 Slots','LOCAL',5,false,false),
        ('PARTNER_LOCAL_10','Partner Local 10 Slots','LOCAL',10,false,true),
        ('PARTNER_LOCAL_25','Partner Local 25 Slots','LOCAL',25,false,true),
        ('PARTNER_LOCAL_50','Partner Local 50 Slots','LOCAL',50,false,true)
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

      -- Partner Program v2 keeps Partner capacity separate from each customer membership.
      UPDATE plans
      SET active=false
      WHERE code IN ('LOCAL_3SLOT','LOCAL_5SLOT','PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50');

      CREATE TABLE IF NOT EXISTS partner_accounts (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        status varchar(20) NOT NULL DEFAULT 'READY'
          CHECK (status IN ('READY','ACTIVE','SUSPENDED','EXPIRED')),
        seat_limit integer NOT NULL CHECK (seat_limit BETWEEN 1 AND 500),
        customer_duration_days integer NOT NULL DEFAULT 30
          CHECK (customer_duration_days BETWEEN 1 AND 3660),
        partner_duration_days integer NOT NULL DEFAULT 30
          CHECK (partner_duration_days BETWEEN 1 AND 3660),
        granted_at timestamptz NOT NULL DEFAULT now(),
        activation_deadline_at timestamptz NOT NULL,
        activated_at timestamptz,
        expires_at timestamptz,
        created_by varchar(120) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_partner_accounts_status
        ON partner_accounts(status,expires_at,activation_deadline_at);

      CREATE TABLE IF NOT EXISTS partner_customers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_user_id uuid NOT NULL REFERENCES partner_accounts(user_id) ON DELETE CASCADE,
        customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
        status varchar(20) NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE','EXPIRED','DIRECT','REVOKED')),
        starts_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_partner_customers_partner
        ON partner_customers(partner_user_id,status,expires_at);
      CREATE INDEX IF NOT EXISTS idx_partner_customers_customer
        ON partner_customers(customer_user_id,status,expires_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_customer_one_active
        ON partner_customers(customer_user_id) WHERE status='ACTIVE';

      ALTER TABLE partner_customers
        ADD COLUMN IF NOT EXISTS direct_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS ended_at timestamptz,
        ADD COLUMN IF NOT EXISTS end_reason varchar(64);
      CREATE INDEX IF NOT EXISTS idx_partner_customers_direct_subscription
        ON partner_customers(direct_subscription_id) WHERE direct_subscription_id IS NOT NULL;

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

      CREATE TABLE IF NOT EXISTS trial_authorizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        duration_minutes integer NOT NULL DEFAULT 1440,
        status varchar(24) NOT NULL DEFAULT 'PENDING_BIND',
        approved_by varchar(120),
        approved_at timestamptz NOT NULL DEFAULT now(),
        claimed_mt5_account_id uuid REFERENCES mt5_accounts(id) ON DELETE SET NULL,
        claimed_at timestamptz,
        blocked_reason varchar(80),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_trial_authorizations_status
        ON trial_authorizations(status,updated_at DESC);

      ALTER TABLE trial_authorizations
        ADD COLUMN IF NOT EXISTS phone_hash text,
        ADD COLUMN IF NOT EXISTS phone_last4 varchar(4),
        ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'OWNER';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_authorizations_phone_unique
        ON trial_authorizations(phone_hash)
        WHERE phone_hash IS NOT NULL;

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
        ON trial_identity_registry(phone_hash) WHERE phone_hash IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_identity_device
        ON trial_identity_registry(device_fingerprint_hash) WHERE device_fingerprint_hash IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_identity_mt5
        ON trial_identity_registry(lower(account_number),lower(broker_server))
        WHERE account_number IS NOT NULL AND broker_server IS NOT NULL;

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

      DO $email_verification$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='users'
            AND column_name='email_verified_at'
        ) THEN
          ALTER TABLE users
            ADD COLUMN email_verified_at timestamptz DEFAULT now();
          ALTER TABLE users
            ALTER COLUMN email_verified_at DROP DEFAULT;
        END IF;
      END
      $email_verification$;

      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash text NOT NULL,
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        expires_at timestamptz NOT NULL,
        sent_at timestamptz NOT NULL DEFAULT now(),
        consumed_at timestamptz,
        request_ip varchar(96),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_email_verification_user_sent
        ON email_verification_codes(user_id,sent_at DESC);
      CREATE INDEX IF NOT EXISTS idx_email_verification_active
        ON email_verification_codes(user_id,expires_at DESC)
        WHERE consumed_at IS NULL;

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text UNIQUE NOT NULL,
        requested_by varchar(160),
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_password_reset_user_created
        ON password_reset_tokens(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_password_reset_active
        ON password_reset_tokens(token_hash,expires_at)
        WHERE consumed_at IS NULL;

      CREATE TABLE IF NOT EXISTS user_security (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        totp_secret_ciphertext text,
        totp_secret_iv text,
        totp_secret_auth_tag text,
        two_factor_enabled_at timestamptz,
        recovery_code_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
        last_password_changed_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (
          two_factor_enabled_at IS NULL OR
          (totp_secret_ciphertext IS NOT NULL AND totp_secret_iv IS NOT NULL AND totp_secret_auth_tag IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS two_factor_login_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text UNIQUE NOT NULL,
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
        request_ip varchar(96),
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_two_factor_challenge_user_created
        ON two_factor_login_challenges(user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_two_factor_challenge_active
        ON two_factor_login_challenges(token_hash,expires_at)
        WHERE consumed_at IS NULL;


      -- Four-level referral program: L1 7%, L2 5%, L3 3%, L4 1%.
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS referral_code varchar(40),
        ADD COLUMN IF NOT EXISTS referred_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS referred_at timestamptz;

      UPDATE users
      SET referral_code='SCN-' || upper(regexp_replace(user_code,'^BOT-','','i'))
      WHERE referral_code IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique
        ON users(lower(referral_code))
        WHERE referral_code IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_referred_by
        ON users(referred_by_user_id,created_at DESC)
        WHERE referred_by_user_id IS NOT NULL;

      DO $referral_self_guard$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname='users_referral_not_self'
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT users_referral_not_self
            CHECK (referred_by_user_id IS NULL OR referred_by_user_id<>id);
        END IF;
      END
      $referral_self_guard$;

      CREATE TABLE IF NOT EXISTS referral_commissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        beneficiary_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        source_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        source_type varchar(40) NOT NULL,
        source_id uuid NOT NULL,
        level smallint NOT NULL CHECK (level BETWEEN 1 AND 4),
        rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
        gross_amount_satang integer NOT NULL CHECK (gross_amount_satang>0),
        commission_amount_satang integer NOT NULL CHECK (commission_amount_satang>=0),
        currency varchar(8) NOT NULL DEFAULT 'THB',
        status varchar(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','AVAILABLE','PAID','VOID')),
        available_at timestamptz NOT NULL,
        paid_at timestamptz,
        payout_reference varchar(160),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(source_type,source_id,beneficiary_user_id,level)
      );
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_beneficiary
        ON referral_commissions(beneficiary_user_id,status,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_source
        ON referral_commissions(source_user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_referral_commissions_available
        ON referral_commissions(status,available_at)
        WHERE status IN ('PENDING','AVAILABLE');

      CREATE TABLE IF NOT EXISTS trade_journal (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
        mt5_account_id uuid REFERENCES mt5_accounts(id) ON DELETE SET NULL,
        deal_ticket bigint NOT NULL,
        position_id bigint,
        event_type varchar(16) NOT NULL CHECK (event_type IN ('ENTRY','EXIT','BASKET')),
        direction varchar(8) NOT NULL CHECK (direction IN ('BUY','SELL')),
        volume numeric(18,8) NOT NULL DEFAULT 0,
        price numeric(24,10) NOT NULL DEFAULT 0,
        net_profit numeric(18,2) NOT NULL DEFAULT 0,
        entry_trigger varchar(64),
        entry_model varchar(64),
        entry_quality varchar(8),
        entry_quality_score numeric(8,2) NOT NULL DEFAULT 0,
        market_regime varchar(64),
        market_regime_detail varchar(64),
        fib_setup_score numeric(8,2) NOT NULL DEFAULT 0,
        order_block_quality numeric(8,2) NOT NULL DEFAULT 0,
        confidence numeric(8,2) NOT NULL DEFAULT 0,
        basket_index integer NOT NULL DEFAULT 0,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(bot_instance_id,deal_ticket,event_type)
      );
      CREATE INDEX IF NOT EXISTS idx_trade_journal_instance_created
        ON trade_journal(bot_instance_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_trade_journal_instance_exit
        ON trade_journal(bot_instance_id,event_type,created_at DESC);

      ALTER TABLE trade_journal
        DROP CONSTRAINT IF EXISTS trade_journal_event_type_check;
      ALTER TABLE trade_journal
        ADD CONSTRAINT trade_journal_event_type_check
        CHECK (event_type IN ('ENTRY','EXIT','BASKET'));
      CREATE INDEX IF NOT EXISTS idx_trade_journal_basket_stats
        ON trade_journal(bot_instance_id,direction,created_at DESC)
        WHERE event_type='BASKET';

      CREATE TABLE IF NOT EXISTS backtest_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot_id uuid REFERENCES license_slots(id) ON DELETE SET NULL,
        title varchar(160) NOT NULL,
        source varchar(24) NOT NULL DEFAULT 'IMPORT' CHECK (source IN ('IMPORT','MT5_TESTER','SAMPLE')),
        symbol varchar(64) NOT NULL DEFAULT 'XAUUSD',
        timeframe varchar(16) NOT NULL DEFAULT 'M5',
        started_at timestamptz,
        ended_at timestamptz,
        initial_deposit numeric(18,2) NOT NULL DEFAULT 0,
        lot numeric(18,8) NOT NULL DEFAULT 0,
        currency varchar(12) NOT NULL DEFAULT 'USD',
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        summary jsonb NOT NULL DEFAULT '{}'::jsonb,
        equity_curve jsonb NOT NULL DEFAULT '[]'::jsonb,
        status varchar(20) NOT NULL DEFAULT 'COMPLETED',
        is_published boolean NOT NULL DEFAULT false,
        public_slug varchar(96) UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_backtest_runs_owner_created
        ON backtest_runs(owner_user_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_backtest_runs_slot_created
        ON backtest_runs(slot_id,created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_backtest_runs_public
        ON backtest_runs(public_slug)
        WHERE is_published=true AND public_slug IS NOT NULL;

      CREATE TABLE IF NOT EXISTS backtest_trades (
        id bigserial PRIMARY KEY,
        run_id uuid NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
        trade_index integer NOT NULL,
        opened_at timestamptz,
        closed_at timestamptz,
        direction varchar(8) NOT NULL CHECK (direction IN ('BUY','SELL')),
        volume numeric(18,8) NOT NULL DEFAULT 0,
        open_price numeric(24,10) NOT NULL DEFAULT 0,
        close_price numeric(24,10) NOT NULL DEFAULT 0,
        profit numeric(18,2) NOT NULL DEFAULT 0,
        balance_after numeric(18,2),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE(run_id,trade_index)
      );
      CREATE INDEX IF NOT EXISTS idx_backtest_trades_run
        ON backtest_trades(run_id,trade_index);

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
        ADD COLUMN IF NOT EXISTS device_fingerprint_hash text,
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


      -- Adaptive Engine uses live broker/symbol spread percentiles.
      -- Remove legacy fixed XAUUSD defaults only for adaptive profiles.
      UPDATE bot_settings
      SET
        settings=jsonb_set(settings,'{maxSpreadPoints}','0'::jsonb,true),
        updated_at=now()
      WHERE COALESCE((settings->>'adaptiveEngine')::boolean,true)=true
        AND COALESCE(settings->>'symbol','') ILIKE 'XAUUSD%'
        AND COALESCE((settings->>'maxSpreadPoints')::int,0) IN (50,300);

      -- Add Adaptive Engine defaults without replacing values already chosen
      -- by a user. ATR 0 means fully adaptive, not disabled.
      UPDATE bot_settings
      SET settings='{
        "adaptiveEngine":true,
        "riskPerOrderPercent":0.25,
        "hardStopAtrMultiplier":2.0,
        "atrPeriod":14,
        "confidenceThreshold":62,
        "sessionStartHour":0,
        "sessionEndHour":24,
        "maxAtrPoints":0
      }'::jsonb || settings
      WHERE NOT settings ? 'adaptiveEngine';

      -- Migrate the previous untouched ATR hard-cap default to fully adaptive.
      UPDATE bot_settings
      SET settings=jsonb_set(settings,'{maxAtrPoints}','0'::jsonb,true),
          updated_at=now()
      WHERE COALESCE((settings->>'adaptiveEngine')::boolean,true)=true
        AND COALESCE((settings->>'maxAtrPoints')::numeric,0)=3000;

      -- EA 1.017 uses a real Broker Stop Loss per Position. A value of 0
      -- means use the profile/system ATR stop; positive values are fixed points.
      -- Retire the old floating-money per-position loss close for every account.
      UPDATE bot_settings
      SET settings=jsonb_set(
            jsonb_set(
              settings,
              '{manualStopLossPoints}',
              COALESCE(settings->'manualStopLossPoints','0'::jsonb),
              true
            ),
            '{perPositionLossMoney}',
            '0'::jsonb,
            true
          ),
          updated_at=now()
      WHERE NOT settings ? 'manualStopLossPoints'
         OR COALESCE((settings->>'perPositionLossMoney')::numeric,0)<>0;

      -- Setup-First Engine: normalize legacy hidden gates while preserving the
      -- user's explicit Confidence checkbox when it already exists.
      UPDATE bot_settings
      SET settings=(settings - 'tradingProfile' - 'cooldownMinutesAfterLoss' - 'maxConsecutiveLosses') ||
                   jsonb_build_object(
                     'adaptiveEngine',true,
                     'minOrderIntervalMs',300,
                     'maxOrdersPerMinute',120,
                     'riskPerOrderPercent',0.25,
                     'hardStopAtrMultiplier',2.0,
                     'confidenceGateEnabled',COALESCE((settings->>'confidenceGateEnabled')::boolean,false),
                     'confidenceThreshold',55,
                     'allowMinimumLotOverride',true,
                     'sessionStartHour',0,
                     'sessionEndHour',24,
                     'maxAtrPoints',0
                   ),
          updated_at=now()
      WHERE settings ? 'tradingProfile'
         OR settings ? 'cooldownMinutesAfterLoss'
         OR settings ? 'maxConsecutiveLosses'
         OR NOT settings ? 'confidenceGateEnabled'
         OR COALESCE((settings->>'confidenceThreshold')::int,0)<>55
         OR COALESCE((settings->>'allowMinimumLotOverride')::boolean,false)=false
         OR COALESCE((settings->>'sessionStartHour')::int,-1)<>0
         OR COALESCE((settings->>'sessionEndHour')::int,-1)<>24;

      -- Existing explicit money targets stay Manual. Accounts without a
      -- target start in Auto Smart Profit mode.
      UPDATE bot_settings
      SET settings=jsonb_set(
            settings,
            '{profitTargetMode}',
            to_jsonb(
              CASE
                WHEN COALESCE((settings->>'basketProfitTargetMoney')::numeric,0)>0
                  OR COALESCE((settings->>'perPositionProfitMoney')::numeric,0)>0
                THEN 'MANUAL'::text
                ELSE 'AUTO'::text
              END
            ),
            true
          ),
          updated_at=now()
      WHERE NOT settings ? 'profitTargetMode';

      -- System-wide safe maintenance / update coordination. This singleton is
      -- also created by database/014_maintenance_mode.sql for fresh installs.
      CREATE TABLE IF NOT EXISTS system_maintenance (
        id smallint PRIMARY KEY CHECK (id=1),
        status varchar(20) NOT NULL DEFAULT 'OFF' CHECK (status IN ('OFF','SCHEDULED','DRAINING','MAINTENANCE')),
        title varchar(160),
        message text,
        maintenance_at timestamptz,
        force_close_at timestamptz,
        expected_resume_at timestamptz,
        force_close boolean NOT NULL DEFAULT true,
        announced_at timestamptz,
        drain_started_at timestamptz,
        maintenance_started_at timestamptz,
        resumed_at timestamptz,
        updated_by varchar(120),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO system_maintenance(id,status,force_close)
      VALUES(1,'OFF',true)
      ON CONFLICT (id) DO NOTHING;
    `);
    await this.pool.query(CLOUD_SCHEMA);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
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
