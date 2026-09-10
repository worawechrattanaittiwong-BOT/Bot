import { Body, ConflictException, Controller, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DbService } from "./db.service";
import { latestEaRelease } from "./release-version";
import { CryptoService } from "./security";

const AUTO_ACTION_RETRY_MS = 3 * 60_000;
const ACTION_PENDING_TTL_MS = 15 * 60_000;

type AutoMt5Action = "UPDATE_EA_RESTART" | "CONNECT_MT5";

@Controller("ea")
export class AgentActionController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private async authenticatedInstance(instanceId: string, installToken: string) {
    if (!instanceId || installToken.length < 8) {
      throw new ConflictException("invalid agent authentication");
    }

    const instance = await this.db.one(
      `SELECT
         bi.id,
         bi.install_token_hash,
         bi.desired_state,
         bi.actual_state,
         bi.last_seen_at,
         bi.agent_ea_hash,
         bi.account_change_requested_at,
         bi.pending_account_number,
         bi.pending_broker_server,
         bi.metrics->>'eaVersion' AS ea_version,
         bi.metrics->>'manualMt5ActionName' AS manual_action_name,
         bi.metrics->>'manualMt5ActionId' AS manual_action_id,
         bi.metrics->>'manualMt5ActionRequestedAt' AS manual_action_requested_at,
         bi.metrics->>'manualMt5ActionStatus' AS manual_action_status,
         bi.metrics->>'manualMt5ActionSource' AS manual_action_source,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) AS positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS ea_online
       FROM bot_instances bi
       WHERE bi.id=$1`,
      [instanceId]
    );

    if (!instance || String(instance.install_token_hash || "") !== this.crypto.sha256(installToken)) {
      throw new ConflictException("invalid agent authentication");
    }
    return instance;
  }

  private async queueAutomaticAction(
    instance: any,
    action: AutoMt5Action,
    message: string
  ) {
    const actionId = randomUUID();
    const requestedAt = new Date().toISOString();

    await this.db.query(
      `UPDATE bot_instances
       SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
         'manualMt5ActionName',$2::text,
         'manualMt5ActionId',$3::text,
         'manualMt5ActionRequestedAt',$4::text,
         'manualMt5ActionStatus','PENDING',
         'manualMt5ActionSource','AUTO',
         'manualMt5ActionMessage',$5::text
       )
       WHERE id=$1`,
      [instance.id, action, actionId, requestedAt, message]
    );

    return { actionId, requestedAt };
  }

  @Post("agent-actions")
  async actions(@Body() body: { instanceId?: string; installToken?: string }) {
    const instanceId = String(body.instanceId || "").trim();
    const installToken = String(body.installToken || "").trim();
    const instance = await this.authenticatedInstance(instanceId, installToken);

    const requestedAt = instance.account_change_requested_at
      ? new Date(instance.account_change_requested_at)
      : null;
    const accountChangeRequested = Boolean(
      requestedAt &&
      Date.now() - requestedAt.getTime() >= 0 &&
      Date.now() - requestedAt.getTime() <= 30 * 60_000
    );

    const positions = Math.max(0, Number(instance.positions || 0));
    const eaOnline = Boolean(instance.ea_online);
    const safeToRestart =
      String(instance.desired_state || "STOPPED") !== "RUNNING" &&
      (String(instance.actual_state || "STOPPED") !== "RUNNING" || !eaOnline) &&
      positions <= 0;

    const previousRequestedAt = instance.manual_action_requested_at
      ? new Date(instance.manual_action_requested_at)
      : null;
    const previousAgeMs = previousRequestedAt
      ? Date.now() - previousRequestedAt.getTime()
      : Number.POSITIVE_INFINITY;
    let manualActionActive = Boolean(
      instance.manual_action_id &&
      instance.manual_action_name &&
      previousRequestedAt &&
      previousAgeMs >= 0 &&
      previousAgeMs <= ACTION_PENDING_TTL_MS &&
      String(instance.manual_action_status || "PENDING") === "PENDING"
    );

    let manualActionName = manualActionActive
      ? String(instance.manual_action_name || "")
      : "";
    let manualActionId = manualActionActive
      ? String(instance.manual_action_id || "")
      : "";
    let manualActionRequestedAt = manualActionActive && previousRequestedAt
      ? previousRequestedAt.toISOString()
      : null;
    let manualActionStatus = String(instance.manual_action_status || "") || null;

    const release = latestEaRelease();
    const eaVersionRequired = release.eaVersion;
    const currentEaVersion = String(instance.ea_version || "").trim();
    const currentEaHash = String(instance.agent_ea_hash || "").trim().toLowerCase();
    const requiredEaHash = String(release.sha256 || "").trim().toLowerCase();

    // Restore the original SCENOVA experience: the Agent owns automatic repair
    // while the bot is safely stopped. 3.1.2+ Agents already understand the
    // one-time action protocol, so the Server can authorize the exact same
    // controlled restart automatically. This fixes machines already on 3.1.2
    // without asking the customer to install another EXE first.
    if (!manualActionActive && safeToRestart) {
      const runtimeMismatch =
        !currentEaVersion || currentEaVersion !== eaVersionRequired;
      const fileMismatch = Boolean(
        requiredEaHash && currentEaHash !== requiredEaHash
      );

      let automaticAction: AutoMt5Action | null = null;
      let automaticMessage = "";
      if (runtimeMismatch || fileMismatch) {
        automaticAction = "UPDATE_EA_RESTART";
        automaticMessage =
          "SCENOVA Auto Update: ตรวจพบ EA/EX5 ไม่ตรง Server ระบบอนุญาตให้ Agent อัปเดตและรีโหลด MT5 อัตโนมัติเมื่อปลอดภัย";
      } else if (!eaOnline) {
        automaticAction = "CONNECT_MT5";
        automaticMessage =
          "SCENOVA Auto Connect: EA Offline ขณะบอทหยุดและไม่มี Position ระบบอนุญาตให้ Agent เปิด/เชื่อม MT5 อัตโนมัติ";
      }

      const recentlyTriedSameAction = Boolean(
        automaticAction &&
        String(instance.manual_action_name || "") === automaticAction &&
        previousAgeMs >= 0 &&
        previousAgeMs < AUTO_ACTION_RETRY_MS &&
        ["ACKED", "FAILED"].includes(
          String(instance.manual_action_status || "").toUpperCase()
        )
      );

      if (automaticAction && !recentlyTriedSameAction) {
        const queued = await this.queueAutomaticAction(
          instance,
          automaticAction,
          automaticMessage
        );
        manualActionActive = true;
        manualActionName = automaticAction;
        manualActionId = queued.actionId;
        manualActionRequestedAt = queued.requestedAt;
        manualActionStatus = "PENDING";
      }
    }

    return {
      ok: true,
      accountChangeRequested,
      accountChangeRequestId: accountChangeRequested && requestedAt
        ? requestedAt.toISOString()
        : "",
      pendingAccountDetected: Boolean(instance.pending_account_number),
      pendingAccountNumber: instance.pending_account_number || null,
      pendingServer: instance.pending_broker_server || null,
      eaOnline,
      eaVersion: currentEaVersion || null,
      eaVersionRequired,
      safeToRestart,
      positions,
      manualActionPending: manualActionActive,
      manualActionAllowed: manualActionActive && safeToRestart,
      manualActionName: manualActionActive ? manualActionName : null,
      manualActionId: manualActionActive ? manualActionId : null,
      manualActionRequestedAt,
      manualActionStatus
    };
  }

  @Post("agent-actions/ack")
  async acknowledge(
    @Body() body: {
      instanceId?: string;
      installToken?: string;
      actionId?: string;
      status?: string;
      message?: string;
    }
  ) {
    const instanceId = String(body.instanceId || "").trim();
    const installToken = String(body.installToken || "").trim();
    const actionId = String(body.actionId || "").trim();
    const status = String(body.status || "ACKED").trim().toUpperCase();
    const message = String(body.message || "").trim().slice(0, 240);
    if (!actionId) throw new ConflictException("manual action id missing");
    if (status !== "ACKED" && status !== "FAILED") {
      throw new ConflictException("manual action status invalid");
    }

    const instance = await this.authenticatedInstance(instanceId, installToken);
    if (String(instance.manual_action_id || "") !== actionId) {
      throw new ConflictException("manual action no longer active");
    }

    await this.db.query(
      `UPDATE bot_instances
       SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
         'manualMt5ActionStatus',$2::text,
         'manualMt5ActionAckAt',$3::text,
         'manualMt5ActionMessage',$4::text
       )
       WHERE id=$1`,
      [instanceId, status, new Date().toISOString(), message]
    );

    return { ok: true, actionId, status };
  }
}
