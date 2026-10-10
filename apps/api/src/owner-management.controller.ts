import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Param,
  Post,
  Query,
  Req
} from "@nestjs/common";
import { DbService } from "./db.service";
import { OwnerMobileService } from "./owner-mobile.controller";
import { PromotionInput, PromotionService } from "./promotion.service";
import { getUsdThbQuote, usdCentsToThbSatang } from "./commerce-currency";
import { randomUUID } from "crypto";
import { versionAtLeast } from "./cloud-server-release";
import { exactConnectedAccountSymbol } from "./connected-symbol-choices";
import { ProductionHardeningService } from "./production-hardening.service";
import { MaintenanceService } from "./maintenance.service";

const PACKAGE_MONTHS = [1, 3, 6, 12];

@Injectable()
export class OwnerManagementService {
  constructor(private readonly db: DbService) {}

  private actor(session: any) {
    return "OWNER-MOBILE:" + String(session?.user_code || session?.owner_user_id || "OWNER");
  }

  private async audit(session: any, action: string, entityType: string, entityId: string, detail: any = {}) {
    await this.db.query(
      "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)",
      [this.actor(session), action, entityType, entityId, JSON.stringify(detail || {})]
    );
  }

  async packages() {
    const [local, cloud, quote] = await Promise.all([
      this.db.query("SELECT months,price_satang,price_usd_cents,enabled,updated_at FROM local_packages ORDER BY months"),
      this.db.query("SELECT months,price_satang,price_usd_cents,enabled,updated_at FROM cloud_packages ORDER BY months"),
      getUsdThbQuote()
    ]);
    return { local: local.rows, cloud: cloud.rows, fx: quote };
  }

  async savePackage(session: any, input: { mode?: string; months?: number; priceUsdCents?: number; enabled?: boolean }) {
    const mode = String(input.mode || "").toUpperCase();
    const months = Math.trunc(Number(input.months || 0));
    const priceUsdCents = Math.trunc(Number(input.priceUsdCents ?? -1));
    if (!["LOCAL", "CLOUD"].includes(mode) || !PACKAGE_MONTHS.includes(months)) {
      throw new BadRequestException("แพ็กเกจไม่ถูกต้อง");
    }
    if (!Number.isInteger(priceUsdCents) || priceUsdCents < 0 || priceUsdCents > 3_000_000) {
      throw new BadRequestException("ราคาแพ็กเกจ USD ไม่ถูกต้อง");
    }
    if (Boolean(input.enabled) && priceUsdCents <= 0) {
      throw new BadRequestException("แพ็กเกจที่เปิดขายต้องมีราคา USD มากกว่า 0");
    }
    if (mode === "CLOUD" && Boolean(input.enabled) && priceUsdCents < 50) {
      throw new BadRequestException("Cloud เปิดขายได้ตั้งแต่ $0.50 ขึ้นไป");
    }
    const quote = await getUsdThbQuote();
    const priceSatang = usdCentsToThbSatang(priceUsdCents, quote.usdThb);
    const table = mode === "LOCAL" ? "local_packages" : "cloud_packages";
    const row = await this.db.one(
      "UPDATE " + table + " SET price_usd_cents=$2,price_satang=$3,enabled=$4,updated_at=now() WHERE months=$1 RETURNING months,price_satang,price_usd_cents,enabled,updated_at",
      [months, priceUsdCents, priceSatang, Boolean(input.enabled)]
    );
    if (!row) throw new ConflictException("ไม่พบแพ็กเกจ");
    await this.audit(session, "UPDATE_PACKAGE", "package", mode + "_" + months + "M", {
      mode, months, priceUsdCents, fxRateUsdThb: quote.usdThb, enabled: Boolean(input.enabled)
    });
    return row;
  }

  async searchAccounts(q = "") {
    const term = q.trim().slice(0, 160);
    const like = "%" + term + "%";
    const result = await this.db.query(`
      SELECT u.id,u.user_code,u.email,u.status,u.created_at,u.email_verified_at,
        sub.id subscription_id,sub.plan_code,sub.subscription_mode,
        sub.subscription_status,sub.subscription_expires_at,
        mt.account_number,mt.broker_server
      FROM users u
      LEFT JOIN LATERAL (
        SELECT s.id,p.code plan_code,p.mode subscription_mode,
          s.status subscription_status,s.expires_at subscription_expires_at
        FROM subscriptions s JOIN plans p ON p.id=s.plan_id
        WHERE s.user_id=u.id
        ORDER BY (s.status='ACTIVE' AND s.expires_at>now()) DESC,s.expires_at DESC,s.created_at DESC
        LIMIT 1
      ) sub ON true
      LEFT JOIN LATERAL (
        SELECT account_number,broker_server
        FROM mt5_accounts WHERE user_id=u.id AND status<>'DELETED'
        ORDER BY created_at DESC LIMIT 1
      ) mt ON true
      WHERE u.role NOT IN ('OWNER','ADMIN') AND u.status<>'DELETED'
        AND ($1='' OR u.user_code ILIKE $2 OR u.email ILIKE $2 OR
          EXISTS (SELECT 1 FROM mt5_accounts m WHERE m.user_id=u.id AND m.account_number ILIKE $2))
      ORDER BY u.created_at DESC
      LIMIT 50
    `, [term, like]);
    return { items: result.rows };
  }

  async account(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException("User ID ไม่ถูกต้อง");
    const user = await this.db.one(
      "SELECT id,user_code,email,role,status,created_at,email_verified_at FROM users WHERE id=$1 AND role NOT IN ('OWNER','ADMIN') AND status<>'DELETED'",
      [id]
    );
    if (!user) throw new BadRequestException("ไม่พบบัญชีลูกค้า");
    const [subscriptions, slots, mt5] = await Promise.all([
      this.db.query(`
        SELECT s.id,s.status,s.starts_at,s.expires_at,s.activated_by,s.note,
          p.code plan_code,p.name_th,p.mode
        FROM subscriptions s JOIN plans p ON p.id=s.plan_id
        WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT 20
      `, [id]),
      this.db.query(`
        SELECT ls.id,ls.mode,ls.slot_number,ls.slot_type,ls.status,ls.subscription_id,
          bi.id instance_id,bi.mt5_account_id,bi.actual_state,bi.desired_state,bi.runner_id,
          bi.runtime_stop_state,bi.execution_generation,bi.agent_last_seen_at,bi.last_seen_at,
          COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
          COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0) pending_orders,
          bi.metrics->>'symbol' active_symbol,
          COALESCE(NULLIF(bs.settings->>'startupSymbol',''),NULLIF(bs.settings->>'symbol','')) requested_symbol,
          COALESCE(bi.metrics->'marketWatchSymbols','[]'::jsonb) market_watch_symbols,
          a.account_number,a.broker,a.broker_server
        FROM license_slots ls
        LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
        LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
        LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
        WHERE ls.owner_user_id=$1 AND ls.status<>'DELETED'
        ORDER BY ls.mode,ls.slot_number
      `, [id]),
      this.db.query(
        "SELECT id,account_number,broker,broker_server,mode,status,created_at FROM mt5_accounts WHERE user_id=$1 ORDER BY created_at DESC",
        [id]
      )
    ]);
    return { user, subscriptions: subscriptions.rows, slots: slots.rows, mt5Accounts: mt5.rows };
  }

  async opsOverview() {
    const [users, bots, cloud, incidents, maintenance] = await Promise.all([
      this.db.one(`
        SELECT
          count(*) FILTER (WHERE role NOT IN ('OWNER','ADMIN') AND status<>'DELETED')::int total_customers,
          count(*) FILTER (WHERE role NOT IN ('OWNER','ADMIN') AND status='ACTIVE')::int active_customers
        FROM users
      `),
      this.db.one(`
        SELECT
          count(*)::int total,
          count(*) FILTER (WHERE actual_state='RUNNING')::int running,
          count(*) FILTER (WHERE last_seen_at>now()-interval '90 seconds')::int online,
          count(*) FILTER (WHERE actual_state='SAFE_STOP' OR desired_state='SAFE_STOP')::int safe_stop
        FROM bot_instances
      `),
      this.db.one(`
        SELECT
          count(*)::int nodes,
          count(*) FILTER (WHERE w.last_seen_at>now()-interval '30 seconds')::int online_nodes,
          COALESCE(sum(w.capacity),0)::int capacity,
          COALESCE(sum(GREATEST(COALESCE(l.occupied,0),w.active_instances)),0)::int active_instances,
          count(*) FILTER (WHERE w.capacity_blocked OR w.quarantined)::int blocked
        FROM worker_nodes w
        LEFT JOIN cloud_node_load l USING(runner_id)
      `),
      this.db.one("SELECT count(*)::int open FROM runtime_incidents WHERE state='OPEN'"),
      this.db.one("SELECT status,title,message,updated_at FROM system_maintenance WHERE id=1")
    ]);
    return {
      customers: users || { total_customers: 0, active_customers: 0 },
      bots: bots || { total: 0, running: 0, online: 0, safe_stop: 0 },
      cloud: cloud || { nodes: 0, online_nodes: 0, capacity: 0, active_instances: 0, blocked: 0 },
      incidents: { open: Number(incidents?.open || 0) },
      maintenance: maintenance || { status: "OFF" }
    };
  }

  async trading(q = "") {
    const term = q.trim().slice(0, 120);
    const like = "%" + term + "%";
    const result = await this.db.query(`
      SELECT
        bi.id instance_id,ls.id slot_id,ls.mode,ls.slot_number,
        u.id user_id,u.user_code,u.email,
        a.account_number,a.broker_server,
        bi.actual_state,bi.desired_state,bi.last_seen_at,bi.runner_id,
        bi.metrics->>'symbol' symbol,
        COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
        COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0) pending_orders,
        COALESCE(NULLIF(bi.metrics->>'eaVersion',''),NULLIF(bi.metrics->>'version','')) ea_version
      FROM bot_instances bi
      JOIN license_slots ls ON ls.id=bi.slot_id
      JOIN users u ON u.id=ls.assigned_user_id
      LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
      WHERE u.role NOT IN ('OWNER','ADMIN')
        AND u.status<>'DELETED'
        AND ($1='' OR u.user_code ILIKE $2 OR u.email ILIKE $2 OR COALESCE(a.account_number,'') ILIKE $2)
      ORDER BY (bi.actual_state='RUNNING') DESC,bi.last_seen_at DESC NULLS LAST,u.user_code
      LIMIT 120
    `, [term, like]);
    return { items: result.rows };
  }

  private async customerSlot(userId: string, slotId: string) {
    return this.db.one(`
      SELECT
        ls.*,u.user_code,
        bi.id instance_id,bi.mt5_account_id,bi.actual_state,bi.desired_state,bi.runner_id,
        bi.execution_generation,bi.runtime_stop_state,bi.metrics,bi.agent_last_seen_at,bi.last_seen_at,
        bs.settings,a.account_number,a.broker_server,
        COALESCE(NULLIF(bi.metrics->>'positions','')::int,0) positions,
        COALESCE(NULLIF(bi.metrics->>'accountScenovaPendingOrders','')::int,0) pending_orders
      FROM license_slots ls
      JOIN users u ON u.id=ls.assigned_user_id
      LEFT JOIN bot_instances bi ON bi.slot_id=ls.id
      LEFT JOIN bot_settings bs ON bs.bot_instance_id=bi.id
      LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id
      WHERE ls.id=$1 AND ls.assigned_user_id=$2 AND ls.owner_user_id=$2 AND ls.status<>'DELETED'
    `, [slotId, userId]);
  }

  async adjustAccessDays(session: any, id: string, input: { subscriptionId?: string; days?: number }) {
    const subscriptionId = String(input.subscriptionId || "");
    const days = Math.trunc(Number(input.days || 0));
    if (!/^[0-9a-f-]{36}$/i.test(subscriptionId)) throw new BadRequestException("Subscription ID ไม่ถูกต้อง");
    if (!Number.isInteger(days) || days === 0 || days < -3650 || days > 3650) {
      throw new BadRequestException("จำนวนวันต้องอยู่ระหว่าง -3650 ถึง 3650 และห้ามเป็น 0");
    }
    const partner = await this.db.one(
      "SELECT id FROM partner_customers WHERE customer_user_id=$1 AND status='ACTIVE' LIMIT 1", [id]
    );
    if (partner) throw new ConflictException("บัญชีนี้อยู่ภายใต้ Partner กรุณาจัดการสิทธิ์จาก Owner Console");
    const row = await this.db.one(
      `UPDATE subscriptions
       SET expires_at=CASE
         WHEN $3::int>0 THEN GREATEST(expires_at,now())+($3::text || ' days')::interval
         ELSE GREATEST(now(),expires_at+($3::text || ' days')::interval)
       END,
       status='ACTIVE'
       WHERE id=$1 AND user_id=$2
       RETURNING *`,
      [subscriptionId, id, days]
    );
    if (!row) throw new ConflictException("ไม่พบ Subscription ของลูกค้ารายนี้");
    await this.db.query(
      "UPDATE license_slots SET status='ACTIVE',updated_at=now() WHERE owner_user_id=$1 AND subscription_id=$2 AND status<>'DELETED'",
      [id, subscriptionId]
    );
    await this.audit(session, days > 0 ? "ADD_CUSTOMER_DAYS" : "REDUCE_CUSTOMER_DAYS", "subscription", subscriptionId, { userId: id, days });
    return this.account(id);
  }

  async selectSlotSymbol(session: any, userId: string, input: { slotId?: string; symbol?: string }) {
    const slotId = String(input.slotId || "");
    const slot = await this.customerSlot(userId, slotId);
    if (!slot) throw new ConflictException("ไม่พบ Slot ของลูกค้ารายนี้");
    if (!slot.instance_id || !slot.mt5_account_id) throw new ConflictException("Slot นี้ยังไม่ได้เชื่อมบัญชี MT5");
    const requestedSymbol = String(input.symbol || "").trim();
    const postConnect = String(slot.settings?.symbolResolutionMode || "").toUpperCase() === "EXACT"
      && Boolean(String(slot.settings?.startupSymbol || slot.settings?.symbol || "").trim());
    if (!/^[A-Za-z0-9._#-]{1,64}$/.test(requestedSymbol) ||
        (!postConnect && !/^XAU[A-Za-z0-9._#-]{3,29}$/i.test(requestedSymbol))) {
      throw new ConflictException("กรุณาเลือก Symbol ที่ MT5 บัญชีนี้ตรวจพบจริง");
    }
    if (
      Number(slot.positions || 0) > 0 ||
      Number(slot.pending_orders || 0) > 0 ||
      String(slot.actual_state || "").toUpperCase() === "RUNNING" ||
      String(slot.desired_state || "").toUpperCase() === "RUNNING"
    ) {
      throw new ConflictException("กรุณาหยุดบอทและให้ Position / Pending Order เป็น 0 ก่อนเปลี่ยน Symbol");
    }
    const mode = String(slot.mode || "").toUpperCase();
    const recentEa = Boolean(slot.last_seen_at &&
      Date.now() - new Date(slot.last_seen_at).getTime() <= 90_000);
    if (postConnect && !recentEa) {
      throw new ConflictException("ต้องรอ EA ส่ง Market Watch ล่าสุดจาก MT5 บัญชีนี้ก่อนเปลี่ยน Symbol");
    }
    const exactMarketWatchSymbol = postConnect
      ? exactConnectedAccountSymbol(requestedSymbol, slot.metrics)
      : "";
    if (postConnect && !exactMarketWatchSymbol) {
      throw new ConflictException("Symbol นี้ไม่อยู่ใน Market Watch ล่าสุดของบัญชี MT5 นี้");
    }
    if (mode === "CLOUD") {
      if (!slot.runner_id) throw new ConflictException("Cloud VPS Slot นี้ยังไม่ได้เชื่อม Worker");
      if (String(slot.runtime_stop_state || "NONE").toUpperCase() !== "NONE") {
        throw new ConflictException("Cloud VPS กำลังหยุด Runtime กรุณารอสักครู่");
      }
      const worker = await this.db.one("SELECT last_seen_at,telemetry FROM worker_nodes WHERE runner_id=$1", [slot.runner_id]);
      const online = Boolean(worker?.last_seen_at && Date.now()-new Date(worker.last_seen_at).getTime()<=30_000);
      if (!online) throw new ConflictException("Cloud Worker Offline");
      if (!versionAtLeast(worker?.telemetry?.version, "2.2.36")) {
        throw new ConflictException("Cloud Worker ยังไม่รองรับ Symbol Discovery รุ่นใหม่");
      }
      if (!postConnect) {
        // Keep the first-connection Worker XAU validation unchanged.
        const workerInstance = Array.isArray(worker?.telemetry?.instances)
          ? worker.telemetry.instances.find((item:any)=>String(item?.instanceId || "")===String(slot.instance_id))
          : null;
        const discovered = Array.isArray(workerInstance?.discoveredXauSymbols)
          ? workerInstance.discoveredXauSymbols.map((item:any)=>String(item || "").trim()).filter(Boolean)
          : [];
        if (!discovered.some((item:string)=>item.toUpperCase()===requestedSymbol.toUpperCase())) {
          throw new ConflictException("Symbol นี้ไม่ได้อยู่ในรายการ XAU ที่ VPS ตรวจพบจาก MT5 บัญชีจริง");
        }
      }
    } else if (mode === "LOCAL") {
      const online = Boolean(slot.agent_last_seen_at && Date.now()-new Date(slot.agent_last_seen_at).getTime()<=90_000);
      if (!online) throw new ConflictException("Windows Agent ของ Slot นี้ Offline");
      if (!postConnect && !exactConnectedAccountSymbol(requestedSymbol, slot.metrics)) {
        throw new ConflictException("Symbol นี้ไม่มีอยู่ใน Market Watch จริงของบัญชี MT5");
      }
    } else {
      throw new ConflictException("โหมด Slot ไม่ถูกต้อง");
    }

    const resolvedSymbol = postConnect ? exactMarketWatchSymbol : requestedSymbol;
    const requestedAt = new Date().toISOString();
    await this.db.query(`
      INSERT INTO bot_settings(bot_instance_id,settings,updated_at)
      VALUES($1,jsonb_build_object('startupSymbol',$2::text,'symbol',$2::text,'symbolResolutionMode','EXACT','symbolSelectedBy','OWNER_MOBILE'),now())
      ON CONFLICT(bot_instance_id) DO UPDATE SET
        settings=jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(COALESCE(bot_settings.settings,'{}'::jsonb),'{startupSymbol}',to_jsonb($2::text),true),
              '{symbol}',to_jsonb($2::text),true
            ),
            '{symbolResolutionMode}',to_jsonb('EXACT'::text),true
          ),
          '{symbolSelectedBy}',to_jsonb('OWNER_MOBILE'::text),true
        ),
        updated_at=now()
    `, [slot.instance_id, resolvedSymbol]);
    await this.db.query(`
      UPDATE bot_instances SET desired_state=$2,
        metrics=COALESCE(metrics,'{}'::jsonb)||jsonb_build_object(
          'requestedStartupSymbol',$3::text,'symbolChangeStatus','QUEUED',
          'symbolChangeRequestedAt',$4::text,'symbolChangeSource','OWNER_MOBILE_EXACT'
        )
      WHERE id=$1
    `, [slot.instance_id, mode==="CLOUD" ? "STOPPED" : "SAFE_STOP", resolvedSymbol, requestedAt]);

    let actionId: string | null = null;
    if (mode === "CLOUD") {
      await this.db.query(`
        INSERT INTO worker_commands(runner_id,bot_instance_id,execution_generation,command,status)
        SELECT $1,$2,$3,'RELOAD_INSTANCE','PENDING'
        WHERE NOT EXISTS (
          SELECT 1 FROM worker_commands WHERE bot_instance_id=$2 AND execution_generation=$3
          AND command='RELOAD_INSTANCE' AND status IN ('PENDING','DELIVERED')
        )
      `, [slot.runner_id, slot.instance_id, Number(slot.execution_generation || 1)]);
    } else {
      actionId = randomUUID();
      await this.db.query(`
        UPDATE bot_instances SET metrics=COALESCE(metrics,'{}'::jsonb)||jsonb_build_object(
          'manualMt5ActionName','CONNECT_MT5','manualMt5ActionId',$2::text,
          'manualMt5ActionRequestedAt',$3::text,'manualMt5ActionStatus','PENDING',
          'manualMt5ActionSource','OWNER_MOBILE_EXACT_SYMBOL',
          'manualMt5ActionMessage',$4::text
        ) WHERE id=$1
      `, [slot.instance_id, actionId, requestedAt, "Owner Mobile เลือก Symbol " + resolvedSymbol]);
      await this.db.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",
        [slot.instance_id]
      );
      await this.db.query("INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')", [slot.instance_id]);
    }
    await this.audit(session, "OWNER_MOBILE_SELECT_SLOT_SYMBOL", "bot_instance", slot.instance_id, {
      userId, slotId, mode, requestedSymbol, actionId
    });
    return this.account(userId);
  }

  async resetSlotMt5(session: any, userId: string, input: { slotId?: string }) {
    const slotId = String(input.slotId || "");
    const slot = await this.customerSlot(userId, slotId);
    if (!slot) throw new ConflictException("ไม่พบ Slot ของลูกค้ารายนี้");
    if (!slot.instance_id || !slot.mt5_account_id) return this.account(userId);
    if (
      Number(slot.positions || 0) > 0 ||
      Number(slot.pending_orders || 0) > 0 ||
      String(slot.actual_state || "").toUpperCase() === "RUNNING" ||
      String(slot.desired_state || "").toUpperCase() === "RUNNING"
    ) throw new ConflictException("กรุณาหยุดบอทและให้ Position / Pending Order เป็น 0 ก่อนรีเซ็ต MT5");

    const mode = String(slot.mode || "").toUpperCase();
    if (mode === "CLOUD" && slot.runner_id && !["STOP_CONFIRMED","LEASE_REVOKED"].includes(String(slot.runtime_stop_state || "NONE").toUpperCase())) {
      const pending = await this.db.one(`
        SELECT id FROM worker_commands WHERE bot_instance_id=$1 AND execution_generation=$2
        AND command='STOP_INSTANCE' AND status IN ('PENDING','DELIVERED') ORDER BY id DESC LIMIT 1
      `, [slot.instance_id, Number(slot.execution_generation || 1)]);
      if (!pending) {
        await this.db.query(
          "INSERT INTO worker_commands(runner_id,bot_instance_id,execution_generation,command,status) VALUES($1,$2,$3,'STOP_INSTANCE','PENDING')",
          [slot.runner_id, slot.instance_id, Number(slot.execution_generation || 1)]
        );
      }
      await this.db.query(`
        UPDATE bot_instances SET desired_state='STOPPED',runtime_stop_state='STOP_REQUESTED',
        runtime_stop_requested_at=now(),runtime_stop_confirmed_at=NULL,runtime_stop_error=NULL WHERE id=$1
      `, [slot.instance_id]);
      throw new ConflictException("กำลังปิด MT5 บน VPS กรุณากดรีเซ็ตอีกครั้งเมื่อปิดเสร็จ");
    }

    const oldAccountId = slot.mt5_account_id;
    await this.db.transaction(async tx => {
      await tx.query("UPDATE mt5_accounts SET status='INACTIVE' WHERE id=$1", [oldAccountId]);
      if (mode === "CLOUD") await tx.query("DELETE FROM mt5_credentials WHERE mt5_account_id=$1", [oldAccountId]);
      await tx.query(`
        UPDATE bot_instances SET mt5_account_id=NULL,desired_state='STOPPED',actual_state='OFFLINE',
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
          pending_account_number=NULL,pending_broker=NULL,
          pending_broker_server=NULL,pending_account_ip=NULL,pending_account_seen_at=NULL,
          account_change_requested_at=NULL
        WHERE id=$1
      `, [slot.instance_id]);
      await tx.query(
        "UPDATE bot_commands SET status='ACKED',acked_at=COALESCE(acked_at,now()) WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED')",
        [slot.instance_id]
      );
    });
    await this.audit(session, "OWNER_MOBILE_RESET_MT5", "bot_instance", slot.instance_id, {
      userId, slotId, mode, oldMt5AccountId: oldAccountId
    });
    return this.account(userId);
  }

  async grantAccess(session: any, id: string, input: { mode?: string; months?: number }) {
    const mode = String(input.mode || "").toUpperCase();
    const months = Math.trunc(Number(input.months || 0));
    if (!["LOCAL", "CLOUD"].includes(mode) || !PACKAGE_MONTHS.includes(months)) {
      throw new BadRequestException("แพ็กเกจไม่ถูกต้อง");
    }
    const planCode = mode + "_" + months + "M";
    const result = await this.db.transaction(async tx => {
      const user = (await tx.query(
        "SELECT id,role,status FROM users WHERE id=$1 FOR UPDATE", [id]
      )).rows[0];
      if (!user || ["OWNER","ADMIN"].includes(String(user.role).toUpperCase()) || user.status !== "ACTIVE") {
        throw new ConflictException("บัญชีลูกค้าไม่พร้อมเปิดสิทธิ์");
      }
      const partner = (await tx.query(
        "SELECT id FROM partner_customers WHERE customer_user_id=$1 AND status='ACTIVE' LIMIT 1", [id]
      )).rows[0];
      if (partner) {
        throw new ConflictException("บัญชีนี้อยู่ภายใต้ Partner กรุณาจัดการสิทธิ์จาก Owner Console");
      }
      const plan = (await tx.query("SELECT * FROM plans WHERE code=$1 AND active=true", [planCode])).rows[0];
      if (!plan) throw new ConflictException("ไม่พบแพ็กเกจที่เปิดใช้งาน");
      const current = (await tx.query(`
        SELECT max(s.expires_at) expires_at FROM subscriptions s
        JOIN plans p ON p.id=s.plan_id
        WHERE s.user_id=$1 AND p.mode=$2 AND s.status='ACTIVE' AND s.expires_at>now()
      `, [id, mode])).rows[0];
      await tx.query(`
        UPDATE subscriptions s SET status='CANCELLED'
        FROM plans p WHERE s.plan_id=p.id AND s.user_id=$1 AND p.mode=$2 AND s.status='ACTIVE'
      `, [id, mode]);
      const subscription = (await tx.query(`
        INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note)
        VALUES($1,$2,now(),GREATEST(now(),COALESCE($3::timestamptz,now()))+make_interval(months=>$4::int),$5,$6)
        RETURNING *
      `, [id, plan.id, current?.expires_at || null, months, this.actor(session), "Owner Mobile"])).rows[0];
      let slot = (await tx.query(`
        SELECT * FROM license_slots
        WHERE owner_user_id=$1 AND mode=$2 AND status<>'DELETED'
        ORDER BY CASE WHEN slot_type='PERSONAL' THEN 0 ELSE 1 END,slot_number
        LIMIT 1 FOR UPDATE
      `, [id, mode])).rows[0];
      if (slot) {
        await tx.query(
          "UPDATE license_slots SET assigned_user_id=$2,subscription_id=$3,slot_type='PERSONAL',status='ACTIVE',updated_at=now() WHERE id=$1",
          [slot.id, id, subscription.id]
        );
      } else {
        slot = (await tx.query(`
          INSERT INTO license_slots(owner_user_id,assigned_user_id,subscription_id,mode,slot_number,slot_type,status,label)
          SELECT $1,$1,$2,$3,COALESCE(max(slot_number),0)+1,'PERSONAL','ACTIVE',$4
          FROM license_slots WHERE owner_user_id=$1 AND mode=$3 RETURNING *
        `, [id, subscription.id, mode, mode === "LOCAL" ? "Local MT5" : "Cloud Trading"])).rows[0];
      }
      return { subscription, slot };
    });
    await this.audit(session, "GRANT_CUSTOMER_ACCESS", "user", id, {
      mode, months, planCode, subscriptionId: result.subscription.id
    });
    return this.account(id);
  }

  async extendAccess(session: any, id: string, input: { subscriptionId?: string; days?: number }) {
    const subscriptionId = String(input.subscriptionId || "");
    const days = Math.trunc(Number(input.days || 0));
    if (!/^[0-9a-f-]{36}$/i.test(subscriptionId)) throw new BadRequestException("Subscription ID ไม่ถูกต้อง");
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new BadRequestException("จำนวนวันต้องอยู่ระหว่าง 1-3650");
    const partner = await this.db.one(
      "SELECT id FROM partner_customers WHERE customer_user_id=$1 AND status='ACTIVE' LIMIT 1", [id]
    );
    if (partner) {
      throw new ConflictException("บัญชีนี้อยู่ภายใต้ Partner กรุณาจัดการสิทธิ์จาก Owner Console");
    }
    const row = await this.db.one(
      "UPDATE subscriptions SET expires_at=GREATEST(expires_at,now())+($3 || ' days')::interval,status='ACTIVE' WHERE id=$1 AND user_id=$2 RETURNING *",
      [subscriptionId, id, days]
    );
    if (!row) throw new ConflictException("ไม่พบ Subscription ของลูกค้ารายนี้");
    await this.db.query(
      "UPDATE license_slots SET status='ACTIVE',updated_at=now() WHERE owner_user_id=$1 AND subscription_id=$2 AND status<>'DELETED'",
      [id, subscriptionId]
    );
    await this.audit(session, "EXTEND_CUSTOMER_ACCESS", "subscription", subscriptionId, { userId: id, days });
    return this.account(id);
  }

  async setStatus(session: any, id: string, status: "ACTIVE" | "SUSPENDED") {
    const user = await this.db.one(
      "SELECT id,role,status FROM users WHERE id=$1 AND status<>'DELETED'", [id]
    );
    if (!user || ["OWNER","ADMIN"].includes(String(user.role).toUpperCase())) {
      throw new ConflictException("ไม่พบบัญชีลูกค้าที่จัดการได้");
    }
    await this.db.query("UPDATE users SET status=$2,updated_at=now() WHERE id=$1", [id, status]);
    if (status === "SUSPENDED") {
      const instances = await this.db.query(`
        SELECT DISTINCT bi.id FROM bot_instances bi
        JOIN license_slots ls ON ls.id=bi.slot_id
        WHERE ls.assigned_user_id=$1 OR ls.owner_user_id=$1
      `, [id]);
      for (const item of instances.rows) {
        await this.db.query("UPDATE bot_instances SET desired_state='SAFE_STOP' WHERE id=$1", [item.id]);
        await this.db.query("INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')", [item.id]);
      }
    }
    await this.audit(session, status === "ACTIVE" ? "REACTIVATE_USER" : "SUSPEND_USER", "user", id, {});
    return this.account(id);
  }
}

@Controller("owner-mobile")
export class OwnerManagementController {
  constructor(
    private readonly ownerMobile: OwnerMobileService,
    private readonly management: OwnerManagementService,
    private readonly promotions: PromotionService,
    private readonly hardening: ProductionHardeningService,
    private readonly maintenance: MaintenanceService
  ) {}

  private async secured(req: any) {
    return this.ownerMobile.session(req);
  }

  private async confirmed(req: any, pin: unknown) {
    const session = await this.ownerMobile.session(req);
    await this.ownerMobile.verifyPin(session, String(pin || ""));
    return session;
  }

  private actor(session: any) {
    return ("OWNER-MOBILE:" + String(session?.user_code || session?.owner_user_id || "OWNER")).slice(0, 120);
  }

  @Get("system")
  async system(@Req() req: any) {
    await this.secured(req);
    const [protection, maintenance] = await Promise.all([
      this.hardening.snapshot(),
      this.maintenance.snapshot()
    ]);
    return { protection, maintenance };
  }

  @Post("system/protection-controls")
  async protectionControls(@Req() req: any, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.hardening.updateControls(this.actor(session), {
      cloudProvisioningPaused: body?.cloudProvisioningPaused === true,
      cloudRecoveryPaused: body?.cloudRecoveryPaused === true,
      reason: String(body?.reason || "").slice(0, 240)
    });
  }

  @Post("system/nodes/:runnerId/quarantine")
  async quarantineNode(@Req() req: any, @Param("runnerId") runnerId: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.hardening.quarantineNode(
      this.actor(session),
      runnerId,
      body?.quarantined === true,
      String(body?.reason || "").slice(0, 160)
    );
  }

  @Post("system/maintenance/shutdown")
  async shutdownSystem(@Req() req: any, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.maintenance.shutdownNow(this.actor(session), String(body?.message || "").slice(0, 2000));
  }

  @Post("system/maintenance/resume")
  async resumeSystem(@Req() req: any, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.maintenance.resume(this.actor(session));
  }

  @Get("packages")
  async packages(@Req() req: any) {
    await this.secured(req);
    return this.management.packages();
  }

  @Post("packages")
  async savePackage(@Req() req: any, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.savePackage(session, body || {});
  }

  @Get("promotions")
  async promotionList(@Req() req: any) {
    await this.secured(req);
    return { items: await this.promotions.list() };
  }

  @Post("promotions/generate-code")
  async generatePromotion(@Req() req: any) {
    await this.secured(req);
    return { code: await this.promotions.generateUniqueCode() };
  }

  @Post("promotions")
  async createPromotion(@Req() req: any, @Body() body: PromotionInput & { pin?: string }) {
    const session = await this.confirmed(req, body?.pin);
    return this.promotions.create(String(session.owner_user_id), body || {});
  }

  @Post("promotions/:id")
  async updatePromotion(@Req() req: any, @Param("id") id: string, @Body() body: PromotionInput & { pin?: string }) {
    const session = await this.confirmed(req, body?.pin);
    return this.promotions.update(String(session.owner_user_id), id, body || {});
  }

  @Get("overview")
  async overview(@Req() req: any) {
    await this.secured(req);
    return this.management.opsOverview();
  }

  @Get("trading")
  async trading(@Req() req: any, @Query("q") q = "") {
    await this.secured(req);
    return this.management.trading(q);
  }

  @Get("accounts")
  async accounts(@Req() req: any, @Query("q") q = "") {
    await this.secured(req);
    return this.management.searchAccounts(q);
  }

  @Get("accounts/:id")
  async account(@Req() req: any, @Param("id") id: string) {
    await this.secured(req);
    return this.management.account(id);
  }

  @Post("accounts/:id/access")
  async grantAccess(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.grantAccess(session, id, body || {});
  }

  @Post("accounts/:id/extend")
  async extendAccess(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.extendAccess(session, id, body || {});
  }

  @Post("accounts/:id/adjust-days")
  async adjustDays(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.adjustAccessDays(session, id, body || {});
  }

  @Post("accounts/:id/slots/symbol")
  async selectSymbol(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.selectSlotSymbol(session, id, body || {});
  }

  @Post("accounts/:id/slots/reset-mt5")
  async resetMt5(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    return this.management.resetSlotMt5(session, id, body || {});
  }

  @Post("accounts/:id/status")
  async accountStatus(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    const session = await this.confirmed(req, body?.pin);
    const status = String(body?.status || "").toUpperCase();
    if (status !== "ACTIVE" && status !== "SUSPENDED") throw new BadRequestException("สถานะไม่ถูกต้อง");
    return this.management.setStatus(session, id, status);
  }
}
