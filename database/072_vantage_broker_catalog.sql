-- Vantage-only catalog addition. Do not modify existing brokers, symbols or accounts.
-- Exact names published on Vantage's official MT5 WebTrader server picker:
-- https://webtrader.vantagemarkets.com/?page_id=2 (checked 2026-10-09).
-- This is the published list, not a guarantee of every future/regional server.
INSERT INTO brokers(code,name,active,sort_order)
VALUES ('VANTAGE','Vantage',true,60)
ON CONFLICT (code) DO NOTHING;

-- Preserve spaces and actual non-sequential Live numbers. No guessed names.
-- Authenticated MT5 reports may add other real servers later; manual entry
-- remains supported when a customer's exact server is not yet listed.
INSERT INTO broker_servers(broker_id,server_name,environment,sort_order,active)
SELECT b.id,v.server_name,v.environment,v.sort_order,true
FROM brokers b
CROSS JOIN (VALUES
  ('VantageMarkets-Live','REAL',10),
  ('VantageMarkets-Live 3','REAL',11),
  ('VantageMarkets-Live 4','REAL',12),
  ('VantageMarkets-Live 5','REAL',13),
  ('VantageMarkets-Live 6','REAL',14),
  ('VantageMarkets-Live 7','REAL',15),
  ('VantageMarkets-Live 8','REAL',16),
  ('VantageMarkets-Live 10','REAL',17),
  ('VantageMarkets-Live 11','REAL',18),
  ('VantageMarkets-Live 13','REAL',19),
  ('VantageMarkets-Live 14','REAL',20),
  ('VantageMarkets-Live 15','REAL',21),
  ('VantageMarkets-Live 19','REAL',22),
  ('VantageMarkets-Live 21','REAL',23),
  ('VantageMarketsMU-Live','REAL',24),
  ('VantageMarkets-Demo','DEMO',30),
  ('VantageMarketsMU-Demo','DEMO',31)
) AS v(server_name,environment,sort_order)
WHERE b.code='VANTAGE'
ON CONFLICT (broker_id,server_name) DO NOTHING;
