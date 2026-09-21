-- Keep Trade Journal identity isolated when one bot instance follows/rebinds
-- to another MT5 account. Deal tickets are not guaranteed to be unique across
-- separate MT5 accounts. This migration is intentionally idempotent because
-- production deploys replay migration files.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid='trade_journal'::regclass
      AND conname='trade_journal_bot_instance_id_deal_ticket_event_type_key'
  ) THEN
    ALTER TABLE trade_journal
      DROP CONSTRAINT trade_journal_bot_instance_id_deal_ticket_event_type_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid='trade_journal'::regclass
      AND conname='trade_journal_instance_account_deal_event_key'
  ) THEN
    ALTER TABLE trade_journal
      ADD CONSTRAINT trade_journal_instance_account_deal_event_key
      UNIQUE(bot_instance_id, mt5_account_id, deal_ticket, event_type);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_trade_journal_account_created
  ON trade_journal(mt5_account_id, created_at DESC);
