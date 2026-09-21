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
if (-not $smart.Contains('Always poll the guarded UPDATE_EA_RESTART action when restart-safe.')) { throw 'Explicit Update action must be checked independently from staging marker' }
if ($smart.Contains('if (reloadPending && heartbeat.SafeToRestart)')) { throw 'Pending reload marker must not gate the explicit Update restart action' }
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/components/Mt5ManualActionControls.tsx'))
if (-not $web.Contains('updateIntentAt')) { throw 'Update button optimistic one-click lock missing' }
if (-not $web.Contains('คำสั่งกำลังทำงาน · ไม่ต้องกดซ้ำ')) { throw 'Update button pending guidance missing' }
if (-not $web.Contains('window.location.reload();')) { throw 'Completed EA update must refresh the dashboard automatically' }
if (-not $web.Contains('UI_PENDING_TIMEOUT_MS - elapsed')) { throw 'Update refresh intent must stay alive for the full pending timeout window' }
if ($web.Contains('20_000 - elapsed')) { throw 'Update refresh intent must not expire after only 20 seconds' }
if (-not $web.Contains('อัปเดต EA สำเร็จแล้ว · กำลังรีเฟรชสถานะล่าสุด')) { throw 'Completed EA update refresh feedback missing' }
if (-not $web.Contains('ระบบจะรีโหลด MT5 1 รอบและรีเฟรชหน้านี้อัตโนมัติเมื่อสำเร็จ')) { throw 'Manual update one-click refresh guidance missing' }
Write-Host 'Manual EA update stop-first / one-click / one-restart contract PASS'
