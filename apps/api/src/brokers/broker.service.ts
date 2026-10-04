import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { DbService } from "../db.service";

type BrokerPartnerSettingsInput = {
  active?: boolean;
  partnerCode?: string;
  webPartnerLink?: string;
  mobilePartnerLink?: string;
};

@Injectable()
export class BrokerService {
  private schemaReady = false;

  constructor(private readonly db: DbService) {}

  private async ensureSchema() {
    if (this.schemaReady) return;

    await this.db.query(`
      INSERT INTO brokers(code,name,active,sort_order)
      VALUES('EXNESS','Exness',true,10)
      ON CONFLICT(code) DO NOTHING;

      CREATE TABLE IF NOT EXISTS broker_partner_settings (
        broker_id uuid PRIMARY KEY REFERENCES brokers(id) ON DELETE CASCADE,
        active boolean NOT NULL DEFAULT false,
        partner_code varchar(120) NOT NULL DEFAULT '',
        web_partner_link text NOT NULL DEFAULT '',
        mobile_partner_link text NOT NULL DEFAULT '',
        updated_by varchar(160),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS broker_registration_clicks (
        id bigserial PRIMARY KEY,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        broker_id uuid NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
        platform varchar(16) NOT NULL
          CHECK (platform IN ('WEB','MOBILE')),
        source varchar(64) NOT NULL DEFAULT 'BROKER_CENTER',
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_broker_registration_clicks_broker
        ON broker_registration_clicks(broker_id,created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_broker_registration_clicks_user
        ON broker_registration_clicks(user_id,created_at DESC)
        WHERE user_id IS NOT NULL;

      INSERT INTO broker_partner_settings(broker_id)
      SELECT id
      FROM brokers
      WHERE code='EXNESS'
      ON CONFLICT(broker_id) DO NOTHING;
    `);

    this.schemaReady = true;
  }

  private normalizePlatform(value: unknown): "WEB" | "MOBILE" {
    return String(value || "").trim().toUpperCase() === "MOBILE"
      ? "MOBILE"
      : "WEB";
  }

  private cleanPartnerCode(value: unknown) {
    const code = String(value || "").trim();
    if (code.length > 120) throw new BadRequestException("Partner Code ยาวเกินไป");
    return code;
  }

  private cleanPartnerUrl(value: unknown, label: string) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.length > 2000) throw new BadRequestException(`${label} ยาวเกินไป`);

    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:") {
        throw new Error("https required");
      }
      return parsed.toString();
    } catch {
      throw new BadRequestException(`${label} ต้องเป็นลิงก์ https:// ที่ถูกต้อง`);
    }
  }

  async exnessSummary(userId: string) {
    await this.ensureSchema();

    const provider = await this.db.one(
      `SELECT
         b.id,b.code,b.name,b.active AS broker_active,
         COALESCE(s.active,false) AS partner_active,
         COALESCE(s.web_partner_link,'') AS web_partner_link,
         COALESCE(s.mobile_partner_link,'') AS mobile_partner_link
       FROM brokers b
       LEFT JOIN broker_partner_settings s ON s.broker_id=b.id
       WHERE b.code='EXNESS'
       LIMIT 1`
    );

    const accounts = await this.db.query(
      `SELECT
         id,
         right(account_number,4) AS account_last4,
         broker_server,
         mode,
         status
       FROM mt5_accounts
       WHERE user_id=$1
         AND (
           upper(trim(COALESCE(broker,''))) LIKE 'EXNESS%'
           OR upper(trim(COALESCE(broker_server,''))) LIKE 'EXNESS%'
         )
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    const active = Boolean(provider?.broker_active && provider?.partner_active);
    const hasLink = Boolean(provider?.web_partner_link || provider?.mobile_partner_link);

    return {
      provider: {
        code: "EXNESS",
        name: provider?.name || "Exness",
        active,
        mt5Supported: true,
        cloudSupported: true,
        localSupported: true,
        registrationAvailable: active && hasLink
      },
      connectedAccounts: accounts.rows.map((row: any) => ({
        id: row.id,
        accountLast4: String(row.account_last4 || ""),
        server: String(row.broker_server || ""),
        mode: String(row.mode || ""),
        status: String(row.status || "")
      })),
      phase: {
        current: 1,
        partnerVerificationEnabled: false,
        benefitsEnabled: false,
        rebateEnabled: false
      }
    };
  }

  async registrationLink(userId: string, platformValue: unknown) {
    await this.ensureSchema();
    const platform = this.normalizePlatform(platformValue);

    const row = await this.db.one(
      `SELECT
         b.id,
         b.active AS broker_active,
         COALESCE(s.active,false) AS partner_active,
         COALESCE(s.web_partner_link,'') AS web_partner_link,
         COALESCE(s.mobile_partner_link,'') AS mobile_partner_link
       FROM brokers b
       LEFT JOIN broker_partner_settings s ON s.broker_id=b.id
       WHERE b.code='EXNESS'
       LIMIT 1`
    );

    if (!row || !row.broker_active || !row.partner_active) {
      throw new ConflictException("Exness Partner Link ยังไม่เปิดใช้งาน");
    }

    const preferred = platform === "MOBILE"
      ? String(row.mobile_partner_link || row.web_partner_link || "")
      : String(row.web_partner_link || row.mobile_partner_link || "");

    if (!preferred) {
      throw new ConflictException("ยังไม่ได้ตั้งค่า Exness Partner Link");
    }

    const url = this.cleanPartnerUrl(preferred, "Partner Link");

    await this.db.query(
      `INSERT INTO broker_registration_clicks(user_id,broker_id,platform,source)
       VALUES($1,$2,$3,'BROKER_CENTER')`,
      [userId, row.id, platform]
    );

    return {
      broker: "EXNESS",
      platform,
      url
    };
  }

  async adminExnessSettings() {
    await this.ensureSchema();

    const row = await this.db.one(
      `SELECT
         b.id,
         b.name,
         b.active AS broker_active,
         COALESCE(s.active,false) AS active,
         COALESCE(s.partner_code,'') AS partner_code,
         COALESCE(s.web_partner_link,'') AS web_partner_link,
         COALESCE(s.mobile_partner_link,'') AS mobile_partner_link,
         s.updated_by,
         s.updated_at,
         (
           SELECT COUNT(*)::int
           FROM broker_registration_clicks c
           WHERE c.broker_id=b.id
         ) AS click_count,
         (
           SELECT MAX(c.created_at)
           FROM broker_registration_clicks c
           WHERE c.broker_id=b.id
         ) AS last_click_at
       FROM brokers b
       LEFT JOIN broker_partner_settings s ON s.broker_id=b.id
       WHERE b.code='EXNESS'
       LIMIT 1`
    );

    if (!row) throw new ConflictException("ไม่พบ Exness ใน Broker Catalog");

    return {
      broker: {
        code: "EXNESS",
        name: row.name,
        active: Boolean(row.broker_active)
      },
      settings: {
        active: Boolean(row.active),
        partnerCode: String(row.partner_code || ""),
        webPartnerLink: String(row.web_partner_link || ""),
        mobilePartnerLink: String(row.mobile_partner_link || ""),
        updatedBy: row.updated_by || null,
        updatedAt: row.updated_at || null
      },
      analytics: {
        registrationClicks: Number(row.click_count || 0),
        lastClickAt: row.last_click_at || null
      }
    };
  }

  async saveAdminExnessSettings(
    input: BrokerPartnerSettingsInput,
    actor: string
  ) {
    await this.ensureSchema();

    const active = input.active === true;
    const partnerCode = this.cleanPartnerCode(input.partnerCode);
    const webPartnerLink = this.cleanPartnerUrl(input.webPartnerLink, "Web Partner Link");
    const mobilePartnerLink = this.cleanPartnerUrl(input.mobilePartnerLink, "Mobile Partner Link");

    if (active && !webPartnerLink && !mobilePartnerLink) {
      throw new BadRequestException("เปิดใช้งานไม่ได้จนกว่าจะใส่ Partner Link อย่างน้อย 1 ลิงก์");
    }

    const broker = await this.db.one(
      "SELECT id FROM brokers WHERE code='EXNESS' LIMIT 1"
    );
    if (!broker) throw new ConflictException("ไม่พบ Exness ใน Broker Catalog");

    await this.db.query(
      `INSERT INTO broker_partner_settings(
         broker_id,active,partner_code,web_partner_link,mobile_partner_link,updated_by,updated_at
       )
       VALUES($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT(broker_id) DO UPDATE SET
         active=EXCLUDED.active,
         partner_code=EXCLUDED.partner_code,
         web_partner_link=EXCLUDED.web_partner_link,
         mobile_partner_link=EXCLUDED.mobile_partner_link,
         updated_by=EXCLUDED.updated_by,
         updated_at=now()`,
      [
        broker.id,
        active,
        partnerCode,
        webPartnerLink,
        mobilePartnerLink,
        actor.slice(0, 160)
      ]
    );

    await this.db.query(
      `INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail)
       VALUES($1,'UPDATE_BROKER_PARTNER_SETTINGS','broker','EXNESS',$2::jsonb)`,
      [
        actor.slice(0, 160),
        JSON.stringify({
          active,
          partnerCodeConfigured: Boolean(partnerCode),
          webPartnerLinkConfigured: Boolean(webPartnerLink),
          mobilePartnerLinkConfigured: Boolean(mobilePartnerLink),
          phase: 1
        })
      ]
    );

    return this.adminExnessSettings();
  }
}
