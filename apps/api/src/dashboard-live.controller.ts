import { Controller, Get, Header, Query, Req, UseGuards } from "@nestjs/common";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";

@Controller("dashboard-live")
@UseGuards(JwtGuard)
export class DashboardLiveController {
  constructor(private readonly db: DbService) {}

  @Get("summary")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  async summary(@Req() req: any, @Query("slotId") slotId = "") {
    const userId = req.user.sub;

    let slot: any = null;
    if (slotId) {
      slot = await this.db.one(
        `SELECT id
         FROM license_slots
         WHERE id=$1
           AND assigned_user_id=$2
           AND status IN ('ACTIVE','AVAILABLE')
         LIMIT 1`,
        [slotId, userId]
      );
    } else {
      slot = await this.db.one(
        `SELECT ls.id
         FROM license_slots ls
         LEFT JOIN subscriptions s ON s.id=ls.subscription_id
         WHERE ls.assigned_user_id=$1
           AND ls.status IN ('ACTIVE','AVAILABLE')
         ORDER BY
           CASE WHEN s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() THEN 0 ELSE 1 END,
           CASE WHEN ls.mode='LOCAL' THEN 0 ELSE 1 END,
           ls.slot_number,ls.created_at
         LIMIT 1`,
        [userId]
      );
    }

    if (!slot) {
      return {
        slotId: null,
        price: 0,
        bid: 0,
        ask: 0,
        digits: 2,
        marketSessionState: "UNKNOWN",
        today: { trades: 0, wins: 0, losses: 0, winRate: 0, netProfit: 0 }
      };
    }

    const instance = await this.db.one(
      `SELECT id,metrics,last_seen_at
       FROM bot_instances
       WHERE slot_id=$1
       LIMIT 1`,
      [slot.id]
    );

    if (!instance) {
      return {
        slotId: slot.id,
        price: 0,
        bid: 0,
        ask: 0,
        digits: 2,
        marketSessionState: "UNKNOWN",
        today: { trades: 0, wins: 0, losses: 0, winRate: 0, netProfit: 0 }
      };
    }

    const today = await this.db.one(
      `SELECT
         COUNT(*) FILTER (WHERE event_type='BASKET')::int AS trades,
         COUNT(*) FILTER (WHERE event_type='BASKET' AND net_profit>0)::int AS wins,
         COUNT(*) FILTER (WHERE event_type='BASKET' AND net_profit<0)::int AS losses,
         COALESCE(SUM(net_profit) FILTER (WHERE event_type='BASKET'),0)::float8 AS net_profit
       FROM trade_journal
       WHERE bot_instance_id=$1
         AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')
         AND created_at < ((date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok') + interval '1 day') AT TIME ZONE 'Asia/Bangkok')`,
      [instance.id]
    );

    const metrics = instance.metrics || {};
    const bid = Number(metrics.marketBid || 0);
    const ask = Number(metrics.marketAsk || 0);
    const mid = Number(metrics.marketMid || 0);
    const price = mid > 0 ? mid : bid > 0 && ask > 0 ? (bid + ask) / 2 : bid > 0 ? bid : ask;
    const trades = Number(today?.trades || 0);
    const wins = Number(today?.wins || 0);

    return {
      slotId: slot.id,
      price: Number.isFinite(price) ? price : 0,
      bid: Number.isFinite(bid) ? bid : 0,
      ask: Number.isFinite(ask) ? ask : 0,
      digits: Math.max(0, Math.min(8, Number(metrics.symbolDigits ?? 2))),
      symbol: String(metrics.symbol || "XAUUSD"),
      marketSessionState: String(metrics.marketSessionState || "UNKNOWN"),
      lastSeenAt: instance.last_seen_at || null,
      today: {
        trades,
        wins,
        losses: Number(today?.losses || 0),
        winRate: trades > 0 ? (wins / trades) * 100 : 0,
        netProfit: Number(today?.net_profit || 0)
      }
    };
  }
}
