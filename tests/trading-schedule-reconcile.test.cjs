const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");

function compile(path,requireMock) {
  const js=ts.transpileModule(fs.readFileSync(path,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
      experimentalDecorators:true}
  }).outputText;
  const mod={exports:{}};
  new Function("module","exports","require",js)(mod,mod.exports,requireMock);
  return mod.exports;
}
const {bangkokHour,tradingHourAllowed,isRaceSchedule}=compile(
  "apps/api/src/trading-schedule-rules.ts",(name)=>{
  if(name==="@nestjs/common")return {ConflictException:class extends Error{}};
  throw Error(name);
});
const {TradingScheduleService}=compile("apps/api/src/trading-schedule.service.ts",(name)=>{
  if(name==="@nestjs/common")return {Injectable:()=>x=>x,Logger:class{warn() {}}};
  if(name==="@nestjs/core")return {ModuleRef:class{}};
  if(name==="./bot.controller")return {BotController:class{}};
  if(name==="./trading-schedule-rules")return {bangkokHour,tradingHourAllowed,isRaceSchedule};
  throw Error(name);
});
const row=()=>({
  id:"test-instance",slot_id:"test-slot",mode:"LOCAL",desired_state:"STOPPED",
  actual_state:"STOPPED",slot_status:"ACTIVE",assigned_user_id:"test-user",
  last_seen_at:new Date(),metrics:{accountScenovaPositions:0,accountScenovaPendingOrders:0},
  settings:{controlMode:"RACE",tradingScheduleEnabled:true,
    tradingScheduleHours:Array.from({length:24},(_,i)=>i),
    tradingScheduleArmed:true,tradingScheduleResumePending:true}
});
function harness(last={command:"SAFE_STOP",payload:{source:"TRADING_SCHEDULE_WINDOW_END"}},settings=row().settings) {
  const starts=[],queries=[];
  const db={
    one:async(sql)=>{queries.push(sql);return last;},
    query:async(sql)=>{queries.push(sql);return {rows:[]};},
    transaction:async fn=>fn({query:async(sql,args)=>{
      queries.push(sql+" "+JSON.stringify(args||[])); if(sql.includes("SELECT bi.desired_state,bs.settings"))
        return {rows:[{desired_state:"RUNNING",settings}]};
      return {rows:[]};
    }})
  };
  const moduleRef={get:()=>({start:async(req,slot)=>{starts.push({req,slot});}})};
  return {svc:new TradingScheduleService(db,moduleRef),starts,queries};
}
test("only a fully stopped, fresh and flat RACE instance may auto resume",async()=>{
  const h=harness();
  await h.svc.reconcileOne(row());
  assert.equal(h.starts.length,1);
  assert.equal(h.starts[0].req.scheduleAuto,true);
  assert.equal(h.starts[0].req.user.sub,"test-user");
  assert.equal(h.starts[0].slot,"test-slot");
});
test("manual Stop never auto resumes, even with a previously scheduled stop command",async()=>{
  for(const changes of [
    {settings:{...row().settings,tradingScheduleArmed:false}},
    {settings:{...row().settings,tradingScheduleResumePending:false}},
    {desired_state:"SAFE_STOP"},
    {actual_state:"RUNNING"},
    {last_seen_at:new Date(Date.now()-70_000)},
    {metrics:{accountScenovaPositions:1,accountScenovaPendingOrders:0}},
    {metrics:{accountScenovaPositions:0,accountScenovaPendingOrders:2}},
    {metrics:{accountScenovaPositions:0}},
    {slot_status:"DELETED"},
    {assigned_user_id:null}
  ]){
    const h=harness();
    await h.svc.reconcileOne({...row(),...changes});
    assert.equal(h.starts.length,0,JSON.stringify(changes));
  }
  const h=harness({command:"SAFE_STOP",payload:{source:"CUSTOMER_SCHEDULE_PAUSE"}});
  await h.svc.reconcileOne(row());
  assert.equal(h.starts.length,0);
});
test("scheduled stop uses SAFE_STOP only; never force closes orders",async()=>{
  const before=row();
  before.desired_state="RUNNING";
  before.settings.tradingScheduleHours=[(bangkokHour()+12)%24];
  const h=harness(undefined,before.settings);
  await h.svc.reconcileOne(before);
  const q=h.queries.join("\n");
  assert.match(q,/desired_state='SAFE_STOP'/);
  assert.match(q,/TRADING_SCHEDULE_WINDOW_END/);
  assert.doesNotMatch(q,/CLOSE_ALL|FORCE_FLAT/);
  assert.equal(h.starts.length,0);
});
test("timer scans only persisted RACE schedules",async()=>{
  const h=harness();
  await h.svc.reconcile();
  assert.match(h.queries.join("\n"),/canonical_mode_key\(bs\.settings\)='RACE'/);
});

test("daily risk lock permanently disarms RACE auto-resume",async()=>{
  const h=harness();
  await h.svc.reconcileOne({...row(),metrics:{
    accountScenovaPositions:0,accountScenovaPendingOrders:0,
    dailyLossLocked:true,executionStatus:"DAILY_LOSS_LOCK"
  }});
  assert.equal(h.starts.length,0);
  assert.match(h.queries.join("\\n"),/tradingScheduleArmed.*false/);
});
test("expired subscription veto disarms RACE while temporary problems retry",async()=>{
  const h=harness();
  h.svc.moduleRef={get:()=>({start:async()=>{throw Error("Trial หมดอายุแล้ว");}})};
  await h.svc.reconcileOne(row());
  assert.match(h.queries.join("\\n"),/tradingScheduleArmed.*false/);
  const temporary=harness();
  temporary.svc.moduleRef={get:()=>({start:async()=>{throw Error("EA ยังไม่พร้อม");}})};
  await temporary.svc.reconcileOne(row());
  assert.doesNotMatch(temporary.queries.join("\\n"),/tradingScheduleArmed.*false/);
});
