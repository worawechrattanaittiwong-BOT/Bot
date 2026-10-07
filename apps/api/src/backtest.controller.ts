import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";

type BacktestTradeInput = {
  openedAt?: string | null;
  closedAt?: string | null;
  direction: "BUY" | "SELL";
  volume?: number;
  openPrice?: number;
  closePrice?: number;
  profit: number;
  balanceAfter?: number | null;
  metadata?: Record<string, any>;
};

@Controller("backtest")
@UseGuards(JwtGuard)
export class BacktestController {
  constructor(private readonly db: DbService) {}

  private async slotForUser(userId: string, slotId = "") {
    if (slotId) {
      const slot = await this.db.one(
        `SELECT id,slot_number,mode,label
         FROM license_slots
         WHERE id=$1
           AND (owner_user_id=$2 OR assigned_user_id=$2)
         LIMIT 1`,
        [slotId, userId]
      );
      if (!slot) throw new ConflictException("slot unavailable");
      return slot;
    }

    return this.db.one(
      `SELECT id,slot_number,mode,label
       FROM license_slots
       WHERE owner_user_id=$1 OR assigned_user_id=$1
       ORDER BY
         CASE WHEN status='ACTIVE' THEN 0 ELSE 1 END,
         slot_number ASC,
         created_at ASC
       LIMIT 1`,
      [userId]
    );
  }

  private normalizeTrades(input: any[]): BacktestTradeInput[] {
    if (!Array.isArray(input)) throw new BadRequestException("trades must be an array");
    if (input.length > 10000) throw new BadRequestException("too many backtest trades");

    return input.map((raw: any, index: number) => {
      const direction = String(raw?.direction || "").toUpperCase();
      if (direction !== "BUY" && direction !== "SELL") {
        throw new BadRequestException("trade " + (index + 1) + " direction must be BUY or SELL");
      }
      const profit = Number(raw?.profit);
      if (!Number.isFinite(profit)) {
        throw new BadRequestException("trade " + (index + 1) + " profit is invalid");
      }
      return {
        openedAt: raw?.openedAt ? String(raw.openedAt) : null,
        closedAt: raw?.closedAt ? String(raw.closedAt) : null,
        direction,
        volume: Math.max(0, Number(raw?.volume || 0)),
        openPrice: Math.max(0, Number(raw?.openPrice || 0)),
        closePrice: Math.max(0, Number(raw?.closePrice || 0)),
        profit,
        balanceAfter: raw?.balanceAfter === null || raw?.balanceAfter === undefined
          ? null
          : Number(raw.balanceAfter),
        metadata: raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : {}
      };
    });
  }

  private summarize(initialDeposit: number, trades: BacktestTradeInput[]) {
    const startBalance = Number.isFinite(initialDeposit) ? Math.max(0, initialDeposit) : 0;
    let balance = startBalance;
    let peak = startBalance;
    let maxDrawdownMoney = 0;
    let maxDrawdownPercent = 0;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let maeTotal = 0;
    let maeSamples = 0;
    let mfeTotal = 0;
    let mfeSamples = 0;
    let capturedProfit = 0;
    let availableMfeProfit = 0;
    let captureSamples = 0;
    let terminalChaseCount = 0;
    let terminalChaseSamples = 0;
    let churnCount = 0;
    let churnSamples = 0;
    const basketStats = new Map<string, {
      firstOpenedMs: number | null;
      lastOpenedMs: number | null;
      target: number;
      maxIndex: number;
      maxElapsedSeconds: number | null;
    }>();
    const equityCurve: Array<{ index: number; time: string | null; balance: number }> = [];

    trades.forEach((trade, index) => {
      const profit = Number(trade.profit || 0);
      if (profit > 0) {
        wins += 1;
        grossProfit += profit;
      } else if (profit < 0) {
        losses += 1;
        grossLoss += Math.abs(profit);
      } else {
        breakeven += 1;
      }

      const metadata = trade.metadata || {};
      const mae = Number(metadata.mae);
      if (Number.isFinite(mae)) {
        maeTotal += Math.abs(mae);
        maeSamples += 1;
      }
      const mfe = Number(metadata.mfe);
      if (Number.isFinite(mfe)) {
        mfeTotal += Math.abs(mfe);
        mfeSamples += 1;
      }
      const mfeProfit = Number(metadata.mfeProfit);
      if (Number.isFinite(mfeProfit) && mfeProfit > 0) {
        availableMfeProfit += mfeProfit;
        capturedProfit += Math.max(0, profit);
        captureSamples += 1;
      }

      if (typeof metadata.terminalChase === "boolean") {
        terminalChaseSamples += 1;
        if (metadata.terminalChase) terminalChaseCount += 1;
      }
      if (typeof metadata.churn === "boolean") {
        churnSamples += 1;
        if (metadata.churn) churnCount += 1;
      }

      const basketId = metadata.basketId === null || metadata.basketId === undefined
        ? ""
        : String(metadata.basketId);
      if (basketId) {
        const openedMs = trade.openedAt ? new Date(trade.openedAt).getTime() : NaN;
        const elapsedSeconds = Number(metadata.basketElapsedSeconds);
        const target = Math.max(1, Number(metadata.basketTargetPositions || 1));
        const basketIndex = Math.max(1, Number(metadata.basketIndex || 1));
        const current = basketStats.get(basketId) || {
          firstOpenedMs: null,
          lastOpenedMs: null,
          target,
          maxIndex: 0,
          maxElapsedSeconds: null
        };
        if (Number.isFinite(openedMs)) {
          current.firstOpenedMs = current.firstOpenedMs === null
            ? openedMs
            : Math.min(current.firstOpenedMs, openedMs);
          current.lastOpenedMs = current.lastOpenedMs === null
            ? openedMs
            : Math.max(current.lastOpenedMs, openedMs);
        }
        current.target = Math.max(current.target, target);
        current.maxIndex = Math.max(current.maxIndex, basketIndex);
        if (Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0) {
          current.maxElapsedSeconds = current.maxElapsedSeconds === null
            ? elapsedSeconds
            : Math.max(current.maxElapsedSeconds, elapsedSeconds);
        }
        basketStats.set(basketId, current);
      }

      const suppliedBalance = Number(trade.balanceAfter);
      balance = Number.isFinite(suppliedBalance) && suppliedBalance > 0
        ? suppliedBalance
        : balance + profit;
      peak = Math.max(peak, balance);
      const drawdownMoney = Math.max(0, peak - balance);
      const drawdownPercent = peak > 0 ? drawdownMoney / peak * 100 : 0;
      maxDrawdownMoney = Math.max(maxDrawdownMoney, drawdownMoney);
      maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
      equityCurve.push({
        index: index + 1,
        time: trade.closedAt || trade.openedAt || null,
        balance: Number(balance.toFixed(2))
      });
    });

    let completedBasketFillSeconds = 0;
    let completedBasketFillSamples = 0;
    let completedWithin10Minutes = 0;
    basketStats.forEach((basket) => {
      if (basket.maxIndex < basket.target) return;
      let fillSeconds = basket.maxElapsedSeconds;
      if (
        fillSeconds === null &&
        basket.firstOpenedMs !== null &&
        basket.lastOpenedMs !== null
      ) {
        fillSeconds = Math.max(0, (basket.lastOpenedMs - basket.firstOpenedMs) / 1000);
      }
      if (fillSeconds === null) return;
      completedBasketFillSeconds += fillSeconds;
      completedBasketFillSamples += 1;
      if (fillSeconds <= 600) completedWithin10Minutes += 1;
    });

    const closedTrades = trades.length;
    const netProfit = grossProfit - grossLoss;
    const decided = wins + losses;
    return {
      summary: {
        closedTrades,
        wins,
        losses,
        breakeven,
        winRate: decided > 0 ? wins / decided * 100 : 0,
        netProfit: Number(netProfit.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossLoss: Number(grossLoss.toFixed(2)),
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0,
        averageWin: wins > 0 ? grossProfit / wins : 0,
        averageLoss: losses > 0 ? grossLoss / losses : 0,
        maxDrawdownMoney: Number(maxDrawdownMoney.toFixed(2)),
        maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
        initialDeposit: Number(startBalance.toFixed(2)),
        finalBalance: Number(balance.toFixed(2)),
        returnPercent: startBalance > 0 ? Number(((balance - startBalance) / startBalance * 100).toFixed(2)) : 0,
        avgMae: maeSamples > 0 ? Number((maeTotal / maeSamples).toFixed(4)) : null,
        maeSamples,
        avgMfe: mfeSamples > 0 ? Number((mfeTotal / mfeSamples).toFixed(4)) : null,
        mfeSamples,
        profitCapturePercent: captureSamples > 0 && availableMfeProfit > 0
          ? Number((Math.min(1, capturedProfit / availableMfeProfit) * 100).toFixed(2))
          : null,
        captureSamples,
        terminalChaseCount,
        terminalChaseSamples,
        terminalChaseRate: terminalChaseSamples > 0
          ? Number((terminalChaseCount / terminalChaseSamples * 100).toFixed(2))
          : null,
        churnCount,
        churnSamples,
        churnRate: churnSamples > 0
          ? Number((churnCount / churnSamples * 100).toFixed(2))
          : null,
        avgBasketFillSeconds: completedBasketFillSamples > 0
          ? Number((completedBasketFillSeconds / completedBasketFillSamples).toFixed(2))
          : null,
        basketFillSamples: completedBasketFillSamples,
        basketFillWithin10MinRate: completedBasketFillSamples > 0
          ? Number((completedWithin10Minutes / completedBasketFillSamples * 100).toFixed(2))
          : null
      },
      equityCurve
    };
  }
  private async insertRun(
    userId: string,
    body: any,
    source: "IMPORT" | "MT5_TESTER" | "SAMPLE",
    tradesInput: BacktestTradeInput[]
  ) {
    const slot = await this.slotForUser(userId, String(body?.slotId || ""));
    const initialDeposit = Math.max(0, Number(body?.initialDeposit || 1000));
    const computed = this.summarize(initialDeposit, tradesInput);
    const run = await this.db.one(
      `INSERT INTO backtest_runs(
         owner_user_id,slot_id,title,source,symbol,timeframe,started_at,ended_at,
         initial_deposit,lot,currency,settings,summary,equity_curve,status
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,'COMPLETED')
       RETURNING *`,
      [
        userId,
        slot?.id || null,
        String(body?.title || (source === "SAMPLE" ? "SCENOVA Backtest ตัวอย่าง" : "Backtest Report")).slice(0, 160),
        source,
        String(body?.symbol || "XAUUSDm").slice(0, 64),
        String(body?.timeframe || "M5").slice(0, 16),
        body?.startedAt || null,
        body?.endedAt || null,
        initialDeposit,
        Math.max(0, Number(body?.lot || 0.01)),
        String(body?.currency || "USD").slice(0, 12),
        JSON.stringify(body?.settings && typeof body.settings === "object" ? body.settings : {}),
        JSON.stringify(computed.summary),
        JSON.stringify(computed.equityCurve)
      ]
    );

    for (let index = 0; index < tradesInput.length; index += 1) {
      const trade = tradesInput[index];
      const curvePoint = computed.equityCurve[index];
      await this.db.query(
        `INSERT INTO backtest_trades(
           run_id,trade_index,opened_at,closed_at,direction,volume,
           open_price,close_price,profit,balance_after,metadata
         )
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          run.id,
          index + 1,
          trade.openedAt || null,
          trade.closedAt || null,
          trade.direction,
          Number(trade.volume || 0),
          Number(trade.openPrice || 0),
          Number(trade.closePrice || 0),
          Number(trade.profit || 0),
          curvePoint?.balance ?? null,
          JSON.stringify(trade.metadata || {})
        ]
      );
    }

    return this.runForOwner(userId, run.id);
  }

  private async runForOwner(userId: string, id: string) {
    const run = await this.db.one(
      `SELECT br.*,ls.slot_number,ls.mode AS slot_mode
       FROM backtest_runs br
       LEFT JOIN license_slots ls ON ls.id=br.slot_id
       WHERE br.id=$1 AND br.owner_user_id=$2`,
      [id, userId]
    );
    if (!run) throw new ConflictException("backtest report not found");
    const trades = await this.db.query(
      `SELECT trade_index,opened_at,closed_at,direction,volume,open_price,close_price,
              profit,balance_after,metadata
       FROM backtest_trades
       WHERE run_id=$1
       ORDER BY trade_index ASC`,
      [id]
    );
    return { ...run, trades: trades.rows };
  }

  @Get("runs")
  async runs(@Req() req: any, @Query("slotId") slotId = "") {
    const params: any[] = [req.user.sub];
    let slotClause = "";
    if (slotId) {
      await this.slotForUser(req.user.sub, slotId);
      params.push(slotId);
      slotClause = " AND br.slot_id=$2";
    }
    const rows = await this.db.query(
      `SELECT br.id,br.title,br.source,br.symbol,br.timeframe,br.started_at,br.ended_at,
              br.initial_deposit,br.lot,br.currency,br.summary,br.status,br.is_published,
              br.public_slug,br.settings,br.created_at,ls.slot_number
       FROM backtest_runs br
       LEFT JOIN license_slots ls ON ls.id=br.slot_id
       WHERE br.owner_user_id=$1${slotClause}
       ORDER BY br.created_at DESC
       LIMIT 100`,
      params
    );
    return rows.rows;
  }

  @Get("run")
  async run(@Req() req: any, @Query("id") id = "") {
    if (!id) throw new BadRequestException("backtest id required");
    return this.runForOwner(req.user.sub, id);
  }

  @Post("import")
  async importRun(@Req() req: any, @Body() body: any) {
    const trades = this.normalizeTrades(body?.trades || []);
    if (!trades.length) throw new BadRequestException("at least one trade is required");
    return this.insertRun(req.user.sub, body, "IMPORT", trades);
  }

  @Post("zero-history")
  async zeroHistory(@Req() req: any, @Body() body: any) {
    const slot = await this.slotForUser(req.user.sub, String(body?.slotId || ""));
    if (!slot) throw new ConflictException("slot unavailable");

    const instance = await this.db.one(
      `SELECT id,mt5_account_id,metrics
       FROM bot_instances
       WHERE slot_id=$1
       LIMIT 1`,
      [slot.id]
    );
    if (!instance?.mt5_account_id) {
      throw new ConflictException("ZERO GRID history requires a connected MT5 account");
    }

    const settingsRow = await this.db.one(
      "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
      [instance.id]
    );
    const settings = { ...(settingsRow?.settings || {}) };

    const journal = await this.db.query(
      `SELECT deal_ticket,direction,volume::float8,net_profit::float8,metadata,created_at
       FROM trade_journal
       WHERE bot_instance_id=$1
         AND mt5_account_id=$2
         AND event_type='BASKET'
         AND UPPER(COALESCE(metadata->>'controlMode',''))='ZERO_GRID'
       ORDER BY created_at ASC,id ASC
       LIMIT 10000`,
      [instance.id, instance.mt5_account_id]
    );

    const rows = journal.rows || [];
    if (!rows.length) {
      throw new ConflictException("ยังไม่มีรอบ ZERO GRID ที่ปิดสมบูรณ์สำหรับสร้างรายงาน");
    }

    const toIso = (seconds: unknown, fallback: unknown) => {
      const value = Number(seconds);
      if (Number.isFinite(value) && value > 0) {
        return new Date(value * 1000).toISOString();
      }
      return new Date(String(fallback)).toISOString();
    };

    const trades: BacktestTradeInput[] = rows.map((row: any) => ({
      openedAt: toIso(row.metadata?.startedAt, row.created_at),
      closedAt: toIso(row.metadata?.endedAt, row.created_at),
      direction: String(row.direction || "").toUpperCase() === "SELL" ? "SELL" : "BUY",
      volume: Math.max(0, Number(row.volume || 0)),
      openPrice: 0,
      closePrice: 0,
      profit: Number(row.net_profit || 0),
      metadata: {
        controlMode: "ZERO_GRID",
        dataSource: "LIVE_ZERO_HISTORY",
        basketDealTicket: String(row.deal_ticket || ""),
        peakPositions: Number(row.metadata?.peakPositions || 0),
        symbol: String(row.metadata?.symbol || instance.metrics?.symbol || "")
      }
    }));

    const totalNet = trades.reduce((sum, trade) => sum + Number(trade.profit || 0), 0);
    const currentBalance = Number(instance.metrics?.balance || 0);
    const inferredStart = currentBalance > 0 ? currentBalance - totalNet : 0;
    const initialDeposit = inferredStart > 0
      ? inferredStart
      : Math.max(1000, currentBalance || 0);
    const symbol = String(
      rows[0]?.metadata?.symbol || instance.metrics?.symbol || "XAUUSDm"
    );
    const currency = String(instance.metrics?.currency || "USD");

    return this.insertRun(
      req.user.sub,
      {
        slotId: slot.id,
        title: "ZERO GRID · ประวัติรอบจริง",
        symbol,
        timeframe: "LIVE",
        startedAt: trades[0]?.openedAt || null,
        endedAt: trades[trades.length - 1]?.closedAt || null,
        initialDeposit,
        lot: Math.max(0, Number(settings.zeroGridBaseLot || settings.lot || 0.01)),
        currency,
        settings: {
          controlMode: "ZERO_GRID",
          dataSource: "LIVE_ZERO_HISTORY",
          zeroGridFirstGapPrice: Number(settings.zeroGridFirstGapPrice ?? 3),
          zeroGridStepPrice: Number(settings.zeroGridStepPrice || 0),
          zeroGridLowVolatilityEnabled: settings.zeroGridLowVolatilityEnabled === true,
          zeroGridLevelsPerSide: Number(settings.zeroGridLevelsPerSide || 0),
          zeroGridBaseLot: Number(settings.zeroGridBaseLot || settings.lot || 0.01),
          zeroGridMinNetProfitMoney: Number(settings.zeroGridMinNetProfitMoney || 0),
          zeroGridCloseReserveMoney: Number(settings.zeroGridCloseReserveMoney || 0)
        }
      },
      "IMPORT",
      trades
    );
  }

  @Post("sample")
  async sample(@Req() req: any, @Body() body: any) {
    const profits = [
      14.8,-7.2,18.4,11.1,-9.6,22.3,-6.8,16.5,9.4,-12.1,24.7,13.2,
      -8.5,19.1,7.8,-5.9,21.6,-10.4,15.3,12.7,-7.1,18.9,10.5,-6.2
    ];
    const base = new Date("2026-08-01T02:00:00Z").getTime();
    const trades: BacktestTradeInput[] = profits.map((profit, index) => {
      const opened = new Date(base + index * 30 * 60 * 60 * 1000);
      const closed = new Date(opened.getTime() + (35 + (index % 5) * 18) * 60 * 1000);
      const buy = index % 3 !== 1;
      const openPrice = 4320 + index * 2.4;
      const priceMove = profit / 2;
      return {
        openedAt: opened.toISOString(),
        closedAt: closed.toISOString(),
        direction: buy ? "BUY" : "SELL",
        volume: Number(body?.lot || 0.01),
        openPrice,
        closePrice: buy ? openPrice + priceMove : openPrice - priceMove,
        profit,
        metadata: {
          simulated: true,
          setup: index % 2 === 0 ? "FIB_PULLBACK" : "ORDER_BLOCK_PULLBACK"
        }
      };
    });

    return this.insertRun(
      req.user.sub,
      {
        ...body,
        title: body?.title || "SCENOVA Backtest ตัวอย่าง",
        symbol: body?.symbol || "XAUUSDm",
        timeframe: body?.timeframe || "M5",
        startedAt: "2026-08-01T00:00:00Z",
        endedAt: "2026-08-31T23:59:59Z",
        initialDeposit: Number(body?.initialDeposit || 1000),
        lot: Number(body?.lot || 0.01),
        settings: {
          ...(body?.settings || {}),
          disclaimer: "SIMULATED_SAMPLE"
        }
      },
      "SAMPLE",
      trades
    );
  }

  @Post("publish")
  async publish(@Req() req: any, @Body() body: { id: string; published?: boolean }) {
    const run = await this.runForOwner(req.user.sub, String(body?.id || ""));
    const published = body?.published !== false;
    const slug = run.public_slug || (
      "scenova-" +
      String(run.symbol || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
      "-" + randomBytes(4).toString("hex")
    );
    const updated = await this.db.one(
      `UPDATE backtest_runs
       SET is_published=$3,public_slug=CASE WHEN $3 THEN COALESCE(public_slug,$4) ELSE public_slug END,updated_at=now()
       WHERE id=$1 AND owner_user_id=$2
       RETURNING id,is_published,public_slug`,
      [run.id, req.user.sub, published, slug]
    );
    return updated;
  }

  @Get("export.csv")
  async exportCsv(@Req() req: any, @Query("id") id: string, @Res() res: Response) {
    const run = await this.runForOwner(req.user.sub, id);
    const escape = (value: any) => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const header = [
      "Trade","Opened At","Closed At","Direction","Volume","Open Price",
      "Close Price","Profit","Balance After"
    ];
    const rows = run.trades.map((trade: any) => [
      trade.trade_index,
      trade.opened_at || "",
      trade.closed_at || "",
      trade.direction,
      trade.volume,
      trade.open_price,
      trade.close_price,
      trade.profit,
      trade.balance_after
    ]);
    const csv = [header, ...rows].map(row => row.map(escape).join(",")).join("\n");
    const fileName = String(run.title || "backtest")
      .replace(/[^a-zA-Z0-9ก-๙_-]+/g, "-")
      .slice(0, 80) + ".csv";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(fileName));
    res.send("\uFEFF" + csv);
  }
}

@Controller("performance")
export class PerformanceController {
  constructor(private readonly db: DbService) {}

  @Get(":slug")
  async publicPerformance(@Param("slug") slug: string) {
    const run = await this.db.one(
      `SELECT id,title,source,symbol,timeframe,started_at,ended_at,initial_deposit,lot,
              currency,summary,equity_curve,public_slug,created_at
       FROM backtest_runs
       WHERE public_slug=$1 AND is_published=true
       LIMIT 1`,
      [slug]
    );
    if (!run) throw new ConflictException("public performance report not found");

    const trades = await this.db.query(
      `SELECT trade_index,opened_at,closed_at,direction,volume,open_price,close_price,
              profit,balance_after
       FROM backtest_trades
       WHERE run_id=$1
       ORDER BY trade_index DESC
       LIMIT 20`,
      [run.id]
    );

    return {
      ...run,
      label: run.source === "SAMPLE" ? "SIMULATED DEMO" : "BACKTEST",
      disclaimer: run.source === "SAMPLE"
        ? "ผลจำลองตัวอย่าง ไม่ใช่ผลการเทรดเงินจริง"
        : "ผลทดสอบย้อนหลัง ไม่ใช่การรับประกันผลลัพธ์ในอนาคต",
      trades: trades.rows
    };
  }
}
