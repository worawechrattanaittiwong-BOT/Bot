$ErrorActionPreference = 'Stop'
$page = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))
$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))

foreach($needle in @(
  'const LIVE_PRICE_WINDOW_MS = 15 * 60 * 1000;',
  'const [livePricePoints, setLivePricePoints]',
  'marketState === "CLOSED"',
  'function LivePriceChart('
)) {
  if(-not $page.Contains($needle)) { throw "Missing retained quote-history capability: $needle" }
}
if($page.Contains('<LivePriceChart points={livePricePoints}')) {
  throw 'Control Center must not render the live price chart; the space belongs to Bot Settings'
}
if($page.Contains('<HourlyWinRateChart points={hourlyWinRate}/>')) {
  throw 'Historical hourly chart is still rendered'
}
if($page.Contains('localStorage.setItem("livePrice')) {
  throw 'Live price history must not persist browser history'
}
foreach($needle in @('marketBid','marketAsk','marketMid')) {
  if(-not $ea.Contains($needle)) { throw "EA heartbeat quote field missing: $needle" }
}
Write-Host 'Control Center no-chart contract PASS'
