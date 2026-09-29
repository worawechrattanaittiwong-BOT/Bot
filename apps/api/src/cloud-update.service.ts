import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { DbService } from "./db.service";
import { latestEaRelease } from "./release-version";

type Tx = { query: (sql: string, params?: any[]) => Promise<any> };

@Injectable()
export class CloudUpdateService {
  constructor(private readonly db: DbService) {}

  private artifactPath() {
    return String(process.env.EA_ARTIFACT_PATH || "").trim() ||
      "/app/apps/api/artifacts/FastBasketBot.ex5";
  }

  private currentRelease(required = false) {
    const path = this.artifactPath();
    if (!existsSync(path)) {
      if (required) {
        throw new ServiceUnavailableException("EA production artifact is not published yet");
      }
      return null;
    }

    const bytes = readFileSync(path);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const release = latestEaRelease();

    if (release.sha256 && String(release.sha256).toLowerCase() !== sha256) {
      if (required) {
        throw new ServiceUnavailableException("EA release manifest does not match production artifact");
      }
      return null;
    }

    return {
      path,
      version: String(release.eaVersion || "").trim(),
      sha256,
      runtimeContract: String(release.runtimeContract || "").trim(),
      sourceCommit: release.sourceCommit || null
    };
  }

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

  private fleetReleaseState(
    metrics: Record<string, any> | null | undefined,
    release: { version: string; runtimeContract: string }
  ) {
    const installedVersion = String(metrics?.eaVersion || "").trim().replace(/^v/i, "");
    const targetVersion = String(release.version || "").trim().replace(/^v/i, "");
    const installedContract = String(metrics?.runtimeContract || "").trim();
    const targetContract = String(release.runtimeContract || "").trim();

    if (!installedVersion) return "UNKNOWN" as const;
    if (installedVersion === targetVersion) {
      return (!targetContract || installedContract === targetContract)
        ? "CURRENT" as const
        : "OUTDATED" as const;
    }
    if (this.versionAtLeast(installedVersion, targetVersion)) {
      // Never present a downgrade as an EA update.
      return "AHEAD" as const;
    }
    return "OUTDATED" as const;
  }

  async list() {
    await this.reconcileAll();
    const jobs = await this.db.query(
      `SELECT
         sj.id,sj.runner_id,sj.action,sj.source_job_id,sj.state,sj.created_at,sj.completed_at,
         er.version target_version,er.sha256 target_sha256,
         COUNT(ij.id)::int total,
         COUNT(*) FILTER (WHERE ij.state='WAITING_SAFE')::int waiting_safe,
         COUNT(*) FILTER (WHERE ij.state='DELIVERED')::int delivered,
         COUNT(*) FILTER (WHERE ij.state='VERIFYING')::int verifying,
         COUNT(*) FILTER (WHERE ij.state='COMPLETED')::int completed,
         COUNT(*) FILTER (WHERE ij.state='FAILED')::int failed
       FROM server_update_jobs sj
       LEFT JOIN ea_releases er ON er.id=sj.release_id
       LEFT JOIN instance_update_jobs ij ON ij.server_update_job_id=sj.id
       GROUP BY sj.id,er.version,er.sha256
       ORDER BY sj.created_at DESC
       LIMIT 40`
    );

    const release = this.currentRelease(false);
    const runnerStatus: Record<string, {
      total: number;
      current: number;
      outdated: number;
      unknown: number;
      ahead: number;
      updateAvailable: boolean;
    }> = {};

    if (release) {
      const instances = await this.db.query(
        `SELECT
           bi.runner_id,
           bi.metrics,
           EXISTS (
             SELECT 1
             FROM instance_update_jobs ij
             WHERE ij.bot_instance_id=bi.id
               AND ij.action='UPDATE'
               AND ij.state='COMPLETED'
               AND ij.target_version=$1
               AND lower(COALESCE(ij.target_sha256,''))=lower($2)
           ) AS current_release_completed
         FROM bot_instances bi
         WHERE bi.runner_id IS NOT NULL
           AND bi.mode='CLOUD'
           AND COALESCE(bi.runtime_stop_state,'NONE')='NONE'`,
        [release.version, release.sha256]
      );
      for (const instance of instances.rows) {
        const runnerId = String(instance.runner_id || "");
        if (!runnerId) continue;
        const state = instance.current_release_completed
          ? "CURRENT"
          : this.fleetReleaseState(instance.metrics || {}, release);
        const status = runnerStatus[runnerId] ||= {
          total: 0,
          current: 0,
          outdated: 0,
          unknown: 0,
          ahead: 0,
          updateAvailable: false
        };
        status.total++;
        if (state === "CURRENT") status.current++;
        else if (state === "OUTDATED") status.outdated++;
        else if (state === "AHEAD") status.ahead++;
        else status.unknown++;
      }
      for (const status of Object.values(runnerStatus)) {
        status.updateAvailable = status.outdated > 0;
      }
    }

    return {
      currentRelease: release ? {
        version: release.version,
        sha256: release.sha256,
        runtimeContract: release.runtimeContract
      } : null,
      runnerStatus,
      jobs: jobs.rows
    };
  }

  async createFleetUpdate(runnerId: string, actor: string) {
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(runnerId || "")) {
      throw new BadRequestException("Invalid Runner ID");
    }

    const release = this.currentRelease(true)!;

    return this.db.transaction(async tx => {
      const node = (await tx.query(
        `SELECT runner_id,last_seen_at,telemetry
         FROM worker_nodes
         WHERE runner_id=$1
         FOR UPDATE`,
        [runnerId]
      )).rows[0];

      if (!node) throw new NotFoundException("ไม่พบ Server");
      if (!node.last_seen_at || Date.now() - new Date(node.last_seen_at).getTime() > 30_000) {
        throw new ConflictException("Server ต้อง Online ก่อนเริ่ม Fleet Update");
      }
      if (!this.versionAtLeast(node.telemetry?.version, "2.1.0")) {
        throw new ConflictException("Cloud Worker v2.1.0+ required for Fleet Update");
      }

      const active = (await tx.query(
        `SELECT id FROM server_update_jobs
         WHERE runner_id=$1 AND state='RUNNING'
         ORDER BY created_at DESC LIMIT 1`,
        [runnerId]
      )).rows[0];
      if (active) throw new ConflictException("Server นี้มี Fleet Update กำลังทำงานอยู่");

      const instances = (await tx.query(
        `SELECT
           bi.id,bi.desired_state,bi.metrics,
           COALESCE(bi.metrics->>'eaVersion','') previous_version,
           EXISTS (
             SELECT 1
             FROM instance_update_jobs ij
             WHERE ij.bot_instance_id=bi.id
               AND ij.action='UPDATE'
               AND ij.state='COMPLETED'
               AND ij.target_version=$2
               AND lower(COALESCE(ij.target_sha256,''))=lower($3)
           ) AS current_release_completed
         FROM bot_instances bi
         WHERE bi.runner_id=$1
           AND bi.mode='CLOUD'
           AND COALESCE(bi.runtime_stop_state,'NONE')='NONE'
         ORDER BY bi.created_at
         FOR UPDATE OF bi`,
        [runnerId, release.version, release.sha256]
      )).rows;

      if (!instances.length) {
        throw new BadRequestException("Server นี้ยังไม่มี Cloud MT5 สำหรับอัปเดต");
      }

      const updateTargets = instances.filter(
        instance =>
          !instance.current_release_completed &&
          this.fleetReleaseState(instance.metrics || {}, release) === "OUTDATED"
      );
      if (!updateTargets.length) {
        throw new ConflictException("EA บน Server นี้เป็นเวอร์ชันล่าสุดแล้ว ไม่มีอัปเดตที่ต้องปล่อย");
      }

      const releaseRow = (await tx.query(
        `INSERT INTO ea_releases(version,sha256,runtime_contract,artifact_name,source_commit)
         VALUES($1,$2,$3,'FastBasketBot.ex5',$4)
         ON CONFLICT(version,sha256) DO UPDATE
         SET runtime_contract=EXCLUDED.runtime_contract,
             source_commit=COALESCE(EXCLUDED.source_commit,ea_releases.source_commit)
         RETURNING id`,
        [release.version, release.sha256, release.runtimeContract, release.sourceCommit]
      )).rows[0];

      const parent = (await tx.query(
        `INSERT INTO server_update_jobs(
           runner_id,action,release_id,mode,state,created_by
         ) VALUES($1,'UPDATE',$2,'SAFE','RUNNING',$3)
         RETURNING *`,
        [runnerId, releaseRow.id, actor]
      )).rows[0];

      for (const instance of updateTargets) {
        const child = (await tx.query(
          `INSERT INTO instance_update_jobs(
             server_update_job_id,bot_instance_id,action,target_version,target_sha256,
             previous_version,original_desired_state,state
           ) VALUES($1,$2,'UPDATE',$3,$4,$5,$6,'WAITING_SAFE')
           RETURNING id`,
          [
            parent.id,
            instance.id,
            release.version,
            release.sha256,
            String(instance.previous_version || "").slice(0, 32) || null,
            String(instance.desired_state || "STOPPED").slice(0, 24)
          ]
        )).rows[0];

        // Deferred update policy: never interrupt a running customer.
        // This instance remains WAITING_SAFE until the customer chooses Stop
        // and the account is flat. The Worker updates only that MT5 instance.
      }

      return this.parentStatus(tx, parent.id);
    });
  }

  async rollback(sourceJobId: string, actor: string) {
    if (!/^[0-9a-f-]{36}$/i.test(sourceJobId || "")) {
      throw new BadRequestException("Invalid update job ID");
    }

    return this.db.transaction(async tx => {
      const source = (await tx.query(
        `SELECT * FROM server_update_jobs
         WHERE id=$1 AND action='UPDATE'
         FOR UPDATE`,
        [sourceJobId]
      )).rows[0];
      if (!source) throw new NotFoundException("ไม่พบ Fleet Update ต้นทาง");

      const active = (await tx.query(
        `SELECT id FROM server_update_jobs
         WHERE runner_id=$1 AND state='RUNNING'
         ORDER BY created_at DESC LIMIT 1`,
        [source.runner_id]
      )).rows[0];
      if (active) throw new ConflictException("Server นี้มี Fleet Update กำลังทำงานอยู่");

      const sourceChildren = (await tx.query(
        `SELECT ij.*,bi.desired_state current_desired_state
         FROM instance_update_jobs ij
         JOIN bot_instances bi ON bi.id=ij.bot_instance_id
         WHERE ij.server_update_job_id=$1
           AND ij.state='COMPLETED'
           AND COALESCE(ij.previous_version,'')<>''
         ORDER BY ij.created_at
         FOR UPDATE OF bi`,
        [sourceJobId]
      )).rows;

      if (!sourceChildren.length) {
        throw new ConflictException("ไม่มี Instance ที่ Rollback ได้จาก Update นี้");
      }

      const parent = (await tx.query(
        `INSERT INTO server_update_jobs(
           runner_id,action,source_job_id,mode,state,created_by
         ) VALUES($1,'ROLLBACK',$2,'SAFE','RUNNING',$3)
         RETURNING *`,
        [source.runner_id, sourceJobId, actor]
      )).rows[0];

      for (const item of sourceChildren) {
        const child = (await tx.query(
          `INSERT INTO instance_update_jobs(
             server_update_job_id,bot_instance_id,action,source_instance_update_id,
             target_version,target_sha256,previous_version,original_desired_state,state
           ) VALUES($1,$2,'ROLLBACK',$3,$4,$5,$6,$7,'WAITING_SAFE')
           RETURNING id`,
          [
            parent.id,
            item.bot_instance_id,
            item.id,
            item.previous_version,
            item.previous_sha256,
            item.target_version,
            String(item.current_desired_state || "STOPPED").slice(0, 24)
          ]
        )).rows[0];

        // Rollback follows the same deferred policy: wait for the customer to
        // stop this account; never force a running bot into Safe Stop.
      }

      return this.parentStatus(tx, parent.id);
    });
  }

  async next(runnerId: string) {
    await this.reconcileRunner(runnerId);

    return this.db.transaction(async tx => {
      const row = (await tx.query(
        `SELECT
           ij.id,ij.bot_instance_id,ij.action,ij.source_instance_update_id,
           ij.target_version,ij.target_sha256,
           sj.id server_update_job_id
         FROM instance_update_jobs ij
         JOIN server_update_jobs sj ON sj.id=ij.server_update_job_id
         JOIN bot_instances bi ON bi.id=ij.bot_instance_id
         JOIN worker_nodes wn ON wn.runner_id=bi.runner_id
         WHERE sj.runner_id=$1
           AND sj.state='RUNNING'
           AND ij.state='WAITING_SAFE'
           AND bi.runner_id=$1
           AND bi.mode='CLOUD'
           AND COALESCE(bi.runtime_stop_state,'NONE')='NONE'
           AND bi.desired_state='STOPPED'
           AND COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)<=0
           AND (
             bi.last_seen_at>now()-interval '30 seconds'
             OR (
               -- Connectivity-repair escape hatch: a broken EA cannot satisfy a
               -- fresh-heartbeat gate in order to receive the EA that fixes its
               -- heartbeat. For older runtimes require a recent EA heartbeat.
               -- Worker 2.2.7+ also reports the exact managed terminal process;
               -- this allows repair after recovery intentionally cleared
               -- last_seen_at, but only for an explicitly STOPPED, fully-flat
               -- runtime whose Windows terminal is still confirmed running.
               bi.actual_state='STOPPED'
               AND (
                 bi.last_seen_at>now()-interval '60 minutes'
                 OR (
                   bi.last_seen_at IS NULL
                   AND EXISTS (
                     SELECT 1
                     FROM jsonb_array_elements(
                       COALESCE(wn.telemetry->'instances','[]'::jsonb)
                     ) diag
                     WHERE diag->>'instanceId'=bi.id::text
                       AND COALESCE((diag->>'terminalRunning')::boolean,false)=true
                   )
                 )
               )
               AND COALESCE(NULLIF(bi.metrics->>'accountScenovaPositions','')::int,0)<=0
               AND COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0)<=0
             )
           )
         ORDER BY ij.created_at
         LIMIT 1
         FOR UPDATE OF ij SKIP LOCKED`,
        [runnerId]
      )).rows[0];

      if (!row) return { update: null };

      await tx.query(
        `UPDATE instance_update_jobs
         SET state='DELIVERED',delivered_at=now()
         WHERE id=$1`,
        [row.id]
      );

      return {
        update: {
          id: row.id,
          serverUpdateJobId: row.server_update_job_id,
          instanceId: row.bot_instance_id,
          action: row.action,
          sourceInstanceUpdateId: row.source_instance_update_id || null,
          targetVersion: row.target_version,
          targetSha256: row.target_sha256 || null
        }
      };
    });
  }

  async artifact(runnerId: string, instanceUpdateId: string) {
    const row = await this.db.one(
      `SELECT ij.target_sha256,ij.action
       FROM instance_update_jobs ij
       JOIN server_update_jobs sj ON sj.id=ij.server_update_job_id
       WHERE ij.id=$1
         AND sj.runner_id=$2
         AND ij.state='DELIVERED'`,
      [instanceUpdateId, runnerId]
    );

    if (!row || row.action !== "UPDATE") {
      throw new NotFoundException("Update artifact job not found");
    }

    const release = this.currentRelease(true)!;
    if (String(row.target_sha256 || "").toLowerCase() !== release.sha256) {
      throw new ConflictException("Production EA changed after this Fleet Update was created");
    }

    return release.path;
  }

  async result(
    runnerId: string,
    body: {
      instanceUpdateId: string;
      result: "APPLIED" | "FAILED";
      resultCode?: string;
      previousSha256?: string;
    }
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(body.instanceUpdateId || "")) {
      throw new BadRequestException("Invalid instance update ID");
    }
    if (!["APPLIED", "FAILED"].includes(body.result)) {
      throw new BadRequestException("Invalid update result");
    }

    const resultCode = String(body.resultCode || "")
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "")
      .slice(0, 64) || null;
    const previousSha256 = /^[0-9a-f]{64}$/i.test(body.previousSha256 || "")
      ? String(body.previousSha256).toLowerCase()
      : null;

    return this.db.transaction(async tx => {
      const row = (await tx.query(
        `SELECT ij.*,sj.runner_id
         FROM instance_update_jobs ij
         JOIN server_update_jobs sj ON sj.id=ij.server_update_job_id
         WHERE ij.id=$1
         FOR UPDATE OF ij`,
        [body.instanceUpdateId]
      )).rows[0];

      if (!row || row.runner_id !== runnerId) {
        throw new BadRequestException("Fleet Update does not belong to this Worker");
      }
      if (row.state !== "DELIVERED") {
        return { ok: true, state: row.state };
      }

      if (body.result === "APPLIED") {
        await tx.query(
          `UPDATE instance_update_jobs
           SET state='VERIFYING',
               applied_at=now(),
               previous_sha256=COALESCE($2,previous_sha256),
               result_code=NULL
           WHERE id=$1`,
          [row.id, previousSha256]
        );
      } else {
        await tx.query(
          `UPDATE instance_update_jobs
           SET state='FAILED',
               completed_at=now(),
               previous_sha256=COALESCE($2,previous_sha256),
               result_code=$3
           WHERE id=$1`,
          [row.id, previousSha256, resultCode || "WORKER_UPDATE_FAILED"]
        );
      }

      await this.refreshParent(tx, row.server_update_job_id);
      return { ok: true, state: body.result === "APPLIED" ? "VERIFYING" : "FAILED" };
    });
  }

  private async reconcileAll() {
    const runners = await this.db.query(
      "SELECT DISTINCT runner_id FROM server_update_jobs WHERE state='RUNNING'"
    );
    for (const row of runners.rows) {
      await this.reconcileRunner(String(row.runner_id));
    }
  }

  private async reconcileRunner(runnerId: string) {
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(runnerId || "")) return;

    await this.db.transaction(async tx => {
      const rows = (await tx.query(
        `SELECT
           ij.*,sj.action,sj.created_at parent_created_at,er.runtime_contract,
           bi.desired_state,bi.last_seen_at,bi.metrics
         FROM instance_update_jobs ij
         JOIN server_update_jobs sj ON sj.id=ij.server_update_job_id
         JOIN bot_instances bi ON bi.id=ij.bot_instance_id
         LEFT JOIN ea_releases er ON er.id=sj.release_id
         WHERE sj.runner_id=$1
           AND sj.state='RUNNING'
           AND ij.state IN ('DELIVERED','VERIFYING')
         ORDER BY ij.created_at
         FOR UPDATE OF ij`,
        [runnerId]
      )).rows;

      for (const row of rows) {
        if (
          row.state === "DELIVERED" &&
          row.delivered_at &&
          Date.now() - new Date(row.delivered_at).getTime() > 10 * 60_000
        ) {
          await tx.query(
            `UPDATE instance_update_jobs
             SET state='FAILED',result_code='WORKER_UPDATE_TIMEOUT',completed_at=now()
             WHERE id=$1`,
            [row.id]
          );
          continue;
        }

        if (row.state !== "VERIFYING") continue;

        if (
          row.applied_at &&
          Date.now() - new Date(row.applied_at).getTime() > 5 * 60_000
        ) {
          await tx.query(
            `UPDATE instance_update_jobs
             SET state='FAILED',result_code='EA_VERSION_VERIFY_TIMEOUT',completed_at=now()
             WHERE id=$1`,
            [row.id]
          );
          continue;
        }

        const metrics = row.metrics || {};
        const freshHeartbeat = Boolean(
          row.applied_at &&
          row.last_seen_at &&
          new Date(row.last_seen_at).getTime() > new Date(row.applied_at).getTime()
        );
        const versionMatch =
          String(metrics.eaVersion || "").trim() === String(row.target_version || "").trim();
        const contractMatch =
          row.action === "ROLLBACK" ||
          !row.runtime_contract ||
          String(metrics.runtimeContract || "").trim() === String(row.runtime_contract).trim();

        if (!freshHeartbeat || !versionMatch || !contractMatch) continue;

        await tx.query(
          `UPDATE instance_update_jobs
           SET state='COMPLETED',completed_at=now(),result_code=NULL
           WHERE id=$1`,
          [row.id]
        );

        // Never auto-resume after an EA update. The customer intentionally
        // stopped this account to create a safe update window and remains in
        // control of when trading starts again.

      }

      const parents = (await tx.query(
        `SELECT DISTINCT sj.id
         FROM server_update_jobs sj
         JOIN instance_update_jobs ij ON ij.server_update_job_id=sj.id
         WHERE sj.runner_id=$1 AND sj.state='RUNNING'`,
        [runnerId]
      )).rows;

      for (const parent of parents) {
        await this.refreshParent(tx, parent.id);
      }
    });
  }

  private async refreshParent(tx: Tx, parentId: string) {
    const counts = (await tx.query(
      `SELECT
         COUNT(*)::int total,
         COUNT(*) FILTER (WHERE state='COMPLETED')::int completed,
         COUNT(*) FILTER (WHERE state='FAILED')::int failed,
         COUNT(*) FILTER (WHERE state IN ('WAITING_SAFE','DELIVERED','VERIFYING'))::int active
       FROM instance_update_jobs
       WHERE server_update_job_id=$1`,
      [parentId]
    )).rows[0];

    if (Number(counts?.active || 0) > 0) return;

    const state = Number(counts?.failed || 0) > 0
      ? "PARTIAL_FAILED"
      : "COMPLETED";

    await tx.query(
      `UPDATE server_update_jobs
       SET state=$2,completed_at=COALESCE(completed_at,now())
       WHERE id=$1 AND state='RUNNING'`,
      [parentId, state]
    );
  }

  private async parentStatus(tx: Tx, parentId: string) {
    return (await tx.query(
      `SELECT
         sj.*,
         COUNT(ij.id)::int total,
         COUNT(*) FILTER (WHERE ij.state='WAITING_SAFE')::int waiting_safe,
         COUNT(*) FILTER (WHERE ij.state='COMPLETED')::int completed,
         COUNT(*) FILTER (WHERE ij.state='FAILED')::int failed
       FROM server_update_jobs sj
       LEFT JOIN instance_update_jobs ij ON ij.server_update_job_id=sj.id
       WHERE sj.id=$1
       GROUP BY sj.id`,
      [parentId]
    )).rows[0];
  }
}
