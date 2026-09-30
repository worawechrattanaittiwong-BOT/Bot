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
  $commitMessage = (git log -1 --pretty=%B) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $commitMessage -notmatch '\[same ea version\]') {
    throw "mt5/FastBasketBot.mq5 changed but EA version did not increase: previous=$previous current=$current"
  }
  Write-Host "EA same-version rebuild gate PASS: $current explicitly authorized by commit marker."
  exit 0
}
Write-Host "EA version bump gate PASS: $previous -> $current"
