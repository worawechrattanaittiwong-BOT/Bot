import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
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

const EVENT_TYPES = new Set(["VIEW", "CLOSE", "CLICK", "HIDE_TODAY"]);

@Injectable()
export class InAppCampaignService implements OnModuleInit {
  constructor(private readonly db: DbService) {}

  async onModuleInit() {
    // Keep production deploys safe even when the SQL migration is applied later.
    // database/048_in_app_campaigns.sql remains the canonical schema.
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
      ON CONFLICT(code) DO UPDATE SET
        title=EXCLUDED.title,
        image_url=EXCLUDED.image_url,
        mobile_image_url=EXCLUDED.mobile_image_url,
        target_url=EXCLUDED.target_url,
        cta_label=EXCLUDED.cta_label,
        priority=EXCLUDED.priority,
        settings=EXCLUDED.settings,
        updated_at=now();

      INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
      SELECT id,'MORNING',420,659,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
      ON CONFLICT(campaign_id,slot_code) DO UPDATE SET
        start_minute=EXCLUDED.start_minute,end_minute=EXCLUDED.end_minute,enabled=true;

      INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
      SELECT id,'MIDDAY',660,899,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
      ON CONFLICT(campaign_id,slot_code) DO UPDATE SET
        start_minute=EXCLUDED.start_minute,end_minute=EXCLUDED.end_minute,enabled=true;

      INSERT INTO in_app_campaign_schedules(campaign_id,slot_code,start_minute,end_minute,enabled)
      SELECT id,'EVENING',1020,1319,true FROM in_app_campaigns WHERE code='REFERRAL_NETWORK'
      ON CONFLICT(campaign_id,slot_code) DO UPDATE SET
        start_minute=EXCLUDED.start_minute,end_minute=EXCLUDED.end_minute,enabled=true;
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

  private cleanPath(input: unknown) {
    const value = String(input || "/").split("?")[0].trim() || "/";
    return value.startsWith("/") ? value.slice(0, 240) : "/";
  }

  private stringList(value: unknown) {
    return Array.isArray(value)
      ? value.map(item => String(item || "").trim()).filter(Boolean)
      : [];
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

  async adminSetStatus(campaignIdRaw: unknown, statusRaw: unknown) {
    const campaignId = String(campaignIdRaw || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
      throw new BadRequestException("invalid campaign id");
    }
    const status = String(statusRaw || "").toUpperCase();
    if (!["ACTIVE","PAUSED","ARCHIVED"].includes(status)) {
      throw new BadRequestException("invalid campaign status");
    }
    const row = await this.db.one(
      `UPDATE in_app_campaigns
       SET status=$2,updated_at=now()
       WHERE id=$1
       RETURNING id,code,title,status,updated_at`,
      [campaignId, status]
    );
    if (!row) throw new BadRequestException("campaign not found");
    return row;
  }

  async record(
    userId: string,
    campaignIdRaw: unknown,
    body: { eventType?: unknown; slotCode?: unknown; path?: unknown }
  ) {
    const campaignId = String(campaignIdRaw || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
      throw new BadRequestException("invalid campaign id");
    }
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
