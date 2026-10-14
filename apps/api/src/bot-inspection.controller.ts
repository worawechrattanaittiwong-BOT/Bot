import { BadRequestException, Controller, ForbiddenException, Get, Header, NotFoundException, Query, Req, UseGuards } from "@nestjs/common";
import { DbService } from "./db.service";
import { JwtGuard } from "./security";
import { approximateTradeGroups, attachSessionTrades, buildBotSessions, inspectBotEvents } from "./bot-inspection-analysis";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DAYS = 90;
const DAY_MS = 86_400_000;

@Controller("bot-inspection")
@UseGuards(JwtGuard)
export class BotInspectionController {
  constructor(private readonly db: DbService) {}

  private async viewer(req:any) {
    const id=String(req.user?.sub || "");
    if (!UUID.test(id)) throw new ForbiddenException("invalid session");
    // Role from the database, not a client-controlled flag or stale JWT role.
    const row=await this.db.one("SELECT id,role,status,user_code FROM users WHERE id=$1",[id]);
    if (!row || String(row.status).toUpperCase()!=="ACTIVE") throw new ForbiddenException("no access");
    return { id, role:String(row.role||"").toUpperCase(), userCode:String(row.user_code||"") };
  }

  private privileged(role:string) { return role==="OWNER" || role==="ADMIN"; }

  private async requireAccount(accountId:string, user:{id:string;role:string}) {
    if (!UUID.test(accountId)) throw new BadRequestException("invalid account ID");
    const elevated=this.privileged(user.role);
    const row=await this.db.one(
      `SELECT a.id,a.user_id,a.account_number,a.display_name,a.broker,a.broker_server,a.mode,a.status,a.created_at,
                u.user_code,
                (SELECT bi.actual_state FROM bot_instances bi WHERE bi.mt5_account_id=a.id ORDER BY bi.created_at DESC LIMIT 1) AS runtime_state
         FROM mt5_accounts a JOIN users u ON u.id=a.user_id
         WHERE a.id=$1 AND ($2::boolean OR a.user_id=$3::uuid)`,
      [accountId,elevated,user.id]
    );
    if (!row) throw new NotFoundException("account not found");
    return row;
  }

  @Get("accounts")
  @Header("Cache-Control", "no-store, private")
  async accounts(@Req() req:any) {
    const user=await this.viewer(req);
    const elevated=this.privileged(user.role);
    const result=await this.db.query(
      `SELECT a.id,a.account_number,a.display_name,a.broker,a.broker_server,a.mode,a.status,a.created_at,
              ${elevated ? "u.user_code" : "NULL::text AS user_code"},
              (SELECT bi.actual_state FROM bot_instances bi WHERE bi.mt5_account_id=a.id ORDER BY bi.created_at DESC LIMIT 1) AS runtime_state,
              (SELECT max(j.created_at) FROM trade_journal j WHERE j.mt5_account_id=a.id) AS last_trade_at
       FROM mt5_accounts a
       JOIN users u ON u.id=a.user_id
       WHERE ($1::boolean OR a.user_id=$2::uuid)
       ORDER BY CASE WHEN upper(a.status)='ACTIVE' THEN 0 ELSE 1 END,
                a.created_at DESC`,[elevated,user.id]
    );
    return { role:user.role, userCode:user.userCode, elevated, timezone:"Asia/Bangkok",
      accounts:result.rows.map((a:any)=>({
        id:a.id,number:a.account_number,displayName:a.display_name||null,broker:a.broker,
        server:a.broker_server,mode:a.mode,status:a.status,runtimeState:a.runtime_state,
        userCode:a.user_code||null,lastTradeAt:a.last_trade_at||null,
        archived:String(a.status).toUpperCase()!=="ACTIVE"
      }))
    };
  }

  @Get("report")
  @Header("Cache-Control", "no-store, private")
  async report(@Req() req:any,@Query("accountId") accountId="",
    @Query("from") from="",@Query("to") to="",@Query("offset") offset="0") {
    const user=await this.viewer(req);
    const account=await this.requireAccount(String(accountId),user);
    const now=Date.now();
    const fromMs=from ? Date.parse(from) : now-24*60*60*1000;
    const toMs=to ? Date.parse(to) : now;
    if (!Number.isFinite(fromMs)||!Number.isFinite(toMs)||fromMs>=toMs||
        toMs-fromMs>MAX_DAYS*DAY_MS||toMs>now+DAY_MS)
      throw new BadRequestException("เลือกช่วงเวลาที่ถูกต้องไม่เกิน 90 วัน");
    const parsedOffset=Number(offset);
    if (!Number.isSafeInteger(parsedOffset)||parsedOffset<0||parsedOffset>100_000)
      throw new BadRequestException("invalid pagination offset");
    const start=new Date(fromMs).toISOString();
    const finish=new Date(toMs).toISOString();

    const summary=await this.db.query(
      `SELECT coalesce(NULLIF(upper(j.metadata->>'currency'),''),'UNKNOWN') AS currency,
              count(*) FILTER (WHERE j.event_type='ENTRY')::int AS entries,
              count(*) FILTER (WHERE j.event_type='EXIT')::int AS exits,
              round(coalesce(sum(j.net_profit) FILTER (WHERE j.event_type IN ('ENTRY','EXIT')),0),2) AS pnl
       FROM trade_journal j
       WHERE j.mt5_account_id=$1 AND j.created_at >= $2::timestamptz AND j.created_at < $3::timestamptz
       GROUP BY 1 ORDER BY 1`,[account.id,start,finish]
    );

    // Only return whitelisted fields: never expose command payloads, credentials or raw EA metrics.
    const events=await this.db.query(
      `SELECT * FROM (
         SELECT 'TRADE'::text AS source, j.id::text AS id,j.created_at AS recorded_at,
                j.event_type::text AS event, NULL::text AS status, j.direction::text AS direction,
                j.volume AS volume,j.price AS price,j.net_profit AS pnl,j.position_id::text AS position_id,
                j.deal_ticket::text AS deal_ticket,j.metadata->>'symbol' AS symbol,
                j.metadata->>'currency' AS currency,
                j.metadata->>'controlMode' AS control_mode,
                j.metadata->>'dealTimeMsc' AS deal_time_msc,
                NULL::timestamptz AS delivered_at,NULL::timestamptz AS acked_at
         FROM trade_journal j WHERE j.mt5_account_id=$1
           AND j.created_at >= $2::timestamptz AND j.created_at < $3::timestamptz
         UNION ALL
         SELECT 'COMMAND'::text,c.id::text,c.created_at,c.command::text,c.status::text,
                NULL::text,NULL::numeric,NULL::numeric,NULL::numeric,
                NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                c.delivered_at,c.acked_at
         FROM bot_commands c JOIN bot_instances bi ON bi.id=c.bot_instance_id
         WHERE bi.mt5_account_id=$1 AND c.created_at >= $2::timestamptz AND c.created_at < $3::timestamptz
           AND c.created_at >= $5::timestamptz
       ) e ORDER BY recorded_at DESC,source DESC,id DESC
       LIMIT 101 OFFSET $4::int`,[account.id,start,finish,parsedOffset,account.created_at]
    );

    const commands=await this.db.query(
      `SELECT c.id::text AS id,c.command,c.status,c.created_at,c.delivered_at,c.acked_at
       FROM bot_commands c JOIN bot_instances bi ON bi.id=c.bot_instance_id
       WHERE bi.mt5_account_id=$1 AND c.created_at >= $2::timestamptz AND c.created_at < $3::timestamptz
         AND c.command IN ('START','SAFE_STOP','CLOSE_ALL')
         AND c.created_at >= $4::timestamptz
       ORDER BY c.created_at DESC,c.id DESC LIMIT 1001`,[account.id,start,finish,account.created_at]
    );
    const tradeRows=await this.db.query(
      `SELECT j.id::text AS id,j.created_at,j.event_type,j.direction,j.volume,j.net_profit,
              j.position_id::text AS position_id,j.metadata->>'currency' AS currency
       FROM trade_journal j
       WHERE j.mt5_account_id=$1 AND j.created_at >= $2::timestamptz AND j.created_at < $3::timestamptz
         AND j.event_type IN ('ENTRY','EXIT')
       ORDER BY j.created_at DESC,j.id DESC LIMIT 1501`,[account.id,start,finish]
    );
    const limitedEvents=events.rows.slice(0,100);
    const incompleteCommands=commands.rows.length>1000;
    const incompleteTrades=tradeRows.rows.length>1500;
    const sessions=attachSessionTrades(buildBotSessions(commands.rows.slice(0,1000).reverse()),tradeRows.rows.slice(0,1500).reverse());
    const groups=approximateTradeGroups(tradeRows.rows.slice(0,1500).reverse());

    return {
      timezone:"Asia/Bangkok",from:start,to:finish,
      account:{id:account.id,number:account.account_number,displayName:account.display_name,
        broker:account.broker,server:account.broker_server,mode:account.mode,status:account.status,
        runtimeState:account.runtime_state,archived:String(account.status).toUpperCase()!=="ACTIVE",
        userCode:this.privileged(user.role)?account.user_code:null},
      summary:summary.rows.map((r:any)=>({currency:r.currency,entries:Number(r.entries),exits:Number(r.exits),pnl:Number(r.pnl)})),
      sessions:sessions.slice(-100).reverse(),
      tradeGroups:groups.slice(-100).reverse(),
      findings:inspectBotEvents(commands.rows.slice(0,1000),tradeRows.rows.slice(0,1500)),
      limitations:{
        sessionsIncomplete:incompleteCommands || sessions.length>100,
        groupsIncomplete:incompleteTrades || groups.length>100,
        groupsInferred:true,
        closureReasonAvailable:false,
        historicalCommandsUnavailable:String(account.status).toUpperCase()!=="ACTIVE" && commands.rows.length===0 && summary.rows.some((r:any)=>Number(r.entries)>0),
        message:"กลุ่มดีลเป็นการอนุมานจาก Entry/Exit ไม่ใช่ ZERO GRID Cycle ID จริง; ระบบยังไม่บันทึก MT5 DEAL_REASON"
      },
      events:limitedEvents.map((e:any)=>({
        id:e.id,source:e.source,recordedAt:e.recorded_at,event:e.event,status:e.status,
        direction:e.direction,volume:e.volume===null?null:Number(e.volume),
        price:e.price===null?null:Number(e.price),pnl:e.pnl===null?null:Number(e.pnl),
        positionId:e.position_id,dealTicket:e.deal_ticket,symbol:e.symbol,currency:e.currency,
        controlMode:e.control_mode,
        executedAt:/^\d{13}$/.test(String(e.deal_time_msc||"")) &&
          Number(e.deal_time_msc)>1_600_000_000_000 &&
          Number(e.deal_time_msc)<now+DAY_MS
            ? new Date(Number(e.deal_time_msc)).toISOString() : null,
        deliveredAt:e.delivered_at,ackedAt:e.acked_at
      })),
      offset:parsedOffset,nextOffset:events.rows.length>100?parsedOffset+100:null
    };
  }
}
