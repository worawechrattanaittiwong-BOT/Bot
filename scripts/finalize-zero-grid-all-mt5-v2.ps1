param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\FastBasketBot.mq5",
  [Parameter(Mandatory = $false)][string]$ApiPath = "apps\api\src\bot.controller.ts",
  [Parameter(Mandatory = $false)][string]$WebPath = "apps\web\app\dashboard\page.tsx",
  [Parameter(Mandatory = $false)][string]$BuildWorkflowPath = ".github\workflows\build-mt5-ea.yml"
)

$ErrorActionPreference = "Stop"
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "File not found: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}

function Write-Lf([string]$path, [string]$text) {
  $normalized = $text.Replace("`r`n", "`n").Replace("`r", "`n")
  [System.IO.File]::WriteAllText((Resolve-Path $path), $normalized, $utf8)
}

$ea = Read-Text $EaPath

# The original source declares these fields on separate simple lines. Add the
# persisted cycle timestamp explicitly instead of relying on a platform line-ending match.
if (-not $ea.Contains('datetime g_zeroGridCycleStartedAt = 0;')) {
  $anchor = 'double g_zeroGridStartEquity = 0.0;'
  if (-not $ea.Contains($anchor)) { throw 'ZERO GRID cycle-state anchor not found' }
  $ea = $ea.Replace($anchor, $anchor + "`n" + 'datetime g_zeroGridCycleStartedAt = 0;')
}

# Restore persisted cycle state before counting positions. This matters after an
# MT5/EA restart on Netting accounts, where several fills may have merged into a
# single symbol position and current comments alone are not a full level ledger.
$oldManage = @'
bool ManageZeroGrid()
{
   int positions=ZeroGridPositionCount();
   int pending=ZeroGridPendingCount();
   LoadZeroGridCycleState();
'@
$newManage = @'
bool ManageZeroGrid()
{
   LoadZeroGridCycleState();
   int positions=ZeroGridPositionCount();
   int pending=ZeroGridPendingCount();
'@
$lfEa = $ea.Replace("`r`n", "`n").Replace("`r", "`n")
if ($lfEa.Contains($oldManage)) {
  $lfEa = $lfEa.Replace($oldManage, $newManage)
} elseif (-not $lfEa.Contains($newManage)) {
  throw 'ZERO GRID ManageZeroGrid state-load anchor not found'
}

Write-Lf $EaPath $lfEa
Write-Lf $ApiPath (Read-Text $ApiPath)
Write-Lf $WebPath (Read-Text $WebPath)
Write-Lf $BuildWorkflowPath (Read-Text $BuildWorkflowPath)

Write-Host 'ZERO GRID V2 generated files finalized with LF endings and restart-safe cycle state.'
