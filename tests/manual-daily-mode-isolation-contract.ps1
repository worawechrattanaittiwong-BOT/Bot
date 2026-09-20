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

$stop = Block $ea 'double DynamicInitialStopPrice(int direction, double entryPrice)'
$stopDistance = Block $ea 'double EffectiveStopLossDistancePoints()'
$stopMode = Block $ea 'string StopLossModeName()'
$manualProfit = Block $ea 'bool ManagePerPositionTargets()'
$dailyRecalc = Block $ea 'void RecalculateDailyClosedProfit()'
$dailyProfit = Block $ea 'double DailyBotProfit()'
$onTick = Block $ea 'void OnTick()'
$basketLoss = Block $ea 'double EffectiveBasketLossLimit()'
$apply = Block $ea 'void ApplySettings(string json)'

# MANUAL Stop Loss OFF is truly OFF and survives mode switching.
Need $stop 'EffectiveExecutionMode()=="MANUAL" && g_manualStopLossPoints<=0.0' 'MANUAL Stop Loss OFF gate missing'
Need $stop 'return 0.0;' 'MANUAL Stop Loss OFF must return no Broker SL'
Need $stopDistance 'if(EffectiveExecutionMode()=="MANUAL")' 'MANUAL stop distance must be mode scoped'
Need $stopDistance 'if(g_manualStopLossPoints <= 0.0)' 'MANUAL zero stop distance gate missing'
Need $stopMode 'return g_manualStopLossPoints > 0.0 ? "MANUAL_POINTS" : "OFF";' 'MANUAL stop telemetry must report OFF'
Need $stopMode 'return "SYSTEM_ATR";' 'Non-MANUAL modes must keep their own ATR stop semantics'
Forbid $api 'clean.manualStopLossPoints = 0;' 'API mode switch still erases MANUAL Stop Loss profile'
Forbid $web 'props.onEdit?.("manualStopLossPoints",0);' 'Dashboard mode switch still erases MANUAL Stop Loss profile'
Forbid $web 'if (manualSl <= 0) props.onEdit?.("manualStopLossPoints",suggestedManualSl);' 'Dashboard silently re-enables MANUAL Stop Loss'
Need $web 'ปิด = ไม่มี Broker Stop Loss' 'Dashboard must explain MANUAL Stop Loss OFF behavior'

# MANUAL per-position target on Netting closes one configured lot-unit, not the aggregate.
Need $manualProfit 'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING' 'MANUAL profit target must distinguish Hedging vs Netting'
Need $manualProfit 'double baseVolume = NormalizeTradeVolume(g_lot);' 'MANUAL Netting unit size must use configured Lot'
Need $manualProfit 'targetComparableProfit' 'MANUAL Netting proportional profit comparison missing'
Need $manualProfit 'baseVolume / positionVolume' 'MANUAL Netting per-unit profit ratio missing'
Need $manualProfit 'ClosePositionVolumeByTicket(ticket,closeVolume,"SCNManualProfit")' 'MANUAL Netting must partial-close one unit'
Need $manualProfit 'if(!hedging)' 'MANUAL Netting must stop after one unit per pass'

# Daily P/L and locks are isolated by execution owner.
foreach($field in @(
  'g_dailyClosedProfitAuto',
  'g_dailyClosedProfitRace',
  'g_dailyClosedProfitFlipLock',
  'g_dailyClosedProfitManual',
  'g_autoDailyLoss','g_autoDailyProfitTarget',
  'g_raceDailyLoss','g_raceDailyProfitTarget',
  'g_flipLockDailyLoss','g_flipLockDailyProfitTarget',
  'g_manualDailyLoss','g_manualDailyProfitTarget'
)) {
  Need $ea $field "EA missing mode-scoped daily field: $field"
}
Need $ea 'string TradeModeForDeal(ulong dealTicket)' 'Historical deal mode resolver missing'
Need $ea 'string TradeModeForPositionHistory(ulong positionId)' 'Historical position ownership resolver missing'
Need $ea 'string DailyRiskMode()' 'Live risk owner resolver missing'
Need $dailyRecalc 'g_dailyClosedProfitAuto+=net;' 'AUTO daily ledger accumulation missing'
Need $dailyRecalc 'g_dailyClosedProfitRace+=net;' 'RACE daily ledger accumulation missing'
Need $dailyRecalc 'g_dailyClosedProfitFlipLock+=net;' 'FLIP daily ledger accumulation missing'
Need $dailyRecalc 'g_dailyClosedProfitManual+=net;' 'MANUAL daily ledger accumulation missing'
Need $dailyProfit 'DailyClosedProfitForMode(mode)' 'DailyBotProfit must select the active mode closed P/L'
Need $dailyProfit 'DailyFloatingProfitForMode(mode)' 'DailyBotProfit must select the active mode floating P/L'
Need $onTick 'DailyBotProfit() <= -effectiveDailyLoss' 'Daily Loss must use mode bot P/L'
Forbid $onTick 'AccountInfoDouble(ACCOUNT_EQUITY) <= g_dayStartEquity - g_dailyLoss' 'Whole-account equity still drives Daily Loss'
Need $ea 'string DailyLossLockGlobalKey()' 'Per-mode Daily Loss lock key missing'
Need $ea '"SCN_DLL_%I64d_%I64d_%s_%s"' 'Daily Loss lock key must include mode'
Need $ea '"SCN_DPL_%I64d_%I64d_%s_%s"' 'Daily Profit lock key must include mode'
Need $ea '"SCN_DPA_%I64d_%I64d_%s_%s"' 'Daily Profit armed key must include mode'
Need $ea 'bool   g_dailyLossLocked = false;' 'Persistent Daily Loss lock state missing'
Need $ea 'if(g_dailyProfitLocked || g_dailyLossLocked)' 'Heartbeat must not restart a mode locked by Daily Loss'
Need $basketLoss 'ModeBasketLossLimit(DailyRiskMode())' 'Max Basket Loss must follow the live owner profile'

foreach($jsonField in @(
  '"autoDailyLossMoney"','"autoDailyProfitTargetMoney"',
  '"raceDailyLossMoney"','"raceDailyProfitTargetMoney"',
  '"flipLockDailyLossMoney"','"flipLockDailyProfitTargetMoney"',
  '"manualDailyLossMoney"','"manualDailyProfitTargetMoney"'
)) {
  Need $apply $jsonField "EA settings parser missing $jsonField"
}

Write-Host 'MANUAL Stop OFF / Netting profit / per-mode daily risk contract PASS'
