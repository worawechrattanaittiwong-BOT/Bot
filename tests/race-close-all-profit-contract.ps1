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

$ea = Read-Text 'mt5/FastBasketBot.mq5'
$api = Read-Text 'apps/api/src/bot.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'
$db = Read-Text 'database/001_init.sql'
$race = Block $ea 'bool ManageRaceBasket(double momentum)'
$fastClose = Block $ea 'bool FastProfitClosePriority()'
$harvestBlock = Block $ea 'int RaceHarvestProfitablePositions()'
$raceClose = Block $ea 'bool RaceCloseCycle(string reason)'
$raceBurst = Block $ea 'int RaceClosePositionsBurst()'
$raceStop = Block $ea 'double RaceInitialStopPrice(int direction, double entryPrice)'

Need $ea 'InpRaceCloseAllProfitEnabled = true;' 'RACE Basket target must default ON for legacy compatibility'
Need $ea 'InpRaceCloseAllProfitMoney = 0.50;' 'RACE Basket target must default to 0.50'
Need $ea 'InpRacePerPositionProfitMoney = 0.50;' 'RACE per-position target default is missing'
Need $ea 'JsonString(json, "raceProfitTargetMode"' 'EA must receive RACE profit target mode'
Need $ea 'JsonNumber(json, "racePerPositionProfitMoney"' 'EA must receive RACE per-position target'
Need $race 'raceBasketProfitTarget' 'RACE Basket target ownership is missing'
Need $race 'racePerPositionProfitTarget' 'RACE per-position target ownership is missing'
Need $race 'raceStrictProfitTarget' 'RACE configured target must block hidden profitable exits'
Need $race 'RACE_CLOSE_ALL_PROFIT_TARGET' 'RACE Basket target exit is missing'
Need $race 'displayedRoundProfit >= g_raceCloseAllProfitMoney' 'RACE Basket target must use the live MT5 displayed Profit for the current round'
if($race.Contains('cycleProfit >= g_raceCloseAllProfitMoney')){throw 'RACE Basket target must not carry prior realized cycle P/L into the current round target'}
Need $fastClose 'RaceDisplayedOpenProfit()>=g_raceCloseAllProfitMoney' 'RACE fast close must use the live MT5 displayed Profit for the current round'
if($fastClose.Contains('BasketCycleProfit()>=g_raceCloseAllProfitMoney')){throw 'RACE fast close must not use historical cycle P/L'}
Need $race 'RACE_WAIT_PER_POSITION_TARGET' 'RACE must wait for configured per-position target'
Need $race 'RACE_WAIT_BASKET_TARGET' 'RACE must wait for configured Basket target'
Need $ea 'bool RaceClosePositionAsync(ulong ticket)' 'RACE close-all must have async per-ticket dispatcher'
Need $ea 'g_raceLastExitBurstMs' 'RACE close-all burst retry clock is missing'
Need $raceBurst 'RACE_CLOSE_ALL_BURST' 'RACE close-all burst marker is missing'
Need $raceBurst 'RaceClosePositionAsync(tickets[i])' 'RACE close-all must queue every captured ticket'
Need $raceClose 'RaceClosePositionsBurst();' 'RACE Basket close must use burst dispatch'
if($raceClose.Contains('CloseAllBasket(reason)')){throw 'RACE Basket close still uses sequential global CloseAllBasket'}
Need $race 'RaceClosePositionsBurst();' 'RACE CLOSING retry must remain burst-based'
Need $ea 'bool FastProfitClosePriority()' 'ZERO/RACE exact profit fast path is missing'
Need $ea 'CLOSE_FAST_PATH_V157' 'ZERO/RACE fast close marker is missing'
Need $ea 'nowMs-g_zeroGridLastExitBurstMs<30' 'ZERO close retry must be 30 ms'
Need $ea 'nowMs-g_raceLastExitBurstMs<30' 'RACE close retry must be 30 ms'
Need $ea 'if(FastProfitClosePriority())' 'profit fast path must run before normal tick/timer work'
Need $harvestBlock 'g_raceProfitTargetMode == "POSITION"' 'RACE harvest must run only in per-position mode'
Need $harvestBlock 'g_racePerPositionProfitMoney' 'RACE harvest must use its dedicated per-position amount'
Need $harvestBlock 'PositionGetDouble(POSITION_PROFIT)' 'RACE per-position target must follow the MT5 displayed Profit value'
if($harvestBlock.Contains('PositionGetDouble(POSITION_SWAP)')){throw 'RACE per-position target must not alter the displayed MT5 Profit with swap'}
Need $ea 'double RaceDisplayedOpenProfit()' 'RACE displayed-profit helper missing'
Need $raceStop 'double points = RaceAtrStopPoints();' 'RACE stop must use RACE ATR only'
if($raceStop.Contains('g_manualStopLossPoints')){throw 'MANUAL Stop Loss still leaks into RACE'}

Need $api 'numberSetting("racePerPositionProfitMoney", 0.01, maxAccountMoney)' 'API must validate RACE per-position target with the account-currency-safe limit'
Need $api 'body.raceProfitTargetMode' 'API must validate RACE target mode'
Need $api '["BASKET", "POSITION", "OFF"]' 'API RACE target mode choices missing'
Need $api 'clean.raceCloseAllProfitEnabled = raceMode === "BASKET"' 'Legacy RACE switch must mirror Basket mode only'

Need $web 'raceProfitTargetMode: "BASKET"' 'Dashboard default RACE target mode must be Basket'
Need $web 'racePerPositionProfitMoney: 0.5' 'Dashboard default RACE per-position target missing'
Need $web 'รูปแบบกำไร</span>' 'RACE profit selector must be visible'
Need $web 'เป้ากำไรต่อไม้' 'RACE per-position target input missing'
Need $web 'เป้ากำไรทั้งชุด' 'RACE Basket target input missing'

Need $db '"raceProfitTargetMode":"BASKET"' 'New accounts must default RACE target mode to Basket'
Need $db '"racePerPositionProfitMoney":0.5' 'New accounts must default RACE per-position target'

Write-Host 'RACE Basket/per-position strict profit target contract: PASS'
