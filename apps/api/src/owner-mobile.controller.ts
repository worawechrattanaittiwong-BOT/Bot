import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  OnApplicationBootstrap,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { DbService } from "./db.service";
import { CryptoService } from "./security";
import { CommissionWithdrawalService } from "./commission-withdrawal.service";

const SESSION_HOURS = 12;
const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MINUTES = 30;

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function clientIp(req: any) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
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
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000) >>> 0, 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const supplied = Buffer.from(code);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -1; offset <= 1; offset++) {
    const expected = Buffer.from(hotp(secret, counter + offset));
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  return false;
}

const OWNER_MOBILE_SCHEMA = `
CREATE TABLE IF NOT EXISTS owner_mobile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id varchar(180) NOT NULL,
  device_name varchar(120),
  pin_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'ACTIVE',
  failed_pin_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(owner_user_id,device_id)
);
CREATE TABLE IF NOT EXISTS owner_mobile_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_row_id uuid NOT NULL REFERENCES owner_mobile_devices(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS owner_omise_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_satang integer NOT NULL CHECK(amount_satang>0),
  currency varchar(8) NOT NULL DEFAULT 'THB',
  status varchar(20) NOT NULL DEFAULT 'CREATING',
  client_request_key varchar(100) NOT NULL UNIQUE,
  omise_transfer_id varchar(180) UNIQUE,
  provider_status varchar(80),
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_ip varchar(96),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

@Injectable()
export class OwnerMobileService implements OnApplicationBootstrap {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly withdrawals: CommissionWithdrawalService
  ) {}

  async onApplicationBootstrap() {
    await this.db.query(OWNER_MOBILE_SCHEMA);
  }

  private paymentMode() {
    const key = String(process.env.OMISE_SECRET_KEY || "");
    return key.startsWith("skey_live_") ? "LIVE" : key.startsWith("skey_test_") ? "TEST" : "UNCONFIGURED";
  }

  private async omise(path: string, fields?: URLSearchParams) {
    const secret = String(process.env.OMISE_SECRET_KEY || "");
    if (!secret) throw new ServiceUnavailableException("Omise ยังไม่ได้ตั้งค่า");
    const response = await fetch("https://api.omise.co" + path, {
      method: fields ? "POST" : "GET",
      headers: {
        Authorization: "Basic " + Buffer.from(secret + ":").toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "Omise-Version": "2019-05-29"
      },
      body: fields,
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ServiceUnavailableException(
        String(data?.message || "ติดต่อ Omise ไม่สำเร็จ")
      );
    }
    return data;
  }

  private async totpSecret(userId: string) {
    const row = await this.db.one(
      `SELECT s.totp_secret_ciphertext,s.totp_secret_iv,s.totp_secret_auth_tag,s.two_factor_enabled_at
       FROM user_security s WHERE s.user_id=$1`,
      [userId]
    );
    if (!row?.two_factor_enabled_at) {
      throw new UnauthorizedException("ต้องเปิด Two-Factor Authentication ก่อน");
    }
    return this.crypto.decrypt({
      ciphertext: String(row.totp_secret_ciphertext || ""),
      iv: String(row.totp_secret_iv || ""),
      authTag: String(row.totp_secret_auth_tag || "")
    });
  }

  async enroll(input: {
    email?: string;
    password?: string;
    twoFactorCode?: string;
    deviceId?: string;
    deviceName?: string;
    pin?: string;
  }) {
    const email = String(input.email || "").trim().toLowerCase();
    const deviceId = String(input.deviceId || "").trim().slice(0, 180);
    const deviceName = String(input.deviceName || "Owner phone").trim().slice(0, 120);
    const pin = String(input.pin || "").trim();

    if (!email || !deviceId || !/^\d{6}$/.test(pin)) {
      throw new BadRequestException("ข้อมูลลงทะเบียนเครื่องไม่ครบ หรือ PIN ต้องเป็นตัวเลข 6 หลัก");
    }

    const user = await this.db.one(
      "SELECT id,email,password_hash,role,status,user_code FROM users WHERE lower(email)=lower($1)",
      [email]
    );
    if (!user || user.status !== "ACTIVE" || String(user.role).toUpperCase() !== "OWNER") {
      throw new UnauthorizedException("บัญชีนี้ไม่อนุญาตให้ใช้ Owner Mobile");
    }
    if (!(await compare(String(input.password || ""), String(user.password_hash || "")))) {
      throw new UnauthorizedException("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    const secret = await this.totpSecret(user.id);
    if (!verifyTotp(secret, String(input.twoFactorCode || "").trim())) {
      throw new UnauthorizedException("รหัส 2FA ไม่ถูกต้อง");
    }

    const pinHash = await hash(pin, 12);
    const existing = await this.db.one(
      "SELECT id,status FROM owner_mobile_devices WHERE owner_user_id=$1 AND device_id=$2",
      [user.id, deviceId]
    );
    if (existing?.status === "ACTIVE") {
      throw new ConflictException("โทรศัพท์เครื่องนี้ลงทะเบียนแล้ว กรุณาเข้าใช้งานด้วย PIN");
    }

    const device = await this.db.one(
      `INSERT INTO owner_mobile_devices(owner_user_id,device_id,device_name,pin_hash,status)
       VALUES($1,$2,$3,$4,'ACTIVE')
       ON CONFLICT(owner_user_id,device_id)
       DO UPDATE SET device_name=excluded.device_name,pin_hash=excluded.pin_hash,status='ACTIVE',
                     failed_pin_attempts=0,locked_until=NULL,revoked_at=NULL
       RETURNING id`,
      [user.id, deviceId, deviceName, pinHash]
    );

    return this.createSession(user.id, device.id);
  }

  private async createSession(ownerUserId: string, deviceRowId: string) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
    await this.db.query(
      `INSERT INTO owner_mobile_sessions(owner_user_id,device_row_id,token_hash,expires_at)
       VALUES($1,$2,$3,$4)`,
      [ownerUserId, deviceRowId, sha256(token), expiresAt]
    );
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async pinLogin(input: { deviceId?: string; pin?: string }) {
    const deviceId = String(input.deviceId || "").trim();
    const pin = String(input.pin || "").trim();
    const row = await this.db.one(
      `SELECT d.*,u.status user_status,u.role
       FROM owner_mobile_devices d
       JOIN users u ON u.id=d.owner_user_id
       WHERE d.device_id=$1 AND d.status='ACTIVE'
       ORDER BY d.created_at DESC LIMIT 1`,
      [deviceId]
    );
    if (!row || row.user_status !== "ACTIVE" || String(row.role).toUpperCase() !== "OWNER") {
      throw new UnauthorizedException("ไม่พบอุปกรณ์ที่ลงทะเบียน");
    }
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      throw new UnauthorizedException("PIN ถูกล็อกชั่วคราว กรุณารอแล้วลองใหม่");
    }
    if (!(await compare(pin, String(row.pin_hash || "")))) {
      const failures = Number(row.failed_pin_attempts || 0) + 1;
      const lock = failures >= MAX_PIN_FAILURES
        ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000)
        : null;
      await this.db.query(
        "UPDATE owner_mobile_devices SET failed_pin_attempts=$2,locked_until=$3 WHERE id=$1",
        [row.id, failures >= MAX_PIN_FAILURES ? 0 : failures, lock]
      );
      throw new UnauthorizedException("PIN ไม่ถูกต้อง");
    }

    await this.db.query(
      "UPDATE owner_mobile_devices SET failed_pin_attempts=0,locked_until=NULL,last_login_at=now(),last_seen_at=now() WHERE id=$1",
      [row.id]
    );
    return this.createSession(row.owner_user_id, row.id);
  }

  async session(req: any) {
    const auth = String(req?.headers?.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) throw new UnauthorizedException("Owner Mobile session required");

    const session = await this.db.one(
      `SELECT s.id,s.owner_user_id,s.device_row_id,s.expires_at,d.device_id,d.device_name,d.pin_hash,
              u.user_code,u.role,u.status
       FROM owner_mobile_sessions s
       JOIN owner_mobile_devices d ON d.id=s.device_row_id
       JOIN users u ON u.id=s.owner_user_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
         AND d.status='ACTIVE'`,
      [sha256(token)]
    );
    if (!session || session.status !== "ACTIVE" || String(session.role).toUpperCase() !== "OWNER") {
      throw new UnauthorizedException("Session หมดอายุหรือถูกยกเลิก");
    }
    await this.db.query(
      "UPDATE owner_mobile_sessions SET last_seen_at=now() WHERE id=$1",
      [session.id]
    );
    await this.db.query(
      "UPDATE owner_mobile_devices SET last_seen_at=now() WHERE id=$1",
      [session.device_row_id]
    );
    return session;
  }

  async verifyPin(session: any, pin?: string) {
    if (!/^\d{6}$/.test(String(pin || ""))) {
      throw new UnauthorizedException("กรุณายืนยัน PIN 6 หลัก");
    }
    if (!(await compare(String(pin), String(session.pin_hash)))) {
      throw new UnauthorizedException("PIN ไม่ถูกต้อง");
    }
  }

  async logout(req: any) {
    const auth = String(req?.headers?.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (token) {
      await this.db.query(
        "UPDATE owner_mobile_sessions SET revoked_at=now() WHERE token_hash=$1",
        [sha256(token)]
      );
    }
    return { ok: true };
  }

  async summary() {
    const [balance, commission, queue, recentTransfers] = await Promise.all([
      this.omise("/balance"),
      this.db.one(
        `SELECT
           COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='PENDING'),0)::bigint pending_satang,
           COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='AVAILABLE'),0)::bigint available_satang,
           COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='PAID'),0)::bigint paid_satang
         FROM referral_commissions`
      ),
      this.db.one(
        `SELECT
           COUNT(*) FILTER (WHERE status='REQUESTED')::int requested_count,
           COUNT(*) FILTER (WHERE status='HOLD')::int hold_count,
           COUNT(*) FILTER (WHERE status='APPROVED')::int approved_count,
           COALESCE(SUM(amount_satang) FILTER (WHERE status IN ('REQUESTED','HOLD','APPROVED')),0)::bigint waiting_satang
         FROM commission_withdrawals`
      ),
      this.db.query(
        `SELECT id,amount_satang,status,omise_transfer_id,provider_status,created_at
         FROM owner_omise_transfers ORDER BY created_at DESC LIMIT 10`
      )
    ]);

    const transferable = Number(balance?.transferable || 0);
    const total = Number(balance?.total || 0);
    const pendingCommission = Number(commission?.pending_satang || 0);
    const availableCommission = Number(commission?.available_satang || 0);
    const reserve = Math.max(0, Math.trunc(Number(process.env.OWNER_OMISE_RESERVE_SATANG || 0)));
    const commissionLiability = pendingCommission + availableCommission;
    const safeWithdrawable = Math.max(0, transferable - commissionLiability - reserve);

    return {
      paymentMode: this.paymentMode(),
      omise: { totalSatang: total, transferableSatang: transferable },
      commission: {
        pendingSatang: pendingCommission,
        availableSatang: availableCommission,
        paidSatang: Number(commission?.paid_satang || 0)
      },
      approvals: {
        requestedCount: Number(queue?.requested_count || 0),
        holdCount: Number(queue?.hold_count || 0),
        approvedCount: Number(queue?.approved_count || 0),
        waitingSatang: Number(queue?.waiting_satang || 0)
      },
      owner: {
        reserveSatang: reserve,
        commissionLiabilitySatang: commissionLiability,
        safeWithdrawableSatang: safeWithdrawable
      },
      recentOwnerTransfers: recentTransfers.rows
    };
  }

  async approvalQueue() {
    const dashboard = await this.withdrawals.adminDashboard();
    return {
      summary: dashboard.summary,
      items: dashboard.items.filter((item: any) =>
        ["REQUESTED", "HOLD", "APPROVED"].includes(String(item.status))
      )
    };
  }

  async approve(session: any, id: string, pin: string, reason?: string) {
    await this.verifyPin(session, pin);
    return this.withdrawals.approve(
      session.owner_user_id,
      id,
      "OWNER-MOBILE:" + String(session.user_code || session.owner_user_id),
      String(reason || ""),
      null
    );
  }

  async hold(session: any, id: string, pin: string, reason?: string) {
    await this.verifyPin(session, pin);
    return this.withdrawals.hold(
      id,
      "OWNER-MOBILE:" + String(session.user_code || session.owner_user_id),
      String(reason || ""),
      null
    );
  }

  async reject(session: any, id: string, pin: string, reason?: string) {
    await this.verifyPin(session, pin);
    return this.withdrawals.reject(
      id,
      "OWNER-MOBILE:" + String(session.user_code || session.owner_user_id),
      String(reason || ""),
      null
    );
  }

  async ownerTransfer(
    session: any,
    input: { amountSatang?: number; pin?: string; clientRequestKey?: string },
    ip?: string | null
  ) {
    await this.verifyPin(session, input.pin);
    const amount = Math.trunc(Number(input.amountSatang || 0));
    const requestKey = String(input.clientRequestKey || "").trim().slice(0, 100);
    if (amount < 100 || !requestKey) {
      throw new BadRequestException("ยอดถอนหรือ Request Key ไม่ถูกต้อง");
    }

    const existing = await this.db.one(
      "SELECT * FROM owner_omise_transfers WHERE client_request_key=$1",
      [requestKey]
    );
    if (existing) return existing;

    const snapshot = await this.summary();
    if (amount > Number(snapshot.owner.safeWithdrawableSatang || 0)) {
      throw new ConflictException("ยอดถอนสูงกว่า Safe Withdrawable Balance");
    }

    const local = await this.db.one(
      `INSERT INTO owner_omise_transfers(owner_user_id,amount_satang,client_request_key,requested_ip)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [session.owner_user_id, amount, requestKey, ip || null]
    );

    try {
      const transfer = await this.omise("/transfers", new URLSearchParams({
        amount: String(amount)
      }));
      const providerStatus = String(transfer?.status || (transfer?.paid ? "paid" : "submitted"));
      return await this.db.one(
        `UPDATE owner_omise_transfers
         SET status=$2,omise_transfer_id=$3,provider_status=$4,provider_response=$5::jsonb,updated_at=now()
         WHERE id=$1 RETURNING *`,
        [
          local.id,
          transfer?.paid === true ? "SUCCEEDED" : "SUBMITTED",
          String(transfer?.id || "") || null,
          providerStatus,
          JSON.stringify({
            id: transfer?.id || null,
            amount: transfer?.amount || null,
            currency: transfer?.currency || null,
            status: transfer?.status || null,
            paid: transfer?.paid ?? null,
            created_at: transfer?.created_at || null
          })
        ]
      );
    } catch (error: any) {
      await this.db.query(
        `UPDATE owner_omise_transfers
         SET status='REVIEW',provider_status='UNKNOWN',provider_response=$2::jsonb,updated_at=now()
         WHERE id=$1`,
        [local.id, JSON.stringify({ error: String(error?.message || "unknown") })]
      );
      throw new ConflictException(
        "สถานะการถอนยังยืนยันไม่ได้ กรุณาตรวจรายการก่อนกดซ้ำ"
      );
    }
  }
}

@Controller("owner-mobile")
export class OwnerMobileController {
  constructor(private readonly ownerMobile: OwnerMobileService) {}

  @Post("enroll")
  enroll(@Body() body: any) {
    return this.ownerMobile.enroll(body || {});
  }

  @Post("pin-login")
  pinLogin(@Body() body: any) {
    return this.ownerMobile.pinLogin(body || {});
  }

  @Post("logout")
  async logout(@Req() req: any) {
    await this.ownerMobile.session(req);
    return this.ownerMobile.logout(req);
  }

  @Get("summary")
  async summary(@Req() req: any) {
    await this.ownerMobile.session(req);
    return this.ownerMobile.summary();
  }

  @Get("approvals")
  async approvals(@Req() req: any) {
    await this.ownerMobile.session(req);
    return this.ownerMobile.approvalQueue();
  }

  @Post("approvals/:id/approve")
  async approve(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.ownerMobile.session(req);
    return this.ownerMobile.approve(session, id, String(body?.pin || ""), body?.reason);
  }

  @Post("approvals/:id/hold")
  async hold(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.ownerMobile.session(req);
    return this.ownerMobile.hold(session, id, String(body?.pin || ""), body?.reason);
  }

  @Post("approvals/:id/reject")
  async reject(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.ownerMobile.session(req);
    return this.ownerMobile.reject(session, id, String(body?.pin || ""), body?.reason);
  }

  @Post("withdraw")
  async withdraw(@Req() req: any, @Body() body: any) {
    const session = await this.ownerMobile.session(req);
    return this.ownerMobile.ownerTransfer(session, body || {}, clientIp(req));
  }
}
