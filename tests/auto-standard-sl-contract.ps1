$ErrorActionPreference = 'Stop'

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
$plan = Block $ea 'void AutoV20PlanPrices(AUTO_V20_SIDE &side,AUTO_V20_LEVELS &levels)'
$dynamic = Block $ea 'void ManageDynamicProtection()'

# Initial AUTO SL is a market standard, not an account-size output.
Need $ea '#define AUTO_V20_STOP_ATR_FLOOR 1.25' 'AUTO standard SL ATR floor changed or disappeared'
Need $ea '#define AUTO_V20_STOP_ATR_CAP 2.40' 'AUTO standard SL ATR cap changed or disappeared'
Need $ea '#define AUTO_V20_STOP_SPREAD_MULTIPLIER 4.00' 'AUTO spread protection floor changed or disappeared'
Need $plan 'standardStopFloor=MathMax(' 'AUTO standard SL floor is not computed'
Need $plan 'atrPrice*AUTO_V20_STOP_ATR_FLOOR' 'AUTO SL no longer has the standard M5 ATR floor'
Need $plan 'spreadPoints*_Point*AUTO_V20_STOP_SPREAD_MULTIPLIER' 'AUTO SL no longer protects against spread noise'
Need $plan 'SYMBOL_TRADE_STOPS_LEVEL' 'AUTO SL broker Stops Level floor missing'
Need $plan 'SYMBOL_TRADE_FREEZE_LEVEL' 'AUTO SL broker Freeze Level floor missing'
Forbid $plan 'ACCOUNT_BALANCE' 'AUTO SL must not depend on account Balance'
Forbid $plan 'ACCOUNT_EQUITY' 'AUTO SL must not depend on account Equity'

# Demand/Supply and nearest structure can only widen the standard stop.
Need $plan 'stopDistance=MathMax(stopDistance,zoneDistance);' 'AUTO zone SL is allowed to tighten inside the standard floor'
Need $plan 'stopDistance=MathMax(stopDistance,structureDistance);' 'AUTO structure SL is allowed to tighten inside the standard floor'
Need $plan 'maximumStop=atrPrice*AUTO_V20_STOP_ATR_CAP;' 'AUTO SL bounded ATR envelope missing'
Need $plan 'if(configuredStop>standardStopFloor)' 'Configured hard stop may shrink AUTO below its standard floor'
Need $plan 'maximumStop=MathMin(maximumStop,configuredStop);' 'Configured hard-stop outer envelope missing'
Forbid $plan 'stopDistance=MathMin(stopDistance,configuredStop);' 'Legacy tight-SL clamp returned'

# Widening SL must not be followed by the old TP cap that destroyed planned RR.
Need $plan 'targetDistanceCap=MathMax(atrPrice*1.35,stopDistance*1.80);' 'AUTO TP cap no longer scales with widened standard SL'

# Post-entry protection remains delayed until +1R and can only tighten.
Need $dynamic 'AutoV22StepProtectedStop(' 'AUTO step protection missing'
$step = Read-Text 'mt5/include/AutoSwingFilterV22.mqh'
Need $step 'if(progressPoints<riskPoints)' 'AUTO BE/trailing must not tighten before +1R'

Write-Host 'AUTO standard initial SL contract PASS'
