BEGIN;

CREATE TABLE IF NOT EXISTS cloud_addon_packages (
  months integer PRIMARY KEY CHECK(months IN (1,3,6,12)),
  price_satang integer NOT NULL DEFAULT 0 CHECK(price_satang>=0),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO cloud_addon_packages(months,price_satang,enabled)
SELECT months,price_satang,enabled
FROM cloud_packages
ON CONFLICT(months) DO NOTHING;

ALTER TABLE cloud_orders
  ADD COLUMN IF NOT EXISTS purchase_type varchar(16) NOT NULL DEFAULT 'PACKAGE';

UPDATE cloud_orders o
SET purchase_type=CASE
  WHEN EXISTS (
    SELECT 1 FROM license_slots ls
    WHERE ls.id=o.slot_id AND ls.mode='CLOUD' AND ls.slot_type='ADDON'
  ) THEN 'ADDON'
  ELSE 'PACKAGE'
END
WHERE purchase_type NOT IN ('PACKAGE','ADDON')
   OR purchase_type IS NULL
   OR (
     purchase_type='PACKAGE'
     AND EXISTS (
       SELECT 1 FROM license_slots ls
       WHERE ls.id=o.slot_id AND ls.mode='CLOUD' AND ls.slot_type='ADDON'
     )
   );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='cloud_orders_purchase_type_check'
  ) THEN
    ALTER TABLE cloud_orders
      ADD CONSTRAINT cloud_orders_purchase_type_check
      CHECK (purchase_type IN ('PACKAGE','ADDON'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION scenova_rearm_cloud_after_subscription_change(
  p_user_id uuid,
  p_slot_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_type text;
  v_primary_active boolean := false;
  v_updated integer := 0;
BEGIN
  SELECT ls.slot_type
  INTO v_slot_type
  FROM license_slots ls
  WHERE ls.id=p_slot_id
    AND ls.owner_user_id=p_user_id
    AND ls.assigned_user_id=p_user_id
    AND ls.mode='CLOUD'
    AND ls.status<>'DELETED';

  IF v_slot_type IS NULL THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM license_slots primary_slot
    JOIN subscriptions primary_sub ON primary_sub.id=primary_slot.subscription_id
    WHERE primary_slot.owner_user_id=p_user_id
      AND primary_slot.assigned_user_id=p_user_id
      AND primary_slot.mode='CLOUD'
      AND primary_slot.slot_type='PERSONAL'
      AND primary_slot.status<>'DELETED'
      AND primary_sub.status='ACTIVE'
      AND primary_sub.starts_at<=now()
      AND primary_sub.expires_at>now()
  )
  INTO v_primary_active;

  IF NOT v_primary_active THEN
    RETURN 0;
  END IF;

  IF v_slot_type='PERSONAL' THEN
    UPDATE bot_instances bi
    SET runtime_stop_state='NONE',
        runtime_stop_requested_at=NULL,
        runtime_stop_confirmed_at=NULL,
        runtime_stop_error=NULL,
        desired_state='STOPPED',
        actual_state='OFFLINE',
        last_seen_at=NULL,
        metrics=(
          COALESCE(bi.metrics,'{}'::jsonb)
          - 'membershipCutoff'
          - 'membershipCutoffAt'
          - 'membershipExpiredAt'
          - 'membershipCutoffReason'
          - 'primaryMembershipExpiredAt'
        )
    FROM license_slots ls
    JOIN subscriptions own_sub ON own_sub.id=ls.subscription_id
    WHERE bi.slot_id=ls.id
      AND ls.owner_user_id=p_user_id
      AND ls.assigned_user_id=p_user_id
      AND ls.mode='CLOUD'
      AND ls.status<>'DELETED'
      AND own_sub.status='ACTIVE'
      AND own_sub.starts_at<=now()
      AND own_sub.expires_at>now()
      AND COALESCE((bi.metrics->>'membershipCutoff')::boolean,false)=true;
  ELSE
    UPDATE bot_instances bi
    SET runtime_stop_state='NONE',
        runtime_stop_requested_at=NULL,
        runtime_stop_confirmed_at=NULL,
        runtime_stop_error=NULL,
        desired_state='STOPPED',
        actual_state='OFFLINE',
        last_seen_at=NULL,
        metrics=(
          COALESCE(bi.metrics,'{}'::jsonb)
          - 'membershipCutoff'
          - 'membershipCutoffAt'
          - 'membershipExpiredAt'
          - 'membershipCutoffReason'
          - 'primaryMembershipExpiredAt'
        )
    WHERE bi.slot_id=p_slot_id
      AND COALESCE((bi.metrics->>'membershipCutoff')::boolean,false)=true;
  END IF;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMIT;
