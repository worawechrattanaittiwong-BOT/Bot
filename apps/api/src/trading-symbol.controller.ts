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
import { randomUUID } from "node:crypto";
import { DbService } from "./db.service";
import { isVersionAtLeast } from "./release-version";
import { CryptoService, JwtGuard } from "./security";
import { connectedAccountSymbolChoices, exactConnectedAccountSymbol } from "./connected-symbol-choices";

const SYMBOL_AGENT_VERSION = "1.0.11";

function normalizeSymbol(value: unknown) {
  const symbol = String(value || "").trim();
  if (!symbol || symbol.length > 64 || !/^[A-Za-z0-9._#-]+$/.test(symbol)) {
    return "";
  }
  return symbol;
}

function isBitcoinSymbol(value: unknown) {
  const symbol = normalizeSymbol(value).toUpperCase();
  return Boolean(symbol && (symbol.includes("BTC") || symbol.includes("XBT")));
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

function marketWatchSymbols(metrics: any) {
  const source = Array.isArray(metrics?.marketWatchSymbols)
    ? metrics.marketWatchSymbols
    : [];
  // metrics.symbol comes from the authenticated EA heartbeat and is therefore
  // a broker-native verified symbol. Keep it selectable when the EA suppresses
  // the heavier Market Watch catalog while live positions are open.
  const sourceWithActive = [...source, metrics?.symbol];
  const unique = new Map<string, string>();
  for (const raw of sourceWithActive) {
    const symbol = normalizeSymbol(raw);
    if (!symbol) continue;
    const key = symbol.toUpperCase();
    if (!unique.has(key)) unique.set(key, symbol);
    if (unique.size >= 512) break;
  }
  return Array.from(unique.values());
}

function xauSymbols(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const unique = new Map<string, string>();
  for (const raw of source) {
    const symbol = normalizeSymbol(raw);
    if (!symbol || !symbol.toUpperCase().startsWith("XAU")) continue;
    const key = symbol.toUpperCase();
    if (!unique.has(key)) unique.set(key, symbol);
    if (unique.size >= 32) break;
  }
  return Array.from(unique.values()).sort((a,b)=>a.localeCompare(b));
}

@Controller("bot/trading-symbol")
@UseGuards(JwtGuard)
export class TradingSymbolController {
  constructor(private readonly db: DbService) {}

  private async selectedInstance(userId: string, slotId: string) {
    if (!slotId) throw new BadRequestException("ไม่พบ Slot ที่เลือก");
    const row = await this.db.one(
      `SELECT
         bi.*,
         ls.mode,
         ma.broker AS account_broker,
         ma.broker_server AS account_broker_server,
         bs.settings,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) AS positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS mt5_online,
         (bi.agent_last_seen_at IS NOT NULL AND bi.agent_last_seen_at > now() - interval '90 seconds') AS agent_online,
         (wn.last_seen_at IS NOT NULL AND wn.last_seen_at > now() - interval '90 seconds') AS worker_online,
         EXISTS(
           SELECT 1
           FROM jsonb_array_elements(COALESCE(wn.telemetry->'instances','[]'::jsonb)) worker_instance
           WHERE worker_instance->>'instanceId'=bi.id::text
             AND worker_instance->>'terminalRunning'='true'
         ) AS terminal_online,
         COALESCE((
           SELECT worker_instance->'discoveredXauSymbols'
           FROM jsonb_array_elements(COALESCE(wn.telemetry->'instances','[]'::jsonb)) worker_instance
           WHERE worker_instance->>'instanceId'=bi.id::text
           LIMIT 1
         ), '[]'::jsonb) AS discovered_xau_symbols
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN mt5_accounts ma ON ma.id=bi.mt5_account_id
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       LEFT JOIN worker_nodes wn ON wn.runner_id=bi.runner_id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.status IN ('ACTIVE','AVAILABLE')
       LIMIT 1`,
      [slotId, userId]
    );
    if (!row) throw new ConflictException("ไม่พบ SCENOVA Instance ของ Slot นี้");
    return row;
  }

  private snapshot(instance: any) {
    const settings = instance.settings || {};
    const metrics = instance.metrics || {};
    const resolutionMode = String(settings.symbolResolutionMode || "").toUpperCase();
    const confirmedSymbol = resolutionMode === "EXACT"
      ? normalizeSymbol(settings.startupSymbol || settings.symbol)
      : "";
    const activeSymbol = normalizeSymbol(metrics.symbol);
    const mode = String(instance.mode || "").toUpperCase();
    // First connection remains Worker XAU-only. Only an already confirmed
    // account may change to another exact symbol from its live EA Market Watch.
    const connected = Boolean(instance.mt5_account_id && confirmedSymbol);
    const availableSymbols = connected
      ? connectedAccountSymbolChoices(metrics)
      : mode === "CLOUD"
        ? xauSymbols(instance.discovered_xau_symbols)
        : marketWatchSymbols(metrics).filter(item => item.toUpperCase().startsWith("XAU"));
    const tradeMode = parseTradeMode(metrics.symbolTradeMode);
    const tradingAllowed = symbolTradeAllowed(tradeMode);
    const matches = Boolean(
      confirmedSymbol &&
      activeSymbol &&
      activeSymbol.toUpperCase() === confirmedSymbol.toUpperCase()
    );

    return {
      desiredSymbol: confirmedSymbol,
      requestedSymbol: confirmedSymbol,
      symbolResolutionMode: resolutionMode || "DISCOVERY",
      explicitSymbol: confirmedSymbol || null,
      activeSymbol: activeSymbol || null,
      instrumentProfile: isBitcoinSymbol(confirmedSymbol) ? "CRYPTO" : "GOLD",
      supportedControlModes: isBitcoinSymbol(confirmedSymbol)
        ? ["AUTO", "RACE", "COUNTER", "FLIP_LOCK", "MANUAL"]
        : ["AUTO", "RACE", "COUNTER", "FLIP_LOCK", "ZERO_GRID", "MANUAL"],
      blockedControlModes: isBitcoinSymbol(confirmedSymbol) ? ["ZERO_GRID"] : [],
      brokerSymbolTradeMode: tradeMode,
      brokerTradingAllowed: tradingAllowed,
      marketWatchSymbols: availableSymbols,
      discoveredXauSymbols: availableSymbols.filter(item => item.toUpperCase().startsWith("XAU")),
      symbolDiscoveryPending: !confirmedSymbol,
      symbolDiscoveryReady: Boolean((connected ? instance.mt5_online : mode === "CLOUD" ? instance.terminal_online : instance.mt5_online) && availableSymbols.length > 0),
      terminalOnline: Boolean(instance.terminal_online),
      workerOnline: Boolean(instance.worker_online),
      symbolReady: matches && tradingAllowed !== false,
      pendingRestart: Boolean(confirmedSymbol && !matches),
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
    const instance = await this.selectedInstance(req.user.sub, slotId);
    return { ok: true, ...this.snapshot(instance) };
  }

  @Put()
  async select(
    @Req() req: any,
    @Query("slotId") slotId = "",
    @Body() body: { symbol?: string }
  ) {
    const requestedSymbol = normalizeSymbol(body.symbol);
    if (!requestedSymbol) {
      throw new BadRequestException("Symbol ไม่ถูกต้อง");
    }

    const instance = await this.selectedInstance(req.user.sub, slotId);
    const mode = String(instance.mode || "").toUpperCase();
    const isCloud = mode === "CLOUD";
    const alreadyConnected = Boolean(instance.mt5_account_id)
      && String(instance.settings?.symbolResolutionMode || "").toUpperCase() === "EXACT"
      && Boolean(normalizeSymbol(instance.settings?.startupSymbol || instance.settings?.symbol));
    // Do not modify the first-connect onboarding contract.
    if (!alreadyConnected && !requestedSymbol.toUpperCase().startsWith("XAU")) {
      throw new BadRequestException("กรุณาเลือก Symbol XAU จากรายการที่ตรวจพบใน MT5 บัญชีนี้");
    }
    const liveSymbols = alreadyConnected
      ? connectedAccountSymbolChoices(instance.metrics)
      : isCloud
        ? xauSymbols(instance.discovered_xau_symbols)
        : xauSymbols(marketWatchSymbols(instance.metrics));
    const sourceReady = alreadyConnected
      ? Boolean(instance.mt5_online)
      : isCloud ? Boolean(instance.terminal_online) : Boolean(instance.mt5_online);
    if (!sourceReady || liveSymbols.length === 0) {
      throw new ConflictException(
        alreadyConnected
          ? "ยังเลือก Symbol ไม่ได้ · รอ EA ส่ง Market Watch ล่าสุดจากบัญชี MT5 ที่เชื่อมอยู่"
          : isCloud
            ? "ยังเลือก Symbol ไม่ได้ · VPS กำลังเชื่อม MT5 และตรวจรายการ XAU จากบัญชีจริง"
            : "ยังเลือก Symbol ไม่ได้ · รอ MT5 ส่งรายการ Symbol ล่าสุดก่อน"
      );
    }

    const symbol = alreadyConnected
      ? exactConnectedAccountSymbol(requestedSymbol, instance.metrics)
      : liveSymbols.find(item => item.toUpperCase() === requestedSymbol.toUpperCase());
    if (!symbol) {
      throw new BadRequestException(
        alreadyConnected
          ? "Symbol นี้ไม่มีอยู่ใน Market Watch ล่าสุดของ MT5 บัญชีที่เชื่อมอยู่ กรุณาเลือกชื่อที่ระบบแสดงตรง ๆ"
          : "Symbol นี้ไม่ได้อยู่ในรายการ XAU ที่ตรวจพบจาก MT5 บัญชีจริง กรุณาเลือกจากรายการที่ระบบแสดง"
      );
    }

    const positions = Math.max(0, Number(instance.positions || 0));
    const pendingOrders = Math.max(0, Number(instance.metrics?.accountScenovaPendingOrders || 0));
    if (positions > 0 || (alreadyConnected && (pendingOrders > 0 ||
      String(instance.actual_state || "").toUpperCase() === "RUNNING" ||
      String(instance.desired_state || "").toUpperCase() === "RUNNING"))) {
      throw new ConflictException(
        "กรุณาหยุดบอทและให้ Position / Pending Order เป็น 0 ก่อนเปลี่ยน Symbol"
      );
    }
    const waitingForFlat = false;

    const before = this.snapshot(instance);
    const changed =
      !before.explicitSymbol ||
      String(before.explicitSymbol).toUpperCase() !== symbol.toUpperCase();

    await this.db.query(
      `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
       VALUES(
         $1,
         jsonb_build_object(
           'startupSymbol',$2::text,
           'symbol',$2::text,
           'symbolResolutionMode','EXACT',
           'symbolSelectedBy','CUSTOMER',
           'symbolDiscoveryState','CONFIRMED'
         ),
         now()
       )
       ON CONFLICT(bot_instance_id)
       DO UPDATE SET
         settings=(COALESCE(bot_settings.settings,'{}'::jsonb) - 'symbolAccountType') || jsonb_build_object(
           'startupSymbol',$2::text,
           'symbol',$2::text,
           'symbolResolutionMode','EXACT',
           'symbolSelectedBy','CUSTOMER',
           'symbolDiscoveryState','CONFIRMED'
         ),
         updated_at=now()`,
      [instance.id, symbol]
    );

    const activeSymbol = normalizeSymbol(instance.metrics?.symbol);
    const activeMatches = Boolean(
      activeSymbol && activeSymbol.toUpperCase() === symbol.toUpperCase()
    );
    const requestedAt = new Date().toISOString();
    const requiresReconnect = changed || !activeMatches;
    const actionId = requiresReconnect ? randomUUID() : null;
    const agentVersionReady = isVersionAtLeast(instance.agent_version, SYMBOL_AGENT_VERSION);

    if (requiresReconnect) {
      await this.db.query(
        `UPDATE bot_instances
         SET desired_state=CASE WHEN $7::boolean THEN 'STOPPED' ELSE 'SAFE_STOP' END,
             metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
               'requestedStartupSymbol',$2::text,
               'symbolChangeStatus',$3::text,
               'symbolChangeRequestedAt',$4::text,
               'manualMt5ActionName','CONNECT_MT5',
               'manualMt5ActionId',$5::text,
               'manualMt5ActionRequestedAt',$4::text,
               'manualMt5ActionStatus','PENDING',
               'manualMt5ActionSource','SYMBOL_SELECTION',
               'manualMt5ActionMessage',$6::text
             )
         WHERE id=$1`,
        [
          instance.id,
          symbol,
          waitingForFlat ? "WAITING_FLAT" : "QUEUED",
          requestedAt,
          actionId,
          isCloud
            ? "ยืนยัน Symbol จาก MT5 จริงแล้ว · Cloud Worker กำลังเปิดกราฟและโหลด EA บน Symbol นี้"
            : "ยืนยัน Symbol จาก MT5 จริงแล้ว · ระบบกำลังเปิด Chart/EA บน Symbol นี้",
          isCloud
        ]
      );

      if (!isCloud) {
        await this.db.query(
          "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",
          [instance.id]
        );
        await this.db.query(
          "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
          [instance.id]
        );
      }

      if (isCloud && instance.runner_id) {
        await this.db.query(
          `INSERT INTO worker_commands(runner_id,bot_instance_id,execution_generation,command,status)
           SELECT $1,$2,$3,'RELOAD_INSTANCE','PENDING'
           WHERE NOT EXISTS (
             SELECT 1 FROM worker_commands
             WHERE bot_instance_id=$2
               AND command='RELOAD_INSTANCE'
               AND status IN ('PENDING','DELIVERED')
           )`,
          [instance.runner_id, instance.id, Number(instance.execution_generation || 1)]
        );
      }
    } else {
      await this.db.query(
        `UPDATE bot_instances
         SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
           'requestedStartupSymbol',$2::text,
           'symbolChangeStatus','READY',
           'symbolChangeRequestedAt',$3::text
         )
         WHERE id=$1`,
        [instance.id, symbol, requestedAt]
      );
    }

    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'SELECT_TRADING_SYMBOL','bot_instance',$2,$3::jsonb)",
      [
        String(req.user.code || req.user.sub),
        instance.id,
        JSON.stringify({
          slotId,
          requestedSymbol,
          symbol,
          resolvedSymbol: symbol,
          previous: before.desiredSymbol,
          changed,
          activeSymbol: activeSymbol || null,
          authority: "WEB",
          actionId,
          waitingForFlat,
          agentOnline: Boolean(instance.agent_online),
          agentVersion: String(instance.agent_version || ""),
          minimumAgentVersion: SYMBOL_AGENT_VERSION
        })
      ]
    );

    return {
      ok: true,
      requestedSymbol,
      symbol,
      resolvedSymbol: symbol,
      symbolChangeRequestedAt: requestedAt,
      changed,
      symbolChangeRequiresReconnect: requiresReconnect,
      queued: requiresReconnect,
      actionId,
      waitingForFlat: requiresReconnect && waitingForFlat,
      agentOnline: Boolean(instance.agent_online),
      agentVersionReady,
      minimumAgentVersion: SYMBOL_AGENT_VERSION,
      message: !requiresReconnect
        ? "MT5 กำลังใช้ Symbol นี้อยู่แล้ว"
        : waitingForFlat
          ? "ยืนยันแล้ว · เว็บเป็นคำสั่งหลัก ระบบหยุดเปิดรอบใหม่และจะบังคับ MT5 เปลี่ยนเป็น " + symbol + " ทันทีเมื่อ Position เป็น 0"
          : isCloud
            ? "ยืนยันแล้ว · Cloud Worker กำลัง Reload MT5 เป็น " + symbol + " และจะเปิดเพียง Chart เดียว"
            : !instance.agent_online
              ? "ยืนยันแล้ว · บันทึกคำสั่ง " + symbol + " ไว้เป็นค่าหลัก รอ Windows Agent ออนไลน์แล้วระบบจะบังคับ MT5 เปิดให้อัตโนมัติ"
              : !agentVersionReady
                ? "ยืนยันแล้ว · บันทึกคำสั่ง " + symbol + " ไว้เป็นค่าหลัก กรุณาอัปเดต SCENOVA Agent v" + SYMBOL_AGENT_VERSION + " แล้วระบบจะทำต่ออัตโนมัติ"
                : "ยืนยันแล้ว · ระบบกำลังบังคับ MT5 เปิด " + symbol + " และโหลด EA บน Symbol นี้อัตโนมัติ"
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
      `SELECT bi.install_token_hash,bi.metrics,bs.settings,
              ma.broker AS account_broker,
              ma.broker_server AS account_broker_server
       FROM bot_instances bi
       LEFT JOIN mt5_accounts ma ON ma.id=bi.mt5_account_id
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       WHERE bi.id=$1`,
      [instanceId]
    );
    if (!row || String(row.install_token_hash || "") !== this.crypto.sha256(installToken)) {
      throw new ConflictException("invalid trading symbol agent authentication");
    }

    const settings = row.settings || {};
    const metrics = row.metrics || {};
    const exactResolution =
      String(settings.symbolResolutionMode || "").toUpperCase() === "EXACT";
    const desiredSymbol = exactResolution
      ? normalizeSymbol(settings.startupSymbol || settings.symbol)
      : "";
    const explicitRequestedSymbol = desiredSymbol;
    const currentSymbol = normalizeSymbol(metrics.symbol);
    const tradeMode = parseTradeMode(metrics.symbolTradeMode);
    const tradingAllowed = symbolTradeAllowed(tradeMode);
    const currentMatchesDesired = Boolean(
      currentSymbol && currentSymbol.toUpperCase() === desiredSymbol.toUpperCase()
    );

    return {
      ok: true,
      desiredSymbol,
      explicitSymbolSelected: Boolean(explicitRequestedSymbol),
      currentSymbol: currentSymbol || null,
      symbolTradeMode: tradeMode,
      symbolTradingAllowed: tradingAllowed,
      symbolReady: currentMatchesDesired && tradingAllowed !== false
    };
  }
}
