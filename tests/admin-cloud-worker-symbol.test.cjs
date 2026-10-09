const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
const src = fs.readFileSync("apps/api/src/bot.controller.ts","utf8");
const ast = ts.createSourceFile("bot.controller.ts",src,ts.ScriptTarget.Latest,true);
const klass = ast.statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text==="BotController");
assert.ok(klass,"BotController must be present");
const method = klass.members.find(m=>ts.isMethodDeclaration(m)&&m.name?.getText(ast)==="adminCloudMt5ConnectStatus");
assert.ok(method,"Admin Cloud MT5 status route must exist");
const snippet = method.getText(ast).replace(/^\s*@(Get|UseGuards)\([^\n]*\)\s*$/gm,"");
const compiled = ts.transpileModule(
  "class Probe {constructor(db){this.db=db;} async user(){return {status:'ACTIVE',role:'OWNER'};}"+
  snippet+"}\nmodule.exports=Probe;",
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText;
const moduleBox={exports:{}};
class ForbiddenException extends Error {}
class BadRequestException extends Error {}
class ConflictException extends Error {}
new Function("module","ForbiddenException","BadRequestException","ConflictException",compiled)(
  moduleBox,ForbiddenException,BadRequestException,ConflictException);
const Probe=moduleBox.exports;
const uuid1="11111111-1111-4111-8111-111111111111";
const uuid2="22222222-2222-4222-8222-222222222222";
async function read(mock) {
  let query="";
  const probe=new Probe({one:async(sql,args)=>{
    query=sql;
    assert.deepEqual(args,[uuid2,uuid1]);
    return {account_number:"12345678",broker_server:"Exness-MT5Trial6",
      worker_symbols:["XAUUSDm"],market_watch_symbols:null,
      runner_online:true,terminal_online:true,mt5_online:false,
      symbol_resolution_mode:"DISCOVERY",reload_status:null,
      reload_result_code:null,...mock};
  }});
  const response=await probe.adminCloudMt5ConnectStatus(
    {user:{sub:"33333333-3333-4333-8333-333333333333",role:"OWNER"}},
    uuid1,uuid2
  );
  assert.match(query,/discoveredXauSymbols/);
  assert.match(query,/last_seen_at > now\(\)-interval '30 seconds'/);
  assert.match(query,/execution_generation=bi\.execution_generation/);
  assert.match(query,/wc\.created_at >= bs\.updated_at/);
  return response;
}
test("worker-discovered XAU allows manual selection before EA heartbeat",async()=>{
  const data=await read();
  assert.deepEqual(data.symbols,["XAUUSDm"]);
  assert.equal(data.eaHeartbeat,false);
  assert.equal(data.symbolConfirmed,false);
});
test("cached EA market watch cannot advertise a stale Cloud Symbol",async()=>{
  const data=await read({worker_symbols:[],market_watch_symbols:["XAUUSDold"]});
  assert.deepEqual(data.symbols,[]);
});
test("invalid and duplicate worker Symbol names are filtered",async()=>{
  const data=await read({worker_symbols:["XAUUSDm","XAUUSDm","EURUSD","XAU<script>","XAUUSDc"]});
  assert.deepEqual(data.symbols,["XAUUSDm","XAUUSDc"]);
});
test("EA attach failure appears only for current failed reload",async()=>{
  assert.equal((await read({reload_status:"FAILED",reload_result_code:"EA_ATTACH_TIMEOUT"})).provisioningError,"EA_ATTACH_TIMEOUT");
  assert.equal((await read({reload_status:"ACKED",reload_result_code:"EA_ATTACH_TIMEOUT"})).provisioningError,"");
});
const healthyAfterFailedReload = {
  reload_status:"FAILED",
  reload_result_code:"EA_ATTACH_TIMEOUT",
  reload_acked_at:new Date("2026-10-09T01:32:14Z"),
  ea_last_seen_at:new Date("2026-10-09T01:36:59Z"),
  worker_last_seen_at:new Date("2026-10-09T01:36:59Z"),
  account_number:"414424308",
  runner_online:true,
  terminal_online:true,
  mt5_online:true,
  cloud_control_ready:true,
  broker_connected:true,
  symbol_resolution_mode:"EXACT",
  startup_symbol:"XAUUSDm",
  active_symbol:"XAUUSDm",
  actual_state:"STOPPED",
  desired_state:"STOPPED"
};
test("recovered Cloud EA no longer shows an old EA_ATTACH_TIMEOUT",async()=>{
  const status=await read(healthyAfterFailedReload);
  assert.equal(status.provisioningError,"");
  assert.equal(status.eaHeartbeat,true);
  assert.equal(status.cloudControlReady,true);
  assert.equal(status.actualState,"STOPPED");
  assert.equal(status.desiredState,"STOPPED");
});
test("EA_ATTACH_TIMEOUT remains visible when the EA is still offline",async()=>{
  const status=await read({...healthyAfterFailedReload,mt5_online:false});
  assert.equal(status.provisioningError,"EA_ATTACH_TIMEOUT");
});
test("EA_ATTACH_TIMEOUT remains visible when broker or Symbol is not ready",async()=>{
  assert.equal((await read({...healthyAfterFailedReload,broker_connected:false})).provisioningError,"EA_ATTACH_TIMEOUT");
  assert.equal((await read({...healthyAfterFailedReload,active_symbol:"XAUUSDz"})).provisioningError,"EA_ATTACH_TIMEOUT");
  assert.equal((await read({...healthyAfterFailedReload,cloud_control_ready:false})).provisioningError,"EA_ATTACH_TIMEOUT");
});
test("old telemetry cannot hide a later EA_ATTACH_TIMEOUT",async()=>{
  assert.equal((await read({...healthyAfterFailedReload,ea_last_seen_at:new Date("2026-10-09T01:32:05Z")})).provisioningError,"EA_ATTACH_TIMEOUT");
  assert.equal((await read({...healthyAfterFailedReload,worker_last_seen_at:new Date("2026-10-09T01:32:05Z")})).provisioningError,"EA_ATTACH_TIMEOUT");
});
test("unrelated current error is not suppressed by healthy Cloud telemetry",async()=>{
  assert.equal((await read({...healthyAfterFailedReload,reload_result_code:"RELOAD_REJECTED"})).provisioningError,"RELOAD_REJECTED");
});
test("Cloud Symbol selection requires deliberate admin click and no auto Start",()=>{
  const ui=fs.readFileSync("apps/web/components/AdminCloudMt5Connect.tsx","utf8");
  assert.match(ui,/setSelectedSymbol\(symbol\)/);
  assert.match(ui,/checked=\{symbolApproved\}/);
  assert.match(ui,/!symbolApproved/);
  assert.doesNotMatch(ui,/window\.confirm\(/);
  assert.match(ui,/adminApi\("\/admin\/slots\/select-symbol"/);
  assert.doesNotMatch(ui,/adminApi\("\/bot\/start"/);
});
