const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const read=p=>fs.readFileSync(p,"utf8");

test("Vantage migration only creates its own broker and real account server",()=>{
  const sql=read("database/072_vantage_broker_catalog.sql");
  assert.match(sql,/VALUES \('VANTAGE','Vantage',true,60\)/);
  assert.match(sql,/VantageMarkets-Live 15/);
  assert.match(sql,/ON CONFLICT \(code\) DO NOTHING/);
  assert.match(sql,/ON CONFLICT \(broker_id,server_name\) DO NOTHING/);
  assert.doesNotMatch(sql,/UPDATE\s+(brokers|broker_servers|bot_settings)/i);
  assert.doesNotMatch(sql,/('EXNESS'|'INTERSTELLAR')/);
  assert.match(read("scripts/deploy-hostinger.sh"),/database\/072_vantage_broker_catalog\.sql/);
});

test("existing Exness installer and unknown broker behavior remain",()=>{
  const platform=read("tools/windows-cloud-worker/Worker/BrokerPlatformManager.cs");
  assert.match(platform,/private const string ExnessCode = "EXNESS"/);
  assert.match(platform,/exness\.technologies\.ltd\/mt5\/exness5setup\.exe/);
  assert.match(platform,/server\.StartsWith\("Exness-"/);
  assert.match(platform,/return "";/);
  assert.match(platform,/required == ExnessCode\s*\? await GetInstallerAsync\(required, ExnessInstaller, cancellationToken\)/);
});

test("Vantage Cloud opt-in requires a checksum-pinned installer before stopping any instance",()=>{
  const platform=read("tools/windows-cloud-worker/Worker/BrokerPlatformManager.cs");
  const runtime=read("tools/windows-cloud-worker/Worker/Mt5Runtime.cs");
  assert.match(platform,/SCENOVA_VANTAGE_CLOUD_ENABLED/);
  assert.match(platform,/SCENOVA_VANTAGE_MT5_INSTALLER_URL/);
  assert.match(platform,/SCENOVA_VANTAGE_MT5_SHA256/);
  assert.match(platform,/VANTAGE_INSTALLER_SHA256_MISMATCH/);
  assert.match(platform,/expectedSha256 is null \|\| MatchesSha256\(target, expectedSha256\)/);
  const start=runtime.indexOf("private async Task<bool> EnsureBrokerPlatformAsync");
  const body=runtime.slice(start,runtime.indexOf("private static string NormalizeRuntimeError",start));
  assert.ok(body.indexOf("CanInstallWithoutDisrupting(job, instancePath)")<body.indexOf("StopInstance(job.InstanceId)"));
  assert.match(body,/VANTAGE_INSTALLER_NOT_VERIFIED/);
  assert.match(body,/if \(!_brokerPlatforms.NeedsInstall\(job, instancePath\)\)/);
});

test("Vantage-only fix accepts confirmed per-instance terminal or SHA-pinned local installer",()=>{
  const platform=read("tools/windows-cloud-worker/Worker/BrokerPlatformManager.cs");
  const selftest=read("tools/windows-cloud-worker/Worker/ProvisioningSelfTest.cs");
  const dashboard=read("apps/web/app/dashboard/page.tsx");
  assert.match(platform,/InstalledPlatform\(instancePath\), VantageCode/);
  assert.match(platform,/File\.Exists\(Path\.Combine\(instancePath, "terminal64\.exe"\)\)/);
  assert.match(platform,/VantageCachedInstaller/);
  assert.match(platform,/MatchesSha256\(VantageCachedInstaller, hash\)/);
  assert.match(platform,/GetVerifiedVantageInstallerAsync/);
  assert.match(platform,/required == ExnessCode\s*\? await GetInstallerAsync\(required, ExnessInstaller, cancellationToken\)/);
  assert.match(selftest,/pre-installed Vantage terminal was incorrectly blocked/);
  assert.match(selftest,/Vantage marker without terminal bypassed the safety gate/);
  assert.match(dashboard,/code\.includes\("VANTAGE_INSTALLER_NOT_VERIFIED"\)/);
});

test("Vantage server reader preserves spaces and excludes Exness without modifying its reader",()=>{
  const directory=read("tools/windows-cloud-worker/Worker/BrokerServerDirectory.cs");
  assert.match(directory,/VantageMarkets\(\?:MU\)\?-/);
  assert.match(directory,/\(\?: \[0-9\]\{1,3\}\)\?/);
  assert.match(directory,/brokerCode, "EXNESS"/);
  const selftest=read("tools/windows-cloud-worker/Worker/ProvisioningSelfTest.cs");
  assert.match(selftest,/VantageMarkets-Live 15/);
  assert.match(selftest,/Vantage Cloud must wait for broker-native symbol selection/);
  assert.match(selftest,/Exness MT5 Real server was not read/);
});

const officialVantageServers = [
  "VantageMarkets-Live",
  "VantageMarkets-Live 3",
  "VantageMarkets-Live 4",
  "VantageMarkets-Live 5",
  "VantageMarkets-Live 6",
  "VantageMarkets-Live 7",
  "VantageMarkets-Live 8",
  "VantageMarkets-Live 10",
  "VantageMarkets-Live 11",
  "VantageMarkets-Live 13",
  "VantageMarkets-Live 14",
  "VantageMarkets-Live 15",
  "VantageMarkets-Live 19",
  "VantageMarkets-Live 21",
  "VantageMarketsMU-Live",
  "VantageMarkets-Demo",
  "VantageMarketsMU-Demo"
];

test("seed includes all and only 17 currently published Vantage MT5 WebTrader servers",()=>{
  const sql=read("database/072_vantage_broker_catalog.sql");
  const entries=[...sql.matchAll(/\('(VantageMarkets(?:MU)?-(?:Live|Demo)(?: \d{1,3})?)','(REAL|DEMO)',\d+\)/g)];
  assert.equal(entries.length,17);
  assert.deepEqual(entries.map(m=>m[1]),officialVantageServers);
  assert.equal(new Set(entries.map(m=>m[1].toLowerCase())).size,17);
  for(const [,name,environment] of entries) {
    assert.equal(environment, name.includes("Demo")?"DEMO":"REAL");
  }
  assert.match(sql,/https:\/\/webtrader\.vantagemarkets\.com\/\?page_id=2/);
});

function catalogProbe(registered,discovered) {
  const ts=require("typescript");
  const source=read("apps/api/src/catalog.controller.ts");
  const js=ts.transpileModule(source,{
    compilerOptions:{
      target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true
    }
  }).outputText;
  const module={exports:{}};
  new Function("require","module","exports",js)(
    name=>{
      if(name==="@nestjs/common")return {
        Controller:()=>ctor=>ctor,Get:()=>(_target,_key,_descriptor)=>{}
      };
      throw new Error("Unexpected runtime import: "+name);
    },
    module,module.exports
  );
  const db={query:async sql=>({
    rows:sql.includes("FROM worker_nodes")?discovered:registered
  })};
  return new module.exports.CatalogController(db);
}

test("Vantage catalog keeps all verified servers even when Worker knows only a subset",async()=>{
  const registered=[{
    code:"VANTAGE",name:"Vantage",
    servers:officialVantageServers.map(name=>({
      serverName:name,environment:name.includes("Demo")?"DEMO":"REAL"
    }))
  }];
  const discovered=[
    {broker_code:"VANTAGE",server_name:"VantageMarkets-Live 15",environment:"REAL"},
    {broker_code:"VANTAGE",server_name:"VantageMarkets-Live 22",environment:"REAL"}
  ];
  const result=await catalogProbe(registered,discovered).brokers();
  assert.equal(result.length,1);
  assert.equal(result[0].servers.length,18);
  assert.deepEqual(officialVantageServers.every(name=>result[0].servers.some(s=>s.serverName===name)),true);
  assert.equal(result[0].servers.filter(s=>s.serverName==="VantageMarkets-Live 15").length,1);
  assert.equal(result[0].serverSource,"VERIFIED_CATALOG_AND_BROKER_MT5_DIRECTORY");
  assert.equal(result[0].servers.at(-1).environment,"DEMO");
});

test("Exness catalog retains previous Worker-first behavior",async()=>{
  const result=await catalogProbe([{
    code:"EXNESS",name:"Exness",servers:[{serverName:"Exness-MT5Trial6",environment:"DEMO"}]
  }],[
    {broker_code:"EXNESS",server_name:"Exness-MT5Real25",environment:"REAL"}
  ]).brokers();
  assert.deepEqual(result[0].servers,[{serverName:"Exness-MT5Real25",environment:"REAL"}]);
  assert.equal(result[0].serverSource,"BROKER_MT5_DIRECTORY");
});
