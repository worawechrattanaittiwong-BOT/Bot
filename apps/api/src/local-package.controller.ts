import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Post,
  Param,
  Req,
  UseGuards
} from "@nestjs/common";
import { PoolClient } from "pg";
import { DbService } from "./db.service";
import { AdminGuard, JwtGuard } from "./security";
import { ReferralService } from "./referral.service";
import { PromotionService } from "./promotion.service";
import { EasySlipPaymentService } from "./easyslip-payment.service";

function omiseMode() {
  const key = String(process.env.OMISE_SECRET_KEY || "").trim();
  if (key.startsWith("skey_test_")) return "TEST";
  if (key.startsWith("skey_live_") || key.startsWith("skey_")) return "LIVE";
  return "UNCONFIGURED";
}

function paymentMode() {
  if (String(process.env.EASYSLIP_API_KEY || "").trim()) return "EASYSLIP";
  return omiseMode();
}

function validateCharge(charge: any, order: any) {
  if (
    charge?.object !== "charge" ||
    charge?.metadata?.order_id !== order.id ||
    charge?.metadata?.purchase_type !== "LOCAL" ||
    Number(charge?.amount) !== Number(order.amount) ||
    String(charge?.currency || "").toLowerCase() !== "thb" ||
    Boolean(charge?.livemode) !== (omiseMode() === "LIVE") ||
    (order.charge_id && order.charge_id !== charge.id)
  ) {
    throw new ConflictException("ข้อมูลการชำระเงินไม่ตรงกับรายการ Local");
  }
}

@Injectable()
export class LocalPackageService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private checking = false;

  constructor(
    private readonly db: DbService,
    private readonly referrals: ReferralService,
    private readonly promotions: PromotionService,
    private readonly easyslip: EasySlipPaymentService
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.reconcilePending();
    }, 60000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private checkoutEnabled() {
    const mode = paymentMode();
    if (mode === "EASYSLIP") return true;
    return process.env.LOCAL_CHECKOUT_ENABLED === "true" &&
      mode !== "UNCONFIGURED";
  }

  async catalog() {
    const controls = await this.db.one(
      "SELECT sales_paused FROM production_controls WHERE id=1"
    );
    const salesPaused = Boolean(controls?.sales_paused);
    const mode = paymentMode();
    const paymentAccounts = mode === "EASYSLIP"
      ? await this.easyslip.listBankAccounts().catch(() => [])
      : [];
    return {
      packages: (await this.db.query(
        "SELECT months,price_satang,enabled,updated_at FROM local_packages ORDER BY months"
      )).rows,
      paymentMode: mode,
      paymentAccounts,
      salesPaused,
      checkoutEnabled: this.checkoutEnabled() && !salesPaused
    };
  }

  async gateway(path: string, fields?: URLSearchParams) {
    if (!["TEST", "LIVE"].includes(omiseMode())) {
      throw new ConflictException("ไม่ได้ใช้งาน Opn / Omise ในโหมดการชำระเงินปัจจุบัน");
    }
    const response = await fetch("https://api.omise.co" + path, {
      method: fields ? "POST" : "GET",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(String(process.env.OMISE_SECRET_KEY || "") + ":").toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "Omise-Version": "2019-05-29"
      },
      body: fields,
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      throw new ConflictException(
        "ติดต่อผู้ให้บริการชำระเงินไม่สำเร็จ กรุณาตรวจสอบรายการก่อนลองใหม่"
      );
    }
    return response.json();
  }

  async reconcilePending() {
    if (this.checking || !["TEST", "LIVE"].includes(omiseMode())) return;
    this.checking = true;
    try {
      const rows = await this.db.query(
        `UPDATE local_orders
         SET checked_at=now()
         WHERE id IN (
           SELECT id
           FROM local_orders
           WHERE status IN ('PENDING','REVIEW')
             AND charge_id IS NOT NULL
             AND (checked_at IS NULL OR checked_at<now()-interval '1 minute')
           ORDER BY checked_at NULLS FIRST
           LIMIT 10
           FOR UPDATE SKIP LOCKED
         )
         RETURNING charge_id`
      );
      for (const row of rows.rows) {
        try {
          await this.reconcile(String(row.charge_id || ""));
        } catch {
          // Keep the order for the next reconciliation attempt.
        }
      }
    } catch {
      // Database/provider interruptions are retried on the next interval.
    } finally {
      this.checking = false;
    }
  }

  async reconcile(chargeId: string) {
    if (!/^chrg_[a-zA-Z0-9_]+$/.test(chargeId)) {
      throw new BadRequestException("Invalid charge");
    }

    const charge = await this.gateway("/charges/" + chargeId);
    const orderId = String(charge?.metadata?.order_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;

    return this.db.transaction(async (tx: PoolClient) => {
      await tx.query("SELECT pg_advisory_xact_lock(740092)");
      const order = (
        await tx.query("SELECT * FROM local_orders WHERE id=$1 FOR UPDATE", [orderId])
      ).rows[0];
      if (!order) return null;

      validateCharge(charge, order);
      if (order.status === "PAID") return order;

      if (charge.status !== "successful" || charge.paid !== true) {
        const failed = ["failed", "expired", "reversed"].includes(String(charge.status));
        await tx.query(
          `UPDATE local_orders
           SET charge_id=$2,status=$3,qr_url=$4,expires_at=$5
           WHERE id=$1`,
          [
            order.id,
            charge.id,
            failed ? "FAILED" : "PENDING",
            charge.source?.scannable_code?.image?.download_uri || null,
            charge.expires_at || null
          ]
        );
        if (failed) await this.promotions.release(tx, "LOCAL", order.id);
        return null;
      }

      const user = (
        await tx.query("SELECT status FROM users WHERE id=$1 FOR UPDATE", [order.user_id])
      ).rows[0];
      if (user?.status !== "ACTIVE" || order.status === "FAILED") {
        await tx.query(
          "UPDATE local_orders SET status='REVIEW',charge_id=$2 WHERE id=$1",
          [order.id, charge.id]
        );
        return null;
      }

      const current = (
        await tx.query(
          `SELECT max(s.expires_at) expires_at
           FROM subscriptions s
           JOIN plans p ON p.id=s.plan_id
           WHERE s.user_id=$1
             AND p.mode='LOCAL'
             AND s.status='ACTIVE'
             AND s.expires_at>now()`,
          [order.user_id]
        )
      ).rows[0];

      const planCode = "LOCAL_" + Number(order.months) + "M";
      const subscription = (
        await tx.query(
          `INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
           SELECT
             $1,
             p.id,
             now(),
             GREATEST(now(),COALESCE($3::timestamptz,now())) + make_interval(months=>$2::int),
             'PAYMENT',
             $4
           FROM plans p
           WHERE p.code=$5 AND p.active=true
           RETURNING *`,
          [
            order.user_id,
            Number(order.months),
            current?.expires_at || null,
            "Local order " + order.id,
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
          [order.user_id]
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
            [order.user_id, subscription.id]
          )
        ).rows[0];
      }

      await tx.query(
        `UPDATE local_orders
         SET status='PAID',charge_id=$2,slot_id=$3,subscription_id=$4,paid_at=now()
         WHERE id=$1`,
        [order.id, charge.id, slot.id, subscription.id]
      );
      await this.promotions.consume(tx, "LOCAL", order.id);

      let referralCommissionCount = 0;
      await tx.query("SAVEPOINT referral_credit");
      try {
        const commissions = await this.referrals.creditPurchase(tx, {
          sourceUserId: order.user_id,
          sourceType: "LOCAL_ORDER",
          sourceId: order.id,
          grossAmountSatang: Number(order.amount || 0),
          currency: "THB",
          metadata: {
            subscriptionId: subscription.id,
            months: Number(order.months),
            slotId: slot.id
          }
        });
        referralCommissionCount = commissions.length;
        await tx.query("RELEASE SAVEPOINT referral_credit");
      } catch {
        await tx.query("ROLLBACK TO SAVEPOINT referral_credit");
        await tx.query("RELEASE SAVEPOINT referral_credit");
      }

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES('PAYMENT','LOCAL_ACTIVATED','order',$1,$2)`,
        [
          order.id,
          JSON.stringify({
            chargeId,
            slotId: slot.id,
            subscriptionId: subscription.id,
            referralCommissionCount
          })
        ]
      );

      return {
        ...order,
        status: "PAID",
        slot_id: slot.id,
        subscription_id: subscription.id
      };
    });
  }

  async checkout(userId: string, months: number, promoCode?: string) {
    if (!this.checkoutEnabled()) {
      throw new ConflictException("ยังไม่เปิดรับชำระแพ็กเกจ Local");
    }
    if (![1, 3, 6, 12].includes(months)) {
      throw new BadRequestException("Invalid package");
    }

    const order = await this.db.transaction(async (tx: PoolClient) => {
      await tx.query("SELECT pg_advisory_xact_lock(740092)");
      const controls = (
        await tx.query("SELECT sales_paused FROM production_controls WHERE id=1 FOR UPDATE")
      ).rows[0];
      if (controls?.sales_paused) {
        throw new ConflictException("ขณะนี้ผู้ดูแลปิดการขายแพ็กเกจทั้งหมดชั่วคราว");
      }

      const user = (
        await tx.query("SELECT status FROM users WHERE id=$1 FOR UPDATE", [userId])
      ).rows[0];
      if (user?.status !== "ACTIVE") {
        throw new ConflictException("บัญชีไม่พร้อมใช้งาน");
      }

      const pending = (
        await tx.query(
          `SELECT id FROM local_orders
           WHERE user_id=$1 AND status IN ('CREATING','PENDING','REVIEW')
           LIMIT 1`,
          [userId]
        )
      ).rows[0];
      if (pending) {
        throw new ConflictException("มีรายการ Local รอชำระอยู่แล้ว กรุณาตรวจสอบรายการเดิม");
      }

      const pack = (
        await tx.query(
          `SELECT * FROM local_packages
           WHERE months=$1 AND enabled=true AND price_satang>0`,
          [months]
        )
      ).rows[0];
      if (!pack) {
        throw new ConflictException("แพ็กเกจ Local นี้ยังไม่เปิดขาย");
      }

      const promo = await this.promotions.reserve(tx, {
        code: promoCode,
        userId,
        mode: "LOCAL",
        months: pack.months,
        originalAmountSatang: Number(pack.price_satang)
      });
      const order = (
        await tx.query(
          `INSERT INTO local_orders(
             user_id,months,amount,original_amount,discount_amount,promotion_code,promotion_redemption_id
           ) VALUES($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [userId, pack.months, promo.finalAmountSatang, pack.price_satang,
           promo.discountAmountSatang, promo.code, promo.redemptionId]
        )
      ).rows[0];
      await this.promotions.attachOrder(tx, promo.redemptionId, order.id);
      return order;
    });

    if (Number(order.amount) === 0) {
      return this.activateFreeOrder(order.id);
    }

    if (paymentMode() === "EASYSLIP") {
      await this.db.query(
        `UPDATE local_orders
         SET status='PENDING',expires_at=now()+interval '24 hours'
         WHERE id=$1 AND status='CREATING'`,
        [order.id]
      );
      return { id: order.id, paymentMode: "EASYSLIP" };
    }

    try {
      const charge = await this.gateway(
        "/charges",
        new URLSearchParams({
          amount: String(order.amount),
          currency: "thb",
          "source[type]": "promptpay",
          "metadata[order_id]": order.id,
          "metadata[purchase_type]": "LOCAL",
          description: "SCENOVA Local MT5 " + order.months + " months",
          expires_at: new Date(Date.now() + 15 * 60000).toISOString()
        })
      );

      validateCharge(charge, order);

      await this.db.query(
        `UPDATE local_orders
         SET charge_id=$2,qr_url=$3,expires_at=$4,
             status=CASE WHEN status='CREATING' THEN 'PENDING' ELSE status END
         WHERE id=$1`,
        [
          order.id,
          charge.id,
          charge.source?.scannable_code?.image?.download_uri || null,
          charge.expires_at || null
        ]
      );

      return { id: order.id };
    } catch {
      await this.db.query(
        `UPDATE local_orders
         SET status='REVIEW'
         WHERE id=$1 AND status='CREATING'`,
        [order.id]
      );
      throw new ConflictException(
        "กำลังตรวจสอบการสร้าง QR กรุณาติดต่อผู้ดูแลพร้อมเลขรายการ " + order.id
      );
    }
  }

  private async activateFreeOrder(orderId: string) {
    return this.db.transaction(async (tx: PoolClient) => {
      await tx.query("SELECT pg_advisory_xact_lock(740092)");
      const order = (await tx.query("SELECT * FROM local_orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
      if (!order) throw new BadRequestException("ไม่พบรายการ");
      if (order.status === "PAID") return { id: order.id, free: true };
      if (Number(order.amount) !== 0 || !order.promotion_redemption_id) {
        throw new ConflictException("รายการโปรโมชั่น 100% ไม่ถูกต้อง");
      }
      const user = (await tx.query("SELECT status FROM users WHERE id=$1 FOR UPDATE", [order.user_id])).rows[0];
      if (user?.status !== "ACTIVE") throw new ConflictException("บัญชีไม่พร้อมใช้งาน");
      const current = (await tx.query(
        `SELECT max(s.expires_at) expires_at FROM subscriptions s
         JOIN plans p ON p.id=s.plan_id
         WHERE s.user_id=$1 AND p.mode='LOCAL' AND s.status='ACTIVE' AND s.expires_at>now()`,
        [order.user_id]
      )).rows[0];
      const subscription = (await tx.query(
        `INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
         SELECT $1,p.id,now(),GREATEST(now(),COALESCE($3::timestamptz,now()))+make_interval(months=>$2::int),'PROMOTION',$4
         FROM plans p WHERE p.code=$5 AND p.active=true RETURNING *`,
        [order.user_id, Number(order.months), current?.expires_at || null,
         "Local promotion order " + order.id, "LOCAL_" + Number(order.months) + "M"]
      )).rows[0];
      if (!subscription) throw new ConflictException("ไม่พบแพ็กเกจ Local ที่เปิดใช้งาน");
      let slot = (await tx.query(
        `SELECT * FROM license_slots
         WHERE owner_user_id=$1 AND assigned_user_id=$1 AND mode='LOCAL' AND status<>'DELETED'
         ORDER BY CASE WHEN slot_type='PERSONAL' THEN 0 ELSE 1 END,slot_number LIMIT 1 FOR UPDATE`,
        [order.user_id]
      )).rows[0];
      if (slot) {
        await tx.query(
          "UPDATE license_slots SET subscription_id=$2,status='ACTIVE',slot_type='PERSONAL',updated_at=now() WHERE id=$1",
          [slot.id, subscription.id]
        );
      } else {
        slot = (await tx.query(
          `INSERT INTO license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label)
           SELECT $1,$1,$2,'LOCAL',COALESCE(max(slot_number),0)+1,'PERSONAL','ACTIVE','Local MT5'
           FROM license_slots WHERE owner_user_id=$1 AND mode='LOCAL' RETURNING *`,
          [order.user_id, subscription.id]
        )).rows[0];
      }
      await tx.query(
        "UPDATE local_orders SET status='PAID',slot_id=$2,subscription_id=$3,paid_at=now(),expires_at=now() WHERE id=$1",
        [order.id, slot.id, subscription.id]
      );
      await this.promotions.consume(tx, "LOCAL", order.id);
      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES('PROMOTION','LOCAL_ACTIVATED','order',$1,$2::jsonb)",
        [order.id, JSON.stringify({ subscriptionId: subscription.id, slotId: slot.id, promotionCode: order.promotion_code })]
      );
      return { id: order.id, free: true };
    });
  }
}

@Controller("packages/local")
@UseGuards(JwtGuard)
export class LocalPackageCustomerController {
  constructor(
    private readonly db: DbService,
    private readonly local: LocalPackageService,
    private readonly easyslip: EasySlipPaymentService
  ) {}

  @Get("catalog")
  catalog() {
    return this.local.catalog();
  }

  @Get("orders")
  async orders(@Req() req: any) {
    return (
      await this.db.query(
        `SELECT
           o.id,o.months,o.amount,o.original_amount,o.discount_amount,o.promotion_code,o.status,o.qr_url,o.expires_at,o.created_at,o.paid_at,
           o.slot_id,o.subscription_id,s.expires_at subscription_expires_at
         FROM local_orders o
         LEFT JOIN subscriptions s ON s.id=o.subscription_id
         WHERE o.user_id=$1
         ORDER BY o.created_at DESC
         LIMIT 50`,
        [req.user.sub]
      )
    ).rows;
  }

  @Post("checkout")
  checkout(@Req() req: any, @Body() body: { months?: number; promoCode?: string }) {
    return this.local.checkout(
      String(req.user.sub),
      Math.trunc(Number(body.months || 0)),
      String(body.promoCode || "")
    );
  }

  @Post("orders/:id/verify-slip")
  async verifySlip(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { base64?: string }
  ) {
    return this.easyslip.verifyAndActivate({
      base64: String(body.base64 || ""),
      orderType: "LOCAL",
      orderId: id,
      userId: String(req.user.sub)
    });
  }

  @Post("orders/:id/refresh")
  async refresh(@Req() req: any, @Param("id") id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new BadRequestException("Invalid order");
    }
    const order = await this.db.one(
      "SELECT * FROM local_orders WHERE id=$1 AND user_id=$2",
      [id, req.user.sub]
    );
    if (!order) throw new BadRequestException("ไม่พบรายการ");
    if (order.charge_id && order.status !== "PAID") {
      await this.local.reconcile(String(order.charge_id));
    }
    return { ok: true };
  }
}

@Controller("admin/local-packages")
@UseGuards(AdminGuard)
export class LocalPackageAdminController {
  constructor(private readonly db: DbService) {}

  @Get()
  async list() {
    return (
      await this.db.query(
        "SELECT months,price_satang,enabled,updated_at FROM local_packages ORDER BY months"
      )
    ).rows;
  }

  @Post()
  async save(
    @Body() body: { months?: number; priceSatang?: number; enabled?: boolean }
  ) {
    const months = Math.trunc(Number(body.months || 0));
    const priceSatang = Math.trunc(Number(body.priceSatang || 0));
    if (![1, 3, 6, 12].includes(months)) {
      throw new BadRequestException("Invalid package");
    }
    if (!Number.isInteger(priceSatang) || priceSatang < 0 || priceSatang > 100000000) {
      throw new BadRequestException("Invalid price");
    }

    return this.db.one(
      `UPDATE local_packages
       SET price_satang=$2,enabled=$3,updated_at=now()
       WHERE months=$1
       RETURNING months,price_satang,enabled,updated_at`,
      [months, priceSatang, Boolean(body.enabled)]
    );
  }
}
