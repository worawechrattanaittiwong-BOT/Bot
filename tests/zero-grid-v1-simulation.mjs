import assert from "node:assert/strict";
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
