$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$schema = Get-Content (Join-Path $root 'apps/api/src/cloud-schema.ts') -Raw
$controller = Get-Content (Join-Path $root 'apps/api/src/runtime-safety.controller.ts') -Raw
$service = Get-Content (Join-Path $root 'apps/api/src/runtime-safety.service.ts') -Raw
$workerApi = Get-Content (Join-Path $root 'apps/api/src/worker.controller.ts') -Raw
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
Assert-Contains $controller 'Cloud Worker v1.1.0 or newer is required for verified stop' 'Worker version gate missing'
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

# Windows Worker may terminate only the exact portable terminal belonging to this instance.
Assert-Contains $worker "version='1.1.0'" 'Worker telemetry version must be 1.1.0'
Assert-Contains $worker 'function Get-ExactTerminalProcesses' 'exact process matcher missing'
Assert-Contains $worker '$terminal = "$path\terminal64.exe"' 'instance terminal path guard missing'
Assert-Contains $worker '$_.ExecutablePath.Equals($TerminalPath, [StringComparison]::OrdinalIgnoreCase)' 'exact executable path comparison missing'
Assert-Contains $worker 'Stop-Process -Id $process.ProcessId -Force' 'exact PID stop missing'
Assert-Contains $worker "result = 'STOP_CONFIRMED'" 'verified stop result missing'
Assert-Contains $worker "errorCode = 'PROCESS_STILL_RUNNING'" 'failed stop verification missing'
Assert-NotContains $worker 'Stop-Process -Name terminal64' 'Worker must never kill every terminal64 process by name'
Assert-NotContains $worker 'taskkill /IM terminal64.exe' 'Worker must never taskkill every terminal64 process'

Write-Host 'Cloud runtime safety contract passed.'
