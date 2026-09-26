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
  private readonly enrollmentMinutes = 30;

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
    const runnerId = String(input.runnerId || "").trim();

    return this.db.transaction(async tx => {
      const duplicate = (await tx.query(
        "SELECT runner_id FROM worker_nodes WHERE lower(runner_id)=lower($1) LIMIT 1",
        [runnerId]
      )).rows[0];
      if (duplicate) throw new ConflictException("Runner ID นี้มีแล้ว");

      const result = await tx.query(
        `INSERT INTO worker_nodes(runner_id,region,capacity,monthly_cost,spec,worker_key_hash,status,accepting_jobs)
         VALUES($1,$2,$3,$4,$5,$6,'OFFLINE',false)
         RETURNING runner_id`,
        [runnerId,String(input.region || "Thailand").slice(0,80),input.capacity,input.monthlyCost,String(input.spec || "").slice(0,300),blockedWorkerKeyHash]
      );

      await tx.query(
        `INSERT INTO cloud_server_enrollments(runner_id,token_hash,expires_at,created_by)
         VALUES($1,$2,$3,$4)`,
        [result.rows[0].runner_id,issued.tokenHash,issued.expiresAt,actor]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'CLOUD_SERVER_ENROLLMENT_ISSUED','worker_node',$2,$3)`,
        [actor,result.rows[0].runner_id,JSON.stringify({expiresAt:issued.expiresAt.toISOString(),reason:"CREATE_SERVER"})]
      );
      return {runnerId:result.rows[0].runner_id,enrollmentToken:issued.enrollmentToken,expiresAt:issued.expiresAt.toISOString()};
    });
  }

  async renewEnrollment(runnerId: string, actor: string) {
    const issued = this.issueMaterial();
    return this.db.transaction(async tx => {
      const node = (await tx.query(
        "SELECT runner_id FROM worker_nodes WHERE lower(runner_id)=lower($1) FOR UPDATE",
        [runnerId]
      )).rows[0];
      if (!node) throw new ConflictException("ไม่พบ Server");
      const canonicalRunnerId=String(node.runner_id);

      await tx.query(
        `UPDATE cloud_server_enrollments SET revoked_at=now()
         WHERE runner_id=$1 AND used_at IS NULL AND revoked_at IS NULL`,
        [canonicalRunnerId]
      );
      await tx.query(
        `INSERT INTO cloud_server_enrollments(runner_id,token_hash,expires_at,created_by)
         VALUES($1,$2,$3,$4)`,
        [canonicalRunnerId,issued.tokenHash,issued.expiresAt,actor]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'CLOUD_SERVER_ENROLLMENT_ISSUED','worker_node',$2,$3)`,
        [actor,canonicalRunnerId,JSON.stringify({expiresAt:issued.expiresAt.toISOString(),reason:"RENEW"})]
      );
      return {runnerId:canonicalRunnerId,enrollmentToken:issued.enrollmentToken,expiresAt:issued.expiresAt.toISOString()};
    });
  }

  async activate(runnerId:string,enrollmentToken:string,hostname?:string,requestedWorkerKey?:string) {
    const tokenHash=this.crypto.sha256(enrollmentToken);
    const workerKey=requestedWorkerKey || randomBytes(32).toString("base64url");
    const workerKeyHash=this.crypto.sha256(workerKey);

    return this.db.transaction(async tx => {
      const node=(await tx.query(
        `SELECT runner_id,worker_key_hash FROM worker_nodes
         WHERE lower(runner_id)=lower($1) FOR UPDATE`,
        [runnerId]
      )).rows[0];
      if(!node) throw new UnauthorizedException("ไม่พบ Server ID นี้ใน SCENOVA");
      const canonicalRunnerId=String(node.runner_id);

      const enrollment=(await tx.query(
        `SELECT id,expires_at,used_at,revoked_at FROM cloud_server_enrollments
         WHERE runner_id=$1 AND token_hash=$2
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [canonicalRunnerId,tokenHash]
      )).rows[0];

      if(!enrollment) throw new UnauthorizedException("Enrollment Token ไม่ตรงกับ Server ID นี้ กรุณาใช้รหัสล่าสุดจากหน้า Admin");
      if(enrollment.revoked_at) throw new UnauthorizedException("Enrollment Token นี้ถูกแทนที่แล้ว กรุณาใช้รหัสล่าสุดจากหน้า Admin");
      if(new Date(enrollment.expires_at).getTime()<=Date.now()) throw new UnauthorizedException("Enrollment Token หมดอายุแล้ว กรุณาสร้างรหัสใหม่จากหน้า Admin");

      if(enrollment.used_at) {
        if(requestedWorkerKey && String(node.worker_key_hash || "")===workerKeyHash) {
          return {runnerId:canonicalRunnerId,workerKey,replayed:true};
        }
        throw new UnauthorizedException("Enrollment Token นี้ถูกใช้แล้ว กรุณาสร้างรหัสใหม่จากหน้า Admin");
      }

      const updated=await tx.query(
        `UPDATE worker_nodes SET worker_key_hash=$2,hostname=COALESCE($3,hostname),status='OFFLINE',accepting_jobs=false
         WHERE runner_id=$1 RETURNING runner_id`,
        [canonicalRunnerId,workerKeyHash,hostname?String(hostname).slice(0,160):null]
      );
      if(!updated.rowCount) throw new UnauthorizedException("Server enrollment ไม่ถูกต้อง");

      await tx.query("UPDATE cloud_server_enrollments SET used_at=now() WHERE id=$1",[enrollment.id]);
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES('SERVER_ENROLLMENT','CLOUD_SERVER_ENROLLED','worker_node',$1,$2)`,
        [canonicalRunnerId,JSON.stringify({hostname:hostname?String(hostname).slice(0,160):null})]
      );
      return {runnerId:canonicalRunnerId,workerKey,replayed:false};
    });
  }
}
