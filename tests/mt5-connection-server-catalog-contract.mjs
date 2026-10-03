import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const dashboard = read("apps/web/app/dashboard/page.tsx");
const catalog = read("apps/api/src/catalog.controller.ts");
const ea = read("apps/api/src/ea.controller.ts");
const seed = read("database/057_broker_server_catalog_verified.sql");
const deploy = read("scripts/deploy-hostinger.sh");
const worker = read("tools/windows-cloud-worker/Worker/Mt5Runtime.cs");
const workerController = read("apps/api/src/worker.controller.ts");

assert.match(
  catalog,
  /CASE s\.environment WHEN 'REAL' THEN 0 WHEN 'DEMO' THEN 1 ELSE 2 END,[\s\S]*?s\.sort_order,[\s\S]*?lower\(s\.server_name\)/,
  "broker API must return MT5 servers in deterministic REAL -> DEMO -> other order"
);
assert.match(
  dashboard,
  /MT5 Server · ต้องตรงกับบัญชีของคุณทุกตัว/,
  "MT5 server entry must tell the customer that the server name must match exactly"
);
assert.match(
  dashboard,
  /คัดลอกจาก MT5 เช่น Exness-MT5Trial7/,
  "MT5 server entry must instruct the customer to copy the exact terminal server"
);
assert.match(
  dashboard,
  /Trial6, Trial7, Trial14 ใช้แทนกันไม่ได้/,
  "MT5 server entry must explain that similar Trial server numbers are not interchangeable"
);
assert.doesNotMatch(
  dashboard,
  /cloud-mt5-server-menu|<b>REAL \/ LIVE<\/b>|<b>DEMO \/ TRIAL<\/b>/,
  "new MT5 connections must not offer a stale server catalog as clickable choices"
);
assert.match(
  dashboard,
  /cloud-mt5-server-combobox/,
  "MT5 server must remain a single exact-entry field"
);
assert.doesNotMatch(
  dashboard,
  /mt5ServerSearch|customBrokerServer/,
  "MT5 server picker must not require separate search/custom inputs"
);
assert.match(
  dashboard,
  /provisioningFailure = mt5ProvisioningFailureMessage/,
  "MT5 connection UI must surface provisioning failures"
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
  dashboard,
  /localStorage\.removeItem\("scenova-mt5-operation-v1:" \+ userId\)[\s\S]*vpsMigrationProgress\?\.migrationId/,
  "server-backed migration must discard stale browser MT5 operations"
);
assert.ok(
  (dashboard.match(/op\.kind === "LOCAL_MT5_BIND"/g) || []).length >= 2,
  "restored Local MT5 bind must participate in timeout and live-state completion checks"
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
assert.match(
  worker,
  /errorCode = NormalizeRuntimeError\(ex\.Message\)/,
  "Cloud Worker must return precise MT5 provisioning errors"
);
assert.match(
  worker,
  /MT5_AUTH_FAILED[\s\S]*MT5_ACCOUNT_DISABLED[\s\S]*MT5_SERVER_NOT_FOUND/,
  "Cloud Worker must detect common MT5 authentication/server failures"
);
assert.match(
  workerController,
  /\^\[A-Z0-9_\]\{0,96\}\$/,
  "worker API must accept normalized bounded provisioning error codes"
);

console.log("MT5 connection persistence and broker server catalog contract PASS");
