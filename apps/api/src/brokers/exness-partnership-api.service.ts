import {
  BadRequestException,
  ConflictException,
  Injectable
} from "@nestjs/common";
import { DbService } from "../db.service";
import { RuntimeSecretsService } from "../runtime-secrets.service";

type ConnectionInput = {
  email?: string;
  password?: string;
  enabled?: boolean;
  syncIntervalMinutes?: number;
  clientReportPath?: string;
  commissionReportPath?: string;
  autoVerifyClients?: boolean;
  autoImportCommissions?: boolean;
  autoReleaseRebates?: boolean;
};

@Injectable()
export class ExnessPartnershipApiService {
  private schemaReady = false;
  private readonly baseUrl = "https://my.exnessaffiliates.com";

  constructor(
    private readonly db: DbService,
    private readonly secrets: RuntimeSecretsService
  ) {}

  private async ensureSchema() {
    if (this.schemaReady) return;
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS broker_api_connections (
        broker_code varchar(32) PRIMARY KEY,
        base_url text NOT NULL,
        auth_path text NOT NULL DEFAULT '/api/auth',
        summary_path text NOT NULL DEFAULT '/api/partner/summary/',
        client_report_path text NOT NULL DEFAULT '',
        commission_report_path text NOT NULL DEFAULT '',
        enabled boolean NOT NULL DEFAULT false,
        auto_verify_clients boolean NOT NULL DEFAULT false,
        auto_import_commissions boolean NOT NULL DEFAULT false,
        auto_release_rebates boolean NOT NULL DEFAULT false,
        sync_interval_minutes integer NOT NULL DEFAULT 15
          CHECK (sync_interval_minutes BETWEEN 5 AND 1440),
        last_test_status varchar(24) NOT NULL DEFAULT 'NOT_TESTED',
        last_test_detail text NOT NULL DEFAULT '',
        last_tested_at timestamptz,
        last_sync_at timestamptz,
        next_sync_at timestamptz,
        updated_by varchar(160),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS broker_sync_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_code varchar(32) NOT NULL,
        trigger_type varchar(24) NOT NULL
          CHECK (trigger_type IN ('MANUAL','SCHEDULED')),
        status varchar(24) NOT NULL
          CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED','SKIPPED')),
        started_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        clients_seen integer NOT NULL DEFAULT 0,
        clients_verified integer NOT NULL DEFAULT 0,
        commissions_seen integer NOT NULL DEFAULT 0,
        commissions_imported integer NOT NULL DEFAULT 0,
        rebates_released integer NOT NULL DEFAULT 0,
        error_detail text NOT NULL DEFAULT '',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_broker_sync_runs_code
        ON broker_sync_runs(broker_code,started_at DESC);

      INSERT INTO broker_api_connections(
        broker_code,base_url,auth_path,summary_path
      ) VALUES(
        'EXNESS','https://my.exnessaffiliates.com','/api/auth','/api/partner/summary/'
      )
      ON CONFLICT(broker_code) DO NOTHING;
    `);
    this.schemaReady = true;
  }

  private normalizePath(value: unknown) {
    const path = String(value || "").trim();
    if (!path) return "";
    if (!path.startsWith("/") || path.includes("://") || path.length > 500) {
      throw new BadRequestException("API path ไม่ถูกต้อง");
    }
    return path;
  }

  private async saveSecret(configKey: string, label: string, value: string, actor: string) {
    if (!value) return;
    await this.secrets.save({
      configKey,
      category: "BROKER",
      label,
      value,
      note: "SCENOVA Broker Phase 4 · encrypted runtime vault",
      active: true,
      updatedBy: actor,
      provider: "Exness Partnership API",
      testUrl: this.baseUrl + "/api/partner/summary/",
      authMode: "CUSTOM"
    });
  }

  async state() {
    await this.ensureSchema();
    const row = await this.db.one(
      "SELECT * FROM broker_api_connections WHERE broker_code='EXNESS'"
    );
    return {
      configured: Boolean(
        String(process.env.EXNESS_PARTNER_EMAIL || "").trim() &&
        String(process.env.EXNESS_PARTNER_PASSWORD || "").trim()
      ),
      enabled: Boolean(row?.enabled),
      baseUrl: this.baseUrl,
      authPath: String(row?.auth_path || "/api/auth"),
      summaryPath: String(row?.summary_path || "/api/partner/summary/"),
      clientReportPath: String(row?.client_report_path || ""),
      commissionReportPath: String(row?.commission_report_path || ""),
      autoVerifyClients: Boolean(row?.auto_verify_clients),
      autoImportCommissions: Boolean(row?.auto_import_commissions),
      autoReleaseRebates: Boolean(row?.auto_release_rebates),
      syncIntervalMinutes: Number(row?.sync_interval_minutes || 15),
      lastTestStatus: String(row?.last_test_status || "NOT_TESTED"),
      lastTestDetail: String(row?.last_test_detail || ""),
      lastTestedAt: row?.last_tested_at || null,
      lastSyncAt: row?.last_sync_at || null,
      nextSyncAt: row?.next_sync_at || null,
      officialSchemaUrl: "https://my.exnessaffiliates.com/api/schema/"
    };
  }

  async saveConnection(input: ConnectionInput, actor: string) {
    await this.ensureSchema();

    const email = String(input.email || "").trim();
    const password = String(input.password || "");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      throw new BadRequestException("Exness Partner Email ไม่ถูกต้อง");
    }
    if (password && password.length < 6) {
      throw new BadRequestException("Exness Partner Password สั้นเกินไป");
    }

    await this.saveSecret("EXNESS_PARTNER_EMAIL", "Exness Partner Email", email, actor);
    await this.saveSecret("EXNESS_PARTNER_PASSWORD", "Exness Partner Password", password, actor);

    const interval = Math.max(5, Math.min(1440, Math.trunc(Number(input.syncIntervalMinutes || 15))));
    const enabled = input.enabled === true;

    if (enabled) {
      const configured = Boolean(
        String(process.env.EXNESS_PARTNER_EMAIL || "").trim() &&
        String(process.env.EXNESS_PARTNER_PASSWORD || "").trim()
      );
      if (!configured) {
        throw new ConflictException("กรุณาบันทึก Exness Partner Email และ Password ก่อนเปิด Automation");
      }
    }

    await this.db.query(
      `UPDATE broker_api_connections SET
         client_report_path=$2,
         commission_report_path=$3,
         enabled=$4,
         auto_verify_clients=$5,
         auto_import_commissions=$6,
         auto_release_rebates=$7,
         sync_interval_minutes=$8,
         next_sync_at=CASE WHEN $4 THEN now() ELSE NULL END,
         updated_by=$9,
         updated_at=now()
       WHERE broker_code=$1`,
      [
        "EXNESS",
        this.normalizePath(input.clientReportPath),
        this.normalizePath(input.commissionReportPath),
        enabled,
        input.autoVerifyClients === true,
        input.autoImportCommissions === true,
        input.autoReleaseRebates === true,
        interval,
        actor.slice(0,160)
      ]
    );

    return this.state();
  }

  private tokenFromBody(body: any) {
    if (typeof body === "string" && body.trim()) return body.trim().replace(/^JWT\s+/i,"");
    const candidates = [
      body?.token,
      body?.jwt,
      body?.access_token,
      body?.access,
      body?.data?.token
    ];
    return String(candidates.find(Boolean) || "").trim().replace(/^JWT\s+/i,"");
  }

  async authenticate() {
    await this.ensureSchema();
    const email = String(process.env.EXNESS_PARTNER_EMAIL || "").trim();
    const password = String(process.env.EXNESS_PARTNER_PASSWORD || "");
    if (!email || !password) {
      throw new ConflictException("ยังไม่ได้ตั้งค่า Exness Partnership API credentials");
    }

    const response = await fetch(this.baseUrl + "/api/auth", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json"
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(12000)
    });

    const text = await response.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch {}

    if (!response.ok) {
      throw new ConflictException(
        "Exness auth failed HTTP " + response.status + ": " +
        String(body?.detail || body?.message || text || "Unknown error").slice(0,300)
      );
    }

    const token = this.tokenFromBody(body);
    if (!token) throw new ConflictException("Exness auth ไม่ได้ส่ง JWT token กลับมา");
    return token;
  }

  async request(path: string, token?: string) {
    const safePath = this.normalizePath(path);
    if (!safePath) throw new BadRequestException("API path ว่าง");
    const jwt = token || await this.authenticate();
    const response = await fetch(this.baseUrl + safePath, {
      headers: {
        "accept": "application/json",
        "authorization": "JWT " + jwt
      },
      signal: AbortSignal.timeout(15000)
    });
    const text = await response.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch {}
    if (!response.ok) {
      throw new ConflictException(
        "Exness API HTTP " + response.status + ": " +
        String(body?.detail || body?.message || text || "Unknown error").slice(0,300)
      );
    }
    return body;
  }

  async testConnection(actor: string) {
    await this.ensureSchema();
    try {
      const token = await this.authenticate();
      const summary = await this.request("/api/partner/summary/", token);
      const detail = "Connected · /api/auth + /api/partner/summary/ OK";
      await this.db.query(
        `UPDATE broker_api_connections SET
           last_test_status='PASS',last_test_detail=$2,last_tested_at=now(),
           updated_by=$3,updated_at=now()
         WHERE broker_code=$1`,
        ["EXNESS", detail, actor.slice(0,160)]
      );
      return {
        ok: true,
        status: "PASS",
        detail,
        summary
      };
    } catch (error: any) {
      const detail = String(error?.message || "Connection failed").slice(0,900);
      await this.db.query(
        `UPDATE broker_api_connections SET
           last_test_status='FAIL',last_test_detail=$2,last_tested_at=now(),
           updated_by=$3,updated_at=now()
         WHERE broker_code=$1`,
        ["EXNESS", detail, actor.slice(0,160)]
      );
      return { ok: false, status: "FAIL", detail };
    }
  }

  arrayFromPayload(payload: any): any[] {
    if (Array.isArray(payload)) return payload;
    for (const key of ["results","items","data","rows"]) {
      if (Array.isArray(payload?.[key])) return payload[key];
      if (Array.isArray(payload?.data?.[key])) return payload.data[key];
    }
    return [];
  }

  async rawReports(token: string) {
    await this.ensureSchema();
    const row = await this.db.one(
      "SELECT client_report_path,commission_report_path FROM broker_api_connections WHERE broker_code='EXNESS'"
    );
    const clients = row?.client_report_path
      ? this.arrayFromPayload(await this.request(String(row.client_report_path), token))
      : [];
    const commissions = row?.commission_report_path
      ? this.arrayFromPayload(await this.request(String(row.commission_report_path), token))
      : [];
    return { clients, commissions };
  }
}
