$ErrorActionPreference = 'Stop'

$analytics = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-analytics.controller.ts'))
$actions = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-actions.controller.ts'))
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/performance/page.tsx'))
$public = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/shared-performance/[slug]/page.tsx'))

foreach ($required in @(
  "event_type='EXIT'",
  "executedByBot",
  'curveExits',
  'T00:00:00.000+07:00',
  'T23:59:59.999+07:00'
)) {
  if (-not $analytics.Contains($required)) { throw "Performance analytics date/curve contract missing: $required" }
}

foreach ($required in @(
  'วันนี้',
  '7 วัน',
  '30 วัน',
  '90 วัน',
  'inclusiveDays',
  'chartTickLabel',
  'from={from} to={to}',
  'BOT PERFORMANCE SUMMARY',
  'My Performance Only',
  'account.userId===options?.user?.id',
  'ownAccounts',
  'compactToolbar',
  'แชร์ Read-only'
)) {
  if (-not $actions.Contains($required)) { throw "Public performance dynamic-share contract missing: $required" }
}

foreach ($required in @(
  'วันนี้',
  '7 วัน',
  '30 วัน',
  '90 วัน',
  'customDays',
  'inclusiveDays',
  'chartTickLabel',
  'from={from} to={to}',
  'BOT PERFORMANCE SUMMARY',
  'My Performance Only',
  'account.userId===options?.user?.id',
  'ownAccounts',
  'TRADING PERFORMANCE & BACKTEST',
  'PerformanceSummaryReport',
  'reportResultsGrid',
  'reportChartPanel'
)) {
  if (-not $web.Contains($required)) { throw "Trading Performance date/chart contract missing: $required" }
}

foreach ($required in @(
  'DATE SELECTABLE',
  'กำหนดเอง',
  'แกนล่างแสดงเวลา',
  'แกนล่างแสดงวันที่',
  'shared-performance/',
  'customDays',
  'EquityChart points={curve} from={from} to={to}'
)) {
  if (-not $public.Contains($required)) { throw "Shared Performance date selector contract missing: $required" }
}

Write-Host 'Performance date range / dynamic public share contract PASS'
