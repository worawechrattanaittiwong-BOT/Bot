$ErrorActionPreference = 'Stop'

$api = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/bot.controller.ts'))
$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/components/BotPerformanceSummary.tsx'))
$page = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))

foreach ($required in @(
  'runSummary',
  "command='START'",
  "command IN ('SAFE_STOP','CLOSE_ALL')",
  'maxDrawdownPercent',
  'balanceSeries',
  "metadata->>'executedByBot'",
  'botExitRows',
  'curvePnlValues',
  'sharpeRatio',
  'maxWinStreak',
  'maxLossStreak'
)) {
  if (-not $api.Contains($required)) { throw "Bot performance summary API contract missing: $required" }
}

foreach ($required in @(
  'BOT PERFORMANCE SUMMARY',
  'สรุปผลบอท',
  'Start Capital',
  'End Balance',
  'Max Drawdown',
  'Win Rate',
  'BalanceChart',
  'ScenovaIcon',
  'bps-title-mark',
  'bps-end-dot'
)) {
  if (-not $web.Contains($required)) { throw "Bot performance summary UI contract missing: $required" }
}

if (-not $page.Contains('import { BotPerformanceSummary }')) { throw 'Dashboard summary component import missing' }
if (-not $page.Contains('<BotPerformanceSummary dashboard={data} />')) { throw 'Dashboard summary launcher mount missing' }
if (-not $web.Contains('.bps-modal{position:relative;width:100%;max-width:none')) { throw 'Bot performance summary modal must fill the available viewport width' }
if ($web.Contains('width:min(1320px,calc(100vw - 16px))')) { throw 'Legacy fixed summary modal width cap must stay removed' }

Write-Host 'Bot performance summary contract PASS'
