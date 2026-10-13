import { BadRequestException, Body, ConflictException, Controller, Get, Post, Query, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";

const BULK_QUANTITIES = [5,10,20];
const BULK_MONTHS = [1,3,6,12];
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const totalCents = (unit: number, quantity: number, percent: number) =>
  Math.round(unit * quantity * (100 - percent) / 100);

@Controller("cloud-bulk")
@UseGuards(JwtGuard)
export class CloudBulkController {
  constructor(private readonly db: DbService) {}

  private async ownerId(userId: string) {
    const actor = await this.db.one("SELECT id,role,status FROM users WHERE id=$1",[userId]);
    if (!actor || actor.status !== "ACTIVE" || String(actor.role).toUpperCase() !== "OWNER") {
      throw new UnauthorizedException("เฉพาะ Owner ที่จัดการแพ็กหลาย VPS Slot ได้");
    }
    return String(actor.id);
  }

  @Get("catalog")
  async catalog() {
    const [packages, tiers] = await Promise.all([
      this.db.query("SELECT months,price_usd_cents,enabled FROM cloud_addon_packages ORDER BY months"),
      this.db.query("SELECT quantity,discount_percent FROM cloud_bulk_discount_tiers ORDER BY quantity")
    ]);
    return {
      packages: packages.rows.map((p:any) => ({ months:Number(p.months),priceUsdCents:Number(p.price_usd_cents),enabled:Boolean(p.enabled) })),
      tiers: tiers.rows.map((t:any) => ({quantity:Number(t.quantity),discountPercent:Number(t.discount_percent)})),
      manualOnly:true
    };
  }

  @Post("owner/discounts")
  async saveDiscounts(@Req() req: any, @Body() body: {tiers?: Array<{quantity:number;discountPercent:number}>}) {
    const actorId = await this.ownerId(String(req.user.sub));
    const tiers = body?.tiers;
    if (!Array.isArray(tiers) || tiers.length !== 3 ||
        tiers.map(t=>Number(t.quantity)).sort((a,b)=>a-b).join(",") !== "5,10,20") {
      throw new BadRequestException("ต้องกำหนดส่วนลดสำหรับ 5, 10 และ 20 Slot ครบเท่านั้น");
    }
    for (const tier of tiers) {
      if (typeof tier.discountPercent !== "number" || !Number.isFinite(tier.discountPercent) ||
          tier.discountPercent < 0 || tier.discountPercent > 90 ||
          Math.abs(Math.round(tier.discountPercent * 100) - tier.discountPercent * 100) > 1e-7) {
        throw new BadRequestException("ส่วนลดต้องอยู่ระหว่าง 0–90% และทศนิยมไม่เกิน 2 ตำแหน่ง");
      }
    }
    const ordered = [...tiers].sort((a,b)=>a.quantity-b.quantity);
    if (ordered.some((tier,i)=>i>0 && tier.discountPercent<ordered[i-1].discountPercent)) {
      throw new BadRequestException("แพ็กที่จำนวนมากกว่าต้องมีส่วนลดไม่น้อยกว่าแพ็กเล็ก");
    }
    await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      for (const tier of ordered) {
        await tx.query("UPDATE cloud_bulk_discount_tiers SET discount_percent=$2,updated_at=now() WHERE quantity=$1",[tier.quantity,tier.discountPercent]);
      }
      await tx.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'OWNER_BULK_SLOT_DISCOUNT_UPDATED','cloud_bulk_discount_tiers',$2,$3::jsonb)",
        [actorId,actorId,JSON.stringify({tiers:ordered})]);
    });
    return {ok:true};
  }

  @Get("owner/customer")
  async customer(@Req() req: any, @Query("userCode") userCode = "") {
    await this.ownerId(String(req.user.sub));
    const code = String(userCode || "").trim();
    if (!code || code.length > 100) throw new BadRequestException("กรุณาระบุ User ID ของลูกค้า");
    const customer = await this.db.one(`
      SELECT u.id,u.user_code,u.email,u.status,
        EXISTS(SELECT 1 FROM license_slots ls JOIN subscriptions s ON s.id=ls.subscription_id
          WHERE ls.owner_user_id=u.id AND ls.assigned_user_id=u.id AND ls.mode='CLOUD'
            AND ls.slot_type='PERSONAL' AND ls.status<>'DELETED'
            AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now()) primary_active
      FROM users u WHERE lower(u.user_code)=lower($1) AND u.role NOT IN ('OWNER','ADMIN')`,[code]);
    if (!customer) throw new BadRequestException("ไม่พบ User ID ลูกค้าที่ระบุ");
    return {userCode:customer.user_code,status:customer.status,email:customer.email,primaryActive:customer.primary_active};
  }

  @Post("owner/grant")
  async grant(@Req() req: any, @Body() body: {
    userCode?:string;quantity?:number;months?:number;requestId?:string;paymentConfirmed?:boolean
  }) {
    const actorId = await this.ownerId(String(req.user.sub));
    const userCode = String(body?.userCode || "").trim();
    const quantity = Number(body?.quantity);
    const months = Number(body?.months);
    const requestId = String(body?.requestId || "");
    if (!userCode || userCode.length > 100 || !BULK_QUANTITIES.includes(quantity) || !BULK_MONTHS.includes(months) || !isUuid(requestId)) {
      throw new BadRequestException("ลูกค้า จำนวน Slot ระยะเวลา หรือรหัสรายการไม่ถูกต้อง");
    }
    if (body?.paymentConfirmed !== true) throw new BadRequestException("Owner ต้องยืนยันว่าได้รับชำระเงินนอกระบบก่อน");
    return this.db.transaction(async tx => {
      // Serialize grants with Cloud checkouts and prevent duplicated retries.
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      const previous = (await tx.query("SELECT g.*,u.user_code FROM cloud_bulk_grants g JOIN users u ON u.id=g.customer_user_id WHERE g.request_id=$1",[requestId])).rows[0];
      if (previous) {
        if (previous.owner_user_id !== actorId || previous.user_code.toLowerCase() !== userCode.toLowerCase() || Number(previous.quantity)!==quantity || Number(previous.months)!==months) {
          throw new ConflictException("รหัสรายการนี้ถูกใช้กับการเพิ่ม Slot อื่นแล้ว");
        }
        return {ok:true,replayed:true,quantity:Number(previous.quantity),userCode:previous.user_code,grantId:previous.id};
      }
      const customer = (await tx.query("SELECT id,user_code,status,role FROM users WHERE lower(user_code)=lower($1) FOR UPDATE",[userCode])).rows[0];
      if (!customer || customer.status!=="ACTIVE" || ["OWNER","ADMIN"].includes(String(customer.role).toUpperCase())) {
        throw new ConflictException("ไม่พบลูกค้าที่สถานะ ACTIVE");
      }
      const controls = (await tx.query("SELECT cloud_provisioning_paused,sales_paused FROM production_controls WHERE id=1",[])).rows[0];
      if (controls?.cloud_provisioning_paused || controls?.sales_paused) {
        throw new ConflictException("ขณะนี้ระบบปิดรับการเพิ่ม VPS Slot ชั่วคราว");
      }
      const primary = (await tx.query(`SELECT 1 FROM license_slots ls JOIN subscriptions s ON s.id=ls.subscription_id
        WHERE ls.owner_user_id=$1 AND ls.assigned_user_id=$1 AND ls.mode='CLOUD' AND ls.slot_type='PERSONAL'
          AND ls.status<>'DELETED' AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() LIMIT 1`,[customer.id])).rows[0];
      if (!primary) throw new ConflictException("ลูกค้าต้องมีแพ็กเกจหลัก VPS Slot #1 ที่ยังไม่หมดอายุ");
      const partner = (await tx.query("SELECT id FROM partner_customers WHERE customer_user_id=$1 AND status='ACTIVE' LIMIT 1",[customer.id])).rows[0];
      if (partner) throw new ConflictException("ลูกค้าภายใต้ Partner ต้องจัดการสิทธิ์ผ่านระบบ Partner");
      const pack = (await tx.query("SELECT price_usd_cents FROM cloud_addon_packages WHERE months=$1 AND enabled=true AND price_usd_cents>0",[months])).rows[0];
      if (!pack) throw new ConflictException("ไม่มีราคา Slot เสริมสำหรับระยะเวลานี้");
      const tier = (await tx.query("SELECT discount_percent FROM cloud_bulk_discount_tiers WHERE quantity=$1",[quantity])).rows[0];
      if (!tier) throw new ConflictException("ไม่มีระดับส่วนลดสำหรับจำนวนที่เลือก");
      const capacity = (await tx.query(`SELECT COALESCE(SUM(GREATEST(0,w.capacity-GREATEST(l.occupied,w.active_instances))),0)::int AS available
        FROM worker_nodes w JOIN cloud_node_load l USING(runner_id)
        WHERE w.accepting_jobs AND w.last_seen_at>now()-interval '30 seconds'
          AND w.telemetry->>'templateReady'='true' AND NOT w.capacity_blocked AND NOT w.quarantined`,[])).rows[0];
      const reserved = (await tx.query(`SELECT count(*)::int AS count FROM cloud_bulk_grant_slots bgs
        JOIN license_slots ls ON ls.id=bgs.slot_id JOIN subscriptions s ON s.id=ls.subscription_id
        LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
        WHERE ls.status<>'DELETED' AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now()
          AND bi.runner_id IS NULL`,[])).rows[0];
      const available = Math.max(0,Number(capacity?.available || 0)-Number(reserved?.count || 0));
      if (available < quantity) throw new ConflictException(`VPS พร้อมรับเพิ่ม ${available} Slot ไม่พอสำหรับแพ็ก ${quantity} Slot กรุณาเพิ่มความจุ VPS ก่อน`);
      const plan = (await tx.query("SELECT id FROM plans WHERE code=$1",[`CLOUD_${months}M`])).rows[0];
      if (!plan) throw new ConflictException("ไม่พบสิทธิ์ใช้งาน Cloud สำหรับระยะเวลานี้");
      const unitPrice = Number(pack.price_usd_cents);
      const discountPercent = Number(tier.discount_percent);
      const granted = (await tx.query(`INSERT INTO cloud_bulk_grants(request_id,owner_user_id,customer_user_id,quantity,months,unit_price_usd_cents,discount_percent,total_price_usd_cents)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[requestId,actorId,customer.id,quantity,months,unitPrice,discountPercent,totalCents(unitPrice,quantity,discountPercent)])).rows[0];
      const maxRow = (await tx.query("SELECT COALESCE(MAX(slot_number),0)::int AS max FROM license_slots WHERE owner_user_id=$1 AND mode='CLOUD' AND status<>'DELETED'",[customer.id])).rows[0];
      const slotNumbers: number[] = [];
      for (let i=0;i<quantity;i++) {
        const subscription = (await tx.query(`INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
          VALUES($1,$2,now(),now()+make_interval(months=>$3::int),'OWNER_BULK',$4) RETURNING id`,
          [customer.id,plan.id,months,`Manual bulk grant ${granted.id}`])).rows[0];
        const number = Number(maxRow.max)+i+1;
        const slot = (await tx.query(`INSERT INTO license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label)
          VALUES($1,$1,$2,'CLOUD',$3,'ADDON','ACTIVE','Cloud Trading') RETURNING id`,[customer.id,subscription.id,number])).rows[0];
        await tx.query("INSERT INTO cloud_bulk_grant_slots(grant_id,slot_id) VALUES($1,$2)",[granted.id,slot.id]);
        slotNumbers.push(number);
      }
      await tx.query("INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'OWNER_BULK_SLOT_GRANTED','cloud_bulk_grants',$2,$3::jsonb)",
        [actorId,granted.id,JSON.stringify({customerUserCode:customer.user_code,quantity,months,slotNumbers,unitPriceUsdCents:unitPrice,discountPercent,manualPaymentConfirmed:true})]);
      return {ok:true,replayed:false,quantity,months,userCode:customer.user_code,slotNumbers,grantId:granted.id};
    });
  }
}
