import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Param,
  Post,
  Query,
  Req
} from "@nestjs/common";
import { DbService } from "./db.service";
import { OwnerMobileService } from "./owner-mobile.controller";
import { PromotionInput, PromotionService } from "./promotion.service";
import { getUsdThbQuote, usdCentsToThbSatang } from "./commerce-currency";

const PACKAGE_MONTHS = [1, 3, 6, 12];

@Injectable()
export class OwnerManagementService {
  constructor(private readonly db: DbService) {}

  private actor(session: any) {
    return "OWNER-MOBILE:" + String(session?.user_code || session?.owner_user_id || "OWNER");
  }

  private async audit(session: any, action: string, entityType: string, entityId: string, detail: any = {}) {
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
      [this.actor(session), action, entityType, entityId, JSON.stringify(detail || {})]
    );
  }

  async packages() {
    const [local, cloud, quote] = await Promise.all([
      this.db.query("SELECT months,price_satang,price_usd_cents,enabled,updated_at FROM local_packages ORDER BY months"),
      this.db.query("SELECT months,price_satang,price_usd_cents,enabled,updated_at FROM cloud_packages ORDER BY months"),
      getUsdThbQuote()
    ]);
    return { local: local.rows, cloud: cloud.rows, fx: quote };
  }

  async savePackage(session: any, input: { mode?: string; months?: number; priceUsdCents?: number; enabled?: boolean }) {
    const mode = String(input.mode || "").toUpperCase();
    const months = Math.trunc(Number(input.months || 0));
    const priceUsdCents = Math.trunc(Number(input.priceUsdCents ?? -1));
    if (!["LOCAL", "CLOUD"].includes(mode) || !PACKAGE_MONTHS.includes(months)) {
      throw new BadRequestException("แพ็กเกจไม่ถูกต้อง");
    }
    if (!Number.isInteger(priceUsdCents) || priceUsdCents < 0 || priceUsdCents > 3_000_000) {
      throw new BadRequestException("ราคาแพ็กเกจ USD ไม่ถูกต้อง");
    }
    if (Boolean(input.enabled) && priceUsdCents <= 0) {
      throw new BadRequestException("แพ็กเกจที่เปิดขายต้องมีราคา USD มากกว่า 0");
    }
    if (mode === "CLOUD" && Boolean(input.enabled) && priceUsdCents < 50) {
      throw new BadRequestException("Cloud เปิดขายได้ตั้งแต่ $0.50 ขึ้นไป");
    }
    const quote = await getUsdThbQuote();
    const priceSatang = usdCentsToThbSatang(priceUsdCents, quote.usdThb);
    const table = mode === "LOCAL" ? "local_packages" : "cloud_packages";
    const row = await this.db.one(
      "UPDATE " + table + " SET price_usd_cents=$2,price_satang=$3,enabled=$4,updated_at=now() WHERE months=$1 RETURNING months,price_satang,price_usd_cents,enabled,updated_at",
      [months, priceUsdCents, priceSatang, Boolean(input.enabled)]
    );
    if (!row) throw new ConflictException("ไม่พบแพ็กเกจ");
    await this.audit(session, "UPDATE_PACKAGE", "package", mode + "_" + months + "M", {
      mode, months, priceUsdCents, fxRateUsdThb: quote.usdThb, enabled: Boolean(input.enabled)
    });
    return row;
  }

  async searchAccounts(q = "") {
    const term = q.trim().slice(0, 160);
    const like = "%" + term + "%";
    const result = await this.db.query(`
      SELECT u.id,u.user_code,u.email,u.status,u.created_at,u.email_verified_at,
        sub.id subscription_id,sub.plan_code,sub.subscription_mode,
        sub.subscription_status,sub.subscription_expires_at,
        mt.account_number,mt.broker_server
      FROM users u
      LEFT JOIN LATERAL (
        SELECT s.id,p.code plan_code,p.mode subscription_mode,
          s.status subscription_status,s.expires_at subscription_expires_at
        FROM subscriptions s JOIN plans p ON p.id=s.plan_id
        WHERE s.user_id=u.id
        ORDER BY (s.status='ACTIVE' AND s.expires_at>now()) DESC,s.expires_at DESC,s.created_at DESC
        LIMIT 1
      ) sub ON true
      LEFT JOIN LATERAL (
        SELECT account_number,broker_server
        FROM mt5_accounts WHERE user_id=u.id AND status<>'DELETED'
        ORDER BY created_at DESC LIMIT 1
      ) mt ON true
      WHERE u.role NOT IN ('OWNER','ADMIN') AND u.status<>'DELETED'
        AND ($1='' OR u.user_code ILIKE $2 OR u.email ILIKE $2 OR
          EXISTS (SELECT 1 FROM mt5_accounts m WHERE m.user_id=u.id AND m.account_number ILIKE $2))
      ORDER BY u.created_at DESC
      LIMIT 50
    `, [term, like]);
    return { items: result.rows };
  }

  async account(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException("User ID ไม่ถูกต้อง");
    const user = await this.db.one(
      "SELECT id,user_code,email,role,status,created_at,email_verified_at FROM users WHERE id=$1 AND role NOT IN ('OWNER','ADMIN') AND status<>'DELETED'",
      [id]
    );
    if (!user) throw new BadRequestException("ไม่พบบัญชีลูกค้า");
    const [subscriptions, slots, mt5] = await Promise.all([
      this.db.query(`
        SELECT s.id,s.status,s.starts_at,s.expires_at,s.activated_by,s.note,
          p.code plan_code,p.name_th,p.mode
        FROM subscriptions s JOIN plans p ON p.id=s.plan_id
        WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 20
      `, [id]),
      this.db.query(`
        SELECT id,mode,slot_number,slot_type,status,subscription_id
        FROM license_slots WHERE owner_user_id=$1 AND status<>'DELETED'
        ORDER BY mode,slot_number
      `, [id]),
      this.db.query(
        "SELECT id,account_number,broker,broker_server,mode,status,created_at FROM mt5_accounts WHERE user_id=$1 ORDER BY created_at DESC",
        [id]
      )
    ]);
    return { user, subscriptions: subscriptions.rows, slots: slots.rows, mt5Accounts: mt5.rows };
  }

  async grantAccess(session: any, id: string, input: { mode?: string; months?: number }) {
    const mode = String(input.mode || "").toUpperCase();
    const months = Math.trunc(Number(input.months || 0));
    if (!["LOCAL", "CLOUD"].includes(mode) || !PACKAGE_MONTHS.includes(months)) {
      throw new BadRequestException("แพ็กเกจไม่ถูกต้อง");
    }
    const planCode = mode + "_" + months + "M";
    const result = await this.db.transaction(async tx => {
      const user = (await tx.query(
        "SELECT id,role,status FROM users WHERE id=$1 FOR UPDATE", [id]
      )).rows[0];
      if (!user || ["OWNER","ADMIN"].includes(String(user.role).toUpperCase()) || user.status !== "ACTIVE") {
        throw new ConflictException("บัญชีลูกค้าไม่พร้อมเปิดสิทธิ์");
      }
      const partner = (await tx.query(
        "SELECT id FROM partner_customers WHERE customer_user_id=$1 AND status='ACTIVE' LIMIT 1", [id]
      )).rows[0];
      if (partner) {
        throw new ConflictException("บัญชีนี้อยู่ภายใต้ Partner กรุณาจัดการสิทธิ์จาก Owner Console");
      }
      const plan = (await tx.query("SELECT * FROM plans WHERE code=$1 AND active=true", [planCode])).rows[0];
      if (!plan) throw new ConflictException("ไม่พบแพ็กเกจที่เปิดใช้งาน");
      const current = (await tx.query(`
        SELECT max(s.expires_at) expires_at FROM subscriptions s
        JOIN plans p ON p.id=s.plan_id
        WHERE s.user_id=$1 AND p.mode=$2 AND s.status='ACTIVE' AND s.expires_at>now()
      `, [id, mode])).rows[0];
      await tx.query(`
        UPDATE subscriptions s SET status='CANCELLED'
        FROM plans p WHERE s.plan_id=p.id AND s.user_id=$1 AND p.mode=$2 AND s.status='ACTIVE'
      `, [id, mode]);
      const subscription = (await tx.query(`
        INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
        VALUES($1,$2,now(),GREATEST(now(),COALESCE($3::timestamptz,now()))+make_interval(months=>$4::int),$5,$6)
        RETURNING *
      `, [id, plan.id, current?.expires_at || null, months, this.actor(session), "Owner Mobile"])).rows[0];
      let slot = (await tx.query(`
        SELECT * FROM license_slots
        WHERE owner_user_id=$1 AND mode=$2 AND status<>'DELETED'
        ORDER BY CASE WHEN slot_type='PERSONAL' THEN 0 ELSE 1 END,slot_number
        LIMIT 1 FOR UPDATE
      `, [id, mode])).rows[0];
      if (slot) {
        await tx.query(
          "UPDATE license_slots SET assigned_user_id=$2,subscription_id=$3,slot_type='PERSONAL',status='ACTIVE',updated_at=now() WHERE id=$1",
          [slot.id, id, subscription.id]
        );
      } else {
        slot = (await tx.query(`
          INSERT INTO license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label)
          SELECT $1,$1,$2,$3,COALESCE(max(slot_number),0)+1,'PERSONAL','ACTIVE',$4
          FROM license_slots WHERE owner_user_id=$1 AND mode=$3 RETURNING *
        `, [id, subscription.id, mode, mode === "LOCAL" ? "Local MT5" : "Cloud Trading"])).rows[0];
      }
      return { subscription, slot };
    });
    await this.audit(session, "GRANT_CUSTOMER_ACCESS", "user", id, {
      mode, months, planCode, subscriptionId: result.subscription.id
    });
    return this.account(id);
  }

  async extendAccess(session: any, id: string, input: { subscriptionId?: string; days?: number }) {
    const subscriptionId = String(input.subscriptionId || "");
    const days = Math.trunc(Number(input.days || 0));
    if (!/^[0-9a-f-]{36}$/i.test(subscriptionId)) throw new BadRequestException("Subscription ID ไม่ถูกต้อง");
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new BadRequestException("จำนวนวันต้องอยู่ระหว่าง 1-3650");
    const partner = await this.db.one(
      "SELECT id FROM partner_customers WHERE customer_user_id=$1 AND status='ACTIVE' LIMIT 1", [id]
    );
    if (partner) {
      throw new ConflictException("บัญชีนี้อยู่ภายใต้ Partner กรุณาจัดการสิทธิ์จาก Owner Console");
    }
    const row = await this.db.one(
      "UPDATE subscriptions SET expires_at=GREATEST(expires_at,now())+($3 || ' days')::interval,status='ACTIVE' WHERE id=$1 AND user_id=$2 RETURNING *",
      [subscriptionId, id, days]
    );
    if (!row) throw new ConflictException("ไม่พบ Subscription ของลูกค้ารายนี้");
    await this.db.query(
      "UPDATE license_slots SET status='ACTIVE',updated_at=now() WHERE owner_user_id=$1 AND subscription_id=$2 AND status<>'DELETED'",
      [id, subscriptionId]
    );
    await this.audit(session, "EXTEND_CUSTOMER_ACCESS", "subscription", subscriptionId, { userId: id, days });
    return this.account(id);
  }

  async setStatus(session: any, id: string, status: "ACTIVE" | "SUSPENDED") {
    const user = await this.db.one(
      "SELECT id,role,status FROM users WHERE id=$1 AND status<>'DELETED'", [id]
    );
    if (!user || ["OWNER","ADMIN"].includes(String(user.role).toUpperCase())) {
      throw new ConflictException("ไม่พบบัญชีลูกค้าที่จัดการได้");
    }
    await this.db.query("UPDATE users SET status=$2,updated_at=now() WHERE id=$1", [id, status]);
    if (status === "SUSPENDED") {
      const instances = await this.db.query(`
        SELECT DISTINCT bi.id FROM bot_instances bi
        JOIN license_slots ls ON ls.id=bi.slot_id
        WHERE ls.assigned_user_id=$1 OR ls.owner_user_id=$1
      `, [id]);
      for (const item of instances.rows) {
        await this.db.query("UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1", [item.id]);
        await this.db.query("INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')", [item.id]);
      }
    }
    await this.audit(session, status === "ACTIVE" ? "REACTIVATE_USER" : "SUSPEND_USER", "user", id, {});
    return this.account(id);
  }
}

@Controller("owner-mobile")
export class OwnerManagementController {
  constructor(
    private readonly ownerMobile: OwnerMobileService,
    private readonly management: OwnerManagementService,
    private readonly promotions: PromotionService
  ) {}

  private async secured(req: any) {
    return this.ownerMobile.session(req);
  }

  private async confirmed(req: any, pin: unknown) {
    const session = await this.ownerMobile.session(req);
    await this.ownerMobile.verifyPin(session, String(pin || ""));
    return session;
  }

  @Get("packages")
  async packages(@Req() req: any) {
    await this.secured(req);
    return this.management.packages();
  }

  @Post("packages")
  async savePackage(@Req() req: any, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.savePackage(session, body || {});
  }

  @Get("promotions")
  async promotionList(@Req() req: any) {
    await this.secured(req);
    return { items: await this.promotions.list() };
  }

  @Post("promotions/generate-code")
  async generatePromotion(@Req() req: any) {
    await this.secured(req);
    return { code: await this.promotions.generateUniqueCode() };
  }

  @Post("promotions")
  async createPromotion(@Req() req: any, @Body() body: PromotionInput & { pin?: string }) {
    const session = await this.confirmed(req, body?.pin);
    return this.promotions.create(String(session.owner_user_id), body || {});
  }

  @Post("promotions/:id")
  async updatePromotion(@Req() req: any, @Param("id") id: string, @Body() body: PromotionInput & { pin?: string }) {
    const session = await this.confirmed(req, body?.pin);
    return this.promotions.update(String(session.owner_user_id), id, body || {});
  }

  @Get("accounts")
  async accounts(@Req() req: any, @Query("q") q = "") {
    await this.secured(req);
    return this.management.searchAccounts(q);
  }

  @Get("accounts/:id")
  async account(@Req() req: any, @Param("id") id: string) {
    await this.secured(req);
    return this.management.account(id);
  }

  @Post("accounts/:id/access")
  async grantAccess(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.grantAccess(session, id, body || {});
  }

  @Post("accounts/:id/extend")
  async extendAccess(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.extendAccess(session, id, body || {});
  }

  @Post("accounts/:id/status")
  async accountStatus(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    const status = String(body?.status || "").toUpperCase();
    if (status !== "ACTIVE" && status !== "SUSPENDED") throw new BadRequestException("สถานะไม่ถูกต้อง");
    return this.management.setStatus(session, id, status);
  }
}
