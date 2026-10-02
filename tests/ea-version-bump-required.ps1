$ErrorActionPreference = 'Stop'

$parent = 'HEAD^'
$changed = git diff --name-only $parent HEAD -- mt5/FastBasketBot.mq5
if ($LASTEXITCODE -ne 0) { throw 'Unable to compare EA source with parent commit' }
if (-not $changed) {
  Write-Host 'EA version bump gate PASS: MQ5 source unchanged.'
  exit 0
}
$currentText = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
$currentMatch = [regex]::Match($currentText, '#property\s+version\s+"([0-9]+\.[0-9]+\.[0-9]+)"')
if (-not $currentMatch.Success) { throw 'Current EA version marker missing' }
$current = [version]$currentMatch.Groups[1].Value
$previousText = git show "$parent`:mt5/FastBasketBot.mq5"
if ($LASTEXITCODE -ne 0 -or -not $previousText) { throw 'Previous EA source/version unavailable; fetch-depth must be >= 2' }
$previousMatch = [regex]::Match(($previousText -join "`n"), '#property\s+version\s+"([0-9]+\.[0-9]+\.[0-9]+)"')
if (-not $previousMatch.Success) { throw 'Previous EA version marker missing' }
$previous = [version]$previousMatch.Groups[1].Value
$comparison = $current.CompareTo($previous)
if ($comparison -lt 0) {
  throw "mt5/FastBasketBot.mq5 changed and EA version decreased: previous=$previous current=$current"
}
if ($comparison -eq 0) {
  # Same-version releases are first-class: the user-visible EA version may stay
  # stable while every compiled artifact gets an immutable Build ID. Permit the
  # rebuild only when the complete build/runtime identity chain is present.
  if (-not $currentText.Contains('#define SCENOVA_BUILD_ID')) {
    throw 'Same-version EA rebuild requires SCENOVA_BUILD_ID in the EA source'
  }
  if (-not $currentText.Contains('\"buildId\":\"%s\"')) {
    throw 'Same-version EA rebuild requires Build ID heartbeat telemetry'
  }

  $buildWorkflow = [System.IO.File]::ReadAllText((Resolve-Path '.github/workflows/build-mt5-ea.yml'))
  foreach ($required in @(
    'Stamp immutable runtime build identity',
    'EA_BUILD_ID=$buildId',
    'buildId = $env:EA_BUILD_ID'
  )) {
    if (-not $buildWorkflow.Contains($required)) {
      throw "Same-version EA rebuild requires immutable build stamping: $required"
    }
  }

  $eaController = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/ea.controller.ts'))
  foreach ($required in @(
    "metrics->>'buildId' AS runtime_build_id",
    'runtimeBuildMatch',
    'runtimeIdentityMatch',
    'runtimeContractMatch: runtimeIdentityMatch'
  )) {
    if (-not $eaController.Contains($required)) {
      throw "Same-version EA rebuild requires runtime build verification: $required"
    }
  }

  Write-Host "EA same-version rebuild gate PASS: $current protected by immutable Build ID + hash + runtime verification."
  exit 0
}
Write-Host "EA version bump gate PASS: $previous -> $current"
