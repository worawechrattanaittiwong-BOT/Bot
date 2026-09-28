$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$schema = Get-Content (Join-Path $root 'apps/api/src/cloud-schema.ts') -Raw
$controller = Get-Content (Join-Path $root 'apps/api/src/runtime-safety.controller.ts') -Raw
$service = Get-Content (Join-Path $root 'apps/api/src/runtime-safety.service.ts') -Raw
$workerApi = Get-Content (Join-Path $root 'apps/api/src/worker.controller.ts') -Raw
$botApi = Get-Content (Join-Path $root 'apps/api/src/bot.controller.ts') -Raw
$dashboard = Get-Content (Join-Path $root 'apps/web/app/dashboard/page.tsx') -Raw
$worker = Get-Content (Join-Path $root 'apps/web/public/downloads/SCENOVA-CloudWorker.ps1') -Raw

function Assert-Contains([string]$Text, [string]$Needle, [string]$Message) {
  if (-not $Text.Contains($Needle)) { throw $Message }
}
function Assert-NotContains([string]$Text, [string]$Needle, [string]$Message) {
  if ($Text.Contains($Needle)) { throw $Message }
}

# Additive generation/command schema must exist in both startup schema and canonical migration path.
Assert-Contains $schema 'execution_generation bigint NOT NULL DEFAULT 1' 'execution_generation schema missing'
Assert-Contains $schema 'CREATE TABLE IF NOT EXISTS worker_commands' 'worker_commands schema missing'
Assert-Contains $schema 'idx_worker_stop_one_active' 'active STOP_INSTANCE uniqueness guard missing'

# Server must fail closed before asking a Worker to stop a terminal.
Assert-Contains $controller 'Cloud Worker v1.1.0 or newer is required for verified stop' 'Worker verified-stop version gate missing'
Assert-Contains $controller 'EA heartbeat is not fresh' 'fresh EA heartbeat guard missing'
Assert-Contains $controller 'Stop the bot before stopping the Cloud terminal' 'RUNNING state guard missing'
Assert-Contains $controller 'Close all positions before stopping the Cloud terminal' 'open-position guard missing'
Assert-Contains $controller "runtime_stop_state='STOP_REQUESTED'" 'STOP_REQUESTED transition missing'

# Lease rotation must be generation-bound and revoke the previous cryptographic token.
Assert-Contains $service 'const nextGeneration = Number(instance.execution_generation || 1) + 1' 'generation increment missing'
Assert-Contains $service 'install_token_hash=$3' 'install token hash rotation missing'
Assert-Contains $service 'bot_instance_secrets' 'encrypted worker token rotation missing'
Assert-Contains $service "runtime_stop_state='LEASE_REVOKED'" 'LEASE_REVOKED terminal state missing'
Assert-Contains $service 'Worker STOP_CONFIRMED is required before rotating a bound Cloud runtime' 'stop confirmation gate missing'

# Worker commands and acknowledgements must carry the same generation.
Assert-Contains $workerApi 'wc.execution_generation=bi.execution_generation' 'worker command generation filter missing'
Assert-Contains $workerApi 'STALE_GENERATION' 'stale generation cancellation missing'
Assert-Contains $workerApi "runtime_stop_state='STOP_CONFIRMED'" 'server STOP_CONFIRMED transition missing'
Assert-Contains $workerApi 'Automatic release is disabled' 'automatic runner release must remain disabled in Phase 2'
Assert-Contains $workerApi 'CLOUD_MEMBERSHIP_EXPIRED_RUNTIME_STOP' 'membership expiry hard-stop audit is missing'
Assert-Contains $workerApi "'STOP_INSTANCE','PENDING'" 'membership expiry must queue an exact STOP_INSTANCE'
Assert-Contains $workerApi "'membershipCutoff',true" 'membership cutoff telemetry marker is missing'

# A customer may replace the MT5 account of a stopped Cloud slot without admin intervention.
Assert-Contains $botApi 'CUSTOMER_CLOUD_ACCOUNT_SWITCH_STOP_REQUESTED' 'customer Cloud account switch stop flow missing'
Assert-Contains $botApi 'pendingCloudStop: true' 'customer account switch must wait for verified VPS stop'
Assert-Contains $botApi 'DELETE FROM mt5_credentials WHERE mt5_account_id=$1' 'old Cloud trading credential must be removed on account replacement'
Assert-Contains $botApi "runtime_stop_state=CASE WHEN $3='CLOUD' THEN 'NONE'" 'new Cloud account must rearm the existing VPS runtime'
Assert-Contains $dashboard 'ปิด MT5 เดิมบน VPS แล้ว · พร้อมเชื่อมบัญชี MT5 ใหม่' 'customer account-switch completion UX missing'
Assert-Contains $dashboard 'VPS MEMBERSHIP · เหลือน้อยกว่า 3 วัน' 'three-day VPS renewal warning missing'
Assert-Contains $dashboard 'การปิด MT5 ไม่ได้ปิด Position ที่ Broker ให้อัตโนมัติ' 'expiry warning must explain broker positions remain open'

# Windows Worker may terminate only the exact portable terminal belonging to this instance.
# Phase 4 raises the control-plane Worker protocol to v1.2.0 while preserving
# the v1.1.0 verified STOP_INSTANCE/STOP_CONFIRMED safety invariant.
Assert-Contains $worker "version='1.2.0'" 'Worker telemetry version must be 1.2.0'
Assert-Contains $worker 'function Get-ExactTerminalProcesses' 'exact process matcher missing'
Assert-Contains $worker '$terminal = "$path\terminal64.exe"' 'instance terminal path guard missing'
Assert-Contains $worker '$_.ExecutablePath.Equals($TerminalPath, [StringComparison]::OrdinalIgnoreCase)' 'exact executable path comparison missing'
Assert-Contains $worker 'Stop-Process -Id $process.ProcessId -Force' 'exact PID stop missing'
Assert-Contains $worker "result = 'STOP_CONFIRMED'" 'verified stop result missing'
Assert-Contains $worker "errorCode = 'PROCESS_STILL_RUNNING'" 'failed stop verification missing'
Assert-NotContains $worker 'Stop-Process -Name terminal64' 'Worker must never kill every terminal64 process by name'
Assert-NotContains $worker 'taskkill /IM terminal64.exe' 'Worker must never taskkill every terminal64 process'

Write-Host 'Cloud runtime safety contract passed.'
