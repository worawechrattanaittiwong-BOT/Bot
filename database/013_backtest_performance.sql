CREATE TABLE IF NOT EXISTS backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id uuid REFERENCES license_slots(id) ON DELETE SET NULL,
  title varchar(160) NOT NULL,
  source varchar(24) NOT NULL DEFAULT 'IMPORT' CHECK (source IN ('IMPORT','MT5_TESTER','SAMPLE')),
  symbol varchar(64) NOT NULL DEFAULT 'XAUUSD',
  timeframe varchar(16) NOT NULL DEFAULT 'M5',
  started_at timestamptz,
  ended_at timestamptz,
  initial_deposit numeric(18,2) NOT NULL DEFAULT 0,
  lot numeric(18,8) NOT NULL DEFAULT 0,
  currency varchar(12) NOT NULL DEFAULT 'USD',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  equity_curve jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'COMPLETED',
  is_published boolean NOT NULL DEFAULT false,
  public_slug varchar(96) UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_owner_created
  ON backtest_runs(owner_user_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_slot_created
  ON backtest_runs(slot_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_public
  ON backtest_runs(public_slug)
  WHERE is_published=true AND public_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS backtest_trades (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  trade_index integer NOT NULL,
  opened_at timestamptz,
  closed_at timestamptz,
  direction varchar(8) NOT NULL CHECK (direction IN ('BUY','SELL')),
  volume numeric(18,8) NOT NULL DEFAULT 0,
  open_price numeric(24,10) NOT NULL DEFAULT 0,
  close_price numeric(24,10) NOT NULL DEFAULT 0,
  profit numeric(18,2) NOT NULL DEFAULT 0,
  balance_after numeric(18,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(run_id,trade_index)
);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_run
  ON backtest_trades(run_id,trade_index);
