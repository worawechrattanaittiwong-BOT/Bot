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
$release = Read-Text 'apps/api/src/release-version.ts'
$analysis = Block $ea 'int RaceAnalysisDirection(double momentum)'
$flow = Block $ea 'bool RaceFlowStillRunning(int direction, double momentum)'
$wrong = Block $ea 'bool RaceWrongDirectionConfirmed('
$fill = Block $ea 'bool ProcessRaceFill(int direction)'
$start = Block $ea 'bool StartRaceCycle(double momentum)'
$manage = Block $ea 'bool ManageRaceBasket(double momentum)'
$pacing = Block $ea 'bool RaceFillPacingReady(int direction)'
$regime = Block $ea 'int RaceM5TwentyBarRegime(double &scoreOut)'
$zoneBreak = Block $ea 'int RaceConfirmedZoneBreakDirection()'
$zoneHold = Block $ea 'int RaceHeldZoneReversalDirection()'
$dual = Block $ea 'bool RacePerPositionDualDirectionEnabled()'
$counter = Block $ea 'int CounterSignalDirection()'
$raceStop = Block $ea 'double RaceInitialStopPrice(int direction, double entryPrice)'

# RACE brain: ~20 completed M5 candles, not 2-second Bid or 30-second volume.
Need $ea '#define RACE_M5_LOOKBACK_BARS 20' 'RACE must inspect about 20 M5 candles'
Need $regime 'CopyRates(_Symbol,PERIOD_M5,1,RACE_M5_LOOKBACK_BARS,rates)' 'RACE M5 regime must use completed M5 bars'
Need $regime 'downSteps>=9' 'RACE gradual-down regime detection missing'
Need $regime 'upSteps>=9' 'RACE gradual-up regime detection missing'
Need $analysis 'RaceM5TwentyBarRegime(regimeScore)' 'RACE direction must use the 20-bar M5 regime'
Need $analysis 'RaceM5LiveSwingDirection()' 'RACE sideway timing must use the current M5 swing'
Need $analysis 'direction=-liveSwing;' 'RACE sideway must fade the current M5 swing'
Need $analysis 'RaceHeldZoneReversalDirection()' 'RACE must let intact Demand/Supply reverse the side'
Need $analysis 'RaceConfirmedZoneBreakDirection()' 'RACE must follow a confirmed Demand/Supply break'
Forbid $analysis 'RaceLivePriceDirection()' 'RACE must not use the COUNTER two-second Bid helper'
Forbid $analysis 'RaceVolumeDirection()' 'RACE must not use rolling 30-second volume for direction'

# Demand/Supply: hold reverses; a completed M5 close beyond a buffered far edge follows the break.
Need $zoneBreak 'closed[0].close<g_demandZoneLow-buffer' 'Demand break must require a completed M5 close beyond the zone'
Need $zoneBreak 'closed[0].close>g_supplyZoneHigh+buffer' 'Supply break must require a completed M5 close beyond the zone'
Need $zoneBreak 'RACE_ZONE_BREAK_BUFFER_ATR' 'Zone break must include an ATR buffer'
Need $zoneHold 'PriceInsideOrNearZone(' 'Held zone reversal must use actual Demand/Supply location'
Need $manage 'RACE_DEMAND_HOLD_REVERSAL_BUY' 'SELL at held Demand must close for BUY handoff'
Need $manage 'RACE_SUPPLY_HOLD_REVERSAL_SELL' 'BUY at held Supply must close for SELL handoff'
Need $manage 'RACE_DEMAND_BREAK_FOLLOW_SELL' 'Broken Demand must abandon BUY and follow SELL'
Need $manage 'RACE_SUPPLY_BREAK_FOLLOW_BUY' 'Broken Supply must abandon SELL and follow BUY'

# Do not exit on short noise: ordinary soft exit needs M5 structure + opposite M5 regime.
Need $wrong 'RaceV2StructureBroken(direction)' 'RACE soft exit must still require broken M5 structure'
Need $wrong 'RaceM5TwentyBarRegime(regimeScore)' 'RACE soft exit must use the M5 regime'
Need $wrong 'RACE_EXIT_CYCLE_GRACE_SECONDS' 'RACE soft exit cycle grace must remain'
Need $wrong 'RACE_EXIT_LAST_FILL_GRACE_SECONDS' 'RACE soft exit last-fill grace must remain'
Need $wrong 'RACE_EXIT_CONFIRM_SECONDS' 'RACE ordinary reversal must retain persistence confirmation'
Forbid $wrong 'RaceVolumeDirection()' '30-second flow must not close RACE'
Forbid $flow 'RaceVolumeDirection()' '30-second flow must not own RACE profit-run exit'
Need $flow 'RaceM5TwentyBarRegime(regimeScore)' 'RACE profit-run must use M5 structure'

# Add speed: no pending traps, at least 2 seconds between accepted RACE fills,
# and same-side adds require favorable price progress.
Need $ea '#define RACE_FILL_INTERVAL_MS 2000' 'RACE fill pacing must be 2 seconds'
Need $pacing 'nowMs-g_raceLastFillMs<(ulong)RACE_FILL_INTERVAL_MS' 'RACE pacing timer missing'
Need $pacing 'RACE_WAIT_PRICE_PROGRESS' 'RACE same-side progress gate missing'
Need $pacing 'atrPoints*RACE_FILL_PROGRESS_ATR' 'RACE progress must scale with M5 ATR'
Need $fill 'RaceFillPacingReady(direction)' 'Every RACE add must pass dedicated pacing'
Need $fill 'SendMarketOrder(direction)' 'RACE must continue using immediate market orders'
Forbid $fill 'ORDER_TYPE_BUY_STOP' 'RACE must not place BUY STOP trap orders'
Forbid $fill 'ORDER_TYPE_SELL_STOP' 'RACE must not place SELL STOP trap orders'
Forbid $fill 'RaceAntiChaseBlocked(' 'RACE fill path must not add an anti-chase trap gate'
Need $fill 'g_entryModel = "RACE_M5_20_STRUCTURE";' 'RACE telemetry must identify the new M5 brain'

# One structural RACE side at a time; reverse by closing old exposure first.
Need $dual 'return false;' 'RACE must not accumulate simultaneous BUY/SELL structural inventory'
Need $fill 'RACE_DIRECTION_LOCK' 'RACE one-way cycle direction lock must remain'

# COUNTER remains isolated from RACE and follows its dedicated 2-second Bid signal.
Need $counter 'int graphDirection=RaceLivePriceDirection();' 'COUNTER two-second Bid signal changed unexpectedly'
Need $counter 'if(graphDirection>0) return 1;' 'COUNTER graph-up BUY rule changed unexpectedly'
Need $counter 'if(graphDirection<0) return -1;' 'COUNTER graph-down SELL rule changed unexpectedly'

# Existing RACE Broker SL contract is preserved.
Need $raceStop 'RaceV2StructureInvalidPrice(direction)' 'RACE structure-first Broker SL must remain'
Need $raceStop 'RACE_AUTO_STOP_ATR_FLOOR' 'RACE SL ATR floor changed unexpectedly'
Need $raceStop 'RACE_AUTO_STOP_ATR_CAP' 'RACE SL ATR cap changed unexpectedly'

$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA/API version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'RACE 1.1.20 M5-20 structure + Demand/Supply handoff + paced market-fill isolation: PASS'
