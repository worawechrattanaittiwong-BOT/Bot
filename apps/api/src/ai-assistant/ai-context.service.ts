import { ForbiddenException, Injectable } from "@nestjs/common";
import { DbService } from "../db.service";
import type { AiSlotContext } from "./ai-assistant.types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SAFE_SETTING_KEYS = [
  "controlMode","entryMode",
  "lot","maxPositions",
  "autoLot","autoMaxPositions","autoProfitTargetMoney",
  "raceLot","raceMaxPositions","raceProfitTargetMode","raceCloseAllProfitMoney","racePerPositionProfitMoney",
  "counterLot","counterMaxPositions","counterPerPositionProfitMoney",
  "flipLockLot",
  "manualLot","manualMaxPositions","manualBasketProfitTargetMoney","manualPerPositionProfitMoney","manualStopLossPoints",
  "zeroGridStepPrice","zeroGridLevelsPerSide","zeroGridBaseLot","zeroGridMinNetProfitMoney","zeroGridCloseReserveMoney",
  "maxBasketLossMoney","dailyLossMoney","dailyProfitTargetMoney"
] as const;

@Injectable()
export class AiContextService {
  constructor(private readonly db: DbService) {}

  private number(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private maskAccount(value: unknown) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    return raw.length <= 4 ? "****" + raw : "****" + raw.slice(-4);
  }

  private safeSettings(value: unknown) {
    const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const result: Record<string, unknown> = {};
    for (const key of SAFE_SETTING_KEYS) {
      if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
    }
    return result;
  }

  async load(userId: string, role: string, requestedSlotId = ""): Promise<AiSlotContext | null> {
    const elevated = ["OWNER","ADMIN"].includes(String(role || "").toUpperCase());
    const slotId = String(requestedSlotId || "").trim();
    if (slotId && !UUID_RE.test(slotId)) throw new ForbiddenException("ไม่พบ Slot ที่อนุญาต");

    const row = slotId
      ? await this.db.one(
          `SELECT
             ls.id AS slot_id,ls.mode AS slot_mode,ls.slot_number,ls.label AS slot_label,
             bi.id AS instance_id,bi.mode AS runtime_mode,bi.actual_state,bi.desired_state,bi.last_seen_at,bi.metrics,
             bs.settings,
             a.account_number,a.display_name,a.broker,a.broker_server
           FROM license_slots ls
           LEFT JOIN LATERAL (
             SELECT bi0.*
             FROM bot_instances bi0
             WHERE bi0.slot_id=ls.id
             ORDER BY bi0.last_seen_at DESC NULLS LAST,bi0.id
             LIMIT 1
           ) bi ON true
           LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
           LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
           WHERE ls.id=$1
             AND ($3::boolean OR ls.assigned_user_id=$2 OR ls.owner_user_id=$2)
             AND ls.status IN ('ACTIVE','AVAILABLE')
           LIMIT 1`,
          [slotId,userId,elevated]
        )
      : await this.db.one(
          `SELECT
             ls.id AS slot_id,ls.mode AS slot_mode,ls.slot_number,ls.label AS slot_label,
             bi.id AS instance_id,bi.mode AS runtime_mode,bi.actual_state,bi.desired_state,bi.last_seen_at,bi.metrics,
             bs.settings,
             a.account_number,a.display_name,a.broker,a.broker_server
           FROM license_slots ls
           LEFT JOIN LATERAL (
             SELECT bi0.*
             FROM bot_instances bi0
             WHERE bi0.slot_id=ls.id
             ORDER BY bi0.last_seen_at DESC NULLS LAST,bi0.id
             LIMIT 1
           ) bi ON true
           LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
           LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
           WHERE (ls.assigned_user_id=$1 OR ls.owner_user_id=$1)
             AND ls.status IN ('ACTIVE','AVAILABLE')
           ORDER BY CASE WHEN ls.mode='CLOUD' THEN 0 ELSE 1 END,ls.slot_number,ls.created_at
           LIMIT 1`,
          [userId]
        );

    if (!row) {
      if (slotId) throw new ForbiddenException("ไม่พบ Slot ที่อนุญาต");
      return null;
    }

    const metrics = row.metrics && typeof row.metrics === "object" ? row.metrics : {};
    const settings = this.safeSettings(row.settings);
    const actual = String(row.actual_state || "STOPPED").toUpperCase();
    const desired = String(row.desired_state || "STOPPED").toUpperCase();
    const lastSeenAt = row.last_seen_at ? new Date(row.last_seen_at) : null;
    const eaOnline = Boolean(lastSeenAt && Date.now() - lastSeenAt.getTime() <= 30_000);

    return {
      slotId: String(row.slot_id),
      slotMode: row.slot_mode ? String(row.slot_mode) : null,
      slotNumber: row.slot_number == null ? null : Number(row.slot_number),
      accountLabel: String(row.display_name || row.slot_label || "").trim() || null,
      accountMasked: this.maskAccount(row.account_number),
      broker: String(row.broker || "").trim() || null,
      brokerServer: String(row.broker_server || "").trim() || null,
      runtimeMode: row.runtime_mode ? String(row.runtime_mode) : row.slot_mode ? String(row.slot_mode) : null,
      runtimeState: actual === "RUNNING" || desired === "RUNNING"
        ? "RUNNING"
        : actual === "SAFE_STOP" || desired === "SAFE_STOP"
          ? "SAFE_STOP"
          : eaOnline ? "STOPPED" : "OFFLINE",
      eaOnline,
      lastHeartbeatAt: lastSeenAt?.toISOString() || null,
      symbol: String(metrics.symbol || "").trim() || null,
      currency: String(metrics.currency || "").trim().toUpperCase() || null,
      balance: this.number(metrics.balance),
      equity: this.number(metrics.equity),
      floating: this.number(metrics.floatingProfit ?? metrics.floating),
      positions: Math.max(0, this.number(metrics.accountScenovaPositions ?? metrics.positions)),
      pending: Math.max(0, this.number(metrics.accountScenovaPendingOrders)),
      spreadPoints: Math.max(0, this.number(metrics.spreadPoints)),
      pingMs: Math.max(0, this.number(metrics.pingMs ?? metrics.heartbeatLatencyMs)),
      drawdownPercent: Math.max(0, this.number(metrics.drawdownPercent ?? metrics.maxDrawdownPercent)),
      marginLevel: Math.max(0, this.number(metrics.marginLevel)),
      dailyProfit: this.number(metrics.dailyProfit),
      controlMode: String(metrics.controlMode || settings.controlMode || "").trim().toUpperCase() || null,
      settings
    };
  }
}
