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
$auto = Block $ea 'bool AutoEnabled()'
$legacy = Block $ea 'bool LegacyBasketEngineEnabled()'
$send = Block $ea 'bool SendMarketOrder(int direction)'
$onTick = Block $ea 'void OnTick()'
$apply = Block $ea 'void ApplySettings(string json)'
$findPosition = Block $flip 'bool FlipLockFindPosition('
$starterDirection = Block $flip 'int FlipLockStarterDirection()'
$starter = Block $flip 'bool FlipLockOpenStarter('
$manage = Block $flip 'void FlipLockManage()'
$sync = Block $flip 'bool FlipLockSyncProfitLock('
$atr = Block $flip 'double FlipLockAtrPoints()'
$safety = Block $flip 'double FlipLockSafetyDistancePoints()'

Need $effective 'if(control == "FLIP_LOCK") return "FLIP_LOCK";' 'FLIP LOCK must be its own effective execution owner'
Need $auto 'EffectiveExecutionMode() == "AUTO"' 'AUTO must be enabled only for AUTO ownership'
Need $auto 'g_controlMode == "AUTO"' 'AUTO must require AUTO controlMode'
Forbid $auto 'FLIP_LOCK' 'FLIP LOCK must not enable AUTO'
Need $legacy 'EffectiveExecutionMode() == "MANUAL"' 'legacy basket engine must belong to MANUAL and stay out of AUTO/FLIP'
Need $apply 'EffectiveExecutionMode() != "MANUAL"' 'FLIP LOCK and other non-MANUAL owners must clear the legacy burst queue'

Need $send 'bool flipLockOrder = FlipLockModeEnabled();' 'shared sender must identify FLIP LOCK explicitly'
Need $send '? NormalizeTradeVolume(g_lot)' 'FLIP LOCK must use the user configured Lot directly'
Need $send 'FLIP_LOCK_LIVE_COMMENT' 'FLIP LOCK live position must be tagged for ownership'
Need $send 'FlipLockInitialSafetyStopPrice(direction,entryPrice,tick)' 'FLIP LOCK starter must use a dedicated wide Safety Stop rather than the baton trigger'
Need $send 'FLIP_LOCK_WAIT_ATR' 'FLIP LOCK must refuse a starter when real ATR protection is unavailable'
Need $send '(raceOrder || flipLockOrder)' 'FLIP LOCK must not publish a synthetic AUTO take-profit'

Need $findPosition 'FlipLockOwnedPosition' 'FLIP LOCK must keep strict broker-tag ownership'
Need $starterDirection 'PERIOD_M1' 'FLIP starter must use M1 candle direction'
Forbid $starterDirection 'g_macroTrendDirection' 'FLIP 1.1.0 starter must not use macro trend'
Forbid $starterDirection 'g_trendM5' 'FLIP 1.1.0 starter must not use M5 trend'
Forbid $starterDirection 'PERIOD_H1' 'FLIP 1.1.0 starter must not use H1'
Need $starter 'g_entryModel="FLIP_LOCK_M1_PROFIT_LOCK";' 'FLIP 1.3.0 profit-lock entry model missing'
Need $manage 'FLIP_LOCK_WAIT_EXISTING_POSITION' 'FLIP LOCK must wait instead of seizing a foreign open position'
Need $manage 'FlipLockSyncProfitLock' 'FLIP LOCK must manage its own broker SL profit-lock lifecycle'
Need $flip 'bool FlipLockLastExitWasStop()' 'FLIP must detect broker SL exits explicitly before handoff'
Need $flip 'latestReason!=DEAL_REASON_SL' 'FLIP must not treat manual/other exits as SL handoffs'
Need $flip 'int nextDirection=-g_flipLockDirection;' 'FLIP SL handoff must always reverse the prior position side'
Need $flip 'SL_HANDOFF_TO_BUY' 'SELL stop-out must hand off to BUY'
Need $flip 'SL_HANDOFF_TO_SELL' 'BUY stop-out must hand off to SELL'

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

Need $flip '#define FLIP_LOCK_V1_VERSION "1.3.0"' 'FLIP internal engine must be 1.3.0'
Need $atr 'PERIOD_M1' 'FLIP 1.3.0 ATR must use M1'
Forbid $atr 'PERIOD_M5' 'FLIP 1.3.0 ATR must not use M5 fallback'
Need $safety 'spread*8.0' 'starter Safety Stop must remain materially outside spread'
Need $safety 'atr*1.25' 'starter Safety Stop must stay wide before profit lock'
Need $flip '#define FLIP_LOCK_GOLD_TRAIL_PRICE 1.50' 'XAU FLIP must trail 1.50 units of quote price regardless of broker digits'
Need $flip '#define FLIP_LOCK_MIN_NET_PROFIT_USD 1.00' 'FLIP must require the agreed 1 USD minimum net profit'
Need $flip '#define FLIP_LOCK_EXIT_FEE_RESERVE_USD_PER_LOT 10.0' 'FLIP must reserve an estimated closing commission per lot'
Need $flip 'StringFind(symbol,"XAUUSD")==0' 'XAUUSD symbol family must be detected before quote-priced trail'
Need $flip 'StringFind(symbol,"XAUUSC")==0' 'XAUUSC symbol family must be supported'
Need $flip 'FLIP_LOCK_LEGACY_BTC_TRAIL_POINTS*_Point' 'BTC must not inherit a hardcoded XAU 1.50 quote-price trail'
Need $flip 'FlipLockBrokerMinDistancePoints()*_Point' 'FLIP must respect broker stop/freeze distances'
Need $flip 'HistorySelectByPosition(positionId)' 'FLIP must read opening fees from broker history by position id'
Need $flip 'DEAL_COMMISSION' 'FLIP must include opening commission'
Need $flip 'DEAL_FEE' 'FLIP must include broker deal fees'
Need $flip 'POSITION_SWAP' 'FLIP must include open-position swap'
Need $flip 'OrderCalcProfit(orderType,_Symbol,positionVolume,openPrice,stopPrice,gross)' 'FLIP must calculate monetary return at the proposed broker stop'
Need $flip 'g_flipLockFeeScanMs<10000' 'FLIP fee-history lookup must be cached to protect tick responsiveness'
Need $flip 'currency=="USC"' 'FLIP must scale the USD target for cent accounts'
Need $sync 'FlipLockProjectedNetAtStop(' 'FLIP must gate broker stop replacement on projected net at stop'
Need $sync 'projectedNet+1e-8<FlipLockDollarToAccountMoney(FLIP_LOCK_MIN_NET_PROFIT_USD)' 'FLIP must reject candidates below net profit floor'
Need $sync 'WAIT_ENTRY_FEE_HISTORY' 'FLIP must keep safety SL if broker commission history is unavailable'

Need $flip 'executablePrice-distance' 'BUY FLIP SL must trail below live Bid by 1.50 XAU price units'
Need $flip 'executablePrice+distance' 'SELL FLIP SL must trail above live Ask by 1.50 XAU price units'
Need $flip 'bool FlipLockSetPositionStop(' 'FLIP must modify the live Broker SL directly'
Need $flip 'double FlipLockProfitLockPrice(' 'FLIP live quote-distance trailing calculator missing'
Need $sync 'FlipLockSetPositionStop(positionTicket,target)' 'FLIP must write the protected-profit SL to the live position'
Need $sync 'LOCAL_NET_1USD_GOLD_1_50_TRAIL' 'FLIP projected net-profit trailing status missing'
Need $sync 'currentSl<=0.0' 'FLIP must compare against the current Broker SL'
Forbid $sync 'FlipLockPlacePending(' 'FLIP 1.3.0 must not place an opposite pending baton'
Forbid $sync 'FlipLockModifyPending' 'FLIP 1.3.0 must not trail an opposite pending baton'
Need $manage 'FlipLockRemoveAllPending();' 'FLIP must clean stale pending orders from older builds'
Need $manage 'FlipLockSyncProfitLock' 'FLIP must keep managing the live SL locally'
Need $manage 'PROFIT_LOCK_MANAGE_ONLY' 'FLIP must keep tightening live protection even when new exposure is blocked'
Need $flip 'FLIP_LOCK_STOP_SYNC_MIN_MS 250' 'FLIP SL updates must be paced'
Need $flip 'FLIP_LOCK_UNARMED_RESTART_COOLDOWN_SECONDS 5' 'FLIP safety-stop restart cooldown missing'

Need $api 'const flipLockSelected = requestedControlMode === "FLIP_LOCK";' 'API must canonicalize FLIP LOCK settings'
Need $api 'clean.maxPositions = 1;' 'API must force one live FLIP LOCK position'
Need $api 'clean.profitTargetMode = "OFF";' 'API must keep AUTO profit targets out of FLIP LOCK'
Need $api 'clean.dailyProfitDrawdownPercent = 0;' 'API must disable FLIP LOCK daily giveback drawdown'

Need $web 'XAU ล็อกกำไรสุทธิประมาณ $1' 'FLIP UI must explain the USD net-profit floor'
Need $web 'FLIP LOCK ไม่วาง Pending ฝั่งตรงข้าม' 'FLIP 1.3.0 UI must explain that no opposite pending baton is used'
Need $web 'BUY→SELL / SELL→BUY' 'FLIP UI must explain immediate opposite-side handoff after SL'
Need $web 'Lot คงที่ ไม่มี Martingale' 'FLIP 1.3.0 UI must preserve fixed configured Lot behavior'

$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA release version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'FLIP LOCK strict isolation contract: PASS'
