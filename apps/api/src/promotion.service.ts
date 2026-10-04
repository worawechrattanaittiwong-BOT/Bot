import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PoolClient } from "pg";
import { DbService } from "./db.service";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PACKAGE_MONTHS = [1, 3, 6, 12];

export type PromotionInput = {
  code?: string;
  discountPercent?: number;
  usageLimit?: number;
  perUserLimit?: number;
  startsAt?: string;
  endsAt?: string;
  active?: boolean;
  appliesToAllPackages?: boolean;
  packages?: Array<{ mode?: string; months?: number }>;
};

@Injectable()
export class PromotionService {
  constructor(private readonly db: DbService) {}

  normalizeCode(input: unknown) {
    return String(input || "").trim().toUpperCase();
  }

  private randomBlock() {
    const bytes = randomBytes(4);
    let out = "";
    for (const value of bytes) out += CODE_CHARS[value % CODE_CHARS.length];
    return out;
  }

  async generateUniqueCode() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = "SNV-" + this.randomBlock() + "-" + this.randomBlock();
      const exists = await this.db.one("SELECT id FROM promotion_codes WHERE code=$1", [code]);
      if (!exists) return code;
    }
    throw new ConflictException("ไม่สามารถสร้างรหัสโปรโมชั่นใหม่ได้ กรุณาลองอีกครั้ง");
  }

  private parseInput(input: PromotionInput) {
    const code = this.normalizeCode(input.code);
    const discountPercent = Math.trunc(Number(input.discountPercent));
    const usageLimit = Math.trunc(Number(input.usageLimit));
    const perUserLimit = Math.trunc(Number(input.perUserLimit || 1));
    const startsAt = new Date(String(input.startsAt || ""));
    const endsAt = new Date(String(input.endsAt || ""));
    const appliesToAllPackages = input.appliesToAllPackages !== false;
    if (!/^SNV-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) {
      throw new BadRequestException("รหัสโปรโมชั่นต้องเป็นรูปแบบ SNV-XXXX-XXXX");
    }
    if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      throw new BadRequestException("ส่วนลดต้องอยู่ระหว่าง 0-100%");
    }
    if (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > 1_000_000) {
      throw new BadRequestException("จำนวนการใช้ไม่ถูกต้อง");
    }
    if (!Number.isInteger(perUserLimit) || perUserLimit < 1 || perUserLimit > 1000) {
      throw new BadRequestException("จำนวนครั้งต่อบัญชีไม่ถูกต้อง");
    }
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException("ช่วงเวลาโปรโมชั่นไม่ถูกต้อง");
    }
    const packages = appliesToAllPackages ? [] : (input.packages || []).map(item => ({
      mode: String(item.mode || "").toUpperCase(),
      months: Math.trunc(Number(item.months || 0))
    }));
    if (!appliesToAllPackages && (!packages.length || packages.some(item =>
      !["LOCAL", "CLOUD"].includes(item.mode) || !PACKAGE_MONTHS.includes(item.months)
    ))) {
      throw new BadRequestException("กรุณาเลือกแพ็กเกจที่ใช้โปรโมชั่นอย่างน้อย 1 รายการ");
    }
    return {
      code, discountPercent, usageLimit, perUserLimit, startsAt, endsAt,
      appliesToAllPackages, packages, active: input.active !== false
    };
  }

  async list() {
    await this.releaseExpiredReservations();
    return (await this.db.query(`
      SELECT p.*,
        COALESCE((SELECT count(*) FROM promotion_redemptions r WHERE r.promotion_id=p.id AND r.status='USED'),0)::int used_count,
        COALESCE((SELECT count(*) FROM promotion_redemptions r WHERE r.promotion_id=p.id AND r.status='RESERVED'),0)::int reserved_count,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('mode',x.mode,'months',x.months) ORDER BY x.mode,x.months)
          FROM promotion_package_rules x WHERE x.promotion_id=p.id),'[]'::jsonb) packages
      FROM promotion_codes p
      ORDER BY p.created_at DESC
    `)).rows;
  }

  async create(ownerUserId: string, input: PromotionInput) {
    const parsed = this.parseInput(input);
    return this.db.transaction(async tx => {
      const row = (await tx.query(`
        INSERT INTO promotion_codes(
          code,discount_percent,usage_limit,per_user_limit,starts_at,ends_at,
          applies_to_all_packages,active,created_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `, [
        parsed.code, parsed.discountPercent, parsed.usageLimit, parsed.perUserLimit,
        parsed.startsAt, parsed.endsAt, parsed.appliesToAllPackages, parsed.active, ownerUserId
      ])).rows[0];
      for (const item of parsed.packages) {
        await tx.query(
          "INSERT INTO promotion_package_rules(promotion_id,mode,months) VALUES($1,$2,$3)",
          [row.id, item.mode, item.months]
        );
      }
      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'CREATE_PROMOTION','promotion',$2,$3::jsonb)",
        ["OWNER-MOBILE:" + ownerUserId, row.id, JSON.stringify({ code: parsed.code, discountPercent: parsed.discountPercent })]
      );
      return row;
    });
  }

  async update(ownerUserId: string, id: string, input: PromotionInput) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException("Promotion ID ไม่ถูกต้อง");
    const parsed = this.parseInput(input);
    return this.db.transaction(async tx => {
      const existing = (await tx.query("SELECT * FROM promotion_codes WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!existing) throw new BadRequestException("ไม่พบโปรโมชั่น");
      if (parsed.code !== existing.code) {
        throw new ConflictException("รหัสโปรโมชั่นที่บันทึกแล้วไม่สามารถเปลี่ยนได้");
      }
      const row = (await tx.query(`
        UPDATE promotion_codes SET
          discount_percent=$2,usage_limit=$3,per_user_limit=$4,starts_at=$5,ends_at=$6,
          applies_to_all_packages=$7,active=$8,updated_at=now()
        WHERE id=$1 RETURNING *
      `, [
        id, parsed.discountPercent, parsed.usageLimit, parsed.perUserLimit,
        parsed.startsAt, parsed.endsAt, parsed.appliesToAllPackages, parsed.active
      ])).rows[0];
      await tx.query("DELETE FROM promotion_package_rules WHERE promotion_id=$1", [id]);
      for (const item of parsed.packages) {
        await tx.query(
          "INSERT INTO promotion_package_rules(promotion_id,mode,months) VALUES($1,$2,$3)",
          [id, item.mode, item.months]
        );
      }
      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'UPDATE_PROMOTION','promotion',$2,$3::jsonb)",
        ["OWNER-MOBILE:" + ownerUserId, id, JSON.stringify({ active: parsed.active, discountPercent: parsed.discountPercent })]
      );
      return row;
    });
  }

  async releaseExpiredReservations() {
    await this.db.query(`
      UPDATE promotion_redemptions
      SET status='RELEASED'
      WHERE status='RESERVED' AND order_id IS NULL
        AND reserved_until IS NOT NULL AND reserved_until<=now()
    `);
  }

  async preview(input: {
    code?: string;
    userId: string;
    mode: "LOCAL" | "CLOUD";
    months: number;
    originalAmountSatang: number;
  }) {
    const code = this.normalizeCode(input.code);
    if (!/^SNV-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) {
      throw new BadRequestException("รูปแบบรหัสโปรโมชั่นไม่ถูกต้อง");
    }
    await this.releaseExpiredReservations();
    const promo = await this.db.one(
      "SELECT * FROM promotion_codes WHERE code=$1",
      [code]
    );
    if (!promo || !promo.active) throw new ConflictException("รหัสโปรโมชั่นไม่พร้อมใช้งาน");

    const now = Date.now();
    if (new Date(promo.starts_at).getTime() > now) {
      throw new ConflictException("โปรโมชั่นนี้ยังไม่ถึงเวลาเริ่มใช้");
    }
    if (new Date(promo.ends_at).getTime() <= now) {
      throw new ConflictException("โปรโมชั่นนี้หมดอายุแล้ว");
    }

    if (!promo.applies_to_all_packages) {
      const rule = await this.db.one(
        "SELECT 1 FROM promotion_package_rules WHERE promotion_id=$1 AND mode=$2 AND months=$3",
        [promo.id, input.mode, input.months]
      );
      if (!rule) throw new ConflictException("โปรโมชั่นนี้ใช้กับแพ็กเกจที่เลือกไม่ได้");
    }

    const usage = await this.db.one(`
      SELECT
        count(*) FILTER (WHERE status='USED')::int used,
        count(*) FILTER (WHERE status='RESERVED')::int reserved
      FROM promotion_redemptions
      WHERE promotion_id=$1
    `, [promo.id]);
    if (Number(usage?.used || 0) + Number(usage?.reserved || 0) >= Number(promo.usage_limit)) {
      throw new ConflictException("สิทธิ์โปรโมชั่นถูกใช้ครบแล้ว");
    }

    const userUsage = await this.db.one(`
      SELECT
        count(*) FILTER (WHERE status='USED')::int used,
        count(*) FILTER (WHERE status='RESERVED')::int reserved
      FROM promotion_redemptions
      WHERE promotion_id=$1 AND user_id=$2
    `, [promo.id, input.userId]);
    if (Number(userUsage?.used || 0) + Number(userUsage?.reserved || 0) >= Number(promo.per_user_limit)) {
      throw new ConflictException("บัญชีนี้ใช้โปรโมชั่นครบจำนวนที่กำหนดแล้ว");
    }

    const originalAmountSatang = Math.max(0, Math.trunc(Number(input.originalAmountSatang || 0)));
    const discountPercent = Number(promo.discount_percent || 0);
    const discountAmountSatang = Math.floor(originalAmountSatang * discountPercent / 100);
    const finalAmountSatang = Math.max(0, originalAmountSatang - discountAmountSatang);

    return {
      code: promo.code,
      active: true,
      discountPercent,
      discountAmountSatang,
      finalAmountSatang
    };
  }

  async reserve(
    tx: PoolClient,
    input: { code?: string; userId: string; mode: "LOCAL" | "CLOUD"; months: number; originalAmountSatang: number }
  ) {
    const code = this.normalizeCode(input.code);
    if (!code) {
      return {
        promotionId: null, redemptionId: null, code: null,
        discountPercent: 0, discountAmountSatang: 0,
        finalAmountSatang: input.originalAmountSatang
      };
    }
    if (!/^SNV-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) {
      throw new BadRequestException("รูปแบบรหัสโปรโมชั่นไม่ถูกต้อง");
    }
    await tx.query(`
      UPDATE promotion_redemptions SET status='RELEASED'
      WHERE status='RESERVED' AND order_id IS NULL
        AND reserved_until IS NOT NULL AND reserved_until<=now()
    `);
    const promo = (await tx.query("SELECT * FROM promotion_codes WHERE code=$1 FOR UPDATE", [code])).rows[0];
    if (!promo || !promo.active) throw new ConflictException("รหัสโปรโมชั่นไม่พร้อมใช้งาน");
    const now = Date.now();
    if (new Date(promo.starts_at).getTime() > now) throw new ConflictException("โปรโมชั่นนี้ยังไม่ถึงเวลาเริ่มใช้");
    if (new Date(promo.ends_at).getTime() <= now) throw new ConflictException("โปรโมชั่นนี้หมดอายุแล้ว");

    if (!promo.applies_to_all_packages) {
      const rule = (await tx.query(
        "SELECT 1 FROM promotion_package_rules WHERE promotion_id=$1 AND mode=$2 AND months=$3",
        [promo.id, input.mode, input.months]
      )).rows[0];
      if (!rule) throw new ConflictException("โปรโมชั่นนี้ใช้กับแพ็กเกจที่เลือกไม่ได้");
    }

    const usage = (await tx.query(`
      SELECT
        count(*) FILTER (WHERE status='USED')::int used,
        count(*) FILTER (WHERE status='RESERVED')::int reserved
      FROM promotion_redemptions WHERE promotion_id=$1
    `, [promo.id])).rows[0];
    if (Number(usage.used || 0) + Number(usage.reserved || 0) >= Number(promo.usage_limit)) {
      throw new ConflictException("สิทธิ์โปรโมชั่นถูกใช้ครบแล้ว");
    }
    const userUsage = (await tx.query(`
      SELECT
        count(*) FILTER (WHERE status='USED')::int used,
        count(*) FILTER (WHERE status='RESERVED')::int reserved
      FROM promotion_redemptions WHERE promotion_id=$1 AND user_id=$2
    `, [promo.id, input.userId])).rows[0];
    if (Number(userUsage.used || 0) + Number(userUsage.reserved || 0) >= Number(promo.per_user_limit)) {
      throw new ConflictException("บัญชีนี้ใช้โปรโมชั่นครบจำนวนที่กำหนดแล้ว");
    }

    const discountAmountSatang = Math.floor(
      input.originalAmountSatang * Number(promo.discount_percent) / 100
    );
    const finalAmountSatang = Math.max(0, input.originalAmountSatang - discountAmountSatang);
    const redemption = (await tx.query(`
      INSERT INTO promotion_redemptions(
        promotion_id,user_id,purchase_type,months,original_amount_satang,
        discount_amount_satang,final_amount_satang,status,reserved_until
      ) VALUES($1,$2,$3,$4,$5,$6,$7,'RESERVED',now()+interval '15 minutes')
      RETURNING id
    `, [
      promo.id, input.userId, input.mode, input.months, input.originalAmountSatang,
      discountAmountSatang, finalAmountSatang
    ])).rows[0];

    return {
      promotionId: promo.id,
      redemptionId: redemption.id,
      code: promo.code,
      discountPercent: Number(promo.discount_percent),
      discountAmountSatang,
      finalAmountSatang
    };
  }

  async attachOrder(tx: PoolClient, redemptionId: string | null, orderId: string) {
    if (!redemptionId) return;
    await tx.query(
      "UPDATE promotion_redemptions SET order_id=$2 WHERE id=$1 AND status='RESERVED'",
      [redemptionId, orderId]
    );
  }

  async releaseReservation(tx: PoolClient, redemptionId: string | null) {
    if (!redemptionId) return;
    await tx.query(
      "UPDATE promotion_redemptions SET status='RELEASED',reserved_until=NULL WHERE id=$1 AND status='RESERVED'",
      [redemptionId]
    );
  }

  async consume(tx: PoolClient, type: "LOCAL" | "CLOUD", orderId: string) {
    await tx.query(`
      UPDATE promotion_redemptions
      SET status='USED',used_at=now(),reserved_until=NULL
      WHERE purchase_type=$1 AND order_id=$2 AND status='RESERVED'
    `, [type, orderId]);
  }

  async release(tx: PoolClient, type: "LOCAL" | "CLOUD", orderId: string) {
    await tx.query(`
      UPDATE promotion_redemptions
      SET status='RELEASED',reserved_until=NULL
      WHERE purchase_type=$1 AND order_id=$2 AND status='RESERVED'
    `, [type, orderId]);
  }
}
