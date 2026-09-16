$ErrorActionPreference = 'Stop'

$manual = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/manual-mt5.controller.ts'))
$agent = [System.IO.File]::ReadAllText((Resolve-Path 'tools/windows-installer/AgentRunner.cs'))
$smart = [System.IO.File]::ReadAllText((Resolve-Path 'tools/windows-installer/SmartAgentRunner.cs'))
$dashboard = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))
$controls = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/components/Mt5ManualActionControls.tsx'))
$release = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/release-version.ts'))

foreach ($required in @(
  "SET desired_state='SAFE_STOP'",
  "INSERT INTO bot_commands(bot_instance_id,command) VALUES(`$1,'SAFE_STOP')",
  "manualMt5ActionName",
  "manualMt5ActionSource','USER'"
)) {
  if (-not $manual.Contains($required)) { throw "Manual update contract missing: $required" }
}

# Update availability must be independent from open positions. The dashboard may
# show the available release immediately, while only the action itself is gated.
if (-not $dashboard.Contains('Boolean(softwareUpdate.required);')) {
  throw 'Dashboard update notice must remain driven by release availability'
}
if (-not $dashboard.Contains('softwareUpdateRequired && (')) {
  throw 'Dashboard update notice rendering contract missing'
}
if (-not $controls.Contains('const needsEaUpdate = Boolean(update?.eaUpdateRequired || update?.eaVersionMatch === false);')) {
  throw 'EA update availability must not depend on position count'
}
if (-not $controls.Contains('positions > 0 || (!agentOnline && !installerRequired)')) {
  throw 'EA update button must remain disabled while positions are open'
}
if (-not $manual.Contains('if (positions > 0)')) {
  throw 'Server-side EA restart position guard missing'
}

# A stale production environment override must never pin the promoted EA runtime
# backwards and hide a small EA hotfix from the dashboard.
if (-not $release.Contains('isVersionAtLeast(configuredEaVersion, promotedEaVersion)')) {
  throw 'EA release anti-downgrade guard missing'
}

if (-not $agent.Contains('forceReload=true  => UPDATE_EA_RESTART only')) { throw 'Agent one-click update authorization contract missing' }
if (-not $agent.Contains('WriteStamp(stampPath, actionId);')) { throw 'Agent one-restart stamp missing' }
if (-not $smart.Contains('Waiting for explicit update button restart')) { throw 'Background update must remain restart-free' }
if (-not $smart.Contains('PendingReloadPath(config)')) { throw 'Pending reload marker missing' }
Write-Host 'Manual EA update notice-visible / position-safe / one-restart contract PASS'
