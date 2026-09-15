$ErrorActionPreference='Stop'
function Read-Text([string]$p){ if(!(Test-Path $p)){throw "Missing $p"}; [IO.File]::ReadAllText((Resolve-Path $p)) }
function Require([string]$t,[string]$p,[string]$label){ if(-not [regex]::IsMatch($t,$p,[Text.RegularExpressions.RegexOptions]::Singleline)){throw "Phase 4 contract missing: $label"} }
function Reject([string]$t,[string]$p,[string]$label){ if([regex]::IsMatch($t,$p,[Text.RegularExpressions.RegexOptions]::Singleline)){throw "Phase 4 contract violated: $label"} }

$schema=Read-Text 'database/019_production_hardening.sql'
$startup=Read-Text 'apps/api/src/cloud-schema.ts'
$service=Read-Text 'apps/api/src/production-hardening.service.ts'
$workerApi=Read-Text 'apps/api/src/worker.controller.ts'
$worker=Read-Text 'apps/web/public/downloads/SCENOVA-CloudWorker.ps1'
$cloud=Read-Text 'apps/api/src/cloud.controller.ts'
$app=Read-Text 'apps/api/src/app.module.ts'
$page=Read-Text 'apps/web/app/admin/cloud-hardening/page.tsx'

Require $schema 'CREATE TABLE IF NOT EXISTS production_controls' 'global production controls'
Require $schema 'CREATE TABLE IF NOT EXISTS runtime_incidents' 'runtime incident ledger'
Require $schema 'cloud_recovery_attempts' 'per-instance recovery budget'
Require $startup 'capacity_blocked' 'startup capacity guard schema'
Require $startup 'runtime_incidents' 'startup incident schema'

Require $service 'RECOVERY_MAX_ATTEMPTS\s*=\s*3' 'bounded recovery attempts'
Require $service 'RECOVERY_WINDOW_MS\s*=\s*10 \* 60_000' 'ten-minute recovery window'
Require $service 'RECOVERY_COOLDOWN_MS\s*=\s*15 \* 60_000' 'recovery circuit cooldown'
Require $service 'STALE_GENERATION' 'generation-bound recovery authorization'
Require $service 'RUNTIME_STOP_ACTIVE' 'runtime stop blocks recovery'
Require $service 'MIGRATION_ACTIVE' 'migration blocks recovery'
Require $service 'NODE_QUARANTINED' 'quarantine blocks recovery'
Require $service 'GLOBAL_RECOVERY_PAUSED' 'global recovery pause'
Require $service 'capacity_blocked' 'capacity health blocks recovery'
Reject $service 'execution_generation\s*=\s*execution_generation\s*\+\s*1' 'recovery must not rotate generation'
Reject $service 'randomBytes' 'recovery must not mint a new execution token'

Require $workerApi '@Post\("recovery-check"\)' 'worker asks server before recovery'
Require $workerApi '@Post\("recovery-result"\)' 'worker reports recovery result'
Require $workerApi 'cloud_provisioning_paused' 'claim-next obeys global provisioning pause'
Require $workerApi 'node\.quarantined \|\| node\.capacity_blocked' 'claim-next obeys automatic guard'

Require $worker "version='1\.2\.0'" 'worker protocol version 1.2.0'
Require $worker 'diskFreeGb' 'disk free telemetry'
Require $worker "Invoke-Worker 'recovery-check'" 'worker recovery authorization call'
Require $worker 'Get-ExactTerminalProcesses \$terminal' 'exact-path duplicate check'
Require $worker "Report-RecoveryResult \$Job 'STARTED'" 'worker recovery success report'
Require $worker "Report-RecoveryResult \$Job 'FAILED'" 'worker recovery failure report'
Require $worker 'if \(\(Get-ExactTerminalProcesses \$terminal\)\.Count -eq 0\)' 'last duplicate check before spawn'

Require $cloud '!n\.capacity_blocked && !n\.quarantined' 'catalog excludes blocked nodes'
Require $cloud 'cloud_provisioning_paused' 'checkout obeys global provisioning pause'
Require $cloud 'NOT w\.capacity_blocked AND NOT w\.quarantined' 'allocator excludes blocked nodes'
Require $cloud 'node\.capacity_blocked \|\| node\.quarantined' 'owner cannot reopen blocked node'

Require $app 'ProductionHardeningController' 'hardening controller registered'
Require $app 'ProductionHardeningService' 'hardening service registered'
Require $page 'Pause Provisioning \+ Recovery' 'owner emergency pause UI'
Require $page 'Quarantine' 'owner quarantine UI'
Require $page 'Reset circuit' 'owner recovery circuit reset UI'

Write-Host 'SCENOVA Phase 4 production hardening contract PASS'
