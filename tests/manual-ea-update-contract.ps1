$ErrorActionPreference = 'Stop'

$manual = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/manual-mt5.controller.ts'))
$updateGuard = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/manual-ea-update.interceptor.ts'))
$appModule = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/app.module.ts'))
$agent = [System.IO.File]::ReadAllText((Resolve-Path 'tools/windows-installer/AgentRunner.cs'))
$smart = [System.IO.File]::ReadAllText((Resolve-Path 'tools/windows-installer/SmartAgentRunner.cs'))

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
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/components/Mt5ManualActionControls.tsx'))
if (-not $web.Contains('updateIntentAt')) { throw 'Update button optimistic one-click lock missing' }
if (-not $web.Contains('คำสั่งกำลังทำงาน · ไม่ต้องกดซ้ำ')) { throw 'Update button pending guidance missing' }
Write-Host 'Manual EA update stop-first / one-click / one-restart contract PASS'
