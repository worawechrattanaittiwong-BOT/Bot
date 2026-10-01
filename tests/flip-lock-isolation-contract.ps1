$ErrorActionPreference = "Stop"

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Block([string]$text,[string]$sig) {
  $s=$text.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}
  $b=$text.IndexOf("{",$s); $d=0
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
$flip = Read-Text 'mt5/include/FlipLockV1.mqh'
$api = Read-Text 'apps/api/src/bot.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'
$release = Read-Text 'apps/api/src/release-version.ts'

$effective = Block $ea 'string EffectiveExecutionMode()'
$autoV20 = Block $ea 'bool AutoV20Enabled()'
$legacy = Block $ea 'bool LegacyBasketEngineEnabled()'
$send = Block $ea 'bool SendMarketOrder(int direction)'
$onTick = Block $ea 'void OnTick()'
$apply = Block $ea 'void ApplySettings(string json)'
$findPosition = Block $flip 'bool FlipLockFindPosition('
$starter = Block $flip 'bool FlipLockOpenStarter('
$manage = Block $flip 'void FlipLockManage()'
$trail = Block $flip 'double FlipLockTrailDistancePoints()'
$safety = Block $flip 'double FlipLockSafetyDistancePoints()'
$profitFloor = Block $flip 'double FlipLockMinimumNetProfitStopPrice('
$ready = Block $flip 'bool FlipLockProfitLockReady('
$sync = Block $flip 'bool FlipLockSyncBaton('

Need $effective 'if(control == "FLIP_LOCK") return "FLIP_LOCK";' 'FLIP LOCK must be its own effective execution owner'
Need $autoV20 'EffectiveExecutionMode() == "AUTO"' 'AUTO V20 must be enabled only for AUTO ownership'
Need $autoV20 'g_controlMode == "AUTO"' 'AUTO V20 must require AUTO controlMode'
Forbid $autoV20 'FLIP_LOCK' 'FLIP LOCK must not enable AUTO V20'
Need $legacy 'EffectiveExecutionMode() == "MANUAL"' 'legacy basket engine must belong to MANUAL and stay out of AUTO/FLIP'
Need $apply 'EffectiveExecutionMode() != "MANUAL"' 'FLIP LOCK and other non-MANUAL owners must clear the legacy burst queue'

Need $send 'bool flipLockOrder = FlipLockModeEnabled();' 'shared sender must identify FLIP LOCK explicitly'
Need $send '? NormalizeTradeVolume(g_lot)' 'FLIP LOCK must use the user configured Lot directly'
Need $send 'FLIP_LOCK_LIVE_COMMENT' 'FLIP LOCK live position must be tagged for ownership'
Need $send 'FlipLockInitialSafetyStopPrice(direction,entryPrice,tick)' 'FLIP LOCK starter must use a dedicated wide Safety Stop rather than the baton trigger'
Need $send 'FLIP_LOCK_WAIT_ATR' 'FLIP LOCK must refuse a starter when real ATR protection is unavailable'
Need $send '(raceOrder || flipLockOrder)' 'FLIP LOCK must not publish a synthetic AUTO take-profit'

Need $findPosition 'StringFind(comment,FLIP_LOCK_PENDING_COMMENT)<0' 'FLIP LOCK must ignore foreign AUTO/MANUAL/RACE positions'
Need $starter 'g_entryModel="FLIP_LOCK_BATON";' 'FLIP LOCK journal metadata must identify its own entry model'
Need $manage 'FLIP_LOCK_WAIT_EXISTING_POSITION' 'FLIP LOCK must wait instead of seizing a foreign open position'
Need $manage 'FlipLockSyncBaton' 'FLIP LOCK must manage its own trailing SL lifecycle'
Need $flip 'int FlipLockReactiveDirection()' 'FLIP LOCK must defer the next BUY/SELL decision until after exit'
Need $flip 'if(g_flipLockDirection!=0) return -g_flipLockDirection;' 'a perfectly neutral candle may use the prior side only as the final immediate fallback'

$ownerIndex = $onTick.IndexOf('FLIP LOCK V4 owns every position')
$genericIndex = $onTick.IndexOf('ManageDynamicProtection();')
if($ownerIndex -lt 0 -or $genericIndex -lt 0 -or $ownerIndex -gt $genericIndex) {
  throw 'FLIP LOCK ownership must route before generic AUTO dynamic protection'
}
Need $onTick 'BasketHasFlipLockPosition()' 'OnTick must distinguish FLIP LOCK-owned positions'
Need $onTick 'FLIP_LOCK_MAX_BASKET_LOSS' 'FLIP LOCK must keep the configured hard Basket loss boundary'
Need $onTick 'FLIP_LOCK_WAIT_EXISTING_POSITION' 'mode switch must wait for a foreign position to drain'
Need $onTick 'double flipCycleProfit = BasketCycleProfit();' 'FLIP LOCK Max Basket Loss must include realized P/L across BUY/SELL handoffs'
Need $onTick 'rescueCount <= 0 && !FlipLockModeEnabled()' 'temporary flat settlement must not reset the FLIP LOCK run P/L'
Need $manage 'ResetBasketCycleState();' 'a stopped and flat FLIP LOCK run must reset before the next Start'
Need $trail 'FlipLockBrokerMinDistancePoints()+tickPoints' 'FLIP LOCK trail must stay as close as broker legality plus one tick'
Forbid $trail 'spread*3.0' 'FLIP LOCK trail must not stay three spreads away from live price'
Forbid $trail 'atr*0.35' 'FLIP LOCK trail must not stay on the old wide ATR distance'
Need $safety 'spread*8.0' 'starter Safety Stop must be materially wider than the live spread'
Need $safety 'atr*1.25' 'starter Safety Stop must be backed by real ATR'
Need $flip '#define FLIP_LOCK_V1_VERSION "6.1.0"' 'FLIP LOCK must run the net-profit Tick-on-Tick V6.1 engine'
Need $flip 'FLIP_LOCK_MIN_NET_PROFIT_MONEY 0.30' 'FLIP LOCK minimum protected net profit must be 0.30'
Need $flip 'FLIP_LOCK_SLIPPAGE_BUFFER_TICKS 2.0' 'FLIP LOCK must reserve a small adverse-fill buffer'
Need $flip 'FLIP_LOCK_STOP_SYNC_MIN_MS 0' 'FLIP LOCK Tick-on-Tick must not impose a time throttle'
Need $profitFloor 'POSITION_IDENTIFIER' 'FLIP LOCK must inspect the current position entry commission'
Need $profitFloor 'HistorySelectByPosition(positionId)' 'FLIP LOCK must read the current position deal costs'
Need $profitFloor 'estimatedExitCommission=entryCommission' 'FLIP LOCK must reserve estimated closing commission'
Need $profitFloor 'FLIP_LOCK_MIN_NET_PROFIT_MONEY+' 'FLIP LOCK floor must include the +0.30 net-profit contract'
Need $profitFloor 'FLIP_LOCK_SLIPPAGE_BUFFER_TICKS' 'FLIP LOCK floor must include slippage buffer ticks'
Need $ready 'FlipLockMinimumNetProfitStopPrice' 'FLIP LOCK must arm only when the +0.30 floor is broker-legal'
Need $sync 'positionVolume' 'FLIP LOCK sync must evaluate the real current position volume'
Need $sync 'FLIP_LOCK_WAIT_NET_PROFIT_LOCK' 'FLIP LOCK must wait until the net-profit floor is legal'
Need $sync 'candidate=MathMax(candidate,netProfitFloor)' 'BUY trail must never fall below the net-profit floor'
Need $sync 'candidate=MathMin(candidate,netProfitFloor)' 'SELL trail must never rise above the net-profit floor'
Need $sync 'SYMBOL_TRADE_TICK_SIZE' 'FLIP LOCK SL must follow meaningful broker price ticks'
Need $sync 'if(stopImproved)' 'FLIP LOCK must submit on every meaningful improving tick'
Forbid $sync 'nowMs-g_flipLockLastStopSyncMs>=' 'FLIP LOCK must not time-throttle Tick-on-Tick SL updates'
Need $sync 'FlipLockRemoveAllPending();' 'reactive FLIP LOCK must remove stale pending orders'
Forbid $sync 'FlipLockPlacePending(' 'reactive FLIP LOCK must not pre-place BUY/SELL STOP before candle-force evaluation'
Need $flip 'int FlipLockReactiveDirection()' 'reactive FLIP LOCK must evaluate candle force only after the previous position closes'
Need $flip 'double bodyRatio=' 'reactive FLIP LOCK must score the live candle body/range'
Need $flip 'double momentum=MomentumPoints();' 'reactive FLIP LOCK must include live momentum'
Need $flip 'FlipLockOpenStarter(reactiveDirection);' 'reactive FLIP LOCK must re-enter immediately after a trailed-profit exit'
Need $flip 'FLIP_LOCK_UNARMED_RESTART_COOLDOWN_SECONDS 5' 'an unarmed safety-stop exit must not immediately churn into a new starter'
Need $manage 'bool canOpenNewCycle=' 'server authorization must control only new FLIP exposure'
Need $manage 'A live FLIP-owned position is always protected from the local MT5 quote.' 'live FLIP protection must continue locally through SaaS latency/mode changes'
Forbid $manage 'if(g_state!=STATE_RUNNING || !g_access || !g_runAuthorized)' 'live FLIP SL must not freeze on a server authorization gate'

Need $api 'const flipLockSelected = requestedControlMode === "FLIP_LOCK";' 'API must canonicalize FLIP LOCK settings'
Need $api 'clean.maxPositions = 1;' 'API must force one live FLIP LOCK position'
Need $api 'clean.profitTargetMode = "OFF";' 'API must keep AUTO profit targets out of FLIP LOCK'
Need $api 'clean.dailyProfitDrawdownPercent = 0;' 'API must disable FLIP LOCK daily giveback drawdown'

Need $web 'MT5 Local Tick · Server ไม่กำหนดราคา SL' 'FLIP LOCK UI must explain local price ownership'
Need $web 'Safety Stop → Trailing SL ขยับตามราคา MT5' 'FLIP LOCK UI must expose direct MT5 trailing behavior'
Need $web 'ไม่มีการวาง BUY STOP / SELL STOP ล่วงหน้า' 'FLIP LOCK UI must state that no opposite pending direction is pre-placed'

$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA release version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'FLIP LOCK strict isolation contract: PASS'
