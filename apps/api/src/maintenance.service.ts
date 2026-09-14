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

  private async ensureDrainCommands(forceClose: boolean) {
    await this.db.query(
      `UPDATE bot_instances
       SET desired_state = CASE
         WHEN $1 AND COALESCE(NULLIF(metrics->>'positions','')::int,0)>0 THEN 'STOPPED'
         ELSE 'SAFE_STOP'
       END
       WHERE desired_state='RUNNING'
          OR actual_state='RUNNING'
          OR COALESCE(NULLIF(metrics->>'positions','')::int,0)>0`,
      [forceClose]
    );

    await this.db.query(
      `INSERT INTO bot_commands(bot_instance_id,command)
       SELECT
         bi.id,
         CASE
           WHEN $1 AND COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0 THEN 'CLOSE_ALL'
           ELSE 'SAFE_STOP'
         END
       FROM bot_instances bi
       WHERE (
         bi.actual_state='RUNNING' OR
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0 OR
         (bi.desired_state='SAFE_STOP' AND bi.last_seen_at>now()-interval '2 minutes')
       )
       AND NOT EXISTS (
         SELECT 1
         FROM bot_commands bc
         WHERE bc.bot_instance_id=bi.id
           AND bc.command=CASE
             WHEN $1 AND COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0 THEN 'CLOSE_ALL'
             ELSE 'SAFE_STOP'
           END
           AND bc.created_at>now()-interval '12 seconds'
       )`,
      [forceClose]
    );
  }

  private async tryFinishDrain() {
    const blockers = await this.db.one(
      `SELECT
         COUNT(*) FILTER (
           WHERE actual_state='RUNNING' OR desired_state='RUNNING'
         )::int AS running,
         COALESCE(SUM(COALESCE(NULLIF(metrics->>'positions','')::int,0)),0)::int AS positions
       FROM bot_instances`
    );
    if (Number(blockers?.running || 0) === 0 && Number(blockers?.positions || 0) === 0) {
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
      await this.ensureDrainCommands(Boolean(current.force_close));
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
      `SELECT
         COUNT(*)::int AS total_instances,
         COUNT(*) FILTER (WHERE actual_state='RUNNING' OR desired_state='RUNNING')::int AS running_instances,
         COUNT(*) FILTER (WHERE COALESCE(NULLIF(metrics->>'positions','')::int,0)>0)::int AS instances_with_positions,
         COALESCE(SUM(COALESCE(NULLIF(metrics->>'positions','')::int,0)),0)::int AS open_positions
       FROM bot_instances`
    );
    const blockers = await this.db.query(
      `SELECT
         bi.id AS instance_id,
         u.user_code,
         a.account_number,
         a.broker_server,
         bi.actual_state,
         bi.desired_state,
         bi.last_seen_at,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)::int AS positions
       FROM bot_instances bi
       LEFT JOIN license_slots ls ON ls.id=bi.slot_id
       LEFT JOIN users u ON u.id=COALESCE(ls.assigned_user_id,ls.owner_user_id)
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE bi.actual_state='RUNNING'
          OR bi.desired_state='RUNNING'
          OR COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0
       ORDER BY COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) DESC,bi.last_seen_at DESC NULLS LAST
       LIMIT 50`
    );
    return {
      ...current,
      summary: {
        totalInstances: Number(summary?.total_instances || 0),
        runningInstances: Number(summary?.running_instances || 0),
        instancesWithPositions: Number(summary?.instances_with_positions || 0),
        openPositions: Number(summary?.open_positions || 0)
      },
      blockers: blockers.rows
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
      throw new ConflictException("ยังมีบอทหรือ Position ที่ปิดไม่ครบ ระบบยังเปิดกลับไม่ได้");
    }
    if (current.status !== "MAINTENANCE") {
      throw new ConflictException("ระบบไม่ได้อยู่ในโหมด Maintenance");
    }
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
