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
import { randomBytes } from "crypto";
import { DbService } from "./db.service";
import { installerDownloadPath, isEaVersionExact, isVersionExact, latestEaRelease, latestInstallerVersion } from "./release-version";
import { CryptoService, JwtGuard } from "./security";
import { MaintenanceService } from "./maintenance.service";
import { PartnerService } from "./partner.service";

@Controller("bot")
@UseGuards(JwtGuard)
export class BotController {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly maintenance: MaintenanceService,
    private readonly partner: PartnerService
  ) {}

  private supportedEaRuntime(version: any) {
    return isEaVersionExact(version, latestEaRelease().eaVersion);
  }

  private installerUpdateState(instance: any, mode?: string | null) {
    const latestVersion = latestInstallerVersion();
    const release = latestEaRelease();

    if (String(mode || instance?.mode || "") !== "LOCAL" || !instance) {
      return {
        required: false,
        installerRequired: false,
        eaUpdateRequired: false,
        currentVersion: null,
        latestVersion,
        currentEaVersion: null,
        latestEaVersion: release.eaVersion,
        currentEaHash: null,
        latestEaHash: release.sha256,
        eaVersionMatch: true,
        eaHashMatch: true,
        downloadPath: installerDownloadPath(latestVersion),
        reason: null
      };
    }

    const currentVersion = String(instance.agent_version || "").trim() || null;
    const currentEaVersion = String(instance.metrics?.eaVersion || "").trim() || null;
    const currentEaHash = String(instance.agent_ea_hash || "").trim().toLowerCase() || null;
    const latestEaHash = String(release.sha256 || "").trim().toLowerCase() || null;

    const installerRequired =
      !currentVersion ||
      !isVersionExact(currentVersion, latestVersion);

    const eaVersionMatch = isEaVersionExact(currentEaVersion, release.eaVersion);
    const eaHashMatch = Boolean(
      latestEaHash &&
      currentEaHash &&
      currentEaHash === latestEaHash
    );
    const eaUpdateRequired = !eaVersionMatch || !eaHashMatch;
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
      eaUpdateRequired,
      currentVersion,
      latestVersion,
      currentEaVersion,
      latestEaVersion: release.eaVersion,
      currentEaHash,
      latestEaHash,
      eaVersionMatch,
      eaHashMatch,
      sourceCommit: release.sourceCommit,
      builtAt: release.builtAt,
      downloadPath: installerDownloadPath(latestVersion),
      reason
    };
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
      SAFE_STOP: { label: "Safe Stop", detail: "บอทจะไม่เปิดรอบใหม่", tone: "warn" },
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
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.assigned_user_id=$1 AND ls.status IN ('ACTIVE','AVAILABLE')
       ORDER BY
         CASE WHEN bi.last_seen_at IS NOT NULL AND bi.last_seen_at>now()-interval '30 seconds' THEN 0 ELSE 1 END,
         CASE WHEN s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() THEN 0 ELSE 1 END,
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

    // Legacy fallback keeps already-issued subscriptions working while their slot
    // migration catches up.
    const legacySub = await this.db.one(
      "SELECT s.id,s.expires_at,p.code,p.mode,p.max_mt5_accounts,p.allow_resale FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() AND ($2::text IS NULL OR p.mode=$2) ORDER BY s.expires_at DESC LIMIT 1",
      [userId, mode]
    );
    if (legacySub) {
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
  async dashboard(@Req() req: any, @Query("slotId") slotId = "", @Query("light") light = "") {
    const userId = req.user.sub;
    const lightweight = light === "1" || light.toLowerCase() === "true";
    const user = await this.user(userId);
    const selectedSlot = await this.resolveSlot(userId, slotId || null);
    const slots = await this.slotRows(userId);

    const instance = await this.db.one(
      `SELECT bi.*,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') AS mt5_online,
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
         WHERE bot_instance_id=$1`,
        [instance.id]
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
         ORDER BY created_at DESC
         LIMIT 20`,
        [instance.id]
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
           AND event_type='BASKET'
           AND created_at>=now()-interval '30 days'
         GROUP BY 1
         ORDER BY 1`,
        [instance.id]
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
    const softwareUpdate = this.installerUpdateState(instance, selectedSlot.mode);
    const maintenance = await this.maintenance.current();
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
      maintenance,
      partner,
      tradeJournal
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
    }
  ) {
    const mode: "CLOUD" | "LOCAL" = body.mode === "CLOUD" ? "CLOUD" : "LOCAL";
    const slot = body.slotId
      ? await this.resolveSlot(req.user.sub, body.slotId)
      : await this.ensureModeSlot(req.user.sub, mode);
    if (slot.mode !== mode) throw new ConflictException("slot mode does not match MT5 mode");
    const boundCloud = await this.db.one("SELECT id FROM bot_instances WHERE slot_id=$1 AND mode='CLOUD' AND runner_id IS NOT NULL", [slot.id]);
    if (boundCloud) throw new ConflictException("Cloud นี้ผูก VPS แล้ว กรุณาติดต่อผู้ดูแลเพื่อเปลี่ยนบัญชี");
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
    if (slot.mode === "CLOUD") {
      const bound = await this.db.one("SELECT runner_id FROM bot_instances WHERE id=$1", [instance.id]);
      if (bound?.runner_id) throw new ConflictException("Cloud นี้ผูก VPS แล้ว กรุณาติดต่อผู้ดูแลเพื่อหยุด MT5 ก่อนเปลี่ยนบัญชี");
    }
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
    if (!body.tradingPassword || /[\r\n\x00]/.test(body.tradingPassword)) throw new ConflictException("Trading Password ไม่ถูกต้อง");
    const bound = await this.db.one("SELECT id FROM bot_instances WHERE mt5_account_id=$1 AND runner_id IS NOT NULL", [account.id]);
    if (bound) throw new ConflictException("กรุณาติดต่อผู้ดูแลเพื่อเปลี่ยนรหัสผ่านบน VPS");
    const enc = this.crypto.encrypt(String(body.tradingPassword || ""));
    await this.db.query(
      "INSERT INTO mt5_credentials(mt5_account_id,ciphertext,iv,auth_tag) VALUES($1,$2,$3,$4) ON CONFLICT(mt5_account_id) DO UPDATE SET ciphertext=EXCLUDED.ciphertext,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,updated_at=now()",
      [account.id, enc.ciphertext, enc.iv, enc.authTag]
    );
    return { ok: true };
  }

  @Post("start")
  async start(@Req() req: any, @Query("slotId") slotId = "") {
    await this.maintenance.assertStartAllowed();
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
      const softwareUpdate = this.installerUpdateState(instance, instance.mode);
      if (softwareUpdate.required) {
        throw new ConflictException(
          "ยังเริ่มบอทไม่ได้: " +
          (softwareUpdate.reason || "เวอร์ชัน SCENOVA / EA ยังไม่ตรงกับ Server") +
          " · ต้องอัปเดตให้ Agent, EA Version และ EX5 Hash ตรงกันก่อน"
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
        throw new ConflictException("บัญชี MT5 นี้ไม่อนุญาตให้เทรด");
      }
      if (metrics.accountTradeExpert === false) {
        throw new ConflictException("บัญชี MT5 นี้ไม่อนุญาตให้ Expert Advisor เทรด");
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

    const booleanSetting = (key: string) => {
      if (body[key] === undefined) return;
      if (typeof body[key] !== "boolean") {
        throw new BadRequestException(key + " ต้องเป็น true หรือ false");
      }
      clean[key] = body[key];
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
    numberSetting("basketTriggerMoney", 0, 100000);
    numberSetting("basketTrailMoney", 0, 100000);
    numberSetting("maxBasketLossMoney", 0, 100000);
    numberSetting("dailyLossMoney", 0, 100000);
    numberSetting("dailyProfitTargetMoney", 0, 100000);
    booleanSetting("dailyProfitContinueAfterTarget");
    numberSetting("dailyProfitDrawdownPercent", 1, 95);
    numberSetting("basketProfitTargetMoney", 0, 100000);
    numberSetting("perPositionProfitMoney", 0, 100000);
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
    numberSetting("perPositionLossMoney", 0, 100000);
    numberSetting("manualStopLossPoints", 0, 1000000);
    if (body.perPositionLossMoney !== undefined) {
      clean.perPositionLossMoney = 0;
    }
    numberSetting("minOrderIntervalMs", 0, 60000, true);
    numberSetting("maxOrdersPerMinute", 1, 5000, true);
    if (body.zeroGridStepPrice !== undefined) {
      const zeroGridStepPrice = Number(body.zeroGridStepPrice);
      if (zeroGridStepPrice !== 2 && zeroGridStepPrice !== 3) {
        throw new BadRequestException("ZERO GRID Step ต้องเป็น 2.00 หรือ 3.00 เท่านั้น");
      }
      clean.zeroGridStepPrice = zeroGridStepPrice;
    }
    numberSetting("zeroGridLevelsPerSide", 3, 3, true);
    numberSetting("zeroGridBaseLot", 0.01, 100);
    numberSetting("zeroGridMinNetProfitMoney", 0.01, 100000);
    numberSetting("zeroGridCloseReserveMoney", 0, 100000);
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

    if (requestedProfitMode === "AUTO" || requestedProfitMode === "OFF") {
      clean.basketProfitTargetMoney = 0;
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

    // New semantics:
    // basketProfitTargetMoney = Basket target
    // profitRunTrailPercent = optional giveback AFTER Basket target is reached
    // perPositionProfitMoney = mutually-exclusive per-position mode
    if (requestedPerPositionProfit > 0) {
      clean.basketProfitTargetMoney = 0;
      clean.profitRunTrailPercent = 0;
      clean.basketTriggerMoney = 0;
      clean.basketTrailMoney = 0;
    } else if (requestedBasketProfit > 0) {
      clean.perPositionProfitMoney = 0;
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

    if (requestedControlMode !== null && !["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL"].includes(requestedControlMode)) {
      throw new BadRequestException("Control Mode ไม่ถูกต้อง");
    }
    if (requestedEngineMode !== null && !["AUTO", "RACE", "ZERO_GRID"].includes(requestedEngineMode)) {
      throw new BadRequestException("Engine Mode ไม่ถูกต้อง");
    }

    // Canonical DB pair: never persist a stale ZERO/RACE engine next to another mode.
    if (requestedControlMode !== null) {
      clean.controlMode = requestedControlMode;
      clean.engineMode = requestedControlMode === "ZERO_GRID"
        ? "ZERO_GRID"
        : requestedControlMode === "RACE"
          ? "RACE"
          : "AUTO";
    } else if (requestedEngineMode !== null) {
      clean.engineMode = requestedEngineMode;
      clean.controlMode = requestedEngineMode === "ZERO_GRID"
        ? "ZERO_GRID"
        : requestedEngineMode === "RACE"
          ? "RACE"
          : "AUTO";
    }

    const zeroGridSelected =
      requestedControlMode === "ZERO_GRID" ||
      (requestedControlMode === null && requestedEngineMode === "ZERO_GRID");
    if (zeroGridSelected) {
      clean.zeroGridStepPrice = clean.zeroGridStepPrice === 2 ? 2 : 3;
      clean.zeroGridLevelsPerSide = 3;
      if (body.zeroGridBaseLot === undefined) clean.zeroGridBaseLot = 0.01;
      if (body.zeroGridMinNetProfitMoney === undefined) clean.zeroGridMinNetProfitMoney = 0.5;
      if (body.zeroGridCloseReserveMoney === undefined) clean.zeroGridCloseReserveMoney = 0.2;
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

    if (Object.keys(clean).length === 0) {
      throw new BadRequestException("ไม่มีค่าการตั้งค่าที่บันทึกได้");
    }

    const saved = await this.db.one(
      `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
       VALUES($1,$2::jsonb,now())
       ON CONFLICT(bot_instance_id)
       DO UPDATE SET
         settings=(bot_settings.settings - 'tradingProfile') || EXCLUDED.settings,
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
      await this.db.query(
        `UPDATE bot_instances
         SET desired_state='RUNNING',
             metrics=jsonb_set(
               COALESCE(metrics,'{}'::jsonb),
               '{dailyProfitUnlockRequested}',
               'true'::jsonb,
               true
             )
         WHERE id=$1`,
        [instance.id]
      );
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND command IN ('START','SAFE_STOP') AND status IN ('PENDING','DELIVERED')",
        [instance.id]
      );
      await this.db.query(
        "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'START')",
        [instance.id]
      );
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
