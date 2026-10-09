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
$api = Read-Text 'apps/api/src/bot.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'
$release = Read-Text 'apps/api/src/release-version.ts'

$effective = Block $ea 'string EffectiveExecutionMode()'
$legacy = Block $ea 'bool LegacyBasketEngineEnabled()'
$autoEnabled = Block $ea 'bool AutoEnabled()'
$autoOwner = Block $ea 'bool BasketHasAutoPosition()'
$manualOwner = Block $ea 'bool BasketHasManualPosition()'
$autoFamily = Block $ea 'bool BasketHasAutoFamilyPosition()'
$fastExit = Block $ea 'bool AutoManageOpenBasket('
$autoManage = Block $ea 'bool AutoManageOpenBasket('
$dynamic = Block $ea 'void ManageDynamicProtection()'
$send = Block $ea 'bool SendMarketOrder(int direction)'
$onTick = Block $ea 'void OnTick()'

Need $effective 'if(control == "AUTO") return "AUTO";' 'AUTO must have its own effective execution mode'
Need $effective 'if(control == "MANUAL" || control == "ASSISTED" || control == "LEGACY")' 'MANUAL must not be collapsed into AUTO ownership'
Forbid $effective 'control == "AUTO" || control == "ASSISTED" || control == "MANUAL"' 'AUTO and MANUAL are still mapped to one owner'

Need $legacy 'return EffectiveExecutionMode() == "MANUAL";' 'legacy basket queue must belong to MANUAL, not AUTO'
Need $autoEnabled 'EffectiveExecutionMode() == "AUTO"' 'AUTO entry gate must require AUTO execution ownership'
Need $autoEnabled 'g_controlMode == "AUTO"' 'AUTO entry gate must require AUTO controlMode'

Need $ea '#define AUTO_LIVE_COMMENT "SaaSAuto"' 'AUTO live broker tag missing'
Need $ea '#define MANUAL_LIVE_COMMENT "SaaSManual"' 'MANUAL live broker tag missing'
Need $autoOwner 'AUTO_LIVE_COMMENT' 'AUTO ownership must be read from the broker position comment'
Need $manualOwner 'MANUAL_LIVE_COMMENT' 'MANUAL ownership tag missing'
Need $manualOwner 'LEGACY_BASKET_COMMENT' 'old generic baskets must remain legacy/manual owned instead of being adopted by AUTO'
Need $autoFamily 'AUTO_LIVE_COMMENT' 'AUTO family must include Vector Edge positions'
Need $autoFamily '"SaaSTactical"' 'AUTO family must include Tactical Countertrend positions'

Need $send 'bool manualOrder = EffectiveExecutionMode()=="MANUAL";' 'sender must distinguish MANUAL from AUTO'
Need $send '? AUTO_LIVE_COMMENT' 'AUTO order must carry its dedicated ownership tag'
Need $send 'manualOrder ? MANUAL_LIVE_COMMENT : LEGACY_BASKET_COMMENT' 'MANUAL order must carry a dedicated ownership tag'

Need $fastExit 'AutoOwnsOpenBasket()' 'AUTO fast exit must follow live AUTO ownership, not the current web mode'
Need $autoManage 'AutoOwnsOpenBasket()' 'AUTO open-basket manager must follow live AUTO ownership'
Need $dynamic 'g_autoBasketTargetPrice' 'AUTO broker target must remain active while its owned basket is live'
Forbid $send 'request.tp=0.0;' 'AUTO Broker TP must not disappear under money-target settings'

Need $dynamic 'bool autoPosition=StringFind(positionComment,AUTO_LIVE_COMMENT)>=0;' 'dynamic protection must detect AUTO ownership per position'
Need $dynamic 'bool autoFamilyPosition=autoPosition || tacticalPosition;' 'dynamic protection must keep Tactical positions inside AUTO ownership'
Need $dynamic 'g_autoBasketTargetPrice' 'AUTO broker TP must follow the canonical AUTO Basket target'
Need $dynamic 'g_autoBasketStopPrice' 'AUTO dynamic protection may only tighten the canonical Basket stop'
Need $dynamic '!autoFamilyPosition && g_profitTargetMode != "AUTO"' 'MANUAL settings must never clear an AUTO-family broker TP'

Need $onTick 'bool autoOwnedBasket = count > 0 && BasketHasAutoPosition();' 'OnTick must resolve AUTO ownership before generic management'
Need $onTick 'bool autoFamilyOwnedBasket = count > 0 && BasketHasAutoFamilyPosition();' 'OnTick must resolve AUTO-family ownership before MANUAL controls'
Need $onTick '!autoFamilyOwnedBasket && g_profitTargetMode == "MANUAL"' 'MANUAL per-position targets must not close AUTO-family positions'
Need $onTick 'if(!tacticalBasket && autoOwnedBasket)' 'AUTO open-basket manager must be gated by AUTO ownership'
Need $onTick 'AutoManageOpenBasket(momentum)' 'AUTO smart exits must run only through the owned-basket manager'
Need $onTick 'AUTO_POSITION_OWNERSHIP_LOCK' 'AUTO basket must stay with AUTO while another mode waits'
Need $onTick 'AUTO_WAIT_FOREIGN_POSITION' 'AUTO must wait instead of adopting a foreign MANUAL/legacy position'
Need $onTick 'bool autoNoRescue=autoOwnedBasket && rescueCount<=0;' 'AUTO must not open new Rescue hedge/recovery volume'
Need $onTick 'bool zeroGridCanStart =' 'ZERO selection must not preempt a live AUTO/MANUAL owner'
Need $onTick 'BasketPositionCount()<=0' 'ZERO may start only after the previous live owner is flat'

Need $api 'const autoSelected = effectiveProfitProfileMode === "AUTO";' 'API must canonicalize the active AUTO profit profile independently'
Need $api 'clean.profitTargetMode = "AUTO";' 'AUTO selection must clear stale MANUAL profit semantics'
Need $api 'const manualSelected =' 'API must canonicalize MANUAL independently'
Need $api 'clean.profitTargetMode = "MANUAL";' 'MANUAL selection must not inherit AUTO smart-profit semantics'

Need $web 'AUTO Ownership' 'dashboard must explain AUTO ownership'
Need $web 'ไม่รับไม้ของโหมดอื่นมาจัดการต่อ' 'dashboard must explain that AUTO cannot adopt another mode position'
Need $web 'MANUAL Ownership' 'dashboard must explain MANUAL ownership'

$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing for strict AUTO isolation runtime'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA release version must match strict AUTO isolation runtime: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'AUTO strict isolation contract: PASS'
