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
  $authorizationText = (git log -1 --pretty=%B) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read commit message for same-version authorization' }

  # Pull-request CI checks out a synthetic merge commit. In that case the
  # authorization marker lives in one of the PR commits, not the synthetic
  # merge message, so inspect the second-parent range as well.
  git rev-parse --verify "HEAD^2" *> $null
  if ($LASTEXITCODE -eq 0) {
    $prMessages = (git log --format=%B "HEAD^1..HEAD^2") -join "`n"
    if ($LASTEXITCODE -eq 0) { $authorizationText += "`n" + $prMessages }
  }

  if ($authorizationText -notmatch '\[same ea version\]') {
    throw "mt5/FastBasketBot.mq5 changed but EA version did not increase: previous=$previous current=$current"
  }

  # Same-version rebuilds are permitted only when the compiled artifact carries
  # an immutable runtime Build ID. This prevents version equality from hiding a
  # stale EX5/runtime after an authorized rebuild.
  if (-not $currentText.Contains('#define SCENOVA_BUILD_ID')) {
    throw 'Same-version EA rebuild requires SCENOVA_BUILD_ID in the EA source'
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

  Write-Host "EA same-version rebuild gate PASS: $current explicitly authorized and build-identity protected."
  exit 0
}
Write-Host "EA version bump gate PASS: $previous -> $current"
