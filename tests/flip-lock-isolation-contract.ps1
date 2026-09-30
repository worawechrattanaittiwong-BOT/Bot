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
$starterDirection = Block $flip 'int FlipLockStarterDirection()'
$starter = Block $flip 'bool FlipLockOpenStarter('
$manage = Block $flip 'void FlipLockManage()'
$sync = Block $flip 'bool FlipLockSyncBaton('
$atr = Block $flip 'double FlipLockAtrPoints()'
$trail = Block $flip 'double FlipLockTrailDistancePoints()'
$safety = Block $flip 'double FlipLockSafetyDistancePoints()'

Need $effective 'if(control == "FLIP_LOCK") return "FLIP_LOCK";' 'FLIP LOCK must own its execution mode'
Need $autoV20 'EffectiveExecutionMode() == "AUTO"' 'AUTO must remain isolated from FLIP LOCK'
Forbid $autoV20 'FLIP_LOCK' 'FLIP LOCK must not enable AUTO V20'
Need $legacy 'EffectiveExecutionMode() == "MANUAL"' 'legacy basket must stay out of FLIP LOCK'
Need $apply 'EffectiveExecutionMode() != "MANUAL"' 'FLIP LOCK must clear legacy burst state'

Need $send 'bool flipLockOrder = FlipLockModeEnabled();' 'shared sender must identify FLIP orders'
Need $send '? NormalizeTradeVolume(g_lot)' 'FLIP starter must use configured Lot exactly'
Need $send 'FLIP_LOCK_LIVE_COMMENT' 'FLIP live position ownership tag missing'
Need $send 'FlipLockInitialSafetyStopPrice(direction,entryPrice,tick)' 'FLIP Safety Stop missing'

Need $flip '#define FLIP_LOCK_V1_VERSION "1.1.0"' 'FLIP internal version must be 1.1.0'
Need $atr 'PERIOD_M1' 'FLIP ATR must use M1'
Forbid $atr 'PERIOD_M5' 'FLIP ATR must not use M5 fallback'
Forbid $starterDirection 'g_macroTrendDirection' 'FLIP starter must not use macro trend'
Forbid $starterDirection 'g_trendM5' 'FLIP starter must not use M5'
Forbid $starterDirection 'PERIOD_H1' 'FLIP starter must not use H1'
Need $starterDirection 'PERIOD_M1' 'FLIP starter must use M1 candle direction'
Need $starter 'g_entryModel="FLIP_LOCK_M1_PENDING_BATON";' 'FLIP M1 pending-baton entry model missing'
Need $sync 'int pendingDirection=-direction;' 'FLIP must stage the opposite side'
Need $sync 'FlipLockPlacePending(' 'FLIP must pre-place opposite STOP pending'
Need $sync 'positionVolume' 'pending leg must preserve the current configured leg volume'
Need $sync 'FlipLockModifyPending' 'opposite pending must trail favorable price movement'
Need $sync 'M1_PENDING_BATON_ACTIVE' 'pending baton status missing'
Need $trail 'atr*0.45' 'M1 pending distance must use moderate ATR spacing'
Need $trail 'spread*3.0' 'M1 pending must keep spread/noise room'
Need $safety 'atr*1.25' 'Safety Stop must remain wider than normal pending baton'
Need $safety 'spread*8.0' 'Safety Stop must remain materially outside spread'

Need $flip 'bool FlipLockReconcileHedgingPositions()' 'Hedging pending-trigger reconciliation missing'
Need $flip 'NETTING_PENDING_TRIGGER_HANDOFF' 'Netting equal-Lot pending handoff missing'
Need $flip 'FlipLockPendingTriggerCrossed()' 'Netting trigger detection missing'
Need $manage 'FlipLockReconcileHedgingPositions();' 'Hedging overlap must be reconciled'
Need $manage 'LIVE_SAFETY_ONLY' 'stopped/unauthorized live FLIP must remove new-risk pending'
Need $onTick 'FLIP_LOCK_MAX_BASKET_LOSS' 'FLIP configured Max Basket Loss must remain active'

Need $api 'const flipLockSelected = requestedControlMode === "FLIP_LOCK";' 'API FLIP settings normalization missing'
Need $api 'clean.maxPositions = 1;' 'API must keep one primary FLIP position'
Need $api 'clean.profitTargetMode = "OFF";' 'AUTO profit target must stay out of FLIP'
Need $web 'M1 เท่านั้น · เปิด 1 Position พร้อม Pending Stop ฝั่งตรงข้าม' 'FLIP M1 pending-baton UI explanation missing'
Need $web 'Lot ตามค่าที่ตั้ง ไม่มี Martingale' 'FLIP fixed configured Lot explanation missing'

$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne '1.1.0' -or $releaseVersionMatch.Groups[1].Value -ne '1.1.0'){
  throw ("FLIP 1.1.0 version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'FLIP LOCK 1.1.0 M1 pending-baton / fixed-Lot contract: PASS'
