import fs from "node:fs";

const files = {
  migration: fs.readFileSync("database/035_withdrawal_advanced_security.sql","utf8"),
  risk: fs.readFileSync("apps/api/src/commission-withdrawal-risk.service.ts","utf8"),
  service: fs.readFileSync("apps/api/src/commission-withdrawal.service.ts","utf8"),
  controller: fs.readFileSync("apps/api/src/commission-withdrawal.controller.ts","utf8"),
  security: fs.readFileSync("apps/api/src/security.ts","utf8"),
  admin: fs.readFileSync("apps/web/app/admin/commission/page.tsx","utf8"),
  api: fs.readFileSync("apps/web/lib/api.ts","utf8"),
  deploy: fs.readFileSync("scripts/deploy-hostinger.sh","utf8"),
  compose: fs.readFileSync("infrastructure/linux/docker-compose.hostinger.yml","utf8")
};

function expect(ok, message) {
  if (!ok) {
    console.error("Phase 3 withdrawal contract failed:", message);
    process.exit(1);
  }
}

expect(files.migration.includes("commission_withdrawal_approvals"), "dual approval table missing");
expect(files.migration.includes("commission_withdrawal_alerts"), "anomaly alert table missing");
expect(files.migration.includes("commission_payout_jobs"), "payout job table missing");
expect(files.migration.includes("commission_payout_reconciliation"), "reconciliation table missing");
expect(files.migration.includes("commission_withdrawal_user_controls"), "per-user controls missing");
expect(files.migration.includes("kill_switch_enabled"), "global kill switch missing");
expect(files.migration.includes("dual_approval_threshold_satang"), "dual approval threshold missing");
expect(files.migration.includes("reject_commission_withdrawal_approval_mutation"), "approval immutability missing");
expect(files.migration.includes("reject_commission_payout_reconciliation_mutation"), "reconciliation immutability missing");

expect(files.risk.includes("assessRequestTx"), "fraud risk engine missing");
expect(files.risk.includes("PAYOUT_ACCOUNT_SHARED_ACROSS_USERS"), "shared payout account risk missing");
expect(files.risk.includes("IP_SHARED_ACROSS_WITHDRAWAL_USERS"), "shared IP risk missing");
expect(files.risk.includes("DEVICE_SHARED_ACROSS_WITHDRAWAL_USERS"), "shared device risk missing");
expect(files.risk.includes("recordApprovalTx"), "dual approval engine missing");
expect(files.risk.includes("admin_user_id"), "approval identity missing");
expect(files.risk.includes("maybeEnqueuePayoutTx"), "auto payout queue missing");
expect(files.risk.includes("claimPayout"), "payout worker claim missing");
expect(files.risk.includes("authorizePayout"), "pre-transfer authorization gate missing");
expect(files.risk.includes("Withdrawal Kill Switch is active"), "worker kill-switch gate missing");
expect(files.risk.includes("PAYOUT_RECONCILIATION_MISMATCH"), "reconciliation mismatch alert missing");
expect(files.risk.includes("AUTO_PAYOUT_RECONCILED"), "matched auto payout audit missing");
expect(files.risk.includes("manualReconcilePaid"), "manual reconciliation completion missing");

expect(files.service.includes("approval_count"), "manual paid approval check missing");
expect(files.service.includes("Payout worker กำลังทำงาน"), "manual double-payout guard missing");
expect(files.service.includes("ปิด Kill Switch ก่อนเปิดรับคำขอถอน"), "request reopen kill-switch guard missing");
expect(files.service.includes("await this.stepUp(adminUserId, input)"), "manual reconciliation step-up missing");

expect(files.controller.includes('@Controller("payout-worker")'), "separate payout worker controller missing");
expect(files.controller.includes('@Post("authorize")'), "worker authorization endpoint missing");
expect(files.security.includes("PayoutWorkerGuard"), "separate payout worker auth missing");
expect(files.security.includes("x-payout-worker-key"), "separate payout worker key header missing");

expect(files.api.includes("scenova_device_id"), "stable device risk id missing");
expect(files.api.includes("x-scenova-device-id"), "device risk header missing");
expect(files.admin.includes("Fraud Risk · Dual Approval · Kill Switch"), "phase 3 admin UI missing");
expect(files.admin.includes("ACTIVATE KILL SWITCH"), "kill switch UI missing");
expect(files.admin.includes("Auto Payout"), "auto payout UI missing");
expect(files.admin.includes("Fraud & Reconciliation Alerts"), "alert UI missing");
expect(files.admin.includes("Reconcile as Paid"), "manual reconciliation UI missing");

expect(files.deploy.includes("database/035_withdrawal_advanced_security.sql"), "phase 3 production migration missing");
expect(files.deploy.includes("PAYOUT_WORKER_KEY"), "production payout worker secret generation missing");
expect(files.compose.includes("PAYOUT_WORKER_KEY"), "payout worker secret not passed to API");

console.log("Commission withdrawal Phase 3 contract: PASS");
