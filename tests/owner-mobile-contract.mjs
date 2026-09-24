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
assert(api.includes("limits?.transfer_amount?.min"), "Omise transfer minimum must use capability limits");
assert(api.includes("status IN ('CREATING','SUBMITTED','REVIEW')"), "Unresolved owner transfers must block duplicate transfer creation");
assert(api.includes("reconcileOwnerTransfers"), "Owner transfers must reconcile with Omise before a new transfer");
assert(api.includes("client_request_key"), "Owner transfer must be idempotent");
assert(migration.includes("idx_owner_omise_transfers_incomplete"), "Unresolved transfer lookup must be indexed");

console.log("Owner Mobile security and payout contract: PASS");
