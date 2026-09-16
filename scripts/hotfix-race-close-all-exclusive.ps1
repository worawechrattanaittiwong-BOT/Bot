$ErrorActionPreference = "Stop"

$path = "mt5/FastBasketBot.mq5"
if (-not (Test-Path $path)) { throw "File not found: $path" }

$text = [System.IO.File]::ReadAllText((Resolve-Path $path))
$old = '   int harvested = RaceHarvestProfitablePositions();'
$new = '   int harvested = g_raceCloseAllProfitEnabled ? 0 : RaceHarvestProfitablePositions();'

if (-not $text.Contains('#property version   "1.0.23"')) {
  throw "EA version changed unexpectedly; refusing to patch"
}

if ($text.Contains($new)) {
  Write-Host "RACE close-all exclusivity already applied."
  exit 0
}

if (-not $text.Contains($old)) {
  throw "Patch anchor not found: RACE profitable-position harvest"
}

$text = $text.Replace($old, $new)
[System.IO.File]::WriteAllText((Resolve-Path $path), $text, [System.Text.UTF8Encoding]::new($false))

$verify = [System.IO.File]::ReadAllText((Resolve-Path $path))
if (-not $verify.Contains($new)) { throw "Hotfix sentinel missing after patch" }
if (-not $verify.Contains('#property version   "1.0.23"')) { throw "EA version changed during patch" }

Write-Host "RACE Close-All Profit now suppresses per-position harvesting while enabled. EA remains v1.0.23."
