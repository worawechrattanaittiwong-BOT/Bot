import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards
} from "@nestjs/common";
import { DbService } from "./db.service";
import { AdminGuard } from "./security";
import { MaintenanceService } from "./maintenance.service";
import { TradingModeControlService, TRADE_MODES } from "./trading-mode-control.service";
import { PartnerService } from "./partner.service";
import { ReferralService } from "./referral.service";
import { TrialAuthorizationService } from "./trial-authorization.service";
import { createHash, randomBytes, randomUUID } from "crypto";
import { versionAtLeast } from "./cloud-server-release";
import { exactConnectedAccountSymbol } from "./connected-symbol-choices";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly db: DbService,
    private readonly maintenance: MaintenanceService,
    private readonly tradingModes: TradingModeControlService,
    private readonly partner: PartnerService,
    private readonly referrals: ReferralService,
    private readonly trials: TrialAuthorizationService
  ) {}

  @Get("users")
  async users(@Query("q") q = "") {
    const term = "%" + q.trim() + "%";
    const result = await this.db.query(
      `SELECT
         u.id,u.user_code,u.email,u.role,u.status,u.created_at,u.email_verified_at,
         x.slot_id,x.slot_subscription_id,x.mt5_account_id,x.account_number,x.broker_server,x.mode,
         x.actual_state,x.desired_state,x.mt5_online,
         s.subscription_id,s.plan_code,s.subscription_mode,s.subscription_status,s.subscription_starts_at,s.subscription_expires_at,s.plan_slots,s.allow_resale,s.subscription_active,
         COALESCE(ms.memberships,'[]'::jsonb) memberships,
         t.trial_status,t.trial_expires_at,t.trial_duration_minutes,t.trial_started_at,t.trial_group_id,t.trial_group_name,t.trial_group_enabled,
         ta.trial_authorization_status,ta.trial_authorization_minutes,ta.trial_authorization_approved_at,ta.trial_authorization_blocked_reason,
         ta.trial_authorization_group_id,ta.trial_authorization_group_name,ta.trial_authorization_group_enabled,
         tr.trial_request_id,tr.line_contact,tr.request_ip,tr.trial_request_status,
         COALESCE(ss.total_slots,0)::int total_slots,
         COALESCE(ss.assigned_slots,0)::int assigned_slots,
         COALESCE(ss.partner_slots,0)::int partner_slots,
         COALESCE(cs.customer_slots,'[]'::jsonb) customer_slots,
         COALESCE(ip.ip_user_count,0)::int ip_user_count,
         COALESCE(ip.ip_trial_count,0)::int ip_trial_count,
         CASE
           WHEN pa.status='READY' AND pa.activation_deadline_at<=now() THEN 'EXPIRED'
           WHEN pa.status='ACTIVE' AND pa.expires_at IS NOT NULL AND pa.expires_at<=now() THEN 'EXPIRED'
           ELSE pa.status
         END AS partner_status,
         pa.seat_limit AS partner_seat_limit,
         pa.customer_duration_days AS partner_customer_duration_days,
         pa.partner_duration_days,
         pa.activation_deadline_at AS partner_activation_deadline_at,
         pa.activated_at AS partner_activated_at,
         pa.expires_at AS partner_expires_at,
         COALESCE(pc.active_customers,0)::int AS partner_active_customers
       FROM users u
       LEFT JOIN LATERAL (
         SELECT
           ls.id slot_id,ls.subscription_id slot_subscription_id,
           a.id mt5_account_id,a.account_number,a.broker_server,ls.mode,
           bi.actual_state,bi.desired_state,
           (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') mt5_online
         FROM license_slots ls
         LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
         LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
         WHERE ls.assigned_user_id=u.id
         ORDER BY
           CASE WHEN a.status='ACTIVE' THEN 0 ELSE 1 END,
           COALESCE(bi.last_seen_at,ls.created_at) DESC
         LIMIT 1
       ) x ON true
       LEFT JOIN LATERAL (
         SELECT
           sub.id subscription_id,
           sub.status subscription_status,
           sub.starts_at subscription_starts_at,
           sub.expires_at subscription_expires_at,
           p.code plan_code,
           p.mode subscription_mode,
           p.max_mt5_accounts plan_slots,
           p.allow_resale,
           (sub.status='ACTIVE' AND sub.starts_at<=now() AND sub.expires_at>now()) subscription_active
         FROM subscriptions sub
         JOIN plans p ON p.id=sub.plan_id
         WHERE sub.user_id=u.id
         ORDER BY
           CASE WHEN sub.status='ACTIVE' AND sub.starts_at<=now() AND sub.expires_at>now() THEN 0 ELSE 1 END,
           sub.expires_at DESC,
           sub.created_at DESC
         LIMIT 1
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           jsonb_build_object(
             'subscription_id',sub.id,
             'plan_code',p.code,
             'mode',p.mode,
             'status',sub.status,
             'starts_at',sub.starts_at,
             'expires_at',sub.expires_at,
             'slots',p.max_mt5_accounts,
             'allow_resale',p.allow_resale,
             'slot_type',(
               SELECT ls4.slot_type
               FROM license_slots ls4
               WHERE ls4.subscription_id=sub.id
                 AND ls4.status<>'DELETED'
               ORDER BY ls4.slot_number,ls4.created_at
               LIMIT 1
             ),
             'slot_number',(
               SELECT ls4.slot_number
               FROM license_slots ls4
               WHERE ls4.subscription_id=sub.id
                 AND ls4.status<>'DELETED'
               ORDER BY ls4.slot_number,ls4.created_at
               LIMIT 1
             ),
             'group_id',NULL,
             'group_name',NULL,
             'group_enabled',true,
             'active',(sub.status='ACTIVE' AND sub.starts_at<=now() AND sub.expires_at>now())
           )
           ORDER BY p.mode,sub.expires_at DESC
         ) AS memberships
         FROM subscriptions sub
         JOIN plans p ON p.id=sub.plan_id
         WHERE sub.user_id=u.id
           AND sub.status='ACTIVE'
           AND sub.expires_at>now()
       ) ms ON true
       LEFT JOIN LATERAL (
         SELECT tg.status trial_status,tg.expires_at trial_expires_at,
                tg.duration_minutes trial_duration_minutes,tg.started_at trial_started_at,
                tg.access_group_id trial_group_id,
                ag.name trial_group_name,
                COALESCE(ag.enabled,true) trial_group_enabled
         FROM trial_grants tg
         LEFT JOIN access_groups ag ON ag.id=tg.access_group_id
         WHERE tg.user_id=u.id
         ORDER BY tg.created_at DESC
         LIMIT 1
       ) t ON true
       LEFT JOIN LATERAL (
         SELECT
           auth.status trial_authorization_status,
           auth.duration_minutes trial_authorization_minutes,
           auth.approved_at trial_authorization_approved_at,
           auth.blocked_reason trial_authorization_blocked_reason,
           auth.access_group_id trial_authorization_group_id,
           ag.name trial_authorization_group_name,
           COALESCE(ag.enabled,true) trial_authorization_group_enabled
         FROM trial_authorizations auth
         LEFT JOIN access_groups ag ON ag.id=auth.access_group_id
         WHERE auth.user_id=u.id
         LIMIT 1
       ) ta ON true
       LEFT JOIN LATERAL (
         SELECT trq.id trial_request_id,trq.line_contact,trq.request_ip,trq.status trial_request_status
         FROM trial_requests trq
         WHERE trq.user_id=u.id
         ORDER BY trq.created_at DESC
         LIMIT 1
       ) tr ON true
       LEFT JOIN LATERAL (
         SELECT
           count(*)::int total_slots,
           count(*) FILTER (WHERE ls2.assigned_user_id IS NOT NULL)::int assigned_slots,
           count(*) FILTER (WHERE ls2.slot_type='PARTNER')::int partner_slots
         FROM license_slots ls2
         WHERE ls2.owner_user_id=u.id AND ls2.status<>'DELETED'
       ) ss ON true
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           jsonb_build_object(
             'id',ls3.id,
             'slot_number',ls3.slot_number,
             'slot_type',ls3.slot_type,
             'mode',ls3.mode,
             'status',ls3.status,
             'label',ls3.label,
             'subscription_id',ls3.subscription_id,
             'device_status',bi3.device_status,
             'device_hostname',bi3.device_hostname,
             'device_online',(bi3.device_last_seen_at IS NOT NULL AND bi3.device_last_seen_at > now() - interval '90 seconds'),
             'mt5_online',(bi3.last_seen_at IS NOT NULL AND bi3.last_seen_at > now() - interval '20 seconds'),
             'actual_state',bi3.actual_state,
             'desired_state',bi3.desired_state,
             'positions',COALESCE(NULLIF(bi3.metrics->>'positions','')::int,0),
             'pending_orders',COALESCE(NULLIF(bi3.metrics->>'accountScenovaPendingOrders','')::int,0),
             'account_number',a3.account_number,
             'broker_server',a3.broker_server,
             'active_symbol',bi3.metrics->>'symbol',
             'requested_symbol',COALESCE(NULLIF(bs3.settings->>'startupSymbol',''),NULLIF(bs3.settings->>'symbol','')),
             'symbol_selected_by',bs3.settings->>'symbolSelectedBy',
             'symbol_resolution_mode',bs3.settings->>'symbolResolutionMode',
             'market_watch_symbols',COALESCE(bi3.metrics->'marketWatchSymbols','[]'::jsonb),
             'symbol_change_status',bi3.metrics->>'symbolChangeStatus',
             'symbol_change_requested_at',bi3.metrics->>'symbolChangeRequestedAt',
             'symbol_change_error',bi3.metrics->>'manualMt5ActionMessage',
             'last_seen_at',bi3.last_seen_at,
             'mt5_online',(bi3.last_seen_at IS NOT NULL AND bi3.last_seen_at>now()-interval '20 seconds'),
             'runner_online',EXISTS(SELECT 1 FROM worker_nodes sw
               WHERE sw.runner_id=bi3.runner_id AND sw.last_seen_at>now()-interval '90 seconds'),
             'terminal_connected',bi3.metrics->'terminalConnected',
             'provisioning_error',bi3.provisioning_error
           )
           ORDER BY ls3.mode,ls3.slot_number
         ) AS customer_slots
         FROM license_slots ls3
         LEFT JOIN bot_instances bi3 ON bi3.slot_id=ls3.id
         LEFT JOIN mt5_accounts a3 ON a3.id=bi3.mt5_account_id
         LEFT JOIN bot_settings bs3 ON bs3.bot_instance_id=bi3.id
         WHERE ls3.assigned_user_id=u.id
           AND ls3.status<>'DELETED'
       ) cs ON true
       LEFT JOIN LATERAL (
         SELECT
           count(DISTINCT ae.user_id) FILTER (WHERE ae.user_id IS NOT NULL)::int ip_user_count,
           (SELECT count(*)::int FROM trial_grants tg2 WHERE tg2.request_ip=tr.request_ip) ip_trial_count
         FROM auth_events ae
         WHERE tr.request_ip IS NOT NULL AND ae.ip_address=tr.request_ip
       ) ip ON true
       LEFT JOIN partner_accounts pa ON pa.user_id=u.id
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS active_customers
         FROM partner_customers pc2
         WHERE pc2.partner_user_id=u.id
           AND pc2.status='ACTIVE'
           AND pc2.expires_at>now()
       ) pc ON true
       WHERE u.status<>'DELETED'
         AND (
           u.user_code ILIKE $1 OR u.email ILIKE $1 OR
           COALESCE(x.account_number,'') ILIKE $1 OR
           COALESCE(tr.line_contact,'') ILIKE $1
         )
       ORDER BY u.created_at DESC
       LIMIT 50`,
      [term]
    );
    return result.rows;
  }

  @Get("access-groups")
  async accessGroups() {
    const rows = await this.db.query(
      `SELECT ag.id,ag.name,ag.enabled,ag.note,ag.trial_days,ag.created_by,ag.created_at,ag.updated_at,
              (
                SELECT count(DISTINCT gg.user_id)::int
                FROM access_group_grants gg
                WHERE gg.access_group_id=ag.id
                  AND gg.status='ACTIVE'
                  AND gg.expires_at>now()
              ) AS trial_count,
              (
                SELECT count(DISTINCT gg.user_id)::int
                FROM access_group_grants gg
                WHERE gg.access_group_id=ag.id
                  AND gg.status='ACTIVE'
                  AND gg.expires_at>now()
                  AND EXISTS (
                    SELECT 1
                    FROM subscriptions s
                    WHERE s.user_id=gg.user_id
                      AND s.status='ACTIVE'
                      AND s.starts_at<=now()
                      AND s.expires_at>now()
                  )
              ) AS paid_member_count
       FROM access_groups ag
       ORDER BY lower(ag.name),ag.created_at`
    );
    return rows.rows;
  }

  @Post("access-groups/create")
  async createAccessGroup(@Body() body: { name: string; note?: string; trialDays?: number }) {
    const name = String(body.name || "").trim().slice(0, 80);
    const trialDays = Math.max(1, Math.min(365, Math.trunc(Number(body.trialDays) || 1)));
    if (name.length < 2) throw new ConflictException("ชื่อกลุ่มต้องมีอย่างน้อย 2 ตัวอักษร");
    const existing = await this.db.one(
      "SELECT id FROM access_groups WHERE lower(name)=lower($1) LIMIT 1",
      [name]
    );
    if (existing) throw new ConflictException("มีกลุ่มชื่อนี้อยู่แล้ว");
    const row = await this.db.one(
      `INSERT INTO access_groups(name,note,trial_days,created_by)
       VALUES($1,$2,$3,'OWNER')
       RETURNING *`,
      [name, String(body.note || "").trim().slice(0, 500) || null, trialDays]
    );
    await this.audit("OWNER", "CREATE_ACCESS_GROUP", "access_group", row.id, { name: row.name, trialDays });
    return row;
  }

  @Get("access-groups/members")
  async accessGroupMembers(@Query("groupId") groupId = "") {
    const group = await this.db.one("SELECT id,name FROM access_groups WHERE id=$1", [groupId]);
    if (!group) throw new ConflictException("ไม่พบกลุ่มทดลอง");
    const rows = await this.db.query(
      `SELECT
         gg.id::text AS ref_id,
         gg.user_id::text AS user_id,
         u.user_code,
         u.email,
         gg.mode,
         gg.status,
         gg.starts_at,
         gg.expires_at,
         EXISTS (
           SELECT 1
           FROM subscriptions s
           JOIN plans p ON p.id=s.plan_id
           WHERE s.user_id=gg.user_id
             AND s.status='ACTIVE'
             AND s.starts_at<=now()
             AND s.expires_at>now()
             AND p.mode='LOCAL'
         ) AS paid_local,
         EXISTS (
           SELECT 1
           FROM subscriptions s
           JOIN plans p ON p.id=s.plan_id
           WHERE s.user_id=gg.user_id
             AND s.status='ACTIVE'
             AND s.starts_at<=now()
             AND s.expires_at>now()
             AND p.mode='CLOUD'
         ) AS paid_cloud
       FROM access_group_grants gg
       JOIN users u ON u.id=gg.user_id
       WHERE gg.access_group_id=$1
         AND gg.status='ACTIVE'
         AND gg.expires_at>now()
       ORDER BY lower(u.user_code),gg.mode,gg.expires_at DESC`,
      [groupId]
    );
    return { group, members: rows.rows };
  }

  @Post("access-groups/set-trial-days")
  async setAccessGroupTrialDays(@Body() body: { groupId: string; days: number }) {
    const days = Math.max(1, Math.min(365, Math.trunc(Number(body.days) || 1)));
    const row = await this.db.one(
      "UPDATE access_groups SET trial_days=$2,updated_at=now() WHERE id=$1 RETURNING *",
      [body.groupId, days]
    );
    if (!row) throw new ConflictException("ไม่พบกลุ่มสิทธิ์");
    await this.audit("OWNER", "SET_ACCESS_GROUP_TRIAL_DAYS", "access_group", row.id, {
      name: row.name,
      trialDays: days
    });
    return row;
  }

  @Post("access-groups/grant")
  async grantAccessGroup(@Body() body: {
    groupId: string;
    userId: string;
    mode: "LOCAL" | "CLOUD";
    days?: number;
  }) {
    const mode = String(body.mode || "").toUpperCase();
    if (!["LOCAL","CLOUD"].includes(mode)) {
      throw new ConflictException("โหมดสิทธิ์ต้องเป็น Local หรือ Cloud VPS");
    }

    const group = await this.db.one(
      "SELECT id,name,enabled,trial_days FROM access_groups WHERE id=$1",
      [body.groupId]
    );
    if (!group) throw new ConflictException("ไม่พบกลุ่มทดลอง");
    if (!group.enabled) throw new ConflictException("กลุ่มทดลองนี้ปิดอยู่ กรุณาเปิดกลุ่มก่อน");

    const user = await this.db.one(
      "SELECT id,user_code,role,status FROM users WHERE id=$1",
      [body.userId]
    );
    if (!user || user.status !== "ACTIVE") throw new ConflictException("บัญชีลูกค้าไม่พร้อมใช้งาน");
    if (user.role === "OWNER" || user.role === "ADMIN") {
      throw new ConflictException("OWNER/ADMIN มีสิทธิ์ถาวรอยู่แล้ว");
    }

    const days = Math.max(
      1,
      Math.min(365, Math.trunc(Number(body.days || group.trial_days || 1)))
    );
    const grant = await this.db.one(
      `INSERT INTO access_group_grants(
         access_group_id,user_id,mode,starts_at,expires_at,status,created_by
       )
       VALUES($1,$2,$3,now(),now()+make_interval(days=>$4::int),'ACTIVE','OWNER')
       ON CONFLICT(access_group_id,user_id,mode) DO UPDATE SET
         starts_at=now(),
         expires_at=now()+make_interval(days=>$4::int),
         status='ACTIVE',
         created_by='OWNER',
         updated_at=now()
       RETURNING *`,
      [body.groupId, body.userId, mode, days]
    );

    let slot = await this.db.one(
      `SELECT id,mode,status,subscription_id,slot_number
       FROM license_slots
       WHERE assigned_user_id=$1
         AND mode=$2
         AND status<>'DELETED'
       ORDER BY CASE WHEN subscription_id IS NOT NULL THEN 0 ELSE 1 END,slot_number,created_at
       LIMIT 1`,
      [body.userId, mode]
    );
    if (!slot) {
      const max = mode === "LOCAL"
        ? { max_slot: 0 }
        : await this.db.one(
            "SELECT COALESCE(max(slot_number),0)::int max_slot FROM license_slots WHERE owner_user_id=$1 AND mode=$2",
            [body.userId, mode]
          );
      slot = await this.db.one(
        `INSERT INTO license_slots(
           owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label
         )
         VALUES($1,$1,NULL,$2,$3,'PERSONAL','ACTIVE',$4)
         RETURNING id,mode,status,subscription_id,slot_number`,
        [
          body.userId,
          mode,
          mode === "LOCAL" ? 1 : Number(max?.max_slot || 0) + 1,
          mode === "CLOUD" ? "Group Trial VPS" : "Group Trial Local"
        ]
      );
    } else if (mode === "LOCAL" && slot.status !== "ACTIVE") {
      slot = await this.db.one(
        "UPDATE license_slots SET assigned_user_id=$2,status='ACTIVE',slot_number=1,updated_at=now() WHERE id=$1 RETURNING id,mode,status,subscription_id,slot_number",
        [slot.id, body.userId]
      );
    }

    await this.audit("OWNER", "GRANT_ACCESS_GROUP", "access_group_grant", grant.id, {
      groupId: group.id,
      groupName: group.name,
      userId: body.userId,
      userCode: user.user_code,
      mode,
      days,
      expiresAt: grant.expires_at,
      paidMembershipUnaffected: true
    });
    return { ...grant, groupName: group.name, userCode: user.user_code, days, slot };
  }

  @Post("access-groups/delete")
  async deleteAccessGroup(@Body() body: { groupId: string }) {
    const group = await this.db.one(
      `SELECT ag.*,
              (
                SELECT count(DISTINCT gg.user_id)::int
                FROM access_group_grants gg
                WHERE gg.access_group_id=ag.id
                  AND gg.status='ACTIVE'
                  AND gg.expires_at>now()
              ) AS trial_count
       FROM access_groups ag
       WHERE ag.id=$1`,
      [body.groupId]
    );
    if (!group) throw new ConflictException("ไม่พบกลุ่มทดลอง");

    const affected = await this.db.query(
      `WITH target AS (
         SELECT DISTINCT bi.id
         FROM access_group_grants gg
         JOIN users u ON u.id=gg.user_id
         JOIN bot_instances bi ON bi.mode=gg.mode
         LEFT JOIN mt5_accounts ma ON ma.id=bi.mt5_account_id
         LEFT JOIN license_slots ls ON ls.id=bi.slot_id
         WHERE gg.access_group_id=$1
           AND gg.status='ACTIVE'
           AND gg.expires_at>now()
           AND COALESCE(ls.assigned_user_id,ma.user_id)=gg.user_id
           AND u.role NOT IN ('OWNER','ADMIN')
           AND NOT EXISTS (
             SELECT 1
             FROM subscriptions s
             JOIN plans p ON p.id=s.plan_id
             WHERE s.user_id=gg.user_id
               AND s.status='ACTIVE'
               AND s.starts_at<=now()
               AND s.expires_at>now()
               AND p.mode=gg.mode
           )
           AND NOT (
             gg.mode='LOCAL'
             AND EXISTS (
               SELECT 1
               FROM partner_accounts pa
               WHERE pa.user_id=gg.user_id
                 AND pa.status='ACTIVE'
                 AND pa.expires_at>now()
             )
           )
       ),
       stopped AS (
         UPDATE bot_instances bi
         SET desired_state='SAFE_STOP'
         FROM target t
         WHERE bi.id=t.id
           AND bi.desired_state<>'SAFE_STOP'
           AND (
             bi.desired_state IN ('RUNNING','STARTING')
             OR bi.actual_state='RUNNING'
             OR COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0
           )
         RETURNING bi.id
       )
       SELECT id FROM stopped`,
      [body.groupId]
    );
    if (affected.rows.length) {
      await this.db.query(
        `INSERT INTO bot_commands(bot_instance_id,command)
         SELECT id,'SAFE_STOP' FROM unnest($1::uuid[]) AS x(id)`,
        [affected.rows.map((item:any)=>item.id)]
      );
    }

    // Clean up the short-lived legacy implementation too. Paid subscriptions
    // are deliberately left untouched.
    const expiredLegacy = await this.db.query(
      `UPDATE trial_grants
       SET status='EXPIRED',
           expires_at=LEAST(COALESCE(expires_at,now()),now())
       WHERE access_group_id=$1
         AND status IN ('APPROVED','ACTIVE')
       RETURNING id`,
      [body.groupId]
    );
    const blockedLegacy = await this.db.query(
      `UPDATE trial_authorizations
       SET status='BLOCKED',
           blocked_reason='GROUP_DELETED',
           updated_at=now()
       WHERE access_group_id=$1
         AND status<>'BLOCKED'
       RETURNING id`,
      [body.groupId]
    );
    await this.db.query(
      "UPDATE subscriptions SET access_group_id=NULL WHERE access_group_id=$1",
      [body.groupId]
    );

    await this.db.query("DELETE FROM access_groups WHERE id=$1", [body.groupId]);

    await this.audit("OWNER", "DELETE_ACCESS_GROUP", "access_group", body.groupId, {
      name: group.name,
      trialCount: Number(group.trial_count || 0),
      safeStopped: affected.rowCount || 0,
      expiredLegacyTrials: expiredLegacy.rowCount || 0,
      blockedLegacyAuthorizations: blockedLegacy.rowCount || 0,
      paidMembershipsKept: true
    });
    return {
      ok: true,
      name: group.name,
      trialCount: Number(group.trial_count || 0),
      safeStopped: affected.rowCount || 0,
      paidMembershipsKept: true
    };
  }

  @Post("access-groups/toggle")
  async toggleAccessGroup(@Body() body: { groupId: string; enabled: boolean }) {
    const enabled = Boolean(body.enabled);
    const row = await this.db.one(
      `UPDATE access_groups SET enabled=$2,updated_at=now()
       WHERE id=$1 RETURNING *`,
      [body.groupId, enabled]
    );
    if (!row) throw new ConflictException("ไม่พบกลุ่มทดลอง");

    let safeStopped = 0;
    if (!enabled) {
      const affected = await this.db.query(
        `WITH target AS (
           SELECT DISTINCT bi.id
           FROM access_group_grants gg
           JOIN users u ON u.id=gg.user_id
           JOIN bot_instances bi ON bi.mode=gg.mode
           LEFT JOIN mt5_accounts ma ON ma.id=bi.mt5_account_id
           LEFT JOIN license_slots ls ON ls.id=bi.slot_id
           WHERE gg.access_group_id=$1
             AND gg.status='ACTIVE'
             AND gg.expires_at>now()
             AND COALESCE(ls.assigned_user_id,ma.user_id)=gg.user_id
             AND u.role NOT IN ('OWNER','ADMIN')
             AND NOT EXISTS (
               SELECT 1
               FROM subscriptions s
               JOIN plans p ON p.id=s.plan_id
               WHERE s.user_id=gg.user_id
                 AND s.status='ACTIVE'
                 AND s.starts_at<=now()
                 AND s.expires_at>now()
                 AND p.mode=gg.mode
             )
             AND NOT (
               gg.mode='LOCAL'
               AND EXISTS (
                 SELECT 1
                 FROM partner_accounts pa
                 WHERE pa.user_id=gg.user_id
                   AND pa.status='ACTIVE'
                   AND pa.expires_at>now()
               )
             )
         ),
         stopped AS (
           UPDATE bot_instances bi
           SET desired_state='SAFE_STOP'
           FROM target t
           WHERE bi.id=t.id
             AND bi.desired_state<>'SAFE_STOP'
             AND (
               bi.desired_state IN ('RUNNING','STARTING')
               OR bi.actual_state='RUNNING'
               OR COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0
             )
           RETURNING bi.id
         )
         SELECT id FROM stopped`,
        [body.groupId]
      );
      safeStopped = affected.rowCount || 0;
      if (affected.rows.length) {
        await this.db.query(
          `INSERT INTO bot_commands(bot_instance_id,command)
           SELECT id,'SAFE_STOP' FROM unnest($1::uuid[]) AS x(id)`,
          [affected.rows.map((item:any)=>item.id)]
        );
      }
    }

    await this.audit("OWNER", enabled ? "ENABLE_ACCESS_GROUP" : "DISABLE_ACCESS_GROUP", "access_group", row.id, {
      name: row.name,
      safeStopped,
      paidMembershipsUnaffected: true
    });
    return { ...row, safeStopped, paidMembershipsUnaffected: true };
  }

  @Post("subscriptions/set-group")
  async setSubscriptionGroup(@Body() body: { subscriptionId: string; groupId?: string | null }) {
    if (body.groupId) {
      throw new ConflictException("กลุ่มทดลองใช้กับ Trial เท่านั้น สมาชิกจริงจะไม่ถูกผูกกับกลุ่ม");
    }
    const row = await this.db.one(
      "UPDATE subscriptions SET access_group_id=NULL WHERE id=$1 RETURNING *",
      [body.subscriptionId]
    );
    if (!row) throw new ConflictException("subscription not found");
    await this.audit("OWNER", "DETACH_SUBSCRIPTION_GROUP", "subscription", row.id, {
      paidMembershipKept: true
    });
    return { ...row, group: null, paidMembershipKept: true };
  }

  @Post("trials/set-group")
  async setTrialGroup(@Body() body: { userId: string; groupId?: string | null }) {
    let group: any = null;
    if (body.groupId) {
      group = await this.db.one("SELECT id,name,enabled FROM access_groups WHERE id=$1", [body.groupId]);
      if (!group) throw new ConflictException("ไม่พบกลุ่มสิทธิ์");
    }
    await this.db.query(
      "UPDATE trial_grants SET access_group_id=$2 WHERE user_id=$1",
      [body.userId, body.groupId || null]
    );
    await this.db.query(
      "UPDATE trial_authorizations SET access_group_id=$2,updated_at=now() WHERE user_id=$1",
      [body.userId, body.groupId || null]
    );
    let safeStopped = 0;
    if (group && group.enabled === false) {
      const stopped = await this.db.query(
        `UPDATE bot_instances bi
         SET desired_state='SAFE_STOP'
         FROM trial_grants tg
         WHERE tg.mt5_account_id=bi.mt5_account_id
           AND tg.user_id=$1
           AND tg.access_group_id=$2
           AND NOT EXISTS (
             SELECT 1
             FROM subscriptions alt
             JOIN plans ap ON ap.id=alt.plan_id
             WHERE alt.user_id=tg.user_id
               AND alt.status='ACTIVE'
               AND alt.starts_at<=now()
               AND alt.expires_at>now()
               AND ap.mode=bi.mode
           )
           AND NOT (
             bi.mode='LOCAL'
             AND EXISTS (
               SELECT 1 FROM partner_accounts pa
               WHERE pa.user_id=tg.user_id
                 AND pa.status='ACTIVE'
                 AND pa.expires_at>now()
             )
           )
           AND (
             bi.desired_state IN ('RUNNING','STARTING')
             OR bi.actual_state='RUNNING'
             OR COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0
           )
         RETURNING bi.id`,
        [body.userId, group.id]
      );
      safeStopped = stopped.rowCount || 0;
      if (stopped.rows.length) {
        await this.db.query(
          `INSERT INTO bot_commands(bot_instance_id,command)
           SELECT id,'SAFE_STOP' FROM unnest($1::uuid[]) AS x(id)`,
          [stopped.rows.map((item:any)=>item.id)]
        );
      }
    }
    await this.audit("OWNER", "SET_TRIAL_GROUP", "user", body.userId, {
      groupId: group?.id || null,
      groupName: group?.name || null,
      safeStopped
    });
    return { ok: true, group, safeStopped };
  }

  @Post("access-groups/revoke-member")
  async revokeAccessGroupMember(@Body() body: { groupId: string; userId: string }) {
    const group = await this.db.one(
      "SELECT id,name FROM access_groups WHERE id=$1",
      [body.groupId]
    );
    if (!group) throw new ConflictException("ไม่พบกลุ่มทดลอง");

    const affected = await this.db.query(
      `WITH target AS (
         SELECT DISTINCT bi.id
         FROM access_group_grants gg
         JOIN users u ON u.id=gg.user_id
         JOIN bot_instances bi ON bi.mode=gg.mode
         LEFT JOIN mt5_accounts ma ON ma.id=bi.mt5_account_id
         LEFT JOIN license_slots ls ON ls.id=bi.slot_id
         WHERE gg.access_group_id=$1
           AND gg.user_id=$2
           AND gg.status='ACTIVE'
           AND gg.expires_at>now()
           AND COALESCE(ls.assigned_user_id,ma.user_id)=gg.user_id
           AND u.role NOT IN ('OWNER','ADMIN')
           AND NOT EXISTS (
             SELECT 1
             FROM subscriptions s
             JOIN plans p ON p.id=s.plan_id
             WHERE s.user_id=gg.user_id
               AND s.status='ACTIVE'
               AND s.starts_at<=now()
               AND s.expires_at>now()
               AND p.mode=gg.mode
           )
           AND NOT (
             gg.mode='LOCAL'
             AND EXISTS (
               SELECT 1
               FROM partner_accounts pa
               WHERE pa.user_id=gg.user_id
                 AND pa.status='ACTIVE'
                 AND pa.expires_at>now()
             )
           )
       ),
       stopped AS (
         UPDATE bot_instances bi
         SET desired_state='SAFE_STOP'
         FROM target t
         WHERE bi.id=t.id
           AND bi.desired_state<>'SAFE_STOP'
           AND (
             bi.desired_state IN ('RUNNING','STARTING')
             OR bi.actual_state='RUNNING'
             OR COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0
           )
         RETURNING bi.id
       )
       SELECT id FROM stopped`,
      [body.groupId, body.userId]
    );
    if (affected.rows.length) {
      await this.db.query(
        `INSERT INTO bot_commands(bot_instance_id,command)
         SELECT id,'SAFE_STOP' FROM unnest($1::uuid[]) AS x(id)`,
        [affected.rows.map((item:any)=>item.id)]
      );
    }

    const revoked = await this.db.query(
      `UPDATE access_group_grants
       SET status='REVOKED',
           expires_at=LEAST(expires_at,now()),
           updated_at=now()
       WHERE access_group_id=$1
         AND user_id=$2
         AND status='ACTIVE'
       RETURNING id,mode`,
      [body.groupId, body.userId]
    );

    // Clean any legacy Trial grouping for the same customer as well.
    await this.db.query(
      `UPDATE trial_grants
       SET status='EXPIRED',
           expires_at=LEAST(COALESCE(expires_at,now()),now())
       WHERE user_id=$1
         AND access_group_id=$2
         AND status IN ('APPROVED','ACTIVE')`,
      [body.userId, body.groupId]
    );
    await this.db.query(
      `UPDATE trial_authorizations
       SET status='BLOCKED',
           blocked_reason='REMOVED_FROM_GROUP',
           updated_at=now()
       WHERE user_id=$1
         AND access_group_id=$2
         AND status<>'BLOCKED'`,
      [body.userId, body.groupId]
    );

    await this.audit("OWNER", "REVOKE_ACCESS_GROUP_MEMBER", "user", body.userId, {
      groupId: body.groupId,
      groupName: group.name,
      revokedGrants: revoked.rowCount || 0,
      safeStopped: affected.rowCount || 0,
      paidMembershipsKept: true
    });
    return {
      ok: true,
      revokedGrants: revoked.rowCount || 0,
      safeStopped: affected.rowCount || 0,
      paidMembershipsKept: true
    };
  }

  @Get("trading-modes")
  async tradingModeControls() {
    return { modes: await this.tradingModes.list() };
  }

  @Post("trading-modes")
  async updateTradingModeControls(@Req() req: any, @Body() body: {mode?: string;enabled?: boolean;reason?: string}) {
    if (String(req.user?.role || "").toUpperCase() !== "OWNER") {
      throw new ForbiddenException("เฉพาะ OWNER เท่านั้นที่เปิดหรือปิดโหมดเทรดทั้งระบบได้");
    }
    const mode = String(body?.mode || "").trim().toUpperCase();
    if (!TRADE_MODES.includes(mode as any) || typeof body?.enabled !== "boolean") {
      throw new BadRequestException("โหมดหรือสถานะไม่ถูกต้อง");
    }
    const reason = String(body?.reason || "").trim();
    if (!body.enabled && (!reason || reason.length > 240)) {
      throw new BadRequestException("กรุณาระบุเหตุผลที่ปิดโหมดไม่เกิน 240 ตัวอักษร");
    }
    return this.tradingModes.setEnabled(mode, body.enabled, String(req.user?.sub || "OWNER"), reason);
  }

  @Get("sales-control")
  async salesControl() {
    const row = await this.db.one(
      "SELECT sales_paused,updated_by,updated_at FROM production_controls WHERE id=1"
    );
    return {
      salesPaused: Boolean(row?.sales_paused),
      updatedBy: row?.updated_by || null,
      updatedAt: row?.updated_at || null
    };
  }

  @Post("sales-control")
  async updateSalesControl(@Req() req: any, @Body() body: { paused: boolean }) {
    if (req.user?.role && String(req.user.role).toUpperCase() !== "OWNER") {
      throw new ForbiddenException("การเปิด/ปิดการขายทั้งหมดใช้ได้เฉพาะ OWNER เท่านั้น");
    }
    if (typeof body?.paused !== "boolean") {
      throw new ConflictException("สถานะการขายไม่ถูกต้อง");
    }
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    const row = await this.db.one(
      `UPDATE production_controls
       SET sales_paused=$1,updated_by=$2,updated_at=now()
       WHERE id=1
       RETURNING sales_paused,updated_by,updated_at`,
      [body.paused, actor]
    );
    await this.audit(
      actor,
      body.paused ? "PAUSE_ALL_PACKAGE_SALES" : "RESUME_ALL_PACKAGE_SALES",
      "production_controls",
      "1",
      { salesPaused: Boolean(row?.sales_paused) }
    );
    return {
      ok: true,
      salesPaused: Boolean(row?.sales_paused),
      updatedBy: row?.updated_by || actor,
      updatedAt: row?.updated_at || null
    };
  }

  @Get("system")
  async system() {
    const users = await this.db.one(
      "SELECT count(*) FILTER (WHERE status<>'DELETED')::int total, count(*) FILTER (WHERE status='ACTIVE')::int active FROM users"
    );
    const bots = await this.db.one(
      "SELECT count(*)::int total, count(*) FILTER (WHERE actual_state='RUNNING')::int running, count(*) FILTER (WHERE actual_state='OFFLINE')::int offline FROM bot_instances"
    );
    const slots = await this.db.one(
      "SELECT count(*)::int total,count(*) FILTER (WHERE status='ACTIVE')::int active,count(*) FILTER (WHERE slot_type='PARTNER')::int partner FROM license_slots WHERE status<>'DELETED'"
    );
    const workers = await this.db.query(
      "SELECT runner_id,region,hostname,capacity,active_instances,status,last_seen_at, CASE WHEN last_seen_at > now() - interval '30 seconds' THEN 'ONLINE' ELSE 'STALE' END health FROM worker_nodes ORDER BY runner_id"
    );
    const maintenance = await this.maintenance.snapshot();
    const announcement = await this.db.one("SELECT title,message,published_at FROM system_announcements WHERE id=1 AND active=true");
    return { users, bots, slots, workers: workers.rows, maintenance, announcement };
  }

  @Post("trials/authorize")
  async authorizeTrial(@Body() body: {
    userId: string;
    days: number;
    mt5AccountId?: string;
    approvedBy?: string;
    accessGroupId?: string | null;
  }) {
    let group: any = null;
    if (body.accessGroupId) {
      group = await this.db.one(
        "SELECT id,name,enabled,trial_days FROM access_groups WHERE id=$1",
        [body.accessGroupId]
      );
      if (!group) throw new ConflictException("ไม่พบกลุ่มทดลอง");
      if (!group.enabled) throw new ConflictException("กลุ่มทดลองนี้ปิดอยู่ กรุณาเปิดกลุ่มก่อนอนุมัติ Trial");
    }
    const effectiveDays = group
      ? Math.max(1, Math.min(365, Math.trunc(Number(group.trial_days) || 1)))
      : Math.max(1, Math.min(365, Math.trunc(Number(body.days) || 1)));
    return this.trials.authorizeUser({
      userId: body.userId,
      days: effectiveDays,
      mt5AccountId: body.mt5AccountId || null,
      approvedBy: body.approvedBy || "OWNER",
      accessGroupId: body.accessGroupId || null
    });
  }

  @Post("trials/grant")
  async grantTrial(@Body() body: {
    mt5AccountId: string;
    approvedBy?: string;
    minutes?: number;
  }) {
    const account = await this.db.one(
      "SELECT a.*,u.id user_id,u.user_code FROM mt5_accounts a JOIN users u ON u.id=a.user_id WHERE a.id=$1",
      [body.mt5AccountId]
    );
    if (!account) throw new ConflictException("MT5 account not found");

    const request = await this.db.one(
      "SELECT * FROM trial_requests WHERE user_id=$1 AND mt5_account_id=$2 AND status='PENDING' ORDER BY created_at DESC LIMIT 1",
      [account.user_id, account.id]
    );
    if (!request) {
      throw new ConflictException("ลูกค้าต้องส่งคำขอ Trial พร้อม LINE จากหน้า SCENOVA ก่อน");
    }

    const used = await this.db.one(
      `SELECT id,status,started_at,expires_at
       FROM trial_grants
       WHERE user_id=$1
          OR (line_contact IS NOT NULL AND lower(line_contact)=lower($2))
          OR (lower(account_number)=lower($3) AND lower(broker_server)=lower($4))
       LIMIT 1`,
      [account.user_id, request.line_contact, account.account_number, account.broker_server]
    );
    if (used) {
      throw new ConflictException("User / LINE / MT5 นี้เคยได้รับ Trial แล้ว");
    }

    const row = await this.db.one(
      "INSERT INTO trial_grants(user_id,mt5_account_id,account_number,broker_server,duration_minutes,approved_by,line_contact,request_ip) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [
        account.user_id,
        account.id,
        account.account_number,
        account.broker_server,
        Math.min(525600, Math.max(1, Math.trunc(Number(body.minutes || 180)))),
        body.approvedBy || "ADMIN",
        request.line_contact,
        request.request_ip
      ]
    );
    await this.db.query(
      "UPDATE trial_requests SET status='APPROVED',reviewed_by=$2,reviewed_at=now() WHERE id=$1",
      [request.id, body.approvedBy || "ADMIN"]
    );
    await this.audit("ADMIN", "GRANT_TRIAL", "trial", row.id, {
      mt5AccountId: account.id,
      lineContact: request.line_contact,
      requestIp: request.request_ip,
      ipWasAdvisoryOnly: true
    });
    return row;
  }

  @Post("trials/set-duration")
  async setTrialDuration(@Body() body: { userId: string; days: number }) {
    const result = await this.trials.setDuration(body.userId, body.days);
    await this.audit("OWNER", "SET_TRIAL_DURATION", "user", body.userId, {
      days: result.days,
      durationMinutes: result.durationMinutes,
      status: result.status
    });
    return result;
  }

  @Post("subscriptions/activate")
  async activate(@Body() body: {
    userId: string;
    planCode: string;
    durationDays?: number;
    startsAt?: string;
    expiresAt?: string;
    activatedBy?: string;
    note?: string;
    paidAmountSatang?: number;
    paymentReference?: string;
  }) {
    const plan = await this.db.one(
      "SELECT * FROM plans WHERE code=$1 AND active=true",
      [body.planCode]
    );
    if (!plan) throw new ConflictException("plan not found");
    const user = await this.db.one(
      "SELECT id,user_code,role,status FROM users WHERE id=$1",
      [body.userId]
    );
    if (!user || user.status !== "ACTIVE") {
      throw new ConflictException("SCENOVA user is not active");
    }
    if (user.role === "OWNER" || user.role === "ADMIN") {
      throw new ConflictException("OWNER/ADMIN already has unlimited access");
    }

    const paidAmountSatang = Math.trunc(Number(body.paidAmountSatang || 0));
    if (!Number.isFinite(paidAmountSatang) || paidAmountSatang < 0 || paidAmountSatang > 100_000_000) {
      throw new ConflictException("ยอดชำระเงินสำหรับ Referral ไม่ถูกต้อง");
    }

    const days = Math.max(1, Number(body.durationDays || 30));
    const requestedStartsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const partnerSource = plan.mode === "LOCAL" && !plan.allow_resale
      ? await this.partner.activeCustomerSource(body.userId)
      : null;
    const startsAt = partnerSource?.expires_at
      ? new Date(Math.max(requestedStartsAt.getTime(), new Date(partnerSource.expires_at).getTime()))
      : requestedStartsAt;
    const expiresAt = body.expiresAt
      ? new Date(body.expiresAt)
      : new Date(startsAt.getTime() + days * 86400000);
    if (expiresAt <= startsAt) throw new ConflictException("expiresAt must be after startsAt");
    if (!partnerSource && startsAt.getTime() > Date.now() + 60_000) {
      throw new ConflictException("ตอนนี้การเปิดสมาชิกจาก Owner Console ต้องเริ่มทันที กรุณาเว้นวันเริ่มว่างไว้");
    }

    await this.db.query(
      `UPDATE subscriptions sub
       SET status='CANCELLED'
       FROM plans p
       WHERE sub.plan_id=p.id
         AND sub.user_id=$1
         AND p.mode=$2
         AND sub.status='ACTIVE'
         AND ($3::uuid IS NULL OR sub.id<>$3)`,
      [body.userId, plan.mode, partnerSource?.subscription_id || null]
    );

    const row = await this.db.one(
      "INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note,access_group_id) VALUES($1,$2,$3,$4,$5,$6,NULL) RETURNING *",
      [body.userId, plan.id, startsAt, expiresAt, body.activatedBy || "ADMIN", body.note || null]
    );
    if (partnerSource) {
      await this.partner.detachCustomerToDirect(body.userId, row.id, body.activatedBy || "ADMIN");
    } else {
      await this.syncSlotsForSubscription(body.userId, row.id, plan);
    }

    let referralCommissionCount = 0;
    let referralCreditFailed = false;
    if (paidAmountSatang > 0) {
      try {
        const commissions = await this.referrals.creditRecordedPurchase({
          sourceUserId: body.userId,
          sourceType: "MANUAL_SUBSCRIPTION",
          sourceId: row.id,
          grossAmountSatang: paidAmountSatang,
          currency: "THB",
          metadata: {
            planCode: body.planCode,
            paymentReference: String(body.paymentReference || "").slice(0, 160) || null
          }
        });
        referralCommissionCount = commissions.length;
      } catch {
        // Membership activation is the primary operation. Never revoke paid
        // access because referral bookkeeping needs manual review.
        referralCreditFailed = true;
      }
    }

    await this.audit("ADMIN", "ACTIVATE_SUBSCRIPTION", "subscription", row.id, {
      plan: body.planCode,
      startsAt,
      expiresAt,
      partnerCarryForwardUntil: partnerSource?.expires_at || null,
      slots: Number(plan.max_mt5_accounts || 1),
      reseller: Boolean(plan.allow_resale),
      paidAmountSatang,
      paymentReference: String(body.paymentReference || "").slice(0, 160) || null,
      referralCommissionCount,
      referralCreditFailed,
      trialGroupIsolation: true
    });
    const slots = await this.db.query(
      "SELECT id,slot_number,mode,status,assigned_user_id,subscription_id FROM license_slots WHERE owner_user_id=$1 AND mode=$2 AND status<>'DELETED' ORDER BY slot_number",
      [body.userId, plan.mode]
    );
    return {
      subscription: row,
      plan: {
        code: plan.code,
        mode: plan.mode,
        slots: Number(plan.max_mt5_accounts || 1),
        reseller: Boolean(plan.allow_resale)
      },
      slots: slots.rows,
      referral: {
        paidAmountSatang,
        commissionCount: referralCommissionCount,
        creditFailed: referralCreditFailed
      }
    };
  }

  private async syncSlotsForSubscription(userId: string, subscriptionId: string, plan: any) {
    const target = Math.max(1, Number(plan.max_mt5_accounts || 1));
    const existing = await this.db.query(
      `SELECT ls.*
       FROM license_slots ls
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.owner_user_id=$1
         AND ls.mode=$2
         AND ls.status<>'DELETED'
       ORDER BY
         CASE WHEN $2='CLOUD' AND ls.slot_type='PERSONAL' THEN 0
              WHEN $2='CLOUD' THEN 1
              ELSE 0 END,
         CASE WHEN bi.mt5_account_id IS NOT NULL THEN 0 ELSE 1 END,
         CASE WHEN ls.subscription_id IS NOT NULL THEN 0 ELSE 1 END,
         ls.slot_number,
         ls.created_at`,
      [userId, plan.mode]
    );
    const rows = existing.rows;
    const maxRow = await this.db.one(
      "SELECT COALESCE(max(slot_number),0)::int max_slot FROM license_slots WHERE owner_user_id=$1 AND mode=$2",
      [userId, plan.mode]
    );
    let nextNumber = plan.mode === "LOCAL" ? 1 : Number(maxRow?.max_slot || 0) + 1;

    for (let i = 0; i < target; i++) {
      const current = rows[i];
      const slotType = plan.allow_resale ? "PARTNER" : "PERSONAL";
      if (current) {
        const assigned = plan.allow_resale
          ? current.assigned_user_id
          : userId;
        await this.db.query(
          "UPDATE license_slots SET subscription_id=$2,slot_type=$3,assigned_user_id=$4,status=$5,updated_at=now() WHERE id=$1",
          [current.id, subscriptionId, slotType, assigned || null, assigned ? "ACTIVE" : "AVAILABLE"]
        );
      } else {
        const assigned = plan.allow_resale ? null : userId;
        await this.db.query(
          "INSERT INTO license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            userId,
            assigned,
            subscriptionId,
            plan.mode,
            nextNumber++,
            slotType,
            assigned ? "ACTIVE" : "AVAILABLE",
            plan.allow_resale ? "Partner Slot" : "Personal Slot"
          ]
        );
      }
    }

    for (let i = target; i < rows.length; i++) {
      const extra = rows[i];
      const instance = await this.db.one(
        "SELECT id,actual_state,desired_state FROM bot_instances WHERE slot_id=$1",
        [extra.id]
      );
      if (instance) {
        await this.db.query(
          "UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1",
          [instance.id]
        );
        await this.db.query(
          "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
          [instance.id]
        );
      }
      await this.db.query(
        "UPDATE license_slots SET status='SUSPENDED',updated_at=now() WHERE id=$1",
        [extra.id]
      );
    }
  }

  @Post("subscriptions/adjust-days")
  async adjustSubscriptionDays(@Body() body: {
    subscriptionId: string;
    days: number;
    userId?: string;
    mode?: "LOCAL" | "CLOUD";
  }) {
    const days = Math.trunc(Number(body.days));
    if (!Number.isFinite(days) || days === 0 || days < -3650 || days > 3650) {
      throw new ConflictException("จำนวนวันที่ปรับต้องอยู่ระหว่าง -3650 ถึง 3650 วัน และห้ามเป็น 0");
    }
    const expectedMode = body.mode ? String(body.mode).toUpperCase() : null;
    if (expectedMode && !["LOCAL","CLOUD"].includes(expectedMode)) {
      throw new ConflictException("ระบบสมาชิกที่เลือกไม่ถูกต้อง");
    }

    const current = await this.db.one(
      `SELECT s.id,s.starts_at,s.expires_at,s.status,s.user_id,p.mode
       FROM subscriptions s
       JOIN plans p ON p.id=s.plan_id
       WHERE s.id=$1
         AND ($2::uuid IS NULL OR s.user_id=$2::uuid)
         AND ($3::text IS NULL OR p.mode=$3::text)`,
      [body.subscriptionId, body.userId || null, expectedMode]
    );
    if (!current) throw new ConflictException("ไม่พบสมาชิกของระบบที่เลือก");

    const row = await this.db.one(
      `UPDATE subscriptions
       SET expires_at=GREATEST(
             starts_at,
             CASE
               WHEN $2::int > 0 THEN GREATEST(expires_at,now()) + make_interval(days => $2::int)
               ELSE expires_at + make_interval(days => $2::int)
             END
           ),
           status=CASE
             WHEN GREATEST(
               starts_at,
               CASE
                 WHEN $2::int > 0 THEN GREATEST(expires_at,now()) + make_interval(days => $2::int)
                 ELSE expires_at + make_interval(days => $2::int)
               END
             ) > now() THEN 'ACTIVE'
             ELSE 'EXPIRED'
           END
       WHERE id=$1
       RETURNING *`,
      [body.subscriptionId, days]
    );

    const relation = await this.db.one(
      `UPDATE partner_customers
       SET expires_at=$2,updated_at=now(),
           status=CASE WHEN $2>now() THEN status ELSE 'EXPIRED' END
       WHERE subscription_id=$1 AND status IN ('ACTIVE','DIRECT')
       RETURNING id,direct_subscription_id`,
      [row.id, row.expires_at]
    );

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      const stopped = await this.db.query(
        `UPDATE bot_instances bi
         SET desired_state='SAFE_STOP'
         FROM license_slots ls
         WHERE ls.id=bi.slot_id
           AND ls.subscription_id=$1
         RETURNING bi.id`,
        [row.id]
      );
      if (stopped.rows.length) {
        await this.db.query(
          `INSERT INTO bot_commands(bot_instance_id,command)
           SELECT id,'SAFE_STOP' FROM unnest($1::uuid[]) AS x(id)`,
          [stopped.rows.map((item:any)=>item.id)]
        );
      }
    }

    await this.audit("OWNER", "ADJUST_SUBSCRIPTION_DAYS", "subscription", row.id, {
      days,
      previousExpiresAt: current.expires_at,
      expiresAt: row.expires_at,
      partnerRelationUpdated: Boolean(relation?.id)
    });
    return row;
  }

  @Post("subscriptions/extend")
  async extend(@Body() body: { subscriptionId: string; days: number }) {
    const days = Math.trunc(Number(body.days));
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      throw new ConflictException("จำนวนวันที่เพิ่มต้องอยู่ระหว่าง 1 ถึง 3650 วัน");
    }
    const row = await this.db.one(
      "UPDATE subscriptions SET expires_at=GREATEST(expires_at,now()) + ($2 || ' days')::interval,status='ACTIVE' WHERE id=$1 RETURNING *",
      [body.subscriptionId, days]
    );
    if (!row) throw new ConflictException("subscription not found");

    const relation = await this.db.one(
      `UPDATE partner_customers
       SET expires_at=$2,updated_at=now()
       WHERE subscription_id=$1 AND status='ACTIVE'
       RETURNING id,direct_subscription_id`,
      [row.id, row.expires_at]
    );
    if (relation?.direct_subscription_id) {
      await this.db.query(
        `UPDATE subscriptions
         SET expires_at=$2 + (expires_at-starts_at),starts_at=$2
         WHERE id=$1 AND status='ACTIVE'`,
        [relation.direct_subscription_id, row.expires_at]
      );
    }

    await this.audit("ADMIN", "EXTEND_SUBSCRIPTION", "subscription", row.id, {
      days,
      partnerRelationUpdated: Boolean(relation?.id),
      queuedDirectShifted: Boolean(relation?.direct_subscription_id)
    });
    return row;
  }

  private confirmedSlotSymbol(settings: any) {
    if (String(settings?.symbolResolutionMode || "").toUpperCase() !== "EXACT") {
      return "";
    }
    const raw = String(settings?.startupSymbol || settings?.symbol || "").trim();
    return /^[A-Za-z0-9._#-]{1,64}$/.test(raw) ? raw : "";
  }

  private async adminCustomerSlot(userId: string, slotId: string) {
    return this.db.one(
      `SELECT
         ls.*,
         u.user_code,
         bi.id instance_id,
         bi.mt5_account_id,
         bi.actual_state,
         bi.desired_state,
         bi.runner_id,
         bi.execution_generation,
         bi.runtime_stop_state,
         bi.metrics,
         bi.last_seen_at,
         bi.agent_last_seen_at,
         bs.settings,
         a.account_number,
         a.broker_server,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0) pending_orders
       FROM license_slots ls
       JOIN users u ON u.id=ls.assigned_user_id
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
       LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.status<>'DELETED'
       LIMIT 1`,
      [slotId, userId]
    );
  }

  @Post("slots/select-symbol")
  async selectCustomerSlotSymbol(
    @Req() req: any,
    @Body() body: { userId: string; slotId: string; symbol: string }
  ) {
    const slot = await this.adminCustomerSlot(body.userId, body.slotId);
    if (!slot) throw new ConflictException("ไม่พบ Slot ของลูกค้ารายนี้");
    if (!slot.instance_id || !slot.mt5_account_id) {
      throw new ConflictException("Slot นี้ยังไม่ได้เชื่อมบัญชี MT5");
    }

    const requestedSymbol = String(body.symbol || "").trim();
    const postConnect = String(slot.settings?.symbolResolutionMode || "").toUpperCase() === "EXACT"
      && Boolean(String(slot.settings?.startupSymbol || slot.settings?.symbol || "").trim());
    if (!/^[A-Za-z0-9._#-]{1,64}$/.test(requestedSymbol) ||
        (!postConnect && !/^XAU[A-Za-z0-9._#-]{3,29}$/i.test(requestedSymbol))) {
      throw new ConflictException("กรุณาเลือก Symbol ที่ MT5 บัญชีนี้ตรวจพบจริง");
    }

    const positions = Math.max(0, Number(slot.positions || 0));
    const pendingOrders = Math.max(0, Number(slot.pending_orders || 0));
    const firstConnectPrimePending = slot.settings?.firstConnectPrimePending === true;
    if (
      positions > 0 || pendingOrders > 0 ||
      (
        String(slot.actual_state || "").toUpperCase() === "RUNNING" &&
        (postConnect || !firstConnectPrimePending)
      )
    ) {
      throw new ConflictException("กรุณาหยุดบอทและให้ Position / Pending Order เป็น 0 ก่อนเปลี่ยน Symbol");
    }

    const mode = String(slot.mode || "").toUpperCase();
    // Post-connect switching requires a recent EA heartbeat from this
    // already-bound MT5 account. First-time Worker XAU discovery is unchanged.
    const recentEa = Boolean(slot.last_seen_at &&
      Date.now() - new Date(slot.last_seen_at).getTime() <= 90_000);
    if (postConnect && !recentEa) {
      throw new ConflictException("ต้องรอ EA ส่ง Market Watch ล่าสุดจากบัญชี MT5 นี้ก่อนเปลี่ยน Symbol");
    }
    const exactMarketWatchSymbol = postConnect
      ? exactConnectedAccountSymbol(requestedSymbol, slot.metrics)
      : "";
    if (postConnect && !exactMarketWatchSymbol) {
      throw new ConflictException("Symbol นี้ไม่อยู่ใน Market Watch ล่าสุดของบัญชี MT5 นี้");
    }
    if (postConnect && String(slot.desired_state || "").toUpperCase() === "RUNNING") {
      throw new ConflictException("กรุณาหยุดบอทก่อนเปลี่ยน Symbol");
    }
    if (mode === "CLOUD") {
      if (!slot.runner_id) throw new ConflictException("Cloud VPS Slot นี้ยังไม่ได้เชื่อม Worker");
      if (String(slot.runtime_stop_state || "NONE").toUpperCase() !== "NONE") {
        throw new ConflictException("Cloud VPS กำลังหยุด Runtime อยู่ กรุณารอให้สถานะกลับมา NONE ก่อน");
      }
      const worker = await this.db.one(
        "SELECT last_seen_at,telemetry FROM worker_nodes WHERE runner_id=$1",
        [slot.runner_id]
      );
      const workerOnline = Boolean(
        worker?.last_seen_at && Date.now() - new Date(worker.last_seen_at).getTime() <= 30_000
      );
      if (!workerOnline) throw new ConflictException("Cloud Worker Offline กรุณาให้ Server กลับมา Online ก่อนเปลี่ยน Symbol");
      const workerVersion = String(worker?.telemetry?.version || "");
      if (!versionAtLeast(workerVersion, "2.2.36")) {
        throw new ConflictException("Cloud Worker ยังไม่รองรับ Symbol Discovery รุ่นใหม่ · กรุณาอัปเดต Server เป็น Worker 2.2.36+ ก่อน");
      }
      if (!postConnect) {
        // First connect: preserve the original Worker XAU discovery guard.
        const workerInstance = Array.isArray(worker?.telemetry?.instances)
          ? worker.telemetry.instances.find((item:any)=>String(item?.instanceId || "")===String(slot.instance_id))
          : null;
        const discovered = Array.isArray(workerInstance?.discoveredXauSymbols)
          ? workerInstance.discoveredXauSymbols.map((item:any)=>String(item || "").trim()).filter(Boolean)
          : [];
        const exact = discovered.find((item:string)=>item.toUpperCase()===requestedSymbol.toUpperCase());
        if (!exact) {
          throw new ConflictException("Symbol นี้ไม่ได้อยู่ในรายการ XAU ที่ VPS ตรวจพบจาก MT5 บัญชีจริง");
        }
      }
    } else if (mode === "LOCAL") {
      const agentOnline = Boolean(
        slot.agent_last_seen_at && Date.now() - new Date(slot.agent_last_seen_at).getTime() <= 90_000
      );
      if (!agentOnline) throw new ConflictException("Windows Agent ของ Slot นี้ยัง Offline กรุณาเปิด Agent ก่อนเปลี่ยน Symbol");
    } else {
      throw new ConflictException("โหมด Slot ไม่ถูกต้อง");
    }

    const resolvedSymbol = postConnect ? exactMarketWatchSymbol : requestedSymbol;
    const requestedAt = new Date().toISOString();
    await this.db.query(
      `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
       VALUES($1,jsonb_build_object(
         'startupSymbol',$2::text,'symbol',$2::text,
         'symbolResolutionMode','EXACT','symbolSelectedBy','ADMIN'
       ),now())
       ON CONFLICT(bot_instance_id)
       DO UPDATE SET settings=jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(COALESCE(bot_settings.settings,'{}'::jsonb),'{startupSymbol}',to_jsonb($2::text),true),
             '{symbol}',to_jsonb($2::text),true
           ),
           '{symbolResolutionMode}',to_jsonb('EXACT'::text),true
         ),
         '{symbolSelectedBy}',to_jsonb('ADMIN'::text),true
       ),updated_at=now()`,
      [slot.instance_id, resolvedSymbol]
    );

    await this.db.query(
      `UPDATE bot_instances
       SET desired_state=$2,
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'requestedStartupSymbol',$3::text,
             'symbolChangeStatus','QUEUED',
             'symbolChangeRequestedAt',$4::text,
             'symbolChangeSource','ADMIN_EXACT'
           )
       WHERE id=$1`,
      [slot.instance_id, mode === "CLOUD" ? "STOPPED" : "SAFE_STOP", resolvedSymbol, requestedAt]
    );

    let actionId: string | null = null;
    if (mode === "CLOUD") {
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command='START'",
        [slot.instance_id]
      );
      await this.db.query(
        `INSERT INTO bot_commands(bot_instance_id,command)
         SELECT $1,'SAFE_STOP'
         WHERE NOT EXISTS (
           SELECT 1 FROM bot_commands
           WHERE bot_instance_id=$1
             AND command='SAFE_STOP'
             AND status IN ('PENDING','DELIVERED')
         )`,
        [slot.instance_id]
      );
      await this.db.query(
        `INSERT INTO worker_commands(runner_id,bot_instance_id,execution_generation,command,status)
         SELECT $1,$2,$3,'RELOAD_INSTANCE','PENDING'
         WHERE NOT EXISTS (
           SELECT 1 FROM worker_commands
           WHERE bot_instance_id=$2
             AND execution_generation=$3
             AND command='RELOAD_INSTANCE'
             AND status IN ('PENDING','DELIVERED')
         )`,
        [slot.runner_id, slot.instance_id, Number(slot.execution_generation || 1)]
      );
    } else {
      actionId = randomUUID();
      await this.db.query(
        `UPDATE bot_instances
         SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
           'manualMt5ActionName','CONNECT_MT5',
           'manualMt5ActionId',$2::text,
           'manualMt5ActionRequestedAt',$3::text,
           'manualMt5ActionStatus','PENDING',
           'manualMt5ActionSource','ADMIN_EXACT_SYMBOL',
           'manualMt5ActionMessage',$4::text
         )
         WHERE id=$1`,
        [slot.instance_id, actionId, requestedAt, "Admin เลือก Symbol " + resolvedSymbol + " ให้ Slot นี้"]
      );
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",
        [slot.instance_id]
      );
      await this.db.query(
        "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
        [slot.instance_id]
      );
    }

    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    await this.audit(actor, "ADMIN_SELECT_SLOT_SYMBOL", "bot_instance", slot.instance_id, {
      userId: body.userId,
      userCode: slot.user_code,
      slotId: slot.id,
      mode,
      mt5AccountId: slot.mt5_account_id,
      accountNumber: slot.account_number || null,
      brokerServer: slot.broker_server || null,
      requestedSymbol,
      resolvedSymbol,
      resolutionMode: "EXACT",
      actionId
    });

    return {
      ok: true,
      slotId: slot.id,
      mode,
      symbol: resolvedSymbol,
      resolutionMode: "EXACT",
      actionId,
      symbolChangeRequestedAt: requestedAt,
      message: mode === "CLOUD"
        ? "กำหนด " + resolvedSymbol + " ให้ Slot แล้ว · Cloud Worker กำลัง Reload MT5 ด้วย Symbol นี้ตรง ๆ"
        : "กำหนด " + resolvedSymbol + " ให้ Slot แล้ว · Windows Agent กำลังเชื่อม MT5 ใหม่ด้วย Symbol นี้"
    };
  }

  @Post("slots/refresh-symbol")
  async refreshCustomerSlotSymbol(
    @Req() req: any,
    @Body() body: { userId: string; slotId: string }
  ) {
    const slot = await this.adminCustomerSlot(body.userId, body.slotId);
    if (!slot) throw new ConflictException("ไม่พบ Slot ของลูกค้ารายนี้");
    if (!slot.instance_id || !slot.mt5_account_id) {
      throw new ConflictException("Slot นี้ยังไม่ได้เชื่อมบัญชี MT5");
    }

    const positions = Math.max(0, Number(slot.positions || 0));
    const pendingOrders = Math.max(0, Number(slot.pending_orders || 0));
    const firstConnectPrimePending = slot.settings?.firstConnectPrimePending === true;
    if (
      positions > 0 ||
      pendingOrders > 0 ||
      (
        String(slot.actual_state || "").toUpperCase() === "RUNNING" &&
        !firstConnectPrimePending
      )
    ) {
      throw new ConflictException(
        "กรุณาหยุดบอทและให้ Position / Pending Order เป็น 0 ก่อนโหลด Symbol ใหม่"
      );
    }

    const mode = String(slot.mode || "").toUpperCase();
    if (mode === "CLOUD") {
      if (!slot.runner_id) {
        throw new ConflictException("Cloud VPS Slot นี้ยังไม่ได้เชื่อม Worker");
      }
      const runtimeStopState = String(slot.runtime_stop_state || "NONE").toUpperCase();
      if (runtimeStopState !== "NONE") {
        throw new ConflictException("Cloud VPS กำลังหยุด Runtime อยู่ กรุณารอให้สถานะกลับมาพร้อมก่อน");
      }
    } else if (mode === "LOCAL") {
      const agentOnline = Boolean(
        slot.agent_last_seen_at &&
        Date.now() - new Date(slot.agent_last_seen_at).getTime() <= 90_000
      );
      if (!agentOnline) {
        throw new ConflictException(
          "Windows Agent ของ Slot นี้ยัง Offline กรุณาเปิด Agent ก่อนโหลด Symbol ใหม่"
        );
      }
    } else {
      throw new ConflictException("โหมด Slot ไม่ถูกต้อง");
    }

    const requestedSymbol = this.confirmedSlotSymbol(slot.settings || {});
    const requestedAt = new Date().toISOString();

    if (mode === "CLOUD") {
      await this.db.query(
        `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
         VALUES($1,jsonb_build_object(
           'symbolResolutionMode','DISCOVERY',
           'symbolSelectedBy','MT5_DISCOVERY',
           'symbolDiscoveryState','SCANNING'
         ),now())
         ON CONFLICT(bot_instance_id)
         DO UPDATE SET
           settings=(
             COALESCE(bot_settings.settings,'{}'::jsonb)
             - 'startupSymbol'
             - 'symbol'
             - 'symbolAccountType'
           ) || jsonb_build_object(
             'symbolResolutionMode','DISCOVERY',
             'symbolSelectedBy','MT5_DISCOVERY',
             'symbolDiscoveryState','SCANNING'
           ),
           updated_at=now()`,
        [slot.instance_id]
      );
    } else {
      if (!requestedSymbol) {
        throw new ConflictException("ยังไม่มี Symbol XAU ที่ยืนยันแล้ว");
      }
      await this.db.query(
        `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
         VALUES($1,jsonb_build_object('startupSymbol',$2::text,'symbol',$2::text,'symbolResolutionMode','EXACT'),now())
         ON CONFLICT(bot_instance_id)
         DO UPDATE SET settings=COALESCE(bot_settings.settings,'{}'::jsonb) || jsonb_build_object(
           'startupSymbol',$2::text,'symbol',$2::text,'symbolResolutionMode','EXACT'
         ),updated_at=now()`,
        [slot.instance_id, requestedSymbol]
      );
    }

    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='STOPPED',
           metrics=(
             COALESCE(metrics,'{}'::jsonb)
             - 'symbol'
             - 'symbolTradeMode'
             - 'marketWatchSymbols'
             - 'marketWatchCapturedAt'
             - 'requestedStartupSymbol'
             - 'symbolChangeStatus'
           ) || jsonb_build_object(
             'symbolRefreshStatus','QUEUED',
             'symbolRefreshRequestedAt',$2::text,
             'symbolRefreshRequestedSymbol',$3::text,
             'symbolRefreshSource','ADMIN_SLOT'
           )
       WHERE id=$1`,
      [slot.instance_id, requestedAt, requestedSymbol]
    );

    let actionId: string | null = null;
    if (mode === "CLOUD") {
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command='START'",
        [slot.instance_id]
      );
      await this.db.query(
        `INSERT INTO bot_commands(bot_instance_id,command)
         SELECT $1,'SAFE_STOP'
         WHERE NOT EXISTS (
           SELECT 1 FROM bot_commands
           WHERE bot_instance_id=$1
             AND command='SAFE_STOP'
             AND status IN ('PENDING','DELIVERED')
         )`,
        [slot.instance_id]
      );
      await this.db.query(
        `INSERT INTO worker_commands(
           runner_id,bot_instance_id,execution_generation,command,status
         )
         SELECT $1,$2,$3,'RELOAD_INSTANCE','PENDING'
         WHERE NOT EXISTS (
           SELECT 1 FROM worker_commands
           WHERE bot_instance_id=$2
             AND execution_generation=$3
             AND command='RELOAD_INSTANCE'
             AND status IN ('PENDING','DELIVERED')
         )`,
        [slot.runner_id, slot.instance_id, Number(slot.execution_generation || 1)]
      );
    } else if (mode === "LOCAL") {
      actionId = randomUUID();
      await this.db.query(
        `UPDATE bot_instances
         SET desired_state='SAFE_STOP',
             metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
               'manualMt5ActionName','CONNECT_MT5',
               'manualMt5ActionId',$2::text,
               'manualMt5ActionRequestedAt',$3::text,
               'manualMt5ActionStatus','PENDING',
               'manualMt5ActionSource','ADMIN_SYMBOL_REFRESH',
               'manualMt5ActionMessage','Admin สั่งเชื่อม MT5 ใหม่เพื่อดึง Market Watch / Symbol ล่าสุด'
             )
         WHERE id=$1`,
        [slot.instance_id, actionId, requestedAt]
      );
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",
        [slot.instance_id]
      );
      await this.db.query(
        "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
        [slot.instance_id]
      );
    } else {
      throw new ConflictException("โหมด Slot ไม่ถูกต้อง");
    }

    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    await this.audit(actor, "ADMIN_REFRESH_SLOT_SYMBOL", "bot_instance", slot.instance_id, {
      userId: body.userId,
      userCode: slot.user_code,
      slotId: slot.id,
      mode,
      mt5AccountId: slot.mt5_account_id,
      accountNumber: slot.account_number || null,
      brokerServer: slot.broker_server || null,
      requestedSymbol,
      actionId
    });

    return {
      ok: true,
      slotId: slot.id,
      mode,
      requestedSymbol,
      actionId,
      message: mode === "CLOUD"
        ? "สั่ง Cloud VPS รีโหลด MT5 แล้ว ระบบจะดึง Market Watch และ Symbol ใหม่จากบัญชีนี้"
        : "สั่ง Local MT5 เชื่อมใหม่แล้ว ระบบจะดึง Market Watch และ Symbol ใหม่จากบัญชีนี้"
    };
  }

  @Post("slots/repair-runtime")
  async repairCustomerSlotRuntime(
    @Req() req: any,
    @Body() body: { userId: string; slotId: string }
  ) {
    const slot = await this.adminCustomerSlot(body.userId, body.slotId);
    if (!slot) throw new ConflictException("ไม่พบ Slot ของลูกค้ารายนี้");
    if (String(slot.mode || "").toUpperCase() !== "CLOUD") {
      throw new ConflictException("ปุ่มซ่อม MT5 / EA ใช้สำหรับ Cloud VPS เท่านั้น");
    }
    if (!slot.instance_id || !slot.mt5_account_id) {
      throw new ConflictException("Slot นี้ยังไม่ได้เชื่อมบัญชี MT5");
    }
    if (!slot.runner_id) {
      throw new ConflictException("Cloud VPS Slot นี้ยังไม่ได้เชื่อม Worker");
    }

    const positions = Math.max(0, Number(slot.positions || 0));
    const pendingOrders = Math.max(0, Number(slot.pending_orders || 0));
    const firstConnectPrimePending = slot.settings?.firstConnectPrimePending === true;
    if (
      positions > 0 ||
      pendingOrders > 0 ||
      (
        String(slot.actual_state || "").toUpperCase() === "RUNNING" &&
        !firstConnectPrimePending
      )
    ) {
      throw new ConflictException(
        "กรุณาหยุดบอทและให้ Position / Pending Order เป็น 0 ก่อนซ่อม MT5 / EA"
      );
    }

    const runtimeStopState = String(slot.runtime_stop_state || "NONE").toUpperCase();
    if (runtimeStopState !== "NONE") {
      throw new ConflictException(
        "Cloud Runtime กำลังอยู่ในขั้นตอนหยุด/ย้ายระบบ กรุณารอให้สถานะกลับมา NONE ก่อน"
      );
    }

    const worker = await this.db.one(
      `SELECT last_seen_at,telemetry
       FROM worker_nodes
       WHERE runner_id=$1`,
      [slot.runner_id]
    );
    const workerOnline = Boolean(
      worker?.last_seen_at &&
      Date.now() - new Date(worker.last_seen_at).getTime() <= 30_000
    );
    if (!workerOnline) {
      throw new ConflictException("Cloud Worker Offline กรุณาให้ Server กลับมา Online ก่อนซ่อม");
    }
    const workerVersion = String(worker?.telemetry?.version || "");
    if (!versionAtLeast(workerVersion, "2.2.28")) {
      throw new ConflictException(
        "Cloud Worker ยังไม่รองรับ Runtime Repair · กรุณาอัปเดต Server เป็น Worker 2.2.28+ ก่อน"
      );
    }

    const credential = await this.db.one(
      "SELECT mt5_account_id FROM mt5_credentials WHERE mt5_account_id=$1",
      [slot.mt5_account_id]
    );
    if (!credential) {
      throw new ConflictException(
        "ไม่มี Trading Credential ที่เข้ารหัสของบัญชีนี้ ลูกค้าต้องเชื่อม MT5 ใหม่ด้วยตัวเอง"
      );
    }

    const generation = Number(slot.execution_generation || 1);
    const requestedAt = new Date().toISOString();

    await this.db.transaction(async tx => {
      await tx.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command='START'",
        [slot.instance_id]
      );
      await tx.query(
        `INSERT INTO bot_commands(bot_instance_id,command)
         SELECT $1,'SAFE_STOP'
         WHERE NOT EXISTS (
           SELECT 1 FROM bot_commands
           WHERE bot_instance_id=$1
             AND command='SAFE_STOP'
             AND status IN ('PENDING','DELIVERED')
         )`,
        [slot.instance_id]
      );
      await tx.query(
        `UPDATE worker_commands
         SET status='CANCELLED',
             result_code='SUPERSEDED_BY_RUNTIME_REPAIR',
             acked_at=COALESCE(acked_at,now())
         WHERE bot_instance_id=$1
           AND execution_generation=$2
           AND status IN ('PENDING','DELIVERED')
           AND command IN ('RELOAD_INSTANCE','REBUILD_INSTANCE')`,
        [slot.instance_id, generation]
      );

      await tx.query(
        `UPDATE bot_instances
         SET desired_state='STOPPED',
             actual_state='OFFLINE',
             last_seen_at=NULL,
             provisioning_error=NULL,
             cloud_recovery_state='IDLE',
             cloud_recovery_attempts=0,
             cloud_recovery_window_started_at=NULL,
             cloud_recovery_next_at=NULL,
             cloud_recovery_last_error=NULL,
             metrics=(
               COALESCE(metrics,'{}'::jsonb)
               - 'symbol'
               - 'symbolTradeMode'
               - 'marketWatchSymbols'
               - 'marketWatchCapturedAt'
               - 'requestedStartupSymbol'
               - 'symbolChangeStatus'
             ) || jsonb_build_object(
               'runtimeRepairStatus','QUEUED',
               'runtimeRepairRequestedAt',$2::text,
               'runtimeRepairSource','ADMIN_SLOT',
               'symbolRefreshStatus','QUEUED',
               'symbolRefreshSource','ADMIN_RUNTIME_REPAIR'
             )
         WHERE id=$1`,
        [slot.instance_id, requestedAt]
      );

      await tx.query(
        `INSERT INTO worker_commands(
           runner_id,bot_instance_id,execution_generation,command,status
         ) VALUES($1,$2,$3,'REBUILD_INSTANCE','PENDING')`,
        [slot.runner_id, slot.instance_id, generation]
      );
    });

    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    await this.audit(actor, "ADMIN_REPAIR_CLOUD_RUNTIME", "bot_instance", slot.instance_id, {
      userId: body.userId,
      userCode: slot.user_code,
      slotId: slot.id,
      runnerId: slot.runner_id,
      mt5AccountId: slot.mt5_account_id,
      accountNumber: slot.account_number || null,
      brokerServer: slot.broker_server || null,
      executionGeneration: generation,
      credentialReusedSecurely: true
    });

    return {
      ok: true,
      slotId: slot.id,
      instanceId: slot.instance_id,
      mode: "CLOUD",
      message:
        "ส่งคำสั่งซ่อม MT5 / EA แล้ว ระบบจะสร้าง Runtime ใหม่เฉพาะ Slot นี้ ใช้ Credential เดิมที่เข้ารหัส และดึง Symbol ใหม่อัตโนมัติ"
    };
  }

  @Post("slots/disconnect-mt5")
  async disconnectCustomerSlotMt5(
    @Req() req: any,
    @Body() body: { userId: string; slotId: string }
  ) {
    const slot = await this.adminCustomerSlot(body.userId, body.slotId);
    if (!slot) throw new ConflictException("ไม่พบ Slot ของลูกค้ารายนี้");
    if (!slot.instance_id || !slot.mt5_account_id) {
      return {
        ok: true,
        disconnected: false,
        slotId: slot.id,
        message: "Slot นี้ไม่ได้เชื่อมบัญชี MT5 อยู่แล้ว"
      };
    }

    const positions = Math.max(0, Number(slot.positions || 0));
    const pendingOrders = Math.max(0, Number(slot.pending_orders || 0));
    if (
      positions > 0 ||
      pendingOrders > 0 ||
      String(slot.actual_state || "").toUpperCase() === "RUNNING" ||
      String(slot.desired_state || "").toUpperCase() === "RUNNING"
    ) {
      throw new ConflictException(
        "กรุณาหยุดบอทและให้ Position / Pending Order เป็น 0 ก่อนตัดการเชื่อมต่อ MT5"
      );
    }

    const mode = String(slot.mode || "").toUpperCase();
    if (mode === "CLOUD" && slot.runner_id) {
      const stopState = String(slot.runtime_stop_state || "NONE").toUpperCase();
      if (!["STOP_CONFIRMED","LEASE_REVOKED"].includes(stopState)) {
        const activeStop = await this.db.one(
          `SELECT id
           FROM worker_commands
           WHERE bot_instance_id=$1
             AND execution_generation=$2
             AND command='STOP_INSTANCE'
             AND status IN ('PENDING','DELIVERED')
           ORDER BY id DESC
           LIMIT 1`,
          [slot.instance_id, Number(slot.execution_generation || 1)]
        );
        if (!activeStop) {
          await this.db.query(
            `INSERT INTO worker_commands(
               runner_id,bot_instance_id,execution_generation,command,status
             ) VALUES($1,$2,$3,'STOP_INSTANCE','PENDING')`,
            [slot.runner_id, slot.instance_id, Number(slot.execution_generation || 1)]
          );
        }
        await this.db.query(
          `UPDATE bot_instances SET
             desired_state='STOPPED',
             runtime_stop_state='STOP_REQUESTED',
             runtime_stop_requested_at=now(),
             runtime_stop_confirmed_at=NULL,
             runtime_stop_error=NULL
           WHERE id=$1`,
          [slot.instance_id]
        );
        return {
          ok: false,
          pendingCloudStop: true,
          slotId: slot.id,
          message: "กำลังปิด MT5 ของ Slot นี้บน VPS ก่อนตัดการเชื่อมต่อ"
        };
      }
    }

    const oldAccountId = slot.mt5_account_id;

    await this.db.transaction(async tx => {
      await tx.query(
        "UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1",
        [oldAccountId]
      );
      if (mode === "CLOUD") {
        await tx.query(
          "DELETE FROM mt5_credentials WHERE mt5_account_id=$1",
          [oldAccountId]
        );
      }

      await tx.query(
        `INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
         VALUES($1,jsonb_build_object('symbolResolutionMode','DISCOVERY','symbolDiscoveryState','DISCONNECTED'),now())
         ON CONFLICT(bot_instance_id)
         DO UPDATE SET
           settings=(
             COALESCE(bot_settings.settings,'{}'::jsonb)
             - 'startupSymbol'
             - 'symbol'
             - 'symbolAccountType'
           ) || jsonb_build_object(
             'symbolResolutionMode','DISCOVERY',
             'symbolSelectedBy','MT5_DISCOVERY',
             'symbolDiscoveryState','DISCONNECTED'
           ),
           updated_at=now()`,
        [slot.instance_id]
      );

      await tx.query(
        `UPDATE bot_instances SET
           mt5_account_id=NULL,
           desired_state='STOPPED',
           actual_state='OFFLINE',
           last_seen_at=NULL,
           metrics=CASE
             WHEN mode='CLOUD' THEN '{}'::jsonb
             ELSE (
               COALESCE(metrics,'{}'::jsonb)
               - 'symbol'
               - 'symbolTradeMode'
               - 'marketWatchSymbols'
               - 'marketWatchCapturedAt'
               - 'requestedStartupSymbol'
               - 'symbolChangeStatus'
             )
           END,
           pending_account_number=NULL,
           pending_broker=NULL,
           pending_broker_server=NULL,
           pending_account_ip=NULL,
           pending_account_seen_at=NULL,
           account_change_requested_at=NULL
         WHERE id=$1`,
        [slot.instance_id]
      );
      await tx.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')",
        [slot.instance_id]
      );
      await tx.query(
        "UPDATE worker_commands SET status='CANCELLED',result_code='ADMIN_MT5_DISCONNECTED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND command='RELOAD_INSTANCE' AND status IN ('PENDING','DELIVERED')",
        [slot.instance_id]
      );
    });

    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    await this.audit(actor, "ADMIN_DISCONNECT_SLOT_MT5", "bot_instance", slot.instance_id, {
      userId: body.userId,
      userCode: slot.user_code,
      slotId: slot.id,
      mode,
      oldMt5AccountId: oldAccountId,
      accountNumber: slot.account_number || null,
      brokerServer: slot.broker_server || null,
      preservedTrialHistory: true
    });

    return {
      ok: true,
      disconnected: true,
      slotId: slot.id,
      mode,
      preservedTrialHistory: true,
      message: "ตัดการเชื่อมต่อ MT5 ของ Slot นี้แล้ว ลูกค้าต้องเชื่อม MT5 ใหม่เพื่อให้ระบบดึง Symbol จากบัญชีจริงอีกครั้ง"
    };
  }

  @Post("slots/delete")
  async deleteCustomerSlot(@Req() req: any, @Body() body: { userId: string; slotId: string }) {
    const slot = await this.db.one(
      `SELECT ls.*,u.user_code,
              bi.id instance_id,bi.actual_state,bi.desired_state,bi.runner_id,
              bi.execution_generation,bi.runtime_stop_state,bi.mt5_account_id,
              COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
              COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0) pending_orders
       FROM license_slots ls
       JOIN users u ON u.id=ls.assigned_user_id
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.owner_user_id=$2
         AND ls.status<>'DELETED'`,
      [body.slotId, body.userId]
    );
    if (!slot) throw new ConflictException("ไม่พบ Slot ของลูกค้ารายนี้");

    const mode = String(slot.mode || "").toUpperCase();
    const keepSlot = await this.db.one(
      `SELECT ls.id,ls.subscription_id,ls.slot_number,ls.slot_type
       FROM license_slots ls
       LEFT JOIN subscriptions sub ON sub.id=ls.subscription_id
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.owner_user_id=$1
         AND ls.assigned_user_id=$1
         AND ls.mode=$2
         AND ls.status<>'DELETED'
       ORDER BY
         CASE WHEN $2='CLOUD' AND ls.slot_type='PERSONAL' THEN 0
              WHEN $2='CLOUD' THEN 1
              ELSE 0 END,
         CASE WHEN bi.mt5_account_id IS NOT NULL THEN 0 ELSE 1 END,
         CASE WHEN sub.status='ACTIVE' AND sub.starts_at<=now() AND sub.expires_at>now() THEN 0 ELSE 1 END,
         CASE WHEN ls.subscription_id IS NOT NULL THEN 0 ELSE 1 END,
         ls.slot_number,
         ls.created_at,
         ls.id
       LIMIT 1`,
      [body.userId, mode]
    );
    if (!keepSlot) throw new ConflictException("ไม่พบ Slot ของลูกค้ารายนี้");
    if (String(keepSlot.id) === String(slot.id)) {
      throw new ConflictException(
        mode === "LOCAL"
          ? "Local MT5 ใช้ได้ 1 Slot และ Slot หลักนี้ต้องคงไว้"
          : "Cloud VPS Slot หลักต้องคงไว้"
      );
    }

    if (
      String(slot.actual_state || "").toUpperCase() === "RUNNING" ||
      ["RUNNING","STARTING"].includes(String(slot.desired_state || "").toUpperCase()) ||
      Number(slot.positions || 0) > 0 ||
      Number(slot.pending_orders || 0) > 0
    ) {
      throw new ConflictException("หยุดบอทและปิด Position / Pending Order ให้หมดก่อนลบ Slot");
    }

    if (
      mode === "CLOUD" &&
      slot.runner_id &&
      String(slot.actual_state || "OFFLINE").toUpperCase() !== "OFFLINE" &&
      !["STOP_CONFIRMED","LEASE_REVOKED"].includes(String(slot.runtime_stop_state || "NONE").toUpperCase())
    ) {
      const activeStop = await this.db.one(
        `SELECT id
         FROM worker_commands
         WHERE bot_instance_id=$1
           AND command='STOP_INSTANCE'
           AND status IN ('PENDING','DELIVERED')
         ORDER BY id DESC
         LIMIT 1`,
        [slot.instance_id]
      );
      if (!activeStop) {
        await this.db.query(
          `INSERT INTO worker_commands(
             runner_id,bot_instance_id,execution_generation,command,status
           ) VALUES($1,$2,$3,'STOP_INSTANCE','PENDING')`,
          [slot.runner_id, slot.instance_id, Number(slot.execution_generation || 1)]
        );
      }
      await this.db.query(
        `UPDATE bot_instances SET
           desired_state='STOPPED',
           runtime_stop_state='STOP_REQUESTED',
           runtime_stop_requested_at=now(),
           runtime_stop_confirmed_at=NULL,
           runtime_stop_error=NULL
         WHERE id=$1`,
        [slot.instance_id]
      );
      return {
        ok:false,
        pendingCloudStop:true,
        message:"กำลังปิด MT5 บน VPS ก่อนลบ Slot"
      };
    }

    await this.db.transaction(async tx => {
      let transferredSubscription = false;
      if (slot.subscription_id && !keepSlot.subscription_id) {
        await tx.query(
          "UPDATE license_slots SET subscription_id=$2,updated_at=now() WHERE id=$1",
          [keepSlot.id, slot.subscription_id]
        );
        if (mode === "CLOUD") {
          await tx.query(
            "UPDATE cloud_orders SET slot_id=$2 WHERE slot_id=$1 AND status='PAID'",
            [slot.id, keepSlot.id]
          );
        }
        transferredSubscription = true;
      }

      if (slot.mt5_account_id) {
        await tx.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [slot.mt5_account_id]);
        if (mode === "CLOUD") {
          await tx.query("DELETE FROM mt5_credentials WHERE mt5_account_id=$1", [slot.mt5_account_id]);
        }
      }

      if (slot.instance_id) {
        await tx.query(
          `UPDATE bot_instances SET
             mt5_account_id=NULL,
             runner_id=NULL,
             lock_owner=NULL,
             install_token_hash=encode(gen_random_bytes(32),'hex'),
             execution_generation=execution_generation+1,
             lease_rotated_at=now(),
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
             account_change_requested_at=NULL,
             runtime_stop_state='LEASE_REVOKED',
             runtime_stop_requested_at=NULL,
             runtime_stop_confirmed_at=now(),
             runtime_stop_error=NULL,
             provisioning_error=NULL,
             metrics='{}'::jsonb
           WHERE id=$1`,
          [slot.instance_id]
        );
        await tx.query("DELETE FROM bot_instance_secrets WHERE bot_instance_id=$1", [slot.instance_id]);
        await tx.query(
          "UPDATE bot_commands SET status='ACKED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')",
          [slot.instance_id]
        );
        await tx.query(
          "UPDATE worker_commands SET status='CANCELLED',result_code='ADMIN_SLOT_DELETED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')",
          [slot.instance_id]
        );
      }

      await tx.query(
        "UPDATE install_enrollments SET status='CANCELLED' WHERE slot_id=$1 AND status='PENDING'",
        [slot.id]
      );
      if (mode === "CLOUD") {
        await tx.query(
          "UPDATE cloud_orders SET runner_id=NULL WHERE slot_id=$1 AND status='PAID'",
          [slot.id]
        );
      }
      await tx.query(
        "UPDATE license_slots SET assigned_user_id=NULL,status='DELETED',updated_at=now() WHERE id=$1",
        [slot.id]
      );
      if (slot.subscription_id && !transferredSubscription) {
        const remaining = await tx.query(
          "SELECT 1 FROM license_slots WHERE subscription_id=$1 AND status<>'DELETED' LIMIT 1",
          [slot.subscription_id]
        );
        if (!remaining.rows.length) {
          await tx.query(
            "UPDATE subscriptions SET status='CANCELLED',expires_at=LEAST(expires_at,now()) WHERE id=$1 AND status='ACTIVE'",
            [slot.subscription_id]
          );
        }
      }

      if (mode === "LOCAL") {
        await tx.query(
          `UPDATE license_slots
           SET slot_number=CASE WHEN id=$2 THEN 1 ELSE slot_number+1000 END,
               slot_type=CASE WHEN id=$2 AND slot_type<>'OWNER' THEN 'PERSONAL' ELSE slot_type END,
               updated_at=now()
           WHERE owner_user_id=$1
             AND assigned_user_id=$1
             AND mode='LOCAL'
             AND status<>'DELETED'`,
          [body.userId, keepSlot.id]
        );
        const extraLocal = await tx.query(
          `SELECT id
           FROM license_slots
           WHERE owner_user_id=$1
             AND assigned_user_id=$1
             AND mode='LOCAL'
             AND status<>'DELETED'
             AND id<>$2
           ORDER BY
             CASE WHEN EXISTS(SELECT 1 FROM bot_instances bi WHERE bi.slot_id=license_slots.id AND bi.mt5_account_id IS NOT NULL) THEN 0 ELSE 1 END,
             created_at,id`,
          [body.userId, keepSlot.id]
        );
        for (let index=0; index<extraLocal.rows.length; index++) {
          await tx.query(
            "UPDATE license_slots SET slot_number=$2,updated_at=now() WHERE id=$1",
            [extraLocal.rows[index].id, index+2]
          );
        }
      } else if (mode === "CLOUD") {
        await tx.query(
          `UPDATE license_slots
           SET slot_number=slot_number+1000,
               slot_type='ADDON',
               updated_at=now()
           WHERE owner_user_id=$1
             AND assigned_user_id=$1
             AND mode='CLOUD'
             AND status<>'DELETED'
             AND id<>$2`,
          [body.userId, keepSlot.id]
        );
        await tx.query(
          `UPDATE license_slots
           SET slot_number=slot_number+1000,
               slot_type='PERSONAL',
               updated_at=now()
           WHERE id=$1`,
          [keepSlot.id]
        );
        const cloudRows = await tx.query(
          `SELECT id
           FROM license_slots
           WHERE owner_user_id=$1
             AND assigned_user_id=$1
             AND mode='CLOUD'
             AND status<>'DELETED'
           ORDER BY CASE WHEN id=$2 THEN 0 ELSE 1 END,created_at,id`,
          [body.userId, keepSlot.id]
        );
        for (let index=0; index<cloudRows.rows.length; index++) {
          await tx.query(
            "UPDATE license_slots SET slot_number=$2,updated_at=now() WHERE id=$1",
            [cloudRows.rows[index].id, index+1]
          );
        }
      }
    });

    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    await this.audit(actor, "DELETE_CUSTOMER_SLOT", "license_slot", slot.id, {
      userId: body.userId,
      userCode: slot.user_code,
      mode,
      slotNumber: Number(slot.slot_number || 0),
      slotType: slot.slot_type || null,
      subscriptionId: slot.subscription_id || null,
      oldMt5AccountId: slot.mt5_account_id || null,
      oldRunnerId: slot.runner_id || null
    });

    return {
      ok:true,
      deleted:true,
      slotId:slot.id,
      mode,
      slotNumber:Number(slot.slot_number || 0)
    };
  }

  @Post("devices/release")
  async releaseCustomerDevice(@Body() body: { userId: string; slotId: string }) {
    const slot = await this.db.one(
      `SELECT ls.*,bi.id instance_id,bi.actual_state,bi.desired_state,
         COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
         (bi.last_seen_at IS NOT NULL AND bi.last_seen_at > now() - interval '20 seconds') mt5_online,
         bi.device_hostname,bi.mt5_account_id
       FROM license_slots ls
       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
       WHERE ls.id=$1
         AND ls.assigned_user_id=$2
         AND ls.mode='LOCAL'
         AND ls.status<>'DELETED'`,
      [body.slotId, body.userId]
    );
    if (!slot) throw new ConflictException("ไม่พบ LOCAL Slot ของลูกค้ารายนี้");
    if (!slot.instance_id) {
      return { ok: true, released: false, message: "Slot นี้ยังไม่มี Device ที่ลงทะเบียน" };
    }
    if (Number(slot.positions || 0) > 0) {
      throw new ConflictException("ลูกค้ายังมี Position ค้างอยู่ กรุณาปิด Position ก่อนปลดเครื่อง");
    }
    if (
      Boolean(slot.mt5_online) &&
      (slot.actual_state === "RUNNING" || slot.desired_state === "RUNNING")
    ) {
      throw new ConflictException("MT5 ของลูกค้ายัง Online และบอทกำลังทำงาน กรุณาหยุดบอทก่อนปลดเครื่อง");
    }

    await this.db.query(
      `UPDATE bot_instances SET
         install_token_hash=encode(gen_random_bytes(32),'hex'),
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
      [slot.instance_id]
    );
    await this.db.query(
      "UPDATE install_enrollments SET status='CANCELLED' WHERE slot_id=$1 AND status='PENDING'",
      [slot.id]
    );
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')",
      [slot.instance_id]
    );
    await this.audit("OWNER", "RELEASE_CUSTOMER_DEVICE", "bot_instance", slot.instance_id, {
      userId: body.userId,
      slotId: slot.id,
      deviceHostname: slot.device_hostname || null,
      preservedMt5AccountId: slot.mt5_account_id || null
    });

    return {
      ok: true,
      released: true,
      message: "ปลด Device Lock ของลูกค้าแล้ว สมาชิกและ MT5 เดิมยังคงอยู่"
    };
  }

  @Post("users/send-password-reset")
  async sendPasswordReset(@Req() req: any, @Body() body: { userId: string }) {
    const user = await this.db.one(
      "SELECT id,user_code,email,role,status FROM users WHERE id=$1 AND status<>'DELETED'",
      [body.userId]
    );
    if (!user) throw new ConflictException("ไม่พบบัญชีลูกค้า");
    if (user.role === "OWNER" || user.role === "ADMIN") {
      throw new ConflictException("ไม่อนุญาตให้รีเซ็ตรหัส OWNER/ADMIN จาก Customer Control Center");
    }

    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.EMAIL_FROM || "").trim();
    const webBase = String(process.env.PUBLIC_WEB_BASE || process.env.PUBLIC_WEB_URL || process.env.WEB_ORIGIN || "").trim().replace(/\/$/, "");
    if (!apiKey || !from || !webBase) {
      throw new ServiceUnavailableException("ระบบส่งอีเมลรีเซ็ตรหัสผ่านยังตั้งค่าไม่ครบ");
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";

    const record = await this.db.one(
      `INSERT INTO password_reset_tokens(user_id,token_hash,requested_by,expires_at)
       VALUES($1,$2,$3,now() + interval '30 minutes')
       RETURNING id`,
      [user.id, tokenHash, actor]
    );
    await this.db.query(
      `UPDATE password_reset_tokens
       SET consumed_at=COALESCE(consumed_at,now())
       WHERE user_id=$1 AND id<>$2 AND consumed_at IS NULL`,
      [user.id, record.id]
    );

    const resetUrl = webBase + "/reset-password?token=" + encodeURIComponent(token);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: [user.email],
          subject: "ตั้งรหัสผ่านใหม่สำหรับบัญชี SCENOVA",
          html:
            '<div style="font-family:Arial,sans-serif;background:#090711;color:#f4f1ff;padding:32px">' +
            '<div style="max-width:560px;margin:auto;border:1px solid #4d3d78;border-radius:16px;padding:28px;background:#100c1d">' +
            '<div style="font-size:12px;letter-spacing:3px;color:#a38bff">SCENOVA ACCOUNT SECURITY</div>' +
            '<h2 style="margin:14px 0 8px">ตั้งรหัสผ่านใหม่</h2>' +
            '<p style="color:#b9b1c8;line-height:1.7">ผู้ดูแลระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้บัญชี ' + user.user_code + ' ลิงก์นี้ใช้ได้ครั้งเดียวและหมดอายุใน 30 นาที</p>' +
            '<p style="margin:24px 0"><a href="' + resetUrl + '" style="display:inline-block;background:#7657f4;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">ตั้งรหัสผ่านใหม่</a></p>' +
            '<p style="color:#777083;font-size:12px;line-height:1.6">หากคุณไม่ได้ขอให้ผู้ดูแลรีเซ็ตรหัสผ่าน กรุณาติดต่อ SCENOVA และไม่ต้องเปิดลิงก์นี้</p>' +
            '</div></div>'
        })
      });
      if (!response.ok) throw new Error("resend request failed");
    } catch {
      await this.db.query("DELETE FROM password_reset_tokens WHERE id=$1", [record.id]);
      throw new ServiceUnavailableException("ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }

    await this.audit(actor, "SEND_PASSWORD_RESET", "user", user.id, {
      email: user.email,
      expiresInMinutes: 30
    });
    return { ok: true, email: user.email, expiresInMinutes: 30 };
  }

  @Post("users/suspend")
  async suspend(@Body() body: { userId: string }) {
    await this.db.query(
      "UPDATE users SET status='SUSPENDED',updated_at=now() WHERE id=$1",
      [body.userId]
    );
    const instances = await this.db.query(
      `SELECT DISTINCT bi.id
       FROM bot_instances bi
       JOIN license_slots ls ON ls.id=bi.slot_id
       WHERE ls.assigned_user_id=$1 OR ls.owner_user_id=$1`,
      [body.userId]
    );
    for (const instance of instances.rows) {
      await this.db.query(
        "UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1",
        [instance.id]
      );
      await this.db.query(
        "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
        [instance.id]
      );
    }
    await this.audit("ADMIN", "SUSPEND_USER", "user", body.userId, {});
    return { ok: true };
  }

  @Post("users/delete")
  async deleteUser(@Body() body: { userId: string }) {
    return this.db.transaction(async tx => {
      const user = (await tx.query(
        "SELECT id,user_code,email,role,status FROM users WHERE id=$1 FOR UPDATE",
        [body.userId]
      )).rows[0];
      if (!user) throw new ConflictException("user not found");
      if (user.role === "OWNER" || user.role === "ADMIN") {
        throw new ConflictException("owner/admin account cannot be deleted here");
      }
      if (user.status === "DELETED") {
        throw new ConflictException("account already deleted");
      }

      const active = (await tx.query(
        `SELECT count(*)::int active_count
         FROM bot_instances bi
         JOIN license_slots ls ON ls.id=bi.slot_id
         WHERE (ls.assigned_user_id=$1 OR ls.owner_user_id=$1)
           AND (
             bi.actual_state='RUNNING' OR bi.desired_state='RUNNING' OR
             COALESCE(NULLIF(bi.metrics->>'positions','')::int,0)>0
           )`,
        [body.userId]
      )).rows[0];
      if ((active?.active_count || 0) > 0) {
        throw new ConflictException("stop the bot and close all positions before deleting this account");
      }

      const instances = await tx.query(
        `SELECT DISTINCT bi.id,bi.actual_state,bi.desired_state,bi.runtime_stop_state
         FROM bot_instances bi
         JOIN license_slots ls ON ls.id=bi.slot_id
         WHERE ls.assigned_user_id=$1 OR ls.owner_user_id=$1`,
        [body.userId]
      );
      for (const instance of instances.rows) {
        // Do not queue another SAFE_STOP for an already confirmed, offline terminal.
        if (instance.actual_state === "OFFLINE" &&
            instance.desired_state === "SAFE_STOP" &&
            instance.runtime_stop_state === "STOP_CONFIRMED") continue;
        await tx.query(
          "UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1",
          [instance.id]
        );
        await tx.query(
          "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
          [instance.id]
        );
      }

      await tx.query(
        "UPDATE subscriptions SET status='CANCELLED' WHERE user_id=$1 AND status='ACTIVE'",
        [body.userId]
      );
      // Retain historical DELETED slots. Reviving them would violate the unique
      // active Cloud Slot index when the customer has a replacement slot.
      await tx.query(
        "UPDATE license_slots SET status='SUSPENDED',updated_at=now() WHERE owner_user_id=$1 AND status<>'DELETED'",
        [body.userId]
      );
      await tx.query(
        "UPDATE license_slots SET assigned_user_id=NULL,status='AVAILABLE',updated_at=now() WHERE assigned_user_id=$1 AND owner_user_id<>$1 AND status<>'DELETED'",
        [body.userId]
      );
      // Keep the historic user/MT5/Trial records but free this unique email
      // for a new registration. A suspended (non-deleted) user keeps the email.
      await tx.query(
        `UPDATE users SET status='DELETED',
           email='deleted.' || id::text || '@deleted.scenova.invalid',
           updated_at=now() WHERE id=$1`,
        [body.userId]
      );
      await tx.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
        ["ADMIN","DELETE_USER","user",body.userId,JSON.stringify({
          userCode:user.user_code,email:user.email,preservedTrialHistory:true
        })]
      );
      return { ok: true };
    });
  }

  @Post("users/reactivate")
  async reactivate(@Body() body: { userId: string }) {
    await this.db.query(
      "UPDATE users SET status='ACTIVE',updated_at=now() WHERE id=$1",
      [body.userId]
    );
    await this.audit("ADMIN", "REACTIVATE_USER", "user", body.userId, {});
    return { ok: true };
  }

  @Get("maintenance")
  async maintenanceStatus() {
    return this.maintenance.snapshot();
  }

  @Post("partners/grant")
  async grantPartner(@Req() req: any, @Body() body: {
    userId: string;
    seatLimit?: number;
    partnerDurationDays?: number;
    customerDurationDays?: number;
  }) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    return this.partner.grantPartner(body, actor);
  }

  @Post("partners/renew")
  async renewPartner(@Req() req: any, @Body() body: { userId: string; durationDays?: number }) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    return this.partner.renewPartner(body.userId, Number(body.durationDays || 30), actor);
  }

  @Post("partners/suspend")
  async suspendPartner(@Req() req: any, @Body() body: { userId: string }) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    return this.partner.suspendPartner(body.userId, actor);
  }

  // Informational notices are separate from Maintenance. No trading commands are issued.
  @Post("announcements/publish")
  async publishGeneralAnnouncement(
    @Req() req: any,
    @Body() body: { title?: string; message?: string }
  ) {
    const title = String(body?.title || "").trim();
    const message = String(body?.message || "").trim();
    if (!title || title.length > 160 || !message || message.length > 3000) {
      throw new BadRequestException("กรุณาระบุหัวข้อ (ไม่เกิน 160 ตัวอักษร) และข้อความประกาศ (ไม่เกิน 3000 ตัวอักษร)");
    }
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    const row = await this.db.one(
      "INSERT INTO system_announcements(id,title,message,active,published_at,updated_by) "+
      "VALUES(1,$1,$2,true,now(),$3) ON CONFLICT(id) DO UPDATE "+
      "SET title=EXCLUDED.title,message=EXCLUDED.message,active=true,published_at=now(),updated_by=EXCLUDED.updated_by "+
      "RETURNING title,message,published_at",
      [title, message, actor.slice(0,120)]
    );
    await this.audit(actor,"PUBLISH_GENERAL_ANNOUNCEMENT","system","announcement",{
      title, messageLength: message.length
    });
    return {ok:true,announcement:row};
  }

  @Post("announcements/clear")
  async clearGeneralAnnouncement(@Req() req: any) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    await this.db.query("UPDATE system_announcements SET active=false,updated_by=$1 WHERE id=1",[actor.slice(0,120)]);
    await this.audit(actor,"CLEAR_GENERAL_ANNOUNCEMENT","system","announcement",{});
    return {ok:true};
  }

  @Post("maintenance/announce")
  async announceMaintenance(@Req() req: any, @Body() body: {
    title?: string;
    message?: string;
    maintenanceAt: string;
    forceCloseAt?: string;
    expectedResumeAt?: string;
    forceClose?: boolean;
  }) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    const result = await this.maintenance.schedule(body, actor);
    await this.audit(actor, "SCHEDULE_MAINTENANCE", "system", "maintenance", {
      maintenanceAt: result.maintenance_at,
      forceCloseAt: result.force_close_at,
      expectedResumeAt: result.expected_resume_at,
      forceClose: result.force_close
    });
    return result;
  }

  @Post("maintenance/shutdown")
  async shutdownForMaintenance(@Req() req: any, @Body() body: { message?: string }) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    const result = await this.maintenance.shutdownNow(actor, body?.message);
    await this.audit(actor, "BEGIN_EMERGENCY_FORCE_FLAT", "system", "maintenance", {
      openPositions: result.summary?.openPositions || 0,
      openPendingOrders: result.summary?.openPendingOrders || 0,
      unresolvedCloseAll: result.summary?.unresolvedCloseAll || 0,
      runningInstances: result.summary?.runningInstances || 0
    });
    return result;
  }

  @Post("maintenance/close-instance")
  async closeMaintenanceInstance(@Req() req: any, @Body() body: { instanceId: string }) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    const result = await this.maintenance.forceCloseInstance(body?.instanceId, actor);
    await this.audit(actor, "FORCE_CLOSE_ACCOUNT_POSITIONS", "bot_instance", result.instanceId, {
      userCode: result.userCode,
      accountNumber: result.accountNumber,
      brokerServer: result.brokerServer,
      positionsAtRequest: result.positions,
      pendingOrdersAtRequest: result.pendingOrders
    });
    return result;
  }

  @Post("maintenance/force-flat-all")
  async forceFlatAllAccounts(@Req() req: any, @Body() body: { confirmation?: string }) {
    if (req.user?.role && req.user.role !== "OWNER") {
      throw new ForbiddenException("คำสั่ง FORCE FLAT ALL ใช้ได้เฉพาะ OWNER เท่านั้น");
    }
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    const result = await this.maintenance.forceFlatAll(actor, body?.confirmation || "");
    await this.audit(actor, "FORCE_FLAT_ALL_ACCOUNTS", "system", "maintenance", {
      targetInstances: result.emergency?.targetInstances || 0,
      queuedCloseAll: result.emergency?.queuedCloseAll || 0,
      runningAtRequest: result.emergency?.runningAtRequest || 0,
      positionsAtRequest: result.emergency?.positionsAtRequest || 0,
      freshPositionsAtRequest: result.emergency?.freshPositionsAtRequest || 0,
      stalePositionsAtRequest: result.emergency?.stalePositionsAtRequest || 0
    });
    return result;
  }

  @Post("maintenance/cancel")
  async cancelMaintenance(@Req() req: any) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    const result = await this.maintenance.cancel(actor);
    await this.audit(actor, "CANCEL_MAINTENANCE", "system", "maintenance", {});
    return result;
  }

  @Post("maintenance/resume")
  async resumeAfterMaintenance(@Req() req: any) {
    const actor = req.user?.sub ? "OWNER:" + String(req.user.sub) : "ADMIN_KEY";
    const result = await this.maintenance.resume(actor);
    await this.audit(actor, "RESUME_AFTER_MAINTENANCE", "system", "maintenance", {});
    return result;
  }

  private async audit(
    actor: string,
    action: string,
    entityType: string,
    entityId: string,
    detail: any
  ) {
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
      [actor, action, entityType, entityId, JSON.stringify(detail)]
    );
  }
}
