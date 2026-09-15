$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing Phase 3 source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Require([string]$text,[string]$pattern,[string]$label) {
  if (-not [regex]::IsMatch($text,$pattern,[System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    throw "Phase 3 contract missing: $label"
  }
}
function Reject([string]$text,[string]$pattern,[string]$label) {
  if ([regex]::IsMatch($text,$pattern,[System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    throw "Phase 3 contract violated: $label"
  }
}

$schema = Read-Text 'database/018_runtime_migration.sql'
$startup = Read-Text 'apps/api/src/cloud-schema.ts'
$service = Read-Text 'apps/api/src/runtime-migration.service.ts'
$controller = Read-Text 'apps/api/src/runtime-migration.controller.ts'
$agent = Read-Text 'tools/windows-installer/RuntimeMigrationAgent.cs'
$smart = Read-Text 'tools/windows-installer/SmartAgentRunner.cs'
$app = Read-Text 'apps/api/src/app.module.ts'
$page = Read-Text 'apps/web/app/runtime-migration/page.tsx'
$agentVersion = Read-Text 'tools/windows-installer/AgentBuildInfo.cs'

Require $schema 'CREATE TABLE IF NOT EXISTS runtime_migrations' 'runtime migration ledger'
Require $schema "state NOT IN \('COMPLETED','FAILED','CANCELLED'\)" 'one active migration guard'
Require $schema 'scenova_block_start_during_runtime_migration' 'database START guard'
Require $schema "NEW\.desired_state='RUNNING'" 'START transition is blocked during migration'
Require $startup 'CREATE TABLE IF NOT EXISTS runtime_migrations' 'production startup migration schema'
Require $startup 'trg_block_start_during_runtime_migration' 'production startup START guard'

Require $service 'LOCAL_MIGRATION_AGENT_MIN_VERSION\s*=\s*"1\.0\.9"' 'verified Local stop requires Agent 1.0.9+'
Require $service 'source\.desired_state === "RUNNING" \|\| source\.actual_state === "RUNNING"' 'source RUNNING rejection'
Require $service 'Number\(source\.positions \|\| 0\) > 0' 'open-position rejection'
Require $service 'runtime_stop_state.*STOP_REQUESTED' 'Cloud source verified stop request'
Require $service '\["STOP_CONFIRMED", "LEASE_REVOKED"\]' 'Cloud release requires verified stop state'
Require $service 'const nextGeneration = Number\(instance\.execution_generation \|\| 1\) \+ 1' 'execution generation increments at handoff'
Require $service 'randomBytes\(32\)\.toString\("hex"\)' 'new execution lease token at handoff'
Require $service 'slot_id=\$2,mode=''CLOUD''' 'same instance moves into Cloud target slot'
Require $service 'slot_id=\$2,mode=''LOCAL''' 'same instance moves into Local target slot'
Reject $service 'INSERT INTO bot_instances' 'migration must never create a second bot instance'
Require $service 'runner_id=NULL,lock_owner=NULL' 'Cloud runner ownership released only in Local handoff'
Require $service 'DELETE FROM mt5_credentials' 'Cloud credential removed when returning to Local'
Require $service "state='WAITING_LOCAL_INSTALL'" 'Cloud to Local waits for fresh Local enrollment'
Require $service "state='TARGET_PROVISIONING'" 'Local to Cloud waits for Worker provisioning'

Require $controller '@UseGuards\(JwtGuard\)' 'customer migration is JWT protected'
Require $controller '@Controller\("runtime-migration/agent"\)' 'separate Local Agent migration surface'
Require $controller 'executionGeneration' 'Local stop confirmation binds generation'
Require $app 'RuntimeMigrationController' 'migration controller registered'
Require $app 'RuntimeMigrationAgentController' 'migration Agent controller registered'
Require $app 'RuntimeMigrationService' 'migration service registered'

Require $agent 'Process\.GetProcessesByName\("terminal64"\)' 'Local Agent enumerates MT5 only'
Require $agent 'process\.MainModule\?\.FileName' 'Local Agent resolves executable path'
Require $agent 'Path\.GetFullPath\(path\)' 'Local Agent normalizes process executable path'
Require $agent 'normalizedTerminalExe' 'Local Agent compares against one exact terminal executable'
Require $agent 'StringComparison\.OrdinalIgnoreCase' 'Windows exact path comparison is case insensitive'
Require $agent 'process\.Kill\(entireProcessTree: true\)' 'fallback process-tree stop is scoped to matched process'
Require $agent 'FindExactProcesses\(normalized\)' 'Local stop verifies exact process disappearance'
Require $agent 'ScenovaRuntime\.RemoveProfile' 'stale Local profile removed after lease handoff'

Require $smart 'RuntimeMigrationAgent\.ProcessAsync' 'migration stop is polled by Smart Agent'
Require $smart 'Runtime migration stop handled; skipping normal MT5 actions' 'normal Agent actions are skipped after migration stop'
Require $smart 'RuntimeMigrationAgent\.ProcessAsync\(config, token, logPath\)\)\s*\{.*?return;' 'migration stop returns before manual MT5 restart flow'

Require $agentVersion 'Version\s*=\s*"1\.0\.9"' 'new Agent protocol version is explicit'
Require $page 'ZERO DUAL-RUNTIME' 'customer UI explains no dual runtime invariant'
Require $page 'confirmFlat' 'customer must confirm flat positions'
Require $page 'confirmSwitch' 'customer must confirm lease handoff'
Require $page 'WAITING_LOCAL_INSTALL' 'customer UI supports Cloud to Local install handoff'

Write-Host 'SCENOVA Phase 3 runtime migration safety contract PASS'
