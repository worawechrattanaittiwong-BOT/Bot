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
# Contract checks below distinguish executable code from explanatory comments.
# Otherwise a comment that names a forbidden helper can create a false positive.
$raceLossV2Code = $raceLossV2 -replace '(?m)//.*
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
$raceAutoStop = Block $ea 'double RaceAutoAtrStopMultiplier(double atrPoints)'
$raceAtr = Block $ea 'double RaceAtrStopPoints()'
$raceStop = Block $ea 'double RaceInitialStopPrice(int direction, double entryPrice)'
$raceStopReady = Block $ea 'bool RaceStopReady()'
$hardStopMultiplier = Block $ea 'double EffectiveHardStopMultiplier()'
$send = Block $ea 'bool SendMarketOrder(int direction)'
$retry = Block $ea 'bool OrderSendWithPriceRetry('
$onTick = Block $ea 'void OnTick()'

Need $ea '#define RACE_VOLUME_WINDOW_SECONDS 30' 'RACE volume window must be exactly 30 seconds'
Need $ea '#define RACE_SIGNAL_MAX_WAIT_SECONDS 60' 'RACE unresolved signal window must reset by 60 seconds'
Need $ea '#define RACE_VOLUME_MIN_DOMINANCE 0.55' 'RACE 30-second flow must reject near-tie pressure'
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
Need $analysis 'int volumeDirection=RaceVolumeDirection();' 'AUTO RACE primary direction must start from rolling 30-second volume'
Need $analysis 'RaceZonePriorityActive(' 'AUTO RACE may protect an intact opposing Demand/Supply boundary'
Need $analysis 'RaceV2DecisionDirection(' 'AUTO RACE must combine 30-second volume with RACE-local Flow/Structure/Leg context after zone handling'
Need $analysis 'return decision==0 ? volumeDirection : decision;' 'AUTO RACE tie may fall back to the qualified 30-second volume side'
if($analysis.Contains('RaceM5CandleDirection()')){throw 'RACE entry must not use M5 candle direction'}
if($analysis.Contains('g_trend') -or $analysis.Contains('g_ema')){throw 'RACE entry direction must not leak trend/EMA into the RACE VNext decision'}
Need $ea '#include "include\\RaceFlowV2.mqh"' 'RACE Flow V2 module missing'
Need $ea '#include "include\\RaceStructureV2.mqh"' 'RACE Structure V2 module missing'
Need $ea '#include "include\\RaceLegPhaseV2.mqh"' 'RACE Leg Phase V2 module missing'
Need $ea '#include "include\\RaceDecisionV2.mqh"' 'RACE Decision V2 module missing'
Need $flow 'RaceVolumeDirection() == direction' 'RACE profit flow must follow qualified 30-second volume side'
Need $start 'RACE_VOLUME_WARMUP' 'RACE must wait for the 30-second warmup before first AUTO entry'
Need $start 'RACE_SIGNAL_MAX_WAIT_SECONDS' 'RACE start cycle must enforce the 60-second maximum signal wait'
Need $start 'RACE_SIGNAL_TIMEOUT_RESET' 'RACE must skip and reset an unresolved 60-second signal window'
Need $start 'bool started=ProcessRaceFill(direction);' 'RACE must attempt a valid signal before expiring the 60-second window'
Need $start 'if(!started &&' 'RACE must reset a blocked unresolved entry after the 60-second maximum wait'
Need $ea '#define SCENOVA_RUNTIME_CONTRACT "RACE_CONFIGURED_LOSS_ONLY_V1"' 'RACE compatibility runtime marker missing'
Need $manage 'volumeDirection != direction' 'RACE must detect a volume-side flip'
Need $manage 'cycleProfit >= 0.0' 'ordinary RACE rollover must not close a negative net cycle'
Need $manage 'cycleProfit < 0.0 && floatingProfit < 0.0' 'RACE negative-state classification must only run while the Basket is negative'
Need $manage 'RaceV2LossState(' 'RACE must classify cost/noise, adverse watch and structure state before recovery'
Need $manage 'RaceWrongDirectionConfirmed(' 'RACE negative Basket must pass the isolated confirmed soft-exit gate'
Need $manage 'RaceCloseCycle(wrongDirectionReason)' 'RACE confirmed soft exit must close through the RACE-only cycle closer'
Need $manage 'RACE_ADVERSE_WATCH' 'RACE must stop adding exposure while adverse evidence builds'
Need $manage 'RACE_STRUCTURE_INVALID_HOLD' 'RACE unconfirmed structure invalidation must remain a hold state'
Need $manage 'RACE_ADD_WAIT_PROFIT' 'RACE must block additional fills while the open Basket or full cycle is not profitable'
Need $manage 'if(floatingProfit<=0.0 || cycleProfit<=0.0)' 'RACE pyramid gate must forbid adding while the net cycle is still losing'
Need $wrong 'RaceV2StructureBroken(direction)' 'RACE soft exit must require broken M5 structure'
Need $wrong 'RaceVolumeDirection()' 'RACE soft exit must require the 30-second order-flow side'
Need $wrong 'oppositeVolume' 'RACE soft exit must require opposite order flow'
Need $wrong 'RACE_EXIT_CYCLE_GRACE_SECONDS' 'RACE soft exit must preserve a cycle grace period'
Need $wrong 'RACE_EXIT_LAST_FILL_GRACE_SECONDS' 'RACE soft exit must preserve a last-fill grace period'
Need $wrong 'g_raceExitCandidateSince' 'RACE soft exit must persist confirmation across ticks'
Need $wrong 'RACE_EXIT_SEVERE_CONFIRM_SECONDS' 'RACE strong reversal must still require confirmation time'
Need $wrong 'RACE_EXIT_CONFIRM_SECONDS' 'RACE normal structure+flow reversal must require confirmation time'
Need $wrong 'RACE_SOFT_EXIT_STRONG_REVERSAL' 'RACE strong confirmed soft-exit reason missing'
Need $wrong 'RACE_SOFT_EXIT_STRUCTURE_FLOW' 'RACE confirmed structure+flow soft-exit reason missing'
if($wrong.Contains('RACE_DISTANCE_ARMED')){
  throw 'Obsolete distance-only RACE loss-close logic must remain disabled'
}
if($raceLossV2Code.Contains('RaceWrongDirectionConfirmed(') -or $raceLossV2Code.Contains('"REVERSAL_EXIT"') -or $raceLossV2Code.Contains('"EXIT_CANDIDATE"')){
  throw 'RACE Loss V2 must classify/hold only and never emit a closing state'
}
if($raceLossV2Code.Contains('RaceResetExitCandidate()')){
  throw 'RACE Loss V2 classifier must not reset the 5-8 second soft-exit confirmation clock'
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
Need $raceAtr 'AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)' 'RACE 1.1.10 automatic stop must use M5 ATR'
Need $raceStop 'RaceV2StructureInvalidPrice(direction)' 'RACE stop must use M5 structure as the primary invalidation reference'
Need $raceStop 'double minDistancePoints' 'RACE stop must keep a minimum anti-noise distance'
Need $raceStop 'double maxDistancePoints' 'RACE stop must keep an automatic maximum safety distance'
Need $raceStop 'structureDistancePoints>0.0' 'RACE structure distance must be validated before use'
Need $fill 'RaceV1UpdateExposureTelemetry(direction,g_adaptiveLot)' 'RACE must recalculate projected exposure before every fill'
Need $manage 'RaceV1UpdateExposureTelemetry(direction,0.0)' 'RACE must refresh live Basket exposure before loss classification'
Need $ea '#include "include\\RaceExposureV1.mqh"' 'RACE Exposure V1 module missing'
Need $ea '#include "include\\RaceLossV2.mqh"' 'RACE Loss V2 module missing'
Need $ea '#include "include\\RaceReentryV1.mqh"' 'RACE Re-entry V1 module missing'
Need $start 'RaceReentryDetectFlatTransition();' 'RACE must detect the previous Basket flat transition before starting a new cycle'
Need $start 'if(!RaceReentryObserveReady())' 'RACE must wait through the re-entry observation window'
Need $fill 'RaceReentryMarkExposure();' 'RACE must remember accepted exposure for the next flat transition'
Need $raceReentryV1 '#define RACE_REENTRY_PROFIT_OBSERVE_SECONDS 6' 'RACE profitable-cycle re-entry observation must stay fast'
Need $raceReentryV1 '#define RACE_REENTRY_LOSS_OBSERVE_SECONDS 20' 'RACE losing-cycle re-entry must enforce a longer observation period'
Need $raceReentryV1 'previousCycleWasLoss' 'RACE re-entry must distinguish losing cycles from profitable cycles'
Need $raceReentryV1 'RaceResetVolumeWindow(now);' 'RACE losing-cycle re-entry must discard stale pressure and rebuild fresh 30-second flow'
Need $raceReentryV1 'RACE_REENTRY_AFTER_LOSS' 'RACE losing-cycle re-entry state must be observable'
Need $raceReentryV1 'RACE_REENTRY_AFTER_PROFIT' 'RACE profitable-cycle re-entry state must be observable'
Need $manage 'g_raceLastObservedCycleProfit=cycleProfit;' 'RACE must preserve the last open-cycle P/L for post-flat re-entry classification'
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
Need $ea '#define RACE_AUTO_STOP_ATR_BASE 1.50' 'RACE automatic hard-stop baseline must start at 1.50 ATR'
Need $ea '#define RACE_AUTO_STOP_ATR_WIDE 1.60' 'RACE automatic hard-stop normal wide bound must be 1.60 ATR'
Need $ea '#define RACE_AUTO_STOP_ATR_FLOOR 1.00' 'RACE automatic hard-stop anti-noise floor must be 1.00 ATR'
Need $ea '#define RACE_AUTO_STOP_ATR_CAP 1.80' 'RACE automatic hard-stop safety cap must be 1.80 ATR'
Need $raceAutoStop 'CurrentSpreadPoints()' 'RACE automatic ATR fallback must adapt to live spread versus M5 volatility'
Need $raceAutoStop 'RACE_AUTO_STOP_ATR_BASE' 'RACE automatic stop helper must use the 1.50 ATR baseline'
Need $raceAutoStop 'RACE_AUTO_STOP_ATR_WIDE' 'RACE automatic stop helper must stay inside the 1.50-1.60 normal range'
Need $raceAtr 'RaceAutoAtrStopMultiplier(atr)' 'RACE ATR fallback must use the automatic multiplier'
if($raceAtr.Contains('EffectiveHardStopMultiplier()')){throw 'RACE must not inherit the shared hard-stop multiplier'}
Need $raceStop 'RACE_AUTO_STOP_ATR_FLOOR' 'RACE structure stop must keep a one-ATR anti-noise floor'
Need $raceStop 'double maxDistancePoints=atrM5Points*RACE_AUTO_STOP_ATR_CAP;' 'RACE 1.80 ATR maximum must be a real hard cap, not widened by the floor'
Need $raceStop 'minDistancePoints>maxDistancePoints' 'RACE must reject entries whose broker/spread floor exceeds the 1.80 ATR cap'
Need $raceStop 'RACE_STOP_RISK_TOO_WIDE' 'RACE must expose an explicit status when the hard stop cap makes entry unsafe'
Need $raceStop 'selectedDistancePoints=MathMax(' 'RACE structure must be allowed to both tighten and widen inside auto guardrails'
Need $raceStop 'MathMin(maxDistancePoints,structureDistancePoints)' 'RACE structure distance must be clamped by the automatic safety cap'
Need $retry 'raceEntryRetry' 'RACE requote retry must be isolated to RACE entry orders'
Need $retry 'RaceInitialStopPrice(' 'RACE requote must recalculate the automatic SL from the refreshed entry price'
Need $retry 'request.price' 'RACE requote SL refresh must use the retry price'
Need $retry 'request.sl=NormalizeStopPriceToTick(' 'RACE requote must replace the stale SL before retrying the order'
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

Write-Host 'RACE 1.1.10 30-second flow + persistent soft exit + net-cycle pyramids + hard-capped auto SL + requote refresh: PASS'
, ''
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
$raceAutoStop = Block $ea 'double RaceAutoAtrStopMultiplier(double atrPoints)'
$raceAtr = Block $ea 'double RaceAtrStopPoints()'
$raceStop = Block $ea 'double RaceInitialStopPrice(int direction, double entryPrice)'
$raceStopReady = Block $ea 'bool RaceStopReady()'
$hardStopMultiplier = Block $ea 'double EffectiveHardStopMultiplier()'
$send = Block $ea 'bool SendMarketOrder(int direction)'
$retry = Block $ea 'bool OrderSendWithPriceRetry('
$onTick = Block $ea 'void OnTick()'

Need $ea '#define RACE_VOLUME_WINDOW_SECONDS 30' 'RACE volume window must be exactly 30 seconds'
Need $ea '#define RACE_SIGNAL_MAX_WAIT_SECONDS 60' 'RACE unresolved signal window must reset by 60 seconds'
Need $ea '#define RACE_VOLUME_MIN_DOMINANCE 0.55' 'RACE 30-second flow must reject near-tie pressure'
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
Need $analysis 'int volumeDirection=RaceVolumeDirection();' 'AUTO RACE primary direction must start from rolling 30-second volume'
Need $analysis 'RaceZonePriorityActive(' 'AUTO RACE may protect an intact opposing Demand/Supply boundary'
Need $analysis 'RaceV2DecisionDirection(' 'AUTO RACE must combine 30-second volume with RACE-local Flow/Structure/Leg context after zone handling'
Need $analysis 'return decision==0 ? volumeDirection : decision;' 'AUTO RACE tie may fall back to the qualified 30-second volume side'
if($analysis.Contains('RaceM5CandleDirection()')){throw 'RACE entry must not use M5 candle direction'}
if($analysis.Contains('g_trend') -or $analysis.Contains('g_ema')){throw 'RACE entry direction must not leak trend/EMA into the RACE VNext decision'}
Need $ea '#include "include\\RaceFlowV2.mqh"' 'RACE Flow V2 module missing'
Need $ea '#include "include\\RaceStructureV2.mqh"' 'RACE Structure V2 module missing'
Need $ea '#include "include\\RaceLegPhaseV2.mqh"' 'RACE Leg Phase V2 module missing'
Need $ea '#include "include\\RaceDecisionV2.mqh"' 'RACE Decision V2 module missing'
Need $flow 'RaceVolumeDirection() == direction' 'RACE profit flow must follow qualified 30-second volume side'
Need $start 'RACE_VOLUME_WARMUP' 'RACE must wait for the 30-second warmup before first AUTO entry'
Need $start 'RACE_SIGNAL_MAX_WAIT_SECONDS' 'RACE start cycle must enforce the 60-second maximum signal wait'
Need $start 'RACE_SIGNAL_TIMEOUT_RESET' 'RACE must skip and reset an unresolved 60-second signal window'
Need $start 'bool started=ProcessRaceFill(direction);' 'RACE must attempt a valid signal before expiring the 60-second window'
Need $start 'if(!started &&' 'RACE must reset a blocked unresolved entry after the 60-second maximum wait'
Need $ea '#define SCENOVA_RUNTIME_CONTRACT "RACE_CONFIGURED_LOSS_ONLY_V1"' 'RACE compatibility runtime marker missing'
Need $manage 'volumeDirection != direction' 'RACE must detect a volume-side flip'
Need $manage 'cycleProfit >= 0.0' 'ordinary RACE rollover must not close a negative net cycle'
Need $manage 'cycleProfit < 0.0 && floatingProfit < 0.0' 'RACE negative-state classification must only run while the Basket is negative'
Need $manage 'RaceV2LossState(' 'RACE must classify cost/noise, adverse watch and structure state before recovery'
Need $manage 'RaceWrongDirectionConfirmed(' 'RACE negative Basket must pass the isolated confirmed soft-exit gate'
Need $manage 'RaceCloseCycle(wrongDirectionReason)' 'RACE confirmed soft exit must close through the RACE-only cycle closer'
Need $manage 'RACE_ADVERSE_WATCH' 'RACE must stop adding exposure while adverse evidence builds'
Need $manage 'RACE_STRUCTURE_INVALID_HOLD' 'RACE unconfirmed structure invalidation must remain a hold state'
Need $manage 'RACE_ADD_WAIT_PROFIT' 'RACE must block additional fills while the open Basket or full cycle is not profitable'
Need $manage 'if(floatingProfit<=0.0 || cycleProfit<=0.0)' 'RACE pyramid gate must forbid adding while the net cycle is still losing'
Need $wrong 'RaceV2StructureBroken(direction)' 'RACE soft exit must require broken M5 structure'
Need $wrong 'RaceVolumeDirection()' 'RACE soft exit must require the 30-second order-flow side'
Need $wrong 'oppositeVolume' 'RACE soft exit must require opposite order flow'
Need $wrong 'RACE_EXIT_CYCLE_GRACE_SECONDS' 'RACE soft exit must preserve a cycle grace period'
Need $wrong 'RACE_EXIT_LAST_FILL_GRACE_SECONDS' 'RACE soft exit must preserve a last-fill grace period'
Need $wrong 'g_raceExitCandidateSince' 'RACE soft exit must persist confirmation across ticks'
Need $wrong 'RACE_EXIT_SEVERE_CONFIRM_SECONDS' 'RACE strong reversal must still require confirmation time'
Need $wrong 'RACE_EXIT_CONFIRM_SECONDS' 'RACE normal structure+flow reversal must require confirmation time'
Need $wrong 'RACE_SOFT_EXIT_STRONG_REVERSAL' 'RACE strong confirmed soft-exit reason missing'
Need $wrong 'RACE_SOFT_EXIT_STRUCTURE_FLOW' 'RACE confirmed structure+flow soft-exit reason missing'
if($wrong.Contains('RACE_DISTANCE_ARMED')){
  throw 'Obsolete distance-only RACE loss-close logic must remain disabled'
}
if($raceLossV2Code.Contains('RaceWrongDirectionConfirmed(') -or $raceLossV2Code.Contains('"REVERSAL_EXIT"') -or $raceLossV2Code.Contains('"EXIT_CANDIDATE"')){
  throw 'RACE Loss V2 must classify/hold only and never emit a closing state'
}
if($raceLossV2Code.Contains('RaceResetExitCandidate()')){
  throw 'RACE Loss V2 classifier must not reset the 5-8 second soft-exit confirmation clock'
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
Need $raceAtr 'AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)' 'RACE 1.1.10 automatic stop must use M5 ATR'
Need $raceStop 'RaceV2StructureInvalidPrice(direction)' 'RACE stop must use M5 structure as the primary invalidation reference'
Need $raceStop 'double minDistancePoints' 'RACE stop must keep a minimum anti-noise distance'
Need $raceStop 'double maxDistancePoints' 'RACE stop must keep an automatic maximum safety distance'
Need $raceStop 'structureDistancePoints>0.0' 'RACE structure distance must be validated before use'
Need $fill 'RaceV1UpdateExposureTelemetry(direction,g_adaptiveLot)' 'RACE must recalculate projected exposure before every fill'
Need $manage 'RaceV1UpdateExposureTelemetry(direction,0.0)' 'RACE must refresh live Basket exposure before loss classification'
Need $ea '#include "include\\RaceExposureV1.mqh"' 'RACE Exposure V1 module missing'
Need $ea '#include "include\\RaceLossV2.mqh"' 'RACE Loss V2 module missing'
Need $ea '#include "include\\RaceReentryV1.mqh"' 'RACE Re-entry V1 module missing'
Need $start 'RaceReentryDetectFlatTransition();' 'RACE must detect the previous Basket flat transition before starting a new cycle'
Need $start 'if(!RaceReentryObserveReady())' 'RACE must wait through the re-entry observation window'
Need $fill 'RaceReentryMarkExposure();' 'RACE must remember accepted exposure for the next flat transition'
Need $raceReentryV1 '#define RACE_REENTRY_PROFIT_OBSERVE_SECONDS 6' 'RACE profitable-cycle re-entry observation must stay fast'
Need $raceReentryV1 '#define RACE_REENTRY_LOSS_OBSERVE_SECONDS 20' 'RACE losing-cycle re-entry must enforce a longer observation period'
Need $raceReentryV1 'previousCycleWasLoss' 'RACE re-entry must distinguish losing cycles from profitable cycles'
Need $raceReentryV1 'RaceResetVolumeWindow(now);' 'RACE losing-cycle re-entry must discard stale pressure and rebuild fresh 30-second flow'
Need $raceReentryV1 'RACE_REENTRY_AFTER_LOSS' 'RACE losing-cycle re-entry state must be observable'
Need $raceReentryV1 'RACE_REENTRY_AFTER_PROFIT' 'RACE profitable-cycle re-entry state must be observable'
Need $manage 'g_raceLastObservedCycleProfit=cycleProfit;' 'RACE must preserve the last open-cycle P/L for post-flat re-entry classification'
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
Need $ea '#define RACE_AUTO_STOP_ATR_BASE 1.50' 'RACE automatic hard-stop baseline must start at 1.50 ATR'
Need $ea '#define RACE_AUTO_STOP_ATR_WIDE 1.60' 'RACE automatic hard-stop normal wide bound must be 1.60 ATR'
Need $ea '#define RACE_AUTO_STOP_ATR_FLOOR 1.00' 'RACE automatic hard-stop anti-noise floor must be 1.00 ATR'
Need $ea '#define RACE_AUTO_STOP_ATR_CAP 1.80' 'RACE automatic hard-stop safety cap must be 1.80 ATR'
Need $raceAutoStop 'CurrentSpreadPoints()' 'RACE automatic ATR fallback must adapt to live spread versus M5 volatility'
Need $raceAutoStop 'RACE_AUTO_STOP_ATR_BASE' 'RACE automatic stop helper must use the 1.50 ATR baseline'
Need $raceAutoStop 'RACE_AUTO_STOP_ATR_WIDE' 'RACE automatic stop helper must stay inside the 1.50-1.60 normal range'
Need $raceAtr 'RaceAutoAtrStopMultiplier(atr)' 'RACE ATR fallback must use the automatic multiplier'
if($raceAtr.Contains('EffectiveHardStopMultiplier()')){throw 'RACE must not inherit the shared hard-stop multiplier'}
Need $raceStop 'RACE_AUTO_STOP_ATR_FLOOR' 'RACE structure stop must keep a one-ATR anti-noise floor'
Need $raceStop 'double maxDistancePoints=atrM5Points*RACE_AUTO_STOP_ATR_CAP;' 'RACE 1.80 ATR maximum must be a real hard cap, not widened by the floor'
Need $raceStop 'minDistancePoints>maxDistancePoints' 'RACE must reject entries whose broker/spread floor exceeds the 1.80 ATR cap'
Need $raceStop 'RACE_STOP_RISK_TOO_WIDE' 'RACE must expose an explicit status when the hard stop cap makes entry unsafe'
Need $raceStop 'selectedDistancePoints=MathMax(' 'RACE structure must be allowed to both tighten and widen inside auto guardrails'
Need $raceStop 'MathMin(maxDistancePoints,structureDistancePoints)' 'RACE structure distance must be clamped by the automatic safety cap'
Need $retry 'raceEntryRetry' 'RACE requote retry must be isolated to RACE entry orders'
Need $retry 'RaceInitialStopPrice(' 'RACE requote must recalculate the automatic SL from the refreshed entry price'
Need $retry 'request.price' 'RACE requote SL refresh must use the retry price'
Need $retry 'request.sl=NormalizeStopPriceToTick(' 'RACE requote must replace the stale SL before retrying the order'
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

Write-Host 'RACE 1.1.10 30-second flow + persistent soft exit + net-cycle pyramids + hard-capped auto SL + requote refresh: PASS'
