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
  UNIQUE(bot_instance_id, mt5_account_id, deal_ticket, event_type)
);

CREATE INDEX IF NOT EXISTS idx_trade_journal_instance_created
  ON trade_journal(bot_instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_journal_instance_exit
  ON trade_journal(bot_instance_id, event_type, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_trade_journal_account_created
  ON trade_journal(mt5_account_id, created_at DESC);
