import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import { ExnessPartnershipApiService } from "./exness-partnership-api.service";
import { ExnessRebateService } from "./exness-rebate.service";

type ReportRead<T> = { rows: T[]; complete: boolean; error: string | null };
const PAGE_SIZE = 40;
const MAX_PAGES = 20;

// Read-only owner view. Do not expose full MT5 logins or raw partner report rows.
@Injectable()
export class ExnessAccountDetailsService {
  constructor(
    private readonly db: DbService,
    private readonly exness: ExnessPartnershipApiService,
    private readonly rebates: ExnessRebateService
  ) {}

  private text(value: unknown) {
    return String(value ?? "").trim();
  }

  private async readPartnerAccounts(jwt: string): Promise<ReportRead<any>> {
    const config = await this.exness.state();
    if (!config.clientReportPath) return { rows: [], complete: false, error: "ยังไม่ได้ตั้งค่า Client Report API" };
    try {
      const rows: any[] = [];
      let offset = 0;
      let previousPage = "";
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = config.clientReportPath + (config.clientReportPath.includes("?") ? "&" : "?")
          + new URLSearchParams({limit: String(PAGE_SIZE), offset: String(offset)}).toString();
        const payload = await this.exness.request(url, jwt);
        const slice = this.exness.arrayFromPayload(payload);
        const totalRaw = payload?.count ?? payload?.total;
        const total = totalRaw !== null && totalRaw !== undefined && Number.isFinite(Number(totalRaw))
          ? Number(totalRaw) : null;
        if (slice.length === 0) {
          const complete = total === null || rows.length >= total;
          return {rows, complete, error:complete ? null : "รายงานลูกค้าไม่ครบ"};
        }
        // Never mark a report complete if the server ignores offset/pagination.
        const signature = JSON.stringify([slice.length,slice[0],slice[slice.length-1]]);
        if (signature === previousPage) return {rows,complete:false,error:"Exness ส่งหน้ารายงานซ้ำ ไม่สามารถยืนยันบัญชีที่หายไปได้"};
        previousPage = signature;
        rows.push(...slice);
        offset += slice.length;
        if (total !== null && rows.length >= total && slice.length < PAGE_SIZE) {
          return {rows,complete:true,error:null};
        }
        // Unknown total: probe the next offset instead of assuming a short page is final.
      }
      return {rows, complete:false, error:"รายงาน Exness มีหลายหน้าเกินขอบเขตตรวจสอบ กรุณาตรวจใน Exness Partners เพิ่มเติม"};
    } catch {
      return {rows:[], complete:false, error:"อ่านรายงาน IB จาก Exness ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"};
    }
  }

  private async readRebateClients(jwt: string): Promise<ReportRead<any>> {
    const rows: any[] = [];
    let offset = 0;
    let previousPage = "";
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const payload = await this.rebates.read("clients", PAGE_SIZE, offset, jwt);
        if (payload.rows.length === 0) {
          const complete = payload.total===null || rows.length >= payload.total;
          return {rows,complete,error:complete ? null : "รายงาน Rebate ไม่ครบ"};
        }
        const signature = JSON.stringify([payload.rows.length,payload.rows[0],payload.rows[payload.rows.length-1]]);
        if (signature === previousPage) return {rows,complete:false,error:"Exness ส่งหน้า Rebate ซ้ำ ไม่สามารถยืนยันบัญชีที่หายไปได้"};
        previousPage = signature;
        rows.push(...payload.rows);
        offset += payload.rows.length;
        if (payload.total !== null && rows.length >= payload.total && payload.rows.length < PAGE_SIZE) {
          return {rows,complete:true,error:null};
        }
      }
      return {rows, complete:false, error:"รายงาน Rebate มีหลายหน้าเกินขอบเขตตรวจสอบ"};
    } catch {
      return {rows:[], complete:false, error:"อ่านข้อมูล Rebate จาก Exness ไม่สำเร็จ"};
    }
  }

  async forClient(userId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new BadRequestException("รหัสลูกค้าไม่ถูกต้อง");
    }
    const user = await this.db.one(
      "SELECT user_code FROM users WHERE id=$1 AND status<>'DELETED'", [userId]
    );
    if (!user) throw new NotFoundException("ไม่พบลูกค้า");

    const accounts = await this.db.query(
      `SELECT id, account_number, broker_server, status
       FROM mt5_accounts
       WHERE user_id=$1
         AND (upper(trim(COALESCE(broker,''))) LIKE 'EXNESS%'
           OR upper(trim(COALESCE(broker_server,''))) LIKE 'EXNESS%')
       ORDER BY created_at DESC LIMIT 50`, [userId]
    );
    const checkedAt = new Date().toISOString();
    if (!accounts.rows.length) {
      return {userCode:String(user.user_code),checkedAt,
        partnerReport:{complete:false,error:"ลูกค้ายังไม่ได้เชื่อมบัญชี MT5 Exness"},
        rebateReport:{complete:false,error:null},accounts:[]};
    }

    // Read from two separate sources: partner membership and per-source-account rebate rules.
    // A single Exness auth token is shared across read-only reports to reduce
    // repeated login requests/rate limits; a failed login never becomes NOT_FOUND.
    let jwt: string | null = null;
    try { jwt = await this.exness.authenticate(); } catch {}
    const [partnerReport, rebateReport] = jwt
      ? await Promise.all([this.readPartnerAccounts(jwt), this.readRebateClients(jwt)])
      : [
          {rows:[],complete:false,error:"Exness ไม่ยืนยันการเชื่อมต่อ API กรุณาทดสอบ Connection ใหม่"},
          {rows:[],complete:false,error:"Exness ไม่ยืนยันการเชื่อมต่อ API กรุณาทดสอบ Connection ใหม่"}
        ];
    const partnerNumbers = new Set(partnerReport.rows.map(item => this.text(
      item?.client_account ?? item?.clientAccount ?? item?.account_number
      ?? item?.accountNumber ?? item?.mt5_account ?? item?.trading_account ?? item?.account?.login
    )).filter(value => /^[0-9]{5,20}$/.test(value)));
    const rebateBySource = new Map<string, any>();
    for (const item of rebateReport.rows) {
      const source = this.text(item?.client_account);
      if (/^[0-9]{5,20}$/.test(source)) rebateBySource.set(source,item);
    }

    return {
      userCode:String(user.user_code), checkedAt,
      partnerReport:{complete:partnerReport.complete,error:partnerReport.error},
      rebateReport:{complete:rebateReport.complete,error:rebateReport.error},
      accounts:accounts.rows.map((account:any) => {
        const number = this.text(account.account_number);
        const included = partnerNumbers.has(number);
        const rebate = rebateBySource.get(number);
        const dest = this.text(rebate?.destination_client_account);
        const percentValue = rebate?.rebate_percent;
        const parsedPercent = percentValue !== null && percentValue !== undefined &&
          this.text(percentValue) !== "" && Number.isFinite(Number(percentValue)) ? Number(percentValue) : null;
        return {
          id:String(account.id),
          accountLast4:number.slice(-4),
          server:this.text(account.broker_server).slice(0,90),
          mt5Status:this.text(account.status).slice(0,40),
          partnerMatch: included ? "FOUND" : partnerReport.complete ? "NOT_FOUND" : "UNAVAILABLE",
          rebate:{
            state: rebate ? "CONFIGURED" : rebateReport.complete ? "NOT_FOUND" : "UNAVAILABLE",
            percent:rebate ? parsedPercent : null,
            destinationLast4:dest ? dest.slice(-4) : null,
            destinationIsSource:rebate && dest ? dest === number : null,
            group:rebate ? this.text(rebate.rebate_group_title).slice(0,90) || null : null,
            status:rebate ? this.text(rebate.status).slice(0,40) || null : null,
            processedUsd:rebate && rebate.processed_rebate_usd !== null && rebate.processed_rebate_usd !== undefined && this.text(rebate.processed_rebate_usd) !== "" && Number.isFinite(Number(rebate.processed_rebate_usd))
              ? Number(rebate.processed_rebate_usd) : null
          }
        };
      })
    };
  }
}
