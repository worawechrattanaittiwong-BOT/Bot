import { Body, ConflictException, Controller, Post } from "@nestjs/common";
import { DbService } from "./db.service";
import { isEaVersionExact, latestEaRelease } from "./release-version";
import { CryptoService } from "./security";

const ACTION_PENDING_TTL_MS = 15 * 60_000;

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
    let recoveryRequested = metrics.startAfterRepairRequested === true;
    const tradingReady =
      metrics.dailyProfitLocked !== true &&
      metrics.terminalConnected !== false &&
      metrics.terminalTradeAllowed !== false &&
      metrics.mqlTradeAllowed !== false &&
      metrics.accountTradeAllowed !== false &&
      metrics.accountTradeExpert !== false;

    // START_RECOVERY is now reconnect-only. Completing recovery is allowed only
    // after its one CONNECT_MT5 action is ACKed; it can never complete or create
    // an EA update restart path.
    if (
      recoveryRequested &&
      String(instance.manual_action_source || "") === "START_RECOVERY" &&
      String(instance.manual_action_name || "").toUpperCase() === "CONNECT_MT5" &&
      String(instance.manual_action_status || "").toUpperCase() === "ACKED" &&
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
    const actionStatus = String(instance.manual_action_status || "").toUpperCase();
    const actionSource = String(instance.manual_action_source || "").toUpperCase();
    const actionName = String(instance.manual_action_name || "").toUpperCase();
    const sourceIsUserAuthorized =
      actionSource === "USER" ||
      (actionSource === "START_RECOVERY" && actionName === "CONNECT_MT5");
    const stalePending = Boolean(
      instance.manual_action_id &&
      instance.manual_action_name &&
      previousRequestedAt &&
      previousAgeMs > ACTION_PENDING_TTL_MS &&
      actionStatus === "PENDING"
    );
    const legacyAutomaticPending = Boolean(
      instance.manual_action_id &&
      actionStatus === "PENDING" &&
      !sourceIsUserAuthorized
    );

    // UPDATE_EA_RESTART is valid only when it came from the dedicated USER
    // button. Cancel old/background update actions and expire one-time requests
    // instead of retrying them. A new EA reload always needs a fresh click/new id.
    if (stalePending || legacyAutomaticPending) {
      const failureMessage = legacyAutomaticPending
        ? "ยกเลิกคำสั่งรีโหลด EA อัตโนมัติเดิมแล้ว กรุณากดปุ่มอัปเดต EA 1 ครั้งเมื่อต้องการ"
        : "คำสั่งหมดเวลารอ ระบบยกเลิกแล้ว กรุณากดใหม่เมื่อต้องการ";
      await this.db.query(
        `UPDATE bot_instances
         SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
           'manualMt5ActionStatus','FAILED',
           'manualMt5ActionAckAt',$2::text,
           'manualMt5ActionMessage',$3::text,
           'startAfterRepairRequested',false,
           'startAfterRepairStatus','FAILED',
           'startAfterRepairMessage',$3::text
         )
         WHERE id=$1`,
        [instance.id, new Date().toISOString(), failureMessage]
      );
      recoveryRequested = false;
    }

    const manualActionActive = Boolean(
      sourceIsUserAuthorized &&
      !stalePending &&
      !legacyAutomaticPending &&
      instance.manual_action_id &&
      instance.manual_action_name &&
      previousRequestedAt &&
      previousAgeMs >= 0 &&
      previousAgeMs <= ACTION_PENDING_TTL_MS &&
      String(instance.manual_action_status || "PENDING") === "PENDING"
    );

    const manualActionName = manualActionActive
      ? String(instance.manual_action_name || "")
      : "";
    const manualActionId = manualActionActive
      ? String(instance.manual_action_id || "")
      : "";
    const manualActionRequestedAt = manualActionActive && previousRequestedAt
      ? previousRequestedAt.toISOString()
      : null;
    const manualActionStatus = String(instance.manual_action_status || "") || null;

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
    const recoveryFailed = recoveryRequested && status === "FAILED";
    const recoveryMessage = recoveryFailed
      ? "การซ่อม EA รอบนี้ไม่สำเร็จและหยุดแล้ว กรุณาตรวจ MT5 แล้วกดใหม่เมื่อต้องการ"
      : message;

    await this.db.query(
      `UPDATE bot_instances
       SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
         'manualMt5ActionStatus',$2::text,
         'manualMt5ActionAckAt',$3::text,
         'manualMt5ActionMessage',$4::text,
         'startAfterRepairRequested',CASE
           WHEN $5::boolean THEN false
           ELSE COALESCE((metrics->>'startAfterRepairRequested')::boolean,false)
         END,
         'startAfterRepairStatus',CASE
           WHEN $5::boolean THEN 'FAILED'
           WHEN COALESCE((metrics->>'startAfterRepairRequested')::boolean,false) AND $2='ACKED' THEN 'VERIFYING'
           WHEN COALESCE((metrics->>'startAfterRepairRequested')::boolean,false) THEN 'REPAIRING'
           ELSE COALESCE(metrics->>'startAfterRepairStatus','IDLE')
         END,
         'startAfterRepairMessage',CASE
           WHEN COALESCE((metrics->>'startAfterRepairRequested')::boolean,false) THEN $4::text
           ELSE COALESCE(metrics->>'startAfterRepairMessage','')
         END
       )
       WHERE id=$1`,
      [instanceId, status, new Date().toISOString(), recoveryMessage, recoveryFailed]
    );

    return { ok: true, actionId, status };
  }
}
