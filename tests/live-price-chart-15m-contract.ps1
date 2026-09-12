$ErrorActionPreference = 'Stop'
$page = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/dashboard/page.tsx'))
$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))

foreach($needle in @(
  'const LIVE_PRICE_WINDOW_MS = 15 * 60 * 1000;',
  'const [livePricePoints, setLivePricePoints]',
  'marketState === "CLOSED"',
  '<LivePriceChart points={livePricePoints}',
  'function LivePriceChart(',
  'window.setInterval(()=>setNowMs(Date.now()),100)',
  'เก็บเฉพาะข้อมูล 15 นาทีล่าสุดในหน้านี้',
  'MARKET CLOSED',
  'LIVE · 15 MIN'
)) {
  if(-not $page.Contains($needle)) { throw "Missing live-price chart contract: $needle" }
}
if($page.Contains('<HourlyWinRateChart points={hourlyWinRate}/>')) { throw 'Historical hourly chart is still rendered' }
if($page.Contains('localStorage.setItem("livePrice')) { throw 'Live price chart must not persist browser history' }
foreach($needle in @('marketBid','marketAsk','marketMid')) {
  if(-not $ea.Contains($needle)) { throw "EA heartbeat quote field missing: $needle" }
}
Write-Host '15-minute in-memory live price chart contract PASS'