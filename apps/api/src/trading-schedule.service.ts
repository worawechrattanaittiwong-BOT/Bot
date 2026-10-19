import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { DbService } from "./db.service";
import { BotController } from "./bot.controller";
import { bangkokHour, isRaceSchedule, tradingHourAllowed } from "./trading-schedule-rules";

// Hourly windows are in Bangkok time, not in browser, broker or server local time.

@Injectable()
export class TradingScheduleService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TradingScheduleService.name);
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;
  private readonly retryAt = new Map<string, number>();

  constructor(private readonly db: DbService, private readonly moduleRef: ModuleRef) {}

  onApplicationBootstrap() {
    // API-owned timer works without the web page or the customer's phone.
    // Disjoint rows and DB conditions make repeated checks idempotent.
    this.timer = setInterval(() => { void this.reconcile(); }, 10_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async reconcile() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const rows = (await this.db.query(`
        SELECT bi.id,bi.slot_id,bi.mode,bi.desired_state,bi.actual_state,
               bi.mt5_account_id,bi.last_seen_at,bi.metrics,
               ls.assigned_user_id,ls.status AS slot_status,bs.settings
        FROM bot_instances bi
        JOIN bot_settings bs ON bs.bot_instance_id=bi.id
        JOIN license_slots ls ON ls.id=bi.slot_id
        WHERE bs.settings->>'tradingScheduleEnabled'='true'
          AND canonical_mode_key(bs.settings)='RACE'
          AND bi.mt5_account_id IS NOT NULL
      `)).rows;
      for (const row of rows) {
        try { await this.reconcileOne(row); }
        catch (error: any) {
          this.logger.warn("Trading schedule "+row.id+": "+String(error?.message || error));
        }
      }
    } catch (error:any) {
      this.logger.warn("Trading schedule scan failed: "+String(error?.message || error));
    } finally { this.scanning = false; }
  }

  private hardSafetyLock(metrics:any): boolean {
    return metrics?.dailyLossLocked === true || metrics?.dailyProfitLocked === true ||
      ["DAILY_LOSS_LOCK","DAILY_PROFIT_LOCK","DAILY_PROFIT_GIVEBACK_LOCK",
       "NO_ACCESS","MAINTENANCE"].includes(String(metrics?.executionStatus || "").toUpperCase());
  }

  private async cancelAutoResume(instanceId:string) {
    // Use the same serialized lock as manual Start/Stop. Any hard safety lock
    // revokes the previous schedule-armed intention until the user clicks Start.
    await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740096)");
      await tx.query(
        `UPDATE bot_settings SET settings=settings ||
         '{"tradingScheduleArmed":false,"tradingScheduleResumePending":false}'::jsonb,
         updated_at=now()
         WHERE bot_instance_id=$1
           AND canonical_mode_key(settings)='RACE'
           AND settings->>'tradingScheduleEnabled'='true'
           AND (settings->>'tradingScheduleArmed'='true' OR
                settings->>'tradingScheduleResumePending'='true')`,[instanceId]
      );
    });
  }

  private async reconcileOne(row: any) {
    const hardBlocked=this.hardSafetyLock(row.metrics);
    const allowed = tradingHourAllowed(row.settings);
    if (!allowed) {
      if (row.desired_state === "RUNNING") {
        await this.db.transaction(async tx => {
          await tx.query("SELECT pg_advisory_xact_lock(740096)");
          const r=(await tx.query(`
            SELECT bi.desired_state,bs.settings FROM bot_instances bi
            JOIN bot_settings bs ON bs.bot_instance_id=bi.id
            WHERE bi.id=$1 FOR UPDATE OF bi,bs
          `,[row.id])).rows[0];
          if (!r || !isRaceSchedule(r.settings) || !r.settings?.tradingScheduleEnabled ||
              tradingHourAllowed(r.settings) || r.desired_state !== "RUNNING") return;
          await tx.query(`
            UPDATE bot_settings SET settings=settings ||
              '{"tradingScheduleResumePending":true}'::jsonb,updated_at=now()
            WHERE bot_instance_id=$1 AND settings->>'tradingScheduleArmed'='true'
          `,[row.id]);
          // Unarmed schedules must still block new entries outside the window.
          await tx.query(
            "UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1 AND desired_state='RUNNING'",[row.id]
          );
          await tx.query(
            "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND command='START' AND status IN ('PENDING','DELIVERED')",[row.id]
          );
          await tx.query(
            "INSERT INTO bot_commands(bot_instance_id,command,payload) VALUES($1,'SAFE_STOP',$2::jsonb)",
            [row.id,JSON.stringify({source:"TRADING_SCHEDULE_WINDOW_END",timezone:"Asia/Bangkok",hour:bangkokHour()})]
          );
        });
      }
      if (hardBlocked) await this.cancelAutoResume(row.id);
      return;
    }
    if (hardBlocked) {
      await this.cancelAutoResume(row.id);
      return;
    }
    const s=row.settings;
    if (s?.tradingScheduleArmed !== true || s?.tradingScheduleResumePending !== true ||
      row.desired_state !== "STOPPED" || row.actual_state !== "STOPPED" ||
      row.slot_status !== "ACTIVE" && row.slot_status !== "AVAILABLE" ||
      !row.assigned_user_id || !row.last_seen_at ||
      Date.now()-new Date(row.last_seen_at).getTime() > 20_000 ||
      this.retryAt.get(row.id)! > Date.now()) return;
    // Never infer a flat account from missing or stale metrics.
    const pos=Number(row.metrics?.accountScenovaPositions ?? row.metrics?.positions);
    const pending=Number(row.metrics?.accountScenovaPendingOrders);
    if (!Number.isFinite(pos) || pos!==0 || !Number.isFinite(pending) || pending!==0) return;
    const latest=await this.db.one(`
      SELECT command,payload FROM bot_commands WHERE bot_instance_id=$1
        AND command IN ('START','SAFE_STOP','CLOSE_ALL')
      ORDER BY id DESC LIMIT 1`,[row.id]);
    if (latest?.command !== "SAFE_STOP" ||
        latest?.payload?.source !== "TRADING_SCHEDULE_WINDOW_END") return;
    this.retryAt.set(row.id,Date.now()+30_000);
    // Re-use all the existing entitlement, maintenance, account, runtime and
    // strategy checks of the ordinary customer Start endpoint.
    const controller=this.moduleRef.get(BotController,{strict:false});
    try {
      await controller.start({user:{sub:row.assigned_user_id},scheduleAuto:true},row.slot_id);
    } catch (error:any) {
      const reason=String(error?.message || error);
      // An expired/grant-revoked subscription, maintenance or daily risk lock
      // is a persistent veto. Transient MT5/runtime readiness failures retry.
      if (/หมดอายุ|ยังไม่มี Trial|สิทธิ์กลุ่ม|ปิดชั่วคราว|ปิดปรับปรุง|ปิดอย่างปลอดภัย|Maintenance|FORCE FLAT|DAILY[_ ](?:LOSS|PROFIT)|Daily Loss|Daily Profit/i.test(reason)) {
        await this.cancelAutoResume(row.id);
      }
      this.logger.warn("Auto Start deferred for "+row.id+": "+reason);
    }
  }
}
