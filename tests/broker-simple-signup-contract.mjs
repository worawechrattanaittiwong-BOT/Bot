import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const sidebar = read("apps/web/components/OwnerSidebar.tsx");
const dashboard = read("apps/web/app/dashboard/page.tsx");
const signup = read("apps/web/components/ExnessSignupCard.tsx");
const brokerPage = read("apps/web/app/broker/page.tsx");
const brokerService = read("apps/api/src/brokers/broker.service.ts");
const brokerController = read("apps/api/src/brokers/broker.controller.ts");
const migration = read("database/065_broker_signup_simplify.sql");

assert.match(sidebar, /ownerNavItems:[\s\S]*brokerNavItem/);
assert.match(sidebar, /customerNavItems:[^\n]*packagesNavItem, myAccountNavItem/);
assert.doesNotMatch(
  sidebar.match(/export const customerNavItems:[^\n]*/)?.[0] || "",
  /brokerNavItem/
);

assert.match(dashboard, /!isOwner && !data\.account && <ExnessSignupCard\/>/);
assert.match(signup, /Partner Code/);
assert.match(signup, /มือถือ \/ แท็บเล็ต/);
assert.match(signup, /คอมพิวเตอร์/);
assert.match(signup, /platform: mobile \? "MOBILE" : "WEB"/);
assert.match(signup, /ไปสมัคร Exness/);

assert.match(brokerPage, /Exness Partner Setup/);
assert.match(brokerPage, /ลิงก์สำหรับคอมพิวเตอร์/);
assert.match(brokerPage, /ลิงก์สำหรับมือถือ/);
assert.match(brokerPage, /ข้อความสิทธิพิเศษที่ลูกค้าเห็น/);
assert.doesNotMatch(brokerPage, /PHASE [1-4]/);
assert.doesNotMatch(brokerPage, /Partner Verification & Benefits/);
assert.doesNotMatch(brokerPage, /Commission & Rebate/);
assert.doesNotMatch(brokerPage, /API & Automation/);

assert.match(brokerController, /@Get\("exness\/signup"\)/);
assert.match(brokerService, /registrationInfo/);
assert.match(brokerService, /Partner Code/);
assert.match(brokerService, /ลิงก์คอมพิวเตอร์และลิงก์มือถือให้ครบ/);
assert.match(brokerService, /platform === "MOBILE"[\s\S]*row\.mobile_partner_link[\s\S]*row\.web_partner_link/);
const preferredBlock = brokerService.match(/const preferred = platform === "MOBILE"[\s\S]*?;/)?.[0] || "";
assert.doesNotMatch(preferredBlock, /mobile_partner_link\s*\|\|\s*row\.web_partner_link/);
assert.doesNotMatch(preferredBlock, /web_partner_link\s*\|\|\s*row\.mobile_partner_link/);
assert.match(migration, /benefit_message/);

console.log("Broker simple signup contract: PASS");
