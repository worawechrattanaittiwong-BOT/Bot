import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const benefit = read("apps/api/src/brokers/broker-benefit.service.ts");
const controller = read("apps/api/src/brokers/broker.controller.ts");
const local = read("apps/api/src/local-package.controller.ts");
const cloud = read("apps/api/src/cloud.controller.ts");
const promo = read("apps/api/src/promotion.service.ts");
const migration = read("database/062_broker_partner_benefits.sql");
const sidebar = read("apps/web/components/OwnerSidebar.tsx");
const packagesPage = read("apps/web/app/packages/page.tsx");

assert.match(migration, /broker_partner_clients/);
assert.match(migration, /broker_benefit_levels/);
assert.match(migration, /broker_benefit_order_applications/);
assert.doesNotMatch(migration, /ALTER TABLE\s+local_orders/i);
assert.doesNotMatch(migration, /ALTER TABLE\s+cloud_orders/i);

assert.match(controller, /@Put\("exness\/clients\/:userId"\)/);
assert.match(benefit, /status='VERIFIED'/);
assert.match(benefit, /ต้องเชื่อมบัญชี Exness MT5 ก่อน/);
assert.match(benefit, /safeCheckoutBenefit/);
assert.match(benefit, /return null;[\s\S]*Broker Benefits must never block/);

assert.match(local, /benefitBps >= promoBps/);
assert.match(cloud, /benefitBps >= promoBps/);
assert.match(local, /recordCheckoutBenefit/);
assert.match(cloud, /recordCheckoutBenefit/);
assert.match(promo, /releaseReservation/);

assert.match(packagesPage, /EXNESS PARTNER BENEFIT/);
assert.match(packagesPage, /Math\.max\(partnerDiscountPercent, promoDiscountPercent\)/);
const brokerMenuCount = (sidebar.match(/key:"broker-center"/g) || []).length;
assert.equal(brokerMenuCount, 1, "Broker must remain one sidebar menu item");

console.log("Broker Phase 2 contract: PASS");
