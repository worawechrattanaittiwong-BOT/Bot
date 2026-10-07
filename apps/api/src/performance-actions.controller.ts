import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";
import { buildJournalPositionOwnerModes, reconstructCompletedJournal, resolveJournalControlModeWithOwner } from "./performance-journal";
import { buildZeroGridCyclePresentation } from "./performance-zero-grid-cycle";

type Actor = { sub: string; role?: string };
type BasketRow = {
  direction: string;
  net_profit: number | string;
  created_at: string;
  metadata?: Record<string, any> | null;
  entry_model?: string | null;
  entry_trigger?: string | null;
};

const SHARE_STRATEGY_MODES = ["AUTO","RACE","COUNTER","FLIP_LOCK","MANUAL","ZERO_GRID"];

function normalizeShareStrategyModes(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : String(value || "ALL").split(",");
  const normalized = source
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean)
    .map((item) => item === "GRID" ? "ZERO_GRID" : item);
  if (!normalized.length || normalized.includes("ALL")) return [...SHARE_STRATEGY_MODES];
  const unique = Array.from(new Set(normalized));
  return unique.filter((item) => SHARE_STRATEGY_MODES.includes(item));
}

function shareModeLabel(value: unknown) {
  return String(value || "AUTO").toUpperCase() === "ZERO_GRID"
    ? "ZERO GRID"
    : String(value || "AUTO").toUpperCase();
}

async function actualRangeWithOwners(db: DbService, accountId: string, from: Date, to: Date) {
    const result = await db.query(
      `WITH journal_source AS (
         SELECT
           id,deal_ticket,position_id,event_type,direction,volume::float8,price::float8,
           net_profit::float8,metadata,entry_model,entry_trigger,
           entry_quality_score::float8,confidence::float8,created_at,
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
       ),range_deals AS (
         SELECT * FROM journal_source
         WHERE event_at >= $2
           AND event_at <= $3
       ),owner_context AS (
         SELECT
           js.id,js.deal_ticket,js.position_id,js.event_type,js.direction,js.volume,js.price,
           0::float8 AS net_profit,js.metadata,js.entry_model,js.entry_trigger,
           js.entry_quality_score,js.confidence,js.created_at,js.event_at
         FROM journal_source js
         WHERE js.event_type IN ('ENTRY','EXIT')
           AND js.event_at < $2
           AND js.position_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM range_deals rd
             WHERE rd.event_type='EXIT'
               AND rd.position_id=js.position_id
           )
       ),scoped_deals AS (
         SELECT * FROM range_deals
         UNION ALL
         SELECT * FROM owner_context
       )
       SELECT *
       FROM scoped_deals
       ORDER BY event_at ASC,created_at ASC,id ASC
       LIMIT 50000`,
      [accountId, from.toISOString(), to.toISOString()]
    );
    const rows=result.rows || [];
    const ownerModes=buildJournalPositionOwnerModes(rows);
    const rangeRows=rows.filter((row:any) => {
      const at=new Date(row.event_at || row.created_at).getTime();
      return at>=from.getTime() && at<=to.getTime();
    });
    const reconstructed=reconstructCompletedJournal(rows);
    return {
      rows,
      rangeRows,
      ownerModes,
      baskets:reconstructed.baskets.filter((row:any) => {
        const at=new Date(row.created_at).getTime();
        return at>=from.getTime() && at<=to.getTime();
      }),
      positions:reconstructed.positions.filter((row:any) => {
        const at=new Date(row.closedAt).getTime();
        return at>=from.getTime() && at<=to.getTime();
      })
    };
  }


@Controller("performance-actions")
@UseGuards(JwtGuard)
export class PerformanceActionsController {
  constructor(private readonly db: DbService) {}

  private elevated(actor: Actor) {
    return actor?.role === "OWNER" || actor?.role === "ADMIN";
  }

  private parseRange(fromRaw = "", toRaw = "") {
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

  private async accountForActor(actor: Actor, accountId: string) {
    if (!accountId) throw new BadRequestException("accountId required");
    const params: any[] = [accountId];
    const clause = this.elevated(actor) ? "" : " AND a.user_id=$2";
    if (!this.elevated(actor)) params.push(actor.sub);
    const account = await this.db.one(
      `SELECT
         a.id,a.user_id,a.account_number,a.broker,a.broker_server,a.mode,
         u.user_code,u.email,
         bi.id AS instance_id,bi.slot_id,bi.metrics
       FROM mt5_accounts a
       JOIN users u ON u.id=a.user_id
       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
       WHERE a.id=$1${clause}
       LIMIT 1`,
      params
    );
    if (!account) throw new ForbiddenException("performance account unavailable");
    return account;
  }

  private summarize(rows: BasketRow[], startBalance: number | null) {
    const wins = rows.filter((row) => Number(row.net_profit) > 0).length;
    const losses = rows.filter((row) => Number(row.net_profit) < 0).length;
    const breakeven = rows.length - wins - losses;
    const grossProfit = rows.reduce((sum, row) => sum + Math.max(0, Number(row.net_profit || 0)), 0);
    const grossLoss = rows.reduce((sum, row) => sum + Math.abs(Math.min(0, Number(row.net_profit || 0))), 0);
    const netProfit = grossProfit - grossLoss;
    let running = startBalance ?? 0;
    let peak = running;
    let maxDrawdownMoney = 0;
    let maxDrawdownPercent = 0;
    const curve: Array<{ time: string; balance: number; equity: number; drawdownPercent: number }> = [];
    const monthlyMap = new Map<string, { profit: number; trades: number; wins: number }>();

    for (const row of rows) {
      const profit = Number(row.net_profit || 0);
      running += profit;
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
      const date = new Date(row.created_at);
      const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const item = monthlyMap.get(month) || { profit: 0, trades: 0, wins: 0 };
      item.profit += profit;
      item.trades += 1;
      if (profit > 0) item.wins += 1;
      monthlyMap.set(month, item);
    }

    let rollingBalance = startBalance ?? 0;
    const monthly = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([month, item]) => {
      const monthStart = rollingBalance;
      rollingBalance += item.profit;
      return {
        month,
        profit: Number(item.profit.toFixed(2)),
        returnPercent: startBalance !== null && monthStart > 0
          ? Number((item.profit / monthStart * 100).toFixed(2))
          : null,
        trades: item.trades,
        winRate: item.trades > 0 ? Number((item.wins / item.trades * 100).toFixed(2)) : 0
      };
    });

    return {
      summary: {
        trades: rows.length,
        closedTrades: rows.length,
        wins,
        losses,
        breakeven,
        winRate: rows.length > 0 ? Number((wins / rows.length * 100).toFixed(2)) : 0,
        netProfit: Number(netProfit.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossLoss: Number(grossLoss.toFixed(2)),
        profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : grossProfit > 0 ? 999 : 0,
        maxDrawdownMoney: Number(maxDrawdownMoney.toFixed(2)),
        maxDrawdownPercent: startBalance !== null ? Number(maxDrawdownPercent.toFixed(2)) : null,
        recoveryFactor: maxDrawdownMoney > 0 ? Number((netProfit / maxDrawdownMoney).toFixed(2)) : null,
        initialDeposit: startBalance === null ? null : Number(startBalance.toFixed(2)),
        finalBalance: Number(running.toFixed(2)),
        returnPercent: startBalance && startBalance > 0
          ? Number(((running - startBalance) / startBalance * 100).toFixed(2))
          : null
      },
      curve,
      monthly
    };
  }

  @Post("share-live")
  @Header("Cache-Control", "no-store")
  async shareLive(
    @Req() req: any,
    @Body() body: { accountId?: string; from?: string; to?: string; title?: string; strategyModes?: string[] }
  ) {
    const actor = req.user as Actor;
    const account = await this.accountForActor(actor, String(body?.accountId || ""));
    const { from, to } = this.parseRange(String(body?.from || ""), String(body?.to || ""));
    const selectedStrategyModes = normalizeShareStrategyModes(body?.strategyModes);
    const zeroGridOnly=selectedStrategyModes.length===1&&selectedStrategyModes[0]==="ZERO_GRID";
    const metrics = account.metrics || {};
    const currentBalance = Number(metrics.balance || 0);

    const actualRange = await actualRangeWithOwners(this.db,account.id,from,to);
    const allBaskets = actualRange.baskets;
    const baskets = allBaskets.filter((row:any) =>
      selectedStrategyModes.includes(row.controlMode)
    );
    if (!baskets.length) {
      throw new BadRequestException("ยังไม่มีข้อมูลผลการเทรดของ Strategy Portfolio ที่เลือกในช่วงเวลานี้");
    }

    const rangeLedger = actualRange.rangeRows.filter((row:any) =>
      selectedStrategyModes.includes(
        resolveJournalControlModeWithOwner(row,actualRange.ownerModes)
      )
    );
    const nowForBalance=new Date();
    const balanceRange=nowForBalance.getTime()>from.getTime()
      ? await actualRangeWithOwners(this.db,account.id,from,nowForBalance)
      : actualRange;
    const balanceLedger=balanceRange.rangeRows.filter((row:any) =>
      selectedStrategyModes.includes(
        resolveJournalControlModeWithOwner(row,balanceRange.ownerModes)
      )
    );
    const ledgerNetSinceFrom = balanceLedger.reduce(
      (sum:number,row:any) => sum + Number(row.net_profit || 0),
      0
    );
    const selectedNet = rangeLedger.reduce(
      (sum:number,row:any) => sum + Number(row.net_profit || 0),
      0
    );
    const selectedGrossProfit = rangeLedger.reduce(
      (sum:number,row:any) => sum + Math.max(0,Number(row.net_profit || 0)),
      0
    );
    const selectedGrossLoss = rangeLedger.reduce(
      (sum:number,row:any) => sum + Math.abs(Math.min(0,Number(row.net_profit || 0))),
      0
    );

    const derivedStart = currentBalance > 0
      ? Number((currentBalance - ledgerNetSinceFrom).toFixed(2))
      : null;
    const computed:any = this.summarize(baskets, derivedStart);
    computed.summary.netProfit = Number(selectedNet.toFixed(2));
    computed.summary.grossProfit = Number(selectedGrossProfit.toFixed(2));
    computed.summary.grossLoss = Number(selectedGrossLoss.toFixed(2));
    computed.summary.profitFactor = selectedGrossLoss > 0
      ? Number((selectedGrossProfit / selectedGrossLoss).toFixed(3))
      : selectedGrossProfit > 0 ? 999 : 0;
    computed.summary.returnPercent = derivedStart && derivedStart > 0
      ? Number((selectedNet / derivedStart * 100).toFixed(2))
      : null;

    const filteredExitRows = actualRange.positions.filter((row:any) =>
      selectedStrategyModes.includes(row.controlMode)
    );

    const volumes = filteredExitRows
      .map((row:any) => Number(row.volume || 0))
      .filter((value:number) => Number.isFinite(value) && value > 0);
    const lotMap = new Map<number,number>();
    for(const volume of volumes){
      const lot=Number(volume.toFixed(4));
      lotMap.set(lot,(lotMap.get(lot)||0)+1);
    }
    const lotDistribution=Array.from(lotMap.entries()).map(([lot,count])=>({
      lot,
      count,
      percent:volumes.length?Number((count/volumes.length*100).toFixed(2)):0
    })).sort((a,b)=>a.lot-b.lot);
    const primaryLot=[...lotDistribution].sort((a,b)=>b.count-a.count||a.lot-b.lot)[0]||{
      lot:0,count:0,percent:0
    };
    computed.summary.totalPositions=filteredExitRows.length;
    computed.summary.totalDeals=rangeLedger.length;
    computed.summary.expectedPayoff=filteredExitRows.length
      ? Number((selectedNet/filteredExitRows.length).toFixed(2))
      : 0;
    computed.summary.averageLot=volumes.length
      ? Number((volumes.reduce((sum:number,value:number)=>sum+value,0)/volumes.length).toFixed(4))
      : 0;
    computed.summary.maxLot=volumes.length?Number(Math.max(...volumes).toFixed(4)):0;
    computed.summary.primaryLot=primaryLot.lot;
    computed.summary.primaryLotCount=primaryLot.count;
    computed.summary.primaryLotPercent=primaryLot.percent;
    computed.summary.lotSizeCount=lotDistribution.length;
    if(zeroGridOnly){
      const cycleView=buildZeroGridCyclePresentation(baskets,derivedStart);
      Object.assign(computed.summary,cycleView.summary);
      computed.curve=cycleView.curve;
    }

    const modeBreakdown=SHARE_STRATEGY_MODES.map((mode)=>{
      const rows=allBaskets.filter((row:any)=>row.controlMode===mode);
      const wins=rows.filter((row:any)=>Number(row.net_profit||0)>0).length;
      return {
        mode,
        label:shareModeLabel(mode),
        baskets:rows.length,
        wins,
        losses:rows.filter((row:any)=>Number(row.net_profit||0)<0).length,
        winRate:rows.length?Number((wins/rows.length*100).toFixed(2)):0,
        netProfit:Number(rows.reduce((sum:number,row:any)=>sum+Number(row.net_profit||0),0).toFixed(2))
      };
    });

    const historyIdentity = await this.db.one(
      "SELECT NULLIF(metadata->>'currency','') AS currency,NULLIF(metadata->>'symbol','') AS symbol " +
      "FROM trade_journal WHERE mt5_account_id=$1 ORDER BY created_at DESC LIMIT 1",
      [account.id]
    );
    const accountCurrency = String(
      metrics.currency || historyIdentity?.currency || "UNKNOWN"
    ).trim().toUpperCase() || "UNKNOWN";
    const accountSymbol = String(metrics.symbol || historyIdentity?.symbol || "XAUUSD");
    const reportedTradeMode = Number(metrics.accountTradeMode);
    const serverIdentity = String(account.broker || "") + " " + String(account.broker_server || "");
    const accountType =
      reportedTradeMode === 2
        ? "REAL"
        : reportedTradeMode === 0 || reportedTradeMode === 1
          ? "DEMO"
          : /(demo|practice|trial|contest)/i.test(serverIdentity)
            ? "DEMO"
            : "REAL";

    const slug = "live-" +
      String(account.account_number || "account").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() +
      "-" + randomBytes(5).toString("hex");
    const title = String(body?.title || ("SCENOVA Live Performance · " + account.account_number)).slice(0,180);
    const snapshot = {
      kind:"LIVE_PERFORMANCE_SNAPSHOT",
      frozenAt:new Date().toISOString(),
      account:{
        userCode:account.user_code,
        accountNumber:account.account_number,
        broker:account.broker,
        brokerServer:account.broker_server,
        mode:account.mode,
        accountType,
        symbol:accountSymbol,
        timeframe:String(metrics.timeframe || "M5"),
        currency:accountCurrency
      },
      range:{from:from.toISOString(),to:to.toISOString()},
      filter:{
        strategyModes:selectedStrategyModes,
        scope:selectedStrategyModes.length===SHARE_STRATEGY_MODES.length?"ALL_STRATEGIES":"CUSTOM_PORTFOLIO"
      },
      balance:{
        current:currentBalance>0?currentBalance:null,
        equity:Number(metrics.equity||0)>0?Number(metrics.equity):null,
        derivedStart,
        rangeEnd:derivedStart===null?null:Number((derivedStart+selectedNet).toFixed(2)),
        basis:derivedStart!==null?"ACTUAL_ENTRY_EXIT_DEALS":"BOT_CLOSED_PNL_ONLY"
      },
      summary:computed.summary,
      curve:computed.curve,
      curveBasis:zeroGridOnly?"BOT_CYCLES":"CLOSED_POSITIONS",
      monthly:computed.monthly,
      lotDistribution,
      modeBreakdown,
      closedTrades:filteredExitRows.map((row:any)=>({
        ticket:String(row.positionId),
        positionId:String(row.positionId),
        symbol:row.symbol||accountSymbol,
        side:row.direction,
        lot:Number(row.volume||0),
        entryPrice:row.entryPrice===null?null:Number(row.entryPrice),
        exitPrice:row.exitPrice===null?null:Number(row.exitPrice),
        profit:Number(row.net_profit||0),
        openedAt:row.openedAt||null,
        closedAt:row.closedAt
      }))
    };

    const share = await this.db.one(
      "INSERT INTO performance_shares(" +
      "owner_user_id,created_by_user_id,mt5_account_id,title,public_slug,from_at,to_at,snapshot" +
      ") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) " +
      "RETURNING id,title,public_slug,created_at",
      [
        account.user_id,
        actor.sub,
        account.id,
        title,
        slug,
        from.toISOString(),
        to.toISOString(),
        JSON.stringify(snapshot)
      ]
    );

    return {
      ...share,
      path:"/shared-performance/"+share.public_slug
    };
  }

  @Get("shares")
  @Header("Cache-Control", "no-store")
  async shares(@Req() req: any, @Query("accountId") accountId = "") {
    const actor = req.user as Actor;
    const params: any[] = [];
    let clause = "";
    if (accountId) {
      const account = await this.accountForActor(actor, accountId);
      params.push(account.id);
      clause = " AND ps.mt5_account_id=$1";
    } else if (!this.elevated(actor)) {
      params.push(actor.sub);
      clause = " AND ps.owner_user_id=$1";
    }
    const rows = await this.db.query(
      `SELECT ps.id,ps.title,ps.public_slug,ps.from_at,ps.to_at,ps.is_active,ps.created_at,
              a.account_number,a.broker
       FROM performance_shares ps
       LEFT JOIN mt5_accounts a ON a.id=ps.mt5_account_id
       WHERE 1=1${clause}
       ORDER BY ps.created_at DESC
       LIMIT 30`,
      params
    );
    return rows.rows.map((row: any) => ({ ...row, path: `/shared-performance/${row.public_slug}` }));
  }

  @Post("revoke-share")
  async revokeShare(@Req() req: any, @Body() body: { id?: string }) {
    const actor = req.user as Actor;
    const id = String(body?.id || "");
    if (!id) throw new BadRequestException("share id required");
    const params: any[] = [id];
    const clause = this.elevated(actor) ? "" : " AND owner_user_id=$2";
    if (!this.elevated(actor)) params.push(actor.sub);
    const updated = await this.db.one(
      `UPDATE performance_shares
       SET is_active=false,revoked_at=now(),updated_at=now()
       WHERE id=$1${clause}
       RETURNING id,is_active,revoked_at`,
      params
    );
    if (!updated) throw new ForbiddenException("share unavailable");
    return updated;
  }

  @Post("clear-own-data")
  async clearOwnData(@Req() req: any, @Body() body: { confirm?: string }) {
    const actor = req.user as Actor;
    if (String(body?.confirm || "") !== "CLEAR") {
      throw new BadRequestException("confirmation token CLEAR required");
    }

    return this.db.transaction(async tx => {
      const before = (await tx.query(
        `SELECT
           (SELECT COUNT(*)::int
              FROM trade_journal tj
              JOIN mt5_accounts a ON a.id=tj.mt5_account_id
             WHERE a.user_id=$1) AS trade_journal,
           (SELECT COUNT(*)::int FROM backtest_runs WHERE owner_user_id=$1) AS backtest_runs,
           (SELECT COUNT(*)::int FROM performance_shares WHERE owner_user_id=$1) AS performance_shares`,
        [String(actor.sub)]
      )).rows[0];

      await tx.query("DELETE FROM performance_shares WHERE owner_user_id=$1", [String(actor.sub)]);
      await tx.query("DELETE FROM backtest_runs WHERE owner_user_id=$1", [String(actor.sub)]);
      await tx.query(
        `DELETE FROM trade_journal
         WHERE mt5_account_id IN (
           SELECT id FROM mt5_accounts WHERE user_id=$1
         )`,
        [String(actor.sub)]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'PERFORMANCE_OWN_DATA_RESET','user',$1,$2::jsonb)`,
        [
          String(actor.sub),
          JSON.stringify({
            before,
            scope: "OWN",
            preserved: ["users","mt5_accounts","bot_instances","subscriptions","settings"]
          })
        ]
      );

      return {
        ok: true,
        scope: "OWN",
        deleted: {
          tradeJournal: Number(before?.trade_journal || 0),
          backtestRuns: Number(before?.backtest_runs || 0),
          performanceShares: Number(before?.performance_shares || 0)
        },
        preserved: ["users", "mt5_accounts", "bot_instances", "subscriptions", "settings"]
      };
    });
  }

  @Post("reset-test-data")
  async resetTestData(@Req() req: any, @Body() body: { confirm?: string }) {
    const actor = req.user as Actor;
    if (!this.elevated(actor)) throw new ForbiddenException("owner/admin access required");
    if (String(body?.confirm || "") !== "RESET") {
      throw new BadRequestException("confirmation token RESET required");
    }

    return this.db.transaction(async tx => {
      const before = (await tx.query(
        `SELECT
           (SELECT COUNT(*)::int FROM trade_journal) AS trade_journal,
           (SELECT COUNT(*)::int FROM backtest_runs) AS backtest_runs,
           (SELECT COUNT(*)::int FROM performance_shares) AS performance_shares`
      )).rows[0];

      await tx.query("DELETE FROM performance_shares");
      await tx.query("DELETE FROM backtest_runs");
      await tx.query("DELETE FROM trade_journal");
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'PERFORMANCE_TEST_DATA_RESET','system',NULL,$2::jsonb)`,
        [String(actor.sub), JSON.stringify({ before, preserved: ["users","mt5_accounts","bot_instances","subscriptions","settings"] })]
      );

      return {
        ok: true,
        scope: "SYSTEM",
        deleted: {
          tradeJournal: Number(before?.trade_journal || 0),
          backtestRuns: Number(before?.backtest_runs || 0),
          performanceShares: Number(before?.performance_shares || 0)
        },
        preserved: ["users", "mt5_accounts", "bot_instances", "subscriptions", "settings"]
      };
    });
  }
}

@Controller("shared-performance")
export class SharedPerformanceController {
  constructor(private readonly db: DbService) {}

  private parsePublicRange(fromRaw: string, toRaw: string, fallbackFrom: string, fallbackTo: string) {
    const fromText = String(fromRaw || "").trim();
    const toText = String(toRaw || "").trim();
    const from = fromText
      ? new Date(fromText + (fromText.length <= 10 ? "T00:00:00.000+07:00" : ""))
      : new Date(fallbackFrom);
    const to = toText
      ? new Date(toText + (toText.length <= 10 ? "T23:59:59.999+07:00" : ""))
      : new Date(fallbackTo);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      throw new BadRequestException("invalid performance date range");
    }
    if (to.getTime() - from.getTime() > 730 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("performance range cannot exceed 730 days");
    }
    return { from, to };
  }

  private summarize(rows: BasketRow[], startBalance: number | null) {
    const values = rows.map((row) => Number(row.net_profit || 0));
    const wins = values.filter((value) => value > 0).length;
    const losses = values.filter((value) => value < 0).length;
    const breakeven = values.length - wins - losses;
    const grossProfit = values.reduce((sum, value) => sum + Math.max(0, value), 0);
    const grossLoss = values.reduce((sum, value) => sum + Math.abs(Math.min(0, value)), 0);
    const netProfit = grossProfit - grossLoss;
    let running = startBalance ?? 0;
    let peak = running;
    let maxDrawdownMoney = 0;
    let maxDrawdownPercent = 0;
    const curve: Array<{ time:string; balance:number; equity:number; drawdownPercent:number }> = [];
    for (const row of rows) {
      running += Number(row.net_profit || 0);
      peak = Math.max(peak, running);
      const ddMoney = Math.max(0, peak - running);
      const ddPercent = peak > 0 ? ddMoney / peak * 100 : 0;
      maxDrawdownMoney = Math.max(maxDrawdownMoney, ddMoney);
      maxDrawdownPercent = Math.max(maxDrawdownPercent, ddPercent);
      curve.push({
        time: row.created_at,
        balance: Number(running.toFixed(2)),
        equity: Number(running.toFixed(2)),
        drawdownPercent: Number(ddPercent.toFixed(3))
      });
    }
    return {
      summary: {
        trades: rows.length,
        closedTrades: rows.length,
        wins,
        losses,
        breakeven,
        winRate: rows.length > 0 ? Number((wins / rows.length * 100).toFixed(2)) : 0,
        netProfit: Number(netProfit.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossLoss: Number(grossLoss.toFixed(2)),
        profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(3)) : grossProfit > 0 ? 999 : 0,
        maxDrawdownMoney: Number(maxDrawdownMoney.toFixed(2)),
        maxDrawdownPercent: startBalance !== null ? Number(maxDrawdownPercent.toFixed(2)) : null,
        recoveryFactor: maxDrawdownMoney > 0 ? Number((netProfit / maxDrawdownMoney).toFixed(2)) : null,
        initialDeposit: startBalance === null ? null : Number(startBalance.toFixed(2)),
        finalBalance: Number(running.toFixed(2)),
        returnPercent: startBalance && startBalance > 0
          ? Number(((running - startBalance) / startBalance * 100).toFixed(2))
          : null
      },
      curve
    };
  }

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=15")
  async publicShare(
    @Param("slug") slug: string,
    @Query("from") fromRaw = "",
    @Query("to") toRaw = ""
  ) {
    const row = await this.db.one(
      `SELECT id,title,public_slug,from_at,to_at,snapshot,created_at,mt5_account_id
       FROM performance_shares
       WHERE public_slug=$1 AND is_active=true
       LIMIT 1`,
      [slug]
    );
    if (!row) throw new BadRequestException("public performance report not found");

    const frozen = row.snapshot || {};
    const selectedStrategyModes = normalizeShareStrategyModes(frozen?.filter?.strategyModes);
    const zeroGridOnly=selectedStrategyModes.length===1&&selectedStrategyModes[0]==="ZERO_GRID";
    if (!row.mt5_account_id) {
      return {
        ...row,
        dynamic: false,
        defaultRange: { from: row.from_at, to: row.to_at },
        availableRange: { from: row.from_at, to: row.to_at }
      };
    }

    const account = await this.db.one(
      `SELECT a.id,a.account_number,a.broker,a.broker_server,a.mode,
              bi.id AS instance_id,bi.metrics,bi.last_seen_at
       FROM mt5_accounts a
       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
       WHERE a.id=$1
       LIMIT 1`,
      [row.mt5_account_id]
    );
    if (!account) {
      return {
        ...row,
        dynamic: false,
        defaultRange: { from: row.from_at, to: row.to_at },
        availableRange: { from: row.from_at, to: row.to_at }
      };
    }

    const { from, to } = this.parsePublicRange(
      fromRaw,
      toRaw,
      new Date(row.from_at).toISOString(),
      new Date(row.to_at).toISOString()
    );

    const available = await this.db.one(
      `SELECT MIN(created_at) AS min_at,MAX(created_at) AS max_at
       FROM trade_journal
       WHERE mt5_account_id=$1 AND event_type IN ('ENTRY','EXIT')`,
      [account.id]
    );

    const actualRange = await actualRangeWithOwners(this.db,account.id,from,to);
    const allBaskets = actualRange.baskets;
    const baskets = allBaskets.filter((item:any) =>
      selectedStrategyModes.includes(item.controlMode)
    );
    const currentBalance = Number(account.metrics?.balance || 0);
    const selectedRangeLedger = actualRange.rangeRows.filter((item:any) =>
      selectedStrategyModes.includes(
        resolveJournalControlModeWithOwner(item,actualRange.ownerModes)
      )
    );
    const nowForBalance=new Date();
    const balanceRange=nowForBalance.getTime()>from.getTime()
      ? await actualRangeWithOwners(this.db,account.id,from,nowForBalance)
      : actualRange;
    const balanceLedger=balanceRange.rangeRows.filter((item:any) =>
      selectedStrategyModes.includes(
        resolveJournalControlModeWithOwner(item,balanceRange.ownerModes)
      )
    );
    const ledgerNetSinceFrom = balanceLedger.reduce(
      (sum:number,item:any) => sum + Number(item.net_profit || 0),
      0
    );
    const selectedRangeNet = selectedRangeLedger.reduce(
      (sum:number,item:any) => sum + Number(item.net_profit || 0),
      0
    );
    const selectedRangeGrossProfit = selectedRangeLedger.reduce(
      (sum:number,item:any) => sum + Math.max(0,Number(item.net_profit || 0)),
      0
    );
    const selectedRangeGrossLoss = selectedRangeLedger.reduce(
      (sum:number,item:any) => sum + Math.abs(Math.min(0,Number(item.net_profit || 0))),
      0
    );
    const derivedStart = currentBalance > 0
      ? Number((currentBalance - ledgerNetSinceFrom).toFixed(2))
      : null;
    const computed:any = this.summarize(baskets, derivedStart);
    computed.summary.netProfit = Number(selectedRangeNet.toFixed(2));
    computed.summary.grossProfit = Number(selectedRangeGrossProfit.toFixed(2));
    computed.summary.grossLoss = Number(selectedRangeGrossLoss.toFixed(2));
    computed.summary.profitFactor = selectedRangeGrossLoss > 0
      ? Number((selectedRangeGrossProfit / selectedRangeGrossLoss).toFixed(3))
      : selectedRangeGrossProfit > 0 ? 999 : 0;
    computed.summary.returnPercent = derivedStart && derivedStart > 0
      ? Number((selectedRangeNet / derivedStart * 100).toFixed(2))
      : null;

    let runtimeSeconds = 0;
    const now = new Date();
    const runtimeWindowEnd = new Date(Math.min(to.getTime(), now.getTime()));
    if (account.instance_id && runtimeWindowEnd.getTime() > from.getTime()) {
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
        [account.instance_id, from.toISOString(), runtimeWindowEnd.toISOString()]
      );
      let runningSince:number|null=null;
      for(const row of runtimeRows.rows||[]){
        const at=new Date(row.created_at).getTime();
        const command=String(row.command||"").toUpperCase();
        if(!Number.isFinite(at)) continue;
        if(at<from.getTime()){
          runningSince=command==="START"?from.getTime():null;
        }else if(command==="START"){
          if(runningSince===null) runningSince=at;
        }else if(runningSince!==null){
          runtimeSeconds+=Math.max(0,Math.floor((at-runningSince)/1000));
          runningSince=null;
        }
      }
      if(runningSince!==null){
        runtimeSeconds+=Math.max(0,Math.floor((runtimeWindowEnd.getTime()-runningSince)/1000));
      }
    }

    const detailedExitRows = selectedRangeLedger.filter(
      (item:any) => String(item.event_type || "").toUpperCase()==="EXIT"
    );
    if (derivedStart !== null && detailedExitRows.length > 0) {
      let balance = derivedStart;
      let peak = balance;
      let maxDdMoney = 0;
      let maxDdPercent = 0;
      computed.curve = detailedExitRows.map((exit:any) => {
        balance += Number(exit.net_profit || 0);
        peak = Math.max(peak, balance);
        const ddMoney = Math.max(0, peak - balance);
        const ddPercent = peak > 0 ? ddMoney / peak * 100 : 0;
        maxDdMoney = Math.max(maxDdMoney, ddMoney);
        maxDdPercent = Math.max(maxDdPercent, ddPercent);
        return {
          time: exit.created_at,
          balance: Number(balance.toFixed(2)),
          equity: Number(balance.toFixed(2)),
          drawdownPercent: Number(ddPercent.toFixed(3))
        };
      });
      computed.summary.maxDrawdownMoney = Number(maxDdMoney.toFixed(2));
      computed.summary.maxDrawdownPercent = Number(maxDdPercent.toFixed(2));
      computed.summary.recoveryFactor = maxDdMoney > 0
        ? Number((computed.summary.netProfit / maxDdMoney).toFixed(2))
        : computed.summary.netProfit > 0 ? 999 : null;
    }

    const filteredExitRows = actualRange.positions.filter((item:any) =>
      selectedStrategyModes.includes(item.controlMode)
    );
    const volumes = filteredExitRows
      .map((item:any) => Number(item.volume || 0))
      .filter((value:number) => Number.isFinite(value) && value > 0);
    const lotMap = new Map<number, number>();
    for (const volume of volumes) {
      const lot = Number(volume.toFixed(4));
      lotMap.set(lot, (lotMap.get(lot) || 0) + 1);
    }
    const lotDistribution = Array.from(lotMap.entries())
      .map(([lot,count]) => ({
        lot,
        count,
        percent: volumes.length ? Number((count / volumes.length * 100).toFixed(2)) : 0
      }))
      .sort((a,b) => a.lot - b.lot);
    const primaryLot = [...lotDistribution].sort((a,b) => b.count - a.count || a.lot - b.lot)[0] || {
      lot:0,count:0,percent:0
    };
    computed.summary.totalPositions = filteredExitRows.length;
    computed.summary.totalDeals = selectedRangeLedger.length;
    computed.summary.expectedPayoff = filteredExitRows.length
      ? Number((selectedRangeNet / filteredExitRows.length).toFixed(2))
      : 0;
    computed.summary.runtimeSeconds = runtimeSeconds;
    computed.summary.averageLot = volumes.length
      ? Number((volumes.reduce((sum:number,value:number)=>sum+value,0)/volumes.length).toFixed(4))
      : 0;
    computed.summary.maxLot = volumes.length ? Number(Math.max(...volumes).toFixed(4)) : 0;
    computed.summary.primaryLot = primaryLot.lot;
    computed.summary.primaryLotCount = primaryLot.count;
    computed.summary.primaryLotPercent = primaryLot.percent;
    computed.summary.lotSizeCount = lotDistribution.length;
    if(zeroGridOnly){
      const cycleView=buildZeroGridCyclePresentation(baskets,derivedStart);
      Object.assign(computed.summary,cycleView.summary);
      computed.curve=cycleView.curve;
    }

    const modeBreakdown = SHARE_STRATEGY_MODES.map((mode) => {
      const rows = allBaskets.filter((item:any) => item.controlMode === mode);
      const wins = rows.filter((item:any) => Number(item.net_profit || 0) > 0).length;
      return {
        mode,
        label: shareModeLabel(mode),
        baskets: rows.length,
        wins,
        losses: rows.filter((item:any) => Number(item.net_profit || 0) < 0).length,
        winRate: rows.length ? Number((wins / rows.length * 100).toFixed(2)) : 0,
        netProfit: Number(rows.reduce((sum:number,item:any)=>sum+Number(item.net_profit||0),0).toFixed(2))
      };
    });

    const accountCurrency = String(
      account.metrics?.currency || frozen.account?.currency || "UNKNOWN"
    ).trim().toUpperCase() || "UNKNOWN";
    const accountSymbol = String(
      account.metrics?.symbol || frozen.account?.symbol || "XAUUSD"
    );
    const reportedTradeMode = Number(account.metrics?.accountTradeMode);
    const serverIdentity = `${account.broker || frozen.account?.broker || ""} ${account.broker_server || frozen.account?.brokerServer || ""}`.toLowerCase();
    const accountType =
      reportedTradeMode === 2
        ? "REAL"
        : reportedTradeMode === 0 || reportedTradeMode === 1
          ? "DEMO"
          : String(frozen.account?.accountType || "").toUpperCase() === "DEMO"
            ? "DEMO"
            : /(demo|practice|trial|contest)/i.test(serverIdentity)
              ? "DEMO"
              : "REAL";

    const rangeEnd = derivedStart === null
      ? null
      : Number((derivedStart + selectedRangeNet).toFixed(2));
    if (rangeEnd !== null && computed.curve.length > 0) {
      computed.curve[computed.curve.length - 1].balance = rangeEnd;
      computed.curve[computed.curve.length - 1].equity = rangeEnd;
    }

    const snapshot = {
      kind: "LIVE_PERFORMANCE_PUBLIC",
      frozenAt: frozen.frozenAt || row.created_at,
      liveUpdatedAt: new Date().toISOString(),
      account: {
        ...(frozen.account || {}),
        accountNumber: frozen.account?.accountNumber || account.account_number,
        broker: frozen.account?.broker || account.broker,
        brokerServer: frozen.account?.brokerServer || account.broker_server,
        mode: frozen.account?.mode || account.mode,
        accountType,
        symbol: accountSymbol,
        timeframe: String(account.metrics?.timeframe || frozen.account?.timeframe || "M5"),
        currency: accountCurrency
      },
      range: { from: from.toISOString(), to: to.toISOString() },
      filter: {
        strategyModes: selectedStrategyModes,
        scope: selectedStrategyModes.length === SHARE_STRATEGY_MODES.length ? "ALL_STRATEGIES" : "CUSTOM_PORTFOLIO"
      },
      balance: {
        current: currentBalance > 0 ? currentBalance : null,
        equity: Number(account.metrics?.equity || 0) > 0 ? Number(account.metrics.equity) : null,
        derivedStart,
        rangeEnd
      },
      summary: computed.summary,
      curve: computed.curve,
      curveBasis: zeroGridOnly ? "BOT_CYCLES" : "CLOSED_POSITIONS",
      lotDistribution,
      modeBreakdown,
      closedTrades: filteredExitRows.map((trade:any) => ({
        ticket: String(trade.positionId),
        positionId: String(trade.positionId),
        symbol: trade.symbol || accountSymbol,
        side: trade.direction,
        lot: Number(trade.volume || 0),
        entryPrice: trade.entryPrice === null ? null : Number(trade.entryPrice),
        exitPrice: trade.exitPrice === null ? null : Number(trade.exitPrice),
        profit: Number(trade.net_profit || 0),
        openedAt: trade.openedAt || null,
        closedAt: trade.closedAt
      }))
    };

    return {
      id: row.id,
      title: row.title,
      public_slug: row.public_slug,
      created_at: row.created_at,
      dynamic: true,
      defaultRange: { from: row.from_at, to: row.to_at },
      availableRange: {
        from: available?.min_at || row.from_at,
        to: available?.max_at || new Date().toISOString()
      },
      snapshot
    };
  }
}
