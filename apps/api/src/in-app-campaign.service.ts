import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { DbService } from "./db.service";

type CampaignSettings = {
  maxImpressionsPerDay?: number;
  oncePerSlot?: boolean;
  delayMs?: number;
  exactPaths?: string[];
  allowedPathPrefixes?: string[];
  excludedPathPrefixes?: string[];
  audienceRoles?: string[];
};

type AdminScheduleInput = {
  slotCode?: unknown;
  startMinute?: unknown;
  endMinute?: unknown;
  enabled?: unknown;
};

const EVENT_TYPES = new Set(["VIEW", "CLOSE", "CLICK", "HIDE_TODAY"]);
const CAMPAIGN_STATUSES = new Set(["ACTIVE", "PAUSED", "ARCHIVED"]);
const AUDIENCE_ROLES = new Set(["CUSTOMER", "OWNER", "ADMIN"]);
const ASSET_KINDS = new Set(["DESKTOP", "MOBILE"]);
const MAX_ASSET_BYTES = 4 * 1024 * 1024;

@Injectable()
export class InAppCampaignService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  async onModuleInit() {
    await this.ensureSchema();
  }

  private async ensureSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS in_app_campaigns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(80) NOT NULL UNIQUE,
        title varchar(180) NOT NULL,
        image_url text,
        mobile_image_url text,
        target_url text NOT NULL,
        cta_label varchar(120) NOT NULL DEFAULT 'ดูรายละเอียด',
        status varchar(20) NOT NULL DEFAULT 'ACTIVE'
          CHECK(status IN ('ACTIVE','PAUSED','ARCHIVED')),
        priority integer NOT NULL DEFAULT 0,
        starts_at timestamptz NOT NULL DEFAULT now(),
        ends_at timestamptz,
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS in_app_campaign_schedules (
        campaign_id uuid NOT NULL REFERENCES in_app_campaigns(id) ON DELETE CASCADE,
        slot_code varchar(32) NOT NULL,
        start_minute integer NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
        end_minute integer NOT NULL CHECK(end_minute BETWEEN 0 AND 1439),
        enabled boolean NOT NULL DEFAULT true,
        PRIMARY KEY(campaign_id,slot_code),
        CHECK(end_minute >= start_minute)
      );

      CREATE TABLE IF NOT EXISTS in_app_campaign_events (
        id bigserial PRIMARY KEY,
        campaign_id uuid NOT NULL REFERENCES in_app_campaigns(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_type varchar(20) NOT NULL
          CHECK(event_type IN ('VIEW','CLOSE','CLICK','HIDE_TODAY')),
        slot_code varchar(32) NOT NULL,
        event_date date NOT NULL,
        path varchar(240),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS in_app_campaign_assets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id uuid NOT NULL REFERENCES in_app_campaigns(id) ON DELETE CASCADE,
        asset_kind varchar(16) NOT NULL CHECK(asset_kind IN ('DESKTOP','MOBILE')),
        content_type varchar(64) NOT NULL,
        content bytea NOT NULL,
        size_bytes integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_campaign_asset_kind
        ON in_app_campaign_assets(campaign_id,asset_kind);
      CREATE INDEX IF NOT EXISTS idx_in_app_campaign_active
        ON in_app_campaigns(status,priority DESC,starts_at,ends_at);
      CREATE INDEX IF NOT EXISTS idx_in_app_campaign_events_user_day
        ON in_app_campaign_events(user_id,event_date,campaign_id,slot_code);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_campaign_view_once
        ON in_app_campaign_events(campaign_id,user_id,event_date,slot_code)
        WHERE event_type='VIEW';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_in_app_campaign_hide_day_once
        ON in_app_campaign_events(campaign_id,user_id,event_date)
        WHERE event_type='HIDE_TODAY';

      INSERT INTO in_app_campaigns(
        code,title,image_url,mobile_image_url,target_url,cta_label,status,priority,
        starts_at,ends_at,settings
      )
      VALUES(
        'REFERRAL_NETWORK',
        'แนะนำเพื่อน รับค่าคอมมิชชั่นแบบไร้ขีดจำกัด',
        '/promotions/referral-network-campaign.svg',
        '/promotions/referral-network-campaign.svg',
        '/referrals/details',
        'ดูรายละเอียดการแนะนำเพื่อน',
        'ACTIVE',
        100,
        now(),
        '2099-12-31 23:59:59+07',
        '{
          "maxImpressionsPerDay":3,
          "oncePerSlot":true,
          "delayMs":2500,
          "exactPaths":["/performance"],
          "allowedPathPrefixes":["/dashboard","/packages","/account","/referrals","/partner"]
        }'::jsonb
      )
      ON CONFLICT(code) DO NOTHING;

      INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
      SELECT id,'MORNING',420,659,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
      ON CONFLICT(campaign_id,slot_code) DO NOTHING;

      INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
      SELECT id,'MIDDAY',660,899,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
      ON CONFLICT(campaign_id,slot_code) DO NOTHING;

      INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
      SELECT id,'EVENING',1020,1319,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
      ON CONFLICT(campaign_id,slot_code) DO NOTHING;
    `);
  }

  private bangkokClock(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const value = (type: string) => parts.find(part => part.type === type)?.value || "0";
    const dateKey = `${value("year")}-${value("month")}-${value("day")}`;
    const minuteOfDay = Number(value("hour")) * 60 + Number(value("minute"));
    return { dateKey, minuteOfDay };
  }

  private uuid(value: unknown) {
    const id = String(value || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException("invalid campaign id");
    }
    return id;
  }

  private cleanPath(input: unknown) {
    const value = String(input || "/").split("?")[0].trim() || "/";
    return value.startsWith("/") ? value.slice(0, 240) : "/";
  }

  private cleanTargetUrl(input: unknown) {
    const value = String(input || "").trim();
    if (!value) throw new BadRequestException("target URL required");
    if (value.startsWith("/")) return value.slice(0, 1000);
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported protocol");
      return url.toString().slice(0, 1000);
    } catch {
      throw new BadRequestException("invalid target URL");
    }
  }

  private stringList(value: unknown, maxItems = 50) {
    return Array.isArray(value)
      ? Array.from(new Set(
          value
            .map(item => String(item || "").trim())
            .filter(Boolean)
            .slice(0, maxItems)
        ))
      : [];
  }

  private normalizeSettings(value: any): CampaignSettings {
    const raw = value && typeof value === "object" ? value : {};
    const maxImpressionsPerDay = Math.max(1, Math.min(12, Math.trunc(Number(raw.maxImpressionsPerDay || 3))));
    const delayMs = Math.max(0, Math.min(15_000, Math.trunc(Number(raw.delayMs ?? 2500))));
    const audienceRoles = this.stringList(raw.audienceRoles, 3)
      .map(item => item.toUpperCase())
      .filter(item => AUDIENCE_ROLES.has(item));
    return {
      maxImpressionsPerDay,
      oncePerSlot: raw.oncePerSlot !== false,
      delayMs,
      exactPaths: this.stringList(raw.exactPaths),
      allowedPathPrefixes: this.stringList(raw.allowedPathPrefixes),
      excludedPathPrefixes: this.stringList(raw.excludedPathPrefixes),
      audienceRoles
    };
  }

  private normalizeSchedules(value: unknown): Array<{
    slotCode: string;
    startMinute: number;
    endMinute: number;
    enabled: boolean;
  }> {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const rows: Array<{ slotCode: string; startMinute: number; endMinute: number; enabled: boolean }> = [];
    for (const item of value as AdminScheduleInput[]) {
      const slotCode = String(item?.slotCode || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32);
      if (!slotCode || seen.has(slotCode)) continue;
      const startMinute = Math.max(0, Math.min(1439, Math.trunc(Number(item?.startMinute || 0))));
      const endMinute = Math.max(0, Math.min(1439, Math.trunc(Number(item?.endMinute || 0))));
      if (endMinute < startMinute) throw new BadRequestException(`invalid schedule: ${slotCode}`);
      seen.add(slotCode);
      rows.push({ slotCode, startMinute, endMinute, enabled: item?.enabled !== false });
    }
    return rows.slice(0, 12);
  }

  private routeAllowed(settings: CampaignSettings, path: string) {
    const excluded = this.stringList(settings.excludedPathPrefixes);
    if (excluded.some(prefix => path === prefix || path.startsWith(prefix + "/"))) return false;

    const exact = this.stringList(settings.exactPaths);
    const prefixes = this.stringList(settings.allowedPathPrefixes);
    if (!exact.length && !prefixes.length) return true;
    if (exact.includes(path)) return true;
    return prefixes.some(prefix => path === prefix || path.startsWith(prefix + "/"));
  }

  private async replaceSchedules(client: any, campaignId: string, schedulesRaw: unknown) {
    const schedules = this.normalizeSchedules(schedulesRaw);
    await client.query("DELETE FROM in_app_campaign_schedules WHERE campaign_id=$1", [campaignId]);
    for (const row of schedules) {
      await client.query(
        `INSERT INTO in_app_campaign_schedules(
           campaign_id,slot_code,start_minute,end_minute,enabled
         ) VALUES($1,$2,$3,$4,$5)`,
        [campaignId, row.slotCode, row.startMinute, row.endMinute, row.enabled]
      );
    }
  }

  async active(userId: string, role: string, pathRaw: unknown) {
    const path = this.cleanPath(pathRaw);
    const { dateKey, minuteOfDay } = this.bangkokClock();
    const campaigns = (await this.db.query(
      `SELECT id,code,title,image_url,mobile_image_url,target_url,cta_label,priority,settings
       FROM in_app_campaigns
       WHERE status='ACTIVE'
         AND starts_at<=now()
         AND (ends_at IS NULL OR ends_at>now())
       ORDER BY priority DESC,created_at ASC
       LIMIT 25`
    )).rows || [];

    if (!campaigns.length) return { campaign: null };

    const campaignIds = campaigns.map((row: any) => row.id);
    const schedules = (await this.db.query(
      `SELECT campaign_id,slot_code,start_minute,end_minute
       FROM in_app_campaign_schedules
       WHERE campaign_id=ANY($1::uuid[]) AND enabled=true`,
      [campaignIds]
    )).rows || [];
    const events = (await this.db.query(
      `SELECT campaign_id,event_type,slot_code,count(*)::int AS event_count
       FROM in_app_campaign_events
       WHERE user_id=$1 AND event_date=$2::date AND campaign_id=ANY($3::uuid[])
       GROUP BY campaign_id,event_type,slot_code`,
      [userId, dateKey, campaignIds]
    )).rows || [];

    for (const row of campaigns) {
      const settings = (row.settings || {}) as CampaignSettings;
      if (!this.routeAllowed(settings, path)) continue;

      const audienceRoles = this.stringList(settings.audienceRoles).map(item => item.toUpperCase());
      if (audienceRoles.length && !audienceRoles.includes(String(role || "").toUpperCase())) continue;

      const slot = schedules.find((item: any) =>
        item.campaign_id === row.id &&
        minuteOfDay >= Number(item.start_minute) &&
        minuteOfDay <= Number(item.end_minute)
      );
      if (!slot) continue;

      const ownEvents = events.filter((item: any) => item.campaign_id === row.id);
      if (ownEvents.some((item: any) => item.event_type === "HIDE_TODAY")) continue;

      const viewCount = ownEvents
        .filter((item: any) => item.event_type === "VIEW")
        .reduce((sum: number, item: any) => sum + Number(item.event_count || 0), 0);
      const maxImpressions = Math.max(1, Math.min(12, Number(settings.maxImpressionsPerDay || 3)));
      if (viewCount >= maxImpressions) continue;

      const oncePerSlot = settings.oncePerSlot !== false;
      if (
        oncePerSlot &&
        ownEvents.some((item: any) => item.event_type === "VIEW" && item.slot_code === slot.slot_code)
      ) continue;

      return {
        campaign: {
          id: row.id,
          code: row.code,
          title: row.title,
          imageUrl: row.image_url || null,
          mobileImageUrl: row.mobile_image_url || row.image_url || null,
          targetUrl: row.target_url,
          ctaLabel: row.cta_label,
          slotCode: slot.slot_code,
          delayMs: Math.max(0, Math.min(15_000, Number(settings.delayMs || 2500)))
        }
      };
    }

    return { campaign: null };
  }

  async adminList() {
    const rows = (await this.db.query(`
      SELECT
        c.id,c.code,c.title,c.image_url,c.mobile_image_url,c.target_url,c.cta_label,
        c.status,c.priority,c.starts_at,c.ends_at,c.settings,c.created_at,c.updated_at,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'slotCode',s.slot_code,
              'startMinute',s.start_minute,
              'endMinute',s.end_minute,
              'enabled',s.enabled
            )
            ORDER BY s.start_minute,s.slot_code
          )
          FROM in_app_campaign_schedules s
          WHERE s.campaign_id=c.id
        ),'[]'::jsonb) AS schedules,
        COALESCE((
          SELECT jsonb_build_object(
            'views',count(*) FILTER (WHERE e.event_type='VIEW'),
            'clicks',count(*) FILTER (WHERE e.event_type='CLICK'),
            'closes',count(*) FILTER (WHERE e.event_type='CLOSE'),
            'hideToday',count(*) FILTER (WHERE e.event_type='HIDE_TODAY')
          )
          FROM in_app_campaign_events e
          WHERE e.campaign_id=c.id
        ),'{}'::jsonb) AS metrics
      FROM in_app_campaigns c
      ORDER BY c.priority DESC,c.created_at DESC
    `)).rows || [];
    return { campaigns: rows };
  }

  async adminCreate(body: any) {
    const code = String(body?.code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 80);
    if (code.length < 3) throw new BadRequestException("campaign code must be at least 3 characters");

    const title = String(body?.title || "").trim().slice(0, 180);
    if (!title) throw new BadRequestException("campaign title required");

    const status = String(body?.status || "PAUSED").toUpperCase();
    if (!CAMPAIGN_STATUSES.has(status)) throw new BadRequestException("invalid campaign status");

    const targetUrl = this.cleanTargetUrl(body?.targetUrl);
    const ctaLabel = String(body?.ctaLabel || "ดูรายละเอียด").trim().slice(0, 120) || "ดูรายละเอียด";
    const priority = Math.max(-9999, Math.min(9999, Math.trunc(Number(body?.priority || 0))));
    const startsAt = body?.startsAt ? new Date(String(body.startsAt)) : new Date();
    const endsAt = body?.endsAt ? new Date(String(body.endsAt)) : null;
    if (!Number.isFinite(startsAt.getTime())) throw new BadRequestException("invalid start date");
    if (endsAt && !Number.isFinite(endsAt.getTime())) throw new BadRequestException("invalid end date");
    if (endsAt && endsAt <= startsAt) throw new BadRequestException("end date must be after start date");
    const settings = this.normalizeSettings(body?.settings);

    return this.db.transaction(async client => {
      const created = await client.query(
        `INSERT INTO in_app_campaigns(
           code,title,target_url,cta_label,status,priority,starts_at,ends_at,settings
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
         RETURNING id,code,title,status`,
        [
          code,
          title,
          targetUrl,
          ctaLabel,
          status,
          priority,
          startsAt.toISOString(),
          endsAt?.toISOString() || null,
          JSON.stringify(settings)
        ]
      );
      const row = created.rows[0];
      await this.replaceSchedules(client, row.id, body?.schedules || []);
      return row;
    });
  }

  async adminUpdate(campaignIdRaw: unknown, body: any) {
    const campaignId = this.uuid(campaignIdRaw);
    const existing = await this.db.one("SELECT * FROM in_app_campaigns WHERE id=$1", [campaignId]);
    if (!existing) throw new NotFoundException("campaign not found");

    const title = String(body?.title ?? existing.title).trim().slice(0, 180);
    if (!title) throw new BadRequestException("campaign title required");
    const targetUrl = this.cleanTargetUrl(body?.targetUrl ?? existing.target_url);
    const ctaLabel = String(body?.ctaLabel ?? existing.cta_label).trim().slice(0, 120) || "ดูรายละเอียด";
    const status = String(body?.status ?? existing.status).toUpperCase();
    if (!CAMPAIGN_STATUSES.has(status)) throw new BadRequestException("invalid campaign status");
    const priority = Math.max(-9999, Math.min(9999, Math.trunc(Number(body?.priority ?? existing.priority ?? 0))));
    const startsAt = body?.startsAt ? new Date(String(body.startsAt)) : new Date(existing.starts_at);
    const endsAt = body?.endsAt === null || body?.endsAt === ""
      ? null
      : body?.endsAt
        ? new Date(String(body.endsAt))
        : existing.ends_at ? new Date(existing.ends_at) : null;
    if (!Number.isFinite(startsAt.getTime())) throw new BadRequestException("invalid start date");
    if (endsAt && !Number.isFinite(endsAt.getTime())) throw new BadRequestException("invalid end date");
    if (endsAt && endsAt <= startsAt) throw new BadRequestException("end date must be after start date");
    const settings = this.normalizeSettings(body?.settings ?? existing.settings);

    return this.db.transaction(async client => {
      const updated = await client.query(
        `UPDATE in_app_campaigns
         SET title=$2,target_url=$3,cta_label=$4,status=$5,priority=$6,
             starts_at=$7,ends_at=$8,settings=$9::jsonb,updated_at=now()
         WHERE id=$1
         RETURNING id,code,title,status,updated_at`,
        [
          campaignId,
          title,
          targetUrl,
          ctaLabel,
          status,
          priority,
          startsAt.toISOString(),
          endsAt?.toISOString() || null,
          JSON.stringify(settings)
        ]
      );
      if (Array.isArray(body?.schedules)) {
        await this.replaceSchedules(client, campaignId, body.schedules);
      }
      return updated.rows[0];
    });
  }

  async adminSetStatus(campaignIdRaw: unknown, statusRaw: unknown) {
    const campaignId = this.uuid(campaignIdRaw);
    const status = String(statusRaw || "").toUpperCase();
    if (!CAMPAIGN_STATUSES.has(status)) {
      throw new BadRequestException("invalid campaign status");
    }
    const row = await this.db.one(
      `UPDATE in_app_campaigns
       SET status=$2,updated_at=now()
       WHERE id=$1
       RETURNING id,code,title,status,updated_at`,
      [campaignId, status]
    );
    if (!row) throw new NotFoundException("campaign not found");
    return row;
  }

  async adminUploadAsset(campaignIdRaw: unknown, body: any) {
    const campaignId = this.uuid(campaignIdRaw);
    const exists = await this.db.one("SELECT id FROM in_app_campaigns WHERE id=$1", [campaignId]);
    if (!exists) throw new NotFoundException("campaign not found");

    const assetKind = String(body?.assetKind || "").toUpperCase();
    if (!ASSET_KINDS.has(assetKind)) throw new BadRequestException("invalid asset kind");
    const dataUrl = String(body?.dataUrl || "");
    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new BadRequestException("image must be PNG, JPEG or WEBP");

    const contentType = match[1];
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length) throw new BadRequestException("empty image");
    if (bytes.length > MAX_ASSET_BYTES) throw new BadRequestException("image exceeds 4 MB");

    return this.db.transaction(async client => {
      await client.query(
        "DELETE FROM in_app_campaign_assets WHERE campaign_id=$1 AND asset_kind=$2",
        [campaignId, assetKind]
      );
      const inserted = await client.query(
        `INSERT INTO in_app_campaign_assets(campaign_id,asset_kind,content_type,content,size_bytes)
         VALUES($1,$2,$3,$4,$5)
         RETURNING id`,
        [campaignId, assetKind, contentType, bytes, bytes.length]
      );
      const assetId = inserted.rows[0].id;
      const assetUrl = `/backend/api/in-app-campaign-assets/${assetId}`;
      const column = assetKind === "MOBILE" ? "mobile_image_url" : "image_url";
      await client.query(
        `UPDATE in_app_campaigns SET ${column}=$2,updated_at=now() WHERE id=$1`,
        [campaignId, assetUrl]
      );
      return { ok: true, assetId, assetKind, assetUrl, sizeBytes: bytes.length };
    });
  }

  async adminRemoveAsset(campaignIdRaw: unknown, assetKindRaw: unknown) {
    const campaignId = this.uuid(campaignIdRaw);
    const assetKind = String(assetKindRaw || "").toUpperCase();
    if (!ASSET_KINDS.has(assetKind)) throw new BadRequestException("invalid asset kind");
    return this.db.transaction(async client => {
      await client.query(
        "DELETE FROM in_app_campaign_assets WHERE campaign_id=$1 AND asset_kind=$2",
        [campaignId, assetKind]
      );
      const column = assetKind === "MOBILE" ? "mobile_image_url" : "image_url";
      const updated = await client.query(
        `UPDATE in_app_campaigns SET ${column}=NULL,updated_at=now() WHERE id=$1 RETURNING id`,
        [campaignId]
      );
      if (!updated.rowCount) throw new NotFoundException("campaign not found");
      return { ok: true, assetKind };
    });
  }

  async asset(assetIdRaw: unknown) {
    const assetId = this.uuid(assetIdRaw);
    const row = await this.db.one(
      "SELECT content_type,content,size_bytes FROM in_app_campaign_assets WHERE id=$1",
      [assetId]
    );
    if (!row) throw new NotFoundException("campaign asset not found");
    return {
      contentType: String(row.content_type || "application/octet-stream"),
      content: row.content as Buffer,
      sizeBytes: Number(row.size_bytes || 0)
    };
  }

  async record(
    userId: string,
    campaignIdRaw: unknown,
    body: { eventType?: unknown; slotCode?: unknown; path?: unknown }
  ) {
    const campaignId = this.uuid(campaignIdRaw);
    const eventType = String(body?.eventType || "").toUpperCase();
    if (!EVENT_TYPES.has(eventType)) throw new BadRequestException("invalid campaign event");
    const slotCode = String(body?.slotCode || "").trim().toUpperCase().slice(0, 32);
    if (!slotCode) throw new BadRequestException("campaign slot required");
    const exists = await this.db.one(
      `SELECT 1
       FROM in_app_campaign_schedules
       WHERE campaign_id=$1 AND slot_code=$2 AND enabled=true`,
      [campaignId, slotCode]
    );
    if (!exists) throw new BadRequestException("invalid campaign slot");

    const { dateKey } = this.bangkokClock();
    const path = this.cleanPath(body?.path);
    await this.db.query(
      `INSERT INTO in_app_campaign_events(
         campaign_id,user_id,event_type,slot_code,event_date,path
       ) VALUES($1,$2,$3,$4,$5::date,$6)
       ON CONFLICT DO NOTHING`,
      [campaignId, userId, eventType, slotCode, dateKey, path]
    );
    return { ok: true };
  }
}
