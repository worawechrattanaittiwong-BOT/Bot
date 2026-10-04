import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const finance = read("apps/api/src/brokers/broker-finance.service.ts");
const controller = read("apps/api/src/brokers/broker-finance.controller.ts");
const migration = read("database/063_broker_commission_rebate.sql");
const page = read("apps/web/app/broker/page.tsx");
const rebatePanel = read("apps/web/app/broker/components/RebatePanel.tsx");
const adminPanel = read("apps/web/app/broker/components/AdminBrokerFinancePanel.tsx");
const sidebar = read("apps/web/components/OwnerSidebar.tsx");
const referralService = read("apps/api/src/referral.service.ts");

assert.match(migration, /broker_commission_events/);
assert.match(migration, /broker_rebate_entries/);
assert.match(migration, /broker_rebate_wallet_ledger/);
assert.match(migration, /rebate_bps integer NOT NULL DEFAULT 0/);
assert.match(migration, /UNIQUE\(broker_id,external_event_id\)/);
assert.doesNotMatch(migration, /commission_wallet_ledger/);

assert.match(finance, /Math\.floor\(grossCommissionMinor \* rebateBps \/ 10000\)/);
assert.match(finance, /Commission Event นี้ถูกบันทึกแล้ว/);
assert.match(finance, /Rebate จ่ายแล้ว จึง Reverse อัตโนมัติไม่ได้/);
assert.match(finance, /'REBATE_EARN'/);
assert.match(finance, /'REBATE_RELEASE'/);
assert.match(finance, /'REBATE_PAID'/);
assert.match(finance, /'REBATE_REVERSE'/);
assert.doesNotMatch(finance, /commission_wallet_ledger/);

assert.match(controller, /@Controller\("brokers\/exness\/rebates"\)/);
assert.match(controller, /@Controller\("admin\/brokers\/exness\/finance"\)/);
assert.match(controller, /rebate-policies\/:levelCode/);
assert.match(controller, /commissions\/:id\/reverse/);

assert.match(page, /PHASE 3 ACTIVE/);
assert.match(page, /<RebatePanel\/>/);
assert.match(page, /<AdminBrokerFinancePanel\/>/);
assert.match(rebatePanel, /แยกจาก Invite & Earn Wallet/);
assert.match(adminPanel, /Record Confirmed Commission/);
assert.match(adminPanel, /Pending → Available → Paid/);

const brokerMenuCount = (sidebar.match(/key:"broker-center"/g) || []).length;
assert.equal(brokerMenuCount, 1, "Phase 3 must not add another sidebar menu");

assert.match(referralService, /commission_wallet_ledger/);
assert.doesNotMatch(referralService, /broker_rebate_wallet_ledger/);

console.log("Broker Phase 3 contract: PASS");
