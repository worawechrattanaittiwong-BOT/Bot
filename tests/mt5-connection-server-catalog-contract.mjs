import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const dashboard = read("apps/web/app/dashboard/page.tsx");
const catalog = read("apps/api/src/catalog.controller.ts");
const ea = read("apps/api/src/ea.controller.ts");
const seed = read("database/057_broker_server_catalog_verified.sql");
const deploy = read("scripts/deploy-hostinger.sh");

assert.match(
  catalog,
  /CASE s\.environment WHEN 'REAL' THEN 0 WHEN 'DEMO' THEN 1 ELSE 2 END,[\s\S]*?s\.sort_order,[\s\S]*?lower\(s\.server_name\)/,
  "broker API must return MT5 servers in deterministic REAL -> DEMO -> other order"
);
assert.match(
  dashboard,
  /<optgroup label="REAL \/ LIVE">[\s\S]*?<optgroup label="DEMO \/ TRIAL">/,
  "MT5 server selector must show REAL before DEMO"
);
assert.match(
  dashboard,
  /ไม่พบในรายการ — กรอก Server เอง/,
  "MT5 server selector must retain a manual fallback"
);
assert.match(
  dashboard,
  /brokerCatalog\.filter\(b=>b\.code!=="OTHER"\)/,
  "Other broker must not be duplicated"
);
assert.match(
  dashboard,
  /"scenova-mt5-operation-v1:" \+ userId/,
  "MT5 connect/switch terminal must survive refresh without leaking state across SCENOVA users"
);
assert.match(
  dashboard,
  /localStorage\.removeItem\("scenova-mt5-operation-v1"\)/,
  "legacy unscoped MT5 operation state must never be restored"
);
assert.match(
  dashboard,
  /api\("\/runtime-migration\/status"\)/,
  "active Local/VPS migration must be restored from Server after refresh"
);
assert.match(
  dashboard,
  /const operationTerminal = migrationOperation \|\| serverOperation \|\| cloudUpdateOperation/,
  "active migration must take precedence over stale browser-restored operations"
);
assert.match(
  ea,
  /rememberVerifiedBrokerServer/,
  "successful authenticated MT5 heartbeat must enrich the broker server catalog"
);
assert.match(
  ea,
  /const reportedIdentityMatches =[\s\S]*reportedText\.includes/,
  "LOCAL catalog learning must verify a reported broker identity"
);
assert.match(
  ea,
  /const identityMatches = runtimeMode === "CLOUD" \|\| reportedIdentityMatches/,
  "Cloud may learn the selected broker server only after authenticated runtime heartbeat"
);
assert.match(
  ea,
  /runtimeMode !== "CLOUD" && !reported/,
  "LOCAL must never guess a broker when the terminal does not report one"
);
assert.match(
  ea,
  /reportedServer\.toLowerCase\(\) !== String\(instance\.broker_server\)\.trim\(\)\.toLowerCase\(\)/,
  "MT5 server identity comparison must ignore harmless casing differences"
);
assert.match(
  ea,
  /Broker catalog enrichment must never block a trading heartbeat/,
  "catalog enrichment must fail open without interrupting heartbeat"
);
assert.match(seed, /mt5-1\.pepperstone\.com/, "verified Pepperstone live server seed");
assert.match(seed, /mt5-demo01\.pepperstone\.com/, "verified Pepperstone demo server seed");
assert.match(seed, /EightcapGlobal-Live/, "verified Eightcap live server seed");
assert.match(
  deploy,
  /database\/057_broker_server_catalog_verified\.sql/,
  "production deploy must apply broker server catalog migration"
);

console.log("MT5 connection persistence and broker server catalog contract PASS");
