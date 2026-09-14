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
$web = [System.IO.File]::ReadAllText((Resolve-Path $WebPath))

Require-Contains $ea '#property version   "1.0.3"' 'EA version bump'
Require-Contains $ea 'ZERO GRID V2.1 geometry' 'geometry marker'
Require-Contains $ea 'double ZeroGridExistingPendingAnchorPrice(bool buySide)' 'persistent pending anchor'
Require-Contains $ea 'double ZeroGridPendingAnchorPrice(bool buySide)' 'live-price inward anchor'
Require-Contains $ea 'double ZeroGridPendingLevelPrice(bool buySide,int level)' 'even level spacing'
Require-Contains $ea 'double price=ZeroGridPendingLevelPrice(buySide,level);' 'pending placement uses even geometry'
Require-Contains $ea 'ulong ZeroGridNearestCloseTicket()' 'nearest-price close selector'
Require-Contains $ea 'int profitRank=floating>=0.0 ? 0 : 1;' 'profitable tickets close first'
Require-Contains $ea 'MathAbs(openPrice-mid)' 'distance-from-live-price close ordering'
Require-Contains $ea 'ClosePositionByTicket(ticket);' 'selected ticket close'
Require-NotContains $ea 'return MathMax(g_zeroGridStepPrice,ZeroGridMinPendingDistancePrice()+ZeroGridTickSize());' 'over-wide grid step rule'
Require-NotContains $ea 'double rawPrice=buySide' 'per-level market clamp that can compress spacing'

Require-Contains $web 'ไม้แรกหุบเข้าชิดราคาตาม Stops/Freeze' 'settings inward-entry explanation'
Require-Contains $web 'ปิดจากไม้ใกล้ราคาไล่ออก' 'settings nearest-out close explanation'

Write-Host 'ZERO GRID close geometry contract: PASS'
