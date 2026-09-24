import {
  BadRequestException,
  Body,
  CanActivate,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  ExecutionContext
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { DbService } from "./db.service";
import { AdminGuard, CryptoService } from "./security";
import { CommissionWithdrawalService } from "./commission-withdrawal.service";

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const DEVICE_LOCK_MINUTES = 15;
const MAX_PIN_ATTEMPTS = 5;

function clientIp(req: any) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
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

function paymentMode() {
  const key = String(process.env.OMISE_SECRET_KEY || "");
  return key.startsWith("skey_live_")
    ? "LIVE"
    : key.startsWith("skey_test_")
      ? "TEST"
      : "UNCONFIGURED";
}

@Injectable()
export class OwnerMobileGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DbService
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const raw = String(req.headers.authorization || "");
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
    if (!token) throw new UnauthorizedException("mobile session required");

    let payload: any;
    try {
      payload = this.jwt.verify(token, { audience: "owner-mobile" });
    } catch {
      throw new UnauthorizedException("mobile session expired");
    }
    if (payload?.scope !== "owner-mobile" || payload?.role !== "OWNER" || !payload?.deviceRecordId) {
      throw new ForbiddenException("owner mobile session required");
    }

    const device = await this.db.one(
      `SELECT d.id,d.user_id,u.user_code,u.role,u.status
       FROM owner_mobile_devices d
       JOIN users u ON u.id=d.user_id
       WHERE d.id=$1 AND d.user_id=$2 AND d.disabled_at IS NULL`,
      [payload.deviceRecordId, payload.sub]
    );
    if (!device || device.status !== "ACTIVE" || device.role !== "OWNER") {
      throw new ForbiddenException("mobile device is not active");
    }

    req.user = payload;
    req.ownerMobileDevice = device;
    void this.db.query(
      "UPDATE owner_mobile_devices SET last_seen_at=now() WHERE id=$1",
      [device.id]
    ).catch(() => {});
    return true;
  }
}

@Injectable()
export class OwnerMobileService implements OnApplicationBootstrap {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    private readonly withdrawals: CommissionWithdrawalService
  ) {}

  async onApplicationBootstrap() {
    await this.ensureSchema();
  }

  private enabled() {
    return process.env.OWNER_MOBILE_ENABLED === "true";
  }

  private requireEnabled() {
    if (!this.enabled()) {
      throw new ServiceUnavailableException("Owner Mobile is disabled. Set OWNER_MOBILE_ENABLED=true after testing.");
    }
  }

  private tokenMinutes() {
    const value = Math.trunc(Number(process.env.OWNER_MOBILE_TOKEN_MINUTES || 15));
    return Math.min(60, Math.max(5, value));
  }

  private cashBufferSatang() {
    const value = Math.trunc(Number(process.env.OWNER_CASH_BUFFER_SATANG || 0));
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  async ensureSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS owner_mobile_devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        device_id_hash char(64) NOT NULL UNIQUE,
        device_name varchar(160) NOT NULL,
        device_secret_hash char(64) NOT NULL,
        pin_hash text NOT NULL,
        failed_pin_attempts integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        enrolled_at timestamptz NOT NULL DEFAULT now(),
        last_unlocked_at timestamptz,
        last_seen_at timestamptz,
        disabled_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_owner_mobile_devices_user
        ON owner_mobile_devices(user_id,disabled_at,last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS owner_omise_transfers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        device_id uuid NOT NULL REFERENCES owner_mobile_devices(id) ON DELETE RESTRICT,
        client_request_key varchar(100) NOT NULL,
        amount_satang integer NOT NULL CHECK(amount_satang>0),
        currency varchar(8) NOT NULL DEFAULT 'THB',
        status varchar(20) NOT NULL DEFAULT 'CREATING'
          CHECK(status IN ('CREATING','SUBMITTED','SENT','FAILED','REVIEW')),
        provider_transfer_id varchar(180),
        provider_status varchar(80),
        failure_code varchar(120),
        failure_message text,
        request_ip varchar(96),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(owner_user_id,client_request_key)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_omise_transfer_provider
        ON owner_omise_transfers(provider_transfer_id)
        WHERE provider_transfer_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_owner_omise_transfer_recent
        ON owner_omise_transfers(created_at DESC);
    `);
  }

  private async userSecurity(userId: string) {
    return this.db.one(
      `SELECT u.id,u.user_code,u.email,u.password_hash,u.role,u.status,
              s.totp_secret_ciphertext,s.totp_secret_iv,s.totp_secret_auth_tag,
              s.two_factor_enabled_at
       FROM users u
       LEFT JOIN user_security s ON s.user_id=u.id
       WHERE u.id=$1`,
      [userId]
    );
  }

  private async verifyTotpForUser(userId: string, code: string) {
    const row = await this.userSecurity(userId);
    if (!row || row.status !== "ACTIVE" || row.role !== "OWNER") {
      throw new ForbiddenException("owner account unavailable");
    }
    if (!row.two_factor_enabled_at) {
      throw new ForbiddenException("เปิด Two-Factor Authentication ก่อนใช้ Owner Mobile");
    }
    if (!row.totp_secret_ciphertext || !row.totp_secret_iv || !row.totp_secret_auth_tag) {
      throw new ServiceUnavailableException("Two-Factor Authentication configuration unavailable");
    }
    const secret = this.crypto.decrypt({
      ciphertext: String(row.totp_secret_ciphertext),
      iv: String(row.totp_secret_iv),
      authTag: String(row.totp_secret_auth_tag)
    });
    if (!verifyTotp(secret, String(code || "").trim())) {
      throw new BadRequestException("Two-factor code is invalid");
    }
    return row;
  }

  private async stepUpEnrollment(userId: string, password: string, code: string) {
    const row = await this.verifyTotpForUser(userId, code);
    if (!(await compare(String(password || ""), String(row.password_hash || "")))) {
      throw new BadRequestException("Current password is incorrect");
    }
    return row;
  }

  async enroll(
    userId: string,
    input: {
      deviceId?: string;
      deviceName?: string;
      pin?: string;
      currentPassword?: string;
      twoFactorCode?: string;
    },
    ip?: string | null
  ) {
    this.requireEnabled();
    const deviceId = String(input.deviceId || "").trim();
    const deviceName = String(input.deviceName || "Owner phone").trim().slice(0, 160);
    const pin = String(input.pin || "").trim();
    if (deviceId.length < 16 || deviceId.length > 180) {
      throw new BadRequestException("device id is invalid");
    }
    if (!/^\d{6}$/.test(pin) || /^(\d)\1{5}$/.test(pin) || pin === "123456" || pin === "654321") {
      throw new BadRequestException("PIN ต้องเป็นตัวเลข 6 หลักและห้ามเป็นเลขเดาง่าย");
    }
    const owner = await this.stepUpEnrollment(
      userId,
      String(input.currentPassword || ""),
      String(input.twoFactorCode || "")
    );
    if (owner.role !== "OWNER") throw new ForbiddenException("OWNER role required");

    const deviceSecret = randomBytes(32).toString("base64url");
    const pinHash = await hash(pin, 12);
    const deviceIdHash = sha256(deviceId);
    const existing = await this.db.one(
      "SELECT id FROM owner_mobile_devices WHERE device_id_hash=$1",
      [deviceIdHash]
    );
    if (existing) {
      throw new ConflictException("โทรศัพท์เครื่องนี้เคยลงทะเบียนแล้ว ให้ Revoke เครื่องเดิมก่อนลงทะเบียนใหม่");
    }

    const device = await this.db.one(
      `INSERT INTO owner_mobile_devices(
         user_id,device_id_hash,device_name,device_secret_hash,pin_hash,last_seen_at
       ) VALUES($1,$2,$3,$4,$5,now())
       RETURNING id,device_name,enrolled_at`,
      [userId, deviceIdHash, deviceName || "Owner phone", sha256(deviceSecret), pinHash]
    );
    await this.db.query(
      `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
       VALUES($1,'OWNER_MOBILE_ENROLLED','owner_mobile_device',$2,$3::jsonb)`,
      [owner.user_code, device.id, JSON.stringify({ deviceName, ip: ip || null })]
    );
    return {
      deviceRecordId: device.id,
      deviceName: device.device_name,
      enrolledAt: device.enrolled_at,
      deviceSecret
    };
  }

  async unlock(input: { deviceId?: string; deviceSecret?: string; pin?: string }, ip?: string | null) {
    this.requireEnabled();
    const deviceId = String(input.deviceId || "").trim();
    const secret = String(input.deviceSecret || "").trim();
    const pin = String(input.pin || "").trim();
    if (!deviceId || !secret || !/^\d{6}$/.test(pin)) {
      throw new UnauthorizedException("PIN or device credentials invalid");
    }

    const device = await this.db.one(
      `SELECT d.*,u.user_code,u.role,u.status
       FROM owner_mobile_devices d
       JOIN users u ON u.id=d.user_id
       WHERE d.device_id_hash=$1 AND d.disabled_at IS NULL`,
      [sha256(deviceId)]
    );
    if (!