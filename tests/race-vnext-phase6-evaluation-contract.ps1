$ErrorActionPreference = "Stop"

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$message) {
  if(-not $text.Contains($needle)){throw $message}
}

$bot = Read-Text 'apps/api/src/bot.controller.ts'
$ea = Read-Text 'mt5/FastBasketBot.mq5'

Need $bot 'raceVNextEvaluation' 'RACE VNext evaluation payload missing'
Need $bot 'FORWARD_OBSERVATIONAL_NOT_BACKTEST' 'RACE evaluation must identify itself as observational forward data'
Need $bot 'raceTelemetryVersion' 'RACE evaluation cohort split must use telemetry version'
Need $bot "event_type='BASKET'" 'RACE evaluation must use completed Basket outcomes'
Need $bot "metadata->>'controlMode'" 'RACE evaluation must filter actual RACE ownership'
Need $bot 'averageLossDelta' 'RACE evaluation must compare average loss'
Need $bot 'worstLossDelta' 'RACE evaluation must compare worst loss'
Need $bot 'averageNoiseMoney' 'RACE evaluation must track exposure-scaled noise money'
Need $bot 'averageProjectedStructureLossMoney' 'RACE evaluation must track structure-risk projection'
Need $bot 'minimumSuggestedSamplesPerCohort: 50' 'RACE evaluation sample guidance missing'

# Phase 6 is analysis-only. It must not become a hidden execution gate.
if($ea.Contains('raceVNextEvaluation')){
  throw 'RACE Phase 6 evaluation leaked into MT5 execution source'
}
if($bot.Contains('RACE_VNEXT_EVALUATION_BLOCK_ENTRY')){
  throw 'RACE evaluation must not block entries'
}

Write-Host 'RACE VNext Phase 6 forward-observation evaluation contract: PASS'
