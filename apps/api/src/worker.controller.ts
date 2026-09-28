import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { DbService } from "./db.service";
import { CryptoService, WorkerGuard } from "./security";
import { ProductionHardeningService } from "./production-hardening.service";

@Controller("worker")
@UseGuards(WorkerGuard)
export class WorkerController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly hardening: ProductionHardeningService
  ) {}

  @Post("heartbeat")
  async heartbeat(@Body() body: {
    runnerId: string;
    region?: string;
    hostname?: string;
    capacity?: number;
    activeInstances?: number;
    telemetry?: {
      cpuPercent?: number;
      ramUsedGb?: number;
      ramTotalGb?: number;
      diskFreeGb?: number;
      diskTotalGb?: number;
      templateReady?: boolean;
      version?: string;
      setupVersion?: string;
      instances?: Array<{
        instanceId?: string;
        terminalRunning?: boolean;
        chartFiles?: number;
        chartHasFastBasketBot?: boolean;
        eaSha256?: string;
        eaBytes?: number;
        startupConfigExists?: boolean;
        presetCloudRelayEnabled?: boolean;
        relayRequestFiles?: number;
        relayResponseFiles?: number;
        expertLogUpdatedAt?: string;
        journalLogUpdatedAt?: string;
        latestExpertLog?: string;
        latestJournalLog?: string;
        brokerPlatform?: string;
        brokerPlatformError?: string;
      }>;
    };
  }) {
    if (body.activeInstances != null && (!Number.isInteger(body.activeInstances) || body.activeInstances<0 || body.activeInstances>200)) {
      throw new BadRequestException("invalid instance count");
    }
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
      const telemetry = {
        cpuPercent: finite(t.cpuPercent),
        ramUsedGb: finite(t.ramUsedGb),
        ramTotalGb: finite(t.ramTotalGb),
        diskFreeGb: finite(t.diskFreeGb),
        diskTotalGb: finite(t.diskTotalGb),
        templateReady: t.templateReady === true,
        version: String(t.version || "").slice(0,32),
        setupVersion: String(t.setupVersion || "").slice(0,32),
        instances: Array.isArray(t.instances)
          ? t.instances.slice(0,50).map(item => ({
              instanceId: String(item?.instanceId || "").slice(0,64),
              terminalRunning: item?.terminalRunning === true,
              chartFiles: Math.max(0, Math.min(200, Number(item?.chartFiles || 0))),
              chartHasFastBasketBot: item?.chartHasFastBasketBot === true,
              eaSha256: String(item?.eaSha256 || "").replace(/[^a-f0-9]/gi,"").slice(0,64).toLowerCase(),
              eaBytes: Math.max(0, Math.min(10_000_000, Number(item?.eaBytes || 0))),
              startupConfigExists: item?.startupConfigExists === true,
              presetCloudRelayEnabled: item?.presetCloudRelayEnabled === true,
              relayRequestFiles: Math.max(0, Math.min(100, Number(item?.relayRequestFiles || 0))),
              relayResponseFiles: Math.max(0, Math.min(100, Number(item?.relayResponseFiles || 0))),
              expertLogUpdatedAt: String(item?.expertLogUpdatedAt || "").slice(0,64),
              journalLogUpdatedAt: String(item?.journalLogUpdatedAt || "").slice(0,64),
              latestExpertLog: String(item?.latestExpertLog || "").slice(0,1800),
              latestJournalLog: String(item?.latestJournalLog || "").slice(0,1800),
              brokerPlatform: String(item?.brokerPlatform || "")
                .toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,32),
              brokerPlatformError: String(item?.brokerPlatformError || "").slice(0,240)
            }))
          : []
      };
      await this.db.query("UPDATE worker_nodes SET telemetry=$2 WHERE runner_id=$1", [body.runnerId, JSON.stringify(telemetry)]);
      await this.hardening.recordWorkerHeartbeat(body.runnerId, telemetry);
    }
    return { ok: true };
  }

  @Post("claim-next")
  async claimNext(@Body() body: { runnerId: string }) {
    const claimed = await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740091)");
      const controls = (await tx.query("SELECT cloud_provisioning_paused FROM production_controls WHERE id=1")).rows[0];
      if (controls?.cloud_provisioning_paused) return null;
      const node = (await tx.query(`SELECT w.*,l.occupied FROM worker_nodes w JOIN cloud_node_load l USING(runner_id)
        WHERE w.runner_id=$1 AND w.last_seen_at>now()-interval '30 seconds' FOR UPDATE OF w`, [body.runnerId])).rows[0];
      if (!node || node.telemetry?.templateReady!==true || node.quarantined || node.capacity_blocked) return null;
      // Paid reservations can finish provisioning when the operator merely pauses
      // new sales. Automatic capacity/quarantine/global guards are stronger and
      // block provisioning until the infrastructure is healthy again.
      return (await tx.query(`UPDATE bot_instances SET
          runner_id=$1,
          lock_owner=$1,
          runtime_stop_state='NONE',
          runtime_stop_requested_at=NULL,
          runtime_stop_confirmed_at=NULL,
          runtime_stop_error=NULL
        WHERE id=(
        SELECT bi.id FROM bot_instances bi JOIN mt5_accounts a ON a.id=bi.mt5_account_id
        JOIN users u ON u.id=a.user_id JOIN mt5_credentials c ON c.mt5_account_id=a.id
        JOIN bot_instance_secrets secret ON secret.bot_instance_id=bi.id
        LEFT JOIN license_slots ls ON ls.id=bi.slot_id LEFT JOIN subscriptions sub ON sub.id=ls.subscription_id
        WHERE bi.mode='CLOUD' AND bi.runner_id IS NULL AND COALESCE(bi.runtime_stop_state,'NONE')='NONE' AND u.status='ACTIVE'
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
    const rows = await this.db.query(
      "SELECT id FROM bot_instances WHERE runner_id=$1 AND mode='CLOUD' AND COALESCE(runtime_stop_state,'NONE')='NONE' ORDER BY created_at",
      [body.runnerId]
    );
    const jobs = [];
    for (const row of rows.rows) jobs.push(await this.job(row.id));
    return { jobs: jobs.filter(Boolean) };
  }

  private async job(instanceId: string) {
    const job = await this.db.one(
      `SELECT
         bi.id instance_id,bi.desired_state,bi.execution_generation,bi.runtime_stop_state,
         bi.cloud_recovery_state,bi.cloud_recovery_attempts,bi.cloud_recovery_next_at,
         (bi.last_seen_at>now()-interval '30 seconds') ea_online,
         a.id mt5_account_id,a.account_number,a.broker,a.broker_server,a.mode,
         c.ciphertext credential_ciphertext,c.iv credential_iv,c.auth_tag credential_tag,
         s.ciphertext token_ciphertext,s.iv token_iv,s.auth_tag token_tag,bs.settings
       FROM bot_instances bi
       JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       JOIN mt5_credentials c ON c.mt5_account_id=a.id
       JOIN bot_instance_secrets s ON s.bot_instance_id=bi.id
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       WHERE bi.id=$1 AND COALESCE(bi.runtime_stop_state,'NONE')='NONE'`,
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
      executionGeneration: Number(job.execution_generation || 1),
      runtimeStopState: job.runtime_stop_state || "NONE",
      recoveryState: job.cloud_recovery_state || "IDLE",
      recoveryAttempts: Number(job.cloud_recovery_attempts || 0),
      recoveryNextAt: job.cloud_recovery_next_at || null,
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

  @Post("recovery-check")
  async recoveryCheck(@Body() body: { runnerId: string; instanceId: string; executionGeneration: number }) {
    if (!/^[0-9a-f-]{36}$/i.test(body.instanceId || "")) throw new BadRequestException("Invalid instance ID");
    if (!Number.isInteger(body.executionGeneration) || body.executionGeneration < 1) throw new BadRequestException("Invalid execution generation");
    return this.hardening.recoveryCheck(body.runnerId, body.instanceId, body.executionGeneration);
  }

  @Post("recovery-result")
  async recoveryResult(@Body() body: {
    runnerId: string;
    instanceId: string;
    executionGeneration: number;
    result: "STARTED" | "FAILED";
    errorCode?: string;
  }) {
    if (!/^[0-9a-f-]{36}$/i.test(body.instanceId || "")) throw new BadRequestException("Invalid instance ID");
    if (!Number.isInteger(body.executionGeneration) || body.executionGeneration < 1) throw new BadRequestException("Invalid execution generation");
    if (!["STARTED","FAILED"].includes(body.result)) throw new BadRequestException("Invalid recovery result");
    return this.hardening.recoveryResult(
      body.runnerId,
      body.instanceId,
      body.executionGeneration,
      body.result,
      body.errorCode
    );
  }

  @Post("commands")
  async commands(@Body() body: { runnerId: string }) {
    const command = await this.db.transaction(async tx => {
      // Paid Cloud access ends at the subscription timestamp. The Worker must
      // close that MT5 runtime even when the EA still has open orders. This is
      // an access cutoff, not Safe Stop: no trading drain is attempted.
      const expiredRuntimes = (await tx.query(
        `SELECT bi.id,bi.runner_id,bi.execution_generation,bi.runtime_stop_state,
                ls.id slot_id,ls.assigned_user_id,sub.id subscription_id,sub.expires_at
         FROM bot_instances bi
         JOIN license_slots ls ON ls.id=bi.slot_id
         JOIN subscriptions sub ON sub.id=ls.subscription_id
         JOIN users u ON u.id=ls.assigned_user_id
         WHERE bi.runner_id=$1
           AND bi.mode='CLOUD'
           AND ls.mode='CLOUD'
           AND ls.status<>'DELETED'
           AND u.role NOT IN ('OWNER','ADMIN')
           AND sub.expires_at<=now()
           AND COALESCE(bi.runtime_stop_state,'NONE') NOT IN ('STOP_REQUESTED','STOP_CONFIRMED','LEASE_REVOKED')
           AND NOT EXISTS (
             SELECT 1
             FROM access_group_grants gg
             JOIN access_groups ag ON ag.id=gg.access_group_id
             WHERE gg.user_id=ls.assigned_user_id
               AND gg.mode='CLOUD'
               AND gg.status='ACTIVE'
               AND gg.starts_at<=now()
               AND gg.expires_at>now()
               AND ag.enabled=true
           )
         FOR UPDATE OF bi`,
        [body.runnerId]
      )).rows;

      for (const expired of expiredRuntimes) {
        const activeStop = (await tx.query(
          `SELECT id
           FROM worker_commands
           WHERE bot_instance_id=$1
             AND execution_generation=$2
             AND command='STOP_INSTANCE'
             AND status IN ('PENDING','DELIVERED')
           LIMIT 1
           FOR UPDATE`,
          [expired.id, Number(expired.execution_generation || 1)]
        )).rows[0];

        if (!activeStop) {
          await tx.query(
            `INSERT INTO worker_commands(
               runner_id,bot_instance_id,execution_generation,command,status
             ) VALUES($1,$2,$3,'STOP_INSTANCE','PENDING')`,
            [expired.runner_id, expired.id, Number(expired.execution_generation || 1)]
          );
        }

        await tx.query(
          `UPDATE bot_instances SET
             desired_state='STOPPED',
             runtime_stop_state='STOP_REQUESTED',
             runtime_stop_requested_at=now(),
             runtime_stop_confirmed_at=NULL,
             runtime_stop_error=NULL,
             metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
               'membershipCutoff',true,
               'membershipCutoffAt',now()::text,
               'membershipExpiredAt',$2::text
             )
           WHERE id=$1`,
          [expired.id, expired.expires_at]
        );
        await tx.query(
          `UPDATE bot_commands
           SET status='ACKED',acked_at=COALESCE(acked_at,now())
           WHERE bot_instance_id=$1
             AND status IN ('PENDING','DELIVERED')`,
          [expired.id]
        );
        await tx.query(
          `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
           VALUES('SYSTEM','CLOUD_MEMBERSHIP_EXPIRED_RUNTIME_STOP','bot_instance',$1,$2::jsonb)`,
          [
            expired.id,
            JSON.stringify({
              slotId: expired.slot_id,
              subscriptionId: expired.subscription_id,
              expiresAt: expired.expires_at,
              runnerId: expired.runner_id,
              executionGeneration: Number(expired.execution_generation || 1),
              policy: "HARD_MT5_CUTOFF"
            })
          ]
        );
      }

      await tx.query(
        `UPDATE worker_commands wc
         SET status='CANCELLED',result_code='STALE_GENERATION',acked_at=now()
         FROM bot_instances bi
         WHERE wc.bot_instance_id=bi.id
           AND wc.runner_id=$1
           AND wc.status IN ('PENDING','DELIVERED')
           AND wc.execution_generation<>bi.execution_generation`,
        [body.runnerId]
      );

      // Web-selected Symbol is authoritative for Cloud runtimes. Once the
      // account is flat, enqueue exactly one reload so the Worker rebuilds a
      // clean single-chart startup from the latest bot_settings.
      await tx.query(
        `INSERT INTO worker_commands(
           runner_id,bot_instance_id,execution_generation,command,status
         )
         SELECT bi.runner_id,bi.id,bi.execution_generation,'RELOAD_INSTANCE','PENDING'
         FROM bot_instances bi
         JOIN bot_settings bs ON bs.bot_instance_id=bi.id
         WHERE bi.runner_id=$1
           AND bi.mode='CLOUD'
           AND COALESCE(bi.runtime_stop_state,'NONE')='NONE'
           AND COALESCE(bs.settings->>'startupSymbol','')<>''
           AND COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)=0
           AND COALESCE(bi.metrics->>'symbolChangeStatus','') IN ('QUEUED','WAITING_FLAT')
           AND (
             COALESCE(bi.metrics->>'symbol','')='' OR
             upper(bi.metrics->>'symbol')<>upper(bs.settings->>'startupSymbol')
           )
           AND NOT EXISTS (
             SELECT 1 FROM worker_commands active
             WHERE active.bot_instance_id=bi.id
               AND active.command='RELOAD_INSTANCE'
               AND active.status IN ('PENDING','DELIVERED')
           )`,
        [body.runnerId]
      );

      const row = (await tx.query(
        `SELECT wc.id,wc.bot_instance_id,wc.execution_generation,wc.command
         FROM worker_commands wc
         JOIN bot_instances bi ON bi.id=wc.bot_instance_id
         WHERE wc.runner_id=$1
           AND wc.execution_generation=bi.execution_generation
           AND (wc.status='PENDING' OR (wc.status='DELIVERED' AND wc.delivered_at<now()-interval '15 seconds'))
         ORDER BY wc.id
         LIMIT 1
         FOR UPDATE OF wc SKIP LOCKED`,
        [body.runnerId]
      )).rows[0];
      if (!row) return null;

      await tx.query(
        "UPDATE worker_commands SET status='DELIVERED',delivered_at=now() WHERE id=$1",
        [row.id]
      );
      return row;
    });

    if (!command) return { command: null };
    const reloadJob =
      command.command === "RELOAD_INSTANCE"
        ? await this.job(command.bot_instance_id)
        : null;
    return {
      command: {
        id: Number(command.id),
        instanceId: command.bot_instance_id,
        executionGeneration: Number(command.execution_generation),
        name: command.command,
        job: reloadJob
      }
    };
  }

  @Post("command-result")
  async commandResult(@Body() body: {
    runnerId: string;
    commandId: number;
    instanceId: string;
    executionGeneration: number;
    result: "STOP_CONFIRMED" | "STOP_FAILED" | "RELOAD_CONFIRMED" | "RELOAD_FAILED";
    errorCode?: string;
  }) {
    if (!Number.isInteger(body.commandId) || body.commandId < 1) throw new BadRequestException("Invalid command ID");
    if (!/^[0-9a-f-]{36}$/i.test(body.instanceId || "")) throw new BadRequestException("Invalid instance ID");
    if (!Number.isInteger(body.executionGeneration) || body.executionGeneration < 1) throw new BadRequestException("Invalid execution generation");
    if (!["STOP_CONFIRMED","STOP_FAILED","RELOAD_CONFIRMED","RELOAD_FAILED"].includes(body.result)) throw new BadRequestException("Invalid command result");
    const errorCode = String(body.errorCode || "").replace(/[^A-Z0-9_]/g, "").slice(0,64) || null;

    return this.db.transaction(async tx => {
      const command = (await tx.query(
        `SELECT * FROM worker_commands WHERE id=$1 FOR UPDATE`,
        [body.commandId]
      )).rows[0];
      if (!command || command.runner_id !== body.runnerId || command.bot_instance_id !== body.instanceId) {
        throw new BadRequestException("Worker command does not match this runtime");
      }
      if (!["STOP_INSTANCE","RELOAD_INSTANCE"].includes(command.command)) throw new BadRequestException("Unsupported worker command");
      const isReload = command.command === "RELOAD_INSTANCE";
      if (isReload !== body.result.startsWith("RELOAD_")) {
        throw new BadRequestException("Worker command result type mismatch");
      }
      if (Number(command.execution_generation) !== body.executionGeneration) {
        throw new BadRequestException("Worker command generation mismatch");
      }

      const instance = (await tx.query(
        "SELECT id,runner_id,execution_generation FROM bot_instances WHERE id=$1 FOR UPDATE",
        [body.instanceId]
      )).rows[0];
      if (!instance || instance.runner_id !== body.runnerId) {
        throw new BadRequestException("Cloud runtime ownership changed");
      }
      if (Number(instance.execution_generation) !== body.executionGeneration) {
        await tx.query(
          "UPDATE worker_commands SET status='CANCELLED',result_code='STALE_GENERATION',acked_at=now() WHERE id=$1",
          [command.id]
        );
        return { ok:true, stale:true };
      }

      if (body.result === "STOP_CONFIRMED") {
        await tx.query(
          "UPDATE worker_commands SET status='ACKED',result_code='STOP_CONFIRMED',acked_at=now() WHERE id=$1",
          [command.id]
        );
        await tx.query(
          `UPDATE bot_instances SET
             runtime_stop_state='STOP_CONFIRMED',
             runtime_stop_confirmed_at=now(),
             runtime_stop_error=NULL,
             desired_state='STOPPED',
             actual_state='OFFLINE',
             last_seen_at=NULL
           WHERE id=$1`,
          [instance.id]
        );
      } else if (body.result === "RELOAD_CONFIRMED") {
        await tx.query(
          "UPDATE worker_commands SET status='ACKED',result_code='RELOAD_CONFIRMED',acked_at=now() WHERE id=$1",
          [command.id]
        );
        await tx.query(
          `UPDATE bot_instances SET
             cloud_recovery_state='IDLE',
             cloud_recovery_attempts=0,
             cloud_recovery_last_error=NULL,
             cloud_recovery_next_at=NULL,
             metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
               'symbolChangeStatus','RELOADED',
               'manualMt5ActionStatus','ACKED'
             )
           WHERE id=$1`,
          [instance.id]
        );
      } else if (body.result === "RELOAD_FAILED") {
        await tx.query(
          "UPDATE worker_commands SET status='FAILED',result_code=$2,acked_at=now() WHERE id=$1",
          [command.id,errorCode || "RELOAD_FAILED"]
        );
        await tx.query(
          `UPDATE bot_instances SET
             metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
               'symbolChangeStatus','FAILED',
               'manualMt5ActionStatus','FAILED',
               'manualMt5ActionMessage',$2::text
             )
           WHERE id=$1`,
          [instance.id,errorCode || "RELOAD_FAILED"]
        );
      } else {
        await tx.query(
          "UPDATE worker_commands SET status='FAILED',result_code=$2,acked_at=now() WHERE id=$1",
          [command.id,errorCode || "STOP_FAILED"]
        );
        await tx.query(
          `UPDATE bot_instances SET runtime_stop_state='STOP_FAILED',runtime_stop_error=$2 WHERE id=$1`,
          [instance.id,errorCode || "STOP_FAILED"]
        );
      }

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,$2,'bot_instance',$3,$4::jsonb)`,
        [
          "WORKER:" + body.runnerId,
          body.result === "STOP_CONFIRMED"
            ? "CLOUD_RUNTIME_STOP_CONFIRMED"
            : body.result === "RELOAD_CONFIRMED"
              ? "CLOUD_RUNTIME_RELOAD_CONFIRMED"
              : body.result === "RELOAD_FAILED"
                ? "CLOUD_RUNTIME_RELOAD_FAILED"
                : "CLOUD_RUNTIME_STOP_FAILED",
          instance.id,
          JSON.stringify({ commandId: Number(command.id), executionGeneration: body.executionGeneration, errorCode: errorCode || null })
        ]
      );
      return { ok:true, state:body.result };
    });
  }

  @Post("release")
  async release(@Body() _body: { runnerId: string; instanceId: string }) {
    throw new BadRequestException("Automatic release is disabled; verified stop and controlled migration are required");
  }

  @Post("provision-result")
  async provisionResult(@Body() body: { runnerId: string; instanceId: string; errorCode: string }) {
    if (!/^[0-9a-f-]{36}$/i.test(body.instanceId) || !["","CHECK_TEMPLATE_OR_TERMINAL"].includes(body.errorCode)) {
      throw new BadRequestException("Invalid result");
    }
    await this.db.query(
      "UPDATE bot_instances SET provisioning_error=$3 WHERE id=$1 AND runner_id=$2",
      [body.instanceId,body.runnerId,body.errorCode||null]
    );
    return { ok:true };
  }
}
