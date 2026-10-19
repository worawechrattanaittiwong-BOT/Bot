const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");

function loadRules() {
 const source=fs.readFileSync("apps/api/src/trading-schedule-rules.ts","utf8");
 const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const out={exports:{}};
 class ConflictException extends Error{}
 new Function("module","exports","require",js)(out,out.exports,(name)=>{
  if(name==="@nestjs/common")return {ConflictException};
  throw Error("Unexpected dependency: "+name);
 });
 return out.exports;
}
const rules=loadRules();
function dt(y,m,d,h,min=0){
 return new Date(Date.UTC(y,m-1,d,h,min));
}
test("Bangkok timezone always converts UTC correctly, including midnight",()=>{
 assert.equal(rules.bangkokHour(dt(2026,10,19,16,59)),23);
 assert.equal(rules.bangkokHour(dt(2026,10,19,17,0)),0);
 assert.equal(rules.bangkokHour(dt(2026,10,19,0)),7);
});
test("24 checkbox hours must be unique integer values in 0..23",()=>{
 assert.ok(rules.validTradingHours([0,1,22,23]));
 assert.ok(rules.validTradingHours(Array.from({length:24},(_,h)=>h)));
 for (const x of [[],[24],[1,1],[1.5],[-1],["9"],[0,null],"0",null]) {
  assert.equal(rules.validTradingHours(x),false,JSON.stringify(x));
 }
});
test("only checked Bangkok hours are allowed, including disconnected overnight windows",()=>{
 const s={controlMode:"RACE",tradingScheduleEnabled:true,tradingScheduleHours:[22,23,0,1,9]};
 assert.equal(rules.tradingHourAllowed(s,dt(2026,10,19,15,0)),true); // 22:00
 assert.equal(rules.tradingHourAllowed(s,dt(2026,10,19,18,59)),true); // 01:59
 assert.equal(rules.tradingHourAllowed(s,dt(2026,10,19,19,0)),false); // 02:00
 assert.equal(rules.tradingHourAllowed(s,dt(2026,10,19,2,0)),true); // 09:00
 assert.equal(rules.tradingHourAllowed(s,dt(2026,10,19,3,0)),false); // 10:00
});
test("disabled default schedule does not affect old accounts",()=>{
 assert.equal(rules.tradingHourAllowed({},dt(2026,10,19,12)),true);
 assert.doesNotThrow(()=>rules.checkTradingScheduleStart({},false));
 assert.throws(()=>rules.checkTradingScheduleStart({},true),/RACE/);
});
test("manual Start is gated by the window; auto requires durable armed+pending",()=>{
 const s={controlMode:"RACE",tradingScheduleEnabled:true,tradingScheduleHours:[10]};
 assert.throws(()=>rules.checkTradingScheduleStart(s,false,dt(2026,10,19,2)),/นอกชั่วโมง/);
 assert.doesNotThrow(()=>rules.checkTradingScheduleStart(s,false,dt(2026,10,19,3)));
 assert.throws(()=>rules.checkTradingScheduleStart(s,true,dt(2026,10,19,3)),/กด Start/);
 s.tradingScheduleArmed=true;
 s.tradingScheduleResumePending=true;
 assert.doesNotThrow(()=>rules.checkTradingScheduleStart(s,true,dt(2026,10,19,3)));
});
test("default RACE uses all 24 hours; the five other modes must never be gated",()=>{
  const all=Array.from({length:24},(_,h)=>h);
  for(let h=0;h<24;h++){
    assert.equal(rules.tradingHourAllowed({controlMode:"RACE",tradingScheduleEnabled:true,tradingScheduleHours:all},dt(2026,10,19,h)),true);
  }
  for(const mode of ["AUTO","COUNTER","FLIP_LOCK","ZERO_GRID","MANUAL"]){
    const settings={controlMode:mode,tradingScheduleEnabled:true,tradingScheduleHours:[1]};
    assert.equal(rules.isRaceSchedule(settings),false);
    assert.equal(rules.tradingHourAllowed(settings,dt(2026,10,19,5)),true,mode);
    assert.doesNotThrow(()=>rules.checkTradingScheduleStart(settings,false,dt(2026,10,19,5)),mode);
    assert.throws(()=>rules.checkTradingScheduleStart(settings,true,dt(2026,10,19,5)),/RACE/,mode);
  }
  assert.equal(rules.isRaceSchedule({engineMode:"RACE"}),true);
});

test("production contracts: schedule respects explicit stop, Live settings isolation and existing SAFE_STOP",()=>{
 const bot=fs.readFileSync("apps/api/src/bot.controller.ts","utf8");
 const svc=fs.readFileSync("apps/api/src/trading-schedule.service.ts","utf8");
 const mode=fs.readFileSync("apps/api/src/trading-mode-control.service.ts","utf8");
 const mq5=fs.readFileSync("mt5/FastBasketBot.mq5","utf8");
 const web=fs.readFileSync("apps/web/components/TradingHoursSchedule.tsx","utf8");
 assert.match(bot,/@Post\("schedule\/pause"\)/);
 assert.match(bot,/@Put\("schedule"\)/);
 assert.match(bot,/tradingScheduleArmed":false,"tradingScheduleResumePending":false/);
 assert.match(bot,/pg_advisory_xact_lock\(740096\)/);
 assert.match(mode,/checkTradingScheduleStart\(currentSchedule, scheduleAuto\)/);
 assert.match(svc,/tradingScheduleResumePending !== true/);
 assert.match(svc,/actual_state !== "STOPPED"/);
 assert.match(svc,/row\.metrics\?\.accountScenovaPendingOrders/);
 assert.match(svc,/TRADING_SCHEDULE_WINDOW_END/);
 assert.match(svc,/controller\.start\(\{user:\{sub:row\.assigned_user_id\},scheduleAuto:true\}/);
 assert.match(mq5,/TimeGMT\(\)/);
 assert.match(mq5,/EnforceTradingScheduleWindow\(\)/);
 assert.match(mq5,/tradingScheduleHourMask/);
 assert.match(web,/Array\.from\(\{length:24\}/);
 assert.match(web,/useState<number\[\]>\(hours24\)/);
 assert.match(web,/const storedEnabled=configured \? settings\.tradingScheduleEnabled === true : true/);
 assert.match(web,/const storedHours=[\s\S]*?: hours24;/);
 assert.match(bot,/if \(!isRaceSchedule\(old\)\)/);
 const page=fs.readFileSync("apps/web/app/dashboard/page.tsx","utf8");
 assert.match(page,/toUpperCase\(\)==="RACE" && \(/);
 assert.match(svc,/canonical_mode_key\(bs\.settings\)='RACE'/);
 const ea=fs.readFileSync("apps/api/src/ea.controller.ts","utf8");
 assert.match(ea,/firstConnectPrimeRuntimeReady &&[\s\S]*?tradingScheduleArmed === true && tradingHourAllowed\(runtimeSettings\)/);
 assert.match(mq5,/g_controlMode!="RACE" \|\| !g_tradingScheduleEnabled/);
 assert.match(mq5,/g_controlMode=="RACE" && g_tradingScheduleEnabled/);
 assert.match(web,/schedule\/pause/);
});
