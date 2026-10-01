$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}

$api = Read-Text 'apps/api/src/fleet-monitor.controller.ts'
$module = Read-Text 'apps/api/src/app.module.ts'
$web = Read-Text 'apps/web/app/fleet-monitor/page.tsx'
$css = Read-Text 'apps/web/app/fleet-monitor/fleet-monitor.module.css'
$sidebar = Read-Text 'apps/web/components/OwnerSidebar.tsx'

foreach ($required in @(
  '@Controller("fleet-monitor")',
  '@UseGuards(JwtGuard)',
  '@Get()',
  'OWN_ASSIGNED_SLOTS',
  'ALL_SLOTS',
  'AND ls.assigned_user_id=$1',
  'AND a.user_id=$1',
  'own_account.user_id=$1',
  'trade_journal',
  'bot_instances.metrics / EA heartbeat',
  'NOT_REPORTED_BY_CURRENT_EA'
)) {
  if (-not $api.Contains($required)) {
    throw "Fleet monitor API contract missing: $required"
  }
}

foreach ($forbidden in @('@Post(', '@Put(', '@Delete(', 'INSERT INTO', 'UPDATE ', 'DELETE FROM')) {
  if ($api.Contains($forbidden)) {
    throw "Fleet monitor API must remain read-only: $forbidden"
  }
}

if (-not $module.Contains('FleetMonitorController')) {
  throw 'Fleet monitor controller must be registered in AppModule'
}

foreach ($required in @(
  'api("/fleet-monitor")',
  'Trading Fleet Monitor',
  'MY SLOTS ONLY',
  'ADMIN · ALL SLOTS',
  'Auto refresh 15s',
  'Balance',
  'Equity',
  'Today P/L',
  '30D P/L',
  'Net P/L',
  'Win Rate',
  'Profit Factor',
  'Max DD',
  'Baskets',
  'Positions',
  'Pending',
  'Total Lots',
  'Spread',
  'Ping',
  'Deposit/Withdraw'
)) {
  if (-not $web.Contains($required)) {
    throw "Fleet monitor web contract missing: $required"
  }
}

foreach ($required in @(
  'grid-template-columns:repeat(4,minmax(0,1fr))',
  '.primaryMetrics',
  '.statGrid',
  '.tone_good',
  '.tone_warn',
  '.tone_bad'
)) {
  if (-not $css.Contains($required)) {
    throw "Fleet monitor compact card layout missing: $required"
  }
}

foreach ($required in @(
  'key:"trading-fleet-monitor"',
  'href:"/fleet-monitor"',
  'label:"Trading Fleet Monitor"',
  'fleetMonitorNavItem'
)) {
  if (-not $sidebar.Contains($required)) {
    throw "Fleet monitor sidebar entry missing: $required"
  }
}

Write-Host 'Trading Fleet Monitor read-only scope + UI contract PASS'


if ($web.Contains('<ScenovaBrand className={styles.mobileLogo}/>')) {
  throw 'Fleet Monitor must not render a duplicate mobile brand beside the shared mobile top bar'
}
if (-not $css.Contains('.mobileHead{') -or -not $css.Contains('display:block;') -or -not $css.Contains('min-height:58px;')) {
  throw 'Fleet Monitor must reserve exactly one shared mobile top bar row'
}

Write-Host 'Fleet Monitor mobile header overlap contract PASS'
