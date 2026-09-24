import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { PoolClient } from "pg";
import { CryptoService } from "./security";
import { DbService } from "./db.service";

type RequestRiskInput = {
  userId: string;
  destinationId: string;
  amountSatang: number;
  availableSatang: number;
  ip?: string | null;
  deviceId?: string | null;
};

@Injectable()
export class CommissionWithdrawalRiskService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  async settingsTx(tx: PoolClient) {
    return (await tx.query(
      `SELECT requests_enabled,min_amount_satang,max_amount_satang,
              destination_cooldown_hours,kill_switch_enabled,kill_switch_reason,
              global_daily_limit_satang,dual_approval_threshold_satang,
              high_risk_score_threshold,critical_risk_score_threshold,
              risk_engine_enabled,auto_payout_enabled,updated_by,updated_at
       FROM commission_withdrawal_settings
       WHERE id=1`
    )).rows[0];
  }

  private riskLevel(score: number, high: number, critical: number) {
    if (score >= critical) return "CRITICAL";
    if (score >= high) return "HIGH";
    if (score >= 30) return "MEDIUM";
    return "LOW";
  }

  async assessRequestTx(tx: PoolClient, input: RequestRiskInput) {
    const settings = await this.settingsTx(tx);
    if (!settings) throw new ServiceUnavailableException("Withdrawal settings unavailable");
    if (settings.kill_switch_enabled) {
      throw new ForbiddenException(
        settings.kill_switch_reason
          ? "Withdrawal Kill Switch is active: " + String(settings.kill_switch_reason).slice(0, 180)
          : "Withdrawal Kill Switch is active"
      );
    }

    const control = (await tx.query(
      `SELECT withdrawal_paused,pause_reason,daily_limit_satang
       FROM commission_withdrawal_user_controls
       WHERE user_id=$1`,
      [input.userId]
    )).rows[0];
    if (control?.withdrawal_paused) {
      throw new ForbiddenException(
        control.pause_reason
          ? "บัญชีนี้ถูก Pause การถอน: " + String(control.pause_reason).slice(0, 180)
          : "บัญชีนี้ถูก Pause การถอนโดยผู้ดูแล"
      );
    }

    const daily = (await tx.query(
      `SELECT COALESCE(SUM(amount_satang),0)::bigint AS amount
       FROM commission_withdrawals
       WHERE user_id=$1
         AND created_at>=date_trunc('day',now())
         AND status NOT IN ('REJECTED','CANCELLED')`,
      [input.userId]
    )).rows[0];
    const globalDaily = Number(settings.global_daily_limit_satang || 10000000);
    const userDaily = control?.daily_limit_satang == null
      ? globalDaily
      : Math.min(globalDaily, Number(control.daily_limit_satang));
    if (Number(daily?.amount || 0) + input.amountSatang > userDaily) {
      throw new ForbiddenException(
        "ยอดถอนรวมวันนี้เกิน Daily Limit " + (userDaily / 100).toFixed(2) + " THB"
      );
    }

    const normalizedDevice = String(input.deviceId || "").trim();
    const deviceHash = normalizedDevice.length >= 8 && normalizedDevice.length <= 180
      ? this.crypto.sha256(normalizedDevice)
      : null;

    if (!settings.risk_engine_enabled) {
      const approvalRequired =
        input.amountSatang >= Number(settings.dual_approval_threshold_satang || 2000000) ? 2 : 1;
      return {
        score: 0,
        level: "LOW",
        reasons: ["RISK_ENGINE_DISABLED"],
        approvalRequired,
        autoHold: false,
        deviceHash,
        settings
      };
    }

    const destination = (await tx.query(
      `SELECT id,account_hash,created_at
       FROM commission_payout_destinations
       WHERE id=$1 AND user_id=$2`,
      [input.destinationId, input.userId]
    )).rows[0];
    if (!destination) throw new BadRequestException("ไม่พบบัญชีรับเงิน");

    const user = await tx.query("SELECT created_at FROM users WHERE id=$1", [input.userId]);
    const sharedAccount = await tx.query(
      `SELECT count(DISTINCT user_id)::int AS users
       FROM commission_payout_destinations
       WHERE account_hash=$1 AND user_id<>$2`,
      [destination.account_hash, input.userId]
    );
    const sharedIp = input.ip
      ? await tx.query(
          `SELECT count(DISTINCT user_id)::int AS users
           FROM commission_withdrawals
           WHERE request_ip=$1 AND user_id<>$2
             AND created_at>now()-interval '30 days'`,
          [input.ip, input.userId]
        )
      : ({ rows: [{ users: 0 }] } as any);
    const sharedDevice = deviceHash
      ? await tx.query(
          `SELECT count(DISTINCT user_id)::int AS users
           FROM commission_withdrawals
           WHERE request_device_hash=$1 AND user_id<>$2
             AND created_at>now()-interval '30 days'`,
          [deviceHash, input.userId]
        )
      : ({ rows: [{ users: 0 }] } as any);
    const rejected = await tx.query(
      `SELECT count(*)::int AS count
       FROM commission_withdrawals
       WHERE user_id=$1 AND status='REJECTED'
         AND created_at>now()-interval '30 days'`,
      [input.userId]
    );
    const attempts = await tx.query(
      `SELECT count(*)::int AS count
       FROM commission_withdrawals
       WHERE user_id=$1 AND created_at>now()-interval '24 hours'`,
      [input.userId]
    );
    const priorPaid = await tx.query(
      `SELECT count(*)::int AS count
       FROM commission_withdrawals
       WHERE user_id=$1 AND status='PAID'`,
      [input.userId]
    );

    let score = 0;
    const reasons: string[] = [];
    const userCreated = new Date(user.rows[0]?.created_at || 0).getTime();
    const destinationCreated = new Date(destination.created_at || 0).getTime();
    const now = Date.now();

    if (userCreated && now - userCreated < 7 * 24 * 3600_000) {
      score += 20; reasons.push("NEW_ACCOUNT_LT_7D");
    }
    if (destinationCreated && now - destinationCreated < 72 * 3600_000) {
      score += 15; reasons.push("NEW_PAYOUT_DESTINATION_LT_72H");
    }
    if (Number(sharedAccount.rows[0]?.users || 0) > 0) {
      score += 45; reasons.push("PAYOUT_ACCOUNT_SHARED_ACROSS_USERS");
    }
    if (Number(sharedIp.rows[0]?.users || 0) > 0) {
      score += 25; reasons.push("IP_SHARED_ACROSS_WITHDRAWAL_USERS");
    }
    if (Number(sharedDevice.rows[0]?.users || 0) > 0) {
      score += 35; reasons.push("DEVICE_SHARED_ACROSS_WITHDRAWAL_USERS");
    }
    if (input.amountSatang >= Number(settings.dual_approval_threshold_satang || 2000000)) {
      score += 10; reasons.push("HIGH_VALUE_AMOUNT");
    }
    if (input.availableSatang > 0 && input.amountSatang / input.availableSatang >= 0.8) {
      score += 10; reasons.push("WITHDRAWAL_GE_80_PERCENT_AVAILABLE");
    }
    if (Number(rejected.rows[0]?.count || 0) >= 2) {
      score += 15; reasons.push("MULTIPLE_RECENT_REJECTIONS");
    }
    if (Number(attempts.rows[0]?.count || 0) >= 3) {
      score += 10; reasons.push("HIGH_24H_REQUEST_FREQUENCY");
    }
    if (Number(priorPaid.rows[0]?.count || 0) === 0) {
      score += 5; reasons.push("FIRST_WITHDRAWAL");
    }

    score = Math.min(100, score);
    const high = Number(settings.high_risk_score_threshold || 60);
    const critical = Number(settings.critical_risk_score_threshold || 85);
    const level = this.riskLevel(score, high, critical);
    const approvalRequired =
      input.amountSatang >= Number(settings.dual_approval_threshold_satang || 2000000) ||
      score >= high ? 2 : 1;

    return {
      score,
      level,
      reasons: reasons.length ? reasons : ["NO_MATERIAL_RISK_SIGNAL"],
      approvalRequired,
      autoHold: score >= high,
      deviceHash,
      settings
    };
  }

  async createRiskAlertTx(
    tx: PoolClient,
    input: {
      withdrawalId: string;
      userId: string;
      score: number;
      level: string;
      reasons: string[];
    }
  ) {
    if (!["HIGH","CRITICAL"].includes(input.level)) return;
    await tx.query(
      `INSERT INTO commission_withdrawal_alerts(
         withdrawal_id,user_id,severity,alert_type,title,details
       ) VALUES($1,$2,$3,'WITHDRAWAL_RISK','Withdrawal risk requires review',$4::jsonb)`,
      [
        input.withdrawalId,
        input.userId,
        input.level,
        JSON.stringify({ score: input.score, reasons: input.reasons })
      ]
    );
  }

  async recordApprovalTx(
    tx: PoolClient,
    input: {
      withdrawalId: string;
      adminUserId: string;
      adminLabel: string;
      note?: string;
      ip?: string | null;
    }
  ) {
    const admin = (await tx.query(
      `SELECT id,role,status FROM users WHERE id=$1`,
      [input.adminUserId]
    )).rows[0];
    if (!admin || admin.status !== "ACTIVE" || !["OWNER","ADMIN"].includes(String(admin.role))) {
      throw new ForbiddenException("logged-in owner/admin approval is required");
    }

    const withdrawal = (await tx.query(
      `SELECT id,user_id,destination_id,status,approval_required,approval_count,
              amount_satang,risk_score,risk_level
       FROM commission_withdrawals WHERE id=$1 FOR UPDATE`,
      [input.withdrawalId]
    )).rows[0];
    if (!withdrawal) throw new NotFoundException("ไม่พบรายการถอน");
    if (!["REQUESTED","HOLD"].includes(withdrawal.status)) {
      throw new ConflictException("รายการนี้ไม่อยู่ในสถานะรออนุมัติ");
    }

    try {
      await tx.query(
        `INSERT INTO commission_withdrawal_approvals(
           withdrawal_id,admin_user_id,admin_label,note,ip_address
         ) VALUES($1,$2,$3,$4,$5)`,
        [
          input.withdrawalId,
          input.adminUserId,
          input.adminLabel,
          String(input.note || "").trim().slice(0, 1000) || null,
          input.ip || null
        ]
      );
    } catch (error: any) {
      if (String(error?.code || "") === "23505") {
        throw new ConflictException("ผู้ดูแลคนนี้อนุมัติรายการนี้ไปแล้ว ต้องใช้ผู้ดูแลอีกคน");
      }
      throw error;
    }

    const count = Number((await tx.query(
      `SELECT count(*)::int AS count
       FROM commission_withdrawal_approvals
       WHERE withdrawal_id=$1 AND decision='APPROVE'`,
      [input.withdrawalId]
    )).rows[0]?.count || 0);
    const required = Number(withdrawal.approval_required || 1);
    const approved = count >= required;

    await tx.query(
      `UPDATE commission_withdrawals
       SET approval_count=$2,
           status=CASE WHEN $3 THEN 'APPROVED' ELSE 'HOLD' END,
           review_reason=CASE WHEN $3 THEN review_reason ELSE 'AWAITING_SECOND_APPROVAL' END,
           reviewed_by=$4,reviewed_at=now(),
           approved_at=CASE WHEN $3 THEN now() ELSE approved_at END,
           updated_at=now()
       WHERE id=$1`,
      [input.withdrawalId, Math.min(2, count), approved, input.adminLabel]
    );

    await tx.query(
      `INSERT INTO commission_withdrawal_audit(
         user_id,withdrawal_id,destination_id,actor_type,actor_label,event_type,ip_address,metadata
       ) VALUES($1,$2,$3,'ADMIN',$4,$5,$6,$7::jsonb)`,
      [
        withdrawal.user_id,
        input.withdrawalId,
        withdrawal.destination_id,
        input.adminLabel,
        approved ? "WITHDRAWAL_FULLY_APPROVED" : "WITHDRAWAL_APPROVAL_RECORDED",
        input.ip || null,
        JSON.stringify({ approvalCount: count, approvalRequired: required })
      ]
    );

    if (approved) {
      await this.maybeEnqueuePayoutTx(tx, input.withdrawalId);
    }

    return { ok: true, approved, approvalCount: count, approvalRequired: required };
  }

  async maybeEnqueuePayoutTx(tx: PoolClient, withdrawalId: string) {
    const settings = await this.settingsTx(tx);
    const row = (await tx.query(
      `SELECT id,status,risk_score,approval_count,approval_required
       FROM commission_withdrawals WHERE id=$1 FOR UPDATE`,
      [withdrawalId]
    )).rows[0];
    if (!row || row.status !== "APPROVED") return null;

    const eligible =
      Boolean(settings?.auto_payout_enabled) &&
      !Boolean(settings?.kill_switch_enabled) &&
      Number(row.approval_count || 0) >= Number(row.approval_required || 1) &&
      Number(row.risk_score || 0) < Number(settings?.high_risk_score_threshold || 60);

    await tx.query(
      "UPDATE commission_withdrawals SET auto_payout_eligible=$2,updated_at=now() WHERE id=$1",
      [withdrawalId, eligible]
    );
    if (!eligible) return null;

    return (await tx.query(
      `INSERT INTO commission_payout_jobs(withdrawal_id,status)
       VALUES($1,'READY')
       ON CONFLICT(withdrawal_id) DO UPDATE
       SET status=CASE
         WHEN commission_payout_jobs.status IN ('FAILED','CANCELLED') THEN 'READY'
         ELSE commission_payout_jobs.status
       END,
       updated_at=now()
       RETURNING id,status`,
      [withdrawalId]
    )).rows[0];
  }

  async adminOverview() {
    const [settings, alerts, jobs, pausedUsers] = await Promise.all([
      this.db.one(
        `SELECT requests_enabled,kill_switch_enabled,kill_switch_reason,
                global_daily_limit_satang,dual_approval_threshold_satang,
                high_risk_score_threshold,critical_risk_score_threshold,
                risk_engine_enabled,auto_payout_enabled,updated_by,updated_at
         FROM commission_withdrawal_settings WHERE id=1`
      ),
      this.db.query(
        `SELECT a.id,a.withdrawal_id,a.user_id,u.user_code,a.severity,a.alert_type,
                a.status,a.title,a.details,a.resolved_by,a.resolved_at,a.created_at
         FROM commission_withdrawal_alerts a
         LEFT JOIN users u ON u.id=a.user_id
         ORDER BY CASE a.status WHEN 'OPEN' THEN 0 ELSE 1 END,
                  CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
                  a.created_at DESC
         LIMIT 100`
      ),
      this.db.query(
        `SELECT j.id,j.withdrawal_id,j.status,j.worker_id,j.claimed_at,j.claim_expires_at,
                j.provider_reference,j.provider_amount_satang,j.provider_currency,
                j.provider_status,j.error_code,j.error_message,j.attempt_count,j.created_at,j.updated_at,
                w.amount_satang,w.currency,w.risk_score,w.risk_level,u.user_code
         FROM commission_payout_jobs j
         JOIN commission_withdrawals w ON w.id=j.withdrawal_id
         JOIN users u ON u.id=w.user_id
         ORDER BY j.created_at DESC LIMIT 100`
      ),
      this.db.query(
        `SELECT c.user_id,u.user_code,u.email,c.withdrawal_paused,c.pause_reason,
                c.daily_limit_satang,c.updated_by,c.updated_at
         FROM commission_withdrawal_user_controls c
         JOIN users u ON u.id=c.user_id
         WHERE c.withdrawal_paused=true OR c.daily_limit_satang IS NOT NULL
         ORDER BY c.updated_at DESC LIMIT 100`
      )
    ]);

    return {
      advanced: {
        killSwitchEnabled: Boolean(settings?.kill_switch_enabled),
        killSwitchReason: settings?.kill_switch_reason || null,
        globalDailyLimitSatang: Number(settings?.global_daily_limit_satang || 10000000),
        dualApprovalThresholdSatang: Number(settings?.dual_approval_threshold_satang || 2000000),
        highRiskScoreThreshold: Number(settings?.high_risk_score_threshold || 60),
        criticalRiskScoreThreshold: Number(settings?.critical_risk_score_threshold || 85),
        riskEngineEnabled: Boolean(settings?.risk_engine_enabled),
        autoPayoutEnabled: Boolean(settings?.auto_payout_enabled),
        payoutWorkerConfigured: Boolean(process.env.PAYOUT_WORKER_KEY),
        updatedBy: settings?.updated_by || null,
        updatedAt: settings?.updated_at || null
      },
      alerts: alerts.rows,
      payoutJobs: jobs.rows.map((row: any) => ({
        ...row,
        amount_satang: Number(row.amount_satang || 0),
        provider_amount_satang: row.provider_amount_satang == null
          ? null : Number(row.provider_amount_satang)
      })),
      userControls: pausedUsers.rows.map((row: any) => ({
        ...row,
        daily_limit_satang: row.daily_limit_satang == null ? null : Number(row.daily_limit_satang)
      }))
    };
  }

  async updateAdvancedSettings(
    actor: string,
    input: {
      globalDailyLimitSatang?: number;
      dualApprovalThresholdSatang?: number;
      highRiskScoreThreshold?: number;
      criticalRiskScoreThreshold?: number;
      riskEngineEnabled?: boolean;
      autoPayoutEnabled?: boolean;
    }
  ) {
    const globalDaily = Math.trunc(Number(input.globalDailyLimitSatang || 0));
    const dual = Math.trunc(Number(input.dualApprovalThresholdSatang || 0));
    const high = Math.trunc(Number(input.highRiskScoreThreshold || 0));
    const critical = Math.trunc(Number(input.criticalRiskScoreThreshold || 0));
    if (globalDaily < 100 || dual < 100) {
      throw new BadRequestException("Daily limit / dual approval threshold ไม่ถูกต้อง");
    }
    if (high < 1 || high > 99 || critical <= high || critical > 100) {
      throw new BadRequestException("Risk thresholds ไม่ถูกต้อง");
    }
    if (Boolean(input.autoPayoutEnabled) && !process.env.PAYOUT_WORKER_KEY) {
      throw new ForbiddenException("ตั้ง PAYOUT_WORKER_KEY ก่อนเปิด Auto Payout");
    }
    if (Boolean(input.autoPayoutEnabled)) {
      const current = await this.db.one(
        "SELECT kill_switch_enabled FROM commission_withdrawal_settings WHERE id=1"
      );
      if (current?.kill_switch_enabled) {
        throw new ForbiddenException("ปิด Kill Switch ก่อนเปิด Auto Payout");
      }
    }

    return this.db.one(
      `UPDATE commission_withdrawal_settings
       SET global_daily_limit_satang=$1,
           dual_approval_threshold_satang=$2,
           high_risk_score_threshold=$3,
           critical_risk_score_threshold=$4,
           risk_engine_enabled=$5,
           auto_payout_enabled=$6,
           updated_by=$7,updated_at=now()
       WHERE id=1 RETURNING *`,
      [
        globalDaily,
        dual,
        high,
        critical,
        Boolean(input.riskEngineEnabled),
        Boolean(input.autoPayoutEnabled),
        actor
      ]
    );
  }

  async setKillSwitch(enabled: boolean, actor: string, reason: string) {
    const cleanReason = String(reason || "").trim().slice(0, 1000);
    if (enabled && !cleanReason) throw new BadRequestException("กรุณาระบุเหตุผล Kill Switch");
    return this.db.transaction(async tx => {
      const row = (await tx.query(
        `UPDATE commission_withdrawal_settings
         SET kill_switch_enabled=$1,
             kill_switch_reason=CASE WHEN $1 THEN $2 ELSE NULL END,
             kill_switch_triggered_by=CASE WHEN $1 THEN $3 ELSE NULL END,
             kill_switch_triggered_at=CASE WHEN $1 THEN now() ELSE NULL END,
             requests_enabled=CASE WHEN $1 THEN false ELSE requests_enabled END,
             auto_payout_enabled=CASE WHEN $1 THEN false ELSE auto_payout_enabled END,
             updated_by=$3,updated_at=now()
         WHERE id=1 RETURNING *`,
        [enabled, cleanReason || null, actor]
      )).rows[0];

      if (enabled) {
        await tx.query(
          `UPDATE commission_payout_jobs
           SET status='CANCELLED',updated_at=now(),
               error_code='KILL_SWITCH',
               error_message=$1
           WHERE status='READY'`,
          [cleanReason || "Global Kill Switch"]
        );
        await tx.query(
          `INSERT INTO commission_withdrawal_alerts(
             severity,alert_type,title,details
           ) VALUES('CRITICAL','GLOBAL_KILL_SWITCH','Withdrawal Kill Switch activated',$1::jsonb)`,
          [JSON.stringify({ actor, reason: cleanReason })]
        );
      }
      return row;
    });
  }

  async setUserControl(
    userId: string,
    actor: string,
    input: { withdrawalPaused?: boolean; pauseReason?: string; dailyLimitSatang?: number | null }
  ) {
    const user = await this.db.one("SELECT id FROM users WHERE id=$1", [userId]);
    if (!user) throw new NotFoundException("ไม่พบผู้ใช้");
    const daily = input.dailyLimitSatang == null
      ? null
      : Math.trunc(Number(input.dailyLimitSatang));
    if (daily != null && daily < 100) throw new BadRequestException("User daily limit ไม่ถูกต้อง");
    return this.db.one(
      `INSERT INTO commission_withdrawal_user_controls(
         user_id,withdrawal_paused,pause_reason,daily_limit_satang,updated_by,updated_at
       ) VALUES($1,$2,$3,$4,$5,now())
       ON CONFLICT(user_id) DO UPDATE SET
         withdrawal_paused=EXCLUDED.withdrawal_paused,
         pause_reason=EXCLUDED.pause_reason,
         daily_limit_satang=EXCLUDED.daily_limit_satang,
         updated_by=EXCLUDED.updated_by,
         updated_at=now()
       RETURNING *`,
      [
        userId,
        Boolean(input.withdrawalPaused),
        Boolean(input.withdrawalPaused)
          ? String(input.pauseReason || "").trim().slice(0, 1000) || null
          : null,
        daily,
        actor
      ]
    );
  }

  async resolveAlert(alertId: string, actor: string) {
    const row = await this.db.one(
      `UPDATE commission_withdrawal_alerts
       SET status='RESOLVED',resolved_by=$2,resolved_at=now()
       WHERE id=$1 AND status='OPEN'
       RETURNING *`,
      [alertId, actor]
    );
    if (!row) throw new NotFoundException("ไม่พบ Open alert");
    return row;
  }

  async claimPayout(workerId: string) {
    const cleanWorker = String(workerId || "").trim();
    if (!/^[A-Za-z0-9_-]{3,100}$/.test(cleanWorker)) {
      throw new BadRequestException("workerId ไม่ถูกต้อง");
    }

    return this.db.transaction(async tx => {
      const settings = await this.settingsTx(tx);
      if (!settings?.auto_payout_enabled || settings?.kill_switch_enabled) {
        return { job: null, reason: settings?.kill_switch_enabled ? "KILL_SWITCH" : "AUTO_PAYOUT_DISABLED" };
      }

      await tx.query(
        `UPDATE commission_payout_jobs
         SET status='READY',worker_id=NULL,claimed_at=NULL,claim_expires_at=NULL,updated_at=now()
         WHERE status='CLAIMED' AND claim_expires_at<now()`
      );

      const row = (await tx.query(
        `SELECT j.id,j.withdrawal_id,w.user_id,w.destination_id,w.amount_satang,w.currency,
                d.bank_code,d.bank_name,d.account_name,d.account_last4
         FROM commission_payout_jobs j
         JOIN commission_withdrawals w ON w.id=j.withdrawal_id
         JOIN commission_payout_destinations d ON d.id=w.destination_id
         WHERE j.status='READY'
           AND w.status='APPROVED'
           AND w.auto_payout_eligible=true
           AND w.approval_count>=w.approval_required
         ORDER BY j.created_at
         FOR UPDATE OF j SKIP LOCKED
         LIMIT 1`
      )).rows[0];

      if (!row) return { job: null, reason: "QUEUE_EMPTY" };

      await tx.query(
        `UPDATE commission_payout_jobs
         SET status='CLAIMED',worker_id=$2,claimed_at=now(),
             claim_expires_at=now()+interval '5 minutes',
             attempt_count=attempt_count+1,last_attempt_at=now(),updated_at=now()
         WHERE id=$1`,
        [row.id, cleanWorker]
      );
      await tx.query(
        `INSERT INTO commission_payout_reconciliation(
           payout_job_id,withdrawal_id,event_type,expected_amount_satang,expected_currency,metadata
         ) VALUES($1,$2,'CLAIMED',$3,$4,$5::jsonb)`,
        [row.id, row.withdrawal_id, row.amount_satang, row.currency, JSON.stringify({ workerId: cleanWorker })]
      );

      return {
        job: {
          id: row.id,
          withdrawalId: row.withdrawal_id,
          amountSatang: Number(row.amount_satang),
          currency: row.currency,
          destination: {
            bankCode: row.bank_code,
            bankName: row.bank_name,
            accountName: row.account_name,
            maskedAccount: "••••" + String(row.account_last4 || "")
          },
          requiresAuthorization: true,
          claimExpiresInSeconds: 300
        }
      };
    });
  }

  async authorizePayout(workerId: string, jobId: string) {
    return this.db.transaction(async tx => {
      const settings = await this.settingsTx(tx);
      if (!settings?.auto_payout_enabled) {
        throw new ForbiddenException("Auto Payout is disabled");
      }
      if (settings?.kill_switch_enabled) {
        throw new ForbiddenException("Withdrawal Kill Switch is active");
      }

      const row = (await tx.query(
        `SELECT j.id,j.withdrawal_id,j.status,j.worker_id,j.claim_expires_at,
                w.amount_satang,w.currency,w.status AS withdrawal_status,
                w.auto_payout_eligible,w.approval_count,w.approval_required,
                d.bank_code,d.bank_name,d.account_name,
                d.account_ciphertext,d.account_iv,d.account_auth_tag
         FROM commission_payout_jobs j
         JOIN commission_withdrawals w ON w.id=j.withdrawal_id
         JOIN commission_payout_destinations d ON d.id=w.destination_id
         WHERE j.id=$1
         FOR UPDATE OF j,w`,
        [jobId]
      )).rows[0];
      if (!row) throw new NotFoundException("ไม่พบ payout job");
      if (row.worker_id !== workerId) {
        throw new ForbiddenException("payout job belongs to another worker");
      }
      if (row.status !== "CLAIMED") {
        throw new ConflictException("payout job must be CLAIMED before authorization");
      }
      if (!row.claim_expires_at || new Date(row.claim_expires_at).getTime() <= Date.now()) {
        throw new ConflictException("payout claim expired");
      }
      if (
        row.withdrawal_status !== "APPROVED" ||
        !row.auto_payout_eligible ||
        Number(row.approval_count || 0) < Number(row.approval_required || 1)
      ) {
        throw new ForbiddenException("withdrawal is no longer eligible for payout");
      }

      await tx.query(
        `UPDATE commission_payout_jobs
         SET status='SUBMITTED',submitted_at=now(),provider_status='AUTHORIZED',
             updated_at=now()
         WHERE id=$1`,
        [row.id]
      );
      await tx.query(
        `INSERT INTO commission_payout_reconciliation(
           payout_job_id,withdrawal_id,event_type,expected_amount_satang,expected_currency,metadata
         ) VALUES($1,$2,'SUBMITTED',$3,$4,$5::jsonb)`,
        [
          row.id,row.withdrawal_id,row.amount_satang,row.currency,
          JSON.stringify({ workerId, stage: "PRE_TRANSFER_AUTHORIZATION" })
        ]
      );

      const accountNumber = this.crypto.decrypt({
        ciphertext: String(row.account_ciphertext),
        iv: String(row.account_iv),
        authTag: String(row.account_auth_tag)
      });

      return {
        authorized: true,
        jobId: row.id,
        withdrawalId: row.withdrawal_id,
        amountSatang: Number(row.amount_satang),
        currency: row.currency,
        destination: {
          bankCode: row.bank_code,
          bankName: row.bank_name,
          accountName: row.account_name,
          accountNumber
        }
      };
    });
  }

  async manualReconcilePaid(
    withdrawalId: string,
    actor: string,
    providerReference: string,
    confirmedAmountSatang: number,
    ip?: string | null
  ) {
    const reference = String(providerReference || "").trim();
    const confirmed = Math.trunc(Number(confirmedAmountSatang || 0));
    if (reference.length < 3 || reference.length > 180) {
      throw new BadRequestException("กรุณาใส่ Provider / Transfer Reference");
    }

    return this.db.transaction(async tx => {
      const row = (await tx.query(
        `SELECT w.id,w.user_id,w.destination_id,w.amount_satang,w.currency,w.status,
                w.reconciliation_status,w.approval_count,w.approval_required,
                j.id AS job_id,j.status AS job_status
         FROM commission_withdrawals w
         JOIN commission_payout_jobs j ON j.withdrawal_id=w.id
         WHERE w.id=$1
         FOR UPDATE OF w,j`,
        [withdrawalId]
      )).rows[0];
      if (!row) throw new NotFoundException("ไม่พบ payout reconciliation");
      if (
        row.status !== "HOLD" ||
        !["MISMATCH","MANUAL_REVIEW"].includes(row.reconciliation_status) ||
        !["RECONCILE_REQUIRED","FAILED"].includes(row.job_status)
      ) {
        throw new ConflictException("รายการนี้ไม่ได้อยู่ในสถานะ Manual Reconciliation");
      }
      if (Number(row.approval_count || 0) < Number(row.approval_required || 1)) {
        throw new ConflictException("Approval เดิมยังไม่ครบ");
      }
      if (confirmed !== Number(row.amount_satang)) {
        throw new BadRequestException("ยอดที่ยืนยันต้องตรงกับยอดถอนเต็มจำนวน");
      }

      await tx.query(
        `UPDATE commission_payout_jobs
         SET status='SUCCEEDED',completed_at=now(),
             provider_reference=$2,provider_amount_satang=$3,
             provider_currency=$4,provider_status='MANUAL_RECONCILED',
             error_code=NULL,error_message=NULL,updated_at=now()
         WHERE id=$1`,
        [row.job_id, reference, confirmed, row.currency]
      );
      await tx.query(
        `UPDATE commission_withdrawals
         SET status='PAID',paid_at=now(),payout_reference=$2,
             reconciliation_status='MATCHED',reconciled_at=now(),
             review_reason='MANUAL_RECONCILIATION_CONFIRMED',updated_at=now()
         WHERE id=$1`,
        [row.id, reference]
      );
      await tx.query(
        `INSERT INTO commission_withdrawal_ledger(
           entry_key,user_id,withdrawal_id,event_type,
           available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
         ) VALUES($1,$2,$3,'PAID',0,$4,$5,$6,$7::jsonb)
         ON CONFLICT(entry_key) DO NOTHING`,
        [
          "manual-reconcile-paid:" + row.id,
          row.user_id,row.id,-Number(row.amount_satang),Number(row.amount_satang),row.currency,
          JSON.stringify({ providerReference: reference, payoutJobId: row.job_id, actor })
        ]
      );
      await tx.query(
        `INSERT INTO commission_payout_reconciliation(
           payout_job_id,withdrawal_id,event_type,provider_reference,
           expected_amount_satang,provider_amount_satang,expected_currency,provider_currency,metadata
         ) VALUES($1,$2,'MATCHED',$3,$4,$5,$6,$6,$7::jsonb)`,
        [
          row.job_id,row.id,reference,row.amount_satang,confirmed,row.currency,
          JSON.stringify({ manual: true, actor })
        ]
      );
      await tx.query(
        `INSERT INTO commission_withdrawal_audit(
           user_id,withdrawal_id,destination_id,actor_type,actor_label,event_type,ip_address,metadata
         ) VALUES($1,$2,$3,'ADMIN',$4,'PAYOUT_MANUAL_RECONCILED',$5,$6::jsonb)`,
        [
          row.user_id,row.id,row.destination_id,actor,ip || null,
          JSON.stringify({ providerReference: reference, confirmedAmountSatang: confirmed })
        ]
      );
      await tx.query(
        `UPDATE commission_withdrawal_alerts
         SET status='RESOLVED',resolved_by=$2,resolved_at=now()
         WHERE withdrawal_id=$1
           AND status='OPEN'
           AND alert_type='PAYOUT_RECONCILIATION_MISMATCH'`,
        [row.id, actor]
      );

      return { ok: true, paid: true, reconciled: true };
    });
  }

  async reportPayoutResult(
    workerId: string,
    input: {
      jobId?: string;
      status?: string;
      providerReference?: string;
      providerAmountSatang?: number;
      providerCurrency?: string;
      providerStatus?: string;
      errorCode?: string;
      errorMessage?: string;
    }
  ) {
    const status = String(input.status || "").toUpperCase();
    if (!["SUBMITTED","SUCCEEDED","FAILED"].includes(status)) {
      throw new BadRequestException("payout result status ไม่ถูกต้อง");
    }

    return this.db.transaction(async tx => {
      const row = (await tx.query(
        `SELECT j.*,w.user_id,w.destination_id,w.amount_satang,w.currency,w.status AS withdrawal_status
         FROM commission_payout_jobs j
         JOIN commission_withdrawals w ON w.id=j.withdrawal_id
         WHERE j.id=$1 FOR UPDATE OF j,w`,
        [String(input.jobId || "")]
      )).rows[0];
      if (!row) throw new NotFoundException("ไม่พบ payout job");
      if (row.worker_id && row.worker_id !== workerId) {
        throw new ForbiddenException("payout job belongs to another worker");
      }
      if (row.status === "SUCCEEDED") return { ok: true, matched: true, duplicate: true };
      if (!["CLAIMED","SUBMITTED"].includes(row.status)) {
        throw new ConflictException("payout job ไม่อยู่ในสถานะรับผลได้");
      }

      const providerReference = String(input.providerReference || "").trim().slice(0, 180) || null;
      const providerAmount = input.providerAmountSatang == null
        ? null : Math.trunc(Number(input.providerAmountSatang));
      const providerCurrency = String(input.providerCurrency || row.currency).toUpperCase().slice(0, 8);

      if (status === "SUBMITTED" && row.status === "SUBMITTED") {
        return { ok: true, submitted: true, duplicate: true };
      }

      if (status === "SUBMITTED") {
        await tx.query(
          `UPDATE commission_payout_jobs
           SET status='SUBMITTED',submitted_at=now(),provider_reference=$2,
               provider_status=$3,updated_at=now()
           WHERE id=$1`,
          [row.id, providerReference, String(input.providerStatus || "SUBMITTED").slice(0, 80)]
        );
        await tx.query(
          `INSERT INTO commission_payout_reconciliation(
             payout_job_id,withdrawal_id,event_type,provider_reference,
             expected_amount_satang,provider_amount_satang,expected_currency,provider_currency,metadata
           ) VALUES($1,$2,'SUBMITTED',$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            row.id,row.withdrawal_id,providerReference,row.amount_satang,providerAmount,
            row.currency,providerCurrency,JSON.stringify({ workerId })
          ]
        );
        return { ok: true, submitted: true };
      }

      if (status === "FAILED") {
        await tx.query(
          `UPDATE commission_payout_jobs
           SET status='FAILED',completed_at=now(),provider_reference=$2,
               provider_status=$3,error_code=$4,error_message=$5,updated_at=now()
           WHERE id=$1`,
          [
            row.id,providerReference,String(input.providerStatus || "FAILED").slice(0,80),
            String(input.errorCode || "").slice(0,80) || null,
            String(input.errorMessage || "").slice(0,1000) || null
          ]
        );
        if (row.withdrawal_status === "APPROVED") {
          await tx.query(
            `UPDATE commission_withdrawals
             SET status='HOLD',reconciliation_status='MANUAL_REVIEW',
                 review_reason='AUTO_PAYOUT_FAILED',updated_at=now()
             WHERE id=$1`,
            [row.withdrawal_id]
          );
        }
        await tx.query(
          `INSERT INTO commission_payout_reconciliation(
             payout_job_id,withdrawal_id,event_type,provider_reference,
             expected_amount_satang,provider_amount_satang,expected_currency,provider_currency,metadata
           ) VALUES($1,$2,'FAILED',$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            row.id,row.withdrawal_id,providerReference,row.amount_satang,providerAmount,
            row.currency,providerCurrency,
            JSON.stringify({ workerId, errorCode: input.errorCode || null })
          ]
        );
        await tx.query(
          `INSERT INTO commission_withdrawal_alerts(
             withdrawal_id,user_id,severity,alert_type,title,details
           ) VALUES($1,$2,'HIGH','AUTO_PAYOUT_FAILED','Auto payout failed',$3::jsonb)`,
          [
            row.withdrawal_id,row.user_id,
            JSON.stringify({ jobId: row.id, errorCode: input.errorCode || null })
          ]
        );
        return { ok: true, failed: true };
      }

      if (!providerReference || providerAmount == null) {
        throw new BadRequestException("SUCCEEDED ต้องมี providerReference และ providerAmountSatang");
      }
      const matched =
        providerAmount === Number(row.amount_satang) &&
        providerCurrency === String(row.currency).toUpperCase();

      if (!matched) {
        await tx.query(
          `UPDATE commission_payout_jobs
           SET status='RECONCILE_REQUIRED',completed_at=now(),provider_reference=$2,
               provider_amount_satang=$3,provider_currency=$4,
               provider_status=$5,updated_at=now()
           WHERE id=$1`,
          [
            row.id,providerReference,providerAmount,providerCurrency,
            String(input.providerStatus || "SUCCEEDED").slice(0,80)
          ]
        );
        await tx.query(
          `UPDATE commission_withdrawals
           SET status='HOLD',reconciliation_status='MISMATCH',
               review_reason='PAYOUT_RECONCILIATION_MISMATCH',updated_at=now()
           WHERE id=$1`,
          [row.withdrawal_id]
        );
        await tx.query(
          `INSERT INTO commission_payout_reconciliation(
             payout_job_id,withdrawal_id,event_type,provider_reference,
             expected_amount_satang,provider_amount_satang,expected_currency,provider_currency,metadata
           ) VALUES($1,$2,'MISMATCH',$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            row.id,row.withdrawal_id,providerReference,row.amount_satang,providerAmount,
            row.currency,providerCurrency,JSON.stringify({ workerId })
          ]
        );
        await tx.query(
          `INSERT INTO commission_withdrawal_alerts(
             withdrawal_id,user_id,severity,alert_type,title,details
           ) VALUES($1,$2,'CRITICAL','PAYOUT_RECONCILIATION_MISMATCH',
                    'Payout amount/currency mismatch',$3::jsonb)`,
          [
            row.withdrawal_id,row.user_id,
            JSON.stringify({
              jobId: row.id,
              expectedAmountSatang: Number(row.amount_satang),
              providerAmountSatang: providerAmount,
              expectedCurrency: row.currency,
              providerCurrency
            })
          ]
        );
        return { ok: true, matched: false, manualReview: true };
      }

      await tx.query(
        `UPDATE commission_payout_jobs
         SET status='SUCCEEDED',completed_at=now(),provider_reference=$2,
             provider_amount_satang=$3,provider_currency=$4,
             provider_status=$5,updated_at=now()
         WHERE id=$1`,
        [
          row.id,providerReference,providerAmount,providerCurrency,
          String(input.providerStatus || "SUCCEEDED").slice(0,80)
        ]
      );
      await tx.query(
        `UPDATE commission_withdrawals
         SET status='PAID',paid_at=now(),payout_reference=$2,
             reconciliation_status='MATCHED',reconciled_at=now(),updated_at=now()
         WHERE id=$1`,
        [row.withdrawal_id, providerReference]
      );
      await tx.query(
        `INSERT INTO commission_withdrawal_ledger(
           entry_key,user_id,withdrawal_id,event_type,
           available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
         ) VALUES($1,$2,$3,'PAID',0,$4,$5,$6,$7::jsonb)
         ON CONFLICT(entry_key) DO NOTHING`,
        [
          "auto-paid:" + row.withdrawal_id,
          row.user_id,
          row.withdrawal_id,
          -Number(row.amount_satang),
          Number(row.amount_satang),
          row.currency,
          JSON.stringify({ providerReference, payoutJobId: row.id, workerId })
        ]
      );
      await tx.query(
        `INSERT INTO commission_payout_reconciliation(
           payout_job_id,withdrawal_id,event_type,provider_reference,
           expected_amount_satang,provider_amount_satang,expected_currency,provider_currency,metadata
         ) VALUES($1,$2,'MATCHED',$3,$4,$5,$6,$7,$8::jsonb)`,
        [
          row.id,row.withdrawal_id,providerReference,row.amount_satang,providerAmount,
          row.currency,providerCurrency,JSON.stringify({ workerId })
        ]
      );
      await tx.query(
        `INSERT INTO commission_withdrawal_audit(
           user_id,withdrawal_id,destination_id,actor_type,actor_label,event_type,metadata
         ) VALUES($1,$2,$3,'SYSTEM',$4,'AUTO_PAYOUT_RECONCILED',$5::jsonb)`,
        [
          row.user_id,row.withdrawal_id,row.destination_id,
          "PAYOUT_WORKER:" + workerId,
          JSON.stringify({ providerReference, payoutJobId: row.id })
        ]
      );
      return { ok: true, matched: true, paid: true };
    });
  }
}
