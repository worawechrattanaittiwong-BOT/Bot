import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import type { Observable } from "rxjs";
import { DbService } from "./db.service";

@Injectable()
export class ManualEaUpdateStopInterceptor implements NestInterceptor {
  constructor(private readonly db: DbService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const method = String(req?.method || "").toUpperCase();
    const pathname = String(req?.originalUrl || req?.url || "").split("?")[0];
    const action = String(req?.body?.action || "").trim().toUpperCase();

    const guarded =
      method === "POST" &&
      pathname.endsWith("/bot/mt5/manual-action") &&
      action === "UPDATE_EA_RESTART";
    if (!guarded) return next.handle();

    const userId = String(req?.user?.sub || "").trim();
    const slotId = String(req?.query?.slotId || "").trim();
    if (!userId || !slotId) return next.handle();

    const row = await this.db.one(
      `SELECT
         bi.desired_state,
         bi.actual_state,
         ls.mode
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.status<>'DELETED'
       LIMIT 1`,
      [slotId, userId]
    );

    if (!row || String(row.mode || "").toUpperCase() !== "LOCAL") {
      return next.handle();
    }

    const desiredState = String(row.desired_state || "STOPPED").toUpperCase();
    const actualState = String(row.actual_state || "STOPPED").toUpperCase();
    if (desiredState === "RUNNING" || actualState === "RUNNING") {
      throw new ConflictException(
        "กรุณาหยุดบอทก่อนอัปเดต EA · การอัปเดตของลูกค้าจะไม่หยุดบอทที่กำลังเทรดให้อัตโนมัติ"
      );
    }

    return next.handle();
  }
}
