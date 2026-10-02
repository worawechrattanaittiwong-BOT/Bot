$ErrorActionPreference = 'Stop'

$manual = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/manual-mt5.controller.ts'))
$updateGuard = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/manual-ea-update.interceptor.ts'))
$appModule = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/app.module.ts'))
$agent = [System.IO.File]::ReadAllText((Resolve-Path 'tools/windows-installer/AgentRunner.cs'))
$smart = [System.IO.File]::ReadAllText((Resolve-Path 'tools/windows-installer/SmartAgentRunner.cs'))
$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
$release = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/release-version.ts'))
$eaController = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/ea.controller.ts'))
$botController = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/bot.controller.ts'))
$buildWorkflow = [System.IO.File]::ReadAllText((Resolve-Path '.github/workflows/build-mt5-ea.yml'))

foreach ($required in @(
  "SET desired_state='SAFE_STOP'",
  "INSERT INTO bot_commands(bot_instance_id,command) VALUES(`$1,'SAFE_STOP')",
  "manualMt5ActionName",
  "manualMt5ActionSource','USER'",
  'deduplicated: true',
  'existingActionStatus === "PENDING"',
  'existingActionId'
)) {
  if (-not $manual.Contains($required)) { throw "Manual update contract missing: $required" }
}

foreach ($required in @(
  'UPDATE_EA_RESTART',
  'desiredState === "RUNNING"',
  'actualState === "RUNNING"',
  'กรุณาหยุดบอทก่อนอัปเดต EA'
)) {
  if (-not $updateGuard.Contains($required)) { throw "Stop-first EA update guard missing: $required" }
}
if (-not $appModule.Contains('useClass: ManualEaUpdateStopInterceptor')) { throw 'Stop-first EA update guard is not registered' }
if (-not $agent.Contains('forceReload=true  => UPDATE_EA_RESTART only')) { throw 'Agent one-click update authorization contract missing' }
if (-not $agent.Contains('WriteStamp(stampPath, actionId);')) { throw 'Agent one-restart stamp missing' }
if (-not $smart.Contains('Waiting for explicit update button restart')) { throw 'Background update must remain restart-free' }
if (-not $smart.Contains('PendingReloadPath(config)')) { throw 'Pending reload marker missing' }
if (-not $smart.Contains('Always poll the guarded UPDATE_EA_RESTART action when restart-safe.')) { throw 'Explicit Update action must be checked independently from staging marker' }
if ($smart.Contains('if (reloadPending && heartbeat.SafeToRestart)')) { throw 'Pending reload marker must not gate the explicit Update restart action' }
foreach ($required in @(
  'DesiredEaVersion',
  'DesiredEaHash',
  'RuntimeReloadRequired(heartbeat)',
  'RuntimeVerified(heartbeat)',
  'LastEaVerifiedAt'
)) {
  if (-not $smart.Contains($required)) { throw "Verified EA lifecycle state missing: $required" }
}
if ($smart.Contains('config.EaVersion = heartbeat.EaVersionRequired')) { throw 'Server desired EA version must not overwrite installed version before verification' }
if ($smart.Contains('config.EaHash = heartbeat.ArtifactHash')) { throw 'Server desired EA hash must not overwrite observed local hash before verification' }
if (-not $agent.Contains('runtimeContractReady')) { throw 'Manual update ACK must verify Runtime Contract' }
if (-not $agent.Contains('snapshot.RuntimeContractMatch == false')) { throw 'Manual update must surface Runtime Contract verification failure' }

foreach ($required in @(
  '#define SCENOVA_BUILD_ID',
  '\"buildId\":\"%s\"',
  'SCENOVA_BUILD_ID'
)) {
  if (-not $ea.Contains($required)) { throw "Same-version runtime build identity missing from EA: $required" }
}
foreach ($required in @(
  'manifest.buildId || manifest.sourceCommit',
  'buildId,'
)) {
  if (-not $release.Contains($required)) { throw "Release build identity missing: $required" }
}
foreach ($required in @(
  "metrics->>'buildId' AS runtime_build_id",
  'runtimeBuildIdRequired',
  'runtimeBuildMatch',
  'runtimeIdentityMatch',
  'runtimeContractMatch: runtimeIdentityMatch'
)) {
  if (-not $eaController.Contains($required)) { throw "EA same-version runtime gate missing: $required" }
}
foreach ($required in @(
  'currentRuntimeBuildId',
  'requiredRuntimeBuildId',
  'runtimeBuildMatch',
  '!runtimeBuildMatch'
)) {
  if (-not $botController.Contains($required)) { throw "Dashboard same-version build verification missing: $required" }
}
foreach ($required in @(
  'Stamp immutable runtime build identity',
  'SCENOVA_BUILD_ID',
  'EA_BUILD_ID=$buildId',
  'buildId = $env:EA_BUILD_ID'
)) {
  if (-not $buildWorkflow.Contains($required)) { throw "EA build stamping contract missing: $required" }
}
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/components/Mt5ManualActionControls.tsx'))
if (-not $web.Contains('updateIntentAt')) { throw 'Update button optimistic one-click lock missing' }
if (-not $web.Contains('คำสั่งกำลังทำงาน · ไม่ต้องกดซ้ำ')) { throw 'Update button pending guidance missing' }
if (-not $web.Contains('window.location.reload();')) { throw 'Completed EA update must refresh the dashboard automatically' }
if (-not $web.Contains('UI_PENDING_TIMEOUT_MS - elapsed')) { throw 'Update refresh intent must stay alive for the full pending timeout window' }
if ($web.Contains('20_000 - elapsed')) { throw 'Update refresh intent must not expire after only 20 seconds' }
if (-not $web.Contains('อัปเดต EA สำเร็จแล้ว · กำลังรีเฟรชสถานะล่าสุด')) { throw 'Completed EA update refresh feedback missing' }
if (-not $web.Contains('ระบบจะรีโหลด MT5 1 รอบและรีเฟรชหน้านี้อัตโนมัติเมื่อสำเร็จ')) { throw 'Manual update one-click refresh guidance missing' }
if (-not $web.Contains('installerUpdateAvailable')) { throw 'Compatible Agent patch update notice missing' }
Write-Host 'Manual EA update stop-first / one-click / one-restart contract PASS'
