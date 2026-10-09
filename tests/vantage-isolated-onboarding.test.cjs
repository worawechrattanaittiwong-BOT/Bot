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
  assert.ok(body.indexOf("CanInstallWithoutDisrupting(job)")<body.indexOf("StopInstance(job.InstanceId)"));
  assert.match(body,/VANTAGE_INSTALLER_NOT_VERIFIED/);
  assert.match(body,/if \(!_brokerPlatforms.NeedsInstall\(job, instancePath\)\)/);
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
