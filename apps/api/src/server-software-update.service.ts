import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { DbService } from "./db.service";
import { CloudUpdateService } from "./cloud-update.service";
import {
  CLOUD_SERVER_RELEASE,
  versionAtLeast,
  versionExact
} from "./cloud-server-release";

type Tx = { query: (sql: string, params?: any[]) => Promise<any> };

@Injectable()
export class ServerSoftwareUpdateService {
  constructor(
    private readonly db: DbService,
    private readonly cloudUpdates: CloudUpdateService
  ) {}

  async create(runnerId: string, actor: string) {
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(runnerId || "")) {
      throw new BadRequestException("Invalid Runner ID");
    }

    const job = await this.db.transaction(async tx => {
      const node = (await tx.query(
        "SELECT runner_id,last_seen_at,accepting_jobs,telemetry FROM worker_nodes WHERE runner_id=$1 FOR UPDATE",
        [runnerId]
      )).rows[0];

      if (!node) throw new NotFoundException("ไม่พบ Server");
      if (!node.last_seen_at || Date.now() - new Date(node.last_seen_at).getTime() > 30_000) {
        throw new ConflictException("Server ต้อง Online ก่อนเริ่มอัปเดต");
      }

      const currentWorker = String(node.telemetry?.version || "");
      const currentSetup = String(node.telemetry?.setupVersion || "");
      if (!versionAtLeast(currentWorker, "2.2.0")) {
        throw new ConflictException(
          "Server นี้ยังไม่มี Remote Updater ต้องติดตั้ง/Repair SCENOVA Cloud Setup รุ่นล่าสุดบน VPS หนึ่งครั้งก่อน"
        );
      }

      if (
        versionExact(currentWorker, CLOUD_SERVER_RELEASE.workerVersion) &&
        versionExact(currentSetup, CLOUD_SERVER_RELEASE.setupVersion)
      ) {
        throw new ConflictException("Server เป็นเวอร์ชันล่าสุดแล้ว");
      }

      const active = (await tx.query(
        "SELECT id,state FROM server_software_update_jobs WHERE runner_id=$1 AND state IN ('REQUESTED','DELIVERED','RESTARTING') ORDER BY created_at DESC LIMIT 1",
        [runnerId]
      )).rows[0];
      if (active) throw new ConflictException("Server นี้มีงานอัปเดตกำลังดำเนินการอยู่");

      const created = (await tx.query(
        "INSERT INTO server_software_update_jobs(runner_id,target_worker_version,target_setup_version,setup_url,state,original_accepting_jobs,created_by) VALUES($1,$2,$3,$4,'REQUESTED',$5,$6) RETURNING *",
        [
          runnerId,
          CLOUD_SERVER_RELEASE.workerVersion,
          CLOUD_SERVER_RELEASE.setupVersion,
          CLOUD_SERVER_RELEASE.setupUrl,
          Boolean(node.accepting_jobs),
          actor
        ]
      )).rows[0];

      await tx.query(
        "UPDATE worker_nodes SET accepting_jobs=false WHERE runner_id=$1",
        [runnerId]
      );
      return created;
    });

    let eaQueue = "QUEUED";
    try {
      await this.cloudUpdates.createFleetUpdate(runnerId, actor + ":SERVER_UPDATE");
    } catch {
      eaQueue = "ALREADY_ACTIVE_OR_NOT_REQUIRED";
    }

    return { ...job, eaQueue };
  }

  async next(runnerId: string) {
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(runnerId || "")) {
      throw new BadRequestException("Invalid Runner ID");
    }

    return this.db.transaction(async tx => {
      const job = (await tx.query(
        "SELECT * FROM server_software_update_jobs WHERE runner_id=$1 AND state IN ('REQUESTED','DELIVERED','RESTARTING') ORDER BY created_at LIMIT 1 FOR UPDATE",
        [runnerId]
      )).rows[0];
      if (!job) return { update: null };

      const node = (await tx.query(
        "SELECT last_seen_at,telemetry FROM worker_nodes WHERE runner_id=$1",
        [runnerId]
      )).rows[0];

      const fresh = Boolean(
        node?.last_seen_at &&
        Date.now() - new Date(node.last_seen_at).getTime() <= 30_000
      );
      const workerMatch = versionExact(node?.telemetry?.version, job.target_worker_version);
      const setupMatch = versionExact(node?.telemetry?.setupVersion, job.target_setup_version);

      if (fresh && workerMatch && setupMatch) {
        await this.complete(tx, job);
        return { update: null };
      }

      if (
        job.state === "RESTARTING" &&
        job.started_at &&
        Date.now() - new Date(job.started_at).getTime() > 15 * 60_000
      ) {
        await this.fail(tx, job, "SERVER_UPDATE_TIMEOUT");
        return { update: null };
      }

      if (job.state !== "REQUESTED") return { update: null };

      await tx.query(
        "UPDATE server_software_update_jobs SET state='DELIVERED',delivered_at=now() WHERE id=$1",
        [job.id]
      );

      return {
        update: {
          id: job.id,
          targetWorkerVersion: job.target_worker_version,
          targetSetupVersion: job.target_setup_version,
          setupUrl: job.setup_url
        }
      };
    });
  }

  async result(
    runnerId: string,
    body: {
      serverUpdateId: string;
      result: "RESTARTING" | "FAILED";
      resultCode?: string;
    }
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(body.serverUpdateId || "")) {
      throw new BadRequestException("Invalid server update ID");
    }
    if (!["RESTARTING", "FAILED"].includes(body.result)) {
      throw new BadRequestException("Invalid server update result");
    }

    const code = String(body.resultCode || "")
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "")
      .slice(0, 64) || null;

    return this.db.transaction(async tx => {
      const job = (await tx.query(
        "SELECT * FROM server_software_update_jobs WHERE id=$1 AND runner_id=$2 FOR UPDATE",
        [body.serverUpdateId, runnerId]
      )).rows[0];

      if (!job) throw new NotFoundException("Server update not found");
      if (["COMPLETED", "FAILED"].includes(job.state)) {
        return { ok: true, state: job.state };
      }

      if (body.result === "FAILED") {
        await this.fail(tx, job, code || "SERVER_UPDATE_FAILED");
        return { ok: true, state: "FAILED" };
      }

      await tx.query(
        "UPDATE server_software_update_jobs SET state='RESTARTING',started_at=COALESCE(started_at,now()),result_code=NULL WHERE id=$1",
        [job.id]
      );
      return { ok: true, state: "RESTARTING" };
    });
  }

  private async complete(tx: Tx, job: any) {
    await tx.query(
      "UPDATE server_software_update_jobs SET state='COMPLETED',completed_at=now(),result_code=NULL WHERE id=$1",
      [job.id]
    );
    await tx.query(
      "UPDATE worker_nodes SET accepting_jobs=$2 WHERE runner_id=$1",
      [job.runner_id, Boolean(job.original_accepting_jobs)]
    );
  }

  private async fail(tx: Tx, job: any, code: string) {
    await tx.query(
      "UPDATE server_software_update_jobs SET state='FAILED',completed_at=now(),result_code=$2 WHERE id=$1",
      [job.id, code]
    );
    await tx.query(
      "UPDATE worker_nodes SET accepting_jobs=$2 WHERE runner_id=$1",
      [job.runner_id, Boolean(job.original_accepting_jobs)]
    );
  }
}
