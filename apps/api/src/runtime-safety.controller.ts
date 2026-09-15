import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { DbService } from "./db.service";
import { RuntimeSafetyService } from "./runtime-safety.service";
import { AdminGuard } from "./security";

@Controller("admin/runtime-safety")
@UseGuards(AdminGuard)
export class RuntimeSafetyController {
  constructor(
    private readonly db: DbService,
    private readonly runtimeSafety: RuntimeSafetyService
  ) {}

  private requireJwtAdmin(req: any) {
    const userId = String(req?.user?.sub || "");
    const role = String(req?.user?.role || "");
    if (!userId || !["OWNER", "ADMIN"].includes(role)) {
      throw new ForbiddenException("Owner/Admin login is required for runtime safety actions");
    }
    return {
      userId,
      actor: String(req?.user?.code || req?.user?.user_code || role).slice(0, 160)
    };
  }

  private assertUuid(value: string) {
    if (!/^[0-9a-f-]{36}$/i.test(value || "")) {
      throw new BadRequestException("Invalid bot instance ID");
    }
  }

  private workerSupportsVerifiedStop(version: unknown) {
    const match = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return false;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    return major > 1 || (major === 1 && (minor > 1 || (minor === 1 && patch >= 0)));
  }

  @Get(":instanceId")
  async status(@Req() req: any, @Param("instanceId") instanceId: string) {
    this.requireJwtAdmin(req);
    this.assertUuid(instanceId);
    const row = await this.db.one(
      `SELECT
         bi.id,bi.mode,bi.runner_id,bi.execution_generation,bi.desired_state,bi.actual_state,
         bi.last_seen_at,bi.runtime_stop_state,bi.runtime_stop_requested_at,
         bi.runtime_stop_confirmed_at,bi.runtime_stop_error,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         w.last_seen_at worker_last_seen_at,w.telemetry worker_telemetry
       FROM bot_instances bi
       LEFT JOIN worker_nodes w ON w.runner_id=bi.runner_id
       WHERE bi.id=$1`,
      [instanceId]
    );
    if (!row) throw new BadRequestException("Bot instance not found");
    return {
      ...row,
      eaOnline: Boolean(row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() < 30_000),
      workerOnline: Boolean(row.worker_last_seen_at && Date.now() - new Date(row.worker_last_seen_at).getTime() < 30_000),
      workerSupportsVerifiedStop: this.workerSupportsVerifiedStop(row.worker_telemetry?.version)
    };
  }

  @Post(":instanceId/request-stop")
  async requestStop(@Req() req: any, @Param("instanceId") instanceId: string) {
    const { actor } = this.requireJwtAdmin(req);
    this.assertUuid(instanceId);

    return this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740093)");
      const instance = (await tx.query(
        `SELECT
           bi.*,
           COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
           w.last_seen_at worker_last_seen_at,w.telemetry worker_telemetry
         FROM bot_instances bi
         LEFT JOIN worker_nodes w ON w.runner_id=bi.runner_id
         WHERE bi.id=$1
         FOR UPDATE OF bi`,
        [instanceId]
      )).rows[0];

      if (!instance) throw new BadRequestException("Bot instance not found");
      if (instance.mode !== "CLOUD") {
        throw new ConflictException("Verified Worker stop is available only for CLOUD instances");
      }
      if (!instance.runner_id) {
        throw new ConflictException("Cloud instance is not assigned to a Worker");
      }
      if (!instance.worker_last_seen_at || Date.now() - new Date(instance.worker_last_seen_at).getTime() > 30_000) {
        throw new ConflictException("Cloud Worker is offline; do not assume the terminal is stopped");
      }
      if (!this.workerSupportsVerifiedStop(instance.worker_telemetry?.version)) {
        throw new ConflictException("Cloud Worker v1.1.0 or newer is required for verified stop");
      }
      if (!instance.last_seen_at || Date.now() - new Date(instance.last_seen_at).getTime() > 30_000) {
        throw new ConflictException("EA heartbeat is not fresh; verify the Cloud terminal before requesting stop");
      }
      if (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING") {
        throw new ConflictException("Stop the bot before stopping the Cloud terminal");
      }
      if (Number(instance.positions || 0) > 0) {
        throw new ConflictException("Close all positions before stopping the Cloud terminal");
      }
      if (instance.runtime_stop_state === "STOP_CONFIRMED") {
        return {
          ok: true,
          instanceId: instance.id,
          executionGeneration: Number(instance.execution_generation || 1),
          state: "STOP_CONFIRMED",
          alreadyConfirmed: true
        };
      }

      const existing = (await tx.query(
        `SELECT id,status,execution_generation
         FROM worker_commands
         WHERE bot_instance_id=$1
           AND command='STOP_INSTANCE'
           AND status IN ('PENDING','DELIVERED')
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [instance.id]
      )).rows[0];
      if (existing) {
        return {
          ok: true,
          instanceId: instance.id,
          commandId: existing.id,
          executionGeneration: Number(existing.execution_generation),
          state: "STOP_REQUESTED",
          alreadyRequested: true
        };
      }

      const command = (await tx.query(
        `INSERT INTO worker_commands(
           runner_id,bot_instance_id,execution_generation,command,status
         ) VALUES($1,$2,$3,'STOP_INSTANCE','PENDING')
         RETURNING id,execution_generation,status`,
        [instance.runner_id, instance.id, Number(instance.execution_generation || 1)]
      )).rows[0];

      await tx.query(
        `UPDATE bot_instances SET
           runtime_stop_state='STOP_REQUESTED',
           runtime_stop_requested_at=now(),
           runtime_stop_confirmed_at=NULL,
           runtime_stop_error=NULL
         WHERE id=$1`,
        [instance.id]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'REQUEST_CLOUD_RUNTIME_STOP','bot_instance',$2,$3::jsonb)`,
        [
          actor,
          instance.id,
          JSON.stringify({
            runnerId: instance.runner_id,
            commandId: command.id,
            executionGeneration: Number(instance.execution_generation || 1)
          })
        ]
      );

      return {
        ok: true,
        instanceId: instance.id,
        commandId: command.id,
        executionGeneration: Number(instance.execution_generation || 1),
        state: "STOP_REQUESTED"
      };
    });
  }

  @Post(":instanceId/rotate-lease")
  async rotateLease(
    @Req() req: any,
    @Param("instanceId") instanceId: string,
    @Body() body: { confirmRevocation: boolean }
  ) {
    const { actor } = this.requireJwtAdmin(req);
    this.assertUuid(instanceId);
    if (body.confirmRevocation !== true) {
      throw new BadRequestException("Explicit execution lease revocation confirmation is required");
    }
    return this.runtimeSafety.rotateExecutionLease(instanceId, actor);
  }
}
