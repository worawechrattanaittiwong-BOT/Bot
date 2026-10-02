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
  const unique = new Map<string, string>();
  for (const raw of source) {
    const symbol = normalizeSymbol(raw);
    if (!symbol) continue;
    const key = symbol.toUpperCase();
    if (!unique.has(key)) unique.set(key, symbol);
    if (unique.size >= 512) break;
  }
  return Array.from(unique.values());
}

function instrumentRoot(value: unknown) {
  const normalized = normalizeSymbol(value).toUpperCase().replace(/^XBT/, "BTC");
  if (normalized === "BTCUSD" || normalized.startsWith("BTCUSD")) return "BTCUSD";
  if (normalized === "XAUUSD" || normalized.startsWith("XAUUSD")) return "XAUUSD";
  return normalized;
}

function isExnessBroker(broker: unknown, brokerServer: unknown) {
  const name = String(broker || "").trim();
  const server = String(brokerServer || "").trim();
  return /exness/i.test(name) || /^Exness-/i.test(server);
}

function resolveBrokerTradingSymbol(
  requested: unknown,
  metrics: any,
  broker: unknown,
  brokerServer: unknown
) {
  const symbol = normalizeSymbol(requested);
  if (!symbol) return "";

  const symbols = marketWatchSymbols(metrics);
  const exact = symbols.find(
    item => item.toUpperCase() === symbol.toUpperCase()
  );
  const root = instrumentRoot(symbol);

  // If the Web already supplied a broker-native variant (suffix/prefix),
  // preserve it. Exact Market Watch spelling wins when available.
  const canonicalRequest =
    symbol.toUpperCase() === root ||
    (root === "BTCUSD" && symbol.toUpperCase() === "XBTUSD");
  if (!canonicalRequest) return exact || symbol;

  const family = symbols
    .filter(item => instrumentRoot(item) === root)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));

  // Exness Cloud terminals used by SCENOVA expose Gold and BTC with the
  // broker-native "m" suffix. Prefer a real Market Watch match, otherwise use
  // the known Exness native name instead of opening a blank canonical chart.
  if (isExnessBroker(broker, brokerServer) && (root === "BTCUSD" || root === "XAUUSD")) {
    const native = family.find(item => item.toUpperCase().endsWith("M"));
    if (native) return native;
    return root + "m";
  }

  return exact || family[0] || symbol;
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
         (bi.agent_last_seen_at IS NOT NULL AND bi.agent_last_seen_at > now() - interval '90 seconds') AS agent_online
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN mt5_accounts ma ON ma.id=bi.mt5_account_id
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
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
    const explicitRequestedSymbol = normalizeSymbol(settings.startupSymbol);
    const activeSymbol = normalizeSymbol(metrics.symbol);
    const fallbackRequestedSymbol = normalizeSymbol(settings.symbol);
    const desiredRequestedSymbol =
      explicitRequestedSymbol || activeSymbol || fallbackRequestedSymbol || "XAUUSD";
    const explicitSymbol = explicitRequestedSymbol
      ? resolveBrokerTradingSymbol(
          explicitRequestedSymbol,
          metrics,
          instance.account_broker,
          instance.account_broker_server
        )
      : "";
    const desiredSymbol = resolveBrokerTradingSymbol(
      desiredRequestedSymbol,
      metrics,
      instance.account_broker,
      instance.account_broker_server
    );
    const tradeMode = parseTradeMode(metrics.symbolTradeMode);
    const tradingAllowed = symbolTradeAllowed(tradeMode);
    const matches = Boolean(
      activeSymbol &&
      desiredSymbol &&
      activeSymbol.toUpperCase() === desiredSymbol.toUpperCase()
    );

    const bitcoin = isBitcoinSymbol(desiredSymbol);

    return {
      desiredSymbol,
      requestedSymbol: desiredRequestedSymbol,
      explicitSymbol: explicitSymbol || null,
      activeSymbol: activeSymbol || null,
      instrumentProfile: bitcoin ? "BTC" : "STANDARD",
      supportedControlModes: bitcoin
        ? ["AUTO", "RACE", "COUNTER", "FLIP_LOCK", "MANUAL"]
        : ["AUTO", "RACE", "COUNTER", "FLIP_LOCK", "ZERO_GRID", "MANUAL"],
      blockedControlModes: bitcoin ? ["ZERO_GRID"] : [],
      brokerSymbolTradeMode: tradeMode,
      brokerTradingAllowed: tradingAllowed,
      marketWatchSymbols: marketWatchSymbols(metrics),
      marketWatchCapturedAt: Number(metrics.marketWatchCapturedAt || 0) || null,
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
      throw new BadRequestException(
        "Symbol ไม่ถูกต้อง กรุณาเลือก Symbol ที่ต้องการเทรด"
      );
    }

    const instance = await this.selectedInstance(req.user.sub, slotId);
    const liveSymbols = marketWatchSymbols(instance.metrics);
    if (!instance.mt5_online || liveSymbols.length === 0) {
      throw new ConflictException(
        "ยังเลือก Symbol ไม่ได้: รอ MT5/EA ส่ง Market Watch ล่าสุดมายัง Server ก่อน"
      );
    }

    const candidate = resolveBrokerTradingSymbol(
      requestedSymbol,
      instance.metrics,
      instance.account_broker,
      instance.account_broker_server
    );
    const symbol = liveSymbols.find(
      item => item.toUpperCase() === candidate.toUpperCase()
    );
    if (!candidate || !symbol) {
      throw new BadRequestException(
        "Symbol นี้ไม่มีอยู่ใน Market Watch จริงของบัญชี MT5 กรุณาเลือกจากรายการที่ Server แสดง"
      );
    }

    const savedControlMode = String(
      instance.settings?.controlMode || instance.settings?.engineMode || "AUTO"
    ).toUpperCase();
    if (isBitcoinSymbol(symbol) && savedControlMode === "ZERO_GRID") {
      throw new ConflictException(
        "เปลี่ยนโหมดจาก ZERO GRID เป็น AUTO, RACE, COUNTER, FLIP LOCK หรือ MANUAL ก่อนเลือก BTC/XBT"
      );
    }
    const positions = Math.max(0, Number(instance.positions || 0));
    const waitingForFlat = positions > 0;
    const mode = String(instance.mode || "").toUpperCase();
    const isCloud = mode === "CLOUD";

    const before = this.snapshot(instance);
    const changed =
      !before.explicitSymbol ||
      String(before.explicitSymbol).toUpperCase() !== symbol.toUpperCase();

    await this.db.query(
      `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
       VALUES($1,jsonb_build_object('startupSymbol',$2::text,'symbol',$2::text),now())
       ON CONFLICT(bot_instance_id)
       DO UPDATE SET
         settings=jsonb_set(
           jsonb_set(COALESCE(bot_settings.settings,'{}'::jsonb),'{startupSymbol}',to_jsonb($2::text),true),
           '{symbol}',to_jsonb($2::text),true
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
         SET desired_state='SAFE_STOP',
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
          waitingForFlat
            ? "เว็บกำหนด Symbol ใหม่แล้ว · ระบบ Safe Stop และจะบังคับ MT5 เปิด Symbol นี้ทันทีเมื่อไม่มี Position"
            : isCloud
              ? "เว็บกำหนด Symbol ใหม่แล้ว · Cloud Worker กำลัง Reload MT5 ให้เหลือ Chart เดียวบน Symbol นี้"
              : "เว็บกำหนด Symbol ใหม่แล้ว · ระบบกำลังบังคับ MT5 เปิด Chart/EA บน Symbol นี้"
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

      if (isCloud && !waitingForFlat && instance.runner_id) {
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
    const explicitRequestedSymbol = normalizeSymbol(settings.startupSymbol);
    const currentSymbol = normalizeSymbol(metrics.symbol);
    const legacySavedSymbol = normalizeSymbol(settings.symbol);
    const desiredRequestedSymbol =
      explicitRequestedSymbol || currentSymbol || legacySavedSymbol || "XAUUSD";
    const desiredSymbol = resolveBrokerTradingSymbol(
      desiredRequestedSymbol,
      metrics,
      row.account_broker,
      row.account_broker_server
    );
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
