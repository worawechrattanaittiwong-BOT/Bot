import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnApplicationBootstrap
} from "@nestjs/common";
import { PoolClient } from "pg";
import { DbService } from "./db.service";

export type EasySlipVerification = {
  transRef: string;
  amountBaht: number;
  slipDate: string | null;
  matchedAccount: any;
  sender: any;
  receiver: any;
};

@Injectable()
export class EasySlipPaymentService implements OnApplicationBootstrap {
  private accountsCache: { expiresAt: number; items: any[] } | null = null;

  constructor(private readonly db: DbService) {}

  async onApplicationBootstrap() {
    await this.ensureSchema();
  }

  configured() {
    return Boolean(String(process.env.EASYSLIP_API_KEY || "").trim());
  }

  private async ensureSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS payment_slip_claims (
        trans_ref varchar(180) PRIMARY KEY,
        provider varchar(32) NOT NULL DEFAULT 'EASYSLIP',
        order_type varchar(16) NOT NULL CHECK (order_type IN ('LOCAL','CLOUD')),
        order_id uuid NOT NULL,
        user_id uuid NOT NULL,
        amount_satang bigint NOT NULL CHECK (amount_satang >= 0),
        slip_date timestamptz,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        verified_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(order_type, order_id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_slip_claims_user
        ON payment_slip_claims(user_id, verified_at DESC);
    `);
  }

  private async request(path: string, init: RequestInit = {}) {
    const key = String(process.env.EASYSLIP_API_KEY || "").trim();
    if (!key) {
      throw new ConflictException("ยังไม่ได้เชื่อม EasySlip API");
    }

    const response = await fetch("https://api.easyslip.com/v2" + path, {
      ...init,
      headers: {
        Authorization: "Bearer " + key,
        Accept: "application/json",
        ...(init.headers || {})
      },
      signal: AbortSignal.timeout(15000)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      const message = String(
        payload?.error?.message ||
        payload?.message ||
        "EasySlip ไม่สามารถตรวจสอบรายการได้"
      ).slice(0, 240);
      throw new ConflictException(message);
    }
    return payload;
  }

  async listBankAccounts() {
    if (!this.configured()) return [];
    if (this.accountsCache && this.accountsCache.expiresAt > Date.now()) {
      return this.accountsCache.items;
    }

    const payload = await this.request("/bank-accounts?limit=20", { method: "GET" });
    const items = Array.isArray(payload?.data?.items)
      ? payload.data.items
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

    const safe = items.slice(0, 20).map((item: any) => ({
      id: Number(item?.id || 0),
      bankCode: String(item?.bankCode || "").slice(0, 16),
      bankNumber: String(item?.bankNumber || "").slice(0, 80),
      nameTh: String(item?.nameTh || "").slice(0, 180),
      nameEn: String(item?.nameEn || "").slice(0, 180),
      type: String(item?.type || "").slice(0, 32)
    }));

    this.accountsCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      items: safe
    };
    return safe;
  }

  async verifySlip(input: {
    base64: string;
    amountSatang: number;
    orderType: "LOCAL" | "CLOUD";
    orderId: string;
  }): Promise<EasySlipVerification> {
    const raw = String(input.base64 || "").trim();
    if (!raw) throw new BadRequestException("กรุณาแนบรูปสลิป");

    const match = raw.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i);
    const encoded = match ? match[2] : raw;
    if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
      throw new BadRequestException("ไฟล์สลิปไม่ถูกต้อง");
    }
    if (encoded.length > 5_700_000) {
      throw new BadRequestException("รูปสลิปต้องมีขนาดไม่เกิน 4 MB");
    }

    let decoded: Buffer;
    try {
      decoded = Buffer.from(encoded.replace(/\s/g, ""), "base64");
    } catch {
      throw new BadRequestException("ไม่สามารถอ่านรูปสลิปได้");
    }
    if (!decoded.length || decoded.length > 4 * 1024 * 1024) {
      throw new BadRequestException("รูปสลิปต้องมีขนาดไม่เกิน 4 MB");
    }

    const amountSatang = Math.trunc(Number(input.amountSatang || 0));
    if (!Number.isInteger(amountSatang) || amountSatang <= 0) {
      throw new BadRequestException("ยอดชำระไม่ถูกต้อง");
    }
    const expectedBaht = Number((amountSatang / 100).toFixed(2));

    const payload = await this.request("/verify/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base64: raw,
        remark: `SCENOVA ${input.orderType} ${input.orderId}`.slice(0, 255),
        matchAccount: true,
        matchAmount: expectedBaht,
        checkDuplicate: true
      })
    });

    const data = payload?.data;
    if (!data) throw new ConflictException("EasySlip ไม่ส่งผลตรวจสอบกลับมา");
    if (data.isDuplicate === true) {
      throw new ConflictException("สลิปนี้ถูกตรวจสอบหรือถูกใช้ไปแล้ว");
    }
    if (!data.matchedAccount) {
      throw new ConflictException("บัญชีผู้รับในสลิปไม่ตรงกับบัญชีรับเงินของ SCENOVA");
    }
    if (data.isAmountMatched !== true) {
      throw new ConflictException(
        `ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ ฿${expectedBaht.toLocaleString("th-TH")}`
      );
    }

    const amountInSlip = Number(data.amountInSlip ?? data.rawSlip?.amount?.amount);
    if (!Number.isFinite(amountInSlip) || Math.abs(amountInSlip - expectedBaht) > 0.001) {
      throw new ConflictException("ยอดเงินในสลิปไม่ตรงกับรายการสั่งซื้อ");
    }

    const transRef = String(data.rawSlip?.transRef || "").trim();
    if (!transRef || transRef.length > 180) {
      throw new ConflictException("ไม่พบเลขอ้างอิงธุรกรรมในสลิป");
    }

    return {
      transRef,
      amountBaht: amountInSlip,
      slipDate: data.rawSlip?.date ? String(data.rawSlip.date) : null,
      matchedAccount: data.matchedAccount,
      sender: data.rawSlip?.sender || null,
      receiver: data.rawSlip?.receiver || null
    };
  }

  async claim(
    tx: PoolClient,
    verification: EasySlipVerification,
    input: {
      orderType: "LOCAL" | "CLOUD";
      orderId: string;
      userId: string;
      amountSatang: number;
    }
  ) {
    try {
      await tx.query(
        `INSERT INTO payment_slip_claims(
           trans_ref,provider,order_type,order_id,user_id,amount_satang,slip_date,detail
         )
         VALUES($1,'EASYSLIP',$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          verification.transRef,
          input.orderType,
          input.orderId,
          input.userId,
          input.amountSatang,
          verification.slipDate || null,
          JSON.stringify({
            matchedAccount: verification.matchedAccount,
            sender: verification.sender,
            receiver: verification.receiver,
            amountBaht: verification.amountBaht
          })
        ]
      );
    } catch (error: any) {
      if (String(error?.code || "") === "23505") {
        throw new ConflictException("สลิปนี้ถูกใช้กับรายการอื่นแล้ว");
      }
      throw error;
    }
  }
}
