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
$raceReentryV1 = Read-Text 'mt5/include/RaceReentryV1.mqh'
$raceNewsV1 = Read-Text 'mt5/include/RaceNewsV1.mqh'
$raceTelemetryV1 = Read-Text 'mt5/include/RaceTelemetryV1.mqh'
$api = Read-Text 'apps/api/src/ea.controller.ts'
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
Need $manage 'RACE_CONFIGURED_LOSS_ONLY_V1' 'RACE configured-loss-only marker missing'
Need $manage 'volumeDirection != direction' 'RACE must detect a volume-side flip'
Need $manage 'cycleProfit >= 0.0' 'ordinary RACE rollover must not close a negative net cycle'
Need $manage 'cycleProfit < 0.0 && floatingProfit < 0.0' 'RACE negative-state classification must only run while the Basket is negative'
Need $manage 'RaceV2LossState(' 'RACE must classify cost/noise, adverse watch and structure state before recovery'
Need $manage 'RACE_ADVERSE_WATCH' 'RACE must stop adding exposure while adverse evidence builds'
Need $manage 'RACE_STRUCTURE_INVALID_HOLD' 'RACE structure invalidation must hold exposure instead of liquidating it'
if($manage.Contains('g_raceLossState=="REVERSAL_EXIT"') -or $manage.Contains('RaceCloseCycle(wrongDirectionReason')){
  throw 'RACE intelligence must not close a losing Basket in v1.0.100'
}
Need $wrong 'RaceResetExitCandidate();' 'RACE disabled soft-loss brain must clear stale exit candidates'
Need $wrong 'return false;' 'RACE wrong-direction helper must never authorize a loss close'
if($wrong.Contains('RaceVolumeSnapshotWindow(') -or $wrong.Contains('RACE_DISTANCE_ARMED')){
  throw 'Obsolete intelligent RACE loss-close logic remains enabled'
}
if($raceLossV2.Contains('RaceWrongDirectionConfirmed(') -or $raceLossV2.Contains('"REVERSAL_EXIT"') -or $raceLossV2.Contains('"EXIT_CANDIDATE"')){
  throw 'RACE Loss V2 must classify/hold only and never emit a closing state'
}
Need $raceLossV2 'RACE_STRUCTURE_INVALID' 'RACE Loss V2 structure hold state missing'
Need $raceLossV2 'RACE_ADVERSE_WATCH' 'RACE Loss V2 adverse watch state missing'
Need $manage 'g_raceLastFillAt = g_raceCycleStartedAt' 'RACE restart recovery must preserve recovered-cycle timing telemetry'
Need $manage 'RACE_VOLUME_ROLLOVER' 'RACE rollover close reason missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_BUY' 'RACE BUY rollover wait state missing'
Need $manage 'RACE_VOLUME_ROLLOVER_WAIT_SELL' 'RACE SELL rollover wait state missing'
Need $harvest 'g_raceProfitTargetMode == "POSITION"' 'RACE per-position exit must be isolated to RACE POSITION target mode'
Need $harvest 'g_racePerPositionProfitMoney' 'RACE per-position exit must use the RACE target amount'
Need $harvest 'targetComparableProfit + 0.00000001 < perPositionTarget' 'RACE must wait until each ticket/unit reaches its money target'
Need $harvest 'baseVolume / positionVolume' 'Netting RACE must compare profit proportionally per configured-Lot unit'
Need $ea 'RACE_DIRECTION_LOCK' 'RACE must keep mixed BUY/SELL baskets blocked'
Need $raceAtr 'AverageTrueRangePoints(PERIOD_M5, g_atrPeriod)' 'RACE v1.0.100 stop must use M5 ATR for a closer scalp stop'
Need $raceStop 'RaceV2StructureInvalidPrice(direction)' 'RACE stop must use nearby structure to tighten placement'
Need $raceStop 'double minDistancePoints' 'RACE stop must keep a minimum anti-noise distance'
Need $raceStop 'structureDistancePoints < selectedDistancePoints' 'RACE structure may tighten but never widen the configured stop'
Need $raceStop 'MathMax(minDistancePoints,' 'RACE structure tightening must respect the minimum stop floor'
Need $fill 'RaceV1UpdateExposureTelemetry(direction,g_adaptiveLot)' 'RACE must recalculate projected exposure before every fill'
Need $manage 'RaceV1UpdateExposureTelemetry(direction,0.0)' 'RACE must refresh live Basket exposure before loss classification'
Need $ea '#include "include\\RaceExposureV1.mqh"' 'RACE Exposure V1 module missing'
Need $ea '#include "include\\RaceLossV2.mqh"' 'RACE Loss V2 module missing'
Need $ea '#include "include\\RaceReentryV1.mqh"' 'RACE Re-entry V1 module missing'
Need $start 'RaceReentryDetectFlatTransition();' 'RACE must detect the previous Basket flat transition before starting a new cycle'
Need $start 'if(!RaceReentryObserveReady())' 'RACE must wait through the re-entry observation window'
Need $fill 'RaceReentryMarkExposure();' 'RACE must remember accepted exposure for the next flat transition'
Need $raceReentryV1 '#define RACE_REENTRY_OBSERVE_SECONDS 4' 'RACE re-entry observation must stay inside the requested 3-5 second window'
Need $raceReentryV1 'RACE_REENTRY_OBSERVE' 'RACE re-entry wait state must be observable'
Need $ea '#include "include\\RaceNewsV1.mqh"' 'RACE News V1 module missing'
Need $start 'RaceNewsPauseActive(raceNewsReason)' 'RACE must check high-impact news before a new cycle'
Need $fill 'RaceNewsPauseActive(raceNewsReason)' 'RACE must stop additional fills during an active news window'
Need $raceNewsV1 'RACE_NEWS_BEFORE_MAJOR_MINUTES 15' 'RACE major-news pre-window must be 15 minutes'
Need $raceNewsV1 'RACE_NEWS_AFTER_MAJOR_MINUTES 15' 'RACE major-news post-window must be 15 minutes'
Need $raceNewsV1 'CALENDAR_IMPORTANCE_HIGH' 'RACE news pause must remain limited to high-impact calendar events'
Need $ea '#include "include\\RaceTelemetryV1.mqh"' 'RACE Telemetry V1 module missing'
Need $ea 'journalControlMode=="RACE"' 'RACE deal telemetry must be isolated by actual deal ownership'
Need $ea 'RaceTelemetryCurrentJsonFragment()+"}"' 'RACE deal journal must persist VNext context'
Need $ea 'bool raceTelemetryRelevant=' 'RACE heartbeat telemetry relevance guard missing'
Need $raceTelemetryV1 'raceTelemetryVersion' 'RACE telemetry schema version missing'
Need $raceTelemetryV1 'raceNoiseMoney' 'RACE telemetry must expose exposure-scaled noise money'
Need $raceTelemetryV1 'raceLegPhase' 'RACE telemetry must expose leg phase'
Need $api 'raceTelemetryVersion?: number;' 'API journal input must accept RACE telemetry'
Need $api 'raceProjectedStructureLossMoney: Math.max(0, n(body.raceProjectedStructureLossMoney))' 'API must persist RACE projected structure loss in journal metadata'
Need $api 'raceRiskMismatch: body.raceRiskMismatch === true' 'API must persist RACE exposure-risk mismatch'
Need $raceAtr 'EffectiveHardStopMultiplier()' 'RACE stop must consume the configured ATR multiplier'
Need $hardStopMultiplier 'RaceModeEnabled() || BasketHasRacePosition()' 'RACE ATR multiplier isolation gate missing'
Need $hardStopMultiplier 'return MathMax(0.5, MathMin(10.0, multiplier));' 'RACE must honor the configured ATR multiplier'
if($hardStopMultiplier.Contains('return 1.50;')){throw 'Obsolete fixed RACE M15 x1.50 stop remains'}
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
Need $release 'EA_RUNTIME_CONTRACT = "RACE_CONFIGURED_LOSS_ONLY_V1"' 'API runtime contract must match EA'

Write-Host 'RACE v1.0.100 60-second flow + configured-loss-only contract: PASS'
