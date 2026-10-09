-- Vantage-only catalog addition. Do not modify any existing broker or Symbol settings.
INSERT INTO brokers(code,name,active,sort_order)
VALUES ('VANTAGE','Vantage',true,60)
ON CONFLICT (code) DO NOTHING;

-- Exact MT5 server shown by the account holder (space before 15 is significant).
-- Additional servers must come from an authenticated MT5 directory, not guesses.
INSERT INTO broker_servers(broker_id,server_name,environment,sort_order,active)
SELECT id,'VantageMarkets-Live 15','REAL',10,true
FROM brokers
WHERE code='VANTAGE'
ON CONFLICT (broker_id,server_name) DO NOTHING;
