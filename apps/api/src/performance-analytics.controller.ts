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
import { reconstructCompletedJournal, resolveJournalControlMode } from "./performance-journal";

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

  private strategyModes(value = "ALL") {
    const allowed = ["AUTO", "RACE", "FLIP_LOCK", "MANUAL", "ZERO_GRID"];
    const requested = String(value || "ALL")
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .map((item) => item === "GRID" ? "ZERO_GRID" : item);

    if (requested.includes("ALL")) return allowed;

    const unique = Array.from(new Set(requested));
    if (!unique.length || unique.some((item) => !allowed.includes(item))) {
      throw new BadRequestException("invalid strategy modes");
    }
    return unique;
  }

  private summarize(rows: BasketRow[], startBalance: number | null) {
    const trades = rows.length;
    const wins = rows.filter((row) => Number(row.net_profit) > 0).length;
    const losses = rows.filter((row) => Number(row.net_profit) < 0).length;
    const breakeven = trades - wins - losses;
    const grossProfit = rows.reduce((sum, row) => sum + Math.max(0, Number(row.net_profit || 0)), 0);
    const grossLoss = rows.reduce((sum, row) => sum + Math.abs(Math.min(0, Number(row.net_profit || 0))), 0);
    const netProfit = grossProfit - grossLoss;

    let running = startBalance ?? 0;
    let peak = running;
    let maxDrawdownMoney = 0;
    let maxDrawdownPercent = 0;
    const curve: Array<{ time: string; balance: number; equity: number; drawdownPercent: number; tradeNumber?: number }> = [];

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
    const winRate = trades > 0 ? wins / trades * 100 : 0;
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

  private async buildReport(
    actor: Actor,
    accountId: string,
    fromRaw = "",
    toRaw = "",
    strategyModesRaw = "ALL"
  ) {
    const { from, to } = this.range(fromRaw, toRaw);
    const selectedStrategyModes = this.strategyModes(strategyModesRaw);
    const includeControlMode = (value: unknown) => {
      const mode = String(value || "AUTO").trim().toUpperCase() || "AUTO";
      return selectedStrategyModes.includes(mode);
    };
    const account = await this.accountForActor(actor, accountId);
    const metrics = account.metrics || {};
    const currentBalance = Number(metrics.balance || 0);
    const currentEquity = Number(metrics.equity || 0);
    const freshHeartbeat =
      Boolean(account.last_seen_at) &&
      Date.now() - new Date(account.last_seen_at).getTime() <= 35_000;
    const reportedBrokerTime = Number(metrics.brokerTime);
    const reportedBrokerDayStart = Number(metrics.brokerDayStart);
    const reportedBrokerUtcOffsetSeconds = Number(metrics.brokerUtcOffsetSeconds);
    const brokerClockReliable =
      freshHeartbeat &&
      Number.isFinite(reportedBrokerTime) &&
      Number.isFinite(reportedBrokerDayStart) &&
      Number.isFinite(reportedBrokerUtcOffsetSeconds) &&
      reportedBrokerTime > 0 &&
      reportedBrokerDayStart > 0 &&
      reportedBrokerTime >= reportedBrokerDayStart &&
      reportedBrokerTime - reportedBrokerDayStart < 26 * 60 * 60 &&
      Math.abs(reportedBrokerUtcOffsetSeconds) <= 14 * 60 * 60;
    const brokerDayStartUtc = brokerClockReliable
      ? new Date((reportedBrokerDayStart - reportedBrokerUtcOffsetSeconds) * 1000)
      : null;
    const journalEventTime = (row:any) =>
      new Date(row?.event_at || row?.created_at).getTime();

    const resetRow = await this.db.one(
      `SELECT created_at
       FROM audit_logs
       WHERE action='PERFORMANCE_TEST_DATA_RESET'
          OR (action='PERFORMANCE_OWN_DATA_RESET' AND entity_id=$1)
       ORDER BY created_at DESC
       LIMIT 1`,
      [String(account.user_id)]
    );
    const resetAt = resetRow?.created_at ? new Date(resetRow.created_at) : null;
    const effectiveFrom =
      resetAt && resetAt.getTime() > from.getTime()
        ? resetAt
        : from;
    const now = new Date();
    const journalTo = now.getTime() > to.getTime() ? now : to;
    const journalQueryFrom =
      brokerDayStartUtc &&
      Number.isFinite(brokerDayStartUtc.getTime()) &&
      brokerDayStartUtc.getTime() < effectiveFrom.getTime()
        ? brokerDayStartUtc
        : effectiveFrom;

    // Total time the bot was commanded to run inside the selected report range.
    // START begins a run; SAFE_STOP/CLOSE_ALL ends it. Repeated START commands
    // while already running do not double-count time.
    const runtimeWindowEnd = new Date(Math.min(to.getTime(), now.getTime()));
    let runtimeSeconds = 0;
    if (account.instance_id && runtimeWindowEnd.getTime() > effectiveFrom.getTime()) {
      const runtimeRows = await this.db.query(
        `SELECT id,command,created_at
         FROM bot_commands
         WHERE bot_instance_id=$1
           AND command IN ('START','SAFE_STOP','CLOSE_ALL')
           AND created_at <= $3
           AND (
             created_at >= $2
             OR id=(
               SELECT id
               FROM bot_commands
               WHERE bot_instance_id=$1
                 AND command IN ('START','SAFE_STOP','CLOSE_ALL')
                 AND created_at < $2
               ORDER BY created_at DESC,id DESC
               LIMIT 1
             )
           )
         ORDER BY created_at ASC,id ASC`,
        [account.instance_id, effectiveFrom.toISOString(), runtimeWindowEnd.toISOString()]
      );

      let runningSince: number | null = null;
      for (const row of runtimeRows.rows || []) {
        const eventAt = new Date(row.created_at).getTime();
        if (!Number.isFinite(eventAt)) continue;
        const command = String(row.command || "").toUpperCase();

        if (eventAt < effectiveFrom.getTime()) {
          runningSince = command === "START" ? effectiveFrom.getTime() : null;
          continue;
        }

        if (command === "START") {
          if (runningSince === null) runningSince = Math.max(eventAt, effectiveFrom.getTime());
          continue;
        }

        if (runningSince !== null) {
          runtimeSeconds += Math.max(0, Math.floor((eventAt - runningSince) / 1000));
          runningSince = null;
        }
      }

      if (runningSince !== null) {
        runtimeSeconds += Math.max(
          0,
          Math.floor((runtimeWindowEnd.getTime() - runningSince) / 1000)
        );
      }
    }

    // PERFORMANCE_ACTUAL_DEALS_V1: rebuild completed baskets from the actual
    // ENTRY/EXIT deals. Raw BASKET rows are intentionally not trusted here
    // because async close callbacks can finalize that legacy row before every
    // exit deal has been accumulated.
    const journalResult = await this.db.query(
      `WITH journal_source AS (
         SELECT
           id,deal_ticket,position_id,event_type,direction,volume::float8,price::float8,
           net_profit::float8,entry_model,entry_trigger,entry_quality_score::float8,
           confidence::float8,created_at,metadata,
           COALESCE(
             CASE
               WHEN (metadata->>'dealTimeMsc') ~ '^[0-9]+$'
                 AND (metadata->>'dealTimeMsc')::numeric > 0
               THEN to_timestamp(
                 (metadata->>'dealTimeMsc')::double precision / 1000.0 -
                 CASE
                   WHEN (metadata->>'brokerUtcOffsetSeconds') ~ '^-?[0-9]+$'
                   THEN (metadata->>'brokerUtcOffsetSeconds')::double precision
                   ELSE 0
                 END
               )
               WHEN (metadata->>'dealTime') ~ '^[0-9]+$'
                 AND (metadata->>'dealTime')::numeric > 0
               THEN to_timestamp(
                 (metadata->>'dealTime')::double precision -
                 CASE
                   WHEN (metadata->>'brokerUtcOffsetSeconds') ~ '^-?[0-9]+$'
                   THEN (metadata->>'brokerUtcOffsetSeconds')::double precision
                   ELSE 0
                 END
               )
               ELSE NULL
             END,
             created_at
           ) AS event_at
         FROM trade_journal
         WHERE mt5_account_id=$1
           AND event_type IN ('ENTRY','EXIT')
       )
       SELECT
         id,deal_ticket,position_id,event_type,direction,volume,price,net_profit,
         entry_model,entry_trigger,entry_quality_score,confidence,created_at,event_at,metadata
       FROM journal_source
       WHERE event_at >= $2
         AND event_at <= $3
       ORDER BY event_at ASC,created_at ASC,id ASC
       LIMIT 50000`,
      [account.id, journalQueryFrom.toISOString(), journalTo.toISOString()]
    );
    const journalRows = journalResult.rows || [];
    const reconstructed = reconstructCompletedJournal(journalRows);
    const allBaskets = reconstructed.baskets;
    const allPositions = reconstructed.positions;
    const rangeBasketsAllModes = allBaskets.filter((row) => {
      const closedAt = new Date(row.created_at).getTime();
      return closedAt >= effectiveFrom.getTime() && closedAt <= to.getTime();
    });
    const selectedBaskets = rangeBasketsAllModes.filter(
      (row) => includeControlMode(row.controlMode)
    );
    const selectedPositions = allPositions.filter(
      (row) =>
        new Date(row.closedAt).getTime() >= effectiveFrom.getTime() &&
        new Date(row.closedAt).getTime() <= to.getTime() &&
        includeControlMode(row.controlMode)
    );
    const filteredJournalRows = journalRows.filter(
      (row:any) =>
        journalEventTime(row) >= effectiveFrom.getTime() &&
        includeControlMode(resolveJournalControlMode(row))
    );
    const selectedDealRows = filteredJournalRows.filter(
      (row:any) => journalEventTime(row) <= to.getTime()
    );

    // Money follows the actual realized deal ledger, including partial closes
    // from a basket that is still draining. Basket count/Win Rate still use
    // only fully completed reconstructed baskets.
    //
    // The EA heartbeat is the authority for the current MT5 broker-day closed
    // P/L. Per-deal journals are HTTP telemetry and an individual deal can be
    // missed during a transient network failure. When this report includes the
    // live Bangkok day and the reporting range began before that day, reconcile
    // the journal total to the fresh MT5 heartbeat without changing Basket
    // counts or trading behavior.
    const rawRealizedSinceFrom = filteredJournalRows.reduce(
      (sum:number,row:any) => sum + Number(row.net_profit || 0),
      0
    );
    const rawSelectedRealizedNet = selectedDealRows.reduce(
      (sum:number,row:any) => sum + Number(row.net_profit || 0),
      0
    );
    // MT5's broker-day closed P/L is account-wide. Reconcile only when all
    // strategies are selected; custom portfolios use strategy-tagged journal P/L.
    // EA 1.0.95+ publishes the exact broker-day boundary and UTC offset used by
    // BotTodayClosedProfitAllModes(), eliminating Bangkok/broker timezone drift.
    const legacyBangkokDayStart = new Date(this.dayKey(now) + "T00:00:00.000+07:00");
    const reconciliationDayStart =
      brokerClockReliable && brokerDayStartUtc
        ? brokerDayStartUtc
        : legacyBangkokDayStart;
    const reconciliationClock = brokerClockReliable
      ? "MT5_BROKER_DAY"
      : "BANGKOK_LEGACY";
    const reportedTodayClosed = Number(metrics.botTodayClosedProfit);
    const allStrategiesSelected = selectedStrategyModes.length === 5;
    const canReconcileToday =
      allStrategiesSelected &&
      freshHeartbeat &&
      Number.isFinite(reportedTodayClosed) &&
      effectiveFrom.getTime() <= reconciliationDayStart.getTime() &&
      to.getTime() >= now.getTime();
    const comparableTodayRows = canReconcileToday
      ? journalRows.filter((row:any) =>
          journalEventTime(row) >= reconciliationDayStart.getTime() &&
          row?.metadata?.executedByBot !== false
        )
      : [];
    const untimedComparableRows = brokerClockReliable
      ? comparableTodayRows.filter((row:any) =>
          !(Number(row?.metadata?.dealTimeMsc) > 0 || Number(row?.metadata?.dealTime) > 0)
        )
      : [];
    // botTodayClosedProfit intentionally counts only deals executed by a
    // SCENOVA magic. The journal also keeps customer/manual EXITs for accurate
    // position P/L. Compare like-for-like here; otherwise a manual close creates
    // a permanent false "journal incomplete" state even when every deal exists.
    const journalTodayClosed = canReconcileToday
      ? comparableTodayRows.reduce(
          (sum:number,row:any) => sum + Number(row.net_profit || 0),
          0
        )
      : 0;
    const mt5TodayReconciliation = canReconcileToday
      ? reportedTodayClosed - journalTodayClosed
      : 0;
    const journalReconciliationGap = Number(mt5TodayReconciliation.toFixed(2));
    const detailedStatsReliable =
      !canReconcileToday ||
      (
        Math.abs(journalReconciliationGap) <= 0.01 &&
        untimedComparableRows.length === 0
      );

    // Once the comparable MT5/journal ledger is complete, retire any stale
    // telemetry-only replay command so the VPS does not replay history forever.
    if (
      detailedStatsReliable &&
      String(account.mode || "").toUpperCase() === "CLOUD" &&
      account.instance_id
    ) {
      await this.db.query(
        `UPDATE bot_commands
         SET status='ACKED',
             acked_at=COALESCE(acked_at,now()),
             payload=COALESCE(payload,'{}'::jsonb) ||
               jsonb_build_object('ackSource','PERFORMANCE_RECONCILED')
         WHERE bot_instance_id=$1
           AND command='JOURNAL_REPLAY_TODAY'
           AND status IN ('PENDING','DELIVERED')`,
        [account.instance_id]
      );
    }

    // VPS/CLOUD uses the same EA journal recovery that already exists in MT5.
    // Only queue a replay when the current-day MT5 heartbeat proves that the
    // journal is incomplete. LOCAL behavior and trading control are untouched.
    let journalRecovery:any = null;
    if (
      !detailedStatsReliable &&
      String(account.mode || "").toUpperCase() === "CLOUD" &&
      account.instance_id &&
      freshHeartbeat
    ) {
      const latestReplay = await this.db.one(
        `SELECT id,status,created_at,delivered_at,acked_at
         FROM bot_commands
         WHERE bot_instance_id=$1
           AND command='JOURNAL_REPLAY_TODAY'
         ORDER BY id DESC
         LIMIT 1`,
        [account.instance_id]
      );
      const replayActivityAt = Math.max(
        latestReplay?.created_at ? new Date(latestReplay.created_at).getTime() : 0,
        latestReplay?.delivered_at ? new Date(latestReplay.delivered_at).getTime() : 0,
        latestReplay?.acked_at ? new Date(latestReplay.acked_at).getTime() : 0
      );
      const latestReplayStatus = String(latestReplay?.status || "").toUpperCase();
      const replayActive =
        latestReplayStatus === "PENDING" ||
        latestReplayStatus === "DELIVERED";
      const replayCooldown =
        replayActivityAt > 0 &&
        Date.now() - replayActivityAt < 90_000;

      if (!replayActive && !replayCooldown) {
        journalRecovery = await this.db.one(
          `INSERT INTO bot_commands(bot_instance_id,command)
           VALUES($1,'JOURNAL_REPLAY_TODAY')
           RETURNING id,status,created_at,delivered_at,acked_at`,
          [account.instance_id]
        );
      } else {
        journalRecovery = latestReplay;
      }
    }

    const journalRecoveryStatus = String(journalRecovery?.status || "").toUpperCase();
    const journalRecoveryAt = Math.max(
      journalRecovery?.created_at ? new Date(journalRecovery.created_at).getTime() : 0,
      journalRecovery?.delivered_at ? new Date(journalRecovery.delivered_at).getTime() : 0,
      journalRecovery?.acked_at ? new Date(journalRecovery.acked_at).getTime() : 0
    );
    const journalRecoveryActive =
      !detailedStatsReliable &&
      String(account.mode || "").toUpperCase() === "CLOUD" &&
      freshHeartbeat &&
      Boolean(journalRecovery) &&
      (
        journalRecoveryStatus === "PENDING" ||
        journalRecoveryStatus === "DELIVERED" ||
        (journalRecoveryAt > 0 && Date.now() - journalRecoveryAt < 90_000)
      );

    const realizedSinceFrom = rawRealizedSinceFrom + mt5TodayReconciliation;
    const selectedRealizedNet = rawSelectedRealizedNet + mt5TodayReconciliation;
    const derivedStart = currentBalance > 0
      ? Number((currentBalance - realizedSinceFrom).toFixed(2))
      : null;
    const computed: any = this.summarize(selectedBaskets as BasketRow[], derivedStart);
    const positiveDeals = selectedDealRows.map((row:any)=>Number(row.net_profit || 0)).filter((value:number)=>value>0);
    const negativeDeals = selectedDealRows.map((row:any)=>Number(row.net_profit || 0)).filter((value:number)=>value<0);
    const rawGrossProfit = positiveDeals.reduce((sum:number,value:number)=>sum+value,0);
    const rawGrossLoss = Math.abs(negativeDeals.reduce((sum:number,value:number)=>sum+value,0));
    const actualGrossProfit = rawGrossProfit + Math.max(0, mt5TodayReconciliation);
    const actualGrossLoss = rawGrossLoss + Math.max(0, -mt5TodayReconciliation);
    computed.summary.netProfit = Number(selectedRealizedNet.toFixed(2));
    computed.summary.grossProfit = Number(actualGrossProfit.toFixed(2));
    computed.summary.grossLoss = Number(actualGrossLoss.toFixed(2));
    computed.summary.profitFactor = actualGrossLoss>0
      ? Number((actualGrossProfit/actualGrossLoss).toFixed(3))
      : actualGrossProfit>0 ? 999 : 0;
    computed.summary.returnPercent = derivedStart && derivedStart>0
      ? Number((selectedRealizedNet/derivedStart*100).toFixed(2))
      : null;
    computed.summary.expectedPayoff = selectedPositions.length>0
      ? Number((selectedRealizedNet/selectedPositions.length).toFixed(2))
      : 0;

    if(derivedStart !== null){
      let curveBalance=derivedStart;
      let curvePeak=curveBalance;
      let curveMaxDdMoney=0;
      let curveMaxDdPercent=0;
      computed.curve=[{
        time:effectiveFrom.toISOString(),
        tradeNumber:0,
        balance:Number(curveBalance.toFixed(2)),
        equity:Number(curveBalance.toFixed(2)),
        drawdownPercent:0
      }];
      selectedPositions.forEach((position,index) => {
        curveBalance+=Number(position.net_profit || 0);
        curvePeak=Math.max(curvePeak,curveBalance);
        const ddMoney=Math.max(0,curvePeak-curveBalance);
        const ddPercent=curvePeak>0 ? ddMoney/curvePeak*100 : 0;
        curveMaxDdMoney=Math.max(curveMaxDdMoney,ddMoney);
        curveMaxDdPercent=Math.max(curveMaxDdPercent,ddPercent);
        computed.curve.push({
          time:position.closedAt,
          tradeNumber:index+1,
          balance:Number(curveBalance.toFixed(2)),
          equity:Number(curveBalance.toFixed(2)),
          drawdownPercent:Number(ddPercent.toFixed(3))
        });
      });
      computed.summary.maxDrawdownMoney=Number(curveMaxDdMoney.toFixed(2));
      computed.summary.maxDrawdownPercent=Number(curveMaxDdPercent.toFixed(2));
      computed.summary.recoveryFactor=curveMaxDdMoney>0
        ? Number((computed.summary.netProfit/curveMaxDdMoney).toFixed(2))
        : computed.summary.netProfit>0 ? 999 : null;
    }

    const positionProfits=selectedPositions.map((position)=>Number(position.net_profit || 0));
    const positivePositions=positionProfits.filter((value)=>value>0);
    const negativePositions=positionProfits.filter((value)=>value<0);
    computed.summary.largestProfitTrade=positivePositions.length
      ? Number(Math.max(...positivePositions).toFixed(2)) : 0;
    computed.summary.largestLossTrade=negativePositions.length
      ? Number(Math.min(...negativePositions).toFixed(2)) : 0;
    computed.summary.averageProfitTrade=positivePositions.length
      ? Number((positivePositions.reduce((a,b)=>a+b,0)/positivePositions.length).toFixed(2)) : 0;
    computed.summary.averageLossTrade=negativePositions.length
      ? Number((negativePositions.reduce((a,b)=>a+b,0)/negativePositions.length).toFixed(2)) : 0;

    const positionWins = positivePositions.length;
    const positionLosses = negativePositions.length;
    const breakevenPositions = Math.max(0, selectedPositions.length - positionWins - positionLosses);
    const volumes = selectedPositions
      .map((position) => Number(position.volume || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const durations = selectedPositions
      .map((position) => Math.max(
        0,
        Math.floor((new Date(position.closedAt).getTime() - new Date(position.openedAt).getTime()) / 1000)
      ))
      .filter((value) => Number.isFinite(value));
    const dailyProfitMap = new Map<string, number>();
    for (const row of selectedDealRows) {
      const key = this.dayKey(row.event_at || row.created_at);
      dailyProfitMap.set(key, (dailyProfitMap.get(key) || 0) + Number(row.net_profit || 0));
    }
    const dailyProfits = Array.from(dailyProfitMap.values());
    const profitableDays = dailyProfits.filter((value) => value > 0).length;
    const losingDays = dailyProfits.filter((value) => value < 0).length;
    const breakevenDays = Math.max(0, dailyProfits.length - profitableDays - losingDays);

    let ahpr: number | null = null;
    let ghpr: number | null = null;
    if (derivedStart !== null && derivedStart > 0 && positionProfits.length > 0) {
      let rolling = derivedStart;
      const growthFactors: number[] = [];
      for (const profit of positionProfits) {
        if (rolling > 0) {
          const next = rolling + profit;
          const factor = next / rolling;
          if (Number.isFinite(factor) && factor > 0) growthFactors.push(factor);
        }
        rolling += profit;
      }
      if (growthFactors.length > 0) {
        ahpr = growthFactors.reduce((sum, value) => sum + value, 0) / growthFactors.length;
        ghpr = Math.exp(
          growthFactors.reduce((sum, value) => sum + Math.log(value), 0) / growthFactors.length
        );
      }
    }

    computed.summary.totalDeals = selectedDealRows.length;
    computed.summary.totalPositions = selectedPositions.length;
    computed.summary.profitPositions = positionWins;
    computed.summary.lossPositions = positionLosses;
    computed.summary.breakevenPositions = breakevenPositions;
    computed.summary.positionWinRate = selectedPositions.length > 0
      ? Number((positionWins / selectedPositions.length * 100).toFixed(2))
      : 0;
    computed.summary.averageLot = volumes.length > 0
      ? Number((volumes.reduce((sum, value) => sum + value, 0) / volumes.length).toFixed(4))
      : 0;
    computed.summary.maxLot = volumes.length > 0 ? Number(Math.max(...volumes).toFixed(4)) : 0;

    const lotCountMap = new Map<number, number>();
    for (const volume of volumes) {
      const lot = Number(volume.toFixed(4));
      lotCountMap.set(lot, (lotCountMap.get(lot) || 0) + 1);
    }
    const lotDistribution = Array.from(lotCountMap.entries())
      .map(([lot, count]) => ({
        lot,
        count,
        percent: volumes.length > 0
          ? Number((count / volumes.length * 100).toFixed(2))
          : 0
      }))
      .sort((a, b) => a.lot - b.lot);
    const primaryLot = [...lotDistribution].sort(
      (a, b) => b.count - a.count || a.lot - b.lot
    )[0] || { lot: 0, count: 0, percent: 0 };
    computed.summary.primaryLot = primaryLot.lot;
    computed.summary.primaryLotCount = primaryLot.count;
    computed.summary.primaryLotPercent = primaryLot.percent;
    computed.summary.lotSizeCount = lotDistribution.length;
    computed.summary.averageTradeDurationSeconds = durations.length > 0
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0;
    computed.summary.maxTradeDurationSeconds = durations.length > 0 ? Math.max(...durations) : 0;
    computed.summary.minTradeDurationSeconds = durations.length > 0 ? Math.min(...durations) : 0;
    computed.summary.tradingDays = dailyProfits.length;
    computed.summary.profitableDays = profitableDays;
    computed.summary.losingDays = losingDays;
    computed.summary.breakevenDays = breakevenDays;
    computed.summary.bestDayProfit = dailyProfits.length > 0
      ? Number(Math.max(...dailyProfits).toFixed(2))
      : 0;
    computed.summary.worstDayProfit = dailyProfits.length > 0
      ? Number(Math.min(...dailyProfits).toFixed(2))
      : 0;
    computed.summary.averageDailyProfit = dailyProfits.length > 0
      ? Number((dailyProfits.reduce((sum, value) => sum + value, 0) / dailyProfits.length).toFixed(2))
      : 0;
    computed.summary.ahpr = ahpr === null ? null : Number(ahpr.toFixed(6));
    computed.summary.ghpr = ghpr === null ? null : Number(ghpr.toFixed(6));

    const modeBreakdown = ["AUTO", "RACE", "FLIP_LOCK", "MANUAL", "ZERO_GRID"].map((mode) => {
      const rows = rangeBasketsAllModes.filter(
        (row) => String(row.controlMode || "AUTO").toUpperCase() === mode
      );
      const netProfit = rows.reduce((sum, row) => sum + Number(row.net_profit || 0), 0);
      const wins = rows.filter((row) => Number(row.net_profit || 0) > 0).length;
      return {
        mode,
        baskets: rows.length,
        wins,
        losses: rows.filter((row) => Number(row.net_profit || 0) < 0).length,
        winRate: rows.length > 0 ? Number((wins / rows.length * 100).toFixed(2)) : 0,
        netProfit: Number(netProfit.toFixed(2))
      };
    });

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

    const rangeEnd = derivedStart === null
      ? null
      : Number((derivedStart + selectedRealizedNet).toFixed(2));
    if(rangeEnd !== null && computed.curve.length>0){
      // Keep the visual endpoint identical to the money cards. This also
      // absorbs entry-side commission from an unfinished position without
      // inventing another closed-trade number on the X axis.
      computed.curve[computed.curve.length-1].balance=rangeEnd;
      computed.curve[computed.curve.length-1].equity=
        to.getTime()>Date.now()-5*60*1000 && currentEquity>0
          ? Number(currentEquity.toFixed(2))
          : rangeEnd;
    }

    return {
      source: "LIVE",
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        effectiveFrom: effectiveFrom.toISOString(),
        resetAt: resetAt ? resetAt.toISOString() : null
      },
      filter: {
        strategyModes: selectedStrategyModes,
        scope: selectedStrategyModes.length === 5 ? "ALL_STRATEGIES" : "CUSTOM_PORTFOLIO"
      },
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
      dataQuality: {
        detailedStatsReliable,
        detailStatus: detailedStatsReliable
          ? "COMPLETE"
          : journalRecoveryActive
            ? "JOURNAL_RECOVERING"
            : "JOURNAL_INCOMPLETE",
        journalRows: journalRows.length,
        selectedJournalRows: selectedDealRows.length,
        reconstructedPositions: selectedPositions.length,
        mt5ReconciliationAdjustment: journalReconciliationGap,
        reconciliationClock,
        brokerDayStart: brokerDayStartUtc?.toISOString() || null,
        untimedJournalRows: untimedComparableRows.length,
        moneySource: canReconcileToday
          ? "MT5_HEARTBEAT_RECONCILED"
          : "TRADE_JOURNAL",
        recovery: journalRecoveryActive ? {
          command: "JOURNAL_REPLAY_TODAY",
          commandId: Number(journalRecovery?.id || 0) || null,
          status: journalRecoveryStatus || "PENDING",
          requestedAt: journalRecovery?.created_at || null
        } : null
      },
      balance: {
        current: currentBalance > 0 ? currentBalance : null,
        equity: currentEquity > 0 ? currentEquity : null,
        derivedStart,
        rangeEnd,
        basis: derivedStart !== null ? "ACTUAL_ENTRY_EXIT_DEALS" : "BOT_CLOSED_PNL_ONLY",
        reconciliation: canReconcileToday ? {
          source: "MT5_HEARTBEAT_TODAY_CLOSED_PNL",
          scope: "BOT_EXECUTED_DEALS",
          clock: reconciliationClock,
          brokerDayStart: brokerDayStartUtc?.toISOString() || null,
          brokerUtcOffsetSeconds: brokerClockReliable ? reportedBrokerUtcOffsetSeconds : null,
          reportedTodayClosed: Number(reportedTodayClosed.toFixed(2)),
          journalTodayClosed: Number(journalTodayClosed.toFixed(2)),
          adjustment: Number(mt5TodayReconciliation.toFixed(2))
        } : null
      },
      ...computed,
      summary: { ...computed.summary, runtimeSeconds },
      modeBreakdown,
      lotDistribution,
      closedTrades: [...selectedPositions].reverse().slice(0,500).map((row) => ({
        ticket: row.positionId,
        positionId: row.positionId,
        symbol: row.symbol || accountSymbol,
        side: row.direction,
        lot: Number(row.volume || 0),
        entryPrice: row.entryPrice,
        exitPrice: row.exitPrice,
        profit: Number(row.net_profit || 0),
        openedAt: row.openedAt,
        closedAt: row.closedAt
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
        ? `SELECT a.id,a.user_id,a.account_number,a.broker,a.broker_server,a.mode,a.status,a.created_at AS account_created_at,
                  u.user_code,u.email,u.role,bi.id AS instance_id,bi.slot_id,bi.metrics AS instance_metrics,bi.last_seen_at AS instance_last_seen_at,ls.slot_number,ls.label AS slot_label
           FROM mt5_accounts a
           JOIN users u ON u.id=a.user_id
           LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
           LEFT JOIN license_slots ls ON ls.id=bi.slot_id
           ORDER BY u.user_code,a.created_at,a.account_number`
        : `SELECT a.id,a.user_id,a.account_number,a.broker,a.broker_server,a.mode,a.status,a.created_at AS account_created_at,
                  u.user_code,u.email,u.role,bi.id AS instance_id,bi.slot_id,bi.metrics AS instance_metrics,bi.last_seen_at AS instance_last_seen_at,ls.slot_number,ls.label AS slot_label
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
      accounts: rows.rows.map((row: any) => {
        const reportedTradeMode = Number(row.instance_metrics?.accountTradeMode);
        const serverIdentity = `${row.broker || ""} ${row.broker_server || ""}`.toLowerCase();
        const accountType =
          reportedTradeMode === 0 || reportedTradeMode === 1
            ? "DEMO"
            : reportedTradeMode === 2
              ? "REAL"
              : /(demo|practice|trial|contest)/i.test(serverIdentity)
                ? "DEMO"
                : "REAL";
        return {
          id: row.id,
          userId: row.user_id,
          userCode: row.user_code,
          email: row.email,
          role: row.role,
          accountNumber: row.account_number,
          broker: row.broker,
          brokerServer: row.broker_server,
          accountType,
          mode: row.mode,
          status: row.status,
          createdAt: row.account_created_at,
          lastSeenAt: row.instance_last_seen_at,
          instanceId: row.instance_id,
          slotId: row.slot_id,
          slotNumber: row.slot_number,
          slotLabel: row.slot_label
        };
      })
    };
  }

  @Get("report")
  @Header("Cache-Control", "no-store")
  async report(
    @Req() req: any,
    @Query("accountId") accountId = "",
    @Query("from") from = "",
    @Query("to") to = "",
    @Query("strategyModes") strategyModes = "",
    @Query("strategyMode") legacyStrategyMode = "ALL"
  ) {
    return this.buildReport(
      req.user as Actor,
      accountId,
      from,
      to,
      strategyModes || legacyStrategyMode
    );
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
    @Query("strategyModes") strategyModes = "",
    @Query("strategyMode") legacyStrategyMode = "ALL",
    @Res() res: Response
  ) {
    const report: any = await this.buildReport(
      req.user as Actor,
      accountId,
      from || "",
      to || "",
      strategyModes || legacyStrategyMode
    );
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
