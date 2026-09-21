$ErrorActionPreference = 'Stop'

$bot = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/bot.controller.ts'))
$live = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/dashboard-live.controller.ts'))
$analytics = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-analytics.controller.ts'))
$actions = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-actions.controller.ts'))
$page = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))

foreach ($required in @(
  'const performance = summarizeBaskets(modeRows);',
  'activityEntries: entries',
  'winRate: closedTrades > 0 ? wins / closedTrades * 100 : 0',
  'drawdownPercent = peakBalance > 0',
  'tradeJournal.today = summarizeBaskets(rows);'
)) {
  if (-not $bot.Contains($required)) { throw "Dashboard Basket consistency contract missing: $required" }
}

if ($bot.Contains('summarizeClosedBotPositions')) {
  throw 'Per-mode performance must not use EXIT/position Win Rate after Basket standardization'
}

foreach ($required in @(
  "event_type='BASKET'",
  'winRate: trades > 0 ? (wins / trades) * 100 : 0'
)) {
  if (-not $live.Contains($required)) { throw "Live summary Basket contract missing: $required" }
}

foreach ($required in @(
  'const winRate = trades > 0 ? wins / trades * 100 : 0;',
  'const trades = rows.length;'
)) {
  if (-not $analytics.Contains($required)) { throw "Performance analytics Basket contract missing: $required" }
}

if ($analytics.Contains('const decided = wins + losses')) {
  throw 'Performance analytics must include breakeven Baskets in the Win Rate denominator'
}

$shareFormula = 'winRate: rows.length > 0 ? Number((wins / rows.length * 100).toFixed(2)) : 0,'
$shareFormulaCount = ([regex]::Matches($actions, [regex]::Escape($shareFormula))).Count
if ($shareFormulaCount -lt 2) {
  throw 'Private/public performance share summaries must use the same Basket denominator'
}
if ($actions.Contains('const decided = wins + losses')) {
  throw 'Performance share summaries must include breakeven Baskets in the Win Rate denominator'
}

foreach ($required in @(
  'row.activityEntries ?? row.trades ?? 0',
  'closedTrades+" Basket · "'
)) {
  if (-not $page.Contains($required)) { throw "Dashboard Basket UI contract missing: $required" }
}

Write-Host 'Performance Basket consistency contract PASS'
