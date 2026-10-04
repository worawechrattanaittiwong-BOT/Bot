import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Header,
  Post,
  UnauthorizedException,
  Query,
  Req,
  Sse,
  UseGuards
} from "@nestjs/common";
import { from, switchMap } from "rxjs";
import { DbService } from "./db.service";
import { CryptoService, JwtGuard, WorkerGuard } from "./security";
import { RuntimeEventService } from "./runtime-event.service";

const RUNTIME_EVENT_TYPES = new Set([
  "ORDER_OPENED",
  "ORDER_CLOSED",
  "ORDER_CHANGED",
  "STATE_CHANGED",
  "MT5_CONNECTED",
  "MT5_DISCONNECTED",
  "SYMBOL_CHANGED",
  "LIVE_EXECUTION"
]);

function safeState(value: unknown) {
  const state = String(value || "").toUpperCase();
  return ["RUNNING", "STOPPED", "SAFE_STOP"].includes(state) ? state : "";
}

function safeSymbol(value: unknown) {
  const symbol = String(value || "").trim();
  return /^[A-Za-z0-9._#-]{1,64}$/.test(symbol) ? symbol : "";
}

function safeExecutionStatus(value: unknown) {
  return String(value || "").replace(/[\r\n]/g, " ").slice(0, 120);
}

@Controller("worker")
@UseGuards(WorkerGuard)
export class RuntimeEventWorkerController {
  constructor(
    private readonly db: DbService,
    private readonly events: RuntimeEventService
  ) {}

  @Post("runtime-event")
  async runtimeEvent(@Body() body: any) {
    const runnerId = String(body?.runnerId || "").trim();
    const instanceId = String(body?.instanceId || "").trim();
    const eventId = String(body?.eventId || "").trim().slice(0, 180);
    const eventType = String(body?.eventType || "").trim().toUpperCase();

    if (!instanceId || !eventId || !RUNTIME_EVENT_TYPES.has(eventType)) {
      throw new BadRequestException("invalid runtime event");
    }

    const instance = await this.db.one(
      `SELECT bi.id,bi.slot_id,ls.assigned_user_id
       FROM bot_instances bi
       JOIN license_slots ls ON ls.id=bi.slot_id
       WHERE bi.id=$1
         AND bi.runner_id=$2
         AND bi.mode='CLOUD'
       LIMIT 1`,
      [instanceId, runnerId]
    );
    if (!instance?.assigned_user_id || !instance?.slot_id) {
      throw new ForbiddenException("runtime event is not assigned to this worker");
    }

    const positionsRaw = Number(body?.positions);
    const positions = Number.isFinite(positionsRaw)
      ? Math.max(0, Math.min(10000, Math.trunc(positionsRaw)))
      : null;
    const state = safeState(body?.state);
    const symbol = safeSymbol(body?.symbol);
    const executionStatus = safeExecutionStatus(body?.executionStatus);
    const openPositions = Array.isArray(body?.openPositions)
      ? body.openPositions.slice(0, 200)
      : null;
    const occurredAt = Math.max(0, Number(body?.occurredAt || 0));
    const occurredAtMsRaw = Number(body?.occurredAtMs || 0);
    const occurredAtMs = Number.isFinite(occurredAtMsRaw) && occurredAtMsRaw > 0
      ? Math.trunc(occurredAtMsRaw)
      : Math.trunc(occurredAt * 1000);
    const receivedAt = Date.now();
    const sourceAgeMs = occurredAtMs > 0
      ? Math.max(0, receivedAt - occurredAtMs)
      : null;

    const metricsPatch: Record<string, any> = {
      realtimeEventType: eventType,
      realtimeEventAt: occurredAt || Math.floor(receivedAt / 1000),
      realtimeEventReceivedAt: Math.floor(receivedAt / 1000)
    };
    if (eventType === "LIVE_EXECUTION") {
      metricsPatch.liveExecutionAtMs = occurredAtMs || receivedAt;
      metricsPatch.liveExecutionReceivedAtMs = receivedAt;
    }
    if (positions !== null) metricsPatch.positions = positions;
    if (openPositions !== null) metricsPatch.openPositions = openPositions;
    if (symbol) metricsPatch.symbol = symbol;
    if (executionStatus) metricsPatch.executionStatus = executionStatus;

    if (eventType === "LIVE_EXECUTION") {
      await this.db.query(
        `UPDATE bot_instances
         SET metrics=COALESCE(metrics,'{}'::jsonb) || $2::jsonb,
             actual_state=CASE
               WHEN $3::text IN ('RUNNING','STOPPED','SAFE_STOP') THEN $3::text
               ELSE actual_state
             END
         WHERE id=$1
           AND COALESCE(NULLIF(metrics->>'liveExecutionAtMs','')::bigint,0) <= $4::bigint`,
        [instanceId, JSON.stringify(metricsPatch), state || null, occurredAtMs || receivedAt]
      );
    } else {
      await this.db.query(
        `UPDATE bot_instances
         SET metrics=COALESCE(metrics,'{}'::jsonb) || $2::jsonb,
             actual_state=CASE
               WHEN $3::text IN ('RUNNING','STOPPED','SAFE_STOP') THEN $3::text
               ELSE actual_state
             END
         WHERE id=$1`,
        [instanceId, JSON.stringify(metricsPatch), state || null]
      );
    }

    this.events.publish(String(instance.assigned_user_id), {
      eventId,
      eventType,
      instanceId,
      slotId: String(instance.slot_id),
      occurredAt,
      occurredAtMs,
      receivedAt,
      state: state || null,
      positions,
      symbol: symbol || null,
      sourceAgeMs,
      metrics: metricsPatch
    });

    return { ok: true, receivedAt, sourceAgeMs };
  }
}

@Controller("ea")
export class RuntimeEventEaController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly events: RuntimeEventService
  ) {}

  @Post("runtime-event")
  async runtimeEvent(@Body() body: any) {
    const instanceId = String(body?.instanceId || "").trim();
    const installToken = String(body?.installToken || "");
    const eventId = String(body?.eventId || "").trim().slice(0, 180);
    const eventType = String(body?.eventType || "").trim().toUpperCase();

    if (!instanceId || !eventId || eventType !== "LIVE_EXECUTION") {
      throw new BadRequestException("invalid EA runtime event");
    }

    const instance = await this.db.one(
      `SELECT
         bi.id,bi.slot_id,bi.mode,bi.install_token_hash,bi.metrics,
         COALESCE(ls.assigned_user_id,a.user_id) AS user_id,
         ls.status AS slot_status,
         a.status AS account_status,
         u.status AS user_status
       FROM bot_instances bi
       LEFT JOIN license_slots ls ON ls.id=bi.slot_id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       LEFT JOIN users u ON u.id=COALESCE(ls.assigned_user_id,a.user_id)
       WHERE bi.id=$1
       LIMIT 1`,
      [instanceId]
    );

    if (!instance ||
        instance.install_token_hash !== this.crypto.sha256(installToken) ||
        instance.user_status !== "ACTIVE" ||
        (instance.account_status && instance.account_status !== "ACTIVE") ||
        (instance.slot_status && !["ACTIVE","AVAILABLE"].includes(String(instance.slot_status)))) {
      throw new UnauthorizedException("EA authentication failed");
    }

    const positionsRaw = Number(body?.positions);
    const positions = Number.isFinite(positionsRaw)
      ? Math.max(0, Math.min(10000, Math.trunc(positionsRaw)))
      : null;
    const state = safeState(body?.state);
    const symbol = safeSymbol(body?.symbol);
    const executionStatus = safeExecutionStatus(body?.executionStatus);
    const openPositions = Array.isArray(body?.openPositions)
      ? body.openPositions.slice(0, 200)
      : null;
    const occurredAt = Math.max(0, Number(body?.occurredAt || 0));
    const occurredAtMsRaw = Number(body?.occurredAtMs || 0);
    const occurredAtMs = Number.isFinite(occurredAtMsRaw) && occurredAtMsRaw > 0
      ? Math.trunc(occurredAtMsRaw)
      : Math.trunc(occurredAt * 1000);
    const receivedAt = Date.now();
    const liveAtMs = occurredAtMs || receivedAt;
    const sourceAgeMs = Math.max(0, receivedAt - liveAtMs);

    const metricsPatch: Record<string, any> = {
      realtimeEventType: eventType,
      realtimeEventAt: occurredAt || Math.floor(receivedAt / 1000),
      realtimeEventReceivedAt: Math.floor(receivedAt / 1000),
      liveExecutionAtMs: liveAtMs,
      liveExecutionReceivedAtMs: receivedAt
    };
    if (positions !== null) metricsPatch.positions = positions;
    if (openPositions !== null) metricsPatch.openPositions = openPositions;
    if (symbol) metricsPatch.symbol = symbol;
    if (executionStatus) metricsPatch.executionStatus = executionStatus;

    await this.db.query(
      `UPDATE bot_instances
       SET metrics=COALESCE(metrics,'{}'::jsonb) || $2::jsonb,
           actual_state=CASE
             WHEN $3::text IN ('RUNNING','STOPPED','SAFE_STOP') THEN $3::text
             ELSE actual_state
           END
       WHERE id=$1
         AND COALESCE(NULLIF(metrics->>'liveExecutionAtMs','')::bigint,0) <= $4::bigint`,
      [instanceId, JSON.stringify(metricsPatch), state || null, liveAtMs]
    );

    this.events.publish(String(instance.user_id), {
      eventId,
      eventType,
      instanceId,
      slotId: String(instance.slot_id || ""),
      occurredAt,
      occurredAtMs: liveAtMs,
      receivedAt,
      state: state || null,
      positions,
      symbol: symbol || null,
      sourceAgeMs,
      metrics: metricsPatch
    });

    return { ok: true, receivedAt, sourceAgeMs };
  }
}

@Controller("realtime")
@UseGuards(JwtGuard)
export class RuntimeEventStreamController {
  constructor(
    private readonly db: DbService,
    private readonly events: RuntimeEventService
  ) {}

  private async resolveSlot(userId: string, requestedSlotId: string) {
    if (!requestedSlotId) return "";
    const slot = await this.db.one(
      `SELECT id
       FROM license_slots
       WHERE id=$1
         AND assigned_user_id=$2
         AND status IN ('ACTIVE','AVAILABLE')
       LIMIT 1`,
      [requestedSlotId, userId]
    );
    if (!slot?.id) throw new ForbiddenException("slot access denied");
    return String(slot.id);
  }

  @Sse("events")
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("X-Accel-Buffering", "no")
  stream(@Req() req: any, @Query("slotId") slotId = "") {
    const userId = String(req.user.sub);
    return from(this.resolveSlot(userId, String(slotId || ""))).pipe(
      switchMap(resolvedSlotId => this.events.stream(userId, resolvedSlotId))
    );
  }
}
