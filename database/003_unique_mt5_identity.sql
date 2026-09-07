BEGIN;

CREATE TEMP TABLE scenova_duplicate_mt5_losers(
  id uuid PRIMARY KEY
) ON COMMIT DROP;

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
WHERE rn>1;

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

COMMIT;
