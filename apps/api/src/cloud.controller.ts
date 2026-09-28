import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, OnApplicationBootstrap, OnModuleDestroy, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { DbService } from "./db.service";
import { AdminGuard, CryptoService, JwtGuard } from "./security";
import { ReferralService } from "./referral.service";
import { LocalPackageService } from "./local-package.controller";
import { PromotionService } from "./promotion.service";
import { EasySlipPaymentService } from "./easyslip-payment.service";
import { CLOUD_SERVER_RELEASE, versionAtLeast, versionExact } from "./cloud-server-release";

function omiseMode() {
  const key = String(process.env.OMISE_SECRET_KEY || "").trim();
  if (key.startsWith("skey_test_")) return "TEST";
  if (key.startsWith("skey_live_") || key.startsWith("skey_")) return "LIVE";
  return "UNCONFIGURED";
}

export function paymentMode() {
  if (String(process.env.EASYSLIP_API_KEY || "").trim()) return "EASYSLIP";
  return omiseMode();
}
export function validateCharge(charge: any, order: any) {
  if (charge.object !== "charge" || charge.metadata?.order_id !== order.id ||
      charge.amount !== order.amount || charge.currency?.toLowerCase() !== "thb" ||
      charge.livemode !== (omiseMode() === "LIVE") ||
      (order.charge_id && order.charge_id !== charge.id)) {
    throw new ConflictException("ข้อมูลการชำระเงินไม่ตรงกับรายการ");
  }
}

@Injectable()
export class CloudService implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(
    private readonly db: DbService,
    private readonly referrals: ReferralService,
    private readonly promotions: PromotionService,
    private readonly easyslip: EasySlipPaymentService
  ) {}
  private timer?: ReturnType<typeof setInterval>;
  private checking = false;
  onApplicationBootstrap() {
    this.timer = setInterval(() => { void this.reconcilePending(); }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async reconcilePending() {
    if (this.checking || !["TEST", "LIVE"].includes(omiseMode())) return;
    this.checking = true;
    try {
      const orders = await this.db.query(`UPDATE cloud_orders SET checked_at=now() WHERE id IN (
        SELECT id FROM cloud_orders WHERE status IN ('PENDING','REVIEW') AND charge_id IS NOT NULL
        AND (checked_at IS NULL OR checked_at<now()-interval '1 minute')
        ORDER BY checked_at NULLS FIRST LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING charge_id`);
      for (const order of orders.rows) {
        try { await this.reconcile(order.charge_id); } catch { /* Retain reservation and retry; never infer a payment failure from a timeout. */ }
      }
    } catch { /* Database temporarily unavailable; next interval retries. */ }
    finally { this.checking = false; }
  }

  async gateway(path: string, fields?: URLSearchParams) {
    if (!["TEST", "LIVE"].includes(omiseMode())) throw new ConflictException("ยังไม่ได้เชื่อม Opn / Omise");
    const response = await fetch("https://api.omise.co" + path, {
      method: fields ? "POST" : "GET",
      headers: { Authorization: "Basic " + Buffer.from(process.env.OMISE_SECRET_KEY + ":").toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded", "Omise-Version": "2019-05-29" },
      body: fields, signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new ConflictException("ติดต่อผู้ให้บริการชำระเงินไม่สำเร็จ กรุณาตรวจสอบรายการก่อนลองใหม่");
    return response.json();
  }

  async nodes() {
    const rows = (await this.db.query(`SELECT w.runner_id,w.region,w.hostname,w.capacity,w.active_instances,
      w.accepting_jobs,w.monthly_cost,w.spec,w.telemetry,w.last_seen_at,l.occupied,
      w.health_state,w.capacity_blocked,w.capacity_block_reason,w.quarantined,w.quarantine_reason,w.recovery_paused,
      su.state server_update_state,su.target_worker_version server_update_target_worker,
      su.target_setup_version server_update_target_setup,su.result_code server_update_error,
      su.created_at server_update_created_at,su.completed_at server_update_completed_at,
      CASE WHEN w.last_seen_at>now()-interval '30 seconds' THEN 'ONLINE' ELSE 'OFFLINE' END health,
      CASE
        WHEN w.last_seen_at>now()-interval '30 seconds' AND w.telemetry->>'templateReady'='true' THEN 'ONLINE'
        WHEN w.last_seen_at>now()-interval '30 seconds' THEN 'TEMPLATE_NOT_READY'
        WHEN w.last_seen_at IS NOT NULL THEN 'WORKER_OFFLINE'
        WHEN w.hostname IS NOT NULL THEN 'INSTALLING'
        ELSE 'WAITING_INSTALL'
      END setup_state
      FROM worker_nodes w
      JOIN cloud_node_load l USING(runner_id)
      LEFT JOIN LATERAL (
        SELECT state,target_worker_version,target_setup_version,result_code,created_at,completed_at
        FROM server_software_update_jobs
        WHERE runner_id=w.runner_id
        ORDER BY created_at DESC
        LIMIT 1
      ) su ON true
      ORDER BY w.created_at`)).rows;

    return rows.map((node:any) => {
      const currentWorker = String(node.telemetry?.version || "");
      const currentSetup = String(node.telemetry?.setupVersion || "");
      return {
        ...node,
        latest_worker_version: CLOUD_SERVER_RELEASE.workerVersion,
        latest_setup_version: CLOUD_SERVER_RELEASE.setupVersion,
        server_update_available:
          !versionExact(currentWorker, CLOUD_SERVER_RELEASE.workerVersion) ||
          !versionExact(currentSetup, CLOUD_SERVER_RELEASE.setupVersion),
        server_update_capable: versionAtLeast(currentWorker, "2.2.0")
      };
    });
  }

  async catalog() {
    const [nodes, controls] = await Promise.all([
      this.nodes(),
      this.db.one("SELECT cloud_provisioning_paused,sales_paused FROM production_controls WHERE id=1")
    ]);
    const provisioningPaused = Boolean(controls?.cloud_provisioning_paused);
    const salesPaused = Boolean(controls?.sales_paused);
    const available = provisioningPaused ? 0 : nodes.filter(n =>
      n.health === "ONLINE" && n.accepting_jobs && n.telemetry?.templateReady === true &&
      !n.capacity_blocked && !n.quarantined
    ).reduce((sum, n) => sum + Math.max(0, n.capacity - Math.max(n.occupied, n.active_instances)), 0);
    const mode = paymentMode();
    const paymentAccounts = mode === "EASYSLIP"
      ? await this.easyslip.listBankAccounts().catch(() => [])
      : [];
    const [packages, addonPackages] = await Promise.all([
      this.db.query("SELECT * FROM cloud_packages ORDER BY months"),
      this.db.query("SELECT * FROM cloud_addon_packages ORDER BY months")
    ]);
    return {
      packages: packages.rows,
      addonPackages: addonPackages.rows,
      available,
      provisioningPaused,
      salesPaused,
      paymentMode: mode,
      paymentAccounts,
      checkoutEnabled: (
        mode === "EASYSLIP" ||
        (process.env.CLOUD_CHECKOUT_ENABLED === "true" && mode !== "UNCONFIGURED")
      ) && !provisioningPaused && !salesPaused
    };
  }

  // Never trust webhook status/amount. Retrieve the charge with the merchant's secret.
  async reconcile(chargeId: string) {
    if (!/^chrg_[a-zA-Z0-9_]+$/.test(chargeId)) throw new BadRequestException("Invalid charge");
    const charge = await this.gateway("/charges/" + chargeId);
    const orderId = charge.metadata?.order_id;
    if (!/^[0-9a-f-]{36}$/i.test(orderId || "")) return;
    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      const order = (await tx.query("SELECT * FROM cloud_orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
      if (!order) return;
      validateCharge(charge, order);
      if (order.status === "PAID") return order;
      if (charge.status !== "successful" || charge.paid !== true) {
        const failed = ["failed", "expired", "reversed"].includes(charge.status);
        await tx.query("UPDATE cloud_orders SET charge_id=$2,status=$3,qr_url=$4,expires_at=$5 WHERE id=$1",
          [order.id, charge.id, failed ? "FAILED" : "PENDING", charge.source?.scannable_code?.image?.download_uri || null, charge.expires_at || null]);
        if (failed) await this.promotions.release(tx, "CLOUD", order.id);
        return;
      }
      const user = (await tx.query("SELECT status FROM users WHERE id=$1 FOR UPDATE", [order.user_id])).rows[0];
      if (user?.status !== "ACTIVE" || order.status === "FAILED") {
        await tx.query("UPDATE cloud_orders SET status='REVIEW',charge_id=$2 WHERE id=$1", [order.id, charge.id]);
        return;
      }
      let slot = order.slot_id ? (await tx.query("SELECT * FROM license_slots WHERE id=$1 FOR UPDATE", [order.slot_id])).rows[0] : null;
      if (slot && (slot.owner_user_id !== order.user_id || slot.assigned_user_id !== order.user_id || slot.status === "DELETED")) {
        throw new ConflictException("Slot เปลี่ยนแปลง กรุณาติดต่อผู้ดูแล");
      }
      // Calendar months; renewing preserves the unused time of this exact slot.
      const subscription = (await tx.query(`INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
        SELECT $1,p.id,now(),GREATEST(now(),COALESCE((SELECT expires_at FROM subscriptions WHERE id=$3 AND status='ACTIVE'),now()))
          + make_interval(months=>$2::int),'PAYMENT', $4 FROM plans p WHERE p.code='CLOUD_' || $2::text || 'M' RETURNING *`,
        [order.user_id, order.months, slot?.subscription_id || null, "Order " + order.id])).rows[0];
      if (slot) {
        await tx.query("UPDATE license_slots SET subscription_id=$2,status='ACTIVE',updated_at=now() WHERE id=$1", [slot.id, subscription.id]);
      } else {
        slot = (await tx.query(`INSERT INTO license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label)
          SELECT $1,$1,$2,'CLOUD',COALESCE(max(slot_number),0)+1,
          CASE WHEN $3='ADDON' THEN 'ADDON' ELSE 'PERSONAL' END,
          'ACTIVE','Cloud Trading'
          FROM license_slots WHERE owner_user_id=$1 AND mode='CLOUD' AND status<>'DELETED' RETURNING *`, [order.user_id, subscription.id, String(order.purchase_type || "PACKAGE").toUpperCase()])).rows[0];
      }
      await tx.query("UPDATE cloud_orders SET status='PAID',charge_id=$2,slot_id=$3,subscription_id=$4,paid_at=now() WHERE id=$1",
        [order.id, charge.id, slot.id, subscription.id]);
      await tx.query("SELECT scenova_rearm_cloud_after_subscription_change($1,$2)", [order.user_id, slot.id]);
      await this.promotions.consume(tx, "CLOUD", order.id);

      // Referral accounting must never prevent a successfully paid customer
      // from receiving their Cloud entitlement. Keep it in an isolated
      // savepoint so the payment transaction can still complete if referral
      // bookkeeping has an unexpected problem.
      let referralCommissionCount = 0;
      await tx.query("SAVEPOINT referral_credit");
      try {
        const commissions = await this.referrals.creditPurchase(tx, {
          sourceUserId: order.user_id,
          sourceType: "CLOUD_ORDER",
          sourceId: order.id,
          grossAmountSatang: Number(order.amount || 0),
          currency: "THB",
          metadata: {
            subscriptionId: subscription.id,
            months: order.months,
            slotId: slot.id
          }
        });
        referralCommissionCount = commissions.length;
        await tx.query("RELEASE SAVEPOINT referral_credit");
      } catch {
        await tx.query("ROLLBACK TO SAVEPOINT referral_credit");
        await tx.query("RELEASE SAVEPOINT referral_credit");
      }

      await tx.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES('PAYMENT','CLOUD_ACTIVATED','order',$1,$2)",
        [order.id, JSON.stringify({ chargeId, slotId: slot.id, runnerId: order.runner_id, referralCommissionCount })]);
      return { ...order, status: "PAID", slot_id: slot.id };
    });
  }

  async activateFreeOrder(orderId: string) {
    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      const order = (await tx.query("SELECT * FROM cloud_orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
      if (!order) throw new BadRequestException("ไม่พบรายการ");
      if (order.status === "PAID") return { id: order.id, free: true };
      if (Number(order.amount) !== 0 || !order.promotion_redemption_id) {
        throw new ConflictException("รายการโปรโมชั่น 100% ไม่ถูกต้อง");
      }
      const user = (await tx.query("SELECT status FROM users WHERE id=$1 FOR UPDATE", [order.user_id])).rows[0];
      if (user?.status !== "ACTIVE") throw new ConflictException("บัญชีไม่พร้อมใช้งาน");
      let slot = order.slot_id ? (await tx.query("SELECT * FROM license_slots WHERE id=$1 FOR UPDATE", [order.slot_id])).rows[0] : null;
      if (slot && (slot.owner_user_id !== order.user_id || slot.assigned_user_id !== order.user_id || slot.status === "DELETED")) {
        throw new ConflictException("Slot เปลี่ยนแปลง กรุณาติดต่อผู้ดูแล");
      }
      const subscription = (await tx.query(
        `INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
         SELECT $1,p.id,now(),GREATEST(now(),COALESCE((SELECT expires_at FROM subscriptions WHERE id=$3 AND status='ACTIVE'),now()))
           + make_interval(months=>$2::int),'PROMOTION',$4
         FROM plans p WHERE p.code='CLOUD_' || $2::text || 'M' RETURNING *`,
        [order.user_id, order.months, slot?.subscription_id || null, "Promotion order " + order.id]
      )).rows[0];
      if (!subscription) throw new ConflictException("ไม่พบแพ็กเกจ Cloud ที่เปิดใช้งาน");
      if (slot) {
        await tx.query("UPDATE license_slots SET subscription_id=$2,status='ACTIVE',updated_at=now() WHERE id=$1", [slot.id, subscription.id]);
      } else {
        slot = (await tx.query(
          `INSERT INTO license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label)
           SELECT $1,$1,$2,'CLOUD',COALESCE(max(slot_number),0)+1,
                  CASE WHEN $3='ADDON' THEN 'ADDON' ELSE 'PERSONAL' END,
                  'ACTIVE','Cloud Trading'
           FROM license_slots WHERE owner_user_id=$1 AND mode='CLOUD' AND status<>'DELETED' RETURNING *`,
          [order.user_id, subscription.id, String(order.purchase_type || "PACKAGE").toUpperCase()]
        )).rows[0];
      }
      await tx.query(
        "UPDATE cloud_orders SET status='PAID',slot_id=$2,subscription_id=$3,paid_at=now(),expires_at=now() WHERE id=$1",
        [order.id, slot.id, subscription.id]
      );
      await tx.query("SELECT scenova_rearm_cloud_after_subscription_change($1,$2)", [order.user_id, slot.id]);
      await this.promotions.consume(tx, "CLOUD", order.id);
      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES('PROMOTION','CLOUD_ACTIVATED','order',$1,$2::jsonb)",
        [order.id, JSON.stringify({ subscriptionId: subscription.id, slotId: slot.id, runnerId: order.runner_id, promotionCode: order.promotion_code })]
      );
      return { id: order.id, free: true };
    });
  }
}

@Controller("cloud")
@UseGuards(JwtGuard)
export class CloudCustomerController {
  constructor(
    private readonly db: DbService,
    private readonly cloud: CloudService,
    private readonly promotions: PromotionService,
    private readonly easyslip: EasySlipPaymentService
  ) {}
  @Get("catalog") catalog() { return this.cloud.catalog(); }
  @Post("promotion-preview")
  async promotionPreview(
    @Req() req: any,
    @Body() body: { months?: number; code?: string }
  ) {
    const months = Math.trunc(Number(body.months || 0));
    if (![1,3,6,12].includes(months)) throw new BadRequestException("Invalid package");
    const pack = await this.db.one(
      "SELECT price_satang FROM cloud_packages WHERE months=$1 AND enabled=true AND price_satang>0",
      [months]
    );
    if (!pack) throw new ConflictException("แพ็กเกจ Cloud นี้ยังไม่เปิดขาย");
    return this.promotions.preview({
      code:String(body.code || ""),
      userId:String(req.user.sub),
      mode:"CLOUD",
      months,
      originalAmountSatang:Number(pack.price_satang)
    });
  }

  @Get("orders") async orders(@Req() req: any) {
    return (await this.db.query(`SELECT o.id,o.months,o.amount,o.original_amount,o.discount_amount,o.promotion_code,o.status,o.qr_url,o.expires_at,o.created_at,o.paid_at,o.slot_id,o.purchase_type,
      s.expires_at subscription_expires_at,b.actual_state,b.last_seen_at,a.account_number,ls.slot_type
      FROM cloud_orders o
      LEFT JOIN subscriptions s ON s.id=o.subscription_id
      LEFT JOIN license_slots ls ON ls.id=o.slot_id
      LEFT JOIN bot_instances b ON b.slot_id=o.slot_id
      LEFT JOIN mt5_accounts a ON a.id=b.mt5_account_id
      WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 50`, [req.user.sub])).rows;
  }
  @Post("orders/:id/verify-slip")
  async verifySlip(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { base64?: string }
  ) {
    return this.easyslip.verifyAndActivate({
      base64: String(body.base64 || ""),
      orderType: "CLOUD",
      orderId: id,
      userId: String(req.user.sub)
    });
  }

  @Post("orders/:id/cancel-slip-payment")
  async cancelSlipPayment(@Req() req: any, @Param("id") id: string) {
    return this.easyslip.cancelPending({
      orderType: "CLOUD",
      orderId: id,
      userId: String(req.user.sub)
    });
  }

  @Post("orders/:id/refresh") async refresh(@Req() req: any, @Param("id") id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException("Invalid order");
    const order = await this.db.one("SELECT * FROM cloud_orders WHERE id=$1 AND user_id=$2", [id, req.user.sub]);
    if (!order) throw new BadRequestException("ไม่พบรายการ");
    if (order.charge_id && order.status !== "PAID") await this.cloud.reconcile(order.charge_id);
    return { ok: true };
  }
  @Post("addon-prices")
  async updateAddonPrices(
    @Req() req: any,
    @Body() body: { packages?: Array<{ months:number; priceSatang:number; enabled:boolean }> }
  ) {
    const user = await this.db.one("SELECT role,status FROM users WHERE id=$1", [req.user.sub]);
    if (!user || user.status !== "ACTIVE" || String(user.role || "").toUpperCase() !== "OWNER") {
      throw new UnauthorizedException("Owner เท่านั้นที่ตั้งราคา VPS Slot เสริมได้");
    }
    const rows = Array.isArray(body.packages) ? body.packages : [];
    if (rows.length !== 4) throw new BadRequestException("กรุณากำหนดราคา 1, 3, 6 และ 12 เดือนให้ครบ");
    const monthsSeen = new Set<number>();
    for (const item of rows) {
      const months = Math.trunc(Number(item.months));
      const priceSatang = Math.trunc(Number(item.priceSatang));
      if (![1,3,6,12].includes(months) || monthsSeen.has(months)) throw new BadRequestException("ระยะเวลา Slot เสริมไม่ถูกต้อง");
      if (!Number.isInteger(priceSatang) || priceSatang < 0 || priceSatang > 15000000) throw new BadRequestException("ราคาต้องอยู่ระหว่าง 0 ถึง 150,000 บาท");
      if (typeof item.enabled !== "boolean" || (item.enabled && priceSatang < 2000)) throw new BadRequestException("ราคาเปิดขายต้องไม่น้อยกว่า 20 บาท");
      monthsSeen.add(months);
    }
    await this.db.transaction(async tx => {
      for (const item of rows) {
        await tx.query(
          `INSERT INTO cloud_addon_packages(months,price_satang,enabled,updated_at)
           VALUES($1,$2,$3,now())
           ON CONFLICT(months) DO UPDATE SET price_satang=EXCLUDED.price_satang,enabled=EXCLUDED.enabled,updated_at=now()`,
          [Math.trunc(Number(item.months)), Math.trunc(Number(item.priceSatang)), item.enabled]
        );
      }
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'OWNER_CLOUD_ADDON_PRICING_UPDATED','cloud_addon_packages',$2,$3::jsonb)`,
        [
          String(req.user?.code || req.user?.sub || "OWNER").slice(0,160),
          String(req.user.sub),
          JSON.stringify({ packages: rows })
        ]
      );
    });
    return { ok:true, addonPackages:(await this.db.query("SELECT * FROM cloud_addon_packages ORDER BY months")).rows };
  }

  @Post("checkout") async checkout(@Req() req: any, @Body() body: { months: number; slotId?: string; promoCode?: string; purchaseType?: "PACKAGE" | "ADDON" }) {
    if (paymentMode() === "UNCONFIGURED" || (paymentMode() !== "EASYSLIP" && process.env.CLOUD_CHECKOUT_ENABLED !== "true")) throw new ConflictException("ยังไม่เปิดรับชำระเงิน");
    if (![1,3,6,12].includes(body.months)) throw new BadRequestException("Invalid package");
    if (body.slotId && !/^[0-9a-f-]{36}$/i.test(body.slotId)) throw new BadRequestException("Invalid slot");
    const order = await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      const controls = (await tx.query("SELECT cloud_provisioning_paused,sales_paused FROM production_controls WHERE id=1 FOR UPDATE")).rows[0];
      if (controls?.sales_paused) throw new ConflictException("ขณะนี้ผู้ดูแลปิดการขายแพ็กเกจทั้งหมดชั่วคราว");
      if (controls?.cloud_provisioning_paused) throw new ConflictException("Cloud provisioning ถูกพักชั่วคราวโดยผู้ดูแล");
      const user = (await tx.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [req.user.sub])).rows[0];
      if (user?.status !== "ACTIVE") throw new ConflictException("บัญชีไม่พร้อมใช้งาน");
      const pending = (await tx.query("SELECT id FROM cloud_orders WHERE user_id=$1 AND status IN ('CREATING','PENDING','REVIEW')", [req.user.sub])).rows[0];
      if (pending) throw new ConflictException("มีรายการรอชำระอยู่แล้ว กรุณาตรวจสอบรายการเดิม");
      const pack = (await tx.query("SELECT * FROM cloud_packages WHERE months=$1 AND enabled=true AND price_satang>0", [body.months])).rows[0];
      if (!pack) throw new ConflictException("แพ็กเกจยังไม่เปิดขาย");

      const purchaseType = body.slotId
        ? "RENEW"
        : String(body.purchaseType || "PACKAGE").toUpperCase();
      if (!["PACKAGE","ADDON","RENEW"].includes(purchaseType)) {
        throw new BadRequestException("Invalid purchase type");
      }

      let slot = body.slotId
        ? (await tx.query(
            "SELECT * FROM license_slots WHERE id=$1 AND owner_user_id=$2 AND assigned_user_id=$2 AND mode='CLOUD' AND status<>'DELETED' FOR UPDATE",
            [body.slotId,req.user.sub]
          )).rows[0]
        : null;
      if (body.slotId && !slot) throw new ConflictException("ไม่พบ Cloud Slot ของคุณ");

      // The normal Cloud package owns exactly one primary VPS slot.
      // If the customer had an expired/legacy primary slot, renew that row
      // instead of silently creating a second Slot #1.
      if (!slot && purchaseType === "PACKAGE") {
        slot = (await tx.query(
          `SELECT ls.*
           FROM license_slots ls
           LEFT JOIN subscriptions s ON s.id=ls.subscription_id
           LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
           WHERE ls.owner_user_id=$1
             AND ls.assigned_user_id=$1
             AND ls.mode='CLOUD'
             AND ls.slot_type='PERSONAL'
             AND ls.status<>'DELETED'
           ORDER BY
             CASE WHEN s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() THEN 0 ELSE 1 END,
             CASE WHEN bi.id IS NOT NULL THEN 0 ELSE 1 END,
             ls.updated_at DESC
           LIMIT 1
           FOR UPDATE OF ls`,
          [req.user.sub]
        )).rows[0] || null;
      }

      // Extra VPS slots are add-ons. Normal customers must already have a
      // current primary Cloud entitlement before buying another runtime.
      if (!slot && purchaseType === "ADDON" && !["OWNER","ADMIN"].includes(String(user.role || "").toUpperCase())) {
        const primary = (await tx.query(
          `SELECT ls.id
           FROM license_slots ls
           JOIN subscriptions s ON s.id=ls.subscription_id
           WHERE ls.owner_user_id=$1
             AND ls.assigned_user_id=$1
             AND ls.mode='CLOUD'
             AND ls.slot_type='PERSONAL'
             AND ls.status<>'DELETED'
             AND s.status='ACTIVE'
             AND s.starts_at<=now()
             AND s.expires_at>now()
           LIMIT 1`,
          [req.user.sub]
        )).rows[0];
        if (!primary) {
          throw new ConflictException("กรุณาเปิดแพ็กเกจ VPS หลักก่อนซื้อ VPS Slot เพิ่ม");
        }
      }

      const reserved = slot ? (await tx.query(`
        SELECT runner_id
        FROM bot_instances
        WHERE slot_id=$1 AND runner_id IS NOT NULL
        UNION ALL
        SELECT o.runner_id
        FROM cloud_orders o
        JOIN subscriptions s ON s.id=o.subscription_id
        WHERE o.slot_id=$1
          AND o.status='PAID'
          AND s.status='ACTIVE'
          AND s.starts_at<=now()
          AND s.expires_at>now()
          AND o.runner_id IS NOT NULL
        LIMIT 1`, [slot.id])).rows[0] : null;
      const reservedHealthy = reserved ? (await tx.query(`SELECT runner_id FROM worker_nodes
        WHERE runner_id=$1 AND last_seen_at>now()-interval '30 seconds'
          AND telemetry->>'templateReady'='true' AND NOT capacity_blocked AND NOT quarantined`, [reserved.runner_id])).rows[0] : null;
      const node = reservedHealthy || (await tx.query(`SELECT w.runner_id FROM worker_nodes w JOIN cloud_node_load l USING(runner_id)
        WHERE w.accepting_jobs AND w.last_seen_at>now()-interval '30 seconds' AND w.telemetry->>'templateReady'='true'
        AND NOT w.capacity_blocked AND NOT w.quarantined
        AND GREATEST(l.occupied,w.active_instances)<w.capacity
        ORDER BY GREATEST(l.occupied,w.active_instances)::float/w.capacity,w.runner_id LIMIT 1`)).rows[0];
      if (!node) throw new ConflictException("Cloud เต็มหรือ VPS ยังไม่ผ่าน Health Guard กรุณาลองภายหลัง");
      const promo = await this.promotions.reserve(tx, {
        code: body.promoCode,
        userId: String(req.user.sub),
        mode: "CLOUD",
        months: pack.months,
        originalAmountSatang: Number(pack.price_satang)
      });
      const order = (await tx.query(
        `INSERT INTO cloud_orders(
           user_id,months,amount,original_amount,discount_amount,promotion_code,promotion_redemption_id,runner_id,slot_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.user.sub, pack.months, promo.finalAmountSatang, pack.price_satang,
         promo.discountAmountSatang, promo.code, promo.redemptionId, node.runner_id, slot?.id || null]
      )).rows[0];
      await this.promotions.attachOrder(tx, promo.redemptionId, order.id);
      return order;
    });
    if (Number(order.amount) === 0) return this.cloud.activateFreeOrder(order.id);
    if (paymentMode() === "EASYSLIP") {
      const qr = await this.easyslip.createPaymentQr({
        orderId:String(order.id),
        amountSatang:Number(order.amount)
      });
      await this.db.query(
        "UPDATE cloud_orders SET status='PENDING',qr_url=$2,expires_at=now()+interval '24 hours' WHERE id=$1 AND status='CREATING'",
        [order.id, qr?.dataUrl || null]
      );
      return { id: order.id, paymentMode: "EASYSLIP", qrAvailable:Boolean(qr?.dataUrl) };
    }
    try {
      const charge = await this.cloud.gateway("/charges", new URLSearchParams({ amount: String(order.amount), currency: "thb",
        "source[type]": "promptpay", "metadata[order_id]": order.id, "metadata[purchase_type]": "CLOUD", description: "SCENOVA Cloud " + order.months + " months",
        expires_at: new Date(Date.now()+15*60000).toISOString() }));
      validateCharge(charge, order);
      await this.db.query("UPDATE cloud_orders SET charge_id=$2,qr_url=$3,expires_at=$4,status=CASE WHEN status='CREATING' THEN 'PENDING' ELSE status END WHERE id=$1",
        [order.id,charge.id,charge.source?.scannable_code?.image?.download_uri || null,charge.expires_at || null]);
      return { id: order.id };
    } catch {
      await this.db.query("UPDATE cloud_orders SET status='REVIEW' WHERE id=$1 AND status='CREATING'", [order.id]);
      throw new ConflictException("กำลังตรวจสอบการสร้าง QR กรุณาติดต่อผู้ดูแลพร้อมเลขรายการ " + order.id);
    }
  }
}

@Controller("payments/omise")
export class CloudPaymentController {
  constructor(
    private readonly cloud: CloudService,
    private readonly localPackages: LocalPackageService
  ) {}

  private verifyWebhookSignature(req: any) {
    const encodedSecret = String(process.env.OMISE_WEBHOOK_SECRET || "").trim();
    if (!encodedSecret) return;

    const signatureHeader = String(req?.headers?.["omise-signature"] || "").trim();
    const timestampHeader = String(req?.headers?.["omise-signature-timestamp"] || "").trim();
    if (!signatureHeader || !/^\d{10,13}$/.test(timestampHeader)) {
      throw new UnauthorizedException("Invalid Omise webhook signature");
    }

    const timestampSeconds = Number(timestampHeader);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300
    ) {
      throw new UnauthorizedException("Expired Omise webhook signature");
    }

    let secret: Buffer;
    try {
      secret = Buffer.from(encodedSecret, "base64");
    } catch {
      throw new UnauthorizedException("Invalid Omise webhook secret");
    }
    if (secret.length < 16) {
      throw new UnauthorizedException("Invalid Omise webhook secret");
    }

    const rawBody = Buffer.isBuffer(req?.rawBody)
      ? req.rawBody.toString("utf8")
      : "";
    if (!rawBody) {
      throw new UnauthorizedException("Missing raw Omise webhook body");
    }

    const expected = createHmac("sha256", secret)
      .update(timestampHeader + "." + rawBody)
      .digest();

    const valid = signatureHeader
      .split(",")
      .map((value: string) => value.trim())
      .filter((value: string) => /^[0-9a-f]{64}$/i.test(value))
      .some((value: string) => {
        const supplied = Buffer.from(value, "hex");
        return supplied.length === expected.length && timingSafeEqual(supplied, expected);
      });

    if (!valid) {
      throw new UnauthorizedException("Invalid Omise webhook signature");
    }
  }

  @Post("webhook") async webhook(@Req() req: any, @Body() body: any) {
    this.verifyWebhookSignature(req);
    if (body?.key === "charge.complete" || body?.key === "charge.create" || body?.key === "charge.expire") {
      const chargeId = String(body.data?.id || "");
      await Promise.allSettled([
        this.cloud.reconcile(chargeId),
        this.localPackages.reconcile(chargeId)
      ]);
    }
    return { received: true };
  }
}

@Controller("admin/cloud")
@UseGuards(AdminGuard)
export class CloudAdminController {
  constructor(private readonly db: DbService, private readonly cloud: CloudService, private readonly crypto: CryptoService) {}
  @Get() async overview() {
    const [catalog, nodes, instances, orders] = await Promise.all([
      this.cloud.catalog(),this.cloud.nodes(),
      this.db.query(`SELECT b.id,b.runner_id,b.actual_state,b.desired_state,b.last_seen_at,b.provisioning_error,
        b.cloud_recovery_state,b.cloud_recovery_attempts,b.cloud_recovery_next_at,b.cloud_recovery_last_error,
        a.account_number,u.user_code,CASE WHEN c.mt5_account_id IS NULL THEN false ELSE true END credential_ready
        FROM bot_instances b LEFT JOIN mt5_accounts a ON a.id=b.mt5_account_id LEFT JOIN users u ON u.id=a.user_id
        LEFT JOIN mt5_credentials c ON c.mt5_account_id=a.id WHERE b.mode='CLOUD' ORDER BY b.created_at DESC LIMIT 100`),
      this.db.query(`SELECT o.id,o.months,o.amount,o.status,o.charge_id,o.runner_id,o.slot_id,o.created_at,u.user_code
        FROM cloud_orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 100`)
    ]);
    return { ...catalog,nodes,instances:instances.rows,orders:orders.rows };
  }
  @Post("nodes") async addNode(@Body() body: { runnerId: string; region: string; capacity: number; monthlyCost: number; spec: string }) {
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(body.runnerId || "")) throw new BadRequestException("Runner ID ใช้ a-z, 0-9, - หรือ _ ความยาว 3–80 ตัว");
    if (!Number.isInteger(body.capacity) || body.capacity<1 || body.capacity>200) throw new BadRequestException("Capacity ต้องเป็น 1–200");
    if (!Number.isInteger(body.monthlyCost) || body.monthlyCost<0 || body.monthlyCost>1000000) throw new BadRequestException("Invalid monthly cost");
    const key = randomBytes(32).toString("hex");
    const result = await this.db.query(`INSERT INTO worker_nodes(runner_id,region,capacity,monthly_cost,spec,worker_key_hash,status)
      VALUES($1,$2,$3,$4,$5,$6,'OFFLINE') ON CONFLICT(runner_id) DO NOTHING RETURNING runner_id`,
      [body.runnerId,String(body.region||"Thailand").slice(0,80),body.capacity,body.monthlyCost,String(body.spec||"").slice(0,300),this.crypto.sha256(key)]);
    if (!result.rowCount) throw new ConflictException("Runner ID นี้มีแล้ว");
    return { runnerId: body.runnerId, workerKey: key };
  }
  @Post("nodes/:id") async updateNode(@Param("id") id: string, @Body() body: { capacity: number; acceptingJobs: boolean }) {
    if (!Number.isInteger(body.capacity) || body.capacity<1 || body.capacity>200 || typeof body.acceptingJobs!=="boolean") throw new BadRequestException("Invalid settings");
    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      const node = (await tx.query("SELECT w.*,l.occupied FROM worker_nodes w JOIN cloud_node_load l USING(runner_id) WHERE w.runner_id=$1 FOR UPDATE OF w",[id])).rows[0];
      if (!node) throw new BadRequestException("ไม่พบ VPS");
      if (body.capacity<Math.max(node.occupied,node.active_instances)) throw new ConflictException("ความจุต้องไม่น้อยกว่าที่ใช้อยู่และที่จองไว้");
      const controls = (await tx.query("SELECT cloud_provisioning_paused FROM production_controls WHERE id=1")).rows[0];
      if (body.acceptingJobs && controls?.cloud_provisioning_paused) throw new ConflictException("ระบบพัก Cloud provisioning อยู่");
      if (body.acceptingJobs && (node.capacity_blocked || node.quarantined)) throw new ConflictException("VPS ถูก Health Guard/Quarantine บล็อกอยู่");
      if (body.acceptingJobs && (!node.last_seen_at || Date.now()-new Date(node.last_seen_at).getTime()>30000 || node.telemetry?.templateReady!==true)) throw new ConflictException("เชื่อม Worker และตรวจ MT5 Template ก่อนเปิดรับลูกค้า");
      await tx.query("UPDATE worker_nodes SET capacity=$2,accepting_jobs=$3 WHERE runner_id=$1",[id,body.capacity,body.acceptingJobs]);
      return { ok:true };
    });
  }
  @Post("nodes/:id/rotate-key") async rotateKey(@Param("id") id: string) {
    const key = randomBytes(32).toString("hex");
    const result = await this.db.query("UPDATE worker_nodes SET worker_key_hash=$2,accepting_jobs=false WHERE runner_id=$1 RETURNING runner_id", [id,this.crypto.sha256(key)]);
    if (!result.rowCount) throw new BadRequestException("ไม่พบ VPS");
    return { runnerId:id,workerKey:key };
  }
  @Post("packages") async packages(@Body() body: { months: number; priceSatang: number; enabled: boolean }) {
    if (![1,3,6,12].includes(body.months) || !Number.isInteger(body.priceSatang) || body.priceSatang<0 || body.priceSatang>15000000 || typeof body.enabled!=="boolean" || (body.enabled && body.priceSatang<2000)) throw new BadRequestException("ตรวจราคาแพ็กเกจ เปิดขายได้ตั้งแต่ 20 ถึง 150,000 บาท");
    await this.db.query("UPDATE cloud_packages SET price_satang=$2,enabled=$3,updated_at=now() WHERE months=$1",[body.months,body.priceSatang,body.enabled]);
    return { ok:true };
  }
  @Post("reconcile") async reconcile(@Body() body: { chargeId: string }) { await this.cloud.reconcile(body.chargeId); return { ok:true }; }
}
