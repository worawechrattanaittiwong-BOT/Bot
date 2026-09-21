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
export class TradingSymbolStartInterceptor implements NestInterceptor {
  constructor(private readonly db: DbService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const method = String(req?.method || "").toUpperCase();
    const pathname = String(req?.originalUrl || req?.url || "").split("?")[0];
    const guarded =
      method === "POST" &&
      (pathname.endsWith("/bot/start") || pathname.endsWith("/bot/mt5/recover-start"));
    if (!guarded) return next.handle();

    const userId = String(req?.user?.sub || "").trim();
    if (!userId) return next.handle();
    const slotId = String(req?.query?.slotId || "").trim();

    const row = await this.db.one(
      `SELECT
         bi.metrics,
         ls.mode,
         bs.settings
       FROM license_slots ls
       JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       WHERE ls.assigned_user_id=$1
         AND ls.status IN ('ACTIVE','AVAILABLE')
         AND ($2::text='' OR ls.id::text=$2::text)
       ORDER BY
         CASE WHEN $2::text<>'' AND ls.id::text=$2::text THEN 0 ELSE 1 END,
         CASE WHEN ls.mode='LOCAL' THEN 0 ELSE 1 END,
         CASE WHEN bi.last_seen_at IS NOT NULL AND bi.last_seen_at>now()-interval '30 seconds' THEN 0 ELSE 1 END,
         bi.last_seen_at DESC NULLS LAST,
         ls.slot_number
       LIMIT 1`,
      [userId, slotId]
    );
    if (!row || String(row.mode || "").toUpperCase() !== "LOCAL") {
      return next.handle();
    }

    const settings = row.settings || {};
    const metrics = row.metrics || {};
    const desired = String(settings.startupSymbol || "").trim();
    const active = String(metrics.symbol || "").trim();

    if (desired && (!active || desired.toUpperCase() !== active.toUpperCase())) {
      throw new ConflictException(
        "ยังเริ่มบอทไม่ได้: เว็บกำหนด Symbol " + desired +
        " ไว้ แต่ EA ยังอยู่บน " + (active || "ไม่ทราบ") +
        " · คำสั่งหน้าเว็บมีสิทธิ์สูงสุด ระบบกำลังรอให้ MT5 เปิด Symbol ที่เลือกให้ตรงก่อน"
      );
    }

    const tradeMode = Number(metrics.symbolTradeMode);
    if (Number.isFinite(tradeMode) && (tradeMode === 0 || tradeMode === 3)) {
      throw new ConflictException(
        "ยังเริ่มบอทไม่ได้: Broker ไม่อนุญาตเปิดออเดอร์ใหม่บน Symbol " +
        (active || desired || "ที่เลือก") +
        " (Disabled/Close Only) กรุณาเลือก Symbol ที่บัญชี MT5 นี้เปิดเทรดได้"
      );
    }

    return next.handle();
  }
}
