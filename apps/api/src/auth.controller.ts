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
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes, randomInt } from "crypto";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";

const EMAIL_OTP_TTL_SECONDS = 10 * 60;
const EMAIL_OTP_RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_OTP_MAX_ATTEMPTS = 5;
const EMAIL_OTP_MAX_SENDS_PER_HOUR = 5;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService
  ) {}

  private clientIp(req: any) {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
  }

  private verificationRequired() {
    return /^(1|true|yes|on)$/i.test(String(process.env.EMAIL_VERIFICATION_REQUIRED || "false"));
  }

  private verificationConfigured() {
    return Boolean(
      String(process.env.RESEND_API_KEY || "").trim() &&
      String(process.env.EMAIL_FROM || "").trim()
    );
  }

  private assertVerificationConfigured() {
    if (!this.verificationConfigured()) {
      throw new ServiceUnavailableException(
        "email verification service is not configured"
      );
    }
  }

  private publicUser(user: any) {
    return {
      id: user.id,
      userCode: user.user_code,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.email_verified_at)
    };
  }

  private tokenFor(user: any) {
    return this.jwt.sign({
      sub: user.id,
      role: user.role,
      code: user.user_code
    });
  }

  private async authEvent(userId: string | null, email: string, event: string, req: any) {
    await this.db.query(
      "INSERT INTO auth_events(user_id,email,event,ip_address) VALUES($1,$2,$3,$4)",
      [userId, email || null, event, this.clientIp(req)]
    );
  }

  private async sendVerificationCode(user: any, req: any) {
    this.assertVerificationConfigured();

    const latest = await this.db.one(
      `SELECT sent_at
       FROM email_verification_codes
       WHERE user_id=$1
       ORDER BY sent_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (latest?.sent_at) {
      const ageSeconds = Math.max(
        0,
        Math.floor((Date.now() - new Date(latest.sent_at).getTime()) / 1000)
      );
      if (ageSeconds < EMAIL_OTP_RESEND_COOLDOWN_SECONDS) {
        const retryAfterSeconds =
          EMAIL_OTP_RESEND_COOLDOWN_SECONDS - ageSeconds;
        throw new HttpException(
          {
            message: "กรุณารอก่อนขอรหัส OTP ใหม่",
            retryAfterSeconds
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    const hourly = await this.db.one(
      `SELECT COUNT(*)::int AS count
       FROM email_verification_codes
       WHERE user_id=$1
         AND sent_at > now() - interval '1 hour'`,
      [user.id]
    );
    if (Number(hourly?.count || 0) >= EMAIL_OTP_MAX_SENDS_PER_HOUR) {
      throw new HttpException(
        {
          message: "ส่ง OTP ถึงจำนวนสูงสุดชั่วคราว กรุณาลองใหม่ภายหลัง",
          retryAfterSeconds: 3600
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const otp = randomInt(100000, 1000000).toString();
    const codeHash = await hash(otp, 10);

    await this.db.query(
      `UPDATE email_verification_codes
       SET consumed_at=COALESCE(consumed_at,now())
       WHERE user_id=$1 AND consumed_at IS NULL`,
      [user.id]
    );

    const record = await this.db.one(
      `INSERT INTO email_verification_codes(
         user_id,code_hash,expires_at,request_ip
       )
       VALUES($1,$2,now() + interval '10 minutes',$3)
       RETURNING id`,
      [user.id, codeHash, this.clientIp(req)]
    );

    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.EMAIL_FROM || "").trim();

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: "รหัสยืนยันอีเมล SCENOVA",
          html:
            '<div style="font-family:Arial,sans-serif;background:#090711;color:#f4f1ff;padding:32px">' +
            '<div style="max-width:520px;margin:auto;border:1px solid #4d3d78;border-radius:16px;padding:28px;background:#100c1d">' +
            '<div style="font-size:12px;letter-spacing:3px;color:#a38bff">SCENOVA SECURE ACCESS</div>' +
            '<h2 style="margin:14px 0 8px">ยืนยันอีเมลของคุณ</h2>' +
            '<p style="color:#b9b1c8;line-height:1.7">ใช้รหัส 6 หลักด้านล่างเพื่อยืนยันบัญชี SCENOVA รหัสจะหมดอายุใน 10 นาที</p>' +
            '<div style="font-size:34px;font-weight:800;letter-spacing:10px;margin:24px 0;color:#ffffff">' +
            otp +
            '</div>' +
            '<p style="color:#777083;font-size:12px;line-height:1.6">หากคุณไม่ได้สมัครบัญชี SCENOVA สามารถละเว้นอีเมลฉบับนี้ได้ และอย่าส่งต่อรหัสนี้ให้ผู้อื่น</p>' +
            '</div></div>'
        })
      });

      if (!response.ok) {
        throw new Error("resend request failed");
      }
    } catch {
      if (record?.id) {
        await this.db.query(
          "DELETE FROM email_verification_codes WHERE id=$1",
          [record.id]
        );
      }
      await this.authEvent(user.id, user.email, "EMAIL_OTP_SEND_FAILED", req);
      throw new ServiceUnavailableException(
        "ไม่สามารถส่ง OTP ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง"
      );
    }

    await this.authEvent(user.id, user.email, "EMAIL_OTP_SENT", req);
    return {
      expiresInSeconds: EMAIL_OTP_TTL_SECONDS,
      retryAfterSeconds: EMAIL_OTP_RESEND_COOLDOWN_SECONDS
    };
  }

  @Get("session")
  @UseGuards(JwtGuard)
  async session(@Req() req: any) {
    const user = await this.db.one(
      "SELECT id,user_code,email,role,status,email_verified_at FROM users WHERE id=$1",
      [req.user.sub]
    );
    if (
      !user ||
      user.status !== "ACTIVE" ||
      (this.verificationRequired() && !user.email_verified_at)
    ) {
      throw new UnauthorizedException("session unavailable");
    }
    return {
      authenticated: true,
      user: this.publicUser(user)
    };
  }

  @Post("register")
  async register(
    @Req() req: any,
    @Body() body: { email: string; password: string; referralCode?: string }
  ) {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || password.length < 8) {
      throw new ConflictException(
        "email required and password must be at least 8 characters"
      );
    }

    const inviteCode = String(body.referralCode || "").trim().toUpperCase();
    const sponsor = inviteCode
      ? await this.db.one(
          `SELECT id,user_code,referral_code
           FROM users
           WHERE lower(referral_code)=lower($1)
             AND status='ACTIVE'
           LIMIT 1`,
          [inviteCode]
        )
      : null;
    if (inviteCode && !sponsor) {
      throw new BadRequestException("Invite code is invalid or unavailable");
    }

    const requireVerification = this.verificationRequired();
    if (requireVerification) this.assertVerificationConfigured();

    const existing = await this.db.one(
      "SELECT id,status FROM users WHERE email=$1",
      [email]
    );
    if (existing) {
      if (existing.status !== "DELETED") {
        throw new ConflictException("email already exists");
      }
      // Older soft-deleted accounts still occupy the unique email. Release
      // only this deleted record; never reset its MT5/Trial history or user ID.
      const released = await this.db.query(
        `UPDATE users SET email='deleted.' || id::text || '@deleted.scenova.invalid',
           updated_at=now()
         WHERE id=$1 AND email=$2 AND status='DELETED'`,
        [existing.id, email]
      );
      if (released.rowCount !== 1) {
        throw new ConflictException("email already exists");
      }
    }

    const passwordHash = await hash(password, 12);
    const code = "BOT-" + Date.now().toString(36).toUpperCase();
    const ownReferralCode = "SCN-" + code.replace(/^BOT-/i, "");

    const user = requireVerification
      ? await this.db.one(
          `INSERT INTO users(
             user_code,email,password_hash,email_verified_at,
             referral_code,referred_by_user_id,referred_at
           )
           VALUES($1,$2,$3,NULL,$4,$5,CASE WHEN $5::uuid IS NULL THEN NULL ELSE now() END)
           RETURNING id,user_code,email,role,status,email_verified_at,referral_code,referred_by_user_id`,
          [code, email, passwordHash, ownReferralCode, sponsor?.id || null]
        )
      : await this.db.one(
          `INSERT INTO users(
             user_code,email,password_hash,email_verified_at,
             referral_code,referred_by_user_id,referred_at
           )
           VALUES($1,$2,$3,now(),$4,$5,CASE WHEN $5::uuid IS NULL THEN NULL ELSE now() END)
           RETURNING id,user_code,email,role,status,email_verified_at,referral_code,referred_by_user_id`,
          [code, email, passwordHash, ownReferralCode, sponsor?.id || null]
        );

    await this.authEvent(user.id, email, "REGISTER", req);

    if (requireVerification) {
      const delivery = await this.sendVerificationCode(user, req);
      return {
        user: this.publicUser(user),
        email,
        requiresEmailVerification: true,
        referralApplied: Boolean(sponsor?.id),
        ...delivery
      };
    }

    return {
      user: this.publicUser(user),
      token: this.tokenFor(user),
      requiresEmailVerification: false,
      referralApplied: Boolean(sponsor?.id)
    };
  }

  @Post("reset-password")
  async resetPassword(
    @Req() req: any,
    @Body() body: { token: string; password: string }
  ) {
    const token = String(body.token || "").trim();
    const password = String(body.password || "");
    if (token.length < 20) throw new BadRequestException("ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง");
    if (password.length < 8) {
      throw new BadRequestException("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const reset = await this.db.one(
      `SELECT pr.id,pr.user_id,u.email,u.status
       FROM password_reset_tokens pr
       JOIN users u ON u.id=pr.user_id
       WHERE pr.token_hash=$1
         AND pr.consumed_at IS NULL
         AND pr.expires_at>now()
         AND u.status<>'DELETED'
       LIMIT 1`,
      [tokenHash]
    );
    if (!reset) {
      throw new BadRequestException("ลิงก์รีเซ็ตรหัสผ่านหมดอายุหรือถูกใช้ไปแล้ว");
    }

    const passwordHash = await hash(password, 12);
    await this.db.transaction(async client => {
      await client.query(
        "UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1",
        [reset.user_id, passwordHash]
      );
      await client.query(
        `UPDATE password_reset_tokens
         SET consumed_at=COALESCE(consumed_at,now())
         WHERE user_id=$1 AND consumed_at IS NULL`,
        [reset.user_id]
      );
      await client.query(
        `INSERT INTO user_security(user_id,last_password_changed_at,updated_at)
         VALUES($1,now(),now())
         ON CONFLICT(user_id) DO UPDATE
         SET last_password_changed_at=now(),updated_at=now()`,
        [reset.user_id]
      );
      await client.query(
        `UPDATE two_factor_login_challenges
         SET consumed_at=COALESCE(consumed_at,now())
         WHERE user_id=$1 AND consumed_at IS NULL`,
        [reset.user_id]
      );
    });

    await this.authEvent(reset.user_id, reset.email, "PASSWORD_RESET", req);
    return { ok: true, message: "ตั้งรหัสผ่านใหม่สำเร็จแล้ว" };
  }

  @Post("login")
  async login(@Req() req: any, @Body() body: { email: string; password: string }) {
    const email = String(body.email || "").trim().toLowerCase();
    const user = await this.db.one(
      `SELECT id,user_code,email,password_hash,role,status,email_verified_at
       FROM users
       WHERE email=$1`,
      [email]
    );

    if (!user || !(await compare(String(body.password || ""), user.password_hash))) {
      await this.authEvent(user?.id || null, email, "LOGIN_FAILED", req);
      throw new UnauthorizedException("invalid email or password");
    }

    if (user.status !== "ACTIVE") {
      await this.authEvent(user.id, email, "LOGIN_BLOCKED", req);
      throw new UnauthorizedException("account unavailable");
    }

    if (this.verificationRequired() && !user.email_verified_at) {
      await this.authEvent(user.id, email, "LOGIN_VERIFY_REQUIRED", req);
      return {
        requiresEmailVerification: true,
        email: user.email
      };
    }

    const security = await this.db.one(
      "SELECT two_factor_enabled_at FROM user_security WHERE user_id=$1",
      [user.id]
    );
    if (security?.two_factor_enabled_at) {
      const challenge = randomBytes(32).toString("base64url");
      const challengeHash = createHash("sha256").update(challenge).digest("hex");
      await this.db.transaction(async client => {
        await client.query(
          `UPDATE two_factor_login_challenges
           SET consumed_at=COALESCE(consumed_at,now())
           WHERE user_id=$1 AND consumed_at IS NULL`,
          [user.id]
        );
        await client.query(
          `INSERT INTO two_factor_login_challenges(
             user_id,token_hash,request_ip,expires_at
           ) VALUES($1,$2,$3,now() + interval '5 minutes')`,
          [user.id, challengeHash, this.clientIp(req)]
        );
      });
      await this.authEvent(user.id, email, "LOGIN_2FA_REQUIRED", req);
      return {
        requiresTwoFactor: true,
        twoFactorChallenge: challenge,
        email: user.email,
        requiresEmailVerification: false
      };
    }

    await this.authEvent(user.id, email, "LOGIN", req);
    return {
      user: this.publicUser(user),
      token: this.tokenFor(user),
      requiresEmailVerification: false
    };
  }

  @Post("resend-verification")
  async resendVerification(@Req() req: any, @Body() body: { email: string }) {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) throw new BadRequestException("email required");

    const user = await this.db.one(
      `SELECT id,user_code,email,role,status,email_verified_at
       FROM users
       WHERE email=$1`,
      [email]
    );

    if (!user) {
      return {
        sent: true,
        retryAfterSeconds: EMAIL_OTP_RESEND_COOLDOWN_SECONDS
      };
    }

    if (user.email_verified_at) {
      return {
        sent: false,
        verified: true
      };
    }

    const delivery = await this.sendVerificationCode(user, req);
    return {
      sent: true,
      ...delivery
    };
  }

  @Post("verify-email")
  async verifyEmail(
    @Req() req: any,
    @Body() body: { email: string; code: string }
  ) {
    const email = String(body.email || "").trim().toLowerCase();
    const code = String(body.code || "").trim();

    if (!email || !/^\d{6}$/.test(code)) {
      throw new BadRequestException("กรุณากรอกอีเมลและ OTP 6 หลักให้ถูกต้อง");
    }

    const user = await this.db.one(
      `SELECT id,user_code,email,role,status,email_verified_at
       FROM users
       WHERE email=$1`,
      [email]
    );

    if (!user || user.status !== "ACTIVE") {
      throw new BadRequestException("รหัส OTP ไม่ถูกต้องหรือหมดอายุ");
    }

    if (user.email_verified_at) {
      return {
        verified: true,
        user: this.publicUser(user),
        token: this.tokenFor(user)
      };
    }

    const record = await this.db.one(
      `SELECT id,code_hash,attempts,expires_at
       FROM email_verification_codes
       WHERE user_id=$1
         AND consumed_at IS NULL
         AND expires_at > now()
       ORDER BY sent_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (!record || Number(record.attempts || 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        "รหัส OTP หมดอายุหรือถูกใช้ครบจำนวนครั้ง กรุณาขอรหัสใหม่"
      );
    }

    const matched = await compare(code, record.code_hash);
    if (!matched) {
      const updated = await this.db.one(
        `UPDATE email_verification_codes
         SET attempts=attempts+1
         WHERE id=$1 AND consumed_at IS NULL
         RETURNING attempts`,
        [record.id]
      );
      await this.authEvent(user.id, email, "EMAIL_OTP_FAILED", req);
      const attemptsLeft = Math.max(
        0,
        EMAIL_OTP_MAX_ATTEMPTS - Number(updated?.attempts || 0)
      );
      throw new BadRequestException(
        attemptsLeft > 0
          ? "OTP ไม่ถูกต้อง เหลือลองได้ " + attemptsLeft + " ครั้ง"
          : "OTP ถูกกรอกผิดครบจำนวนครั้ง กรุณาขอรหัสใหม่"
      );
    }

    const verifiedUser = await this.db.transaction(async client => {
      const consumed = await client.query(
        `UPDATE email_verification_codes
         SET consumed_at=now()
         WHERE id=$1 AND consumed_at IS NULL
         RETURNING id`,
        [record.id]
      );
      if (consumed.rowCount !== 1) {
        throw new BadRequestException("รหัส OTP ถูกใช้ไปแล้ว กรุณาขอรหัสใหม่");
      }

      const updated = await client.query(
        `UPDATE users
         SET email_verified_at=COALESCE(email_verified_at,now()),
             updated_at=now()
         WHERE id=$1
         RETURNING id,user_code,email,role,status,email_verified_at`,
        [user.id]
      );
      return updated.rows[0];
    });

    await this.authEvent(user.id, email, "EMAIL_VERIFIED", req);

    return {
      verified: true,
      user: this.publicUser(verifiedUser),
      token: this.tokenFor(verifiedUser)
    };
  }
}
