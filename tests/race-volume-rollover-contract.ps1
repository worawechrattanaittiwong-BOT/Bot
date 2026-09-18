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
$release = Read-Text 'apps/api/src/release-version.ts'
$analysis = Block $ea 'int RaceAnalysisDirection(double momentum)'
$flow = Block $ea 'bool RaceFlowStillRunning(int direction, double momentum)'
$harvest = Block $ea 'int RaceHarvestProfitablePositions()'
$start = Block $ea 'bool StartRaceCycle(double momentum)'
$manage = Block $ea 'bool ManageRaceBasket(double momentum)'
$onTick = Block $ea 'void OnTick()'

Need $ea '#define RACE_VOLUME_WINDOW_SECONDS 10' 'RACE volume window must be exactly 10 seconds'
Need $ea 'void RaceSampleVolumePressure()' 'RACE volume sampler missing'
Need $ea 'int RaceVolumeDirection()' 'RACE volume direction helper missing'
Need $onTick 'RaceSampleVolumePressure();' 'RACE volume must be sampled on every tick'
Need $analysis 'return RaceVolumeDirection();' 'AUTO RACE direction must use volume only'
if($analysis.Contains('RaceM5CandleDirection()')){throw 'RACE entry must not use M5 candle direction'}
Need $flow 'RaceVolumeDirection() == direction' 'RACE profit flow must follow 10-second volume side'
Need $start 'RACE_VOLUME_WARMUP' 'RACE must wait for 10-second warmup before first AUTO entry'
Need $manage 'RACE_VOLUME_10S_ROLLOVER_V1' 'RACE safe rollover marker missing'
Need $manage 'volumeDirection != direction' 'RACE must detect a volume-side flip'
Need $manage 'cycleProfit >= 0.0' 'RACE rollover must not force-close a negative net cycle'
Need $manage 'RACE_VOLUME_ROLLOVER' 'RACE rollover close reason missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_BUY' 'RACE BUY rollover wait state missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_SELL' 'RACE SELL rollover wait state missing'
Need $harvest 'g_perPositionProfit > 0.0' 'RACE per-position exit must honor configured target'
Need $harvest 'netFloating + 0.00000001 < perPositionTarget' 'RACE must wait until each ticket reaches its money target'
Need $ea 'RACE_DIRECTION_LOCK' 'RACE must keep mixed BUY/SELL baskets blocked'
Need $release 'DEFAULT_EA_VERSION = "1.0.26"' 'EA release version must match the promoted live intelligence runtime'
Need $release 'EA_RUNTIME_CONTRACT = "RACE_VOLUME_10S_ROLLOVER_V1"' 'API runtime contract must match EA'

Write-Host 'RACE 10-second volume + safe rollover contract: PASS'
