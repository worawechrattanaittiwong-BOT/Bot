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

Write-Host 'Own-only popup-style Trading Performance contract PASS'
