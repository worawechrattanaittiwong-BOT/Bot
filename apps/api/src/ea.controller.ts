import {
  Body,
  Controller,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { DbService } from "./db.service";
import { CryptoService } from "./security";

@Controller("ea")
export class EaController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

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

  private async hasAccess(userId: string) {
    const sub = await this.db.one(
      "SELECT 1 FROM subscriptions WHERE user_id=$1 AND status='ACTIVE' AND starts_at<=now() AND expires_at>now() LIMIT 1",
      [userId]
    );
    if (sub) return true;
    const trial = await this.db.one(
      "SELECT 1 FROM trial_grants WHERE user_id=$1 AND status='ACTIVE' AND expires_at>now() LIMIT 1",
      [userId]
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
    const access = await this.hasAccess(instance.user_id);

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
      "SELECT id,command,payload FROM bot_commands WHERE bot_instance_id=$1 AND status='PENDING' ORDER BY id LIMIT 1",
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
      settings: settings?.settings || {}
    };
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
