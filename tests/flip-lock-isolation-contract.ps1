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

Need $effective 'if(control == "FLIP_LOCK") return "FLIP_LOCK";' 'FLIP LOCK must be its own effective execution owner'
Need $autoV20 'return g_controlMode == "AUTO";' 'AUTO V20 must be enabled only for AUTO'
Forbid $autoV20 'FLIP_LOCK' 'FLIP LOCK must not enable AUTO V20'
Need $legacy 'EffectiveExecutionMode() == "AUTO"' 'legacy basket engine must depend on effective AUTO ownership'
Need $apply 'EffectiveExecutionMode() == "FLIP_LOCK"' 'FLIP LOCK must clear legacy burst state on mode selection'

Need $send 'bool flipLockOrder = FlipLockModeEnabled();' 'shared sender must identify FLIP LOCK explicitly'
Need $send '? NormalizeTradeVolume(g_lot)' 'FLIP LOCK must use the user configured Lot directly'
Need $send 'FLIP_LOCK_LIVE_COMMENT' 'FLIP LOCK live position must be tagged for ownership'
Need $send 'FlipLockCandidateTrigger(direction,tick)' 'FLIP LOCK initial broker SL must use the baton trigger'
Need $send '(raceOrder || flipLockOrder)' 'FLIP LOCK must not publish a synthetic AUTO take-profit'

Need $findPosition 'StringFind(comment,FLIP_LOCK_PENDING_COMMENT)<0' 'FLIP LOCK must ignore foreign AUTO/MANUAL/RACE positions'
Need $starter 'g_entryModel="FLIP_LOCK_BATON";' 'FLIP LOCK journal metadata must identify its own entry model'
Need $manage 'FLIP_LOCK_WAIT_EXISTING_POSITION' 'FLIP LOCK must wait instead of seizing a foreign open position'
Need $manage 'FlipLockSyncBaton' 'FLIP LOCK must manage its own SL + pending baton'
Need $flip 'int fallbackDirection =' 'FLIP LOCK must preserve opposite baton direction if broker settlement briefly goes flat'
Need $flip '? -g_flipLockDirection' 'flat fallback must reopen the opposite side instead of re-running AUTO direction analysis'

$ownerIndex = $onTick.IndexOf('FLIP LOCK V3 owns its live position')
$genericIndex = $onTick.IndexOf('ManageDynamicProtection();')
if($ownerIndex -lt 0 -or $genericIndex -lt 0 -or $ownerIndex -gt $genericIndex) {
  throw 'FLIP LOCK ownership must route before generic AUTO dynamic protection'
}
Need $onTick 'BasketHasFlipLockPosition()' 'OnTick must distinguish FLIP LOCK-owned positions'
Need $onTick 'FLIP_LOCK_MAX_BASKET_LOSS' 'FLIP LOCK must keep the configured hard Basket loss boundary'
Need $onTick 'FLIP_LOCK_WAIT_EXISTING_POSITION' 'mode switch must wait for a foreign position to drain'

Need $api 'const flipLockSelected = requestedControlMode === "FLIP_LOCK";' 'API must canonicalize FLIP LOCK settings'
Need $api 'clean.maxPositions = 1;' 'API must force one live FLIP LOCK position'
Need $api 'clean.profitTargetMode = "OFF";' 'API must keep AUTO profit targets out of FLIP LOCK'
Need $api 'clean.dailyProfitDrawdownPercent = 0;' 'API must disable FLIP LOCK daily giveback drawdown'

Need $web '1 Position + 1 Pending STOP ฝั่งตรงข้าม' 'FLIP LOCK UI must describe the isolated baton structure'
Need $web 'M1 ATR / Spread · ขยับเข้าอย่างเดียว' 'FLIP LOCK UI must describe its real trailing distance'
Need $web 'หลังจากนั้นสลับ BUY / SELL ด้วย Pending STOP' 'FLIP LOCK UI must explain that analysis chooses only the starter side'

Need $release 'DEFAULT_EA_VERSION = "1.0.29"' 'EA release version must match the FLIP LOCK isolation runtime'

Write-Host 'FLIP LOCK strict isolation contract: PASS'
