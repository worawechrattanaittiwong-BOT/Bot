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

  // A stale cached Position is never silently discarded. It is reconciled to
  // zero only when the EA has ACKed CLOSE_ALL after the last full MT5 snapshot.
  // Otherwise it remains an unresolved maintenance blocker until a fresh MT5
  // heartbeat reports the real Position count.
  private async reconcileAckedCloseAll() {
    const reconciledAt = new Date().toISOString();
    const result = await this.db.query(
      `WITH candidates AS (
         SELECT
           bi.id,
           COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)::int AS reported_positions,
           COALESCE(NULLIF(bi.metrics->>'lastServerContactAt','')::double precision,0) AS mt5_report_epoch,
           (
             SELECT MAX(bc.acked_at)
             FROM bot_commands bc
             WHERE bc.bot_instance_id=bi.id
               AND bc.command='CLOSE_ALL'
               AND bc.status='ACKED'
               AND bc.payload->>'ackSource'='EA'
           ) AS close_acked_at
         FROM bot_instances bi
         WHERE bi.desired_state<>'RUNNING'
           AND COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0
       ), eligible AS (
         SELECT *
         FROM candidates
         WHERE mt5_report_epoch>0
           AND mt5_report_epoch <= extract(epoch from now() - interval '20 seconds')
           AND close_acked_at IS NOT NULL
           AND close_acked_at > to_timestamp(mt5_report_epoch)
           AND close_acked_at < now() - interval '5 seconds'
       )
       UPDATE bot_instances bi
       SET metrics=COALESCE(bi.metrics,'{}'::jsonb) || jsonb_build_object(
         'lastKnownPositionsBeforeClose',e.reported_positions,
         'positions',0,
         'positionsReconciledAt',$1::text,
         'positionsReconcileReason','ACKED_CLOSE_ALL_AFTER_LAST_MT5_SNAPSHOT'
       )
       FROM eligible e
       WHERE bi.id=e.id
       RETURNING bi.id,e.reported_positions`,
      [reconciledAt]
    );

    for (const row of result.rows) {
      await this.db.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES('SYSTEM_MAINTENANCE','RECONCILE_STALE_MT5_POSITIONS','bot_instance',$1,$2::jsonb)",
        [
          row.id,
          JSON.stringify({
            previousReportedPositions: Number(row.reported_positions || 0),
            reconciledAt,
            reason: "ACKED_CLOSE_ALL_AFTER_LAST_MT5_SNAPSHOT"
          })
        ]
      );
    }
    return result.rowCount || 0;
  }

  private async ensureDrainCommands(forceClose: boolean) {
    await this.db.query(
      `${this.runtimeCte()}
       UPDATE bot_instances bi
       SET desired_state = CASE
         WHEN $1 AND r.mt5_fresh AND r.reported_positions>0 THEN 'STOPPED'
         ELSE 'SAFE_STOP'
       END
       FROM runtime r
       WHERE r.id=bi.id
         AND (
           bi.desired_state='RUNNING' OR
           (r.mt5_fresh AND bi.actual_state='RUNNING') OR
           (r.mt5_fresh AND r.reported_positions>0)
         )`,
      [forceClose]
    );

    await this.db.query(
      `${this.runtimeCte()}
       INSERT INTO bot_commands(bot_instance_id,command)
       SELECT
         r.id,
         CASE
           WHEN $1 AND r.mt5_fresh AND r.reported_positions>0 THEN 'CLOSE_ALL'
           ELSE 'SAFE_STOP'
         END
       FROM runtime r
       WHERE (
         (r.mt5_fresh AND r.actual_state='RUNNING') OR
         (r.mt5_fresh AND r.reported_positions>0) OR
         (r.desired_state='SAFE_STOP' AND r.mt5_fresh)
       )
       AND NOT EXISTS (
         SELECT 1
         FROM bot_commands bc
         WHERE bc.bot_instance_id=r.id
           AND bc.command=CASE
             WHEN $1 AND r.mt5_fresh AND r.reported_positions>0 THEN 'CLOSE_ALL'
             ELSE 'SAFE_STOP'
           END
           AND bc.created_at>now()-interval '12 seconds'
       )`,
      [forceClose]
    );
  }

  private async ensureForceFlatCommands(actor: string) {
    // FORCE FLAT is stronger than SAFE_STOP: every bound terminal stays STOPPED
    // and every MT5-bound instance has a durable CLOSE_ALL waiting for it.
    await this.db.query(
      "UPDATE bot_instances SET desired_state='STOPPED' WHERE desired_state<>'STOPPED'"
    );
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')"
    );

    const payload = JSON.stringify({
      source: "OWNER_FORCE_FLAT_ALL",
      actor: actor.slice(0, 120),
      requestedAt: new Date().toISOString()
    });
    return this.db.query(
      `${this.runtimeCte()}
       INSERT INTO bot_commands(bot_instance_id,command,payload)
       SELECT r.id,'CLOSE_ALL',$1::jsonb
       FROM runtime r
       WHERE r.mt5_account_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM bot_commands bc
           WHERE bc.bot_instance_id=r.id
             AND bc.command='CLOSE_ALL'
             AND bc.status IN ('PENDING','DELIVERED')
         )
       RETURNING bot_instance_id`,
      [payload]
    );
  }

  private async liveBlockers() {
    return this.db.one(
      `${this.runtimeCte()}
       SELECT
         COUNT(*) FILTER (
           WHERE desired_state='RUNNING'
              OR (mt5_fresh AND actual_state='RUNNING')
         )::int AS running,
         COALESCE(SUM(reported_positions),0)::int AS positions,
         COALESCE(SUM(CASE WHEN mt5_fresh THEN reported_positions ELSE 0 END),0)::int AS fresh_positions,
         COUNT(*) FILTER (
           WHERE NOT mt5_fresh AND reported_positions>0
         )::int AS stale_position_instances,
         COALESCE(SUM(CASE WHEN NOT mt5_fresh THEN reported_positions ELSE 0 END),0)::int AS stale_reported_positions
       FROM runtime`
    );
  }

  private async tryFinishDrain() {
    const blockers = await this.liveBlockers();
    // An offline EA can leave a stale cached Position forever. That must remain
    // visible and must block reopening, but it must not deadlock entry into
    // MAINTENANCE once every live MT5 session is stopped and fresh Positions are 0.
    if (Number(blockers?.running || 0) === 0 && Number(blockers?.fresh_positions || 0) === 0) {
      await this.db.query(
        `UPDATE system_maintenance
         SET status='MAINTENANCE',maintenance_started_at=COALESCE(maintenance_started_at,now()),updated_at=now()
         WHERE id=1 AND status='DRAINING'`
      );
      return true;
    }
    return false;
  }

  async current() {
    let current = await this.row();
    if (!current) throw new Error("system_maintenance row missing");

    if (current.status === "SCHEDULED") {
      const triggerAt = current.force_close_at || current.maintenance_at;
      if (triggerAt && new Date(triggerAt).getTime() <= Date.now()) {
        await this.db.query(
          `UPDATE system_maintenance
           SET status='DRAINING',drain_started_at=COALESCE(drain_started_at,now()),updated_at=now()
           WHERE id=1 AND status='SCHEDULED'`
        );
        current = await this.row();
      }
    }

    if (current.status === "DRAINING") {
      await this.reconcileAckedCloseAll();
      if (current.title === "EMERGENCY FORCE FLAT") {
        await this.ensureForceFlatCommands(String(current.updated_by || "SYSTEM_MAINTENANCE"));
      } else {
        await this.ensureDrainCommands(Boolean(current.force_close));
      }
      await this.tryFinishDrain();
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

    const staleReports = await this.db.query(
      `${this.runtimeCte()}
       SELECT
         r.id AS instance_id,
         u.user_code,
         a.account_number,
         a.broker_server,
         r.actual_state,
         r.desired_state,
         r.last_seen_at,
         r.reported_positions AS reported_positions
       FROM runtime r
       LEFT JOIN license_slots ls ON ls.id=r.slot_id
       LEFT JOIN users u ON u.id=COALESCE(ls.assigned_user_id,ls.owner_user_id)
       LEFT JOIN mt5_accounts a ON a.id=r.mt5_account_id
       WHERE NOT r.mt5_fresh AND r.reported_positions>0
       ORDER BY r.last_seen_at DESC NULLS LAST
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
      staleReports: staleReports.rows
    };
  }

  async forceCloseInstance(instanceId: string, actor: string) {
    const id = String(instanceId || "").trim();
    if (!id) throw new ConflictException("ไม่พบ Bot Instance ที่ต้องการปิด Position");

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
    if (Number(instance.positions || 0) <= 0) {
      throw new ConflictException("บัญชีนี้ไม่มี Position ค้างให้ปิด");
    }

    await this.db.query("UPDATE bot_instances SET desired_state='STOPPED' WHERE id=$1", [id]);
    // Supersede obsolete start/stop controls, but never fake a CLOSE_ALL ACK.
    // reconcileAckedCloseAll() must only trust an acknowledgement sent by the EA.
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",
      [id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command,payload) VALUES($1,'CLOSE_ALL',$2::jsonb)",
      [id, JSON.stringify({ source: "OWNER_MAINTENANCE", actor: actor.slice(0, 120) })]
    );

    return {
      ok: true,
      queued: true,
      instanceId: id,
      userCode: instance.user_code || null,
      accountNumber: instance.account_number || null,
      brokerServer: instance.broker_server || null,
      positions: Number(instance.positions || 0),
      message: "ส่งคำสั่ง Close All ให้บัญชีนี้แล้ว ระบบจะรอ EA รับคำสั่งและ heartbeat จาก MT5 ยืนยัน Position เป็น 0"
    };
  }

  async forceFlatAll(actor: string, confirmation: string) {
    if (String(confirmation || "").trim() !== "FORCE FLAT ALL") {
      throw new ConflictException("กรุณาพิมพ์ FORCE FLAT ALL เพื่อยืนยันคำสั่งฉุกเฉิน");
    }

    const before = await this.liveBlockers();
    const targets = await this.db.one(
      `${this.runtimeCte()}
       SELECT
         COUNT(*) FILTER (WHERE mt5_account_id IS NOT NULL)::int AS target_instances,
         COUNT(*) FILTER (WHERE mt5_account_id IS NOT NULL AND mt5_fresh)::int AS fresh_instances,
         COUNT(*) FILTER (WHERE NOT mt5_fresh AND reported_positions>0)::int AS stale_position_instances
       FROM runtime`
    );

    // Freeze new starts before issuing any close commands. If the system is
    // already in MAINTENANCE we keep it there; otherwise emergency flattening
    // enters DRAINING so assertStartAllowed() blocks every new trading cycle.
    await this.db.query(
      `UPDATE system_maintenance
       SET status=CASE WHEN status='MAINTENANCE' THEN 'MAINTENANCE' ELSE 'DRAINING' END,
           title='EMERGENCY FORCE FLAT',
           message='เจ้าของระบบสั่งหยุดทุก Bot และปิดทุก Position ฉุกเฉิน ระบบจะไม่เปิดรอบใหม่จนกว่าจะยืนยันว่า Position เป็น 0',
           maintenance_at=now(),
           force_close_at=now(),
           expected_resume_at=NULL,
           force_close=true,
           announced_at=COALESCE(announced_at,now()),
           drain_started_at=COALESCE(drain_started_at,now()),
           maintenance_started_at=CASE WHEN status='MAINTENANCE' THEN maintenance_started_at ELSE NULL END,
           updated_by=$1,
           updated_at=now()
       WHERE id=1`,
      [actor.slice(0, 120)]
    );

    const queued = await this.ensureForceFlatCommands(actor);
    await this.reconcileAckedCloseAll();
    await this.tryFinishDrain();
    const snapshot = await this.snapshot();

    return {
      ...snapshot,
      emergency: {
        mode: "FORCE_FLAT_ALL",
        targetInstances: Number(targets?.target_instances || 0),
        freshInstances: Number(targets?.fresh_instances || 0),
        stalePositionInstances: Number(targets?.stale_position_instances || 0),
        queuedCloseAll: Number(queued.rowCount || 0),
        runningAtRequest: Number(before?.running || 0),
        positionsAtRequest: Number(before?.positions || 0),
        freshPositionsAtRequest: Number(before?.fresh_positions || 0),
        stalePositionsAtRequest: Number(before?.stale_reported_positions || 0)
      },
      message: "FORCE FLAT ALL เริ่มทำงานแล้ว: บล็อก Start, STOP ทุก Bot และคิว Close All ไว้ให้ทุกบัญชี MT5 ระบบจะถือว่าปลอดภัยเมื่อ MT5/EA ยืนยัน Position เป็น 0 เท่านั้น"
    };
  }

  async assertStartAllowed() {
    const current = await this.current();
    if (current.blockStarts) {
      throw new ServiceUnavailableException(
        current.status === "DRAINING"
          ? "ระบบกำลังปิดอย่างปลอดภัยเพื่ออัปเดต ไม่อนุญาตให้เริ่มรอบใหม่"
          : "ระบบอยู่ระหว่างปิดปรับปรุง กรุณารอประกาศเปิดระบบอีกครั้ง"
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
      throw new ConflictException("เวลาบังคับปิด Position ต้องไม่ช้ากว่าเวลาเริ่ม Maintenance");
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
        String(input.message || "กรุณาปิด Position ทั้งหมดก่อนเวลาที่กำหนด").trim().slice(0, 2000),
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
    const existing = await this.current();
    if (existing.status === "MAINTENANCE") return this.snapshot();
    await this.db.query(
      `UPDATE system_maintenance
       SET status='DRAINING',
           title='กำลังปิดระบบเพื่ออัปเดต',
           message=COALESCE(NULLIF($1,''),'ระบบกำลังหยุดบอทและปิด Position ที่ยังค้างอย่างปลอดภัย'),
           maintenance_at=now(),
           force_close_at=now(),
           force_close=true,
           announced_at=COALESCE(announced_at,now()),
           drain_started_at=now(),
           maintenance_started_at=NULL,
           updated_by=$2,
           updated_at=now()
       WHERE id=1`,
      [String(message || "").trim().slice(0, 2000), actor.slice(0, 120)]
    );
    await this.reconcileAckedCloseAll();
    await this.ensureDrainCommands(true);
    await this.tryFinishDrain();
    return this.snapshot();
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
    if (current.status === "DRAINING") {
      await this.tryFinishDrain();
    }

    const refreshed = await this.row();
    if (refreshed?.status !== "MAINTENANCE") {
      throw new ConflictException("ระบบไม่ได้อยู่ในโหมด Maintenance");
    }

    // Stale snapshots are allowed to enter MAINTENANCE so the owner can upgrade,
    // but reopening must stay blocked until MT5/EA proves every Position is 0.
    const blockers = await this.liveBlockers();
    const running = Number(blockers?.running || 0);
    const positions = Number(blockers?.positions || 0);
    const stalePositions = Number(blockers?.stale_reported_positions || 0);
    if (running > 0 || positions > 0) {
      throw new ConflictException(
        stalePositions > 0
          ? "ยังมี Position จากข้อมูล MT5 ล่าสุดที่ยังไม่ได้ยืนยันว่าเป็น 0 กรุณาเปิด EA/MT5 ให้ heartbeat ยืนยัน หรือส่ง Close All ให้สำเร็จก่อนเปิดระบบ"
          : "ยังมี Bot Running หรือ Position ค้างอยู่ ระบบยังเปิดกลับไม่ได้"
      );
    }

    await this.db.query(
      "UPDATE bot_instances SET desired_state='STOPPED' WHERE desired_state<>'RUNNING'"
    );
    await this.db.query(
      `UPDATE system_maintenance
       SET status='OFF',title=NULL,message=NULL,maintenance_at=NULL,force_close_at=NULL,
           expected_resume_at=NULL,force_close=true,resumed_at=now(),updated_by=$1,updated_at=now()
       WHERE id=1`,
      [actor.slice(0, 120)]
    );
    return this.snapshot();
  }
}
