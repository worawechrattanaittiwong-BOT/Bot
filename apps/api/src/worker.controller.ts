import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { DbService } from "./db.service";
import { CryptoService, WorkerGuard } from "./security";

@Controller("worker")
@UseGuards(WorkerGuard)
export class WorkerController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  @Post("heartbeat")
  async heartbeat(@Body() body: {
    runnerId: string;
    region?: string;
    hostname?: string;
    capacity?: number;
    activeInstances?: number;
    telemetry?: { cpuPercent?: number; ramUsedGb?: number; ramTotalGb?: number; templateReady?: boolean; version?: string };
  }) {
    if (body.activeInstances != null && (!Number.isInteger(body.activeInstances) || body.activeInstances<0 || body.activeInstances>200)) throw new BadRequestException("invalid instance count");
    await this.db.query(
      "INSERT INTO worker_nodes(runner_id,region,hostname,capacity,active_instances,status,last_seen_at) VALUES($1,$2,$3,$4,$5,'ONLINE',now()) ON CONFLICT(runner_id) DO UPDATE SET hostname=EXCLUDED.hostname,active_instances=EXCLUDED.active_instances,status='ONLINE',last_seen_at=now()",
      [
        body.runnerId,
        body.region || "singapore",
        body.hostname || null,
        Math.max(1, Number(body.capacity || 10)),
        Math.max(0, Number(body.activeInstances || 0))
      ]
    );
    if (body.telemetry) {
      const t = body.telemetry;
      const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
      await this.db.query("UPDATE worker_nodes SET telemetry=$2 WHERE runner_id=$1", [body.runnerId, JSON.stringify({
        cpuPercent: finite(t.cpuPercent),ramUsedGb: finite(t.ramUsedGb),ramTotalGb: finite(t.ramTotalGb),
        templateReady: t.templateReady === true,version: String(t.version || "").slice(0,32)
      })]);
    }
    return { ok: true };
  }

  @Post("claim-next")
  async claimNext(@Body() body: { runnerId: string }) {
    const claimed = await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      const node = (await tx.query(`SELECT w.*,l.occupied FROM worker_nodes w JOIN cloud_node_load l USING(runner_id)
        WHERE w.runner_id=$1 AND w.last_seen_at>now()-interval '30 seconds' FOR UPDATE OF w`, [body.runnerId])).rows[0];
      if (!node || node.telemetry?.templateReady!==true) return null;
      // Paid reservations can finish provisioning even after new sales are paused.
      return (await tx.query(`UPDATE bot_instances SET runner_id=$1,lock_owner=$1 WHERE id=(
        SELECT bi.id FROM bot_instances bi JOIN mt5_accounts a ON a.id=bi.mt5_account_id
        JOIN users u ON u.id=a.user_id JOIN mt5_credentials c ON c.mt5_account_id=a.id
        JOIN bot_instance_secrets secret ON secret.bot_instance_id=bi.id
        LEFT JOIN license_slots ls ON ls.id=bi.slot_id LEFT JOIN subscriptions sub ON sub.id=ls.subscription_id
        WHERE bi.mode='CLOUD' AND bi.runner_id IS NULL AND u.status='ACTIVE'
        AND (u.role IN ('OWNER','ADMIN') OR (sub.status='ACTIVE' AND sub.starts_at<=now() AND sub.expires_at>now())
          OR EXISTS(SELECT 1 FROM trial_grants t WHERE t.mt5_account_id=a.id AND (t.status='APPROVED' OR t.expires_at>now())))
        AND (EXISTS(SELECT 1 FROM cloud_orders o WHERE o.slot_id=bi.slot_id AND o.status='PAID' AND o.runner_id=$1)
          OR ($2::boolean AND $3::int<$4::int AND NOT EXISTS(SELECT 1 FROM cloud_orders o WHERE o.slot_id=bi.slot_id AND o.status IN ('CREATING','PENDING','REVIEW','PAID'))))
        ORDER BY bi.created_at LIMIT 1 FOR UPDATE OF bi SKIP LOCKED) RETURNING *`,
        [body.runnerId,node.accepting_jobs,Math.max(node.occupied,node.active_instances),node.capacity])).rows[0];
    });
    if (!claimed) return { job: null };

    return { job: await this.job(claimed.id) };
  }

  @Post("assigned")
  async assigned(@Body() body: { runnerId: string }) {
    const rows = await this.db.query("SELECT id FROM bot_instances WHERE runner_id=$1 AND mode='CLOUD' ORDER BY created_at", [body.runnerId]);
    const jobs = [];
    for (const row of rows.rows) jobs.push(await this.job(row.id));
    return { jobs: jobs.filter(Boolean) };
  }

  private async job(instanceId: string) {
    const job = await this.db.one(
      "SELECT bi.id instance_id,bi.desired_state,(bi.last_seen_at>now()-interval '30 seconds') ea_online,a.id mt5_account_id,a.account_number,a.broker,a.broker_server,a.mode,c.ciphertext credential_ciphertext,c.iv credential_iv,c.auth_tag credential_tag,s.ciphertext token_ciphertext,s.iv token_iv,s.auth_tag token_tag,bs.settings FROM bot_instances bi JOIN mt5_accounts a ON a.id=bi.mt5_account_id JOIN mt5_credentials c ON c.mt5_account_id=a.id JOIN bot_instance_secrets s ON s.bot_instance_id=bi.id LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id WHERE bi.id=$1",
      [instanceId]
    );

    if (!job) return null;
    return {
        instanceId: job.instance_id,
        eaOnline: Boolean(job.ea_online),
        mt5AccountId: job.mt5_account_id,
        accountNumber: job.account_number,
        broker: job.broker,
        brokerServer: job.broker_server,
        mode: job.mode,
        desiredState: job.desired_state,
        tradingPassword: this.crypto.decrypt({
          ciphertext: job.credential_ciphertext,
          iv: job.credential_iv,
          authTag: job.credential_tag
        }),
        installToken: this.crypto.decrypt({
          ciphertext: job.token_ciphertext,
          iv: job.token_iv,
          authTag: job.token_tag
        }),
        settings: job.settings || {}
    };
  }

  @Post("release")
  async release(@Body() body: { runnerId: string; instanceId: string }) {
    // An API request alone cannot prove that the old terminal has stopped.
    // Keep ownership until an operator verifies shutdown; prevent duplicate execution.
    throw new BadRequestException("Automatic release is disabled; verify terminal shutdown before operator reassignment");
  }

  @Post("provision-result")
  async provisionResult(@Body() body: { runnerId: string; instanceId: string; errorCode: string }) {
    if (!/^[0-9a-f-]{36}$/i.test(body.instanceId) || !["","CHECK_TEMPLATE_OR_TERMINAL"].includes(body.errorCode)) throw new BadRequestException("Invalid result");
    await this.db.query("UPDATE bot_instances SET provisioning_error=$3 WHERE id=$1 AND runner_id=$2", [body.instanceId,body.runnerId,body.errorCode||null]);
    return { ok:true };
  }
}
