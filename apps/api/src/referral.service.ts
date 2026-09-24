import { Injectable } from "@nestjs/common";
import { PoolClient } from "pg";
import { DbService } from "./db.service";

export const REFERRAL_LEVELS = [
  { level: 1, rateBps: 700 },
  { level: 2, rateBps: 500 },
  { level: 3, rateBps: 300 },
  { level: 4, rateBps: 100 }
] as const;

@Injectable()
export class ReferralService {
  constructor(private readonly db: DbService) {}

  private holdDays() {
    const raw = Number(process.env.REFERRAL_HOLD_DAYS || 7);
    return Number.isFinite(raw) ? Math.min(90, Math.max(0, Math.trunc(raw))) : 7;
  }

  private async ensureReferralCode(userId: string) {
    return this.db.one(
      `UPDATE users
       SET referral_code=COALESCE(
         referral_code,
         'SCN-' || upper(regexp_replace(user_code,'^BOT-','','i'))
       )
       WHERE id=$1
       RETURNING id,user_code,referral_code,role,status,referred_by_user_id,created_at`,
      [userId]
    );
  }

  private async refreshAvailability(userId: string) {
    await this.db.query(
      `WITH released AS (
         UPDATE referral_commissions
         SET status='AVAILABLE',updated_at=now()
         WHERE beneficiary_user_id=$1
           AND status='PENDING'
           AND available_at<=now()
         RETURNING *
       )
       INSERT INTO commission_wallet_ledger(
         entry_key,beneficiary_user_id,commission_id,event_type,
         pending_delta_satang,available_delta_satang,paid_delta_satang,
         currency,source_type,source_id,level,rate_bps,metadata,created_at
       )
       SELECT
         'release:' || id::text,
         beneficiary_user_id,
         id,
         'COMMISSION_RELEASE',
         -commission_amount_satang,
         commission_amount_satang,
         0,
         currency,
         source_type,
         source_id,
         level,
         rate_bps,
         jsonb_build_object('availableAt',available_at,'source','availability_refresh'),
         now()
       FROM released
       ON CONFLICT(entry_key) DO NOTHING`,
      [userId]
    );
  }

  async dashboard(userId: string) {
    const account = await this.ensureReferralCode(userId);
    if (!account) return null;

    await this.refreshAvailability(userId);

    const [sponsor, levels, recentNetwork, totals, commissions, walletTotals, walletLedger] = await Promise.all([
      account.referred_by_user_id
        ? this.db.one(
            `SELECT user_code,referral_code
             FROM users
             WHERE id=$1 AND status<>'DELETED'`,
            [account.referred_by_user_id]
          )
        : Promise.resolve(null),
      this.db.query(
        `WITH RECURSIVE network AS (
           SELECT u.id,u.user_code,u.created_at,1 AS level,ARRAY[u.id]::uuid[] AS path
           FROM users u
           WHERE u.referred_by_user_id=$1
             AND u.status<>'DELETED'
           UNION ALL
           SELECT child.id,child.user_code,child.created_at,n.level+1,n.path||child.id
           FROM users child
           JOIN network n ON child.referred_by_user_id=n.id
           WHERE n.level<4
             AND child.status<>'DELETED'
             AND NOT child.id=ANY(n.path)
         )
         SELECT level,count(*)::int AS count
         FROM network
         GROUP BY level
         ORDER BY level`,
        [userId]
      ),
      this.db.query(
        `WITH RECURSIVE network AS (
           SELECT u.id,u.user_code,u.created_at,1 AS level,ARRAY[u.id]::uuid[] AS path
           FROM users u
           WHERE u.referred_by_user_id=$1
             AND u.status<>'DELETED'
           UNION ALL
           SELECT child.id,child.user_code,child.created_at,n.level+1,n.path||child.id
           FROM users child
           JOIN network n ON child.referred_by_user_id=n.id
           WHERE n.level<4
             AND child.status<>'DELETED'
             AND NOT child.id=ANY(n.path)
         )
         SELECT id,user_code,created_at,level
         FROM network
         ORDER BY created_at DESC
         LIMIT 30`,
        [userId]
      ),
      this.db.one(
        `SELECT
           COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='PENDING'),0)::bigint AS pending_satang,
           COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='AVAILABLE'),0)::bigint AS available_satang,
           COALESCE(SUM(commission_amount_satang) FILTER (WHERE status='PAID'),0)::bigint AS paid_satang,
           COALESCE(SUM(commission_amount_satang) FILTER (WHERE status<>'VOID'),0)::bigint AS lifetime_satang,
           COUNT(*) FILTER (WHERE status<>'VOID')::int AS commission_count
         FROM referral_commissions
         WHERE beneficiary_user_id=$1`,
        [userId]
      ),
      this.db.query(
        `SELECT rc.id,rc.level,rc.rate_bps,rc.gross_amount_satang,
                rc.commission_amount_satang,rc.currency,rc.status,
                rc.available_at,rc.paid_at,rc.created_at,rc.source_type,
                u.user_code AS source_user_code
         FROM referral_commissions rc
         JOIN users u ON u.id=rc.source_user_id
         WHERE rc.beneficiary_user_id=$1
         ORDER BY rc.created_at DESC
         LIMIT 50`,
        [userId]
      ),
      this.db.one(
        `SELECT
           COALESCE(SUM(pending_delta_satang),0)::bigint AS pending_satang,
           COALESCE(SUM(available_delta_satang),0)::bigint AS available_satang,
           COALESCE(SUM(paid_delta_satang),0)::bigint AS paid_satang,
           COUNT(*)::int AS entry_count
         FROM commission_wallet_ledger
         WHERE beneficiary_user_id=$1`,
        [userId]
      ),
      this.db.query(
        `SELECT
           wl.id,wl.event_type,wl.pending_delta_satang,wl.available_delta_satang,
           wl.paid_delta_satang,wl.currency,wl.source_type,wl.source_id,
           wl.level,wl.rate_bps,wl.created_at,
           rc.status AS commission_status,
           rc.available_at,
           rc.commission_amount_satang,
           u.user_code AS source_user_code
         FROM commission_wallet_ledger wl
         JOIN referral_commissions rc ON rc.id=wl.commission_id
         JOIN users u ON u.id=rc.source_user_id
         WHERE wl.beneficiary_user_id=$1
         ORDER BY wl.created_at DESC,wl.id DESC
         LIMIT 60`,
        [userId]
      )
    ]);

    const countByLevel = new Map<number, number>(
      levels.rows.map((row: any) => [Number(row.level), Number(row.count || 0)] as [number, number])
    );
    const networkByLevel = REFERRAL_LEVELS.map(item => ({
      level: item.level,
      ratePercent: item.rateBps / 100,
      count: countByLevel.get(item.level) || 0
    }));

    return {
      user: {
        userCode: account.user_code,
        role: account.role,
        referralCode: account.referral_code,
        joinedAt: account.created_at
      },
      sponsor: sponsor
        ? { userCode: sponsor.user_code, referralCode: sponsor.referral_code }
        : null,
      program: {
        levels: REFERRAL_LEVELS.map(item => ({
          level: item.level,
          rateBps: item.rateBps,
          ratePercent: item.rateBps / 100
        })),
        maximumNetworkRatePercent:
          REFERRAL_LEVELS.reduce((sum, item) => sum + item.rateBps, 0) / 100,
        holdDays: this.holdDays(),
        payoutMode: "MANUAL",
        eligibleSourceTypes: ["LOCAL_ORDER", "CLOUD_ORDER", "MANUAL_SUBSCRIPTION"]
      },
      network: {
        directInvites: countByLevel.get(1) || 0,
        total: networkByLevel.reduce((sum, item) => sum + item.count, 0),
        byLevel: networkByLevel,
        recent: recentNetwork.rows
      },
      earnings: {
        pendingSatang: Number(totals?.pending_satang || 0),
        availableSatang: Number(totals?.available_satang || 0),
        paidSatang: Number(totals?.paid_satang || 0),
        lifetimeSatang: Number(totals?.lifetime_satang || 0),
        commissionCount: Number(totals?.commission_count || 0),
        recent: commissions.rows
      },
      wallet: {
        currency: "THB",
        pendingSatang: Number(walletTotals?.pending_satang || 0),
        availableSatang: Number(walletTotals?.available_satang || 0),
        paidSatang: Number(walletTotals?.paid_satang || 0),
        currentBalanceSatang:
          Number(walletTotals?.pending_satang || 0) +
          Number(walletTotals?.available_satang || 0),
        lifetimeSatang:
          Number(walletTotals?.pending_satang || 0) +
          Number(walletTotals?.available_satang || 0) +
          Number(walletTotals?.paid_satang || 0),
        entryCount: Number(walletTotals?.entry_count || 0),
        ledgerVerified:
          Number(walletTotals?.pending_satang || 0) === Number(totals?.pending_satang || 0) &&
          Number(walletTotals?.available_satang || 0) === Number(totals?.available_satang || 0) &&
          Number(walletTotals?.paid_satang || 0) === Number(totals?.paid_satang || 0),
        withdrawalEnabled: false,
        recent: walletLedger.rows
      }
    };
  }

  async creditRecordedPurchase(input: {
    sourceUserId: string;
    sourceType: string;
    sourceId: string;
    grossAmountSatang: number;
    currency?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.db.transaction(tx => this.creditPurchase(tx, input));
  }

  async creditPurchase(
    tx: PoolClient,
    input: {
      sourceUserId: string;
      sourceType: string;
      sourceId: string;
      grossAmountSatang: number;
      currency?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    const gross = Math.trunc(Number(input.grossAmountSatang || 0));
    if (gross <= 0) return [];

    const created: any[] = [];
    const visited = new Set<string>([input.sourceUserId]);
    let childUserId = input.sourceUserId;
    const holdDays = this.holdDays();

    for (const tier of REFERRAL_LEVELS) {
      const relation = (await tx.query(
        `SELECT child.referred_by_user_id AS sponsor_id,
                sponsor.status AS sponsor_status
         FROM users child
         LEFT JOIN users sponsor ON sponsor.id=child.referred_by_user_id
         WHERE child.id=$1`,
        [childUserId]
      )).rows[0];

      const sponsorId = String(relation?.sponsor_id || "");
      if (!sponsorId || visited.has(sponsorId)) break;
      visited.add(sponsorId);

      if (relation?.sponsor_status === "ACTIVE") {
        const commission = Math.max(
          0,
          Math.round(gross * tier.rateBps / 10000)
        );
        if (commission > 0) {
          const row = (await tx.query(
            `INSERT INTO referral_commissions(
               beneficiary_user_id,source_user_id,source_type,source_id,
               level,rate_bps,gross_amount_satang,commission_amount_satang,
               currency,status,available_at,metadata
             ) VALUES(
               $1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',
               now()+make_interval(days=>$10::int),$11::jsonb
             )
             ON CONFLICT(source_type,source_id,beneficiary_user_id,level)
             DO NOTHING
             RETURNING *`,
            [
              sponsorId,
              input.sourceUserId,
              String(input.sourceType || "PURCHASE").slice(0, 40),
              input.sourceId,
              tier.level,
              tier.rateBps,
              gross,
              commission,
              String(input.currency || "THB").toUpperCase().slice(0, 8),
              holdDays,
              JSON.stringify(input.metadata || {})
            ]
          )).rows[0];
          if (row) {
            await tx.query(
              `INSERT INTO commission_wallet_ledger(
                 entry_key,beneficiary_user_id,commission_id,event_type,
                 pending_delta_satang,available_delta_satang,paid_delta_satang,
                 currency,source_type,source_id,level,rate_bps,metadata,created_at
               )
               VALUES(
                 'earn:' || $1::text,$2,$1,'COMMISSION_EARN',
                 $3,0,0,$4,$5,$6,$7,$8,$9::jsonb,$10
               )
               ON CONFLICT(entry_key) DO NOTHING`,
              [
                row.id,
                row.beneficiary_user_id,
                Number(row.commission_amount_satang || 0),
                row.currency,
                row.source_type,
                row.source_id,
                Number(row.level),
                Number(row.rate_bps),
                JSON.stringify({
                  grossAmountSatang: Number(row.gross_amount_satang || 0),
                  availableAt: row.available_at,
                  source: "referral_credit"
                }),
                row.created_at
              ]
            );
            created.push(row);
          }
        }
      }

      childUserId = sponsorId;
    }

    return created;
  }
}
