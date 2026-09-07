import {
  Body,
  Controller,
  Header,
  Post,
  Req,
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

  private clientIp(req: any) {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
  }

  private async instance(instanceId: string, installToken: string) {
    const row = await this.db.one(
      `SELECT
         bi.*,
         COALESCE(ls.assigned_user_id,a.user_id) user_id,
         ls.status slot_status,
         a.account_number,
         a.broker,
         a.broker_server,
         a.status account_status,
         u.status user_status,
         u.role user_role
       FROM bot_instances bi
       LEFT JOIN license_slots ls ON ls.id=bi.slot_id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       LEFT JOIN users u ON u.id=COALESCE(ls.assigned_user_id,a.user_id)
       WHERE bi.id=$1`,
      [instanceId]
    );
    if (!row || row.install_token_hash !== this.crypto.sha256(String(installToken || ""))) {
      throw new UnauthorizedException("EA authentication failed");
    }
    if (!row.user_id || row.user_status !== "ACTIVE") {
      throw new UnauthorizedException("SCENOVA account is not active");
    }
    if (row.mt5_account_id && row.account_status !== "ACTIVE") {
      throw new UnauthorizedException("SCENOVA MT5 account is not active");
    }
    if (row.slot_id && row.slot_status && !["ACTIVE", "AVAILABLE"].includes(String(row.slot_status))) {
      throw new UnauthorizedException("SCENOVA slot is not active");
    }
    return row;
  }

  private async hasAccess(userId: string, mt5AccountId: string | null, mode: string, slotId: string | null) {
    const user = await this.db.one(
      "SELECT role,status FROM users WHERE id=$1",
      [userId]
    );
    if (user?.status === "ACTIVE" && (user.role === "OWNER" || user.role === "ADMIN")) {
      return true;
    }

    if (slotId) {
      const sub = await this.db.one(
        `SELECT 1
         FROM license_slots ls
         JOIN subscriptions s ON s.id=ls.subscription_id
         JOIN plans p ON p.id=s.plan_id
         WHERE ls.id=$1
           AND ls.assigned_user_id=$2
           AND ls.status='ACTIVE'
           AND p.mode=$3
           AND s.status='ACTIVE'
           AND s.starts_at<=now()
           AND s.expires_at>now()
         LIMIT 1`,
        [slotId, userId, mode]
      );
      if (sub) return true;
    }

    if (mt5AccountId) {
      const trial = await this.db.one(
        "SELECT 1 FROM trial_grants WHERE user_id=$1 AND mt5_account_id=$2 AND status='ACTIVE' AND expires_at>now() LIMIT 1",
        [userId, mt5AccountId]
      );
      if (trial) return true;
    }
    return false;
  }

  @Post("heartbeat")
  async heartbeat(
    @Req() req: any,
    @Body() body: {
      instanceId: string;
      installToken: string;
      state: string;
      metrics?: Record<string, any>;
    }
  ) {
    const instance = await this.instance(body.instanceId, body.installToken);
    const eaIp = this.clientIp(req);
    const metrics = body.metrics || {};

    if (instance.device_status === "ACTIVE") {
      const lastDeviceSeen = instance.device_last_seen_at
        ? new Date(instance.device_last_seen_at).getTime()
        : 0;
      const deviceRecent = lastDeviceSeen > 0 && Date.now() - lastDeviceSeen <= 90_000;
      const sameIp = Boolean(eaIp) && String(instance.device_last_ip || "") === String(eaIp);
      if (!deviceRecent || !sameIp) {
        await this.db.query(
          "UPDATE bot_instances SET actual_state='SAFE_STOP',desired_state='SAFE_STOP',last_seen_at=now(),ea_last_ip=$2,metrics=$3::jsonb WHERE id=$1",
          [instance.id, eaIp, JSON.stringify(metrics)]
        );
        return {
          ok: true,
          access: false,
          desiredState: "SAFE_STOP",
          deviceMismatch: true,
          message: deviceRecent
            ? "EA is not running from the registered SCENOVA device"
            : "registered SCENOVA device agent is offline",
          settings: {}
        };
      }
    }

    const reportedAccount = String(metrics.accountNumber || "").trim();
    const reportedServer = String(metrics.server || "").trim();
    const reportedBroker = String(metrics.broker || "").trim();
    const accountMismatch =
      Boolean(reportedAccount) &&
      (
        !instance.mt5_account_id ||
        reportedAccount !== String(instance.account_number || "") ||
        (reportedServer && instance.broker_server && reportedServer !== String(instance.broker_server))
      );

    if (accountMismatch) {
      await this.db.query(
        `UPDATE bot_instances SET
           actual_state='SAFE_STOP',
           desired_state='SAFE_STOP',
           last_seen_at=now(),
           ea_last_ip=$2,
           metrics=$3::jsonb,
           pending_account_number=$4,
           pending_broker=$5,
           pending_broker_server=$6,
           pending_account_ip=$2,
           pending_account_seen_at=now()
         WHERE id=$1`,
        [
          instance.id,
          eaIp,
          JSON.stringify(metrics),
          reportedAccount,
          reportedBroker || null,
          reportedServer || "UNKNOWN"
        ]
      );
      return {
        ok: true,
        access: false,
        desiredState: "SAFE_STOP",
        accountMismatch: true,
        detectedAccount: reportedAccount,
        detectedBroker: reportedBroker || null,
        detectedServer: reportedServer || null,
        settings: {}
      };
    }

    const access = await this.hasAccess(
      instance.user_id,
      instance.mt5_account_id || null,
      instance.mode,
      instance.slot_id || null
    );

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
      "UPDATE bot_instances SET actual_state=$2,last_seen_at=now(),ea_last_ip=$3,metrics=$4::jsonb WHERE id=$1",
      [
        instance.id,
        String(body.state || "UNKNOWN").slice(0, 24),
        eaIp,
        JSON.stringify(metrics)
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
  async agentHeartbeat(
    @Req() req: any,
    @Body() body: {
      instanceId: string;
      installToken: string;
      agentVersion?: string;
      terminalPath?: string;
      eaHash?: string;
      hostname?: string;
      devicePublicId?: string;
      deviceSecret?: string;
    }
  ) {
    const instance = await this.instance(body.instanceId, body.installToken);
    let deviceVerified = false;

    if (instance.device_status === "ACTIVE") {
      const publicId = String(body.devicePublicId || "");
      const secret = String(body.deviceSecret || "");
      if (
        !publicId ||
        publicId !== String(instance.device_public_id || "") ||
        this.crypto.sha256(secret) !== String(instance.device_secret_hash || "")
      ) {
        throw new UnauthorizedException("SCENOVA device authentication failed");
      }
      deviceVerified = true;
    }

    const ip = this.clientIp(req);
    await this.db.query(
      `UPDATE bot_instances SET
         agent_last_seen_at=now(),
         agent_version=$2,
         agent_terminal_path=$3,
         agent_ea_hash=$4,
         device_hostname=COALESCE(NULLIF($5,''),device_hostname),
         device_last_seen_at=CASE WHEN $6::boolean THEN now() ELSE device_last_seen_at END,
         device_last_ip=CASE WHEN $6::boolean THEN $7 ELSE device_last_ip END
       WHERE id=$1`,
      [
        instance.id,
        String(body.agentVersion || "").slice(0, 32) || null,
        String(body.terminalPath || "").slice(0, 1000) || null,
        String(body.eaHash || "").slice(0, 128) || null,
        String(body.hostname || "").slice(0, 160),
        deviceVerified,
        ip
      ]
    );

    const serverEaHash = this.artifactHash();

    return {
      ok: true,
      instanceId: instance.id,
      deviceVerified,
      artifactAvailable: Boolean(serverEaHash),
      artifactHash: serverEaHash,
      artifactName: "FastBasketBot.ex5",
      artifactEndpoint: "/api/ea/artifact",
      agentDownloadUrl: "/downloads/SCENOVA-Setup.exe"
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
