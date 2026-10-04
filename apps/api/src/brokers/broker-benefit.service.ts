import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { PoolClient } from "pg";
import { DbService } from "../db.service";

export type CheckoutBrokerBenefit = {
  partnerClientId: string;
  levelCode: string;
  levelName: string;
  discountBps: number;
  discountPercent: number;
};

@Injectable()
export class BrokerBenefitService {
  private schemaReady = false;

  constructor(private readonly db: DbService) {}

  private async ensureSchema() {
    if (this.schemaReady) return;

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS broker_benefit_levels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
        code varchar(32) NOT NULL,
        name varchar(80) NOT NULL,
        discount_bps integer NOT NULL DEFAULT 0
          CHECK (discount_bps BETWEEN 0 AND 5000),
        active boolean NOT NULL DEFAULT true,
        sort_order integer NOT NULL DEFAULT 100,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(broker_id,code)
      );

      CREATE TABLE IF NOT EXISTS broker_partner_clients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(24) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','VERIFIED','NOT_LINKED','SUSPENDED')),
        benefit_level_id uuid REFERENCES broker_benefit_levels(id) ON DELETE SET NULL,
        verification_source varchar(24) NOT NULL DEFAULT 'MANUAL'
          CHECK (verification_source IN ('MANUAL','API')),
        external_client_ref varchar(180),
        note text NOT NULL DEFAULT '',
        verified_at timestamptz,
        verified_by varchar(160),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(broker_id,user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_broker_partner_clients_status
        ON broker_partner_clients(broker_id,status,updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_broker_partner_clients_user
        ON broker_partner_clients(user_id,updated_at DESC);

      CREATE TABLE IF NOT EXISTS broker_benefit_order_applications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        purchase_type varchar(16) NOT NULL
          CHECK (purchase_type IN ('LOCAL','CLOUD')),
        order_id uuid NOT NULL,
        partner_client_id uuid NOT NULL REFERENCES broker_partner_clients(id) ON DELETE RESTRICT,
        benefit_level varchar(32) NOT NULL,
        discount_bps integer NOT NULL CHECK (discount_bps BETWEEN 1 AND 5000),
        original_amount_satang integer NOT NULL CHECK (original_amount_satang>=0),
        discount_amount_satang integer NOT NULL CHECK (discount_amount_satang>=0),
        final_amount_satang integer NOT NULL CHECK (final_amount_satang>=0),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(purchase_type,order_id)
      );

      CREATE INDEX IF NOT EXISTS idx_broker_benefit_order_client
        ON broker_benefit_order_applications(partner_client_id,created_at DESC);

      INSERT INTO broker_benefit_levels(broker_id,code,name,discount_bps,sort_order)
      SELECT id,'STANDARD','Standard',1000,10 FROM brokers WHERE code='EXNESS'
      ON CONFLICT(broker_id,code) DO UPDATE SET
        name=EXCLUDED.name,
        discount_bps=EXCLUDED.discount_bps,
        sort_order=EXCLUDED.sort_order;

      INSERT INTO broker_benefit_levels(broker_id,code,name,discount_bps,sort_order)
      SELECT id,'PLUS','Plus',2000,20 FROM brokers WHERE code='EXNESS'
      ON CONFLICT(broker_id,code) DO UPDATE SET
        name=EXCLUDED.name,
        discount_bps=EXCLUDED.discount_bps,
        sort_order=EXCLUDED.sort_order;

      INSERT INTO broker_benefit_levels(broker_id,code,name,discount_bps,sort_order)
      SELECT id,'VIP','VIP',3000,30 FROM brokers WHERE code='EXNESS'
      ON CONFLICT(broker_id,code) DO UPDATE SET
        name=EXCLUDED.name,
        discount_bps=EXCLUDED.discount_bps,
        sort_order=EXCLUDED.sort_order;
    `);

    this.schemaReady = true;
  }

  async levels() {
    await this.ensureSchema();
    const result = await this.db.query(
      `SELECT l.id,l.code,l.name,l.discount_bps,l.active,l.sort_order
       FROM broker_benefit_levels l
       JOIN brokers b ON b.id=l.broker_id
       WHERE b.code='EXNESS'
       ORDER BY l.sort_order,l.code`
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      code: String(row.code || ""),
      name: String(row.name || ""),
      discountBps: Number(row.discount_bps || 0),
      discountPercent: Number(row.discount_bps || 0) / 100,
      active: Boolean(row.active)
    }));
  }

  async userSummary(userId: string) {
    await this.ensureSchema();

    const row = await this.db.one(
      `SELECT
         c.id,
         c.status,
         c.verification_source,
         c.external_client_ref,
         c.note,
         c.verified_at,
         c.updated_at,
         l.code AS level_code,
         l.name AS level_name,
         l.discount_bps,
         l.active AS level_active
       FROM brokers b
       LEFT JOIN broker_partner_clients c
         ON c.broker_id=b.id AND c.user_id=$1
       LEFT JOIN broker_benefit_levels l ON l.id=c.benefit_level_id
       WHERE b.code='EXNESS'
       LIMIT 1`,
      [userId]
    );

    const status = String(row?.status || "NOT_CHECKED");
    const verified = status === "VERIFIED";
    const levelActive = Boolean(row?.level_active);

    return {
      status,
      verified,
      verificationSource: row?.verification_source || null,
      externalClientRef: row?.external_client_ref || null,
      verifiedAt: row?.verified_at || null,
      updatedAt: row?.updated_at || null,
      benefit: verified && levelActive
        ? {
            levelCode: String(row.level_code || ""),
            levelName: String(row.level_name || ""),
            discountBps: Number(row.discount_bps || 0),
            discountPercent: Number(row.discount_bps || 0) / 100
          }
        : null
    };
  }

  async adminClients(query = "") {
    await this.ensureSchema();
    const q = String(query || "").trim();
    const term = "%" + q + "%";

    const result = await this.db.query(
      `SELECT
         u.id AS user_id,
         u.user_code,
         u.email,
         COALESCE(c.status,'NOT_CHECKED') AS partner_status,
         c.id AS partner_client_id,
         c.verification_source,
         c.external_client_ref,
         c.note,
         c.verified_at,
         c.verified_by,
         c.updated_at,
         l.code AS benefit_level,
         l.discount_bps,
         COALESCE(x.exness_accounts,'[]'::jsonb) AS exness_accounts
       FROM users u
       LEFT JOIN brokers b ON b.code='EXNESS'
       LEFT JOIN broker_partner_clients c
         ON c.user_id=u.id AND c.broker_id=b.id
       LEFT JOIN broker_benefit_levels l ON l.id=c.benefit_level_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           jsonb_build_object(
             'id',a.id,
             'accountLast4',right(a.account_number,4),
             'server',a.broker_server,
             'status',a.status
           )
           ORDER BY a.created_at DESC
         ) AS exness_accounts
         FROM mt5_accounts a
         WHERE a.user_id=u.id
           AND (
             upper(trim(COALESCE(a.broker,''))) LIKE 'EXNESS%'
             OR upper(trim(COALESCE(a.broker_server,''))) LIKE 'EXNESS%'
           )
       ) x ON true
       WHERE u.status<>'DELETED'
         AND (
           $1=''
           OR u.user_code ILIKE $2
           OR u.email ILIKE $2
           OR EXISTS (
             SELECT 1
             FROM mt5_accounts ma
             WHERE ma.user_id=u.id
               AND (
                 upper(trim(COALESCE(ma.broker,''))) LIKE 'EXNESS%'
                 OR upper(trim(COALESCE(ma.broker_server,''))) LIKE 'EXNESS%'
               )
               AND ma.account_number ILIKE $2
           )
         )
         AND (
           $1<>''
           OR c.id IS NOT NULL
           OR jsonb_array_length(COALESCE(x.exness_accounts,'[]'::jsonb))>0
         )
       ORDER BY
         CASE WHEN c.status='VERIFIED' THEN 0 WHEN c.id IS NOT NULL THEN 1 ELSE 2 END,
         COALESCE(c.updated_at,u.created_at) DESC
       LIMIT 50`,
      [q, term]
    );

    return {
      levels: await this.levels(),
      clients: result.rows.map((row: any) => ({
        userId: row.user_id,
        userCode: String(row.user_code || ""),
        email: String(row.email || ""),
        partnerClientId: row.partner_client_id || null,
        status: String(row.partner_status || "NOT_CHECKED"),
        verificationSource: row.verification_source || null,
        externalClientRef: row.external_client_ref || null,
        note: String(row.note || ""),
        verifiedAt: row.verified_at || null,
        verifiedBy: row.verified_by || null,
        updatedAt: row.updated_at || null,
        benefitLevel: row.benefit_level || null,
        discountPercent: Number(row.discount_bps || 0) / 100,
        exnessAccounts: Array.isArray(row.exness_accounts) ? row.exness_accounts : []
      }))
    };
  }

  private normalizeStatus(value: unknown) {
    const status = String(value || "").trim().toUpperCase();
    if (!["PENDING","VERIFIED","NOT_LINKED","SUSPENDED"].includes(status)) {
      throw new BadRequestException("Partner Status ไม่ถูกต้อง");
    }
    return status;
  }

  async setClient(
    input: {
      userId?: string;
      status?: string;
      benefitLevel?: string;
      externalClientRef?: string;
      note?: string;
    },
    actor: string
  ) {
    await this.ensureSchema();

    const userId = String(input.userId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new BadRequestException("User ID ไม่ถูกต้อง");
    }

    const status = this.normalizeStatus(input.status);
    const benefitLevel = String(input.benefitLevel || "").trim().toUpperCase();
    const externalClientRef = String(input.externalClientRef || "").trim().slice(0, 180);
    const note = String(input.note || "").trim().slice(0, 1000);

    const user = await this.db.one(
      "SELECT id,user_code,email,status FROM users WHERE id=$1",
      [userId]
    );
    if (!user || user.status === "DELETED") {
      throw new ConflictException("ไม่พบลูกค้า");
    }

    const broker = await this.db.one(
      "SELECT id FROM brokers WHERE code='EXNESS' LIMIT 1"
    );
    if (!broker) throw new ConflictException("ไม่พบ Exness ใน Broker Catalog");

    let level: any = null;
    if (status === "VERIFIED") {
      const hasExness = await this.db.one(
        `SELECT id
         FROM mt5_accounts
         WHERE user_id=$1
           AND (
             upper(trim(COALESCE(broker,''))) LIKE 'EXNESS%'
             OR upper(trim(COALESCE(broker_server,''))) LIKE 'EXNESS%'
           )
         LIMIT 1`,
        [userId]
      );
      if (!hasExness) {
        throw new ConflictException("ต้องเชื่อมบัญชี Exness MT5 ก่อนจึงจะยืนยัน Partner ได้");
      }

      level = await this.db.one(
        `SELECT l.id,l.code,l.discount_bps
         FROM broker_benefit_levels l
         WHERE l.broker_id=$1 AND l.code=$2 AND l.active=true
         LIMIT 1`,
        [broker.id, benefitLevel]
      );
      if (!level) {
        throw new BadRequestException("กรุณาเลือกระดับ Benefit ที่เปิดใช้งาน");
      }
    }

    const row = await this.db.one(
      `INSERT INTO broker_partner_clients(
         broker_id,user_id,status,benefit_level_id,verification_source,
         external_client_ref,note,verified_at,verified_by,updated_at
       )
       VALUES(
         $1,$2,$3,$4,'MANUAL',$5,$6,
         CASE WHEN $3='VERIFIED' THEN now() ELSE NULL END,
         CASE WHEN $3='VERIFIED' THEN $7 ELSE NULL END,
         now()
       )
       ON CONFLICT(broker_id,user_id) DO UPDATE SET
         status=EXCLUDED.status,
         benefit_level_id=EXCLUDED.benefit_level_id,
         verification_source='MANUAL',
         external_client_ref=EXCLUDED.external_client_ref,
         note=EXCLUDED.note,
         verified_at=CASE WHEN EXCLUDED.status='VERIFIED' THEN now() ELSE NULL END,
         verified_by=CASE WHEN EXCLUDED.status='VERIFIED' THEN $7 ELSE NULL END,
         updated_at=now()
       RETURNING id,status,benefit_level_id,verified_at,verified_by,updated_at`,
      [
        broker.id,
        userId,
        status,
        status === "VERIFIED" ? level.id : null,
        externalClientRef || null,
        note,
        actor.slice(0,160)
      ]
    );

    await this.db.query(
      `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
       VALUES($1,'UPDATE_BROKER_PARTNER_CLIENT','broker_partner_client',$2,$3::jsonb)`,
      [
        actor.slice(0,160),
        row.id,
        JSON.stringify({
          broker: "EXNESS",
          userId,
          userCode: user.user_code,
          status,
          benefitLevel: status === "VERIFIED" ? level.code : null,
          discountBps: status === "VERIFIED" ? Number(level.discount_bps || 0) : 0,
          verificationSource: "MANUAL"
        })
      ]
    );

    return this.userSummary(userId);
  }

  async verifyClientFromApi(
    userId: string,
    externalClientRefValue: unknown,
    actor = "EXNESS_API"
  ) {
    await this.ensureSchema();
    const externalClientRef = String(externalClientRefValue || "").trim().slice(0,180);

    const user = await this.db.one(
      "SELECT id,status FROM users WHERE id=$1",
      [userId]
    );
    if (!user || user.status === "DELETED") return null;

    const broker = await this.db.one(
      "SELECT id FROM brokers WHERE code='EXNESS' LIMIT 1"
    );
    if (!broker) return null;

    const defaultLevel = await this.db.one(
      `SELECT id FROM broker_benefit_levels
       WHERE broker_id=$1 AND code='STANDARD' AND active=true
       LIMIT 1`,
      [broker.id]
    );
    if (!defaultLevel) return null;

    const row = await this.db.one(
      `INSERT INTO broker_partner_clients(
         broker_id,user_id,status,benefit_level_id,verification_source,
         external_client_ref,note,verified_at,verified_by,updated_at
       )
       VALUES($1,$2,'VERIFIED',$3,'API',$4,'Verified by Exness Partnership API',now(),$5,now())
       ON CONFLICT(broker_id,user_id) DO UPDATE SET
         status='VERIFIED',
         benefit_level_id=COALESCE(broker_partner_clients.benefit_level_id,EXCLUDED.benefit_level_id),
         verification_source='API',
         external_client_ref=COALESCE(NULLIF(EXCLUDED.external_client_ref,''),broker_partner_clients.external_client_ref),
         verified_at=now(),
         verified_by=$5,
         updated_at=now()
       RETURNING id`,
      [
        broker.id,
        userId,
        defaultLevel.id,
        externalClientRef || null,
        actor.slice(0,160)
      ]
    );

    return row;
  }

  async safeCheckoutBenefit(
    tx: PoolClient,
    userId: string
  ): Promise<CheckoutBrokerBenefit | null> {
    try {
      const available = (
        await tx.query(
          "SELECT to_regclass('public.broker_partner_clients') AS clients, to_regclass('public.broker_benefit_levels') AS levels, to_regclass('public.broker_benefit_order_applications') AS applications"
        )
      ).rows[0];
      if (!available?.clients || !available?.levels || !available?.applications) return null;

      const row = (
        await tx.query(
          `SELECT
             c.id AS partner_client_id,
             l.code AS level_code,
             l.name AS level_name,
             l.discount_bps
           FROM broker_partner_clients c
           JOIN brokers b ON b.id=c.broker_id
           JOIN broker_benefit_levels l ON l.id=c.benefit_level_id
           WHERE c.user_id=$1
             AND b.code='EXNESS'
             AND b.active=true
             AND c.status='VERIFIED'
             AND l.active=true
             AND l.discount_bps>0
           LIMIT 1`,
          [userId]
        )
      ).rows[0];

      if (!row) return null;

      const discountBps = Math.max(0, Math.min(5000, Number(row.discount_bps || 0)));
      return {
        partnerClientId: String(row.partner_client_id),
        levelCode: String(row.level_code || ""),
        levelName: String(row.level_name || ""),
        discountBps,
        discountPercent: discountBps / 100
      };
    } catch {
      // Fail open for commerce: Broker Benefits must never block an otherwise
      // valid package checkout. The customer simply receives the normal price
      // or an explicitly entered promotion if Broker Benefits are unavailable.
      return null;
    }
  }

  async recordCheckoutBenefit(
    tx: PoolClient,
    input: {
      purchaseType: "LOCAL" | "CLOUD";
      orderId: string;
      benefit: CheckoutBrokerBenefit;
      originalAmountSatang: number;
      discountAmountSatang: number;
      finalAmountSatang: number;
    }
  ) {
    await tx.query("SAVEPOINT broker_benefit_audit");
    try {
      await tx.query(
        `INSERT INTO broker_benefit_order_applications(
           purchase_type,order_id,partner_client_id,benefit_level,discount_bps,
           original_amount_satang,discount_amount_satang,final_amount_satang
         )
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(purchase_type,order_id) DO NOTHING`,
        [
          input.purchaseType,
          input.orderId,
          input.benefit.partnerClientId,
          input.benefit.levelCode,
          input.benefit.discountBps,
          Math.max(0, Math.trunc(input.originalAmountSatang)),
          Math.max(0, Math.trunc(input.discountAmountSatang)),
          Math.max(0, Math.trunc(input.finalAmountSatang))
        ]
      );
      await tx.query("RELEASE SAVEPOINT broker_benefit_audit");
    } catch {
      await tx.query("ROLLBACK TO SAVEPOINT broker_benefit_audit");
      await tx.query("RELEASE SAVEPOINT broker_benefit_audit");
    }
  }
}
