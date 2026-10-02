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
$starterDirection = Block $flip 'int FlipLockStarterDirection()'
$starter = Block $flip 'bool FlipLockOpenStarter('
$manage = Block $flip 'void FlipLockManage()'
$sync = Block $flip 'bool FlipLockSyncProfitLock('
$atr = Block $flip 'double FlipLockAtrPoints()'
$safety = Block $flip 'double FlipLockSafetyDistancePoints()'

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

Need $findPosition 'FlipLockOwnedPosition' 'FLIP LOCK must keep strict broker-tag ownership'
Need $starterDirection 'PERIOD_M1' 'FLIP starter must use M1 candle direction'
Forbid $starterDirection 'g_macroTrendDirection' 'FLIP 1.1.0 starter must not use macro trend'
Forbid $starterDirection 'g_trendM5' 'FLIP 1.1.0 starter must not use M5 trend'
Forbid $starterDirection 'PERIOD_H1' 'FLIP 1.1.0 starter must not use H1'
Need $starter 'g_entryModel="FLIP_LOCK_M1_PROFIT_LOCK";' 'FLIP 1.2.0 profit-lock entry model missing'
Need $manage 'FLIP_LOCK_WAIT_EXISTING_POSITION' 'FLIP LOCK must wait instead of seizing a foreign open position'
Need $manage 'FlipLockSyncProfitLock' 'FLIP LOCK must manage its own broker SL profit-lock lifecycle'

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

Need $flip '#define FLIP_LOCK_V1_VERSION "1.2.0"' 'FLIP internal engine must be 1.2.0'
Need $atr 'PERIOD_M1' 'FLIP 1.2.0 ATR must use M1'
Forbid $atr 'PERIOD_M5' 'FLIP 1.2.0 ATR must not use M5 fallback'
Need $safety 'spread*8.0' 'starter Safety Stop must remain materially outside spread'
Need $safety 'atr*1.25' 'starter Safety Stop must stay wide before profit lock'
Need $flip '#define FLIP_LOCK_PROFIT_LOCK_RATIO 0.50' 'FLIP profit-lock ratio must be 50 percent'
Need $flip 'bool FlipLockSetPositionStop(' 'FLIP must modify the live Broker SL directly'
Need $flip 'double FlipLockProfitLockPrice(' 'FLIP 50 percent lock-price calculator missing'
Need $sync 'g_flipLockPeakPrice' 'FLIP must lock from best favorable excursion, not current noise'
Need $sync 'FlipLockSetPositionStop(positionTicket,target)' 'FLIP must write the protected-profit SL to the live position'
Need $sync 'LOCAL_50_PERCENT_PROFIT_LOCK' 'FLIP 50 percent profit-lock status missing'
Need $sync 'currentSl<=0.0' 'FLIP must compare against the current Broker SL'
Forbid $sync 'FlipLockPlacePending(' 'FLIP 1.2.0 must not place an opposite pending baton'
Forbid $sync 'FlipLockModifyPending' 'FLIP 1.2.0 must not trail an opposite pending baton'
Need $manage 'FlipLockRemoveAllPending();' 'FLIP must clean stale pending orders from older builds'
Need $manage 'FlipLockSyncProfitLock' 'FLIP must keep managing the live SL locally'
Need $manage 'PROFIT_LOCK_MANAGE_ONLY' 'FLIP must keep tightening live protection even when new exposure is blocked'
Need $flip 'FLIP_LOCK_STOP_SYNC_MIN_MS 250' 'FLIP SL updates must be paced'
Need $flip 'FLIP_LOCK_UNARMED_RESTART_COOLDOWN_SECONDS 5' 'FLIP safety-stop restart cooldown missing'

Need $api 'const flipLockSelected = requestedControlMode === "FLIP_LOCK";' 'API must canonicalize FLIP LOCK settings'
Need $api 'clean.maxPositions = 1;' 'API must force one live FLIP LOCK position'
Need $api 'clean.profitTargetMode = "OFF";' 'API must keep AUTO profit targets out of FLIP LOCK'
Need $api 'clean.dailyProfitDrawdownPercent = 0;' 'API must disable FLIP LOCK daily giveback drawdown'

Need $web 'ล็อก 50% ของระยะกำไรสูงสุด' 'FLIP 1.2.0 UI must explain the 50 percent profit lock'
Need $web 'FLIP LOCK ไม่วาง Pending ฝั่งตรงข้าม' 'FLIP 1.2.0 UI must explain that no opposite pending baton is used'
Need $web 'Lot ตาม Settings ไม่มี Martingale' 'FLIP 1.2.0 UI must preserve fixed configured Lot behavior'

$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA release version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'FLIP LOCK strict isolation contract: PASS'
