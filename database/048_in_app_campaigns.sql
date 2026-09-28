CREATE TABLE IF NOT EXISTS in_app_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(80) NOT NULL UNIQUE,
  title varchar(180) NOT NULL,
  image_url text,
  mobile_image_url text,
  target_url text NOT NULL,
  cta_label varchar(120) NOT NULL DEFAULT 'ดูรายละเอียด',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK(status IN ('ACTIVE','PAUSED','ARCHIVED')),
  priority integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS in_app_campaign_schedules (
  campaign_id uuid NOT NULL REFERENCES in_app_campaigns(id) ON DELETE CASCADE,
  slot_code varchar(32) NOT NULL,
  start_minute integer NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK(end_minute BETWEEN 0 AND 1439),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY(campaign_id,slot_code),
  CHECK(end_minute >= start_minute)
);

CREATE TABLE IF NOT EXISTS in_app_campaign_events (
  id bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES in_app_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type varchar(20) NOT NULL
    CHECK(event_type IN ('VIEW','CLOSE','CLICK','HIDE_TODAY')),
  slot_code varchar(32) NOT NULL,
  event_date date NOT NULL,
  path varchar(240),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_campaign_active
  ON in_app_campaigns(status,priority DESC,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_in_app_campaign_events_user_day
  ON in_app_campaign_events(user_id,event_date,campaign_id,slot_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_campaign_view_once
  ON in_app_campaign_events(campaign_id,user_id,event_date,slot_code)
  WHERE event_type='VIEW';
CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_campaign_hide_day_once
  ON in_app_campaign_events(campaign_id,user_id,event_date)
  WHERE event_type='HIDE_TODAY';

INSERT INTO in_app_campaigns(
  code,title,image_url,mobile_image_url,target_url,cta_label,status,priority,
  starts_at,ends_at,settings
)
VALUES(
  'REFERRAL_NETWORK',
  'แนะนำเพื่อน รับค่าคอมมิชชั่นแบบไร้ขีดจำกัด',
  '/promotions/referral-network-campaign.svg',
  '/promotions/referral-network-campaign.svg',
  '/referrals/details',
  'ดูรายละเอียดการแนะนำเพื่อน',
  'ACTIVE',
  100,
  now(),
  '2099-12-31 23:59:59+07',
  '{
    "maxImpressionsPerDay":3,
    "oncePerSlot":true,
    "delayMs":2500,
    "exactPaths":["/performance"],
    "allowedPathPrefixes":["/dashboard","/packages","/account","/referrals","/partner"]
  }'::jsonb
)
ON CONFLICT(code) DO NOTHING;

INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
SELECT id,'MORNING',420,659,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
ON CONFLICT(campaign_id,slot_code) DO NOTHING;

INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
SELECT id,'MIDDAY',660,899,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
ON CONFLICT(campaign_id,slot_code) DO NOTHING;

INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
SELECT id,'EVENING',1020,1319,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
ON CONFLICT(campaign_id,slot_code) DO NOTHING;
