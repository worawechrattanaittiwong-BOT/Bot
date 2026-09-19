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
$wrong = Block $ea 'bool RaceWrongDirectionConfirmed('
$fill = Block $ea 'bool ProcessRaceFill(int direction)'
$raceAtr = Block $ea 'double RaceAtrStopPoints()'
$raceStop = Block $ea 'double RaceInitialStopPrice(int direction, double entryPrice)'
$raceStopReady = Block $ea 'bool RaceStopReady()'
$hardStopMultiplier = Block $ea 'double EffectiveHardStopMultiplier()'
$send = Block $ea 'bool SendMarketOrder(int direction)'
$onTick = Block $ea 'void OnTick()'

Need $ea '#define RACE_VOLUME_WINDOW_SECONDS 10' 'RACE volume window must be exactly 10 seconds'
Need $ea 'void RaceSampleVolumePressure()' 'RACE volume sampler missing'
Need $ea 'int RaceVolumeDirection()' 'RACE volume direction helper missing'
Need $onTick 'RaceSampleVolumePressure();' 'RACE volume must be sampled on every tick'
Need $analysis 'return RaceVolumeDirection();' 'AUTO RACE direction must use volume only'
if($analysis.Contains('RaceM5CandleDirection()')){throw 'RACE entry must not use M5 candle direction'}
Need $flow 'RaceVolumeDirection() == direction' 'RACE profit flow must follow 10-second volume side'
Need $start 'RACE_VOLUME_WARMUP' 'RACE must wait for 10-second warmup before first AUTO entry'
Need $manage 'RACE_PERSISTENT_REVERSAL_EXIT_V4' 'RACE persistent-reversal marker missing'
Need $manage 'volumeDirection != direction' 'RACE must detect a volume-side flip'
Need $manage 'cycleProfit >= 0.0' 'ordinary RACE rollover must wait on a negative net cycle unless adverse impulse is confirmed'
Need $manage 'cycleProfit < 0.0 && floatingProfit < 0.0' 'RACE adverse exit must never trigger from a profitable or flat basket'
Need $manage 'RaceWrongDirectionConfirmed(direction,momentum,filling,wrongDirectionReason)' 'RACE must evaluate confirmed adverse impulse before recovery wait'
Need $manage 'RaceCloseCycle(wrongDirectionReason)' 'confirmed adverse impulse must close the full RACE basket'
Need $ea '#define RACE_VOLUME_HISTORY_SECONDS 30' 'RACE must retain a 30-second confirmation history while entry stays 10 seconds'
Need $ea 'now-g_raceVolumeLastSampleAt>RACE_VOLUME_WINDOW_SECONDS' 'RACE stalled-feed reset must preserve the original 10-second entry warmup'
Need $wrong 'RACE_EXIT_CYCLE_GRACE_SECONDS' 'RACE soft-loss exit must honor cycle startup grace'
Need $wrong 'RACE_EXIT_LAST_FILL_GRACE_SECONDS' 'RACE soft-loss exit must honor grace after the latest accepted fill'
Need $wrong 'spread * 5.00' 'RACE normal adverse floor must reject ordinary spread noise'
Need $wrong 'atrM5 * 0.35' 'RACE normal adverse floor must require meaningful M5 travel'
Need $wrong 'RaceVolumeSnapshotWindow(RACE_VOLUME_WINDOW_SECONDS' 'RACE soft exit must inspect fast 10-second pressure'
Need $wrong 'RaceVolumeSnapshotWindow(RACE_VOLUME_HISTORY_SECONDS' 'RACE soft exit must inspect slow 30-second pressure'
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
Need $wrong 'RACE_PERSISTENT_REVERSAL_SEVERE' 'persistent severe reversal close reason missing'
Need $wrong 'RACE_PERSISTENT_REVERSAL_CONFIRMED' 'persistent confirmed reversal close reason missing'
if($wrong.Contains('RACE_ADVERSE_IMPULSE_SEVERE') -or $wrong.Contains('RACE_ADVERSE_IMPULSE_CONFIRMED')){throw 'Obsolete instant adverse-impulse close path remains'}
Need $fill 'g_raceLastFillAt = TimeCurrent();' 'RACE must restart soft-exit grace after every accepted fill'
Need $fill 'RaceResetExitCandidate();' 'RACE fill must cancel any stale reversal candidate'
Need $manage 'g_raceExitCandidateSince > 0' 'RACE must hold an active reversal candidate instead of continuing to fill'
Need $manage 'RACE_EXIT_CANDIDATE' 'RACE candidate state must be observable'
Need $manage 'g_raceLastFillAt = g_raceCycleStartedAt' 'RACE restart recovery must rebase last-fill grace instead of disabling soft protection'
Need $manage 'RACE_VOLUME_ROLLOVER' 'RACE rollover close reason missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_BUY' 'RACE BUY rollover wait state missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_SELL' 'RACE SELL rollover wait state missing'
Need $harvest 'g_perPositionProfit > 0.0' 'RACE per-position exit must honor configured target'
Need $harvest 'netFloating + 0.00000001 < perPositionTarget' 'RACE must wait until each ticket reaches its money target'
Need $ea 'RACE_DIRECTION_LOCK' 'RACE must keep mixed BUY/SELL baskets blocked'
Need $raceAtr 'AverageTrueRangePoints(PERIOD_M15, g_atrPeriod)' 'RACE stop must read M15 ATR directly instead of relying on AUTO cache'
Need $raceAtr 'g_hardStopAtrMultiplier' 'RACE stop must honor the configured ATR multiplier'
Need $hardStopMultiplier 'RaceModeEnabled() || BasketHasRacePosition()' 'RACE ATR multiplier must not be silently changed by AUTO regime adaptation'
Need $raceStopReady 'RACE_ATR_NOT_READY' 'RACE must wait instead of opening with a tiny placeholder stop when ATR is unavailable'
Need $fill 'if(!RaceStopReady())' 'RACE must verify ATR stop readiness before sending an order'
Need $send 'bool raceOrder = RaceModeEnabled() || BasketHasRacePosition();' 'shared order sender must identify RACE orders from execution ownership, not stale entry metadata'
Need $send 'RaceInitialStopPrice(direction, entryPrice)' 'RACE orders must use their dedicated ATR stop'
Need $send 'if(!raceOrder && !flipLockOrder && g_profitTargetMode == "AUTO"' 'AUTO TP logic must not override RACE or FLIP LOCK profit controls'
Need $release 'DEFAULT_EA_VERSION = "1.0.38"' 'EA release version must match the promoted live intelligence runtime'
Need $release 'EA_RUNTIME_CONTRACT = "RACE_PERSISTENT_REVERSAL_EXIT_V4"' 'API runtime contract must match EA'

Write-Host 'RACE 10-second volume + persistent reversal V4 contract: PASS'
