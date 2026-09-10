import { Body, ConflictException, Controller, Post } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DbService } from "./db.service";
import { isEaVersionExact, latestEaRelease } from "./release-version";
import { CryptoService } from "./security";

const AUTO_ACTION_RETRY_MS = 3 * 60_000;
const START_RECOVERY_RETRY_MS = 35_000;
const ACTION_PENDING_TTL_MS = 15 * 60_000;

type AutoMt5Action = "UPDATE_EA_RESTART" | "CONNECT_MT5";
type AccessState = {
  allowed: boolean;
  source: "OWNER" | "SUBSCRIPTION" | "TRIAL" | "TRIAL_READY" | "NONE";
  trialId?: string;
};

@Controller("ea")
export class AgentActionController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private async authenticatedInstance(instanceId: string, installToken: string) {
    if (!instanceId || installToken.length < 8) {
      throw new ConflictException("invalid agent authentication");
    }

    const instance = await this.db.one(
      `SELECT
         bi.id,
         bi.install_token_hash,
         bi.slot_id,
         bi.mt5_account_id,
         bi.mode,
         bi.desired_state,
         bi.actual_state,
         bi.last_seen_at,
         bi.agent_ea_hash,
         bi.account_change_requested_at,
         bi.pending_account_number,
         bi.pending_broker_server,
         bi.metrics,
         bi.metrics->>'eaVersion' AS ea_version,
         bi.metrics->>'manualMt5ActionName' AS manual_action_name,
         bi.metrics->>'manualMt5ActionId' AS manual_action_id,
         bi.metrics->>'manualMt5ActionRequestedAt' AS manual_action_requested_at,
         bi.metrics->>'manualMt5ActionStatus' AS manual_action_status,
         bi.metrics->>'manualMt5ActionSource' AS manual_action_source,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) AS positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS ea_online,
         COALESCE(ls.assigned_user_id,a.user_id) AS user_id
       FROM bot_instances bi
       LEFT JOIN license_slots ls ON ls.id=bi.slot_id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE bi.id=$1`,
      [instanceId]
    );

    if (!instance || String(instance.install_token_hash || "") !== this.crypto.sha256(installToken)) {
      throw new ConflictException("invalid agent authentication");
    }
    return instance;
  }

  private async accessState(instance: any): Promise<AccessState> {
    const userId = String(instance.user_id || "");
    if (!userId) return { allowed: false, source: "NONE" };

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

    if (instance.slot_id) {
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
        [instance.slot_id, userId, instance.mode]
      );
      if (subscription) {
        return { allowed: true, source: "SUBSCRIPTION" };
      }
    }

    if (instance.mt5_account_id) {
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
        [userId, instance.mt5_account_id]
      );
      if (trial?.status === "APPROVED") {
        return { allowed: true, source: "TRIAL_READY", trialId: trial.id };
      }
      if (trial?.status === "ACTIVE") {
        return { allowed: true, source: "TRIAL" };
      }
    }

    return { allowed: false, source: "NONE" };
  }

  private async completeRecoveredStart(instance: any) {
    const access = await this.accessState(instance);
    if (!access.allowed) {
      await this.db.query(
        `UPDATE bot_instances
         SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
           'startAfterRepairRequested',false,
           'startAfterRepairStatus','FAILED',
           'startAfterRepairMessage','สิทธิ์ Trial/Subscription หมดก่อนซ่อมเสร็จ'
         )
         WHERE id=$1`,
        [instance.id]
      );
      return false;
    }

    if (access.source === "TRIAL_READY" && access.trialId) {
      await this.db.query(
        "UPDATE trial_grants SET status='ACTIVE',started_at=now(),expires_at=now() + (duration_minutes || ' minutes')::interval WHERE id=$1 AND status='APPROVED'",
        [access.trialId]
      );
    }

    const completedAt = new Date().toISOString();
    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='RUNNING',
           lock_owner=id::text,
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'startAfterRepairRequested',false,
             'startAfterRepairStatus','STARTED',
             'startAfterRepairMessage','EA/EX5 ตรวจสอบผ่านแล้ว ระบบ Start บอทให้อัตโนมัติ',
             'startAfterRepairCompletedAt',$2::text,
             'manualMt5ActionStatus','ACKED',
             'manualMt5ActionAckAt',$2::text,
             'manualMt5ActionMessage','Auto Recovery ตรวจสอบ EA ผ่านแล้ว'
           )
       WHERE id=$1`,
      [instance.id, completedAt]
    );
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'START')",
      [instance.id]
    );
    return true;
  }

  private async queueAutomaticAction(
    instance: any,
    action: AutoMt5Action,
    message: string,
    source: "AUTO" | "START_RECOVERY" = "AUTO"
  ) {
    const actionId = randomUUID();
    const requestedAt = new Date().toISOString();
    const previousAttempt = Math.max(
      0,
      Number(instance.metrics?.manualMt5ActionAttempt || 0)
    );
    const attempt = source === "START_RECOVERY" ? previousAttempt + 1 : 1;

    await this.db.query(
      `UPDATE bot_instances
       SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
         'manualMt5ActionName',$2::text,
         'manualMt5ActionId',$3::text,
         'manualMt5ActionRequestedAt',$4::text,
         'manualMt5ActionStatus','PENDING',
         'manualMt5ActionSource',$5::text,
         'manualMt5ActionMessage',$6::text,
         'manualMt5ActionAttempt',$7::int,
         'startAfterRepairStatus',CASE WHEN $5='START_RECOVERY' THEN 'REPAIRING' ELSE COALESCE(metrics->>'startAfterRepairStatus','IDLE') END
       )
       WHERE id=$1`,
      [instance.id, action, actionId, requestedAt, source, message, attempt]
    );

    return { actionId, requestedAt, attempt };
  }

  @Post("agent-actions")
  async actions(@Body() body: { instanceId?: string; installToken?: string }) {
    const instanceId = String(body.instanceId || "").trim();
    const installToken = String(body.installToken || "").trim();
    const instance = await this.authenticatedInstance(instanceId, installToken);

    const requestedAt = instance.account_change_requested_at
      ? new Date(instance.account_change_requested_at)
      : null;
    const accountChangeRequested = Boolean(
      requestedAt &&
      Date.now() - requestedAt.getTime() >= 0 &&
      Date.now() - requestedAt.getTime() <= 30 * 60_000
    );

    const positions = Math.max(0, Number(instance.positions || 0));
    const eaOnline = Boolean(instance.ea_online);
    const safeToRestart =
      String(instance.desired_state || "STOPPED") !== "RUNNING" &&
      (String(instance.actual_state || "STOPPED") !== "RUNNING" || !eaOnline) &&
      positions <= 0;

    const release = latestEaRelease();
    const eaVersionRequired = release.eaVersion;
    const currentEaVersion = String(instance.ea_version || "").trim();
    const currentEaHash = String(instance.agent_ea_hash || "").trim().toLowerCase();
    const requiredEaHash = String(release.sha256 || "").trim().toLowerCase();
    const runtimeReady = isEaVersionExact(currentEaVersion, eaVersionRequired);
    const hashReady = Boolean(requiredEaHash && currentEaHash === requiredEaHash);
    const metrics = instance.metrics || {};
    const recoveryRequested = metrics.startAfterRepairRequested === true;
    const tradingReady =
      metrics.dailyProfitLocked !== true &&
      metrics.terminalConnected !== false &&
      metrics.terminalTradeAllowed !== false &&
      metrics.mqlTradeAllowed !== false &&
      metrics.accountTradeAllowed !== false &&
      metrics.accountTradeExpert !== false;

    // A Start click can now survive an EA update/reconnect. Keep desired_state
    // STOPPED while repair is happening, then atomically issue START only after
    // the live EA runtime AND the EX5 on disk both match the release.
    if (
      recoveryRequested &&
      eaOnline &&
      positions <= 0 &&
      runtimeReady &&
      hashReady &&
      tradingReady
    ) {
      const started = await this.completeRecoveredStart(instance);
      if (started) {
        return {
          ok: true,
          accountChangeRequested,
          accountChangeRequestId: accountChangeRequested && requestedAt
            ? requestedAt.toISOString()
            : "",
          pendingAccountDetected: Boolean(instance.pending_account_number),
          pendingAccountNumber: instance.pending_account_number || null,
          pendingServer: instance.pending_broker_server || null,
          eaOnline: true,
          eaVersion: currentEaVersion || null,
          eaVersionRequired,
          safeToRestart: false,
          positions,
          manualActionPending: false,
          manualActionAllowed: false,
          manualActionName: null,
          manualActionId: null,
          manualActionRequestedAt: null,
          manualActionStatus: "ACKED",
          startRecoveryStarted: true
        };
      }
    }

    const previousRequestedAt = instance.manual_action_requested_at
      ? new Date(instance.manual_action_requested_at)
      : null;
    const previousAgeMs = previousRequestedAt
      ? Date.now() - previousRequestedAt.getTime()
      : Number.POSITIVE_INFINITY;
    let manualActionActive = Boolean(
      instance.manual_action_id &&
      instance.manual_action_name &&
      previousRequestedAt &&
      previousAgeMs >= 0 &&
      previousAgeMs <= ACTION_PENDING_TTL_MS &&
      String(instance.manual_action_status || "PENDING") === "PENDING"
    );

    let manualActionName = manualActionActive
      ? String(instance.manual_action_name || "")
      : "";
    let manualActionId = manualActionActive
      ? String(instance.manual_action_id || "")
      : "";
    let manualActionRequestedAt = manualActionActive && previousRequestedAt
      ? previousRequestedAt.toISOString()
      : null;
    let manualActionStatus = String(instance.manual_action_status || "") || null;

    // Automatic repair is always bounded by Server safety: desired state must
    // not be RUNNING and there must be no open positions. During Start Recovery
    // failed/ACKed restart attempts are retried more quickly so the user does
    // not get stuck behind a stale one-time action.
    if (!manualActionActive && safeToRestart) {
      const runtimeMismatch = !runtimeReady;
      const fileMismatch = !hashReady;

      let automaticAction: AutoMt5Action | null = null;
      let automaticMessage = "";
      if (runtimeMismatch || fileMismatch || (recoveryRequested && !tradingReady)) {
        automaticAction = "UPDATE_EA_RESTART";
        automaticMessage = recoveryRequested
          ? "Start Recovery: EA/EX5 หรือสิทธิ์ Runtime ยังไม่พร้อม ระบบกำลังอัปเดตและรีโหลด MT5 อัตโนมัติ"
          : "SCENOVA Auto Update: ตรวจพบ EA/EX5 ไม่ตรง Server ระบบอนุญาตให้ Agent อัปเดตและรีโหลด MT5 อัตโนมัติเมื่อปลอดภัย";
      } else if (!eaOnline) {
        automaticAction = "CONNECT_MT5";
        automaticMessage = recoveryRequested
          ? "Start Recovery: EA Offline ระบบกำลังเปิด/เชื่อม MT5 และจะ Start ให้อัตโนมัติ"
          : "SCENOVA Auto Connect: EA Offline ขณะบอทหยุดและไม่มี Position ระบบอนุญาตให้ Agent เปิด/เชื่อม MT5 อัตโนมัติ";
      }

      const retryMs = recoveryRequested
        ? START_RECOVERY_RETRY_MS
        : AUTO_ACTION_RETRY_MS;
      const recentlyTriedSameAction = Boolean(
        automaticAction &&
        String(instance.manual_action_name || "") === automaticAction &&
        previousAgeMs >= 0 &&
        previousAgeMs < retryMs &&
        ["ACKED", "FAILED"].includes(
          String(instance.manual_action_status || "").toUpperCase()
        )
      );

      if (automaticAction && !recentlyTriedSameAction) {
        const queued = await this.queueAutomaticAction(
          instance,
          automaticAction,
          automaticMessage,
          recoveryRequested ? "START_RECOVERY" : "AUTO"
        );
        manualActionActive = true;
        manualActionName = automaticAction;
        manualActionId = queued.actionId;
        manualActionRequestedAt = queued.requestedAt;
        manualActionStatus = "PENDING";
      }
    }

    return {
      ok: true,
      accountChangeRequested,
      accountChangeRequestId: accountChangeRequested && requestedAt
        ? requestedAt.toISOString()
        : "",
      pendingAccountDetected: Boolean(instance.pending_account_number),
      pendingAccountNumber: instance.pending_account_number || null,
      pendingServer: instance.pending_broker_server || null,
      eaOnline,
      eaVersion: currentEaVersion || null,
      eaVersionRequired,
      safeToRestart,
      positions,
      manualActionPending: manualActionActive,
      manualActionAllowed: manualActionActive && safeToRestart,
      manualActionName: manualActionActive ? manualActionName : null,
      manualActionId: manualActionActive ? manualActionId : null,
      manualActionRequestedAt,
      manualActionStatus,
      startRecoveryRequested: recoveryRequested
    };
  }

  @Post("agent-actions/ack")
  async acknowledge(
    @Body() body: {
      instanceId?: string;
      installToken?: string;
      actionId?: string;
      status?: string;
      message?: string;
    }
  ) {
    const instanceId = String(body.instanceId || "").trim();
    const installToken = String(body.installToken || "").trim();
    const actionId = String(body.actionId || "").trim();
    const status = String(body.status || "ACKED").trim().toUpperCase();
    const message = String(body.message || "").trim().slice(0, 240);
    if (!actionId) throw new ConflictException("manual action id missing");
    if (status !== "ACKED" && status !== "FAILED") {
      throw new ConflictException("manual action status invalid");
    }

    const instance = await this.authenticatedInstance(instanceId, installToken);
    if (String(instance.manual_action_id || "") !== actionId) {
      throw new ConflictException("manual action no longer active");
    }

    const recoveryRequested = instance.metrics?.startAfterRepairRequested === true;
    const recoveryMessage = recoveryRequested && status === "FAILED"
      ? "Auto Recovery รอบนี้ยังไม่สำเร็จ ระบบจะลองใหม่อัตโนมัติ"
      : message;

    await this.db.query(
      `UPDATE bot_instances
       SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
         'manualMt5ActionStatus',$2::text,
         'manualMt5ActionAckAt',$3::text,
         'manualMt5ActionMessage',$4::text,
         'startAfterRepairStatus',CASE
           WHEN COALESCE((metrics->>'startAfterRepairRequested')::boolean,false) THEN 'REPAIRING'
           ELSE COALESCE(metrics->>'startAfterRepairStatus','IDLE')
         END,
         'startAfterRepairMessage',CASE
           WHEN COALESCE((metrics->>'startAfterRepairRequested')::boolean,false) THEN $4::text
           ELSE COALESCE(metrics->>'startAfterRepairMessage','')
         END
       )
       WHERE id=$1`,
      [instanceId, status, new Date().toISOString(), recoveryMessage]
    );

    return { ok: true, actionId, status };
  }
}
