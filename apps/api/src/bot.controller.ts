import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { existsSync, readFileSync } from "node:fs";
import { DbService } from "./db.service";
import { CryptoService, JwtGuard } from "./security";

@Controller("bot")
@UseGuards(JwtGuard)
export class BotController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService
  ) {}

  private productionEaHash() {
    const path = process.env.EA_ARTIFACT_PATH || "/app/apps/api/artifacts/FastBasketBot.ex5";
    if (!existsSync(path)) return null;
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  }

  private clientIp(req: any) {
    const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return (forwarded || String(req?.ip || req?.socket?.remoteAddress || "")).slice(0, 96) || null;
  }

  private async user(userId: string) {
    return this.db.one(
      "SELECT id,user_code,email,role,status FROM users WHERE id=$1",
      [userId]
    );
  }


  private async assertMt5IdentityAvailable(
    userId: string,
    accountNumber: string,
    brokerServer: string,
    slotId: string
  ) {
    const conflict = await this.db.one(
      `SELECT a.id,a.user_id,bi.slot_id,u.user_code,u.role
       FROM mt5_accounts a
       JOIN users u ON u.id=a.user_id
       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id
       WHERE lower(a.account_number)=lower($1)
         AND lower(a.broker_server)=lower($2)
         AND a.status='ACTIVE'
         AND (
           a.user_id<>$3
           OR (bi.slot_id IS NOT NULL AND bi.slot_id<>$4)
         )
       ORDER BY
         CASE WHEN u.role IN ('OWNER','ADMIN') THEN 0 ELSE 1 END,
         a.created_at ASC
       LIMIT 1`,
      [accountNumber, brokerServer, userId, slotId]
    );
    if (conflict) {
      throw new ConflictException(
        "MT5 " + accountNumber + " / " + brokerServer +
        " ถูกผูกกับ SCENOVA Slot อื่นอยู่แล้ว"
      );
    }
  }


  private executionStatusMeta(code: string) {
    const map: Record<string, { label: string; detail: string; tone: string }> = {
      NOT_INSTALLED: { label: "ยังไม่ได้ติดตั้ง", detail: "ติดตั้ง SCENOVA จากเว็บไซต์ก่อน", tone: "warn" },
      MT5_OFFLINE: { label: "MT5 ยังไม่เชื่อมต่อ", detail: "ยังไม่พบ Heartbeat จาก EA ใน MetaTrader 5", tone: "bad" },
      EA_NOT_LOADED: { label: "Device Agent ออนไลน์ แต่ EA ยังไม่ทำงาน", detail: "ติดตั้งสำเร็จแล้ว แต่ FastBasketBot ยังไม่ได้ถูกโหลด/เชื่อมใน MT5", tone: "warn" },
      TERMINAL_DISCONNECTED: { label: "MT5 ไม่มีการเชื่อมต่อ", detail: "Terminal ยังไม่เชื่อม Broker/Server", tone: "bad" },
      ALGO_TRADING_OFF: { label: "Algo Trading ปิดอยู่", detail: "เปิด Algo Trading ใน MetaTrader 5 ก่อนเริ่มบอท", tone: "bad" },
      EA_TRADING_DISABLED: { label: "EA ไม่ได้รับอนุญาตให้เทรด", detail: "เปิด Allow Algo Trading ใน Properties ของ EA", tone: "bad" },
      EA_RUNTIME_OUTDATED: { label: "EA ที่กำลังรันเป็นรุ่นเก่า", detail: "อัปเดต FastBasketBot และรีสตาร์ต/ถอดติด EA ใน MT5 ให้รัน v1.003 ก่อนเริ่มบอท", tone: "bad" },
      ACCOUNT_TRADING_DISABLED: { label: "บัญชีนี้ไม่อนุญาตให้เทรด", detail: "ตรวจสิทธิ์ Trading ของบัญชีกับ Broker", tone: "bad" },
      ACCOUNT_EXPERT_DISABLED: { label: "บัญชีไม่อนุญาต Expert Advisor", detail: "Broker/บัญชีปิดการเทรดด้วย EA", tone: "bad" },
      SYMBOL_TRADING_DISABLED: { label: "Symbol นี้เปิดออเดอร์ไม่ได้", detail: "Broker ปิดการเปิดออเดอร์ใหม่บน Symbol นี้", tone: "bad" },
      NO_ACCESS: { label: "ไม่มีสิทธิ์ใช้งาน", detail: "ต้องมี Trial หรือ Subscription ที่ตรงกับ Slot", tone: "bad" },
      STOPPED: { label: "บอทหยุดอยู่", detail: "พร้อมรับคำสั่งเริ่มจากเว็บ", tone: "neutral" },
      SAFE_STOP: { label: "Safe Stop", detail: "บอทจะไม่เปิดรอบใหม่", tone: "warn" },
      WAITING_EA_START: { label: "กำลังรอ EA รับคำสั่ง Start", detail: "คำสั่งจากเว็บส่งแล้ว รอ Heartbeat รอบถัดไป", tone: "warn" },
      WAITING_MOMENTUM: { label: "กำลังรอสัญญาณ Momentum", detail: "บอท RUNNING แล้ว แต่เงื่อนไขเข้าออเดอร์ยังไม่ถึง", tone: "good" },
      SPREAD_TOO_HIGH: { label: "Spread สูงเกินกำหนด", detail: "บอทรอจน Spread ต่ำกว่า Max Spread", tone: "warn" },
      MAX_POSITIONS: { label: "Position เต็มแล้ว", detail: "จำนวน Position ถึง Max Positions", tone: "warn" },
      ORDER_RATE_LIMIT: { label: "กำลังรอช่วงส่งคำสั่งถัดไป", detail: "Rate limit ของบอทยังไม่พร้อมส่ง Order ใหม่", tone: "warn" },
      CONTROL_NOT_FRESH: { label: "หยุดเปิดออเดอร์ใหม่", detail: "ยังไม่ได้รับการยืนยัน RUNNING ล่าสุดจาก Server จึงล็อกการเปิดออเดอร์ใหม่ไว้", tone: "warn" },
      MIXED_BASKET_BLOCKED: { label: "ล็อก Basket ที่มีสองฝั่ง", detail: "พบ Buy/Sell ปนกันใน Basket เดิม ระบบจะไม่เปิดออเดอร์เพิ่มจนกว่า Basket จะเหลือฝั่งเดียวหรือปิดหมด", tone: "warn" },
      WAITING_DIRECTION_LOCK: { label: "รอสัญญาณฝั่งเดิม", detail: "สัญญาณล่าสุดกลับฝั่งจาก Basket ที่เปิดอยู่ จึงไม่เปิดออเดอร์สวน", tone: "good" },
      READY_BUY: { label: "พบสัญญาณ BUY", detail: "เงื่อนไขพร้อมส่งคำสั่ง BUY", tone: "good" },
      READY_SELL: { label: "พบสัญญาณ SELL", detail: "เงื่อนไขพร้อมส่งคำสั่ง SELL", tone: "good" },
      ORDER_ACCEPTED: { label: "Broker รับคำสั่งแล้ว", detail: "Order ล่าสุดถูก Broker รับแล้ว", tone: "good" },
      MARKET_CLOSED: { label: "ตลาดปิด", detail: "รอ Session เปิดก่อนส่ง Order", tone: "warn" },
      TRADE_DISABLED: { label: "Broker ปิดการเทรด", detail: "Broker ปฏิเสธการส่ง Order", tone: "bad" },
      SERVER_ALGO_DISABLED: { label: "Server ปิด Algo Trading", detail: "Trading Server ไม่อนุญาต Algo Trading", tone: "bad" },
      NO_MONEY: { label: "Margin ไม่เพียงพอ", detail: "Order ล่าสุดถูกปฏิเสธเพราะเงิน/มาร์จิ้นไม่พอ", tone: "bad" },
      BROKER_RATE_LIMIT: { label: "Broker จำกัดคำสั่งชั่วคราว", detail: "รอก่อนส่ง Order ใหม่", tone: "warn" },
      INVALID_VOLUME: { label: "Lot ไม่ถูกต้อง", detail: "Broker ปฏิเสธ Volume ของ Order", tone: "bad" },
      NO_PRICE: { label: "ไม่มีราคาให้ส่ง Order", detail: "รอราคาใหม่จาก Broker", tone: "warn" },
      PRICE_CHANGED: { label: "ราคาเปลี่ยนระหว่างส่งคำสั่ง", detail: "บอทจะประเมินสัญญาณใหม่ใน Tick ถัดไป", tone: "warn" },
      ORDER_REJECTED: { label: "Order ถูกปฏิเสธ", detail: "ตรวจ Retcode ล่าสุดในสถานะ Live", tone: "bad" },
      RUNNING_READY: { label: "บอทกำลังทำงาน", detail: "ระบบพร้อมและกำลังประเมินเงื่อนไขเข้าออเดอร์", tone: "good" },
      EVALUATING: { label: "กำลังประเมินตลาด", detail: "EA กำลังตรวจเงื่อนไขเข้าออเดอร์แบบ Real-time", tone: "good" }
    };
    return map[code] || { label: code || "กำลังตรวจสอบ", detail: "สถานะจาก EA", tone: "neutral" };
  }

  private buildLiveStatus(instance: any, settings: any, entitlement: any) {
    if (!instance) {
      const meta = this.executionStatusMeta("NOT_INSTALLED");
      return { code: "NOT_INSTALLED", ...meta, tradeReady: false };
    }

    const metrics = instance.metrics || {};
    if (!instance.mt5_online) {
      const code = instance.agent_online ? "EA_NOT_LOADED" : "MT5_OFFLINE";
      const meta = this.executionStatusMeta(code);
      return { code, ...meta, tradeReady: false };
    }

    if (String(metrics.eaVersion || "") !== "1.003") {
      const meta = this.executionStatusMeta("EA_RUNTIME_OUTDATED");
      return { code: "EA_RUNTIME_OUTDATED", ...meta, tradeReady: false };
    }

    const permissionChecks: Array<[string, any]> = [
      ["TERMINAL_DISCONNECTED", metrics.terminalConnected],
      ["ALGO_TRADING_OFF", metrics.terminalTradeAllowed],
      ["EA_TRADING_DISABLED", metrics.mqlTradeAllowed],
      ["ACCOUNT_TRADING_DISABLED", metrics.accountTradeAllowed],
      ["ACCOUNT_EXPERT_DISABLED", metrics.accountTradeExpert]
    ];
    for (const [code, value] of permissionChecks) {
      if (value === false) {
        const meta = this.executionStatusMeta(code);
        return { code, ...meta, tradeReady: false };
      }
    }

    if (!entitlement?.allowed) {
      const meta = this.executionStatusMeta("NO_ACCESS");
      return { code: "NO_ACCESS", ...meta, tradeReady: false };
    }

    if (instance.desired_state !== "RUNNING") {
      const code = instance.desired_state === "SAFE_STOP" || instance.actual_state === "SAFE_STOP"
        ? "SAFE_STOP"
        : "STOPPED";
      const meta = this.executionStatusMeta(code);
      return { code, ...meta, tradeReady: metrics.tradeReady !== false };
    }

    if (instance.actual_state !== "RUNNING") {
      const meta = this.executionStatusMeta("WAITING_EA_START");
      return { code: "WAITING_EA_START", ...meta, tradeReady: metrics.tradeReady !== false };
    }

    let code = String(metrics.executionStatus || "").trim();
    if (!code || code === "EVALUATING" || code === "INITIALIZING") {
      const positions = Number(metrics.positions || 0);
      const maxPositions = Number(settings?.maxPositions ?? 10);
      const momentum = Number(metrics.momentumPoints ?? 0);
      const momentumEntry = Number(metrics.momentumEntryPoints ?? 8);
      const entryMode = String(settings?.entryMode || "AUTO_MOMENTUM");

      if (positions >= maxPositions) code = "MAX_POSITIONS";
      else if (entryMode === "AUTO_MOMENTUM" && Math.abs(momentum) < momentumEntry) code = "WAITING_MOMENTUM";
      else code = "RUNNING_READY";
    }

    // Spread is telemetry only now; it must never make the dashboard report
    // a blocked trading state after the EA spread gate was removed.
    if (code === "SPREAD_TOO_HIGH") code = "RUNNING_READY";
    if (instance.actual_state === "RUNNING" && (code === "SAFE_STOP" || code === "STOPPED")) {
      code = "RUNNING_READY";
    }

    const meta = this.executionStatusMeta(code);
    return {
      code,
      ...meta,
      tradeReady: metrics.tradeReady !== false,
      telemetryEnhanced: typeof metrics.tradeReady === "boolean" || Boolean(metrics.executionStatus),
      momentumPoints: Number(metrics.momentumPoints ?? 0),
      momentumEntryPoints: Number(metrics.momentumEntryPoints ?? 8),
      spreadPoints: Number(metrics.spreadPoints ?? 0),
      maxSpreadPoints: Number(settings?.maxSpreadPoints ?? metrics.maxSpreadPoints ?? 50),
      lastOrderRetcode: Number(metrics.lastOrderRetcode ?? 0),
      lastOrderError: Number(metrics.lastOrderError ?? 0),
      lastOrderAt: Number(metrics.lastOrderAt ?? 0)
    };
  }

  private async ensurePrimarySlot(userId: string) {
    let slot = await this.db.one(
      "SELECT * FROM license_slots WHERE owner_user_id=$1 AND assigned_user_id=$1 AND mode='LOCAL' AND status<>'DELETED' ORDER BY slot_number,id LIMIT 1",
      [userId]
    );
    if (slot) return slot;

    const user = await this.user(userId);
    const max = await this.db.one(
      "SELECT COALESCE(max(slot_number),0)::int max_slot FROM license_slots WHERE owner_user_id=$1 AND mode='LOCAL'",
      [userId]
    );
    slot = await this.db.one(
      "INSERT INTO license_slots(owner_user_id,assigned_user_id,mode,slot_number,slot_type,status,label) VALUES($1,$1,'LOCAL',$2,$3,'ACTIVE','Primary') RETURNING *",
      [userId, Number(max?.max_slot || 0) + 1, user?.role === "OWNER" || user?.role === "ADMIN" ? "OWNER" : "PERSONAL"]
    );
    return slot;
  }

  private async ensureModeSlot(userId: string, mode: "CLOUD" | "LOCAL") {
    if (mode === "LOCAL") return this.ensurePrimarySlot(userId);
    let slot = await this.db.one(
      "SELECT * FROM license_slots WHERE assigned_user_id=$1 AND mode=$2 AND status<>'DELETED' ORDER BY CASE WHEN subscription_id IS NOT NULL THEN 0 ELSE 1 END,slot_number,id LIMIT 1",
      [userId, mode]
    );
    if (slot) return slot;
    const max = await this.db.one(
      "SELECT COALESCE(max(slot_number),0)::int max_slot FROM license_slots WHERE owner_user_id=$1 AND mode=$2",
      [userId, mode]
    );
    slot = await this.db.one(
      "INSERT INTO license_slots(owner_user_id,assigned_user_id,mode,slot_number,slot_type,status,label) VALUES($1,$1,$2,$3,'PERSONAL','ACTIVE','Cloud') RETURNING *",
      [userId, mode, Number(max?.max_slot || 0) + 1]
    );
    return slot;
  }

  private async slotRows(userId: string) {
    await this.ensurePrimarySlot(userId);
    const rows = await this.db.query(
      `SELECT
         ls.*,
         ou.user_code owner_user_code,
         au.user_code assigned_user_code,
         au.email assigned_email,
         s.status subscription_status,
         s.starts_at subscription_starts_at,
         s.expires_at subscription_expires_at,
         p.code plan_code,
         p.name_th plan_name,
         p.allow_resale,
         p.max_mt5_accounts plan_slots,
         bi.id instance_id,
         bi.actual_state,
         bi.desired_state,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') mt5_online,
         bi.device_status,
         bi.device_hostname,
         bi.device_last_seen_at,
         bi.pending_account_number,
         bi.pending_broker_server,
         a.id mt5_account_id,
         a.account_number,
         a.broker,
         a.broker_server,
         a.status account_status,
         (ls.assigned_user_id=$1 AND ls.status IN ('ACTIVE','AVAILABLE')) can_control,
         (ls.assigned_user_id=$1 AND ls.mode='LOCAL' AND ls.status<>'DELETED') can_release_device,
         (ls.owner_user_id=$1) can_manage,
         (s.id IS NOT NULL AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now()) subscription_active
       FROM license_slots ls
       JOIN users ou ON ou.id=ls.owner_user_id
       LEFT JOIN users au ON au.id=ls.assigned_user_id
       LEFT JOIN subscriptions s ON s.id=ls.subscription_id
       LEFT JOIN plans p ON p.id=s.plan_id
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE (ls.owner_user_id=$1 OR ls.assigned_user_id=$1)
         AND ls.status<>'DELETED'
       ORDER BY
         CASE WHEN ls.assigned_user_id=$1 AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() THEN 0
              WHEN ls.assigned_user_id=$1 THEN 1 ELSE 2 END,
         ls.mode,ls.slot_number,ls.created_at`,
      [userId]
    );
    return rows.rows;
  }

  private async resolveSlot(userId: string, slotId?: string | null) {
    await this.ensurePrimarySlot(userId);
    if (slotId) {
      const slot = await this.db.one(
        "SELECT * FROM license_slots WHERE id=$1 AND assigned_user_id=$2 AND status IN ('ACTIVE','AVAILABLE')",
        [slotId, userId]
      );
      if (!slot) throw new ConflictException("slot is not assigned to this SCENOVA account");
      return slot;
    }
    const slot = await this.db.one(
      `SELECT ls.*
       FROM license_slots ls
       LEFT JOIN subscriptions s ON s.id=ls.subscription_id
       WHERE ls.assigned_user_id=$1 AND ls.status IN ('ACTIVE','AVAILABLE')
       ORDER BY
         CASE WHEN s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() THEN 0 ELSE 1 END,
         CASE WHEN ls.mode='LOCAL' THEN 0 ELSE 1 END,
         ls.slot_number,ls.created_at
       LIMIT 1`,
      [userId]
    );
    if (!slot) throw new ConflictException("no usable slot");
    return slot;
  }

  private async entitlement(
    userId: string,
    mt5AccountId: string | null,
    mode: string | null,
    slotId: string | null
  ) {
    const user = await this.db.one(
      "SELECT role,status FROM users WHERE id=$1",
      [userId]
    );
    if (user?.status === "ACTIVE" && (user.role === "OWNER" || user.role === "ADMIN")) {
      return { allowed: true, source: "OWNER", unlimited: true, expiresAt: null };
    }

    if (slotId) {
      const sub = await this.db.one(
        `SELECT s.id,s.expires_at,p.code,p.mode,p.allow_resale,p.max_mt5_accounts
         FROM license_slots ls
         JOIN subscriptions s ON s.id=ls.subscription_id
         JOIN plans p ON p.id=s.plan_id
         WHERE ls.id=$1
           AND ls.assigned_user_id=$2
           AND ls.status='ACTIVE'
           AND s.status='ACTIVE'
           AND s.starts_at<=now()
           AND s.expires_at>now()
           AND ($3::text IS NULL OR p.mode=$3)
         LIMIT 1`,
        [slotId, userId, mode]
      );
      if (sub) {
        return {
          allowed: true,
          source: "SUBSCRIPTION",
          expiresAt: sub.expires_at,
          planCode: sub.code,
          slots: sub.max_mt5_accounts,
          reseller: Boolean(sub.allow_resale)
        };
      }
    }

    // Legacy fallback keeps already-issued subscriptions working while their slot
    // migration catches up.
    const legacySub = await this.db.one(
      "SELECT s.id,s.expires_at,p.code,p.mode,p.max_mt5_accounts,p.allow_resale FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() AND ($2::text IS NULL OR p.mode=$2) ORDER BY s.expires_at DESC LIMIT 1",
      [userId, mode]
    );
    if (legacySub && !slotId) {
      return { allowed: true, source: "SUBSCRIPTION", expiresAt: legacySub.expires_at };
    }

    const trial = await this.db.one(
      "SELECT id,status,duration_minutes,started_at,expires_at FROM trial_grants WHERE user_id=$1 AND ($2::uuid IS NULL OR mt5_account_id=$2) ORDER BY created_at DESC LIMIT 1",
      [userId, mt5AccountId]
    );
    if (!trial) return { allowed: false, source: "NONE" };
    if (trial.status === "APPROVED") return { allowed: true, source: "TRIAL_READY", trialId: trial.id };
    if (trial.status === "ACTIVE" && trial.expires_at && new Date(trial.expires_at) > new Date()) {
      return { allowed: true, source: "TRIAL", expiresAt: trial.expires_at };
    }
    return { allowed: false, source: "TRIAL_EXPIRED" };
  }

  @Get("dashboard")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  async dashboard(@Req() req: any, @Query("slotId") slotId = "") {
    const userId = req.user.sub;
    const user = await this.user(userId);
    const selectedSlot = await this.resolveSlot(userId, slotId || null);
    const slots = await this.slotRows(userId);

    const instance = await this.db.one(
      `SELECT bi.*,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS mt5_online,
         (bi.agent_last_seen_at IS NOT NULL AND bi.agent_last_seen_at > now() - interval '30 minutes') AS agent_online,
         (bi.device_last_seen_at IS NOT NULL AND bi.device_last_seen_at > now() - interval '90 seconds') AS device_online,
         CASE WHEN bi.last_seen_at IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (now() - bi.last_seen_at)) END AS ea_last_seen_age_seconds,
         CASE WHEN bi.device_status='ACTIVE'
                    AND bi.device_last_seen_at > now() - interval '90 seconds'
                    AND bi.pending_account_number IS NOT NULL
                    AND bi.pending_account_seen_at > now() - interval '10 minutes'
                    AND COALESCE(bi.pending_account_ip,'')=COALESCE(bi.device_last_ip,'')
              THEN true ELSE false END AS rebind_ready
       FROM bot_instances bi
       WHERE bi.slot_id=$1`,
      [selectedSlot.id]
    );

    let account = null;
    let settings = null;
    if (instance?.mt5_account_id) {
      account = await this.db.one(
        "SELECT * FROM mt5_accounts WHERE id=$1",
        [instance.mt5_account_id]
      );
    }
    if (instance) {
      const row = await this.db.one(
        "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
        [instance.id]
      );
      settings = row?.settings || null;
    }

    const latestTrialRequest = await this.db.one(
      "SELECT id,line_contact,request_ip,status,created_at FROM trial_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );

    const entitlement = await this.entitlement(
      userId,
      account?.id || null,
      selectedSlot.mode || account?.mode || null,
      selectedSlot.id
    );
    const liveStatus = this.buildLiveStatus(instance, settings, entitlement);

    return {
      user,
      slots,
      selectedSlot,
      account,
      instance,
      settings,
      trialRequest: latestTrialRequest,
      entitlement,
      liveStatus
    };
  }

  @Get("slots")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  async slots(@Req() req: any) {
    return this.slotRows(req.user.sub);
  }

  @Get("logs")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  async logs(@Req() req: any, @Query("slotId") slotId = "") {
    const instance = await this.getInstance(req.user.sub, slotId || null);
    const snapshot = await this.db.one(
      "SELECT bi.id,bi.actual_state,bi.desired_state,bi.last_seen_at,bi.metrics,a.account_number,a.broker,a.broker_server,bi.mode FROM bot_instances bi LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id WHERE bi.id=$1",
      [instance.id]
    );
    const rows = await this.db.query(
      "SELECT id,command,payload,status,created_at,delivered_at,acked_at FROM bot_commands WHERE bot_instance_id=$1 ORDER BY id DESC LIMIT 80",
      [instance.id]
    );
    return { snapshot, events: rows.rows };
  }

  @Post("trial-request")
  async requestTrial(
    @Req() req: any,
    @Query("slotId") slotId = "",
    @Body() body: { lineContact: string }
  ) {
    const slot = await this.resolveSlot(req.user.sub, slotId || null);
    const instance = await this.db.one(
      "SELECT bi.*,a.account_number,a.broker_server FROM bot_instances bi LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id WHERE bi.slot_id=$1",
      [slot.id]
    );
    if (!instance?.mt5_account_id) {
      throw new ConflictException("เชื่อมบัญชี MT5 ให้เรียบร้อยก่อนขอ Trial");
    }
    const lineContact = String(body.lineContact || "").trim();
    if (lineContact.length < 2) throw new ConflictException("กรุณาระบุ LINE ที่ใช้ติดต่อ");

    const used = await this.db.one(
      `SELECT id FROM trial_grants
       WHERE user_id=$1
          OR (line_contact IS NOT NULL AND lower(line_contact)=lower($2))
          OR (lower(account_number)=lower($3) AND lower(broker_server)=lower($4))
       LIMIT 1`,
      [req.user.sub, lineContact, instance.account_number, instance.broker_server]
    );
    if (used) throw new ConflictException("บัญชีนี้ / LINE นี้ / MT5 นี้เคยได้รับ Trial แล้ว");

    await this.db.query(
      "UPDATE trial_requests SET status='REPLACED' WHERE user_id=$1 AND status='PENDING'",
      [req.user.sub]
    );
    const row = await this.db.one(
      "INSERT INTO trial_requests(user_id,mt5_account_id,line_contact,request_ip) VALUES($1,$2,$3,$4) RETURNING id,line_contact,request_ip,status,created_at",
      [req.user.sub, instance.mt5_account_id, lineContact, this.clientIp(req)]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'REQUEST_TRIAL','trial_request',$2,$3::jsonb)",
      [String(req.user.code || req.user.sub), row.id, JSON.stringify({ slotId: slot.id, lineContact })]
    );
    return row;
  }

  @Post("installers/windows")
  async prepareWindowsInstaller(
    @Req() req: any,
    @Body() body: { slotId?: string }
  ) {
    const slot = await this.resolveSlot(req.user.sub, body.slotId || null);
    if (slot.mode !== "LOCAL") {
      throw new ConflictException("Windows installer is only for LOCAL slots");
    }

    let instance = await this.db.one(
      `SELECT bi.*,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') mt5_online
       FROM bot_instances bi
       WHERE bi.slot_id=$1`,
      [slot.id]
    );
    if (instance && (
      instance.desired_state === "RUNNING" ||
      (instance.actual_state === "RUNNING" && Boolean(instance.mt5_online)) ||
      Number(instance.positions || 0) > 0
    )) {
      throw new ConflictException("หยุดบอทและจัดการ Position ให้เรียบร้อยก่อนติดตั้งหรือย้ายเครื่อง");
    }

    if (!instance) {
      const placeholder = randomBytes(32).toString("hex");
      instance = await this.db.one(
        "INSERT INTO bot_instances(slot_id,mt5_account_id,mode,install_token_hash) VALUES($1,NULL,'LOCAL',$2) RETURNING *",
        [slot.id, this.crypto.sha256(placeholder)]
      );
      await this.db.query(
        "INSERT INTO bot_settings(bot_instance_id) VALUES($1) ON CONFLICT(bot_instance_id) DO NOTHING",
        [instance.id]
      );
    }

    await this.db.query(
      "UPDATE install_enrollments SET status='CANCELLED' WHERE slot_id=$1 AND status='PENDING'",
      [slot.id]
    );
    const code = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.db.query(
      "INSERT INTO install_enrollments(slot_id,requested_by_user_id,code_hash,expires_at) VALUES($1,$2,$3,$4)",
      [slot.id, req.user.sub, this.crypto.sha256(code), expiresAt]
    );

    return {
      code,
      fileName: "SCENOVA-Setup-v2.0.4-" + code + ".exe",
      downloadPath: "/downloads/SCENOVA-Setup-v2.0.4.exe",
      installerVersion: "2.0.4",
      expiresAt,
      slotId: slot.id
    };
  }

  @Post("slots/assign")
  async assignSlot(
    @Req() req: any,
    @Body() body: { slotId: string; target: string; label?: string }
  ) {
    const slot = await this.db.one(
      `SELECT ls.*,p.allow_resale,s.status subscription_status,s.starts_at,s.expires_at
       FROM license_slots ls
       LEFT JOIN subscriptions s ON s.id=ls.subscription_id
       LEFT JOIN plans p ON p.id=s.plan_id
       WHERE ls.id=$1 AND ls.owner_user_id=$2`,
      [body.slotId, req.user.sub]
    );
    if (!slot) throw new ConflictException("slot not found");
    if (!slot.allow_resale) throw new ConflictException("แพ็กเกจนี้ไม่อนุญาตให้เปิด Slot ให้ผู้อื่น");
    if (slot.subscription_status !== "ACTIVE" || new Date(slot.starts_at) > new Date() || new Date(slot.expires_at) <= new Date()) {
      throw new ConflictException("สมาชิกของ Slot นี้ไม่ Active");
    }

    const targetText = String(body.target || "").trim();
    const target = await this.db.one(
      "SELECT id,user_code,email,status FROM users WHERE status='ACTIVE' AND (lower(email)=lower($1) OR upper(user_code)=upper($1))",
      [targetText]
    );
    if (!target) throw new ConflictException("ไม่พบบัญชี SCENOVA ของผู้รับ Slot");

    const instance = await this.db.one(
      "SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions FROM bot_instances bi WHERE bi.slot_id=$1",
      [slot.id]
    );
    if (instance && (
      instance.actual_state === "RUNNING" ||
      instance.desired_state === "RUNNING" ||
      Number(instance.positions || 0) > 0
    )) {
      throw new ConflictException("หยุดบอทและปิด Position ของ Slot นี้ก่อนเปลี่ยนผู้ใช้งาน");
    }

    if (instance && slot.assigned_user_id && slot.assigned_user_id !== target.id) {
      if (instance.mt5_account_id) {
        await this.db.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [instance.mt5_account_id]);
      }
      const revoked = randomBytes(32).toString("hex");
      await this.db.query(
        `UPDATE bot_instances SET
           mt5_account_id=NULL,install_token_hash=$2,desired_state='STOPPED',actual_state='OFFLINE',
           last_seen_at=NULL,agent_last_seen_at=NULL,device_public_id=NULL,device_secret_hash=NULL,
           device_status='UNREGISTERED',device_hostname=NULL,device_registered_at=NULL,device_last_seen_at=NULL,
           device_last_ip=NULL,ea_last_ip=NULL,pending_account_number=NULL,pending_broker=NULL,
           pending_broker_server=NULL,pending_account_ip=NULL,pending_account_seen_at=NULL
         WHERE id=$1`,
        [instance.id, this.crypto.sha256(revoked)]
      );
    }

    const updated = await this.db.one(
      "UPDATE license_slots SET assigned_user_id=$2,status='ACTIVE',label=COALESCE(NULLIF($3,''),label),updated_at=now() WHERE id=$1 RETURNING *",
      [slot.id, target.id, String(body.label || "").trim()]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'ASSIGN_SLOT','license_slot',$2,$3::jsonb)",
      [String(req.user.code || req.user.sub), slot.id, JSON.stringify({ assignedUserId: target.id, target: targetText })]
    );
    return { slot: updated, assignedUser: target };
  }

  @Post("slots/release")
  async releaseSlot(@Req() req: any, @Body() body: { slotId: string }) {
    const slot = await this.db.one(
      "SELECT * FROM license_slots WHERE id=$1 AND owner_user_id=$2",
      [body.slotId, req.user.sub]
    );
    if (!slot) throw new ConflictException("slot not found");

    const instance = await this.db.one(
      "SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions FROM bot_instances bi WHERE bi.slot_id=$1",
      [slot.id]
    );
    if (instance && (
      instance.actual_state === "RUNNING" ||
      instance.desired_state === "RUNNING" ||
      Number(instance.positions || 0) > 0
    )) {
      throw new ConflictException("หยุดบอทและปิด Position ก่อนคืน Slot");
    }

    if (instance) {
      if (instance.mt5_account_id) {
        await this.db.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [instance.mt5_account_id]);
      }
      const revoked = randomBytes(32).toString("hex");
      await this.db.query(
        `UPDATE bot_instances SET
           mt5_account_id=NULL,install_token_hash=$2,desired_state='STOPPED',actual_state='OFFLINE',
           last_seen_at=NULL,agent_last_seen_at=NULL,device_public_id=NULL,device_secret_hash=NULL,
           device_status='UNREGISTERED',device_hostname=NULL,device_registered_at=NULL,device_last_seen_at=NULL,
           device_last_ip=NULL,ea_last_ip=NULL,pending_account_number=NULL,pending_broker=NULL,
           pending_broker_server=NULL,pending_account_ip=NULL,pending_account_seen_at=NULL
         WHERE id=$1`,
        [instance.id, this.crypto.sha256(revoked)]
      );
    }

    await this.db.query(
      "UPDATE license_slots SET assigned_user_id=NULL,status='AVAILABLE',updated_at=now() WHERE id=$1",
      [slot.id]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'RELEASE_SLOT','license_slot',$2,'{}'::jsonb)",
      [String(req.user.code || req.user.sub), slot.id]
    );
    return { ok: true };
  }

  @Post("device/release")
  async releaseLocalDevice(@Req() req: any, @Query("slotId") slotId = "") {
    const slot = await this.db.one(
      `SELECT *
       FROM license_slots
       WHERE id=$1
         AND assigned_user_id=$2
         AND mode='LOCAL'
         AND status<>'DELETED'`,
      [slotId, req.user.sub]
    );
    if (!slot) {
      throw new ConflictException("ไม่พบ Local Slot นี้ หรือ Slot ไม่ได้เป็นของบัญชี SCENOVA นี้");
    }

    const instance = await this.db.one(
      `SELECT bi.*,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') mt5_online
       FROM bot_instances bi
       WHERE bi.slot_id=$1`,
      [slot.id]
    );
    if (!instance) {
      return { ok: true, released: false, message: "Slot นี้ยังไม่มี Device ที่ลงทะเบียน" };
    }
    if (Number(instance.positions || 0) > 0) {
      throw new ConflictException("ยังมี Position ค้างอยู่ กรุณาปิด Position ให้เรียบร้อยก่อนปลดหรือย้ายเครื่อง");
    }
    if (
      Boolean(instance.mt5_online) &&
      (instance.actual_state === "RUNNING" || instance.desired_state === "RUNNING")
    ) {
      throw new ConflictException("MT5 ยัง Online และบอทกำลังทำงาน กรุณากดหยุดบอทก่อนปลดหรือย้ายเครื่อง");
    }

    const revoked = randomBytes(32).toString("hex");
    await this.db.query(
      `UPDATE bot_instances SET
         install_token_hash=$2,
         desired_state='STOPPED',
         actual_state='OFFLINE',
         last_seen_at=NULL,
         agent_last_seen_at=NULL,
         agent_version=NULL,
         agent_terminal_path=NULL,
         agent_ea_hash=NULL,
         device_public_id=NULL,
         device_secret_hash=NULL,
         device_status='UNREGISTERED',
         device_hostname=NULL,
         device_registered_at=NULL,
         device_last_seen_at=NULL,
         device_last_ip=NULL,
         ea_last_ip=NULL,
         pending_account_number=NULL,
         pending_broker=NULL,
         pending_broker_server=NULL,
         pending_account_ip=NULL,
         pending_account_seen_at=NULL,
         account_change_requested_at=NULL
       WHERE id=$1`,
      [instance.id, this.crypto.sha256(revoked)]
    );
    await this.db.query(
      "UPDATE install_enrollments SET status='CANCELLED' WHERE slot_id=$1 AND status='PENDING'",
      [slot.id]
    );
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'RELEASE_DEVICE','bot_instance',$2,$3::jsonb)",
      [
        String(req.user.code || req.user.sub),
        instance.id,
        JSON.stringify({
          slotId: slot.id,
          deviceHostname: instance.device_hostname || null,
          preservedMt5AccountId: instance.mt5_account_id || null,
          preservedTrialHistory: true
        })
      ]
    );

    return {
      ok: true,
      released: true,
      slotId: slot.id,
      preservedMt5Account: Boolean(instance.mt5_account_id),
      message: "ปลดเครื่องเดิมแล้ว Slot นี้พร้อมติดตั้งบนเครื่องใหม่"
    };
  }

  @Post("mt5/change-request")
  async requestMt5Change(@Req() req: any, @Query("slotId") slotId = "") {
    const slot = await this.resolveSlot(req.user.sub, slotId || null);
    if (slot.mode !== "LOCAL") {
      throw new ConflictException("ปุ่มเปลี่ยน MT5 แบบไม่เปลี่ยน .set ใช้กับ LOCAL Slot เท่านั้น");
    }

    const instance = await this.db.one(
      "SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions FROM bot_instances bi WHERE bi.slot_id=$1",
      [slot.id]
    );
    if (!instance) throw new ConflictException("ติดตั้ง SCENOVA จากเว็บไซต์ก่อน");
    if (!instance.mt5_account_id) throw new ConflictException("Slot นี้ยังไม่มี MT5 เดิมให้เปลี่ยน");
    if (
      instance.actual_state === "RUNNING" ||
      instance.desired_state === "RUNNING" ||
      Number(instance.positions || 0) > 0
    ) {
      throw new ConflictException("หยุดบอทและปิด Position ให้เรียบร้อยก่อนเปลี่ยนบัญชี MT5");
    }
    if (
      instance.device_status !== "ACTIVE" ||
      !instance.device_last_seen_at ||
      Date.now() - new Date(instance.device_last_seen_at).getTime() > 90_000
    ) {
      throw new ConflictException("Device Agent ของเครื่องที่ลงทะเบียนต้อง Online ก่อนเปลี่ยน MT5");
    }

    await this.db.query(
      `UPDATE bot_instances SET
         desired_state='SAFE_STOP',
         account_change_requested_at=now(),
         pending_account_number=NULL,
         pending_broker=NULL,
         pending_broker_server=NULL,
         pending_account_ip=NULL,
         pending_account_seen_at=NULL
       WHERE id=$1`,
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'REQUEST_MT5_CHANGE','bot_instance',$2,$3::jsonb)",
      [String(req.user.code || req.user.sub), instance.id, JSON.stringify({ slotId: slot.id })]
    );

    return {
      ok: true,
      expiresInMinutes: 30,
      message: "พร้อมเปลี่ยน MT5 แล้ว กรุณา Login บัญชีใหม่ใน MT5 บนเครื่องเดิม"
    };
  }

  @Post("mt5/rebind")
  async rebindMt5(@Req() req: any, @Query("slotId") slotId = "") {
    const slot = await this.resolveSlot(req.user.sub, slotId || null);
    const instance = await this.db.one(
      `SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         a.id old_account_id,a.broker old_broker
       FROM bot_instances bi
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE bi.slot_id=$1`,
      [slot.id]
    );
    if (!instance) throw new ConflictException("ติดตั้ง SCENOVA จากเว็บไซต์ก่อน");
    if (slot.mode !== "LOCAL") throw new ConflictException("rebind is only available for LOCAL slots");
    if (instance.actual_state === "RUNNING" || instance.desired_state === "RUNNING" || Number(instance.positions || 0) > 0) {
      throw new ConflictException("หยุดบอทและจัดการ Position ให้เรียบร้อยก่อนเปลี่ยน MT5");
    }
    if (
      instance.device_status !== "ACTIVE" ||
      !instance.device_last_seen_at ||
      Date.now() - new Date(instance.device_last_seen_at).getTime() > 90_000
    ) {
      throw new ConflictException("เครื่องนี้ยังไม่ได้ลงทะเบียนด้วย SCENOVA Installer รุ่นใหม่ หรือ Agent ไม่ออนไลน์");
    }
    if (!instance.pending_account_number || !instance.pending_broker_server || !instance.pending_account_seen_at) {
      throw new ConflictException("ยังไม่พบบัญชี MT5 ใหม่จาก EA");
    }
    if (Date.now() - new Date(instance.pending_account_seen_at).getTime() > 10 * 60_000) {
      throw new ConflictException("ข้อมูลบัญชีที่ตรวจพบหมดอายุ กรุณาเปิด MT5 ให้ EA ส่งสถานะใหม่");
    }
    if (!instance.pending_account_ip || instance.pending_account_ip !== instance.device_last_ip) {
      throw new ConflictException("บัญชี MT5 ใหม่นี้ไม่ได้มาจากเครื่องที่ลงทะเบียนไว้");
    }

    const accountNumber = String(instance.pending_account_number);
    const brokerServer = String(instance.pending_broker_server);
    const broker = String(instance.pending_broker || instance.old_broker || "Detected MT5").slice(0, 80);

    await this.assertMt5IdentityAvailable(
      req.user.sub,
      accountNumber,
      brokerServer,
      slot.id
    );

    let account = await this.db.one(
      "SELECT * FROM mt5_accounts WHERE user_id=$1 AND lower(account_number)=lower($2) AND lower(broker_server)=lower($3) ORDER BY created_at DESC LIMIT 1",
      [req.user.sub, accountNumber, brokerServer]
    );
    if (instance.old_account_id && (!account || account.id !== instance.old_account_id)) {
      await this.db.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [instance.old_account_id]);
    }
    if (account) {
      account = await this.db.one(
        "UPDATE mt5_accounts SET broker=$2,mode='LOCAL',status='ACTIVE' WHERE id=$1 RETURNING *",
        [account.id, broker]
      );
    } else {
      account = await this.db.one(
        "INSERT INTO mt5_accounts(user_id,account_number,broker,broker_server,mode,status) VALUES($1,$2,$3,$4,'LOCAL','ACTIVE') RETURNING *",
        [req.user.sub, accountNumber, broker, brokerServer]
      );
    }

    await this.db.query(
      `UPDATE bot_instances SET
         mt5_account_id=$2,desired_state='STOPPED',actual_state='SAFE_STOP',
         pending_account_number=NULL,pending_broker=NULL,pending_broker_server=NULL,
         pending_account_ip=NULL,pending_account_seen_at=NULL,account_change_requested_at=NULL
       WHERE id=$1`,
      [instance.id, account.id]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'REBIND_MT5','bot_instance',$2,$3::jsonb)",
      [String(req.user.code || req.user.sub), instance.id, JSON.stringify({ slotId: slot.id, accountNumber, brokerServer, preservedTrialHistory: true })]
    );
    return { ok: true, account };
  }

  @Post("mt5")
  async linkMt5(
    @Req() req: any,
    @Body() body: {
      slotId?: string;
      accountNumber: string;
      broker?: string;
      brokerServer: string;
      mode: "CLOUD" | "LOCAL";
    }
  ) {
    const mode: "CLOUD" | "LOCAL" = body.mode === "CLOUD" ? "CLOUD" : "LOCAL";
    const slot = body.slotId
      ? await this.resolveSlot(req.user.sub, body.slotId)
      : await this.ensureModeSlot(req.user.sub, mode);
    if (slot.mode !== mode) throw new ConflictException("slot mode does not match MT5 mode");
    if (mode === "LOCAL") {
      throw new ConflictException("LOCAL mode must be installed from the SCENOVA website; MT5 will be detected automatically");
    }

    await this.assertMt5IdentityAvailable(
      req.user.sub,
      String(body.accountNumber),
      String(body.brokerServer),
      slot.id
    );

    let account = await this.db.one(
      "SELECT * FROM mt5_accounts WHERE user_id=$1 AND lower(account_number)=lower($2) AND lower(broker_server)=lower($3) LIMIT 1",
      [req.user.sub, String(body.accountNumber), String(body.brokerServer)]
    );
    if (account) {
      account = await this.db.one(
        "UPDATE mt5_accounts SET broker=$2,mode=$3,status='ACTIVE' WHERE id=$1 RETURNING *",
        [account.id, body.broker || "Exness", mode]
      );
    } else {
      account = await this.db.one(
        "INSERT INTO mt5_accounts(user_id,account_number,broker,broker_server,mode) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [req.user.sub, String(body.accountNumber), body.broker || "Exness", String(body.brokerServer), mode]
      );
    }

    const installToken = randomBytes(32).toString("hex");
    let instance = await this.db.one("SELECT * FROM bot_instances WHERE slot_id=$1", [slot.id]);
    if (instance) {
      instance = await this.db.one(
        "UPDATE bot_instances SET mt5_account_id=$2,mode=$3,install_token_hash=$4,actual_state='OFFLINE',last_seen_at=NULL WHERE id=$1 RETURNING id,mode,desired_state,actual_state",
        [instance.id, account.id, mode, this.crypto.sha256(installToken)]
      );
    } else {
      instance = await this.db.one(
        "INSERT INTO bot_instances(slot_id,mt5_account_id,mode,install_token_hash) VALUES($1,$2,$3,$4) RETURNING id,mode,desired_state,actual_state",
        [slot.id, account.id, mode, this.crypto.sha256(installToken)]
      );
      await this.db.query("INSERT INTO bot_settings(bot_instance_id) VALUES($1)", [instance.id]);
    }

    const secret = this.crypto.encrypt(installToken);
    await this.db.query(
      "INSERT INTO bot_instance_secrets(bot_instance_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4) ON CONFLICT(bot_instance_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag",
      [instance.id, secret.ciphertext, secret.iv, secret.authTag]
    );

    return {
      account,
      instance,
      installToken: null,
      note: "Cloud install token is held encrypted for the assigned worker."
    };
  }

  @Post("mt5/rotate-install-token")
  async rotateInstallToken(@Req() req: any, @Query("slotId") slotId = "") {
    const user = await this.user(req.user.sub);
    if (!user || (user.role !== "OWNER" && user.role !== "ADMIN")) {
      throw new ConflictException("use the SCENOVA website installer to repair or move a customer device");
    }
    const instance = await this.getInstance(req.user.sub, slotId || null);
    if (instance.mode !== "LOCAL") {
      throw new ConflictException("install token rotation is only available for LOCAL mode");
    }
    const installToken = randomBytes(32).toString("hex");
    await this.db.query(
      "UPDATE bot_instances SET install_token_hash=$2,actual_state='OFFLINE',last_seen_at=NULL WHERE id=$1",
      [instance.id, this.crypto.sha256(installToken)]
    );
    return {
      instanceId: instance.id,
      installToken,
      note: "Emergency rotation only. Reinstall from the website to apply this token safely."
    };
  }

  @Post("mt5/reset")
  async resetMt5(@Req() req: any, @Query("slotId") slotId = "") {
    const slot = await this.resolveSlot(req.user.sub, slotId || null);
    const instance = await this.db.one(
      "SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions FROM bot_instances bi WHERE bi.slot_id=$1",
      [slot.id]
    );
    if (!instance) return { ok: true };
    if (instance.actual_state === "RUNNING" || instance.desired_state === "RUNNING" || Number(instance.positions || 0) > 0) {
      throw new ConflictException("stop the bot and close positions before changing MT5 account");
    }
    if (instance.mt5_account_id) {
      await this.db.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [instance.mt5_account_id]);
    }
    await this.db.query(
      "UPDATE bot_instances SET mt5_account_id=NULL,desired_state='STOPPED',actual_state='OFFLINE',last_seen_at=NULL,pending_account_number=NULL,pending_broker=NULL,pending_broker_server=NULL,pending_account_ip=NULL,pending_account_seen_at=NULL,account_change_requested_at=NULL WHERE id=$1",
      [instance.id]
    );
    return { ok: true, preservedTrialHistory: true };
  }

  @Post("mt5/cloud-credential")
  async saveCloudCredential(
    @Req() req: any,
    @Body() body: { mt5AccountId: string; tradingPassword: string }
  ) {
    const account = await this.db.one(
      "SELECT * FROM mt5_accounts WHERE id=$1 AND user_id=$2 AND mode='CLOUD'",
      [body.mt5AccountId, req.user.sub]
    );
    if (!account) throw new ConflictException("cloud MT5 account not found");
    const enc = this.crypto.encrypt(String(body.tradingPassword || ""));
    await this.db.query(
      "INSERT INTO mt5_credentials(mt5_account_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4) ON CONFLICT(mt5_account_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,updated_at=now()",
      [account.id, enc.ciphertext, enc.iv, enc.authTag]
    );
    return { ok: true };
  }

  @Post("start")
  async start(@Req() req: any, @Query("slotId") slotId = "") {
    const instance = await this.getInstance(req.user.sub, slotId || null);
    if (!instance.mt5_account_id) throw new ConflictException("เชื่อมบัญชี MT5 ก่อนเริ่มบอท");
    const access: any = await this.entitlement(
      req.user.sub,
      instance.mt5_account_id,
      instance.mode,
      instance.slot_id
    );
    if (!access.allowed) throw new ConflictException("trial or matching subscription required");

    if (instance.mode === "LOCAL") {
      if (!instance.mt5_online) {
        throw new ConflictException("MT5/EA ยังไม่เชื่อมต่อ กรุณาเปิด MT5 และให้ EA ส่ง Heartbeat ก่อนเริ่มบอท");
      }

      const metrics = instance.metrics || {};
      if (metrics.terminalConnected === false) {
        throw new ConflictException("MT5 ยังไม่เชื่อมกับ Broker/Server");
      }
      if (metrics.terminalTradeAllowed === false) {
        throw new ConflictException("Algo Trading ปิดอยู่ กรุณาเปิด Algo Trading ใน MT5 ก่อนเริ่มบอท");
      }
      if (metrics.mqlTradeAllowed === false) {
        throw new ConflictException("EA ยังไม่ได้เปิด Allow Algo Trading ใน Properties");
      }
      if (metrics.accountTradeAllowed === false) {
        throw new ConflictException("บัญชี MT5 นี้ไม่อนุญาตให้เทรด");
      }
      if (metrics.accountTradeExpert === false) {
        throw new ConflictException("บัญชี MT5 นี้ไม่อนุญาตให้ Expert Advisor เทรด");
      }

      const useDeviceLock = instance.device_status === "ACTIVE";
      const seenAt = useDeviceLock ? instance.device_last_seen_at : instance.agent_last_seen_at;
      const limitMs = useDeviceLock ? 90_000 : 30 * 60_000;
      const seenMs = seenAt ? new Date(seenAt).getTime() : 0;
      if (!seenMs || Date.now() - seenMs > limitMs) {
        throw new ConflictException(useDeviceLock
          ? "SCENOVA Device Agent is offline; open the registered PC before starting"
          : "SCENOVA Desktop Agent is offline; reinstall from the website");
      }

      const expectedHash = this.productionEaHash();
      if (!expectedHash || !instance.agent_ea_hash || String(instance.agent_ea_hash).toLowerCase() !== expectedHash) {
        throw new ConflictException("SCENOVA EA integrity/version check failed; update or repair the EA before starting");
      }

      const runningEaVersion = String(instance.metrics?.eaVersion || "");
      if (runningEaVersion !== "1.003") {
        throw new ConflictException("EA ที่กำลังรันใน MT5 เป็นรุ่นเก่า กรุณาอัปเดต FastBasketBot แล้ว Restart MT5 หรือถอด/ติด EA ใหม่ให้เป็น v1.003");
      }
    }

    if (access.source === "TRIAL_READY") {
      await this.db.query(
        "UPDATE trial_grants SET status='ACTIVE',started_at=now(),expires_at=now() + (duration_minutes || ' minutes')::interval WHERE id=$1 AND status='APPROVED'",
        [access.trialId]
      );
    }
    await this.db.query(
      "UPDATE bot_instances SET desired_state='RUNNING',lock_owner=id::text WHERE id=$1",
      [instance.id]
    );
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'START')",
      [instance.id]
    );
    return { ok: true, state: "RUNNING" };
  }

  @Post("stop")
  async safeStop(@Req() req: any, @Query("slotId") slotId = "") {
    return this.commandForUser(req.user.sub, "SAFE_STOP", slotId || null);
  }

  @Post("close-all")
  async closeAll(@Req() req: any, @Query("slotId") slotId = "") {
    return this.commandForUser(req.user.sub, "CLOSE_ALL", slotId || null);
  }

  @Put("settings")
  async updateSettings(
    @Req() req: any,
    @Query("slotId") slotId = "",
    @Body() body: Record<string, any>
  ) {
    const instance = await this.getInstance(req.user.sub, slotId || null);
    const clean: Record<string, any> = {};

    const numberSetting = (
      key: string,
      min: number,
      max: number,
      integer = false
    ) => {
      if (body[key] === undefined) return;
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new BadRequestException(key + " ไม่อยู่ในช่วงที่อนุญาต");
      }
      clean[key] = integer ? Math.trunc(value) : value;
    };

    if (body.symbol !== undefined) {
      const symbol = String(body.symbol || "").trim();
      if (!symbol || symbol.length > 64 || !/^[A-Za-z0-9._#-]+$/.test(symbol)) {
        throw new BadRequestException("Symbol ไม่ถูกต้อง");
      }
      clean.symbol = symbol;
    }

    numberSetting("lot", 0.01, 100);
    numberSetting("maxPositions", 1, 100, true);
    numberSetting("basketTriggerMoney", 0.01, 100000);
    numberSetting("basketTrailMoney", 0.01, 100000);
    numberSetting("maxBasketLossMoney", 0, 100000);
    numberSetting("dailyLossMoney", 0, 100000);
    numberSetting("minOrderIntervalMs", 0, 60000, true);
    numberSetting("maxOrdersPerMinute", 1, 5000, true);

    if (body.entryMode !== undefined) {
      const entryMode = String(body.entryMode || "");
      if (!["AUTO_MOMENTUM", "BUY_ONLY", "SELL_ONLY"].includes(entryMode)) {
        throw new BadRequestException("Entry Mode ไม่ถูกต้อง");
      }
      clean.entryMode = entryMode;
    }

    if (Object.keys(clean).length === 0) {
      throw new BadRequestException("ไม่มีค่าการตั้งค่าที่บันทึกได้");
    }

    const saved = await this.db.one(
      `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
       VALUES($1,$2::jsonb,now())
       ON CONFLICT(bot_instance_id)
       DO UPDATE SET
         settings=bot_settings.settings || EXCLUDED.settings,
         updated_at=now()
       RETURNING settings`,
      [instance.id, JSON.stringify(clean)]
    );

    // Only the newest settings command matters. EA also receives the complete
    // latest settings object in every heartbeat.
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND command='UPDATE_SETTINGS' AND status IN ('PENDING','DELIVERED')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command,payload) VALUES($1,'UPDATE_SETTINGS',$2::jsonb)",
      [instance.id, JSON.stringify(clean)]
    );

    return { ok: true, settings: saved?.settings || clean };
  }

  private async getInstance(userId: string, slotId?: string | null) {
    const slot = await this.resolveSlot(userId, slotId || null);
    const instance = await this.db.one(
      `SELECT bi.*,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS mt5_online
       FROM bot_instances bi
       WHERE bi.slot_id=$1`,
      [slot.id]
    );
    if (!instance) throw new ConflictException("install SCENOVA for this slot first");
    return instance;
  }

  private async commandForUser(userId: string, command: string, slotId?: string | null) {
    const instance = await this.getInstance(userId, slotId || null);
    const desired = command === "CLOSE_ALL" ? "STOPPED" : "SAFE_STOP";
    await this.db.query("UPDATE bot_instances SET desired_state=$2 WHERE id=$1", [instance.id, desired]);
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,$2)",
      [instance.id, command]
    );
    return { ok: true, state: desired };
  }
}
