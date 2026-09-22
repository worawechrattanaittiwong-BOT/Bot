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
  'clear-own-data',
  'PERFORMANCE_OWN_DATA_RESET',
  'scope: "SYSTEM"',
  'publicShare(',
  'availableRange',
  'detailedExits',
  'parsePublicRange',
  '730 days',
  'accountType',
  'accountTradeMode',
  'strategyModes',
  'normalizeShareStrategyModes',
  'lotDistribution',
  'modeBreakdown'
)) {
  if (-not $actions.Contains($required)) { throw "Public performance dynamic-share contract missing: $required" }
}

foreach ($required in @(
  'วันนี้',
  '7 วัน',
  '30 วัน',
  '90 วัน',
  'inclusiveDays',
  'SummaryChart',
  'Capital Growth',
  'BOT PERFORMANCE SUMMARY',
  'My Performance Only',
  'account.userId===options?.user?.id',
  'ownAccounts',
  'Strategy Portfolio',
  'แชร์ Read-only',
  'ล้างข้อมูลของฉัน',
  'ล้างข้อมูลทั้งระบบ',
  '/performance-actions/clear-own-data'
)) {
  if (-not $web.Contains($required)) { throw "Trading Performance compact date/share contract missing: $required" }
}

if ($web.Contains('customDays')) { throw 'Main Trading Performance page must not render the removed custom-day input' }
if ($web.Contains('className={styles.shareCard}')) { throw 'Share controls must stay integrated into the main toolbar' }
if ($web.Contains('<h1>Trading Performance & Backtest</h1>')) { throw 'Redundant page heading must stay removed' }

foreach ($required in @(
  'BOT PERFORMANCE SUMMARY',
  'Public read-only performance',
  'Strategy Portfolio',
  'Performance Breakdown · MT5 Analytics',
  'Directional Analytics',
  'Execution Analytics',
  'Portfolio Scope',
  'Lot Allocation',
  'Capital Growth',
  'SummaryChart',
  'LotDistributionChart',
  'styles.optionsDrawer',
  'วันนี้',
  '7 วัน',
  '30 วัน',
  '90 วัน'
)) {
  if (-not $public.Contains($required)) { throw "Shared Performance mirror-dashboard contract missing: $required" }
}

if ($public.Contains('Equity / Balance Curve')) { throw 'Legacy public share dashboard must stay removed' }
if ($public.Contains('DrawdownChart')) { throw 'Legacy standalone public drawdown chart must stay removed' }
if ($public.Contains('className={styles.disclaimer}')) { throw 'Public share must use the same compact report surface as the private summary' }

Write-Host 'Performance date range / dynamic public share contract PASS'
