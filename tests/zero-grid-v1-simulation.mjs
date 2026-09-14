import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function up(value, tick) { return Math.ceil(value / tick - 1e-10) * tick; }
function down(value, tick) { return Math.floor(value / tick + 1e-10) * tick; }

export function buildPendingPlan({ bid, ask, step = 3, baseLot = 0.03, levelsPerSide = 5, brokerMinDistance = 0, tick = 0.01 }) {
  const safeGap = Math.max(tick, brokerMinDistance);
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
assert.match(ea, /double ZeroGridEntryGapPrice\(\)[\s\S]*double gap=ZeroGridMinPendingDistancePrice\(\)/);
assert.doesNotMatch(ea, /ZeroGridMinPendingDistancePrice\(\)\+ZeroGridTickSize\(\)/);
assert.doesNotMatch(ea, /MathMax\(stops,freeze\)/);
assert.match(ea, /double ZeroGridPendingAnchorPrice\(bool buySide\)[\s\S]*live\.ask\+gap[\s\S]*live\.bid-gap/);
assert.doesNotMatch(ea, /ZeroGridEffectiveStepPrice\(\)\*1\.5/);
assert.match(ea, /double ZeroGridEstimatedExitCostMoney\(\)/);
assert.match(ea, /ZeroGridRequiredCloseNet\(\)[\s\S]*ZeroGridEstimatedExitCostMoney\(\)/);
assert.match(ea, /bool\s+g_settingsSynchronized\s*=\s*false/);
assert.match(ea, /WAIT_SETTINGS_SYNC/);
assert.match(api, /\["AUTO",\s*"RACE",\s*"ZERO_GRID",\s*"ASSISTED",\s*"MANUAL"\]/);
assert.match(web, /ตั้ง 5 = วาง BUY STOP 5 รายการ \+ SELL STOP 5 รายการ/);
console.log("ZERO GRID nearest-legal first-entry and real-net regression passed");
