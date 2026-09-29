$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing file: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$label) {
  if (-not $text.Contains($needle)) { throw "Missing contract: $label" }
}
function Forbid([string]$text,[string]$needle,[string]$label) {
  if ($text.Contains($needle)) { throw "Forbidden legacy contract: $label" }
}
function Block([string]$text,[string]$start,[string]$next) {
  $a=$text.IndexOf($start)
  if($a -lt 0){ throw "Missing block start: $start" }
  $b=$text.IndexOf($next,$a+$start.Length)
  if($b -lt 0){ return $text.Substring($a) }
  return $text.Substring($a,$b-$a)
}

$ea=Read-Text 'mt5/FastBasketBot.mq5'
$api=Read-Text 'apps/api/src/bot.controller.ts'
$web=Read-Text 'apps/web/app/dashboard/page.tsx'

$zero=Block $ea 'double ZeroGridRequiredCloseNet()' 'double ZeroGridTickSize()'
$autoManage=Block $ea 'bool AutoV20ManageOpenBasket(' 'int AdaptiveEntryDirection('
$send=Block $ea 'bool SendMarketOrder(int direction)' 'bool ClosePositionByTicket('
$dynamic=Block $ea 'void ManageDynamicProtection()' 'string ProfitControlModeName()'
$onTick=Block $ea 'void OnTick()' 'void OnTimer()'

Need $onTick 'HARD PROFIT TARGET CONTRACT' 'unified hard target gate'
Need $onTick 'AUTO_PROFIT_TARGET' 'AUTO hard money close reason'
Need $onTick 'BASKET_PROFIT_TARGET' 'MANUAL hard money close reason'
Need $onTick 'hardCycleProfit >= g_basketProfitTarget' 'target comparison must close immediately'
Need $autoManage 'bool hardMoneyProfitTarget=g_basketProfitTarget>0.0;' 'AUTO target must bypass smart-profit exits'
Need $autoManage 'cycleProfit>0.0 && !hardMoneyProfitTarget' 'AUTO giveback/reversal profit exits must be bypassed when hard target is set'
Need $send 'request.tp=hardMoneyProfitTarget ? 0.0 : autoPlan.tpPrice;' 'AUTO Broker TP must be disabled when money target is active'
Need $dynamic 'clearAutoMoneyTargetTP' 'existing AUTO Broker TP must be cleared when hard money target is active'

Need $zero 'return MathMax(0.01,g_zeroGridMinNetProfitMoney);' 'ZERO exact configured target'
Forbid $zero 'g_zeroGridCloseReserveMoney' 'ZERO hidden reserve'
Forbid $zero 'ZeroGridEstimatedExitCostMoney' 'ZERO hidden estimated close cost'

Need $ea 'displayedRoundProfit >= g_raceCloseAllProfitMoney' 'RACE immediate close-all target must follow the live MT5 displayed Profit values'
Need $ea 'if(g_controlMode == "FLIP_LOCK")' 'FLIP isolation must remain present'

Need $api 'else if (requestedProfitMode === "AUTO")' 'API must preserve AUTO Basket target'
Forbid $api 'requestedProfitMode === "AUTO" || requestedProfitMode === "OFF"' 'API must not clear AUTO Basket target'
Need $api 'clean.zeroGridCloseReserveMoney = 0;' 'API must normalize ZERO reserve to zero'

Need $web 'เป้ากำไร AUTO' 'AUTO hard target input must be mode-specific'
Need $web 'ถึงจำนวนเงินที่ตั้งไว้แล้วปิดทั้งชุดทันที' 'AUTO hard target explanation'
Forbid $web 'เงินสำรองสำหรับค่าปิด' 'ZERO hidden reserve UI'
Need $web 'payload.profitRunTrailPercent = 0;' 'run-on must be disabled for hard targets'

Write-Host 'Hard profit target contract PASS'
