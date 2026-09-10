import { Body, ConflictException, Controller, Post } from "@nestjs/common";
import { DbService } from "./db.service";
import { CryptoService } from "./security";

@Controller("ea")
export class AgentActionController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  @Post("agent-actions")
  async actions(@Body() body: { instanceId?: string; installToken?: string }) {
    const instanceId = String(body.instanceId || "").trim();
    const installToken = String(body.installToken || "").trim();
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
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) AS positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS ea_online
       FROM bot_instances bi
       WHERE bi.id=$1`,
      [instanceId]
    );

    if (!instance || String(instance.install_token_hash || "") !== this.crypto.sha256(installToken)) {
      throw new ConflictException("invalid agent authentication");
    }

    const requestedAt = instance.account_change_requested_at
      ? new Date(instance.account_change_requested_at)
      : null;
    const accountChangeRequested = Boolean(
      requestedAt &&
      Date.now() - requestedAt.getTime() >= 0 &&
      Date.now() - requestedAt.getTime() <= 30 * 60_000
    );
    const positions = Math.max(0, Number(instance.positions || 0));
    const safeToRestart =
      String(instance.desired_state || "STOPPED") !== "RUNNING" &&
      String(instance.actual_state || "STOPPED") !== "RUNNING" &&
      positions <= 0;

    return {
      ok: true,
      accountChangeRequested,
      accountChangeRequestId: accountChangeRequested && requestedAt
        ? requestedAt.toISOString()
        : "",
      pendingAccountDetected: Boolean(instance.pending_account_number),
      pendingAccountNumber: instance.pending_account_number || null,
      pendingServer: instance.pending_broker_server || null,
      eaOnline: Boolean(instance.ea_online),
      safeToRestart,
      positions
    };
  }
}
