$ErrorActionPreference = 'Stop'

$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/performance/page.tsx'))
$api = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-analytics.controller.ts'))

foreach ($required in @(
  'BOT PERFORMANCE SUMMARY',
  'My Performance Only',
  'ownAccounts',
  'account.userId===options?.user?.id',
  'แชร์ Read-only',
  'วันนี้',
  '7 วัน',
  '30 วัน',
  '90 วัน',
  'SummaryChart',
  'Directional Analytics',
  'Streaks'
)) {
  if (-not $web.Contains($required)) { throw "Own performance summary page missing: $required" }
}

foreach ($required in @(
  'buyWinRate',
  'sellWinRate',
  'expectedPayoff',
  'largestProfitTrade',
  'maxWinStreak',
  'averageLossStreak'
)) {
  if (-not $api.Contains($required)) { throw "Performance summary analytics missing: $required" }
}

if ($web.Contains('ภาพรวมทั้งระบบ')) { throw 'Trading Performance page must not expose system-wide performance view' }
if ($web.Contains('รายลูกค้า / รายบัญชี')) { throw 'Trading Performance page must not expose other customer drill-down' }
if ($web.Contains('<h1>Trading Performance & Backtest</h1>')) { throw 'Redundant page title must stay removed from compact performance view' }
if ($web.Contains('customDays')) { throw 'Custom-day number input must stay removed from compact performance view' }
if ($web.Contains('className={styles.shareCard}')) { throw 'Share controls must stay integrated into the main performance controls' }

$actions = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-actions.controller.ts'))

foreach ($required in @(
  'realAccounts',
  'demoAccounts',
  'Live Accounts (REAL)',
  'Demo Accounts',
  'clearAllPerformanceData',
  '/performance-actions/reset-test-data',
  'ล้างข้อมูลทั้งระบบ',
  'Account Type',
  'currentRealDemoAccounts',
  'compareCurrentAccounts',
  'slice(0,1)'
)) {
  if (-not $web.Contains($required)) { throw "Performance account/reset UI missing: $required" }
}

foreach ($required in @(
  'instance_metrics',
  'accountTradeMode',
  'accountType',
  'demo|practice|trial|contest',
  'instance_last_seen_at',
  'account_created_at'
)) {
  if (-not $api.Contains($required)) { throw "Performance REAL/DEMO classification missing: $required" }
}

if (-not $actions.Contains('@Post("reset-test-data")')) { throw 'Owner performance reset endpoint missing' }
if (-not $actions.Contains('DELETE FROM trade_journal')) { throw 'Performance reset must clear trade journal' }
if (-not $actions.Contains('preserved: ["users", "mt5_accounts", "bot_instances", "subscriptions", "settings"]')) { throw 'Performance reset must preserve account/config data' }


if (-not $web.Contains('styles.mainOwner')) { throw 'Owner performance layout must use a dedicated non-offset main class' }
if (-not $web.Contains('styles.mainCustomer')) { throw 'Customer performance layout must preserve fixed-sidebar offset separately' }

if (-not $web.Contains('controlsOpen')) { throw 'Performance options must use a collapsible slide-down drawer' }
if (-not $web.Contains('styles.optionsDrawer')) { throw 'Performance options drawer UI missing' }
if (-not $web.Contains('styles.optionsButton')) { throw 'Performance options button missing' }
if ($web.Contains('className={styles.controlCard}')) { throw 'External performance control card must stay removed so summary can fill the viewport' }

$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
if (-not $ea.Contains('\"accountTradeMode\":%d')) { throw 'EA heartbeat must publish authoritative accountTradeMode' }
if (-not $ea.Contains('AccountInfoInteger(ACCOUNT_TRADE_MODE)')) { throw 'EA account type telemetry must come from MT5 ACCOUNT_TRADE_MODE' }

Write-Host 'Own-only popup-style Trading Performance contract PASS'
