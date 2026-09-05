import { Body, Controller, Post, UseGuards } from "@nestjs/common";
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
  }) {
    await this.db.query(
      "INSERT INTO worker_nodes(runner_id,region,hostname,capacity,active_instances,status,last_seen_at) VALUES($1,$2,$3,$4,$5,'ONLINE',now()) ON CONFLICT(runner_id) DO UPDATE SET region=EXCLUDED.region,hostname=EXCLUDED.hostname,capacity=EXCLUDED.capacity,active_instances=EXCLUDED.active_instances,status='ONLINE',last_seen_at=now()",
      [
        body.runnerId,
        body.region || "singapore",
        body.hostname || null,
        Math.max(1, Number(body.capacity || 10)),
        Math.max(0, Number(body.activeInstances || 0))
      ]
    );
    return { ok: true };
  }

  @Post("claim-next")
  async claimNext(@Body() body: { runnerId: string }) {
    const claimed = await this.db.one(
      "UPDATE bot_instances SET runner_id=$1,lock_owner=$1 WHERE id=(SELECT bi.id FROM bot_instances bi JOIN mt5_credentials c ON c.mt5_account_id=bi.mt5_account_id JOIN bot_instance_secrets s ON s.bot_instance_id=bi.id WHERE bi.mode='CLOUD' AND bi.runner_id IS NULL ORDER BY bi.created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",
      [body.runnerId]
    );
    if (!claimed) return { job: null };

    const job = await this.db.one(
      "SELECT bi.id instance_id,bi.desired_state,a.id mt5_account_id,a.account_number,a.broker,a.broker_server,a.mode,c.ciphertext credential_ciphertext,c.iv credential_iv,c.auth_tag credential_tag,s.ciphertext token_ciphertext,s.iv token_iv,s.auth_tag token_tag,bs.settings FROM bot_instances bi JOIN mt5_accounts a ON a.id=bi.mt5_account_id JOIN mt5_credentials c ON c.mt5_account_id=a.id JOIN bot_instance_secrets s ON s.bot_instance_id=bi.id LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id WHERE bi.id=$1",
      [claimed.id]
    );

    return {
      job: {
        instanceId: job.instance_id,
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
      }
    };
  }

  @Post("release")
  async release(@Body() body: { runnerId: string; instanceId: string }) {
    await this.db.query(
      "UPDATE bot_instances SET runner_id=NULL,lock_owner=NULL,actual_state='OFFLINE' WHERE id=$1 AND runner_id=$2 AND desired_state<>'RUNNING'",
      [body.instanceId, body.runnerId]
    );
    return { ok: true };
  }
}
