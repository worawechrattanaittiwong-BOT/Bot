import assert from "node:assert/strict";
import {test} from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = p => fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const compiled = ts.transpileModule(read("apps/web/components/SymbolSwitchProgress.tsx"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
}).outputText;
const exports = {};
vm.runInNewContext(compiled,{
  exports,
  require:()=>({ScenovaIcon:()=>null,jsx:()=>null,jsxs:()=>null})
},{filename:"SymbolSwitchProgress.js"});
const {getSymbolSwitchProgress}=exports;
const at = "2026-10-10T12:00:00.000Z";
const caseBase = {
  target:"BTCUSDm",
  requestedAt:at,
  serverRequestedAt:at,
  acknowledged:true,
  isCloud:true,
  runnerOnline:true,
  commandStatus:"QUEUED",
  mt5Online:true,
  brokerConnected:true,
  activeSymbol:"XAUUSDm",
  heartbeatAt:"2026-10-10T12:00:01.000Z"
};

test("Does not report success merely because API accepted a Symbol switch",()=>{
  const r=getSymbolSwitchProgress(caseBase);
  assert.equal(r.complete,false);
  assert.equal(r.failed,false);
  assert.equal(r.steps[0].state,"done");
  assert.equal(r.steps[1].state,"active");
  assert.notEqual(r.steps.at(-1).state,"done");
});

test("Old reload acknowledgement cannot confirm new Symbol operation",()=>{
  const r=getSymbolSwitchProgress({...caseBase,serverRequestedAt:"2026-10-10T11:59:00Z",commandStatus:"RELOADED",activeSymbol:"BTCUSDm"});
  assert.equal(r.complete,false);
  assert.equal(r.steps[0].state,"active");
});

test("Worker ACK with stale EA heartbeat is only partial progress",()=>{
  const r=getSymbolSwitchProgress({...caseBase,commandStatus:"RELOADED",activeSymbol:"BTCUSDm",heartbeatAt:"2026-10-10T11:59:59.000Z"});
  assert.equal(r.complete,false);
  assert.equal(r.steps[0].state,"done");
  assert.equal(r.steps[2].state,"done");
  assert.equal(r.steps[3].state,"active");
});

test("Only a fresh matching EA heartbeat completes XAU to BTC change",()=>{
  const r=getSymbolSwitchProgress({...caseBase,commandStatus:"RELOADED",activeSymbol:"BTCUSDm"});
  assert.equal(r.complete,true);
  assert.equal(r.failed,false);
  assert(r.steps.every(x=>x.state==="done"));
  assert.match(r.message,/BTCUSDm/);
});

test("Worker failure never means connection failure or success",()=>{
  const r=getSymbolSwitchProgress({...caseBase,commandStatus:"FAILED",error:"RELOAD_FAILED"});
  assert.equal(r.failed,true);
  assert.equal(r.complete,false);
  assert(r.steps.some(x=>x.state==="failed"));
});

test("Offline MT5 and broker rejection cannot report success",()=>{
  for (const patch of [{mt5Online:false},{brokerConnected:false},{activeSymbol:"XAUUSDm"}]){
    const r=getSymbolSwitchProgress({...caseBase,...patch,commandStatus:"RELOADED"});
    assert.equal(r.complete,false);
  }
});

test("Initial account connection wizard and EA trading logic are unchanged",()=>{
  const controller=read("apps/api/src/trading-symbol.controller.ts");
  const dashboard=read("apps/web/app/dashboard/page.tsx");
  const admin=read("apps/web/app/admin/page.tsx");
  const backendAdmin=read("apps/api/src/admin.controller.ts");
  assert.match(controller,/!alreadyConnected && !requestedSymbol.toUpperCase\(\).startsWith\("XAU"\)/);
  assert.match(dashboard,/if \(op.kind === "SYMBOL_CHANGE"\)/);
  assert.match(dashboard,/isSymbolSwitchOperation && \(\s*<SymbolSwitchChecklist/);
  assert.match(dashboard,/<Mt5ConnectChecklist/);
  assert.match(admin,/<SymbolSwitchChecklist/);
  assert.match(backendAdmin,/'symbol_change_requested_at',bi3.metrics->>'symbolChangeRequestedAt'/);
  assert.match(backendAdmin,/symbolChangeRequestedAt: requestedAt/);
});
