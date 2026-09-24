import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const { DbService } = require("../apps/api/dist/db.service.js");
const { CryptoService } = require("../apps/api/dist/security.js");
const { CommissionWithdrawalRiskService } = require("../apps/api/dist/commission-withdrawal-risk.service.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectError(work, message) {
  let failed = false;
  try { await work(); } catch { failed = true; }
  assert(failed, message);
}

process.env.PAYOUT_WORKER_KEY = process.env.PAYOUT_WORKER_KEY || "ci-payout-worker-key-not-for-production";
process.env.CREDENTIAL_MASTER_KEY =
  process.env.CREDENTIAL_MASTER_KEY || "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const db = new DbService();
const crypto = new CryptoService();
const risk = new CommissionWithdrawalRiskService(db, crypto);

const suffix = Date.now().toString(36);
const makeUser = async (prefix, role = "USER") => (await db.one(
  `INSERT INTO users(user_code,email,password_hash,role,status)
   VALUES($1,$2,'ci',$3,'ACTIVE') RETURNING id`,
  ["BOT-" + prefix + "-" + suffix, prefix.toLowerCase() + "-" + suffix + "@scenova.test", role]
)).id;

try {
  const userId = await makeUser("P3USER");
  const sourceId = await makeUser("P3SRC");
  const admin1 = await makeUser("P3ADM1","ADMIN");
  const admin2 = await makeUser("P3ADM2","ADMIN");

  const commission = await db.one(
    `INSERT INTO referral_commissions(
       beneficiary_user_id,source_user_id,source_type,source_id,level,rate_bps,
       gross_amount_satang,commission_amount_satang,currency,status,available_at,metadata
     ) VALUES($1,$2,'CI_PHASE3',gen_random_uuid(),1,700,2000000,100000,'THB','AVAILABLE',now(),'{}'::jsonb)
     RETURNING *`,
    [userId, sourceId]
  );
  await db.query(
    `INSERT INTO commission_wallet_ledger(
       entry_key,beneficiary_user_id,commission_id,event_type,
       pending_delta_satang,available_delta_satang,paid_delta_satang,
       currency,source_type,source_id,level,rate_bps,metadata
     ) VALUES($1,$2,$3,'MIGRATION_SNAPSHOT',0,100000,0,'THB',$4,$5,1,700,'{}'::jsonb)`,
    ["phase3-wallet:" + commission.id,userId,commission.id,commission.source_type,commission.source_id]
  );

  const encrypted = crypto.encrypt("1234567890");
  const destination = await db.one(
    `INSERT INTO commission_payout_destinations(
       user_id,bank_code,bank_name,account_name,
       account_ciphertext,account_iv,account_auth_tag,account_last4,account_hash,status,usable_at
     ) VALUES($1,'CI','CI Bank','Phase 3 User',$2,$3,$4,'7890',$5,'ACTIVE',now())
     RETURNING id`,
    [userId,encrypted.ciphertext,encrypted.iv,encrypted.authTag,crypto.sha256("CI:1234567890")]
  );

  await db.query(
    `UPDATE commission_withdrawal_settings
     SET requests_enabled=true,kill_switch_enabled=false,
         global_daily_limit_satang=10000000,
         dual_approval_threshold_satang=50000,
         high_risk_score_threshold=60,critical_risk_score_threshold=85,
         risk_engine_enabled=true,auto_payout_enabled=true
     WHERE id=1`
  );

  const assessed = await db.transaction(tx => risk.assessRequestTx(tx, {
    userId,
    destinationId: destination.id,
    amountSatang: 60000,
    availableSatang: 100000,
    ip: "203.0.113.10",
    deviceId: "phase3-device-" + suffix
  }));
  assert(assessed.approvalRequired === 2, "high-value withdrawal must require 2 approvals");
  assert(assessed.deviceHash && assessed.deviceHash.length === 64, "device id must be hashed");

  const withdrawal = await db.one(
    `INSERT INTO commission_withdrawals(
       user_id,destination_id,amount_satang,currency,status,client_request_key,request_ip,
       request_device_hash,risk_score,risk_level,risk_reasons,approval_required,approval_count
     ) VALUES($1,$2,60000,'THB','REQUESTED',$3,'203.0.113.10',$4,$5,$6,$7::jsonb,2,0)
     RETURNING id`,
    [
      userId,destination.id,"phase3-dual-"+suffix,assessed.deviceHash,
      assessed.score,assessed.level,JSON.stringify(assessed.reasons)
    ]
  );
  await db.query(
    `INSERT INTO commission_withdrawal_ledger(
       entry_key,user_id,withdrawal_id,event_type,
       available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
     ) VALUES($1,$2,$3,'LOCK',-60000,60000,0,'THB','{}'::jsonb)`,
    ["phase3-lock:"+withdrawal.id,userId,withdrawal.id]
  );

  const first = await db.transaction(tx => risk.recordApprovalTx(tx, {
    withdrawalId: withdrawal.id,
    adminUserId: admin1,
    adminLabel: "ADMIN-1"
  }));
  assert(first.approved === false && first.approvalCount === 1, "first high-value approval must not fully approve");

  await expectError(
    () => db.transaction(tx => risk.recordApprovalTx(tx, {
      withdrawalId: withdrawal.id,
      adminUserId: admin1,
      adminLabel: "ADMIN-1"
    })),
    "same admin must not approve twice"
  );

  const second = await db.transaction(tx => risk.recordApprovalTx(tx, {
    withdrawalId: withdrawal.id,
    adminUserId: admin2,
    adminLabel: "ADMIN-2"
  }));
  assert(second.approved === true && second.approvalCount === 2, "second distinct admin must complete approval");

  const approvedRow = await db.one(
    "SELECT status,approval_count,approval_required,auto_payout_eligible FROM commission_withdrawals WHERE id=$1",
    [withdrawal.id]
  );
  assert(approvedRow.status === "APPROVED", "dual approval must transition to APPROVED");
  assert(approvedRow.auto_payout_eligible === true, "low-enough risk approved item must become auto-payout eligible");

  const claim = await risk.claimPayout("ci-worker-1");
  assert(claim.job?.withdrawalId === withdrawal.id, "worker must claim approved payout");
  assert(!("accountNumber" in claim.job.destination), "claim must not reveal full bank account");
  assert(claim.job.destination.maskedAccount.endsWith("7890"), "claim must expose only masked destination");

  await risk.setKillSwitch(true,"ADMIN-1","CI emergency stop");
  await expectError(
    () => risk.authorizePayout("ci-worker-1", claim.job.id),
    "kill switch must block pre-transfer authorization"
  );

  await risk.setKillSwitch(false,"ADMIN-1","");
  await risk.updateAdvancedSettings("ADMIN-1", {
    globalDailyLimitSatang: 10000000,
    dualApprovalThresholdSatang: 50000,
    highRiskScoreThreshold: 60,
    criticalRiskScoreThreshold: 85,
    riskEngineEnabled: true,
    autoPayoutEnabled: true
  });

  const authorized = await risk.authorizePayout("ci-worker-1", claim.job.id);
  assert(authorized.authorized === true, "worker must receive authorization after kill switch is cleared");
  assert(authorized.destination.accountNumber === "1234567890", "full account must only appear after authorize");

  const paid = await risk.reportPayoutResult("ci-worker-1", {
    jobId: claim.job.id,
    status: "SUCCEEDED",
    providerReference: "CI-PAYOUT-001",
    providerAmountSatang: 60000,
    providerCurrency: "THB",
    providerStatus: "SUCCESS"
  });
  assert(paid.matched === true && paid.paid === true, "matched provider result must finalize PAID");

  const finalPaid = await db.one(
    `SELECT w.status,w.reconciliation_status,j.status AS job_status
     FROM commission_withdrawals w
     JOIN commission_payout_jobs j ON j.withdrawal_id=w.id
     WHERE w.id=$1`,
    [withdrawal.id]
  );
  assert(finalPaid.status === "PAID", "matched payout must mark withdrawal PAID");
  assert(finalPaid.reconciliation_status === "MATCHED", "matched payout must mark reconciliation MATCHED");
  assert(finalPaid.job_status === "SUCCEEDED", "matched payout job must be SUCCEEDED");

  await expectError(
    () => db.query("UPDATE commission_withdrawal_approvals SET note='mutated' WHERE withdrawal_id=$1", [withdrawal.id]),
    "approval records must be append-only"
  );

  const mismatch = await db.one(
    `INSERT INTO commission_withdrawals(
       user_id,destination_id,amount_satang,currency,status,client_request_key,
       risk_score,risk_level,risk_reasons,approval_required,approval_count
     ) VALUES($1,$2,20000,'THB','REQUESTED',$3,10,'LOW','[]'::jsonb,1,0)
     RETURNING id`,
    [userId,destination.id,"phase3-mismatch-"+suffix]
  );
  await db.query(
    `INSERT INTO commission_withdrawal_ledger(
       entry_key,user_id,withdrawal_id,event_type,
       available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
     ) VALUES($1,$2,$3,'LOCK',-20000,20000,0,'THB','{}'::jsonb)`,
    ["phase3-lock:"+mismatch.id,userId,mismatch.id]
  );
  const oneApproval = await db.transaction(tx => risk.recordApprovalTx(tx, {
    withdrawalId: mismatch.id,
    adminUserId: admin1,
    adminLabel: "ADMIN-1"
  }));
  assert(oneApproval.approved === true, "single-approval item must approve");

  const mismatchClaim = await risk.claimPayout("ci-worker-2");
  assert(mismatchClaim.job?.withdrawalId === mismatch.id, "worker must claim second payout");
  await risk.authorizePayout("ci-worker-2", mismatchClaim.job.id);
  const mismatchResult = await risk.reportPayoutResult("ci-worker-2", {
    jobId: mismatchClaim.job.id,
    status: "SUCCEEDED",
    providerReference: "CI-PAYOUT-MISMATCH",
    providerAmountSatang: 19000,
    providerCurrency: "THB",
    providerStatus: "SUCCESS"
  });
  assert(mismatchResult.manualReview === true, "amount mismatch must require manual review");

  const mismatchRow = await db.one(
    `SELECT w.status,w.reconciliation_status,j.status AS job_status
     FROM commission_withdrawals w
     JOIN commission_payout_jobs j ON j.withdrawal_id=w.id
     WHERE w.id=$1`,
    [mismatch.id]
  );
  assert(mismatchRow.status === "HOLD", "reconciliation mismatch must hold withdrawal");
  assert(mismatchRow.reconciliation_status === "MISMATCH", "mismatch status must be recorded");
  assert(mismatchRow.job_status === "RECONCILE_REQUIRED", "mismatch job must require reconciliation");

  const alert = await db.one(
    `SELECT severity,status FROM commission_withdrawal_alerts
     WHERE withdrawal_id=$1 AND alert_type='PAYOUT_RECONCILIATION_MISMATCH'
     ORDER BY created_at DESC LIMIT 1`,
    [mismatch.id]
  );
  assert(alert?.severity === "CRITICAL" && alert?.status === "OPEN", "mismatch must open CRITICAL alert");

  const reconciled = await risk.manualReconcilePaid(
    mismatch.id,
    "ADMIN-1",
    "CI-MANUAL-RECONCILED",
    20000
  );
  assert(reconciled.paid === true && reconciled.reconciled === true, "manual reconciliation must complete paid state");
  const reconciledRow = await db.one(
    "SELECT status,reconciliation_status FROM commission_withdrawals WHERE id=$1",
    [mismatch.id]
  );
  assert(reconciledRow.status === "PAID" && reconciledRow.reconciliation_status === "MATCHED",
    "manual reconciliation must close HOLD as PAID/MATCHED");
  const resolvedAlert = await db.one(
    `SELECT status FROM commission_withdrawal_alerts
     WHERE withdrawal_id=$1 AND alert_type='PAYOUT_RECONCILIATION_MISMATCH'
     ORDER BY created_at DESC LIMIT 1`,
    [mismatch.id]
  );
  assert(resolvedAlert?.status === "RESOLVED", "manual reconciliation must resolve mismatch alert");

  await risk.setUserControl(userId,"ADMIN-1",{
    withdrawalPaused:true,
    pauseReason:"CI fraud review",
    dailyLimitSatang:null
  });
  await expectError(
    () => db.transaction(tx => risk.assessRequestTx(tx, {
      userId,
      destinationId: destination.id,
      amountSatang: 1000,
      availableSatang: 20000,
      ip: "203.0.113.10",
      deviceId: "phase3-device-" + suffix
    })),
    "per-user pause must block withdrawal risk authorization"
  );

  console.log("Commission withdrawal Phase 3 integration: PASS");
} finally {
  await db.onModuleDestroy();
}
