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
$dashboard = Read-Text 'apps/web/app/dashboard/page.tsx'
$mt5Connect = Read-Text 'apps/web/components/Mt5ConnectionExperience.tsx'
$agentVersion = Read-Text 'tools/windows-installer/AgentBuildInfo.cs'

Require $schema 'CREATE TABLE IF NOT EXISTS runtime_migrations' 'runtime migration ledger'
Require $schema "state NOT IN \('COMPLETED','FAILED','CANCELLED'\)" 'one active migration guard'
Require $schema 'scenova_block_start_during_runtime_migration' 'database START guard'
Require $schema "NEW\.desired_state='RUNNING'" 'START transition is blocked during migration'
Require $startup 'CREATE TABLE IF NOT EXISTS runtime_migrations' 'production startup migration schema'
Require $startup 'trg_block_start_during_runtime_migration' 'production startup START guard'

Require $service 'source\.actual_state !== "STOPPED"' 'Local to Cloud requires STOPPED source state'
Require $service 'Number\(source\.positions \|\| 0\) > 0' 'open-position rejection'
Require $service 'Number\(source\.pending_orders \|\| 0\) > 0' 'pending-order rejection'
Require $service 'accountScenovaPendingOrders' 'migration reads pending-order telemetry'
Require $service '!this\.fresh\(source\.last_seen_at, 15_000\)' 'Local to Cloud requires fresh EA heartbeat'
Require $service 'source\.mode === "LOCAL" \? "SOURCE_STOP_CONFIRMED"' 'safe Local handoff bypasses Agent stop/version gate'
Reject $service 'versionAtLeast\(source\.agent_version, LOCAL_MIGRATION_AGENT_MIN_VERSION\)' 'Local Agent version must not block Local to Cloud'
Reject $service 'Local Agent must be online before moving to Cloud' 'Agent online state must not block fresh STOPPED/Flat handoff'
Reject $service 'Local Agent has not reported its MT5 terminal path' 'Local terminal path must not block fresh STOPPED/Flat handoff'
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
Require $service 'async ownerLocalToCloud' 'OWNER has a direct Local to VPS migration entrypoint'
Require $service "slot_type,status,label.*OWNER.*ACTIVE.*Owner VPS" 'OWNER migration creates a dedicated Cloud target slot when needed'
Require $service "w\.status='ONLINE'" 'OWNER migration selects an online VPS'
Require $service 'COALESCE\(w\.accepting_jobs,true\)=true' 'OWNER migration requires a VPS accepting jobs'
Require $service 'GREATEST\(COALESCE\(l\.occupied,0\),COALESCE\(w\.active_instances,0\)\) < w\.capacity' 'OWNER migration requires free VPS capacity'
Require $service 'manually granted/migrated Cloud membership can be valid without a' 'customer migration supports active Cloud entitlement without paid-order reservation'
Require $service 'SELECT pg_advisory_xact_lock\(740091\)' 'unreserved customer migration serializes Runner allocation'
Require $service 'ยังไม่มี SCENOVA VPS ที่พร้อมรับบัญชีนี้' 'customer migration reports no free VPS cleanly'

Require $controller '@UseGuards\(JwtGuard\)' 'customer migration is JWT protected'
Require $controller '@Post\("owner/local-to-cloud"\)' 'OWNER one-click Local to VPS endpoint'
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

$versionMatch = [regex]::Match($agentVersion, 'Version\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"')
if (-not $versionMatch.Success) {
  throw 'Phase 3 contract missing: current Agent protocol version is explicit'
}
if ([version]$versionMatch.Groups[1].Value -lt [version]'1.0.9') {
  throw 'Phase 3 contract violated: current Agent protocol must remain 1.0.9 or newer'
}
Require $page 'ZERO DUAL-RUNTIME' 'customer UI explains no dual runtime invariant'
Require $page 'confirmFlat' 'customer must confirm flat positions'
Require $page 'confirmSwitch' 'customer must confirm lease handoff'
Require $page 'pending_orders' 'migration UI shows pending-order state'
Require $page 'sourceHeartbeatFresh' 'migration UI requires fresh Local EA heartbeat'
Reject $page 'sourceAgentReady' 'migration UI must not block by Local Agent version'
Require $dashboard 'accountScenovaPendingOrders' 'dashboard VPS move blocks pending orders'
Require $dashboard 'รอ MT5 heartbeat ล่าสุดก่อนย้ายไป VPS' 'dashboard VPS move requires fresh heartbeat'
Require $page 'WAITING_LOCAL_INSTALL' 'customer UI supports Cloud to Local install handoff'

Require $dashboard 'ownerVpsDialogRef\.current\?\.close\(\)' 'VPS credential dialog closes immediately when migration starts'
Require $dashboard 'vpsMigrationProgress' 'VPS migration uses compact progress state'
Require $dashboard 'กำลังติดตั้งระบบ VPS' 'VPS migration shows installation progress'
Require $dashboard 'kind:"MIGRATION"' 'VPS migration must use the unified Server Terminal until verified completion'
Reject $dashboard 'owner-vps-move-panel' 'VPS move must not render as a separate dashboard card'
Require $dashboard 'vpsMove=\{\{' 'MT5 connection experience receives VPS migration controls'
Require $dashboard '/runtime-migration/owner/local-to-cloud' 'OWNER dashboard uses the protected migration endpoint'
Require $mt5Connect 'ย้ายไป VPS' 'MT5 connection panel exposes the VPS migration action'
Require $mt5Connect 'props\.vpsMove\.progress' 'MT5 connection panel renders migration progress inline'
Require $dashboard 'hasAccess:Boolean\(data\.account\) && \(isOwner \|\| customerHasCloudMigrationAccess\)' 'OWNER VPS move bypasses customer membership UX'
Require $dashboard 'status:"SUCCESS".*title:"เริ่มบอทสำเร็จ".*message:"บอททำงานสำเร็จ"' 'Start terminal completes immediately after the Server accepts Start'
Require $dashboard 'serverOperation\?\.kind === "START" \? 550 : 1200' 'Start success terminal auto-closes quickly'
Require $dashboard 'const operationTerminal = migrationOperation \|\| serverOperation \|\| cloudUpdateOperation' 'active MT5 migration is authoritative on the unified Server Terminal surface'
Require $dashboard 'SCENOVA CLOUD UPDATE' 'Cloud update is rendered inside the unified Server Terminal'
Require $dashboard 'MT5_CONNECT' 'new VPS MT5 connection is tracked in the unified Server Terminal'
Require $dashboard 'MT5_RECONNECT' 'VPS MT5 reconnect is tracked in the unified Server Terminal'
Require $dashboard 'MT5_SWITCH' 'VPS MT5 account switch is tracked in the unified Server Terminal'
Require $dashboard 'LOCAL_MT5_BIND' 'Local MT5 bind/rebind is tracked in the unified Server Terminal'
Require $dashboard 'moveVpsToLocal' 'dashboard exposes verified VPS to Local handoff'
Require $dashboard 'WAITING_LOCAL_INSTALL' 'VPS to Local terminal waits for fresh Local enrollment'
Require $dashboard 'ดาวน์โหลด SCENOVA Setup' 'VPS to Local terminal exposes the Local installer step'
Reject $dashboard 'cc-cloud-update-float' 'legacy separate Cloud Update floating card is removed'

Write-Host 'SCENOVA Phase 3 runtime migration safety contract PASS'