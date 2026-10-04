import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const api = read("apps/api/src/brokers/exness-partnership-api.service.ts");
const automation = read("apps/api/src/brokers/broker-automation.service.ts");
const controller = read("apps/api/src/brokers/broker-automation.controller.ts");
const migration = read("database/064_broker_api_automation.sql");
const page = read("apps/web/app/broker/page.tsx");
const panel = read("apps/web/app/broker/components/AdminBrokerAutomationPanel.tsx");
const secrets = read("apps/api/src/runtime-secrets.service.ts");
const sidebar = read("apps/web/components/OwnerSidebar.tsx");
const finance = read("apps/api/src/brokers/broker-finance.service.ts");

assert.match(api, /https:\/\/my\.exnessaffiliates\.com/);
assert.match(api, /\/api\/auth/);
assert.match(api, /\/api\/partner\/summary\//);
assert.match(api, /authorization": "JWT " \+ jwt/);
assert.match(api, /EXNESS_PARTNER_EMAIL/);
assert.match(api, /EXNESS_PARTNER_PASSWORD/);
assert.match(api, /Runtime Secrets Vault|encrypted runtime vault/);
assert.match(api, /กรุณา Test Connection ให้ผ่านก่อนเปิด Automation/);
assert.match(api, /path\.includes\(":\/\/"\)/);
assert.match(api, /authIdentityField/);
assert.match(api, /enabled=false,next_sync_at=NULL/);

assert.match(migration, /enabled boolean NOT NULL DEFAULT false/);
assert.match(migration, /broker_sync_runs/);
assert.match(migration, /sync_lock_token/);
assert.match(migration, /sync_lock_until/);
assert.match(migration, /auth_identity_field/);

assert.match(automation, /SYNC_ALREADY_RUNNING/);
assert.match(automation, /sync_lock_until=now\(\)\+interval '10 minutes'/);
assert.match(automation, /last_test_status='PASS'/);
assert.match(automation, /verifyClientFromApi/);
assert.match(automation, /recordCommission/);
assert.match(automation, /releaseRebate/);
assert.doesNotMatch(automation, /JSON\.stringify\(item\)\.slice/);

assert.match(controller, /@Controller\("admin\/brokers\/exness\/automation"\)/);
assert.match(controller, /@Post\("test"\)/);
assert.match(controller, /@Post\("sync"\)/);

assert.match(page, /PHASE 4 ACTIVE/);
assert.match(page, /<AdminBrokerAutomationPanel\/>/);
assert.match(panel, /Official Exness Partnership API/);
assert.match(panel, /Test Connection/);
assert.match(panel, /Sync Now/);
assert.match(panel, /Auto Verify Partner Clients/);
assert.match(panel, /Auto Import Commission/);
assert.match(panel, /Auto Release Rebate/);

assert.match(secrets, /"BROKER"/);
assert.match(finance, /UNIQUE|ถูกบันทึกแล้ว/);

const brokerMenuCount = (sidebar.match(/key:"broker-center"/g) || []).length;
assert.equal(brokerMenuCount, 1, "Phase 4 must keep one Broker sidebar menu");

console.log("Broker Phase 4 contract: PASS");
