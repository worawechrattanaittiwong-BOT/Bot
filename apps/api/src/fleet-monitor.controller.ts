import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";
import { reconstructCompletedJournal } from "./performance-journal";

type FleetActor = {
  sub: string;
  role?: string;
};

@Controller("fleet-monitor")
@UseGuards(JwtGuard)
export class FleetMonitorController {
  constructor(private readonly db: DbService) {}

  private elevated(actor: FleetActor) {
    return actor?.role === "OWNER" || actor?.role === "ADMIN";
  }

  private number(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private dateParam(value: unknown, label: string) {
    const text = String(value || "").trim();
    if (!text) return null;
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) {
      throw new BadRequestException(label + " ไม่ใช่วันเวลาที่ถูกต้อง");
    }
    return date;
  }

  @Get()
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  async overview(
    @Req() req: any,
    @Query("from") fromRaw = "",
    @Query("to") toRaw = ""
  ) {
    const actor = req.user as FleetActor;
    const elevated = this.elevated(actor);
    const fromAt = this.dateParam(fromRaw, "เวลาเริ่มต้น");
    const toAt = this.dateParam(toRaw, "เวลาสิ้นสุด");
    if (fromAt && toAt && fromAt.getTime() >= toAt.getTime()) {
      throw new BadRequestException("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น");
    }
    const self = await this.db.one(
      "SELECT id,user_code,email,role,status FROM users WHERE id=$1",
      [actor.sub]
    );

    const params = elevated ? [] : [actor.sub];
    const customerSlotScope = elevated ? "" : "AND ls.assigned_user_id=$1";
    const instanceOwnershipGuard = elevated
      ? ""
      : `AND (
           bi0.mt5_account_id IS NULL
           OR EXISTS (
             SELECT 1
             FROM mt5_accounts own_account
             WHERE own_account.id=bi0.mt5_account_id
               AND own_account.user_id=$1
           )
         )`;
    const accountOwnershipGuard = elevated ? "" : "AND a.user_id=$1";

    const result = await this.db.query(
      `SELECT
         ls.id AS slot_id,
         ls.slot_number,
         ls.label AS slot_label,
         ls.mode AS slot_mode,
         ls.slot_type,
         ls.status AS slot_status,
         ls.created_at AS slot_created_at,
         ou.user_code AS owner_user_code,
         au.user_code AS assigned_user_code,
         au.email AS assigned_email,
         sub.status AS subscription_status,
         sub.starts_at AS subscription_starts_at,
         sub.expires_at AS subscription_expires_at,
         p.code AS plan_code,
         p.name_th AS plan_name,
         bi.id AS instance_id,
         bi.mode AS instance_mode,
         bi.actual_state,
         bi.desired_state,
         bi.last_seen_at,
         bi.metrics,
         wn.region AS runner_region,
         wn.hostname AS runner_hostname,
         wn.last_seen_at AS runner_last_seen_at,
         a.id AS account_id,
         a.user_id AS account_user_id,
         a.account_number,
         a.broker,
         a.broker_server,
         a.mode AS account_mode,
         a.status AS account_status,
         account_user.user_code AS account_user_code,
         account_user.email AS account_user_email
       FROM license_slots ls
       JOIN users ou ON ou.id=ls.owner_user_id
       LEFT JOIN users au ON au.id=ls.assigned_user_id
       LEFT JOIN subscriptions sub ON sub.id=ls.subscription_id
       LEFT JOIN plans p ON p.id=sub.plan_id
       LEFT JOIN LATERAL (
         SELECT bi0.*
         FROM bot_instances bi0
         WHERE bi0.slot_id=ls.id
           ${instanceOwnershipGuard}
         ORDER BY bi0.last_seen_at DESC NULLS LAST,bi0.id
         LIMIT 1
       ) bi ON true
       LEFT JOIN worker_nodes wn ON wn.runner_id=bi.runner_id
       JOIN mt5_accounts a ON a.id=bi.mt5_account_id AND a.status='ACTIVE' ${accountOwnershipGuard}
       LEFT JOIN users account_user ON account_user.id=a.user_id
       WHERE ls.status<>'DELETED'
         ${customerSlotScope}
       ORDER BY
         COALESCE(account_user.user_code,au.user_code,ou.user_code),
         CASE WHEN ls.mode='CLOUD' THEN 0 ELSE 1 END,
         ls.slot_number,
         ls.created_at`,
      params
    );

    // PERFORMANCE_ACTUAL_DEALS_V1: Fleet Monitor uses the same canonical
    // ENTRY/EXIT reconstruction as Performance Analytics. Raw legacy BASKET
    // rows are not authoritative and may be absent entirely.
    const accountIds = Array.from(new Set(
      (result.rows || [])
        .map((row: any) => String(row.account_id || "").trim())
        .filter(Boolean)
    ));
    const journalResult = accountIds.length
      ? await this.db.query(
          `WITH journal_source AS (
             SELECT
               tj.mt5_account_id,
               tj.id,
               tj.deal_ticket,
               tj.position_id,
               tj.event_type,
               tj.direction,
               tj.volume::float8,
               tj.price::float8,
               tj.net_profit::float8,
               tj.entry_model,
               tj.entry_trigger,
               tj.entry_quality_score::float8,
               tj.confidence::float8,
               tj.created_at,
               tj.metadata,
               COALESCE(
                 CASE
                   WHEN (tj.metadata->>'dealTimeMsc') ~ '^[0-9]+$'
                     AND (tj.metadata->>'dealTimeMsc')::numeric > 0
                   THEN to_timestamp(
                     (tj.metadata->>'dealTimeMsc')::double precision / 1000.0 -
                     CASE
                       WHEN (tj.metadata->>'brokerUtcOffsetSeconds') ~ '^-?[0-9]+$'
                       THEN (tj.metadata->>'brokerUtcOffsetSeconds')::double precision
                       ELSE 0
                     END
                   )
                   WHEN (tj.metadata->>'dealTime') ~ '^[0-9]+$'
                     AND (tj.metadata->>'dealTime')::numeric > 0
                   THEN to_timestamp(
                     (tj.metadata->>'dealTime')::double precision -
                     CASE
                       WHEN (tj.metadata->>'brokerUtcOffsetSeconds') ~ '^-?[0-9]+$'
                       THEN (tj.metadata->>'brokerUtcOffsetSeconds')::double precision
                       ELSE 0
                     END
                   )
                   ELSE NULL
                 END,
                 tj.created_at
               ) AS event_at
             FROM trade_journal tj
             WHERE tj.mt5_account_id=ANY($1::uuid[])
               AND tj.event_type IN ('ENTRY','EXIT')
           )
           SELECT *
           FROM journal_source
           WHERE ($2::timestamptz IS NULL OR event_at >= $2::timestamptz)
             AND ($3::timestamptz IS NULL OR event_at <= $3::timestamptz)
           ORDER BY mt5_account_id,event_at ASC,created_at ASC,id ASC`,
          [
            accountIds,
            fromAt ? fromAt.toISOString() : null,
            toAt ? toAt.toISOString() : null
          ]
        )
      : { rows: [] as any[] };

    const journalRowsByAccount = new Map<string, any[]>();
    for (const row of journalResult.rows || []) {
      const accountId = String(row.mt5_account_id || "");
      const rows = journalRowsByAccount.get(accountId) || [];
      rows.push(row);
      journalRowsByAccount.set(accountId, rows);
    }

    const now = Date.now();
    const bangkokDayKey = new Date(
      now + 7 * 60 * 60 * 1000
    ).toISOString().slice(0, 10);
    const bangkokDayStartMs = new Date(
      bangkokDayKey + "T00:00:00.000+07:00"
    ).getTime();
    const trailing30dStartMs = now - 30 * 24 * 60 * 60 * 1000;
    const eventTimeMs = (row: any) =>
      new Date(row?.event_at || row?.created_at || 0).getTime();

    const journalStatsByAccount = new Map<string, any>();
    for (const accountId of accountIds) {
      const accountRows = journalRowsByAccount.get(accountId) || [];
      const reconstructed = reconstructCompletedJournal(accountRows);
      const baskets = reconstructed.baskets;
      const positions = reconstructed.positions;
      const entries = accountRows.filter(
        (row: any) => String(row.event_type || "").toUpperCase() === "ENTRY"
      );
      const netValues = accountRows.map(
        (row: any) => this.number(row.net_profit)
      );
      const positiveDeals = netValues.filter((value: number) => value > 0);
      const negativeDeals = netValues.filter((value: number) => value < 0);
      const grossProfit = positiveDeals.reduce(
        (sum: number, value: number) => sum + value, 0
      );
      const grossLoss = Math.abs(negativeDeals.reduce(
        (sum: number, value: number) => sum + value, 0
      ));
      const todayBaskets = baskets.filter(
        (basket: any) => new Date(basket.created_at).getTime() >= bangkokDayStartMs
      );
      const baskets30d = baskets.filter(
        (basket: any) => new Date(basket.created_at).getTime() >= trailing30dStartMs
      );
      const todayRows = accountRows.filter(
        (row: any) => eventTimeMs(row) >= bangkokDayStartMs
      );
      const rows30d = accountRows.filter(
        (row: any) => eventTimeMs(row) >= trailing30dStartMs
      );
      const entriesToday = entries.filter(
        (row: any) => eventTimeMs(row) >= bangkokDayStartMs
      );

      journalStatsByAccount.set(accountId, {
        closedBaskets: baskets.length,
        wins: baskets.filter((basket: any) => this.number(basket.net_profit) > 0).length,
        losses: baskets.filter((basket: any) => this.number(basket.net_profit) < 0).length,
        netProfit: netValues.reduce(
          (sum: number, value: number) => sum + value, 0
        ),
        grossProfit,
        grossLoss,
        averageWin: positiveDeals.length
          ? grossProfit / positiveDeals.length
          : 0,
        averageLoss: negativeDeals.length
          ? -grossLoss / negativeDeals.length
          : 0,
        todayBaskets: todayBaskets.length,
        todayWins: todayBaskets.filter(
          (basket: any) => this.number(basket.net_profit) > 0
        ).length,
        todayLosses: todayBaskets.filter(
          (basket: any) => this.number(basket.net_profit) < 0
        ).length,
        todayNetProfit: todayRows.reduce(
          (sum: number, row: any) => sum + this.number(row.net_profit), 0
        ),
        baskets30d: baskets30d.length,
        netProfit30d: rows30d.reduce(
          (sum: number, row: any) => sum + this.number(row.net_profit), 0
        ),
        entries: entries.length,
        entriesToday: entriesToday.length,
        totalEntryLots: entries.reduce(
          (sum: number, row: any) => sum + Math.max(0, this.number(row.volume)), 0
        ),
        latestBasketAt: baskets.length
          ? baskets[baskets.length - 1].created_at
          : null,
        latestEntryAt: entries.length
          ? entries[entries.length - 1].event_at || entries[entries.length - 1].created_at
          : null,
        positionProfits: positions.map(
          (position: any) => this.number(position.net_profit)
        )
      });
    }

    const slots = (result.rows || []).map((row: any) => {
      const metrics = row.metrics || {};
      const journal = journalStatsByAccount.get(String(row.account_id || "")) || {};
      const balance = this.number(metrics.balance);
      const equity = this.number(metrics.equity, balance);
      const netProfit = this.number(journal.netProfit);
      const grossProfit = this.number(journal.grossProfit);
      const grossLoss = this.number(journal.grossLoss);
      const closedBaskets = Math.max(0, this.number(journal.closedBaskets));
      const wins = Math.max(0, this.number(journal.wins));
      const losses = Math.max(0, this.number(journal.losses));
      const derivedStartCapital = balance > 0
        ? balance - netProfit
        : 0;
      let curveBalance = derivedStartCapital;
      let curvePeak = curveBalance;
      let maxDrawdownMoney = 0;
      let maxDrawdownPercent = 0;
      for (const positionProfit of journal.positionProfits || []) {
        curveBalance += this.number(positionProfit);
        curvePeak = Math.max(curvePeak, curveBalance);
        const drawdownMoney = Math.max(0, curvePeak - curveBalance);
        const drawdownPercent = curvePeak > 0
          ? drawdownMoney / curvePeak * 100
          : 0;
        maxDrawdownMoney = Math.max(maxDrawdownMoney, drawdownMoney);
        maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
      }
      const heartbeatAgeSeconds = row.last_seen_at
        ? Math.max(0, (now - new Date(row.last_seen_at).getTime()) / 1000)
        : null;
      const runnerAgeSeconds = row.runner_last_seen_at
        ? Math.max(0, (now - new Date(row.runner_last_seen_at).getTime()) / 1000)
        : null;
      const heartbeatOnline = heartbeatAgeSeconds !== null && heartbeatAgeSeconds <= 35;
      const runnerOnline = runnerAgeSeconds !== null && runnerAgeSeconds <= 120;
      const floatingProfit = Number.isFinite(Number(metrics.botFloatingProfit))
        ? this.number(metrics.botFloatingProfit)
        : equity - balance;
      const reportedTodayClosed = Number(metrics.botTodayClosedProfit);
      const todayClosedProfit = Number.isFinite(reportedTodayClosed)
        ? reportedTodayClosed
        : this.number(journal.todayNetProfit);
      const profitFactor = grossLoss > 0
        ? grossProfit / grossLoss
        : grossProfit > 0 ? 999 : 0;
      const winRate = closedBaskets > 0 ? wins / closedBaskets * 100 : 0;
      const returnPercent =
        derivedStartCapital > 0 ? netProfit / derivedStartCapital * 100 : 0;

      return {
        slotId: row.slot_id,
        slotNumber: this.number(row.slot_number),
        slotLabel: row.slot_label || null,
        slotMode: String(row.slot_mode || ""),
        slotType: String(row.slot_type || ""),
        slotStatus: String(row.slot_status || ""),
        ownerUserCode: row.owner_user_code || null,
        assignedUserCode: row.assigned_user_code || null,
        assignedEmail: elevated ? row.assigned_email || null : null,
        subscription: {
          status: row.subscription_status || null,
          startsAt: row.subscription_starts_at || null,
          expiresAt: row.subscription_expires_at || null,
          planCode: row.plan_code || null,
          planName: row.plan_name || null
        },
        account: row.account_id ? {
          id: row.account_id,
          userCode: row.account_user_code || row.assigned_user_code || null,
          email: elevated ? row.account_user_email || null : null,
          number: row.account_number || null,
          broker: row.broker || null,
          server: row.broker_server || null,
          mode: row.account_mode || row.instance_mode || row.slot_mode || null,
          status: row.account_status || null
        } : null,
        runtime: {
          instanceId: row.instance_id || null,
          actualState: row.actual_state || null,
          desiredState: row.desired_state || null,
          heartbeatOnline,
          heartbeatAgeSeconds,
          runnerOnline,
          runnerAgeSeconds,
          runnerRegion: row.runner_region || null,
          runnerHostname: elevated ? row.runner_hostname || null : null,
          lastSeenAt: row.last_seen_at || null,
          symbol: metrics.symbol || null,
          currency: String(metrics.currency || "USD").trim().toUpperCase() || "USD",
          engineMode: metrics.engineMode || metrics.controlMode || null,
          executionStatus: metrics.executionStatus || null,
          marketRegime: metrics.marketRegime || null,
          signalConfidence: this.number(metrics.signalConfidence),
          spreadPoints: this.number(metrics.spreadPoints),
          brokerPingMs: this.number(metrics.brokerPingMs),
          adaptiveLot: this.number(metrics.adaptiveLot),
          positions: Math.max(0, Math.trunc(this.number(
            metrics.accountScenovaPositions ?? metrics.positions
          ))),
          pendingOrders: Math.max(0, Math.trunc(this.number(
            metrics.accountScenovaPendingOrders
          ))),
          consecutiveLosses: Math.max(0, Math.trunc(this.number(metrics.consecutiveLosses)))
        },
        money: {
          balance,
          equity,
          floatingProfit,
          todayClosedProfit,
          todayNetProfitJournal: this.number(journal.todayNetProfit),
          netProfit,
          netProfit30d: this.number(journal.netProfit30d),
          grossProfit,
          grossLoss,
          averageWin: this.number(journal.averageWin),
          averageLoss: this.number(journal.averageLoss),
          derivedStartCapital,
          returnPercent,
          maxDrawdownMoney,
          maxDrawdownPercent
        },
        performance: {
          closedBaskets,
          wins,
          losses,
          winRate,
          profitFactor,
          todayBaskets: Math.max(0, this.number(journal.todayBaskets)),
          todayWins: Math.max(0, this.number(journal.todayWins)),
          todayLosses: Math.max(0, this.number(journal.todayLosses)),
          baskets30d: Math.max(0, this.number(journal.baskets30d)),
          entries: Math.max(0, this.number(journal.entries)),
          entriesToday: Math.max(0, this.number(journal.entriesToday)),
          totalEntryLots: Math.max(0, this.number(journal.totalEntryLots)),
          latestBasketAt: journal.latestBasketAt || null,
          latestEntryAt: journal.latestEntryAt || null
        }
      };
    });

    const currencyMap = new Map<string, {
      currency: string;
      accounts: number;
      balance: number;
      equity: number;
      floatingProfit: number;
      todayClosedProfit: number;
      netProfit: number;
      netProfit30d: number;
    }>();

    let online = 0;
    let running = 0;
    let stopped = 0;
    let offline = 0;
    let empty = 0;
    let totalPositions = 0;
    let totalPendingOrders = 0;
    let totalClosedBaskets = 0;
    let totalWins = 0;
    let highestMaxDrawdownPercent = 0;

    for (const slot of slots) {
      const hasAccount = Boolean(slot.account?.id);
      const heartbeatOnline = Boolean(slot.runtime.heartbeatOnline);
      const actualState = String(slot.runtime.actualState || "").toUpperCase();

      if (!hasAccount) empty += 1;
      if (heartbeatOnline) online += 1;
      if (heartbeatOnline && actualState === "RUNNING") running += 1;
      else if (hasAccount && heartbeatOnline) stopped += 1;
      else if (hasAccount) offline += 1;

      totalPositions += this.number(slot.runtime.positions);
      totalPendingOrders += this.number(slot.runtime.pendingOrders);
      totalClosedBaskets += this.number(slot.performance.closedBaskets);
      totalWins += this.number(slot.performance.wins);
      highestMaxDrawdownPercent = Math.max(
        highestMaxDrawdownPercent,
        this.number(slot.money.maxDrawdownPercent)
      );

      if (hasAccount) {
        const currency = String(slot.runtime.currency || "USD").toUpperCase();
        const current = currencyMap.get(currency) || {
          currency,
          accounts: 0,
          balance: 0,
          equity: 0,
          floatingProfit: 0,
          todayClosedProfit: 0,
          netProfit: 0,
          netProfit30d: 0
        };
        current.accounts += 1;
        current.balance += this.number(slot.money.balance);
        current.equity += this.number(slot.money.equity);
        current.floatingProfit += this.number(slot.money.floatingProfit);
        current.todayClosedProfit += this.number(slot.money.todayClosedProfit);
        current.netProfit += this.number(slot.money.netProfit);
        current.netProfit30d += this.number(slot.money.netProfit30d);
        currencyMap.set(currency, current);
      }
    }

    return {
      user: self,
      elevated,
      scope: elevated ? "ALL_SLOTS" : "OWN_ASSIGNED_SLOTS",
      generatedAt: new Date().toISOString(),
      period: {
        from: fromAt ? fromAt.toISOString() : null,
        to: toAt ? toAt.toISOString() : null,
        timezone: "Asia/Bangkok"
      },
      source: {
        live: "bot_instances.metrics / EA heartbeat",
        performance: "trade_journal ENTRY/EXIT + reconstructCompletedJournal",
        fundingHistory: "NOT_REPORTED_BY_CURRENT_EA"
      },
      summary: {
        totalSlots: slots.length,
        connectedAccounts: slots.filter((slot: any) => Boolean(slot.account?.id)).length,
        online,
        running,
        stopped,
        offline,
        empty,
        totalPositions,
        totalPendingOrders,
        totalClosedBaskets,
        totalWins,
        winRate: totalClosedBaskets > 0 ? totalWins / totalClosedBaskets * 100 : 0,
        highestMaxDrawdownPercent,
        currencyTotals: Array.from(currencyMap.values()).sort((a,b) =>
          a.currency.localeCompare(b.currency)
        )
      },
      slots
    };
  }
}
