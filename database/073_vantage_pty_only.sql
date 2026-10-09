-- Vantage item #6 in MT5: Vantage Markets (Pty) Ltd / VantageMarkets.
-- Restrict only the VANTAGE catalog; do not touch other broker accounts.
UPDATE brokers
SET name='Vantage Markets (Pty) Ltd'
WHERE code='VANTAGE' AND name IS DISTINCT FROM 'Vantage Markets (Pty) Ltd';

-- VantageMarketsMU belongs to a different MT5 brokerage (VIG Group Ltd).
-- Retain historical rows for audit; hide them from the sixth-company catalog.
UPDATE broker_servers AS s
SET active=false
FROM brokers AS b
WHERE s.broker_id=b.id AND b.code='VANTAGE'
  AND s.server_name ILIKE 'VantageMarketsMU-%'
  AND s.active=true;
