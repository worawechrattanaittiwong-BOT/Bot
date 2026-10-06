CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_code varchar(32) UNIQUE NOT NULL,
  email varchar(320) UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role varchar(16) NOT NULL DEFAULT 'USER',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) UNIQUE NOT NULL,
  name_th varchar(120) NOT NULL,
  mode varchar(16) NOT NULL CHECK (mode IN ('CLOUD','LOCAL')),
  max_mt5_accounts integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans(code,name_th,mode,max_mt5_accounts)
VALUES
 ('LOCAL_30D','Local MT5 30 วัน','LOCAL',1),
 ('CLOUD_30D','Cloud MT5 30 วัน','CLOUD',1)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS mt5_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number varchar(64) NOT NULL,
  broker varchar(80) NOT NULL DEFAULT 'Exness',
  broker_server varchar(160) NOT NULL,
  mode varchar(16) NOT NULL CHECK (mode IN ('CLOUD','LOCAL')),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_number, broker_server)
);
CREATE INDEX IF NOT EXISTS idx_mt5_identity ON mt5_accounts(account_number, broker_server);

CREATE TABLE IF NOT EXISTS mt5_credentials (
  mt5_account_id uuid PRIMARY KEY REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trial_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mt5_account_id uuid NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  account_number varchar(64) NOT NULL,
  broker_server varchar(160) NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 180,
  status varchar(20) NOT NULL DEFAULT 'APPROVED',
  approved_by varchar(120),
  approved_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_number, broker_server)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  activated_by varchar(120),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_active ON subscriptions(user_id, starts_at, expires_at);

CREATE TABLE IF NOT EXISTS bot_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mt5_account_id uuid NOT NULL REFERENCES mt5_accounts(id) ON DELETE CASCADE,
  mode varchar(16) NOT NULL CHECK (mode IN ('CLOUD','LOCAL')),
  install_token_hash text NOT NULL,
  desired_state varchar(24) NOT NULL DEFAULT 'STOPPED',
  actual_state varchar(24) NOT NULL DEFAULT 'OFFLINE',
  runner_id varchar(120),
  lock_owner varchar(120),
  last_seen_at timestamptz,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mt5_account_id)
);

CREATE TABLE IF NOT EXISTS bot_settings (
  bot_instance_id uuid PRIMARY KEY REFERENCES bot_instances(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{
    "symbol":"XAUUSD",
    "lot":0.01,
    "maxPositions":3,
    "autoLot":0.01,
    "autoMaxPositions":3,
    "raceLot":0.01,
    "raceMaxPositions":5,
    "counterLot":0.01,
    "counterMaxPositions":20,
    "counterSizingVersion":2,
    "counterPerPositionProfitMoney":1.0,
    "flipLockLot":0.01,
    "manualLot":0.01,
    "manualMaxPositions":10,
    "manualBasketProfitTargetMoney":1.0,
    "manualPerPositionProfitMoney":0.0,
    "standardMaxBasketLossMoney":0.0,
    "standardDailyLossMoney":0.0,
    "standardDailyProfitTargetMoney":0.0,
    "autoMaxBasketLossMoney":0.0,
    "autoDailyLossMoney":0.0,
    "autoDailyProfitTargetMoney":0.0,
    "raceMaxBasketLossMoney":0.0,
    "raceDailyLossMoney":0.0,
    "raceDailyProfitTargetMoney":0.0,
    "flipLockMaxBasketLossMoney":0.0,
    "flipLockDailyLossMoney":0.0,
    "flipLockDailyProfitTargetMoney":0.0,
    "manualMaxBasketLossMoney":0.0,
    "manualDailyLossMoney":0.0,
    "manualDailyProfitTargetMoney":0.0,
    "raceCloseAllProfitEnabled":false,
    "raceProfitTargetMode":"POSITION",
    "raceCloseAllProfitMoney":1.0,
    "racePerPositionProfitMoney":1.0,
    "zeroGridStepPrice":3,
    "zeroGridLowVolatilityEnabled":false,
    "zeroGridLevelsPerSide":10,
    "zeroGridBaseLot":0.01,
    "zeroGridMinNetProfitMoney":1.0,
    "zeroGridCloseReserveMoney":0.2,
    "basketTriggerMoney":2.0,
    "basketTrailMoney":0.5,
    "maxBasketLossMoney":0.0,
    "dailyLossMoney":0.0,
    "dailyProfitTargetMoney":0.0,
    "perPositionLossMoney":0,
    "manualStopLossPoints":0,
    "profitTargetMode":"AUTO",
    "maxSpreadPoints":300,
    "minOrderIntervalMs":300,
    "maxOrdersPerMinute":120,
    "adaptiveEngine":true,
    "tradingProfile":"BALANCED",
    "riskPerOrderPercent":0.25,
    "hardStopAtrMultiplier":2.0,
    "atrPeriod":14,
    "confidenceThreshold":70,
    "sessionStartHour":0,
    "sessionEndHour":24,
    "maxAtrPoints":0,
    "entryMode":"AUTO_MOMENTUM"
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_commands (
  id bigserial PRIMARY KEY,
  bot_instance_id uuid NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
  command varchar(32) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  acked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_commands_pending ON bot_commands(bot_instance_id, status, id);

CREATE TABLE IF NOT EXISTS worker_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id varchar(120) UNIQUE NOT NULL,
  region varchar(80) NOT NULL DEFAULT 'singapore',
  hostname varchar(160),
  capacity integer NOT NULL DEFAULT 10,
  active_instances integer NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'ONLINE',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor varchar(160) NOT NULL,
  action varchar(120) NOT NULL,
  entity_type varchar(80),
  entity_id varchar(120),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
