import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ea=readFileSync("mt5/FastBasketBot.mq5","utf8");
const dashboard=readFileSync("apps/web/app/dashboard/page.tsx","utf8");
function between(start,end) {
 const s=ea.indexOf(start),e=ea.indexOf(end,s+start.length);
 assert.ok(s>=0&&e>s,"MQL section exists: "+start);
 return ea.slice(s,e);
}
const race=between("bool ProcessRaceFill(int direction)","bool StartRaceCycle(double momentum)");
const chase=between("bool RaceAntiChaseBlocked(int direction,string &reasonOut)","int RaceLivePriceDirection()");
const stop=between("double RaceInitialStopPrice(int direction, double entryPrice)","bool RaceStopReady()");
const margin=between("bool RaceFirstFillMarginReady(int direction,double volume)","bool ProcessRaceFill(int direction)");
for(const item of [
 "TradePermissionStatus()","RaceFillPacingReady(direction)","CanSendOrder()",
 'g_spreadStatus == "EXTREME"',"RaceStopReady()","NormalizeTradeVolume(g_lot)",
 "RaceV1UpdateExposureTelemetry(direction,g_adaptiveLot)",
 "RaceFirstFillMarginReady(direction,g_adaptiveLot)",
 "RaceNewsPauseActive(newsReason)","RaceAntiChaseBlocked(direction,chaseReason)",
 "SendMarketOrder(direction)","RegisterOrderRequest()"
]) assert.ok(race.includes(item),"RACE guard/entry missing: "+item);
for(const item of ["AUTO_H4","AUTO_FIRST_QUALITY","RaceV2DecisionDirection("])
 assert.ok(!race.includes(item),"AUTO-like filter introduced: "+item);
assert.ok(race.indexOf("RaceFirstFillMarginReady(direction,g_adaptiveLot)") < race.indexOf("SendMarketOrder(direction)"));
assert.match(race,/newsNow-lastNewsCheck>=30/);
assert.match(race,/if\(newsBlocked\)\s*\{\s*g_executionStatus=newsReason;\s*return false;/);
assert.match(race,/if\(RaceAntiChaseBlocked\(direction,chaseReason\)\)\s*\{\s*g_executionStatus=chaseReason;\s*return false;/);
assert.match(chase,/bool chaseRisk=terminalEdge && \(largeExpansion \|\| stretchedRun\)/);
assert.match(chase,/liveTravel>=atrM5Price\*0\.65/);
assert.match(margin,/if\(BasketPositionCount\(\)>0\)\s*return true;/);
assert.match(margin,/OrderCalcMargin\(side,_Symbol,volume,price,estimatedMargin\)/);
assert.match(margin,/ACCOUNT_MARGIN_FREE/);
assert.match(margin,/if\(availableMargin>=estimatedMargin\)\s*return true;/);
assert.match(margin,/g_executionStatus="RACE_MARGIN_INSUFFICIENT"/);
assert.doesNotMatch(margin,/g_lastOrderRetcode\s*=/);
assert.match(race,/g_lastOrderRetcode==TRADE_RETCODE_NO_MONEY/);
assert.match(race,/g_executionStatus="RACE_MARGIN_INSUFFICIENT"/);
assert.match(ea,/#define RACE_AUTO_STOP_ATR_BASE 1\.50/);
assert.match(ea,/#define RACE_AUTO_STOP_ATR_WIDE 1\.60/);
assert.match(ea,/#define RACE_AUTO_STOP_ATR_FLOOR 1\.00/);
assert.match(ea,/#define RACE_AUTO_STOP_ATR_CAP 1\.65/);
assert.match(stop,/minDistancePoints>maxDistancePoints/);
assert.match(stop,/RaceV2StructureInvalidPrice\(direction\)/);
assert.match(dashboard,/isMt5Online && String\(metrics\.executionStatus \|\| ""\)\.toUpperCase\(\) === "RACE_MARGIN_INSUFFICIENT"/);
assert.match(dashboard,/role="alert"/);
console.log("PASS: RACE guard / margin warning / ATR cap / no AUTO restriction");
