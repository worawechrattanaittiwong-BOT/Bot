import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards
} from "@nestjs/common";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";
import { SmsService } from "./sms.service";
import { TrialAuthorizationService } from "./trial-authorization.service";
import { maskPhone } from "./phone-utils";

const CODE_TTL_MINUTES = 10;
const RESEND_SECONDS = 60;
const MAX_SENDS_PER_DAY = 5;
const MAX_ATTEMPTS = 5;

@Controller("trial-access")
@UseGuards(JwtGuard)
export class TrialCouponController {
  constructor(
    private readonly db: DbService,
    private readonly sms: SmsService,
    private readonly trials: TrialAuthorizationService
  ) {}

  private clientIp(req: any) {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
  }

  private phoneHash(msisdn: string) {
    const secret = String(
      process.env.TRIAL_IDENTITY_SECRET ||
      process.env.JWT_SECRET ||
      "development-only-change-me"
    );
    return createHmac("sha256", secret).update(String(msisdn).replace(/\D/g, "")).digest("hex");
  }

  private codeHash(salt: string, code: string) {
    return createHash("sha256").update(`${salt}:${code}`).digest("hex");
  }

  private emailConfigured() {
    return Boolean(
      String(process.env.RESEND_API_KEY || "").trim() &&
      String(process.env.EMAIL_FROM || "").trim()
    );
  }

  private maskEmail(email: string) {
    const value = String(email || "").trim().toLowerCase();
    const [local, domain] = value.split("@");
    if (!local || !domain) return value || "—";
    const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
  }

  private async sendTrialEmailOtp(email: string, code: string) {
    if (!this.emailConfigured()) {
      throw new ServiceUnavailableException("ระบบส่งอีเมล OTP ยังไม่ได้ตั้งค่า");
    }

    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.EMAIL_FROM || "").trim();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "SCENOVA — รหัสยืนยันสิทธิ์ทดลองใช้งาน",
        html:
          '<div style="font-family:Arial,sans-serif;background:#080a14;color:#f4f1ff;padding:32px">' +
          '<div style="max-width:560px;margin:auto;border:1px solid #40366d;border-radius:16px;padding:28px;background:#0f1020">' +
          '<div style="font-size:12px;letter-spacing:2.5px;color:#9f8cff">SCENOVA TRIAL ACCESS</div>' +
          '<h2 style="margin:14px 0 8px">รหัสยืนยันสิทธิ์ทดลองใช้งาน</h2>' +
          '<p style="color:#b8b4c8;line-height:1.7;margin:0">มีการขอสิทธิ์ทดลองใช้งานจากบัญชี SCENOVA ของคุณ ใช้รหัส 6 หลักด้านล่างเพื่อยืนยันคำขอ รหัสนี้มีอายุ 10 นาที</p>' +
          '<div style="font-size:34px;font-weight:800;letter-spacing:10px;margin:24px 0;color:#ffffff">' +
          code +
          '</div>' +
          '<p style="color:#8a8498;font-size:12px;line-height:1.7;margin:0">หากคุณไม่ได้เป็นผู้ขอสิทธิ์ทดลองใช้งาน ไม่ต้องดำเนินการใด ๆ และห้ามส่งต่อรหัสนี้ให้บุคคลอื่น</p>' +
          '</div></div>'
      })
    });

    if (!response.ok) {
      throw new ServiceUnavailableException("ส่ง OTP ทางอีเมลไม่สำเร็จ");
    }
  }

  private async boundPhone(userId: string) {
    return this.db.one(
      "SELECT country_code,e164,verified_at FROM user_phone_numbers WHERE user_id=$1",
      [userId]
    );
  }

  private trialDays() {
    const value = Math.trunc(Number(process.env.TRIAL_SMS_DAYS || 1));
    return Number.isFinite(value) ? Math.max(1, Math.min(30, value)) : 1;
  }

  private async currentIdentity(userId: string) {
    const rows = await this.db.query(
      `SELECT
         bi.device_fingerprint_hash,
         bi.device_public_id,
         a.id mt5_account_id,
         a.account_number,
         a.broker_server
       FROM license_slots ls
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE ls.assigned_user_id=$1
         AND ls.status<>'DELETED'
       ORDER BY COALESCE(bi.device_last_seen_at,bi.last_seen_at,ls.created_at) DESC`,
      [userId]
    );
    return rows.rows;
  }

  private async eligibility(userId: string, phoneHash?: string | null) {
    const user = await this.db.one(
      "SELECT id,role,status FROM users WHERE id=$1",
      [userId]
    );
    if (!user || user.status !== "ACTIVE") {
      return { allowed: false, reason: "ACCOUNT_INACTIVE", message: "บัญชี SCENOVA ไม่พร้อมใช้งาน" };
    }
    if (["OWNER","ADMIN"].includes(String(user.role))) {
      return { allowed: false, reason: "ELEVATED", message: "บัญชีผู้ดูแลมีสิทธิ์ใช้งานอยู่แล้ว" };
    }

    const existingTrial = await this.db.one(
      "SELECT id,status FROM trial_grants WHERE user_id=$1 LIMIT 1",
      [userId]
    );
    if (existingTrial) {
      return { allowed: false, reason: "USER_USED", message: "บัญชีนี้เคยได้รับ Trial แล้ว" };
    }

    const activeSub = await this.db.one(
      `SELECT 1 FROM subscriptions
       WHERE user_id=$1 AND status='ACTIVE' AND starts_at<=now() AND expires_at>now()
       LIMIT 1`,
      [userId]
    );
    if (activeSub) {
      return { allowed: false, reason: "SUBSCRIPTION_ACTIVE", message: "บัญชีนี้มีสมาชิกใช้งานอยู่แล้ว" };
    }

    const authorization = await this.db.one(
      `SELECT id,status,duration_minutes,phone_last4,blocked_reason
       FROM trial_authorizations WHERE user_id=$1 LIMIT 1`,
      [userId]
    );
    if (authorization?.status === "PENDING_BIND" || authorization?.status === "CLAIMED") {
      return {
        allowed: false,
        reason: "TRIAL_READY",
        message: authorization.status === "CLAIMED" ? "Trial พร้อมใช้งานแล้ว" : "Trial พร้อมแล้ว รอเชื่อม MT5",
        authorization
      };
    }
    if (authorization?.status === "BLOCKED") {
      return {
        allowed: false,
        reason: "BLOCKED",
        message: "บัญชีนี้ถูกบล็อกสิทธิ์ Trial",
        authorization
      };
    }

    if (phoneHash) {
      const phoneUsed = await this.db.one(
        `SELECT user_id,status
         FROM trial_authorizations
         WHERE phone_hash=$1 AND user_id<>$2
         LIMIT 1`,
        [phoneHash, userId]
      );
      if (phoneUsed) {
        return { allowed: false, reason: "PHONE_USED", message: "เบอร์โทรนี้เคยใช้รับสิทธิ์ Trial แล้ว" };
      }
      const phoneRegistry = await this.db.one(
        "SELECT user_id FROM trial_identity_registry WHERE phone_hash=$1 AND user_id<>$2 LIMIT 1",
        [phoneHash, userId]
      );
      if (phoneRegistry) {
        return { allowed: false, reason: "PHONE_USED", message: "เบอร์โทรนี้เคยใช้รับสิทธิ์ Trial แล้ว" };
      }
    }

    const identities = await this.currentIdentity(userId);
    for (const identity of identities) {
      if (identity.mt5_account_id && identity.account_number && identity.broker_server) {
        const usedMt5 = await this.db.one(
          `SELECT id FROM trial_grants
           WHERE lower(account_number)=lower($1)
             AND lower(broker_server)=lower($2)
           LIMIT 1`,
          [identity.account_number, identity.broker_server]
        );
        if (usedMt5) {
          return { allowed: false, reason: "MT5_USED", message: "MT5 ที่เชื่อมอยู่นี้เคยได้รับ Trial แล้ว" };
        }
      }

      if (identity.device_fingerprint_hash) {
        const usedDevice = await this.db.one(
          `SELECT tir.user_id
           FROM trial_identity_registry tir
           WHERE tir.device_fingerprint_hash=$1
             AND tir.user_id<>$2
           LIMIT 1`,
          [identity.device_fingerprint_hash, userId]
        );
        if (usedDevice) {
          return { allowed: false, reason: "DEVICE_USED", message: "อุปกรณ์นี้เคยใช้ Trial แล้ว" };
        }
        const historicalDevice = await this.db.one(
          `SELECT tg.user_id
           FROM trial_grants tg
           JOIN license_slots ls ON ls.assigned_user_id=tg.user_id
           JOIN bot_instances bi ON bi.slot_id=ls.id
           WHERE bi.device_fingerprint_hash=$1
             AND tg.user_id<>$2
           LIMIT 1`,
          [identity.device_fingerprint_hash, userId]
        );
        if (historicalDevice) {
          return { allowed: false, reason: "DEVICE_USED", message: "อุปกรณ์นี้เคยใช้ Trial แล้ว" };
        }
      } else if (identity.device_public_id) {
        const legacyDevice = await this.db.one(
          `SELECT tg.user_id
           FROM trial_grants tg
           JOIN license_slots ls ON ls.assigned_user_id=tg.user_id
           JOIN bot_instances bi ON bi.slot_id=ls.id
           WHERE bi.device_public_id=$1
             AND tg.user_id<>$2
           LIMIT 1`,
          [identity.device_public_id, userId]
        );
        if (legacyDevice) {
          return { allowed: false, reason: "DEVICE_USED", message: "อุปกรณ์นี้เคยใช้ Trial แล้ว" };
        }
      }
    }

    return { allowed: true, reason: "ELIGIBLE", message: "พร้อมขอ OTP" };
  }

  @Get("status")
  async status(@Req() req: any) {
    const userId = String(req.user.sub);
    const user = await this.db.one(
      "SELECT email,email_verified_at FROM users WHERE id=$1",
      [userId]
    );
    const authorization = await this.db.one(
      `SELECT status,duration_minutes,phone_last4,approved_at,claimed_at,blocked_reason
       FROM trial_authorizations WHERE user_id=$1 LIMIT 1`,
      [userId]
    );
    const trial = await this.db.one(
      `SELECT status,duration_minutes,started_at,expires_at
       FROM trial_grants WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const latestCode = await this.db.one(
      `SELECT phone_last4,email_masked,delivery_channel,status,expires_at,created_at,sent_at,provider,provider_refno
       FROM trial_sms_codes
       WHERE user_id=$1
         AND purpose='TRIAL'
         AND status='SENT'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const dailyCount = await this.db.one(
      `SELECT count(*)::int count
       FROM trial_sms_codes
       WHERE user_id=$1
         AND purpose='TRIAL'
         AND status IN ('SENT','USED')
         AND created_at>now()-interval '24 hours'`,
      [userId]
    );
    const sentAt = latestCode?.sent_at || latestCode?.created_at || null;
    const resendAvailableAt = sentAt
      ? new Date(new Date(sentAt).getTime() + RESEND_SECONDS * 1000).toISOString()
      : null;
    const resendAfterSeconds = sentAt
      ? Math.max(0, Math.ceil((new Date(sentAt).getTime() + RESEND_SECONDS * 1000 - Date.now()) / 1000))
      : 0;
    const phone = await this.boundPhone(userId);
    const phoneHash = phone?.e164 ? this.phoneHash(phone.e164) : null;
    const base = await this.eligibility(userId, phoneHash);
    return {
      emailConfigured: this.emailConfigured(),
      smsConfigured: this.sms.configured(),
      verificationConfigured: this.emailConfigured() || this.sms.configured(),
      defaultDelivery: "EMAIL",
      email: user?.email ? {
        masked: this.maskEmail(user.email),
        verified: Boolean(user.email_verified_at)
      } : null,
      trialDays: this.trialDays(),
      eligibility: base,
      phone: phone ? {
        countryCode: phone.country_code,
        masked: maskPhone(phone.e164, phone.country_code),
        verified: Boolean(phone.verified_at),
        verifiedAt: phone.verified_at || null
      } : null,
      authorization: authorization || null,
      trial: trial || null,
      latestCode: latestCode || null,
      otp: {
        codeLength: 6,
        expiresInMinutes: CODE_TTL_MINUTES,
        resendSeconds: RESEND_SECONDS,
        resendAfterSeconds,
        resendAvailableAt,
        maxSendsPerDay: MAX_SENDS_PER_DAY,
        sendsUsedToday: Number(dailyCount?.count || 0),
        sendsRemaining: Math.max(0, MAX_SENDS_PER_DAY - Number(dailyCount?.count || 0))
      }
    };
  }

  @Post("request-code")
  async requestCode(@Req() req: any) {
    const userId = String(req.user.sub);
    const phone = await this.boundPhone(userId);
    if (!phone?.e164) {
      throw new BadRequestException("กรุณาเพิ่มเบอร์โทรใน My Account ก่อนขอ OTP");
    }

    const msisdn = String(phone.e164);
    const phoneHash = this.phoneHash(msisdn);
    const check = await this.eligibility(userId, phoneHash);
    if (!check.allowed) throw new ConflictException(check.message);

    const latest = await this.db.one(
      `SELECT COALESCE(sent_at,created_at) sent_at
       FROM trial_sms_codes
       WHERE user_id=$1
         AND status='SENT'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (latest && Date.now() - new Date(latest.sent_at).getTime() < RESEND_SECONDS * 1000) {
      const remaining = Math.max(
        1,
        Math.ceil((RESEND_SECONDS * 1000 - (Date.now() - new Date(latest.sent_at).getTime())) / 1000)
      );
      throw new HttpException(
        `กรุณารออีก ${remaining} วินาทีก่อนส่ง OTP ใหม่`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const todayCount = await this.db.one(
      `SELECT count(*)::int count
       FROM trial_sms_codes
       WHERE (user_id=$1 OR phone_hash=$2)
         AND purpose='TRIAL'
         AND status IN ('SENT','USED')
         AND created_at>now()-interval '24 hours'`,
      [userId, phoneHash]
    );
    if (Number(todayCount?.count || 0) >= MAX_SENDS_PER_DAY) {
      throw new HttpException("ขอ OTP ครบจำนวนต่อวันแล้ว กรุณาลองใหม่ภายหลัง", HttpStatus.TOO_MANY_REQUESTS);
    }

    const ip = this.clientIp(req);
    if (ip) {
      const ipCount = await this.db.one(
        `SELECT count(*)::int count
         FROM trial_sms_codes
         WHERE request_ip=$1
           AND purpose='TRIAL'
           AND status IN ('SENT','USED')
           AND created_at>now()-interval '24 hours'`,
        [ip]
      );
      if (Number(ipCount?.count || 0) >= 12) {
        throw new HttpException("มีการขอรหัสจากเครือข่ายนี้มากเกินไป กรุณาลองใหม่ภายหลัง", HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const fallbackCode = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString("hex");
    const last4 = msisdn.slice(-4);

    const record = await this.db.one(
      `INSERT INTO trial_sms_codes(
         user_id,phone_hash,phone_last4,code_hash,code_salt,provider,status,expires_at,request_ip,purpose
       )
       VALUES($1,$2,$3,$4,$5,'PENDING','PENDING',now()+interval '10 minutes',$6,'TRIAL')
       RETURNING id`,
      [userId, phoneHash, last4, this.codeHash(salt, fallbackCode), salt, ip]
    );

    try {
      const delivery = await this.sms.requestOtp(msisdn, fallbackCode);
      await this.db.query(
        `UPDATE trial_sms_codes
         SET status='SENT',
             sent_at=now(),
             provider=$2,
             provider_token=$3,
             provider_refno=$4
         WHERE id=$1`,
        [record.id, delivery.provider, delivery.token, delivery.refno]
      );
    } catch (error) {
      await this.db.query(
        "UPDATE trial_sms_codes SET status='FAILED' WHERE id=$1",
        [record.id]
      );
      throw error;
    }

    return {
      sent: true,
      phoneMasked: maskPhone(msisdn, phone.country_code),
      expiresInMinutes: CODE_TTL_MINUTES,
      resendAfterSeconds: RESEND_SECONDS,
      sendsRemaining: Math.max(0, MAX_SENDS_PER_DAY - Number(todayCount?.count || 0) - 1)
    };
  }

  @Post("redeem")
  async redeem(@Req() req: any, @Body() body: { code: string }) {
    const userId = String(req.user.sub);
    const phone = await this.boundPhone(userId);
    if (!phone?.e164) {
      throw new BadRequestException("กรุณาเพิ่มเบอร์โทรใน My Account ก่อนยืนยัน OTP");
    }

    const msisdn = String(phone.e164);
    const phoneHash = this.phoneHash(msisdn);
    const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) throw new BadRequestException("กรุณากรอกรหัส 6 หลัก");

    const record = await this.db.one(
      `SELECT *
       FROM trial_sms_codes
       WHERE user_id=$1
         AND phone_hash=$2
         AND purpose='TRIAL'
         AND status='SENT'
         AND expires_at>now()
       ORDER BY created_at DESC LIMIT 1`,
      [userId, phoneHash]
    );
    if (!record) throw new BadRequestException("ไม่พบ OTP ที่ใช้งานได้ หรือรหัสหมดอายุแล้ว");
    if (Number(record.attempts || 0) >= MAX_ATTEMPTS) {
      throw new BadRequestException("กรอกรหัสผิดเกินจำนวนที่กำหนด กรุณาขอรหัสใหม่");
    }

    let ok = false;
    if (String(record.provider || "") === "TBS_OTP" && record.provider_token) {
      ok = await this.sms.verifyOtp(String(record.provider_token), code);
    } else {
      const expected = Buffer.from(String(record.code_hash), "hex");
      const supplied = Buffer.from(this.codeHash(String(record.code_salt), code), "hex");
      ok = expected.length === supplied.length && timingSafeEqual(expected, supplied);
    }

    if (!ok) {
      await this.db.query(
        "UPDATE trial_sms_codes SET attempts=attempts+1 WHERE id=$1",
        [record.id]
      );
      throw new BadRequestException("OTP ไม่ถูกต้อง");
    }

    const check = await this.eligibility(userId, phoneHash);
    if (!check.allowed) throw new ConflictException(check.message);

    const identities = await this.currentIdentity(userId);
    const mt5 = identities.find((item: any) => item.mt5_account_id) || null;
    const result = await this.trials.authorizeUser({
      userId,
      days: this.trialDays(),
      approvedBy: "SMS_TRIAL",
      mt5AccountId: mt5?.mt5_account_id || null,
      phoneHash,
      phoneLast4: msisdn.slice(-4),
      source: "SMS"
    });

    await Promise.all([
      this.db.query(
        "UPDATE trial_sms_codes SET status='USED',verified_at=now(),attempts=attempts+1 WHERE id=$1",
        [record.id]
      ),
      this.db.query(
        "UPDATE user_phone_numbers SET verified_at=now(),updated_at=now() WHERE user_id=$1 AND e164=$2",
        [userId, msisdn]
      )
    ]);

    return {
      activated: true,
      status: result.status,
      trialDays: this.trialDays(),
      message: result.status === "APPROVED"
        ? "ยืนยัน Trial สำเร็จและผูก MT5 แล้ว"
        : "ยืนยัน Trial สำเร็จ รอเชื่อม MT5 แล้วจึงเริ่มใช้งาน"
    };
  }
}
