BEGIN;

-- Cloud capacity policy:
-- 1) Pending/creating/review orders never reserve VPS capacity.
-- 2) A paid, still-active Cloud entitlement may reserve one seat before MT5 is connected.
-- 3) Connected OWNER/ADMIN runtimes count only while their EA heartbeat is fresh.
-- 4) Expired customer entitlements stop consuming logical capacity. Worker active_instances
--    remains the physical safety floor until the terminal is actually stopped.
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
  SELECT bi.runner_id,COALESCE(bi.slot_id::text,bi.id::text) AS seat
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

COMMIT;
