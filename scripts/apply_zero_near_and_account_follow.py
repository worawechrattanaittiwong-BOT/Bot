from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8", newline="\n")


# ZERO GRID: nearest broker-safe first BUY/SELL plus cost-aware net close.
ea_path = "mt5/FastBasketBot.mq5"
ea = read(ea_path)
ea = ea.replace(
    "// a fixed cycle center, 1.5-step first trigger gap, exact step spacing, linear\n"
    "// lot ladder, near-to-far staging, and near-to-live-price profit exit. Hedging\n",
    "// a fixed cycle identity, nearest broker-legal live-price first triggers, exact\n"
    "// inter-level step spacing, linear lot ladder, and cost-aware net-profit exit. Hedging\n",
    1,
)
old_required = '''double ZeroGridRequiredCloseNet()\n{\n   return MathMax(0.01,g_zeroGridMinNetProfitMoney) + MathMax(0.0,g_zeroGridCloseReserveMoney);\n}\n'''
new_required = '''double ZeroGridEstimatedExitCostMoney()\n{\n   LoadZeroGridCycleState();\n   if(g_zeroGridCycleStartedAt<=0) return 0.0;\n\n   double openVolume=0.0;\n   for(int i=PositionsTotal()-1;i>=0;i--)\n   {\n      ulong ticket=PositionGetTicket(i);\n      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;\n      if(!ZeroGridOwnsSelectedPosition()) continue;\n      openVolume += MathMax(0.0,PositionGetDouble(POSITION_VOLUME));\n   }\n   if(openVolume<=0.0) return 0.0;\n\n   if(!HistorySelect(g_zeroGridCycleStartedAt,TimeCurrent()+60)) return 0.0;\n   double entryCost=0.0;\n   double entryVolume=0.0;\n   int totalDeals=HistoryDealsTotal();\n   for(int i=0;i<totalDeals;i++)\n   {\n      ulong deal=HistoryDealGetTicket(i);\n      if(deal==0) continue;\n      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol) continue;\n      if(HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) continue;\n      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);\n      if(entry!=DEAL_ENTRY_IN && entry!=DEAL_ENTRY_INOUT) continue;\n      double volume=HistoryDealGetDouble(deal,DEAL_VOLUME);\n      if(volume<=0.0) continue;\n      entryVolume += volume;\n      entryCost += MathAbs(HistoryDealGetDouble(deal,DEAL_COMMISSION));\n      entryCost += MathAbs(HistoryDealGetDouble(deal,DEAL_FEE));\n   }\n   if(entryVolume<=0.0 || entryCost<=0.0) return 0.0;\n\n   // MT5 does not expose future closing commission in advance. Estimate it\n   // from observed entry cost per lot. Spread is already in POSITION_PROFIT.\n   return (entryCost/entryVolume)*openVolume;\n}\n\ndouble ZeroGridRequiredCloseNet()\n{\n   return MathMax(0.01,g_zeroGridMinNetProfitMoney)\n      + MathMax(0.0,g_zeroGridCloseReserveMoney)\n      + ZeroGridEstimatedExitCostMoney();\n}\n'''
if old_required not in ea:
    raise SystemExit("ZERO GRID close threshold block not found")
ea = ea.replace(old_required, new_required, 1)
old_gap = '''double ZeroGridEntryGapPrice()\n{\n   double tick=ZeroGridTickSize();\n   double gap=MathMax(ZeroGridEffectiveStepPrice()*1.5,\n                      ZeroGridMinPendingDistancePrice()+tick);\n   double units=MathCeil((gap/tick)-1e-10);\n   return NormalizeDouble(units*tick,_Digits);\n}\n'''
new_gap = '''double ZeroGridEntryGapPrice()\n{\n   // First trigger is independent from Grid Step. One tick beyond the\n   // broker Stops/Freeze boundary is the nearest robust pending distance.\n   double tick=ZeroGridTickSize();\n   double gap=ZeroGridMinPendingDistancePrice()+tick;\n   double units=MathCeil((gap/tick)-1e-10);\n   return NormalizeDouble(units*tick,_Digits);\n}\n'''
if old_gap not in ea:
    raise SystemExit("ZERO GRID first-gap block not found")
ea = ea.replace(old_gap, new_gap, 1)
old_anchor = '''double ZeroGridPendingAnchorPrice(bool buySide)\n{\n   LoadZeroGridCycleState();\n   if(g_zeroGridCenter<=0.0) return 0.0;\n   double gap=ZeroGridEntryGapPrice();\n   double raw=buySide ? g_zeroGridCenter+gap : g_zeroGridCenter-gap;\n   return ZeroGridNormalizePendingPrice(buySide,raw);\n}\n'''
new_anchor = '''double ZeroGridPendingAnchorPrice(bool buySide)\n{\n   LoadZeroGridCycleState();\n   if(g_zeroGridCenter<=0.0) return 0.0;\n\n   // Preserve exact ladder geometry after the first level exists.\n   double existing=ZeroGridExistingPendingAnchorPrice(buySide);\n   if(existing>0.0) return existing;\n\n   MqlTick live;\n   if(!SymbolInfoTick(_Symbol,live)) return 0.0;\n   double gap=ZeroGridEntryGapPrice();\n   double raw=buySide ? live.ask+gap : live.bid-gap;\n   return ZeroGridNormalizePendingPrice(buySide,raw);\n}\n'''
if old_anchor not in ea:
    raise SystemExit("ZERO GRID anchor block not found")
ea = ea.replace(old_anchor, new_anchor, 1)
if "ZeroGridEffectiveStepPrice()*1.5" in ea:
    raise SystemExit("obsolete 1.5-step first-gap rule remains")
write(ea_path, ea)


# LOCAL runtime: subscription follows the customer; MT5 account follows terminal while flat.
ea_controller = "apps/api/src/ea.controller.ts"
text = read(ea_controller)
owner_marker = '''    if (user?.status === "ACTIVE" && (user.role === "OWNER" || user.role === "ADMIN")) {\n      return true;\n    }\n\n    if (slotId) {\n'''
owner_replacement = '''    if (user?.status === "ACTIVE" && (user.role === "OWNER" || user.role === "ADMIN")) {\n      return true;\n    }\n\n    // LOCAL membership belongs to the SCENOVA customer, not a visible Slot.\n    // Trial grants remain account-specific.\n    const customerSubscription = await this.db.one(\n      `SELECT 1\n       FROM subscriptions s\n       JOIN plans p ON p.id=s.plan_id\n       WHERE s.user_id=$1\n         AND p.mode=$2\n         AND s.status='ACTIVE'\n         AND s.starts_at<=now()\n         AND s.expires_at>now()\n       ORDER BY s.expires_at DESC\n       LIMIT 1`,\n      [userId, mode]\n    );\n    if (customerSubscription) return true;\n\n    // Compatibility fallback for already-issued legacy slot-linked records.\n    if (slotId) {\n'''
if owner_marker not in text:
    raise SystemExit("EA hasAccess insertion point not found")
text = text.replace(owner_marker, owner_replacement, 1)
old_first_conflict = '''      const conflict = await this.db.one(\n        `SELECT a.id,a.user_id,bi.slot_id\n         FROM mt5_accounts a\n         LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id\n         WHERE lower(a.account_number)=lower($1)\n           AND lower(a.broker_server)=lower($2)\n           AND a.status='ACTIVE'\n           AND (\n             a.user_id<>$3\n             OR (bi.slot_id IS NOT NULL AND bi.slot_id<>$4)\n           )\n         LIMIT 1`,\n        [reportedAccount, reportedServer, instance.user_id, instance.slot_id]\n      );\n'''
new_first_conflict = '''      const conflict = await this.db.one(\n        `SELECT a.id,a.user_id\n         FROM mt5_accounts a\n         WHERE lower(a.account_number)=lower($1)\n           AND lower(a.broker_server)=lower($2)\n           AND a.status='ACTIVE'\n           AND a.user_id<>$3\n         LIMIT 1`,\n        [reportedAccount, reportedServer, instance.user_id]\n      );\n'''
if old_first_conflict not in text:
    raise SystemExit("first LOCAL bind conflict block not found")
text = text.replace(old_first_conflict, new_first_conflict, 1)
text = text.replace(
    'message: "MT5 นี้ถูกผูกกับ SCENOVA Slot อื่นอยู่แล้ว",',
    'message: "MT5 นี้ถูกผูกกับบัญชี SCENOVA อื่นอยู่แล้ว",',
    1,
)
old_mismatch_head = '''    const accountMismatch =\n      Boolean(reportedAccount) &&\n      (\n        !instance.mt5_account_id ||\n        reportedAccount !== String(instance.account_number || "") ||\n        (reportedServer && instance.broker_server && reportedServer !== String(instance.broker_server))\n      );\n\n    if (accountMismatch) {\n'''
auto_follow = '''    let accountMismatch =\n      Boolean(reportedAccount) &&\n      (\n        !instance.mt5_account_id ||\n        reportedAccount !== String(instance.account_number || "") ||\n        (reportedServer && instance.broker_server && reportedServer !== String(instance.broker_server))\n      );\n\n    // LOCAL account-follow: changing the MT5 login switches SCENOVA to the new\n    // account automatically only while the previously-bound account is flat.\n    if (accountMismatch && instance.mode === "LOCAL" && reportedAccount && reportedServer) {\n      const previousBoundPositions = Number(\n        instance.metrics?.previousBoundPositions ??\n        instance.metrics?.positions ??\n        0\n      );\n\n      if (previousBoundPositions <= 0) {\n        const foreignAccount = await this.db.one(\n          `SELECT id,user_id\n           FROM mt5_accounts\n           WHERE lower(account_number)=lower($1)\n             AND lower(broker_server)=lower($2)\n             AND status='ACTIVE'\n             AND user_id<>$3\n           LIMIT 1`,\n          [reportedAccount, reportedServer, instance.user_id]\n        );\n\n        if (!foreignAccount) {\n          let nextAccount = await this.db.one(\n            `SELECT *\n             FROM mt5_accounts\n             WHERE user_id=$1\n               AND lower(account_number)=lower($2)\n               AND lower(broker_server)=lower($3)\n             ORDER BY created_at DESC\n             LIMIT 1`,\n            [instance.user_id, reportedAccount, reportedServer]\n          );\n\n          if (nextAccount) {\n            nextAccount = await this.db.one(\n              "UPDATE mt5_accounts SET broker=$2,mode='LOCAL',status='ACTIVE' WHERE id=$1 RETURNING *",\n              [nextAccount.id, reportedBroker || nextAccount.broker || "Detected MT5"]\n            );\n          } else {\n            nextAccount = await this.db.one(\n              "INSERT INTO mt5_accounts(user_id,account_number,broker,broker_server,mode,status) VALUES($1,$2,$3,$4,'LOCAL','ACTIVE') RETURNING *",\n              [instance.user_id, reportedAccount, reportedBroker || "Detected MT5", reportedServer]\n            );\n          }\n\n          const previousAccountId = instance.mt5_account_id || null;\n          const nextActualState = String(body.state || "STOPPED").slice(0, 24);\n          await this.db.query(\n            `UPDATE bot_instances SET\n               mt5_account_id=$2,\n               desired_state='STOPPED',\n               actual_state=$3,\n               last_seen_at=now(),\n               ea_last_ip=$4,\n               metrics=$5::jsonb,\n               pending_account_number=NULL,\n               pending_broker=NULL,\n               pending_broker_server=NULL,\n               pending_account_ip=NULL,\n               pending_account_seen_at=NULL,\n               account_change_requested_at=NULL\n             WHERE id=$1`,\n            [instance.id, nextAccount.id, nextActualState, eaIp, JSON.stringify(metrics)]\n          );\n\n          await this.db.query(\n            "INSERT INTO audit_logs(actor,action,entity_type,entity_id,detail) VALUES($1,'AUTO_FOLLOW_MT5_ACCOUNT','bot_instance',$2,$3::jsonb)",\n            [\n              "EA:" + String(instance.user_id),\n              instance.id,\n              JSON.stringify({\n                previousAccountId,\n                nextAccountId: nextAccount.id,\n                accountNumber: reportedAccount,\n                brokerServer: reportedServer,\n                source: "LOCAL_RUNTIME"\n              })\n            ]\n          );\n\n          instance.mt5_account_id = nextAccount.id;\n          instance.account_number = nextAccount.account_number;\n          instance.broker = nextAccount.broker;\n          instance.broker_server = nextAccount.broker_server;\n          instance.account_status = "ACTIVE";\n          instance.desired_state = "STOPPED";\n          instance.actual_state = nextActualState;\n          accountMismatch = false;\n        }\n      }\n    }\n\n    if (accountMismatch) {\n'''
if old_mismatch_head not in text:
    raise SystemExit("account mismatch block head not found")
text = text.replace(old_mismatch_head, auto_follow, 1)
write(ea_controller, text)


# Customer API: slot is no longer a customer-facing account ownership boundary.
bot_path = "apps/api/src/bot.controller.ts"
text = read(bot_path)
text = text.replace(
    'NO_ACCESS: { label: "ไม่มีสิทธิ์ใช้งาน", detail: "ต้องมี Trial หรือ Subscription ที่ตรงกับ Slot", tone: "bad" },',
    'NO_ACCESS: { label: "ไม่มีสิทธิ์ใช้งาน", detail: "ต้องมี Trial หรือ Subscription ที่ใช้งานได้กับบัญชี SCENOVA นี้", tone: "bad" },',
    1,
)
old_assert = '''  private async assertMt5IdentityAvailable(\n    userId: string,\n    accountNumber: string,\n    brokerServer: string,\n    slotId: string\n  ) {\n    const conflict = await this.db.one(\n      `SELECT a.id,a.user_id,bi.slot_id,u.user_code,u.role\n       FROM mt5_accounts a\n       JOIN users u ON u.id=a.user_id\n       LEFT JOIN bot_instances bi ON bi.mt5_account_id=a.id\n       WHERE lower(a.account_number)=lower($1)\n         AND lower(a.broker_server)=lower($2)\n         AND a.status='ACTIVE'\n         AND (\n           a.user_id<>$3\n           OR (bi.slot_id IS NOT NULL AND bi.slot_id<>$4)\n         )\n       ORDER BY\n         CASE WHEN u.role IN ('OWNER','ADMIN') THEN 0 ELSE 1 END,\n         a.created_at ASC\n       LIMIT 1`,\n      [accountNumber, brokerServer, userId, slotId]\n    );\n    if (conflict) {\n      throw new ConflictException(\n        "MT5 " + accountNumber + " / " + brokerServer +\n        " ถูกผูกกับ SCENOVA Slot อื่นอยู่แล้ว"\n      );\n    }\n  }\n'''
new_assert = '''  private async assertMt5IdentityAvailable(\n    userId: string,\n    accountNumber: string,\n    brokerServer: string,\n    _slotId: string\n  ) {\n    const conflict = await this.db.one(\n      `SELECT a.id,a.user_id,u.user_code,u.role\n       FROM mt5_accounts a\n       JOIN users u ON u.id=a.user_id\n       WHERE lower(a.account_number)=lower($1)\n         AND lower(a.broker_server)=lower($2)\n         AND a.status='ACTIVE'\n         AND a.user_id<>$3\n       ORDER BY\n         CASE WHEN u.role IN ('OWNER','ADMIN') THEN 0 ELSE 1 END,\n         a.created_at ASC\n       LIMIT 1`,\n      [accountNumber, brokerServer, userId]\n    );\n    if (conflict) {\n      throw new ConflictException(\n        "MT5 " + accountNumber + " / " + brokerServer +\n        " ถูกผูกกับบัญชี SCENOVA อื่นอยู่แล้ว"\n      );\n    }\n  }\n'''
if old_assert not in text:
    raise SystemExit("bot MT5 identity assertion block not found")
text = text.replace(old_assert, new_assert, 1)
text = text.replace("    if (legacySub && !slotId) {", "    if (legacySub) {", 1)
old_resolve = '''    const slot = await this.db.one(\n      `SELECT ls.*\n       FROM license_slots ls\n       LEFT JOIN subscriptions s ON s.id=ls.subscription_id\n       WHERE ls.assigned_user_id=$1 AND ls.status IN ('ACTIVE','AVAILABLE')\n       ORDER BY\n         CASE WHEN s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() THEN 0 ELSE 1 END,\n         CASE WHEN ls.mode='LOCAL' THEN 0 ELSE 1 END,\n         ls.slot_number,ls.created_at\n       LIMIT 1`,\n      [userId]\n    );\n'''
new_resolve = '''    const slot = await this.db.one(\n      `SELECT ls.*\n       FROM license_slots ls\n       LEFT JOIN subscriptions s ON s.id=ls.subscription_id\n       LEFT JOIN bot_instances bi ON bi.slot_id=ls.id\n       WHERE ls.assigned_user_id=$1 AND ls.status IN ('ACTIVE','AVAILABLE')\n       ORDER BY\n         CASE WHEN bi.last_seen_at IS NOT NULL AND bi.last_seen_at>now()-interval '30 seconds' THEN 0 ELSE 1 END,\n         CASE WHEN s.status='ACTIVE' AND s.starts_at<=now() AND s.expires_at>now() THEN 0 ELSE 1 END,\n         CASE WHEN ls.mode='LOCAL' THEN 0 ELSE 1 END,\n         bi.last_seen_at DESC NULLS LAST,\n         ls.slot_number,ls.created_at\n       LIMIT 1`,\n      [userId]\n    );\n'''
if old_resolve not in text:
    raise SystemExit("default slot resolver block not found")
text = text.replace(old_resolve, new_resolve, 1)
write(bot_path, text)


# Dashboard: remove visible Slot chooser and wording; retain hidden compatibility id.
page_path = "apps/web/app/dashboard/page.tsx"
text = read(page_path)
text = text.replace('    load(new URLSearchParams(window.location.search).get("slotId") || "");', '    load("");', 1)
text = text.replace('    const id = setInterval(()=>load(selectedSlotIdRef.current), 2000);', '    const id = setInterval(()=>load(""), 2000);', 1)
slot_pattern = re.compile(r'''\n        \{\(data\.slots \|\| \[\]\)\.filter\(\(slot:any\)=>slot\.can_control\)\.length > 1 && \(\n          <section className="slot-switcher">.*?\n        \)\}\n''', re.S)
text, count = slot_pattern.subn("\n", text, count=1)
if count != 1:
    raise SystemExit(f"customer slot switcher removal count={count}")
text = text.replace('{ id:"account", label:"บัญชี MT5", hint:"Slots, Device และการเชื่อมต่อ" },', '{ id:"account", label:"บัญชี MT5", hint:"MT5, Device และการเชื่อมต่อ" },', 1)
text = text.replace(': "ตรวจสถานะ Trial สมาชิก และสิทธิ์ของ Slot"}', ': "ตรวจสถานะ Trial สมาชิก และสิทธิ์ใช้งาน"}', 1)
write(page_path, text)

layout_path = "apps/web/app/layout.tsx"
text = read(layout_path)
text = text.replace('import { Mt5AccountSwitchAssistant } from "../components/Mt5AccountSwitchAssistant";\n', '', 1)
text = text.replace('        <Mt5AccountSwitchAssistant />\n', '', 1)
write(layout_path, text)

nav_path = "apps/web/components/CustomerNavigationLabels.tsx"
text = read(nav_path)
text = text.replace('{ label: "MT5 & EA", hint: "Accounts, slots, devices & connections" },', '{ label: "MT5 & EA", hint: "Accounts, devices & connections" },', 1)
write(nav_path, text)

installer_path = "apps/api/src/installer.controller.ts"
text = read(installer_path)
text = text.replace('throw new ConflictException("slot is not assigned to an active SCENOVA user");', 'throw new ConflictException("SCENOVA account is not active for this installer");', 1)
text = text.replace('throw new ConflictException("this installer code is not valid for a LOCAL slot");', 'throw new ConflictException("this installer code is not valid for LOCAL mode");', 1)
write(installer_path, text)


# ZERO GRID regression model.
zero_test = r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function up(value, tick) { return Math.ceil(value / tick - 1e-10) * tick; }
function down(value, tick) { return Math.floor(value / tick + 1e-10) * tick; }

export function buildPendingPlan({ bid, ask, step = 3, baseLot = 0.03, levelsPerSide = 5, brokerMinDistance = 0, tick = 0.01 }) {
  const safeGap = Math.max(tick, brokerMinDistance) + tick;
  const buyAnchor = up(ask + safeGap, tick);
  const sellAnchor = down(bid - safeGap, tick);
  const orders = [];
  for (let level = 1; level <= levelsPerSide; level += 1) {
    const offset = step * (level - 1);
    const lot = baseLot * level;
    orders.push({ type: "BUY_STOP", level, lot, price: buyAnchor + offset });
    orders.push({ type: "SELL_STOP", level, lot, price: sellAnchor - offset });
  }
  return orders;
}

{
  const bid = 4304.40;
  const ask = 4304.60;
  const orders = buildPendingPlan({ bid, ask, step: 3, brokerMinDistance: 0.05, tick: 0.01, levelsPerSide: 3 });
  const buys = orders.filter((o) => o.type === "BUY_STOP");
  const sells = orders.filter((o) => o.type === "SELL_STOP");
  assert.ok(buys[0].price - ask < 0.10, "first BUY STOP should hug live ask");
  assert.ok(bid - sells[0].price < 0.10, "first SELL STOP should hug live bid");
  assert.equal(Number((buys[1].price - buys[0].price).toFixed(2)), 3);
  assert.equal(Number((sells[0].price - sells[1].price).toFixed(2)), 3);
}

{
  const orders = buildPendingPlan({ bid: 4304.40, ask: 4304.60, step: 3, baseLot: 0.03, levelsPerSide: 5 });
  assert.equal(orders.length, 10);
  assert.deepEqual(orders.filter((o) => o.type === "BUY_STOP").map((o) => Number(o.lot.toFixed(2))), [0.03, 0.06, 0.09, 0.12, 0.15]);
}

{
  const bid = 4304.40;
  const ask = 4304.60;
  const orders = buildPendingPlan({ bid, ask, step: 3, levelsPerSide: 5 });
  const mid = (bid + ask) / 2;
  assert.equal(orders.filter((o) => o.type === "BUY_STOP" ? mid >= o.price : mid <= o.price).length, 0);
}

const ea = readFileSync("mt5/FastBasketBot.mq5", "utf8");
const api = readFileSync("apps/api/src/ea.controller.ts", "utf8");
const web = readFileSync("apps/web/app/dashboard/page.tsx", "utf8");
const sendStart = ea.indexOf("bool ZeroGridSendPending(bool buySide,int level)");
const sendEnd = ea.indexOf("bool ZeroGridEnsureLadder()", sendStart);
assert.ok(sendStart >= 0 && sendEnd > sendStart, "ZERO pending sender missing");
const sendBlock = ea.slice(sendStart, sendEnd);
assert.match(sendBlock, /request\.action\s*=\s*TRADE_ACTION_PENDING/);
assert.match(sendBlock, /ORDER_TYPE_BUY_STOP/);
assert.match(sendBlock, /ORDER_TYPE_SELL_STOP/);
assert.doesNotMatch(sendBlock, /TRADE_ACTION_DEAL/);
assert.match(ea, /double ZeroGridEntryGapPrice\(\)[\s\S]*ZeroGridMinPendingDistancePrice\(\)\+tick/);
assert.match(ea, /double ZeroGridPendingAnchorPrice\(bool buySide\)[\s\S]*live\.ask\+gap[\s\S]*live\.bid-gap/);
assert.doesNotMatch(ea, /ZeroGridEffectiveStepPrice\(\)\*1\.5/);
assert.match(ea, /double ZeroGridEstimatedExitCostMoney\(\)/);
assert.match(ea, /ZeroGridRequiredCloseNet\(\)[\s\S]*ZeroGridEstimatedExitCostMoney\(\)/);
assert.match(ea, /bool\s+g_settingsSynchronized\s*=\s*false/);
assert.match(ea, /WAIT_SETTINGS_SYNC/);
assert.match(api, /\["AUTO",\s*"RACE",\s*"ZERO_GRID",\s*"ASSISTED",\s*"MANUAL"\]/);
assert.match(web, /ตั้ง 5 = วาง BUY STOP 5 รายการ \+ SELL STOP 5 รายการ/);
console.log("ZERO GRID near-entry and real-net regression passed");
'''
write("tests/zero-grid-v1-simulation.mjs", zero_test)

account_test = r'''$ErrorActionPreference = "Stop"
function Require-Contains([string]$text,[string]$needle,[string]$label) { if (-not $text.Contains($needle)) { throw "Missing contract: $label -> $needle" } }
function Require-NotContains([string]$text,[string]$needle,[string]$label) { if ($text.Contains($needle)) { throw "Obsolete customer Slot contract: $label -> $needle" } }
$eaApi = [System.IO.File]::ReadAllText((Resolve-Path "apps/api/src/ea.controller.ts"))
$botApi = [System.IO.File]::ReadAllText((Resolve-Path "apps/api/src/bot.controller.ts"))
$page = [System.IO.File]::ReadAllText((Resolve-Path "apps/web/app/dashboard/page.tsx"))
$layout = [System.IO.File]::ReadAllText((Resolve-Path "apps/web/app/layout.tsx"))
$nav = [System.IO.File]::ReadAllText((Resolve-Path "apps/web/components/CustomerNavigationLabels.tsx"))
Require-Contains $eaApi 'const customerSubscription = await this.db.one(' 'user-level LOCAL membership'
Require-Contains $eaApi 'AUTO_FOLLOW_MT5_ACCOUNT' 'automatic MT5 account follow audit'
Require-Contains $eaApi 'previousBoundPositions <= 0' 'only auto-switch when old account is flat'
Require-Contains $eaApi 'AND user_id<>$3' 'cross-customer MT5 identity protection'
Require-Contains $eaApi 'instance.desired_state = "STOPPED";' 'safe stop after automatic account switch'
Require-Contains $botApi 'bi.last_seen_at DESC NULLS LAST' 'automatic active installation selection'
Require-NotContains $page 'className="slot-switcher"' 'customer Slot selector removed'
Require-NotContains $page 'เลือก Slot ที่ต้องการควบคุม' 'customer Slot chooser copy removed'
Require-NotContains $layout '<Mt5AccountSwitchAssistant />' 'manual account-switch assistant removed'
Require-NotContains $nav 'Accounts, slots, devices & connections' 'navigation Slot wording removed'
Require-NotContains $botApi 'ต้องมี Trial หรือ Subscription ที่ตรงกับ Slot' 'access Slot wording removed'
Write-Host 'LOCAL account-follow / no customer Slot contract: PASS'
'''
write("tests/local-account-follow-contract.ps1", account_test)

ci_path = ".github/workflows/ci.yml"
text = read(ci_path)
ci_marker = '''      - name: ZERO GRID stability simulation regression\n        run: node ./tests/zero-grid-v1-simulation.mjs\n'''
if ci_marker not in text:
    raise SystemExit("CI ZERO GRID step not found")
text = text.replace(ci_marker, ci_marker + '''      - name: LOCAL account-follow no customer Slot contract\n        shell: pwsh\n        run: ./tests/local-account-follow-contract.ps1\n''', 1)
write(ci_path, text)

build_path = ".github/workflows/build-mt5-ea.yml"
text = read(build_path)
old_sentinel = "            'double ZeroGridEntryGapPrice()',\n            'double ZeroGridPendingAnchorPrice(bool buySide)',"
new_sentinel = "            'double ZeroGridEntryGapPrice()',\n            'double ZeroGridEstimatedExitCostMoney()',\n            'double ZeroGridPendingAnchorPrice(bool buySide)',"
if old_sentinel not in text:
    raise SystemExit("EA build sentinel location not found")
text = text.replace(old_sentinel, new_sentinel, 1)
old_guard = '''          if ($text.Contains('return MathMax(g_zeroGridStepPrice,ZeroGridMinPendingDistancePrice()+ZeroGridTickSize());')) {\n            throw "Obsolete ZERO GRID over-wide spacing rule is still present"\n          }\n'''
if old_guard not in text:
    raise SystemExit("EA build ZERO guard not found")
text = text.replace(old_guard, old_guard + '''          if ($text.Contains('ZeroGridEffectiveStepPrice()*1.5')) {\n            throw "Obsolete ZERO GRID 1.5-step first-entry gap is still present"\n          }\n''', 1)
write(build_path, text)

print("ZERO near-entry + real-net close + LOCAL MT5 account-follow patch applied")
