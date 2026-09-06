CREATE TABLE IF NOT EXISTS brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(64) UNIQUE NOT NULL,
  name varchar(160) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broker_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
  server_name varchar(160) NOT NULL,
  environment varchar(16) NOT NULL DEFAULT 'UNKNOWN'
    CHECK (environment IN ('DEMO','REAL','UNKNOWN')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(broker_id, server_name)
);

INSERT INTO brokers(code,name,sort_order)
VALUES
  ('EXNESS','Exness',10),
  ('ICMARKETS','IC Markets',20),
  ('PEPPERSTONE','Pepperstone',30),
  ('XM','XM',40),
  ('EIGHTCAP','Eightcap',50),
  ('OTHER','Other / อื่นๆ',999)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order;

-- Seed only server names we have actually verified in this project.
-- Additional server names are maintained in the catalog instead of hard-coded in the UI.
INSERT INTO broker_servers(broker_id,server_name,environment,sort_order)
SELECT id,'Exness-MT5Trial6','DEMO',10
FROM brokers
WHERE code='EXNESS'
ON CONFLICT (broker_id,server_name) DO NOTHING;
