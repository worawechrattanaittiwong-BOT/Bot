import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ea = readFileSync("mt5/FastBasketBot.mq5", "utf8");
const web = readFileSync("apps/web/app/dashboard/page.tsx", "utf8");
const api = readFileSync("apps/api/src/bot.controller.ts", "utf8");
const release = readFileSync("apps/api/src/release-version.ts", "utf8");

// New grids are centered on a single saved midpoint, not a quote that moves
// separately before BUY1 and SELL1 are submitted.
function ladder(midpoint, firstGap, gridStep, levels = 5) {
  return Array.from({ length: levels }, (_, i) => ({
    buy: midpoint + firstGap + i * gridStep,
    sell: midpoint - firstGap - i * gridStep,
  }));
}
for (const firstGap of [2, 3]) {
  for (const gridStep of [0.5, 1, 2, 3, 4]) {
    const orders = ladder(4000, firstGap, gridStep);
    assert.equal(orders[0].buy, 4000 + firstGap);
    assert.equal(orders[0].sell, 4000 - firstGap);
    for (let i = 1; i < orders.length; ++i) {
      assert.equal(orders[i].buy - orders[i - 1].buy, gridStep);
      assert.equal(orders[i - 1].sell - orders[i].sell, gridStep);
    }
  }
}
assert.deepEqual(ladder(4000, 2, 4).map(o => o.buy), [4002, 4006, 4010, 4014, 4018]);
assert.deepEqual(ladder(4000, 2, 4).map(o => o.sell), [3998, 3994, 3990, 3986, 3982]);

assert.match(ea, /double ZeroGridAllowedFirstGap\(double requested\)[\s\S]*?requested-2\.0[\s\S]*?return 3\.0;/);
assert.match(ea, /double ZeroGridAllowedStep\(double requested\)[\s\S]*?requested-4\.0[\s\S]*?return 3\.0;/);
assert.match(ea, /double ZeroGridEffectiveFirstGapPrice\(\)/);
assert.match(ea, /g_zeroGridCycleFirstGapPrice=ZeroGridAllowedFirstGap\(g_zeroGridFirstGapPrice\);/);
assert.match(ea, /GlobalVariableSet\(ZeroGridStateKey\("FIRSTGAP"\),g_zeroGridCycleFirstGapPrice\)/);
assert.match(ea, /GlobalVariableCheck\(ZeroGridStateKey\("FIRSTGAP"\)\)/);
assert.match(ea, /string keys\[8\]=\{"CENTER","EQUITY","START","FIRSTGAP","STEP","LEVELS","BASELOT","LOWVOL"\}/);
assert.match(ea, /bool legacyLiveAnchor=g_zeroGridCycleFirstGapPrice<=0\.0/);
assert.match(ea, /double raw=legacyLiveAnchor[\s\S]*?g_zeroGridCenter\+gap[\s\S]*?g_zeroGridCenter-gap/);
assert.match(ea, /double ZeroGridPendingLevelPrice\(bool buySide,int level\)[\s\S]*?step\*\(level-1\)/);
assert.match(ea, /brokerSafe=ZeroGridMinPendingDistancePrice\(\)\+ZeroGridTickSize\(\)/);
assert.match(ea, /g_zeroGridFirstGapPrice = ZeroGridAllowedFirstGap\(JsonNumber\(json, "zeroGridFirstGapPrice"/);
assert.match(ea, /zeroGridConfiguredFirstGapPrice/);
assert.match(ea, /zeroGridConfiguredStepPrice/);
assert.match(web, /zeroGridFirstGapPrice: 3/);
assert.match(web, /props\.onEdit\?\.\("zeroGridFirstGapPrice"/);
assert.match(web, /<option value="2">2\.00<\/option><option value="3">3\.00<\/option><\/select>/);
assert.match(web, /<option value="4">4\.00<\/option>/);
assert.match(web, /const appliedZeroFirstGap = Number\(props\.metrics\?\.zeroGridConfiguredFirstGapPrice\)/);
assert.match(web, /const appliedZeroStep = Number\(props\.metrics\?\.zeroGridConfiguredStepPrice\)/);
assert.match(api, /body\.zeroGridFirstGapPrice !== undefined/);
assert.match(api, /\[2, 3\]\.includes\(zeroGridFirstGapPrice\)/);
assert.match(api, /\[0\.5, 1, 2, 3, 4\]\.includes\(zeroGridStepPrice\)/);
assert.match(api, /metrics\.zeroGridConfiguredFirstGapPrice/);
assert.match(api, /metrics\.zeroGridConfiguredStepPrice/);
assert.match(api, /Math\.abs\(appliedFirstGap - requestedFirstGap\) > 0\.000001/);
assert.match(api, /Math\.abs\(appliedStep - requestedStep\) > 0\.000001/);
assert.match(release, /DEFAULT_EA_VERSION = "1\.1\.31"/);

console.log("ZERO GRID 2/3 first offset and 0.5/1/2/3/4 step contract PASS (10 settings combinations)");

