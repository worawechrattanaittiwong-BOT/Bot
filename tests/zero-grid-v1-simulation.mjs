import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function up(value, tick) { return Math.ceil(value / tick - 1e-10) * tick; }
function down(value, tick) { return Math.floor(value / tick + 1e-10) * tick; }

export function buildPendingPlan({ bid, ask, step = 3, baseLot = 0.03, levelsPerSide = 5, brokerMinDistance = 0, tick = 0.01, firstOffsetPrice = 3.0, lowVolatility = false }) {
  const effectiveStep = lowVolatility ? 0.30 : step;
  const effectiveFirstOffset = lowVolatility ? 0.10 : firstOffsetPrice;
  const brokerSafe = Math.max(tick, brokerMinDistance) + tick;
  const buyAnchor = up(Math.max(ask + effectiveFirstOffset, ask + brokerSafe), tick);
  const sellAnchor = down(Math.min(bid - effectiveFirstOffset, bid - brokerSafe), tick);
  const orders = [];
  for (let level = 1; level <= levelsPerSide; level += 1) {
    const offset = effectiveStep * (level - 1);
    const lot = lowVolatility ? baseLot : baseLot * level;
    orders.push({ type: "BUY_STOP", level, lot, price: buyAnchor + offset });
    orders.push({ type: "SELL_STOP", level, lot, price: sellAnchor - offset });
  }
  return orders;
}

{
  const bid = 4000.95;
  const ask = 4001.05;
  const orders = buildPendingPlan({ bid, ask, step: 3, brokerMinDistance: 0.05, tick: 0.01, levelsPerSide: 3 });
  const buys = orders.filter((o) => o.type === "BUY_STOP");
  const sells = orders.filter((o) => o.type === "SELL_STOP");
  assert.equal(Number(buys[0].price.toFixed(2)), 4004.05, "first BUY STOP should be +3.00 from live ask");
  assert.equal(Number(sells[0].price.toFixed(2)), 3997.95, "first SELL STOP should be -3.00 from live bid");
  assert.equal(Number((buys[1].price - buys[0].price).toFixed(2)), 3);
  assert.equal(Number((sells[0].price - sells[1].price).toFixed(2)), 3);
}

{
  const orders = buildPendingPlan({ bid: 4304.40, ask: 4304.60, step: 3, baseLot: 0.03, levelsPerSide: 5 });
  assert.equal(orders.length, 10);
  assert.deepEqual(orders.filter((o) => o.type === "BUY_STOP").map((o) => Number(o.lot.toFixed(2))), [0.03, 0.06, 0.09, 0.12, 0.15]);
}

{
  const orders = buildPendingPlan({ bid: 3999.99, ask: 4000.01, baseLot: 0.01, levelsPerSide: 3, tick: 0.01, lowVolatility: true });
  const buys = orders.filter((o) => o.type === "BUY_STOP");
  const sells = orders.filter((o) => o.type === "SELL_STOP");
  assert.deepEqual(buys.map((o) => Number(o.price.toFixed(2))), [4000.10, 4000.40, 4000.70]);
  assert.deepEqual(sells.map((o) => Number(o.price.toFixed(2))), [3999.90, 3999.60, 3999.30]);
  assert.deepEqual(buys.map((o) => Number(o.lot.toFixed(2))), [0.01, 0.01, 0.01]);
  assert.deepEqual(sells.map((o) => Number(o.lot.toFixed(2))), [0.01, 0.01, 0.01]);
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
assert.match(ea, /double ZeroGridEntryGapPrice\(\)[\s\S]*double preferredGap=ZeroGridEffectiveLowVolatilityEnabled\(\) \? 0\.10 : 1\.0;[\s\S]*ZeroGridMinPendingDistancePrice\(\)\+tick/);
assert.doesNotMatch(ea, /MathMax\(stops,freeze\)/);
assert.match(ea, /double ZeroGridPendingAnchorPrice\(bool buySide\)[\s\S]*g_zeroGridCenter\+gap[\s\S]*g_zeroGridCenter-gap[\s\S]*live\.ask\+brokerSafe[\s\S]*live\.bid-brokerSafe/);
assert.doesNotMatch(ea, /ZeroGridEffectiveStepPrice\(\)\*1\.5/);
assert.match(ea, /double ZeroGridEstimatedExitCostMoney\(\)/);
assert.match(ea, /double ZeroGridRequiredCloseNet\(\)[\s\S]*return MathMax\(0\.01,g_zeroGridMinNetProfitMoney\);/, "ZERO must close at the exact configured money target");
assert.doesNotMatch(ea.match(/double ZeroGridRequiredCloseNet\(\)[\s\S]*?\n}/)?.[0] || "", /zeroGridCloseReserve|ZeroGridEstimatedExitCostMoney/, "ZERO target must not include hidden reserve/estimated exit cost");
assert.match(ea, /bool\s+g_settingsSynchronized\s*=\s*false/);
assert.match(ea, /WAIT_SETTINGS_SYNC/);
assert.match(api, /\["AUTO",\s*"RACE",\s*"ZERO_GRID",\s*"FLIP_LOCK",\s*"ASSISTED",\s*"MANUAL"\]/);
assert.doesNotMatch(ea, /PARALLEL_UNIVERSE|ParallelUniverse/, "retired Parallel Universe must not remain in EA source");
assert.doesNotMatch(api, /PARALLEL_UNIVERSE/, "retired Parallel Universe must not remain in API runtime");
assert.doesNotMatch(web, /PARALLEL_UNIVERSE|PARALLEL UNIVERSE/, "retired Parallel Universe must not remain in Control Center");
assert.match(web, /Array\.from\(\{length:30\},\(_,i\)=>i\+1\)/, "ZERO UI must expose 1..30 levels per side");
assert.match(web, /Array\.from\(\{length:30\},\(_,i\)=>i\+1\)/, "ZERO UI must preserve the 1..30 per-side selector range");
assert.match(ea, /int maxPlacementAttempts=\(level==1 \? 3 : 2\)/, "L1 must retry immediately");
assert.match(sendBlock, /OrderSendAsync\(request,result\)/, "live ZERO pending placement must use async dispatch");
assert.match(ea, /ZeroGridPendingRequestInFlight\(bool buySide,int level\)/, "async ZERO placement must suppress duplicate in-flight requests");
assert.match(ea, /ZERO_SIMPLE_STABLE_V117/, "ZERO must use the simple stable pending engine");
assert.match(ea, /InpZeroGridLowVolatilityEnabled\s*=\s*false/, "low-volatility switch must default OFF");
assert.match(ea, /ZeroGridEffectiveLowVolatilityEnabled\(\) \? 0\.10 : 3\.0/, "normal first gap must be 3.00 while low-volatility stays 0.10");
assert.match(ea, /g_zeroGridLowVolatilityEnabled \? 0\.30/, "low-volatility level spacing must be 0.30");
assert.match(ea, /ZeroGridEffectiveLevelLot\(int level\)/, "ZERO must isolate fixed-vs-ladder lot calculation");
assert.match(web, /กริดตลาดความผันผวนต่ำ/, "ZERO UI must expose the professional low-volatility switch");
assert.doesNotMatch(ea, /ZERO_GRID_PAIR_ROLLBACK/, "ZERO must not churn accepted orders with pair rollback");
assert.match(ea, /ZeroGridPendingCount\(\)!=levels\*2/, "flat ZERO must require the full configured ladder");
const zeroOwnerGuard = ea.indexOf("if(zeroGridOwnsRuntime || zeroGridCanStart)");
const dailyProfitGuard = ea.indexOf("if(HandleDailyProfitControl(count))");
const dailyLossGuard = ea.indexOf("double effectiveDailyLoss = EffectiveDailyLossLimit();");
assert.ok(zeroOwnerGuard >= 0, "ZERO must own an existing ZERO runtime before shared risk controls");
assert.match(ea, /bool zeroGridCanStart\s*=\s*[\s\S]*ZeroGridModeEnabled\(\)[\s\S]*BasketPositionCount\(\)<=0[\s\S]*RescuePositionCount\(\)<=0/, "selected ZERO must wait until a foreign live owner is flat");
assert.ok(zeroOwnerGuard < dailyProfitGuard && zeroOwnerGuard < dailyLossGuard, "hidden AUTO/RACE daily controls must not liquidate ZERO cycles");
assert.doesNotMatch(ea, /ZERO GRID starts only when selected and the EA-owned basket is flat/, "ZERO must not have a second late dispatch path after shared risk controls");
assert.match(ea, /g_safeStopDrainRequested\s*=\s*\(g_access && desired == "SAFE_STOP"\)/, "ZERO graceful drain must be armed only by explicit website SAFE_STOP");
assert.match(ea, /bool safeStopDrain\s*=\s*[\s\S]*g_state==STATE_SAFE_STOP[\s\S]*g_safeStopDrainRequested[\s\S]*if\(!safeStopDrain\)[\s\S]*ZeroGridCancelPending\(\)/, "ZERO Safe Stop must preserve the already-staged pending ladder only for explicit Safe Stop");
assert.match(ea, /pending=ZeroGridPendingCount\(\);[\s\S]*if\(positions<=0 && pending<=0\)/, "ZERO Safe Stop must not mark the cycle flat while pending orders still belong to it");
assert.match(ea, /for\(int level=1;level<=levels;level\+\+\)/, "flat ZERO must validate every configured level pair");
console.log("ZERO GRID standard + low-volatility geometry, paired staging and real-net regression passed");
