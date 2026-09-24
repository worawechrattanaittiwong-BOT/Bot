import fs from "node:fs";

const files = {
  migration: fs.readFileSync("database/034_secure_withdrawals.sql", "utf8"),
  service: fs.readFileSync("apps/api/src/commission-withdrawal.service.ts", "utf8"),
  controller: fs.readFileSync("apps/api/src/commission-withdrawal.controller.ts", "utf8"),
  referral: fs.readFileSync("apps/api/src/referral.service.ts", "utf8"),
  customer: fs.readFileSync("apps/web/app/referrals/page.tsx", "utf8"),
  admin: fs.readFileSync("apps/web/app/admin/commission/page.tsx", "utf8"),
  sidebar: fs.readFileSync("apps/web/components/OwnerSidebar.tsx", "utf8"),
  deploy: fs.readFileSync("scripts/deploy-hostinger.sh", "utf8")
};

function expect(condition, message) {
  if (!condition) {
    console.error("Withdrawal contract failed:", message);
    process.exit(1);
  }
}

expect(files.migration.includes("commission_withdrawal_ledger"), "withdrawal ledger table missing");
expect(files.migration.includes("commission_withdrawal_audit"), "withdrawal audit table missing");
expect(files.migration.includes("idx_commission_withdrawal_one_open"), "one-open-withdrawal guard missing");
expect(files.migration.includes("idx_commission_payout_one_current"), "one-current-destination guard missing");
expect(files.migration.includes("reject_commission_withdrawal_ledger_mutation"), "append-only withdrawal ledger trigger missing");
expect(files.migration.includes("reject_commission_withdrawal_audit_mutation"), "append-only audit trigger missing");
expect(files.migration.includes("guard_commission_withdrawal_update"), "withdrawal identity/state guard missing");
expect(files.migration.includes("guard_commission_payout_destination_update"), "destination identity/state guard missing");

expect(files.service.includes("FOR UPDATE"), "row locking missing from withdrawal service");
expect(files.service.includes("walletIntegrityTx"), "wallet integrity check missing");
expect(files.service.includes("Current password is incorrect"), "password step-up missing");
expect(files.service.includes("Two-factor code is invalid"), "2FA step-up missing");
expect(files.service.includes("WITHDRAWAL_REQUESTED"), "withdrawal request audit missing");
expect(files.service.includes("WITHDRAWAL_REJECTED"), "withdrawal reject audit missing");
expect(files.service.includes("WITHDRAWAL_PAID"), "withdrawal paid audit missing");
expect(files.service.includes("DESTINATION_REVEALED"), "destination reveal audit missing");
expect(files.service.includes("available_delta_satang"), "available-balance movement missing");
expect(files.service.includes("locked_delta_satang"), "locked-balance movement missing");
expect(files.service.includes("client_request_key"), "idempotency key missing");

expect(files.controller.includes("@UseGuards(JwtGuard)"), "customer withdrawal guard missing");
expect(files.controller.includes("@UseGuards(AdminGuard)"), "admin withdrawal guard missing");
expect(files.controller.includes('Post(":id/paid")'), "mark-paid endpoint missing");
expect(files.controller.includes('Post("destinations/:id/reveal")'), "secure reveal endpoint missing");

expect(files.referral.includes("lockedSatang"), "wallet locked balance missing");
expect(files.referral.includes("withdrawalEnabled"), "withdrawal state missing from referral wallet");
expect(files.customer.includes("Password + 2FA"), "customer security explanation missing");
expect(files.customer.includes("ขอถอนและ Lock ยอด"), "customer withdrawal action missing");
expect(files.admin.includes("Commission & Withdrawal Center"), "admin withdrawal center missing");
expect(files.admin.includes("Mark Paid"), "admin mark-paid control missing");
expect(files.sidebar.includes("/admin/commission"), "admin withdrawal navigation missing");
expect(files.deploy.includes("database/034_secure_withdrawals.sql"), "production migration wiring missing");

console.log("Commission withdrawal Phase 2 contract: PASS");
