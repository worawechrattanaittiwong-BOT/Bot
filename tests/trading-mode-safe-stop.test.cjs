const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const src=fs.readFileSync("apps/api/src/trading-mode-control.service.ts","utf8");
const compiled=ts.transpileModule(src,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  experimentalDecorators:true
}}).outputText;
class ConflictException extends Error {}
const mod={exports:{}};
const semver=(v,r)=>{
  const a=String(v||"").split(".").map(Number),b=String(r||"").split(".").map(Number);
  if(a.some(n=>!Number.isFinite(n)))return false;
  for(let i=0;i<3;i++){if((a[i]||0)>(b[i]||0))return true;if((a[i]||0)<(b[i]||0))return false;}
  return true;
};
new Function("module","exports","require",compiled)(mod,mod.exports,(name)=>{
  if(name==="@nestjs/common")return {Injectable:()=>target=>target,ConflictException};
  if(name==="./release-version")return {isVersionAtLeast:semver};
  throw Error("unexpected import "+name);
});
const {TradingModeControlService,canonicalTradingMode,TRADE_MODES}=mod.exports;
function harness({enabled=true,live=[{id:"i1",ea_version:"1.1.31"}],savedMode=null}={}){
  const calls=[];let flag=enabled;const affected=[{id:"i1"},{id:"i2"}];
  const query=async(sql,args=[])=>{
    calls.push({sql,args});
    if(sql.includes("FROM trading_mode_controls WHERE mode=$1 FOR UPDATE"))return {rows:[{mode:args[0],enabled:flag}]};
    if(sql.includes("SELECT canonical_mode_key(settings)"))return {rows:savedMode?[{mode:savedMode}]:[]};
    if(sql.includes("SELECT enabled FROM trading_mode_controls"))return {rows:[{enabled:flag}]};
    if(sql.includes("SELECT bi.id, bi.metrics->>'eaVersion'"))return {rows:live};
    if(sql.includes("UPDATE trading_mode_controls SET")){flag=args[1];return {rows:[]};}
    if(sql.includes("UPDATE bot_instances bi SET desired_state='SAFE_STOP'"))return {rows:affected};
    return {rows:[]};
  };
  const db={transaction:async fn=>fn({query}),one:async()=>({disabled:!flag}),query};
  return {service:new TradingModeControlService(db),calls,flag:()=>flag};
}
test("all six modes exist and legacy ASSISTED maps to MANUAL",()=>{
  assert.deepEqual(TRADE_MODES,["AUTO","RACE","COUNTER","FLIP_LOCK","ZERO_GRID","MANUAL"]);
  assert.equal(canonicalTradingMode({controlMode:"ASSISTED"}),"MANUAL");
  assert.equal(canonicalTradingMode({engineMode:"RACE"}),"RACE");
});
test("disable enqueues SAFE_STOP only, never CLOSE_ALL or STOP_INSTANCE",async()=>{
  const h=harness();
  const r=await h.service.setEnabled("RACE",false,"OWNER","พักเพื่อตรวจสอบ");
  assert.equal(r.affected,2);assert.equal(h.flag(),false);
  const sql=h.calls.map(x=>x.sql).join("\n");
  assert.match(sql,/desired_state='SAFE_STOP'/);
  assert.match(sql,/INSERT INTO bot_commands/);
  assert.doesNotMatch(sql,/CLOSE_ALL|STOP_INSTANCE/);
});
test("disabled mode refuses START even via direct service call",async()=>{
  const h=harness({enabled:false});
  await assert.rejects(h.service.requestStart("i1","RACE"),ConflictException);
  assert.equal(h.calls.some(x=>x.sql.includes("INSERT INTO bot_commands")),false);
});
test("enabled mode sends START within the lock transaction",async()=>{
  const h=harness();
  await h.service.requestStart("i1","RACE");
  assert.match(h.calls.map(x=>x.sql).join("\n"),/pg_advisory_xact_lock\(740096\)/);
  assert.match(h.calls.map(x=>x.sql).join("\n"),/INSERT INTO bot_commands\(bot_instance_id,command\) VALUES\(\$1,'START'\)/);
});
test("atomic START re-reads the latest persisted mode",async()=>{
  const h=harness({enabled:false,savedMode:"RACE"});
  await assert.rejects(h.service.requestStart("i1","AUTO"),ConflictException);
  const request=h.calls.find(x=>x.sql.includes("SELECT enabled FROM trading_mode_controls"));
  assert.deepEqual(request.args,["RACE"]);
});
test("re-enabling a mode never auto-starts customers",async()=>{
  const h=harness({enabled:false});
  await h.service.setEnabled("RACE",true,"OWNER","เปิดใช้");
  assert.equal(h.flag(),true);
  assert.doesNotMatch(h.calls.map(x=>x.sql).join("\n"),/VALUES\(\$1,'START'\)/);
});
test("ZERO GRID refuses administrative drain with older running EA",async()=>{
  const h=harness({live:[{id:"i1",ea_version:"1.1.30"}]});
  await assert.rejects(h.service.setEnabled("ZERO_GRID",false,"OWNER","พัก"),ConflictException);
  assert.equal(h.flag(),true);
});
test("ZERO GRID rejects pending cancellations when EA is offline",async()=>{
  const h=harness({live:[{id:"i1",ea_version:"1.1.31",pending_orders:2,
    last_seen_at:new Date(Date.now()-120000)}]});
  await assert.rejects(h.service.setEnabled("ZERO_GRID",false,"OWNER","พัก"),ConflictException);
  assert.equal(h.flag(),true);
});
test("ZERO GRID accepts verified 1.1.31 to cancel pending",async()=>{
  const h=harness();
  assert.equal((await h.service.setEnabled("ZERO_GRID",false,"OWNER","พัก")).affected,2);
});
test("source: heartbeat blocks stale RUNNING, preserves pending-safe flat check",()=>{
  const ea=fs.readFileSync("apps/api/src/ea.controller.ts","utf8");
  const mq5=fs.readFileSync("mt5/FastBasketBot.mq5","utf8");
  const bot=fs.readFileSync("apps/api/src/bot.controller.ts","utf8");
  assert.match(ea,/const modeDisabled = await this\.tradingModes\.disabled/);
  assert.match(ea,/Number\(metrics\.accountScenovaPendingOrders\) === 0/);
  assert.match(ea,/modeDisabled,\s*entrySuppressed/);
  assert.match(ea,/!modeDisabled\s*&&\s*heartbeatActualState/);
  assert.match(mq5,/JsonBool\(response,"modeDisabled",false\)/);
  assert.match(mq5,/g_safeStopDrainRequested = \(g_access && desired == "SAFE_STOP" && !ownerDisabledMode\)/);
  assert.match(bot,/tradingModes\.requestStart/);
});
test("schema defaults preserve all existing customer modes",()=>{
  const schema=fs.readFileSync("apps/api/src/cloud-schema.ts","utf8");
  assert.match(schema,/CREATE TABLE IF NOT EXISTS trading_mode_controls/);
  assert.match(schema,/SELECT m\.mode,true FROM unnest/);
  assert.match(schema,/ON CONFLICT\(mode\) DO NOTHING/);
  const admin=fs.readFileSync("apps/api/src/admin.controller.ts","utf8");
  assert.match(admin,/@Post\("trading-modes"\)/);
  assert.match(admin,/req\.user\?\.role/);
});
