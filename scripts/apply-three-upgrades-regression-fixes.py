from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    new, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 regex match, found {count}")
    return new


# 1) Database/startup safety: retire legacy multi-slot sales and add direct-transition history.
path = "apps/api/src/db.service.ts"
text = read(path)
for old, new, label in [
    ("('LOCAL_3SLOT','Local MT5 3 Slots','LOCAL',3,true,false)", "('LOCAL_3SLOT','Local MT5 3 Slots','LOCAL',3,false,false)", "disable LOCAL_3SLOT startup"),
    ("('LOCAL_5SLOT','Local MT5 5 Slots','LOCAL',5,true,false)", "('LOCAL_5SLOT','Local MT5 5 Slots','LOCAL',5,false,false)", "disable LOCAL_5SLOT startup"),
    ("('PARTNER_LOCAL_10','Partner Local 10 Slots','LOCAL',10,true,true)", "('PARTNER_LOCAL_10','Partner Local 10 Slots','LOCAL',10,false,true)", "disable partner legacy 10 startup"),
    ("('PARTNER_LOCAL_25','Partner Local 25 Slots','LOCAL',25,true,true)", "('PARTNER_LOCAL_25','Partner Local 25 Slots','LOCAL',25,false,true)", "disable partner legacy 25 startup"),
    ("('PARTNER_LOCAL_50','Partner Local 50 Slots','LOCAL',50,true,true)", "('PARTNER_LOCAL_50','Partner Local 50 Slots','LOCAL',50,false,true)", "disable partner legacy 50 startup"),
]:
    text = replace_once(text, old, new, label)
text = replace_once(
    text,
    "WHERE code IN ('PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50');",
    "WHERE code IN ('LOCAL_3SLOT','LOCAL_5SLOT','PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50');",
    "disable all retired plans startup",
)
needle = """      CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_customer_one_active\n        ON partner_customers(customer_user_id) WHERE status='ACTIVE';\n"""
addition = needle + """\n      ALTER TABLE partner_customers\n        ADD COLUMN IF NOT EXISTS direct_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,\n        ADD COLUMN IF NOT EXISTS ended_at timestamptz,\n        ADD COLUMN IF NOT EXISTS end_reason varchar(64);\n      CREATE INDEX IF NOT EXISTS idx_partner_customers_direct_subscription\n        ON partner_customers(direct_subscription_id) WHERE direct_subscription_id IS NOT NULL;\n"""
text = replace_once(text, needle, addition, "partner transition columns startup")
write(path, text)

migration = r'''-- Regression safety for FORCE FLAT, Partner direct transitions, and retired customer multi-slot plans.

UPDATE plans
SET active=false
WHERE code IN (
  'LOCAL_3SLOT','LOCAL_5SLOT',
  'PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50'
);

ALTER TABLE partner_customers
  ADD COLUMN IF NOT EXISTS direct_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_reason varchar(64);

CREATE INDEX IF NOT EXISTS idx_partner_customers_direct_subscription
  ON partner_customers(direct_subscription_id)
  WHERE direct_subscription_id IS NOT NULL;

-- Database-level defense in depth: no code path may reopen a bot while maintenance
-- is draining/closed. FORCE FLAT additionally keeps every desired state STOPPED.
CREATE OR REPLACE FUNCTION scenova_guard_maintenance_bot_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  maintenance_status text;
  maintenance_title text;
BEGIN
  SELECT status,title INTO maintenance_status,maintenance_title
  FROM system_maintenance WHERE id=1;

  IF maintenance_status IN ('DRAINING','MAINTENANCE') THEN
    IF NEW.desired_state='RUNNING' THEN
      RAISE EXCEPTION 'SCENOVA_MAINTENANCE_BLOCKS_START';
    END IF;
    IF maintenance_title='EMERGENCY FORCE FLAT' AND NEW.desired_state<>'STOPPED' THEN
      NEW.desired_state='STOPPED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scenova_guard_maintenance_bot_state ON bot_instances;
CREATE TRIGGER trg_scenova_guard_maintenance_bot_state
BEFORE INSERT OR UPDATE OF desired_state ON bot_instances
FOR EACH ROW EXECUTE FUNCTION scenova_guard_maintenance_bot_state();

CREATE OR REPLACE FUNCTION scenova_guard_maintenance_start_command()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  maintenance_status text;
BEGIN
  IF NEW.command='START' THEN
    SELECT status INTO maintenance_status FROM system_maintenance WHERE id=1;
    IF maintenance_status IN ('DRAINING','MAINTENANCE') THEN
      RAISE EXCEPTION 'SCENOVA_MAINTENANCE_BLOCKS_START_COMMAND';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scenova_guard_maintenance_start_command ON bot_commands;
CREATE TRIGGER trg_scenova_guard_maintenance_start_command
BEFORE INSERT ON bot_commands
FOR EACH ROW EXECUTE FUNCTION scenova_guard_maintenance_start_command();
'''
write("database/016_upgrade_regression_safety.sql", migration)

# 2) Partner lifecycle: keep the seat until the funded term ends; then switch to Direct.
path = "apps/api/src/partner.service.ts"
text = read(path)
refresh = '''  private async refreshLifecycle(q: any = this.db) {
    await q.query(
      `UPDATE partner_customers pc
       SET status=CASE
             WHEN pc.direct_subscription_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM subscriptions ds
                WHERE ds.id=pc.direct_subscription_id
                  AND ds.status='ACTIVE'
                  AND ds.starts_at<=now()
                  AND ds.expires_at>now()
              ) THEN 'DIRECT'
             ELSE 'EXPIRED'
           END,
           ended_at=COALESCE(pc.ended_at,pc.expires_at),
           end_reason=CASE
             WHEN pc.direct_subscription_id IS NOT NULL THEN 'CUSTOMER_DIRECT'
             ELSE 'TERM_EXPIRED'
           END,
           updated_at=now()
       WHERE pc.status='ACTIVE' AND pc.expires_at<=now()`
    );
    await q.query(
      `UPDATE license_slots ls
       SET subscription_id=pc.direct_subscription_id,status='ACTIVE',updated_at=now()
       FROM partner_customers pc
       JOIN subscriptions ds ON ds.id=pc.direct_subscription_id
       WHERE pc.customer_user_id=ls.owner_user_id
         AND ls.assigned_user_id=pc.customer_user_id
         AND ls.mode='LOCAL'
         AND ls.status<>'DELETED'
         AND pc.status='DIRECT'
         AND ds.status='ACTIVE'
         AND ds.starts_at<=now()
         AND ds.expires_at>now()`
    );
    await q.query(
      `UPDATE partner_accounts
       SET status='EXPIRED',updated_at=now()
       WHERE status IN ('READY','ACTIVE')
         AND (
           (activated_at IS NULL AND activation_deadline_at<=now()) OR
           (activated_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at<=now())
         )`
    );
  }

  async dashboardSummary'''
text = regex_once(
    text,
    r"  private async refreshLifecycle\(q: any = this\.db\) \{.*?\n  \}\n\n  async dashboardSummary",
    refresh,
    "partner refresh lifecycle",
)
text = replace_once(
    text,
    "pc.id,pc.customer_user_id,pc.subscription_id,pc.status,\n              pc.starts_at,pc.expires_at,pc.created_at,pc.updated_at,",
    "pc.id,pc.customer_user_id,pc.subscription_id,pc.direct_subscription_id,pc.status,\n              pc.starts_at,pc.expires_at,pc.ended_at,pc.end_reason,pc.created_at,pc.updated_at,",
    "partner summary transition fields",
)
text = replace_once(
    text,
    """      if (!current || current.status === \"DIRECT\" || current.status === \"REVOKED\") {\n        throw new ConflictException(\"ลูกค้ารายนี้ไม่ได้อยู่ภายใต้ Partner นี้แล้ว\");\n      }\n\n      if (current.status === \"ACTIVE\" && new Date(current.expires_at) > new Date()) {\n""",
    """      if (!current || current.status === \"DIRECT\" || current.status === \"REVOKED\") {\n        throw new ConflictException(\"ลูกค้ารายนี้ไม่ได้อยู่ภายใต้ Partner นี้แล้ว\");\n      }\n      if (current.direct_subscription_id) {\n        throw new ConflictException(\"ลูกค้ารายนี้ต่อสมาชิกกับ SCENOVA โดยตรงแล้ว ระบบจะรักษาสิทธิ์เดิมถึงวันหมดอายุและคืน Seat อัตโนมัติ\");\n      }\n\n      if (current.status === \"ACTIVE\" && new Date(current.expires_at) > new Date()) {\n""",
    "block partner renewal after direct purchase",
)
detach = '''  async detachCustomerToDirect(customerUserId: string, directSubscriptionId: string, actor: string) {
    const rows = await this.db.query(
      `UPDATE partner_customers
       SET direct_subscription_id=$2,updated_at=now()
       WHERE customer_user_id=$1 AND status='ACTIVE' AND expires_at>now()
       RETURNING id,partner_user_id,subscription_id,expires_at`,
      [customerUserId, directSubscriptionId]
    );
    for (const row of rows.rows) {
      await this.db.query(
        "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'PARTNER_CUSTOMER_DIRECT_SCHEDULED','partner_customer',$2,$3::jsonb)",
        [actor, row.id, JSON.stringify({ customerUserId, partnerUserId: row.partner_user_id, directSubscriptionId, partnerSubscriptionId: row.subscription_id, partnerFundedUntil: row.expires_at })]
      );
    }
    return rows.rowCount || 0;
  }
}'''
text = regex_once(
    text,
    r"  async detachCustomerToDirect\(customerUserId: string, directSubscriptionId: string, actor: string\) \{.*?\n  \}\n\}",
    detach,
    "schedule direct transition",
)
write(path, text)

# 3) Admin direct activation and extension must preserve paid Partner time and relation expiry.
path = "apps/api/src/admin.controller.ts"
text = read(path)
activate = '''  @Post("subscriptions/activate")
  async activate(@Body() body: {
    userId: string;
    planCode: string;
    durationDays?: number;
    startsAt?: string;
    expiresAt?: string;
    activatedBy?: string;
    note?: string;
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
      "INSERT INTO subscriptions(user_id,plan_id,starts_at,expires_at,activated_by,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [body.userId, plan.id, startsAt, expiresAt, body.activatedBy || "ADMIN", body.note || null]
    );
    if (partnerSource) {
      await this.partner.detachCustomerToDirect(body.userId, row.id, body.activatedBy || "ADMIN");
    } else {
      await this.syncSlotsForSubscription(body.userId, row.id, plan);
    }
    await this.audit("ADMIN", "ACTIVATE_SUBSCRIPTION", "subscription", row.id, {
      plan: body.planCode,
      startsAt,
      expiresAt,
      partnerCarryForwardUntil: partnerSource?.expires_at || null,
      slots: Number(plan.max_mt5_accounts || 1),
      reseller: Boolean(plan.allow_resale)
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
      slots: slots.rows
    };
  }

  private async syncSlotsForSubscription'''
text = regex_once(
    text,
    r"  @Post\(\"subscriptions/activate\"\).*?\n  private async syncSlotsForSubscription",
    activate,
    "admin activate direct carry-forward",
)
extend = '''  @Post("subscriptions/extend")
  async extend(@Body() body: { subscriptionId: string; days: number }) {
    const row = await this.db.one(
      "UPDATE subscriptions SET expires_at=GREATEST(expires_at,now()) + ($2 || ' days')::interval,status='ACTIVE' WHERE id=$1 RETURNING *",
      [body.subscriptionId, Math.max(1, Number(body.days))]
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
      days: body.days,
      partnerRelationUpdated: Boolean(relation?.id),
      queuedDirectShifted: Boolean(relation?.direct_subscription_id)
    });
    return row;
  }

  @Post("devices/release")'''
text = regex_once(
    text,
    r"  @Post\(\"subscriptions/extend\"\).*?\n  @Post\(\"devices/release\"\)",
    extend,
    "admin extend partner coherence",
)
write(path, text)

# 4) Partner own EA must work through recovery; recovery/manual actions respect maintenance.
path = "apps/api/src/manual-mt5.controller.ts"
text = read(path)
text = replace_once(text, 'import { JwtGuard } from "./security";\n', 'import { JwtGuard } from "./security";\nimport { MaintenanceService } from "./maintenance.service";\nimport { PartnerService } from "./partner.service";\n', "manual imports")
text = replace_once(text, 'source: "OWNER" | "SUBSCRIPTION" | "TRIAL" | "TRIAL_READY" | "NONE";', 'source: "OWNER" | "PARTNER" | "SUBSCRIPTION" | "TRIAL" | "TRIAL_READY" | "NONE";', "manual access type")
text = replace_once(text, '  constructor(private readonly db: DbService) {}\n', '  constructor(\n    private readonly db: DbService,\n    private readonly maintenance: MaintenanceService,\n    private readonly partner: PartnerService\n  ) {}\n', "manual constructor")
owner_block = '''    if (\n      user?.status === "ACTIVE" &&\n      (user.role === "OWNER" || user.role === "ADMIN")\n    ) {\n      return { allowed: true, source: "OWNER" };\n    }\n\n'''
partner_block = owner_block + '''    const partnerAccess = await this.partner.ownTradingEntitlement(userId, slotId, mode);\n    if (partnerAccess) {\n      return { allowed: true, source: "PARTNER" };\n    }\n\n'''
text = replace_once(text, owner_block, partner_block, "manual partner access")
text = replace_once(text, '  private async activateStart(instanceId: string, access: AccessState) {\n', '  private async activateStart(instanceId: string, access: AccessState) {\n    await this.maintenance.assertStartAllowed();\n', "manual activate guard")
text = replace_once(text, '  async recoverAndStart(@Req() req: any, @Query("slotId") slotId = "") {\n', '  async recoverAndStart(@Req() req: any, @Query("slotId") slotId = "") {\n    await this.maintenance.assertStartAllowed();\n', "manual recover guard")
text = replace_once(text, '  ) {\n    const action = String(body?.action || "").trim().toUpperCase() as ManualMt5Action;\n', '  ) {\n    await this.maintenance.assertStartAllowed();\n    const action = String(body?.action || "").trim().toUpperCase() as ManualMt5Action;\n', "manual action guard")
text = text.replace("command IN ('START','SAFE_STOP','CLOSE_ALL')", "command IN ('START','SAFE_STOP')")
for old, new in [
    ("ไม่พบ Slot ที่เลือก", "ไม่พบบัญชี MT5 ที่เลือก"),
    ("ไม่พบการติดตั้ง SCENOVA ของ Slot นี้", "ไม่พบการติดตั้ง SCENOVA ของบัญชี MT5 นี้"),
    ("ยังไม่พบบัญชี MT5 ของ Slot นี้", "ยังไม่พบบัญชี MT5 ที่เชื่อมต่อ"),
]:
    text = text.replace(old, new)
write(path, text)

path = "apps/api/src/agent-action.controller.ts"
text = read(path)
text = replace_once(text, 'import { CryptoService } from "./security";\n', 'import { CryptoService } from "./security";\nimport { MaintenanceService } from "./maintenance.service";\nimport { PartnerService } from "./partner.service";\n', "agent imports")
text = replace_once(text, 'source: "OWNER" | "SUBSCRIPTION" | "TRIAL" | "TRIAL_READY" | "NONE";', 'source: "OWNER" | "PARTNER" | "SUBSCRIPTION" | "TRIAL" | "TRIAL_READY" | "NONE";', "agent access type")
text = replace_once(text, '''  constructor(\n    private readonly db: DbService,\n    private readonly crypto: CryptoService\n  ) {}\n''', '''  constructor(\n    private readonly db: DbService,\n    private readonly crypto: CryptoService,\n    private readonly maintenance: MaintenanceService,\n    private readonly partner: PartnerService\n  ) {}\n''', "agent constructor")
owner_agent = '''    if (\n      user?.status === "ACTIVE" &&\n      (user.role === "OWNER" || user.role === "ADMIN")\n    ) {\n      return { allowed: true, source: "OWNER" };\n    }\n\n'''
partner_agent = owner_agent + '''    if (instance.slot_id) {\n      const partnerAccess = await this.partner.ownTradingEntitlement(\n        userId,\n        instance.slot_id,\n        instance.mode\n      );\n      if (partnerAccess) return { allowed: true, source: "PARTNER" };\n    }\n\n'''
text = replace_once(text, owner_agent, partner_agent, "agent partner access")
text = replace_once(text, '''  private async completeRecoveredStart(instance: any) {\n    const access = await this.accessState(instance);\n''', '''  private async completeRecoveredStart(instance: any) {\n    const maintenance = await this.maintenance.current();\n    if (maintenance.blockStarts) {\n      await this.db.query(\n        `UPDATE bot_instances\n         SET metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(\n           'startAfterRepairRequested',false,\n           'startAfterRepairStatus','FAILED',\n           'startAfterRepairMessage','ระบบอยู่ระหว่าง Maintenance / FORCE FLAT จึงยกเลิก Auto Recovery'\n         )\n         WHERE id=$1`,\n        [instance.id]\n      );\n      return false;\n    }\n\n    const access = await this.accessState(instance);\n''', "agent maintenance recovery guard")
text = text.replace("command IN ('START','SAFE_STOP','CLOSE_ALL')", "command IN ('START','SAFE_STOP')")
write(path, text)

# 5) FORCE FLAT command integrity: only an actual EA acknowledgement can reconcile stale Positions.
path = "apps/api/src/maintenance.service.ts"
text = read(path)
text = replace_once(
    text,
    "AND bc.command='CLOSE_ALL'\n               AND bc.status='ACKED'",
    "AND bc.command='CLOSE_ALL'\n               AND bc.status='ACKED'\n               AND bc.payload->>'ackSource'='EA'",
    "maintenance trusted close ack",
)
write(path, text)

path = "apps/api/src/ea.controller.ts"
text = read(path)
text = replace_once(
    text,
    '"UPDATE bot_commands SET status=\'ACKED\',acked_at=now() WHERE id=$1 AND bot_instance_id=$2",',
    '"UPDATE bot_commands SET status=\'ACKED\',acked_at=now(),payload=COALESCE(payload,\'{}\'::jsonb) || jsonb_build_object(\'ackSource\',\'EA\') WHERE id=$1 AND bot_instance_id=$2",',
    "EA ack provenance",
)
write(path, text)

# 6) Normal Start and Stop/Close All never fake-ACK an unresolved CLOSE_ALL.
path = "apps/api/src/bot.controller.ts"
text = read(path)
text = replace_once(text, '''    const instance = await this.getInstance(req.user.sub, slotId || null);\n    if (!instance.mt5_account_id) throw new ConflictException("เชื่อมบัญชี MT5 ก่อนเริ่มบอท");\n''', '''    const instance = await this.getInstance(req.user.sub, slotId || null);\n    if (!instance.mt5_account_id) throw new ConflictException("เชื่อมบัญชี MT5 ก่อนเริ่มบอท");\n    const unresolvedCloseAll = await this.db.one(\n      "SELECT id FROM bot_commands WHERE bot_instance_id=$1 AND command='CLOSE_ALL' AND status IN ('PENDING','DELIVERED') ORDER BY id DESC LIMIT 1",\n      [instance.id]\n    );\n    if (unresolvedCloseAll) {\n      throw new ConflictException("ยังมีคำสั่ง Close All รอ EA ยืนยัน กรุณารอให้ Position เป็น 0 ก่อนเริ่มบอท");\n    }\n''', "start unresolved close guard")
text = replace_once(text, "command IN ('START','SAFE_STOP','CLOSE_ALL')", "command IN ('START','SAFE_STOP')", "start no fake close ack")
text = replace_once(text, '''    if (resumeAfterDailyProfitEdit) {\n      await this.db.query(\n''', '''    if (resumeAfterDailyProfitEdit) {\n      await this.maintenance.assertStartAllowed();\n      await this.db.query(\n''', "settings auto-resume maintenance guard")
command_method = '''  private async commandForUser(userId: string, command: string, slotId?: string | null) {\n    const instance = await this.getInstance(userId, slotId || null);\n    const desired = command === "CLOSE_ALL" ? "STOPPED" : "SAFE_STOP";\n    await this.db.query("UPDATE bot_instances SET desired_state=$2 WHERE id=$1", [instance.id, desired]);\n    await this.db.query(\n      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",\n      [instance.id]\n    );\n    await this.db.query(\n      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,$2)",\n      [instance.id, command]\n    );\n    return { ok: true, state: desired };\n  }'''
new_command_method = '''  private async commandForUser(userId: string, command: string, slotId?: string | null) {\n    const instance = await this.getInstance(userId, slotId || null);\n    const pendingCloseAll = await this.db.one(\n      "SELECT id FROM bot_commands WHERE bot_instance_id=$1 AND command='CLOSE_ALL' AND status IN ('PENDING','DELIVERED') ORDER BY id DESC LIMIT 1",\n      [instance.id]\n    );\n\n    await this.db.query(\n      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP')",\n      [instance.id]\n    );\n\n    if (pendingCloseAll) {\n      await this.db.query("UPDATE bot_instances SET desired_state='STOPPED' WHERE id=$1", [instance.id]);\n      return { ok: true, state: "STOPPED", closeAllPending: true };\n    }\n\n    const desired = command === "CLOSE_ALL" ? "STOPPED" : "SAFE_STOP";\n    await this.db.query("UPDATE bot_instances SET desired_state=$2 WHERE id=$1", [instance.id, desired]);\n    await this.db.query(\n      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,$2)",\n      [instance.id, command]\n    );\n    return { ok: true, state: desired };\n  }'''
text = replace_once(text, command_method, new_command_method, "safe commandForUser")
for old, new in [
    ("ปลดเครื่องเดิมแล้ว Slot นี้พร้อมติดตั้งบนเครื่องใหม่", "ปลดเครื่องเดิมแล้ว บัญชีนี้พร้อมติดตั้งบนเครื่องใหม่"),
    ("ปุ่มเปลี่ยน MT5 แบบไม่เปลี่ยน .set ใช้กับ LOCAL Slot เท่านั้น", "ปุ่มเปลี่ยน MT5 แบบไม่เปลี่ยน .set ใช้กับ LOCAL เท่านั้น"),
    ("Slot นี้ยังไม่มี MT5 เดิมให้เปลี่ยน", "บัญชีนี้ยังไม่มี MT5 เดิมให้เปลี่ยน"),
    ("install SCENOVA for this slot first", "ติดตั้ง SCENOVA สำหรับบัญชี MT5 นี้ก่อน"),
]:
    text = text.replace(old, new)
write(path, text)

# 7) Deployment and integration migrations.
path = "scripts/deploy-hostinger.sh"
text = read(path)
text = replace_once(text, "database/015_partner_program.sql\\n", "database/015_partner_program.sql   database/016_upgrade_regression_safety.sql\\n", "deploy migration 016")
write(path, text)

path = ".github/workflows/integration-smoke.yml"
text = read(path)
text = replace_once(
    text,
    "          psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -f database/015_partner_program.sql\n          psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -f database/015_partner_program.sql\n",
    "          psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -f database/015_partner_program.sql\n          psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -f database/015_partner_program.sql\n          psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -f database/016_upgrade_regression_safety.sql\n          psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -f database/016_upgrade_regression_safety.sql\n",
    "integration migration 016",
)
text = replace_once(
    text,
    "      - name: Show API log on failure\n",
    "      - name: Three-upgrade regression safety\n        env:\n          BASE: http://127.0.0.1:4000/api\n          ADMIN_KEY: integration-admin\n        run: bash ./tests/upgrade-regression-safety.sh\n\n      - name: Show API log on failure\n",
    "integration regression step",
)
write(path, text)

# 8) Update Partner lifecycle test to assert delayed Direct transition and seat retention.
path = "tests/partner-program-v3.sh"
text = read(path)
old_direct = r'''echo '[partner-v3] direct renewal preserves remaining time and frees Partner Seat'
OLD_EXP=$(PGPASSWORD=bot psql -h localhost -U bot -d bot -Atc \
  "select expires_at from partner_customers where customer_user_id='$CUSTOMER1_ID' and status='ACTIVE' order by created_at desc limit 1;")
DIRECT=$(curl -fsS -X POST "$BASE/admin/subscriptions/activate" \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d "{\"userId\":\"$CUSTOMER1_ID\",\"planCode\":\"LOCAL_30D\",\"durationDays\":30,\"activatedBy\":\"CI-DIRECT\"}")
NEW_EXP=$(printf '%s' "$DIRECT" | jq -r '.subscription.expires_at')
test "$(date -d "$NEW_EXP" +%s)" -gt "$(date -d "$OLD_EXP" +%s)"
REL_STATUS=$(PGPASSWORD=bot psql -h localhost -U bot -d bot -Atc \
  "select status from partner_customers where customer_user_id='$CUSTOMER1_ID' order by created_at desc limit 1;")
test "$REL_STATUS" = 'DIRECT'
PARTNER_AFTER_DIRECT=$(curl -fsS "$BASE/partner" -H "authorization: Bearer $PARTNER_TOKEN")
test "$(printf '%s' "$PARTNER_AFTER_DIRECT" | jq -r '.account.usedSeats')" = '10'
'''
new_direct = r'''echo '[partner-v3] direct renewal preserves remaining time and keeps Partner Seat until funded term ends'
OLD_EXP=$(PGPASSWORD=bot psql -h localhost -U bot -d bot -Atc \
  "select expires_at from partner_customers where customer_user_id='$CUSTOMER1_ID' and status='ACTIVE' order by created_at desc limit 1;")
DIRECT=$(curl -fsS -X POST "$BASE/admin/subscriptions/activate" \
  -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
  -d "{\"userId\":\"$CUSTOMER1_ID\",\"planCode\":\"LOCAL_30D\",\"durationDays\":30,\"activatedBy\":\"CI-DIRECT\"}")
DIRECT_ID=$(printf '%s' "$DIRECT" | jq -r '.subscription.id')
DIRECT_START=$(printf '%s' "$DIRECT" | jq -r '.subscription.starts_at')
NEW_EXP=$(printf '%s' "$DIRECT" | jq -r '.subscription.expires_at')
test "$(date -d "$DIRECT_START" +%s)" -ge "$(date -d "$OLD_EXP" +%s)"
test "$(date -d "$NEW_EXP" +%s)" -gt "$(date -d "$DIRECT_START" +%s)"
REL_STATE=$(PGPASSWORD=bot psql -h localhost -U bot -d bot -Atc \
  "select status||':'||coalesce(direct_subscription_id::text,'') from partner_customers where customer_user_id='$CUSTOMER1_ID' order by created_at desc limit 1;")
test "$REL_STATE" = "ACTIVE:$DIRECT_ID"
PARTNER_AFTER_DIRECT=$(curl -fsS "$BASE/partner" -H "authorization: Bearer $PARTNER_TOKEN")
test "$(printf '%s' "$PARTNER_AFTER_DIRECT" | jq -r '.account.usedSeats')" = '11'

# Simulate the funded term reaching its boundary. Direct entitlement starts exactly then.
PGPASSWORD=bot psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 <<SQL >/dev/null
update subscriptions set starts_at=now()-interval '1 second',expires_at=now()+interval '30 days' where id='$DIRECT_ID';
update partner_customers set expires_at=now()-interval '1 second' where customer_user_id='$CUSTOMER1_ID' and status='ACTIVE';
SQL
PARTNER_AFTER_TRANSITION=$(curl -fsS "$BASE/partner" -H "authorization: Bearer $PARTNER_TOKEN")
test "$(printf '%s' "$PARTNER_AFTER_TRANSITION" | jq -r '.account.usedSeats')" = '10'
REL_STATUS=$(PGPASSWORD=bot psql -h localhost -U bot -d bot -Atc \
  "select status from partner_customers where customer_user_id='$CUSTOMER1_ID' order by created_at desc limit 1;")
test "$REL_STATUS" = 'DIRECT'
SLOT_DIRECT=$(PGPASSWORD=bot psql -h localhost -U bot -d bot -Atc \
  "select subscription_id from license_slots where owner_user_id='$CUSTOMER1_ID' and assigned_user_id='$CUSTOMER1_ID' and mode='LOCAL' and status<>'DELETED' order by slot_number limit 1;")
test "$SLOT_DIRECT" = "$DIRECT_ID"
'''
text = replace_once(text, old_direct, new_direct, "partner direct lifecycle test")
write(path, text)

regression_test = r'''#!/usr/bin/env bash
set -euo pipefail

: "${BASE:=http://127.0.0.1:4000/api}"
: "${ADMIN_KEY:=integration-admin}"
export PGPASSWORD=bot

assert_eq() {
  if [ "$1" != "$2" ]; then
    echo "expected '$2' but got '$1'" >&2
    exit 1
  fi
}

echo '[regression] retired customer multi-slot plans cannot be sold'
RETIRED_ACTIVE=$(psql -h localhost -U bot -d bot -Atc "select count(*) from plans where code in ('LOCAL_3SLOT','LOCAL_5SLOT','PARTNER_LOCAL_10','PARTNER_LOCAL_25','PARTNER_LOCAL_50') and active=true;")
assert_eq "$RETIRED_ACTIVE" "0"
LOCAL_ACTIVE=$(psql -h localhost -U bot -d bot -Atc "select count(*) from plans where code='LOCAL_30D' and active=true;")
assert_eq "$LOCAL_ACTIVE" "1"

# Use an existing disposable CI instance created by the main integration flow.
INSTANCE=$(psql -h localhost -U bot -d bot -Atc "select id from bot_instances order by created_at limit 1;")
test -n "$INSTANCE"
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 <<SQL >/dev/null
update bot_instances set desired_state='STOPPED',actual_state='STOPPED',metrics=coalesce(metrics,'{}'::jsonb)||'{"positions":0}'::jsonb where id='$INSTANCE';
update system_maintenance set status='DRAINING',title='CI FORCE FLAT GUARD',message='regression guard',maintenance_at=now(),force_close_at=now(),force_close=true,updated_at=now() where id=1;
SQL

echo '[regression] database blocks every RUNNING transition during maintenance'
set +e
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "update bot_instances set desired_state='RUNNING' where id='$INSTANCE';" >/tmp/guard-state.out 2>&1
STATE_RC=$?
psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 -c "insert into bot_commands(bot_instance_id,command) values('$INSTANCE','START');" >/tmp/guard-command.out 2>&1
COMMAND_RC=$?
set -e
test "$STATE_RC" -ne 0
test "$COMMAND_RC" -ne 0
assert_eq "$(psql -h localhost -U bot -d bot -Atc "select desired_state from bot_instances where id='$INSTANCE';")" "STOPPED"

psql -h localhost -U bot -d bot -v ON_ERROR_STOP=1 <<SQL >/dev/null
update system_maintenance set status='OFF',title=null,message=null,maintenance_at=null,force_close_at=null,expected_resume_at=null,updated_at=now() where id=1;
SQL

echo '[regression] only EA-originated CLOSE_ALL ACKs are trusted for stale-position reconciliation'
grep -q "bc.payload->>'ackSource'='EA'" apps/api/src/maintenance.service.ts
grep -q "jsonb_build_object('ackSource','EA')" apps/api/src/ea.controller.ts

echo '[regression] Partner own entitlement is honored by both recovery paths'
grep -q 'this.partner.ownTradingEntitlement' apps/api/src/manual-mt5.controller.ts
grep -q 'this.partner.ownTradingEntitlement' apps/api/src/agent-action.controller.ts
grep -q 'this.maintenance.assertStartAllowed' apps/api/src/manual-mt5.controller.ts

echo '[regression] PASS'
'''
write("tests/upgrade-regression-safety.sh", regression_test)

print("Scoped three-upgrade regression patch applied successfully.")
