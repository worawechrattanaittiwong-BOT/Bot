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
import { JwtGuard } from "./security";

type ManualMt5Action = "UPDATE_EA_RESTART" | "CONNECT_MT5";

@Controller("bot/mt5")
@UseGuards(JwtGuard)
export class ManualMt5Controller {
  constructor(private readonly db: DbService) {}

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

    const instance = await this.db.one(
      `SELECT
         bi.id,
         bi.desired_state,
         bi.actual_state,
         bi.metrics,
         ls.mode,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) AS positions,
         (bi.agent_last_seen_at IS NOT NULL AND bi.agent_last_seen_at > now() - interval '90 seconds') AS agent_online
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.status<>'DELETED'
       LIMIT 1`,
      [slotId, req.user.sub]
    );

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
      ? "รับคำสั่งอัปเดต EA แล้ว ระบบจะหยุดบอทอย่างปลอดภัยและรีสตาร์ท MT5 1 ครั้ง"
      : "รับคำสั่งเชื่อมต่อ MT5 แล้ว ระบบจะเปิดหรือรีสตาร์ท MT5 1 ครั้งเพื่อเชื่อมต่อใหม่";

    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='STOPPED',
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'manualMt5ActionName',$2::text,
             'manualMt5ActionId',$3::text,
             'manualMt5ActionRequestedAt',$4::text,
             'manualMt5ActionStatus','PENDING',
             'manualMt5ActionMessage',$5::text
           )
       WHERE id=$1`,
      [instance.id, action, actionId, requestedAt, message]
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
