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

CREATE INDEX IF NOT EXISTS idx_access_group_grants_group
  ON access_group_grants(access_group_id,status,expires_at DESC);

-- Convert the earlier implementation where a grouped temporary access was stored
-- as a normal subscription. Preserve that duration as a group grant and restore
-- the most recent still-valid real subscription of the same mode when one exists.
DO $$
DECLARE
  rec record;
  previous_subscription_id uuid;
BEGIN
  FOR rec IN
    SELECT s.id,s.user_id,s.access_group_id,s.starts_at,s.expires_at,s.created_at,p.mode,s.activated_by
    FROM subscriptions s
    JOIN plans p ON p.id=s.plan_id
    WHERE s.access_group_id IS NOT NULL
  LOOP
    INSERT INTO access_group_grants(
      access_group_id,user_id,mode,starts_at,expires_at,status,created_by
    )
    VALUES(
      rec.access_group_id,rec.user_id,rec.mode,rec.starts_at,rec.expires_at,
      CASE WHEN rec.expires_at>now() AND rec.starts_at<=now() THEN 'ACTIVE' ELSE 'EXPIRED' END,
      COALESCE(rec.activated_by,'MIGRATION')
    )
    ON CONFLICT(access_group_id,user_id,mode) DO UPDATE SET
      starts_at=LEAST(access_group_grants.starts_at,EXCLUDED.starts_at),
      expires_at=GREATEST(access_group_grants.expires_at,EXCLUDED.expires_at),
      status=CASE
        WHEN GREATEST(access_group_grants.expires_at,EXCLUDED.expires_at)>now() THEN 'ACTIVE'
        ELSE 'EXPIRED'
      END,
      updated_at=now();

    previous_subscription_id := NULL;
    SELECT s2.id
    INTO previous_subscription_id
    FROM subscriptions s2
    JOIN plans p2 ON p2.id=s2.plan_id
    WHERE s2.user_id=rec.user_id
      AND p2.mode=rec.mode
      AND s2.id<>rec.id
      AND s2.access_group_id IS NULL
      AND s2.status='CANCELLED'
      AND s2.expires_at>now()
      AND s2.created_at<rec.created_at
    ORDER BY s2.created_at DESC
    LIMIT 1;

    IF previous_subscription_id IS NOT NULL THEN
      UPDATE subscriptions
      SET status='ACTIVE'
      WHERE id=previous_subscription_id;

      UPDATE license_slots
      SET subscription_id=previous_subscription_id
      WHERE subscription_id=rec.id;
    ELSE
      UPDATE license_slots
      SET subscription_id=NULL
      WHERE subscription_id=rec.id;
    END IF;

    UPDATE subscriptions
    SET status='CANCELLED',
        access_group_id=NULL
    WHERE id=rec.id;
  END LOOP;
END $$;
