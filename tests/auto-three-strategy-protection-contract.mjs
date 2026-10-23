import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const ea=readFileSync("mt5/FastBasketBot.mq5","utf8");
const swing=readFileSync("mt5/include/AutoSwingFilter.mqh","utf8");
const dashboard=readFileSync("apps/web/app/dashboard/page.tsx","utf8");
const release=readFileSync("apps/api/src/release-version.ts","utf8");
function section(source,from,to) {
  const a=source.indexOf(from), b=source.indexOf(to,a+from.length);
  assert.ok(a>=0 && b>a,"missing region "+from);
  return source.slice(a,b);
}
const strategy=section(swing,"bool AutoFreshM5Strategy(int direction,string &modelOut,string &reasonOut)","bool AutoSwingEntryAllowed(");
const gate=section(swing,"bool AutoSwingEntryAllowed(","double AutoAddRequiredProgressPoints(");
const decision=section(ea,"int AutoPrecisionDirection(double momentum)","double AutoExistingLotCeiling()");
const sendStart=ea.indexOf("bool SendMarketOrder(int direction) /* V9_RETRY */");
assert.ok(sendStart>0);
const sent=ea.slice(sendStart,sendStart+12500);
for(const item of [
 "CopyRates(_Symbol,PERIOD_M5,1,10,bars)","now-closeTime>120",
 "bars[0].close>oldHigh+atr*0.06","bars[0].close<oldLow-atr*0.06",
 "body<=atr*1.40","price<=oldHigh+atr*0.65",
 "price>=oldLow-atr*0.65","AUTO_SWING_BREAKOUT","AUTO_SWING_REVERSAL",
 "AUTO_ADAPTIVE_REVERSAL","M5_SWEEP_RECLAIM_M1_CONFIRMED",
 "GlobalVariableGet(key)>=(double)bars[0].time"
]) assert.ok(strategy.includes(item),"Missing closed M5 / no chase: "+item);
assert.match(strategy,/m1Confirmed=g_trendM1==direction/);
assert.match(strategy,/counterMacro=g_macroTrendDirection==-direction/);
assert.match(gate,/firstStrategyModel=="AUTO_ADAPTIVE_REVERSAL"/);
assert.match(gate,/strongHtfConflict && !confirmedCounterturn/);
assert.match(gate,/!setupLocation && executionConfirmations<2 && !freshStrategy/);
assert.match(gate,/executionConfirmations<requiredExecutionConfirmations && !freshStrategy/);
assert.match(gate,/if\(isAdd && h4Direction!=direction\)/);
assert.match(decision,/if\(direction==0\)[\s\S]*AutoFreshM5Strategy\(1,buyModel,buyReason\)/);
assert.match(decision,/EnforceUserDirectionLock\(freshDirection\)/);
assert.match(decision,/firstStrategyModel!="NONE" \? 48\.0 : 54\.0/);
assert.match(decision,/selected\.rr<AUTO_FIRST_ENTRY_MIN_NET_RR/);
assert.match(decision,/AutoRiskBudgetAllows\(selected,count,riskReason\)/);
assert.match(decision,/AutoVectorEdgeLiveAllow\(direction,vectorLiveReason\)/);
assert.match(decision,/AUTO_FIRST_FRESH_CONFIRM_WAIT/);
assert.match(ea,/GlobalVariableSet\(AutoStrategyConsumedKey\(\),\(double\)signalBar\)/);
assert.match(sent,/request\.sl=autoPlan\.slPrice/);
assert.match(sent,/request\.tp=autoPlan\.tpPrice/);
assert.match(sent,/bool protectedOrder=request\.sl>0\.0 && request\.tp>0\.0/);
assert.match(sent,/bool protectedFinal=request\.sl>0\.0 && request\.tp>0\.0/);
assert.match(sent,/if\(!protectedFinal\)[\s\S]*AUTO_BROKER_PROTECTION_INVALID/);
assert.match(sent,/auto\s*\?\s*OrderSend\(request,result\)/);
assert.match(sent,/Print\("AUTO protected order plan: side="/);
assert.match(dashboard,/แผน Stop Loss \/ Take Profit ล่าสุด/);
assert.match(dashboard,/เป็นราคาที่ EA คำนวณ · ตรวจราคาที่โบรกเกอร์ยืนยันใน MT5/);
assert.match(ea,/#property version\s+"1\.1\.33"/);
assert.match(release,/DEFAULT_EA_VERSION = "1\.1\.33"/);
assert.doesNotMatch(strategy,/OrderSend\(/);
console.log("AUTO three strategy + SL TP + isolation contract PASS");
