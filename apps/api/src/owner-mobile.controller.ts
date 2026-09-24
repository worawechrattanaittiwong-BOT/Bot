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

const SESSION_MINUTES = 30;
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
  status varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
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
  status varchar(20) NOT NULL DEFAULT 'CREATING'
    CHECK(status IN ('CREATING','SUBMITTED','SUCCEEDED','FAILED','REVIEW')),
  client_request_key varchar(100) NOT NULL UNIQUE,
  omise_transfer_id varchar(180) UNIQUE,
  provider_status varchar(80),
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_ip varchar(96),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_owner_mobile_devices_owner
  ON owner_mobile_devices(owner_user_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_mobile_one_active_device
  ON owner_mobile_devices(owner_user_id)
  WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_owner_mobile_sessions_active
  ON owner_mobile_sessions(owner_user_id,expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_owner_omise_transfers_recent
  ON owner_omise_transfers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_omise_transfers_incomplete
  ON owner_omise_transfers(status,created_at)
  WHERE status IN ('CREATING','SUBMITTED','REVIEW');
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
      const message = String(data?.message || "ติดต่อ Omise ไม่สำเร็จ");
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestException(message);
      }
      throw new ServiceUnavailableException(message);
    }
    return data;
  }

  private transferState(transfer: any) {
    if (transfer?.failure_code) {
      return { status: "FAILED", providerStatus: "FAILED" };
    }
    if (transfer?.paid === true) {
      return { status: "SUCCEEDED", providerStatus: "PAID" };
    }
    if (transfer?.sent === true) {
      return { status: "SUBMITTED", providerStatus: "SENT" };
    }
    return { status: "SUBMITTED", providerStatus: "PENDING" };
  }

  private transferSnapshot(transfer: any) {
    return {
      id: transfer?.id || null,
      livemode: transfer?.livemode ?? null,
      amount: transfer?.amount ?? null,
      currency: transfer?.currency || null,
      paid: transfer?.paid ?? null,
      sent: transfer?.sent ?? null,
      sendable: transfer?.sendable ?? null,
      failure_code: transfer?.failure_code || null,
      failure_message: transfer?.failure_message || null,
      total_fee: transfer?.total_fee ?? null,
      net: transfer?.net ?? null,
      created_at: transfer?.created_at || null,
      sent_at: transfer?.sent_at || null,
      paid_at: transfer?.paid_at || null
    };
  }

  private async reconcileOwnerTransfers() {
    if (this.paymentMode() === "UNCONFIGURED") return;

    const pending = await this.db.query(
      `SELECT id,omise_transfer_id
       FROM owner_omise_transfers
       WHERE status IN ('SUBMITTED','REVIEW')
         AND omise_transfer_id IS NOT NULL
       ORDER BY created_at ASC
       LIMIT 20`
    );

    await Promise.allSettled(
      pending.rows.map(async (row: any) => {
        const transfer = await this.omise(
          "/transfers/" + encodeURIComponent(String(row.omise_transfer_id))
        );
        const state = this.transferState(transfer);
        await this.db.query(
          `UPDATE owner_omise_transfers
           SET status=$2,provider_status=$3,provider_response=$4::jsonb,updated_at=now()
           WHERE id=$1`,
          [
            row.id,
            state.status,
            state.providerStatus,
            JSON.stringify(this.transferSnapshot(transfer))
          ]
        );
      })
    );
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

    // Full password + TOTP enrollment is also the secure recovery path for a
    // forgotten PIN. Keep one active owner phone so replacing a device revokes
    // access from the previous phone automatically.
    await this.db.query(
      `UPDATE owner_mobile_devices
       SET status='REVOKED',revoked_at=now()
       WHERE owner_user_id=$1 AND device_id<>$2 AND status='ACTIVE'`,
      [user.id, deviceId]
    );
    await this.db.query(
      `UPDATE owner_mobile_sessions
       SET revoked_at=now()
       WHERE owner_user_id=$1 AND revoked_at IS NULL`,
      [user.id]
    );

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
    const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000);

    await this.db.query(
      `UPDATE owner_mobile_sessions
       SET revoked_at=now()
       WHERE device_row_id=$1 AND revoked_at IS NULL`,
      [deviceRowId]
    );
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
    const supplied = String(pin || "");
    if (!/^\d{6}$/.test(supplied)) {
      throw new UnauthorizedException("กรุณายืนยัน PIN 6 หลัก");
    }

    const device = await this.db.one(
      `SELECT id,pin_hash,failed_pin_attempts,locked_until,status
       FROM owner_mobile_devices
       WHERE id=$1 AND owner_user_id=$2`,
      [session.device_row_id, session.owner_user_id]
    );
    if (!device || device.status !== "ACTIVE") {
      throw new UnauthorizedException("อุปกรณ์นี้ไม่ได้รับอนุญาตแล้ว");
    }
    if (device.locked_until && new Date(device.locked_until).getTime() > Date.now()) {
      throw new UnauthorizedException("PIN ถูกล็อกชั่วคราว กรุณารอแล้วลองใหม่");
    }

    if (!(await compare(supplied, String(device.pin_hash || "")))) {
      const failures = Number(device.failed_pin_attempts || 0) + 1;
      const lock = failures >= MAX_PIN_FAILURES
        ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000)
        : null;
      await this.db.query(
        `UPDATE owner_mobile_devices
         SET failed_pin_attempts=$2,locked_until=$3
         WHERE id=$1`,
        [device.id, failures >= MAX_PIN_FAILURES ? 0 : failures, lock]
      );
      throw new UnauthorizedException(
        lock ? "PIN ผิดครบกำหนด อุปกรณ์ถูกล็อกชั่วคราว" : "PIN ไม่ถูกต้อง"
      );
    }

    await this.db.query(
      `UPDATE owner_mobile_devices
       SET failed_pin_attempts=0,locked_until=NULL,last_seen_at=now()
       WHERE id=$1`,
      [device.id]
    );
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
    const configured = this.paymentMode() !== "UNCONFIGURED";
    if (configured) {
      await this.reconcileOwnerTransfers().catch(() => undefined);
    }

    const [balanceResult, coreCommission, withdrawalCommission, queue, recentTransfers] =
      await Promise.all([
        configured
          ? this.omise("/balance").then(value => ({ ok: true, value })).catch(() => ({ ok: false, value: null }))
          : Promise.resolve({ ok: false, value: null }),
        this.db.one(
          `SELECT
             COALESCE(SUM(pending_delta_satang),0)::bigint pending_satang,
             COALESCE(SUM(available_delta_satang),0)::bigint available_satang,
             COALESCE(SUM(paid_delta_satang),0)::bigint paid_satang
           FROM commission_wallet_ledger`
        ),
        this.db.one(
          `SELECT
             COALESCE(SUM(available_delta_satang),0)::bigint available_delta_satang,
             COALESCE(SUM(locked_delta_satang),0)::bigint locked_satang,
             COALESCE(SUM(paid_delta_satang),0)::bigint paid_satang
           FROM commission_withdrawal_ledger`
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
          `SELECT id,amount_satang,status,omise_transfer_id,provider_status,created_at,updated_at
           FROM owner_omise_transfers ORDER BY created_at DESC LIMIT 10`
        )
      ]);

    const balance = balanceResult.value as any;
    const reachable = Boolean(balanceResult.ok);
    const transferable = reachable ? Number(balance?.transferable || 0) : 0;
    const total = reachable ? Number(balance?.total || 0) : 0;

    const pendingCommission = Math.max(0, Number(coreCommission?.pending_satang || 0));
    const availableCommission = Math.max(
      0,
      Number(coreCommission?.available_satang || 0) +
        Number(withdrawalCommission?.available_delta_satang || 0)
    );
    const lockedCommission = Math.max(0, Number(withdrawalCommission?.locked_satang || 0));
    const paidCommission = Math.max(
      0,
      Number(coreCommission?.paid_satang || 0) +
        Number(withdrawalCommission?.paid_satang || 0)
    );

    const reserve = Math.max(
      0,
      Math.trunc(Number(process.env.OWNER_OMISE_RESERVE_SATANG || 0))
    );
    const commissionLiability =
      pendingCommission + availableCommission + lockedCommission;
    const safeWithdrawable = reachable
      ? Math.max(0, transferable - commissionLiability - reserve)
      : 0;

    // Omise Thailand Capability API documents transfer limits of 30 THB min
    // and 50,000,000 THB max. Capability retrieval uses public-key auth, so
    // Owner Mobile does not couple payout readiness to that endpoint.
    const minTransferSatang = Math.max(
      1,
      Math.trunc(Number(process.env.OWNER_OMISE_MIN_TRANSFER_SATANG || 3000))
    );
    const maxTransferSatang = Math.max(
      minTransferSatang,
      Math.trunc(Number(process.env.OWNER_OMISE_MAX_TRANSFER_SATANG || 5000000000))
    );

    return {
      paymentMode: this.paymentMode(),
      omise: {
        configured,
        reachable,
        totalSatang: total,
        transferableSatang: transferable,
        minTransferSatang,
        maxTransferSatang
      },
      commission: {
        pendingSatang: pendingCommission,
        availableSatang: availableCommission,
        lockedSatang: lockedCommission,
        paidSatang: paidCommission
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
    if (!requestKey) {
      throw new BadRequestException("Request Key ไม่ถูกต้อง");
    }

    const existing = await this.db.one(
      "SELECT * FROM owner_omise_transfers WHERE client_request_key=$1",
      [requestKey]
    );
    if (existing) return existing;

    if (this.paymentMode() === "UNCONFIGURED") {
      throw new ServiceUnavailableException("Omise ยังไม่ได้ตั้งค่า");
    }

    await this.reconcileOwnerTransfers().catch(() => undefined);

    const unresolved = await this.db.one(
      `SELECT id,status,omise_transfer_id,created_at
       FROM owner_omise_transfers
       WHERE status IN ('CREATING','SUBMITTED','REVIEW')
       ORDER BY created_at DESC
       LIMIT 1`
    );
    if (unresolved) {
      throw new ConflictException(
        "มีรายการถอนของเจ้าของที่ยังดำเนินการไม่เสร็จ กรุณาตรวจรายการเดิมก่อนสร้างรายการใหม่"
      );
    }

    const snapshot = await this.summary();
    if (!snapshot.omise.reachable) {
      throw new ServiceUnavailableException("ติดต่อ Omise ไม่สำเร็จ กรุณาลองใหม่ภายหลัง");
    }

    const minTransfer = Number(snapshot.omise.minTransferSatang || 3000);
    const maxTransfer = Number(snapshot.omise.maxTransferSatang || 5000000000);
    if (amount < minTransfer || amount > maxTransfer) {
      throw new BadRequestException(
        "ยอดถอนต้องอยู่ระหว่าง " +
          (minTransfer / 100).toFixed(2) +
          " และ " +
          (maxTransfer / 100).toFixed(2) +
          " บาท"
      );
    }
    if (amount > Number(snapshot.owner.safeWithdrawableSatang || 0)) {
      throw new ConflictException("ยอดถอนสูงกว่า Safe Withdrawable Balance");
    }

    const local = await this.db.one(
      `INSERT INTO owner_omise_transfers(
         owner_user_id,amount_satang,client_request_key,requested_ip
       ) VALUES($1,$2,$3,$4)
       RETURNING *`,
      [session.owner_user_id, amount, requestKey, ip || null]
    );

    try {
      const transfer = await this.omise(
        "/transfers",
        new URLSearchParams({
          amount: String(amount),
          idemp_key: requestKey
        })
      );
      const state = this.transferState(transfer);
      return await this.db.one(
        `UPDATE owner_omise_transfers
         SET status=$2,omise_transfer_id=$3,provider_status=$4,
             provider_response=$5::jsonb,updated_at=now()
         WHERE id=$1
         RETURNING *`,
        [
          local.id,
          state.status,
          String(transfer?.id || "") || null,
          state.providerStatus,
          JSON.stringify(this.transferSnapshot(transfer))
        ]
      );
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        await this.db.query(
          `UPDATE owner_omise_transfers
           SET status='FAILED',provider_status='REJECTED',
               provider_response=$2::jsonb,updated_at=now()
           WHERE id=$1`,
          [local.id, JSON.stringify({ error: String(error?.message || "rejected") })]
        );
        throw error;
      }

      await this.db.query(
        `UPDATE owner_omise_transfers
         SET status='REVIEW',provider_status='UNKNOWN',
             provider_response=$2::jsonb,updated_at=now()
         WHERE id=$1`,
        [local.id, JSON.stringify({ error: String(error?.message || "unknown") })]
      );
      throw new ConflictException(
        "สถานะการถอนยังยืนยันไม่ได้ ระบบจะไม่ส่งซ้ำอัตโนมัติ กรุณาตรวจรายการเดิมก่อน"
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
