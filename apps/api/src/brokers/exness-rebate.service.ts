import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { DbService } from "../db.service";
import { ExnessPartnershipApiService } from "./exness-partnership-api.service";

const READS = {
  clients: "/api/v2/autorebates/clients/",
  rebates: "/api/v2/autorebates/",
  groups: "/api/v2/autorebates/groups/",
  payments: "/api/v2/autorebates/payments/",
  history: "/api/v2/autorebates/history/"
} as const;
type ReadName = keyof typeof READS;

@Injectable()
export class ExnessRebateService {
  private schemaReady = false;
  constructor(private readonly db: DbService, private readonly exness: ExnessPartnershipApiService) {}

  private async ensureSchema() {
    if (this.schemaReady) return;
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS exness_rebate_approval_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor varchar(160) NOT NULL,
        target_ids jsonb NOT NULL,
        target_kind varchar(16) NOT NULL CHECK(target_kind IN ('rebates','rebate_rows')),
        status varchar(20) NOT NULL DEFAULT 'STARTED' CHECK(status IN ('REQUESTING','STARTED','PROCESSING','COMPLETED','UNKNOWN','EXPIRED')),
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS idx_exness_rebate_approval_actor
      ON exness_rebate_approval_attempts(actor,created_at DESC);
    `);
    this.schemaReady = true;
  }

  private safeId(value: unknown) {
    const text = String(value ?? "").trim();
    if (!/^[0-9]{5,20}$/.test(text)) throw new BadRequestException("เลขบัญชี Exness ต้องเป็นตัวเลข 5-20 หลัก");
    return text;
  }
  private safePercent(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100 || Math.round(value*100)!==value*100) {
      throw new BadRequestException("เปอร์เซ็นต์ต้องเป็นตัวเลข 0-100 และมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง");
    }
    return value;
  }
  private mapRow(row: any, kind: ReadName) {
    if (!row || typeof row !== "object") return {};
    // Admin-only, whitelist fields: never proxy arbitrary Exness payloads, tokens, email or PII.
    const fields = kind === "groups" ? ["id","title","name","rebate_percent","group_id","rebate_group_title","clients_count","is_active","status"]
      : kind === "clients" ? ["partner_account","client_account","destination_client_account","rebate_group_id","rebate_group_title","rebate_percent","processed_rebate_usd","reward_usd","status"]
      : kind === "payments" ? ["id","payment_id","status","error_code","client_account","destination_client_account","partner_account","reward_usd","rebate_usd","rebate","processed_date","created_at"]
      : kind === "history" ? ["id","rebate_id","rebate_row_id","status","client_account","partner_account","rebate_usd","rebate","reward_usd","created_at","processed_date"]
      : ["id","rebate_id","rebate_row_id","status","client_account","partner_account","rebate_usd","reward_usd","rebate_percent","created_at","updated_at"];
    const out: Record<string,string|number|boolean|null> = {};
    for (const key of fields) {
      const v=row[key];
      if (v===null || typeof v==="string" || typeof v==="boolean" || (typeof v==="number" && Number.isFinite(v))) {
        if (v!==undefined) out[key]=typeof v==="string" ? v.slice(0,160) : v;
      }
    }
    return out;
  }

  async read(name: ReadName, limit=40, offset=0, existingJwt?: string) {
    if (!Object.prototype.hasOwnProperty.call(READS,name)) throw new BadRequestException("รายงานไม่ถูกต้อง");
    if (!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000) {
      throw new BadRequestException("การแบ่งหน้ารายงานไม่ถูกต้อง");
    }
    const jwt=existingJwt || await this.exness.authenticate();
    const query=new URLSearchParams({limit:String(limit),offset:String(offset)});
    const body=await this.exness.request(READS[name]+"?"+query.toString(),jwt);
    const rows=this.exness.arrayFromPayload(body);
    return {
      source:"EXNESS_PARTNERS",kind:name,limit,offset,
      count:rows.length,
      total: Number.isFinite(Number(body?.count)) ? Math.max(0,Number(body.count)) : null,
      rows:rows.slice(0,100).map(row=>this.mapRow(row,name))
    };
  }

  // Exness is the sole source of rebate rules; SCENOVA holds no rebate funds.
  async setClient(input:{clientAccount?:string;percent?:number;destinationClientAccount?:string},actor:string) {
    const account=this.safeId(input.clientAccount);
    const percent=this.safePercent(input.percent);
    const destination=this.safeId(input.destinationClientAccount);
    if(!Number.isSafeInteger(Number(destination))) throw new BadRequestException("เลขบัญชีปลายทางต้องไม่เกินขนาดตัวเลขที่ API รองรับ");
    const path="/api/v2/autorebates/clients/"+encodeURIComponent(account)+"/";
    await this.audit(actor,"REQUEST_EXNESS_REBATE_PERCENT",{clientAccount:account,destinationClientAccount:destination,percent});
    try {
      await this.exness.mutateRebate("PATCH",path,{
        rebate_percent:percent,
        destination_client_account:Number(destination)
      });
    } catch {
      // Upstream may have processed a request even if the network returned an error.
      throw new ConflictException("Exness ไม่ยืนยันผลการเปลี่ยนกฎ กรุณาอ่านค่ารายลูกค้าจาก Exness อีกครั้งก่อนกดซ้ำ");
    }
    try{await this.audit(actor,"EXNESS_REBATE_PERCENT_ACCEPTED",{clientAccount:account,destinationClientAccount:destination,percent});}
    catch { /* The preflight request remains recorded; successful upstream changes are not retried. */ }
    return {ok:true,source:"EXNESS_PARTNERS",accountNumber:account,percent,requiresRefresh:true};
  }

  private async audit(actor:string,action:string,detail:Record<string,unknown>) {
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,$2,'exness_partner_rebate',$3,$4::jsonb)",
      [actor.slice(0,160),action,String(detail.clientAccount || detail.id || "EXNESS").slice(0,160),JSON.stringify(detail)]
    );
  }

  async start(input:{rebates?:unknown;rebateRows?:unknown},actor:string) {
    await this.ensureSchema();
    const rebates=input?.rebates, rows=input?.rebateRows;
    const list=Array.isArray(rebates)&&rebates.length?rebates:Array.isArray(rows)?rows:[];
    const targetKind=Array.isArray(rebates)&&rebates.length?"rebates":"rebate_rows";
    if (!list.length||list.length>20||list.some(x=>!/^\d{1,18}$/.test(String(x)))) {
      throw new BadRequestException("เลือก Rebate ID หรือ Row ID จากรายงาน Exness จำนวน 1-20 รายการ");
    }
    if (Array.isArray(rebates)&&rebates.length&&Array.isArray(rows)&&rows.length) {
      throw new BadRequestException("เลือกอนุมัติแบบ Rebate ID หรือ Row ID เพียงแบบเดียว");
    }
    const ids=[...new Set(list.map(x=>String(x)))];
    const body=targetKind==="rebates" ? {rebates:ids,rebate_rows:[]} : {rebates:[],rebate_rows:ids};
    // Persist the intent BEFORE requesting Exness approval. A timeout is never automatically retried.
    const saved=await this.db.one(
      `INSERT INTO exness_rebate_approval_attempts(actor,target_ids,target_kind,status)
       VALUES($1,$2::jsonb,$3,'REQUESTING') RETURNING id`,
      [actor.slice(0,160),JSON.stringify(ids),targetKind]
    );
    await this.audit(actor,"REQUEST_EXNESS_REBATE_APPROVAL",{id:saved.id,count:ids.length,targetKind});
    let response:any;
    try {
      response=await this.exness.mutateRebate("POST","/api/v2/autorebates/approve/start/",body);
    } catch {
      await this.db.query("UPDATE exness_rebate_approval_attempts SET status='UNKNOWN' WHERE id=$1",[saved.id]);
      throw new ConflictException("Exness ยังไม่ยืนยันผลเริ่มอนุมัติ กรุณาตรวจประวัติใน Exness ก่อนส่งซ้ำ");
    }
    await this.db.query("UPDATE exness_rebate_approval_attempts SET status='STARTED' WHERE id=$1",[saved.id]);
    try {await this.audit(actor,"START_EXNESS_REBATE_APPROVAL",{id:saved.id,count:ids.length,targetKind});} catch {}
    const payload=response?.verification_payload;
    return {
      ok:true,attemptId:String(saved.id),
      verificationRequired:true,
      operationType:typeof payload?.operation_type==="string"?payload.operation_type.slice(0,80):null,
      requestedAt:typeof payload?.requested_at==="string"?payload.requested_at:null,
      instruction:"ดำเนินขั้นตอนยืนยันกับ Exness และนำ verification_token ที่ได้รับมากรอกใน SCENOVA (ห้ามส่งโทเคนในแชต)"
    };
  }

  async complete(input:{attemptId?:string;verificationToken?:string},actor:string) {
    await this.ensureSchema();
    const attemptId=String(input?.attemptId||"");
    const token=String(input?.verificationToken||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(attemptId)||token.length<6||token.length>4096){
      throw new BadRequestException("ข้อมูลการยืนยันจาก Exness ไม่ถูกต้อง");
    }
    // Atomic claim: never send the same completion request twice, even across browser tabs.
    const claimed=await this.db.one(
      `UPDATE exness_rebate_approval_attempts SET status='PROCESSING'
       WHERE id=$1 AND actor=$2 AND status='STARTED'
         AND created_at>now()-interval '15 minutes' RETURNING id`,
      [attemptId,actor.slice(0,160)]
    );
    if(!claimed)throw new ConflictException("คำขอนี้หมดอายุหรือถูกส่งไป Exness แล้ว ห้ามส่งซ้ำ ให้ตรวจ Payments API");
    let response:any;
    try {
      response=await this.exness.mutateRebate("POST","/api/v2/autorebates/approve/complete/",{verification_token:token});
    } catch {
      // An upstream timeout can happen after Exness processed the request. Manual reconciliation only.
      await this.db.query("UPDATE exness_rebate_approval_attempts SET status='UNKNOWN' WHERE id=$1",[attemptId]);
      throw new ConflictException("ผลการอนุมัติยังไม่ชัดเจน กรุณาตรวจ Payments/History ใน Exness ห้ามส่งคำขอซ้ำ");
    }
    await this.db.query("UPDATE exness_rebate_approval_attempts SET status='COMPLETED',completed_at=now() WHERE id=$1",[attemptId]);
    await this.audit(actor,"COMPLETE_EXNESS_REBATE_APPROVAL",{id:attemptId});
    return {ok:true,source:"EXNESS_PARTNERS",accepted:Boolean(response),note:"Exness รับคำขอแล้ว ตรวจผลการจ่ายจาก Payments API ก่อนถือว่าจ่ายสำเร็จ"};
  }
}
