import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { CryptoService } from "./security";

@Injectable()
export class RuntimeSafetyService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  async rotateExecutionLease(instanceId: string, actor: string) {
    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740093)");
      const instance = (await tx.query(
        `SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions
         FROM bot_instances bi
         WHERE bi.id=$1
         FOR UPDATE`,
        [instanceId]
      )).rows[0];

      if (!instance) throw new NotFoundException("Bot instance not found");
      if (instance.mode !== "CLOUD") {
        throw new ConflictException("Phase 2 lease rotation is restricted to CLOUD instances");
      }
      if (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING") {
        throw new ConflictException("Stop the bot before rotating the execution lease");
      }
      if (Number(instance.positions || 0) > 0) {
        throw new ConflictException("Cannot rotate the execution lease while positions are open");
      }
      if (instance.runner_id && instance.runtime_stop_state !== "STOP_CONFIRMED") {
        throw new ConflictException("Worker STOP_CONFIRMED is required before rotating a bound Cloud runtime");
      }

      const nextToken = randomBytes(32).toString("hex");
      const encrypted = this.crypto.encrypt(nextToken);
      const nextGeneration = Number(instance.execution_generation || 1) + 1;

      await tx.query(
        `UPDATE bot_instances SET
           execution_generation=$2,
           install_token_hash=$3,
           lease_rotated_at=now(),
           desired_state='STOPPED',
           actual_state='OFFLINE',
           last_seen_at=NULL,
           ea_last_ip=NULL
         WHERE id=$1`,
        [instance.id, nextGeneration, this.crypto.sha256(nextToken)]
      );
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
        `UPDATE bot_commands
         SET status='ACKED',acked_at=now()
         WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')`,
        [instance.id]
      );
      await tx.query(
        `UPDATE worker_commands
         SET status='CANCELLED',result_code='LEASE_ROTATED',acked_at=now()
         WHERE bot_instance_id=$1
           AND status IN ('PENDING','DELIVERED')
           AND execution_generation<>$2`,
        [instance.id, nextGeneration]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'ROTATE_EXECUTION_LEASE','bot_instance',$2,$3::jsonb)`,
        [
          String(actor || "OWNER").slice(0, 160),
          instance.id,
          JSON.stringify({
            previousGeneration: Number(instance.execution_generation || 1),
            executionGeneration: nextGeneration,
            runnerId: instance.runner_id || null,
            runtimeStopState: instance.runtime_stop_state || "NONE"
          })
        ]
      );

      return {
        ok: true,
        instanceId: instance.id,
        executionGeneration: nextGeneration,
        runnerId: instance.runner_id || null,
        runtimeStopState: instance.runtime_stop_state || "NONE",
        note: "The old execution token is revoked. The new token remains encrypted server-side."
      };
    });
  }
}
