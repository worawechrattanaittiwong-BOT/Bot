import { ConflictException, Injectable, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { DbService } from "./db.service";

const WORKER_FRESH_MS = 30_000;
const EA_FRESH_MS = 60_000;
const RECOVERY_WINDOW_MS = 10 * 60_000;
const RECOVERY_COOLDOWN_MS = 15 * 60_000;
const RECOVERY_MIN_INTERVAL_MS = 60_000;
const RECOVERY_MAX_ATTEMPTS = 3;

@Injectable()
export class ProductionHardeningService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private reconciling = false;

  constructor(private readonly db: DbService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => { void this.reconcile(); }, 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private fresh(value: unknown, maxAgeMs: number) {
    if (!value) return false;
    const time = new Date(String(value)).getTime();
    const age = Date.now() - time;
    return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
  }

  evaluateTelemetry(telemetry: any) {
    const cpu = Number(telemetry?.cpuPercent);
    const ramUsed = Number(telemetry?.ramUsedGb);
    const ramTotal = Number(telemetry?.ramTotalGb);
    const diskFree = Number(telemetry?.diskFreeGb);
    const templateReady = telemetry?.templateReady === true;
    const ramPercent = Number.isFinite(ramUsed) && Number.isFinite(ramTotal) && ramTotal > 0
      ? (ramUsed / ramTotal) * 100
      : null;

    let reason: string | null = null;
    if (!templateReady) reason = "TEMPLATE_NOT_READY";
    else if (Number.isFinite(diskFree) && diskFree < 5) reason = "DISK_LOW";
    else if (Number.isFinite(cpu) && cpu >= 90) reason = "CPU_HIGH";
    else if (ramPercent != null && ramPercent >= 90) reason = "RAM_HIGH";

    return {
      healthState: reason ? "DEGRADED" : "HEALTHY",
      capacityBlocked: Boolean(reason),
      reason,
      ramPercent
    };
  }

  private async touchIncident(input: {
    key: string;
    category: string;
    severity: "INFO" | "WARN" | "CRITICAL";
    runnerId?: string | null;
    instanceId?: string | null;
    detail?: Record<string, unknown>;
  }) {
    await this.db.query(
      `INSERT INTO runtime_incidents(incident_key,category,severity,runner_id,bot_instance_id,detail)
       VALUES($1,$2,$3,$4,$5,$6::jsonb)
       ON CONFLICT (incident_key) WHERE state='OPEN'
       DO UPDATE SET severity=EXCLUDED.severity,detail=EXCLUDED.detail,last_seen_at=now()`,
      [
        input.key,
        input.category,
        input.severity,
        input.runnerId || null,
        input.instanceId || null,
        JSON.stringify(input.detail || {})
      ]
    );
  }

  private async resolveIncident(key: string) {
    await this.db.query(
      `UPDATE runtime_incidents
       SET state='RESOLVED',resolved_at=now(),last_seen_at=now()
       WHERE incident_key=$1 AND state='OPEN'`,
      [key]
    );
  }

  async recordWorkerHeartbeat(runnerId: string, telemetry: any) {
    const evaluated = this.evaluateTelemetry(telemetry);
    const previous = await this.db.one(
      `SELECT health_state,capacity_blocked,capacity_block_reason,quarantined
       FROM worker_nodes WHERE runner_id=$1`,
      [runnerId]
    );
    await this.db.query(
      `UPDATE worker_nodes SET
         health_state=$2,
         capacity_blocked=$3,
         capacity_block_reason=$4,
         last_healthy_at=CASE WHEN $2='HEALTHY' THEN now() ELSE last_healthy_at END
       WHERE runner_id=$1`,
      [runnerId, evaluated.healthState, evaluated.capacityBlocked, evaluated.reason]
    );

    const incidentKey = `worker:${runnerId}:capacity`;
    if (evaluated.capacityBlocked) {
      await this.touchIncident({
        key: incidentKey,
        category: "WORKER_CAPACITY",
        severity: evaluated.reason === "DISK_LOW" ? "CRITICAL" : "WARN",
        runnerId,
        detail: {
          reason: evaluated.reason,
          cpuPercent: Number.isFinite(Number(telemetry?.cpuPercent)) ? Number(telemetry.cpuPercent) : null,
          ramPercent: evaluated.ramPercent == null ? null : Math.round(evaluated.ramPercent * 10) / 10,
          diskFreeGb: Number.isFinite(Number(telemetry?.diskFreeGb)) ? Number(telemetry.diskFreeGb) : null
        }
      });
    } else {
      await this.resolveIncident(incidentKey);
    }
    await this.resolveIncident(`worker:${runnerId}:offline`);

    const changed = previous && (
      previous.health_state !== evaluated.healthState ||
      Boolean(previous.capacity_blocked) !== evaluated.capacityBlocked ||
      String(previous.capacity_block_reason || "") !== String(evaluated.reason || "")
    );
    if (changed) {
      await this.db.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'WORKER_HEALTH_TRANSITION','worker_node',$2,$3::jsonb)`,
        [
          `WORKER:${runnerId}`,
          runnerId,
          JSON.stringify({
            from: previous?.health_state || "UNKNOWN",
            to: evaluated.healthState,
            capacityBlocked: evaluated.capacityBlocked,
            reason: evaluated.reason
          })
        ]
      );
    }
    return evaluated;
  }

  async recoveryCheck(runnerId: string, instanceId: string, executionGeneration: number) {
    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740095)");
      const controls = (await tx.query("SELECT * FROM production_controls WHERE id=1 FOR UPDATE")).rows[0];
      const node = (await tx.query(
        `SELECT * FROM worker_nodes WHERE runner_id=$1 FOR UPDATE`,
        [runnerId]
      )).rows[0];
      const instance = (await tx.query(
        `SELECT * FROM bot_instances WHERE id=$1 FOR UPDATE`,
        [instanceId]
      )).rows[0];

      if (!node || !instance || instance.mode !== "CLOUD" || instance.runner_id !== runnerId) {
        return { allow: false, reason: "OWNERSHIP_MISMATCH" };
      }
      if (Number(instance.execution_generation || 1) !== Number(executionGeneration)) {
        return { allow: false, reason: "STALE_GENERATION" };
      }
      if (!this.fresh(node.last_seen_at, WORKER_FRESH_MS)) return { allow: false, reason: "WORKER_OFFLINE" };
      if (controls?.cloud_recovery_paused) return { allow: false, reason: "GLOBAL_RECOVERY_PAUSED" };
      if (node.quarantined) return { allow: false, reason: "NODE_QUARANTINED" };
      if (node.recovery_paused) return { allow: false, reason: "NODE_RECOVERY_PAUSED" };
      if (node.capacity_blocked) return { allow: false, reason: String(node.capacity_block_reason || "NODE_DEGRADED") };
      if (String(instance.runtime_stop_state || "NONE") !== "NONE") return { allow: false, reason: "RUNTIME_STOP_ACTIVE" };

      const migration = (await tx.query(
        `SELECT id FROM runtime_migrations
         WHERE bot_instance_id=$1 AND state NOT IN ('COMPLETED','FAILED','CANCELLED')
         LIMIT 1`,
        [instanceId]
      )).rows[0];
      if (migration) return { allow: false, reason: "MIGRATION_ACTIVE" };

      const now = Date.now();
      const windowStart = instance.cloud_recovery_window_started_at
        ? new Date(instance.cloud_recovery_window_started_at).getTime()
        : 0;
      let attempts = Number(instance.cloud_recovery_attempts || 0);
      let nextAt = instance.cloud_recovery_next_at
        ? new Date(instance.cloud_recovery_next_at).getTime()
        : 0;
      let nextWindowStart = windowStart;

      if (!windowStart || now - windowStart > RECOVERY_WINDOW_MS) {
        attempts = 0;
        nextWindowStart = now;
        nextAt = 0;
      }
      if (nextAt > now) return { allow: false, reason: "RECOVERY_BACKOFF", retryAt: new Date(nextAt).toISOString() };

      if (attempts >= RECOVERY_MAX_ATTEMPTS) {
        const cooldownUntil = Math.max(nextAt, now + RECOVERY_COOLDOWN_MS);
        await tx.query(
          `UPDATE bot_instances SET
             cloud_recovery_state='CIRCUIT_OPEN',
             cloud_recovery_next_at=to_timestamp($2/1000.0),
             cloud_recovery_last_error='RECOVERY_BUDGET_EXHAUSTED'
           WHERE id=$1`,
          [instanceId, cooldownUntil]
        );
        return { allow: false, reason: "RECOVERY_CIRCUIT_OPEN", retryAt: new Date(cooldownUntil).toISOString() };
      }

      attempts += 1;
      const retryAt = now + RECOVERY_MIN_INTERVAL_MS;
      await tx.query(
        `UPDATE bot_instances SET
           cloud_recovery_state='AUTHORIZED',
           cloud_recovery_attempts=$2,
           cloud_recovery_window_started_at=to_timestamp($3/1000.0),
           cloud_recovery_next_at=to_timestamp($4/1000.0),
           cloud_recovery_last_at=now(),
           cloud_recovery_last_error=NULL
         WHERE id=$1`,
        [instanceId, attempts, nextWindowStart, retryAt]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'CLOUD_RECOVERY_AUTHORIZED','bot_instance',$2,$3::jsonb)`,
        [
          `WORKER:${runnerId}`,
          instanceId,
          JSON.stringify({ executionGeneration, attempt: attempts, maxAttempts: RECOVERY_MAX_ATTEMPTS })
        ]
      );
      return { allow: true, attempt: attempts, maxAttempts: RECOVERY_MAX_ATTEMPTS, retryAt: new Date(retryAt).toISOString() };
    });
  }

  async recoveryResult(
    runnerId: string,
    instanceId: string,
    executionGeneration: number,
    result: "STARTED" | "FAILED",
    errorCode?: string
  ) {
    const safeError = String(errorCode || "RECOVERY_START_FAILED").replace(/[^A-Z0-9_]/g, "").slice(0, 64);
    return this.db.transaction(async tx => {
      const instance = (await tx.query(
        `SELECT id,mode,runner_id,execution_generation,cloud_recovery_attempts
         FROM bot_instances WHERE id=$1 FOR UPDATE`,
        [instanceId]
      )).rows[0];
      if (!instance || instance.mode !== "CLOUD" || instance.runner_id !== runnerId) {
        throw new ConflictException("Cloud recovery ownership changed");
      }
      if (Number(instance.execution_generation || 1) !== Number(executionGeneration)) {
        throw new ConflictException("Cloud recovery generation changed");
      }

      if (result === "STARTED") {
        await tx.query(
          `UPDATE bot_instances SET cloud_recovery_state='STARTED',cloud_recovery_last_error=NULL WHERE id=$1`,
          [instanceId]
        );
      } else {
        await tx.query(
          `UPDATE bot_instances SET cloud_recovery_state='FAILED',cloud_recovery_last_error=$2 WHERE id=$1`,
          [instanceId, safeError]
        );
      }
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,$2,'bot_instance',$3,$4::jsonb)`,
        [
          `WORKER:${runnerId}`,
          result === "STARTED" ? "CLOUD_RECOVERY_PROCESS_STARTED" : "CLOUD_RECOVERY_PROCESS_FAILED",
          instanceId,
          JSON.stringify({ executionGeneration, errorCode: result === "FAILED" ? safeError : null })
        ]
      );
      return { ok: true };
    });
  }

  async reconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const nodes = await this.db.query(
        `SELECT runner_id,last_seen_at,health_state FROM worker_nodes`
      );
      for (const node of nodes.rows) {
        const key = `worker:${node.runner_id}:offline`;
        if (!this.fresh(node.last_seen_at, WORKER_FRESH_MS)) {
          await this.db.query(
            `UPDATE worker_nodes SET health_state='OFFLINE',capacity_blocked=true,capacity_block_reason='WORKER_OFFLINE'
             WHERE runner_id=$1 AND (health_state<>'OFFLINE' OR capacity_block_reason IS DISTINCT FROM 'WORKER_OFFLINE')`,
            [node.runner_id]
          );
          await this.touchIncident({
            key,
            category: "WORKER_OFFLINE",
            severity: "CRITICAL",
            runnerId: node.runner_id,
            detail: { lastSeenAt: node.last_seen_at || null }
          });
        } else {
          await this.resolveIncident(key);
        }
      }

      const instances = await this.db.query(
        `SELECT bi.id,bi.runner_id,bi.last_seen_at,bi.cloud_recovery_state,bi.cloud_recovery_last_at,
                COALESCE(bi.runtime_stop_state,'NONE') runtime_stop_state,
                EXISTS(
                  SELECT 1 FROM runtime_migrations rm
                  WHERE rm.bot_instance_id=bi.id AND rm.state NOT IN ('COMPLETED','FAILED','CANCELLED')
                ) migration_active
         FROM bot_instances bi
         WHERE bi.mode='CLOUD' AND bi.runner_id IS NOT NULL`
      );
      for (const instance of instances.rows) {
        const key = `instance:${instance.id}:ea-stale`;
        const excluded = instance.runtime_stop_state !== "NONE" || instance.migration_active;
        if (!excluded && !this.fresh(instance.last_seen_at, EA_FRESH_MS)) {
          await this.touchIncident({
            key,
            category: "EA_HEARTBEAT_STALE",
            severity: "WARN",
            runnerId: instance.runner_id,
            instanceId: instance.id,
            detail: {
              lastSeenAt: instance.last_seen_at || null,
              recoveryState: instance.cloud_recovery_state || "IDLE"
            }
          });
        } else {
          await this.resolveIncident(key);
        }

        if (this.fresh(instance.last_seen_at, WORKER_FRESH_MS) &&
            ["AUTHORIZED", "STARTED", "FAILED", "CIRCUIT_OPEN"].includes(String(instance.cloud_recovery_state))) {
          await this.db.query(
            `UPDATE bot_instances SET
               cloud_recovery_state='IDLE',cloud_recovery_attempts=0,
               cloud_recovery_window_started_at=NULL,cloud_recovery_next_at=NULL,
               cloud_recovery_last_error=NULL
             WHERE id=$1`,
            [instance.id]
          );
          await this.resolveIncident(`instance:${instance.id}:recovery-circuit`);
        }
      }

      const circuits = await this.db.query(
        `SELECT id,runner_id,cloud_recovery_attempts,cloud_recovery_next_at
         FROM bot_instances WHERE mode='CLOUD' AND cloud_recovery_state='CIRCUIT_OPEN'`
      );
      for (const instance of circuits.rows) {
        await this.touchIncident({
          key: `instance:${instance.id}:recovery-circuit`,
          category: "RECOVERY_CIRCUIT_OPEN",
          severity: "CRITICAL",
          runnerId: instance.runner_id,
          instanceId: instance.id,
          detail: { attempts: Number(instance.cloud_recovery_attempts || 0), retryAt: instance.cloud_recovery_next_at || null }
        });
      }
    } catch {
      // Monitoring is fail-safe and retries on the next tick. Never change runtime ownership here.
    } finally {
      this.reconciling = false;
    }
  }

  async snapshot() {
    await this.reconcile();
    const [controls, nodes, incidents, recoveries] = await Promise.all([
      this.db.one("SELECT * FROM production_controls WHERE id=1"),
      this.db.query(`SELECT w.*,l.occupied FROM worker_nodes w JOIN cloud_node_load l USING(runner_id) ORDER BY w.runner_id`),
      this.db.query(`SELECT * FROM runtime_incidents ORDER BY (state='OPEN') DESC,severity DESC,last_seen_at DESC LIMIT 200`),
      this.db.query(`SELECT bi.id,bi.runner_id,bi.cloud_recovery_state,bi.cloud_recovery_attempts,
        bi.cloud_recovery_next_at,bi.cloud_recovery_last_at,bi.cloud_recovery_last_error,bi.last_seen_at,
        a.account_number,u.user_code
        FROM bot_instances bi LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
        LEFT JOIN users u ON u.id=a.user_id
        WHERE bi.mode='CLOUD' ORDER BY bi.cloud_recovery_last_at DESC NULLS LAST,bi.created_at DESC LIMIT 200`)
    ]);
    return { controls, nodes: nodes.rows, incidents: incidents.rows, recoveries: recoveries.rows };
  }

  async updateControls(actor: string, input: { cloudProvisioningPaused: boolean; cloudRecoveryPaused: boolean; reason?: string }) {
    if (typeof input.cloudProvisioningPaused !== "boolean" || typeof input.cloudRecoveryPaused !== "boolean") {
      throw new ConflictException("Invalid production control settings");
    }
    const reason = String(input.reason || "").slice(0, 240) || null;
    await this.db.query(
      `UPDATE production_controls SET
         cloud_provisioning_paused=$1,cloud_recovery_paused=$2,reason=$3,updated_by=$4,updated_at=now()
       WHERE id=1`,
      [input.cloudProvisioningPaused, input.cloudRecoveryPaused, reason, actor.slice(0, 120)]
    );
    await this.db.query(
      `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
       VALUES($1,'PRODUCTION_CONTROLS_UPDATED','production_controls','1',$2::jsonb)`,
      [actor.slice(0, 160), JSON.stringify({ ...input, reason })]
    );
    return this.snapshot();
  }

  async quarantineNode(actor: string, runnerId: string, quarantined: boolean, reason?: string) {
    const cleanReason = String(reason || "").slice(0, 160) || null;
    const result = await this.db.query(
      `UPDATE worker_nodes SET
         quarantined=$2,
         quarantine_reason=CASE WHEN $2 THEN $3 ELSE NULL END,
         recovery_paused=$2,
         accepting_jobs=CASE WHEN $2 THEN false ELSE accepting_jobs END
       WHERE runner_id=$1 RETURNING runner_id`,
      [runnerId, quarantined, cleanReason]
    );
    if (!result.rowCount) throw new ConflictException("Cloud Worker not found");
    await this.db.query(
      `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
       VALUES($1,$2,'worker_node',$3,$4::jsonb)`,
      [
        actor.slice(0, 160),
        quarantined ? "WORKER_QUARANTINED" : "WORKER_QUARANTINE_CLEARED",
        runnerId,
        JSON.stringify({ reason: cleanReason })
      ]
    );
    return { ok: true };
  }

  async resetRecovery(actor: string, instanceId: string) {
    return this.db.transaction(async tx => {
      const instance = (await tx.query(
        `SELECT * FROM bot_instances WHERE id=$1 FOR UPDATE`,
        [instanceId]
      )).rows[0];
      if (!instance || instance.mode !== "CLOUD") throw new ConflictException("Cloud runtime not found");
      if (String(instance.runtime_stop_state || "NONE") !== "NONE") throw new ConflictException("Runtime stop is active");
      const migration = (await tx.query(
        `SELECT id FROM runtime_migrations WHERE bot_instance_id=$1 AND state NOT IN ('COMPLETED','FAILED','CANCELLED') LIMIT 1`,
        [instanceId]
      )).rows[0];
      if (migration) throw new ConflictException("Runtime migration is active");
      await tx.query(
        `UPDATE bot_instances SET
           cloud_recovery_state='IDLE',cloud_recovery_attempts=0,
           cloud_recovery_window_started_at=NULL,cloud_recovery_next_at=NULL,
           cloud_recovery_last_error=NULL
         WHERE id=$1`,
        [instanceId]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'CLOUD_RECOVERY_CIRCUIT_RESET','bot_instance',$2,'{}'::jsonb)`,
        [actor.slice(0, 160), instanceId]
      );
      return { ok: true };
    });
  }
}
