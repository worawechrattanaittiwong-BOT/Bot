import { ConflictException, Injectable } from "@nestjs/common";
import { PoolClient } from "pg";
import { DbService } from "./db.service";

@Injectable()
export class PartnerService {
  constructor(private readonly db: DbService) {}

  private int(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private async refreshLifecycle(q: any = this.db) {
    await q.query(
      `UPDATE partner_customers
       SET status='EXPIRED',updated_at=now()
       WHERE status='ACTIVE' AND expires_at<=now()`
    );
    await q.query(
      `UPDATE partner_accounts
       SET status='EXPIRED',updated_at=now()
       WHERE status IN ('READY','ACTIVE')
         AND (
           (activated_at IS NULL AND activation_deadline_at<=now()) OR
           (activated_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at<=now())
         )`
    );
  }

  async dashboardSummary(userId: string) {
    await this.refreshLifecycle();
    const row = await this.db.one(
      `SELECT pa.user_id,pa.status,pa.seat_limit,pa.customer_duration_days,
              pa.partner_duration_days,pa.granted_at,pa.activation_deadline_at,
              pa.activated_at,pa.expires_at,
              COUNT(pc.id) FILTER (WHERE pc.status='ACTIVE' AND pc.expires_at>now())::int AS used_seats
       FROM partner_accounts pa
       LEFT JOIN partner_customers pc ON pc.partner_user_id=pa.user_id
       WHERE pa.user_id=$1
       GROUP BY pa.user_id,pa.status,pa.seat_limit,pa.customer_duration_days,
                pa.partner_duration_days,pa.granted_at,pa.activation_deadline_at,
                pa.activated_at,pa.expires_at`,
      [userId]
    );
    if (!row) return null;
    const used = Number(row.used_seats || 0);
    return {
      ...row,
      usedSeats: used,
      availableSeats: Math.max(0, Number(row.seat_limit || 0) - used),
      canManage: row.status === "ACTIVE",
      ownTradingIncluded: true
    };
  }

  async summary(userId: string) {
    const account = await this.dashboardSummary(userId);
    if (!account) throw new ConflictException("บัญชีนี้ยังไม่ได้รับสิทธิ์ Partner");
    const customers = await this.db.query(
      `SELECT pc.id,pc.customer_user_id,pc.subscription_id,pc.status,
              pc.starts_at,pc.expires_at,pc.created_at,pc.updated_at,
              u.user_code,u.email,
              s.status AS subscription_status,
              p.code AS plan_code
       FROM partner_customers pc
       JOIN users u ON u.id=pc.customer_user_id
       JOIN subscriptions s ON s.id=pc.subscription_id
       JOIN plans p ON p.id=s.plan_id
       WHERE pc.partner_user_id=$1
       ORDER BY
         CASE pc.status WHEN 'ACTIVE' THEN 0 WHEN 'DIRECT' THEN 1 ELSE 2 END,
         pc.expires_at DESC,pc.created_at DESC`,
      [userId]
    );
    return { account, customers: customers.rows };
  }

  async grantPartner(input: {
    userId: string;
    seatLimit?: number;
    partnerDurationDays?: number;
    customerDurationDays?: number;
  }, actor: string) {
    const seatLimit = this.int(input.seatLimit, 10, 1, 500);
    if (![10, 25, 50].includes(seatLimit)) {
      throw new ConflictException("จำนวน Customer Seats ของ Partner ต้องเป็น 10, 25 หรือ 50 เท่านั้น");
    }
    const partnerDurationDays = this.int(input.partnerDurationDays, 30, 1, 3660);
    const customerDurationDays = this.int(input.customerDurationDays, 30, 1, 3660);

    await this.db.transaction(async tx => {
      await this.refreshLifecycle(tx);
      const user = (await tx.query(
        "SELECT id,user_code,email,role,status FROM users WHERE id=$1 FOR UPDATE",
        [input.userId]
      )).rows[0];
      if (!user || user.status !== "ACTIVE") throw new ConflictException("ไม่พบบัญชี SCENOVA ที่ Active");
      if (user.role === "OWNER" || user.role === "ADMIN") {
        throw new ConflictException("OWNER/ADMIN ไม่ต้องใช้สิทธิ์ Partner");
      }

      const existing = (await tx.query(
        "SELECT * FROM partner_accounts WHERE user_id=$1 FOR UPDATE",
        [user.id]
      )).rows[0];
      const activeCustomerCount = Number((await tx.query(
        `SELECT COUNT(*)::int AS count FROM partner_customers
         WHERE partner_user_id=$1 AND status='ACTIVE' AND expires_at>now()`,
        [user.id]
      )).rows[0]?.count || 0);

      if (existing && existing.status === "ACTIVE" && existing.expires_at && new Date(existing.expires_at) > new Date()) {
        await tx.query(
          `UPDATE partner_accounts
           SET seat_limit=$2,customer_duration_days=$3,partner_duration_days=$4,updated_at=now()
           WHERE user_id=$1`,
          [user.id, seatLimit, customerDurationDays, partnerDurationDays]
        );
      } else {
        await tx.query(
          `INSERT INTO partner_accounts(
             user_id,status,seat_limit,customer_duration_days,partner_duration_days,
             granted_at,activation_deadline_at,activated_at,expires_at,created_by,updated_at
           ) VALUES($1,'ACTIVE',$2,$3,$4,now(),now()+make_interval(days => $4),now(),now()+make_interval(days => $4),$5,now())
           ON CONFLICT(user_id) DO UPDATE SET
             status='ACTIVE',seat_limit=EXCLUDED.seat_limit,
             customer_duration_days=EXCLUDED.customer_duration_days,
             partner_duration_days=EXCLUDED.partner_duration_days,
             granted_at=now(),activation_deadline_at=EXCLUDED.activation_deadline_at,
             activated_at=now(),expires_at=EXCLUDED.expires_at,created_by=EXCLUDED.created_by,updated_at=now()`,
          [user.id, seatLimit, customerDurationDays, partnerDurationDays, actor.slice(0, 120)]
        );
      }

      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'GRANT_PARTNER','user',$2,$3::jsonb)",
        [actor, user.id, JSON.stringify({ seatLimit, partnerDurationDays, customerDurationDays, activeCustomerCount, overCapacity: activeCustomerCount > seatLimit, startsImmediately: true, ownTradingIncluded: true })]
      );
    });

    return this.summary(input.userId);
  }

  async renewPartner(userId: string, durationDays: number, actor: string) {
    const days = this.int(durationDays, 30, 1, 3660);
    await this.db.transaction(async tx => {
      await this.refreshLifecycle(tx);
      const partner = (await tx.query(
        "SELECT * FROM partner_accounts WHERE user_id=$1 FOR UPDATE",
        [userId]
      )).rows[0];
      if (!partner) throw new ConflictException("บัญชีนี้ยังไม่ได้รับสิทธิ์ Partner");

      await tx.query(
        `UPDATE partner_accounts
         SET status='ACTIVE',partner_duration_days=$2,
             activated_at=CASE WHEN status='ACTIVE' AND expires_at>now() THEN COALESCE(activated_at,now()) ELSE now() END,
             expires_at=GREATEST(COALESCE(expires_at,now()),now())+make_interval(days => $2),
             activation_deadline_at=GREATEST(COALESCE(expires_at,now()),now())+make_interval(days => $2),
             updated_at=now()
         WHERE user_id=$1`,
        [userId, days]
      );

      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'RENEW_PARTNER','user',$2,$3::jsonb)",
        [actor, userId, JSON.stringify({ durationDays: days })]
      );
    });
    return this.summary(userId);
  }

  async suspendPartner(userId: string, actor: string) {
    const row = await this.db.one(
      `UPDATE partner_accounts SET status='SUSPENDED',updated_at=now()
       WHERE user_id=$1 RETURNING user_id`,
      [userId]
    );
    if (!row) throw new ConflictException("บัญชีนี้ยังไม่ได้รับสิทธิ์ Partner");
    const ownInstance = await this.db.one(
      `SELECT bi.id
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.owner_user_id=$1 AND ls.assigned_user_id=$1 AND ls.mode='LOCAL' AND ls.status<>'DELETED'
       ORDER BY ls.slot_number,ls.id LIMIT 1`,
      [userId]
    );
    if (ownInstance?.id) {
      await this.db.query("UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1", [ownInstance.id]);
      await this.db.query("INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')", [ownInstance.id]);
    }
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'SUSPEND_PARTNER','user',$2,$3::jsonb)",
      [actor, userId, JSON.stringify({ existingCustomersKeepTheirOwnExpiry: true, ownTradingSafeStopped: Boolean(ownInstance?.id) })]
    );
    return this.summary(userId);
  }

  private async requireManageablePartner(tx: PoolClient, userId: string) {
    await this.refreshLifecycle(tx);
    const partner = (await tx.query(
      "SELECT * FROM partner_accounts WHERE user_id=$1 FOR UPDATE",
      [userId]
    )).rows[0];
    if (!partner) throw new ConflictException("บัญชีนี้ยังไม่ได้รับสิทธิ์ Partner");
    if (partner.status !== "ACTIVE" || !partner.expires_at || new Date(partner.expires_at) <= new Date()) {
      throw new ConflictException("สิทธิ์ Partner ไม่ Active กรุณาติดต่อ Owner เพื่อต่ออายุ");
    }
    return partner;
  }

  async ownTradingEntitlement(userId: string, slotId: string | null, mode: string | null) {
    if (mode && mode !== "LOCAL") return null;
    await this.refreshLifecycle();
    const row = await this.db.one(
      `SELECT pa.expires_at,pa.seat_limit
       FROM partner_accounts pa
       JOIN license_slots ls ON ls.id=$2
       WHERE pa.user_id=$1
         AND pa.status='ACTIVE'
         AND pa.expires_at>now()
         AND ls.owner_user_id=$1
         AND ls.assigned_user_id=$1
         AND ls.mode='LOCAL'
         AND ls.status IN ('ACTIVE','AVAILABLE')
         AND ls.id=(
           SELECT id FROM license_slots
           WHERE owner_user_id=$1 AND assigned_user_id=$1 AND mode='LOCAL' AND status<>'DELETED'
           ORDER BY slot_number,id LIMIT 1
         )
       LIMIT 1`,
      [userId, slotId]
    );
    if (!row) return null;
    return { allowed: true, source: "PARTNER", expiresAt: row.expires_at, ownTradingIncluded: true, customerSeats: Number(row.seat_limit || 0) };
  }

  private async createPartnerCustomerMembership(
    tx: PoolClient,
    partner: any,
    target: any,
    actor: string
  ) {
    const activePartner = (await tx.query(
      `SELECT pc.id,u.user_code AS partner_code
       FROM partner_customers pc
       JOIN users u ON u.id=pc.partner_user_id
       WHERE pc.customer_user_id=$1 AND pc.status='ACTIVE' AND pc.expires_at>now()
       LIMIT 1`,
      [target.id]
    )).rows[0];
    if (activePartner) {
      throw new ConflictException("ลูกค้ารายนี้มีสิทธิ์จาก Partner อยู่แล้ว");
    }

    const activeLocal = (await tx.query(
      `SELECT s.id,s.expires_at,s.activated_by,p.code
       FROM subscriptions s
       JOIN plans p ON p.id=s.plan_id
       WHERE s.user_id=$1 AND p.mode='LOCAL' AND s.status='ACTIVE'
         AND s.starts_at<=now() AND s.expires_at>now()
       ORDER BY s.expires_at DESC LIMIT 1`,
      [target.id]
    )).rows[0];
    if (activeLocal) {
      throw new ConflictException("ลูกค้ารายนี้มีสมาชิก LOCAL ที่ยังไม่หมดอายุอยู่แล้ว ไม่จำเป็นต้องใช้ Partner Seat ซ้ำ");
    }

    const used = (await tx.query(
      `SELECT COUNT(*)::int AS count
       FROM partner_customers
       WHERE partner_user_id=$1 AND status='ACTIVE' AND expires_at>now()`,
      [partner.user_id]
    )).rows[0];
    if (Number(used?.count || 0) >= Number(partner.seat_limit || 0)) {
      throw new ConflictException("Partner Seat เต็มแล้ว กรุณารอสมาชิกเดิมหมดอายุหรือให้ Owner เพิ่มจำนวน Seat");
    }

    const plan = (await tx.query(
      "SELECT * FROM plans WHERE code='LOCAL_30D' AND active=true LIMIT 1 FOR SHARE"
    )).rows[0];
    if (!plan) throw new ConflictException("ไม่พบแพ็กเกจ LOCAL_30D สำหรับลูกค้า Partner");

    const durationDays = Number(partner.customer_duration_days || 30);
    const subscription = (await tx.query(
      `INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
       VALUES($1,$2,now(),now()+make_interval(days => $3),$4,$5)
       RETURNING *`,
      [target.id, plan.id, durationDays, actor.slice(0, 120), `PARTNER_CUSTOMER:${partner.user_id}`]
    )).rows[0];

    let slot = (await tx.query(
      `SELECT * FROM license_slots
       WHERE owner_user_id=$1 AND assigned_user_id=$1 AND mode='LOCAL' AND status<>'DELETED'
       ORDER BY slot_number,created_at LIMIT 1 FOR UPDATE`,
      [target.id]
    )).rows[0];
    if (slot) {
      slot = (await tx.query(
        `UPDATE license_slots
         SET subscription_id=$2,slot_type='PERSONAL',status='ACTIVE',updated_at=now()
         WHERE id=$1 RETURNING *`,
        [slot.id, subscription.id]
      )).rows[0];
    } else {
      slot = (await tx.query(
        `INSERT INTO license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label)
         SELECT $1,$1,$2,'LOCAL',COALESCE(MAX(slot_number),0)+1,'PERSONAL','ACTIVE','Partner customer'
         FROM license_slots WHERE owner_user_id=$1 AND mode='LOCAL'
         RETURNING *`,
        [target.id, subscription.id]
      )).rows[0];
    }

    const relation = (await tx.query(
      `INSERT INTO partner_customers(
         partner_user_id,customer_user_id,subscription_id,status,starts_at,expires_at
       ) VALUES($1,$2,$3,'ACTIVE',$4,$5) RETURNING *`,
      [partner.user_id, target.id, subscription.id, subscription.starts_at, subscription.expires_at]
    )).rows[0];
    return { subscription, slot, relation };
  }

  async activateCustomer(partnerUserId: string, targetText: string, actor: string) {
    const targetValue = String(targetText || "").trim();
    if (!targetValue) throw new ConflictException("กรุณากรอก User ID หรือ Email ของลูกค้า");
    try {
      let targetId = "";
      await this.db.transaction(async tx => {
        const partner = await this.requireManageablePartner(tx, partnerUserId);
        const target = (await tx.query(
          `SELECT id,user_code,email,role,status FROM users
           WHERE status='ACTIVE' AND (upper(user_code)=upper($1) OR lower(email)=lower($1))
           LIMIT 1 FOR UPDATE`,
          [targetValue]
        )).rows[0];
        if (!target) throw new ConflictException("ไม่พบบัญชี SCENOVA ของลูกค้า");
        if (target.id === partnerUserId) throw new ConflictException("Partner Seat ใช้กับบัญชีของ Partner เองไม่ได้");
        if (target.role === "OWNER" || target.role === "ADMIN") throw new ConflictException("ไม่สามารถเปิด Partner Seat ให้ OWNER/ADMIN");
        targetId = target.id;

        const created = await this.createPartnerCustomerMembership(tx, partner, target, actor);
        await tx.query(
          "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'PARTNER_ACTIVATE_CUSTOMER','user',$2,$3::jsonb)",
          [actor, target.id, JSON.stringify({ partnerUserId, subscriptionId: created.subscription.id, expiresAt: created.subscription.expires_at })]
        );
      });
      return { ...(await this.summary(partnerUserId)), activatedCustomerId: targetId };
    } catch (error: any) {
      if (error?.code === "23505") throw new ConflictException("ลูกค้ารายนี้มี Partner Seat ที่ Active อยู่แล้ว");
      throw error;
    }
  }

  async renewCustomer(partnerUserId: string, customerUserId: string, actor: string) {
    await this.db.transaction(async tx => {
      const partner = await this.requireManageablePartner(tx, partnerUserId);
      const target = (await tx.query(
        "SELECT id,user_code,email,role,status FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
        [customerUserId]
      )).rows[0];
      if (!target) throw new ConflictException("ไม่พบบัญชีลูกค้าที่ Active");

      const current = (await tx.query(
        `SELECT pc.*,s.status AS subscription_status
         FROM partner_customers pc
         JOIN subscriptions s ON s.id=pc.subscription_id
         WHERE pc.partner_user_id=$1 AND pc.customer_user_id=$2
         ORDER BY pc.created_at DESC LIMIT 1 FOR UPDATE OF pc`,
        [partnerUserId, customerUserId]
      )).rows[0];
      if (!current || current.status === "DIRECT" || current.status === "REVOKED") {
        throw new ConflictException("ลูกค้ารายนี้ไม่ได้อยู่ภายใต้ Partner นี้แล้ว");
      }

      if (current.status === "ACTIVE" && new Date(current.expires_at) > new Date()) {
        const updated = (await tx.query(
          `UPDATE subscriptions
           SET expires_at=GREATEST(expires_at,now())+make_interval(days => $2),status='ACTIVE'
           WHERE id=$1 RETURNING *`,
          [current.subscription_id, Number(partner.customer_duration_days || 30)]
        )).rows[0];
        await tx.query(
          `UPDATE partner_customers
           SET expires_at=$2,status='ACTIVE',updated_at=now()
           WHERE id=$1`,
          [current.id, updated.expires_at]
        );
        await tx.query(
          `UPDATE license_slots SET subscription_id=$2,status='ACTIVE',updated_at=now()
           WHERE owner_user_id=$1 AND assigned_user_id=$1 AND mode='LOCAL' AND status<>'DELETED'`,
          [customerUserId, current.subscription_id]
        );
      } else {
        await this.createPartnerCustomerMembership(tx, partner, target, actor);
      }

      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'PARTNER_RENEW_CUSTOMER','user',$2,$3::jsonb)",
        [actor, customerUserId, JSON.stringify({ partnerUserId, durationDays: Number(partner.customer_duration_days || 30) })]
      );
    });
    return this.summary(partnerUserId);
  }

  async activeCustomerSource(customerUserId: string) {
    await this.refreshLifecycle();
    return this.db.one(
      `SELECT pc.*,u.user_code AS partner_user_code
       FROM partner_customers pc
       JOIN users u ON u.id=pc.partner_user_id
       WHERE pc.customer_user_id=$1 AND pc.status='ACTIVE' AND pc.expires_at>now()
       ORDER BY pc.expires_at DESC LIMIT 1`,
      [customerUserId]
    );
  }

  async detachCustomerToDirect(customerUserId: string, directSubscriptionId: string, actor: string) {
    const rows = await this.db.query(
      `UPDATE partner_customers
       SET status='DIRECT',updated_at=now()
       WHERE customer_user_id=$1 AND status='ACTIVE'
       RETURNING id,partner_user_id,expires_at`,
      [customerUserId]
    );
    for (const row of rows.rows) {
      await this.db.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'PARTNER_CUSTOMER_TO_DIRECT','partner_customer',$2,$3::jsonb)",
        [actor, row.id, JSON.stringify({ customerUserId, partnerUserId: row.partner_user_id, directSubscriptionId, previousExpiresAt: row.expires_at })]
      );
    }
    return rows.rowCount || 0;
  }
}
