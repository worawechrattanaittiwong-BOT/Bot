ALTER TABLE trade_journal
  DROP CONSTRAINT IF EXISTS trade_journal_event_type_check;

ALTER TABLE trade_journal
  ADD CONSTRAINT trade_journal_event_type_check
  CHECK (event_type IN ('ENTRY','EXIT','BASKET'));

CREATE INDEX IF NOT EXISTS idx_trade_journal_basket_stats
  ON trade_journal(bot_instance_id,direction,created_at DESC)
  WHERE event_type='BASKET';
