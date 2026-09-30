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
$api = Read-Text 'apps/api/src/bot.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'
$db = Read-Text 'database/001_init.sql'
$dynamic = Block $ea 'void ManageDynamicProtection()'
$raceStop = Block $ea 'double RaceInitialStopPrice(int direction, double entryPrice)'
$onTick = Block $ea 'void OnTick()'
$autoEval = Block $ea 'void AutoV20PlanPrices'
$autoPrecision = Block $ea 'int AutoV20PrecisionDirection(double momentum)'
$closeAll = Block $ea 'bool ClosePositionByTicket(ulong ticket)'
$partialClose = Block $ea 'bool ClosePositionVolumeByTicket'

# AUTO fixed Lot + hard-target profit ownership.
Need $ea 'side.plannedLot=NormalizeTradeVolume(g_lot);' 'AUTO must use the exact configured Lot'
Forbid $ea 'side.plannedLot=NormalizeTradeVolume(g_lot*sizeFactor);' 'AUTO confidence/RR Lot scaling must be removed'
Need $dynamic 'bool strictAutoHardTarget =' 'AUTO hard-target dynamic protection gate missing'
Need $dynamic '!strictAutoHardTarget && profitPoints >= atr * 0.55' 'AUTO hard target must block BE profit tightening'
Need $dynamic '!strictAutoHardTarget && profitPoints >= atr * 1.10' 'AUTO hard target must block ATR profit trailing'
Need $dynamic '!strictAutoHardTarget && profitPoints >= atr * 0.70' 'AUTO hard target must block EMA profit trailing'
Need $onTick 'strictTacticalProfitTarget' 'Tactical AUTO must not bank profit before configured hard target'

# MANUAL strict ownership.
Need $dynamic 'if(manualPosition)' 'MANUAL dynamic protection isolation missing'
Need $dynamic 'continue;' 'MANUAL must bypass hidden dynamic SL management'
Need $onTick 'if(!manualOwnedBasket)' 'MANUAL reversal/correction isolation missing'
Need $onTick 'MANUAL is user-owned.' 'MANUAL strict ownership marker missing'

# RACE must never consume MANUAL stop and must use dedicated target mode.
Need $raceStop 'RaceAtrStopPoints();' 'RACE must use its own ATR stop'
Forbid $raceStop 'g_manualStopLossPoints' 'MANUAL stop leaked into RACE'
Need $ea 'g_raceProfitTargetMode == "POSITION"' 'RACE dedicated per-position target mode missing'
Need $ea 'g_racePerPositionProfitMoney' 'RACE per-position profit amount missing'

# Closing must use the position Symbol, not the chart Symbol. This is required
# for account-wide Force Flat when another SCENOVA Symbol is still open.
Need $ea 'int DynamicDeviationPointsForSymbol(string symbol)' 'Cross-symbol dynamic deviation helper missing'
Need $closeAll 'request.volume = NormalizeTradeVolumeForSymbol(symbol,volume);' 'Full close must normalize volume for the position Symbol'
Need $closeAll 'request.deviation = DynamicDeviationPointsForSymbol(symbol);' 'Full close must use position-symbol dynamic deviation'
Need $closeAll 'request.type_filling = AllowedFillingModeForSymbol(symbol);' 'Full close must use filling mode for the position Symbol'
Need $partialClose 'request.deviation=DynamicDeviationPoints();' 'Partial close must use dynamic deviation'

# API/UI mode profiles must be separate.
foreach($field in @(
  'autoMaxBasketLossMoney','autoDailyLossMoney','autoDailyProfitTargetMoney',
  'raceMaxBasketLossMoney','raceDailyLossMoney','raceDailyProfitTargetMoney',
  'flipLockMaxBasketLossMoney','flipLockDailyLossMoney','flipLockDailyProfitTargetMoney',
  'manualMaxBasketLossMoney','manualDailyLossMoney','manualDailyProfitTargetMoney'
)) {
  Need $api $field "API missing isolated risk field: $field"
  Need $web $field "Web missing isolated risk field: $field"
}
Need $web 'riskProfiles:Record<string' 'Dashboard per-mode risk mapping missing'
Need $web 'AUTO:{basket:"autoMaxBasketLossMoney"' 'AUTO risk profile mapping missing'
Need $web 'RACE:{basket:"raceMaxBasketLossMoney"' 'RACE risk profile mapping missing'
Need $web 'FLIP_LOCK:{basket:"flipLockMaxBasketLossMoney"' 'FLIP risk profile mapping missing'
Need $web 'MANUAL:{basket:"manualMaxBasketLossMoney"' 'MANUAL risk profile mapping missing'
Forbid $api 'clean.manualStopLossPoints = 0;' 'Mode switching must not erase the saved MANUAL stop profile'
Need $web 'ปิด = ไม่มี Broker Stop Loss' 'Dashboard must explain that MANUAL Stop Loss OFF is truly off'
Need $db '"raceProfitTargetMode":"BASKET"' 'RACE target default missing from DB'

Write-Host 'Strict mode settings / fixed AUTO Lot / dynamic close contract PASS'
