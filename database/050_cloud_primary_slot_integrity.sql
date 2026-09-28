BEGIN;

-- A customer has exactly one primary Cloud slot. Pick the best current
-- runtime as canonical primary. This also repairs the legacy case where an
-- expired PERSONAL row existed first and the current paid runtime was created
-- later as ADDON.
CREATE TEMP TABLE cloud_primary_keep ON COMMIT DROP AS
SELECT owner_user_id, id AS keep_id
FROM (
  SELECT
    ls.owner_user_id,
    ls.id,
    ROW_NUMBER() OVER (
      PARTITION BY ls.owner_user_id
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1
          FROM subscriptions s
          WHERE s.id=ls.subscription_id
            AND s.status='ACTIVE'
            AND s.starts_at<=now()
            AND s.expires_at>now()
        ) THEN 0 ELSE 1 END,
        CASE WHEN ls.slot_type='PERSONAL' THEN 0 ELSE 1 END,
        CASE WHEN EXISTS (
          SELECT 1
          FROM bot_instances bi
          WHERE bi.slot_id=ls.id
            AND bi.mt5_account_id IS NOT NULL
        ) THEN 0 ELSE 1 END,
        ls.updated_at DESC,
        ls.created_at DESC,
        ls.id
    ) AS rn
  FROM license_slots ls
  WHERE ls.mode='CLOUD'
    AND ls.status<>'DELETED'
) ranked
WHERE rn=1;

-- Preserve history by soft-deleting only the old primary marker. Paid orders,
-- subscriptions and audit rows continue to reference the historical slot.
UPDATE license_slots ls
SET status='DELETED',
    updated_at=now(),
    label=CASE
      WHEN COALESCE(ls.label,'')='' THEN 'Archived legacy primary Cloud slot'
      ELSE ls.label
    END
FROM cloud_primary_keep keep
WHERE ls.owner_user_id=keep.owner_user_id
  AND ls.mode='CLOUD'
  AND ls.slot_type='PERSONAL'
  AND ls.status<>'DELETED'
  AND ls.id<>keep.keep_id;

-- If the best current runtime was previously labelled ADDON, promote it to the
-- single primary slot now that the stale PERSONAL row has been archived.
UPDATE license_slots ls
SET slot_type='PERSONAL',
    updated_at=now()
FROM cloud_primary_keep keep
WHERE ls.id=keep.keep_id
  AND ls.slot_type<>'PERSONAL';

-- Re-number visible slots so the primary Cloud slot is always Slot #1 and
-- add-ons continue as #2, #3, ... without duplicate labels.
WITH numbered AS (
  SELECT
    ls.id,
    ROW_NUMBER() OVER (
      PARTITION BY ls.owner_user_id, ls.mode
      ORDER BY
        CASE WHEN ls.slot_type='PERSONAL' THEN 0 ELSE 1 END,
        ls.created_at,
        ls.id
    )::int AS next_number
  FROM license_slots ls
  WHERE ls.status<>'DELETED'
)
UPDATE license_slots ls
SET slot_number=n.next_number,
    updated_at=CASE WHEN ls.slot_number<>n.next_number THEN now() ELSE ls.updated_at END
FROM numbered n
WHERE ls.id=n.id
  AND ls.slot_number<>n.next_number;

-- Prevent the same issue from returning.
CREATE UNIQUE INDEX IF NOT EXISTS uq_license_slots_owner_mode_number_live
  ON license_slots(owner_user_id,mode,slot_number)
  WHERE status<>'DELETED';

CREATE UNIQUE INDEX IF NOT EXISTS uq_license_slots_single_primary_live
  ON license_slots(owner_user_id,mode)
  WHERE status<>'DELETED' AND mode='CLOUD' AND slot_type='PERSONAL';

COMMIT;
