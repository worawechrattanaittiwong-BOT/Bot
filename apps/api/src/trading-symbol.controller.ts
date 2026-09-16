import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { DbService } from "./db.service";
import { isVersionAtLeast } from "./release-version";
import { CryptoService, JwtGuard } from "./security";

const SYMBOL_AGENT_VERSION = "1.0.10";

function normalizeSymbol(value: unknown) {
  const symbol = String(value || "").trim();
  if (!symbol || symbol.length > 64 || !/^[A-Za-z0-9._#-]+$/.test(symbol)) {
    return "";
  }
  return symbol;
}

function parseTradeMode(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function symbolTradeAllowed(mode: unknown) {
  const n = parseTradeMode(mode);
  if (n === null) return null;
  // MQL5: DISABLED=0, LONGONLY=1, SHORTONLY=2, CLOSEONLY=3, FULL=4.
  // LONGONLY/SHORTONLY remain valid; the EA already enforces direction.
  return n !== 0 && n !== 3;
}

@Controller("bot/trading-symbol")
@UseGuards(JwtGuard)
export class TradingSymbolController {
  constructor(private readonly db: DbService) {}

  private async localInstance(userId: string, slotId: string) {
    if (!slotId) throw new BadRequestException("ไม่พบ Local Slot ที่เลือก");
    const row = await this.db.one(
      `SELECT
         bi.*,
         ls.mode,
         bs.settings,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) AS positions,
         (bi.agent_last_seen_at IS NOT NULL AND bi.agent_last_seen_at > now() - interval '90 seconds') AS agent_online
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.status IN ('ACTIVE','AVAILABLE')
       LIMIT 1`,
      [slotId, userId]
    );
    if (!row) throw new ConflictException("ไม่พบ SCENOVA Instance ของ Slot นี้");
    if (String(row.mode || "").toUpperCase() !== "LOCAL") {
      throw new ConflictException("การเลือก Symbol รุ่นนี้ใช้กับ Local MT5 เท่านั้น");
    }
    return row;
  }

  private snapshot(instance: any) {
    const settings = instance.settings || {};
    const metrics = instance.metrics || {};
    const explicitSymbol = normalizeSymbol(settings.startupSymbol);
    const activeSymbol = normalizeSymbol(metrics.symbol);
    const fallbackSymbol = normalizeSymbol(settings.symbol);
    const desiredSymbol = explicitSymbol || activeSymbol || fallbackSymbol || "XAUUSD";
    const tradeMode = parseTradeMode(metrics.symbolTradeMode);
    const tradingAllowed = symbolTradeAllowed(tradeMode);
    const matches = Boolean(
      activeSymbol &&
      desiredSymbol &&
      activeSymbol.toUpperCase() === desiredSymbol.toUpperCase()
    );

    return {
      desiredSymbol,
      explicitSymbol: explicitSymbol || null,
      activeSymbol: activeSymbol || null,
      brokerSymbolTradeMode: tradeMode,
      brokerTradingAllowed: tradingAllowed,
      symbolReady: matches && tradingAllowed !== false,
      pendingRestart: Boolean(explicitSymbol && !matches),
      positions: Math.max(0, Number(instance.positions || 0)),
      actualState: String(instance.actual_state || "STOPPED"),
      desiredState: String(instance.desired_state || "STOPPED"),
      agentOnline: Boolean(instance.agent_online),
      agentVersion: String(instance.agent_version || ""),
      minimumAgentVersion: SYMBOL_AGENT_VERSION
    };
  }

  @Get()
  async get(@Req() req: any, @Query("slotId") slotId = "") {
    const instance = await this.localInstance(req.user.sub, slotId);
    return { ok: true, ...this.snapshot(instance) };
  }

  @Put()
  async select(
    @Req() req: any,
    @Query("slotId") slotId = "",
    @Body() body: { symbol?: string }
  ) {
    const symbol = normalizeSymbol(body.symbol);
    if (!symbol) {
      throw new BadRequestException(
        "Symbol ไม่ถูกต้อง กรุณาใช้ชื่อเดียวกับ MT5 Market Watch เช่น XAUUSDm, EURUSDm หรือ BTCUSDm"
      );
    }

    const instance = await this.localInstance(req.user.sub, slotId);
    const positions = Math.max(0, Number(instance.positions || 0));
    if (
      positions > 0 ||
      String(instance.actual_state || "").toUpperCase() === "RUNNING" ||
      String(instance.desired_state || "").toUpperCase() === "RUNNING"
    ) {
      throw new ConflictException(
        "หยุดบอทและปิด Position ให้หมดก่อนเปลี่ยน Symbol เพื่อป้องกันออเดอร์ย้ายข้ามตลาด"
      );
    }
    if (!instance.agent_online) {
      throw new ConflictException("Windows Agent ยังไม่ออนไลน์ กรุณาเปิด SCENOVA Agent ก่อนเปลี่ยน Symbol");
    }
    if (!isVersionAtLeast(instance.agent_version, SYMBOL_AGENT_VERSION)) {
      throw new ConflictException(
        "SCENOVA Windows Setup/Agent ต้องเป็น v" + SYMBOL_AGENT_VERSION +
        " หรือใหม่กว่าเพื่อเปลี่ยน Symbol อย่างปลอดภัย กรุณาอัปเดต Setup ก่อน"
      );
    }

    const before = this.snapshot(instance);
    const changed =
      !before.explicitSymbol ||
      String(before.explicitSymbol).toUpperCase() !== symbol.toUpperCase();

    await this.db.query(
      `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
       VALUES($1,jsonb_build_object('startupSymbol',$2::text),now())
       ON CONFLICT(bot_instance_id)
       DO UPDATE SET
         settings=jsonb_set(COALESCE(bot_settings.settings,'{}'::jsonb),'{startupSymbol}',to_jsonb($2::text),true),
         updated_at=now()`,
      [instance.id, symbol]
    );

    const activeSymbol = normalizeSymbol(instance.metrics?.symbol);
    const activeMatches = Boolean(
      activeSymbol && activeSymbol.toUpperCase() === symbol.toUpperCase()
    );
    const requestedAt = new Date().toISOString();
    const requiresReconnect = changed || !activeMatches;

    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='SAFE_STOP',
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'requestedStartupSymbol',$2::text,
             'symbolChangeStatus',$3::text,
             'symbolChangeRequestedAt',$4::text
           )
       WHERE id=$1`,
      [
        instance.id,
        symbol,
        requiresReconnect ? "PENDING_RESTART" : "READY",
        requestedAt
      ]
    );

    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'SELECT_TRADING_SYMBOL','bot_instance',$2,$3::jsonb)",
      [
        String(req.user.code || req.user.sub),
        instance.id,
        JSON.stringify({ slotId, symbol, previous: before.desiredSymbol, changed, activeSymbol: activeSymbol || null })
      ]
    );

    return {
      ok: true,
      symbol,
      changed,
      symbolChangeRequiresReconnect: requiresReconnect,
      message: requiresReconnect
        ? "บันทึก Symbol แล้ว ต้องเชื่อม MT5 ใหม่ 1 ครั้งเพื่อโหลด Chart/EA บน Symbol นี้"
        : "Symbol ที่เลือกตรงกับ EA และ Startup Profile แล้ว"
    };
  }
}

@Controller("ea/trading-symbol")
export class EaTradingSymbolController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  @Post("status")
  async status(@Body() body: { instanceId?: string; installToken?: string }) {
    const instanceId = String(body.instanceId || "").trim();
    const installToken = String(body.installToken || "").trim();
    if (!instanceId || installToken.length < 8) {
      throw new ConflictException("invalid trading symbol agent authentication");
    }

    const row = await this.db.one(
      `SELECT bi.install_token_hash,bi.metrics,bs.settings
       FROM bot_instances bi
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       WHERE bi.id=$1`,
      [instanceId]
    );
    if (!row || String(row.install_token_hash || "") !== this.crypto.sha256(installToken)) {
      throw new ConflictException("invalid trading symbol agent authentication");
    }

    const settings = row.settings || {};
    const metrics = row.metrics || {};
    const explicitSymbol = normalizeSymbol(settings.startupSymbol);
    const currentSymbol = normalizeSymbol(metrics.symbol);
    const legacySavedSymbol = normalizeSymbol(settings.symbol);
    const desiredSymbol = explicitSymbol || currentSymbol || legacySavedSymbol || "XAUUSD";
    const tradeMode = parseTradeMode(metrics.symbolTradeMode);
    const tradingAllowed = symbolTradeAllowed(tradeMode);
    const currentMatchesDesired = Boolean(
      currentSymbol && currentSymbol.toUpperCase() === desiredSymbol.toUpperCase()
    );

    return {
      ok: true,
      desiredSymbol,
      explicitSymbolSelected: Boolean(explicitSymbol),
      currentSymbol: currentSymbol || null,
      symbolTradeMode: tradeMode,
      symbolTradingAllowed: tradingAllowed,
      symbolReady: currentMatchesDesired && tradingAllowed !== false
    };
  }
}
