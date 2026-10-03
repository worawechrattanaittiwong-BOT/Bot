import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = JSON.parse(read("package.json"));
const api = read("apps/api/src/owner-mobile.controller.ts");
const app = read("apps/owner-mobile/App.tsx");
const ownerManagement = read("apps/api/src/owner-management.controller.ts");
const mobileManagement = read("apps/owner-mobile/src/management.tsx");
const mobileUi = read("apps/owner-mobile/src/ui.tsx");
const mobileOps = read("apps/owner-mobile/src/ops.tsx");
const migration = read("database/036_owner_mobile.sql");

assert(
  Array.isArray(root.workspaces) &&
    root.workspaces.includes("apps/api") &&
    root.workspaces.includes("apps/web") &&
    !root.workspaces.includes("apps/owner-mobile") &&
    !root.workspaces.includes("apps/*"),
  "Owner Mobile must stay outside root web/API workspaces"
);

assert(!/process\\.env\\.OMISE_SECRET_KEY|skey_(?:test|live)_/i.test(app), "Omise secret value/access must never be present in mobile app source");
assert(api.includes('process.env.OMISE_SECRET_KEY'), "Omise secret must be read server-side");
assert(api.includes('String(user.role).toUpperCase() !== "OWNER"'), "Enrollment must be OWNER-only");
assert(api.includes("verifyTotp"), "First-device enrollment must require TOTP");
assert(api.includes("MAX_PIN_FAILURES"), "PIN brute-force lockout must remain enabled");
assert(api.includes("SESSION_MINUTES = 30"), "Owner Mobile session lifetime must remain short");
assert(migration.includes("idx_owner_mobile_one_active_device"), "Only one active owner phone may exist");
assert(api.includes("commissionLiability"), "Owner withdrawal must reserve commission liabilities");
assert(api.includes("commission_wallet_ledger"), "Commission liability must use the append-only wallet ledger");
assert(api.includes("commission_withdrawal_ledger"), "Commission liability must include withdrawal lock/paid deltas");
assert(api.includes("OWNER_OMISE_MIN_TRANSFER_SATANG || 3000"), "Owner transfer minimum must default to Omise Thailand API limit");
assert(api.includes("idemp_key: requestKey"), "Omise transfer must use provider-side idempotency");
assert(api.includes("status IN ('CREATING','SUBMITTED','REVIEW')"), "Unresolved owner transfers must block duplicate transfer creation");
assert(api.includes("reconcileOwnerTransfers"), "Owner transfers must reconcile with Omise before a new transfer");
assert(api.includes("client_request_key"), "Owner transfer must be idempotent");
assert(migration.includes("idx_owner_omise_transfers_incomplete"), "Unresolved transfer lookup must be indexed");

assert(mobileUi.includes('["overview", "home", "ภาพรวม"]'), "Owner APK V2 must expose Overview tab");
assert(mobileUi.includes('["trading", "list", "Trading"]'), "Owner APK V2 must expose Trading tab");
assert(mobileUi.includes('["customers", "user", "ลูกค้า"]'), "Owner APK V2 must expose Customers tab");
assert(mobileUi.includes('["finance", "wallet", "การเงิน"]'), "Owner APK V2 must expose Finance tab");
assert(mobileUi.includes('["more", "settings", "เพิ่มเติม"]'), "Owner APK V2 must expose More tab");
assert(mobileOps.includes('/owner-mobile/overview'), "Owner APK Overview must use owner-mobile overview API");
assert(mobileOps.includes('/owner-mobile/trading'), "Owner APK Trading must use owner-mobile trading API");
assert(ownerManagement.includes('@Get("overview")'), "Owner Mobile overview API missing");
assert(ownerManagement.includes('@Get("trading")'), "Owner Mobile trading API missing");
assert(ownerManagement.includes('@Post("accounts/:id/adjust-days")'), "Owner Mobile signed day adjustment API missing");
assert(ownerManagement.includes('@Post("accounts/:id/slots/symbol")'), "Owner Mobile Symbol API missing");
assert(ownerManagement.includes('@Post("accounts/:id/slots/reset-mt5")'), "Owner Mobile MT5 reset API missing");
assert(mobileManagement.includes('เลือกจาก MT5 บัญชีนี้'), "Customer Symbol dropdown must use MT5 account symbols");
assert(mobileManagement.includes('Symbol (เลือกหรือพิมพ์เอง)'), "Customer Symbol field must allow manual entry");
assert(mobileManagement.includes('ลดวัน'), "Customer access must support reducing days");
assert(mobileManagement.includes('รีเซ็ตการเชื่อมต่อ MT5'), "Customer account must expose MT5 reset");
assert(ownerManagement.includes('@Get("system")'), "Owner Mobile system snapshot API missing");
assert(ownerManagement.includes('@Post("system/protection-controls")'), "Owner Mobile Cloud Protection action missing");
assert(ownerManagement.includes('@Post("system/nodes/:runnerId/quarantine")'), "Owner Mobile VPS quarantine action missing");
assert(ownerManagement.includes('@Post("system/maintenance/shutdown")'), "Owner Mobile maintenance shutdown action missing");
assert(ownerManagement.includes('@Post("system/maintenance/resume")'), "Owner Mobile maintenance resume action missing");
assert(ownerManagement.includes("Symbol นี้ไม่มีอยู่ใน Market Watch จริงของบัญชี MT5"), "Owner Mobile typed Symbol must be checked against live Market Watch when available");
assert(mobileOps.includes('title:"ระบบ Cloud"'), "More menu must expose Cloud system controls");
assert(mobileOps.includes('/owner-mobile/system/protection-controls'), "Cloud Protection mobile control missing");
assert(mobileOps.includes('/owner-mobile/system/maintenance/shutdown'), "Maintenance mobile control missing");

console.log("Owner Mobile security and payout contract: PASS");
