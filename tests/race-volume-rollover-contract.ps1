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
$raceLossV2 = Read-Text 'mt5/include/RaceLossV2.mqh'
$release = Read-Text 'apps/api/src/release-version.ts'
$analysis = Block $ea 'int RaceAnalysisDirection(double momentum)'
$flow = Block $ea 'bool RaceFlowStillRunning(int direction, double momentum)'
$harvest = Block $ea 'int RaceHarvestProfitablePositions()'
$start = Block $ea 'bool StartRaceCycle(double momentum)'
$manage = Block $ea 'bool ManageRaceBasket(double momentum)'
$wrong = Block $ea 'bool RaceWrongDirectionConfirmed('
$fill = Block $ea 'bool ProcessRaceFill(int direction)'
$raceAtr = Block $ea 'double RaceAtrStopPoints()'
$raceStop = Block $ea 'double RaceInitialStopPrice(int direction, double entryPrice)'
$raceStopReady = Block $ea 'bool RaceStopReady()'
$hardStopMultiplier = Block $ea 'double EffectiveHardStopMultiplier()'
$send = Block $ea 'bool SendMarketOrder(int direction)'
$onTick = Block $ea 'void OnTick()'

Need $ea '#define RACE_VOLUME_WINDOW_SECONDS 60' 'RACE volume window must be exactly 60 seconds'
Need $ea 'void RaceSampleVolumePressure()' 'RACE volume sampler missing'
Need $ea 'int RaceVolumeDirection()' 'RACE volume direction helper missing'
Need $onTick 'RaceSampleVolumePressure();' 'RACE volume must be sampled on every tick'
Need $onTick 'RACE_WAIT_SETTINGS_SYNC' 'RACE restart must wait for Server settings before applying money controls to an existing Basket'
$raceSyncGate = $onTick.IndexOf('RACE_WAIT_SETTINGS_SYNC')
$dailyControl = $onTick.IndexOf('HandleDailyProfitControl(count)')
$raceManager = $onTick.IndexOf('ManageRaceBasket(momentum)')
if($raceSyncGate -lt 0 -or $dailyControl -lt 0 -or $raceManager -lt 0 -or
   $raceSyncGate -gt $dailyControl -or $raceSyncGate -gt $raceManager){
  throw 'RACE settings-sync guard must execute before daily money controls and RACE Basket management'
}
Need $analysis 'int volumeDirection=RaceVolumeDirection();' 'AUTO RACE primary direction must start from rolling 60-second volume'
Need $analysis 'RaceZonePriorityActive(' 'AUTO RACE may protect an intact opposing Demand/Supply boundary'
Need $analysis 'RaceV2DecisionDirection(' 'AUTO RACE must combine 60-second volume with RACE-local Flow/Structure/Leg context after zone handling'
Need $analysis 'return decision==0 ? volumeDirection : decision;' 'AUTO RACE tie must fall back to the original 60-second volume side'
if($analysis.Contains('RaceM5CandleDirection()')){throw 'RACE entry must not use M5 candle direction'}
if($analysis.Contains('g_trend') -or $analysis.Contains('g_ema')){throw 'RACE entry direction must not leak trend/EMA into the RACE VNext decision'}
Need $ea '#include "include\\RaceFlowV2.mqh"' 'RACE Flow V2 module missing'
Need $ea '#include "include\\RaceStructureV2.mqh"' 'RACE Structure V2 module missing'
Need $ea '#include "include\\RaceLegPhaseV2.mqh"' 'RACE Leg Phase V2 module missing'
Need $ea '#include "include\\RaceDecisionV2.mqh"' 'RACE Decision V2 module missing'
Need $flow 'RaceVolumeDirection() == direction' 'RACE profit flow must follow 60-second volume side'
Need $start 'RACE_VOLUME_WARMUP' 'RACE must wait for 60-second warmup before first AUTO entry'
Need $manage 'RACE_USER_LOSS_ONLY_V5' 'RACE user-loss-only marker missing'
Need $manage 'volumeDirection != direction' 'RACE must detect a volume-side flip'
Need $manage 'cycleProfit >= 0.0' 'ordinary RACE rollover must wait on a negative net cycle unless adverse impulse is confirmed'
Need $manage 'cycleProfit < 0.0 && floatingProfit < 0.0' 'RACE adverse exit must never trigger from a profitable or flat basket'
Need $manage 'RaceV2LossState(' 'RACE must classify cost/noise, adverse watch and structure state before recovery'
Need $manage 'RACE_ADVERSE_WATCH' 'RACE must stop adding exposure while adverse evidence builds'
Need $manage 'RACE_STRUCTURE_INVALID_HOLD' 'RACE structure invalidation must hold exposure instead of instant soft-loss liquidation'
if($manage.Contains('RaceCloseCycle(wrongDirectionReason)')){throw 'RACE reversal intelligence must never close a losing Basket by itself'}
Need $manage 'RACE_REVERSAL_HOLD' 'confirmed adverse direction must hold/pause instead of closing a losing Basket'
Need $ea '#define RACE_VOLUME_HISTORY_SECONDS 60' 'RACE pressure history must retain the full 60-second window'
Need $ea 'now-g_raceVolumeLastSampleAt>RACE_VOLUME_WINDOW_SECONDS' 'RACE stalled-feed reset must preserve the 60-second entry warmup'
Need $wrong 'RACE_EXIT_CYCLE_GRACE_SECONDS' 'RACE soft-loss exit must honor cycle startup grace'
Need $wrong 'RACE_EXIT_LAST_FILL_GRACE_SECONDS' 'RACE soft-loss exit must honor grace after the latest accepted fill'
Need $wrong 'spread * 5.00' 'RACE normal adverse floor must reject ordinary spread noise'
Need $wrong 'atrM5 * 0.35' 'RACE normal adverse floor must require meaningful M5 travel'
Need $wrong 'RaceVolumeSnapshotWindow(RACE_VOLUME_WINDOW_SECONDS' 'RACE soft exit must inspect rolling 60-second pressure'
Need $wrong 'RaceVolumeSnapshotWindow(RACE_VOLUME_HISTORY_SECONDS' 'RACE soft exit confirmation must use the same 60-second pressure history'
Need $wrong 'fastOppositeShare' 'RACE soft exit must require fast opposite dominance'
Need $wrong 'slowOppositeShare' 'RACE soft exit must require slow opposite dominance'
Need $wrong 'iOpen(_Symbol, PERIOD_M1, 1)' 'RACE soft exit must use completed M1 instead of the mutable live candle'
if($wrong.Contains('iOpen(_Symbol, PERIOD_M1, 0)')){throw 'RACE soft-loss exit must not use live M1 candle'}
Need $wrong 'm1ClosedOpposite' 'RACE soft exit must require completed M1 reversal force'
Need $wrong 'momentumOpposite' 'RACE soft exit may use tick momentum only as secondary confirmation'
Need $wrong 'm5Opposite' 'RACE soft exit may use completed M5 as secondary confirmation'
Need $wrong 'g_raceExitCandidateSince = now' 'RACE reversal must enter a timed candidate before closing'
Need $wrong 'RACE_EXIT_CONFIRM_SECONDS' 'RACE normal reversal must persist before closing'
Need $wrong 'RACE_EXIT_SEVERE_CONFIRM_SECONDS' 'RACE severe reversal must still persist before closing'
Need $wrong 'g_raceExitCandidatePeakAdverse * 0.70' 'RACE reversal candidate must cancel after a 30 percent price reclaim'
Need $wrong 'RACE_PERSISTENT_REVERSAL_SEVERE_HOLD' 'persistent severe reversal hold reason missing'
Need $wrong 'RACE_PERSISTENT_REVERSAL_CONFIRMED_HOLD' 'persistent confirmed reversal hold reason missing'
if($wrong.Contains('RACE_ADVERSE_IMPULSE_SEVERE') -or $wrong.Contains('RACE_ADVERSE_IMPULSE_CONFIRMED')){throw 'Obsolete instant adverse-impulse close path remains'}
Need $fill 'g_raceLastFillAt = TimeCurrent();' 'RACE must restart soft-exit grace after every accepted fill'
Need $fill 'RaceResetExitCandidate();' 'RACE fill must cancel any stale reversal candidate'
Need $raceLossV2 'g_raceExitCandidateSince>0' 'RACE loss engine must hold an active reversal candidate instead of continuing to fill'
Need $manage 'RACE_EXIT_CANDIDATE' 'RACE candidate state must be observable'
Need $manage 'g_raceLastFillAt = g_raceCycleStartedAt' 'RACE restart recovery must rebase last-fill grace instead of disabling soft protection'
Need $manage 'RACE_VOLUME_ROLLOVER' 'RACE rollover close reason missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_BUY' 'RACE BUY rollover wait state missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_SELL' 'RACE SELL rollover wait state missing'
Need $harvest 'g_raceProfitTargetMode == "POSITION"' 'RACE per-position exit must be isolated to RACE POSITION target mode'
Need $harvest 'g_racePerPositionProfitMoney' 'RACE per-position exit must use the RACE target amount'
Need $harvest 'targetComparableProfit + 0.00000001 < perPositionTarget' 'RACE must wait until each ticket/unit reaches its money target'
Need $harvest 'baseVolume / positionVolume' 'Netting RACE must compare profit proportionally per configured-Lot unit'
Need $ea 'RACE_DIRECTION_LOCK' 'RACE must keep mixed BUY/SELL baskets blocked'
Need $raceAtr 'AverageTrueRangePoints(PERIOD_M15, g_atrPeriod)' 'RACE stop must read M15 ATR directly instead of relying on AUTO cache'
Need $raceStop 'RaceV2StructureInvalidPrice(direction)' 'RACE emergency broker stop must respect structural invalidation'
Need $fill 'RaceV1UpdateExposureTelemetry(direction,g_adaptiveLot)' 'RACE must recalculate projected exposure before every fill'
Need $manage 'RaceV1UpdateExposureTelemetry(direction,0.0)' 'RACE must refresh live Basket exposure before loss classification'
Need $ea '#include "include\\RaceExposureV1.mqh"' 'RACE Exposure V1 module missing'
Need $ea '#include "include\\RaceLossV2.mqh"' 'RACE Loss V2 module missing'
Need $raceAtr 'EffectiveHardStopMultiplier()' 'RACE stop must consume the effective isolated ATR multiplier'
Need $hardStopMultiplier 'RaceModeEnabled() || BasketHasRacePosition()' 'RACE ATR multiplier isolation gate missing'
Need $hardStopMultiplier 'return 1.50;' 'RACE stop must be fixed at M15 ATR x1.50 without changing AUTO'
Need $raceStopReady 'RACE_ATR_NOT_READY' 'RACE must wait instead of opening with a tiny placeholder stop when ATR is unavailable'
Need $fill 'if(!RaceStopReady())' 'RACE must verify ATR stop readiness before sending an order'
Need $send 'bool raceOrder = RaceModeEnabled() || BasketHasRacePosition();' 'shared order sender must identify RACE orders from execution ownership, not stale entry metadata'
Need $send 'RaceInitialStopPrice(direction, entryPrice)' 'RACE orders must use their dedicated ATR stop'
Need $send 'if(!raceOrder && !flipLockOrder && g_profitTargetMode == "AUTO"' 'AUTO TP logic must not override RACE or FLIP LOCK profit controls'
$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA release version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}
Need $release 'EA_RUNTIME_CONTRACT = "RACE_USER_LOSS_ONLY_V5"' 'API runtime contract must match EA'

Write-Host 'RACE 60-second volume + user-controlled loss V5 contract: PASS'
