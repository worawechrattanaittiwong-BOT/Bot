import { ConflictException, Injectable } from "@nestjs/common";
import { DbService } from "./db.service";

@Injectable()
export class TrialAuthorizationService {
  constructor(private readonly db: DbService) {}

  private normalizeDays(days: number) {
    const value = Math.trunc(Number(days));
    if (!Number.isFinite(value) || value < 1 || value > 365) {
      throw new ConflictException("Trial days must be between 1 and 365");
    }
    return value;
  }

  async authorizeUser(input: {
    userId: string;
    days: number;
    approvedBy?: string;
    mt5AccountId?: string | null;
    phoneHash?: string | null;
    phoneLast4?: string | null;
    source?: "OWNER" | "SMS";
  }) {
    const days = this.normalizeDays(input.days);
    const user = await this.db.one(
      "SELECT id,user_code,role,status FROM users WHERE id=$1 AND status<>'DELETED'",
      [input.userId]
    );
    if (!user || user.status !== "ACTIVE") {
      throw new ConflictException("SCENOVA user is not active");
    }
    if (user.role === "OWNER" || user.role === "ADMIN") {
      throw new ConflictException("OWNER/ADMIN already has unlimited access");
    }

    const existing = await this.db.one(
      "SELECT id,status,started_at,expires_at FROM trial_grants WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
      [input.userId]
    );
    if (existing) {
      throw new ConflictException("บัญชีนี้เคยได้รับ Trial แล้ว สามารถปรับจำนวนวันของ Trial เดิมได้ แต่ไม่สามารถสร้าง Trial ใหม่ซ้ำ");
    }

    if (input.phoneHash) {
      const phoneOwner = await this.db.one(
        "SELECT user_id FROM trial_authorizations WHERE phone_hash=$1 AND user_id<>$2 LIMIT 1",
        [input.phoneHash, input.userId]
      );
      if (phoneOwner) {
        throw new ConflictException("เบอร์โทรนี้เคยใช้รับสิทธิ์ Trial แล้ว");
      }
      const phoneHistory = await this.db.one(
        "SELECT user_id FROM trial_identity_registry WHERE phone_hash=$1 AND user_id<>$2 LIMIT 1",
        [input.phoneHash, input.userId]
      );
      if (phoneHistory) {
        throw new ConflictException("เบอร์โทรนี้เคยใช้รับสิทธิ์ Trial แล้ว");
      }
    }

    const durationMinutes = days * 1440;
    const approvedBy = String(input.approvedBy || "OWNER").slice(0, 120);
    const authorization = await this.db.one(
      `INSERT INTO trial_authorizations(
         user_id,duration_minutes,status,approved_by,approved_at,blocked_reason,claimed_at,claimed_mt5_account_id,
         phone_hash,phone_last4,source,updated_at
       )
       VALUES($1,$2,'PENDING_BIND',$3,now(),NULL,NULL,NULL,$4,$5,$6,now())
       ON CONFLICT(user_id) DO UPDATE
       SET duration_minutes=EXCLUDED.duration_minutes,
           status='PENDING_BIND',
           approved_by=EXCLUDED.approved_by,
           approved_at=now(),
           blocked_reason=NULL,
           claimed_at=NULL,
           claimed_mt5_account_id=NULL,
           phone_hash=COALESCE(EXCLUDED.phone_hash,trial_authorizations.phone_hash),
           phone_last4=COALESCE(EXCLUDED.phone_last4,trial_authorizations.phone_last4),
           source=EXCLUDED.source,
           updated_at=now()
       RETURNING *`,
      [
        input.userId,
        durationMinutes,
        approvedBy,
        input.phoneHash || null,
        input.phoneLast4 || null,
        input.source || "OWNER"
      ]
    );

    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'AUTHORIZE_TRIAL','user',$2,$3::jsonb)",
      [
        approvedBy,
        input.userId,
        JSON.stringify({
          days,
          durationMinutes,
          mt5AccountId: input.mt5AccountId || null,
          source: input.source || "OWNER",
          phoneVerified: Boolean(input.phoneHash),
          preapproved: true
        })
      ]
    );

    if (input.mt5AccountId) {
      const claimed = await this.claimPendingAuthorization(input.userId, input.mt5AccountId);
      if (claimed?.status === "BLOCKED") {
        throw new ConflictException(claimed.message || "MT5 นี้ไม่สามารถรับ Trial ได้");
      }
      if (claimed?.status === "APPROVED") return claimed;
    }

    return {
      status: "PENDING_BIND",
      days,
      durationMinutes,
      authorizationId: authorization.id,
      message: "อนุมัติ Trial ล่วงหน้าแล้ว ระบบจะผูกสิทธิ์กับ MT5 แรกที่ลูกค้าเชื่อม"
    };
  }

  async setDuration(userId: string, daysInput: number) {
    const days = this.normalizeDays(daysInput);
    const durationMinutes = days * 1440;

    const trial = await this.db.one(
      "SELECT id,status,started_at,expires_at FROM trial_grants WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (trial) {
      const row = await this.db.one(
        `UPDATE trial_grants
         SET duration_minutes=$2,
             expires_at=CASE
               WHEN started_at IS NULL THEN NULL
               ELSE started_at + ($2 || ' minutes')::interval
             END,
             status=CASE
               WHEN started_at IS NULL THEN 'APPROVED'
               WHEN started_at + ($2 || ' minutes')::interval > now() THEN 'ACTIVE'
               ELSE 'EXPIRED'
             END
         WHERE id=$1
         RETURNING *`,
        [trial.id, durationMinutes]
      );
      return { status: row.status, trial: row, days, durationMinutes };
    }

    const authorization = await this.db.one(
      `UPDATE trial_authorizations
       SET duration_minutes=$2,updated_at=now()
       WHERE user_id=$1 AND status='PENDING_BIND'
       RETURNING *`,
      [userId, durationMinutes]
    );
    if (!authorization) {
      throw new ConflictException("ยังไม่พบ Trial หรือ Trial ที่รอผูก MT5 ของลูกค้ารายนี้");
    }
    return {
      status: "PENDING_BIND",
      authorization,
      days,
      durationMinutes,
      message: "ปรับจำนวนวัน Trial ที่รอผูก MT5 แล้ว"
    };
  }

  async claimPendingAuthorization(userId: string, mt5AccountId: string) {
    const authorization = await this.db.one(
      `SELECT *
       FROM trial_authorizations
       WHERE user_id=$1 AND status='PENDING_BIND'
       LIMIT 1`,
      [userId]
    );
    if (!authorization) return null;

    const account = await this.db.one(
      `SELECT id,user_id,account_number,broker_server
       FROM mt5_accounts
       WHERE id=$1 AND user_id=$2
       LIMIT 1`,
      [mt5AccountId, userId]
    );
    if (!account) return null;

    const usedByUser = await this.db.one(
      "SELECT id FROM trial_grants WHERE user_id=$1 LIMIT 1",
      [userId]
    );
    if (usedByUser) {
      await this.blockAuthorization(userId, "USER_ALREADY_USED");
      return {
        status: "BLOCKED",
        message: "บัญชี SCENOVA นี้เคยได้รับ Trial แล้ว"
      };
    }

    const usedIdentity = await this.db.one(
      `SELECT id,user_id
       FROM trial_grants
       WHERE lower(account_number)=lower($1)
         AND lower(broker_server)=lower($2)
       LIMIT 1`,
      [account.account_number, account.broker_server]
    );
    if (usedIdentity) {
      await this.blockAuthorization(userId, "MT5_ALREADY_USED");
      return {
        status: "BLOCKED",
        message: "บัญชี MT5 นี้เคยได้รับ Trial แล้ว"
      };
    }

    const device = await this.db.one(
      `SELECT bi.device_fingerprint_hash,bi.device_public_id
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.assigned_user_id=$1
         AND bi.mt5_account_id=$2
       ORDER BY COALESCE(bi.device_last_seen_at,bi.last_seen_at,ls.created_at) DESC
       LIMIT 1`,
      [userId, account.id]
    );

    if (device?.device_fingerprint_hash) {
      const registryDevice = await this.db.one(
        `SELECT user_id FROM trial_identity_registry
         WHERE device_fingerprint_hash=$1 AND user_id<>$2
         LIMIT 1`,
        [device.device_fingerprint_hash, userId]
      );
      const historicalDevice = await this.db.one(
        `SELECT tg.user_id
         FROM trial_grants tg
         JOIN license_slots ls ON ls.assigned_user_id=tg.user_id
         JOIN bot_instances bi ON bi.slot_id=ls.id
         WHERE bi.device_fingerprint_hash=$1
           AND tg.user_id<>$2
         LIMIT 1`,
        [device.device_fingerprint_hash, userId]
      );
      if (registryDevice || historicalDevice) {
        await this.blockAuthorization(userId, "DEVICE_ALREADY_USED");
        return { status: "BLOCKED", message: "อุปกรณ์นี้เคยได้รับ Trial แล้ว" };
      }
    } else if (device?.device_public_id) {
      const legacyDevice = await this.db.one(
        `SELECT tg.user_id
         FROM trial_grants tg
         JOIN license_slots ls ON ls.assigned_user_id=tg.user_id
         JOIN bot_instances bi ON bi.slot_id=ls.id
         WHERE bi.device_public_id=$1
           AND tg.user_id<>$2
         LIMIT 1`,
        [device.device_public_id, userId]
      );
      if (legacyDevice) {
        await this.blockAuthorization(userId, "DEVICE_ALREADY_USED");
        return { status: "BLOCKED", message: "อุปกรณ์นี้เคยได้รับ Trial แล้ว" };
      }
    }

    const request = await this.db.one(
      `SELECT id,line_contact,request_ip
       FROM trial_requests
       WHERE user_id=$1
       ORDER BY CASE WHEN status='PENDING' THEN 0 ELSE 1 END,created_at DESC
       LIMIT 1`,
      [userId]
    );

    const row = await this.db.one(
      `INSERT INTO trial_grants(
         user_id,mt5_account_id,account_number,broker_server,duration_minutes,
         approved_by,line_contact,request_ip
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        userId,
        account.id,
        account.account_number,
        account.broker_server,
        Number(authorization.duration_minutes || 1440),
        authorization.approved_by || "OWNER",
        request?.line_contact || null,
        request?.request_ip || null
      ]
    );

    if (!row) {
      await this.blockAuthorization(userId, "TRIAL_IDENTITY_CONFLICT");
      return {
        status: "BLOCKED",
        message: "MT5 นี้มีประวัติ Trial อยู่แล้ว"
      };
    }

    const registry = await this.db.one(
      `INSERT INTO trial_identity_registry(
         user_id,trial_grant_id,phone_hash,phone_last4,
         device_fingerprint_hash,device_public_id,
         mt5_account_id,account_number,broker_server
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        userId,
        row.id,
        authorization.phone_hash || null,
        authorization.phone_last4 || null,
        device?.device_fingerprint_hash || null,
        device?.device_public_id || null,
        account.id,
        account.account_number,
        account.broker_server
      ]
    );
    if (!registry) {
      await this.db.query("DELETE FROM trial_grants WHERE id=$1 AND started_at IS NULL", [row.id]);
      await this.blockAuthorization(userId, "TRIAL_IDENTITY_CONFLICT");
      return {
        status: "BLOCKED",
        message: "พบประวัติ Trial จากเบอร์โทร อุปกรณ์ หรือ MT5 นี้แล้ว"
      };
    }

    await this.db.query(
      `UPDATE trial_authorizations
       SET status='CLAIMED',
           claimed_mt5_account_id=$2,
           claimed_at=now(),
           blocked_reason=NULL,
           updated_at=now()
       WHERE user_id=$1`,
      [userId, account.id]
    );
    if (request?.id) {
      await this.db.query(
        `UPDATE trial_requests
         SET status=CASE WHEN status='PENDING' THEN 'APPROVED' ELSE status END,
             reviewed_by=COALESCE(reviewed_by,$2),
             reviewed_at=COALESCE(reviewed_at,now())
         WHERE id=$1`,
        [request.id, authorization.approved_by || "OWNER"]
      );
    }
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'CLAIM_PREAPPROVED_TRIAL','trial',$2,$3::jsonb)",
      [
        authorization.approved_by || "OWNER",
        row.id,
        JSON.stringify({
          userId,
          mt5AccountId: account.id,
          accountNumber: account.account_number,
          brokerServer: account.broker_server,
          durationMinutes: Number(authorization.duration_minutes || 1440)
        })
      ]
    );

    return {
      status: "APPROVED",
      trial: row,
      message: "Trial ถูกผูกกับ MT5 แล้วและพร้อมเริ่มเมื่อผู้ใช้กด Start"
    };
  }

  private async blockAuthorization(userId: string, reason: string) {
    await this.db.query(
      `UPDATE trial_authorizations
       SET status='BLOCKED',blocked_reason=$2,updated_at=now()
       WHERE user_id=$1`,
      [userId, reason]
    );
  }
}
