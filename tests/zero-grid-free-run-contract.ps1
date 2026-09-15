param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\\FastBasketBot.mq5"
)

$ErrorActionPreference = "Stop"
$ea = [System.IO.File]::ReadAllText((Resolve-Path $EaPath))

function Get-FunctionBlock([string]$text,[string]$signature) {
  $start = $text.IndexOf($signature)
  if ($start -lt 0) { throw "Function not found: $signature" }
  $brace = $text.IndexOf("{", $start)
  if ($brace -lt 0) { throw "Opening brace not found: $signature" }
  $depth = 0
  for ($i = $brace; $i -lt $text.Length; $i++) {
    $c = $text[$i]
    if ($c -eq "{") { $depth++ }
    elseif ($c -eq "}") {
      $depth--
      if ($depth -eq 0) { return $text.Substring($start, $i - $start + 1) }
    }
  }
  throw "Closing brace not found: $signature"
}

$startZero = Get-FunctionBlock $ea "bool StartZeroGridCycle()"
$manageZero = Get-FunctionBlock $ea "bool ManageZeroGrid()"
$onTick = Get-FunctionBlock $ea "void OnTick()"

if ($startZero.Contains("EntryLeaseValid()")) {
  throw "ZERO Start cycle must not be gated by EntryLeaseValid()"
}
if ($manageZero.Contains("EntryLeaseValid()")) {
  throw "ZERO manage/rearm must not be gated by EntryLeaseValid()"
}
if (-not $startZero.Contains("ZERO_GRID_FREE_RUN")) {
  throw "ZERO free-run marker missing"
}
if (-not $onTick.Contains('!ZeroGridModeEnabled() && !EntryLeaseValid()')) {
  throw "OnTick must bypass the entry lease only for ZERO"
}
if (-not $ea.Contains("bool EntryLeaseValid()")) {
  throw "Shared EntryLeaseValid() must remain for non-ZERO modes"
}
if (-not $ea.Contains('g_executionStatus = "RACE_CONTROL_NOT_FRESH";')) {
  throw "RACE fresh-control guard must remain untouched"
}
if (-not $startZero.Contains("g_state!=STATE_RUNNING || !g_access")) {
  throw "ZERO must still obey explicit RUNNING/access control"
}
if (-not $manageZero.Contains("g_state==STATE_RUNNING && g_access")) {
  throw "ZERO manage/rearm must still obey explicit RUNNING/access control"
}

Write-Host "ZERO GRID free-run isolation contract: PASS"
