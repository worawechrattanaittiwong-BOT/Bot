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

$ea = (Read-Text $EaPath).Replace("`r`n", "`n").Replace("`r", "`n")

# The original source declares these fields on separate simple lines. Add the
# persisted cycle timestamp explicitly instead of relying on a multiline anchor.
if (-not $ea.Contains('datetime g_zeroGridCycleStartedAt = 0;')) {
  $anchor = 'double g_zeroGridStartEquity = 0.0;'
  if (-not $ea.Contains($anchor)) { throw 'ZERO GRID cycle-state anchor not found' }
  $ea = $ea.Replace($anchor, $anchor + "`n" + 'datetime g_zeroGridCycleStartedAt = 0;')
}

# Make every ownership check restart-safe. On Netting accounts MT5 can merge
# several ZERO GRID fills into one symbol position, so the persisted cycle state
# must be restored before current positions are classified.
$positionPattern = 'int\s+ZeroGridPositionCount\s*\(\s*\)\s*\{\s*(?!LoadZeroGridCycleState\s*\(\s*\)\s*;)'
$positionReplacement = "int ZeroGridPositionCount()`n{`n   LoadZeroGridCycleState();`n   "
$updated = [regex]::Replace($ea, $positionPattern, $positionReplacement, 1)
if ($updated -eq $ea -and -not [regex]::IsMatch($ea, 'int\s+ZeroGridPositionCount\s*\(\s*\)\s*\{\s*LoadZeroGridCycleState\s*\(\s*\)\s*;')) {
  throw 'ZERO GRID position-count restart-state anchor not found'
}
$ea = $updated

# Also load state before ManageZeroGrid snapshots its counts. Use a whitespace-
# tolerant regex because Git/Windows checkout line endings must never affect it.
$managePattern = '(?s)(bool\s+ManageZeroGrid\s*\(\s*\)\s*\{\s*)int\s+positions\s*=\s*ZeroGridPositionCount\s*\(\s*\)\s*;\s*int\s+pending\s*=\s*ZeroGridPendingCount\s*\(\s*\)\s*;\s*LoadZeroGridCycleState\s*\(\s*\)\s*;'
$manageReplacement = '$1LoadZeroGridCycleState();' + "`n   int positions=ZeroGridPositionCount();`n   int pending=ZeroGridPendingCount();"
$updated = [regex]::Replace($ea, $managePattern, $manageReplacement, 1)
if ($updated -eq $ea -and -not [regex]::IsMatch($ea, '(?s)bool\s+ManageZeroGrid\s*\(\s*\)\s*\{\s*LoadZeroGridCycleState\s*\(\s*\)\s*;\s*int\s+positions')) {
  throw 'ZERO GRID ManageZeroGrid state-load anchor not found'
}
$ea = $updated

Write-Lf $EaPath $ea
Write-Lf $ApiPath (Read-Text $ApiPath)
Write-Lf $WebPath (Read-Text $WebPath)
Write-Lf $BuildWorkflowPath (Read-Text $BuildWorkflowPath)

Write-Host 'ZERO GRID V2 generated files finalized with LF endings and restart-safe cycle state.'
