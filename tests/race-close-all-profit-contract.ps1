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

Need $ea 'InpRaceCloseAllProfitEnabled = true;' 'RACE close-all switch must default ON in EA'
Need $ea 'InpRaceCloseAllProfitMoney = 0.50;' 'RACE close-all target must default to 0.50 in EA'
Need $ea 'JsonBool(json, "raceCloseAllProfitEnabled"' 'EA must receive the RACE close-all switch from settings'
Need $ea 'JsonNumber(json, "raceCloseAllProfitMoney"' 'EA must receive the RACE close-all money target from settings'
Need $race 'RACE_CLOSE_ALL_PROFIT_TARGET' 'RACE close-all profit exit is missing'
Need $race 'cycleProfit >= g_raceCloseAllProfitMoney' 'RACE close-all must use net cycle profit'
$closeAll = $race.IndexOf('RACE_CLOSE_ALL_PROFIT_TARGET')
$harvest = $race.IndexOf('RaceHarvestProfitablePositions()')
if($closeAll -lt 0 -or $harvest -lt 0 -or $closeAll -gt $harvest){throw 'RACE close-all target must run before individual profit harvest'}

Need $api 'booleanSetting("raceCloseAllProfitEnabled")' 'API must validate the RACE close-all switch'
Need $api 'numberSetting("raceCloseAllProfitMoney", 0.01, 100000)' 'API must validate the RACE close-all target'
Need $api 'clean.raceCloseAllProfitEnabled = true' 'API RACE default switch must be ON'
Need $api 'clean.raceCloseAllProfitMoney = 0.5' 'API RACE default target must be 0.5'

Need $web 'raceCloseAllProfitEnabled: true' 'Dashboard default switch must be ON'
Need $web 'raceCloseAllProfitMoney: 0.5' 'Dashboard default target must be 0.5'
Need $web 'ปิดไม้ทั้งหมดที่กำไร' 'RACE close-all switch must be visible in the dashboard'
Need $web 'ปิดทั้งหมดเมื่อถึงเป้า' 'RACE switch copy is missing'

Need $db '"raceCloseAllProfitEnabled":true' 'New bot settings must default RACE close-all to ON'
Need $db '"raceCloseAllProfitMoney":0.5' 'New bot settings must default RACE close-all target to 0.5'

Write-Host 'RACE close-all profit switch/target contract: PASS'
