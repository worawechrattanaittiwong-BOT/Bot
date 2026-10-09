import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Logger,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { EA_RUNTIME_CONTRACT, FIRST_CONNECT_PRIME_MIN_EA_VERSION, ZERO_GRID_MAX_LEVELS_PER_SIDE, installerDownloadPath, isEaVersionExact, isVersionAtLeast, isVersionExact, isVersionSame, latestEaRelease, latestInstallerVersion } from "./release-version";
import { AdminGuard, CryptoService, JwtGuard } from "./security";
import { MaintenanceService } from "./maintenance.service";
import { TradingModeControlService, canonicalTradingMode } from "./trading-mode-control.service";
import { PartnerService } from "./partner.service";
import { TrialAuthorizationService } from "./trial-authorization.service";
import { RuntimeMigrationService } from "./runtime-migration.service";
import { reconstructCompletedJournal, resolveJournalControlMode } from "./performance-journal";

function isBitcoinTradingSymbol(value: unknown) {
  const symbol = String(value || "").trim().toUpperCase();
  return symbol.includes("BTC") || symbol.includes("XBT");
}

@Controller("bot")
@UseGuards(JwtGuard)
export class BotController {
  private readonly logger = new Logger(BotController.name);

  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly maintenance: MaintenanceService,
    private readonly tradingModes: TradingModeControlService,
    private readonly partner: PartnerService,
    private readonly trials: TrialAuthorizationService,
    private readonly migrations: RuntimeMigrationService
  ) {}

  private supportedEaRuntime(version: any) {
    // Runtime compatibility is a protocol/safety gate, not a "latest patch"
    // gate. Older EA patches remain usable until an explicit Admin update is
    // released/applied, as long as they include the protected Cloud runtime.
    return isVersionAtLeast(version, FIRST_CONNECT_PRIME_MIN_EA_VERSION);
  }

  private async armFirstConnectPrime(
    instanceId: string,
    actor: string,
    force = false
  ) {
    return this.db.transaction(async (tx) => {
      const row = (await tx.query(
        `SELECT bi.id,bi.mode,bi.metrics,bs.settings
         FROM bot_instances bi
         LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
         WHERE bi.id=$1
         FOR UPDATE OF bi`,
        [instanceId]
      )).rows[0];

      if (!row || String(row.mode || "").toUpperCase() !== "CLOUD") {
        return false;
      }

      const settings = row.settings || {};
      if (!force && settings.firstConnectPrimeCompletedAt) {
        return false;
      }

      const positions = Math.max(
        0,
        Number(row.metrics?.accountScenovaPositions ?? row.metrics?.positions ?? 0)
      );
      const pendingOrders = Math.max(
        0,
        Number(row.metrics?.accountScenovaPendingOrders ?? 0)
      );
      if (positions > 0 || pendingOrders > 0) {
        return false;
      }

      await tx.query(
        `INSERT INTO bot_settings(bot_instance_id,settings)
         VALUES(
           $1,
           jsonb_build_object(
             'firstConnectPrimePending',true,
             'firstConnectPrimeStartedAt',now()::text
           )
         )
         ON CONFLICT(bot_instance_id) DO UPDATE SET
           settings=jsonb_set(
             jsonb_set(
               COALESCE(bot_settings.settings,'{}'::jsonb) - 'firstConnectPrimeCompletedAt',
               '{firstConnectPrimePending}',
               'true'::jsonb,
               true
             ),
             '{firstConnectPrimeStartedAt}',
             to_jsonb(now()::text),
             true
           ),
           updated_at=now()`,
        [instanceId]
      );

      await tx.query(
        `UPDATE bot_instances
         SET desired_state='STOPPED',lock_owner=NULL
         WHERE id=$1`,
        [instanceId]
      );
      await tx.query(
        `UPDATE bot_commands
         SET status='ACKED',acked_at=COALESCE(acked_at,now())
         WHERE bot_instance_id=$1
           AND command IN ('START','SAFE_STOP')
           AND status IN ('PENDING','DELIVERED')`,
        [instanceId]
      );
      await tx.query(
        `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
         VALUES(
           $1,
           'FIRST_CONNECT_PRIME_ARMED',
           'bot_instance',
           $2,
           jsonb_build_object('noEntry',true)
         )`,
        [actor.slice(0,160), instanceId]
      );
      return true;
    });
  }

  private installerUpdateState(instance: any, mode?: string | null) {
    const latestVersion = latestInstallerVersion();
    const release = latestEaRelease();

    if (String(mode || instance?.mode || "") !== "LOCAL" || !instance) {
      return {
        required: false,
        installerRequired: false,
        installerUpdateAvailable: false,
        eaUpdateRequired: false,
        currentVersion: null,
        latestVersion,
        currentEaVersion: null,
        latestEaVersion: release.eaVersion,
        currentEaHash: null,
        latestEaHash: release.sha256,
        eaVersionMatch: true,
        eaHashMatch: true,
        currentRuntimeBuildId: null,
        requiredRuntimeBuildId: release.buildId,
        runtimeBuildMatch: true,
        currentRuntimeContract: null,
        requiredRuntimeContract: EA_RUNTIME_CONTRACT,
        runtimeContractMatch: true,
        downloadPath: installerDownloadPath(latestVersion),
        reason: null
      };
    }

    const currentVersion = String(instance.agent_version || "").trim() || null;
    const currentEaVersion = String(instance.metrics?.eaVersion || "").trim() || null;
    const currentEaHash = String(instance.agent_ea_hash || "").trim().toLowerCase() || null;
    const latestEaHash = String(release.sha256 || "").trim().toLowerCase() || null;
    const currentRuntimeBuildId = String(instance.metrics?.buildId || "").trim() || null;
    const requiredRuntimeBuildId = String(release.buildId || "").trim() || null;
    const runtimeBuildMatch =
      !requiredRuntimeBuildId ||
      currentRuntimeBuildId === requiredRuntimeBuildId;
    const currentRuntimeContract = String(instance.metrics?.runtimeContract || "").trim() || null;
    const requiredRuntimeContract = EA_RUNTIME_CONTRACT;
    const runtimeContractMatch = currentRuntimeContract === requiredRuntimeContract;

    const installerRequired =
      !currentVersion ||
      !isVersionExact(currentVersion, latestVersion);
    const installerUpdateAvailable =
      !currentVersion ||
      !isVersionSame(currentVersion, latestVersion);

    const eaVersionMatch = isEaVersionExact(currentEaVersion, release.eaVersion);
    const eaHashMatch = Boolean(
      latestEaHash &&
      currentEaHash &&
      currentEaHash === latestEaHash
    );
    const eaUpdateRequired =
      !eaVersionMatch ||
      !eaHashMatch ||
      !runtimeBuildMatch ||
      !runtimeContractMatch;
    const required = installerRequired || eaUpdateRequired;

    let reason: string | null = null;
    if (installerRequired) {
      reason = currentVersion
        ? "SCENOVA Windows Setup เวอร์ชันไม่ตรงกับ Server ต้องอัปเดตก่อนเริ่มบอท"
        : "ยังตรวจสอบ SCENOVA Agent ไม่ได้ ต้องติดตั้ง/อัปเดตก่อนเริ่มบอท";
    } else if (!eaVersionMatch) {
      reason =
        "FastBasketBot เวอร์ชันไม่ตรงกับ Server: เครื่องนี้ v" +
        (currentEaVersion || "ไม่ทราบ") +
        " · Server v" + release.eaVersion;
    } else if (!runtimeBuildMatch) {
      reason = currentRuntimeBuildId
        ? "ไฟล์ EA อาจอัปเดตแล้ว แต่ MT5 ยังกำลังรัน Build เก่า กรุณากดอัปเดต EA เพื่อรีโหลด Build ล่าสุด"
        : "EA ที่กำลังรันยังไม่ยืนยัน Build ID กรุณากดอัปเดต EA เพื่อโหลด Build ล่าสุด";
    } else if (!runtimeContractMatch) {
      reason = currentRuntimeContract
        ? "EA ที่กำลังรันยังเป็น Runtime เก่า แม้ไฟล์ EX5 บนเครื่องอาจอัปเดตแล้ว กรุณากดอัปเดต EA และให้ MT5 รีโหลด Runtime ล่าสุด"
        : "ยังไม่ได้รับ Runtime Contract จาก EA ที่กำลังรัน กรุณาอัปเดต EA และให้ MT5 รีโหลดก่อนเริ่มบอท";
    } else if (!latestEaHash) {
      reason = "Server ยังตรวจสอบ EX5 ล่าสุดไม่ได้ จึงยังไม่อนุญาตให้เริ่มบอท";
    } else if (!eaHashMatch) {
      reason = currentEaHash
        ? "ไฟล์ FastBasketBot.ex5 ในเครื่องยังไม่ตรงกับไฟล์ล่าสุดบน Server"
        : "ยังไม่ได้รับค่า Hash ของ FastBasketBot.ex5 จาก Agent";
    }

    return {
      required,
      installerRequired,
      installerUpdateAvailable,
      eaUpdateRequired,
      currentVersion,
      latestVersion,
      currentEaVersion,
      latestEaVersion: release.eaVersion,
      currentEaHash,
      latestEaHash,
      eaVersionMatch,
      eaHashMatch,
      currentRuntimeBuildId,
      requiredRuntimeBuildId,
      runtimeBuildMatch,
      currentRuntimeContract,
      requiredRuntimeContract,
      runtimeContractMatch,
      buildId: release.buildId,
      sourceCommit: release.sourceCommit,
      builtAt: release.builtAt,
      downloadPath: installerDownloadPath(latestVersion),
      reason
    };
  }

  private mapStartDatabaseConflict(error: any) {
    const code = String(error?.code || "");
    const message = String(error?.message || "");

    if (
      code === "55000" &&
      message.includes("runtime migration is active for this bot instance")
    ) {
      return new ConflictException(
        "กำลังย้ายการทำงานระหว่าง Local/Cloud อยู่ จึงยังเริ่มบอทไม่ได้ กรุณารอให้การย้ายเสร็จก่อน"
      );
    }

    if (
      code === "P0001" &&
      (
        message.includes("SCENOVA_MAINTENANCE_BLOCKS_START") ||
        message.includes("SCENOVA_MAINTENANCE_BLOCKS_START_COMMAND")
      )
    ) {
      return new ConflictException(
        "ระบบกำลังปิดอย่างปลอดภัยหรืออยู่ระหว่าง Maintenance จึงยังเริ่มบอทไม่ได้"
      );
    }

    return null;
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
    _slotId: string
  ) {
    const conflict = await this.db.one(
      `SELECT a.id,a.user_id,u.user_code,u.role
       FROM mt5_accounts a
       JOIN users u ON u.id=a.user_id
       WHERE lower(a.account_number)=lower($1)
         AND lower(a.broker_server)=lower($2)
         AND a.status='ACTIVE'
         AND a.user_id<>$3
       ORDER BY
         CASE WHEN u.role IN ('OWNER','ADMIN') THEN 0 ELSE 1 END,
         a.created_at ASC
       LIMIT 1`,
      [accountNumber, brokerServer, userId]
    );
    if (conflict) {
      throw new ConflictException(
        "MT5 " + accountNumber + " / " + brokerServer +
        " ถูกผูกกับบัญชี SCENOVA อื่นอยู่แล้ว"
      );
    }
  }


  private executionStatusMeta(code: string) {
    const map: Record<string, { label: string; detail: string; tone: string }> = {
      NOT_INSTALLED: { label: "ยังไม่ได้ติดตั้ง", detail: "ติดตั้ง SCENOVA จากเว็บไซต์ก่อน", tone: "warn" },
      MT5_OFFLINE: { label: "MT5 ยังไม่เชื่อมต่อ", detail: "ยังไม่พบ Heartbeat จาก EA ใน MetaTrader 5", tone: "bad" },
      TERMINAL_DISCONNECTED: { label: "MT5 ไม่มีการเชื่อมต่อ", detail: "Terminal ยังไม่เชื่อม Broker/Server", tone: "bad" },
      ALGO_TRADING_OFF: { label: "Algo Trading ปิดอยู่", detail: "เปิด Algo Trading ใน MetaTrader 5 ก่อนเริ่มบอท", tone: "bad" },
      EA_TRADING_DISABLED: { label: "กำลังแก้สิทธิ์การเทรดของ EA", detail: "SCENOVA Agent จะเปิด MT5 ใหม่พร้อม Allow Live Trading อัตโนมัติ หากยังไม่หายให้ตรวจ Algo Trading ด้านบนของ MT5", tone: "warn" },
      EA_RUNTIME_OUTDATED: { label: "EA Version ไม่ตรงกับ Server", detail: "ต้องใช้ FastBasketBot เวอร์ชันล่าสุดที่ตรงกับ Server ก่อนเริ่มบอท", tone: "bad" },
      ACCOUNT_TRADING_DISABLED: { label: "บัญชีนี้ไม่อนุญาตให้เทรด", detail: "ตรวจสิทธิ์ Trading ของบัญชีกับ Broker", tone: "bad" },
      ACCOUNT_EXPERT_DISABLED: { label: "บัญชีไม่อนุญาต Expert Advisor", detail: "Broker/บัญชีปิดการเทรดด้วย EA", tone: "bad" },
      SYMBOL_TRADING_DISABLED: { label: "Symbol นี้เปิดออเดอร์ไม่ได้", detail: "Broker ปิดการเปิดออเดอร์ใหม่บน Symbol นี้", tone: "bad" },
      NO_ACCESS: { label: "ไม่มีสิทธิ์ใช้งาน", detail: "ต้องมี Trial หรือ Subscription ที่ใช้งานได้กับบัญชี SCENOVA นี้", tone: "bad" },
      STOPPED: { label: "บอทหยุดอยู่", detail: "พร้อมรับคำสั่งเริ่มจากเว็บ", tone: "neutral" },
      SAFE_STOP: { label: "Safe Stop", detail: "ไม่เปิดรอบใหม่ · รอบที่กำลังทำงานอยู่ยังจัดการและปิดตามเงื่อนไขเดิม", tone: "warn" },
      DAILY_PROFIT_LOCK: { label: "ถึงเป้ากำไรประจำวันแล้ว", detail: "EA ปิด Position และล็อกไม่เปิดรอบใหม่จนกว่าจะขึ้นวันใหม่", tone: "good" },
      DAILY_PROFIT_RUN_ON: { label: "ถึงเป้ากำไรแล้ว · รันต่อ", detail: "บอทยังทำงานต่อและรอเงื่อนไข % ที่ตั้งไว้", tone: "good" },
      DAILY_PROFIT_GIVEBACK_LOCK: { label: "ปิดบอทตาม % กำไรต่อวัน", detail: "กำไรลดลงจากเป้าหมายถึงเปอร์เซ็นต์ที่กำหนด ระบบปิดทั้งหมดและหยุด", tone: "good" },
      DAILY_LOSS_LOCK: { label: "ถึงขีดจำกัดขาดทุนรายวัน", detail: "EA หยุดเปิดรอบใหม่ตาม Daily Loss Limit", tone: "bad" },
      POSITION_PROFIT_CLOSED: { label: "ปิดไม้ที่ถึงเป้ากำไร", detail: "Position ที่ถึงกำไรต่อไม้ถูกปิดแล้ว", tone: "good" },
      POSITION_LOSS_CLOSED: { label: "ปิดไม้ที่ถึงขาดทุนกำหนด", detail: "Position ที่ถึง Loss ต่อไม้ถูกปิดแล้ว", tone: "warn" },
      POSITION_TARGET_CLOSED: { label: "ปิดไม้ตามเป้าหมายแล้ว", detail: "EA จะประเมิน Basket ใหม่ใน Tick ถัดไป", tone: "good" },
      BASKET_PROFIT_TARGET: { label: "ถึงกำไรเป้าหมาย Basket", detail: "กำไรรวมของรอบถึงเป้าและ EA ปิด Basket แล้ว", tone: "good" },
      PROFIT_RUN_PERCENT_TRAIL: { label: "ปิด Basket หลังปล่อยกำไรวิ่ง", detail: "กำไรรวมถึงเป้าแล้ว ระบบปล่อยต่อจนกำไรย่อลงจาก Peak ตามเปอร์เซ็นต์ที่ตั้ง", tone: "good" },
      WAITING_EA_START: { label: "กำลังรอ EA รับคำสั่ง Start", detail: "คำสั่งจากเว็บส่งแล้ว รอ Heartbeat รอบถัดไป", tone: "warn" },
      WAITING_SETUP: { label: "กำลังหาจุดเข้า", detail: "Setup-First Engine กำลังหา Pullback / S-R reaction / Order Block / Fibonacci / Breakout / Structure continuation โดยไม่บังคับ Confidence", tone: "good" },
      WAITING_PULLBACK_RETEST: { label: "ไม่ไล่ราคา — รอ Pullback / Retest", detail: "ทิศทางอาจถูก แต่ราคาอยู่ปลาย Impulse / Fib terminal / ใกล้แนวปลายทาง หรือมีไส้สวนแรง ระบบจึงรอให้ราคาย่อกลับและยืนยันทิศอีกครั้งก่อนเข้า", tone: "warn" },
      WAITING_BREAKOUT_RETEST: { label: "Breakout ยืดเกินไป — รอ Retest", detail: "แท่ง Breakout ยาวหรือมีไส้สวนมาก เสี่ยงเป็น Exhaustion / Liquidity Sweep ระบบจะไม่ไล่ปลายแท่งและรอ Retest ระดับที่แตกก่อน", tone: "warn" },
      WAITING_MOMENTUM: { label: "กำลังหาจุดเข้า", detail: "สถานะจาก EA รุ่นเก่า; รุ่นใหม่ใช้ Momentum เป็นตัวช่วย ไม่ใช่ประตูบังคับ", tone: "good" },
      WAITING_CONFIDENCE: { label: "กำลังรอ Confidence", detail: "ผู้ใช้เปิดตัวกรอง Confidence ไว้ และคะแนนยังต่ำกว่าเกณฑ์ Dynamic ของจุดนี้", tone: "good" },
      WAITING_TREND_ALIGNMENT: { label: "กำลังรอแนวโน้มยืนยัน", detail: "M30 และ H1 พลิกสวนทิศทางออเดอร์พร้อมกัน ระบบรอโครงสร้างกลับมายืนยัน", tone: "good" },
      WAITING_REGIME_ALIGNMENT: { label: "รอ Momentum ไปทางเดียวกับเทรนด์", detail: "AUTO MOMENTUM จะไม่เปิดสวน Bias หลักของ M30/H1 เมื่อแนวโน้มชัดเจน", tone: "good" },
      BLOCKED_MAJOR_RESISTANCE: { label: "รอผ่านแนวต้านใหญ่", detail: "ราคากำลังชิดแนวต้าน M30/H1 จึงไม่ Buy ไล่เข้าชนโซนโดยตรง; เมื่อ Breakout ผ่าน ระบบจะประเมินใหม่ทันที", tone: "warn" },
      BLOCKED_MAJOR_SUPPORT: { label: "รอผ่านแนวรับใหญ่", detail: "ราคากำลังชิดแนวรับ M30/H1 จึงไม่ Sell ไล่เข้าชนโซนโดยตรง; เมื่อ Breakdown ผ่าน ระบบจะประเมินใหม่ทันที", tone: "warn" },
      SESSION_BLOCKED: { label: "อยู่นอกช่วงเวลาเทรด", detail: "Adaptive Engine จะเริ่มประเมินใหม่ใน Session ที่กำหนด", tone: "warn" },
      VOLATILITY_TOO_HIGH: { label: "ความผันผวนสูง", detail: "EA รุ่นเก่าใช้ ATR เป็นตัวบล็อก กรุณาอัปเดตเป็น Adaptive Engine รุ่นล่าสุด", tone: "warn" },
      ADAPTIVE_DATA_NOT_READY: { label: "กำลังเตรียมข้อมูลตลาด", detail: "รอข้อมูลแท่งราคา M1, M5, M15, M30 และ H1 ให้เพียงพอ", tone: "warn" },
      RISK_LIMIT_TOO_SMALL: { label: "ความเสี่ยงไม่พอสำหรับ Lot ขั้นต่ำ", detail: "Risk % ปัจจุบันต่ำกว่าที่ Lot ขั้นต่ำของ Broker ต้องใช้ หากยอมรับความเสี่ยงเพิ่มให้ติ๊กอนุญาต Lot ขั้นต่ำในตั้งค่าบอท", tone: "warn" },
      SPREAD_TOO_HIGH: { label: "Spread ผิดปกติต่อเนื่อง", detail: "Adaptive Spread ระงับเฉพาะออเดอร์ใหม่ ส่วน Position เดิมยังถูกดูแลตามปกติ", tone: "warn" },
      EXTREME_SPREAD: { label: "Spread รุนแรงเกินขอบเขต", detail: "Spread อยู่ระดับ EXTREME จึงหยุดเฉพาะการเปิดไม้ใหม่จนกว่าต้นทุนการส่งคำสั่งกลับสู่ระดับปลอดภัย", tone: "warn" },
      WAITING_EXECUTION_TURN: { label: "รอจังหวะกลับตาม Bias", detail: "Macro H1/M30/M15 ยังอยู่ทิศเดิม แต่ M1/M5 กำลังย่อ ระบบรอ EMA / Price Action / Momentum turning event ก่อนเปิดไม้ใหม่", tone: "good" },
      WAITING_BETTER_PRICE: { label: "รอราคาที่คุ้มกว่า", detail: "Entry Precision V3 พบว่าราคาเริ่มไกล Value จึงรอสั้น ๆ เพื่อหา Pullback/Sweep/Reclaim; มี Max Wait และจะกลับเข้าแบบ Acceptable อัตโนมัติ ไม่ค้างรอไม่สิ้นสุด", tone: "good" },
      WAIT_INDICATOR_CONTEXT: { label: "Indicator V6 รอบริบทดีขึ้น", detail: "Location + Execution + Composite อ่อนพร้อมกัน ระบบรอสั้น ๆ แบบ bounded wait เท่านั้น ไม่มี Indicator ตัวเดียวมีสิทธิ์บล็อกออเดอร์", tone: "good" },
      INDICATOR_CONTEXT_ADD_WAIT: { label: "Indicator V6 ชะลอไม้เพิ่ม", detail: "ใช้เฉพาะ Adaptive mode เมื่อ Location + Structure + Execution อ่อนพร้อมกัน เพื่อไม่เติม Basket ในจุดเสียเปรียบ; Max Positions ของผู้ใช้ไม่ถูกเปลี่ยน", tone: "good" },
      BUY_WAIT_PULLBACK: { label: "ไม่ไล่ BUY บนยอด", detail: "Macro อาจยังขึ้น แต่ราคาอยู่ใกล้ Local Top/Failed Breakout/Rejection ระบบรอ Pullback หรือ Breakout Hold จริงก่อน BUY", tone: "warn" },
      SELL_WAIT_PULLBACK: { label: "ไม่ไล่ SELL ที่ก้น", detail: "Macro อาจยังลง แต่ราคาอยู่ใกล้ Local Bottom/Failed Breakdown/Rejection ระบบรอ Pullback หรือ Breakdown Hold จริงก่อน SELL", tone: "warn" },
      TACTICAL_COUNTERTREND_EXIT: { label: "ปิด Tactical Countertrend", detail: "Macro เดิมกลับมายืนยันบน M5/M1 แล้ว ระบบปิดไม้สวนสั้นและไม่ส่งเข้า Rescue/Hedge", tone: "good" },
      LOCAL_TOP_ADD_BLOCK: { label: "หยุดเติม BUY บนยอด", detail: "Basket ยังเป็น BUY แต่ราคาปัจจุบันอยู่ใกล้ Local Top/ปลายรอบ ระบบหยุดเพิ่มไม้และรอ Pullback, Retest หรือ Breakout Hold ที่ยืนยันก่อน", tone: "warn" },
      LOCAL_BOTTOM_ADD_BLOCK: { label: "หยุดเติม SELL ที่ก้น", detail: "Basket ยังเป็น SELL แต่ราคาปัจจุบันอยู่ใกล้ Local Bottom/ปลายรอบ ระบบหยุดเพิ่มไม้และรอ Pullback, Retest หรือ Breakdown Hold ที่ยืนยันก่อน", tone: "warn" },
      WAIT_ADD_PRICE_SEPARATION: { label: "รอระยะราคาก่อนเติมไม้", detail: "จังหวะยังไปทิศเดิม แต่ราคายังใกล้ไม้ล่าสุดเกินไป ระบบไม่กองหลายออเดอร์ที่ราคาเดียวกันและจะเติมเมื่อมีระยะใหม่หรือ Retest ที่เหมาะสม", tone: "good" },
      WAITING_REVERSAL_CONFIRMATION: { label: "กำลังแยก Pullback กับ Reversal", detail: "M1/M5 สวน Bias ใหญ่พร้อมกัน ระบบไม่ให้ Macro บังคับเข้า และกำลังรอหลักฐานว่าเป็นการกลับตัวจริงหรือเพียงการย่อ", tone: "warn" },
      WAIT_TERMINAL_DEMAND: { label: "ไม่ไล่ SELL ใกล้ Demand", detail: "ด้านล่างมี Demand/Support คุณภาพสูงและแรงขายเริ่มหมด จึงหยุดเพิ่ม SELL จนกว่าจะเกิด Retest หรือโครงสร้างใหม่", tone: "warn" },
      WAIT_TERMINAL_SUPPLY: { label: "ไม่ไล่ BUY ใกล้ Supply", detail: "ด้านบนมี Supply/Resistance คุณภาพสูงและแรงซื้อเริ่มหมด จึงหยุดเพิ่ม BUY จนกว่าจะเกิด Retest หรือโครงสร้างใหม่", tone: "warn" },
      WAITING_MARKET_REARM: { label: "รอสัญญาณใหม่ก่อนเข้าอีกครั้ง", detail: "รอบก่อนปิดเพราะ Reversal ระบบต้องเห็น EMA reclaim / Price Action turn / Momentum turn / Zone reaction ใหม่ก่อนเปิดฝั่งเดิมซ้ำ", tone: "good" },
      WAITING_BASKET_ADD: { label: "รอจังหวะเพิ่มไม้", detail: "ไม้แรกเปิดแล้ว ระบบกำลังจัดระยะไม้เพิ่มตาม Basket Ladder โดยไม่ใช้ Confidence เป็น Gate", tone: "good" },
      BASKET_LADDER_WAIT: { label: "Basket Ladder กำลังรอ Rung ถัดไป", detail: "นี่เป็นระยะห่างของไม้ 2–10 หลังไม้แรก ไม่ใช่เงื่อนไขดักไม้แรก", tone: "good" },
      BASKET_LADDER_PULLBACK_WAIT: { label: "Ladder รอ Pullback ก่อนเพิ่มไม้", detail: "ราคาวิ่งถึงระยะ Rung แล้ว แต่ระบบจะไม่เพิ่มไม้ตรง New High/New Low; รอ Pullback เล็กน้อยก่อน", tone: "good" },
      BASKET_LADDER_CONTINUATION_WAIT: { label: "Ladder รอ Continuation หลัง Pullback", detail: "เห็น Pullback แล้ว กำลังรอ M1/Momentum กลับไปทิศ Basket ก่อนเพิ่มไม้ เพื่อไม่กองออเดอร์ที่ปลายทาง", tone: "good" },
      RESCUE_DISABLED: { label: "ปิดระบบแก้ไม้", detail: "EA จะไม่เปิด Hedge หรือ Recovery สวนฝั่งหลัก", tone: "good" },
      RESCUE_DISABLED_CLEANUP: { label: "กำลังปิด Rescue เดิม", detail: "กำลังเคลียร์ไม้ Rescue ที่ค้างจากเวอร์ชันเก่า และจะไม่เปิดไม้แก้ใหม่", tone: "warn" },
      RESCUE_WARNING: { label: "Rescue กำลังเฝ้าการกลับตัว", detail: "Basket ติดลบและเริ่มมีสัญญาณ Reversal ระบบหยุดเพิ่มไม้ชั่วคราวเพื่อตรวจว่าควร Hedge หรือปล่อยโครงสร้างเดิมทำงานต่อ", tone: "warn" },
      TIME_RESCUE_WARNING: { label: "Time Rescue กำลังประเมิน", detail: "Position ติดลบนานเกินกรอบเวลาปรับตาม Regime ระบบกำลังตรวจ Structure / EMA / Price Action ก่อนเข้า Recovery", tone: "warn" },
      RESCUE_ACTIVE: { label: "Adaptive Rescue กำลังทำงาน", detail: "ระบบยืนยัน Reversal แล้วและกำลัง Weight Balance / Smart Hedge โดยไม่เพิ่ม Lot แบบ Martingale", tone: "warn" },
      RESCUE_HEDGE_OPENED: { label: "เปิด Smart Hedge แล้ว", detail: "เปิด Hedge ตามสัดส่วน Exposure ที่คำนวณได้ ไม่เกิน Primary exposure และไม่ใช้ Martingale", tone: "warn" },
      RESCUE_RECOVERY: { label: "Recovery กำลังพา Basket กลับ", detail: "กำไรจาก Hedge/การฟื้นตัวกำลังลด Deficit ระบบจะใช้ Partial Close และ Recovery TP เพื่อออกจาก Cycle", tone: "good" },
      RESCUE_EXIT: { label: "กำลังปิด Rescue Cycle", detail: "ถึง Recovery target แล้ว ระบบกำลังปิด Primary และ Hedge ให้หมด", tone: "good" },
      RESCUE_CYCLE_CLOSED: { label: "Rescue Cycle ปิดแล้ว", detail: "Primary/Hedge ถูกปิดครบและระบบกลับสู่ NORMAL พร้อมหา Setup ใหม่", tone: "good" },
      AUTO_PROFIT_DEFENSE: { label: "ป้องกันกำไรอัตโนมัติ", detail: "Basket เคยมีกำไรถึงช่วงสำคัญ แต่ M1/M5 + EMA/Price Action เริ่มกลับทิศ ระบบจึงปิดกำไรที่เหลือก่อน Winner กลายเป็น Loser", tone: "good" },
      AUTO_PROFIT_GIVEBACK: { label: "Auto ปิดรักษากำไร", detail: "กำไรรวมย่อลงจากจุดสูงสุดถึงระยะที่เหมาะกับสภาพตลาด EA จึงปิดทั้งชุดขณะที่รอบยังมีกำไร", tone: "good" },
      SMART_PROFIT_REVERSAL: { label: "ปิดรักษากำไรก่อนถึงเป้า", detail: "Cycle ยังเป็นกำไรแต่ M1/M5 + EMA/Momentum/Price Action ยืนยันการกลับตัว ระบบปิดทั้งชุดทันทีเพื่อไม่ให้ Winner กลายเป็น Loser", tone: "good" },
      DAILY_PROFIT_TARGET_UPDATED: { label: "อัปเดตเป้ากำไรรายวันแล้ว", detail: "เป้าใหม่สูงกว่ากำไรวันนี้หรือถูกปิดใช้งาน ระบบปลด Daily Profit Lock แล้วและพร้อมกลับไป RUNNING", tone: "good" },
      BASKET_LADDER_ADVANCE: { label: "Basket Ladder เพิ่มไม้แล้ว", detail: "ราคาเดินถึง Rung ถัดไปและ Broker รับคำสั่งเพิ่มไม้", tone: "good" },
      BASKET_FILLING: { label: "กำลังเปิดตามจำนวนไม้", detail: "EA กำลังส่งคำสั่งตามจำนวนที่เลือก โดย MT5/Broker เป็นผู้ตอบรับแต่ละคำสั่ง", tone: "good" },
      BASKET_FILL_COMPLETE: { label: "ส่งคำสั่งครบจำนวนแล้ว", detail: "ระบบกำลังดูแล Position ที่ MT5 เปิดสำเร็จ", tone: "good" },
      BASKET_MANAGING: { label: "กำลังดูแลออเดอร์", detail: "EA ดูแล Position ที่เปิดอยู่ตามเป้ากำไรและ Stop Loss", tone: "good" },
      BASKET_FILL_ABORTED: { label: "หยุดส่งไม้ที่เหลือ", detail: "สิทธิ์เทรดหรือการเชื่อมต่อเปลี่ยน แต่ Position ที่เปิดแล้วจะยังถูกดูแล", tone: "warn" },
      ORDER_PRECHECK_FAILED: { label: "คำสั่งไม่ผ่านการตรวจล่วงหน้า", detail: "Broker หรือ Margin ไม่พร้อม ระบบไม่ส่งคำสั่งนี้", tone: "warn" },
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
      FIRST_CONNECT_PRIME: { label: "กำลังเตรียมบอทครั้งแรก", detail: "VPS กำลัง Start บอท 1 ครั้งโดยล็อก Order แล้วจะ Stop อัตโนมัติ", tone: "warn" },
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
      const meta = this.executionStatusMeta("MT5_OFFLINE");
      return { code: "MT5_OFFLINE", ...meta, tradeReady: false };
    }

    if (!this.supportedEaRuntime(metrics.eaVersion)) {
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

    if (metrics.dailyProfitLocked === true) {
      const code =
        String(metrics.executionStatus || "") === "DAILY_PROFIT_GIVEBACK_LOCK"
          ? "DAILY_PROFIT_GIVEBACK_LOCK"
          : "DAILY_PROFIT_LOCK";
      const meta = this.executionStatusMeta(code);
      return {
        code,
        ...meta,
        tradeReady: false,
        dailyProfit: Number(metrics.dailyProfit ?? 0),
        dailyProfitTarget: Number(metrics.dailyProfitTarget ?? settings?.dailyProfitTargetMoney ?? 0),
        dailyProfitGivebackFloor: Number(metrics.dailyProfitGivebackFloor ?? 0)
      };
    }

    if (
      metrics.dailyProfitTargetArmed === true &&
      instance.desired_state === "RUNNING" &&
      instance.actual_state === "RUNNING"
    ) {
      const code = "DAILY_PROFIT_RUN_ON";
      const meta = this.executionStatusMeta(code);
      return {
        code,
        ...meta,
        tradeReady: metrics.tradeReady !== false,
        dailyProfit: Number(metrics.dailyProfit ?? 0),
        dailyProfitTarget: Number(metrics.dailyProfitTarget ?? settings?.dailyProfitTargetMoney ?? 0),
        dailyProfitGivebackFloor: Number(metrics.dailyProfitGivebackFloor ?? 0),
        dailyProfitDrawdownPercent: Number(metrics.dailyProfitDrawdownPercent ?? settings?.dailyProfitDrawdownPercent ?? 0)
      };
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

      if (positions >= maxPositions) code = "MAX_POSITIONS";
      else code = "WAITING_SETUP";
    }

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
      adaptiveSpreadLimitPoints: Number(metrics.adaptiveSpreadLimitPoints ?? settings?.maxSpreadPoints ?? metrics.maxSpreadPoints ?? 300),
      spreadStatus: String(metrics.spreadStatus || "WARMUP"),
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
    slot = await this.db.one(
      "INSERT INTO license_slots(owner_user_id,assigned_user_id,mode,slot_number,slot_type,status,label) VALUES($1,$1,'LOCAL',1,$2,'ACTIVE','Primary') RETURNING *",
      [userId, user?.role === "OWNER" || user?.role === "ADMIN" ? "OWNER" : "PERSONAL"]
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
         (
            (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '60 seconds')
            OR (
              bi.mode='CLOUD'
              AND wn.last_seen_at IS NOT NULL
              AND wn.last_seen_at > now() - interval '90 seconds'
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(
                  COALESCE((wn.telemetry->'instances')::jsonb, '[]'::jsonb)
                ) AS worker_instance
                WHERE worker_instance->>'instanceId'=bi.id::text
                  AND worker_instance->>'terminalRunning'='true'
              )
            )
          ) mt5_connection_online,
         (bi.last_seen_at IS NOT NULL
           AND bi.last_seen_at <= now() - interval '20 seconds'
           AND bi.last_seen_at > now() - interval '60 seconds') mt5_connection_degraded,
         (wn.last_seen_at IS NOT NULL AND wn.last_seen_at > now() - interval '120 seconds') runner_online,
         (
           bi.mode='CLOUD'
           AND wn.last_seen_at IS NOT NULL
           AND wn.last_seen_at > now() - interval '30 seconds'
           AND EXISTS (
             SELECT 1
             FROM jsonb_array_elements(
               COALESCE((wn.telemetry->'instances')::jsonb, '[]'::jsonb)
             ) AS control_instance
             WHERE control_instance->>'instanceId'=bi.id::text
               AND control_instance->>'terminalRunning'='true'
               AND control_instance->>'chartHasFastBasketBot'='true'
               AND control_instance->>'presetCloudRelayEnabled'='true'
           )
         ) cloud_control_ready,
         bi.device_status,
         bi.device_hostname,
         bi.device_last_seen_at,
         bi.pending_account_number,
         bi.pending_broker_server,
         a.id mt5_account_id,
         a.account_number,
         a.display_name account_display_name,
         a.broker,
         a.broker_server,
         a.status account_status,
         bs.settings->>'startupSymbol' startup_symbol,
         bi.metrics->>'symbol' active_symbol,
         (ls.assigned_user_id=$1 AND ls.status IN ('ACTIVE','AVAILABLE')) can_control,
         (ls.assigned_user_id=$1 AND ls.mode='LOCAL' AND ls.status<>'DELETED') can_release_device,
         (ls.owner_user_id=$1) can_manage,
         (
           (
             (s.id IS NOT NULL AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now())
             OR EXISTS (
               SELECT 1
               FROM access_group_grants gg
               JOIN access_groups ag ON ag.id=gg.access_group_id
               WHERE gg.user_id=$1
                 AND gg.mode=ls.mode
                 AND gg.status='ACTIVE'
                 AND gg.starts_at<=now()
                 AND gg.expires_at>now()
                 AND ag.enabled=true
             )
           )
           AND (
             ls.mode<>'CLOUD'
             OR EXISTS (
               SELECT 1
               FROM license_slots primary_slot
               JOIN subscriptions primary_sub ON primary_sub.id=primary_slot.subscription_id
               WHERE primary_slot.owner_user_id=ls.owner_user_id
                 AND primary_slot.assigned_user_id=$1
                 AND primary_slot.mode='CLOUD'
                 AND primary_slot.slot_type='PERSONAL'
                 AND primary_slot.status<>'DELETED'
                 AND primary_sub.status='ACTIVE'
                 AND primary_sub.starts_at<=now()
                 AND primary_sub.expires_at>now()
             )
           )
         ) subscription_active
       FROM license_slots ls
       JOIN users ou ON ou.id=ls.owner_user_id
       LEFT JOIN users au ON au.id=ls.assigned_user_id
       LEFT JOIN subscriptions s ON s.id=ls.subscription_id
       LEFT JOIN plans p ON p.id=s.plan_id
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN worker_nodes wn ON wn.runner_id=bi.runner_id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       WHERE (ls.owner_user_id=$1 OR ls.assigned_user_id=$1)
         AND ls.status<>'DELETED'
       ORDER BY
         CASE
           WHEN ls.assigned_user_id=$1
             AND (
               (s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now())
               OR EXISTS (
                 SELECT 1
                 FROM access_group_grants gg
                 JOIN access_groups ag ON ag.id=gg.access_group_id
                 WHERE gg.user_id=$1
                   AND gg.mode=ls.mode
                   AND gg.status='ACTIVE'
                   AND gg.starts_at<=now()
                   AND gg.expires_at>now()
                   AND ag.enabled=true
               )
             ) THEN 0
           WHEN ls.assigned_user_id=$1 THEN 1
           ELSE 2
         END,
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
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.assigned_user_id=$1 AND ls.status IN ('ACTIVE','AVAILABLE')
       ORDER BY
         CASE WHEN bi.last_seen_at IS NOT NULL AND bi.last_seen_at>now()-interval '30 seconds' THEN 0 ELSE 1 END,
         CASE
           WHEN s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() THEN 0
           WHEN EXISTS (
             SELECT 1
             FROM access_group_grants gg
             JOIN access_groups ag ON ag.id=gg.access_group_id
             WHERE gg.user_id=$1
               AND gg.mode=ls.mode
               AND gg.status='ACTIVE'
               AND gg.starts_at<=now()
               AND gg.expires_at>now()
               AND ag.enabled=true
           ) THEN 0
           ELSE 1
         END,
         CASE WHEN ls.mode='LOCAL' THEN 0 ELSE 1 END,
         bi.last_seen_at DESC NULLS LAST,
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

    if (user?.status === "ACTIVE" && String(mode || "").toUpperCase() === "CLOUD") {
      const primary = await this.db.one(
        `SELECT ls.id slot_id,s.expires_at,
                (
                  s.id IS NOT NULL
                  AND s.status='ACTIVE'
                  AND s.starts_at<=now()
                  AND s.expires_at>now()
                ) active
         FROM license_slots ls
         LEFT JOIN subscriptions s ON s.id=ls.subscription_id
         WHERE ls.owner_user_id=$1
           AND ls.assigned_user_id=$1
           AND ls.mode='CLOUD'
           AND ls.slot_type='PERSONAL'
           AND ls.status<>'DELETED'
         ORDER BY ls.slot_number,ls.created_at
         LIMIT 1`,
        [userId]
      );
      if (!primary) {
        return { allowed:false, source:"PRIMARY_SUBSCRIPTION_REQUIRED", primarySlotId:null };
      }
      if (!primary.active) {
        return {
          allowed:false,
          source:"PRIMARY_SUBSCRIPTION_EXPIRED",
          expiresAt:primary.expires_at || null,
          primarySlotId:primary.slot_id
        };
      }
    }

    if (user?.status === "ACTIVE" && slotId) {
      const partnerAccess = await this.partner.ownTradingEntitlement(userId, slotId, mode);
      if (partnerAccess) return partnerAccess;
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

    // Legacy fallback is only for a slot that has not been linked to a
    // subscription yet. Once a Slot owns a subscription, its expiry is
    // independent; an active subscription on VPS Slot #1 must never unlock an
    // expired VPS Slot #2.
    const linkedSlot = slotId
      ? await this.db.one(
          "SELECT subscription_id FROM license_slots WHERE id=$1 AND assigned_user_id=$2",
          [slotId, userId]
        )
      : null;
    const legacySub = !slotId || !linkedSlot?.subscription_id
      ? await this.db.one(
          "SELECT s.id,s.expires_at,p.code,p.mode,p.max_mt5_accounts,p.allow_resale FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() AND ($2::text IS NULL OR p.mode=$2) ORDER BY s.expires_at DESC LIMIT 1",
          [userId, mode]
        )
      : null;
    if (legacySub) {
      return { allowed: true, source: "SUBSCRIPTION", expiresAt: legacySub.expires_at };
    }

    const groupGrant = await this.db.one(
      `SELECT gg.id,gg.expires_at,gg.mode,ag.id group_id,ag.name group_name
       FROM access_group_grants gg
       JOIN access_groups ag ON ag.id=gg.access_group_id
       WHERE gg.user_id=$1
         AND gg.status='ACTIVE'
         AND gg.starts_at<=now()
         AND gg.expires_at>now()
         AND ag.enabled=true
         AND ($2::text IS NULL OR gg.mode=$2)
       ORDER BY gg.expires_at DESC
       LIMIT 1`,
      [userId, mode]
    );
    if (groupGrant) {
      return {
        allowed: true,
        source: "GROUP_TRIAL",
        expiresAt: groupGrant.expires_at,
        groupId: groupGrant.group_id,
        groupName: groupGrant.group_name,
        mode: groupGrant.mode
      };
    }

    const disabledGroupGrant = await this.db.one(
      `SELECT gg.id,gg.expires_at,ag.name group_name
       FROM access_group_grants gg
       JOIN access_groups ag ON ag.id=gg.access_group_id
       WHERE gg.user_id=$1
         AND gg.status='ACTIVE'
         AND gg.starts_at<=now()
         AND gg.expires_at>now()
         AND ag.enabled=false
         AND ($2::text IS NULL OR gg.mode=$2)
       ORDER BY gg.expires_at DESC
       LIMIT 1`,
      [userId, mode]
    );

    let expiredSub: any = null;
    if (slotId) {
      expiredSub = await this.db.one(
        `SELECT s.id,s.expires_at,p.code,p.mode
         FROM license_slots ls
         JOIN subscriptions s ON s.id=ls.subscription_id
         JOIN plans p ON p.id=s.plan_id
         WHERE ls.id=$1
           AND ls.assigned_user_id=$2
           AND s.expires_at<=now()
           AND ($3::text IS NULL OR p.mode=$3)
         ORDER BY s.expires_at DESC
         LIMIT 1`,
        [slotId, userId, mode]
      );
    }
    if (!expiredSub) {
      expiredSub = await this.db.one(
        "SELECT s.id,s.expires_at,p.code,p.mode FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.expires_at<=now() AND ($2::text IS NULL OR p.mode=$2) ORDER BY s.expires_at DESC LIMIT 1",
        [userId, mode]
      );
    }

    // Trial is intentionally Local-only. Cloud/VPS always requires a
    // Cloud entitlement so a Trial can never consume a reserved Trading VPS.
    if (String(mode || "").toUpperCase() === "CLOUD") {
      if (disabledGroupGrant) {
        return { allowed: false, source: "GROUP_DISABLED", groupName: disabledGroupGrant.group_name };
      }
      if (expiredSub) {
        return { allowed: false, source: "SUBSCRIPTION_EXPIRED", expiresAt: expiredSub.expires_at };
      }
      return { allowed: false, source: "NONE", reason: "TRIAL_LOCAL_ONLY" };
    }

    const trial = await this.db.one(
      `SELECT tg.id,tg.status,tg.duration_minutes,tg.started_at,tg.expires_at,
              ag.name access_group_name,COALESCE(ag.enabled,true) access_group_enabled
       FROM trial_grants tg
       LEFT JOIN access_groups ag ON ag.id=tg.access_group_id
       WHERE tg.user_id=$1
         AND ($2::uuid IS NULL OR tg.mt5_account_id=$2)
       ORDER BY tg.created_at DESC
       LIMIT 1`,
      [userId, mt5AccountId]
    );
    if (trial && trial.access_group_enabled === false) {
      return { allowed: false, source: "GROUP_DISABLED", groupName: trial.access_group_name || null };
    }
    if (trial?.status === "APPROVED") return { allowed: true, source: "TRIAL_READY", trialId: trial.id };
    if (trial?.status === "ACTIVE" && trial.expires_at && new Date(trial.expires_at) > new Date()) {
      return { allowed: true, source: "TRIAL", expiresAt: trial.expires_at };
    }
    if (disabledGroupGrant) {
      return { allowed: false, source: "GROUP_DISABLED", groupName: disabledGroupGrant.group_name };
    }
    if (expiredSub) {
      return { allowed: false, source: "SUBSCRIPTION_EXPIRED", expiresAt: expiredSub.expires_at };
    }
    if (!trial) return { allowed: false, source: "NONE" };
    return { allowed: false, source: "TRIAL_EXPIRED", expiresAt: trial.expires_at || null };
  }

  @Get("trading-modes")
  async enabledTradingModes() {
    const rows = await this.tradingModes.list();
    return { modes: rows.map((row:any) => ({mode:row.mode,enabled:row.enabled})) };
  }

  @Get("dashboard")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  async dashboard(@Req() req: any, @Query("slotId") slotId = "", @Query("light") light = "") {
    const userId = req.user.sub;
    const lightweight = light === "1" || light.toLowerCase() === "true";
    const user = await this.user(userId);
    const selectedSlot = await this.resolveSlot(userId, slotId || null);
    const slots = await this.slotRows(userId);

    const instance = await this.db.one(
      `SELECT bi.*,
         wn.region AS runner_region,
         wn.hostname AS runner_hostname,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS mt5_online,
         (
            (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '60 seconds')
            OR (
              bi.mode='CLOUD'
              AND wn.last_seen_at IS NOT NULL
              AND wn.last_seen_at > now() - interval '90 seconds'
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(
                  COALESCE((wn.telemetry->'instances')::jsonb, '[]'::jsonb)
                ) AS worker_instance
                WHERE worker_instance->>'instanceId'=bi.id::text
                  AND worker_instance->>'terminalRunning'='true'
              )
            )
          ) AS mt5_connection_online,
         (bi.last_seen_at IS NOT NULL
           AND bi.last_seen_at <= now() - interval '20 seconds'
           AND bi.last_seen_at > now() - interval '60 seconds') AS mt5_connection_degraded,
         (wn.last_seen_at IS NOT NULL AND wn.last_seen_at > now() - interval '120 seconds') AS runner_online,
         (
           bi.mode='CLOUD'
           AND wn.last_seen_at IS NOT NULL
           AND wn.last_seen_at > now() - interval '30 seconds'
           AND EXISTS (
             SELECT 1
             FROM jsonb_array_elements(
               COALESCE((wn.telemetry->'instances')::jsonb, '[]'::jsonb)
             ) AS control_instance
             WHERE control_instance->>'instanceId'=bi.id::text
               AND control_instance->>'terminalRunning'='true'
               AND control_instance->>'chartHasFastBasketBot'='true'
               AND control_instance->>'presetCloudRelayEnabled'='true'
           )
         ) AS cloud_control_ready,
         (bi.agent_last_seen_at IS NOT NULL AND bi.agent_last_seen_at > now() - interval '30 minutes') AS agent_online,
         (bi.device_last_seen_at IS NOT NULL AND bi.device_last_seen_at > now() - interval '90 seconds') AS device_online,
         CASE WHEN bi.last_seen_at IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (now() - bi.last_seen_at)) END AS ea_last_seen_age_seconds,
         CASE WHEN bi.pending_account_number IS NOT NULL
                    AND bi.pending_account_seen_at > now() - interval '10 minutes'
                    AND bi.last_seen_at > now() - interval '20 seconds'
              THEN true ELSE false END AS rebind_ready,
         CASE WHEN bi.mt5_account_id IS NULL
                    AND bi.pending_account_number IS NOT NULL
                    AND bi.pending_account_seen_at > now() - interval '10 minutes'
                    AND bi.last_seen_at > now() - interval '20 seconds'
              THEN true ELSE false END AS first_bind_ready
       FROM bot_instances bi
       LEFT JOIN worker_nodes wn ON wn.runner_id=bi.runner_id
       WHERE bi.slot_id=$1`,
      [selectedSlot.id]
    );

    // Dashboard-side recovery for a completed Safe Stop. Heartbeat normally finalizes
    // this transition; this fallback prevents a flat account from staying visually stuck.
    const dashboardPositions = Number(instance?.metrics?.positions);
    const dashboardActualState = String(instance?.actual_state || "").toUpperCase();
    if (
      instance &&
      String(instance.desired_state || "").toUpperCase() === "SAFE_STOP" &&
      Number.isFinite(dashboardPositions) &&
      dashboardPositions <= 0 &&
      (dashboardActualState === "SAFE_STOP" || dashboardActualState === "STOPPED")
    ) {
      await this.db.query(
        "UPDATE bot_instances SET desired_state='STOPPED',lock_owner=NULL WHERE id=$1 AND desired_state='SAFE_STOP'",
        [instance.id]
      );
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND command='SAFE_STOP' AND status IN ('PENDING','DELIVERED')",
        [instance.id]
      );
      instance.desired_state = "STOPPED";
    }

    let startTransition: any = {
      phase: "IDLE",
      message: "พร้อมรับคำสั่ง",
      ageSeconds: 0,
      commandStatus: null,
      commandId: null
    };

    if (instance) {
      const latestStartCommand = await this.db.one(
        `SELECT id,status,created_at,delivered_at,acked_at
         FROM bot_commands
         WHERE bot_instance_id=$1 AND command='START'
         ORDER BY id DESC
         LIMIT 1`,
        [instance.id]
      );
      const startAgeSeconds = latestStartCommand?.created_at
        ? Math.max(0, (Date.now() - new Date(latestStartCommand.created_at).getTime()) / 1000)
        : 0;

      if (String(instance.actual_state || "") === "RUNNING") {
        startTransition = {
          phase: "RUNNING",
          message: "EA ยืนยันแล้ว · บอทกำลังทำงาน",
          ageSeconds: startAgeSeconds,
          commandStatus: latestStartCommand?.status || null,
          commandId: latestStartCommand?.id || null
        };
      } else if (String(instance.desired_state || "") === "RUNNING" && latestStartCommand) {
        // START is user-authoritative. A slow Agent/EA acknowledgement must never
        // cause a dashboard read to silently turn the bot back to STOPPED.
        // Keep RUNNING requested until the EA confirms it or the user explicitly
        // presses Safe Stop. We only expose that the acknowledgement is delayed.
        const status = String(latestStartCommand.status || "PENDING").toUpperCase();
        const delayed = startAgeSeconds >= 20;
        startTransition = {
          phase: status === "DELIVERED"
            ? "DELIVERED_TO_EA"
            : status === "ACKED"
              ? "WAITING_HEARTBEAT"
              : "COMMAND_QUEUED",
          message: delayed
            ? status === "DELIVERED"
              ? "ส่งคำสั่งถึง EA แล้ว · ยังรอ EA ยืนยัน RUNNING · Server จะไม่ยกเลิก Start อัตโนมัติ"
              : status === "ACKED"
                ? "EA รับคำสั่งแล้ว · ยังรอ Heartbeat ยืนยัน RUNNING · Server จะคงคำสั่ง Start ไว้"
                : "คำสั่ง Start ยังรอ EA รับ · Server จะคง RUNNING ไว้จนกว่าจะรับคำสั่งหรือผู้ใช้กดหยุด"
            : status === "DELIVERED"
              ? "ส่งคำสั่งถึง EA แล้ว · รอ EA เปลี่ยนเป็น RUNNING"
              : status === "ACKED"
                ? "EA รับคำสั่งแล้ว · รอ Heartbeat ยืนยัน RUNNING"
                : "บันทึกคำสั่ง Start แล้ว · รอ EA มารับคำสั่ง",
          ageSeconds: startAgeSeconds,
          commandStatus: status,
          commandId: latestStartCommand.id,
          delayed
        };
      }
    }

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

    const blankTodayPerformance = () => ({
      trades: 0,
      closedTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netProfit: 0,
      drawdownMoney: 0,
      drawdownPercent: 0
    });
    const controlModes = ["AUTO", "RACE", "COUNTER", "FLIP_LOCK", "ZERO_GRID", "MANUAL"];

    let tradeJournal = {
      stats: {
        closedTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        netProfit: 0,
        averageWin: 0,
        averageLoss: 0,
        profitFactor: 0
      },
      today: blankTodayPerformance(),
      modeToday: controlModes.map(mode => ({ mode, ...blankTodayPerformance() })),
      recent: [] as any[],
      hourlyWinRate: [] as Array<{
        hour: number;
        trades: number;
        wins: number;
        losses: number;
        winRate: number;
        netProfit: number;
        grossProfit: number;
        grossLoss: number;
      }>
    };

    // RACE VNext Phase 6 is measurement-only. It never feeds a score, gate,
    // direction, lot, stop or execution decision back into the EA.
    const blankRaceEvaluationCohort = () => ({
      samples: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      netProfit: 0,
      averageNet: 0,
      averageLoss: 0,
      worstLoss: 0,
      averageTotalLot: 0,
      averageEstimatedCostMoney: 0,
      averageNoiseMoney: 0,
      averageProjectedStructureLossMoney: 0,
      riskMismatchBaskets: 0
    });
    let raceVNextEvaluation = {
      comparisonType: "FORWARD_OBSERVATIONAL_NOT_BACKTEST",
      cohortRule: "RACE basket; VNext when raceTelemetryVersion >= 1",
      minimumSuggestedSamplesPerCohort: 50,
      baseline: blankRaceEvaluationCohort(),
      vnext: blankRaceEvaluationCohort(),
      comparison: {
        hasBaseline: false,
        hasVNext: false,
        winRateDelta: 0,
        averageNetDelta: 0,
        averageLossDelta: 0,
        worstLossDelta: 0
      }
    };

    if (instance) {
      // "Today" is Bangkok-local trading day. Performance statistics use
      // one canonical unit everywhere: a completed BASKET. Per-mode Entries
      // reports bot ENTRY count, while Win Rate, P/L and Drawdown are all
      // calculated from completed BASKET rows so headline and per-mode values
      // are directly comparable.
      const todayRows = await this.db.query(
        `SELECT
           deal_ticket,position_id,event_type,direction,volume::float8,price::float8,
           net_profit::float8,metadata,entry_model,entry_trigger,
           entry_quality_score::float8,confidence::float8,created_at
         FROM trade_journal
         WHERE bot_instance_id=$1
           AND mt5_account_id=$2
           AND event_type IN ('ENTRY','EXIT','BASKET')
           AND created_at >= (
             date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
             AT TIME ZONE 'Asia/Bangkok'
           )
         ORDER BY created_at ASC,id ASC`,
        [instance.id, instance.mt5_account_id]
      );

      const rows = todayRows.rows || [];
      const priorContextRows = await this.db.query(
        `WITH day_start AS (
           SELECT (
             date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')
             AT TIME ZONE 'Asia/Bangkok'
           ) AS at
         ), closing_positions AS (
           SELECT DISTINCT position_id
           FROM trade_journal,day_start
           WHERE bot_instance_id=$1
             AND mt5_account_id=$2
             AND event_type='EXIT'
             AND position_id IS NOT NULL
             AND created_at >= day_start.at
         )
         SELECT
           deal_ticket,position_id,event_type,direction,volume::float8,price::float8,
           0::float8 AS net_profit,metadata,entry_model,entry_trigger,
           entry_quality_score::float8,confidence::float8,created_at
         FROM trade_journal,day_start
         WHERE bot_instance_id=$1
           AND mt5_account_id=$2
           AND event_type IN ('ENTRY','EXIT')
           AND created_at < day_start.at
           AND position_id IN (SELECT position_id FROM closing_positions)
         ORDER BY created_at ASC,id ASC`,
        [instance.id, instance.mt5_account_id]
      );
      // Prior ENTRY/EXIT rows are state/ownership context only. Historical money is
      // zeroed in SQL so today's realized P/L remains a Bangkok-day metric.
      const reconstructionRows = [...(priorContextRows.rows || []), ...rows].sort(
        (left:any,right:any) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      );
      const reconstructedToday = reconstructCompletedJournal(reconstructionRows);
      const reconstructedBasketRows = reconstructedToday.baskets.filter(
        (row:any) => new Date(row.created_at).getTime() >= new Date(
          new Intl.DateTimeFormat("en-CA",{
            timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"
          }).format(new Date()) + "T00:00:00.000+07:00"
        ).getTime()
      );
      const zeroBasketRows = rows
        .filter((row:any) =>
          String(row.event_type || "").toUpperCase() === "BASKET" &&
          resolveJournalControlMode(row) === "ZERO_GRID"
        )
        .map((row:any) => ({ ...row, controlMode: "ZERO_GRID" }));
      const reconstructedZeroRows = reconstructedBasketRows.filter(
        (row:any) => row.controlMode === "ZERO_GRID"
      );
      const basketRows = [
        ...reconstructedBasketRows.filter((row:any) => row.controlMode !== "ZERO_GRID"),
        ...(zeroBasketRows.length > 0 ? zeroBasketRows : reconstructedZeroRows)
      ].sort(
        (left:any,right:any) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      );
      const totalTodayNet = basketRows.reduce(
        (sum:any,row:any) => sum + Number(row.net_profit || 0),
        0
      );
      const currentBalance = Number(instance?.metrics?.balance || 0);
      const dayStartBalance = Math.max(0, currentBalance - totalTodayNet);

      const summarizeBaskets = (completed:any[]) => {
        let runningBalance = dayStartBalance;
        let peakBalance = runningBalance;
        let maxDrawdownMoney = 0;
        let maxDrawdownPercent = 0;
        let wins = 0;
        let losses = 0;
        let netProfit = 0;
        for (const row of completed) {
          const pnl = Number(row.net_profit || 0);
          netProfit += pnl;
          if (pnl > 0) wins++;
          if (pnl < 0) losses++;
          runningBalance += pnl;
          peakBalance = Math.max(peakBalance, runningBalance);
          const drawdownMoney = Math.max(0, peakBalance - runningBalance);
          const drawdownPercent = peakBalance > 0
            ? drawdownMoney / peakBalance * 100
            : 0;
          maxDrawdownMoney = Math.max(maxDrawdownMoney, drawdownMoney);
          maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
        }
        const closedTrades = completed.length;
        return {
          trades: closedTrades,
          closedTrades,
          wins,
          losses,
          winRate: closedTrades > 0 ? wins / closedTrades * 100 : 0,
          netProfit,
          drawdownMoney: maxDrawdownMoney,
          drawdownPercent: maxDrawdownPercent
        };
      };

      tradeJournal.today = summarizeBaskets(basketRows);

      // Performance by mode uses the owner captured on the ENTRY deal. EXIT
      // metadata from older runtimes can say MANUAL after an async RACE close,
      // so it must not reclassify the completed basket.
      tradeJournal.modeToday = controlModes.map(mode => {
        const modeBaskets = basketRows.filter((row:any) => row.controlMode === mode);
        const performance = summarizeBaskets(modeBaskets);
        const entries = rows.filter(
          (row:any) =>
            String(row.event_type || "").toUpperCase() === "ENTRY" &&
            resolveJournalControlMode(row) === mode &&
            String(row.metadata?.executedByBot ?? "true").toLowerCase() !== "false"
        ).length;
        return {
          mode,
          ...performance,
          trades: entries,
          activityEntries: entries
        };
      });
    }

    if (instance && !lightweight) {
      const stats = await this.db.one(
        `SELECT
           COUNT(*) FILTER (WHERE event_type='BASKET')::int AS closed_trades,
           COUNT(*) FILTER (WHERE event_type='BASKET' AND net_profit>0)::int AS wins,
           COUNT(*) FILTER (WHERE event_type='BASKET' AND net_profit<0)::int AS losses,
           COALESCE(SUM(net_profit) FILTER (WHERE event_type='BASKET'),0)::float8 AS net_profit,
           COALESCE(AVG(net_profit) FILTER (WHERE event_type='BASKET' AND net_profit>0),0)::float8 AS average_win,
           COALESCE(AVG(net_profit) FILTER (WHERE event_type='BASKET' AND net_profit<0),0)::float8 AS average_loss,
           COALESCE(SUM(net_profit) FILTER (WHERE event_type='BASKET' AND net_profit>0),0)::float8 AS gross_profit,
           ABS(COALESCE(SUM(net_profit) FILTER (WHERE event_type='BASKET' AND net_profit<0),0))::float8 AS gross_loss
         FROM trade_journal
         WHERE bot_instance_id=$1
           AND mt5_account_id=$2`,
        [instance.id, instance.mt5_account_id]
      );
      const closedTrades = Number(stats?.closed_trades || 0);
      const wins = Number(stats?.wins || 0);
      const grossProfit = Number(stats?.gross_profit || 0);
      const grossLoss = Number(stats?.gross_loss || 0);

      tradeJournal.stats = {
        closedTrades,
        wins,
        losses: Number(stats?.losses || 0),
        winRate: closedTrades > 0 ? wins / closedTrades * 100 : 0,
        netProfit: Number(stats?.net_profit || 0),
        averageWin: Number(stats?.average_win || 0),
        averageLoss: Number(stats?.average_loss || 0),
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0
      };

      const recentJournal = await this.db.query(
        `SELECT
           event_type,direction,volume::float8,price::float8,net_profit::float8,
           entry_trigger,entry_model,entry_quality,entry_quality_score::float8,
           market_regime_detail,fib_setup_score::float8,order_block_quality::float8,
           confidence::float8,basket_index,created_at
         FROM trade_journal
         WHERE bot_instance_id=$1
           AND mt5_account_id=$2
         ORDER BY created_at DESC
         LIMIT 20`,
        [instance.id, instance.mt5_account_id]
      );
      tradeJournal.recent = recentJournal.rows;

      const hourlyWinRate = await this.db.query(
        `SELECT
           EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Bangkok')::int AS hour,
           COUNT(*)::int AS trades,
           COUNT(*) FILTER (WHERE net_profit>0)::int AS wins,
           COUNT(*) FILTER (WHERE net_profit<0)::int AS losses,
           COALESCE(SUM(net_profit),0)::float8 AS net_profit,
           COALESCE(SUM(net_profit) FILTER (WHERE net_profit>0),0)::float8 AS gross_profit,
           ABS(COALESCE(SUM(net_profit) FILTER (WHERE net_profit<0),0))::float8 AS gross_loss
         FROM trade_journal
         WHERE bot_instance_id=$1
           AND mt5_account_id=$2
           AND event_type='BASKET'
           AND created_at>=now()-interval '30 days'
         GROUP BY 1
         ORDER BY 1`,
        [instance.id, instance.mt5_account_id]
      );
      tradeJournal.hourlyWinRate = hourlyWinRate.rows.map((row:any) => {
        const trades = Number(row.trades || 0);
        const wins = Number(row.wins || 0);
        return {
          hour: Number(row.hour || 0),
          trades,
          wins,
          losses: Number(row.losses || 0),
          winRate: trades > 0 ? wins / trades * 100 : 0,
          netProfit: Number(row.net_profit || 0),
          grossProfit: Number(row.gross_profit || 0),
          grossLoss: Number(row.gross_loss || 0)
        };
      });
    }

    if (instance?.mt5_account_id && !lightweight) {
      const raceRows = await this.db.query(
        `WITH race_baskets AS (
           SELECT
             net_profit::float8 AS net_profit,
             metadata,
             CASE
               WHEN COALESCE((metadata->>'raceTelemetryVersion')::int,0) >= 1
                 THEN 'VNEXT'
               ELSE 'BASELINE'
             END AS cohort
           FROM trade_journal
           WHERE bot_instance_id=$1
             AND mt5_account_id=$2
             AND event_type='BASKET'
             AND upper(COALESCE(metadata->>'controlMode',''))='RACE'
         )
         SELECT
           cohort,
           COUNT(*)::int AS samples,
           COUNT(*) FILTER (WHERE net_profit>0)::int AS wins,
           COUNT(*) FILTER (WHERE net_profit<0)::int AS losses,
           COALESCE(SUM(net_profit),0)::float8 AS net_profit,
           COALESCE(AVG(net_profit),0)::float8 AS average_net,
           COALESCE(AVG(net_profit) FILTER (WHERE net_profit<0),0)::float8 AS average_loss,
           COALESCE(MIN(net_profit),0)::float8 AS worst_loss,
           COALESCE(AVG(
             CASE
               WHEN COALESCE(metadata->>'raceTotalLot','') ~ '^[0-9]+([.][0-9]+)?$'
                 THEN (metadata->>'raceTotalLot')::float8
               ELSE NULL
             END
           ),0)::float8 AS average_total_lot,
           COALESCE(AVG(
             CASE
               WHEN COALESCE(metadata->>'raceEstimatedCostMoney','') ~ '^[0-9]+([.][0-9]+)?$'
                 THEN (metadata->>'raceEstimatedCostMoney')::float8
               ELSE NULL
             END
           ),0)::float8 AS average_estimated_cost_money,
           COALESCE(AVG(
             CASE
               WHEN COALESCE(metadata->>'raceNoiseMoney','') ~ '^[0-9]+([.][0-9]+)?$'
                 THEN (metadata->>'raceNoiseMoney')::float8
               ELSE NULL
             END
           ),0)::float8 AS average_noise_money,
           COALESCE(AVG(
             CASE
               WHEN COALESCE(metadata->>'raceProjectedStructureLossMoney','') ~ '^[0-9]+([.][0-9]+)?$'
                 THEN (metadata->>'raceProjectedStructureLossMoney')::float8
               ELSE NULL
             END
           ),0)::float8 AS average_projected_structure_loss_money,
           COUNT(*) FILTER (
             WHERE lower(COALESCE(metadata->>'raceRiskMismatch','false'))='true'
           )::int AS risk_mismatch_baskets
         FROM race_baskets
         GROUP BY cohort`,
        [instance.id, instance.mt5_account_id]
      );

      const cohortFromRow = (row: any) => {
        const samples = Math.max(0, Number(row?.samples || 0));
        const wins = Math.max(0, Number(row?.wins || 0));
        return {
          samples,
          wins,
          losses: Math.max(0, Number(row?.losses || 0)),
          winRate: samples > 0 ? wins / samples * 100 : 0,
          netProfit: Number(row?.net_profit || 0),
          averageNet: Number(row?.average_net || 0),
          averageLoss: Number(row?.average_loss || 0),
          worstLoss: Number(row?.worst_loss || 0),
          averageTotalLot: Math.max(0, Number(row?.average_total_lot || 0)),
          averageEstimatedCostMoney: Math.max(0, Number(row?.average_estimated_cost_money || 0)),
          averageNoiseMoney: Math.max(0, Number(row?.average_noise_money || 0)),
          averageProjectedStructureLossMoney: Math.max(
            0,
            Number(row?.average_projected_structure_loss_money || 0)
          ),
          riskMismatchBaskets: Math.max(0, Number(row?.risk_mismatch_baskets || 0))
        };
      };

      let baseline = blankRaceEvaluationCohort();
      let vnext = blankRaceEvaluationCohort();
      for (const row of raceRows.rows || []) {
        if (String(row?.cohort || "").toUpperCase() === "VNEXT") {
          vnext = cohortFromRow(row);
        } else {
          baseline = cohortFromRow(row);
        }
      }

      raceVNextEvaluation = {
        comparisonType: "FORWARD_OBSERVATIONAL_NOT_BACKTEST",
        cohortRule: "RACE basket; VNext when raceTelemetryVersion >= 1",
        minimumSuggestedSamplesPerCohort: 50,
        baseline,
        vnext,
        comparison: {
          hasBaseline: baseline.samples > 0,
          hasVNext: vnext.samples > 0,
          winRateDelta: vnext.winRate - baseline.winRate,
          averageNetDelta: vnext.averageNet - baseline.averageNet,
          averageLossDelta: vnext.averageLoss - baseline.averageLoss,
          worstLossDelta: vnext.worstLoss - baseline.worstLoss
        }
      };
    }

    const latestTrialRequest = await this.db.one(
      "SELECT id,line_contact,request_ip,status,created_at FROM trial_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );

    let runSummary: any = null;
    if (instance?.mt5_account_id) {
      const latestRunStart = await this.db.one(
        `SELECT id,created_at
         FROM bot_commands
         WHERE bot_instance_id=$1
           AND command='START'
         ORDER BY id DESC
         LIMIT 1`,
        [instance.id]
      );

      if (latestRunStart?.created_at) {
        const firstStopAfterStart = await this.db.one(
          `SELECT id,command,created_at,acked_at
           FROM bot_commands
           WHERE bot_instance_id=$1
             AND id>$2
             AND command IN ('SAFE_STOP','CLOSE_ALL')
           ORDER BY id ASC
           LIMIT 1`,
          [instance.id, latestRunStart.id]
        );

        const runningNow =
          String(instance.actual_state || "").toUpperCase() === "RUNNING" ||
          String(instance.desired_state || "").toUpperCase() === "RUNNING";
        const startAt = new Date(latestRunStart.created_at);

        // Read through the drain after Safe Stop. The old summary stopped at
        // the first SAFE_STOP acknowledgement and could miss final close deals.
        const sessionJournal = await this.db.query(
          `SELECT
             deal_ticket,position_id,event_type,direction,volume::float8,price::float8,
             net_profit::float8,metadata,entry_model,entry_trigger,
             entry_quality_score::float8,confidence::float8,created_at
           FROM trade_journal
           WHERE bot_instance_id=$1
             AND mt5_account_id=$2
             AND event_type IN ('ENTRY','EXIT')
             AND created_at >= $3
           ORDER BY created_at ASC,id ASC`,
          [instance.id, instance.mt5_account_id, startAt.toISOString()]
        );
        const sessionRows = sessionJournal.rows || [];
        const reconstructedRun = reconstructCompletedJournal(sessionRows);
        const basketRows = reconstructedRun.baskets;
        const positionRows = reconstructedRun.positions;
        const pnlValues = basketRows.map((row:any) => Number(row.net_profit || 0));
        const positionPnlValues = positionRows.map((row:any) => Number(row.net_profit || 0));
        const dealPnlValues = sessionRows.map((row:any) => Number(row.net_profit || 0));
        const netProfit = dealPnlValues.reduce((sum:number,value:number)=>sum+value,0);
        const positiveBaskets = pnlValues.filter((value:number)=>value>0);
        const negativeBaskets = pnlValues.filter((value:number)=>value<0);
        const positivePositions = positionPnlValues.filter((value:number)=>value>0);
        const negativePositions = positionPnlValues.filter((value:number)=>value<0);
        const positiveDeals = dealPnlValues.filter((value:number)=>value>0);
        const negativeDeals = dealPnlValues.filter((value:number)=>value<0);
        const grossProfit = positiveDeals.reduce((sum:number,value:number)=>sum+value,0);
        const grossLoss = Math.abs(negativeDeals.reduce((sum:number,value:number)=>sum+value,0));

        const endBalance = Number(instance.metrics?.balance || 0);
        const startCapital = Math.max(0, endBalance - netProfit);
        let runningBalance = startCapital;
        let peakBalance = runningBalance;
        let maxDrawdownMoney = 0;
        let maxDrawdownPercent = 0;
        const balanceSeries = [startCapital];
        for (const value of positionPnlValues) {
          runningBalance += value;
          balanceSeries.push(runningBalance);
          peakBalance = Math.max(peakBalance, runningBalance);
          const drawdownMoney = Math.max(0, peakBalance - runningBalance);
          const drawdownPercent = peakBalance > 0 ? drawdownMoney / peakBalance * 100 : 0;
          maxDrawdownMoney = Math.max(maxDrawdownMoney, drawdownMoney);
          maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
        }
        if(balanceSeries.length>0)
          balanceSeries[balanceSeries.length-1]=endBalance;

        const commandStopAt = !runningNow && firstStopAfterStart
          ? new Date(firstStopAfterStart.acked_at || firstStopAfterStart.created_at)
          : null;
        const lastClosedAt = positionRows.length
          ? new Date(positionRows[positionRows.length-1].closedAt)
          : null;
        const stopAt = !runningNow
          ? new Date(Math.max(
              commandStopAt?.getTime() || startAt.getTime(),
              lastClosedAt?.getTime() || startAt.getTime()
            ))
          : null;
        const summaryEndAt = stopAt || new Date();

        const returnPercent = startCapital > 0 ? netProfit / startCapital * 100 : 0;
        const closedBaskets = basketRows.length;
        const wins = positiveBaskets.length;
        const losses = negativeBaskets.length;
        const winRate = closedBaskets > 0 ? wins / closedBaskets * 100 : 0;
        const expectedPayoff = positionPnlValues.length > 0 ? netProfit / positionPnlValues.length : 0;
        const profitFactor = grossLoss > 0
          ? grossProfit / grossLoss
          : grossProfit > 0 ? 999 : 0;
        const recoveryFactor = maxDrawdownMoney > 0
          ? netProfit / maxDrawdownMoney
          : netProfit > 0 ? 999 : 0;

        const pnlMean = closedBaskets > 0 ? netProfit / closedBaskets : 0;
        const pnlVariance = closedBaskets > 1
          ? pnlValues.reduce(
              (sum:number,value:number)=>sum+Math.pow(value-pnlMean,2),0
            )/(closedBaskets-1)
          : 0;
        const pnlStdDev = Math.sqrt(Math.max(0,pnlVariance));
        const sharpeRatio = pnlStdDev > 0
          ? pnlMean / pnlStdDev * Math.sqrt(closedBaskets)
          : 0;

        const directionStats = (direction:string) => {
          const selected = basketRows.filter(
            (row:any)=>String(row.direction || "").toUpperCase()===direction
          );
          const selectedWins = selected.filter(
            (row:any)=>Number(row.net_profit || 0)>0
          ).length;
          return {
            trades:selected.length,
            wins:selectedWins,
            winRate:selected.length>0 ? selectedWins/selected.length*100 : 0
          };
        };

        let maxWinStreak=0,maxLossStreak=0,currentWinStreak=0,currentLossStreak=0;
        let maxWinStreakProfit=0,maxLossStreakLoss=0,currentWinProfit=0,currentLossValue=0;
        let totalWinStreaks=0,totalLossStreaks=0,winStreakCount=0,lossStreakCount=0;
        for(const value of pnlValues){
          if(value>0){
            if(currentWinStreak===0) winStreakCount++;
            currentWinStreak++;
            currentWinProfit+=value;
            currentLossStreak=0;
            currentLossValue=0;
            totalWinStreaks++;
            if(currentWinStreak>maxWinStreak){
              maxWinStreak=currentWinStreak;
              maxWinStreakProfit=currentWinProfit;
            }else if(currentWinStreak===maxWinStreak){
              maxWinStreakProfit=Math.max(maxWinStreakProfit,currentWinProfit);
            }
          }else if(value<0){
            if(currentLossStreak===0) lossStreakCount++;
            currentLossStreak++;
            currentLossValue+=value;
            currentWinStreak=0;
            currentWinProfit=0;
            totalLossStreaks++;
            if(currentLossStreak>maxLossStreak){
              maxLossStreak=currentLossStreak;
              maxLossStreakLoss=currentLossValue;
            }else if(currentLossStreak===maxLossStreak){
              maxLossStreakLoss=Math.min(maxLossStreakLoss,currentLossValue);
            }
          }else{
            currentWinStreak=0;currentLossStreak=0;currentWinProfit=0;currentLossValue=0;
          }
        }

        runSummary = {
          running: runningNow,
          startAt: startAt.toISOString(),
          stopAt: stopAt ? stopAt.toISOString() : null,
          runtimeSeconds: Math.max(
            0,
            Math.floor((summaryEndAt.getTime()-startAt.getTime())/1000)
          ),
          startCapital,
          endBalance,
          netProfit,
          returnPercent,
          maxDrawdownMoney,
          maxDrawdownPercent,
          closedBaskets,
          totalTrades: sessionRows.filter((row:any)=>String(row.event_type).toUpperCase()==="ENTRY").length,
          totalDeals: sessionRows.length,
          wins,
          losses,
          winRate,
          lossRate: closedBaskets>0 ? losses/closedBaskets*100 : 0,
          grossProfit,
          grossLoss,
          profitFactor,
          expectedPayoff,
          recoveryFactor,
          sharpeRatio,
          largestProfitTrade: positivePositions.length ? Math.max(...positivePositions) : 0,
          largestLossTrade: negativePositions.length ? Math.min(...negativePositions) : 0,
          averageProfitTrade: positivePositions.length
            ? grossProfit/positivePositions.length : 0,
          averageLossTrade: negativePositions.length
            ? negativePositions.reduce((sum:number,value:number)=>sum+value,0)/negativePositions.length : 0,
          long: directionStats("BUY"),
          short: directionStats("SELL"),
          maxWinStreak,
          maxWinStreakProfit,
          maxLossStreak,
          maxLossStreakLoss,
          averageWinStreak: winStreakCount>0 ? totalWinStreaks/winStreakCount : 0,
          averageLossStreak: lossStreakCount>0 ? totalLossStreaks/lossStreakCount : 0,
          balanceSeries
        };
      }

    }

    const entitlement = await this.entitlement(
      userId,
      account?.id || null,
      selectedSlot.mode || account?.mode || null,
      selectedSlot.id
    );
    const liveStatus = this.buildLiveStatus(instance, settings, entitlement);
    const softwareUpdate = this.installerUpdateState(instance, selectedSlot.mode);
    const cloudUpdate = instance && String(selectedSlot.mode || "").toUpperCase() === "CLOUD"
      ? await this.db.one(
          `SELECT
             ij.state,ij.target_version,ij.result_code,ij.created_at,ij.delivered_at,
             ij.applied_at,ij.completed_at,sj.action,sj.runner_id
           FROM instance_update_jobs ij
           JOIN server_update_jobs sj ON sj.id=ij.server_update_job_id
           WHERE ij.bot_instance_id=$1
           ORDER BY ij.created_at DESC
           LIMIT 1`,
          [instance.id]
        )
      : null;
    const maintenance = await this.maintenance.current();
    const announcement = await this.db.one("SELECT title,message,published_at FROM system_announcements WHERE id=1 AND active=true");
    const partner = await this.partner.dashboardSummary(userId);

    return {
      user,
      slots,
      selectedSlot,
      account,
      instance,
      settings,
      trialRequest: latestTrialRequest,
      entitlement,
      liveStatus,
      softwareUpdate,
      cloudUpdate,
      startTransition,
      runSummary,
      maintenance,
      announcement,
      partner,
      tradeJournal,
      raceVNextEvaluation
    };
  }

  @Get("slots")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate")
  async slots(@Req() req: any) {
    return this.slotRows(req.user.sub);
  }

  @Post("mt5/display-name")
  async updateMt5DisplayName(
    @Req() req: any,
    @Query("slotId") slotId = "",
    @Body() body: { displayName?: string }
  ) {
    const displayName = String(body?.displayName || "").trim().replace(/\s+/g, " ");
    if (displayName.length > 80) {
      throw new BadRequestException("ชื่อบัญชียาวเกิน 80 ตัวอักษร");
    }

    const slot = await this.resolveSlot(req.user.sub, slotId || null);
    const account = await this.db.one(
      `SELECT a.id,a.account_number,a.broker_server,a.display_name
       FROM bot_instances bi
       JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE bi.slot_id=$1 AND a.user_id=$2`,
      [slot.id, req.user.sub]
    );
    if (!account) {
      throw new ConflictException("Slot นี้ยังไม่เชื่อมบัญชี MT5");
    }

    if (displayName) {
      const duplicate = await this.db.one(
        "SELECT account_number FROM mt5_accounts WHERE user_id=$1 AND id<>$2 AND lower(display_name)=lower($3) LIMIT 1",
        [req.user.sub, account.id, displayName]
      );
      if (duplicate) {
        throw new ConflictException(
          "ชื่อนี้ถูกใช้กับ MT5 " + duplicate.account_number + " แล้ว กรุณาใช้ชื่อที่ต่างกัน"
        );
      }
    }

    return this.db.one(
      "UPDATE mt5_accounts SET display_name=NULLIF($2,'') WHERE id=$1 RETURNING id,account_number,broker,broker_server,mode,status,display_name",
      [account.id, displayName]
    );
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
      instance.actual_state === "RUNNING" ||
      Number(instance.positions || 0) > 0
    )) {
      throw new ConflictException("หยุดบอทและจัดการ Position ให้เรียบร้อยก่อนติดตั้งหรือย้ายเครื่อง");
    }

    // Recover a stale Start intent. If the EA never reached RUNNING and there
    // are no positions, the user must still be able to update the software.
    if (instance?.desired_state === "RUNNING") {
      await this.db.query(
        "UPDATE bot_instances SET desired_state='STOPPED' WHERE id=$1",
        [instance.id]
      );
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command='START'",
        [instance.id]
      );
      instance.desired_state = "STOPPED";
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

    // Keep previously downloaded installers valid until their own expiry.
    // Downloading Setup again must not silently invalidate an older file.
    await this.db.query(
      "UPDATE install_enrollments SET status='CANCELLED' WHERE slot_id=$1 AND status='PENDING' AND expires_at<=now()",
      [slot.id]
    );
    const code = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.db.query(
      "INSERT INTO install_enrollments(slot_id,requested_by_user_id,code_hash,expires_at) VALUES($1,$2,$3,$4)",
      [slot.id, req.user.sub, this.crypto.sha256(code), expiresAt]
    );

    const installerVersion = latestInstallerVersion();
    return {
      code,
      fileName: "SCENOVA-Setup-v" + installerVersion + "-" + code + ".exe",
      downloadPath: installerDownloadPath(installerVersion),
      installerVersion,
      expiresAt,
      validForHours: 24,
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
    if (
      instance &&
      slot.assigned_user_id &&
      slot.assigned_user_id !== target.id &&
      instance.metrics?.pendingBasketJournal === true
    ) {
      throw new ConflictException(
        "ยังมี Basket Journal ของผู้ใช้เดิมรอส่ง กรุณารอให้ส่งสำเร็จก่อนโอน Slot"
      );
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
    if (instance?.metrics?.pendingBasketJournal === true) {
      throw new ConflictException(
        "ยังมี Basket Journal รอส่ง กรุณารอให้ส่งสำเร็จก่อนคืน Slot"
      );
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

  @Post("slots/delete")
  async deleteCustomerCloudSlot(@Req() req: any, @Body() body: { slotId: string }) {
    const slot = await this.db.one(
      `SELECT * FROM license_slots
       WHERE id=$1
         AND owner_user_id=$2
         AND assigned_user_id=$2
         AND mode='CLOUD'
         AND status<>'DELETED'`,
      [body.slotId, req.user.sub]
    );
    if (!slot) throw new ConflictException("ไม่พบ VPS Slot นี้");
    if (String(slot.slot_type || "").toUpperCase() === "PERSONAL" || Number(slot.slot_number || 0) === 1) {
      throw new ConflictException("Slot #1 เป็นแพ็กเกจหลัก ไม่สามารถลบได้");
    }

    const instance = await this.db.one(
      `SELECT bi.*,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0) pending_orders
       FROM bot_instances bi
       WHERE bi.slot_id=$1`,
      [slot.id]
    );
    if (instance && (
      String(instance.actual_state || "").toUpperCase() === "RUNNING" ||
      String(instance.desired_state || "").toUpperCase() === "RUNNING" ||
      Number(instance.positions || 0) > 0 ||
      Number(instance.pending_orders || 0) > 0
    )) {
      throw new ConflictException("หยุดบอทและปิด Position / Pending Order ให้หมดก่อนลบ Slot");
    }
    if (
      instance?.runner_id &&
      !["STOP_CONFIRMED","LEASE_REVOKED"].includes(String(instance.runtime_stop_state || "NONE").toUpperCase())
    ) {
      throw new ConflictException("VPS Slot ยังไม่ยืนยันการหยุด MT5 กรุณารอแล้วลองลบอีกครั้ง");
    }

    const revoked = randomBytes(32).toString("hex");
    await this.db.transaction(async tx => {
      if (instance?.mt5_account_id) {
        await tx.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [instance.mt5_account_id]);
        await tx.query("DELETE FROM mt5_credentials WHERE mt5_account_id=$1", [instance.mt5_account_id]);
      }
      if (instance?.id) {
        await tx.query(
          `UPDATE bot_instances SET
             mt5_account_id=NULL,
             runner_id=NULL,
             lock_owner=NULL,
             install_token_hash=$2,
             execution_generation=execution_generation+1,
             desired_state='STOPPED',
             actual_state='OFFLINE',
             last_seen_at=NULL,
             agent_last_seen_at=NULL,
             runtime_stop_state='LEASE_REVOKED',
             runtime_stop_requested_at=NULL,
             runtime_stop_confirmed_at=now(),
             runtime_stop_error=NULL,
             metrics='{}'::jsonb
           WHERE id=$1`,
          [instance.id, this.crypto.sha256(revoked)]
        );
        await tx.query("DELETE FROM bot_instance_secrets WHERE bot_instance_id=$1", [instance.id]);
        await tx.query(
          "UPDATE worker_commands SET status='CANCELLED',result_code='SLOT_DELETED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')",
          [instance.id]
        );
      }
      await tx.query("UPDATE cloud_orders SET runner_id=NULL WHERE slot_id=$1 AND status='PAID'", [slot.id]);
      await tx.query(
        "UPDATE license_slots SET assigned_user_id=NULL,status='DELETED',updated_at=now() WHERE id=$1",
        [slot.id]
      );
      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'CUSTOMER_DELETE_CLOUD_SLOT','license_slot',$2,$3::jsonb)",
        [
          String(req.user?.code || req.user?.sub || "USER").slice(0,160),
          slot.id,
          JSON.stringify({ slotNumber: slot.slot_number, slotType: slot.slot_type, oldMt5AccountId: instance?.mt5_account_id || null })
        ]
      );
    });

    return { ok:true, slotId:slot.id, deleted:true };
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
    if (instance.metrics?.pendingBasketJournal === true) {
      throw new ConflictException(
        "ยังมี Basket Journal รอส่ง กรุณารอให้ส่งสำเร็จก่อนปลดหรือย้ายเครื่อง"
      );
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
      message: "ปลดเครื่องเดิมแล้ว บัญชีนี้พร้อมติดตั้งบนเครื่องใหม่"
    };
  }

  @Post("mt5/change-request")
  async requestMt5Change(@Req() req: any, @Query("slotId") slotId = "") {
    const slot = await this.resolveSlot(req.user.sub, slotId || null);
    if (slot.mode !== "LOCAL") {
      throw new ConflictException("ปุ่มเปลี่ยน MT5 แบบไม่เปลี่ยน .set ใช้กับ LOCAL เท่านั้น");
    }

    const instance = await this.db.one(
      "SELECT bi.*,COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions FROM bot_instances bi WHERE bi.slot_id=$1",
      [slot.id]
    );
    if (!instance) throw new ConflictException("ติดตั้ง SCENOVA จากเว็บไซต์ก่อน");
    if (!instance.mt5_account_id) throw new ConflictException("บัญชีนี้ยังไม่มี MT5 เดิมให้เปลี่ยน");
    if (
      instance.actual_state === "RUNNING" ||
      instance.desired_state === "RUNNING" ||
      Number(instance.positions || 0) > 0
    ) {
      throw new ConflictException("หยุดบอทและปิด Position ให้เรียบร้อยก่อนเปลี่ยนบัญชี MT5");
    }
    if (instance.metrics?.pendingBasketJournal === true) {
      throw new ConflictException(
        "ยังมีข้อมูล Basket ของบัญชี MT5 เดิมรอส่งเข้า Server กรุณารอ Heartbeat/Journal ส่งสำเร็จก่อนเปลี่ยนบัญชี"
      );
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
      `SELECT bi.*,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         COALESCE(NULLIF(bi.metrics->>'previousBoundPositions','')::int,0) previous_bound_positions,
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
    if (Number(instance.previous_bound_positions || 0) > 0) {
      throw new ConflictException(
        "บัญชี MT5 เดิมยังมี Position ค้างจากสถานะล่าสุด กรุณา Login กลับบัญชีเดิม ปิด Position ให้หมด แล้วค่อย Login บัญชีใหม่อีกครั้ง"
      );
    }
    if (instance.metrics?.pendingBasketJournal === true) {
      throw new ConflictException(
        "ยังมี Basket Journal ของบัญชีเดิมรอส่ง กรุณารอให้ระบบส่งสำเร็จก่อนยืนยันบัญชี MT5 ใหม่"
      );
    }
    const isFirstBind = !instance.old_account_id;

    if (
      !instance.last_seen_at ||
      Date.now() - new Date(instance.last_seen_at).getTime() > 20_000
    ) {
      throw new ConflictException("รอ Heartbeat ล่าสุดจาก EA ก่อนยืนยันบัญชี MT5");
    }
    if (!instance.pending_account_number || !instance.pending_broker_server || !instance.pending_account_seen_at) {
      throw new ConflictException("ยังไม่พบบัญชี MT5 ใหม่จาก EA");
    }
    if (Date.now() - new Date(instance.pending_account_seen_at).getTime() > 10 * 60_000) {
      throw new ConflictException("ข้อมูลบัญชีที่ตรวจพบหมดอายุ กรุณาเปิด MT5 ให้ EA ส่งสถานะใหม่");
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
         metrics=COALESCE(metrics,'{}'::jsonb) - 'previousBoundPositions',
         pending_account_number=NULL,pending_broker=NULL,pending_broker_server=NULL,
         pending_account_ip=NULL,pending_account_seen_at=NULL,account_change_requested_at=NULL
       WHERE id=$1`,
      [instance.id, account.id]
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,$2,'bot_instance',$3,$4::jsonb)",
      [
        String(req.user.code || req.user.sub),
        isFirstBind ? "BIND_MT5_FIRST" : "REBIND_MT5",
        instance.id,
        JSON.stringify({
          slotId: slot.id,
          accountNumber,
          brokerServer,
          preservedTrialHistory: true,
          firstBind: isFirstBind
        })
      ]
    );
    await this.trials.claimPendingAuthorization(req.user.sub, account.id);
    return { ok: true, account, firstBind: isFirstBind };
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
      tradingPassword?: string;
    }
  ) {
    const mode: "CLOUD" | "LOCAL" = body.mode === "CLOUD" ? "CLOUD" : "LOCAL";
    const accountNumber = String(body.accountNumber || "").trim();
    const brokerServer = String(body.brokerServer || "").trim();
    const brokerName = String(body.broker || "").trim() || "Other";

    if (!/^\d{3,20}$/.test(accountNumber)) {
      throw new BadRequestException("MT5 Login ไม่ถูกต้อง · กรุณาตรวจเลขบัญชี MT5");
    }
    if (!brokerServer || brokerServer.length > 160 || /[\r\n\x00]/.test(brokerServer)) {
      throw new BadRequestException("MT5 Server ไม่ถูกต้อง · ใช้ชื่อ Server ให้ตรงกับที่ Broker แสดง");
    }
    if (!brokerName || brokerName.length > 160 || /[\r\n\x00]/.test(brokerName)) {
      throw new BadRequestException("ชื่อ Broker ไม่ถูกต้อง");
    }
    const slot = body.slotId
      ? await this.resolveSlot(req.user.sub, body.slotId)
      : await this.ensureModeSlot(req.user.sub, mode);
    if (slot.mode !== mode) throw new ConflictException("slot mode does not match MT5 mode");
    const boundCloud = await this.db.one(
      `SELECT bi.id,bi.runtime_stop_state,bi.desired_state,bi.actual_state,bi.runner_id,bi.metrics,
              a.account_number,a.broker_server,
              EXISTS(SELECT 1 FROM mt5_credentials c WHERE c.mt5_account_id=bi.mt5_account_id) credential_ready
       FROM bot_instances bi
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE bi.slot_id=$1 AND bi.mode='CLOUD' AND bi.runner_id IS NOT NULL`,
      [slot.id]
    );
    const sameBoundIdentity = Boolean(
      boundCloud &&
      String(boundCloud.account_number || "").trim().toLowerCase() === accountNumber.toLowerCase() &&
      String(boundCloud.broker_server || "").trim().toLowerCase() === brokerServer.toLowerCase()
    );
    const incompleteSameAccountBind = Boolean(
      boundCloud &&
      sameBoundIdentity &&
      !boundCloud.credential_ready &&
      String(boundCloud.actual_state || "").toUpperCase() !== "RUNNING" &&
      String(boundCloud.desired_state || "").toUpperCase() !== "RUNNING" &&
      Math.max(0,Number(boundCloud.metrics?.positions || 0)) === 0 &&
      Math.max(0,Number(boundCloud.metrics?.accountScenovaPendingOrders || 0)) === 0
    );
    if (
      boundCloud &&
      !["STOP_CONFIRMED","LEASE_REVOKED"].includes(String(boundCloud.runtime_stop_state || "NONE")) &&
      !incompleteSameAccountBind
    ) {
      throw new ConflictException(
        "กรุณากดเปลี่ยนบัญชี VPS ก่อน ระบบจะปิด MT5 เดิมบน Server ให้เรียบร้อยแล้วจึงเชื่อมบัญชีใหม่ได้"
      );
    }
    if (mode === "LOCAL") {
      throw new ConflictException("LOCAL mode must be installed from the SCENOVA website; MT5 will be detected automatically");
    }

    const cloudAccess: any = await this.entitlement(
      req.user.sub,
      null,
      "CLOUD",
      slot.id
    );
    if (!cloudAccess.allowed) {
      if (cloudAccess.source === "PRIMARY_SUBSCRIPTION_EXPIRED" || cloudAccess.source === "PRIMARY_SUBSCRIPTION_REQUIRED") {
        throw new ConflictException("แพ็กเกจ VPS หลัก (Slot #1) หมดอายุหรือยังไม่เปิดใช้งาน กรุณาต่ออายุแพ็กเกจหลักก่อน");
      }
      if (cloudAccess.source === "SUBSCRIPTION_EXPIRED") {
        throw new ConflictException("สมาชิก VPS Slot นี้หมดอายุแล้ว กรุณาต่ออายุ Slot ก่อนเชื่อมบัญชี MT5");
      }
      if (cloudAccess.source === "GROUP_DISABLED") {
        throw new ConflictException("สิทธิ์ VPS ของบัญชีนี้ถูกปิด กรุณาติดต่อผู้ดูแล");
      }
      throw new ConflictException("ยังไม่มีสมาชิก VPS ที่ใช้งานได้สำหรับ Slot นี้");
    }

    await this.assertMt5IdentityAvailable(
      req.user.sub,
      accountNumber,
      brokerServer,
      slot.id
    );

    const existingInstance = await this.db.one(
      "SELECT * FROM bot_instances WHERE slot_id=$1",
      [slot.id]
    );
    if (existingInstance) {
      const existingPositions = Math.max(
        0,
        Number(existingInstance.metrics?.positions || 0)
      );
      const existingPendingOrders = Math.max(
        0,
        Number(existingInstance.metrics?.accountScenovaPendingOrders || 0)
      );
      if (
        existingInstance.actual_state === "RUNNING" ||
        existingInstance.desired_state === "RUNNING" ||
        existingPositions > 0 ||
        existingPendingOrders > 0
      ) {
        throw new ConflictException(
          "หยุดบอทและปิด Position / Pending Order ให้หมดก่อนเปลี่ยนบัญชี Cloud MT5"
        );
      }
    }

    let account = await this.db.one(
      "SELECT * FROM mt5_accounts WHERE user_id=$1 AND lower(account_number)=lower($2) AND lower(broker_server)=lower($3) LIMIT 1",
      [req.user.sub, accountNumber, brokerServer]
    );
    if (account) {
      const otherBinding = await this.db.one(
        `SELECT bi.id,bi.slot_id,bi.mode,bi.desired_state,bi.actual_state,
                bi.agent_version,bi.agent_last_seen_at
         FROM bot_instances bi
         WHERE bi.mt5_account_id=$1
           AND bi.slot_id<>$2
         ORDER BY bi.created_at DESC
         LIMIT 1`,
        [account.id, slot.id]
      );
      if (otherBinding) {
        if (mode === "CLOUD" && String(otherBinding.mode) === "LOCAL") {
          throw new ConflictException(
            "บัญชี MT5 นี้ยังเชื่อมกับ Local อยู่ กรุณากลับไปที่ Local Slot เดิมแล้วกด ย้ายไป VPS เพื่อย้ายบัญชีอย่างปลอดภัย"
          );
        }
        throw new ConflictException(
          "บัญชี MT5 นี้ยังเชื่อมอยู่กับ Slot อื่น กรุณาย้ายหรือยกเลิกการเชื่อมเดิมก่อน"
        );
      }
      account = await this.db.one(
        "UPDATE mt5_accounts SET broker=$2,mode=$3,status='ACTIVE' WHERE id=$1 RETURNING *",
        [account.id, brokerName, mode]
      );
    } else {
      account = await this.db.one(
        "INSERT INTO mt5_accounts(user_id,account_number,broker,broker_server,mode) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [req.user.sub, accountNumber, brokerName, brokerServer, mode]
      );
    }

    if (existingInstance?.mt5_account_id && existingInstance.mt5_account_id !== account.id) {
      await this.db.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [existingInstance.mt5_account_id]);
      if (mode === "CLOUD") {
        await this.db.query("DELETE FROM mt5_credentials WHERE mt5_account_id=$1", [existingInstance.mt5_account_id]);
      }
    }

    const installToken = randomBytes(32).toString("hex");
    let instance = existingInstance;
    if (instance) {
      instance = await this.db.one(
        `UPDATE bot_instances SET
           mt5_account_id=$2,
           mode=$3::varchar,
           install_token_hash=$4,
           execution_generation=CASE WHEN $3::varchar='CLOUD' THEN execution_generation+1 ELSE execution_generation END,
           lease_rotated_at=CASE WHEN $3::varchar='CLOUD' THEN now() ELSE lease_rotated_at END,
           desired_state='STOPPED',
           actual_state='OFFLINE',
           last_seen_at=NULL,
           runtime_stop_state=CASE WHEN $3::varchar='CLOUD' THEN 'NONE' ELSE runtime_stop_state END,
           runtime_stop_requested_at=CASE WHEN $3::varchar='CLOUD' THEN NULL ELSE runtime_stop_requested_at END,
           runtime_stop_confirmed_at=CASE WHEN $3::varchar='CLOUD' THEN NULL ELSE runtime_stop_confirmed_at END,
           runtime_stop_error=CASE WHEN $3::varchar='CLOUD' THEN NULL ELSE runtime_stop_error END,
           provisioning_error=CASE WHEN $3::varchar='CLOUD' THEN NULL ELSE provisioning_error END,
           metrics=CASE WHEN $3::varchar='CLOUD' THEN '{}'::jsonb ELSE metrics END
         WHERE id=$1
         RETURNING id,mode,desired_state,actual_state,execution_generation,runtime_stop_state`,
        [instance.id, account.id, mode, this.crypto.sha256(installToken)]
      );
    } else {
      instance = await this.db.one(
        "INSERT INTO bot_instances(slot_id,mt5_account_id,mode,install_token_hash) VALUES($1,$2,$3,$4) RETURNING id,mode,desired_state,actual_state",
        [slot.id, account.id, mode, this.crypto.sha256(installToken)]
      );
      await this.db.query("INSERT INTO bot_settings(bot_instance_id) VALUES($1)", [instance.id]);
    }

    if (mode === "CLOUD") {
      await this.db.query(
        `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
         VALUES(
           $1,
           jsonb_build_object(
             'symbolResolutionMode','DISCOVERY',
             'symbolSelectedBy','MT5_DISCOVERY',
             'symbolDiscoveryState','SCANNING'
           ),
           now()
         )
         ON CONFLICT(bot_instance_id)
         DO UPDATE SET
           settings=(
             COALESCE(bot_settings.settings,'{}'::jsonb)
             - 'startupSymbol'
             - 'symbol'
             - 'symbolAccountType'
             - 'firstConnectPrimePending'
             - 'firstConnectPrimeRequestedAt'
             - 'firstConnectPrimeStartedAt'
           ) || jsonb_build_object(
             'symbolResolutionMode','DISCOVERY',
             'symbolSelectedBy','MT5_DISCOVERY',
             'symbolDiscoveryState','SCANNING'
           ),
           updated_at=now()`,
        [instance.id]
      );
    }

    const secret = this.crypto.encrypt(installToken);
    await this.db.query(
      "INSERT INTO bot_instance_secrets(bot_instance_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4) ON CONFLICT(bot_instance_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag",
      [instance.id, secret.ciphertext, secret.iv, secret.authTag]
    );

    if (mode === "CLOUD" && body.tradingPassword !== undefined) {
      if (!body.tradingPassword || /[\r\n\x00]/.test(body.tradingPassword)) {
        throw new ConflictException("Trading Password ไม่ถูกต้อง");
      }
      const credential = this.crypto.encrypt(String(body.tradingPassword));
      await this.db.query(
        "INSERT INTO mt5_credentials(mt5_account_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4) ON CONFLICT(mt5_account_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,updated_at=now()",
        [account.id, credential.ciphertext, credential.iv, credential.authTag]
      );
    }

    await this.trials.claimPendingAuthorization(req.user.sub, account.id);
    return {
      account,
      instance,
      installToken: null,
      firstConnectPrimeArmed: false,
      symbolDiscoveryPending: mode === "CLOUD",
      note: mode === "CLOUD"
        ? "MT5 credentials accepted. VPS will connect to the real account and return XAU symbols for customer confirmation."
        : "Install token is held encrypted for the runtime."
    };
  }

  // Controller JwtGuard and method AdminGuard must both pass.
  // All account binding still uses the pre-existing customer Cloud MT5 path.
  @Post("mt5/admin-connect")
  @UseGuards(AdminGuard)
  async adminConnectCloudMt5(
    @Req() req: any,
    @Body() body: {
      userId: string;
      slotId: string;
      accountNumber: string;
      broker?: string;
      brokerServer: string;
      tradingPassword: string;
    }
  ) {
    const actorId = String(req.user?.sub || "");
    if (!actorId || !["OWNER","ADMIN"].includes(String(req.user?.role || ""))) {
      throw new ForbiddenException("Owner/Admin login required");
    }
    const actor = await this.user(actorId);
    if (!actor || actor.status !== "ACTIVE" || !["OWNER","ADMIN"].includes(actor.role)) {
      throw new ForbiddenException("บัญชีผู้ดูแลไม่ได้รับอนุญาต");
    }
    const userId = String(body?.userId || "").trim();
    const slotId = String(body?.slotId || "").trim();
    const accountNumber = String(body?.accountNumber || "").trim();
    const brokerServer = String(body?.brokerServer || "").trim();
    const broker = String(body?.broker || "").trim() || "Other";
    const tradingPassword = typeof body?.tradingPassword === "string" ? body.tradingPassword : "";
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(slotId)) {
      throw new BadRequestException("User ID หรือ Slot ID ไม่ถูกต้อง");
    }
    if (!tradingPassword || tradingPassword.length > 512 || /[\r\n\x00]/.test(tradingPassword)) {
      throw new BadRequestException("กรุณาระบุ Trading Password ที่ถูกต้อง");
    }
    const customer = await this.user(userId);
    if (!customer || customer.status !== "ACTIVE" || ["OWNER","ADMIN"].includes(customer.role)) {
      throw new ConflictException("ไม่พบบัญชีลูกค้าที่เปิดใช้งานอยู่");
    }
    const slot = await this.db.one(
      "SELECT ls.id,bi.mt5_account_id,bi.mode instance_mode,bi.actual_state,bi.desired_state, " +
      "COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions, " +
      "COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0) pending_orders " +
      "FROM license_slots ls LEFT JOIN bot_instances bi ON bi.slot_id=ls.id " +
      "WHERE ls.id=$1 AND ls.assigned_user_id=$2 AND ls.mode='CLOUD' AND ls.status='ACTIVE'",
      [slotId,userId]
    );
    if (!slot) throw new ConflictException("ไม่พบ Cloud VPS Slot ที่เปิดใช้งานของลูกค้า");
    if (
      slot.mt5_account_id ||
      (slot.instance_mode && slot.instance_mode !== "CLOUD") ||
      ["RUNNING","SAFE_STOP"].includes(String(slot.actual_state || "").toUpperCase()) ||
      ["RUNNING","SAFE_STOP"].includes(String(slot.desired_state || "").toUpperCase()) ||
      Number(slot.positions || 0) > 0 || Number(slot.pending_orders || 0) > 0
    ) {
      throw new ConflictException("Slot มี MT5 หรือออเดอร์ค้างอยู่ ต้องหยุดและตัดการเชื่อมต่อเดิมอย่างปลอดภัยก่อน");
    }
    // The shared path enforces Cloud entitlement, MT5 identity uniqueness,
    // safe runtime stop/lease, encryption, and symbol discovery.
    // This operation never issues a START command.
    const result = await this.linkMt5(
      { user: { sub: userId } },
      { slotId, accountNumber, broker, brokerServer, mode: "CLOUD", tradingPassword }
    );
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) " +
      "VALUES($1,'ADMIN_CONNECT_CUSTOMER_CLOUD_MT5','bot_instance',$2,$3::jsonb)",
      [
        ("ADMIN:" + actorId).slice(0,160),
        result.instance.id,
        JSON.stringify({ userId, slotId, mt5AccountId: result.account.id, accountNumber, brokerServer })
      ]
    );
    return {
      ok: true,
      slotId,
      accountNumber,
      connectionStatus: "PENDING_WORKER",
      message: "บันทึกข้อมูล MT5 แล้ว · รอ Cloud Worker เชื่อมต่อจริง (บอทยังไม่ Start)"
    };
  }


  // Read-only status for the admin-assisted Cloud connection dialog.
  // Values come from the same worker telemetry and EA heartbeat used by Dashboard.
  @Get("mt5/admin-connect/status")
  @UseGuards(AdminGuard)
  async adminCloudMt5ConnectStatus(
    @Req() req: any,
    @Query("userId") userId = "",
    @Query("slotId") slotId = ""
  ) {
    const actorId = String(req.user?.sub || "");
    if (!actorId || !["OWNER", "ADMIN"].includes(String(req.user?.role || ""))) {
      throw new ForbiddenException("Owner/Admin login required");
    }
    const actor = await this.user(actorId);
    if (!actor || actor.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(actor.role)) {
      throw new ForbiddenException("บัญชีผู้ดูแลไม่ได้รับอนุญาต");
    }
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(slotId)) {
      throw new BadRequestException("User ID หรือ Slot ID ไม่ถูกต้อง");
    }
    const slot = await this.db.one(
      "SELECT ls.id, ls.status, bi.id instance_id, a.account_number, a.broker, a.broker_server, " +
      "bi.provisioning_error, bi.actual_state, bi.desired_state, " +
      "reload.status reload_status, reload.result_code reload_result_code, " +
      "reload.acked_at reload_acked_at, bi.last_seen_at ea_last_seen_at, wn.last_seen_at worker_last_seen_at, " +
      "(bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now()-interval '20 seconds') mt5_online, " +
      "(wn.last_seen_at IS NOT NULL AND wn.last_seen_at > now()-interval '120 seconds') runner_online, " +
      "((bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now()-interval '60 seconds') OR " +
      "(wn.last_seen_at > now()-interval '90 seconds' AND EXISTS " +
      "(SELECT 1 FROM jsonb_array_elements(COALESCE(wn.telemetry->'instances','[]'::jsonb)) item " +
      "WHERE item->>'instanceId'=bi.id::text AND item->>'terminalRunning'='true'))) terminal_online, " +
      "(wn.last_seen_at > now()-interval '30 seconds' AND EXISTS " +
      "(SELECT 1 FROM jsonb_array_elements(COALESCE(wn.telemetry->'instances','[]'::jsonb)) item " +
      "WHERE item->>'instanceId'=bi.id::text AND item->>'terminalRunning'='true' " +
      "AND item->>'chartHasFastBasketBot'='true' AND item->>'presetCloudRelayEnabled'='true')) cloud_control_ready, " +
      "bi.metrics->'marketWatchSymbols' market_watch_symbols, " +
      // Discovery belongs to the Worker, not the EA: the EA may not yet have a chart.
      // Require fresh Worker telemetry for this exact Cloud instance.
      "CASE WHEN wn.last_seen_at > now()-interval '30 seconds' THEN " +
      "(SELECT item->'discoveredXauSymbols' FROM jsonb_array_elements(" +
      "COALESCE(wn.telemetry->'instances','[]'::jsonb)) item " +
      "WHERE item->>'instanceId'=bi.id::text AND item->>'terminalRunning'='true' LIMIT 1) " +
      "ELSE '[]'::jsonb END worker_symbols, " +
      "bi.metrics->>'symbol' active_symbol, bi.metrics->'terminalConnected' broker_connected, " +
      "bs.settings->>'startupSymbol' startup_symbol, " +
      "bs.settings->>'symbolResolutionMode' symbol_resolution_mode " +
      "FROM license_slots ls " +
      "LEFT JOIN bot_instances bi ON bi.slot_id=ls.id AND bi.mode='CLOUD' " +
      "LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id " +
      "LEFT JOIN worker_nodes wn ON wn.runner_id=bi.runner_id " +
      "LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id " +
      // Ignore retries made for a previous account or before the current Symbol was selected.
      "LEFT JOIN LATERAL (SELECT wc.status,wc.result_code,wc.acked_at FROM worker_commands wc " +
      "WHERE wc.bot_instance_id=bi.id AND wc.command='RELOAD_INSTANCE' " +
      "AND wc.execution_generation=bi.execution_generation " +
      "AND bs.settings->>'symbolResolutionMode'='EXACT' " +
      "AND wc.created_at >= bs.updated_at " +
      "ORDER BY wc.created_at DESC LIMIT 1) reload ON true " +
      "WHERE ls.id=$1 AND ls.assigned_user_id=$2 AND ls.mode='CLOUD' AND ls.status<>'DELETED'",
      [slotId, userId]
    );
    if (!slot) throw new ConflictException("ไม่พบ Cloud VPS Slot ของลูกค้า");
    // Only live Worker discovery authorizes a Cloud Symbol choice.
    // Cached EA market-watch metrics may describe a previous account.
    const observedSymbols = Array.isArray(slot.worker_symbols) ? slot.worker_symbols : [];
    const symbols = Array.from(new Set(
      observedSymbols.filter((s:any): s is string =>
        typeof s === "string" && /^XAU[A-Za-z0-9._#-]{3,29}$/i.test(s)
      )
    )).slice(0, 60);
    const reloadFailed = String(slot.reload_status || "").toUpperCase() === "FAILED";
    const reloadError = reloadFailed
      ? (String(slot.reload_result_code || "").match(/^[A-Z][A-Z0-9_]{1,60}/)?.[0] || "EA_ATTACH_FAILED")
      : "";
    // A failed reload stays in command history. Once fresh EA/Worker telemetry confirms
    // the chart, broker and selected Symbol are healthy *after* that failure, it is
    // no longer an active connection error. Never alter actual/desired trading state.
    const symbolMatches = Boolean(slot.startup_symbol && slot.active_symbol &&
      String(slot.startup_symbol).toUpperCase() === String(slot.active_symbol).toUpperCase());
    const recoveredAfterReload = Boolean(slot.reload_acked_at &&
      slot.ea_last_seen_at && slot.worker_last_seen_at &&
      new Date(slot.ea_last_seen_at).getTime() > new Date(slot.reload_acked_at).getTime() &&
      new Date(slot.worker_last_seen_at).getTime() > new Date(slot.reload_acked_at).getTime() &&
      slot.account_number && slot.runner_online && slot.terminal_online &&
      slot.mt5_online && slot.cloud_control_ready && slot.broker_connected === true &&
      String(slot.symbol_resolution_mode || "").toUpperCase() === "EXACT" && symbolMatches);
    const activeReloadError = reloadError === "EA_ATTACH_TIMEOUT" && recoveredAfterReload
      ? "" : reloadError;
    return {
      ok: true,
      slotId,
      accountNumber: slot.account_number || "",
      broker: slot.broker || "",
      brokerServer: slot.broker_server || "",
      runnerOnline: Boolean(slot.runner_online),
      terminalOnline: Boolean(slot.terminal_online),
      eaHeartbeat: Boolean(slot.mt5_online),
      cloudControlReady: Boolean(slot.cloud_control_ready),
      brokerConnected: typeof slot.broker_connected === "boolean" ? slot.broker_connected : null,
      symbols,
      startupSymbol: slot.startup_symbol || "",
      activeSymbol: slot.active_symbol || "",
      symbolConfirmed: String(slot.symbol_resolution_mode || "").toUpperCase() === "EXACT" &&
        Boolean(String(slot.startup_symbol || "").trim()),
      provisioningError: slot.provisioning_error
        ? (String(slot.provisioning_error).match(/^[A-Z][A-Z0-9_]{1,60}/)?.[0] || "MT5_PROVISION_FAILED")
        : activeReloadError,
      actualState: slot.actual_state || "OFFLINE",
      desiredState: slot.desired_state || "STOPPED"
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
      `SELECT bi.*,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0) pending_orders
       FROM bot_instances bi
       WHERE bi.slot_id=$1`,
      [slot.id]
    );
    if (!instance) return { ok: true };

    if (
      instance.actual_state === "RUNNING" ||
      instance.desired_state === "RUNNING" ||
      Number(instance.positions || 0) > 0 ||
      Number(instance.pending_orders || 0) > 0
    ) {
      throw new ConflictException(
        "กรุณาหยุดบอทและปิด Position / Pending Order ของ SCENOVA ให้หมดก่อนเปลี่ยนบัญชี MT5"
      );
    }
    if (slot.mode === "CLOUD" && instance.runner_id) {
      const stopState = String(instance.runtime_stop_state || "NONE").toUpperCase();
      if (!["STOP_CONFIRMED","LEASE_REVOKED"].includes(stopState)) {
        const activeStop = await this.db.one(
          `SELECT id,status
           FROM worker_commands
           WHERE bot_instance_id=$1
             AND command='STOP_INSTANCE'
             AND status IN ('PENDING','DELIVERED')
           ORDER BY id DESC
           LIMIT 1`,
          [instance.id]
        );
        if (!activeStop) {
            await this.db.query(
              `INSERT INTO worker_commands(
                 runner_id,bot_instance_id,execution_generation,command,status
               ) VALUES($1,$2,$3,'STOP_INSTANCE','PENDING')`,
              [instance.runner_id, instance.id, Number(instance.execution_generation || 1)]
            );
          await this.db.query(
            `UPDATE bot_instances SET
               desired_state='STOPPED',
               runtime_stop_state='STOP_REQUESTED',
               runtime_stop_requested_at=now(),
               runtime_stop_confirmed_at=NULL,
               runtime_stop_error=NULL
             WHERE id=$1`,
            [instance.id]
          );
          await this.db.query(
            `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
             VALUES($1,'CUSTOMER_CLOUD_ACCOUNT_SWITCH_STOP_REQUESTED','bot_instance',$2,$3::jsonb)`,
            [
              String(req.user?.code || req.user?.sub || "USER").slice(0,160),
              instance.id,
              JSON.stringify({
                slotId: slot.id,
                runnerId: instance.runner_id,
                executionGeneration: Number(instance.execution_generation || 1)
              })
            ]
          );
        }
        return {
          ok: false,
          pendingCloudStop: true,
          state: "STOP_REQUESTED",
          message: "กำลังปิด MT5 เดิมบน VPS เพื่อเตรียมเปลี่ยนบัญชี"
        };
      }
    }

    const oldAccountId = instance.mt5_account_id || null;
    if (oldAccountId) {
      await this.db.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [oldAccountId]);
      if (slot.mode === "CLOUD") {
        await this.db.query("DELETE FROM mt5_credentials WHERE mt5_account_id=$1", [oldAccountId]);
      }
    }
    await this.db.query(
      `UPDATE bot_instances SET
         mt5_account_id=NULL,
         desired_state='STOPPED',
         actual_state='OFFLINE',
         last_seen_at=NULL,
         metrics=CASE WHEN mode='CLOUD' THEN '{}'::jsonb ELSE metrics END,
         pending_account_number=NULL,
         pending_broker=NULL,
         pending_broker_server=NULL,
         pending_account_ip=NULL,
         pending_account_seen_at=NULL,
         account_change_requested_at=NULL
       WHERE id=$1`,
      [instance.id]
    );
    await this.db.query(
      `UPDATE bot_commands
       SET status='ACKED',acked_at=COALESCE(acked_at,now())
       WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')`,
      [instance.id]
    );
    await this.db.query(
      `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
       VALUES($1,'CUSTOMER_MT5_ACCOUNT_RESET','bot_instance',$2,$3::jsonb)`,
      [
        String(req.user?.code || req.user?.sub || "USER").slice(0,160),
        instance.id,
        JSON.stringify({
          slotId: slot.id,
          mode: slot.mode,
          oldMt5AccountId: oldAccountId,
          runnerId: instance.runner_id || null,
          cloudRuntimeStopped: slot.mode === "CLOUD" ? true : null
        })
      ]
    );
    return {
      ok: true,
      preservedTrialHistory: true,
      oldAccountDeactivated: Boolean(oldAccountId),
      cloudRuntimeStopped: slot.mode === "CLOUD" ? true : false
    };
  }

  @Post("mt5/cloud-credential")
  async saveCloudCredential(
    @Req() req: any,
    @Body() body: {
      mt5AccountId: string;
      tradingPassword: string;
    }
  ) {
    const account = await this.db.one(
      "SELECT * FROM mt5_accounts WHERE id=$1 AND user_id=$2 AND mode='CLOUD'",
      [body.mt5AccountId, req.user.sub]
    );
    if (!account) throw new ConflictException("cloud MT5 account not found");
    if (!body.tradingPassword || /[\r\n\x00]/.test(body.tradingPassword)) throw new ConflictException("Trading Password ไม่ถูกต้อง");
    const bound = await this.db.one(
      `SELECT id,slot_id,last_seen_at,runner_id,runtime_stop_state,metrics,execution_generation
       FROM bot_instances
       WHERE mt5_account_id=$1 AND mode='CLOUD'
       ORDER BY created_at DESC
       LIMIT 1`,
      [account.id]
    );

    const cloudAccess: any = await this.entitlement(
      req.user.sub,
      account.id,
      "CLOUD",
      bound?.slot_id || null
    );
    if (!cloudAccess.allowed) {
      if (cloudAccess.source === "PRIMARY_SUBSCRIPTION_EXPIRED" || cloudAccess.source === "PRIMARY_SUBSCRIPTION_REQUIRED") {
        throw new ConflictException("แพ็กเกจ VPS หลัก (Slot #1) หมดอายุหรือยังไม่เปิดใช้งาน กรุณาต่ออายุแพ็กเกจหลักก่อน");
      }
      if (cloudAccess.source === "SUBSCRIPTION_EXPIRED") {
        throw new ConflictException("สมาชิก VPS Slot นี้หมดอายุแล้ว กรุณาต่ออายุ Slot ก่อนเชื่อม MT5 บน Server อีกครั้ง");
      }
      if (cloudAccess.source === "GROUP_DISABLED") {
        throw new ConflictException("สิทธิ์ VPS ของบัญชีนี้ถูกปิด กรุณาติดต่อผู้ดูแล");
      }
      throw new ConflictException("ยังไม่มีสมาชิก VPS ที่ใช้งานได้");
    }

    if (
      bound &&
      String(bound.runtime_stop_state || "NONE") === "STOP_CONFIRMED" &&
      bound.metrics?.membershipCutoff === true
    ) {
      await this.db.query(
        `UPDATE bot_instances SET
           runtime_stop_state='NONE',
           runtime_stop_requested_at=NULL,
           runtime_stop_confirmed_at=NULL,
           runtime_stop_error=NULL,
           desired_state='STOPPED',
           actual_state='OFFLINE',
           last_seen_at=NULL,
           metrics=(COALESCE(metrics,'{}'::jsonb)
             - 'membershipCutoff'
             - 'membershipCutoffAt'
             - 'membershipExpiredAt'
             - 'membershipCutoffReason'
             - 'primaryMembershipExpiredAt')
         WHERE id=$1`,
        [bound.id]
      );
      bound.runtime_stop_state = "NONE";
      bound.last_seen_at = null;
      bound.metrics = {
        ...(bound.metrics || {}),
        membershipCutoff: undefined,
        membershipCutoffAt: undefined,
        membershipExpiredAt: undefined,
        membershipCutoffReason: undefined,
        primaryMembershipExpiredAt: undefined
      };
    }

    if (bound?.last_seen_at && Date.now() - new Date(bound.last_seen_at).getTime() <= 20_000) {
      throw new ConflictException("VPS ยังเชื่อมต่อ MT5 อยู่ จึงยังไม่ต้องบันทึกรหัสผ่านใหม่");
    }
    if (bound && String(bound.runtime_stop_state || "NONE") !== "NONE") {
      throw new ConflictException("VPS กำลังหยุดหรือย้าย Runtime อยู่ กรุณารอให้ขั้นตอนนี้เสร็จก่อน");
    }
    if (bound) {
      const migration = await this.db.one(
        `SELECT id,state FROM runtime_migrations
         WHERE bot_instance_id=$1
           AND state NOT IN ('COMPLETED','FAILED','CANCELLED')
         ORDER BY created_at DESC
         LIMIT 1`,
        [bound.id]
      );
      if (migration) {
        const reconciled = await this.migrations.reconcile(
          req.user.sub,
          String(migration.id),
          String(req.user?.code || req.user?.user_code || req.user?.sub || "USER").slice(0, 160)
        );
        const migrationState = String(reconciled?.state || migration.state || "").toUpperCase();
        if (!["COMPLETED","FAILED","CANCELLED"].includes(migrationState)) {
          throw new ConflictException(
            "VPS ยังอยู่ระหว่างย้ายระบบ (" + migrationState + ") กรุณารอให้การย้ายเสร็จก่อน"
          );
        }
      }
    }

    if (bound) {
      await this.db.query(
        `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
         VALUES(
           $1,
           jsonb_build_object(
             'symbolResolutionMode','DISCOVERY',
             'symbolSelectedBy','MT5_DISCOVERY',
             'symbolDiscoveryState','SCANNING'
           ),
           now()
         )
         ON CONFLICT(bot_instance_id)
         DO UPDATE SET
           settings=(
             COALESCE(bot_settings.settings,'{}'::jsonb)
             - 'startupSymbol'
             - 'symbol'
             - 'symbolAccountType'
             - 'firstConnectPrimePending'
             - 'firstConnectPrimeRequestedAt'
             - 'firstConnectPrimeStartedAt'
           ) || jsonb_build_object(
             'symbolResolutionMode','DISCOVERY',
             'symbolSelectedBy','MT5_DISCOVERY',
             'symbolDiscoveryState','SCANNING'
           ),
           updated_at=now()`,
        [bound.id]
      );
    }

    const enc = this.crypto.encrypt(String(body.tradingPassword || ""));
    await this.db.query(
      "INSERT INTO mt5_credentials(mt5_account_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4) ON CONFLICT(mt5_account_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,updated_at=now()",
      [account.id, enc.ciphertext, enc.iv, enc.authTag]
    );
    if (bound) {
      await this.db.query(
        `UPDATE bot_instances SET
           cloud_recovery_state='IDLE',
           cloud_recovery_attempts=0,
           cloud_recovery_window_started_at=NULL,
           cloud_recovery_next_at=NULL,
           cloud_recovery_last_error=NULL,
           provisioning_error=NULL,
           actual_state='OFFLINE',
           last_seen_at=NULL,
           metrics=(
             COALESCE(metrics,'{}'::jsonb)
             - 'symbol'
             - 'symbolTradeMode'
             - 'marketWatchSymbols'
             - 'marketWatchCapturedAt'
             - 'requestedStartupSymbol'
             - 'symbolChangeStatus'
             - 'symbolChangeRequestedAt'
           )
         WHERE id=$1`,
        [bound.id]
      );

      if (bound.runner_id) {
        const activeReload = await this.db.one(
          `SELECT id FROM worker_commands
           WHERE bot_instance_id=$1
             AND command='RELOAD_INSTANCE'
             AND status IN ('PENDING','DELIVERED')
           ORDER BY id DESC
           LIMIT 1`,
          [bound.id]
        );
        if (!activeReload) {
          await this.db.query(
            `INSERT INTO worker_commands(
               runner_id,bot_instance_id,execution_generation,command,status
             ) VALUES($1,$2,$3,'RELOAD_INSTANCE','PENDING')`,
            [bound.runner_id, bound.id, Number(bound.execution_generation || 1)]
          );
        }
      }

      await this.db.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'CLOUD_CREDENTIAL_RECOVERY','bot_instance',$2,$3::jsonb)",
        [
          String(req.user?.code || req.user?.sub || "USER").slice(0, 160),
          bound.id,
          JSON.stringify({
            mt5AccountId: account.id,
            runnerId: bound.runner_id,
            executionGeneration: Number(bound.execution_generation || 1),
            reloadRequested: Boolean(bound.runner_id)
          })
        ]
      );
    }
    return {
      ok: true,
      recoveryRequested: Boolean(bound),
      firstConnectPrimeArmed: false,
      symbolDiscoveryPending: Boolean(bound)
    };
  }

  @Post("start")
  async start(@Req() req: any, @Query("slotId") slotId = "") {
    let instance: any = null;
    try {
      await this.maintenance.assertStartAllowed();
      instance = await this.getInstance(req.user.sub, slotId || null);

    const activeMigration = await this.db.one(
      `SELECT id,state
       FROM runtime_migrations
       WHERE bot_instance_id=$1
         AND state NOT IN ('COMPLETED','FAILED','CANCELLED')
       ORDER BY created_at DESC
       LIMIT 1`,
      [instance.id]
    );
    if (activeMigration) {
      const reconciled = await this.migrations.reconcile(
        req.user.sub,
        String(activeMigration.id),
        String(req.user?.code || req.user?.user_code || req.user?.sub || "USER").slice(0, 160)
      );
      const migrationState = String(reconciled?.state || activeMigration.state || "").toUpperCase();
      if (!["COMPLETED", "FAILED", "CANCELLED"].includes(migrationState)) {
        throw new ConflictException(
          "การย้ายระบบ Local/Cloud ยังไม่ยืนยันว่าเสร็จสมบูรณ์ (สถานะ " +
          migrationState +
          ") กรุณารอให้ระบบยืนยันปลายทางพร้อมก่อนเริ่มบอท"
        );
      }
    }

    if (!instance.mt5_account_id) throw new ConflictException("เชื่อมบัญชี MT5 ก่อนเริ่มบอท");
    const unresolvedCloseAll = await this.db.one(
      "SELECT id FROM bot_commands WHERE bot_instance_id=$1 AND command='CLOSE_ALL' AND status IN ('PENDING','DELIVERED') ORDER BY id DESC LIMIT 1",
      [instance.id]
    );
    if (unresolvedCloseAll) {
      throw new ConflictException("ยังมีคำสั่ง Close All รอ EA ยืนยัน กรุณารอให้ Position เป็น 0 ก่อนเริ่มบอท");
    }
    const livePositions = Math.max(
      0,
      Number(instance.metrics?.accountScenovaPositions ?? instance.metrics?.positions ?? 0)
    );
    const livePendingOrders = Math.max(
      0,
      Number(instance.metrics?.accountScenovaPendingOrders ?? 0)
    );
    if (
      (livePositions > 0 || livePendingOrders > 0) &&
      (
        String(instance.desired_state || "") === "SAFE_STOP" ||
        String(instance.actual_state || "") === "SAFE_STOP"
      )
    ) {
      throw new ConflictException(
        "Safe Stop/Force Flat กำลังทำงานอยู่ กรุณารอให้ Position และ Pending Order ของ SCENOVA เป็น 0 และสถานะเป็น STOPPED ก่อนเริ่มบอทอีกครั้ง"
      );
    }
    const access: any = await this.entitlement(
      req.user.sub,
      instance.mt5_account_id,
      instance.mode,
      instance.slot_id
    );
    if (!access.allowed) {
      if (access.source === "PRIMARY_SUBSCRIPTION_EXPIRED" || access.source === "PRIMARY_SUBSCRIPTION_REQUIRED") {
        throw new ConflictException("แพ็กเกจ VPS หลัก (Slot #1) หมดอายุหรือยังไม่เปิดใช้งาน กรุณาต่ออายุแพ็กเกจหลักก่อนเริ่มบอท");
      }
      if (access.source === "SUBSCRIPTION_EXPIRED") {
        throw new ConflictException("สมาชิก Slot นี้หมดอายุแล้ว กรุณาต่ออายุ Slot ก่อนเริ่มบอท");
      }
      if (access.source === "TRIAL_EXPIRED") {
        throw new ConflictException("Trial หมดอายุแล้ว กรุณาติดต่อผู้ดูแลเพื่อขอสิทธิ์ใช้งาน");
      }
      if (access.source === "GROUP_DISABLED") {
        throw new ConflictException(
          "สิทธิ์กลุ่ม " + String(access.groupName || "นี้") + " ถูกปิดชั่วคราว กรุณาติดต่อผู้ดูแล"
        );
      }
      throw new ConflictException("ยังไม่มี Trial หรือสมาชิกที่ใช้งานได้กับบัญชีนี้");
    }

    const startSettingsRow = await this.db.one(
      "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
      [instance.id]
    );
    const startSettings = startSettingsRow?.settings || {};
    await this.tradingModes.assertEnabled(canonicalTradingMode(startSettings));
    if (startSettings.firstConnectPrimePending === true) {
      if (instance.mode === "CLOUD") {
        const primeRuntimeCompatible =
          this.supportedEaRuntime(instance.metrics?.eaVersion) &&
          String(instance.metrics?.runtimeContract || "") === EA_RUNTIME_CONTRACT;
        const workerControl = await this.db.one(
          `SELECT EXISTS (
             SELECT 1
             FROM worker_nodes wn
             WHERE wn.runner_id=$1
               AND wn.last_seen_at > now() - interval '30 seconds'
               AND EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(
                   COALESCE((wn.telemetry->'instances')::jsonb, '[]'::jsonb)
                 ) AS control_instance
                 WHERE control_instance->>'instanceId'=$2::text
                   AND control_instance->>'terminalRunning'='true'
                   AND control_instance->>'chartHasFastBasketBot'='true'
                   AND control_instance->>'presetCloudRelayEnabled'='true'
               )
           ) AS ready`,
          [instance.runner_id, instance.id]
        );
        const primeCanYieldToCustomerStart =
          primeRuntimeCompatible &&
          workerControl?.ready === true &&
          livePositions <= 0 &&
          livePendingOrders <= 0;

        if (!primeCanYieldToCustomerStart) {
          throw new ConflictException(
            "ระบบกำลังเตรียม MT5/EA ครั้งแรก กรุณารอให้ VPS ยืนยันว่า EA พร้อมควบคุมก่อนเริ่มบอท"
          );
        }

        const completedAt = new Date().toISOString();
        await this.db.query(
          `UPDATE bot_settings
           SET settings=jsonb_set(
                 jsonb_set(
                   COALESCE(settings,'{}'::jsonb),
                   '{firstConnectPrimePending}',
                   'false'::jsonb,
                   true
                 ),
                 '{firstConnectPrimeCompletedAt}',
                 to_jsonb($2::text),
                 true
               ),
               updated_at=now()
           WHERE bot_instance_id=$1`,
          [instance.id, completedAt]
        );
        await this.db.query(
          `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
           VALUES(
             $1,
             'FIRST_CONNECT_PRIME_COMPLETED_BY_CUSTOMER_START',
             'bot_instance',
             $2,
             jsonb_build_object(
               'completedAt',$3::text,
               'eaVersion',$4::text,
               'runtimeContract',$5::text,
               'workerControlReady',true,
               'noEntry',true
             )
           )`,
          [
            String(req.user?.code || req.user?.sub || "USER").slice(0,160),
            instance.id,
            completedAt,
            String(instance.metrics?.eaVersion || ""),
            String(instance.metrics?.runtimeContract || "")
          ]
        );
        startSettings.firstConnectPrimePending = false;
        startSettings.firstConnectPrimeCompletedAt = completedAt;
      } else {
        throw new ConflictException(
          "ระบบกำลัง Start/Stop ครั้งแรกเพื่อเตรียมการเชื่อมต่อ กรุณารอให้สถานะพร้อมใช้งานก่อน"
        );
      }
    }
    const currentAccountCurrency = String(instance.metrics?.currency || "").trim().toUpperCase();
    const settingsAccountCurrency = String(startSettings.accountCurrency || "").trim().toUpperCase();
    const implicitCurrencyReviewRequired =
      Boolean(currentAccountCurrency) &&
      (
        (Boolean(settingsAccountCurrency) && currentAccountCurrency !== settingsAccountCurrency) ||
        (!settingsAccountCurrency && currentAccountCurrency !== "USD")
      );
    if (
      startSettings.accountCurrencyReviewRequired === true ||
      implicitCurrencyReviewRequired
    ) {
      throw new ConflictException(
        "สกุลเงินของบัญชี MT5 ยังไม่ได้ยืนยันกับค่าตั้งบอท กรุณาตรวจ Profit/Loss/Target ทุกโหมดแล้วกดบันทึกการตั้งค่าก่อนเริ่มบอท"
      );
    }

    if (instance.mode === "LOCAL") {
      const softwareUpdate = this.installerUpdateState(instance, instance.mode);
      if (softwareUpdate.required) {
        throw new ConflictException(
          "ยังเริ่มบอทไม่ได้: " +
          (softwareUpdate.reason || "เวอร์ชัน SCENOVA / EA ยังไม่ตรงกับ Server") +
          " · ต้องอัปเดตให้ Agent, EA Version, Runtime และ EX5 Hash ตรงกันก่อน"
        );
      }

      if (!instance.mt5_online) {
        throw new ConflictException("MT5/EA ยังไม่เชื่อมต่อ กรุณาเปิด MT5 และให้ EA ส่ง Heartbeat ก่อนเริ่มบอท");
      }

      const metrics = instance.metrics || {};
      if (metrics.dailyProfitLocked === true) {
        throw new ConflictException("วันนี้บอทถึงเป้ากำไรที่ตั้งไว้แล้ว ระบบล็อกหยุดจนกว่าจะขึ้นวันใหม่");
      }
      if (metrics.terminalConnected === false) {
        throw new ConflictException("MT5 ยังไม่เชื่อมกับ Broker/Server");
      }
      if (metrics.terminalTradeAllowed === false) {
        throw new ConflictException("Algo Trading ปิดอยู่ กรุณาเปิด Algo Trading ใน MT5 ก่อนเริ่มบอท");
      }
      if (metrics.mqlTradeAllowed === false) {
        throw new ConflictException("EA ยังไม่พร้อมส่งคำสั่ง ระบบกำลังซ่อม Allow Live Trading อัตโนมัติ กรุณารอ Heartbeat ถัดไป");
      }
      if (metrics.accountTradeAllowed === false) {
        throw new ConflictException(
          "บัญชี MT5 เชื่อมต่อแล้ว แต่ยังส่งคำสั่งซื้อขายไม่ได้ · ตรวจว่าใช้ Trading Password ไม่ใช่ Investor Password และตรวจสถานะ Read-only / การจำกัดสิทธิ์กับ Broker"
        );
      }
      if (metrics.accountTradeExpert === false) {
        throw new ConflictException(
          "บัญชี MT5 เชื่อมต่อแล้ว แต่ยังไม่อนุญาต Expert Advisor · ตรวจสิทธิ์ EA/Algo Trading ของบัญชีกับ Broker"
        );
      }

      // ZERO GRID may start only after a fresh heartbeat proves that the loaded
      // EA has actually applied the saved per-side count. The first heartbeat
      // after Save receives the new settings; the next one confirms they are live.
      const settingRow = await this.db.one(
        "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
        [instance.id]
      );
      const savedSettings = settingRow?.settings || {};
      const savedControlMode = String(
        savedSettings.controlMode || savedSettings.engineMode || "AUTO"
      ).toUpperCase();
      const symbolResolutionMode = String(savedSettings.symbolResolutionMode || "").toUpperCase();
      const confirmedStartupSymbol = String(savedSettings.startupSymbol || "").trim();
      if (
        String(instance.mode || "").toUpperCase() === "CLOUD" &&
        (symbolResolutionMode !== "EXACT" || !confirmedStartupSymbol)
      ) {
        throw new ConflictException(
          "ยังเริ่มบอทไม่ได้ · กรุณารอ VPS ตรวจ Symbol XAU จากบัญชี MT5 แล้วเลือก Symbol ที่ต้องการก่อน"
        );
      }
      const savedTradingSymbol = String(
        savedSettings.startupSymbol ||
        metrics.symbol ||
        savedSettings.symbol ||
        ""
      ).trim();
      if (
        savedControlMode === "ZERO_GRID" &&
        isBitcoinTradingSymbol(savedTradingSymbol)
      ) {
        throw new ConflictException(
          "BTC/XBT รองรับ AUTO, RACE, COUNTER, FLIP LOCK และ MANUAL เท่านั้น · ZERO GRID ถูกบล็อกสำหรับ BTC"
        );
      }
      if (savedControlMode === "ZERO_GRID") {
        const requestedRaw = Number(savedSettings.zeroGridLevelsPerSide ?? 3);
        const requestedLevels = Math.max(
          1,
          Math.min(
            ZERO_GRID_MAX_LEVELS_PER_SIDE,
            Math.trunc(Number.isFinite(requestedRaw) ? requestedRaw : 3)
          )
        );
        const requestedFirstGap = [2, 3].includes(Number(savedSettings.zeroGridFirstGapPrice ?? 3))
          ? Number(savedSettings.zeroGridFirstGapPrice ?? 3) : 3;
        const requestedStep = [0.5, 1, 2, 3, 4].includes(Number(savedSettings.zeroGridStepPrice ?? 3))
          ? Number(savedSettings.zeroGridStepPrice ?? 3) : 3;
        const requestedBaseLotRaw = Number(savedSettings.zeroGridBaseLot ?? 0.03);
        const requestedBaseLot = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09].includes(requestedBaseLotRaw) ? requestedBaseLotRaw : 0.03;
        const appliedLevels = Number(metrics.zeroGridConfiguredLevelsPerSide);
        const appliedBaseLot = Number(metrics.zeroGridConfiguredBaseLot);
        const appliedFirstGap = Number(metrics.zeroGridConfiguredFirstGapPrice);
        const appliedStep = Number(metrics.zeroGridConfiguredStepPrice);
        const appliedMax = Number(metrics.zeroGridMaxLevelsPerSide);
        const appliedMode = String(metrics.controlMode || "").toUpperCase();
        if (
          appliedMode !== "ZERO_GRID" ||
          !Number.isInteger(appliedLevels) ||
          appliedLevels !== requestedLevels ||
          !Number.isFinite(appliedBaseLot) ||
          Math.abs(appliedBaseLot - requestedBaseLot) > 0.000001 ||
          !Number.isFinite(appliedFirstGap) ||
          Math.abs(appliedFirstGap - requestedFirstGap) > 0.000001 ||
          !Number.isFinite(appliedStep) ||
          Math.abs(appliedStep - requestedStep) > 0.000001 ||
          appliedMax !== ZERO_GRID_MAX_LEVELS_PER_SIDE
        ) {
          throw new ConflictException(
            "ZERO GRID ยังไม่พร้อมเริ่ม: ตั้งไว้ " + requestedLevels +
            " Pending ต่อฝั่ง · คู่แรก " + requestedFirstGap.toFixed(2) +
            " · Grid " + requestedStep.toFixed(2) +
            " · Base Lot " + requestedBaseLot.toFixed(2) +
            " แต่ EA ที่กำลังรันยังไม่ยืนยันค่าชุดนี้ · กรุณารอ Heartbeat ถัดไป 5–10 วินาที แล้วกดเริ่มอีกครั้ง"
          );
        }
      }

      const runningEaVersion = String(instance.metrics?.eaVersion || "");
      if (!this.supportedEaRuntime(runningEaVersion)) {
        throw new ConflictException("FastBasketBot ที่กำลังรันเก่าเกินไป กรุณาติดตั้ง/อัปเดตจากเว็บไซต์ SCENOVA แล้วเปิด MT5 ใหม่");
      }
    }

    if (access.source === "TRIAL_READY") {
      await this.db.query(
        "UPDATE trial_grants SET status='ACTIVE',started_at=now(),expires_at=now() + (duration_minutes || ' minutes')::interval WHERE id=$1 AND status='APPROVED'",
        [access.trialId]
      );
    }
    // A second check narrows the time-of-check gap before writing RUNNING.
    await this.tradingModes.assertEnabled(canonicalTradingMode(startSettings));
    await this.tradingModes.requestStart(instance.id, canonicalTradingMode(startSettings));
      this.logger.log(JSON.stringify({
        event: "BOT_START_ACCEPTED",
        userId: req.user?.sub || null,
        slotId: slotId || instance?.slot_id || null,
        instanceId: instance?.id || null,
        mode: instance?.mode || null,
        runnerId: instance?.runner_id || null,
        desiredStateBefore: instance?.desired_state || null,
        actualStateBefore: instance?.actual_state || null,
        eaLastSeenAt: instance?.last_seen_at || null,
        heartbeatHttpStatus: instance?.metrics?.heartbeatHttpStatus ?? null,
        heartbeatLatencyMs: instance?.metrics?.heartbeatLatencyMs ?? null,
        terminalConnected: instance?.metrics?.terminalConnected ?? null,
        accessSource: access?.source || null
      }));
      return { ok: true, state: "RUNNING" };
    } catch (error: any) {
      const lastSeenAt = instance?.last_seen_at ? new Date(instance.last_seen_at).getTime() : NaN;
      const eaLastSeenAgeMs = Number.isFinite(lastSeenAt)
        ? Math.max(0, Date.now() - lastSeenAt)
        : null;
      this.logger.error(
        JSON.stringify({
          event: "BOT_START_FAILED",
          userId: req.user?.sub || null,
          slotId: slotId || instance?.slot_id || null,
          instanceId: instance?.id || null,
          mode: instance?.mode || null,
          runnerId: instance?.runner_id || null,
          desiredState: instance?.desired_state || null,
          actualState: instance?.actual_state || null,
          eaLastSeenAt: instance?.last_seen_at || null,
          eaLastSeenAgeMs,
          heartbeatHttpStatus: instance?.metrics?.heartbeatHttpStatus ?? null,
          heartbeatLatencyMs: instance?.metrics?.heartbeatLatencyMs ?? null,
          terminalConnected: instance?.metrics?.terminalConnected ?? null,
          errorName: error?.name || null,
          errorMessage: error?.message || String(error),
          errorCode: error?.code || null,
          errorConstraint: error?.constraint || null
        }),
        error instanceof Error ? error.stack : undefined
      );
      const mappedConflict = this.mapStartDatabaseConflict(error);
      if (mappedConflict) throw mappedConflict;
      throw error;
    }
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
    const currentSettingsRow = await this.db.one(
      "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
      [instance.id]
    );
    const currentSettings = currentSettingsRow?.settings || {};
    const currentMetrics =
      instance.metrics && typeof instance.metrics === "object"
        ? instance.metrics
        : {};
    const effectiveTradingSymbol = String(
      currentSettings.startupSymbol ||
      body.symbol ||
      currentMetrics.symbol ||
      currentSettings.symbol ||
      ""
    ).trim();
    const bitcoinTradingSymbol = isBitcoinTradingSymbol(effectiveTradingSymbol);

    // Keep strategy/risk settings immutable while Start is pending or the EA is
    // RUNNING. Daily Profit Target is the one intentional live exception: the
    // runtime contract already supports raising/disabling this target to release
    // a DAILY_PROFIT_LOCK, and integration cleanup also restores it while RUNNING.
    // Restrict the exception to this single key so callers cannot smuggle other
    // settings through the live-update path.
    const requestedSettingKeys = Object.keys(body).filter(
      (key) => body[key] !== undefined
    );
    const isLiveDailyProfitTargetEdit =
      requestedSettingKeys.length === 1 &&
      requestedSettingKeys[0] === "dailyProfitTargetMoney";

    if (
      (instance.desired_state === "RUNNING" || instance.actual_state === "RUNNING") &&
      !isLiveDailyProfitTargetEdit
    ) {
      throw new ConflictException(
        "การตั้งค่าถูกล็อกขณะบอทกำลังเริ่มหรือกำลังทำงาน · กดหยุดบอทและรอให้สถานะหยุดก่อนแก้ไข"
      );
    }
    const moneyReviewKeys = [
      "autoMaxBasketLossMoney",
      "autoDailyLossMoney",
      "autoDailyProfitTargetMoney",
      "raceMaxBasketLossMoney",
      "raceDailyLossMoney",
      "raceDailyProfitTargetMoney",
      "flipLockMaxBasketLossMoney",
      "flipLockDailyLossMoney",
      "flipLockDailyProfitTargetMoney",
      "manualMaxBasketLossMoney",
      "manualDailyLossMoney",
      "manualDailyProfitTargetMoney",
      "autoProfitTargetMoney",
      "raceCloseAllProfitMoney",
      "racePerPositionProfitMoney",
      "manualBasketProfitTargetMoney",
      "manualPerPositionProfitMoney",
      "zeroGridMinNetProfitMoney"
    ];
    const storedSettingsCurrency = String(
      currentSettings.accountCurrency || ""
    ).trim().toUpperCase();
    const liveSettingsCurrency = String(
      currentMetrics.currency || ""
    ).trim().toUpperCase();
    const implicitCurrencyReviewRequired =
      Boolean(liveSettingsCurrency) &&
      (
        (Boolean(storedSettingsCurrency) && liveSettingsCurrency !== storedSettingsCurrency) ||
        (!storedSettingsCurrency && liveSettingsCurrency !== "USD")
      );
    const currencyReviewRequired =
      currentSettings.accountCurrencyReviewRequired === true ||
      implicitCurrencyReviewRequired;
    const currencyReviewComplete =
      !currencyReviewRequired ||
      moneyReviewKeys.every((key) => body[key] !== undefined);
    if (currencyReviewRequired && !currencyReviewComplete) {
      throw new ConflictException(
        "สกุลเงินบัญชี MT5 เปลี่ยน กรุณาเปิดหน้าตั้งค่าบอท ตรวจค่าเงินทุกโหมด แล้วกดบันทึกจากหน้า Settings"
      );
    }

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

    const booleanSetting = (key: string) => {
      if (body[key] === undefined) return;
      if (typeof body[key] !== "boolean") {
        throw new BadRequestException(key + " ต้องเป็น true หรือ false");
      }
      clean[key] = body[key];
    };

    const normalizeCounterTotalPositions = (value: unknown) => {
      const parsed = Math.trunc(Number(value));
      if (!Number.isFinite(parsed)) return 10;
      const stepped = Math.floor(parsed / 10) * 10;
      return Math.max(10, Math.min(200, stepped));
    };
    const legacyCounterPerSideToTotal = (value: unknown) => {
      const perSide = Math.max(1, Math.min(100, Math.trunc(Number(value) || 1)));
      return normalizeCounterTotalPositions(perSide * 2);
    };
    const counterTotalForSettings = (
      value: unknown,
      sizingVersion: unknown
    ) => Number(sizingVersion) >= 2
      ? normalizeCounterTotalPositions(value)
      : legacyCounterPerSideToTotal(value);

    if (body.symbol !== undefined) {
      const symbol = String(body.symbol || "").trim();
      if (!symbol || symbol.length > 64 || !/^[A-Za-z0-9._#-]+$/.test(symbol)) {
        throw new BadRequestException("Symbol ไม่ถูกต้อง");
      }
      clean.symbol = symbol;
    }

    numberSetting("lot", 0.01, 100);
    numberSetting("maxPositions", 1, 100, true);
    // UI mode profiles remember sizing independently while the EA continues
    // to consume the canonical lot/maxPositions pair for the active mode.
    numberSetting("autoLot", 0.01, 100);
    numberSetting("autoMaxPositions", 1, 100, true);
    numberSetting("raceLot", 0.01, 100);
    numberSetting("raceMaxPositions", 1, 100, true);
    numberSetting("counterLot", 0.01, 100);
    if (body.counterSizingVersion !== undefined && Number(body.counterSizingVersion) !== 2) {
      throw new BadRequestException("counterSizingVersion ไม่ถูกต้อง");
    }
    if (body.counterMaxPositions !== undefined) {
      const rawCounterMax = Number(body.counterMaxPositions);
      if (!Number.isFinite(rawCounterMax) || !Number.isInteger(rawCounterMax)) {
        throw new BadRequestException("counterMaxPositions ต้องเป็นจำนวนเต็ม");
      }
      const incomingCounterVersion = Number(
        body.counterSizingVersion ??
        currentSettings.counterSizingVersion ??
        0
      );
      if (incomingCounterVersion >= 2) {
        if (rawCounterMax < 10 || rawCounterMax > 200 || rawCounterMax % 10 !== 0) {
          throw new BadRequestException("จำนวนไม้รวม COUNTER ต้องเป็น 10, 20, 30 ... ถึง 200");
        }
        clean.counterMaxPositions = rawCounterMax;
      } else {
        if (rawCounterMax < 1 || rawCounterMax > 100) {
          throw new BadRequestException("counterMaxPositions เดิมไม่อยู่ในช่วงที่อนุญาต");
        }
        // Legacy clients sent a per-side cap. Convert it to the V2 total-slot
        // profile so the same exposure is preserved (or rounded down safely).
        clean.counterMaxPositions = legacyCounterPerSideToTotal(rawCounterMax);
      }
      clean.counterSizingVersion = 2;
    } else if (body.counterSizingVersion !== undefined) {
      clean.counterSizingVersion = 2;
    }
    numberSetting("flipLockLot", 0.01, 100);
    numberSetting("manualLot", 0.01, 100);
    numberSetting("manualMaxPositions", 1, 100, true);
    // Risk controls are remembered independently by control mode. The legacy
    // standard* keys remain accepted only as migration fallbacks.
    const maxAccountMoney = 100_000_000;
    numberSetting("standardMaxBasketLossMoney", 0, maxAccountMoney);
    numberSetting("standardDailyLossMoney", 0, maxAccountMoney);
    numberSetting("standardDailyProfitTargetMoney", 0, maxAccountMoney);
    numberSetting("autoMaxBasketLossMoney", 0, maxAccountMoney);
    numberSetting("autoDailyLossMoney", 0, maxAccountMoney);
    numberSetting("autoDailyProfitTargetMoney", 0, maxAccountMoney);
    numberSetting("raceMaxBasketLossMoney", 0, maxAccountMoney);
    numberSetting("raceDailyLossMoney", 0, maxAccountMoney);
    numberSetting("raceDailyProfitTargetMoney", 0, maxAccountMoney);
    numberSetting("flipLockMaxBasketLossMoney", 0, maxAccountMoney);
    numberSetting("flipLockDailyLossMoney", 0, maxAccountMoney);
    numberSetting("flipLockDailyProfitTargetMoney", 0, maxAccountMoney);
    numberSetting("manualMaxBasketLossMoney", 0, maxAccountMoney);
    numberSetting("manualDailyLossMoney", 0, maxAccountMoney);
    numberSetting("manualDailyProfitTargetMoney", 0, maxAccountMoney);
    numberSetting("basketTriggerMoney", 0, maxAccountMoney);
    numberSetting("basketTrailMoney", 0, maxAccountMoney);
    numberSetting("maxBasketLossMoney", 0, maxAccountMoney);
    numberSetting("dailyLossMoney", 0, maxAccountMoney);
    numberSetting("dailyProfitTargetMoney", 0, maxAccountMoney);
    booleanSetting("dailyProfitContinueAfterTarget");
    numberSetting("dailyProfitDrawdownPercent", 0, 95);
    // Per-mode profit profiles are persisted independently. The legacy
    // basket/per-position keys remain runtime mirrors for older EA builds.
    numberSetting("autoProfitTargetMoney", 0, maxAccountMoney);
    numberSetting("manualBasketProfitTargetMoney", 0, maxAccountMoney);
    numberSetting("manualPerPositionProfitMoney", 0, maxAccountMoney);
    numberSetting("basketProfitTargetMoney", 0, maxAccountMoney);
    numberSetting("perPositionProfitMoney", 0, maxAccountMoney);
    numberSetting("profitRunTrailPercent", 0, 95);
    if (body.profitTargetMode !== undefined) {
      const profitTargetMode = String(body.profitTargetMode || "").toUpperCase();
      if (!["AUTO", "MANUAL", "OFF"].includes(profitTargetMode)) {
        throw new BadRequestException("โหมดเป้ากำไรไม่ถูกต้อง");
      }
      clean.profitTargetMode = profitTargetMode;
    }
    // EA 1.017 replaces floating-money loss closes with a real Broker SL.
    // Keep accepting the legacy key only to let old clients clear it safely.
    numberSetting("perPositionLossMoney", 0, maxAccountMoney);
    numberSetting("manualStopLossPoints", 0, 1000000);
    if (body.perPositionLossMoney !== undefined) {
      clean.perPositionLossMoney = 0;
    }
    numberSetting("minOrderIntervalMs", 0, 60000, true);
    numberSetting("maxOrdersPerMinute", 1, 5000, true);
    if (body.zeroGridFirstGapPrice !== undefined) {
      const zeroGridFirstGapPrice = Number(body.zeroGridFirstGapPrice);
      if (![2, 3].includes(zeroGridFirstGapPrice)) {
        throw new BadRequestException("ZERO GRID ระยะคู่แรกต้องเป็น 2.00 หรือ 3.00 เท่านั้น");
      }
      clean.zeroGridFirstGapPrice = zeroGridFirstGapPrice;
    }
    if (body.zeroGridStepPrice !== undefined) {
      const zeroGridStepPrice = Number(body.zeroGridStepPrice);
      if (![0.5, 1, 2, 3, 4].includes(zeroGridStepPrice)) {
        throw new BadRequestException("ZERO GRID Step ต้องเป็น 0.50, 1.00, 2.00, 3.00 หรือ 4.00 เท่านั้น");
      }
      clean.zeroGridStepPrice = zeroGridStepPrice;
    }
    numberSetting("zeroGridLevelsPerSide", 1, 30, true);
    if (body.zeroGridBaseLot !== undefined) {
      const zeroGridBaseLot = Number(body.zeroGridBaseLot);
      if (![0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09].includes(zeroGridBaseLot)) {
        throw new BadRequestException("ZERO GRID Lot เริ่มต้นต้องเป็น 0.01 ถึง 0.09 เท่านั้น");
      }
      clean.zeroGridBaseLot = zeroGridBaseLot;
    }
    numberSetting("zeroGridMinNetProfitMoney", 0.01, maxAccountMoney);
    numberSetting("zeroGridCloseReserveMoney", 0, maxAccountMoney);
    booleanSetting("raceCloseAllProfitEnabled");
    numberSetting("raceCloseAllProfitMoney", 0.01, maxAccountMoney);
    numberSetting("racePerPositionProfitMoney", 0.01, maxAccountMoney);
    numberSetting("counterPerPositionProfitMoney", 0.01, maxAccountMoney);
    if (body.raceProfitTargetMode !== undefined) {
      const raceProfitTargetMode = String(body.raceProfitTargetMode || "").toUpperCase();
      if (!["BASKET", "POSITION", "OFF"].includes(raceProfitTargetMode)) {
        throw new BadRequestException("รูปแบบกำไร RACE ไม่ถูกต้อง");
      }
      clean.raceProfitTargetMode = raceProfitTargetMode;
    }
    booleanSetting("adaptiveEngine");
    numberSetting("riskPerOrderPercent", 0.01, 5);
    booleanSetting("allowMinimumLotOverride");
    numberSetting("hardStopAtrMultiplier", 0.5, 10);
    numberSetting("atrPeriod", 5, 100, true);
    booleanSetting("confidenceGateEnabled");
    numberSetting("confidenceThreshold", 40, 95, true);
    numberSetting("sessionStartHour", 0, 23, true);
    numberSetting("sessionEndHour", 1, 24, true);
    numberSetting("maxAtrPoints", 0, 100000);
    if (body.indicatorV6Mode !== undefined) {
      const indicatorV6Mode = String(body.indicatorV6Mode || "").toUpperCase();
      if (!["SHADOW", "SOFT_WEIGHT", "TIMING", "ADAPTIVE"].includes(indicatorV6Mode)) {
        throw new BadRequestException("Indicator V6 Mode ไม่ถูกต้อง");
      }
      clean.indicatorV6Mode = indicatorV6Mode;
    }

    const requestedBasketProfit = Number(clean.basketProfitTargetMoney ?? 0);
    const requestedPerPositionProfit = Number(clean.perPositionProfitMoney ?? 0);
    const requestedProfitRunPercent = Number(clean.profitRunTrailPercent ?? 0);
    const requestedProfitMode = String(clean.profitTargetMode || "");

    if (requestedProfitMode === "OFF") {
      clean.basketProfitTargetMoney = 0;
      clean.perPositionProfitMoney = 0;
      clean.profitRunTrailPercent = 0;
      clean.basketTriggerMoney = 0;
      clean.basketTrailMoney = 0;
    } else if (requestedProfitMode === "AUTO") {
      // AUTO may carry a hard Basket money target. Keep it; only MANUAL
      // per-position/run-on semantics are removed.
      clean.perPositionProfitMoney = 0;
      clean.profitRunTrailPercent = 0;
      clean.basketTriggerMoney = 0;
      clean.basketTrailMoney = 0;
    } else if (!requestedProfitMode &&
               (requestedBasketProfit > 0 || requestedPerPositionProfit > 0)) {
      // Older clients that edit a numeric target are treated as Manual.
      clean.profitTargetMode = "MANUAL";
    }

    if (requestedBasketProfit > 0 && requestedPerPositionProfit > 0) {
      throw new BadRequestException(
        "เลือกกำไรต่อไม้หรือกำไรรวมทั้งชุดได้อย่างใดอย่างหนึ่งเท่านั้น"
      );
    }

    // Hard-target semantics:
    // basketProfitTargetMoney = absolute Basket target for AUTO or MANUAL
    // profitRunTrailPercent = retired when a Basket target is configured
    // perPositionProfitMoney = MANUAL-only per-position target
    if (requestedPerPositionProfit > 0) {
      clean.basketProfitTargetMoney = 0;
      clean.profitRunTrailPercent = 0;
      clean.basketTriggerMoney = 0;
      clean.basketTrailMoney = 0;
    } else if (requestedBasketProfit > 0) {
      clean.perPositionProfitMoney = 0;
      clean.profitRunTrailPercent = 0;
      clean.basketTriggerMoney = 0;
      clean.basketTrailMoney = 0;
    }

    if (requestedProfitRunPercent > 0) {
      clean.perPositionProfitMoney = 0;
      clean.basketTriggerMoney = 0;
      clean.basketTrailMoney = 0;
    }

    if (
      body.basketProfitTargetMoney !== undefined &&
      requestedBasketProfit <= 0
    ) {
      clean.profitRunTrailPercent = 0;
    }

    if (clean.dailyProfitContinueAfterTarget === true) {
      const drawdown = Number(
        clean.dailyProfitDrawdownPercent ?? body.dailyProfitDrawdownPercent
      );
      if (!Number.isFinite(drawdown) || drawdown <= 0 || drawdown > 95) {
        throw new BadRequestException(
          "กรุณากำหนด % ลดลงหลังถึงเป้ากำไรต่อวัน"
        );
      }
    }

    const requestedControlMode = body.controlMode !== undefined
      ? String(body.controlMode || "").toUpperCase()
      : null;
    const requestedEngineMode = body.engineMode !== undefined
      ? String(body.engineMode || "").toUpperCase()
      : null;

    const storedControlMode = String(
      currentSettings.controlMode || currentSettings.engineMode || "AUTO"
    ).toUpperCase();
    const effectiveProfitProfileMode = requestedControlMode || (
      requestedEngineMode === "RACE" ? "RACE" :
      requestedEngineMode === "COUNTER" ? "COUNTER" :
      requestedEngineMode === "ZERO_GRID" ? "ZERO_GRID" :
      requestedEngineMode === "AUTO" ? "AUTO" :
      storedControlMode === "ASSISTED" ? "MANUAL" : storedControlMode
    );

    const storedProfitMode = String(currentSettings.profitTargetMode || "").toUpperCase();
    const storedLegacyBasket = Math.max(0, Number(currentSettings.basketProfitTargetMoney || 0));
    const storedLegacyPerPosition = Math.max(0, Number(currentSettings.perPositionProfitMoney || 0));

    // Migrate the currently-active legacy profile once, then keep every mode's
    // target independent. Old clients may still write the legacy mirror and
    // are mapped into the active profile for backward compatibility.
    const autoProfitTargetMoney = Math.max(0, Number(
      clean.autoProfitTargetMoney ??
      (effectiveProfitProfileMode === "AUTO" && body.basketProfitTargetMoney !== undefined
        ? requestedBasketProfit
        : undefined) ??
      currentSettings.autoProfitTargetMoney ??
      (storedControlMode === "AUTO" && storedProfitMode === "AUTO" ? storedLegacyBasket : 0)
    ));
    const manualBasketProfitTargetMoney = Math.max(0, Number(
      clean.manualBasketProfitTargetMoney ??
      (effectiveProfitProfileMode === "MANUAL" && body.basketProfitTargetMoney !== undefined
        ? requestedBasketProfit
        : undefined) ??
      currentSettings.manualBasketProfitTargetMoney ??
      (storedControlMode === "MANUAL" && storedProfitMode === "MANUAL"
        ? storedLegacyBasket
        : (Number(currentSettings.manualPerPositionProfitMoney || 0) > 0 ? 0 : 1))
    ));
    const manualPerPositionProfitMoney = Math.max(0, Number(
      clean.manualPerPositionProfitMoney ??
      (effectiveProfitProfileMode === "MANUAL" && body.perPositionProfitMoney !== undefined
        ? requestedPerPositionProfit
        : undefined) ??
      currentSettings.manualPerPositionProfitMoney ??
      (storedControlMode === "MANUAL" && storedProfitMode === "MANUAL" ? storedLegacyPerPosition : 0)
    ));

    if (manualBasketProfitTargetMoney > 0 && manualPerPositionProfitMoney > 0) {
      throw new BadRequestException(
        "MANUAL เลือกกำไรต่อไม้หรือกำไรรวมทั้งชุดได้อย่างใดอย่างหนึ่งเท่านั้น"
      );
    }

    clean.autoProfitTargetMoney = autoProfitTargetMoney;
    clean.manualBasketProfitTargetMoney = manualBasketProfitTargetMoney;
    clean.manualPerPositionProfitMoney = manualPerPositionProfitMoney;

    if (requestedControlMode !== null && !["AUTO", "RACE", "COUNTER", "ZERO_GRID", "FLIP_LOCK", "ASSISTED", "MANUAL"].includes(requestedControlMode)) {
      throw new BadRequestException("Control Mode ไม่ถูกต้อง");
    }
    if (requestedEngineMode !== null && !["AUTO", "RACE", "COUNTER", "ZERO_GRID"].includes(requestedEngineMode)) {
      throw new BadRequestException("Engine Mode ไม่ถูกต้อง");
    }

    // Canonical DB pair: never persist a stale ZERO/RACE/COUNTER engine next to another mode.
    if (requestedControlMode !== null) {
      clean.controlMode = requestedControlMode;
      clean.engineMode = requestedControlMode === "ZERO_GRID"
        ? "ZERO_GRID"
        : requestedControlMode === "RACE"
          ? "RACE"
          : requestedControlMode === "COUNTER"
            ? "COUNTER"
            : "AUTO";
    } else if (requestedEngineMode !== null) {
      clean.engineMode = requestedEngineMode;
      clean.controlMode = requestedEngineMode === "ZERO_GRID"
        ? "ZERO_GRID"
        : requestedEngineMode === "RACE"
          ? "RACE"
          : requestedEngineMode === "COUNTER"
            ? "COUNTER"
            : "AUTO";
    }

    const switchingToMode = canonicalTradingMode({
      controlMode: requestedControlMode ?? (
        requestedEngineMode === null ? storedControlMode : requestedEngineMode
      )
    });
    if (switchingToMode !== canonicalTradingMode({controlMode:storedControlMode})) {
      await this.tradingModes.assertEnabled(switchingToMode);
    }

    const activeProfileMode = requestedControlMode || (
      requestedEngineMode === "RACE" ? "RACE" :
      requestedEngineMode === "COUNTER" ? "COUNTER" :
      requestedEngineMode === "ZERO_GRID" ? "ZERO_GRID" :
      requestedEngineMode === "AUTO" ? "AUTO" : null
    );
    const storedNumber = (primary: string, legacy: string, fallback = 0) => {
      const value = clean[primary] ??
        currentSettings[primary] ??
        currentSettings[legacy] ??
        fallback;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    if (activeProfileMode === "AUTO") {
      clean.lot = storedNumber("autoLot", "lot", 0.01);
      clean.maxPositions = Math.max(1, Math.trunc(storedNumber("autoMaxPositions", "maxPositions", 3)));
      clean.maxBasketLossMoney = storedNumber("autoMaxBasketLossMoney", "standardMaxBasketLossMoney",
        Number(currentSettings.maxBasketLossMoney || 0));
      clean.dailyLossMoney = storedNumber("autoDailyLossMoney", "standardDailyLossMoney",
        Number(currentSettings.dailyLossMoney || 0));
      clean.dailyProfitTargetMoney = storedNumber("autoDailyProfitTargetMoney", "standardDailyProfitTargetMoney",
        Number(currentSettings.dailyProfitTargetMoney || 0));
    } else if (activeProfileMode === "RACE") {
      clean.lot = storedNumber("raceLot", "lot", 0.01);
      clean.maxPositions = Math.max(1, Math.trunc(storedNumber("raceMaxPositions", "maxPositions", 5)));
      clean.maxBasketLossMoney = storedNumber("raceMaxBasketLossMoney", "standardMaxBasketLossMoney",
        Number(currentSettings.maxBasketLossMoney || 0));
      clean.dailyLossMoney = storedNumber("raceDailyLossMoney", "standardDailyLossMoney",
        Number(currentSettings.dailyLossMoney || 0));
      clean.dailyProfitTargetMoney = storedNumber("raceDailyProfitTargetMoney", "standardDailyProfitTargetMoney",
        Number(currentSettings.dailyProfitTargetMoney || 0));
      // RACE owns ATR Stop only. The saved MANUAL points profile is preserved
      // but is ignored by the isolated RACE engine.
    } else if (activeProfileMode === "COUNTER") {
      clean.lot = storedNumber("counterLot", "lot", 0.01);
      const counterStoredValue =
        clean.counterMaxPositions ??
        currentSettings.counterMaxPositions ??
        currentSettings.maxPositions ??
        10;
      const counterStoredVersion =
        clean.counterSizingVersion ??
        currentSettings.counterSizingVersion ??
        0;
      const counterTotalPositions = counterTotalForSettings(
        counterStoredValue,
        counterStoredVersion
      );
      clean.counterMaxPositions = counterTotalPositions;
      clean.counterSizingVersion = 2;
      // The existing EA owns independent BUY/SELL capacity through canonical
      // maxPositions. Keep that runtime contract and send exactly half of the
      // customer-facing total: 10 total -> 5 BUY + 5 SELL, ... 200 -> 100+100.
      clean.maxPositions = counterTotalPositions / 2;
      // COUNTER has no basket/daily risk controls. Runtime exits are per-position profit only.
      clean.maxBasketLossMoney = 0;
      clean.dailyLossMoney = 0;
      clean.dailyProfitTargetMoney = 0;
      clean.dailyProfitContinueAfterTarget = false;
      clean.dailyProfitDrawdownPercent = 0;
    } else if (activeProfileMode === "FLIP_LOCK") {
      clean.lot = storedNumber("flipLockLot", "lot", 0.01);
      clean.maxPositions = 1;
      clean.maxBasketLossMoney = storedNumber("flipLockMaxBasketLossMoney", "standardMaxBasketLossMoney",
        Number(currentSettings.maxBasketLossMoney || 0));
      clean.dailyLossMoney = storedNumber("flipLockDailyLossMoney", "standardDailyLossMoney",
        Number(currentSettings.dailyLossMoney || 0));
      clean.dailyProfitTargetMoney = storedNumber("flipLockDailyProfitTargetMoney", "standardDailyProfitTargetMoney",
        Number(currentSettings.dailyProfitTargetMoney || 0));
    } else if (activeProfileMode === "MANUAL") {
      clean.lot = storedNumber("manualLot", "lot", 0.01);
      clean.maxPositions = Math.max(1, Math.trunc(storedNumber("manualMaxPositions", "maxPositions", 1)));
      clean.maxBasketLossMoney = storedNumber("manualMaxBasketLossMoney", "maxBasketLossMoney", 0);
      clean.dailyLossMoney = storedNumber("manualDailyLossMoney", "dailyLossMoney", 0);
      clean.dailyProfitTargetMoney = storedNumber("manualDailyProfitTargetMoney", "dailyProfitTargetMoney", 0);
    }

    const zeroGridSelected =
      requestedControlMode === "ZERO_GRID" ||
      (requestedControlMode === null && requestedEngineMode === "ZERO_GRID");
    if (zeroGridSelected && bitcoinTradingSymbol) {
      throw new BadRequestException(
        "ZERO GRID ไม่รองรับ BTC/XBT · ใช้ AUTO, RACE, COUNTER, FLIP LOCK หรือ MANUAL"
      );
    }
    if (zeroGridSelected) {
      const zeroGridFirstGapPrice = Number(clean.zeroGridFirstGapPrice ?? currentSettings.zeroGridFirstGapPrice ?? 3);
      clean.zeroGridFirstGapPrice = [2, 3].includes(zeroGridFirstGapPrice) ? zeroGridFirstGapPrice : 3;
      const zeroGridStepPrice = Number(clean.zeroGridStepPrice ?? currentSettings.zeroGridStepPrice ?? 3);
      clean.zeroGridStepPrice = [0.5, 1, 2, 3, 4].includes(zeroGridStepPrice) ? zeroGridStepPrice : 3;
      const zeroGridBaseLot = Number(clean.zeroGridBaseLot);
      clean.zeroGridBaseLot = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09].includes(zeroGridBaseLot) ? zeroGridBaseLot : 0.03;
      if (body.zeroGridMinNetProfitMoney === undefined) clean.zeroGridMinNetProfitMoney = 1;
      // ZERO closes exactly at zeroGridMinNetProfitMoney. Keep legacy reserve
      // field normalized to zero so old clients cannot add a hidden buffer.
      clean.zeroGridCloseReserveMoney = 0;
    }

    const raceSelected =
      requestedControlMode === "RACE" ||
      (requestedControlMode === null && requestedEngineMode === "RACE");
    if (raceSelected) {
      const storedRaceMode = String(
        clean.raceProfitTargetMode ??
        currentSettings.raceProfitTargetMode ??
        ""
      ).toUpperCase();
      const legacyRaceCloseAll =
        body.raceCloseAllProfitEnabled ??
        currentSettings.raceCloseAllProfitEnabled;
      let raceMode = ["BASKET", "POSITION", "OFF"].includes(storedRaceMode)
        ? storedRaceMode
        : (legacyRaceCloseAll === true
            ? "BASKET"
            : legacyRaceCloseAll === false
              ? "OFF"
              : "POSITION");
      if (body.raceProfitTargetMode !== undefined) {
        raceMode = String(body.raceProfitTargetMode).toUpperCase();
      } else if (body.raceCloseAllProfitEnabled !== undefined) {
        raceMode = body.raceCloseAllProfitEnabled ? "BASKET" : "OFF";
      }
      clean.raceProfitTargetMode = raceMode;
      clean.raceCloseAllProfitEnabled = raceMode === "BASKET";
      if (body.raceCloseAllProfitMoney === undefined &&
          currentSettings.raceCloseAllProfitMoney === undefined)
        clean.raceCloseAllProfitMoney = 1;
      if (body.racePerPositionProfitMoney === undefined &&
          currentSettings.racePerPositionProfitMoney === undefined)
        clean.racePerPositionProfitMoney = 1;
    }

    const counterSelected =
      requestedControlMode === "COUNTER" ||
      (requestedControlMode === null && requestedEngineMode === "COUNTER");
    if (counterSelected &&
        body.counterPerPositionProfitMoney === undefined &&
        currentSettings.counterPerPositionProfitMoney === undefined) {
      clean.counterPerPositionProfitMoney = 1;
    }

    const autoSelected = effectiveProfitProfileMode === "AUTO";
    if (autoSelected) {
      // Runtime mirror: AUTO reads only its own persisted target.
      clean.profitTargetMode = "AUTO";
      clean.basketProfitTargetMoney = autoProfitTargetMoney;
      clean.perPositionProfitMoney = 0;
      clean.profitRunTrailPercent = 0;
      // Profit-profile synchronization must not mutate the saved MANUAL stop
      // profile. AUTO ignores that profile inside the EA.
    }

    const manualSelected =
      effectiveProfitProfileMode === "MANUAL" ||
      effectiveProfitProfileMode === "ASSISTED";
    if (manualSelected) {
      // Runtime mirror: MANUAL reads only the MANUAL profile.
      clean.profitTargetMode = "MANUAL";
      clean.basketProfitTargetMoney = manualBasketProfitTargetMoney;
      clean.perPositionProfitMoney = manualPerPositionProfitMoney;
      clean.profitRunTrailPercent = 0;
    }

    // RACE, COUNTER and ZERO GRID own dedicated exit contracts. Clear the generic
    // mirror so a target from AUTO/MANUAL can never leak into those engines.
    if (effectiveProfitProfileMode === "RACE" ||
        effectiveProfitProfileMode === "COUNTER" ||
        effectiveProfitProfileMode === "ZERO_GRID" ||
        effectiveProfitProfileMode === "FLIP_LOCK") {
      clean.profitTargetMode = "OFF";
      clean.basketProfitTargetMoney = 0;
      clean.perPositionProfitMoney = 0;
      clean.profitRunTrailPercent = 0;
    }

    const flipLockSelected = requestedControlMode === "FLIP_LOCK";
    if (flipLockSelected) {
      // Canonical FLIP LOCK contract. Persist only values that the isolated
      // baton engine actually uses so the dashboard cannot display stale AUTO
      // exit controls as if they were active.
      clean.maxPositions = 1;
      clean.profitTargetMode = "OFF";
      clean.basketProfitTargetMoney = 0;
      clean.perPositionProfitMoney = 0;
      clean.profitRunTrailPercent = 0;
      clean.dailyProfitContinueAfterTarget = false;
      clean.dailyProfitDrawdownPercent = 0;
    }

    if (body.entryMode !== undefined) {
      const entryMode = String(body.entryMode || "");
      if (!["AUTO_MOMENTUM", "BUY_ONLY", "SELL_ONLY"].includes(entryMode)) {
        throw new BadRequestException("Entry Mode ไม่ถูกต้อง");
      }
      // Direction is user-selectable in every control mode.
      // AUTO_MOMENTUM lets the EA choose; BUY_ONLY / SELL_ONLY pin the side.
      clean.entryMode = entryMode;
    }

    // One Adaptive engine for every account. Ignore legacy profile values from
    // older clients and keep the execution brain deterministic.
    clean.adaptiveEngine = true;
    clean.minOrderIntervalMs = 300;
    clean.maxOrdersPerMinute = 120;
    clean.riskPerOrderPercent = 0.25;
    clean.hardStopAtrMultiplier = 2;
    // Setup-First v2 is the default. Confidence starts OFF in the EA/web
    // defaults. If the field is omitted on a partial API update, preserve the
    // previously stored choice instead of resetting it.
    clean.confidenceThreshold = 55;
    clean.allowMinimumLotOverride = true;
    clean.sessionStartHour = 0;
    clean.sessionEndHour = 24;
    clean.maxAtrPoints = 0;
    const settingsCurrency = String(currentMetrics.currency || "").trim().toUpperCase();
    if (settingsCurrency) {
      clean.accountCurrency = settingsCurrency;
      if (currencyReviewComplete) {
        clean.accountCurrencyReviewRequired = false;
      }
    }

    if (Object.keys(clean).length === 0) {
      throw new BadRequestException("ไม่มีค่าการตั้งค่าที่บันทึกได้");
    }

    const saved = await this.db.one(
      `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
       VALUES($1,$2::jsonb,now())
       ON CONFLICT(bot_instance_id)
       DO UPDATE SET
         settings=(bot_settings.settings - 'tradingProfile' - 'previousAccountCurrency') || EXCLUDED.settings,
         updated_at=now()
       RETURNING settings`,
      [instance.id, JSON.stringify(clean)]
    );

    const savedSettings = saved?.settings || clean;
    const runtimeMetrics =
      instance.metrics && typeof instance.metrics === "object"
        ? instance.metrics
        : {};
    const dailyTargetWasEdited =
      body.dailyProfitTargetMoney !== undefined ||
      body.dailyProfitContinueAfterTarget !== undefined;
    const runtimeExecutionStatus = String(runtimeMetrics.executionStatus || "");
    const wasDailyProfitLocked =
      runtimeMetrics.dailyProfitLocked === true ||
      runtimeExecutionStatus === "DAILY_PROFIT_LOCK" ||
      runtimeExecutionStatus === "DAILY_PROFIT_GIVEBACK_LOCK";
    const currentDailyProfit = Number(runtimeMetrics.dailyProfit || 0);
    const newDailyProfitTarget = Number(savedSettings.dailyProfitTargetMoney || 0);
    const resumeAfterDailyProfitEdit =
      dailyTargetWasEdited &&
      wasDailyProfitLocked &&
      (newDailyProfitTarget <= 0 || currentDailyProfit < newDailyProfitTarget);

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

    if (resumeAfterDailyProfitEdit) {
      await this.maintenance.assertStartAllowed();
      await this.tradingModes.requestStart(instance.id, canonicalTradingMode(savedSettings), true);
    }

    return {
      ok: true,
      settings: savedSettings,
      resumedFromDailyProfitLock: resumeAfterDailyProfitEdit
    };
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
    if (!instance) throw new ConflictException("ติดตั้ง SCENOVA สำหรับบัญชี MT5 นี้ก่อน");
    return instance;
  }

  private async commandForUser(userId: string, command: string, slotId?: string | null) {
    const instance = await this.getInstance(userId, slotId || null);
    const pendingCloseAll = await this.db.one(
      "SELECT id FROM bot_commands WHERE bot_instance_id=$1 AND command='CLOSE_ALL' AND status IN ('PENDING','DELIVERED') ORDER BY id DESC LIMIT 1",
      [instance.id]
    );

    await this.db.query(
      command === "CLOSE_ALL"
        ? "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command<>'CLOSE_ALL'"
        : "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",
      [instance.id]
    );

    if (pendingCloseAll) {
      await this.db.query("UPDATE bot_instances SET desired_state='STOPPED' WHERE id=$1", [instance.id]);
      return { ok: true, state: "STOPPED", closeAllPending: true };
    }

    const desired = command === "CLOSE_ALL" ? "STOPPED" : "SAFE_STOP";
    await this.db.query("UPDATE bot_instances SET desired_state=$2 WHERE id=$1", [instance.id, desired]);
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command,payload) VALUES($1,$2,$3::jsonb)",
      [
        instance.id,
        command,
        JSON.stringify(
          command === "CLOSE_ALL"
            ? {
                source: "CUSTOMER_FORCE_FLAT_RESET",
                forceReset: true,
                requestedAt: new Date().toISOString()
              }
            : {}
        )
      ]
    );
    return { ok: true, state: desired };
  }
}
