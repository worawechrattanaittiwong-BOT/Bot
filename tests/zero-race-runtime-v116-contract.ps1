param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\\FastBasketBot.mq5"
)
$ErrorActionPreference = "Stop"
$ea = [System.IO.File]::ReadAllText((Resolve-Path $EaPath))

function Block([string]$sig) {
  $s=$ea.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}
  $b=$ea.IndexOf("{",$s); $d=0
  for($i=$b;$i -lt $ea.Length;$i++){
    if($ea[$i] -eq "{"){$d++}
    elseif($ea[$i] -eq "}"){$d--; if($d -eq 0){return $ea.Substring($s,$i-$s+1)}}
  }
  throw "Unclosed $sig"
}

$zero=Block "bool ZeroGridEnsureLadder()"
$start=Block "bool StartZeroGridCycle()"
$manage=Block "bool ManageZeroGrid()"
$onTick=Block "void OnTick()"
$onTimer=Block "void OnTimer()"
$race=Block "bool ManageRaceBasket(double momentum)"

if(-not $zero.Contains("ZERO_PAIR_ATOMIC_V116")){throw "ZERO atomic pair marker missing"}
if(-not $zero.Contains("ZeroGridFlatLevelPairValid(level)")){throw "ZERO pair validation missing"}
if(-not $zero.Contains("ZERO_GRID_PAIR_ROLLBACK")){throw "ZERO pair rollback missing"}
if(-not $zero.Contains("ZeroGridPendingCount()!=levels*2")){throw "ZERO full configured ladder check missing"}
if(-not $start.Contains("bool ladderReady=ZeroGridEnsureLadder();")){throw "ZERO Start must require complete ladder"}
if(-not $manage.Contains("bool ladderReady=ZeroGridEnsureLadder();")){throw "ZERO Manage must preserve build/retry status"}
if(-not $onTick.Contains("g_zeroGridClosing || ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0")){throw "ZERO async close finalization ownership missing"}
if(-not $onTimer.Contains("ZERO_GRID_TIMER_MAINTENANCE_V116")){throw "ZERO timer maintenance missing"}
if(-not $ea.Contains("g_zeroGridLastExitBurstMs=0;")){throw "ZERO burst reset missing"}
if(-not $ea.Contains("TRADE_RETCODE_PRICE_OFF")){throw "ZERO PRICE_OFF retry missing"}

$h=$race.IndexOf("RaceHarvestProfitablePositions()")
$f=$race.IndexOf("if(filling)")
if($h -lt 0 -or $f -lt 0 -or $h -gt $f){throw "RACE profit harvest must happen before fill gate"}
if($race.Contains("Harvesting starts only after Max Positions is reached")){throw "obsolete RACE profit delay still present"}
if(-not $race.Contains("RACE_PROFIT_FIRST_V116")){throw "RACE v1.0.16 marker missing"}
if(-not $ea.Contains('EffectiveExecutionMode() == "AUTO"')){throw "AUTO isolation unexpectedly changed"}

Write-Host "ZERO paired full ladder + async rearm + RACE profit-first contract: PASS"
