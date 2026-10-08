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
const base={acknowledged:false,isCloud:true,accountMatches:false,runnerOnline:false,terminalOnline:false,eaHeartbeat:false,cloudControlReady:false,brokerConnected:null,symbolsFound:0,symbolConfirmed:false,activeSymbolMatches:false,localSymbol:false,status:"RUNNING"};
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
  const s=steps({...base,acknowledged:true,accountMatches:true,runnerOnline:true,terminalOnline:true,symbolsFound:1,symbolConfirmed:true,activeSymbolMatches:true,eaHeartbeat:true,cloudControlReady:true});
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

test("confirmed exact Symbol and live EA complete after discovery cache becomes empty",()=>{
  const input={...base,acknowledged:true,accountMatches:true,runnerOnline:true,terminalOnline:true,
    eaHeartbeat:true,cloudControlReady:true,brokerConnected:true,symbolsFound:0,
    symbolConfirmed:true,activeSymbolMatches:true};
  assert.equal(mod.exports.isCloudMt5ConnectionComplete(input),true);
  assert.ok(steps(input).every(x=>x.state==="done"));
});
test("a mismatched live EA Symbol must not complete the connection",()=>{
  const input={...base,acknowledged:true,accountMatches:true,runnerOnline:true,terminalOnline:true,
    eaHeartbeat:true,cloudControlReady:true,brokerConnected:true,
    symbolConfirmed:true,activeSymbolMatches:false};
  assert.equal(mod.exports.isCloudMt5ConnectionComplete(input),false);
  assert.equal(steps(input)[5].state,"active");
  assert.match(steps(input)[5].detail,/Symbol/);
});
test("a known Broker disconnection blocks completed state",()=>{
  const input={...base,acknowledged:true,accountMatches:true,runnerOnline:true,terminalOnline:true,
    eaHeartbeat:true,cloudControlReady:true,brokerConnected:false,
    symbolConfirmed:true,activeSymbolMatches:true};
  assert.equal(mod.exports.isCloudMt5ConnectionComplete(input),false);
  assert.equal(steps(input)[3].state,"active");
});
test("success logic must not reintroduce a discovery-array requirement",()=>{
  const dashboard=fs.readFileSync("apps/web/app/dashboard/page.tsx","utf8");
  assert.match(dashboard,/isCloudMt5ConnectionComplete\(/);
  assert.doesNotMatch(dashboard,/cloudDiscoveryReady\s*&&\s*cloudSymbolConfirmed/);
});
