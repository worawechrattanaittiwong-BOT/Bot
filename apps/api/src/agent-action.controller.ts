import { Body, ConflictException, Controller, Post } from "@nestjs/common";
import { DbService } from "./db.service";
import { latestEaRelease } from "./release-version";
import { CryptoService } from "./security";

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
         bi.account_change_requested_at,
         bi.pending_account_number,
         bi.pending_broker_server,
         bi.metrics->>'eaVersion' AS ea_version,
         bi.metrics->>'manualMt5ActionName' AS manual_action_name,
         bi.metrics->>'manualMt5ActionId' AS manual_action_id,
         bi.metrics->>'manualMt5ActionRequestedAt' AS manual_action_requested_at,
         bi.metrics->>'manualMt5ActionStatus' AS manual_action_status,
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

    const manualRequestedAt = instance.manual_action_requested_at
      ? new Date(instance.manual_action_requested_at)
      : null;
    const manualAgeMs = manualRequestedAt
      ? Date.now() - manualRequestedAt.getTime()
      : Number.POSITIVE_INFINITY;
    const manualActionActive = Boolean(
      instance.manual_action_id &&
      instance.manual_action_name &&
      manualRequestedAt &&
      manualAgeMs >= 0 &&
      manualAgeMs <= 15 * 60_000 &&
      String(instance.manual_action_status || "PENDING") === "PENDING"
    );
    const eaVersionRequired = latestEaRelease().eaVersion;

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
      eaVersion: String(instance.ea_version || "").trim() || null,
      eaVersionRequired,
      safeToRestart,
      positions,
      manualActionPending: manualActionActive,
      manualActionAllowed: manualActionActive && safeToRestart,
      manualActionName: manualActionActive ? instance.manual_action_name : null,
      manualActionId: manualActionActive ? instance.manual_action_id : null,
      manualActionRequestedAt: manualActionActive && manualRequestedAt
        ? manualRequestedAt.toISOString()
        : null,
      manualActionStatus: instance.manual_action_status || null
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
