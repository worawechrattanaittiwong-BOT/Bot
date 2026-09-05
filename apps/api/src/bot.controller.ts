import {
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { CryptoService, JwtGuard } from "./security";

@Controller("bot")
@UseGuards(JwtGuard)
export class BotController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private async entitlement(userId: string) {
    const sub = await this.db.one(
      "SELECT s.id,s.expires_at,p.code,p.mode FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() ORDER BY s.expires_at DESC LIMIT 1",
      [userId]
    );
    if (sub) return { allowed: true, source: "SUBSCRIPTION", expiresAt: sub.expires_at };

    const trial = await this.db.one(
      "SELECT id,status,duration_minutes,started_at,expires_at FROM trial_grants WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (!trial) return { allowed: false, source: "NONE" };
    if (trial.status === "APPROVED") return { allowed: true, source: "TRIAL_READY", trialId: trial.id };
    if (trial.status === "ACTIVE" && trial.expires_at && new Date(trial.expires_at) > new Date()) {
      return { allowed: true, source: "TRIAL", expiresAt: trial.expires_at };
    }
    return { allowed: false, source: "TRIAL_EXPIRED" };
  }

  @Get("dashboard")
  async dashboard(@Req() req: any) {
    const userId = req.user.sub;
    const user = await this.db.one(
      "SELECT id,user_code,email,status FROM users WHERE id=$1",
      [userId]
    );
    const account = await this.db.one(
      "SELECT * FROM mt5_accounts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    let instance = null;
    let settings = null;
    if (account) {
      instance = await this.db.one(
        "SELECT * FROM bot_instances WHERE mt5_account_id=$1",
        [account.id]
      );
      if (instance) {
        settings = await this.db.one(
          "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
          [instance.id]
        );
      }
    }
    return {
      user,
      account,
      instance,
      settings: settings?.settings || null,
      entitlement: await this.entitlement(userId)
    };
  }

  @Post("mt5")
  async linkMt5(
    @Req() req: any,
    @Body() body: {
      accountNumber: string;
      broker?: string;
      brokerServer: string;
      mode: "CLOUD" | "LOCAL";
    }
  ) {
    const mode = body.mode === "CLOUD" ? "CLOUD" : "LOCAL";
    const account = await this.db.one(
      "INSERT INTO mt5_accounts(user_id,account_number,broker,broker_server,mode) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [req.user.sub, String(body.accountNumber), body.broker || "Exness", String(body.brokerServer), mode]
    );
    const installToken = randomBytes(32).toString("hex");
    const instance = await this.db.one(
      "INSERT INTO bot_instances(mt5_account_id,mode,install_token_hash) VALUES($1,$2,$3) RETURNING id,mode,desired_state,actual_state",
      [account.id, mode, this.crypto.sha256(installToken)]
    );
    await this.db.query("INSERT INTO bot_settings(bot_instance_id) VALUES($1)", [instance.id]);

    if (mode === "CLOUD") {
      const secret = this.crypto.encrypt(installToken);
      await this.db.query(
        "INSERT INTO bot_instance_secrets(bot_instance_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4)",
        [instance.id, secret.ciphertext, secret.iv, secret.authTag]
      );
    }

    return {
      account,
      instance,
      installToken: mode === "LOCAL" ? installToken : null,
      note: mode === "LOCAL"
        ? "Install token is shown once. Keep it private."
        : "Cloud install token is held encrypted for the assigned worker."
    };
  }

  @Post("mt5/cloud-credential")
  async saveCloudCredential(
    @Req() req: any,
    @Body() body: { mt5AccountId: string; tradingPassword: string }
  ) {
    const account = await this.db.one(
      "SELECT * FROM mt5_accounts WHERE id=$1 AND user_id=$2 AND mode='CLOUD'",
      [body.mt5AccountId, req.user.sub]
    );
    if (!account) throw new ConflictException("cloud MT5 account not found");
    const enc = this.crypto.encrypt(String(body.tradingPassword || ""));
    await this.db.query(
      "INSERT INTO mt5_credentials(mt5_account_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4) ON CONFLICT(mt5_account_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,updated_at=now()",
      [account.id, enc.ciphertext, enc.iv, enc.authTag]
    );
    return { ok: true };
  }

  @Post("start")
  async start(@Req() req: any) {
    const access: any = await this.entitlement(req.user.sub);
    if (!access.allowed) throw new ConflictException("trial or subscription required");
    if (access.source === "TRIAL_READY") {
      await this.db.query(
        "UPDATE trial_grants SET status='ACTIVE',started_at=now(),expires_at=now() + (duration_minutes || ' minutes')::interval WHERE id=$1 AND status='APPROVED'",
        [access.trialId]
      );
    }
    const instance = await this.getInstance(req.user.sub);
    await this.db.query(
      "UPDATE bot_instances SET desired_state='RUNNING',lock_owner=id::text WHERE id=$1",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'START')",
      [instance.id]
    );
    return { ok: true, state: "RUNNING" };
  }

  @Post("stop")
  async safeStop(@Req() req: any) {
    return this.commandForUser(req.user.sub, "SAFE_STOP");
  }

  @Post("close-all")
  async closeAll(@Req() req: any) {
    return this.commandForUser(req.user.sub, "CLOSE_ALL");
  }

  @Put("settings")
  async updateSettings(@Req() req: any, @Body() body: Record<string, any>) {
    const instance = await this.getInstance(req.user.sub);
    const allowedKeys = [
      "symbol","lot","maxPositions","basketTriggerMoney","basketTrailMoney",
      "maxBasketLossMoney","dailyLossMoney","maxSpreadPoints","minOrderIntervalMs",
      "maxOrdersPerMinute","entryMode"
    ];
    const clean: Record<string, any> = {};
    for (const key of allowedKeys) if (body[key] !== undefined) clean[key] = body[key];
    await this.db.query(
      "UPDATE bot_settings SET settings=settings || $2::jsonb,updated_at=now() WHERE bot_instance_id=$1",
      [instance.id, JSON.stringify(clean)]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command,payload) VALUES($1,'UPDATE_SETTINGS',$2::jsonb)",
      [instance.id, JSON.stringify(clean)]
    );
    return { ok: true, settings: clean };
  }

  private async getInstance(userId: string) {
    const instance = await this.db.one(
      "SELECT bi.id FROM bot_instances bi JOIN mt5_accounts a ON a.id=bi.mt5_account_id WHERE a.user_id=$1 ORDER BY bi.created_at DESC LIMIT 1",
      [userId]
    );
    if (!instance) throw new ConflictException("connect MT5 first");
    return instance;
  }

  private async commandForUser(userId: string, command: string) {
    const instance = await this.getInstance(userId);
    const desired = command === "CLOSE_ALL" ? "STOPPED" : "SAFE_STOP";
    await this.db.query("UPDATE bot_instances SET desired_state=$2 WHERE id=$1", [instance.id, desired]);
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,$2)",
      [instance.id, command]
    );
    return { ok: true, state: desired };
  }
}
