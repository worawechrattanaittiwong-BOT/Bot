import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { CryptoService } from "./security";

const TERMINAL_STATES = ["COMPLETED", "FAILED", "CANCELLED"];
const LOCAL_MIGRATION_AGENT_MIN_VERSION = "1.0.9";

@Injectable()
export class RuntimeMigrationService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private versionAtLeast(current: unknown, required: string) {
    const parse = (value: unknown) => {
      const raw = String(value || "").trim().replace(/^v/i, "");
      if (!/^\d+(?:\.\d+){0,3}$/.test(raw)) return null;
      const parts = raw.split(".").map(Number);
      while (parts.length < 4) parts.push(0);
      return parts;
    };
    const a = parse(current);
    const b = parse(required);
    if (!a || !b) return false;
    for (let i = 0; i < 4; i++) {
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return true;
  }

  private workerSupportsVerifiedStop(version: unknown) {
    return this.versionAtLeast(version, "1.1.0");
  }

  private fresh(value: unknown, maxAgeMs: number) {
    if (!value) return false;
    const time = new Date(String(value)).getTime();
    return Number.isFinite(time) && Date.now() - time >= 0 && Date.now() - time <= maxAgeMs;
  }

  private async targetAccessTx(tx: any, userId: string, targetSlot: any) {
    const user = (await tx.query(
      "SELECT role,status FROM users WHERE id=$1",
      [userId]
    )).rows[0];
    if (!user || user.status !== "ACTIVE") {
      throw new ForbiddenException("SCENOVA account is not active");
    }
    if (["OWNER", "ADMIN"].includes(String(user.role))) return user;

    const entitled = (await tx.query(
      `SELECT 1
       FROM license_slots ls
       JOIN subscriptions s ON s.id=ls.subscription_id
       JOIN plans p ON p.id=s.plan_id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.status='ACTIVE'
         AND s.status='ACTIVE'
         AND s.starts_at<=now()
         AND s.expires_at>now()
         AND p.mode=$3
       LIMIT 1`,
      [targetSlot.id, userId, targetSlot.mode]
    )).rows[0];
    if (!entitled) {
      throw new ForbiddenException("Target slot does not have an active entitlement for this mode");
    }
    return user;
  }

  private async targetCloudRunnerTx(
    tx: any,
    user: any,
    targetSlot: any,
    requestedRunnerId?: string
  ) {
    let runnerId = "";
    if (["OWNER", "ADMIN"].includes(String(user.role)) && requestedRunnerId) {
      runnerId = String(requestedRunnerId).trim();
    } else {
      const order = (await tx.query(
        `SELECT runner_id
         FROM cloud_orders
         WHERE slot_id=$1 AND user_id=$2 AND status='PAID'
         ORDER BY paid_at DESC NULLS LAST,created_at DESC
         LIMIT 1`,
        [targetSlot.id, targetSlot.assigned_user_id]
      )).rows[0];
      runnerId = String(order?.runner_id || "");
    }
    if (!runnerId) {
      throw new ConflictException("Cloud target does not have a reserved VPS Runner");
    }

    const node = (await tx.query(
      `SELECT w.*,COALESCE(l.occupied,0) occupied
       FROM worker_nodes w
       LEFT JOIN cloud_node_load l USING(runner_id)
       WHERE w.runner_id=$1
       FOR UPDATE OF w`,
      [runnerId]
    )).rows[0];
    if (!node) throw new ConflictException("Cloud Worker not found");
    if (!this.fresh(node.last_seen_at, 30_000)) {
      throw new ConflictException("Cloud Worker is offline");
    }
    if (node.telemetry?.templateReady !== true) {
      throw new ConflictException("Cloud Worker template is not verified");
    }
    const used = Math.max(Number(node.occupied || 0), Number(node.active_instances || 0));
    const paidReservation = (await tx.query(
      "SELECT 1 FROM cloud_orders WHERE slot_id=$1 AND runner_id=$2 AND status='PAID' LIMIT 1",
      [targetSlot.id, runnerId]
    )).rows[0];
    if (!paidReservation && used >= Number(node.capacity || 0)) {
      throw new ConflictException("Cloud Worker has no free capacity");
    }
    return runnerId;
  }

  async overview(userId: string) {
    const slots = (await this.db.query(
      `SELECT
         ls.id,ls.mode,ls.status,ls.label,ls.slot_number,ls.subscription_id,
         bi.id instance_id,bi.mode instance_mode,bi.desired_state,bi.actual_state,
         bi.last_seen_at,bi.agent_last_seen_at,bi.agent_version,bi.device_status,
         bi.runner_id,bi.execution_generation,bi.runtime_stop_state,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         a.account_number,a.broker,a.broker_server
       FROM license_slots ls
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE ls.assigned_user_id=$1
         AND ls.status<>'DELETED'
       ORDER BY ls.mode,ls.slot_number,ls.created_at`,
      [userId]
    )).rows;
    const migrations = (await this.db.query(
      `SELECT rm.*,
         ss.label source_label,ts.label target_label,
         a.account_number,a.broker_server,
         bi.runner_id current_runner_id,bi.last_seen_at,bi.agent_last_seen_at,
         bi.device_status,bi.provisioning_error,bi.runtime_stop_state
       FROM runtime_migrations rm
       JOIN license_slots ss ON ss.id=rm.source_slot_id
       JOIN license_slots ts ON ts.id=rm.target_slot_id
       JOIN bot_instances bi ON bi.id=rm.bot_instance_id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE rm.user_id=$1
       ORDER BY rm.created_at DESC
       LIMIT 20`,
      [userId]
    )).rows;
    return {
      localAgentMinVersion: LOCAL_MIGRATION_AGENT_MIN_VERSION,
      slots,
      migrations
    };
  }

  async request(
    userId: string,
    actor: string,
    input: {
      sourceSlotId: string;
      targetSlotId: string;
      tradingPassword?: string;
      runnerId?: string;
      confirmFlat?: boolean;
      confirmSwitch?: boolean;
    }
  ) {
    if (input.confirmFlat !== true || input.confirmSwitch !== true) {
      throw new BadRequestException("Migration requires explicit flat-position and runtime-switch confirmation");
    }

    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740094)");

      const source = (await tx.query(
        `SELECT ls.*,bi.id instance_id,bi.mt5_account_id,bi.mode instance_mode,
           bi.install_token_hash,bi.execution_generation,bi.desired_state,bi.actual_state,
           bi.last_seen_at,bi.agent_last_seen_at,bi.agent_version,bi.agent_terminal_path,
           bi.device_status,bi.runner_id,bi.runtime_stop_state,bi.provisioning_error,
           COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
           a.account_number,a.broker_server
         FROM license_slots ls
         JOIN bot_instances bi ON bi.slot_id=ls.id
         LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
         WHERE ls.id=$1 AND ls.assigned_user_id=$2 AND ls.status IN ('ACTIVE','AVAILABLE')
         FOR UPDATE OF ls,bi`,
        [input.sourceSlotId, userId]
      )).rows[0];
      if (!source) throw new NotFoundException("Source runtime/slot not found");
      if (!source.mt5_account_id) throw new ConflictException("Source runtime has no MT5 account");
      if (source.mode !== source.instance_mode) {
        throw new ConflictException("Source slot/runtime mode mismatch");
      }

      const target = (await tx.query(
        `SELECT ls.*,bi.id existing_instance_id
         FROM license_slots ls
         LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
         WHERE ls.id=$1 AND ls.assigned_user_id=$2 AND ls.status IN ('ACTIVE','AVAILABLE')
         FOR UPDATE OF ls`,
        [input.targetSlotId, userId]
      )).rows[0];
      if (!target) throw new NotFoundException("Target slot not found");
      if (target.id === source.id || target.mode === source.mode) {
        throw new ConflictException("Target slot must be the opposite runtime mode");
      }
      if (target.existing_instance_id) {
        throw new ConflictException("Target slot already contains a bot runtime");
      }

      const existingMigration = (await tx.query(
        `SELECT id,state FROM runtime_migrations
         WHERE bot_instance_id=$1
           AND state NOT IN ('COMPLETED','FAILED','CANCELLED')
         LIMIT 1
         FOR UPDATE`,
        [source.instance_id]
      )).rows[0];
      if (existingMigration) {
        throw new ConflictException("This bot already has an active runtime migration");
      }
      if (source.desired_state === "RUNNING" || source.actual_state === "RUNNING") {
        throw new ConflictException("Stop the bot before changing runtime mode");
      }
      if (Number(source.positions || 0) > 0) {
        throw new ConflictException("Close all positions before changing runtime mode");
      }
      const unresolvedClose = (await tx.query(
        `SELECT id FROM bot_commands
         WHERE bot_instance_id=$1 AND command='CLOSE_ALL'
           AND status IN ('PENDING','DELIVERED')
         LIMIT 1`,
        [source.instance_id]
      )).rows[0];
      if (unresolvedClose) {
        throw new ConflictException("Wait for Close All confirmation before changing runtime mode");
      }

      const user = await this.targetAccessTx(tx, userId, target);
      let targetRunnerId: string | null = null;
      if (target.mode === "CLOUD") {
        const password = String(input.tradingPassword || "");
        if (!password || password.length > 256 || /[\r\n\x00]/.test(password)) {
          throw new BadRequestException("A valid MT5 Trading Password is required for Cloud migration");
        }
        targetRunnerId = await this.targetCloudRunnerTx(tx, user, target, input.runnerId);
        const credential = this.crypto.encrypt(password);
        await tx.query(
          `INSERT INTO mt5_credentials(mt5_account_id,ciphertext,iv,auth_tag)
           VALUES($1,$2,$3,$4)
           ON CONFLICT(mt5_account_id) DO UPDATE SET
             ciphertext=EXCLUDED.ciphertext,
             iv=EXCLUDED.iv,
             auth_tag=EXCLUDED.auth_tag,
             updated_at=now()`,
          [source.mt5_account_id, credential.ciphertext, credential.iv, credential.authTag]
        );
      }

      let migrationState = source.mode === "LOCAL" ? "STOPPING_LOCAL" : "STOPPING_CLOUD";
      if (source.mode === "LOCAL") {
        if (!this.fresh(source.agent_last_seen_at, 45_000) || source.device_status !== "ACTIVE") {
          throw new ConflictException("Local Agent must be online before moving to Cloud");
        }
        if (!this.versionAtLeast(source.agent_version, LOCAL_MIGRATION_AGENT_MIN_VERSION)) {
          throw new ConflictException(`SCENOVA Windows Agent ${LOCAL_MIGRATION_AGENT_MIN_VERSION}+ is required for verified Local stop`);
        }
        if (!source.agent_terminal_path) {
          throw new ConflictException("Local Agent has not reported its MT5 terminal path");
        }
        if (!this.fresh(source.last_seen_at, 30_000)) {
          throw new ConflictException("EA heartbeat must be fresh before verified Local stop");
        }
      } else {
        if (!source.runner_id) throw new ConflictException("Cloud runtime is not bound to a Worker");
        const node = (await tx.query(
          "SELECT last_seen_at,telemetry FROM worker_nodes WHERE runner_id=$1 FOR UPDATE",
          [source.runner_id]
        )).rows[0];
        if (!node || !this.fresh(node.last_seen_at, 30_000)) {
          throw new ConflictException("Cloud Worker is offline; runtime ownership cannot be released safely");
        }
        if (!this.workerSupportsVerifiedStop(node.telemetry?.version)) {
          throw new ConflictException("Cloud Worker v1.1.0+ is required for verified release");
        }
        if (!["STOP_CONFIRMED", "LEASE_REVOKED"].includes(String(source.runtime_stop_state))) {
          if (!this.fresh(source.last_seen_at, 30_000)) {
            throw new ConflictException("EA heartbeat must be fresh before verified Cloud stop");
          }
        } else {
          migrationState = "SOURCE_STOP_CONFIRMED";
        }
      }

      const migration = (await tx.query(
        `INSERT INTO runtime_migrations(
           user_id,bot_instance_id,source_slot_id,target_slot_id,source_mode,target_mode,
           state,execution_generation,source_runner_id,target_runner_id,source_stop_confirmed_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
           CASE WHEN $7='SOURCE_STOP_CONFIRMED' THEN now() ELSE NULL END)
         RETURNING *`,
        [
          userId,
          source.instance_id,
          source.id,
          target.id,
          source.mode,
          target.mode,
          migrationState,
          Number(source.execution_generation || 1),
          source.runner_id || null,
          targetRunnerId
        ]
      )).rows[0];

      await tx.query(
        `UPDATE bot_instances SET desired_state='STOPPED' WHERE id=$1`,
        [source.instance_id]
      );
      await tx.query(
        `UPDATE bot_commands SET status='ACKED',acked_at=now()
         WHERE bot_instance_id=$1
           AND command IN ('START','SAFE_STOP')
           AND status IN ('PENDING','DELIVERED')`,
        [source.instance_id]
      );

      if (source.mode === "CLOUD" && migrationState === "STOPPING_CLOUD") {
        const activeStop = (await tx.query(
          `SELECT id FROM worker_commands
           WHERE bot_instance_id=$1 AND command='STOP_INSTANCE'
             AND status IN ('PENDING','DELIVERED')
           LIMIT 1 FOR UPDATE`,
          [source.instance_id]
        )).rows[0];
        if (!activeStop) {
          await tx.query(
            `INSERT INTO worker_commands(runner_id,bot_instance_id,execution_generation,command,status)
             VALUES($1,$2,$3,'STOP_INSTANCE','PENDING')`,
            [source.runner_id, source.instance_id, Number(source.execution_generation || 1)]
          );
        }
        await tx.query(
          `UPDATE bot_instances SET
             runtime_stop_state='STOP_REQUESTED',
             runtime_stop_requested_at=now(),
             runtime_stop_confirmed_at=NULL,
             runtime_stop_error=NULL
           WHERE id=$1`,
          [source.instance_id]
        );
      }

      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'REQUEST_RUNTIME_MIGRATION','runtime_migration',$2,$3::jsonb)`,
        [
          actor.slice(0, 160),
          migration.id,
          JSON.stringify({
            instanceId: source.instance_id,
            sourceSlotId: source.id,
            targetSlotId: target.id,
            sourceMode: source.mode,
            targetMode: target.mode,
            executionGeneration: Number(source.execution_generation || 1),
            sourceRunnerId: source.runner_id || null,
            targetRunnerId
          })
        ]
      );

      if (migrationState === "SOURCE_STOP_CONFIRMED") {
        return this.finalizeHandoffTx(tx, migration.id, actor);
      }
      return migration;
    });
  }

  private async finalizeHandoffTx(tx: any, migrationId: string, actor: string) {
    const migration = (await tx.query(
      `SELECT * FROM runtime_migrations WHERE id=$1 FOR UPDATE`,
      [migrationId]
    )).rows[0];
    if (!migration) throw new NotFoundException("Runtime migration not found");
    if (migration.state !== "SOURCE_STOP_CONFIRMED") return migration;

    const instance = (await tx.query(
      `SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions
       FROM bot_instances bi WHERE bi.id=$1 FOR UPDATE`,
      [migration.bot_instance_id]
    )).rows[0];
    if (!instance) throw new NotFoundException("Bot instance not found");
    if (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING" || Number(instance.positions || 0) > 0) {
      throw new ConflictException("Source runtime became unsafe before handoff");
    }
    if (Number(instance.execution_generation || 1) !== Number(migration.execution_generation)) {
      throw new ConflictException("Execution generation changed during migration");
    }

    const target = (await tx.query(
      `SELECT ls.*,bi.id existing_instance_id
       FROM license_slots ls
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.id=$1
       FOR UPDATE OF ls`,
      [migration.target_slot_id]
    )).rows[0];
    if (!target || target.existing_instance_id) {
      throw new ConflictException("Target slot is no longer available");
    }

    const nextGeneration = Number(instance.execution_generation || 1) + 1;
    const nextToken = randomBytes(32).toString("hex");
    const tokenHash = this.crypto.sha256(nextToken);
    const encrypted = this.crypto.encrypt(nextToken);

    await tx.query(
      `UPDATE bot_commands SET status='ACKED',acked_at=now()
       WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')`,
      [instance.id]
    );
    await tx.query(
      `UPDATE worker_commands
       SET status='CANCELLED',result_code=COALESCE(result_code,'MIGRATION_HANDOFF'),acked_at=now()
       WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')`,
      [instance.id]
    );

    if (migration.target_mode === "CLOUD") {
      if (!migration.target_runner_id) {
        throw new ConflictException("Cloud target Runner is missing");
      }
      await tx.query(
        `INSERT INTO bot_instance_secrets(bot_instance_id,ciphertext,iv,auth_tag)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(bot_instance_id) DO UPDATE SET
           ciphertext=EXCLUDED.ciphertext,
           iv=EXCLUDED.iv,
           auth_tag=EXCLUDED.auth_tag,
           updated_at=now()`,
        [instance.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag]
      );
      await tx.query(
        `UPDATE bot_instances SET
           slot_id=$2,mode='CLOUD',install_token_hash=$3,execution_generation=$4,
           lease_rotated_at=now(),desired_state='STOPPED',actual_state='OFFLINE',
           runner_id=$5,lock_owner=$5,last_seen_at=NULL,ea_last_ip=NULL,
           runtime_stop_state='NONE',runtime_stop_requested_at=NULL,
           runtime_stop_confirmed_at=NULL,runtime_stop_error=NULL,
           provisioning_error=NULL,
           agent_last_seen_at=NULL,agent_terminal_path=NULL,agent_ea_hash=NULL,
           device_public_id=NULL,device_secret_hash=NULL,device_status='UNREGISTERED',
           device_hostname=NULL,device_registered_at=NULL,device_last_seen_at=NULL,device_last_ip=NULL
         WHERE id=$1`,
        [instance.id, migration.target_slot_id, tokenHash, nextGeneration, migration.target_runner_id]
      );
      await tx.query("UPDATE mt5_accounts SET mode='CLOUD',status='ACTIVE' WHERE id=$1", [instance.mt5_account_id]);
      await tx.query(
        `UPDATE runtime_migrations SET
           state='TARGET_PROVISIONING',execution_generation=$2,
           lease_rotated_at=now(),updated_at=now(),error_code=NULL,error_detail=NULL
         WHERE id=$1`,
        [migration.id, nextGeneration]
      );
    } else {
      await tx.query("DELETE FROM bot_instance_secrets WHERE bot_instance_id=$1", [instance.id]);
      await tx.query("DELETE FROM mt5_credentials WHERE mt5_account_id=$1", [instance.mt5_account_id]);
      await tx.query(
        `UPDATE bot_instances SET
           slot_id=$2,mode='LOCAL',install_token_hash=$3,execution_generation=$4,
           lease_rotated_at=now(),desired_state='STOPPED',actual_state='OFFLINE',
           runner_id=NULL,lock_owner=NULL,last_seen_at=NULL,ea_last_ip=NULL,
           runtime_stop_state='NONE',runtime_stop_requested_at=NULL,
           runtime_stop_confirmed_at=NULL,runtime_stop_error=NULL,
           provisioning_error=NULL,
           agent_last_seen_at=NULL,agent_terminal_path=NULL,agent_ea_hash=NULL,
           device_public_id=NULL,device_secret_hash=NULL,device_status='UNREGISTERED',
           device_hostname=NULL,device_registered_at=NULL,device_last_seen_at=NULL,device_last_ip=NULL
         WHERE id=$1`,
        [instance.id, migration.target_slot_id, tokenHash, nextGeneration]
      );
      await tx.query("UPDATE mt5_accounts SET mode='LOCAL',status='ACTIVE' WHERE id=$1", [instance.mt5_account_id]);
      await tx.query(
        `UPDATE runtime_migrations SET
           state='WAITING_LOCAL_INSTALL',execution_generation=$2,
           lease_rotated_at=now(),updated_at=now(),error_code=NULL,error_detail=NULL
         WHERE id=$1`,
        [migration.id, nextGeneration]
      );
    }

    await tx.query(
      `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
       VALUES($1,'RUNTIME_MIGRATION_HANDOFF','runtime_migration',$2,$3::jsonb)`,
      [
        actor.slice(0, 160),
        migration.id,
        JSON.stringify({
          instanceId: instance.id,
          sourceMode: migration.source_mode,
          targetMode: migration.target_mode,
          previousGeneration: Number(instance.execution_generation || 1),
          executionGeneration: nextGeneration,
          releasedRunnerId: migration.source_mode === "CLOUD" ? migration.source_runner_id : null,
          targetRunnerId: migration.target_runner_id || null
        })
      ]
    );

    return (await tx.query("SELECT * FROM runtime_migrations WHERE id=$1", [migration.id])).rows[0];
  }

  async agentPoll(instanceId: string, installToken: string) {
    if (!instanceId || installToken.length < 8) {
      throw new ConflictException("invalid migration agent authentication");
    }
    const instance = await this.db.one(
      `SELECT bi.id,bi.install_token_hash,bi.execution_generation,bi.mode,
         bi.desired_state,bi.actual_state,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions
       FROM bot_instances bi WHERE bi.id=$1`,
      [instanceId]
    );
    if (!instance || String(instance.install_token_hash || "") !== this.crypto.sha256(installToken)) {
      throw new ConflictException("invalid migration agent authentication");
    }
    const migration = await this.db.one(
      `SELECT * FROM runtime_migrations
       WHERE bot_instance_id=$1 AND source_mode='LOCAL' AND state='STOPPING_LOCAL'
       ORDER BY created_at DESC LIMIT 1`,
      [instanceId]
    );
    if (!migration) return { ok: true, action: null };
    if (Number(instance.execution_generation || 1) !== Number(migration.execution_generation)) {
      return { ok: true, action: null };
    }
    if (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING" || Number(instance.positions || 0) > 0) {
      await this.db.query(
        `UPDATE runtime_migrations SET state='FAILED',error_code='SOURCE_BECAME_UNSAFE',
           error_detail='Local runtime became RUNNING or opened positions before verified stop',updated_at=now()
         WHERE id=$1 AND state='STOPPING_LOCAL'`,
        [migration.id]
      );
      return { ok: true, action: null };
    }
    return {
      ok: true,
      action: "STOP_LOCAL_RUNTIME",
      migrationId: migration.id,
      executionGeneration: Number(migration.execution_generation)
    };
  }

  async confirmLocalStop(
    instanceId: string,
    installToken: string,
    migrationId: string,
    executionGeneration: number,
    result: string,
    errorCode?: string
  ) {
    if (!instanceId || installToken.length < 8 || !migrationId) {
      throw new ConflictException("invalid migration stop confirmation");
    }
    if (!["STOP_CONFIRMED", "STOP_FAILED"].includes(result)) {
      throw new BadRequestException("invalid Local stop result");
    }

    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740094)");
      const instance = (await tx.query(
        `SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions
         FROM bot_instances bi WHERE bi.id=$1 FOR UPDATE`,
        [instanceId]
      )).rows[0];
      if (!instance || String(instance.install_token_hash || "") !== this.crypto.sha256(installToken)) {
        throw new ConflictException("invalid migration agent authentication");
      }
      const migration = (await tx.query(
        `SELECT * FROM runtime_migrations WHERE id=$1 AND bot_instance_id=$2 FOR UPDATE`,
        [migrationId, instanceId]
      )).rows[0];
      if (!migration || migration.source_mode !== "LOCAL") {
        throw new ConflictException("Local migration not found");
      }
      if (migration.state !== "STOPPING_LOCAL") {
        return {
          ok: migration.state !== "FAILED",
          state: migration.state,
          removeProfile: ["TARGET_PROVISIONING", "WAITING_LOCAL_INSTALL", "COMPLETED"].includes(migration.state)
        };
      }
      if (Number(migration.execution_generation) !== Number(executionGeneration) ||
          Number(instance.execution_generation || 1) !== Number(executionGeneration)) {
        throw new ConflictException("stale Local migration generation");
      }

      if (result === "STOP_FAILED") {
        const code = String(errorCode || "LOCAL_TERMINAL_STOP_FAILED").slice(0, 64);
        await tx.query(
          `UPDATE runtime_migrations SET state='FAILED',error_code=$2,
             error_detail='Local Agent could not verify that the exact MT5 process stopped',updated_at=now()
           WHERE id=$1`,
          [migration.id, code]
        );
        return { ok: false, state: "FAILED", removeProfile: false };
      }
      if (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING" || Number(instance.positions || 0) > 0) {
        throw new ConflictException("Local runtime is not safe for handoff");
      }

      await tx.query(
        `UPDATE runtime_migrations SET
           state='SOURCE_STOP_CONFIRMED',source_stop_confirmed_at=now(),updated_at=now(),
           error_code=NULL,error_detail=NULL
         WHERE id=$1`,
        [migration.id]
      );
      const handed = await this.finalizeHandoffTx(tx, migration.id, "LOCAL_AGENT_VERIFIED_STOP");
      return { ok: true, state: handed.state, removeProfile: true };
    });
  }

  async reconcile(userId: string, migrationId: string, actor: string) {
    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740094)");
      let migration = (await tx.query(
        `SELECT rm.* FROM runtime_migrations rm
         WHERE rm.id=$1 AND rm.user_id=$2
         FOR UPDATE`,
        [migrationId, userId]
      )).rows[0];
      if (!migration) throw new NotFoundException("Runtime migration not found");
      if (TERMINAL_STATES.includes(String(migration.state))) return migration;

      const instance = (await tx.query(
        `SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions
         FROM bot_instances bi WHERE bi.id=$1 FOR UPDATE`,
        [migration.bot_instance_id]
      )).rows[0];
      if (!instance) throw new NotFoundException("Bot instance not found");

      if (migration.state === "STOPPING_CLOUD") {
        if (instance.runtime_stop_state === "STOP_FAILED") {
          await tx.query(
            `UPDATE runtime_migrations SET state='FAILED',error_code='CLOUD_STOP_FAILED',
               error_detail=COALESCE($2,'Cloud Worker could not verify terminal shutdown'),updated_at=now()
             WHERE id=$1`,
            [migration.id, instance.runtime_stop_error || null]
          );
        } else if (["STOP_CONFIRMED", "LEASE_REVOKED"].includes(String(instance.runtime_stop_state))) {
          await tx.query(
            `UPDATE runtime_migrations SET state='SOURCE_STOP_CONFIRMED',source_stop_confirmed_at=now(),updated_at=now()
             WHERE id=$1`,
            [migration.id]
          );
          migration = await this.finalizeHandoffTx(tx, migration.id, actor);
        }
      }

      migration = (await tx.query("SELECT * FROM runtime_migrations WHERE id=$1", [migration.id])).rows[0];
      if (migration.state === "TARGET_PROVISIONING") {
        if (instance.provisioning_error) {
          await tx.query(
            `UPDATE runtime_migrations SET state='FAILED',error_code='CLOUD_PROVISION_FAILED',
               error_detail='Target Cloud Worker reported a provisioning error',updated_at=now()
             WHERE id=$1`,
            [migration.id]
          );
        } else if (instance.mode === "CLOUD" && this.fresh(instance.last_seen_at, 30_000)) {
          await tx.query(
            `UPDATE runtime_migrations SET state='COMPLETED',target_ready_at=now(),updated_at=now()
             WHERE id=$1`,
            [migration.id]
          );
        }
      } else if (migration.state === "WAITING_LOCAL_INSTALL") {
        if (instance.mode === "LOCAL" && instance.device_status === "ACTIVE" && this.fresh(instance.agent_last_seen_at, 45_000)) {
          await tx.query(
            `UPDATE runtime_migrations SET state='COMPLETED',target_ready_at=now(),updated_at=now()
             WHERE id=$1`,
            [migration.id]
          );
        }
      }

      return (await tx.query("SELECT * FROM runtime_migrations WHERE id=$1", [migration.id])).rows[0];
    });
  }
}
