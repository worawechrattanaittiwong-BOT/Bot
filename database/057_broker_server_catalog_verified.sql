-- Broker/MT5 server catalog additions verified from broker-owned public surfaces.
-- Keep the catalog conservative: unknown/new servers are learned only after a
-- successful authenticated EA heartbeat, and users can always enter the exact
-- server shown by their broker when it is not listed yet.

WITH verified(code,server_name,environment,sort_order) AS (
  VALUES
    ('PEPPERSTONE','mt5-1.pepperstone.com','REAL',10),
    ('PEPPERSTONE','mt5-demo01.pepperstone.com','DEMO',50),
    ('EIGHTCAP','EightcapGlobal-Live','REAL',10)
)
INSERT INTO broker_servers(broker_id,server_name,environment,sort_order,active)
SELECT b.id,v.server_name,v.environment,v.sort_order,true
FROM verified v
JOIN brokers b ON b.code=v.code
ON CONFLICT (broker_id,server_name) DO UPDATE SET
  environment=EXCLUDED.environment,
  sort_order=EXCLUDED.sort_order,
  active=true;
