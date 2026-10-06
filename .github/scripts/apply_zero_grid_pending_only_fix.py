from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def replace_function(text: str, signature: str, replacement: str) -> str:
    start = text.find(signature)
    if start < 0:
        raise SystemExit(f"function not found: {signature}")
    brace = text.find("{", start)
    if brace < 0:
        raise SystemExit(f"opening brace not found: {signature}")
    depth = 0
    end = None
    for index in range(brace, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end is None:
        raise SystemExit(f"closing brace not found: {signature}")
    return text[:start] + replacement.rstrip() + text[end:]


# ---------------------------------------------------------------------------
# EA: ZERO GRID must be pending-only and must not fall into AUTO before the
# first valid settings heartbeat. Five levels means exactly five BUY STOP and
# five SELL STOP requests when broker permissions allow them.
# ---------------------------------------------------------------------------
ea_path = "mt5/FastBasketBot.mq5"
ea = read(ea_path)

if "bool   g_settingsSynchronized = false;" not in ea:
    ea = replace_once(
        ea,
        'string g_engineMode = "AUTO";\nstring g_controlMode = "LEGACY";\ndouble g_zeroGridStepPrice = 3.0;',
        'string g_engineMode = "AUTO";\nstring g_controlMode = "LEGACY";\n// Never allow AUTO/legacy entry before the Server has delivered a real mode.\nbool   g_settingsSynchronized = false;\ndouble g_zeroGridStepPrice = 3.0;',
        "settings synchronization global",
    )

ea = replace_function(
    ea,
    "string EffectiveExecutionMode()",
    r'''string EffectiveExecutionMode()
{
   // Live MT5 must never guess an execution mode at startup. The first valid
   // settings heartbeat selects the owner. Strategy Tester keeps the input
   // fallback so historical tests remain deterministic/offline.
   if(!MQLInfoInteger(MQL_TESTER) && !g_settingsSynchronized)
      return "UNSYNCED";

   string control=g_controlMode;
   StringToUpper(control);
   if(control == "ZERO_GRID") return "ZERO_GRID";
   if(control == "RACE") return "RACE";
   if(control == "AUTO" || control == "ASSISTED" || control == "MANUAL")
      return "AUTO";

   string engine=g_engineMode;
   StringToUpper(engine);
   if(engine == "ZERO_GRID" || engine == "RACE") return engine;
   return "AUTO";
}''',
)

if "g_settingsSynchronized = true;" not in ea:
    marker = "   // A legacy AUTO burst must never survive a transition into an isolated mode."
    if ea.count(marker) != 1:
        raise SystemExit("ApplySettings isolation marker missing or duplicated")
    ea = ea.replace(
        marker,
        "   // A valid Server-delivered mode is the startup ownership latch.\n"
        "   if(hasControlMode || hasEngineMode)\n"
        "      g_settingsSynchronized = true;\n\n"
        + marker,
        1,
    )

ea = replace_function(
    ea,
    "bool ZeroGridEnsureLadder()",
    r'''bool ZeroGridEnsureLadder()
{
   if(g_zeroGridCenter<=0.0)
      return false;

   bool complete=true;
   int nettingDirection=ZeroGridAccountIsNetting() ? ZeroGridPositionDirection() : 0;
   int attemptsThisPass=0;
   int levels=ZeroGridEffectiveLevelsPerSide();
   // Build the requested ladder in one pass when possible. Example: 5 means
   // exactly 5 BUY STOP + 5 SELL STOP pending requests. A broker rejection on
   // one level must not block the other valid levels; missing levels retry.
   int maxAttemptsPerPass=MathMin(60,levels*2);

   for(int level=1;level<=levels;level++)
   {
      if(nettingDirection>=0 && !ZeroGridLevelExists(true,level))
      {
         attemptsThisPass++;
         if(!ZeroGridSendPending(true,level))
            complete=false;
         if(attemptsThisPass>=maxAttemptsPerPass) break;
      }
      if(nettingDirection<=0 && !ZeroGridLevelExists(false,level))
      {
         attemptsThisPass++;
         if(!ZeroGridSendPending(false,level))
            complete=false;
         if(attemptsThisPass>=maxAttemptsPerPass) break;
      }
      if(g_ordersInWindow>=g_maxOrdersPerMinute)
      {
         complete=false;
         break;
      }
   }
   return complete;
}''',
)

if 'g_executionStatus = "WAIT_SETTINGS_SYNC";' not in ea:
    marker = "   // New orders are allowed only while the website has very recently\n"
    if ea.count(marker) != 1:
        raise SystemExit("OnTick new-order lease marker missing or duplicated")
    ea = ea.replace(
        marker,
        "   // Hard startup isolation: no execution engine may create a new order\n"
        "   // until the Server has explicitly selected AUTO/RACE/ZERO_GRID.\n"
        "   if(!MQLInfoInteger(MQL_TESTER) && !g_settingsSynchronized)\n"
        "   {\n"
        "      g_executionStatus = \"WAIT_SETTINGS_SYNC\";\n"
        "      return;\n"
        "   }\n\n"
        + marker,
        1,
    )

write(ea_path, ea)


# ---------------------------------------------------------------------------
# API heartbeat: this was the root bug. ZERO_GRID was omitted from the valid
# runtime control modes, so every heartbeat silently rewrote it to AUTO.
# ---------------------------------------------------------------------------
ea_api_path = "apps/api/src/ea.controller.ts"
ea_api = read(ea_api_path)
old_runtime = '''    const savedControlMode = String(runtimeSettings.controlMode || "").toUpperCase();
    if (!["AUTO", "RACE", "ASSISTED", "MANUAL"].includes(savedControlMode)) {
      const engineMode = String(runtimeSettings.engineMode || "AUTO").toUpperCase();
      const entryMode = String(runtimeSettings.entryMode || "AUTO_MOMENTUM").toUpperCase();
      runtimeSettings.controlMode = engineMode === "RACE"
        ? "RACE"
        : entryMode === "AUTO_MOMENTUM" ? "AUTO" : "LEGACY";
    }
    if (String(runtimeSettings.engineMode || "").toUpperCase() === "RACE") {
      runtimeSettings.minOrderIntervalMs = 150;
      runtimeSettings.maxOrdersPerMinute = 240;
    }'''
new_runtime = '''    const savedControlMode = String(runtimeSettings.controlMode || "").toUpperCase();
    if (!["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL"].includes(savedControlMode)) {
      const engineMode = String(runtimeSettings.engineMode || "AUTO").toUpperCase();
      const entryMode = String(runtimeSettings.entryMode || "AUTO_MOMENTUM").toUpperCase();
      runtimeSettings.controlMode = engineMode === "ZERO_GRID"
        ? "ZERO_GRID"
        : engineMode === "RACE"
          ? "RACE"
          : entryMode === "AUTO_MOMENTUM" ? "AUTO" : "LEGACY";
    }

    // Canonical heartbeat pair. ZERO_GRID must reach the EA unchanged; otherwise
    // the EA can fall into AUTO and open a market position instead of pending orders.
    const runtimeControlMode = String(runtimeSettings.controlMode || "AUTO").toUpperCase();
    runtimeSettings.engineMode = runtimeControlMode === "ZERO_GRID"
      ? "ZERO_GRID"
      : runtimeControlMode === "RACE"
        ? "RACE"
        : "AUTO";

    if (runtimeSettings.engineMode === "RACE") {
      runtimeSettings.minOrderIntervalMs = 150;
      runtimeSettings.maxOrdersPerMinute = 240;
    }'''
if old_runtime in ea_api:
    ea_api = ea_api.replace(old_runtime, new_runtime, 1)
elif '"ZERO_GRID", "ASSISTED", "MANUAL"' not in ea_api:
    raise SystemExit("EA heartbeat runtime-mode block not found")
write(ea_api_path, ea_api)


# ---------------------------------------------------------------------------
# Web settings: preserve exact ZERO count as an integer, make 1..30 selectable,
# show the 5+5 meaning explicitly, canonicalize the mode pair, and never Start
# with unsaved settings.
# ---------------------------------------------------------------------------
web_path = "apps/web/app/dashboard/page.tsx"
web = read(web_path)

old_numeric_tail = '''        "sessionStartHour",
        "sessionEndHour",
        "maxAtrPoints"
      ];'''
new_numeric_tail = '''        "sessionStartHour",
        "sessionEndHour",
        "maxAtrPoints",
        "zeroGridStepPrice",
        "zeroGridLevelsPerSide",
        "zeroGridBaseLot",
        "zeroGridMinNetProfitMoney",
        "zeroGridCloseReserveMoney"
      ];'''
if old_numeric_tail in web:
    web = web.replace(old_numeric_tail, new_numeric_tail, 1)
elif '"zeroGridLevelsPerSide",\n        "zeroGridBaseLot"' not in web:
    raise SystemExit("web numeric settings list not found")

old_integer = '''      const integerKeys = new Set([
        "maxPositions",
        "minOrderIntervalMs",
        "maxOrdersPerMinute"
      ]);'''
new_integer = '''      const integerKeys = new Set([
        "maxPositions",
        "minOrderIntervalMs",
        "maxOrdersPerMinute",
        "zeroGridLevelsPerSide"
      ]);'''
if old_integer in web:
    web = web.replace(old_integer, new_integer, 1)
elif '"zeroGridLevelsPerSide"\n      ]);' not in web:
    raise SystemExit("web integer settings list not found")

old_payload = '''      payload.adaptiveEngine = true;
      const raceSpeedX2 = String(payload.engineMode || "").toUpperCase() === "RACE";
      payload.minOrderIntervalMs = raceSpeedX2 ? 150 : 300;'''
new_payload = '''      payload.adaptiveEngine = true;

      // Keep controlMode/engineMode atomic. ZERO GRID is a pending-order engine,
      // never an AUTO entry mode.
      const requestedControlMode = String(payload.controlMode || payload.engineMode || "AUTO").toUpperCase();
      if (requestedControlMode === "ZERO_GRID") {
        payload.controlMode = "ZERO_GRID";
        payload.engineMode = "ZERO_GRID";
      } else if (requestedControlMode === "RACE") {
        payload.controlMode = "RACE";
        payload.engineMode = "RACE";
      } else {
        payload.controlMode = ["ASSISTED", "MANUAL"].includes(requestedControlMode)
          ? requestedControlMode
          : "AUTO";
        payload.engineMode = "AUTO";
      }

      const raceSpeedX2 = payload.engineMode === "RACE";
      payload.minOrderIntervalMs = raceSpeedX2 ? 150 : 300;'''
if old_payload in web:
    web = web.replace(old_payload, new_payload, 1)
elif "const requestedControlMode = String(payload.controlMode" not in web:
    raise SystemExit("web canonical mode save block not found")

old_command = '''  async function command(path: string, success: string) {
    setBusy(true);'''
new_command = '''  async function command(path: string, success: string) {
    if (path.startsWith("/bot/start") && settingsDirtyRef.current) {
      setError("มีการตั้งค่าที่ยังไม่ได้บันทึก กรุณากดบันทึกก่อนเริ่มบอท");
      setBotSettingsOpen(true);
      return;
    }
    setBusy(true);'''
if old_command in web:
    web = web.replace(old_command, new_command, 1)
elif "มีการตั้งค่าที่ยังไม่ได้บันทึก" not in web:
    raise SystemExit("web command() start guard not found")

old_levels = '''                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>ระดับต่อฝั่ง</span><select className="input" value={String(props.settings.zeroGridLevelsPerSide||30)} onChange={e=>props.onEdit?.("zeroGridLevelsPerSide",e.target.value)}>{[5,10,15,20,25,30].map(v=><option key={v} value={v}>{v} ระดับ / ฝั่ง</option>)}</select></label>'''
new_levels = '''                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวน Pending ต่อฝั่ง</span><select className="input" value={String(props.settings.zeroGridLevelsPerSide||30)} onChange={e=>props.onEdit?.("zeroGridLevelsPerSide",e.target.value)}>{Array.from({length:30},(_,i)=>i+1).map(v=><option key={v} value={v}>{v} BUY STOP + {v} SELL STOP</option>)}</select><small>ตั้ง 5 = วาง BUY STOP 5 รายการ + SELL STOP 5 รายการ รวม 10 Pending · ไม่มี Market Order ตอนเริ่ม</small></label>'''
if old_levels in web:
    web = web.replace(old_levels, new_levels, 1)
elif "ตั้ง 5 = วาง BUY STOP 5 รายการ" not in web:
    raise SystemExit("ZERO GRID level selector not found")

old_mode_copy = 'ZERO_GRID:{title:"ZERO GRID",subtitle:"รองรับ MT5 Demo/Real · Hedging วางสองฝั่ง และ Netting ล็อกฝั่งแรกอัตโนมัติ พร้อมปรับ Lot/ราคาให้ตรงข้อกำหนดโบรกเกอร์"},'
new_mode_copy = 'ZERO_GRID:{title:"ZERO GRID",subtitle:"Pending Order ล้วนตามราคา · ไม่ใช้ Brain/Indicator และไม่เปิด Market Order ตอน Start · กำหนดจำนวน BUY STOP / SELL STOP ต่อฝั่งได้ตรงตัว"},'
if old_mode_copy in web:
    web = web.replace(old_mode_copy, new_mode_copy, 1)

old_hero_count = '''                      <span>{configuredMaxPositions} ไม้</span>'''
new_hero_count = '''                      <span>{String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? Number(settings.zeroGridLevelsPerSide||30)+" BUY STOP + "+Number(settings.zeroGridLevelsPerSide||30)+" SELL STOP" : configuredMaxPositions+" ไม้"}</span>'''
if old_hero_count in web:
    web = web.replace(old_hero_count, new_hero_count, 1)
elif '" BUY STOP + "+Number(settings.zeroGridLevelsPerSide' not in web:
    raise SystemExit("dashboard hero count chip not found")

old_engine_copy = 'Demo/Real · เปิด Grid หุบเข้าชิดราคา · ปิดจากไม้ใกล้ราคาไล่ออก · รองรับ Hedging/Netting'
new_engine_copy = 'Pending เท่านั้น · Start แล้ววาง BUY STOP / SELL STOP ตามจำนวนที่ตั้ง · ไม่ใช้สมอง EA · รองรับ Hedging/Netting'
if old_engine_copy in web:
    web = web.replace(old_engine_copy, new_engine_copy, 1)

write(web_path, web)


# ---------------------------------------------------------------------------
# Regression: model the clip contract and inspect the actual source/API/web so
# CI cannot pass with a self-contained simulation while runtime mode delivery is
# broken again.
# ---------------------------------------------------------------------------
test_path = "tests/zero-grid-v1-simulation.mjs"
test = r'''import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ZERO GRID pending-only regression.
 * Contract from the reference clip:
 * - Start creates pending orders only; no instant market entry.
 * - first BUY/SELL stops are symmetric around a fixed cycle center.
 * - first gap is 1.5 x configured step (or farther only when broker safety requires it).
 * - every next level uses the exact configured inter-level step.
 * - level n uses BaseLot x n.
 * - levelsPerSide=N means exactly N BUY STOP + N SELL STOP.
 * - ZERO_GRID is preserved through API heartbeat and never normalized to AUTO.
 */

export function buildPendingPlan({ center, step = 3, baseLot = 0.03, levelsPerSide = 5, brokerMinGap = 0 }) {
  const firstGap = Math.max(step * 1.5, brokerMinGap);
  const orders = [];
  for (let level = 1; level <= levelsPerSide; level += 1) {
    const distance = firstGap + step * (level - 1);
    const lot = baseLot * level;
    orders.push({ type: "BUY_STOP", level, lot, price: center + distance });
    orders.push({ type: "SELL_STOP", level, lot, price: center - distance });
  }
  return orders;
}

// Exact count: setting 5 means five pending orders on each side, not 5 total.
{
  const orders = buildPendingPlan({ center: 4304.5, step: 3, baseLot: 0.03, levelsPerSide: 5 });
  assert.equal(orders.length, 10);
  assert.equal(orders.filter((o) => o.type === "BUY_STOP").length, 5);
  assert.equal(orders.filter((o) => o.type === "SELL_STOP").length, 5);
  assert.deepEqual(
    orders.filter((o) => o.type === "BUY_STOP").map((o) => Number(o.lot.toFixed(2))),
    [0.03, 0.06, 0.09, 0.12, 0.15]
  );
}

// Geometry: first stop is 1.5 steps away, then spacing remains exactly one step.
{
  const orders = buildPendingPlan({ center: 4304.5, step: 3, baseLot: 0.03, levelsPerSide: 3 });
  const buys = orders.filter((o) => o.type === "BUY_STOP");
  const sells = orders.filter((o) => o.type === "SELL_STOP");
  assert.equal(Number((buys[0].price - 4304.5).toFixed(2)), 4.5);
  assert.equal(Number((4304.5 - sells[0].price).toFixed(2)), 4.5);
  assert.equal(Number((buys[1].price - buys[0].price).toFixed(2)), 3);
  assert.equal(Number((sells[0].price - sells[1].price).toFixed(2)), 3);
}

// Pending means nothing is filled merely because the bot was started.
{
  const orders = buildPendingPlan({ center: 4304.5, step: 3, levelsPerSide: 5 });
  const marketPriceAtStart = 4304.5;
  const triggered = orders.filter((o) =>
    o.type === "BUY_STOP" ? marketPriceAtStart >= o.price : marketPriceAtStart <= o.price
  );
  assert.equal(triggered.length, 0);
}

const ea = readFileSync("mt5/FastBasketBot.mq5", "utf8");
const api = readFileSync("apps/api/src/ea.controller.ts", "utf8");
const web = readFileSync("apps/web/app/dashboard/page.tsx", "utf8");

// Real EA source must use pending actions for ZERO and must not market-enter in
// the ZERO pending sender.
const sendStart = ea.indexOf("bool ZeroGridSendPending(bool buySide,int level)");
const sendEnd = ea.indexOf("bool ZeroGridEnsureLadder()", sendStart);
assert.ok(sendStart >= 0 && sendEnd > sendStart, "ZERO pending sender missing");
const sendBlock = ea.slice(sendStart, sendEnd);
assert.match(sendBlock, /request\.action\s*=\s*TRADE_ACTION_PENDING/);
assert.match(sendBlock, /ORDER_TYPE_BUY_STOP/);
assert.match(sendBlock, /ORDER_TYPE_SELL_STOP/);
assert.doesNotMatch(sendBlock, /TRADE_ACTION_DEAL/);

// Startup must wait for a real settings owner; no default AUTO market entry.
assert.match(ea, /bool\s+g_settingsSynchronized\s*=\s*false/);
assert.match(ea, /return\s+"UNSYNCED"/);
assert.match(ea, /WAIT_SETTINGS_SYNC/);
assert.match(ea, /int maxAttemptsPerPass=MathMin\(60,levels\*2\);/);

// The heartbeat used to omit ZERO_GRID here and silently rewrite it to AUTO.
assert.match(api, /\["AUTO",\s*"RACE",\s*"ZERO_GRID",\s*"ASSISTED",\s*"MANUAL"\]/);
assert.match(api, /runtimeControlMode === "ZERO_GRID"[\s\S]*?\? "ZERO_GRID"/);

// Web must persist the exact pending level count as an integer and explain 5+5.
assert.match(web, /"zeroGridLevelsPerSide"[\s\S]*?const integerKeys/);
assert.match(web, /"maxOrdersPerMinute",\s*\n\s*"zeroGridLevelsPerSide"/);
assert.match(web, /ตั้ง 5 = วาง BUY STOP 5 รายการ \+ SELL STOP 5 รายการ/);
assert.match(web, /มีการตั้งค่าที่ยังไม่ได้บันทึก/);

console.log("ZERO GRID pending-only exact-level regression passed");
'''
write(test_path, test)


# ---------------------------------------------------------------------------
# Build validation: follow the new exact-level and settings-sync implementation.
# ---------------------------------------------------------------------------
build_path = ".github/workflows/build-mt5-ea.yml"
build = read(build_path)
build = build.replace(
    "            'const int maxAttemptsPerPass=6;',",
    "            'int maxAttemptsPerPass=MathMin(60,levels*2);',\n            'bool   g_settingsSynchronized = false;',\n            'WAIT_SETTINGS_SYNC',",
    1,
)
build = build.replace(
    'policy = "AUTO_CENTRAL_DECISION_AUDIT_STATS_RACE_ZERO_GRID_V3_FIXED_CYCLE_NEAR_TO_FAR_CLOSE_OUTWARD"',
    'policy = "AUTO_CENTRAL_DECISION_AUDIT_STATS_RACE_ZERO_GRID_V3_PENDING_ONLY_EXACT_LEVELS"',
    1,
)
if "int maxAttemptsPerPass=MathMin(60,levels*2);" not in build:
    raise SystemExit("build workflow ZERO GRID sentinel update failed")
write(build_path, build)

print("ZERO GRID pending-only hotfix applied")
