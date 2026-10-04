$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$schema = Get-Content (Join-Path $root 'apps/api/src/cloud-schema.ts') -Raw
$controller = Get-Content (Join-Path $root 'apps/api/src/runtime-safety.controller.ts') -Raw
$service = Get-Content (Join-Path $root 'apps/api/src/runtime-safety.service.ts') -Raw
$workerApi = Get-Content (Join-Path $root 'apps/api/src/worker.controller.ts') -Raw
$botApi = Get-Content (Join-Path $root 'apps/api/src/bot.controller.ts') -Raw
$cloudApi = Get-Content (Join-Path $root 'apps/api/src/cloud.controller.ts') -Raw
$cloudUpdate = Get-Content (Join-Path $root 'apps/api/src/cloud-update.service.ts') -Raw
$cloudUpdateController = Get-Content (Join-Path $root 'apps/api/src/cloud-update.controller.ts') -Raw
$cloudUpdateUi = Get-Content (Join-Path $root 'apps/web/components/CloudUpdatesPanel.tsx') -Raw
$addonMigration = Get-Content (Join-Path $root 'database/051_cloud_addon_pricing.sql') -Raw
$symbolReloadMigration = Get-Content (Join-Path $root 'database/041_cloud_symbol_reload.sql') -Raw
$runtimeRebuildMigration = Get-Content (Join-Path $root 'database/058_cloud_runtime_rebuild.sql') -Raw
$dashboard = Get-Content (Join-Path $root 'apps/web/app/dashboard/page.tsx') -Raw
$worker = Get-Content (Join-Path $root 'apps/web/public/downloads/SCENOVA-CloudWorker.ps1') -Raw
$workerLoop = Get-Content (Join-Path $root 'tools/windows-cloud-worker/Worker/WorkerLoop.cs') -Raw

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

# Cloud capacity must count only real connected usage or an active paid entitlement.
Assert-Contains $schema "co.status='PAID'" 'pending/review Cloud orders must not reserve VPS capacity'
Assert-Contains $schema "primary_access.primary_active IS TRUE" 'Cloud capacity must require an active primary entitlement'
Assert-Contains $schema "sub.expires_at>now()" 'expired Cloud slot entitlement must not reserve VPS capacity'
Assert-Contains $schema "gg.expires_at>now()" 'expired access-group entitlement must not reserve VPS capacity'
Assert-Contains $schema "u.role IN ('OWNER','ADMIN')" 'connected owner/admin Cloud runtime capacity rule missing'
Assert-Contains $schema "bi.last_seen_at>now()-interval '30 seconds'" 'owner/admin capacity must require a fresh connected runtime'
Assert-Contains $schema "NOT EXISTS (" 'paid reservation must not double-count an already assigned runtime'

# Reusing one MT5 identity across LOCAL/CLOUD must go through verified migration.
Assert-Contains $workerLoop 'private async Task RunTelemetryLoopAsync' 'Cloud Worker telemetry must run independently from liveness heartbeat'
Assert-Contains $workerLoop 'new { hostname = Environment.MachineName }' 'Cloud Worker liveness heartbeat must not depend on diagnostics payload'
Assert-Contains $workerLoop 'WORKER_LIVENESS_RETRY' 'Cloud Worker lightweight liveness retry path missing'
Assert-Contains $workerApi 'WHEN $5::int IS NULL THEN worker_nodes.active_instances' 'Liveness-only worker heartbeat must preserve active instance telemetry'

Assert-Contains $botApi 'WHERE bi.mt5_account_id=$1' 'cross-slot MT5 binding preflight missing'
Assert-Contains $botApi 'AND bi.slot_id<>$2' 'same MT5 identity must detect another bound slot'
Assert-Contains $botApi 'บัญชี MT5 นี้ยังเชื่อมกับ Local อยู่' 'Local-to-Cloud direct bind must return migration guidance instead of DB 500'

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
Assert-Contains $schema "'STOP_INSTANCE','RELOAD_INSTANCE','REBUILD_INSTANCE'" 'Cloud runtime rebuild command schema missing'
Assert-Contains $workerApi '"REBUILD_INSTANCE"' 'Worker API rebuild command support missing'
Assert-Contains $symbolReloadMigration "'STOP_INSTANCE','RELOAD_INSTANCE','REBUILD_INSTANCE'" 'replayed migration 041 must not reject later REBUILD_INSTANCE rows'
Assert-Contains $runtimeRebuildMigration "'STOP_INSTANCE','RELOAD_INSTANCE','REBUILD_INSTANCE'" 'runtime rebuild migration command check missing'
Assert-Contains $workerApi '"REBUILD_CONFIRMED"' 'Worker API rebuild acknowledgement missing'
Assert-Contains $workerApi "runtime_stop_state='STOP_CONFIRMED'" 'server STOP_CONFIRMED transition missing'
Assert-Contains $workerApi 'Automatic release is disabled' 'automatic runner release must remain disabled in Phase 2'
Assert-Contains $workerApi 'CLOUD_MEMBERSHIP_EXPIRED_RUNTIME_STOP' 'membership expiry hard-stop audit is missing'
Assert-Contains $workerApi "'STOP_INSTANCE','PENDING'" 'membership expiry must queue an exact STOP_INSTANCE'
Assert-Contains $workerApi "'membershipCutoff',true" 'membership cutoff telemetry marker is missing'

# A customer may replace the MT5 account of a stopped Cloud slot without admin intervention.
Assert-Contains $botApi 'CUSTOMER_CLOUD_ACCOUNT_SWITCH_STOP_REQUESTED' 'customer Cloud account switch stop flow missing'
Assert-Contains $botApi 'pendingCloudStop: true' 'customer account switch must wait for verified VPS stop'
Assert-Contains $botApi 'DELETE FROM mt5_credentials WHERE mt5_account_id=$1' 'old Cloud trading credential must be removed on account replacement'
Assert-Contains $botApi "runtime_stop_state=CASE WHEN `$3::varchar='CLOUD' THEN 'NONE'" 'new Cloud account must rearm the existing VPS runtime'
Assert-Contains $botApi 'an active subscription on VPS Slot #1 must never unlock an' 'per-slot Cloud entitlement isolation is missing'
Assert-Contains $dashboard 'ถ้าบอทหยุดและไม่มี Position / Pending Order ระบบจะปิด MT5 เดิมบน VPS แล้วให้เชื่อมบัญชีใหม่ได้ทันที' 'customer account-switch eligibility UX missing'
Assert-Contains $dashboard 'เปลี่ยนบัญชี MT5 ได้ทันที' 'customer stopped/flat account-switch action missing'
Assert-Contains $dashboard 'cloud-mt5-server-combobox' 'combined MT5 server dropdown/manual entry missing'
Assert-Contains $dashboard '<span>MT5 Server</span>' 'compact MT5 server label missing'
Assert-Contains $dashboard '<datalist id="cloud-mt5-server-options">' 'broker-specific MT5 server dropdown missing'
Assert-Contains $dashboard 'placeholder="MT5 Server"' 'MT5 server input must remain directly editable'
Assert-Contains $dashboard 'เข้ารหัส AES-256-GCM ก่อนจัดเก็บ และใช้เฉพาะเชื่อมต่อ MT5 บน VPS' 'credential security disclosure must remain visible'
Assert-NotContains $dashboard 'Trial6, Trial7, Trial14' 'tutorial-style server examples must stay removed'
Assert-NotContains $dashboard 'mt5ServerSearch' 'separate MT5 server search input must stay removed'
Assert-NotContains $dashboard 'customBrokerServer' 'separate custom MT5 server input must stay removed'
Assert-Contains $dashboard 'PRIMARY VPS PACKAGE · เหลือน้อยกว่า 3 วัน' 'primary-package three-day renewal warning missing'
Assert-Contains $dashboard 'การปิด MT5 ไม่ได้ปิด Position ที่ Broker ให้อัตโนมัติ' 'expiry warning must explain broker positions remain open'

# Slot #1 is the Cloud package gate; add-on pricing and expiry remain independent.
Assert-Contains $schema 'CREATE TABLE IF NOT EXISTS cloud_addon_packages' 'independent add-on pricing schema missing'
Assert-Contains $cloudApi "'membershipCutoffReason'" 'gateway renewal must clear Cloud membership cutoff markers'
Assert-Contains $cloudApi 'EXISTS (SELECT 1 FROM primary_access)' 'gateway renewal must rearm only when the primary package is active'
Assert-Contains $cloudApi 'addonFlow ? "ADDON" : "PACKAGE"' 'Cloud orders must persist package/add-on purchase type'
Assert-Contains $cloudApi 'cloud_addon_packages WHERE months=$1' 'add-on checkout must use add-on pricing'
Assert-Contains $cloudApi 'Slot #1 เป็นแพ็กเกจหลัก กรุณาต่ออายุจากหน้าแพ็กเกจ' 'primary renewal redirect guard missing'
Assert-Contains $botApi 'PRIMARY_SUBSCRIPTION_EXPIRED' 'Cloud entitlement must fail when the primary package expires'
Assert-Contains $workerApi "'PRIMARY_EXPIRED'" 'Worker must identify primary-package hard cutoff'
Assert-Contains $workerApi 'primary_access.primary_active IS DISTINCT FROM true' 'Worker must stop every Cloud runtime when primary is inactive'
Assert-Contains $dashboard 'ตั้งราคา Slot เสริม' 'Owner add-on pricing control missing'
Assert-Contains $dashboard 'ต่ออายุแพ็กเกจหลัก' 'primary package renewal CTA missing'
Assert-Contains $dashboard '/packages?system=cloud&renew=primary' 'primary renewal must route to packages page'

# Fleet EA update must be a real delta, never a repeat button for an already-current Server.
Assert-Contains $cloudUpdate 'fleetReleaseState(' 'Fleet update release-state classifier missing'
Assert-Contains $cloudUpdate 'status.updateAvailable = status.outdated > 0' 'Fleet update availability must require at least one outdated EA'
Assert-NotContains $cloudUpdate 'current_release_completed' 'Historical completed Fleet jobs must not mask a rollback or same-version Build change'
Assert-Contains $cloudUpdate 'this.fleetReleaseState(instance.metrics || {}, release) === "OUTDATED"' 'Fleet update queue must target only outdated EA instances'
Assert-Contains $cloudUpdate 'EA บน Server นี้เป็นเวอร์ชันล่าสุดแล้ว ไม่มีอัปเดตที่ต้องปล่อย' 'Fleet update no-op server guard missing'
Assert-Contains $cloudUpdate 'SUPERSEDED_BY_NEW_RELEASE' 'New Production EA must supersede stale WAITING_SAFE Fleet jobs'
Assert-Contains $cloudUpdate "state='CANCELLED'" 'Superseded Fleet parent/child jobs must be cancelled before creating the new release queue'
Assert-Contains $cloudUpdate 'Number(activeCounts?.delivered || 0)' 'Fleet supersede must refuse replacement once an old artifact is already in flight'
Assert-Contains $cloudUpdate 'er.build_id target_build_id' 'Fleet supersede must load queued Build ID'
Assert-Contains $cloudUpdate 'activeSha === productionSha' 'Fleet supersede must compare exact artifact SHA for same-version builds'
Assert-Contains $cloudUpdate 'activeBuildId === productionBuildId' 'Fleet supersede must compare Build ID when both sides provide it'
Assert-Contains $cloudUpdateUi 'const hasRealUpdate=Boolean(release&&status?.updateAvailable);' 'EA Update button must depend on a real release delta'
Assert-Contains $cloudUpdateUi 'releaseIdentityDiffers(activeJob,release)' 'Fleet UI must allow same-version Build/SHA supersede'
Assert-Contains $cloudUpdateUi 'target_sha256:string|null;' 'Fleet UI queued SHA identity missing'
Assert-Contains $cloudUpdateUi 'target_build_id:string|null;' 'Fleet UI queued Build ID identity missing'
Assert-Contains $cloudUpdateUi 'buildId:string|null;' 'Fleet UI Production Build ID identity missing'
Assert-Contains $cloudUpdateUi 'ปล่อย Build ล่าสุดแทนคิวเดิม' 'Fleet UI same-version latest-Build action missing'
Assert-Contains $cloudUpdateUi 'EA ล่าสุดแล้ว' 'Current EA state must replace the repeat update button'
Assert-Contains $cloudUpdateUi 'จึงไม่สร้างคิวซ้ำ' 'Unknown EA version must not create a duplicate update queue'
Assert-Contains $schema 'ALTER TABLE ea_releases ADD COLUMN IF NOT EXISTS artifact_bytes bytea' 'Fleet update release artifact snapshot schema missing'
Assert-Contains $cloudUpdate 'artifact_bytes=COALESCE(ea_releases.artifact_bytes,EXCLUDED.artifact_bytes)' 'Fleet update must pin the exact EA binary when a deferred job is created'
Assert-Contains $cloudUpdate 'Stored Fleet Update artifact hash mismatch' 'Pinned Fleet update artifact integrity guard missing'
Assert-Contains $cloudUpdate 'Fleet Update artifact snapshot unavailable' 'Legacy deferred update artifact fallback guard missing'
Assert-NotContains $cloudUpdate 'Production EA changed after this Fleet Update was created' 'Deferred Fleet jobs must not fail only because Production advanced to a newer EA release'
Assert-Contains $cloudUpdateController 'return new StreamableFile(bytes);' 'Fleet artifact endpoint must stream the pinned release bytes'
Assert-NotContains $cloudUpdateController 'createReadStream(path)' 'Fleet artifact endpoint must not reopen the mutable Production artifact path'

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
