import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { AdminGuard, CryptoService } from "./security";

const TEST_SLOT_LABEL = "SCENOVA Cloud Test";

@Controller("admin/cloud-test")
@UseGuards(AdminGuard)
export class CloudTestController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private requireJwtAdmin(req: any) {
    const userId = String(req?.user?.sub || "");
    const role = String(req?.user?.role || "");
    if (!userId || (role !== "OWNER" && role !== "ADMIN")) {
      throw new ForbiddenException("Owner/Admin login is required for Cloud Test Mode");
    }
    return {
      userId,
      actor: String(req?.user?.code || req?.user?.user_code || role).slice(0, 160)
    };
  }

  private async testState(userId: string) {
    return this.db.one(
      `SELECT
         ls.id slot_id,ls.status slot_status,ls.label,ls.created_at slot_created_at,
         bi.id instance_id,bi.runner_id,bi.desired_state,bi.actual_state,bi.last_seen_at,
         bi.provisioning_error,bi.metrics,
         a.id mt5_account_id,a.account_number,a.broker,a.broker_server,
         CASE WHEN c.mt5_account_id IS NULL THEN false ELSE true END credential_ready
       FROM license_slots ls
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       LEFT JOIN mt5_credentials c ON c.mt5_account_id=a.id
       WHERE ls.owner_user_id=$1
         AND ls.assigned_user_id=$1
         AND ls.mode='CLOUD'
         AND ls.slot_type='OWNER'
         AND ls.label=$2
       ORDER BY ls.created_at DESC
       LIMIT 1`,
      [userId, TEST_SLOT_LABEL]
    );
  }

  @Get()
  async status(@Req() req: any, @Query("runnerId") runnerId = "") {
    const { userId } = this.requireJwtAdmin(req);
    const nodes = (await this.db.query(
      `SELECT w.runner_id,w.region,w.hostname,w.capacity,w.active_instances,w.accepting_jobs,
        w.telemetry,w.last_seen_at,COALESCE(l.occupied,0) occupied,
        CASE WHEN w.last_seen_at>now()-interval '30 seconds' THEN 'ONLINE' ELSE 'OFFLINE' END health
       FROM worker_nodes w
       LEFT JOIN cloud_node_load l USING(runner_id)
       ORDER BY w.created_at`
    )).rows;
    const test = await this.testState(userId);
    const selectedRunnerId = String(runnerId || test?.runner_id || nodes[0]?.runner_id || "");
    const node = nodes.find((item: any) => item.runner_id === selectedRunnerId) || null;
    const eaOnline = Boolean(test?.last_seen_at && Date.now() - new Date(test.last_seen_at).getTime() < 30_000);
    const used = node ? Math.max(Number(node.occupied || 0), Number(node.active_instances || 0)) : 0;

    return {
      mode: "OWNER_TEST_ONLY",
      warning: "Use a Demo MT5 account only. Preparing a test never sends START.",
      selectedRunnerId,
      nodes,
      test: test ? { ...test, ea_online: eaOnline } : null,
      checks: {
        nodeSelected: Boolean(node),
        nodeOnline: node?.health === "ONLINE",
        templateReady: node?.telemetry?.templateReady === true,
        capacityAvailable: Boolean(node && used < Number(node.capacity || 0)),
        testPrepared: Boolean(test?.instance_id && test?.mt5_account_id && test?.credential_ready),
        assignedToWorker: Boolean(test?.runner_id),
        provisioningHealthy: Boolean(test?.instance_id && !test?.provisioning_error),
        eaOnline
      }
    };
  }

  @Post("prepare")
  async prepare(
    @Req() req: any,
    @Body() body: {
      runnerId: string;
      accountNumber: string;
      broker?: string;
      brokerServer: string;
      tradingPassword: string;
      confirmDemo: boolean;
    }
  ) {
    const { userId, actor } = this.requireJwtAdmin(req);
    const runnerId = String(body.runnerId || "").trim();
    const accountNumber = String(body.accountNumber || "").trim();
    const brokerServer = String(body.brokerServer || "").trim();
    const broker = String(body.broker || "Demo MT5").trim().slice(0, 80) || "Demo MT5";
    const tradingPassword = String(body.tradingPassword || "");

    if (body.confirmDemo !== true) throw new BadRequestException("Confirm that this is a Demo MT5 account");
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(runnerId)) throw new BadRequestException("Invalid Runner ID");
    if (!/^[0-9]{3,64}$/.test(accountNumber)) throw new BadRequestException("Demo MT5 Login must contain digits only");
    if (!brokerServer || brokerServer.length > 160 || /[\r\n\x00]/.test(brokerServer)) throw new BadRequestException("Invalid broker server");
    if (!tradingPassword || tradingPassword.length > 256 || /[\r\n\x00]/.test(tradingPassword)) throw new BadRequestException("Invalid Trading Password");

    const prepared = await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740092)");

      const user = (await tx.query(
        "SELECT id,role,status FROM users WHERE id=$1 FOR UPDATE",
        [userId]
      )).rows[0];
      if (!user || user.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(user.role)) {
        throw new ForbiddenException("Owner/Admin account is not active");
      }

      const node = (await tx.query(
        `SELECT w.*,COALESCE(l.occupied,0) occupied
         FROM worker_nodes w
         LEFT JOIN cloud_node_load l USING(runner_id)
         WHERE w.runner_id=$1
         FOR UPDATE OF w`,
        [runnerId]
      )).rows[0];
      if (!node) throw new BadRequestException("Cloud Worker not found");
      if (!node.last_seen_at || Date.now() - new Date(node.last_seen_at).getTime() > 30_000) {
        throw new ConflictException("Cloud Worker is offline");
      }
      if (node.telemetry?.templateReady !== true) {
        throw new ConflictException("MT5 template is not verified on this Worker");
      }
      if (Math.max(Number(node.occupied || 0), Number(node.active_instances || 0)) >= Number(node.capacity || 0)) {
        throw new ConflictException("This Worker has no free test capacity");
      }

      let slot = (await tx.query(
        `SELECT * FROM license_slots
         WHERE owner_user_id=$1 AND assigned_user_id=$1
           AND mode='CLOUD' AND slot_type='OWNER' AND label=$2
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [userId, TEST_SLOT_LABEL]
      )).rows[0];

      if (!slot) {
        slot = (await tx.query(
          `INSERT INTO license_slots(
             owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label
           )
           SELECT $1,$1,NULL,'CLOUD',COALESCE(MAX(slot_number),0)+1,'OWNER','ACTIVE',$2
           FROM license_slots WHERE owner_user_id=$1 AND mode='CLOUD'
           RETURNING *`,
          [userId, TEST_SLOT_LABEL]
        )).rows[0];
      }

      let instance = (await tx.query(
        `SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions
         FROM bot_instances bi WHERE bi.slot_id=$1 FOR UPDATE`,
        [slot.id]
      )).rows[0];

      if (instance) {
        if (instance.mode !== "CLOUD") throw new ConflictException("Test slot mode is not CLOUD");
        if (instance.runner_id) {
          throw new ConflictException("Test instance is already bound to a VPS. Do not overwrite it; verify the old terminal is stopped first.");
        }
        if (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING" || Number(instance.positions || 0) > 0) {
          throw new ConflictException("Test instance is not safe to reconfigure");
        }
      }

      const activeIdentity = (await tx.query(
        `SELECT * FROM mt5_accounts
         WHERE lower(account_number)=lower($1)
           AND lower(broker_server)=lower($2)
           AND status='ACTIVE'
         LIMIT 1 FOR UPDATE`,
        [accountNumber, brokerServer]
      )).rows[0];
      if (activeIdentity && activeIdentity.user_id !== userId) {
        throw new ConflictException("This MT5 identity is already active on another SCENOVA account");
      }
      if (activeIdentity) {
        const attached = (await tx.query(
          "SELECT id,slot_id FROM bot_instances WHERE mt5_account_id=$1 LIMIT 1 FOR UPDATE",
          [activeIdentity.id]
        )).rows[0];
        if (attached && attached.slot_id !== slot.id) {
          throw new ConflictException("This MT5 identity is already attached to another SCENOVA slot");
        }
      }

      let account = activeIdentity || (await tx.query(
        `SELECT * FROM mt5_accounts
         WHERE user_id=$1 AND lower(account_number)=lower($2) AND lower(broker_server)=lower($3)
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [userId, accountNumber, brokerServer]
      )).rows[0];

      if (instance?.mt5_account_id && (!account || instance.mt5_account_id !== account.id)) {
        await tx.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [instance.mt5_account_id]);
      }

      if (account) {
        account = (await tx.query(
          "UPDATE mt5_accounts SET broker=$2,mode='CLOUD',status='ACTIVE' WHERE id=$1 RETURNING *",
          [account.id, broker]
        )).rows[0];
      } else {
        account = (await tx.query(
          "INSERT INTO mt5_accounts(user_id,account_number,broker,broker_server,mode,status) VALUES($1,$2,$3,$4,'CLOUD','ACTIVE') RETURNING *",
          [userId, accountNumber, broker, brokerServer]
        )).rows[0];
      }

      const installToken = randomBytes(32).toString("hex");
      const credential = this.crypto.encrypt(tradingPassword);
      const tokenSecret = this.crypto.encrypt(installToken);

      await tx.query(
        `INSERT INTO mt5_credentials(mt5_account_id,ciphertext,iv,auth_tag)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(mt5_account_id) DO UPDATE SET
           ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,updated_at=now()`,
        [account.id, credential.ciphertext, credential.iv, credential.authTag]
      );

      if (instance) {
        instance = (await tx.query(
          `UPDATE bot_instances SET
             mt5_account_id=$2,mode='CLOUD',install_token_hash=$3,
             desired_state='STOPPED',actual_state='OFFLINE',runner_id=$4,lock_owner=$4,
             last_seen_at=NULL,provisioning_error=NULL,metrics='{}'::jsonb
           WHERE id=$1 RETURNING *`,
          [instance.id, account.id, this.crypto.sha256(installToken), runnerId]
        )).rows[0];
      } else {
        instance = (await tx.query(
          `INSERT INTO bot_instances(
             slot_id,mt5_account_id,mode,install_token_hash,desired_state,actual_state,runner_id,lock_owner
           ) VALUES($1,$2,'CLOUD',$3,'STOPPED','OFFLINE',$4,$4) RETURNING *`,
          [slot.id, account.id, this.crypto.sha256(installToken), runnerId]
        )).rows[0];
      }

      await tx.query(
        `INSERT INTO bot_instance_secrets(bot_instance_id,ciphertext,iv,auth_tag)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(bot_instance_id) DO UPDATE SET
           ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag`,
        [instance.id, tokenSecret.ciphertext, tokenSecret.iv, tokenSecret.authTag]
      );
      await tx.query(
        "INSERT INTO bot_settings(bot_instance_id) VALUES($1) ON CONFLICT(bot_instance_id) DO NOTHING",
        [instance.id]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES($1,'OWNER_CLOUD_TEST_PREPARED','bot_instance',$2,$3::jsonb)`,
        [actor, instance.id, JSON.stringify({ slotId: slot.id, runnerId, accountNumber, brokerServer, desiredState: "STOPPED" })]
      );

      return {
        slotId: slot.id,
        instanceId: instance.id,
        mt5AccountId: account.id,
        runnerId,
        desiredState: "STOPPED"
      };
    });

    return {
      ok: true,
      ...prepared,
      note: "Provisioning is queued on the selected Worker in STOPPED state. No START command was sent."
    };
  }
}
