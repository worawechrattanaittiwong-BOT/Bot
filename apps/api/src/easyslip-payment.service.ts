import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnApplicationBootstrap
} from "@nestjs/common";
import { PoolClient } from "pg";
import { DbService } from "./db.service";
import { ReferralService } from "./referral.service";
import { PromotionService } from "./promotion.service";

export type EasySlipVerification = {
  transRef: string;
  amountBaht: number;
  slipDate: string | null;
  isDuplicate: boolean;
  matchedAccount: any;
  sender: any;
  receiver: any;
};

@Injectable()
export class EasySlipPaymentService implements OnApplicationBootstrap {
  private accountsCache: { expiresAt: number; items: any[] } | null = null;

  constructor(
    private readonly db: DbService,
    private readonly referrals: ReferralService,
    private readonly promotions: PromotionService
  ) {}

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

    const [payload, banksPayload] = await Promise.all([
      this.request("/bank-accounts?limit=20", { method: "GET" }),
      this.request("/banks", { method: "GET" })
    ]);
    const items = Array.isArray(payload?.data?.items)
      ? payload.data.items
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
    const banks = Array.isArray(banksPayload?.data) ? banksPayload.data : [];
    const bankByCode = new Map(
      banks.map((bank: any) => [String(bank?.code || ""), bank])
    );

    const safe = items.slice(0, 20).map((item: any) => {
      const bankCode = String(item?.bankCode || "").slice(0, 16);
      const bank = bankByCode.get(bankCode) as any;
      return {
        id: Number(item?.id || 0),
        bankCode,
        bankName: String(bank?.nameTh || bank?.nameEn || "").slice(0, 120),
        bankShortCode: String(bank?.shortCode || "").slice(0, 20),
        bankNumber: String(item?.bankNumber || "").slice(0, 80),
        nameTh: String(item?.nameTh || "").slice(0, 180),
        nameEn: String(item?.nameEn || "").slice(0, 180),
        type: String(item?.type || "").slice(0, 32)
      };
    });

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

    const slipDateRaw = data.rawSlip?.date ? String(data.rawSlip.date) : "";
    const slipDate = slipDateRaw && Number.isFinite(Date.parse(slipDateRaw))
      ? new Date(slipDateRaw).toISOString()
      : null;

    return {
      transRef,
      amountBaht: amountInSlip,
      slipDate,
      isDuplicate: data.isDuplicate === true,
      matchedAccount: data.matchedAccount,
      sender: data.rawSlip?.sender || null,
      receiver: data.rawSlip?.receiver || null
    };
  }

  private async claim(
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
            easySlipDuplicate: verification.isDuplicate,
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

  async verifyAndActivate(input: {
    base64: string;
    orderType: "LOCAL" | "CLOUD";
    orderId: string;
    userId: string;
  }) {
    if (!/^[0-9a-f-]{36}$/i.test(input.orderId)) {
      throw new BadRequestException("Invalid order");
    }

    const table = input.orderType === "LOCAL" ? "local_orders" : "cloud_orders";
    const snapshot = await this.db.one(
      `SELECT * FROM ${table} WHERE id=$1 AND user_id=$2`,
      [input.orderId, input.userId]
    );
    if (!snapshot) throw new BadRequestException("ไม่พบรายการชำระเงิน");
    if (snapshot.status === "PAID") return { ok: true, status: "PAID" };
    if (!["PENDING", "REVIEW"].includes(String(snapshot.status))) {
      throw new ConflictException("รายการนี้ไม่อยู่ในสถานะที่สามารถแนบสลิปได้");
    }

    const verification = await this.verifySlip({
      base64: input.base64,
      amountSatang: Number(snapshot.amount),
      orderType: input.orderType,
      orderId: input.orderId
    });

    return input.orderType === "LOCAL"
      ? this.activateLocal(input.userId, input.orderId, verification)
      : this.activateCloud(input.userId, input.orderId, verification);
  }

  private async activateLocal(
    userId: string,
    orderId: string,
    verification: EasySlipVerification
  ) {
    return this.db.transaction(async (tx: PoolClient) => {
      await tx.query("SELECT pg_advisory_xact_lock(740092)");
      const order = (
        await tx.query(
          "SELECT * FROM local_orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [orderId, userId]
        )
      ).rows[0];
      if (!order) throw new BadRequestException("ไม่พบรายการ");
      if (order.status === "PAID") return { ok: true, status: "PAID" };
      if (!["PENDING", "REVIEW"].includes(String(order.status))) {
        throw new ConflictException("รายการนี้ไม่สามารถยืนยันการชำระเงินได้");
      }

      const user = (
        await tx.query("SELECT status FROM users WHERE id=$1 FOR UPDATE", [userId])
      ).rows[0];
      if (user?.status !== "ACTIVE") {
        throw new ConflictException("บัญชีไม่พร้อมใช้งาน");
      }

      await this.claim(tx, verification, {
        orderType: "LOCAL",
        orderId: order.id,
        userId,
        amountSatang: Number(order.amount)
      });

      const current = (
        await tx.query(
          `SELECT max(s.expires_at) expires_at
           FROM subscriptions s
           JOIN plans p ON p.id=s.plan_id
           WHERE s.user_id=$1
             AND p.mode='LOCAL'
             AND s.status='ACTIVE'
             AND s.expires_at>now()`,
          [userId]
        )
      ).rows[0];

      const planCode = "LOCAL_" + Number(order.months) + "M";
      const subscription = (
        await tx.query(
          `INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
           SELECT
             $1,p.id,now(),
             GREATEST(now(),COALESCE($3::timestamptz,now())) + make_interval(months=>$2::int),
             'EASYSLIP',$4
           FROM plans p
           WHERE p.code=$5 AND p.active=true
           RETURNING *`,
          [
            userId,
            Number(order.months),
            current?.expires_at || null,
            "EasySlip Local order " + order.id,
            planCode
          ]
        )
      ).rows[0];
      if (!subscription) {
        throw new ConflictException("ไม่พบแพ็กเกจ Local ที่เปิดใช้งาน");
      }

      let slot = (
        await tx.query(
          `SELECT *
           FROM license_slots
           WHERE owner_user_id=$1
             AND assigned_user_id=$1
             AND mode='LOCAL'
             AND status<>'DELETED'
           ORDER BY
             CASE WHEN slot_type='PERSONAL' THEN 0 ELSE 1 END,
             CASE WHEN subscription_id IS NOT NULL THEN 0 ELSE 1 END,
             slot_number
           LIMIT 1
           FOR UPDATE`,
          [userId]
        )
      ).rows[0];

      if (slot) {
        await tx.query(
          `UPDATE license_slots
           SET subscription_id=$2,status='ACTIVE',slot_type='PERSONAL',updated_at=now()
           WHERE id=$1`,
          [slot.id, subscription.id]
        );
      } else {
        slot = (
          await tx.query(
            `INSERT INTO license_slots(
               owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label
             )
             SELECT
               $1,$1,$2,'LOCAL',COALESCE(max(slot_number),0)+1,'PERSONAL','ACTIVE','Local MT5'
             FROM license_slots
             WHERE owner_user_id=$1 AND mode='LOCAL'
             RETURNING *`,
            [userId, subscription.id]
          )
        ).rows[0];
      }

      await tx.query(
        `UPDATE local_orders
         SET status='PAID',slot_id=$2,subscription_id=$3,paid_at=now(),expires_at=now()
         WHERE id=$1`,
        [order.id, slot.id, subscription.id]
      );
      await this.promotions.consume(tx, "LOCAL", order.id);

      let referralCommissionCount = 0;
      await tx.query("SAVEPOINT easyslip_referral_credit");
      try {
        const commissions = await this.referrals.creditPurchase(tx, {
          sourceUserId: userId,
          sourceType: "LOCAL_ORDER",
          sourceId: order.id,
          grossAmountSatang: Number(order.amount || 0),
          currency: "THB",
          metadata: {
            subscriptionId: subscription.id,
            months: Number(order.months),
            slotId: slot.id,
            paymentProvider: "EASYSLIP",
            transRef: verification.transRef
          }
        });
        referralCommissionCount = commissions.length;
        await tx.query("RELEASE SAVEPOINT easyslip_referral_credit");
      } catch {
        await tx.query("ROLLBACK TO SAVEPOINT easyslip_referral_credit");
        await tx.query("RELEASE SAVEPOINT easyslip_referral_credit");
      }

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES('EASYSLIP','LOCAL_ACTIVATED','order',$1,$2::jsonb)`,
        [
          order.id,
          JSON.stringify({
            transRef: verification.transRef,
            slotId: slot.id,
            subscriptionId: subscription.id,
            referralCommissionCount
          })
        ]
      );

      return {
        ok: true,
        status: "PAID",
        orderId: order.id,
        subscriptionId: subscription.id,
        expiresAt: subscription.expires_at
      };
    });
  }

  private async activateCloud(
    userId: string,
    orderId: string,
    verification: EasySlipVerification
  ) {
    return this.db.transaction(async (tx: PoolClient) => {
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      const order = (
        await tx.query(
          "SELECT * FROM cloud_orders WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [orderId, userId]
        )
      ).rows[0];
      if (!order) throw new BadRequestException("ไม่พบรายการ");
      if (order.status === "PAID") return { ok: true, status: "PAID" };
      if (!["PENDING", "REVIEW"].includes(String(order.status))) {
        throw new ConflictException("รายการนี้ไม่สามารถยืนยันการชำระเงินได้");
      }

      const user = (
        await tx.query("SELECT status FROM users WHERE id=$1 FOR UPDATE", [userId])
      ).rows[0];
      if (user?.status !== "ACTIVE") {
        throw new ConflictException("บัญชีไม่พร้อมใช้งาน");
      }

      let slot = order.slot_id
        ? (
            await tx.query(
              "SELECT * FROM license_slots WHERE id=$1 FOR UPDATE",
              [order.slot_id]
            )
          ).rows[0]
        : null;
      if (
        slot &&
        (
          slot.owner_user_id !== userId ||
          slot.assigned_user_id !== userId ||
          slot.status === "DELETED"
        )
      ) {
        throw new ConflictException("Cloud Slot เปลี่ยนแปลง กรุณาติดต่อผู้ดูแล");
      }

      await this.claim(tx, verification, {
        orderType: "CLOUD",
        orderId: order.id,
        userId,
        amountSatang: Number(order.amount)
      });

      const subscription = (
        await tx.query(
          `INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
           SELECT
             $1,p.id,now(),
             GREATEST(
               now(),
               COALESCE(
                 (SELECT expires_at FROM subscriptions WHERE id=$3 AND status='ACTIVE'),
                 now()
               )
             ) + make_interval(months=>$2::int),
             'EASYSLIP',$4
           FROM plans p
           WHERE p.code='CLOUD_' || $2::text || 'M' AND p.active=true
           RETURNING *`,
          [
            userId,
            Number(order.months),
            slot?.subscription_id || null,
            "EasySlip Cloud order " + order.id
          ]
        )
      ).rows[0];
      if (!subscription) {
        throw new ConflictException("ไม่พบแพ็กเกจ Cloud ที่เปิดใช้งาน");
      }

      if (slot) {
        await tx.query(
          "UPDATE license_slots SET subscription_id=$2,status='ACTIVE',updated_at=now() WHERE id=$1",
          [slot.id, subscription.id]
        );
      } else {
        slot = (
          await tx.query(
            `INSERT INTO license_slots(
               owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label
             )
             SELECT
               $1,$1,$2,'CLOUD',COALESCE(max(slot_number),0)+1,'PERSONAL','ACTIVE','Cloud Trading'
             FROM license_slots
             WHERE owner_user_id=$1 AND mode='CLOUD'
             RETURNING *`,
            [userId, subscription.id]
          )
        ).rows[0];
      }

      await tx.query(
        `UPDATE cloud_orders
         SET status='PAID',slot_id=$2,subscription_id=$3,paid_at=now(),expires_at=now()
         WHERE id=$1`,
        [order.id, slot.id, subscription.id]
      );
      await this.promotions.consume(tx, "CLOUD", order.id);

      let referralCommissionCount = 0;
      await tx.query("SAVEPOINT easyslip_referral_credit");
      try {
        const commissions = await this.referrals.creditPurchase(tx, {
          sourceUserId: userId,
          sourceType: "CLOUD_ORDER",
          sourceId: order.id,
          grossAmountSatang: Number(order.amount || 0),
          currency: "THB",
          metadata: {
            subscriptionId: subscription.id,
            months: Number(order.months),
            slotId: slot.id,
            paymentProvider: "EASYSLIP",
            transRef: verification.transRef
          }
        });
        referralCommissionCount = commissions.length;
        await tx.query("RELEASE SAVEPOINT easyslip_referral_credit");
      } catch {
        await tx.query("ROLLBACK TO SAVEPOINT easyslip_referral_credit");
        await tx.query("RELEASE SAVEPOINT easyslip_referral_credit");
      }

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES('EASYSLIP','CLOUD_ACTIVATED','order',$1,$2::jsonb)`,
        [
          order.id,
          JSON.stringify({
            transRef: verification.transRef,
            slotId: slot.id,
            runnerId: order.runner_id,
            subscriptionId: subscription.id,
            referralCommissionCount
          })
        ]
      );

      return {
        ok: true,
        status: "PAID",
        orderId: order.id,
        subscriptionId: subscription.id,
        expiresAt: subscription.expires_at
      };
    });
  }
}
