import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ea = readFileSync("mt5/FastBasketBot.mq5", "utf8");

function section(start, end) {
  const a = ea.indexOf(start);
  const b = ea.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `missing section ${start}`);
  return ea.slice(a, b);
}

const send = section("bool ZeroGridSendPending(bool buySide,int level)", "double ZeroGridPendingLevelVolume");
const ensure = section("bool ZeroGridEnsureLadder()", "void ZeroGridCancelPendingSide");
const start = section("bool StartZeroGridCycle()", "bool ManageZeroGrid()");
const manage = section("bool ManageZeroGrid()", "// Brain V17 RACE");

assert.match(ea, /#property version\s+"1\.0\.17"/);
assert.match(ea, /ZERO_SIMPLE_STABLE_V117/);

// ZERO sends pending orders only. It must never turn into market-entry logic.
assert.match(send, /TRADE_ACTION_PENDING/);
assert.match(send, /ORDER_TYPE_BUY_STOP/);
assert.match(send, /ORDER_TYPE_SELL_STOP/);
assert.doesNotMatch(send, /TRADE_ACTION_DEAL/);

// No strategy gate is allowed to decide whether ZERO can build or rearm.
const runtime = `${start}\n${manage}\n${ensure}`;
for (const forbidden of [
  "EntryLeaseValid",
  "AdaptiveSpreadAllowed",
  "UpdateMomentum",
  "Confidence",
  "Session",
  "RaceM5",
  "AUTO_V20",
  "AverageTrueRange",
  "g_trendM",
  "g_macroTrendDirection"
]) {
  assert.equal(runtime.includes(forbidden), false, `ZERO runtime must not depend on ${forbidden}`);
}

// The old atomic rollback loop caused order churn. Keep accepted pending orders
// and retry only the missing/invalid side until the complete symmetric ladder exists.
assert.doesNotMatch(ensure, /ZERO_GRID_PAIR_ROLLBACK/);
assert.doesNotMatch(ensure, /ZERO_PAIR_ATOMIC_V116/);
assert.match(ensure, /ZeroGridPendingLevelVolume\(true,level\)/);
assert.match(ensure, /ZeroGridPendingLevelVolume\(false,level\)/);
assert.match(ensure, /ZeroGridPendingCount\(\)!=levels\*2/);
assert.match(ensure, /ZeroGridFlatLevelPairValid\(level\)/);

// Generic AUTO/RACE rate limiting must not block ZERO placement.
assert.doesNotMatch(send, /g_maxOrdersPerMinute/);
assert.doesNotMatch(send, /zeroRateLimit/);

// Profit close must return directly to a fresh ZERO cycle when flat.
assert.match(manage, /g_zeroGridClosing=true/);
assert.match(manage, /ResetZeroGridCycleState\(\)/);
assert.match(manage, /StartZeroGridCycle\(\)/);
assert.match(ea, /zeroTimerOwnsRuntime[\s\S]*ManageZeroGrid\(\)/);

// Basic configured-lot symmetry example: 0.01, 0.02, 0.03 per side.
const baseLot = 0.01;
const levels = 3;
const sideLots = Array.from({ length: levels }, (_, i) => Number((baseLot * (i + 1)).toFixed(2)));
assert.deepEqual(sideLots, [0.01, 0.02, 0.03]);
assert.equal(Number(sideLots.reduce((a, b) => a + b, 0).toFixed(2)), 0.06);

console.log("ZERO simple stable v1.0.17 contract passed");
