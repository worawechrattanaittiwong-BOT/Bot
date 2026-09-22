$ErrorActionPreference = 'Stop'

$bot = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/bot.controller.ts'))
$live = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/dashboard-live.controller.ts'))
$analytics = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-analytics.controller.ts'))
$actions = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-actions.controller.ts'))
$journal = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-journal.ts'))
$performancePage = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/performance/page.tsx'))
$summaryPopup = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/components/BotPerformanceSummary.tsx'))
$page = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))

foreach ($required in @(
  'reconstructCompletedJournal(rows)',
  'const performance = summarizeBaskets(modeBaskets);',
  'activityEntries: entries',
  'tradeJournal.today = summarizeBaskets(basketRows);'
)) {
  if (-not $bot.Contains($required)) { throw "Dashboard actual-deal consistency contract missing: $required" }
}

foreach ($required in @(
  'PERFORMANCE_ACTUAL_DEALS_V1',
  "event_type IN ('ENTRY','EXIT')",
  'reconstructCompletedJournal(journalResult.rows || [])',
  'effectiveFrom',
  'rangeEnd',
  'ACTUAL_ENTRY_EXIT_DEALS'
)) {
  if (-not $analytics.Contains($required)) { throw "Performance analytics actual-deal contract missing: $required" }
}
if ($analytics.Contains("AND event_type='BASKET'")) {
  throw 'Private live Performance must not trust raw BASKET net_profit after async multi-position close'
}

foreach ($required in @(
  'position.remainingVolume=Math.max(0,position.remainingVolume-volume);',
  'basket.netProfit+=net;',
  'if(!stillOpen)',
  'resolveJournalControlMode'
)) {
  if (-not $journal.Contains($required)) { throw "Journal reconstruction contract missing: $required" }
}

foreach ($required in @(
  'const [from,setFrom]=useState(today);',
  'tradeNumber:index+1',
  'แกน X = จำนวนไม้ที่ปิด',
  'report?.balance?.rangeEnd',
  'report?.range?.effectiveFrom'
)) {
  if (-not $performancePage.Contains($required)) { throw "Performance UI actual-range/trade-axis contract missing: $required" }
}

foreach ($required in @(
  'tick.pointIndex',
  'จำนวนไม้'
)) {
  if (-not $summaryPopup.Contains($required)) { throw "Run summary trade-axis contract missing: $required" }
}

foreach ($required in @(
  "event_type='BASKET'",
  'winRate: trades > 0 ? (wins / trades) * 100 : 0'
)) {
  if (-not $live.Contains($required)) { throw "Legacy dashboard-live Basket contract missing: $required" }
}

$shareFormula = 'winRate: rows.length > 0 ? Number((wins / rows.length * 100).toFixed(2)) : 0,'
$shareFormulaCount = ([regex]::Matches($actions, [regex]::Escape($shareFormula))).Count
if ($shareFormulaCount -lt 2) {
  throw 'Private/public performance share summaries must keep their existing Basket denominator'
}

foreach ($required in @(
  'row.activityEntries ?? row.trades ?? 0',
  'closedTrades+" Basket · "'
)) {
  if (-not $page.Contains($required)) { throw "Dashboard Basket UI contract missing: $required" }
}

Write-Host 'Performance actual-deal reconstruction + trade-number chart contract PASS'
