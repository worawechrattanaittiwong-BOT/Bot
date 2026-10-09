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
$autoManage=Block $ea 'bool AutoManageOpenBasket(' 'int AdaptiveEntryDirection('
$send=Block $ea 'bool SendMarketOrder(int direction)' 'bool ClosePositionByTicket('
$dynamic=Block $ea 'void ManageDynamicProtection()' 'string ProfitControlModeName()'
$onTick=Block $ea 'void OnTick()' 'void OnTimer()'

Need $onTick 'HARD PROFIT TARGET CONTRACT' 'unified hard target gate'
Need $onTick '!exclusivelyAutoOwned && g_profitTargetMode == "AUTO"' 'AUTO Broker TP must override legacy EA money-profit closure'
Need $onTick 'BASKET_PROFIT_TARGET' 'MANUAL hard money close reason'
Need $onTick 'hardCycleProfit >= g_basketProfitTarget' 'target comparison must close immediately'
Forbid $autoManage 'hardMoneyProfitTarget' 'AUTO must use broker TP, not a money profit exit'
Forbid $autoManage 'AUTO_EARLY_PROFIT_' 'AUTO must never early-close profit'
Need $send 'request.tp=autoPlan.tpPrice;' 'AUTO must set real broker TP regardless of old money target'
Forbid $dynamic 'clearAutoMoneyTargetTP' 'AUTO broker TP may not be erased by legacy money target'

Need $zero 'return MathMax(0.01,g_zeroGridMinNetProfitMoney);' 'ZERO exact configured target'
Forbid $zero 'g_zeroGridCloseReserveMoney' 'ZERO hidden reserve'
Forbid $zero 'ZeroGridEstimatedExitCostMoney' 'ZERO hidden estimated close cost'

Need $ea 'displayedRoundProfit>=g_raceCloseAllProfitMoney' 'RACE hard Basket target must follow the live MT5 displayed Profit values'
Need $ea 'RACE_HARD_PROFIT_TARGET' 'RACE hard Basket target must close immediately'
Forbid $ea 'RACE_PROFIT_ARM_GIVEBACK' 'RACE configured Basket target must not use profit giveback'
Need $ea 'if(g_controlMode == "FLIP_LOCK")' 'FLIP isolation must remain present'

Need $api 'else if (requestedProfitMode === "AUTO")' 'API must preserve AUTO Basket target'
Forbid $api 'requestedProfitMode === "AUTO" || requestedProfitMode === "OFF"' 'API must not clear AUTO Basket target'
Need $api 'clean.zeroGridCloseReserveMoney = 0;' 'API must normalize ZERO reserve to zero'

Forbid $web 'settingHelpLabel("auto-profit-target"' 'AUTO money target control must be hidden from the dashboard'
Forbid $web 'เป้ากำไร AUTO' 'AUTO money target label must be hidden from the dashboard'
Forbid $web 'เงินสำรองสำหรับค่าปิด' 'ZERO hidden reserve UI'
Need $web 'payload.profitRunTrailPercent = 0;' 'run-on must be disabled for hard targets'

Write-Host 'Hard profit target contract PASS'
