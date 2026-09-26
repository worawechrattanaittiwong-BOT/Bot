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
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { DbService } from "./db.service";
import { CryptoService, JwtGuard } from "./security";
import { maskPhone, normalizePhone } from "./phone-utils";
import { SmsService } from "./sms.service";

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const RECOVERY_CODE_COUNT = 8;

function base32Encode(input: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of input) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += alphabet[parseInt(chunk, 2)];
  }
  return output;
}

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
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

function normalizeRecoveryCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function makeRecoveryCode() {
  const raw = randomBytes(5).toString("hex").toUpperCase();
  return raw.slice(0, 5) + "-" + raw.slice(5);
}

@Controller("auth")
export class AccountSecurityController {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly sms: SmsService
  ) {}

  private clientIp(req: any) {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
  }

  private phoneIdentityHash(msisdn: string) {
    const secret = String(
      process.env.TRIAL_IDENTITY_SECRET ||
      process.env.JWT_SECRET ||
      "development-only-change-me"
    );
    return createHmac("sha256", secret)
      .update(String(msisdn).replace(/\D/g, ""))
      .digest("hex");
  }

  private phoneOtpCodeHash(salt: string, code: string) {
    return createHash("sha256").update(`${salt}:${code}`).digest("hex");
  }

  private maskedIp(req: any) {
    const raw = String(this.clientIp(req) || "");
    if (!raw) return "Unavailable";
    if (raw.includes(".")) {
      const parts = raw.split(".");
      if (parts.length === 4) return parts.slice(0, 3).join(".") + ".xxx";
    }
    if (raw.includes(":")) return raw.split(":").slice(0, 3).join(":") + "::";
    return "Masked";
  }

  private async authEvent(userId: string | null, email: string, event: string, req: any) {
    await this.db.query(
      "INSERT INTO auth_events(user_id,email,event,ip_address) VALUES($1,$2,$3,$4)",
      [userId, email || null, event, this.clientIp(req)]
    );
  }

  private async getUser(userId: string) {
    return this.db.one(
      `SELECT id,user_code,email,password_hash,role,status,created_at,updated_at,email_verified_at
       FROM users WHERE id=$1`,
      [userId]
    );
  }

  private decryptSecret(security: any) {
    if (!security?.totp_secret_ciphertext || !security?.totp_secret_iv || !security?.totp_secret_auth_tag) {
      throw new BadRequestException("Two-factor authentication is not configured");
    }
    return this.crypto.decrypt({
      ciphertext: security.totp_secret_ciphertext,
      iv: security.totp_secret_iv,
      authTag: security.totp_secret_auth_tag
    });
  }

  private async verifySecondFactor(userId: string, codeInput: string, consumeRecovery = true) {
    const security = await this.db.one(
      `SELECT totp_secret_ciphertext,totp_secret_iv,totp_secret_auth_tag,
              two_factor_enabled_at,recovery_code_hashes
       FROM user_security WHERE user_id=$1`,
      [userId]
    );
    if (!security?.two_factor_enabled_at) return { ok: false, recoveryUsed: false };

    const code = String(codeInput || "").trim();
    if (/^\d{6}$/.test(code) && verifyTotp(this.decryptSecret(security), code)) {
      return { ok: true, recoveryUsed: false };
    }

    const recovery = normalizeRecoveryCode(code);
    const hashes = Array.isArray(security.recovery_code_hashes) ? security.recovery_code_hashes : [];
    if (!recovery || hashes.length === 0) return { ok: false, recoveryUsed: false };

    for (let index = 0; index < hashes.length; index += 1) {
      if (await compare(recovery, String(hashes[index]))) {
        if (consumeRecovery) {
          const next = hashes.filter((_: unknown, itemIndex: number) => itemIndex !== index);
          await this.db.query(
            `UPDATE user_security
             SET recovery_code_hashes=$2::jsonb,updated_at=now()
             WHERE user_id=$1`,
            [userId, JSON.stringify(next)]
          );
        }
        return { ok: true, recoveryUsed: true };
      }
    }

    return { ok: false, recoveryUsed: false };
  }

  @Get("account")
  @UseGuards(JwtGuard)
  async account(@Req() req: any) {
    const user = await this.getUser(req.user.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("account unavailable");

    const [security, subscription, trial, partner, latestLogin, phone] = await Promise.all([
      this.db.one(
        `SELECT two_factor_enabled_at,last_password_changed_at,recovery_code_hashes
         FROM user_security WHERE user_id=$1`,
        [user.id]
      ),
      this.db.one(
        `SELECT s.status,s.starts_at,s.expires_at,p.code,p.name_th,p.mode
         FROM subscriptions s
         JOIN plans p ON p.id=s.plan_id
         WHERE s.user_id=$1
         ORDER BY s.expires_at DESC
         LIMIT 1`,
        [user.id]
      ),
      this.db.one(
        `SELECT status,duration_minutes,started_at,expires_at,created_at
         FROM trial_grants WHERE user_id=$1
         ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      ),
      this.db.one(
        `SELECT pa.status,pa.seat_limit,pa.activated_at,pa.expires_at,
                COUNT(pc.id) FILTER (WHERE pc.status='ACTIVE')::int AS used_seats
         FROM partner_accounts pa
         LEFT JOIN partner_customers pc ON pc.partner_user_id=pa.user_id
         WHERE pa.user_id=$1
         GROUP BY pa.user_id,pa.status,pa.seat_limit,pa.activated_at,pa.expires_at`,
        [user.id]
      ),
      this.db.one(
        `SELECT created_at FROM auth_events
         WHERE user_id=$1 AND event IN ('LOGIN','LOGIN_2FA')
         ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      ),
      this.db.one(
        `SELECT country_code,e164,verified_at
         FROM user_phone_numbers WHERE user_id=$1`,
        [user.id]
      )
    ]);

    const recoveryCodesRemaining = Array.isArray(security?.recovery_code_hashes)
      ? security.recovery_code_hashes.length
      : 0;

    return {
      user: {
        id: user.id,
        userCode: user.user_code,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        emailVerified: Boolean(user.email_verified_at),
        emailVerifiedAt: user.email_verified_at,
        lastSignInAt: latestLogin?.created_at || null,
        phone: phone ? {
          countryCode: phone.country_code,
          masked: maskPhone(phone.e164, phone.country_code),
          verified: Boolean(phone.verified_at),
          verifiedAt: phone.verified_at || null
        } : null
      },
      security: {
        twoFactorEnabled: Boolean(security?.two_factor_enabled_at),
        twoFactorEnabledAt: security?.two_factor_enabled_at || null,
        passwordChangedAt: security?.last_password_changed_at || null,
        recoveryCodesRemaining
      },
      access: {
        subscription: subscription || null,
        trial: trial || null,
        partner: partner || null
      },
      session: {
        current: true,
        ip: this.maskedIp(req),
        userAgent: String(req?.headers?.["user-agent"] || "Current browser").slice(0, 220)
      }
    };
  }

  @Post("account/phone")
  @UseGuards(JwtGuard)
  async savePhone(
    @Req() req: any,
    @Body() body: { countryCode?: string; phone?: string }
  ) {
    const user = await this.getUser(req.user.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("account unavailable");

    const normalized = normalizePhone(body.countryCode, body.phone);
    const existing = await this.db.one(
      "SELECT e164,verified_at FROM user_phone_numbers WHERE user_id=$1",
      [user.id]
    );
    if (existing?.e164 === normalized.e164) {
      return {
        saved: true,
        phone: {
          countryCode: normalized.countryCode,
          masked: maskPhone(normalized.e164, normalized.countryCode),
          verified: Boolean(existing.verified_at),
          verifiedAt: existing.verified_at || null
        }
      };
    }

    const trialLock = await this.db.one(
      `SELECT 1
       FROM trial_grants
       WHERE user_id=$1
       UNION ALL
       SELECT 1
       FROM trial_authorizations
       WHERE user_id=$1 AND status IN ('PENDING_BIND','CLAIMED')
       LIMIT 1`,
      [user.id]
    );
    if (trialLock && existing?.verified_at) {
      throw new ConflictException("เบอร์โทรที่ยืนยัน OTP และผูกกับสิทธิ์ Trial แล้วไม่สามารถเปลี่ยนได้");
    }

    const phoneOwner = await this.db.one(
      `SELECT p.user_id,u.user_code,u.status,u.role
       FROM user_phone_numbers p
       JOIN users u ON u.id=p.user_id
       WHERE p.e164=$1 AND p.user_id<>$2
       LIMIT 1`,
      [normalized.e164, user.id]
    );
    const isOwner = String(user.role || "").toUpperCase() === "OWNER";
    if (phoneOwner) {
      if (isOwner && String(phoneOwner.status || "").toUpperCase() === "DELETED") {
        await this.db.query(
          "DELETE FROM user_phone_numbers WHERE user_id=$1 AND e164=$2",
          [phoneOwner.user_id, normalized.e164]
        );
        await this.db.query(
          "UPDATE trial_sms_codes SET status='EXPIRED' WHERE user_id=$1 AND status IN ('PENDING','SENT')",
          [phoneOwner.user_id]
        );
        await this.db.query(
          `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
           VALUES($1,'OWNER_RECLAIM_DELETED_PHONE','user',$2,$3::jsonb)`,
          [
            "OWNER:" + user.id,
            phoneOwner.user_id,
            JSON.stringify({
              fromUserCode: phoneOwner.user_code || null,
              toUserCode: user.user_code,
              phoneLast4: normalized.e164.slice(-4),
              preservedTrialHistory: true
            })
          ]
        );
      } else {
        throw new ConflictException("เบอร์โทรนี้ถูกผูกกับบัญชี SCENOVA อื่นแล้ว");
      }
    }

    try {
      await this.db.query(
        `INSERT INTO user_phone_numbers(user_id,country_code,national_number,e164,verified_at)
         VALUES($1,$2,$3,$4,NULL)
         ON CONFLICT(user_id) DO UPDATE
         SET country_code=EXCLUDED.country_code,
             national_number=EXCLUDED.national_number,
             e164=EXCLUDED.e164,
             verified_at=NULL,
             updated_at=now()`,
        [user.id, normalized.countryCode, normalized.nationalNumber, normalized.e164]
      );
    } catch (error: any) {
      if (String(error?.code || "") === "23505") {
        throw new ConflictException("เบอร์โทรนี้ถูกผูกกับบัญชี SCENOVA อื่นแล้ว");
      }
      throw error;
    }

    await this.db.query(
      "UPDATE trial_sms_codes SET status='EXPIRED' WHERE user_id=$1 AND status IN ('PENDING','SENT')",
      [user.id]
    );
    await this.authEvent(user.id, user.email, "PHONE_UPDATED", req);

    return {
      saved: true,
      phone: {
        countryCode: normalized.countryCode,
        masked: maskPhone(normalized.e164, normalized.countryCode),
        verified: false,
        verifiedAt: null
      }
    };
  }

  @Post("account/phone/request-otp")
  @UseGuards(JwtGuard)
  async requestPhoneOtp(@Req() req: any) {
    const user = await this.getUser(req.user.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("account unavailable");

    const phone = await this.db.one(
      "SELECT country_code,e164,verified_at FROM user_phone_numbers WHERE user_id=$1",
      [user.id]
    );
    if (!phone?.e164) throw new BadRequestException("กรุณาเพิ่มเบอร์โทรก่อนขอ OTP");
    if (phone.verified_at) throw new ConflictException("เบอร์โทรนี้ยืนยันแล้ว");

    const msisdn = String(phone.e164);
    const phoneHash = this.phoneIdentityHash(msisdn);
    const latest = await this.db.one(
      `SELECT COALESCE(sent_at,created_at) sent_at
       FROM trial_sms_codes
       WHERE user_id=$1
         AND phone_hash=$2
         AND purpose='ACCOUNT'
         AND status='SENT'
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, phoneHash]
    );

    if (latest && Date.now() - new Date(latest.sent_at).getTime() < 60_000) {
      const remaining = Math.max(
        1,
        Math.ceil((60_000 - (Date.now() - new Date(latest.sent_at).getTime())) / 1000)
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
         AND purpose='ACCOUNT'
         AND status IN ('SENT','USED')
         AND created_at>now()-interval '24 hours'`,
      [user.id, phoneHash]
    );
    if (Number(todayCount?.count || 0) >= 5) {
      throw new HttpException(
        "ขอ OTP ครบจำนวนต่อวันแล้ว กรุณาลองใหม่ภายหลัง",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const ip = this.clientIp(req);
    if (ip) {
      const ipCount = await this.db.one(
        `SELECT count(*)::int count
         FROM trial_sms_codes
         WHERE request_ip=$1
           AND purpose='ACCOUNT'
           AND status IN ('SENT','USED')
           AND created_at>now()-interval '24 hours'`,
        [ip]
      );
      if (Number(ipCount?.count || 0) >= 12) {
        throw new HttpException(
          "มีการขอรหัสจากเครือข่ายนี้มากเกินไป กรุณาลองใหม่ภายหลัง",
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    const fallbackCode = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString("hex");
    const record = await this.db.one(
      `INSERT INTO trial_sms_codes(
         user_id,phone_hash,phone_last4,code_hash,code_salt,provider,status,expires_at,request_ip,purpose
       )
       VALUES($1,$2,$3,$4,$5,'PENDING','PENDING',now()+interval '10 minutes',$6,'ACCOUNT')
       RETURNING id`,
      [
        user.id,
        phoneHash,
        msisdn.slice(-4),
        this.phoneOtpCodeHash(salt, fallbackCode),
        salt,
        ip
      ]
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

    await this.authEvent(user.id, user.email, "PHONE_OTP_SENT", req);
    return {
      sent: true,
      phoneMasked: maskPhone(msisdn, phone.country_code),
      expiresInMinutes: 10,
      resendAfterSeconds: 60
    };
  }

  @Post("account/phone/verify-otp")
  @UseGuards(JwtGuard)
  async verifyPhoneOtp(@Req() req: any, @Body() body: { code?: string }) {
    const user = await this.getUser(req.user.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("account unavailable");

    const phone = await this.db.one(
      "SELECT country_code,e164,verified_at FROM user_phone_numbers WHERE user_id=$1",
      [user.id]
    );
    if (!phone?.e164) throw new BadRequestException("กรุณาเพิ่มเบอร์โทรก่อนยืนยัน OTP");
    if (phone.verified_at) {
      return {
        verified: true,
        phone: {
          countryCode: phone.country_code,
          masked: maskPhone(phone.e164, phone.country_code)
        }
      };
    }

    const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) throw new BadRequestException("กรุณากรอกรหัส OTP 6 หลัก");

    const msisdn = String(phone.e164);
    const phoneHash = this.phoneIdentityHash(msisdn);
    const record = await this.db.one(
      `SELECT *
       FROM trial_sms_codes
       WHERE user_id=$1
         AND phone_hash=$2
         AND purpose='ACCOUNT'
         AND status='SENT'
         AND expires_at>now()
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, phoneHash]
    );

    if (!record) throw new BadRequestException("ไม่พบ OTP ที่ใช้งานได้ หรือรหัสหมดอายุแล้ว");
    if (Number(record.attempts || 0) >= 5) {
      throw new BadRequestException("กรอกรหัสผิดเกินจำนวนที่กำหนด กรุณาขอ OTP ใหม่");
    }

    let ok = false;
    if (String(record.provider || "") === "TBS_OTP" && record.provider_token) {
      ok = await this.sms.verifyOtp(String(record.provider_token), code);
    } else {
      const expected = Buffer.from(String(record.code_hash), "hex");
      const supplied = Buffer.from(
        this.phoneOtpCodeHash(String(record.code_salt), code),
        "hex"
      );
      ok = expected.length === supplied.length && timingSafeEqual(expected, supplied);
    }

    if (!ok) {
      await this.db.query(
        "UPDATE trial_sms_codes SET attempts=attempts+1 WHERE id=$1",
        [record.id]
      );
      await this.authEvent(user.id, user.email, "PHONE_OTP_FAILED", req);
      throw new BadRequestException("OTP ไม่ถูกต้อง");
    }

    await this.db.transaction(async client => {
      await client.query(
        `UPDATE trial_sms_codes
         SET status='USED',verified_at=now(),attempts=attempts+1
         WHERE id=$1`,
        [record.id]
      );
      await client.query(
        `UPDATE trial_sms_codes
         SET status='EXPIRED'
         WHERE user_id=$1
           AND purpose='ACCOUNT'
           AND status='SENT'
           AND id<>$2`,
        [user.id, record.id]
      );
      await client.query(
        "UPDATE user_phone_numbers SET verified_at=now(),updated_at=now() WHERE user_id=$1 AND e164=$2",
        [user.id, msisdn]
      );
    });

    await this.authEvent(user.id, user.email, "PHONE_VERIFIED", req);
    return {
      verified: true,
      phone: {
        countryCode: phone.country_code,
        masked: maskPhone(msisdn, phone.country_code)
      }
    };
  }

  @Post("change-password")
  @UseGuards(JwtGuard)
  async changePassword(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string; twoFactorCode?: string }
  ) {
    const user = await this.getUser(req.user.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("account unavailable");

    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!(await compare(currentPassword, user.password_hash))) {
      await this.authEvent(user.id, user.email, "PASSWORD_CHANGE_FAILED", req);
      throw new BadRequestException("Current password is incorrect");
    }
    if (await compare(newPassword, user.password_hash)) {
      throw new BadRequestException("New password must be different from your current password");
    }

    const checks = [
      newPassword.length >= 8,
      /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword),
      /\d/.test(newPassword),
      /[^A-Za-z0-9]/.test(newPassword)
    ];
    if (checks.filter(Boolean).length < 3) {
      throw new BadRequestException(
        "Use at least 8 characters with a stronger mix of upper/lowercase letters, numbers or symbols"
      );
    }

    const security = await this.db.one(
      "SELECT two_factor_enabled_at FROM user_security WHERE user_id=$1",
      [user.id]
    );
    if (security?.two_factor_enabled_at) {
      const verification = await this.verifySecondFactor(user.id, String(body.twoFactorCode || ""));
      if (!verification.ok) throw new BadRequestException("Two-factor code is invalid");
    }

    const passwordHash = await hash(newPassword, 12);
    await this.db.transaction(async client => {
      await client.query(
        "UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1",
        [user.id, passwordHash]
      );
      await client.query(
        `INSERT INTO user_security(user_id,last_password_changed_at,updated_at)
         VALUES($1,now(),now())
         ON CONFLICT (user_id) DO UPDATE SET
           last_password_changed_at=EXCLUDED.last_password_changed_at,
           updated_at=now()`,
        [user.id]
      );
    });

    await this.authEvent(user.id, user.email, "PASSWORD_CHANGED", req);
    return { changed: true };
  }

  @Post("2fa/setup")
  @UseGuards(JwtGuard)
  async setupTwoFactor(@Req() req: any, @Body() body: { currentPassword: string }) {
    const user = await this.getUser(req.user.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("account unavailable");
    if (!(await compare(String(body.currentPassword || ""), user.password_hash))) {
      throw new BadRequestException("Current password is incorrect");
    }

    const existing = await this.db.one(
      `SELECT totp_secret_ciphertext,totp_secret_iv,totp_secret_auth_tag,two_factor_enabled_at
       FROM user_security WHERE user_id=$1`,
      [user.id]
    );
    if (existing?.two_factor_enabled_at) {
      throw new BadRequestException("Two-factor authentication is already enabled");
    }

    // A pending setup must be stable. Reopening this screen must NOT rotate the
    // secret, otherwise the authenticator entry the user just added becomes
    // invalid and every 6-digit code will fail.
    let secret: string;
    let resumed = false;
    if (
      existing?.totp_secret_ciphertext &&
      existing?.totp_secret_iv &&
      existing?.totp_secret_auth_tag
    ) {
      secret = this.decryptSecret(existing);
      resumed = true;
    } else {
      secret = base32Encode(randomBytes(20));
      const encrypted = this.crypto.encrypt(secret);
      await this.db.query(
        `INSERT INTO user_security(
           user_id,totp_secret_ciphertext,totp_secret_iv,totp_secret_auth_tag,updated_at
         ) VALUES($1,$2,$3,$4,now())
         ON CONFLICT (user_id) DO UPDATE SET
           totp_secret_ciphertext=EXCLUDED.totp_secret_ciphertext,
           totp_secret_iv=EXCLUDED.totp_secret_iv,
           totp_secret_auth_tag=EXCLUDED.totp_secret_auth_tag,
           recovery_code_hashes='[]'::jsonb,
           updated_at=now()
         WHERE user_security.two_factor_enabled_at IS NULL`,
        [user.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag]
      );
    }

    const label = encodeURIComponent("SCENOVA:" + user.email);
    const issuer = encodeURIComponent("SCENOVA");
    const otpauthUri =
      `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    await this.authEvent(
      user.id,
      user.email,
      resumed ? "TWO_FACTOR_SETUP_RESUMED" : "TWO_FACTOR_SETUP_STARTED",
      req
    );
    return { secret, otpauthUri, digits: 6, period: 30, resumed };
  }

  @Post("2fa/enable")
  @UseGuards(JwtGuard)
  async enableTwoFactor(@Req() req: any, @Body() body: { code: string }) {
    const user = await this.getUser(req.user.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("account unavailable");

    const security = await this.db.one(
      `SELECT totp_secret_ciphertext,totp_secret_iv,totp_secret_auth_tag,two_factor_enabled_at
       FROM user_security WHERE user_id=$1`,
      [user.id]
    );
    if (security?.two_factor_enabled_at) {
      return { enabled: true, recoveryCodes: [] };
    }

    const secret = this.decryptSecret(security);
    const code = String(body.code || "").trim();
    if (!verifyTotp(secret, code)) {
      await this.authEvent(user.id, user.email, "TWO_FACTOR_ENABLE_FAILED", req);
      throw new BadRequestException(
        "Authenticator code is invalid. Make sure you are using the latest SCENOVA entry in your authenticator."
      );
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => makeRecoveryCode());
    const recoveryHashes = await Promise.all(
      recoveryCodes.map(codeValue => hash(normalizeRecoveryCode(codeValue), 10))
    );
    await this.db.query(
      `UPDATE user_security
       SET two_factor_enabled_at=now(),recovery_code_hashes=$2::jsonb,updated_at=now()
       WHERE user_id=$1`,
      [user.id, JSON.stringify(recoveryHashes)]
    );

    await this.authEvent(user.id, user.email, "TWO_FACTOR_ENABLED", req);
    return { enabled: true, recoveryCodes };
  }

  @Post("2fa/disable")
  @UseGuards(JwtGuard)
  async disableTwoFactor(
    @Req() req: any,
    @Body() body: { currentPassword: string; code: string }
  ) {
    const user = await this.getUser(req.user.sub);
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("account unavailable");
    if (!(await compare(String(body.currentPassword || ""), user.password_hash))) {
      throw new BadRequestException("Current password is incorrect");
    }

    const verification = await this.verifySecondFactor(user.id, String(body.code || ""));
    if (!verification.ok) throw new BadRequestException("Two-factor code is invalid");

    await this.db.query(
      `UPDATE user_security
       SET totp_secret_ciphertext=NULL,
           totp_secret_iv=NULL,
           totp_secret_auth_tag=NULL,
           two_factor_enabled_at=NULL,
           recovery_code_hashes='[]'::jsonb,
           updated_at=now()
       WHERE user_id=$1`,
      [user.id]
    );
    await this.authEvent(user.id, user.email, "TWO_FACTOR_DISABLED", req);
    return { disabled: true };
  }

  @Post("verify-2fa-login")
  async verifyTwoFactorLogin(
    @Req() req: any,
    @Body() body: { challenge: string; code: string }
  ) {
    const challenge = String(body.challenge || "").trim();
    const tokenHash = this.crypto.sha256(challenge);
    const record = await this.db.one(
      `SELECT c.id,c.user_id,c.attempts,
              u.user_code,u.email,u.role,u.status,u.email_verified_at
       FROM two_factor_login_challenges c
       JOIN users u ON u.id=c.user_id
       WHERE c.token_hash=$1
         AND c.consumed_at IS NULL
         AND c.expires_at>now()
       LIMIT 1`,
      [tokenHash]
    );

    if (!record || record.status !== "ACTIVE" || Number(record.attempts || 0) >= 5) {
      throw new UnauthorizedException("Two-factor challenge is unavailable or expired");
    }

    const verification = await this.verifySecondFactor(record.user_id, String(body.code || ""));
    if (!verification.ok) {
      const updated = await this.db.one(
        `UPDATE two_factor_login_challenges
         SET attempts=attempts+1,
             consumed_at=CASE WHEN attempts+1>=5 THEN now() ELSE consumed_at END
         WHERE id=$1 AND consumed_at IS NULL
         RETURNING attempts`,
        [record.id]
      );
      await this.authEvent(record.user_id, record.email, "LOGIN_2FA_FAILED", req);
      const attemptsLeft = Math.max(0, 5 - Number(updated?.attempts || 0));
      throw new UnauthorizedException(
        attemptsLeft > 0
          ? `Invalid authentication code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`
          : "Two-factor challenge is locked. Sign in again to start a new challenge."
      );
    }

    const consumed = await this.db.one(
      `UPDATE two_factor_login_challenges
       SET consumed_at=now()
       WHERE id=$1 AND consumed_at IS NULL
       RETURNING id`,
      [record.id]
    );
    if (!consumed) throw new UnauthorizedException("Two-factor challenge was already used");

    await this.authEvent(record.user_id, record.email, "LOGIN_2FA", req);
    return {
      user: {
        id: record.user_id,
        userCode: record.user_code,
        email: record.email,
        role: record.role,
        status: record.status,
        emailVerified: Boolean(record.email_verified_at)
      },
      token: this.jwt.sign({
        sub: record.user_id,
        role: record.role,
        code: record.user_code
      })
    };
  }
}
