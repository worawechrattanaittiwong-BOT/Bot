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
    if (!device || device.role !== "OWNER" || device.status !== "ACTIVE") {
      throw new UnauthorizedException("device unavailable");
    }
    if (device.locked_until && new Date(device.locked_until).getTime() > Date.now()) {
      throw new ForbiddenException("PIN ถูกล็อกชั่วคราว กรุณารอแล้วลองใหม่");
    }
    const expected = Buffer.from(String(device.device_secret_hash || ""));
    const supplied = Buffer.from(sha256(secret));
    const secretOk = expected.length === supplied.length && timingSafeEqual(expected, supplied);
    const pinOk = secretOk && (await compare(pin, String(device.pin_hash || "")));
    if (!pinOk) {
      const next = Number(device.failed_pin_attempts || 0) + 1;
      await this.db.query(
        `UPDATE owner_mobile_devices
         SET failed_pin_attempts=$2,
             locked_until=CASE WHEN $2>=$3 THEN now()+make_interval(mins=>$4) ELSE NULL END,
             updated_at=now()
         WHERE id=$1`,
        [device.id, next, MAX_PIN_ATTEMPTS, DEVICE_LOCK_MINUTES]
      );
      throw new UnauthorizedException(
        next >= MAX_PIN_ATTEMPTS
          ? "PIN ผิดครบจำนวนครั้ง เครื่องถูกล็อกชั่วคราว"
          : `PIN ไม่ถูกต้อง เหลือลองได้ ${MAX_PIN_ATTEMPTS - next} ครั้ง`
      );
    }

    await this.db.query(
      `UPDATE owner_mobile_devices
       SET failed_pin_attempts=0,locked_until=NULL,last_unlocked_at=now(),last_seen_at=now(),updated_at=now()
       WHERE id=$1`,
      [device.id]
    );
    const minutes = this.tokenMinutes();
    const token = this.jwt.sign(
      {
        sub: device.user_id,
        role: "OWNER",
        code: device.user_code,
        scope: "owner-mobile",
        deviceRecordId: device.id
      },
      { audience: "owner-mobile", expiresIn: minutes * 60 }
    );
    return { token, expiresInSeconds: minutes * 60, deviceName: device.device_name, ip: ip || null };
  }

  async changePin(userId: string, deviceRecordId: string, newPin: string, twoFactorCode: string) {
    const pin = String(newPin || "").trim();
    if (!/^\d{6}$/.test(pin) || /^(\d)\1{5}$/.test(pin) || pin === "123456" || pin === "654321") {
      throw new BadRequestException("PIN ต้องเป็นตัวเลข 6 หลักและห้ามเป็นเลขเดาง่าย");
    }
    await this.verifyTotpForUser(userId, twoFactorCode);
    await this.db.query(
      `UPDATE owner_mobile_devices
       SET pin_hash=$2,failed_pin_attempts=0,locked_until=NULL,updated_at=now()
       WHERE id=$1 AND user_id=$3 AND disabled_at IS NULL`,
      [deviceRecordId, await hash(pin, 12), userId]
    );
    return { ok: true };
  }

  async revokeDevice(userId: string, deviceRecordId: string, twoFactorCode: string) {
    await this.verifyTotpForUser(userId, twoFactorCode);
    await this.db.query(
      `UPDATE owner_mobile_devices SET disabled_at=now(),updated_at=now()
       WHERE id=$1 AND user_id=$2 AND disabled_at IS NULL`,
      [deviceRecordId, userId]
    );
    return { ok: true };
  }

  private async omise(path: string, fields?: URLSearchParams) {
    const key = String(process.env.OMISE_SECRET_KEY || "");
    if (paymentMode() === "UNCONFIGURED") {
      throw new ServiceUnavailableException("ยังไม่ได้ตั้ง OMISE_SECRET_KEY");
    }
    const response = await fetch("https://api.omise.co" + path, {
      method: fields ? "POST" : "GET",
      headers: {
        Authorization: "Basic " + Buffer.from(key + ":").toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "Omise-Version": "2019-05-29"
      },
      body: fields,
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String((body as any)?.message || "Omise request failed").slice(0, 300);
      throw new ConflictException(message);
    }
    return body as any;
  }

  private async omiseBalance() {
    if (paymentMode() === "UNCONFIGURED") {
      return { configured: false, mode: paymentMode(), totalSatang: 0, transferableSatang: 0 };
    }
    const balance = await this.omise("/balance");
    return {
      configured: true,
      mode: paymentMode(),
      totalSatang: Number(balance?.total || 0),
      transferableSatang: Number(balance?.transferable || 0),
      currency: String(balance?.currency || "THB").toUpperCase()
    };
  }

  private async commissionLiability() {
    const [core, adjustments] = await Promise.all([
      this.db.one(
        `SELECT
           COALESCE(SUM(pending_delta_satang),0)::bigint AS pending_satang,
           COALESCE(SUM(available_delta_satang),0)::bigint AS available_satang,
           COALESCE(SUM(paid_delta_satang),0)::bigint AS paid_satang
         FROM commission_wallet_ledger`
      ),
      this.db.one(
        `SELECT
           COALESCE(SUM(available_delta_satang),0)::bigint AS available_delta_satang,
           COALESCE(SUM(locked_delta_satang),0)::bigint AS locked_satang,
           COALESCE(SUM(paid_delta_satang),0)::bigint AS withdrawal_paid_satang
         FROM commission_withdrawal_ledger`
      )
    ]);
    const pending = Number(core?.pending_satang || 0);
    const available = Math.max(
      0,
      Number(core?.available_satang || 0) + Number(adjustments?.available_delta_satang || 0)
    );
    const locked = Math.max(0, Number(adjustments?.locked_satang || 0));
    return {
      pendingSatang: Math.max(0, pending),
      availableSatang: available,
      lockedSatang: locked,
      paidSatang: Math.max(0, Number(core?.paid_satang || 0)),
      reserveSatang: Math.max(0, pending) + available + locked
    };
  }

  async dashboard() {
    this.requireEnabled();
    const [balance, liability, withdrawalDashboard, recentOwnerTransfers] = await Promise.all([
      this.omiseBalance().catch(error => ({
        configured: paymentMode() !== "UNCONFIGURED",
        mode: paymentMode(),
        totalSatang: 0,
        transferableSatang: 0,
        error: error instanceof Error ? error.message : "Omise unavailable"
      })),
      this.commissionLiability(),
      this.withdrawals.adminDashboard(),
      this.db.query(
        `SELECT id,amount_satang,status,provider_transfer_id,provider_status,
                failure_code,created_at,updated_at
         FROM owner_omise_transfers
         ORDER BY created_at DESC LIMIT 20`
      )
    ]);
    const cashBuffer = this.cashBufferSatang();
    const safeWithdrawable = Math.max(
      0,
      Number((balance as any).transferableSatang || 0) - liability.reserveSatang - cashBuffer
    );
    const approvalItems = (withdrawalDashboard.items || []).filter((item: any) =>
      ["REQUESTED", "HOLD"].includes(String(item.status))
    );
    const approvedItems = (withdrawalDashboard.items || []).filter((item: any) =>
      String(item.status) === "APPROVED"
    );

    return {
      omise: {
        ...balance,
        cashBufferSatang: cashBuffer,
        customerReserveSatang: liability.reserveSatang,
        safeWithdrawableSatang: safeWithdrawable
      },
      commissions: {
        ...liability,
        awaitingApprovalCount: approvalItems.length,
        approvedWaitingPayoutCount: approvedItems.length,
        lockedWithdrawalSatang: Number(withdrawalDashboard.summary?.lockedSatang || 0),
        paidWithdrawalSatang: Number(withdrawalDashboard.summary?.paidSatang || 0)
      },
      queue: approvalItems.slice(0, 50),
      approvedWaitingPayout: approvedItems.slice(0, 30),
      alerts: withdrawalDashboard.phase3?.alerts?.filter((a: any) => a.status === "OPEN").slice(0, 20) || [],
      ownerTransfers: recentOwnerTransfers.rows,
      security: {
        mobileEnabled: this.enabled(),
        tokenMinutes: this.tokenMinutes(),
        paymentMode: paymentMode()
      }
    };
  }

  async withdrawalDetail(id: string) {
    const dashboard = await this.withdrawals.adminDashboard();
    const item = (dashboard.items || []).find((entry: any) => String(entry.id) === String(id));
    if (!item) throw new NotFoundException("ไม่พบรายการถอน");
    const approvals = await this.db.query(
      `SELECT admin_label,note,created_at
       FROM commission_withdrawal_approvals
       WHERE withdrawal_id=$1 ORDER BY created_at`,
      [id]
    );
    return { item, approvals: approvals.rows };
  }

  async approveWithdrawal(userId: string, actor: string, id: string, note: string, code: string, ip?: string | null) {
    await this.verifyTotpForUser(userId, code);
    return this.withdrawals.approve(userId, id, actor, note, ip);
  }

  async holdWithdrawal(userId: string, actor: string, id: string, reason: string, code: string, ip?: string | null) {
    await this.verifyTotpForUser(userId, code);
    return this.withdrawals.hold(id, actor, reason, ip);
  }

  async rejectWithdrawal(userId: string, actor: string, id: string, reason: string, code: string, ip?: string | null) {
    await this.verifyTotpForUser(userId, code);
    return this.withdrawals.reject(id, actor, reason, ip);
  }

  async createOwnerTransfer(
    userId: string,
    deviceRecordId: string,
    actor: string,
    input: { amountSatang?: number; twoFactorCode?: string; clientRequestKey?: string },
    ip?: string | null
  ) {
    this.requireEnabled();
    await this.verifyTotpForUser(userId, String(input.twoFactorCode || ""));
    const amount = Math.trunc(Number(input.amountSatang || 0));
    const requestKey = String(input.clientRequestKey || "").trim();
    if (!Number.isInteger(amount) || amount < 100) {
      throw new BadRequestException("ยอดถอนต้องอย่างน้อย 1 บาท");
    }
    if (!/^[a-zA-Z0-9._:-]{8,100}$/.test(requestKey)) {
      throw new BadRequestException("clientRequestKey invalid");
    }

    const result = await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740093)");
      const existing = (await tx.query(
        `SELECT * FROM owner_omise_transfers
         WHERE owner_user_id=$1 AND client_request_key=$2 FOR UPDATE`,
        [userId, requestKey]
      )).rows[0];
      if (existing && existing.status !== "REVIEW" && existing.status !== "CREATING") {
        return { row: existing, shouldSubmit: false };
      }

      const [balance, liability] = await Promise.all([this.omiseBalance(), this.commissionLiability()]);
      const safe = Math.max(
        0,
        Number(balance.transferableSatang || 0) - liability.reserveSatang - this.cashBufferSatang()
      );
      if (amount > safe) {
        throw new ConflictException(
          `ถอนเกิน Safe Withdrawable (${(safe / 100).toFixed(2)} THB) เพราะระบบกันเงินค่าคอมลูกค้าไว้`
        );
      }

      const row = existing || (await tx.query(
        `INSERT INTO owner_omise_transfers(
           owner_user_id,device_id,client_request_key,amount_satang,status,request_ip
         ) VALUES($1,$2,$3,$4,'CREATING',$5)
         RETURNING *`,
        [userId, deviceRecordId, requestKey, amount, ip || null]
      )).rows[0];
      if (Number(row.amount_satang) !== amount) {
        throw new ConflictException("clientRequestKey ถูกใช้กับยอดเงินอื่นแล้ว");
      }
      return { row, shouldSubmit: true };
    });

    if (!result.shouldSubmit) return result.row;
    const row = result.row;
    try {
      const transfer = await this.omise(
        "/transfers",
        new URLSearchParams({
          amount: String(amount),
          fail_fast: "true",
          idemp_key: String(row.id),
          "metadata[source]": "SCENOVA_OWNER_MOBILE",
          "metadata[owner_transfer_id]": String(row.id)
        })
      );
      if (transfer?.object !== "transfer" || Number(transfer?.amount || 0) !== amount) {
        throw new ConflictException("Omise transfer response does not match request");
      }
      if (Boolean(transfer?.livemode) !== (paymentMode() === "LIVE")) {
        throw new ConflictException("Omise transfer mode mismatch");
      }
      const status = transfer?.failure_code
        ? "FAILED"
        : transfer?.sent
          ? "SENT"
          : "SUBMITTED";
      const updated = await this.db.one(
        `UPDATE owner_omise_transfers
 