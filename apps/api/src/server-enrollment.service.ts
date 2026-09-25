import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { CryptoService } from "./security";

export type CreateCloudServerInput = {
  runnerId: string;
  region: string;
  capacity: number;
  monthlyCost: number;
  spec: string;
};

@Injectable()
export class ServerEnrollmentService {
  private readonly enrollmentMinutes = 15;

  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private issueMaterial() {
    const enrollmentToken = randomBytes(32).toString("base64url");
    return {
      enrollmentToken,
      tokenHash: this.crypto.sha256(enrollmentToken),
      expiresAt: new Date(Date.now() + this.enrollmentMinutes * 60_000)
    };
  }

  async createServer(input: CreateCloudServerInput, actor: string) {
    const issued = this.issueMaterial();
    const blockedWorkerKeyHash = this.crypto.sha256(randomBytes(32).toString("base64url"));

    return this.db.transaction(async tx => {
      const result = await tx.query(
        `INSERT INTO worker_nodes(runner_id,region,capacity,monthly_cost,spec,worker_key_hash,status,accepting_jobs)
         VALUES($1,$2,$3,$4,$5,$6,'OFFLINE',false)
         ON CONFLICT(runner_id) DO NOTHING
         RETURNING runner_id`,
        [
          input.runnerId,
          String(input.region || "Thailand").slice(0, 80),
          input.capacity,
          input.monthlyCost,
          String(input.spec || "").slice(0, 300),
          blockedWorkerKeyHash
        ]
      );
      if (!result.rowCount) throw new ConflictException("Runner ID นี้มีแล้ว");

      await tx.query(
        `INSERT INTO cloud_server_enrollments(runner_id,token_hash,expires_at,created_by)
         VALUES($1,$2,$3,$4)`,
        [input.runnerId, issued.tokenHash, issued.expiresAt, actor]
      );

      return {
        runnerId: input.runnerId,
        enrollmentToken: issued.enrollmentToken,
        expiresAt: issued.expiresAt.toISOString()
      };
    });
  }

  async renewEnrollment(runnerId: string, actor: string) {
    const issued = this.issueMaterial();

    return this.db.transaction(async tx => {
      const node = (await tx.query(
        "SELECT runner_id FROM worker_nodes WHERE runner_id=$1 FOR UPDATE",
        [runnerId]
      )).rows[0];
      if (!node) throw new ConflictException("ไม่พบ Server");

      await tx.query(
        `UPDATE cloud_server_enrollments
         SET revoked_at=now()
         WHERE runner_id=$1 AND used_at IS NULL AND revoked_at IS NULL`,
        [runnerId]
      );
      await tx.query(
        `INSERT INTO cloud_server_enrollments(runner_id,token_hash,expires_at,created_by)
         VALUES($1,$2,$3,$4)`,
        [runnerId, issued.tokenHash, issued.expiresAt, actor]
      );

      return {
        runnerId,
        enrollmentToken: issued.enrollmentToken,
        expiresAt: issued.expiresAt.toISOString()
      };
    });
  }

  async activate(runnerId: string, enrollmentToken: string, hostname?: string) {
    const tokenHash = this.crypto.sha256(enrollmentToken);
    const workerKey = randomBytes(32).toString("base64url");

    return this.db.transaction(async tx => {
      const enrollment = (await tx.query(
        `SELECT id,expires_at
         FROM cloud_server_enrollments
         WHERE runner_id=$1
           AND token_hash=$2
           AND used_at IS NULL
           AND revoked_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [runnerId, tokenHash]
      )).rows[0];

      if (!enrollment || new Date(enrollment.expires_at).getTime() <= Date.now()) {
        throw new UnauthorizedException("Server enrollment ไม่ถูกต้องหรือหมดอายุ");
      }

      const updated = await tx.query(
        `UPDATE worker_nodes
         SET worker_key_hash=$2,
             hostname=COALESCE($3,hostname),
             status='OFFLINE',
             accepting_jobs=false
         WHERE runner_id=$1
         RETURNING runner_id`,
        [
          runnerId,
          this.crypto.sha256(workerKey),
          hostname ? String(hostname).slice(0, 160) : null
        ]
      );
      if (!updated.rowCount) throw new UnauthorizedException("Server enrollment ไม่ถูกต้อง");

      await tx.query(
        "UPDATE cloud_server_enrollments SET used_at=now() WHERE id=$1",
        [enrollment.id]
      );

      return { runnerId, workerKey };
    });
  }
}
