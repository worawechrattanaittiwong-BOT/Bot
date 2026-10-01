import {
  Controller,
  Get,
  Header,
  Req,
  UseGuards
} from "@nestjs/common";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";

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

  @Get()
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  async overview(@Req() req: any) {
    const actor = req.user as FleetActor;
    const elevated = this.elevated(actor);
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
      `WITH basket_stats AS (
         SELECT
           tj.mt5_account_id,
           COUNT(*)::int AS closed_baskets,
           COUNT(*) FILTER (WHERE tj.net_profit>0)::int AS wins,
           COUNT(*) FILTER (WHERE tj.net_profit<0)::int AS losses,
           COALESCE(SUM(tj.net_profit),0)::float8 AS net_profit,
           COALESCE(SUM(tj.net_profit) FILTER (WHERE tj.net_profit>0),0)::float8 AS gross_profit,
           ABS(COALESCE(SUM(tj.net_profit) FILTER (WHERE tj.net_profit<0),0))::float8 AS gross_loss,
           COALESCE(AVG(tj.net_profit) FILTER (WHERE tj.net_profit>0),0)::float8 AS average_win,
           COALESCE(AVG(tj.net_profit) FILTER (WHERE tj.net_profit<0),0)::float8 AS average_loss,
           COUNT(*) FILTER (
             WHERE tj.created_at >= (
               date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok')
               AT TIME ZONE 'Asia/Bangkok'
             )
           )::int AS today_baskets,
           COUNT(*) FILTER (
             WHERE tj.net_profit>0
               AND tj.created_at >= (
                 date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok')
                 AT TIME ZONE 'Asia/Bangkok'
               )
           )::int AS today_wins,
           COUNT(*) FILTER (
             WHERE tj.net_profit<0
               AND tj.created_at >= (
                 date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok')
                 AT TIME ZONE 'Asia/Bangkok'
               )
           )::int AS today_losses,
           COALESCE(SUM(tj.net_profit) FILTER (
             WHERE tj.created_at >= (
               date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok')
               AT TIME ZONE 'Asia/Bangkok'
             )
           ),0)::float8 AS today_net_profit,
           COUNT(*) FILTER (WHERE tj.created_at>=now()-interval '30 days')::int AS baskets_30d,
           COALESCE(SUM(tj.net_profit) FILTER (WHERE tj.created_at>=now()-interval '30 days'),0)::float8 AS net_profit_30d,
           MAX(tj.created_at) AS latest_basket_at
         FROM trade_journal tj
         WHERE tj.event_type='BASKET'
           AND tj.mt5_account_id IS NOT NULL
         GROUP BY tj.mt5_account_id
       ),
       entry_stats AS (
         SELECT
           tj.mt5_account_id,
           COUNT(*)::int AS entries,
           COALESCE(SUM(tj.volume),0)::float8 AS total_entry_lots,
           COUNT(*) FILTER (
             WHERE tj.created_at >= (
               date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok')
               AT TIME ZONE 'Asia/Bangkok'
             )
           )::int AS entries_today,
           MAX(tj.created_at) AS latest_entry_at
         FROM trade_journal tj
         WHERE tj.event_type='ENTRY'
           AND tj.mt5_account_id IS NOT NULL
         GROUP BY tj.mt5_account_id
       ),
       curve AS (
         SELECT
           tj.mt5_account_id,
           tj.id,
           tj.created_at,
           SUM(tj.net_profit::float8) OVER (
             PARTITION BY tj.mt5_account_id
             ORDER BY tj.created_at,tj.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS cumulative_net
         FROM trade_journal tj
         WHERE tj.event_type='BASKET'
           AND tj.mt5_account_id IS NOT NULL
       ),
       curve_peak AS (
         SELECT
           c.*,
           MAX(c.cumulative_net) OVER (
             PARTITION BY c.mt5_account_id
             ORDER BY c.created_at,c.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS peak_cumulative
         FROM curve c
       ),
       drawdown_ranked AS (
         SELECT
           cp.mt5_account_id,
           GREATEST(0,cp.peak_cumulative-cp.cumulative_net)::float8 AS drawdown_money,
           cp.peak_cumulative::float8 AS peak_cumulative,
           ROW_NUMBER() OVER (
             PARTITION BY cp.mt5_account_id
             ORDER BY
               (cp.peak_cumulative-cp.cumulative_net) DESC,
               cp.created_at DESC,
               cp.id DESC
           ) AS rn
         FROM curve_peak cp
       ),
       drawdown AS (
         SELECT mt5_account_id,drawdown_money,peak_cumulative
         FROM drawdown_ranked
         WHERE rn=1
       )
       SELECT
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
         account_user.email AS account_user_email,
         COALESCE(bs.closed_baskets,0)::int AS closed_baskets,
         COALESCE(bs.wins,0)::int AS wins,
         COALESCE(bs.losses,0)::int AS losses,
         COALESCE(bs.net_profit,0)::float8 AS net_profit,
         COALESCE(bs.gross_profit,0)::float8 AS gross_profit,
         COALESCE(bs.gross_loss,0)::float8 AS gross_loss,
         COALESCE(bs.average_win,0)::float8 AS average_win,
         COALESCE(bs.average_loss,0)::float8 AS average_loss,
         COALESCE(bs.today_baskets,0)::int AS today_baskets,
         COALESCE(bs.today_wins,0)::int AS today_wins,
         COALESCE(bs.today_losses,0)::int AS today_losses,
         COALESCE(bs.today_net_profit,0)::float8 AS today_net_profit,
         COALESCE(bs.baskets_30d,0)::int AS baskets_30d,
         COALESCE(bs.net_profit_30d,0)::float8 AS net_profit_30d,
         bs.latest_basket_at,
         COALESCE(es.entries,0)::int AS entries,
         COALESCE(es.total_entry_lots,0)::float8 AS total_entry_lots,
         COALESCE(es.entries_today,0)::int AS entries_today,
         es.latest_entry_at,
         COALESCE(dd.drawdown_money,0)::float8 AS max_drawdown_money,
         COALESCE(dd.peak_cumulative,0)::float8 AS drawdown_peak_cumulative
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
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id ${accountOwnershipGuard}
       LEFT JOIN users account_user ON account_user.id=a.user_id
       LEFT JOIN basket_stats bs ON bs.mt5_account_id=a.id
       LEFT JOIN entry_stats es ON es.mt5_account_id=a.id
       LEFT JOIN drawdown dd ON dd.mt5_account_id=a.id
       WHERE ls.status<>'DELETED'
         ${customerSlotScope}
       ORDER BY
         COALESCE(account_user.user_code,au.user_code,ou.user_code),
         CASE WHEN ls.mode='CLOUD' THEN 0 ELSE 1 END,
         ls.slot_number,
         ls.created_at`,
      params
    );

    const now = Date.now();
    const slots = (result.rows || []).map((row: any) => {
      const metrics = row.metrics || {};
      const balance = this.number(metrics.balance);
      const equity = this.number(metrics.equity, balance);
      const netProfit = this.number(row.net_profit);
      const grossProfit = this.number(row.gross_profit);
      const grossLoss = this.number(row.gross_loss);
      const closedBaskets = Math.max(0, this.number(row.closed_baskets));
      const wins = Math.max(0, this.number(row.wins));
      const losses = Math.max(0, this.number(row.losses));
      const derivedStartCapital = balance > 0
        ? balance - netProfit
        : 0;
      const maxDrawdownMoney = Math.max(0, this.number(row.max_drawdown_money));
      const peakBalanceAtMaxDrawdown =
        derivedStartCapital > 0
          ? derivedStartCapital + this.number(row.drawdown_peak_cumulative)
          : 0;
      const maxDrawdownPercent =
        peakBalanceAtMaxDrawdown > 0
          ? maxDrawdownMoney / peakBalanceAtMaxDrawdown * 100
          : 0;
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
        : this.number(row.today_net_profit);
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
          todayNetProfitJournal: this.number(row.today_net_profit),
          netProfit,
          netProfit30d: this.number(row.net_profit_30d),
          grossProfit,
          grossLoss,
          averageWin: this.number(row.average_win),
          averageLoss: this.number(row.average_loss),
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
          todayBaskets: Math.max(0, this.number(row.today_baskets)),
          todayWins: Math.max(0, this.number(row.today_wins)),
          todayLosses: Math.max(0, this.number(row.today_losses)),
          baskets30d: Math.max(0, this.number(row.baskets_30d)),
          entries: Math.max(0, this.number(row.entries)),
          entriesToday: Math.max(0, this.number(row.entries_today)),
          totalEntryLots: Math.max(0, this.number(row.total_entry_lots)),
          latestBasketAt: row.latest_basket_at || null,
          latestEntryAt: row.latest_entry_at || null
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
      source: {
        live: "bot_instances.metrics / EA heartbeat",
        performance: "trade_journal",
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
