import { ConflictException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DbService } from "./db.service";

export type MaintenanceStatus = "OFF" | "SCHEDULED" | "DRAINING" | "MAINTENANCE";

@Injectable()
export class MaintenanceService {
  constructor(private readonly db: DbService) {}

  private async row() {
    return this.db.one(
      `SELECT id,status,title,message,maintenance_at,force_close_at,expected_resume_at,
              force_close,announced_at,drain_started_at,maintenance_started_at,resumed_at,
              updated_by,updated_at
       FROM system_maintenance
       WHERE id=1`
    );
  }

  private blockStarts(status: MaintenanceStatus) {
    return status === "DRAINING" || status === "MAINTENANCE";
  }

  private runtimeCte() {
    return `WITH runtime AS (
      SELECT
        bi.*,
        COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)::int AS reported_positions,
        COALESCE(NULLIF(bi.metrics->>'lastServerContactAt','')::double precision,0) AS mt5_report_epoch,
        CASE
          WHEN COALESCE(NULLIF(bi.metrics->>'lastServerContactAt','')::double precision,0)>0
            THEN COALESCE(NULLIF(bi.metrics->>'lastServerContactAt','')::double precision,0)
                 > extract(epoch from now() - interval '20 seconds')
          ELSE bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds'
        END AS mt5_fresh
      FROM bot_instances bi
    )`;
  }

  /**
   * Global Hard Maintenance is Server-authoritative. Once OWNER/ADMIN closes the
   * platform, no Bot instance may keep the platform in DRAINING. We revoke all
   * RUNNING desires in one DB operation and queue CLOSE_ALL for every instance.
   * Offline terminals cannot veto Maintenance; when they reconnect the pending
   * CLOSE_ALL plus desired_state=STOPPED prevents a new trading round.
   */
  private async hardStopAll(actor: string, reason: string) {
    const forcedAt = new Date().toISOString();
    const forcedBy = actor.slice(0, 120);
    const before = await this.db.one(
      `${this.runtimeCte()}
       SELECT
         COUNT(*)::int AS total_instances,
         COUNT(*) FILTER (WHERE desired_state='RUNNING' OR actual_state='RUNNING')::int AS running_instances,
         COALESCE(SUM(reported_positions),0)::int AS reported_positions
       FROM runtime`
    );

    // Invalidate every old control command first so a stale START can never win
    // after the Admin has closed the platform.
    await this.db.query(
      `UPDATE bot_commands
       SET status='ACKED',acked_at=COALESCE(acked_at,now())
       WHERE status IN ('PENDING','DELIVERED')
         AND command IN ('START','SAFE_STOP','CLOSE_ALL')`
    );

    await this.db.query(
      "UPDATE bot_instances SET desired_state='STOPPED' WHERE desired_state<>'STOPPED'"
    );

    await this.db.query(
      `INSERT INTO bot_commands(bot_instance_id,command,payload)
       SELECT id,'CLOSE_ALL',$1::jsonb
       FROM bot_instances`,
      [JSON.stringify({
        source: "SYSTEM_HARD_MAINTENANCE",
        actor: forcedBy,
        reason,
        forcedAt
      })]
    );

    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'GLOBAL_HARD_MAINTENANCE_STOP','system','maintenance',$2::jsonb)",
      [
        forcedBy,
        JSON.stringify({
          reason,
          forcedAt,
          totalInstances: Number(before?.total_instances || 0),
          runningInstances: Number(before?.running_instances || 0),
          reportedPositions: Number(before?.reported_positions || 0)
        })
      ]
    );

    return {
      totalInstances: Number(before?.total_instances || 0),
      runningInstances: Number(before?.running_instances || 0),
      reportedPositions: Number(before?.reported_positions || 0)
    };
  }

  async current() {
    let current = await this.row();
    if (!current) throw new Error("system_maintenance row missing");

    if (current.status === "SCHEDULED") {
      const triggerAt = current.force_close_at || current.maintenance_at;
      if (triggerAt && new Date(triggerAt).getTime() <= Date.now()) {
        const transitioned = await this.db.one(
          `UPDATE system_maintenance
           SET status='MAINTENANCE',
               title='ปิดระบบเพื่ออัปเดต',
               message=COALESCE(NULLIF(message,''),'ระบบปิดปรับปรุงชั่วคราว'),
               drain_started_at=COALESCE(drain_started_at,now()),
               maintenance_started_at=COALESCE(maintenance_started_at,now()),
               updated_at=now()
           WHERE id=1 AND status='SCHEDULED'
           RETURNING updated_by`
        );
        if (transitioned) {
          await this.hardStopAll(
            String(transitioned.updated_by || "SYSTEM_MAINTENANCE"),
            "SCHEDULED_MAINTENANCE_DUE"
          );
        }
        current = await this.row();
      }
    }

    // Compatibility recovery for an older deployment that is already stuck in
    // DRAINING. The first request upgrades it to hard MAINTENANCE immediately.
    if (current.status === "DRAINING") {
      const transitioned = await this.db.one(
        `UPDATE system_maintenance
         SET status='MAINTENANCE',
             maintenance_started_at=COALESCE(maintenance_started_at,now()),
             updated_at=now()
         WHERE id=1 AND status='DRAINING'
         RETURNING updated_by`
      );
      if (transitioned) {
        await this.hardStopAll(
          String(transitioned.updated_by || "SYSTEM_MAINTENANCE"),
          "LEGACY_DRAINING_RECOVERY"
        );
      }
      current = await this.row();
    }

    return {
      ...current,
      blockStarts: this.blockStarts(current.status as MaintenanceStatus)
    };
  }

  async snapshot() {
    const current = await this.current();
    const summary = await this.db.one(
      `${this.runtimeCte()}
       SELECT
         COUNT(*)::int AS total_instances,
         COUNT(*) FILTER (
           WHERE desired_state='RUNNING'
              OR (mt5_fresh AND actual_state='RUNNING')
         )::int AS running_instances,
         COUNT(*) FILTER (WHERE reported_positions>0)::int AS instances_with_positions,
         COALESCE(SUM(reported_positions),0)::int AS open_positions,
         COUNT(*) FILTER (WHERE NOT mt5_fresh AND reported_positions>0)::int AS stale_position_instances,
         COALESCE(SUM(CASE WHEN NOT mt5_fresh THEN reported_positions ELSE 0 END),0)::int AS stale_reported_positions
       FROM runtime`
    );

    // This list is telemetry only. It never blocks global Maintenance anymore.
    const blockers = await this.db.query(
      `${this.runtimeCte()}
       SELECT
         r.id AS instance_id,
         u.user_code,
         a.account_number,
         a.broker_server,
         r.actual_state,
         r.desired_state,
         r.last_seen_at,
         r.reported_positions AS positions,
         r.mt5_fresh AS positions_fresh
       FROM runtime r
       LEFT JOIN license_slots ls ON ls.id=r.slot_id
       LEFT JOIN users u ON u.id=COALESCE(ls.assigned_user_id,ls.owner_user_id)
       LEFT JOIN mt5_accounts a ON a.id=r.mt5_account_id
       WHERE r.desired_state='RUNNING'
          OR (r.mt5_fresh AND r.actual_state='RUNNING')
          OR r.reported_positions>0
       ORDER BY r.reported_positions DESC,r.last_seen_at DESC NULLS LAST
       LIMIT 1000`
    );

    return {
      ...current,
      summary: {
        totalInstances: Number(summary?.total_instances || 0),
        runningInstances: Number(summary?.running_instances || 0),
        instancesWithPositions: Number(summary?.instances_with_positions || 0),
        openPositions: Number(summary?.open_positions || 0),
        stalePositionInstances: Number(summary?.stale_position_instances || 0),
        staleReportedPositions: Number(summary?.stale_reported_positions || 0)
      },
      blockers: blockers.rows,
      // Kept for API compatibility with the existing Owner UI.
      staleReports: blockers.rows.filter((row: any) => row.positions_fresh === false && Number(row.positions || 0) > 0)
    };
  }

  /**
   * OWNER/ADMIN force-close is authoritative per account. It immediately puts
   * the Server-side control state at STOPPED/0 and still queues CLOSE_ALL so an
   * online or later-reconnecting EA closes anything that really exists at MT5.
   * A later heartbeat may report a real non-zero Position again; desired_state
   * remains STOPPED and CLOSE_ALL remains the authoritative command.
   */
  async forceCloseInstance(instanceId: string, actor: string) {
    const id = String(instanceId || "").trim();
    if (!id) throw new ConflictException("ไม่พบ Bot Instance ที่ต้องการบังคับปิด");

    const instance = await this.db.one(
      `SELECT bi.id,bi.actual_state,bi.desired_state,bi.last_seen_at,
              COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)::int AS positions,
              u.user_code,a.account_number,a.broker_server
       FROM bot_instances bi
       LEFT JOIN license_slots ls ON ls.id=bi.slot_id
       LEFT JOIN users u ON u.id=COALESCE(ls.assigned_user_id,ls.owner_user_id)
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE bi.id=$1`,
      [id]
    );
    if (!instance) throw new ConflictException("ไม่พบบัญชี/บอทนี้ในระบบ");

    const forcedAt = new Date().toISOString();
    const forcedBy = actor.slice(0, 120);
    const previousPositions = Number(instance.positions || 0);

    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='STOPPED',
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'lastKnownPositionsBeforeAdminForceClose',$1::int,
             'positions',0,
             'positionsReconciledAt',$2::text,
             'positionsReconcileReason','ADMIN_FORCE_CLOSE_ACCOUNT',
             'positionsReconciledBy',$3::text
           )
       WHERE id=$4`,
      [previousPositions, forcedAt, forcedBy, id]
    );

    await this.db.query(
      `UPDATE bot_commands
       SET status='ACKED',acked_at=COALESCE(acked_at,now())
       WHERE bot_instance_id=$1
         AND status IN ('PENDING','DELIVERED')
         AND command IN ('START','SAFE_STOP','CLOSE_ALL')`,
      [id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command,payload) VALUES($1,'CLOSE_ALL',$2::jsonb)",
      [id, JSON.stringify({
        source: "ADMIN_FORCE_CLOSE_ACCOUNT",
        actor: forcedBy,
        forcedAt,
        previousPositions
      })]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'ADMIN_FORCE_CLOSE_ACCOUNT','bot_instance',$2,$3::jsonb)",
      [
        forcedBy,
        id,
        JSON.stringify({
          previousReportedPositions: previousPositions,
          forcedAt,
          serverStateAfter: "STOPPED/0",
          closeAllQueued: true
        })
      ]
    );

    return {
      ok: true,
      queued: true,
      forced: true,
      reconciled: true,
      instanceId: id,
      userCode: instance.user_code || null,
      accountNumber: instance.account_number || null,
      brokerServer: instance.broker_server || null,
      positions: previousPositions,
      positionsAfter: 0,
      message: "Admin บังคับปิดบัญชีแล้ว: Server เป็น STOPPED / 0 Position ทันที และส่ง Close All ให้ EA โดยไม่รอ heartbeat"
    };
  }

  async assertStartAllowed() {
    const current = await this.current();
    if (current.blockStarts) {
      throw new ServiceUnavailableException(
        "ระบบอยู่ระหว่างปิดปรับปรุง Owner/Admin ปิดสิทธิ์ Start ทั้งระบบชั่วคราว"
      );
    }
    return current;
  }

  async schedule(input: {
    title?: string;
    message?: string;
    maintenanceAt: string;
    forceCloseAt?: string;
    expectedResumeAt?: string;
    forceClose?: boolean;
  }, actor: string) {
    const existing = await this.current();
    if (existing.status === "DRAINING" || existing.status === "MAINTENANCE") {
      throw new ConflictException("ระบบกำลังปิดหรืออยู่ใน Maintenance แล้ว ไม่สามารถเขียนทับกำหนดการได้");
    }
    const maintenanceAt = new Date(input.maintenanceAt);
    const forceCloseAt = new Date(input.forceCloseAt || input.maintenanceAt);
    const expectedResumeAt = input.expectedResumeAt ? new Date(input.expectedResumeAt) : null;
    if (!Number.isFinite(maintenanceAt.getTime()) || !Number.isFinite(forceCloseAt.getTime())) {
      throw new ConflictException("วัน/เวลา Maintenance ไม่ถูกต้อง");
    }
    if (maintenanceAt.getTime() <= Date.now() + 30_000) {
      throw new ConflictException("กรุณากำหนดเวลา Maintenance ล่วงหน้าอย่างน้อย 30 วินาที");
    }
    if (forceCloseAt.getTime() > maintenanceAt.getTime()) {
      throw new ConflictException("เวลาบังคับ Close All ต้องไม่ช้ากว่าเวลาเริ่ม Maintenance");
    }
    if (expectedResumeAt && expectedResumeAt.getTime() <= maintenanceAt.getTime()) {
      throw new ConflictException("เวลาคาดว่าจะเปิดระบบต้องอยู่หลังเวลาเริ่ม Maintenance");
    }

    await this.db.query(
      `UPDATE system_maintenance
       SET status='SCHEDULED',
           title=$1,
           message=$2,
           maintenance_at=$3,
           force_close_at=$4,
           expected_resume_at=$5,
           force_close=$6,
           announced_at=now(),
           drain_started_at=NULL,
           maintenance_started_at=NULL,
           resumed_at=NULL,
           updated_by=$7,
           updated_at=now()
       WHERE id=1`,
      [
        String(input.title || "แจ้งปิดปรับปรุงระบบ").trim().slice(0, 160),
        String(input.message || "เมื่อถึงกำหนดระบบจะปิดสิทธิ์เทรดและส่ง Close All ให้ทุกบัญชี").trim().slice(0, 2000),
        maintenanceAt,
        forceCloseAt,
        expectedResumeAt,
        input.forceClose !== false,
        actor.slice(0, 120)
      ]
    );
    return this.snapshot();
  }

  async shutdownNow(actor: string, message?: string) {
    const existing = await this.row();
    if (!existing) throw new Error("system_maintenance row missing");

    await this.db.query(
      `UPDATE system_maintenance
       SET status='MAINTENANCE',
           title='ปิดระบบเพื่ออัปเดต',
           message=COALESCE(NULLIF($1,''),'Owner/Admin ปิดระบบชั่วคราวเพื่ออัปเดต'),
           maintenance_at=now(),
           force_close_at=now(),
           force_close=true,
           announced_at=COALESCE(announced_at,now()),
           drain_started_at=COALESCE(drain_started_at,now()),
           maintenance_started_at=COALESCE(maintenance_started_at,now()),
           updated_by=$2,
           updated_at=now()
       WHERE id=1`,
      [String(message || "").trim().slice(0, 2000), actor.slice(0, 120)]
    );

    const hardStop = await this.hardStopAll(actor, "ADMIN_SHUTDOWN_NOW");
    const snapshot = await this.snapshot();
    return { ...snapshot, hardStop };
  }

  async cancel(actor: string) {
    const current = await this.row();
    if (current?.status !== "SCHEDULED") {
      throw new ConflictException("ยกเลิกได้เฉพาะประกาศที่ยังไม่เริ่มปิดระบบ");
    }
    await this.db.query(
      `UPDATE system_maintenance
       SET status='OFF',title=NULL,message=NULL,maintenance_at=NULL,force_close_at=NULL,
           expected_resume_at=NULL,force_close=true,updated_by=$1,updated_at=now()
       WHERE id=1`,
      [actor.slice(0, 120)]
    );
    return this.snapshot();
  }

  async resume(actor: string) {
    const current = await this.current();
    if (current.status !== "DRAINING" && current.status !== "MAINTENANCE") {
      throw new ConflictException("ระบบไม่ได้อยู่ในโหมดปิดปรับปรุง");
    }

    // Reopening is also Server-authoritative. Do not wait for 1, 1000 or more
    // clients. Every Bot stays STOPPED; customers explicitly Start again later.
    await this.db.query(
      "UPDATE bot_instances SET desired_state='STOPPED' WHERE desired_state<>'STOPPED'"
    );
    await this.db.query(
      `UPDATE bot_commands
       SET status='ACKED',acked_at=COALESCE(acked_at,now())
       WHERE status IN ('PENDING','DELIVERED')
         AND command='CLOSE_ALL'
         AND payload->>'source'='SYSTEM_HARD_MAINTENANCE'`
    );
    await this.db.query(
      `UPDATE system_maintenance
       SET status='OFF',title=NULL,message=NULL,maintenance_at=NULL,force_close_at=NULL,
           expected_resume_at=NULL,force_close=true,resumed_at=now(),updated_by=$1,updated_at=now()
       WHERE id=1`,
      [actor.slice(0, 120)]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'GLOBAL_MAINTENANCE_RESUME','system','maintenance',$2::jsonb)",
      [actor.slice(0, 120), JSON.stringify({ botsRemainStopped: true })]
    );
    return this.snapshot();
  }
}
