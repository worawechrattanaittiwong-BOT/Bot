import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DbService } from "./db.service";
import {
  isEaVersionExact,
  isVersionExact,
  latestEaRelease,
  latestInstallerVersion
} from "./release-version";
import { JwtGuard } from "./security";

type ManualMt5Action = "UPDATE_EA_RESTART" | "CONNECT_MT5";

type AccessState = {
  allowed: boolean;
  source: "OWNER" | "SUBSCRIPTION" | "TRIAL" | "TRIAL_READY" | "NONE";
  trialId?: string;
};

@Controller("bot/mt5")
@UseGuards(JwtGuard)
export class ManualMt5Controller {
  constructor(private readonly db: DbService) {}

  private async accessState(
    userId: string,
    slotId: string,
    mt5AccountId: string,
    mode: string
  ): Promise<AccessState> {
    const user = await this.db.one(
      "SELECT role,status FROM users WHERE id=$1",
      [userId]
    );
    if (
      user?.status === "ACTIVE" &&
      (user.role === "OWNER" || user.role === "ADMIN")
    ) {
      return { allowed: true, source: "OWNER" };
    }

    const subscription = await this.db.one(
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
      [slotId, userId, mode]
    );
    if (subscription) {
      return { allowed: true, source: "SUBSCRIPTION" };
    }

    const trial = await this.db.one(
      `SELECT id,status
       FROM trial_grants
       WHERE user_id=$1
         AND mt5_account_id=$2
         AND (
           status='APPROVED'
           OR (status='ACTIVE' AND expires_at>now())
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, mt5AccountId]
    );
    if (trial?.status === "APPROVED") {
      return { allowed: true, source: "TRIAL_READY", trialId: trial.id };
    }
    if (trial?.status === "ACTIVE") {
      return { allowed: true, source: "TRIAL" };
    }
    return { allowed: false, source: "NONE" };
  }

  private async activateStart(instanceId: string, access: AccessState) {
    if (access.source === "TRIAL_READY" && access.trialId) {
      await this.db.query(
        "UPDATE trial_grants SET status='ACTIVE',started_at=now(),expires_at=now() + (duration_minutes || ' minutes')::interval WHERE id=$1 AND status='APPROVED'",
        [access.trialId]
      );
    }

    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='RUNNING',
           lock_owner=id::text,
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'startAfterRepairRequested',false,
             'startAfterRepairStatus','STARTED',
             'startAfterRepairMessage','EA พร้อมแล้ว ระบบส่งคำสั่ง Start อัตโนมัติ',
             'startAfterRepairCompletedAt',$2::text
           )
       WHERE id=$1`,
      [instanceId, new Date().toISOString()]
    );
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",
      [instanceId]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'START')",
      [instanceId]
    );
  }

  private async localInstance(userId: string, slotId: string) {
    return this.db.one(
      `SELECT
         bi.id,
         bi.slot_id,
         bi.mt5_account_id,
         bi.desired_state,
         bi.actual_state,
         bi.metrics,
         bi.agent_version,
         bi.agent_ea_hash,
         ls.mode,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) AS positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS ea_online,
         (bi.agent_last_seen_at IS NOT NULL AND bi.agent_last_seen_at > now() - interval '90 seconds') AS agent_online
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.status<>'DELETED'
       LIMIT 1`,
      [slotId, userId]
    );
  }

  @Post("recover-start")
  async recoverAndStart(@Req() req: any, @Query("slotId") slotId = "") {
    if (!slotId) throw new BadRequestException("ไม่พบ Slot ที่เลือก");
    const instance = await this.localInstance(req.user.sub, slotId);
    if (!instance) throw new ConflictException("ไม่พบการติดตั้ง SCENOVA ของ Slot นี้");
    if (String(instance.mode || "").toUpperCase() !== "LOCAL") {
      throw new ConflictException("Auto Recovery ใช้กับ Local MT5 เท่านั้น");
    }
    if (!instance.mt5_account_id) {
      throw new ConflictException("ยังไม่พบบัญชี MT5 ของ Slot นี้");
    }

    const access = await this.accessState(
      req.user.sub,
      slotId,
      instance.mt5_account_id,
      instance.mode
    );
    if (!access.allowed) {
      throw new ConflictException("ต้องมี Trial หรือ Subscription ที่ใช้งานได้ก่อนเริ่มบอท");
    }

    const positions = Math.max(0, Number(instance.positions || 0));
    if (positions > 0) {
      throw new ConflictException("มี Position ค้างอยู่ ระบบจะไม่รีสตาร์ท MT5 ระหว่างมีออเดอร์");
    }
    if (!instance.agent_online) {
      throw new ConflictException("Windows Agent ยังไม่ออนไลน์ กรุณาเปิด SCENOVA Agent ก่อน");
    }
    if (!isVersionExact(instance.agent_version, latestInstallerVersion())) {
      throw new ConflictException(
        "Windows Agent เก่าเกินกว่าจะซ่อมอัตโนมัติ กรุณาติดตั้ง SCENOVA รุ่นล่าสุด 1 ครั้ง"
      );
    }

    const metrics = instance.metrics || {};
    if (metrics.dailyProfitLocked === true) {
      throw new ConflictException("วันนี้บอทถึงเป้ากำไรที่ตั้งไว้แล้ว ระบบยังคงล็อกตาม Daily Profit");
    }
    if (metrics.accountTradeAllowed === false) {
      throw new ConflictException("บัญชี MT5 นี้ไม่อนุญาตให้เทรด");
    }
    if (metrics.accountTradeExpert === false) {
      throw new ConflictException("บัญชี MT5 นี้ไม่อนุญาตให้ Expert Advisor เทรด");
    }

    const release = latestEaRelease();
    const requiredHash = String(release.sha256 || "").trim().toLowerCase();
    if (!requiredHash) {
      throw new ConflictException("Server ยังไม่มี EX5 Release ที่ตรวจสอบ Hash ได้");
    }

    const runningVersion = String(metrics.eaVersion || "").trim();
    const diskHash = String(instance.agent_ea_hash || "").trim().toLowerCase();
    const runtimeReady = isEaVersionExact(runningVersion, release.eaVersion);
    const hashReady = diskHash === requiredHash;
    const eaOnline = Boolean(instance.ea_online);
    const tradingReady =
      metrics.terminalConnected !== false &&
      metrics.terminalTradeAllowed !== false &&
      metrics.mqlTradeAllowed !== false;

    if (eaOnline && runtimeReady && hashReady && tradingReady) {
      await this.activateStart(instance.id, access);
      return {
        ok: true,
        state: "RUNNING",
        recoveryRequired: false,
        message: "EA พร้อมใช้งานแล้ว ระบบเริ่มบอทให้ทันที"
      };
    }

    // Runtime/hash/trading repair must never create an automatic MT5 reload.
    // The dedicated Update EA button creates the only UPDATE_EA_RESTART action,
    // so one customer click maps to one action id and at most one restart.
    if (!runtimeReady || !hashReady || !tradingReady) {
      throw new ConflictException(
        "EA ยังไม่พร้อม กรุณากดปุ่ม “อัปเดต EA” 1 ครั้ง ระบบจะติดตั้งและรีโหลด MT5 เพียง 1 รอบ หากไม่สำเร็จระบบจะหยุดรอการกดใหม่"
      );
    }

    // At this point the EA binary/runtime is current; recovery is only allowed
    // to reconnect an offline MT5. It does not perform an EA update/reload.
    const action: ManualMt5Action = "CONNECT_MT5";
    const actionId = randomUUID();
    const requestedAt = new Date().toISOString();
    const message =
      "Start Recovery: EA/MT5 Offline · ระบบจะเปิดหรือเชื่อม MT5 1 ครั้ง และจะ Start บอทให้อัตโนมัติเมื่อตรวจสอบผ่าน";

    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='STOPPED',
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'startAfterRepairRequested',true,
             'startAfterRepairRequestedAt',$2::text,
             'startAfterRepairStatus','REPAIRING',
             'startAfterRepairMessage',$3::text,
             'manualMt5ActionName',$4::text,
             'manualMt5ActionId',$5::text,
             'manualMt5ActionRequestedAt',$2::text,
             'manualMt5ActionStatus','PENDING',
             'manualMt5ActionSource','START_RECOVERY',
             'manualMt5ActionMessage',$3::text,
             'manualMt5ActionAttempt',1
           )
       WHERE id=$1`,
      [instance.id, requestedAt, message, action, actionId]
    );
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",
      [instance.id]
    );

    return {
      ok: true,
      state: "REPAIRING",
      recoveryRequired: true,
      action,
      actionId,
      requiredEaVersion: release.eaVersion,
      message
    };
  }

  @Post("manual-action")
  async requestAction(
    @Req() req: any,
    @Query("slotId") slotId = "",
    @Body() body: { action?: string }
  ) {
    const action = String(body?.action || "").trim().toUpperCase() as ManualMt5Action;
    if (action !== "UPDATE_EA_RESTART" && action !== "CONNECT_MT5") {
      throw new BadRequestException("คำสั่ง MT5 ไม่ถูกต้อง");
    }
    if (!slotId) throw new BadRequestException("ไม่พบ Slot ที่เลือก");

    const instance = await this.localInstance(req.user.sub, slotId);
    if (!instance) throw new ConflictException("ไม่พบการติดตั้ง SCENOVA ของ Slot นี้");
    if (String(instance.mode || "").toUpperCase() !== "LOCAL") {
      throw new ConflictException("ปุ่มนี้ใช้กับ Local MT5 เท่านั้น");
    }
    if (!instance.agent_online) {
      throw new ConflictException("Windows Agent ยังไม่ออนไลน์ กรุณาเปิดหรือติดตั้ง SCENOVA Agent ก่อน");
    }

    const positions = Math.max(0, Number(instance.positions || 0));
    if (positions > 0) {
      throw new ConflictException("มีออเดอร์ค้างอยู่ กรุณาปิดออเดอร์ให้หมดก่อนดำเนินการ");
    }

    const actionId = randomUUID();
    const requestedAt = new Date().toISOString();
    const message = action === "UPDATE_EA_RESTART"
      ? "รับคำสั่งอัปเดต EA แล้ว ระบบจะหยุดบอทอย่างปลอดภัยและรีสตาร์ท MT5 1 ครั้ง ถ้าไม่สำเร็จจะหยุดรอการกดใหม่"
      : "รับคำสั่งเชื่อมต่อ MT5 แล้ว ระบบจะเปิดหรือรีสตาร์ท MT5 1 ครั้งเพื่อเชื่อมต่อใหม่";

    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='SAFE_STOP',
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'startAfterRepairRequested',false,
             'startAfterRepairStatus','IDLE',
             'manualMt5ActionName',$2::text,
             'manualMt5ActionId',$3::text,
             'manualMt5ActionRequestedAt',$4::text,
             'manualMt5ActionStatus','PENDING',
             'manualMt5ActionSource','USER',
             'manualMt5ActionMessage',$5::text
           )
       WHERE id=$1`,
      [instance.id, action, actionId, requestedAt, message]
    );

    // The restart gate requires actual_state to leave RUNNING. Merely changing
    // desired_state was not enough because an online EA could remain RUNNING
    // indefinitely with no matching control command. Deliver one SAFE_STOP so
    // the EA acknowledges a restart-safe state; no position is force-closed.
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
      [instance.id]
    );

    return {
      ok: true,
      action,
      actionId,
      status: "PENDING",
      message
    };
  }
}
