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
  '@Query("from")',
  '@Query("to")',
  'request_range AS',
  "a.status='ACTIVE'",
  'JOIN mt5_accounts a ON a.id=bi.mt5_account_id',
  'OWN_ASSIGNED_SLOTS',
  'ALL_SLOTS',
  'AND ls.assigned_user_id=$1',
  'AND a.user_id=$1',
  'own_account.user_id=$1',
  'trade_journal',
  'PERFORMANCE_ACTUAL_DEALS_V1',
  "event_type IN ('ENTRY','EXIT')",
  'reconstructCompletedJournal(accountRows)',
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

if ($api.Contains("event_type='BASKET'")) {
  throw 'Fleet Monitor performance must not depend on raw BASKET journal rows'
}

if (-not $module.Contains('FleetMonitorController')) {
  throw 'Fleet monitor controller must be registered in AppModule'
}

foreach ($required in @(
  'api("/fleet-monitor" + fleetPeriodQuery(rangeMode, customFrom, customTo))',
  'Trading Fleet Monitor',
  'MY SLOTS ONLY',
  'ADMIN · ALL SLOTS',
  'Auto refresh 15s',
  'Balance',
  'Equity',
  'Today P/L · Live',
  'P/L ช่วง',
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
  'Deposit/Withdraw',
  'ช่วงเวลาผลงาน',
  'กำหนดวัน/เวลาเอง',
  'type="datetime-local"',
  'Asia/Bangkok',
  'บัญชีที่เชื่อมต่อ',
  'Trade Journal ตามช่วงที่เลือก'
)) {
  if (-not $web.Contains($required)) {
    throw "Fleet monitor web contract missing: $required"
  }
}

if ($web.Contains('<option value="EMPTY">')) {
  throw 'Fleet Monitor must not offer EMPTY slots because only connected MT5 accounts belong on this page'
}
if ($api.Contains('LEFT JOIN mt5_accounts a ON a.id=bi.mt5_account_id')) {
  throw 'Fleet Monitor must not LEFT JOIN MT5 accounts; disconnected slots must be excluded at the API'
}

foreach ($required in @(
  'grid-template-columns:repeat(4,minmax(0,1fr))',
  '.primaryMetrics',
  '.statGrid',
  '.tone_good',
  '.tone_warn',
  '.tone_bad',
  '.currencyPeriodRow{',
  'grid-template-columns:minmax(430px,32%) minmax(0,1fr)',
  '.periodBar{',
  '.dateField{',
  '.periodApplied{'
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
