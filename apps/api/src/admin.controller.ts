import {
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { DbService } from "./db.service";
import { AdminGuard } from "./security";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly db: DbService) {}

  @Get("users")
  async users(@Query("q") q = "") {
    const term = "%" + q.trim() + "%";
    const result = await this.db.query(
      "SELECT u.id,u.user_code,u.email,u.status,a.id mt5_account_id,a.account_number,a.broker_server,a.mode,s.subscription_id,s.plan_code,s.subscription_expires_at FROM users u LEFT JOIN LATERAL (SELECT * FROM mt5_accounts m WHERE m.user_id=u.id ORDER BY created_at DESC LIMIT 1) a ON true LEFT JOIN LATERAL (SELECT sub.id subscription_id,p.code plan_code,sub.expires_at subscription_expires_at FROM subscriptions sub JOIN plans p ON p.id=sub.plan_id WHERE sub.user_id=u.id ORDER BY sub.expires_at DESC LIMIT 1) s ON true WHERE u.user_code ILIKE $1 OR u.email ILIKE $1 OR a.account_number ILIKE $1 ORDER BY u.created_at DESC LIMIT 30",
      [term]
    );
    return result.rows;
  }

  @Post("trials/grant")
  async grantTrial(@Body() body: {
    mt5AccountId: string;
    approvedBy?: string;
    minutes?: number;
  }) {
    const account = await this.db.one(
      "SELECT a.*,u.id user_id FROM mt5_accounts a JOIN users u ON u.id=a.user_id WHERE a.id=$1",
      [body.mt5AccountId]
    );
    if (!account) throw new ConflictException("MT5 account not found");
    const used = await this.db.one(
      "SELECT id,status,started_at,expires_at FROM trial_grants WHERE lower(account_number)=lower($1) AND lower(broker_server)=lower($2)",
      [account.account_number, account.broker_server]
    );
    if (used) throw new ConflictException("this MT5 account/server has already received a trial");

    const row = await this.db.one(
      "INSERT INTO trial_grants(user_id,mt5_account_id,account_number,broker_server,duration_minutes,approved_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [
        account.user_id,
        account.id,
        account.account_number,
        account.broker_server,
        Math.max(1, Number(body.minutes || 180)),
        body.approvedBy || "ADMIN"
      ]
    );
    await this.audit("ADMIN", "GRANT_TRIAL", "trial", row.id, {
      mt5AccountId: account.id
    });
    return row;
  }

  @Post("subscriptions/activate")
  async activate(@Body() body: {
    userId: string;
    planCode: string;
    durationDays?: number;
    expiresAt?: string;
    activatedBy?: string;
    note?: string;
  }) {
    const plan = await this.db.one(
      "SELECT * FROM plans WHERE code=$1 AND active=true",
      [body.planCode]
    );
    if (!plan) throw new ConflictException("plan not found");
    const days = Math.max(1, Number(body.durationDays || 30));
    const expiresAt = body.expiresAt
      ? new Date(body.expiresAt)
      : new Date(Date.now() + days * 86400000);
    const row = await this.db.one(
      "INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note) VALUES($1,$2,now(),$3,$4,$5) RETURNING *",
      [body.userId, plan.id, expiresAt, body.activatedBy || "ADMIN", body.note || null]
    );
    await this.audit("ADMIN", "ACTIVATE_SUBSCRIPTION", "subscription", row.id, {
      plan: body.planCode,
      expiresAt
    });
    return row;
  }

  @Post("subscriptions/extend")
  async extend(@Body() body: { subscriptionId: string; days: number }) {
    const row = await this.db.one(
      "UPDATE subscriptions SET expires_at=GREATEST(expires_at,now()) + ($2 || ' days')::interval,status='ACTIVE' WHERE id=$1 RETURNING *",
      [body.subscriptionId, Math.max(1, Number(body.days))]
    );
    if (!row) throw new ConflictException("subscription not found");
    await this.audit("ADMIN", "EXTEND_SUBSCRIPTION", "subscription", row.id, {
      days: body.days
    });
    return row;
  }

  @Post("users/suspend")
  async suspend(@Body() body: { userId: string }) {
    await this.db.query(
      "UPDATE users SET status='SUSPENDED',updated_at=now() WHERE id=$1",
      [body.userId]
    );
    const instances = await this.db.query(
      "SELECT bi.id FROM bot_instances bi JOIN mt5_accounts a ON a.id=bi.mt5_account_id WHERE a.user_id=$1",
      [body.userId]
    );
    for (const instance of instances.rows) {
      await this.db.query(
        "UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1",
        [instance.id]
      );
      await this.db.query(
        "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
        [instance.id]
      );
    }
    await this.audit("ADMIN", "SUSPEND_USER", "user", body.userId, {});
    return { ok: true };
  }

  @Post("users/reactivate")
  async reactivate(@Body() body: { userId: string }) {
    await this.db.query(
      "UPDATE users SET status='ACTIVE',updated_at=now() WHERE id=$1",
      [body.userId]
    );
    await this.audit("ADMIN", "REACTIVATE_USER", "user", body.userId, {});
    return { ok: true };
  }

  private async audit(
    actor: string,
    action: string,
    entityType: string,
    entityId: string,
    detail: any
  ) {
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
      [actor, action, entityType, entityId, JSON.stringify(detail)]
    );
  }
}
