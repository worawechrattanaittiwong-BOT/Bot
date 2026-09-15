param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\FastBasketBot.mq5",
  [Parameter(Mandatory = $false)][string]$WebPath = "apps\web\app\dashboard\page.tsx"
)

$ErrorActionPreference = "Stop"

function Require-Contains([string]$text,[string]$needle,[string]$label) {
  if (-not $text.Contains($needle)) { throw "Missing contract: $label -> $needle" }
}

function Require-NotContains([string]$text,[string]$needle,[string]$label) {
  if ($text.Contains($needle)) { throw "Obsolete contract still present: $label -> $needle" }
}

$ea = [System.IO.File]::ReadAllText((Resolve-Path $EaPath))

Require-Contains $ea '#property version   "1.0.14"' 'EA version bump'
Require-Contains $ea 'ZERO GRID V2.1 geometry' 'geometry marker'
Require-Contains $ea 'double ZeroGridExistingPendingAnchorPrice(bool buySide)' 'persistent pending anchor'
Require-Contains $ea 'double ZeroGridPendingAnchorPrice(bool buySide)' 'live-price inward anchor'
Require-Contains $ea 'double ZeroGridPendingLevelPrice(bool buySide,int level)' 'even level spacing'
Require-Contains $ea 'double price=ZeroGridPendingLevelPrice(buySide,level);' 'pending placement uses even geometry'
Require-Contains $ea 'ulong ZeroGridNearestCloseTicket()' 'ZERO close selector'
Require-Contains $ea 'double bestVolume=1.0e100;' 'smallest-lot close priority'
Require-Contains $ea 'volume<bestVolume-lotTolerance' 'ascending lot close ordering'
Require-Contains $ea 'int profitRank=floating>=0.0 ? 0 : 1;' 'same-lot profitable-ticket tie-break'
Require-Contains $ea 'MathAbs(openPrice-livePrice)' 'same-lot nearest-price tie-break'
Require-Contains $ea 'ZERO_GRID_RETRY_MISSING_L1' 'retry only missing first-side trigger'
Require-Contains $ea 'g_executionStatus="ZERO_GRID_REARMING";' 'same-pass flat-cycle rearm'
Require-Contains $ea 'return StartZeroGridCycle();' 'immediate ZERO cycle restart path'
Require-Contains $ea 'ClosePositionByTicket(ticket);' 'selected ticket close'
Require-NotContains $ea 'ZERO_GRID_RETRY_FIRST_PAIR' 'destructive first-pair cancel/rebuild loop'
Require-NotContains $ea 'return MathMax(g_zeroGridStepPrice,ZeroGridMinPendingDistancePrice()+ZeroGridTickSize());' 'over-wide grid step rule'
Require-Contains $ea 'ZERO_GRID_CLOSE_ALL_BURST' 'ZERO profit close-all burst'
Require-Contains $ea 'OrderSendAsync(request,result)' 'async ZERO close/cancel dispatch'
Require-Contains $ea 'g_zeroGridLastExitBurstMs' 'duplicate burst cooldown'

Write-Host 'ZERO GRID fast rearm / close-order contract: PASS'
