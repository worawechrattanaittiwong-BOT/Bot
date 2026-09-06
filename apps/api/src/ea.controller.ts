import {
  Body,
  Controller,
  Header,
  Post,
  ServiceUnavailableException,
  StreamableFile,
  UnauthorizedException
} from "@nestjs/common";
import { DbService } from "./db.service";
import { CryptoService } from "./security";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

@Controller("ea")
export class EaController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private artifactPath() {
    return process.env.EA_ARTIFACT_PATH || "/app/apps/api/artifacts/FastBasketBot.ex5";
  }

  private artifactHash() {
    const path = this.artifactPath();
    if (!existsSync(path)) return null;
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  }

  private async instance(instanceId: string, installToken: string) {
    const row = await this.db.one(
      "SELECT bi.*,a.user_id,a.account_number,a.broker_server,a.status account_status,u.status user_status FROM bot_instances bi JOIN mt5_accounts a ON a.id=bi.mt5_account_id JOIN users u ON u.id=a.user_id WHERE bi.id=$1",
      [instanceId]
    );
    if (!row || row.install_token_hash !== this.crypto.sha256(String(installToken || ""))) {
      throw new UnauthorizedException("EA authentication failed");
    }
    return row;
  }

  private async hasAccess(userId: string, mt5AccountId: string, mode: string) {
    const sub = await this.db.one(
      "SELECT 1 FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND p.mode=$2 AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() LIMIT 1",
      [userId, mode]
    );
    if (sub) return true;
    const trial = await this.db.one(
      "SELECT 1 FROM trial_grants WHERE user_id=$1 AND mt5_account_id=$2 AND status='ACTIVE' AND expires_at>now() LIMIT 1",
      [userId, mt5AccountId]
    );
    return !!trial;
  }

  @Post("heartbeat")
  async heartbeat(@Body() body: {
    instanceId: string;
    installToken: string;
    state: string;
    metrics?: Record<string, any>;
  }) {
    const instance = await this.instance(body.instanceId, body.installToken);
    const access = await this.hasAccess(
      instance.user_id,
      instance.mt5_account_id,
      instance.mode
    );

    const reportedAccount = String(body.metrics?.accountNumber || "").trim();
    if (reportedAccount && reportedAccount !== String(instance.account_number)) {
      await this.db.query(
        "UPDATE bot_instances SET actual_state='SAFE_STOP',desired_state='SAFE_STOP',last_seen_at=now() WHERE id=$1",
        [instance.id]
      );
      throw new UnauthorizedException("MT5 account does not match this SCENOVA license");
    }

    if (!access && instance.desired_state === "RUNNING") {
      await this.db.query(
        "UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1",
        [instance.id]
      );
      await this.db.query(
        "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
        [instance.id]
      );
    }

    await this.db.query(
      "UPDATE bot_instances SET actual_state=$2,last_seen_at=now(),metrics=$3::jsonb WHERE id=$1",
      [
        instance.id,
        String(body.state || "UNKNOWN").slice(0, 24),
        JSON.stringify(body.metrics || {})
      ]
    );

    const cmd = await this.db.one(
      "SELECT id,command,payload FROM bot_commands WHERE bot_instance_id=$1 AND (status='PENDING' OR (status='DELIVERED' AND delivered_at < now() - interval '10 seconds')) ORDER BY id LIMIT 1",
      [instance.id]
    );
    if (cmd) {
      await this.db.query(
        "UPDATE bot_commands SET status='DELIVERED',delivered_at=now() WHERE id=$1",
        [cmd.id]
      );
    }

    const settings = await this.db.one(
      "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
      [instance.id]
    );

    return {
      ok: true,
      access,
      desiredState: access ? instance.desired_state : "SAFE_STOP",
      command: cmd || null,
      commandId: cmd?.id || null,
      commandName: cmd?.command || null,
      commandPayload: cmd?.payload || null,
      settings: settings?.settings || {}
    };
  }

  @Post("agent-heartbeat")
  async agentHeartbeat(@Body() body: {
    instanceId: string;
    installToken: string;
    agentVersion?: string;
    terminalPath?: string;
    eaHash?: string;
    hostname?: string;
  }) {
    const instance = await this.instance(body.instanceId, body.installToken);
    await this.db.query(
      "UPDATE bot_instances SET agent_last_seen_at=now(),agent_version=$2,agent_terminal_path=$3,agent_ea_hash=$4 WHERE id=$1",
      [
        instance.id,
        String(body.agentVersion || "").slice(0, 32) || null,
        String(body.terminalPath || "").slice(0, 1000) || null,
        String(body.eaHash || "").slice(0, 128) || null
      ]
    );

    const serverEaHash = this.artifactHash();

    return {
      ok: true,
      instanceId: instance.id,
      artifactAvailable: Boolean(serverEaHash),
      artifactHash: serverEaHash,
      artifactName: "FastBasketBot.ex5",
      artifactEndpoint: "/api/ea/artifact",
      agentDownloadUrl: "/downloads/SCENOVA-Agent.ps1"
    };
  }

  @Post("artifact")
  @Header("Content-Type", "application/octet-stream")
  @Header("Content-Disposition", 'attachment; filename="FastBasketBot.ex5"')
  async artifact(@Body() body: {
    instanceId: string;
    installToken: string;
  }) {
    await this.instance(body.instanceId, body.installToken);

    const path = this.artifactPath();
    if (!existsSync(path)) {
      throw new ServiceUnavailableException("EA production artifact is not published yet");
    }

    return new StreamableFile(readFileSync(path));
  }

  @Post("ack")
  async ack(@Body() body: {
    instanceId: string;
    installToken: string;
    commandId: number;
  }) {
    await this.instance(body.instanceId, body.installToken);
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE id=$1 AND bot_instance_id=$2",
      [body.commandId, body.instanceId]
    );
    return { ok: true };
  }
}
