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

type Actor = { sub: string; role?: string };
type BasketRow = {
  direction: string;
  net_profit: number | string;
  created_at: string;
};

@Controller("performance-actions")
@UseGuards(JwtGuard)
export class PerformanceActionsController {
  constructor(private readonly db: DbService) {}

  private elevated(actor: Actor) {
    return actor?.role === "OWNER" || actor?.role === "ADMIN";
  }

  private parseRange(fromRaw = "", toRaw = "") {
    const now = new Date();
    const to = toRaw ? new Date(toRaw + (toRaw.length <= 10 ? "T23:59:59.999Z" : "")) : now;
    const from = fromRaw
      ? new Date(fromRaw + (fromRaw.length <= 10 ? "T00:00:00.000Z" : ""))
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
    const decided = wins + losses;
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
        winRate: decided > 0 ? Number((wins / decided * 100).toFixed(2)) : 0,
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
    @Body() body: { accountId?: string; from?: string; to?: string; title?: string }
  ) {
    const actor = req.user as Actor;
    const account = await this.accountForActor(actor, String(body?.accountId || ""));
    if (!account.instance_id) throw new BadRequestException("selected account has no bot instance");
    const { from, to } = this.parseRange(String(body?.from || ""), String(body?.to || ""));
    const metrics = account.metrics || {};
    const currentBalance = Number(metrics.balance || 0);

    const basketResult = await this.db.query(
      `SELECT direction,net_profit,created_at
       FROM trade_journal
       WHERE bot_instance_id=$1
         AND mt5_account_id=$4
         AND event_type='BASKET'
         AND created_at >= $2
         AND created_at <= $3
       ORDER BY created_at ASC
       LIMIT 20000`,
      [account.instance_id, from.toISOString(), to.toISOString(), account.id]
    );
    const baskets = basketResult.rows as BasketRow[];
    if (!baskets.length) throw new BadRequestException("ยังไม่มีข้อมูลผลการเทรดในช่วงเวลาที่เลือก");

    const pnlSinceFrom = await this.db.one(
      `SELECT COALESCE(SUM(net_profit),0)::float8 AS net
       FROM trade_journal
       WHERE bot_instance_id=$1
         AND mt5_account_id=$3
         AND event_type='BASKET'
         AND created_at >= $2`,
      [account.instance_id, from.toISOString(), account.id]
    );
    const derivedStart = currentBalance > 0
      ? Number((currentBalance - Number(pnlSinceFrom?.net || 0)).toFixed(2))
      : null;
    const computed = this.summarize(baskets, derivedStart);

    const exitResult = await this.db.query(
      `SELECT
         x.deal_ticket,x.position_id,x.direction,x.volume,x.price AS exit_price,x.net_profit,
         x.created_at AS closed_at,COALESCE(x.metadata->>'symbol',$5) AS symbol,
         e.price AS entry_price,e.created_at AS opened_at
       FROM trade_journal x
       LEFT JOIN LATERAL (
         SELECT price,created_at
         FROM trade_journal e
         WHERE e.bot_instance_id=x.bot_instance_id
           AND e.mt5_account_id=x.mt5_account_id
           AND e.event_type='ENTRY'
           AND e.position_id=x.position_id
           AND e.created_at<=x.created_at
         ORDER BY e.created_at DESC
         LIMIT 1
       ) e ON true
       WHERE x.bot_instance_id=$1
         AND x.mt5_account_id=$4
         AND x.event_type='EXIT'
         AND x.created_at >= $2
         AND x.created_at <= $3
       ORDER BY x.created_at DESC
       LIMIT 500`,
      [account.instance_id, from.toISOString(), to.toISOString(), account.id, String(metrics.symbol || "XAUUSD")]
    );

    const slug = `live-${String(account.account_number || "account").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${randomBytes(5).toString("hex")}`;
    const title = String(body?.title || `SCENOVA Live Performance · ${account.account_number}`).slice(0, 180);
    const snapshot = {
      kind: "LIVE_PERFORMANCE_SNAPSHOT",
      frozenAt: new Date().toISOString(),
      account: {
        userCode: account.user_code,
        accountNumber: account.account_number,
        broker: account.broker,
        brokerServer: account.broker_server,
        mode: account.mode,
        symbol: String(metrics.symbol || "XAUUSD"),
        timeframe: String(metrics.timeframe || "M5"),
        currency: String(metrics.currency || "USD").trim().toUpperCase() || "USD"
      },
      range: { from: from.toISOString(), to: to.toISOString() },
      balance: {
        current: currentBalance > 0 ? currentBalance : null,
        equity: Number(metrics.equity || 0) > 0 ? Number(metrics.equity) : null,
        derivedStart,
        basis: derivedStart !== null ? "DERIVED_FROM_CURRENT_BALANCE_AND_BOT_PNL" : "BOT_CLOSED_PNL_ONLY"
      },
      summary: computed.summary,
      curve: computed.curve,
      monthly: computed.monthly,
      closedTrades: exitResult.rows.map((row: any) => ({
        ticket: String(row.deal_ticket),
        positionId: row.position_id ? String(row.position_id) : null,
        symbol: row.symbol || String(metrics.symbol || "XAUUSD"),
        side: row.direction,
        lot: Number(row.volume || 0),
        entryPrice: row.entry_price === null ? null : Number(row.entry_price),
        exitPrice: Number(row.exit_price || 0),
        profit: Number(row.net_profit || 0),
        openedAt: row.opened_at || null,
        closedAt: row.closed_at
      }))
    };

    const share = await this.db.one(
      `INSERT INTO performance_shares(
         owner_user_id,created_by_user_id,mt5_account_id,title,public_slug,from_at,to_at,snapshot
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING id,title,public_slug,created_at`,
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
      path: `/shared-performance/${share.public_slug}`
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

  @Get(":slug")
  @Header("Cache-Control", "public, max-age=60")
  async publicShare(@Param("slug") slug: string) {
    const row = await this.db.one(
      `SELECT id,title,public_slug,from_at,to_at,snapshot,created_at
       FROM performance_shares
       WHERE public_slug=$1 AND is_active=true
       LIMIT 1`,
      [slug]
    );
    if (!row) throw new BadRequestException("public performance report not found");
    return row;
  }
}
