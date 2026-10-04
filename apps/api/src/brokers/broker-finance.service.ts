import {
  BadRequestException,
  ConflictException,
  Injectable
} from "@nestjs/common";
import { PoolClient } from "pg";
import { DbService } from "../db.service";
import { BrokerBenefitService } from "./broker-benefit.service";


@Injectable()
export class BrokerFinanceService {
  private schemaReady = false;

  constructor(
    private readonly db: DbService,
    private readonly benefits: BrokerBenefitService
  ) {}

  private async ensureSchema() {
    if (this.schemaReady) return;

    // Phase 3 depends on the isolated Phase 2 broker-benefit schema.
    await this.benefits.levels();

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS broker_rebate_policies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
        benefit_level_id uuid NOT NULL REFERENCES broker_benefit_levels(id) ON DELETE CASCADE,
        rebate_bps integer NOT NULL DEFAULT 0
          CHECK (rebate_bps BETWEEN 0 AND 10000),
        active boolean NOT NULL DEFAULT true,
        updated_by varchar(160),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(broker_id,benefit_level_id)
      );

      CREATE TABLE IF NOT EXISTS broker_commission_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE RESTRICT,
        partner_client_id uuid NOT NULL REFERENCES broker_partner_clients(id) ON DELETE RESTRICT,
        external_event_id varchar(180) NOT NULL,
        symbol varchar(64),
        volume_lots numeric(18,4),
        gross_commission_minor bigint NOT NULL
          CHECK (gross_commission_minor>=0),
        currency varchar(8) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'CONFIRMED'
          CHECK (status IN ('CONFIRMED','REVERSED')),
        occurred_at timestamptz NOT NULL,
        imported_by varchar(160) NOT NULL,
        raw_reference text,
        reversed_at timestamptz,
        reversed_by varchar(160),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(broker_id,external_event_id)
      );

      CREATE INDEX IF NOT EXISTS idx_broker_commission_client
        ON broker_commission_events(partner_client_id,occurred_at DESC);

      CREATE INDEX IF NOT EXISTS idx_broker_commission_status
        ON broker_commission_events(broker_id,status,occurred_at DESC);

      CREATE TABLE IF NOT EXISTS broker_rebate_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        commission_event_id uuid NOT NULL UNIQUE REFERENCES broker_commission_events(id) ON DELETE RESTRICT,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        partner_client_id uuid NOT NULL REFERENCES broker_partner_clients(id) ON DELETE RESTRICT,
        rebate_bps integer NOT NULL
          CHECK (rebate_bps BETWEEN 0 AND 10000),
        rebate_amount_minor bigint NOT NULL
          CHECK (rebate_amount_minor>=0),
        currency varchar(8) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','AVAILABLE','PAID','REVERSED')),
        available_at timestamptz,
        paid_at timestamptz,
        payout_reference varchar(220),
        reversed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_broker_rebate_user
        ON broker_rebate_entries(user_id,status,created_at DESC);

      CREATE TABLE IF NOT EXISTS broker_rebate_wallet_ledger (
        id bigserial PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        rebate_entry_id uuid NOT NULL REFERENCES broker_rebate_entries(id) ON DELETE RESTRICT,
        event_type varchar(32) NOT NULL
          CHECK (event_type IN ('REBATE_EARN','REBATE_RELEASE','REBATE_PAID','REBATE_REVERSE')),
        pending_delta_minor bigint NOT NULL DEFAULT 0,
        available_delta_minor bigint NOT NULL DEFAULT 0,
        paid_delta_minor bigint NOT NULL DEFAULT 0,
        currency varchar(8) NOT NULL,
        actor varchar(160) NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_broker_rebate_ledger_event
        ON broker_rebate_wallet_ledger(rebate_entry_id,event_type);

      CREATE INDEX IF NOT EXISTS idx_broker_rebate_wallet_user
        ON broker_rebate_wallet_ledger(user_id,currency,created_at DESC);

      INSERT INTO broker_rebate_policies(broker_id,benefit_level_id,rebate_bps,active)
      SELECT b.id,l.id,0,true
      FROM brokers b
      JOIN broker_benefit_levels l ON l.broker_id=b.id
      WHERE b.code='EXNESS'
      ON CONFLICT(broker_id,benefit_level_id) DO NOTHING;
    `);

    this.schemaReady = true;
  }

  private moneyMinor(value: unknown) {
    const amount = Math.trunc(Number(value || 0));
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000_000) {
      throw new BadRequestException("Commission amount ไม่ถูกต้อง");
    }
    return amount;
  }

  private currency(value: unknown) {
    const currency = String(value || "").trim().toUpperCase();
    if (!/^[A-Z]{3,8}$/.test(currency)) {
      throw new BadRequestException("Currency ไม่ถูกต้อง");
    }
    return currency;
  }

  private rebateBps(value: unknown) {
    const bps = Math.trunc(Number(value));
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      throw new BadRequestException("Rebate ต้องอยู่ระหว่าง 0-100%");
    }
    return bps;
  }

  async customerSummary(userId: string) {
    await this.ensureSchema();

    const partner = await this.benefits.userSummary(userId);
    const wallets = await this.db.query(
      `SELECT
         currency,
         COALESCE(SUM(pending_delta_minor),0)::bigint AS pending_minor,
         COALESCE(SUM(available_delta_minor),0)::bigint AS available_minor,
         COALESCE(SUM(paid_delta_minor),0)::bigint AS paid_minor,
         COUNT(*)::int AS entry_count
       FROM broker_rebate_wallet_ledger
       WHERE user_id=$1
       GROUP BY currency
       ORDER BY currency`,
      [userId]
    );

    const recent = await this.db.query(
      `SELECT
         r.id,
         r.rebate_bps,
         r.rebate_amount_minor,
         r.currency,
         r.status,
         r.available_at,
         r.paid_at,
         r.payout_reference,
         r.created_at,
         c.external_event_id,
         c.symbol,
         c.volume_lots,
         c.gross_commission_minor,
         c.occurred_at
       FROM broker_rebate_entries r
       JOIN broker_commission_events c ON c.id=r.commission_event_id
       WHERE r.user_id=$1
       ORDER BY c.occurred_at DESC,r.created_at DESC
       LIMIT 50`,
      [userId]
    );

    return {
      partner,
      wallets: wallets.rows.map((row: any) => ({
        currency: String(row.currency || ""),
        pendingMinor: Number(row.pending_minor || 0),
        availableMinor: Number(row.available_minor || 0),
        paidMinor: Number(row.paid_minor || 0),
        entryCount: Number(row.entry_count || 0)
      })),
      recent: recent.rows.map((row: any) => ({
        id: row.id,
        rebateBps: Number(row.rebate_bps || 0),
        rebatePercent: Number(row.rebate_bps || 0) / 100,
        rebateAmountMinor: Number(row.rebate_amount_minor || 0),
        currency: String(row.currency || ""),
        status: String(row.status || ""),
        availableAt: row.available_at || null,
        paidAt: row.paid_at || null,
        payoutReference: row.payout_reference || null,
        externalEventId: String(row.external_event_id || ""),
        symbol: row.symbol || null,
        volumeLots: row.volume_lots === null ? null : Number(row.volume_lots),
        grossCommissionMinor: Number(row.gross_commission_minor || 0),
        occurredAt: row.occurred_at
      }))
    };
  }

  async adminDashboard(query = "") {
    await this.ensureSchema();
    const q = String(query || "").trim();
    const term = "%" + q + "%";

    const [policies, clients, events, totals] = await Promise.all([
      this.db.query(
        `SELECT
           l.code AS level_code,
           l.name AS level_name,
           l.discount_bps,
           p.rebate_bps,
           p.active,
           p.updated_at
         FROM brokers b
         JOIN broker_benefit_levels l ON l.broker_id=b.id
         LEFT JOIN broker_rebate_policies p
           ON p.broker_id=b.id AND p.benefit_level_id=l.id
         WHERE b.code='EXNESS'
         ORDER BY l.sort_order,l.code`
      ),
      this.db.query(
        `SELECT
           c.id AS partner_client_id,
           c.user_id,
           u.user_code,
           u.email,
           l.code AS benefit_level,
           l.discount_bps,
           COALESCE(p.rebate_bps,0) AS rebate_bps
         FROM broker_partner_clients c
         JOIN brokers b ON b.id=c.broker_id
         JOIN users u ON u.id=c.user_id
         LEFT JOIN broker_benefit_levels l ON l.id=c.benefit_level_id
         LEFT JOIN broker_rebate_policies p
           ON p.broker_id=b.id AND p.benefit_level_id=l.id AND p.active=true
         WHERE b.code='EXNESS'
           AND c.status='VERIFIED'
           AND (
             $1=''
             OR u.user_code ILIKE $2
             OR u.email ILIKE $2
             OR EXISTS (
               SELECT 1 FROM mt5_accounts a
               WHERE a.user_id=u.id AND a.account_number ILIKE $2
             )
           )
         ORDER BY u.user_code
         LIMIT 50`,
        [q, term]
      ),
      this.db.query(
        `SELECT
           c.id,
           c.external_event_id,
           c.symbol,
           c.volume_lots,
           c.gross_commission_minor,
           c.currency,
           c.status,
           c.occurred_at,
           c.imported_by,
           c.reversed_at,
           u.user_code,
           u.email,
           l.code AS benefit_level,
           r.id AS rebate_entry_id,
           r.rebate_bps,
           r.rebate_amount_minor,
           r.status AS rebate_status,
           r.available_at,
           r.paid_at,
           r.payout_reference
         FROM broker_commission_events c
         JOIN broker_partner_clients pc ON pc.id=c.partner_client_id
         JOIN users u ON u.id=pc.user_id
         LEFT JOIN broker_benefit_levels l ON l.id=pc.benefit_level_id
         LEFT JOIN broker_rebate_entries r ON r.commission_event_id=c.id
         JOIN brokers b ON b.id=c.broker_id
         WHERE b.code='EXNESS'
           AND (
             $1=''
             OR u.user_code ILIKE $2
             OR u.email ILIKE $2
             OR c.external_event_id ILIKE $2
           )
         ORDER BY c.occurred_at DESC,c.created_at DESC
         LIMIT 100`,
        [q, term]
      ),
      this.db.query(
        `SELECT
           c.currency,
           COALESCE(SUM(c.gross_commission_minor) FILTER (WHERE c.status='CONFIRMED'),0)::bigint AS confirmed_commission_minor,
           COALESCE(SUM(r.rebate_amount_minor) FILTER (WHERE r.status IN ('PENDING','AVAILABLE','PAID')),0)::bigint AS active_rebate_minor,
           COALESCE(SUM(r.rebate_amount_minor) FILTER (WHERE r.status='PAID'),0)::bigint AS paid_rebate_minor,
           COUNT(c.id) FILTER (WHERE c.status='CONFIRMED')::int AS commission_count
         FROM broker_commission_events c
         LEFT JOIN broker_rebate_entries r ON r.commission_event_id=c.id
         JOIN brokers b ON b.id=c.broker_id
         WHERE b.code='EXNESS'
         GROUP BY c.currency
         ORDER BY c.currency`
      )
    ]);

    return {
      policies: policies.rows.map((row: any) => ({
        levelCode: String(row.level_code || ""),
        levelName: String(row.level_name || ""),
        discountPercent: Number(row.discount_bps || 0) / 100,
        rebateBps: Number(row.rebate_bps || 0),
        rebatePercent: Number(row.rebate_bps || 0) / 100,
        active: row.active !== false,
        updatedAt: row.updated_at || null
      })),
      clients: clients.rows.map((row: any) => ({
        partnerClientId: row.partner_client_id,
        userId: row.user_id,
        userCode: String(row.user_code || ""),
        email: String(row.email || ""),
        benefitLevel: row.benefit_level || null,
        discountPercent: Number(row.discount_bps || 0) / 100,
        rebatePercent: Number(row.rebate_bps || 0) / 100
      })),
      events: events.rows.map((row: any) => ({
        id: row.id,
        externalEventId: String(row.external_event_id || ""),
        symbol: row.symbol || null,
        volumeLots: row.volume_lots === null ? null : Number(row.volume_lots),
        grossCommissionMinor: Number(row.gross_commission_minor || 0),
        currency: String(row.currency || ""),
        status: String(row.status || ""),
        occurredAt: row.occurred_at,
        importedBy: row.imported_by,
        reversedAt: row.reversed_at || null,
        userCode: String(row.user_code || ""),
        email: String(row.email || ""),
        benefitLevel: row.benefit_level || null,
        rebateEntryId: row.rebate_entry_id || null,
        rebateBps: Number(row.rebate_bps || 0),
        rebatePercent: Number(row.rebate_bps || 0) / 100,
        rebateAmountMinor: Number(row.rebate_amount_minor || 0),
        rebateStatus: row.rebate_status || null,
        availableAt: row.available_at || null,
        paidAt: row.paid_at || null,
        payoutReference: row.payout_reference || null
      })),
      totals: totals.rows.map((row: any) => ({
        currency: String(row.currency || ""),
        confirmedCommissionMinor: Number(row.confirmed_commission_minor || 0),
        activeRebateMinor: Number(row.active_rebate_minor || 0),
        paidRebateMinor: Number(row.paid_rebate_minor || 0),
        commissionCount: Number(row.commission_count || 0)
      }))
    };
  }

  async updatePolicy(
    levelCodeValue: unknown,
    rebateBpsValue: unknown,
    activeValue: unknown,
    actor: string
  ) {
    await this.ensureSchema();
    const levelCode = String(levelCodeValue || "").trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(levelCode)) {
      throw new BadRequestException("Benefit Level ไม่ถูกต้อง");
    }
    const rebateBps = this.rebateBps(rebateBpsValue);
    const active = activeValue !== false;

    const row = await this.db.one(
      `INSERT INTO broker_rebate_policies(
         broker_id,benefit_level_id,rebate_bps,active,updated_by,updated_at
       )
       SELECT b.id,l.id,$2,$3,$4,now()
       FROM brokers b
       JOIN broker_benefit_levels l ON l.broker_id=b.id
       WHERE b.code='EXNESS' AND l.code=$1
       ON CONFLICT(broker_id,benefit_level_id) DO UPDATE SET
         rebate_bps=EXCLUDED.rebate_bps,
         active=EXCLUDED.active,
         updated_by=EXCLUDED.updated_by,
         updated_at=now()
       RETURNING *`,
      [levelCode, rebateBps, active, actor.slice(0,160)]
    );
    if (!row) throw new ConflictException("ไม่พบ Benefit Level นี้");

    await this.db.query(
      `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
       VALUES($1,'UPDATE_BROKER_REBATE_POLICY','broker_rebate_policy',$2,$3::jsonb)`,
      [
        actor.slice(0,160),
        row.id,
        JSON.stringify({ broker: "EXNESS", levelCode, rebateBps, active })
      ]
    );

    return this.adminDashboard();
  }

  async recordCommission(
    input: {
      partnerClientId?: string;
      externalEventId?: string;
      symbol?: string;
      volumeLots?: number;
      grossCommissionMinor?: number;
      currency?: string;
      occurredAt?: string;
      rawReference?: string;
    },
    actor: string
  ) {
    await this.ensureSchema();

    const partnerClientId = String(input.partnerClientId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(partnerClientId)) {
      throw new BadRequestException("Partner Client ไม่ถูกต้อง");
    }

    const externalEventId = String(input.externalEventId || "").trim();
    if (externalEventId.length < 4 || externalEventId.length > 180) {
      throw new BadRequestException("External Event ID ต้องมี 4-180 ตัวอักษร");
    }

    const grossCommissionMinor = this.moneyMinor(input.grossCommissionMinor);
    const currency = this.currency(input.currency);
    const symbol = String(input.symbol || "").trim().slice(0,64) || null;
    const rawReference = String(input.rawReference || "").trim().slice(0,2000) || null;

    let volumeLots: number | null = null;
    if (input.volumeLots !== undefined && input.volumeLots !== null && String(input.volumeLots) !== "") {
      volumeLots = Number(input.volumeLots);
      if (!Number.isFinite(volumeLots) || volumeLots < 0 || volumeLots > 1_000_000) {
        throw new BadRequestException("Volume Lots ไม่ถูกต้อง");
      }
    }

    const occurredAt = new Date(String(input.occurredAt || ""));
    if (!Number.isFinite(occurredAt.getTime())) {
      throw new BadRequestException("เวลา Commission ไม่ถูกต้อง");
    }

    return this.db.transaction(async (tx: PoolClient) => {
      await tx.query("SELECT pg_advisory_xact_lock(740093)");

      const client = (
        await tx.query(
          `SELECT
             c.id,
             c.user_id,
             l.code AS level_code,
             COALESCE(p.rebate_bps,0) AS rebate_bps,
             COALESCE(p.active,false) AS rebate_policy_active,
             b.id AS broker_id
           FROM broker_partner_clients c
           JOIN brokers b ON b.id=c.broker_id
           LEFT JOIN broker_benefit_levels l ON l.id=c.benefit_level_id
           LEFT JOIN broker_rebate_policies p
             ON p.broker_id=b.id AND p.benefit_level_id=l.id
           WHERE c.id=$1
             AND b.code='EXNESS'
             AND c.status='VERIFIED'
           LIMIT 1
           FOR UPDATE OF c`,
          [partnerClientId]
        )
      ).rows[0];

      if (!client) {
        throw new ConflictException("ต้องเป็น Exness Partner Client ที่ Verified เท่านั้น");
      }

      const existing = (
        await tx.query(
          `SELECT id FROM broker_commission_events
           WHERE broker_id=$1 AND external_event_id=$2
           LIMIT 1`,
          [client.broker_id, externalEventId]
        )
      ).rows[0];
      if (existing) {
        throw new ConflictException("Commission Event นี้ถูกบันทึกแล้ว");
      }

      const event = (
        await tx.query(
          `INSERT INTO broker_commission_events(
             broker_id,partner_client_id,external_event_id,symbol,volume_lots,
             gross_commission_minor,currency,status,occurred_at,imported_by,raw_reference
           )
           VALUES($1,$2,$3,$4,$5,$6,$7,'CONFIRMED',$8,$9,$10)
           RETURNING *`,
          [
            client.broker_id,
            client.id,
            externalEventId,
            symbol,
            volumeLots,
            grossCommissionMinor,
            currency,
            occurredAt.toISOString(),
            actor.slice(0,160),
            rawReference
          ]
        )
      ).rows[0];

      const rebateBps = client.rebate_policy_active
        ? Math.max(0, Math.min(10000, Number(client.rebate_bps || 0)))
        : 0;
      const rebateAmountMinor = Math.floor(grossCommissionMinor * rebateBps / 10000);

      let rebate: any = null;
      if (rebateAmountMinor > 0) {
        rebate = (
          await tx.query(
            `INSERT INTO broker_rebate_entries(
               commission_event_id,user_id,partner_client_id,rebate_bps,
               rebate_amount_minor,currency,status
             )
             VALUES($1,$2,$3,$4,$5,$6,'PENDING')
             RETURNING *`,
            [
              event.id,
              client.user_id,
              client.id,
              rebateBps,
              rebateAmountMinor,
              currency
            ]
          )
        ).rows[0];

        await tx.query(
          `INSERT INTO broker_rebate_wallet_ledger(
             user_id,rebate_entry_id,event_type,pending_delta_minor,
             available_delta_minor,paid_delta_minor,currency,actor,metadata
           )
           VALUES($1,$2,'REBATE_EARN',$3,0,0,$4,$5,$6::jsonb)`,
          [
            client.user_id,
            rebate.id,
            rebateAmountMinor,
            currency,
            actor.slice(0,160),
            JSON.stringify({
              externalEventId,
              grossCommissionMinor,
              rebateBps,
              levelCode: client.level_code || null
            })
          ]
        );
      }

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'BROKER_COMMISSION_RECORDED','broker_commission_event',$2,$3::jsonb)`,
        [
          actor.slice(0,160),
          event.id,
          JSON.stringify({
            broker: "EXNESS",
            partnerClientId,
            externalEventId,
            grossCommissionMinor,
            currency,
            rebateBps,
            rebateAmountMinor,
            rebateCreated: Boolean(rebate)
          })
        ]
      );

      return {
        commissionEventId: event.id,
        rebateEntryId: rebate?.id || null,
        rebateBps,
        rebateAmountMinor
      };
    });
  }

  private async rebateEntryTx(tx: PoolClient, rebateEntryId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(rebateEntryId)) {
      throw new BadRequestException("Rebate Entry ID ไม่ถูกต้อง");
    }
    const row = (
      await tx.query(
        `SELECT r.*,c.status AS commission_status,c.external_event_id
         FROM broker_rebate_entries r
         JOIN broker_commission_events c ON c.id=r.commission_event_id
         WHERE r.id=$1
         FOR UPDATE OF r`,
        [rebateEntryId]
      )
    ).rows[0];
    if (!row) throw new ConflictException("ไม่พบ Rebate");
    return row;
  }

  async releaseRebate(rebateEntryId: string, actor: string) {
    await this.ensureSchema();

    return this.db.transaction(async (tx: PoolClient) => {
      const rebate = await this.rebateEntryTx(tx, rebateEntryId);
      if (rebate.commission_status !== "CONFIRMED") {
        throw new ConflictException("Commission ไม่อยู่ในสถานะ Confirmed");
      }
      if (rebate.status === "AVAILABLE") return { ok: true, status: "AVAILABLE" };
      if (rebate.status !== "PENDING") {
        throw new ConflictException("ปล่อย Rebate รายการนี้ไม่ได้");
      }

      const amount = Number(rebate.rebate_amount_minor || 0);
      await tx.query(
        `UPDATE broker_rebate_entries
         SET status='AVAILABLE',available_at=now(),updated_at=now()
         WHERE id=$1`,
        [rebate.id]
      );
      await tx.query(
        `INSERT INTO broker_rebate_wallet_ledger(
           user_id,rebate_entry_id,event_type,pending_delta_minor,
           available_delta_minor,paid_delta_minor,currency,actor
         )
         VALUES($1,$2,'REBATE_RELEASE',$3,$4,0,$5,$6)
         ON CONFLICT(rebate_entry_id,event_type) DO NOTHING`,
        [
          rebate.user_id,
          rebate.id,
          -amount,
          amount,
          rebate.currency,
          actor.slice(0,160)
        ]
      );

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'BROKER_REBATE_RELEASED','broker_rebate_entry',$2,$3::jsonb)`,
        [
          actor.slice(0,160),
          rebate.id,
          JSON.stringify({ amountMinor: amount, currency: rebate.currency })
        ]
      );

      return { ok: true, status: "AVAILABLE" };
    });
  }

  async markRebatePaid(
    rebateEntryId: string,
    payoutReferenceValue: unknown,
    actor: string
  ) {
    await this.ensureSchema();
    const payoutReference = String(payoutReferenceValue || "").trim().slice(0,220);
    if (payoutReference.length < 3) {
      throw new BadRequestException("กรุณาใส่ Payout Reference");
    }

    return this.db.transaction(async (tx: PoolClient) => {
      const rebate = await this.rebateEntryTx(tx, rebateEntryId);
      if (rebate.status === "PAID") return { ok: true, status: "PAID" };
      if (rebate.status !== "AVAILABLE") {
        throw new ConflictException("ต้องปล่อย Rebate เป็น Available ก่อน");
      }

      const amount = Number(rebate.rebate_amount_minor || 0);
      await tx.query(
        `UPDATE broker_rebate_entries
         SET status='PAID',paid_at=now(),payout_reference=$2,updated_at=now()
         WHERE id=$1`,
        [rebate.id, payoutReference]
      );
      await tx.query(
        `INSERT INTO broker_rebate_wallet_ledger(
           user_id,rebate_entry_id,event_type,pending_delta_minor,
           available_delta_minor,paid_delta_minor,currency,actor,metadata
         )
         VALUES($1,$2,'REBATE_PAID',0,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT(rebate_entry_id,event_type) DO NOTHING`,
        [
          rebate.user_id,
          rebate.id,
          -amount,
          amount,
          rebate.currency,
          actor.slice(0,160),
          JSON.stringify({ payoutReference })
        ]
      );

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'BROKER_REBATE_PAID','broker_rebate_entry',$2,$3::jsonb)`,
        [
          actor.slice(0,160),
          rebate.id,
          JSON.stringify({
            amountMinor: amount,
            currency: rebate.currency,
            payoutReference
          })
        ]
      );

      return { ok: true, status: "PAID" };
    });
  }

  async reverseCommission(
    commissionEventId: string,
    reasonValue: unknown,
    actor: string
  ) {
    await this.ensureSchema();
    if (!/^[0-9a-f-]{36}$/i.test(commissionEventId)) {
      throw new BadRequestException("Commission Event ID ไม่ถูกต้อง");
    }
    const reason = String(reasonValue || "").trim().slice(0,500);
    if (reason.length < 3) throw new BadRequestException("กรุณาระบุเหตุผล");

    return this.db.transaction(async (tx: PoolClient) => {
      const event = (
        await tx.query(
          "SELECT * FROM broker_commission_events WHERE id=$1 FOR UPDATE",
          [commissionEventId]
        )
      ).rows[0];
      if (!event) throw new ConflictException("ไม่พบ Commission Event");
      if (event.status === "REVERSED") return { ok: true, status: "REVERSED" };

      const rebate = (
        await tx.query(
          "SELECT * FROM broker_rebate_entries WHERE commission_event_id=$1 FOR UPDATE",
          [event.id]
        )
      ).rows[0];

      if (rebate?.status === "PAID") {
        throw new ConflictException(
          "Rebate จ่ายแล้ว จึง Reverse อัตโนมัติไม่ได้ กรุณาตรวจสอบและกระทบยอดด้วยมือ"
        );
      }

      await tx.query(
        `UPDATE broker_commission_events
         SET status='REVERSED',reversed_at=now(),reversed_by=$2,updated_at=now()
         WHERE id=$1`,
        [event.id, actor.slice(0,160)]
      );

      if (rebate && rebate.status !== "REVERSED") {
        const amount = Number(rebate.rebate_amount_minor || 0);
        const pendingDelta = rebate.status === "PENDING" ? -amount : 0;
        const availableDelta = rebate.status === "AVAILABLE" ? -amount : 0;

        await tx.query(
          `UPDATE broker_rebate_entries
           SET status='REVERSED',reversed_at=now(),updated_at=now()
           WHERE id=$1`,
          [rebate.id]
        );

        await tx.query(
          `INSERT INTO broker_rebate_wallet_ledger(
             user_id,rebate_entry_id,event_type,pending_delta_minor,
             available_delta_minor,paid_delta_minor,currency,actor,metadata
           )
           VALUES($1,$2,'REBATE_REVERSE',$3,$4,0,$5,$6,$7::jsonb)
           ON CONFLICT(rebate_entry_id,event_type) DO NOTHING`,
          [
            rebate.user_id,
            rebate.id,
            pendingDelta,
            availableDelta,
            rebate.currency,
            actor.slice(0,160),
            JSON.stringify({ reason, commissionEventId: event.id })
          ]
        );
      }

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'BROKER_COMMISSION_REVERSED','broker_commission_event',$2,$3::jsonb)`,
        [
          actor.slice(0,160),
          event.id,
          JSON.stringify({ reason, rebateEntryId: rebate?.id || null })
        ]
      );

      return { ok: true, status: "REVERSED" };
    });
  }
}
