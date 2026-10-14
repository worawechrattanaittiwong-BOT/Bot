import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db.service";
import { BrokerService } from "./broker.service";
import { ExnessPartnershipApiService } from "./exness-partnership-api.service";

// A guided customer request, NOT an Exness transfer instruction or proof of Exness approval.
@Injectable()
export class BrokerTransferService {
  private schemaReady = false;
  constructor(
    private readonly db: DbService,
    private readonly brokers: BrokerService,
    private readonly exness: ExnessPartnershipApiService
  ) {}

  private async ensureSchema() {
    if (this.schemaReady) return;
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS broker_partner_transfer_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        broker_code varchar(32) NOT NULL DEFAULT 'EXNESS',
        trading_account varchar(32) NOT NULL,
        partner_code varchar(120) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'PREPARED'
          CHECK (status IN ('PREPARED','CUSTOMER_SUBMITTED','PARTNER_VISIBLE')),
        customer_submitted_at timestamptz,
        partner_visible_at timestamptz,
        new_trading_account varchar(32),
        last_checked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, broker_code, trading_account)
      );
      ALTER TABLE broker_partner_transfer_requests
        ADD COLUMN IF NOT EXISTS new_trading_account varchar(32);
      CREATE INDEX IF NOT EXISTS idx_broker_transfer_status
        ON broker_partner_transfer_requests (broker_code,status,updated_at DESC);
    `);
    this.schemaReady = true;
  }

  private async accountOptions(userId: string) {
    const result = await this.db.query(
      `SELECT id, account_number, broker_server
       FROM mt5_accounts
       WHERE user_id=$1 AND (
         upper(trim(COALESCE(broker,''))) LIKE 'EXNESS%'
         OR upper(trim(COALESCE(broker_server,''))) LIKE 'EXNESS%'
       ) ORDER BY created_at DESC LIMIT 20`, [userId]
    );
    return result.rows.map(row => ({
      id: String(row.id),
      accountNumber: String(row.account_number),
      server: String(row.broker_server || "")
    }));
  }

  private async own(userId: string, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException("Transfer ID ไม่ถูกต้อง");
    const row = await this.db.one(
      `SELECT * FROM broker_partner_transfer_requests WHERE id=$1 AND user_id=$2 AND broker_code='EXNESS'`,
      [id,userId]
    );
    if (!row) throw new NotFoundException("ไม่พบคำขอย้ายพาร์ตเนอร์ของคุณ");
    return row;
  }

  private view(row: any) {
    return {
      id: String(row.id),
      accountNumber: String(row.trading_account),
      accountLast4: String(row.trading_account).slice(-4),
      partnerCode: String(row.partner_code),
      newAccountNumber: row.new_trading_account ? String(row.new_trading_account) : null,
      newAccountLast4: row.new_trading_account ? String(row.new_trading_account).slice(-4) : null,
      status: String(row.status),
      customerSubmittedAt: row.customer_submitted_at || null,
      partnerVisibleAt: row.partner_visible_at || null,
      lastCheckedAt: row.last_checked_at || null,
      createdAt: row.created_at
    };
  }

  async customer(userId: string) {
    await this.ensureSchema();
    const [partner, accounts, list, user] = await Promise.all([
      this.brokers.registrationInfo(),
      this.accountOptions(userId),
      this.db.query(`SELECT * FROM broker_partner_transfer_requests WHERE user_id=$1 AND broker_code='EXNESS' ORDER BY created_at DESC LIMIT 15`,[userId]),
      this.db.one(`SELECT email FROM users WHERE id=$1`,[userId])
    ]);
    return {
      partnerCode: partner.partnerCode,
      partnerActive: partner.active,
      contactEmail: String(user?.email || ""),
      accounts,
      requests: list.rows.map(row => this.view(row)),
      exnessSubmissionSupported: false,
      note: "Exness ออกลิงก์ส่วนตัวรายบัญชี อายุ 7 วัน ตรวจผลโดยใช้บัญชีเทรดใหม่หลัง Exness อนุมัติเท่านั้น ไม่ส่งรหัสหรือโทเคนผ่าน SCENOVA"
    };
  }

  async prepare(userId: string, input: { accountId?: string; accountNumber?: string; consent?: boolean }) {
    await this.ensureSchema();
    if (input?.consent !== true) throw new BadRequestException("กรุณายืนยันว่าต้องการให้ SCENOVA เตรียมคำขอและตรวจบัญชีจาก Exness");
    const partner = await this.brokers.registrationInfo();
    if (!partner.active || !partner.partnerCode) throw new ConflictException("ยังไม่เปิดรับคำขอย้ายพาร์ตเนอร์ใน SCENOVA");
    const options = await this.accountOptions(userId);
    const accountId = String(input.accountId || "");
    const option = accountId ? options.find(a => a.id === accountId) : null;
    if (accountId && !option) throw new BadRequestException("บัญชี MT5 นี้ไม่ใช่บัญชี Exness ของผู้ใช้");
    const accountNumber = option ? option.accountNumber : String(input.accountNumber || "").trim();
    if (!/^[0-9]{5,20}$/.test(accountNumber)) throw new BadRequestException("เลขบัญชี Exness ต้องเป็นตัวเลข 5-20 หลัก");
    const row = await this.db.one(
      `INSERT INTO broker_partner_transfer_requests(user_id,trading_account,partner_code)
       VALUES($1,$2,$3)
       ON CONFLICT(user_id,broker_code,trading_account) DO UPDATE
       SET updated_at=now()
       RETURNING *`,[userId,accountNumber,partner.partnerCode]
    );
    return this.view(row);
  }

  async markSubmitted(userId: string, id: string) {
    await this.ensureSchema();
    const current = await this.own(userId,id);
    if (current.status === "PARTNER_VISIBLE") return this.view(current);
    const row = await this.db.one(
      `UPDATE broker_partner_transfer_requests
       SET status='CUSTOMER_SUBMITTED',customer_submitted_at=COALESCE(customer_submitted_at,now()),updated_at=now()
       WHERE id=$1 AND user_id=$2 RETURNING *`,[id,userId]
    );
    return this.view(row);
  }

  // Exness requires a NEW trading account after partner change approval.
  // The original trading account remains with the original partner.
  async setNewAccount(userId: string, id: string, accountId: string) {
    await this.ensureSchema();
    const current = await this.own(userId,id);
    if (current.status === "PREPARED") {
      throw new ConflictException("กรุณายื่นคำขอกับ Exness และยืนยันว่าได้ส่งคำขอแล้วก่อน");
    }
    const options = await this.accountOptions(userId);
    const option = options.find(a => a.id === String(accountId || ""));
    if (!option) throw new BadRequestException("กรุณาเชื่อมบัญชีเทรด Exness ใหม่กับ SCENOVA ก่อน");
    if (option.accountNumber === String(current.trading_account)) {
      throw new BadRequestException("Exness ระบุว่าบัญชีเก่าไม่เปลี่ยนพาร์ตเนอร์ ต้องเลือกบัญชีเทรดใหม่เท่านั้น");
    }
    const row = await this.db.one(
      `UPDATE broker_partner_transfer_requests
       SET new_trading_account=$3,status='CUSTOMER_SUBMITTED',
           partner_visible_at=NULL,last_checked_at=NULL,updated_at=now()
       WHERE id=$1 AND user_id=$2 RETURNING *`,
      [id,userId,option.accountNumber]
    );
    return this.view(row);
  }

  async checkExness(userId: string, id: string) {
    await this.ensureSchema();
    const current = await this.own(userId,id);
    if (!current.new_trading_account) {
      throw new ConflictException("Exness กำหนดให้สร้างบัญชีเทรดใหม่หลังอนุมัติ กรุณาเชื่อมบัญชีใหม่ใน SCENOVA ก่อนตรวจ");
    }
    if (current.status === "PREPARED") {
      throw new ConflictException("คำขอยังไม่ได้ยื่นกับ Exness");
    }
    if (current.status === "PARTNER_VISIBLE") return { ...this.view(current), checked: true, matched: true };
    if (current.last_checked_at && Date.now()-new Date(current.last_checked_at).getTime()<60000) {
      throw new ConflictException("กรุณารออย่างน้อย 1 นาที ก่อนตรวจสอบกับ Exness อีกครั้ง");
    }
    // Record attempts before upstream requests to bound repeated calls even after upstream errors.
    await this.db.query(`UPDATE broker_partner_transfer_requests SET last_checked_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2`,[id,userId]);
    const found = await this.exness.hasPartnerAccount(String(current.new_trading_account));
    const row = found
      ? await this.db.one(`UPDATE broker_partner_transfer_requests
          SET status='PARTNER_VISIBLE',partner_visible_at=now(),updated_at=now()
          WHERE id=$1 AND user_id=$2 RETURNING *`,[id,userId])
      : await this.own(userId,id);
    return { ...this.view(row), checked: true, matched: found };
  }

  async adminList() {
    await this.ensureSchema();
    const result = await this.db.query(
      `SELECT t.id,t.status,t.partner_code,t.customer_submitted_at,t.partner_visible_at,t.last_checked_at,
              t.created_at,t.updated_at,right(t.trading_account,4) AS account_last4,
              right(COALESCE(t.new_trading_account,''),4) AS new_account_last4,
              u.user_code
       FROM broker_partner_transfer_requests t JOIN users u ON u.id=t.user_id
       WHERE t.broker_code='EXNESS' ORDER BY t.updated_at DESC LIMIT 100`
    );
    return { requests: result.rows.map(row => ({
      id: row.id, userCode: row.user_code, accountLast4: row.account_last4,
      status: row.status, partnerCode: row.partner_code,
      newAccountLast4: row.new_account_last4 || null,
      submittedAt: row.customer_submitted_at, checkedAt: row.last_checked_at,
      visibleAt: row.partner_visible_at, createdAt: row.created_at
    })) };
  }
}
