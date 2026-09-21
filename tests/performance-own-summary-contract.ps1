$ErrorActionPreference = 'Stop'

$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/performance/page.tsx'))
$api = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-analytics.controller.ts'))

foreach ($required in @(
  'BOT PERFORMANCE SUMMARY',
  'My Performance Only',
  'ownAccounts',
  'account.userId===options?.user?.id',
  'สร้างลิงก์แชร์',
  'วันนี้',
  '7 วัน',
  '30 วัน',
  '90 วัน',
  'SummaryChart',
  'Trade Direction',
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

$actions = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-actions.controller.ts'))

foreach ($required in @(
  'realAccounts',
  'demoAccounts',
  'บัญชีจริง (REAL)',
  'บัญชีทดลอง (DEMO)',
  'clearAllPerformanceData',
  '/performance-actions/reset-test-data',
  'ล้างข้อมูลทดสอบทั้งหมด',
  'Account Type'
)) {
  if (-not $web.Contains($required)) { throw "Performance account/reset UI missing: $required" }
}

foreach ($required in @(
  'instance_metrics',
  'accountTradeMode',
  'accountType',
  'demo|practice|trial|contest'
)) {
  if (-not $api.Contains($required)) { throw "Performance REAL/DEMO classification missing: $required" }
}

if (-not $actions.Contains('@Post("reset-test-data")')) { throw 'Owner performance reset endpoint missing' }
if (-not $actions.Contains('DELETE FROM trade_journal')) { throw 'Performance reset must clear trade journal' }
if (-not $actions.Contains('preserved: ["users", "mt5_accounts", "bot_instances", "subscriptions", "settings"]')) { throw 'Performance reset must preserve account/config data' }

Write-Host 'Own-only popup-style Trading Performance contract PASS'
