import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { compare } from "bcryptjs";
import { createHmac, timingSafeEqual } from "crypto";
import { PoolClient } from "pg";
import { CryptoService } from "./security";
import { DbService } from "./db.service";
import { CommissionWithdrawalRiskService } from "./commission-withdrawal-risk.service";

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;

function base32Decode(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of normalized) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("invalid base32 secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number) {
  const buffer = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  buffer.writeUInt32BE(high >>> 0, 0);
  buffer.writeUInt32BE(low, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  const supplied = Buffer.from(code);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const expected = Buffer.from(hotp(secret, counter + offset));
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) {
      return true;
    }
  }
  return false;
}

type StepUp = {
  currentPassword?: string;
  twoFactorCode?: string;
};

@Injectable()
export class CommissionWithdrawalService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly risk: CommissionWithdrawalRiskService
  ) {}

  private async stepUp(userId: string, input: StepUp) {
    const row = await this.db.one(
      `SELECT u.id,u.password_hash,u.status,
              s.totp_secret_ciphertext,s.totp_secret_iv,s.totp_secret_auth_tag,
              s.two_factor_enabled_at
       FROM users u
       LEFT JOIN user_security s ON s.user_id=u.id
       WHERE u.id=$1`,
      [userId]
    );
    if (!row || row.status !== "ACTIVE") throw new ForbiddenException("account unavailable");
    if (!(await compare(String(input.currentPassword || ""), String(row.password_hash || "")))) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (!row.two_factor_enabled_at) {
      throw new ForbiddenException("กรุณาเปิด Two-Factor Authentication ก่อนใช้ระบบถอนเงิน");
    }
    if (!row.totp_secret_ciphertext || !row.totp_secret_iv || !row.totp_secret_auth_tag) {
      throw new ServiceUnavailableException("Two-Factor Authentication configuration is unavailable");
    }
    const secret = this.crypto.decrypt({
      ciphertext: String(row.totp_secret_ciphertext),
      iv: String(row.totp_secret_iv),
      authTag: String(row.totp_secret_auth_tag)
    });
    if (!verifyTotp(secret, String(input.twoFactorCode || "").trim())) {
      throw new BadRequestException("Two-factor code is invalid");
    }
  }

  private normalizeDestination(input: {
    bankCode?: string;
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
  }) {
    const bankCode = String(input.bankCode || "").trim().toUpperCase();
    const bankName = String(input.bankName || "").trim();
    const accountName = String(input.accountName || "").trim();
    const accountNumber = String(input.accountNumber || "").replace(/[^0-9]/g, "");

    if (!/^[A-Z0-9_-]{2,32}$/.test(bankCode)) {
      throw new BadRequestException("Bank code ไม่ถูกต้อง");
    }
    if (bankName.length < 2 || bankName.length > 120) {
      throw new BadRequestException("ชื่อธนาคารไม่ถูกต้อง");
    }
    if (accountName.length < 2 || accountName.length > 180) {
      throw new BadRequestException("ชื่อบัญชีไม่ถูกต้อง");
    }
    if (!/^\d{6,20}$/.test(accountNumber)) {
      throw new BadRequestException("เลขบัญชีต้องเป็นตัวเลข 6-20 หลัก");
    }

    return { bankCode, bankName, accountName, accountNumber };
  }

  private async settingsTx(tx: PoolClient) {
    const result = await tx.query(
      `SELECT requests_enabled,min_amount_satang,max_amount_satang,
              destination_cooldown_hours,updated_at
       FROM commission_withdrawal_settings
       WHERE id=1`
    );
    return result.rows[0];
  }

  private async auditTx(
    tx: PoolClient,
    input: {
      userId?: string | null;
      withdrawalId?: string | null;
      destinationId?: string | null;
      actorType: "USER" | "ADMIN" | "SYSTEM";
      actorLabel?: string | null;
      eventType: string;
      ip?: string | null;
      metadata?: Record<string, unknown>;
    }
  ) {
    await tx.query(
      `INSERT INTO commission_withdrawal_audit(
         user_id,withdrawal_id,destination_id,actor_type,actor_label,event_type,ip_address,metadata
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        input.userId || null,
        input.withdrawalId || null,
        input.destinationId || null,
        input.actorType,
        input.actorLabel || null,
        input.eventType,
        input.ip || null,
        JSON.stringify(input.metadata || {})
      ]
    );
  }

  private async walletIntegrityTx(tx: PoolClient, userId: string) {
    const core = (await tx.query(
      `SELECT
         COALESCE(SUM(pending_delta_satang),0)::bigint AS pending_satang,
         COALESCE(SUM(available_delta_satang),0)::bigint AS available_satang,
         COALESCE(SUM(paid_delta_satang),0)::bigint AS paid_satang
       FROM commission_wallet_ledger
       WHERE beneficiary_user_id=$1`,
      [userId]
    )).rows[0];

    const commissions = (await tx.query(
      `SELECT
         COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='PENDING'),0)::bigint AS pending_satang,
         COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='AVAILABLE'),0)::bigint AS available_satang,
         COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='PAID'),0)::bigint AS paid_satang
       FROM referral_commissions
       WHERE beneficiary_user_id=$1`,
      [userId]
    )).rows[0];

    const withdrawals = (await tx.query(
      `SELECT
         COALESCE(SUM(available_delta_satang),0)::bigint AS available_delta_satang,
         COALESCE(SUM(locked_delta_satang),0)::bigint AS locked_satang,
         COALESCE(SUM(paid_delta_satang),0)::bigint AS paid_satang,
         COALESCE(SUM(available_delta_satang+locked_delta_satang+paid_delta_satang),0)::bigint AS conserved
       FROM commission_withdrawal_ledger
       WHERE user_id=$1`,
      [userId]
    )).rows[0];

    const coreVerified =
      Number(core?.pending_satang || 0) === Number(commissions?.pending_satang || 0) &&
      Number(core?.available_satang || 0) === Number(commissions?.available_satang || 0) &&
      Number(core?.paid_satang || 0) === Number(commissions?.paid_satang || 0);
    const withdrawalVerified = Number(withdrawals?.conserved || 0) === 0;

    if (!coreVerified || !withdrawalVerified) {
      throw new ServiceUnavailableException(
        "Wallet integrity check failed. Withdrawal is paused for this account."
      );
    }

    return {
      commissionAvailableSatang: Number(core?.available_satang || 0),
      withdrawalAvailableDeltaSatang: Number(withdrawals?.available_delta_satang || 0),
      lockedSatang: Number(withdrawals?.locked_satang || 0),
      withdrawalPaidSatang: Number(withdrawals?.paid_satang || 0),
      availableSatang:
        Number(core?.available_satang || 0) +
        Number(withdrawals?.available_delta_satang || 0)
    };
  }

  async customerState(userId: string) {
    await this.db.query(
      `UPDATE commission_payout_destinations
       SET status='ACTIVE',updated_at=now()
       WHERE user_id=$1
         AND status='PENDING_COOLDOWN'
         AND usable_at<=now()`,
      [userId]
    );

    const [settings, destination, totals, recent] = await Promise.all([
      this.db.one(
        `SELECT requests_enabled,min_amount_satang,max_amount_satang,
                destination_cooldown_hours,kill_switch_enabled,kill_switch_reason,
                updated_at
         FROM commission_withdrawal_settings WHERE id=1`
      ),
      this.db.one(
        `SELECT id,bank_code,bank_name,account_name,account_last4,status,usable_at,created_at
         FROM commission_payout_destinations
         WHERE user_id=$1 AND status IN ('PENDING_COOLDOWN','ACTIVE')
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
      this.db.one(
        `SELECT
           COALESCE(SUM(available_delta_satang),0)::bigint AS available_delta_satang,
           COALESCE(SUM(locked_delta_satang),0)::bigint AS locked_satang,
           COALESCE(SUM(paid_delta_satang),0)::bigint AS paid_satang,
           COALESCE(SUM(available_delta_satang+locked_delta_satang+paid_delta_satang),0)::bigint AS conserved,
           COUNT(*)::int AS entry_count
         FROM commission_withdrawal_ledger
         WHERE user_id=$1`,
        [userId]
      ),
      this.db.query(
        `SELECT w.id,w.amount_satang,w.currency,w.status,w.review_reason,
                w.created_at,w.updated_at,w.approved_at,w.rejected_at,w.paid_at,
                w.payout_reference,
                d.bank_code,d.bank_name,d.account_name,d.account_last4
         FROM commission_withdrawals w
         JOIN commission_payout_destinations d ON d.id=w.destination_id
         WHERE w.user_id=$1
         ORDER BY w.created_at DESC
         LIMIT 30`,
        [userId]
      )
    ]);

    return {
      settings: {
        requestsEnabled: Boolean(settings?.requests_enabled),
        minAmountSatang: Number(settings?.min_amount_satang || 10000),
        maxAmountSatang: Number(settings?.max_amount_satang || 5000000),
        destinationCooldownHours: Number(settings?.destination_cooldown_hours || 24),
        killSwitchEnabled: Boolean(settings?.kill_switch_enabled),
        killSwitchReason: settings?.kill_switch_reason || null
      },
      destination: destination ? {
        id: destination.id,
        bankCode: destination.bank_code,
        bankName: destination.bank_name,
        accountName: destination.account_name,
        maskedAccount: "••••" + destination.account_last4,
        status: destination.status,
        usableAt: destination.usable_at,
        createdAt: destination.created_at
      } : null,
      availableDeltaSatang: Number(totals?.available_delta_satang || 0),
      lockedSatang: Number(totals?.locked_satang || 0),
      paidSatang: Number(totals?.paid_satang || 0),
      entryCount: Number(totals?.entry_count || 0),
      conserved: Number(totals?.conserved || 0) === 0,
      recent: recent.rows
    };
  }

  async saveDestination(
    userId: string,
    input: {
      bankCode?: string;
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      currentPassword?: string;
      twoFactorCode?: string;
    },
    ip?: string | null
  ) {
    await this.stepUp(userId, input);
    const destination = this.normalizeDestination(input);
    const encrypted = this.crypto.encrypt(destination.accountNumber);
    const accountHash = this.crypto.sha256(
      destination.bankCode + ":" + destination.accountNumber
    );

    return this.db.transaction(async tx => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
      const open = (await tx.query(
        `SELECT id FROM commission_withdrawals
         WHERE user_id=$1 AND status IN ('REQUESTED','HOLD','APPROVED')
         LIMIT 1`,
        [userId]
      )).rows[0];
      if (open) {
        throw new ConflictException("มีรายการถอนที่กำลังดำเนินการอยู่ จึงยังเปลี่ยนบัญชีรับเงินไม่ได้");
      }

      const settings = await this.settingsTx(tx);
      await tx.query(
        `UPDATE commission_payout_destinations
         SET status='DISABLED',disabled_at=now(),updated_at=now()
         WHERE user_id=$1 AND status IN ('PENDING_COOLDOWN','ACTIVE')`,
        [userId]
      );

      const row = (await tx.query(
        `INSERT INTO commission_payout_destinations(
           user_id,bank_code,bank_name,account_name,
           account_ciphertext,account_iv,account_auth_tag,account_last4,account_hash,
           status,usable_at
         ) VALUES(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,
           CASE WHEN $10::int=0 THEN 'ACTIVE' ELSE 'PENDING_COOLDOWN' END,
           now()+make_interval(hours=>$10::int)
         )
         RETURNING id,bank_code,bank_name,account_name,account_last4,status,usable_at,created_at`,
        [
          userId,
          destination.bankCode,
          destination.bankName,
          destination.accountName,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          destination.accountNumber.slice(-4),
          accountHash,
          Number(settings?.destination_cooldown_hours || 24)
        ]
      )).rows[0];

      await this.auditTx(tx, {
        userId,
        destinationId: row.id,
        actorType: "USER",
        actorLabel: userId,
        eventType: "DESTINATION_SAVED",
        ip,
        metadata: {
          bankCode: row.bank_code,
          accountLast4: row.account_last4,
          usableAt: row.usable_at
        }
      });

      return {
        id: row.id,
        bankCode: row.bank_code,
        bankName: row.bank_name,
        accountName: row.account_name,
        maskedAccount: "••••" + row.account_last4,
        status: row.status,
        usableAt: row.usable_at
      };
    });
  }

  async requestWithdrawal(
    userId: string,
    input: {
      destinationId?: string;
      amountSatang?: number;
      clientRequestKey?: string;
      currentPassword?: string;
      twoFactorCode?: string;
    },
    ip?: string | null,
    deviceId?: string | null
  ) {
    const amountSatang = Math.trunc(Number(input.amountSatang || 0));
    const requestKey = String(input.clientRequestKey || "").trim();
    if (requestKey.length < 12 || requestKey.length > 100) {
      throw new BadRequestException("invalid withdrawal request key");
    }

    const previous = await this.db.one(
      `SELECT id,status,amount_satang,created_at
       FROM commission_withdrawals
       WHERE user_id=$1 AND client_request_key=$2
       LIMIT 1`,
      [userId, requestKey]
    );
    if (previous) {
      return {
        id: previous.id,
        status: previous.status,
        amountSatang: Number(previous.amount_satang),
        createdAt: previous.created_at,
        duplicate: true
      };
    }

    await this.stepUp(userId, input);

    return this.db.transaction(async tx => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);

      const duplicate = (await tx.query(
        `SELECT id,status,amount_satang,created_at
         FROM commission_withdrawals
         WHERE user_id=$1 AND client_request_key=$2
         LIMIT 1`,
        [userId, requestKey]
      )).rows[0];
      if (duplicate) {
        return {
          id: duplicate.id,
          status: duplicate.status,
          amountSatang: Number(duplicate.amount_satang),
          createdAt: duplicate.created_at,
          duplicate: true
        };
      }

      const settings = await this.settingsTx(tx);
      if (!settings?.requests_enabled) {
        throw new ForbiddenException("ระบบรับคำขอถอนถูก Pause โดยผู้ดูแล");
      }
      const min = Number(settings.min_amount_satang);
      const max = Number(settings.max_amount_satang);
      if (amountSatang < min || amountSatang > max) {
        throw new BadRequestException(
          `จำนวนถอนต้องอยู่ระหว่าง ${(min / 100).toFixed(2)} - ${(max / 100).toFixed(2)} THB`
        );
      }

      const open = (await tx.query(
        `SELECT id,status FROM commission_withdrawals
         WHERE user_id=$1 AND status IN ('REQUESTED','HOLD','APPROVED')
         LIMIT 1`,
        [userId]
      )).rows[0];
      if (open) {
        throw new ConflictException("มีรายการถอนที่กำลังดำเนินการอยู่แล้ว");
      }

      const destination = (await tx.query(
        `SELECT id,status,usable_at,bank_code,bank_name,account_name,account_last4
         FROM commission_payout_destinations
         WHERE id=$1 AND user_id=$2 AND status IN ('PENDING_COOLDOWN','ACTIVE')
         FOR UPDATE`,
        [String(input.destinationId || ""), userId]
      )).rows[0];
      if (!destination) throw new BadRequestException("ไม่พบบัญชีรับเงิน");
      if (new Date(destination.usable_at).getTime() > Date.now()) {
        throw new ForbiddenException("บัญชีรับเงินยังอยู่ใน Cooling Period");
      }
      if (destination.status === "PENDING_COOLDOWN") {
        await tx.query(
          "UPDATE commission_payout_destinations SET status='ACTIVE',updated_at=now() WHERE id=$1",
          [destination.id]
        );
      }

      const integrity = await this.walletIntegrityTx(tx, userId);
      if (amountSatang > integrity.availableSatang) {
        throw new BadRequestException("ยอด Available ไม่เพียงพอ");
      }

      const risk = await this.risk.assessRequestTx(tx, {
        userId,
        destinationId: destination.id,
        amountSatang,
        availableSatang: integrity.availableSatang,
        ip: ip || null,
        deviceId: deviceId || null
      });

      const row = (await tx.query(
        `INSERT INTO commission_withdrawals(
           user_id,destination_id,amount_satang,currency,status,client_request_key,request_ip,
           request_device_hash,risk_score,risk_level,risk_reasons,approval_required,approval_count
         ) VALUES(
           $1,$2,$3,'THB',$4,$5,$6,$7,$8,$9,$10::jsonb,$11,0
         )
         RETURNING id,status,amount_satang,created_at,risk_score,risk_level,approval_required`,
        [
          userId,
          destination.id,
          amountSatang,
          risk.autoHold ? "HOLD" : "REQUESTED",
          requestKey,
          ip || null,
          risk.deviceHash,
          risk.score,
          risk.level,
          JSON.stringify(risk.reasons),
          risk.approvalRequired
        ]
      )).rows[0];

      await this.risk.createRiskAlertTx(tx, {
        withdrawalId: row.id,
        userId,
        score: risk.score,
        level: risk.level,
        reasons: risk.reasons
      });

      await tx.query(
        `INSERT INTO commission_withdrawal_ledger(
           entry_key,user_id,withdrawal_id,event_type,
           available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
         ) VALUES($1,$2,$3,'LOCK',$4,$5,0,'THB',$6::jsonb)`,
        [
          "lock:" + row.id,
          userId,
          row.id,
          -amountSatang,
          amountSatang,
          JSON.stringify({
            destinationId: destination.id,
            bankCode: destination.bank_code,
            accountLast4: destination.account_last4
          })
        ]
      );

      await this.auditTx(tx, {
        userId,
        withdrawalId: row.id,
        destinationId: destination.id,
        actorType: "USER",
        actorLabel: userId,
        eventType: "WITHDRAWAL_REQUESTED",
        ip,
        metadata: {
          amountSatang,
          riskScore: Number(row.risk_score || 0),
          riskLevel: row.risk_level,
          approvalRequired: Number(row.approval_required || 1)
        }
      });

      return {
        id: row.id,
        status: row.status,
        amountSatang: Number(row.amount_satang),
        createdAt: row.created_at,
        riskScore: Number(row.risk_score || 0),
        riskLevel: row.risk_level,
        approvalRequired: Number(row.approval_required || 1),
        duplicate: false
      };
    });
  }

  async cancelWithdrawal(userId: string, withdrawalId: string, ip?: string | null) {
    return this.db.transaction(async tx => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
      const row = (await tx.query(
        `SELECT id,user_id,destination_id,amount_satang,status
         FROM commission_withdrawals
         WHERE id=$1 AND user_id=$2
         FOR UPDATE`,
        [withdrawalId, userId]
      )).rows[0];
      if (!row) throw new NotFoundException("ไม่พบรายการถอน");
      if (row.status !== "REQUESTED") {
        throw new ConflictException("ยกเลิกได้เฉพาะรายการที่ยังรอตรวจสอบ");
      }

      await tx.query(
        `UPDATE commission_withdrawals
         SET status='CANCELLED',updated_at=now()
         WHERE id=$1`,
        [row.id]
      );
      await tx.query(
        `INSERT INTO commission_withdrawal_ledger(
           entry_key,user_id,withdrawal_id,event_type,
           available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
         ) VALUES($1,$2,$3,'UNLOCK',$4,$5,0,'THB',$6::jsonb)
         ON CONFLICT(entry_key) DO NOTHING`,
        [
          "cancel:" + row.id,
          userId,
          row.id,
          Number(row.amount_satang),
          -Number(row.amount_satang),
          JSON.stringify({ reason: "CUSTOMER_CANCELLED" })
        ]
      );
      await this.auditTx(tx, {
        userId,
        withdrawalId: row.id,
        destinationId: row.destination_id,
        actorType: "USER",
        actorLabel: userId,
        eventType: "WITHDRAWAL_CANCELLED",
        ip
      });
      return { cancelled: true };
    });
  }

  async adminDashboard() {
    const [settings, summary, items, audit, advanced] = await Promise.all([
      this.db.one(
        `SELECT requests_enabled,min_amount_satang,max_amount_satang,
                destination_cooldown_hours,updated_by,updated_at
         FROM commission_withdrawal_settings WHERE id=1`
      ),
      this.db.one(
        `SELECT
           COUNT(*) FILTER (WHERE status='REQUESTED')::int AS requested_count,
           COUNT(*) FILTER (WHERE status='HOLD')::int AS hold_count,
           COUNT(*) FILTER (WHERE status='APPROVED')::int AS approved_count,
           COUNT(*) FILTER (WHERE status='PAID')::int AS paid_count,
           COALESCE(SUM(amount_satang) FILTER (WHERE status IN ('REQUESTED','HOLD','APPROVED')),0)::bigint AS locked_satang,
           COALESCE(SUM(amount_satang) FILTER (WHERE status='PAID'),0)::bigint AS paid_satang
         FROM commission_withdrawals`
      ),
      this.db.query(
        `SELECT
           w.id,w.user_id,u.user_code,u.email,w.amount_satang,w.currency,w.status,
           w.review_reason,w.reviewed_by,w.reviewed_at,w.approved_at,w.rejected_at,
           w.paid_at,w.payout_reference,w.created_at,w.updated_at,
           w.risk_score,w.risk_level,w.risk_reasons,w.approval_required,w.approval_count,
           w.auto_payout_eligible,w.reconciliation_status,
           d.id AS destination_id,d.bank_code,d.bank_name,d.account_name,d.account_last4,
           d.status AS destination_status,d.usable_at,
           (SELECT count(DISTINCT d2.user_id)::int
            FROM commission_payout_destinations d2
            WHERE d2.account_hash=d.account_hash) AS shared_account_users
         FROM commission_withdrawals w
         JOIN users u ON u.id=w.user_id
         JOIN commission_payout_destinations d ON d.id=w.destination_id
         ORDER BY
           CASE w.status
             WHEN 'REQUESTED' THEN 0
             WHEN 'HOLD' THEN 1
             WHEN 'APPROVED' THEN 2
             ELSE 3
           END,
           w.created_at DESC
         LIMIT 120`
      ),
      this.db.query(
        `SELECT a.id,a.user_id,u.user_code,a.withdrawal_id,a.destination_id,
                a.actor_type,a.actor_label,a.event_type,a.ip_address,a.metadata,a.created_at
         FROM commission_withdrawal_audit a
         LEFT JOIN users u ON u.id=a.user_id
         ORDER BY a.created_at DESC
         LIMIT 100`
      ),
      this.risk.adminOverview()
    ]);

    return {
      settings: {
        requestsEnabled: Boolean(settings?.requests_enabled),
        minAmountSatang: Number(settings?.min_amount_satang || 10000),
        maxAmountSatang: Number(settings?.max_amount_satang || 5000000),
        destinationCooldownHours: Number(settings?.destination_cooldown_hours || 24),
        updatedBy: settings?.updated_by || null,
        updatedAt: settings?.updated_at || null
      },
      summary: {
        requestedCount: Number(summary?.requested_count || 0),
        holdCount: Number(summary?.hold_count || 0),
        approvedCount: Number(summary?.approved_count || 0),
        paidCount: Number(summary?.paid_count || 0),
        lockedSatang: Number(summary?.locked_satang || 0),
        paidSatang: Number(summary?.paid_satang || 0)
      },
      items: items.rows.map((row: any) => ({
        ...row,
        amount_satang: Number(row.amount_satang || 0),
        masked_account: "••••" + String(row.account_last4 || ""),
        shared_account_users: Number(row.shared_account_users || 0)
      })),
      audit: audit.rows,
      phase3: advanced
    };
  }

  async updateSettings(
    actor: string,
    input: {
      requestsEnabled?: boolean;
      minAmountSatang?: number;
      maxAmountSatang?: number;
      destinationCooldownHours?: number;
    }
  ) {
    const min = Math.trunc(Number(input.minAmountSatang || 0));
    const max = Math.trunc(Number(input.maxAmountSatang || 0));
    const cooldown = Math.trunc(Number(input.destinationCooldownHours || 0));
    if (min < 100 || max < min || max > 1000000000) {
      throw new BadRequestException("Withdrawal limits ไม่ถูกต้อง");
    }
    if (cooldown < 0 || cooldown > 720) {
      throw new BadRequestException("Cooling Period ต้องอยู่ระหว่าง 0-720 ชั่วโมง");
    }

    const row = await this.db.one(
      `UPDATE commission_withdrawal_settings
       SET requests_enabled=$1,min_amount_satang=$2,max_amount_satang=$3,
           destination_cooldown_hours=$4,updated_by=$5,updated_at=now()
       WHERE id=1
       RETURNING *`,
      [Boolean(input.requestsEnabled), min, max, cooldown, actor]
    );
    return row;
  }

  async hold(withdrawalId: string, actor: string, reason: string, ip?: string | null) {
    return this.reviewStatus(withdrawalId, actor, "HOLD", reason, ip);
  }

  async approve(
    adminUserId: string,
    withdrawalId: string,
    actor: string,
    reason: string,
    ip?: string | null
  ) {
    return this.db.transaction(tx => this.risk.recordApprovalTx(tx, {
      withdrawalId,
      adminUserId,
      adminLabel: actor,
      note: reason,
      ip
    }));
  }

  private async reviewStatus(
    withdrawalId: string,
    actor: string,
    nextStatus: "HOLD" | "APPROVED",
    reason: string,
    ip?: string | null
  ) {
    return this.db.transaction(async tx => {
      const row = (await tx.query(
        `SELECT id,user_id,destination_id,status
         FROM commission_withdrawals WHERE id=$1 FOR UPDATE`,
        [withdrawalId]
      )).rows[0];
      if (!row) throw new NotFoundException("ไม่พบรายการถอน");
      if (!["REQUESTED","HOLD"].includes(row.status)) {
        throw new ConflictException("สถานะรายการไม่อนุญาตให้ทำรายการนี้");
      }

      await tx.query(
        `UPDATE commission_withdrawals
         SET status=$2,review_reason=$3,reviewed_by=$4,reviewed_at=now(),
             approved_at=CASE WHEN $2='APPROVED' THEN now() ELSE approved_at END,
             updated_at=now()
         WHERE id=$1`,
        [row.id, nextStatus, String(reason || "").trim().slice(0, 1000), actor]
      );
      await this.auditTx(tx, {
        userId: row.user_id,
        withdrawalId: row.id,
        destinationId: row.destination_id,
        actorType: "ADMIN",
        actorLabel: actor,
        eventType: nextStatus === "HOLD" ? "WITHDRAWAL_HELD" : "WITHDRAWAL_APPROVED",
        ip,
        metadata: { reason: String(reason || "").trim().slice(0, 1000) }
      });
      return { ok: true };
    });
  }

  async reject(withdrawalId: string, actor: string, reason: string, ip?: string | null) {
    const cleanReason = String(reason || "").trim();
    if (!cleanReason) throw new BadRequestException("กรุณาระบุเหตุผลที่ Reject");

    return this.db.transaction(async tx => {
      const row = (await tx.query(
        `SELECT id,user_id,destination_id,amount_satang,status,approval_count,approval_required
         FROM commission_withdrawals WHERE id=$1 FOR UPDATE`,
        [withdrawalId]
      )).rows[0];
      if (!row) throw new NotFoundException("ไม่พบรายการถอน");
      if (!["REQUESTED","HOLD","APPROVED"].includes(row.status)) {
        throw new ConflictException("รายการนี้ Reject ไม่ได้แล้ว");
      }

      const payoutJob = (await tx.query(
        `SELECT id,status FROM commission_payout_jobs
         WHERE withdrawal_id=$1 FOR UPDATE`,
        [row.id]
      )).rows[0];
      if (payoutJob && ["CLAIMED","SUBMITTED","RECONCILE_REQUIRED"].includes(payoutJob.status)) {
        throw new ConflictException("Payout กำลังทำงานหรือรอ Reconciliation ห้าม Reject/Unlock เพื่อป้องกันจ่ายซ้ำ");
      }
      if (payoutJob?.status === "READY") {
        await tx.query(
          `UPDATE commission_payout_jobs
           SET status='CANCELLED',error_code='ADMIN_REJECT',updated_at=now()
           WHERE id=$1`,
          [payoutJob.id]
        );
      }

      await tx.query(
        `UPDATE commission_withdrawals
         SET status='REJECTED',review_reason=$2,reviewed_by=$3,reviewed_at=now(),
             rejected_at=now(),updated_at=now()
         WHERE id=$1`,
        [row.id, cleanReason.slice(0, 1000), actor]
      );
      await tx.query(
        `INSERT INTO commission_withdrawal_ledger(
           entry_key,user_id,withdrawal_id,event_type,
           available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
         ) VALUES($1,$2,$3,'UNLOCK',$4,$5,0,'THB',$6::jsonb)
         ON CONFLICT(entry_key) DO NOTHING`,
        [
          "reject:" + row.id,
          row.user_id,
          row.id,
          Number(row.amount_satang),
          -Number(row.amount_satang),
          JSON.stringify({ reason: cleanReason.slice(0, 1000), actor })
        ]
      );
      await this.auditTx(tx, {
        userId: row.user_id,
        withdrawalId: row.id,
        destinationId: row.destination_id,
        actorType: "ADMIN",
        actorLabel: actor,
        eventType: "WITHDRAWAL_REJECTED",
        ip,
        metadata: { reason: cleanReason.slice(0, 1000) }
      });
      return { ok: true };
    });
  }

  async markPaid(
    adminUserId: string,
    withdrawalId: string,
    actor: string,
    input: StepUp & { payoutReference?: string },
    ip?: string | null
  ) {
    await this.stepUp(adminUserId, input);
    const reference = String(input.payoutReference || "").trim();
    if (reference.length < 3 || reference.length > 180) {
      throw new BadRequestException("กรุณาใส่ Payment / Transfer Reference");
    }

    return this.db.transaction(async tx => {
      const row = (await tx.query(
        `SELECT id,user_id,destination_id,amount_satang,status,approval_count,approval_required
         FROM commission_withdrawals WHERE id=$1 FOR UPDATE`,
        [withdrawalId]
      )).rows[0];
      if (!row) throw new NotFoundException("ไม่พบรายการถอน");
      if (row.status !== "APPROVED") {
        throw new ConflictException("ต้อง Approve รายการก่อน Mark Paid");
      }
      if (Number(row.approval_count || 0) < Number(row.approval_required || 1)) {
        throw new ConflictException("จำนวนผู้อนุมัติยังไม่ครบ");
      }

      const payoutJob = (await tx.query(
        `SELECT id,status FROM commission_payout_jobs
         WHERE withdrawal_id=$1 FOR UPDATE`,
        [row.id]
      )).rows[0];
      if (payoutJob && ["CLAIMED","SUBMITTED","RECONCILE_REQUIRED"].includes(payoutJob.status)) {
        throw new ConflictException("Payout worker กำลังทำงานหรือรอ Reconciliation ห้าม Mark Paid ซ้ำ");
      }
      if (payoutJob?.status === "READY") {
        await tx.query(
          `UPDATE commission_payout_jobs
           SET status='CANCELLED',error_code='MANUAL_PAYOUT',updated_at=now()
           WHERE id=$1`,
          [payoutJob.id]
        );
      }

      await tx.query(
        `UPDATE commission_withdrawals
         SET status='PAID',paid_at=now(),payout_reference=$2,
             reviewed_by=$3,updated_at=now()
         WHERE id=$1`,
        [row.id, reference, actor]
      );
      await tx.query(
        `INSERT INTO commission_withdrawal_ledger(
           entry_key,user_id,withdrawal_id,event_type,
           available_delta_satang,locked_delta_satang,paid_delta_satang,currency,metadata
         ) VALUES($1,$2,$3,'PAID',0,$4,$5,'THB',$6::jsonb)`,
        [
          "paid:" + row.id,
          row.user_id,
          row.id,
          -Number(row.amount_satang),
          Number(row.amount_satang),
          JSON.stringify({ payoutReference: reference, actor })
        ]
      );
      await this.auditTx(tx, {
        userId: row.user_id,
        withdrawalId: row.id,
        destinationId: row.destination_id,
        actorType: "ADMIN",
        actorLabel: actor,
        eventType: "WITHDRAWAL_PAID",
        ip,
        metadata: { payoutReference: reference }
      });
      return { ok: true };
    });
  }

  async revealDestination(
    adminUserId: string,
    destinationId: string,
    actor: string,
    input: StepUp,
    ip?: string | null
  ) {
    await this.stepUp(adminUserId, input);
    const row = await this.db.one(
      `SELECT id,user_id,bank_code,bank_name,account_name,
              account_ciphertext,account_iv,account_auth_tag,account_last4
       FROM commission_payout_destinations
       WHERE id=$1`,
      [destinationId]
    );
    if (!row) throw new NotFoundException("ไม่พบบัญชีรับเงิน");

    const accountNumber = this.crypto.decrypt({
      ciphertext: String(row.account_ciphertext),
      iv: String(row.account_iv),
      authTag: String(row.account_auth_tag)
    });

    await this.db.query(
      `INSERT INTO commission_withdrawal_audit(
         user_id,destination_id,actor_type,actor_label,event_type,ip_address,metadata
       ) VALUES($1,$2,'ADMIN',$3,'DESTINATION_REVEALED',$4,$5::jsonb)`,
      [
        row.user_id,
        row.id,
        actor,
        ip || null,
        JSON.stringify({ bankCode: row.bank_code, accountLast4: row.account_last4 })
      ]
    );

    return {
      id: row.id,
      bankCode: row.bank_code,
      bankName: row.bank_name,
      accountName: row.account_name,
      accountNumber
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
    return this.risk.updateAdvancedSettings(actor, input);
  }

  async setKillSwitch(enabled: boolean, actor: string, reason: string) {
    return this.risk.setKillSwitch(enabled, actor, reason);
  }

  async setUserControl(
    userId: string,
    actor: string,
    input: { withdrawalPaused?: boolean; pauseReason?: string; dailyLimitSatang?: number | null }
  ) {
    return this.risk.setUserControl(userId, actor, input);
  }

  async resolveAlert(alertId: string, actor: string) {
    return this.risk.resolveAlert(alertId, actor);
  }

  async claimPayout(workerId: string) {
    return this.risk.claimPayout(workerId);
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
    return this.risk.reportPayoutResult(workerId, input);
  }
}
