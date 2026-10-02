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
$sync = Block $flip 'bool FlipLockSyncBaton('
$atr = Block $flip 'double FlipLockAtrPoints()'
$trail = Block $flip 'double FlipLockTrailDistancePoints()'
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
Need $starter 'g_entryModel="FLIP_LOCK_M1_PENDING_BATON";' 'FLIP 1.1.0 pending-baton entry model missing'
Need $manage 'FLIP_LOCK_WAIT_EXISTING_POSITION' 'FLIP LOCK must wait instead of seizing a foreign open position'
Need $manage 'FlipLockSyncBaton' 'FLIP LOCK must manage its own opposite pending baton lifecycle'

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

Need $flip '#define FLIP_LOCK_V1_VERSION "1.1.0"' 'FLIP internal engine must be exactly 1.1.0'
Need $atr 'PERIOD_M1' 'FLIP 1.1.0 ATR must use M1'
Forbid $atr 'PERIOD_M5' 'FLIP 1.1.0 ATR must not use M5 fallback'
Need $trail 'spread*3.0' 'M1 opposite pending baton must keep spread/noise room'
Need $trail 'atr*0.45' 'M1 opposite pending baton must use the original 1.1.0 ATR spacing'
Need $safety 'spread*8.0' 'starter Safety Stop must remain materially outside spread'
Need $safety 'atr*1.25' 'starter Safety Stop must remain wider than the pending baton'
Need $sync 'int pendingDirection=-direction;' 'FLIP must stage the opposite side'
Need $sync 'FlipLockPlacePending(' 'FLIP must pre-place the opposite BUY STOP / SELL STOP'
Need $sync 'positionVolume' 'opposite pending leg must preserve the current configured leg volume'
Need $sync 'FlipLockModifyPending' 'opposite pending must trail favorable price movement'
Need $sync 'M1_PENDING_BATON_ACTIVE' 'pending baton active status missing'
Need $flip 'ORDER_TYPE_BUY_STOP' 'FLIP 1.1.0 BUY STOP support missing'
Need $flip 'ORDER_TYPE_SELL_STOP' 'FLIP 1.1.0 SELL STOP support missing'
Need $flip 'bool FlipLockReconcileHedgingPositions()' 'Hedging pending-trigger reconciliation missing'
Need $flip 'NETTING_PENDING_TRIGGER_HANDOFF' 'Netting equal-Lot pending handoff missing'
Need $flip 'FlipLockPendingTriggerCrossed()' 'Netting trigger detection missing'
Need $manage 'FlipLockReconcileHedgingPositions();' 'Hedging overlap must be reconciled'
Need $manage 'LIVE_SAFETY_ONLY' 'stopped/unauthorized live FLIP must remove new-risk pending'
Need $flip 'FLIP_LOCK_PENDING_SYNC_MIN_MS 120' 'FLIP 1.1.0 pending baton must keep its original 120ms sync pacing'
Need $flip 'FLIP_LOCK_UNARMED_RESTART_COOLDOWN_SECONDS 5' 'FLIP 1.1.0 safety-stop restart cooldown missing'

Need $api 'const flipLockSelected = requestedControlMode === "FLIP_LOCK";' 'API must canonicalize FLIP LOCK settings'
Need $api 'clean.maxPositions = 1;' 'API must force one live FLIP LOCK position'
Need $api 'clean.profitTargetMode = "OFF";' 'API must keep AUTO profit targets out of FLIP LOCK'
Need $api 'clean.dailyProfitDrawdownPercent = 0;' 'API must disable FLIP LOCK daily giveback drawdown'

Need $web 'M1 เท่านั้น · เปิด 1 Position พร้อม Pending Stop ฝั่งตรงข้าม' 'FLIP 1.1.0 UI must explain the M1 opposite pending baton'
Need $web 'FLIP LOCK วาง BUY STOP / SELL STOP ฝั่งตรงข้ามล่วงหน้า' 'FLIP 1.1.0 UI must expose opposite BUY STOP / SELL STOP behavior'
Need $web 'Lot ตามค่าที่ตั้ง ไม่มี Martingale' 'FLIP 1.1.0 UI must preserve fixed configured Lot behavior'

$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA release version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'FLIP LOCK strict isolation contract: PASS'
