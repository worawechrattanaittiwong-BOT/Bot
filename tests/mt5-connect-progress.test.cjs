const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { test } = require("node:test");
const source = fs.readFileSync("apps/web/components/Mt5ConnectChecklist.tsx","utf8");
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2021}}).outputText;
const mod={exports:{}};
new Function("require","module","exports",code)(
  id=>id==="react/jsx-runtime" ? {jsx:()=>({}),jsxs:()=>({})}
    : id==="./ScenovaIcon" ? {ScenovaIcon:()=>null}
    : require(id),
  mod,mod.exports
);
const steps=mod.exports.getMt5ConnectSteps;
const base={acknowledged:false,isCloud:true,accountMatches:false,runnerOnline:false,terminalOnline:false,eaHeartbeat:false,cloudControlReady:false,brokerConnected:null,symbolsFound:0,symbolConfirmed:false,localSymbol:false,status:"RUNNING"};
test("only receiving data is active before server confirmation",()=>{
  assert.deepEqual(steps(base).map(x=>x.state),["active","waiting","waiting","waiting","waiting","waiting"]);
});
test("runner and terminal do not falsely imply Broker login",()=>{
  const s=steps({...base,acknowledged:true,accountMatches:true,runnerOnline:true,terminalOnline:true});
  assert.deepEqual(s.map(x=>x.state),["done","done","done","active","waiting","waiting"]);
});
test("broker XAU discovery waits for manual symbol confirmation",()=>{
  const s=steps({...base,acknowledged:true,accountMatches:true,runnerOnline:true,terminalOnline:true,symbolsFound:1});
  assert.deepEqual(s.map(x=>x.state),["done","done","done","done","active","waiting"]);
  assert.match(s[4].detail,/กรุณาเลือก/);
});
test("confirmed symbol must wait for EA readiness",()=>{
  const s=steps({...base,acknowledged:true,accountMatches:true,runnerOnline:true,terminalOnline:true,symbolsFound:1,symbolConfirmed:true});
  assert.equal(s[5].state,"active");
});
test("all steps complete only after verified EA and control",()=>{
  const s=steps({...base,acknowledged:true,accountMatches:true,runnerOnline:true,terminalOnline:true,symbolsFound:1,symbolConfirmed:true,eaHeartbeat:true,cloudControlReady:true});
  assert.ok(s.every(x=>x.state==="done"));
});
test("explicit provisioning failure still shows error",()=>{
  const s=steps({...base,acknowledged:true,status:"FAILED"});
  assert.equal(s[1].state,"failed");
});
test("API-verified success remains consistent while snapshot catches up",()=>{
  const s=steps({...base,status:"SUCCESS"});
  assert.ok(s.every(x=>x.state==="done"));
});
test("Local connection does not require Cloud VPS and Symbol selection",()=>{
  const s=steps({...base,isCloud:false,acknowledged:true,accountMatches:true,terminalOnline:true,eaHeartbeat:true,localSymbol:true});
  assert.ok(s.every(x=>x.state==="done"));
});
test("no browser-only hard timeout failure in MT5 connect path",()=>{
  const page=fs.readFileSync("apps/web/app/dashboard/page.tsx","utf8");
  assert.doesNotMatch(page,/operationAgeMs\s*>=\s*30_000\s*&&\s*terminalConnected\s*===\s*false/);
  assert.doesNotMatch(page,/operationAgeMs\s*>=\s*180_000\s*&&\s*Boolean\(op\.target\)/);
});
