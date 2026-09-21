import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Query,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";

type Actor = { sub: string; role?: string };
type BasketRow = {
  direction: string;
  net_profit: number | string;
  created_at: string;
  metadata?: Record<string, any>;
  entry_quality_score?: number | string;
  confidence?: number | string;
};

@Controller("performance-analytics")
@UseGuards(JwtGuard)
export class PerformanceAnalyticsController {
  constructor(private readonly db: DbService) {}

  private elevated(actor: Actor) {
    return actor?.role === "OWNER" || actor?.role === "ADMIN";
  }

  private range(fromRaw = "", toRaw = "") {
    const now = new Date();
    const to = toRaw ? new Date(toRaw + (toRaw.length <= 10 ? "T23:59:59.999+07:00" : "")) : now;
    const from = fromRaw
      ? new Date(fromRaw + (fromRaw.length <= 10 ? "T00:00:00.000+07:00" : ""))
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      throw new BadRequestException("invalid performance date range");
    }
    if (to.getTime() - from.getTime() > 730 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("performance range cannot exceed 730 days");
    }
    return { from, to };
  }

  private dayKey(value: string | Date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
  }

  private monthKey(value: string | Date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(new Date(value));
    const year = parts.find((part) => part.type === "year")?.value || "0000";
    const month = parts.find((part) => part.type === "month")?.value || "00";
    return `${year}-${month}`;
  }

  private clamp(value: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  private summarize(rows: BasketRow[], startBalance: number | null) {
    const trades = rows.length;
    const wins = rows.filter((row) => Number(row.net_profit) > 0).length;
    const losses = rows.filter((row) => Number(row.net_profit) < 0).length;
    const breakeven = trades - wins - losses;
    const grossProfit = rows.reduce((sum, row) => sum + Math.max(0, Number(row.net_profit || 0)), 0);
    const grossLoss = rows.reduce((sum, row) => sum + Math.abs(Math.min(0, Number(row.net_profit || 0))), 0);
    const netProfit = grossProfit - grossLoss;
    const decided = wins + losses;

    let running = startBalance ?? 0;
    let peak = running;
    let maxDrawdownMoney = 0;
    let maxDrawdownPercent = 0;
    const curve: Array<{ time: string; balance: number; equity: number; drawdownPercent: number }> = [];

    for (const row of rows) {
      running += Number(row.net_profit || 0);
      peak = Math.max(peak, running);
      const ddMoney = Math.max(0, peak - running);
      const ddPercent = startBalance !== null && peak > 0 ? ddMoney / peak * 100 : 0;
      maxDrawdownMoney = Math.max(maxDrawdownMoney, ddMoney);
      maxDrawdownPercent = Math.max(maxDrawdownPercent, ddPercent);
      curve.push({
        time: row.created_at,
        balance: Number(running.toFixed(2)),
        equity: Number(running.toFixed(2)),
        drawdownPercent: Number(ddPercent.toFixed(3))
      });
    }

    const byDay = new Map<string, number>();
    const byMonth = new Map<string, { profit: number; trades: number; wins: number }>();
    let buyTrades = 0;
    let sellTrades = 0;
    let buyWins = 0;
    let sellWins = 0;
    let executionTotal = 0;
    let executionSamples = 0;

    for (const row of rows) {
      const profit = Number(row.net_profit || 0);
      const day = this.dayKey(row.created_at);
      byDay.set(day, (byDay.get(day) || 0) + profit);
      const month = this.monthKey(row.created_at);
      const monthly = byMonth.get(month) || { profit: 0, trades: 0, wins: 0 };
      monthly.profit += profit;
      monthly.trades += 1;
      if (profit > 0) monthly.wins += 1;
      byMonth.set(month, monthly);
      if (String(row.direction).toUpperCase() === "BUY") {
        buyTrades += 1;
        if (profit > 0) buyWins += 1;
      }
      if (String(row.direction).toUpperCase() === "SELL") {
        sellTrades += 1;
        if (profit > 0) sellWins += 1;
      }
      const metadataExecution = Number(row.metadata?.indicatorExecutionScore);
      const fallbackExecution = Number(row.entry_quality_score || row.confidence || 0);
      const execution = Number.isFinite(metadataExecution) && metadataExecution > 0
        ? metadataExecution
        : fallbackExecution;
      if (Number.isFinite(execution) && execution > 0) {
        executionTotal += this.clamp(execution);
        executionSamples += 1;
      }
    }

    const dailyReturns = Array.from(byDay.values()).map((profit) =>
      startBalance && startBalance > 0 ? profit / startBalance : 0
    );
    let sharpeRatio: number | null = null;
    if (startBalance && startBalance > 0 && dailyReturns.length >= 2) {
      const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
        Math.max(1, dailyReturns.length - 1);
      const sd = Math.sqrt(variance);
      sharpeRatio = sd > 0 ? mean / sd * Math.sqrt(252) : null;
    }

    let rollingBalance = startBalance ?? 0;
    const monthly = Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => {
      const monthStart = rollingBalance;
      rollingBalance += value.profit;
      return {
        month,
        profit: Number(value.profit.toFixed(2)),
        returnPercent: startBalance !== null && monthStart > 0
          ? Number((value.profit / monthStart * 100).toFixed(2))
          : null,
        trades: value.trades,
        winRate: value.trades > 0 ? Number((value.wins / value.trades * 100).toFixed(2)) : 0
      };
    });

    const positiveValues = rows.map((row) => Number(row.net_profit || 0)).filter((value) => value > 0);
    const negativeValues = rows.map((row) => Number(row.net_profit || 0)).filter((value) => value < 0);
    const expectedPayoff = trades > 0 ? netProfit / trades : 0;
    const averageProfitTrade = positiveValues.length > 0
      ? positiveValues.reduce((sum, value) => sum + value, 0) / positiveValues.length
      : 0;
    const averageLossTrade = negativeValues.length > 0
      ? negativeValues.reduce((sum, value) => sum + value, 0) / negativeValues.length
      : 0;

    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let currentWinProfit = 0;
    let currentLossValue = 0;
    let maxWinStreakProfit = 0;
    let maxLossStreakLoss = 0;
    let winStreakRuns = 0;
    let lossStreakRuns = 0;
    let totalWinStreakTrades = 0;
    let totalLossStreakTrades = 0;
    for (const row of rows) {
      const value = Number(row.net_profit || 0);
      if (value > 0) {
        if (currentWinStreak === 0) winStreakRuns += 1;
        currentWinStreak += 1;
        currentWinProfit += value;
        currentLossStreak = 0;
        currentLossValue = 0;
        totalWinStreakTrades += 1;
        if (currentWinStreak > maxWinStreak) {
          maxWinStreak = currentWinStreak;
          maxWinStreakProfit = currentWinProfit;
        } else if (currentWinStreak === maxWinStreak) {
          maxWinStreakProfit = Math.max(maxWinStreakProfit, currentWinProfit);
        }
      } else if (value < 0) {
        if (currentLossStreak === 0) lossStreakRuns += 1;
        currentLossStreak += 1;
        currentLossValue += value;
        currentWinStreak = 0;
        currentWinProfit = 0;
        totalLossStreakTrades += 1;
        if (currentLossStreak > maxLossStreak) {
          maxLossStreak = currentLossStreak;
          maxLossStreakLoss = currentLossValue;
        } else if (currentLossStreak === maxLossStreak) {
          maxLossStreakLoss = Math.min(maxLossStreakLoss, currentLossValue);
        }
      } else {
        currentWinStreak = 0;
        currentLossStreak = 0;
        currentWinProfit = 0;
        currentLossValue = 0;
      }
    }

    const positiveMonths = monthly.filter((item) => item.profit > 0).length;
    const positiveMonthRate = monthly.length > 0 ? positiveMonths / monthly.length * 100 : 50;
    const winRate = decided > 0 ? wins / decided * 100 : 0;
    const stability = this.clamp(positiveMonthRate * 0.7 + Math.min(100, trades * 2) * 0.3);
    const riskControl = startBalance !== null ? this.clamp(100 - maxDrawdownPercent * 5) : 50;
    const consistency = this.clamp(winRate * 0.65 + positiveMonthRate * 0.35);
    const drawdownDiscipline = startBalance !== null ? this.clamp(100 - maxDrawdownPercent * 6) : 50;
    const executionQuality = executionSamples > 0 ? executionTotal / executionSamples : 50;
    const qualityScore = stability * 0.2 + riskControl * 0.25 + consistency * 0.2 +
      drawdownDiscipline * 0.2 + executionQuality * 0.15;

    return {
      summary: {
        trades,
        wins,
        losses,
        breakeven,
        winRate: Number(winRate.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossLoss: Number(grossLoss.toFixed(2)),
        profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : grossProfit > 0 ? 999 : 0,
        returnPercent: startBalance && startBalance > 0 ? Number((netProfit / startBalance * 100).toFixed(2)) : null,
        maxDrawdownMoney: Number(maxDrawdownMoney.toFixed(2)),
        maxDrawdownPercent: startBalance !== null ? Number(maxDrawdownPercent.toFixed(2)) : null,
        sharpeRatio: sharpeRatio === null ? null : Number(sharpeRatio.toFixed(2)),
        recoveryFactor: maxDrawdownMoney > 0 ? Number((netProfit / maxDrawdownMoney).toFixed(2)) : null,
        lossRate: Number((trades > 0 ? losses / trades * 100 : 0).toFixed(2)),
        expectedPayoff: Number(expectedPayoff.toFixed(2)),
        largestProfitTrade: positiveValues.length ? Number(Math.max(...positiveValues).toFixed(2)) : 0,
        largestLossTrade: negativeValues.length ? Number(Math.min(...negativeValues).toFixed(2)) : 0,
        averageProfitTrade: Number(averageProfitTrade.toFixed(2)),
        averageLossTrade: Number(averageLossTrade.toFixed(2)),
        maxWinStreak,
        maxWinStreakProfit: Number(maxWinStreakProfit.toFixed(2)),
        maxLossStreak,
        maxLossStreakLoss: Number(maxLossStreakLoss.toFixed(2)),
        averageWinStreak: Number((winStreakRuns > 0 ? totalWinStreakTrades / winStreakRuns : 0).toFixed(2)),
        averageLossStreak: Number((lossStreakRuns > 0 ? totalLossStreakTrades / lossStreakRuns : 0).toFixed(2)),
        buyTrades,
        sellTrades,
        buyWins,
        sellWins,
        buyWinRate: Number((buyTrades > 0 ? buyWins / buyTrades * 100 : 0).toFixed(2)),
        sellWinRate: Number((sellTrades > 0 ? sellWins / sellTrades * 100 : 0).toFixed(2))
      },
      curve,
      monthly,
      quality: {
        score: Number(qualityScore.toFixed(0)),
        stars: Number((this.clamp(qualityScore) / 20).toFixed(1)),
        methodology: "SCENOVA_HEURISTIC_V1",
        stability: Number(stability.toFixed(0)),
        riskControl: Number(riskControl.toFixed(0)),
        consistency: Number(consistency.toFixed(0)),
        drawdownDiscipline: Number(drawdownDiscipline.toFixed(0)),
        executionQuality: Number(executionQuality.toFixed(0)),
        executionSamples
      }
    };
  }

  private async accountForActor(actor: Actor, accountId: string) {
    if (!accountId) throw new BadRequestException("accountId required");
    const params: any[] = [accountId];
    const accessClause = this.elevated(actor) ? "" : " AND a.user_id=$2";
    if (!this.elevated(actor)) params.push(actor.sub);
    const account = await this.db.one(
      `SELECT
         a.id,a.user_id,a.account_number,a.broker,a.broker_server,a.mode,a.status,
         u.user_code,u.email,u.role,
         bi.id AS instance_id,bi.slot_id,bi.actual_state,bi.desired_state,bi.last_seen_at,bi.metrics,
         ls.slot_number,ls.label AS slot_label
       FROM mt5_accounts a
       JOIN users u ON u.id=a.user_id
       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
       LEFT JOIN license_slots ls ON ls.id=bi.slot_id
       WHERE a.id=$1${accessClause}
       LIMIT 1`,
      params
    );
    if (!account) throw new ForbiddenException("performance account unavailable");
    return account;
  }

  private async buildReport(actor: Actor, accountId: string, fromRaw = "", toRaw = "") {
    const { from, to } = this.range(fromRaw, toRaw);
    const account = await this.accountForActor(actor, accountId);
    const metrics = account.metrics || {};
    const currentBalance = Number(metrics.balance || 0);
    const currentEquity = Number(metrics.equity || 0);

    const basketsResult = await this.db.query(
      `SELECT direction,net_profit,created_at,metadata,entry_quality_score,confidence
       FROM trade_journal
       WHERE mt5_account_id=$1
         AND event_type='BASKET'
         AND created_at >= $2
         AND created_at <= $3
       ORDER BY created_at ASC
       LIMIT 20000`,
      [account.id, from.toISOString(), to.toISOString()]
    );
    const baskets = basketsResult.rows as BasketRow[];

    const pnlSinceFrom = await this.db.one(
      `SELECT COALESCE(SUM(net_profit),0)::float8 AS net
       FROM trade_journal
       WHERE mt5_account_id=$1
         AND event_type='BASKET'
         AND created_at >= $2`,
      [account.id, from.toISOString()]
    );
    const derivedStart = currentBalance > 0
      ? Number((currentBalance - Number(pnlSinceFrom?.net || 0)).toFixed(2))
      : null;
    const computed = this.summarize(baskets, derivedStart);

    const curveExits = await this.db.query(
      `SELECT net_profit::float8 AS net_profit,created_at
       FROM trade_journal
       WHERE mt5_account_id=$1
         AND event_type='EXIT'
         AND lower(COALESCE(metadata->>'executedByBot','true')) <> 'false'
         AND created_at >= $2
         AND created_at <= $3
       ORDER BY created_at ASC,id ASC
       LIMIT 20000`,
      [account.id, from.toISOString(), to.toISOString()]
    );
    if (derivedStart !== null && curveExits.rows.length > 0) {
      let curveBalance = derivedStart;
      let curvePeak = curveBalance;
      let curveMaxDdMoney = 0;
      let curveMaxDdPercent = 0;
      computed.curve = curveExits.rows.map((row:any) => {
        curveBalance += Number(row.net_profit || 0);
        curvePeak = Math.max(curvePeak, curveBalance);
        const ddMoney = Math.max(0, curvePeak - curveBalance);
        const ddPercent = curvePeak > 0 ? ddMoney / curvePeak * 100 : 0;
        curveMaxDdMoney = Math.max(curveMaxDdMoney, ddMoney);
        curveMaxDdPercent = Math.max(curveMaxDdPercent, ddPercent);
        return {
          time: row.created_at,
          balance: Number(curveBalance.toFixed(2)),
          equity: Number(curveBalance.toFixed(2)),
          drawdownPercent: Number(ddPercent.toFixed(3))
        };
      });
      computed.summary.maxDrawdownMoney = Number(curveMaxDdMoney.toFixed(2));
      computed.summary.maxDrawdownPercent = Number(curveMaxDdPercent.toFixed(2));
      computed.summary.recoveryFactor = curveMaxDdMoney > 0
        ? Number((computed.summary.netProfit / curveMaxDdMoney).toFixed(2))
        : computed.summary.netProfit > 0 ? 999 : null;
    }

    const exits = await this.db.query(
      `SELECT
         x.deal_ticket,x.position_id,x.direction,x.volume,x.price AS exit_price,x.net_profit,
         x.created_at AS closed_at,COALESCE(x.metadata->>'symbol',$4) AS symbol,
         e.price AS entry_price,e.created_at AS opened_at
       FROM trade_journal x
       LEFT JOIN LATERAL (
         SELECT price,created_at
         FROM trade_journal e
         WHERE e.mt5_account_id=x.mt5_account_id
           AND e.event_type='ENTRY'
           AND e.position_id=x.position_id
           AND e.created_at<=x.created_at
         ORDER BY e.created_at DESC
         LIMIT 1
       ) e ON true
       WHERE x.mt5_account_id=$1
         AND x.event_type='EXIT'
         AND x.created_at >= $2
         AND x.created_at <= $3
       ORDER BY x.created_at DESC
       LIMIT 500`,
      [account.id, from.toISOString(), to.toISOString(), String(metrics.symbol || "XAUUSD")]
    );

    const historyIdentity = await this.db.one(
      `SELECT
         NULLIF(metadata->>'currency','') AS currency,
         NULLIF(metadata->>'symbol','') AS symbol
       FROM trade_journal
       WHERE mt5_account_id=$1
       ORDER BY created_at DESC
       LIMIT 1`,
      [account.id]
    );
    const accountCurrency = String(
      metrics.currency || historyIdentity?.currency || "UNKNOWN"
    ).trim().toUpperCase() || "UNKNOWN";
    const accountSymbol = String(
      metrics.symbol || historyIdentity?.symbol || "XAUUSD"
    );

    const backtests = await this.db.query(
      `SELECT id,title,source,symbol,timeframe,started_at,ended_at,initial_deposit,lot,currency,
              summary,status,created_at
       FROM backtest_runs
       WHERE owner_user_id=$1
         AND ($2::uuid IS NULL OR slot_id=$2::uuid)
       ORDER BY created_at DESC
       LIMIT 50`,
      [account.user_id, account.slot_id || null]
    );

    const lastSeen = account.last_seen_at ? new Date(account.last_seen_at).getTime() : 0;
    const online = lastSeen > Date.now() - 35_000;
    if (computed.curve.length && currentEquity > 0 && to.getTime() > Date.now() - 5 * 60 * 1000) {
      computed.curve[computed.curve.length - 1].equity = Number(currentEquity.toFixed(2));
    }

    return {
      source: "LIVE",
      range: { from: from.toISOString(), to: to.toISOString() },
      account: {
        id: account.id,
        userId: account.user_id,
        userCode: account.user_code,
        email: account.email,
        accountNumber: account.account_number,
        broker: account.broker,
        brokerServer: account.broker_server,
        mode: account.mode,
        slotId: account.slot_id,
        slotNumber: account.slot_number,
        slotLabel: account.slot_label,
        symbol: accountSymbol,
        timeframe: String(metrics.timeframe || "M5"),
        currency: accountCurrency
      },
      status: {
        online,
        actualState: account.actual_state,
        desiredState: account.desired_state,
        lastSeenAt: account.last_seen_at || null,
        positions: Number(metrics.positions || 0),
        marketSessionState: String(metrics.marketSessionState || "UNKNOWN")
      },
      balance: {
        current: currentBalance > 0 ? currentBalance : null,
        equity: currentEquity > 0 ? currentEquity : null,
        derivedStart,
        basis: derivedStart !== null ? "DERIVED_FROM_CURRENT_BALANCE_AND_BOT_PNL" : "BOT_CLOSED_PNL_ONLY"
      },
      ...computed,
      closedTrades: exits.rows.map((row: any) => ({
        ticket: String(row.deal_ticket),
        positionId: row.position_id ? String(row.position_id) : null,
        symbol: row.symbol || accountSymbol,
        side: row.direction,
        lot: Number(row.volume || 0),
        entryPrice: row.entry_price === null ? null : Number(row.entry_price),
        exitPrice: Number(row.exit_price || 0),
        profit: Number(row.net_profit || 0),
        openedAt: row.opened_at || null,
        closedAt: row.closed_at
      })),
      backtests: backtests.rows
    };
  }

  @Get("options")
  @Header("Cache-Control", "no-store")
  async options(@Req() req: any) {
    const actor = req.user as Actor;
    const self = await this.db.one("SELECT id,user_code,email,role FROM users WHERE id=$1", [actor.sub]);
    const elevated = this.elevated(actor);
    const rows = await this.db.query(
      elevated
        ? `SELECT a.id,a.user_id,a.account_number,a.broker,a.broker_server,a.mode,a.status,
                  u.user_code,u.email,u.role,bi.id AS instance_id,bi.slot_id,ls.slot_number,ls.label AS slot_label
           FROM mt5_accounts a
           JOIN users u ON u.id=a.user_id
           LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
           LEFT JOIN license_slots ls ON ls.id=bi.slot_id
           ORDER BY u.user_code,a.created_at,a.account_number`
        : `SELECT a.id,a.user_id,a.account_number,a.broker,a.broker_server,a.mode,a.status,
                  u.user_code,u.email,u.role,bi.id AS instance_id,bi.slot_id,ls.slot_number,ls.label AS slot_label
           FROM mt5_accounts a
           JOIN users u ON u.id=a.user_id
           LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
           LEFT JOIN license_slots ls ON ls.id=bi.slot_id
           WHERE a.user_id=$1
           ORDER BY a.created_at,a.account_number`,
      elevated ? [] : [actor.sub]
    );
    return {
      user: self,
      elevated,
      accounts: rows.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        userCode: row.user_code,
        email: row.email,
        role: row.role,
        accountNumber: row.account_number,
        broker: row.broker,
        brokerServer: row.broker_server,
        mode: row.mode,
        status: row.status,
        instanceId: row.instance_id,
        slotId: row.slot_id,
        slotNumber: row.slot_number,
        slotLabel: row.slot_label
      }))
    };
  }

  @Get("report")
  @Header("Cache-Control", "no-store")
  async report(
    @Req() req: any,
    @Query("accountId") accountId = "",
    @Query("from") from = "",
    @Query("to") to = ""
  ) {
    return this.buildReport(req.user as Actor, accountId, from, to);
  }

  @Get("system")
  @Header("Cache-Control", "no-store")
  async system(
    @Req() req: any,
    @Query("from") fromRaw = "",
    @Query("to") toRaw = ""
  ) {
    const actor = req.user as Actor;
    if (!this.elevated(actor)) throw new ForbiddenException("owner/admin access required");
    const { from, to } = this.range(fromRaw, toRaw);

    const kpis = await this.db.one(
      `SELECT
         COUNT(DISTINCT u.id)::int AS customers,
         COUNT(DISTINCT a.id)::int AS accounts,
         COUNT(DISTINCT a.id) FILTER (WHERE bi.last_seen_at>now()-interval '35 seconds')::int AS online_accounts,
         COUNT(tj.id)::int AS trades,
         COUNT(tj.id) FILTER (WHERE tj.net_profit>0)::int AS wins,
         COUNT(tj.id) FILTER (WHERE tj.net_profit<0)::int AS losses
       FROM users u
       LEFT JOIN mt5_accounts a ON a.user_id=u.id
       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
       LEFT JOIN trade_journal tj ON tj.mt5_account_id=a.id
         AND tj.event_type='BASKET'
         AND tj.created_at >= $1
         AND tj.created_at <= $2
       WHERE u.role NOT IN ('OWNER','ADMIN')`,
      [from.toISOString(), to.toISOString()]
    );

    const accounts = await this.db.query(
      `SELECT
         u.id AS user_id,u.user_code,u.email,a.id AS account_id,a.account_number,a.broker,a.broker_server,a.mode,
         bi.id AS instance_id,bi.last_seen_at,
         COALESCE(NULLIF(bi.metrics->>'currency',''),NULLIF(MAX(tj.metadata->>'currency'),''),'UNKNOWN') AS currency,
         COUNT(tj.id)::int AS trades,
         COUNT(tj.id) FILTER (WHERE tj.net_profit>0)::int AS wins,
         COUNT(tj.id) FILTER (WHERE tj.net_profit<0)::int AS losses,
         COALESCE(SUM(tj.net_profit),0)::float8 AS net_profit
       FROM users u
       JOIN mt5_accounts a ON a.user_id=u.id
       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
       LEFT JOIN trade_journal tj ON tj.mt5_account_id=a.id
         AND tj.event_type='BASKET'
         AND tj.created_at >= $1
         AND tj.created_at <= $2
       WHERE u.role NOT IN ('OWNER','ADMIN')
       GROUP BY u.id,u.user_code,u.email,a.id,a.account_number,a.broker,a.broker_server,a.mode,bi.id,bi.last_seen_at,(bi.metrics->>'currency')
       ORDER BY currency,u.user_code,a.account_number`,
      [from.toISOString(), to.toISOString()]
    );

    const daily = await this.db.query(
      `SELECT
         (date_trunc('day',tj.created_at AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok') AS day,
         COALESCE(NULLIF(tj.metadata->>'currency',''),NULLIF(bi.metrics->>'currency',''),'UNKNOWN') AS currency,
         COALESCE(SUM(tj.net_profit),0)::float8 AS profit,
         COUNT(*)::int AS trades
       FROM trade_journal tj
       JOIN mt5_accounts a ON a.id=tj.mt5_account_id
       JOIN users u ON u.id=a.user_id
       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
       WHERE tj.event_type='BASKET'
         AND tj.created_at >= $1
         AND tj.created_at <= $2
         AND u.role NOT IN ('OWNER','ADMIN')
       GROUP BY 1,2
       ORDER BY 2,1`,
      [from.toISOString(), to.toISOString()]
    );

    const currencyTotals = await this.db.query(
      `SELECT
         COALESCE(NULLIF(tj.metadata->>'currency',''),NULLIF(bi.metrics->>'currency',''),'UNKNOWN') AS currency,
         COUNT(*)::int AS trades,
         COUNT(*) FILTER (WHERE tj.net_profit>0)::int AS wins,
         COUNT(*) FILTER (WHERE tj.net_profit<0)::int AS losses,
         COALESCE(SUM(tj.net_profit),0)::float8 AS net_profit,
         COALESCE(SUM(tj.net_profit) FILTER (WHERE tj.net_profit>0),0)::float8 AS gross_profit,
         COALESCE(ABS(SUM(tj.net_profit) FILTER (WHERE tj.net_profit<0)),0)::float8 AS gross_loss
       FROM trade_journal tj
       JOIN mt5_accounts a ON a.id=tj.mt5_account_id
       JOIN users u ON u.id=a.user_id
       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
       WHERE tj.event_type='BASKET'
         AND tj.created_at >= $1
         AND tj.created_at <= $2
         AND u.role NOT IN ('OWNER','ADMIN')
       GROUP BY 1
       ORDER BY 1`,
      [from.toISOString(), to.toISOString()]
    );

    const curveMap = new Map<string, any[]>();
    const cumulativeByCurrency = new Map<string, number>();
    for (const row of daily.rows) {
      const currency = String(row.currency || "UNKNOWN").toUpperCase();
      const cumulative = Number(cumulativeByCurrency.get(currency) || 0) + Number(row.profit || 0);
      cumulativeByCurrency.set(currency, cumulative);
      const points = curveMap.get(currency) || [];
      points.push({
        time: row.day,
        currency,
        profit: Number(row.profit || 0),
        cumulative: Number(cumulative.toFixed(2)),
        trades: Number(row.trades || 0)
      });
      curveMap.set(currency, points);
    }
    const currencySummaries = currencyTotals.rows.map((row: any) => {
      const trades = Number(row.trades || 0);
      const wins = Number(row.wins || 0);
      const grossProfit = Number(row.gross_profit || 0);
      const grossLoss = Number(row.gross_loss || 0);
      return {
        currency: String(row.currency || "UNKNOWN").toUpperCase(),
        trades,
        wins,
        losses: Number(row.losses || 0),
        winRate: trades > 0 ? Number((wins / trades * 100).toFixed(2)) : 0,
        netProfit: Number(row.net_profit || 0),
        profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : grossProfit > 0 ? 999 : 0
      };
    });
    const singleCurrency = currencySummaries.length === 1 ? currencySummaries[0] : null;
    const curvesByCurrency = Array.from(curveMap.entries()).map(([currency, points]) => ({ currency, points }));
    const curve = singleCurrency ? (curveMap.get(singleCurrency.currency) || []) : [];
    const trades = Number(kpis?.trades || 0);
    const wins = Number(kpis?.wins || 0);
    const profitableAccounts = accounts.rows.filter((row: any) => Number(row.net_profit || 0) > 0).length;

    return {
      source: "SYSTEM_LIVE",
      range: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        customers: Number(kpis?.customers || 0),
        accounts: Number(kpis?.accounts || 0),
        onlineAccounts: Number(kpis?.online_accounts || 0),
        trades,
        wins,
        losses: Number(kpis?.losses || 0),
        winRate: trades > 0 ? Number((wins / trades * 100).toFixed(2)) : 0,
        currency: singleCurrency?.currency || (currencySummaries.length > 1 ? "MULTI" : "UNKNOWN"),
        netProfit: singleCurrency ? singleCurrency.netProfit : null,
        profitFactor: singleCurrency ? singleCurrency.profitFactor : null,
        profitableAccounts,
        profitableAccountRate: accounts.rows.length > 0 ? Number((profitableAccounts / accounts.rows.length * 100).toFixed(2)) : 0
      },
      curve,
      curvesByCurrency,
      currencySummaries,
      accounts: accounts.rows.map((row: any) => ({
        userId: row.user_id,
        userCode: row.user_code,
        email: row.email,
        accountId: row.account_id,
        accountNumber: row.account_number,
        broker: row.broker,
        brokerServer: row.broker_server,
        mode: row.mode,
        instanceId: row.instance_id,
        currency: String(row.currency || "UNKNOWN").toUpperCase(),
        online: row.last_seen_at ? new Date(row.last_seen_at).getTime() > Date.now() - 35_000 : false,
        trades: Number(row.trades || 0),
        wins: Number(row.wins || 0),
        losses: Number(row.losses || 0),
        winRate: Number(row.trades || 0) > 0 ? Number((Number(row.wins || 0) / Number(row.trades) * 100).toFixed(2)) : 0,
        netProfit: Number(row.net_profit || 0)
      }))
    };
  }

  @Get("backtest")
  @Header("Cache-Control", "no-store")
  async backtest(@Req() req: any, @Query("id") id = "") {
    if (!id) throw new BadRequestException("backtest id required");
    const actor = req.user as Actor;
    const params: any[] = [id];
    const clause = this.elevated(actor) ? "" : " AND br.owner_user_id=$2";
    if (!this.elevated(actor)) params.push(actor.sub);
    const run = await this.db.one(
      `SELECT br.*,ls.slot_number,ls.mode AS slot_mode,u.user_code,u.email
       FROM backtest_runs br
       JOIN users u ON u.id=br.owner_user_id
       LEFT JOIN license_slots ls ON ls.id=br.slot_id
       WHERE br.id=$1${clause}`,
      params
    );
    if (!run) throw new ForbiddenException("backtest unavailable");
    const trades = await this.db.query(
      `SELECT trade_index,opened_at,closed_at,direction,volume,open_price,close_price,profit,balance_after,metadata
       FROM backtest_trades WHERE run_id=$1 ORDER BY trade_index ASC LIMIT 10000`,
      [id]
    );
    return { ...run, trades: trades.rows };
  }

  @Get("export.csv")
  async exportCsv(
    @Req() req: any,
    @Query("accountId") accountId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Res() res: Response
  ) {
    const report: any = await this.buildReport(req.user as Actor, accountId, from || "", to || "");
    const escape = (value: any) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const rows = [
      ["SCENOVA Performance Report"],
      ["Account", report.account.accountNumber],
      ["Broker", report.account.broker],
      ["From", report.range.from],
      ["To", report.range.to],
      ["Net Profit", report.summary.netProfit],
      ["Return %", report.summary.returnPercent ?? ""],
      ["Win Rate %", report.summary.winRate],
      ["Profit Factor", report.summary.profitFactor],
      ["Max Drawdown %", report.summary.maxDrawdownPercent ?? ""],
      ["Sharpe Ratio", report.summary.sharpeRatio ?? ""],
      ["Recovery Factor", report.summary.recoveryFactor ?? ""],
      ["Total Trades", report.summary.trades],
      [],
      ["Ticket","Position ID","Symbol","Side","Lot","Entry Price","Exit Price","P/L","Opened At","Closed At"],
      ...report.closedTrades.map((trade: any) => [
        trade.ticket,trade.positionId || "",trade.symbol,trade.side,trade.lot,
        trade.entryPrice ?? "",trade.exitPrice,trade.profit,trade.openedAt || "",trade.closedAt
      ])
    ];
    const csv = rows.map((row: any[]) => row.map(escape).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="scenova-performance-${report.account.accountNumber}.csv"`);
    res.send("\ufeff" + csv);
  }
}
