import { ConflictException, Injectable } from "@nestjs/common";
import { DbService } from "./db.service";
import { isVersionAtLeast } from "./release-version";

export const TRADE_MODES = ["AUTO", "RACE", "COUNTER", "FLIP_LOCK", "ZERO_GRID", "MANUAL"] as const;
export type TradingMode = typeof TRADE_MODES[number];

export function canonicalTradingMode(settings: any): TradingMode {
  const raw = String(settings?.controlMode || settings?.engineMode || "AUTO").trim().toUpperCase();
  const mode = raw === "ASSISTED" ? "MANUAL" : raw;
  return (TRADE_MODES as readonly string[]).includes(mode) ? mode as TradingMode : "AUTO";
}

@Injectable()
export class TradingModeControlService {
  constructor(private readonly db: DbService) {}

  async disabled(mode: string): Promise<boolean> {
    const row = await this.db.one("SELECT NOT enabled AS disabled FROM trading_mode_controls WHERE mode=$1", [mode]);
    return row?.disabled === true;
  }

  async assertEnabled(mode: string) {
    if (await this.disabled(mode)) {
      throw new ConflictException("โหมด " + mode + " ถูกผู้ดูแลปิดชั่วคราว · ไม่สามารถเริ่มรอบใหม่ได้");
    }
  }

  async requestStart(instanceId: string, mode: TradingMode, unlockDailyProfit = false) {
    // Use the same advisory lock as OWNER mode toggles: a racing START must
    // never overwrite the SAFE_STOP decided by an administrator.
    await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(740096)");
      const row=(await tx.query(
        "SELECT enabled FROM trading_mode_controls WHERE mode=$1 FOR SHARE", [mode]
      )).rows[0];
      if (!row?.enabled) throw new ConflictException(
        "โหมด " + mode + " ถูกผู้ดูแลปิดชั่วคราว · ไม่สามารถเริ่มรอบใหม่ได้"
      );
      await tx.query(
        `UPDATE bot_instances SET desired_state='RUNNING',lock_owner=id::text,
          metrics=CASE WHEN $2::boolean THEN
            jsonb_set(COALESCE(metrics,'{}'::jsonb),'{dailyProfitUnlockRequested}','true'::jsonb,true)
          ELSE metrics END WHERE id=$1`,
        [instanceId,unlockDailyProfit]
      );
      await tx.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",
        [instanceId]
      );
      await tx.query(
        "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'START')",
        [instanceId]
      );
    });
  }

  async list() {
    const rows = await this.db.query(`
      SELECT c.mode,c.enabled,c.updated_at,c.updated_by,c.reason,
             COUNT(bi.id)::int AS configured,
             COUNT(bi.id) FILTER (WHERE bi.desired_state='RUNNING' OR bi.actual_state='RUNNING')::int AS running,
             COUNT(bi.id) FILTER (WHERE bi.desired_state='SAFE_STOP')::int AS draining,
             COUNT(bi.id) FILTER (WHERE bi.last_seen_at IS NULL OR bi.last_seen_at < now()-interval '25 seconds')::int AS offline,
             COUNT(bi.id) FILTER (WHERE
               COALESCE(NULLIF(bi.metrics->>'accountScenovaPositions','')::int,NULLIF(bi.metrics->>'positions','')::int,0)>0 OR
               COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0)>0
             )::int AS exposed
      FROM trading_mode_controls c
      LEFT JOIN bot_settings bs ON canonical_mode_key(bs.settings)=c.mode
      LEFT JOIN bot_instances bi ON bi.id=bs.bot_instance_id AND bi.mt5_account_id IS NOT NULL
      GROUP BY c.mode,c.enabled,c.updated_at,c.updated_by,c.reason
      ORDER BY array_position(ARRAY['AUTO','RACE','COUNTER','FLIP_LOCK','ZERO_GRID','MANUAL'],c.mode)
    `);
    return rows.rows;
  }

  async setEnabled(mode: string, enabled: boolean, actor: string, reason: string) {
    if (!(TRADE_MODES as readonly string[]).includes(mode)) {
      throw new ConflictException("โหมดการเทรดไม่ถูกต้อง");
    }
    return this.db.transaction(async tx => {
      // Serialize Owner toggles; START uses a final flag check, while the EA
      // heartbeat repeats enforcement for racing and stale commands.
      await tx.query("SELECT pg_advisory_xact_lock(740096)");
      const current = (await tx.query(
        "SELECT mode,enabled FROM trading_mode_controls WHERE mode=$1 FOR UPDATE", [mode]
      )).rows[0];
      if (!current) throw new ConflictException("ไม่พบโหมด");
      if (Boolean(current.enabled) === enabled) return { ok: true, changed: false, mode, enabled, affected: 0 };

      // An older ZERO GRID EA preserves its existing pending ladder during
      // SAFE_STOP, so never promise "cancel pending" with a legacy binary.
      if (!enabled && mode === "ZERO_GRID") {
        const live = (await tx.query(`
          SELECT bi.id, bi.metrics->>'eaVersion' ea_version
          FROM bot_instances bi JOIN bot_settings bs ON bs.bot_instance_id=bi.id
          WHERE canonical_mode_key(bs.settings)='ZERO_GRID'
            AND (bi.desired_state='RUNNING' OR bi.actual_state='RUNNING'
              OR COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0)>0)
        `)).rows;
        if (live.some((item:any) => !isVersionAtLeast(item.ea_version, "1.1.31"))) {
          throw new ConflictException("พบ ZERO GRID ที่ยังใช้ EA รุ่นเก่า · ต้องอัปเดตเป็น 1.1.31 ก่อน เพื่อให้ยกเลิก Pending Orders อย่างปลอดภัย");
        }
      }
      await tx.query(
        "UPDATE trading_mode_controls SET enabled=$2,updated_by=$3,reason=$4,updated_at=now() WHERE mode=$1",
        [mode,enabled,actor,reason.slice(0,240)]
      );
      let affected: any[]=[];
      if (!enabled) {
        const changed=await tx.query(`
          UPDATE bot_instances bi SET desired_state='SAFE_STOP'
          FROM bot_settings bs
          WHERE bs.bot_instance_id=bi.id AND canonical_mode_key(bs.settings)=$1
            AND (bi.desired_state='RUNNING' OR bi.actual_state='RUNNING')
            AND bi.desired_state<>'SAFE_STOP'
          RETURNING bi.id
        `, [mode]);
        affected=changed.rows;
        for (const item of affected) {
          await tx.query(
            "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND command='START' AND status IN ('PENDING','DELIVERED')",
            [item.id]
          );
          await tx.query(
            "INSERT INTO bot_commands(bot_instance_id,command,payload) VALUES($1,'SAFE_STOP',$2::jsonb)",
            [item.id,JSON.stringify({source:"OWNER_DISABLED_TRADING_MODE",mode,reason:reason.slice(0,240)})]
          );
        }
      }
      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,$2,'trading_mode_controls',$3,$4::jsonb)",
        [actor,enabled?"ENABLE_TRADING_MODE":"DISABLE_TRADING_MODE",mode,JSON.stringify({mode,enabled,affected:affected.length,reason:reason.slice(0,240)})]
      );
      return {ok:true,changed:true,mode,enabled,affected:affected.length};
    });
  }
}
