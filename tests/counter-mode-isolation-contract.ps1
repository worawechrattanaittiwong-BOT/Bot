$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Block([string]$text,[string]$sig) {
  $s=$text.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}
  $b=$text.IndexOf("{",$s); if($b -lt 0){throw "Missing opening brace: $sig"}
  $d=0
  for($i=$b;$i -lt $text.Length;$i++){
    if($text[$i] -eq "{"){$d++}
    elseif($text[$i] -eq "}"){$d--; if($d -eq 0){return $text.Substring($s,$i-$s+1)}}
  }
  throw "Unclosed $sig"
}
function Need([string]$text,[string]$needle,[string]$message) {
  if(-not $text.Contains($needle)){throw $message}
}
function Forbid([string]$text,[string]$needle,[string]$message) {
  if($text.Contains($needle)){throw $message}
}

$ea = Read-Text 'mt5/FastBasketBot.mq5'
$api = Read-Text 'apps/api/src/bot.controller.ts'
$eaApi = Read-Text 'apps/api/src/ea.controller.ts'
$journal = Read-Text 'apps/api/src/performance-journal.ts'
$symbolApi = Read-Text 'apps/api/src/trading-symbol.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'

$signal = Block $ea 'int CounterSignalDirection()'
$send = Block $ea 'bool SendCounterMarketOrder(int direction)'
$fill = Block $ea 'bool ProcessCounterFill(int direction)'
$manage = Block $ea 'bool ManageCounterMode()'
$harvest = Block $ea 'int CounterHarvestProfitablePositions()'
$dynamic = Block $ea 'void ManageDynamicProtection()'
$stopDistance = Block $ea 'double EffectiveStopLossDistancePoints()'
$stopMode = Block $ea 'string StopLossModeName()'

# Strategy contract: one rule only, inverse of the existing visible Bid flow.
Need $signal 'int graphDirection=RaceLivePriceDirection();' 'COUNTER must read only the visible Bid price-flow direction'
Need $signal 'if(graphDirection>0) return -1;' 'COUNTER graph-up must SELL'
Need $signal 'if(graphDirection<0) return 1;' 'COUNTER graph-down must BUY'
foreach($forbidden in @(
  'AverageTrueRangePoints','g_entryMode','g_trend','EMA','Structure','Volume',
  'Confidence','BasketDirection','RaceV2','Risk'
)) {
  Forbid $signal $forbidden "COUNTER signal leaked extra decision logic: $forbidden"
}

# Dedicated execution path: never reuse RACE/AUTO stop construction.
Need $send 'request.comment="SaaSCounter";' 'COUNTER broker ownership tag missing'
Need $send 'request.sl=0.0;' 'COUNTER must open without Broker SL'
Need $send 'request.tp=0.0;' 'COUNTER must open without Broker TP'
Need $send 'request.volume=NormalizeTradeVolume(g_lot);' 'COUNTER must use configured Lot directly'
Forbid $send 'RaceInitialStopPrice' 'RACE Stop leaked into COUNTER'
Forbid $send 'DynamicInitialStopPrice' 'AUTO/MANUAL Stop leaked into COUNTER'
Forbid $send 'AverageTrueRangePoints' 'ATR leaked into COUNTER order construction'

# Fill management is capacity + operational pacing only.
Need $fill 'CounterFilledUnits()>=g_maxPositions' 'COUNTER max-position cap missing'
Need $fill 'CounterCanSendOrder()' 'COUNTER gradual fill pacing missing'
Need $fill 'SendCounterMarketOrder(direction)' 'COUNTER dedicated sender missing'
Forbid $fill 'g_spreadStatus' 'Spread strategy gate must not decide COUNTER fills'
Forbid $fill 'RaceStopReady' 'RACE stop readiness must not gate COUNTER'
Forbid $fill 'EffectiveBasketLossLimit' 'Basket loss logic must not gate COUNTER'

Need $ea '#define COUNTER_FILL_INTERVAL_MS 1000' 'COUNTER one-second minimum fill interval missing'
Need $ea '#define COUNTER_MAX_ORDERS_PER_MINUTE 30' 'COUNTER broker-request cap missing'
Need $harvest 'g_counterPerPositionProfitMoney' 'COUNTER per-position profit target missing'
Need $harvest 'CounterCanSendOrder()' 'COUNTER profit closes must also be paced'
Need $harvest 'CounterRegisterOrderRequest()' 'COUNTER close requests must count toward pacing'
Need $harvest 'One close request per pass' 'COUNTER must not burst-close many tickets in one pass'

# Profit may close a ticket but may never select BUY/SELL.
Need $manage 'CounterHarvestProfitablePositions();' 'COUNTER profit harvesting missing'
Need $manage 'int direction=CounterSignalDirection();' 'COUNTER direction must come only from its simple signal'
Forbid $manage 'BasketProfit' 'Basket profit must not decide COUNTER direction'
Forbid $manage 'EffectiveBasketLossLimit' 'Basket loss must not manage COUNTER'
Forbid $manage 'RaceV2' 'RACE VNext logic leaked into COUNTER'

# Hard no-SL isolation, including future/generic protection paths.
Need $dynamic 'bool counterPosition=StringFind(positionComment,"SaaSCounter")>=0;' 'COUNTER dynamic-protection ownership guard missing'
Need $dynamic 'if(counterPosition)' 'COUNTER must bypass generic dynamic SL/TP management'
Need $stopDistance 'if(EffectiveExecutionMode()=="COUNTER")' 'COUNTER stop-distance hard-off gate missing'
Need $stopMode 'if(EffectiveExecutionMode()=="COUNTER")' 'COUNTER stop telemetry hard-off gate missing'
Need $stopMode 'return "OFF";' 'COUNTER stop telemetry must report OFF'

# COUNTER must route before generic daily/basket risk handling.
$counterRoute = $ea.IndexOf('bool counterCanStart=')
$dailyRisk = $ea.IndexOf('if(HandleDailyProfitControl(count))')
if($counterRoute -lt 0 -or $dailyRisk -lt 0 -or $counterRoute -gt $dailyRisk) {
  throw 'COUNTER must own runtime before generic daily/basket risk logic'
}

# Server/API mode ownership and exactly three user settings.
Need $api 'numberSetting("counterLot", 0.01, 100)' 'COUNTER Lot API setting missing'
Need $api 'numberSetting("counterMaxPositions", 1, 100, true)' 'COUNTER max positions API setting missing'
Need $api 'numberSetting("counterPerPositionProfitMoney", 0.01, maxAccountMoney)' 'COUNTER per-position profit API setting missing'
Need $api 'activeProfileMode === "COUNTER"' 'COUNTER canonical sizing profile missing'
Need $api 'clean.maxBasketLossMoney = 0;' 'COUNTER must clear generic basket-loss runtime control'
Need $api 'clean.dailyLossMoney = 0;' 'COUNTER must clear generic daily-loss runtime control'
Need $api 'clean.dailyProfitTargetMoney = 0;' 'COUNTER must clear generic daily-profit runtime control'
Need $eaApi '"COUNTER"' 'EA heartbeat API must preserve COUNTER mode'
Need $journal '"COUNTER"' 'Performance journal must recognize COUNTER ownership'
Need $symbolApi '"COUNTER"' 'Trading-symbol mode list must recognize COUNTER'

$counterUiStart = $web.IndexOf('controlMode==="COUNTER" ? <>')
if($counterUiStart -lt 0){throw 'COUNTER three-field UI branch missing'}
$counterUiEnd = $web.IndexOf('</> : <>',$counterUiStart)
if($counterUiEnd -lt 0){throw 'COUNTER three-field UI branch is not isolated'}
$counterUi = $web.Substring($counterUiStart,$counterUiEnd-$counterUiStart)
foreach($required in @('Lot ต่อไม้','จำนวนไม้','กำไรต่อไม้','counterPerPositionProfitMoney')) {
  Need $counterUi $required "COUNTER visible field missing: $required"
}
foreach($forbidden in @('ทิศทาง','Stop Loss','Risk Controls','ATR','EMA','จำนวนหลอด')) {
  Forbid $counterUi $forbidden "COUNTER UI contains forbidden extra control/copy: $forbidden"
}
Need $web 'controlMode!=="ZERO_GRID"&&controlMode!=="COUNTER"&&(' 'COUNTER must not render generic Risk Controls'
Need $web 'กราฟขึ้น → SELL · กราฟลง → BUY' 'COUNTER summary direction contract missing'
Forbid $web 'counterCandleCount' 'Retired candle-count setting must not exist'

Write-Host 'COUNTER minimal inverse-flow / no-SL / isolation contract PASS'
