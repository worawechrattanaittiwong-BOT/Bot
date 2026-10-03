BEGIN;

-- Exness Technologies Ltd MT5 broker-directory snapshot.
-- This list is broker/MetaTrader directory data, not learned from SCENOVA
-- customer-entered login history. The UI remains editable because brokers can
-- add or retire servers after this snapshot.
WITH directory(code,server_name,environment,sort_order) AS (
  VALUES
    ('EXNESS','Exness-MT5Real','REAL',10),
    ('EXNESS','Exness-MT5Real2','REAL',20),
    ('EXNESS','Exness-MT5Real3','REAL',21),
    ('EXNESS','Exness-MT5Real4','REAL',22),
    ('EXNESS','Exness-MT5Real5','REAL',23),
    ('EXNESS','Exness-MT5Real6','REAL',24),
    ('EXNESS','Exness-MT5Real7','REAL',25),
    ('EXNESS','Exness-MT5Real8','REAL',26),
    ('EXNESS','Exness-MT5Real9','REAL',27),
    ('EXNESS','Exness-MT5Real10','REAL',28),
    ('EXNESS','Exness-MT5Real11','REAL',29),
    ('EXNESS','Exness-MT5Real12','REAL',30),
    ('EXNESS','Exness-MT5Real14','REAL',31),
    ('EXNESS','Exness-MT5Real15','REAL',32),
    ('EXNESS','Exness-MT5Real16','REAL',33),
    ('EXNESS','Exness-MT5Real17','REAL',34),
    ('EXNESS','Exness-MT5Real18','REAL',35),
    ('EXNESS','Exness-MT5Real19','REAL',36),
    ('EXNESS','Exness-MT5Real20','REAL',37),
    ('EXNESS','Exness-MT5Real21','REAL',38),
    ('EXNESS','Exness-MT5Real22','REAL',39),
    ('EXNESS','Exness-MT5Real23','REAL',40),
    ('EXNESS','Exness-MT5Real24','REAL',41),
    ('EXNESS','Exness-MT5Real25','REAL',42),
    ('EXNESS','Exness-MT5Real26','REAL',43),
    ('EXNESS','Exness-MT5Real27','REAL',44),
    ('EXNESS','Exness-MT5Real28','REAL',45),
    ('EXNESS','Exness-MT5Real29','REAL',46),
    ('EXNESS','Exness-MT5Real30','REAL',47),
    ('EXNESS','Exness-MT5Real31','REAL',48),
    ('EXNESS','Exness-MT5Real32','REAL',49),
    ('EXNESS','Exness-MT5Real33','REAL',50),
    ('EXNESS','Exness-MT5Real34','REAL',51),
    ('EXNESS','Exness-MT5Real35','REAL',52),
    ('EXNESS','Exness-MT5Real36','REAL',53),
    ('EXNESS','Exness-MT5Real37','REAL',54),
    ('EXNESS','Exness-MT5Real38','REAL',55),
    ('EXNESS','Exness-MT5Real39','REAL',56),
    ('EXNESS','Exness-MT5Real40','REAL',57),
    ('EXNESS','Exness-MT5Real41','REAL',58),
    ('EXNESS','Exness-MT5Real42','REAL',59),
    ('EXNESS','Exness-MT5Real43','REAL',60),
    ('EXNESS','Exness-MT5Real46','REAL',61),
    ('EXNESS','Exness-MT5Real51','REAL',62),
    ('EXNESS','Exness-MT5Trial','DEMO',200),
    ('EXNESS','Exness-MT5Trial2','DEMO',210),
    ('EXNESS','Exness-MT5Trial3','DEMO',211),
    ('EXNESS','Exness-MT5Trial4','DEMO',212),
    ('EXNESS','Exness-MT5Trial5','DEMO',213),
    ('EXNESS','Exness-MT5Trial6','DEMO',214),
    ('EXNESS','Exness-MT5Trial7','DEMO',215),
    ('EXNESS','Exness-MT5Trial8','DEMO',216),
    ('EXNESS','Exness-MT5Trial9','DEMO',217),
    ('EXNESS','Exness-MT5Trial10','DEMO',218),
    ('EXNESS','Exness-MT5Trial11','DEMO',219),
    ('EXNESS','Exness-MT5Trial12','DEMO',220),
    ('EXNESS','Exness-MT5Trial14','DEMO',221),
    ('EXNESS','Exness-MT5Trial15','DEMO',222),
    ('EXNESS','Exness-MT5Trial16','DEMO',223),
    ('EXNESS','Exness-MT5Trial17','DEMO',224)
)
INSERT INTO broker_servers(broker_id,server_name,environment,sort_order,active)
SELECT b.id,d.server_name,d.environment,d.sort_order,true
FROM directory d
JOIN brokers b ON b.code=d.code
ON CONFLICT (broker_id,server_name) DO UPDATE SET
  environment=EXCLUDED.environment,
  sort_order=EXCLUDED.sort_order,
  active=true;

COMMIT;
