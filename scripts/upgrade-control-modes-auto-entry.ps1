param(
  [Parameter(Mandatory = $false)]
  [string]$ApiPath = "apps/api/src/bot.controller.ts",
  [Parameter(Mandatory = $false)]
  [string]$EaApiPath = "apps/api/src/ea.controller.ts",
  [Parameter(Mandatory = $false)]
  [string]$WebPath = "apps/web/app/dashboard/page.tsx"
)

$ErrorActionPreference = "Stop"

function Read-Utf8([string]$path) {
  if (-not (Test-Path $path)) { throw "File not found: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}

function Write-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText((Resolve-Path $path), $text, [System.Text.UTF8Encoding]::new($false))
}

function Replace-Required([ref]$textRef, [string]$old, [string]$new, [string]$label) {
  if ($textRef.Value.Contains($new)) {
    Write-Host "$label already applied"
    return
  }
  if (-not $textRef.Value.Contains($old)) { throw "Patch anchor not found: $label" }
  $textRef.Value = $textRef.Value.Replace($old, $new)
  Write-Host "Applied $label"
}

# ---------------------------------------------------------------------------
# Bot API: direction locking is deprecated for every customer-facing mode.
# Keep accepting legacy clients that still submit BUY_ONLY / SELL_ONLY, but
# normalize every save to AUTO_MOMENTUM so old UI versions cannot re-lock it.
# ---------------------------------------------------------------------------
$api = Read-Utf8 $ApiPath
$apiRef = [ref]$api

Replace-Required $apiRef @'
      clean.entryMode = entryMode;
'@ @'
      // BUY_ONLY / SELL_ONLY are accepted only for backward compatibility.
      // All customer-facing control modes now use automatic BUY/SELL analysis.
      clean.entryMode = "AUTO_MOMENTUM";
'@ 'normalize saved entryMode to AUTO_MOMENTUM'

Write-Utf8 $ApiPath $apiRef.Value

# ---------------------------------------------------------------------------
# EA heartbeat API: enforce automatic direction at runtime too. This makes any
# stale BUY_ONLY / SELL_ONLY already stored in bot_settings harmless immediately
# without requiring the customer to open Settings and save again.
# ---------------------------------------------------------------------------
$eaApi = Read-Utf8 $EaApiPath
$eaApiRef = [ref]$eaApi

$oldSettingsRead = @'
    const settings = await this.db.one(
      "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
      [instance.id]
    );
    const intelligenceStats = await this.basketWinProbability(
'@
$newSettingsRead = @'
    const settings = await this.db.one(
      "SELECT settings FROM bot_settings WHERE bot_instance_id=$1",
      [instance.id]
    );
    // Runtime contract: every customer-facing mode chooses BUY/SELL itself.
    // Override stale legacy direction locks before settings reach the EA.
    const runtimeSettings = {
      ...(settings?.settings || {}),
      entryMode: "AUTO_MOMENTUM"
    };
    const intelligenceStats = await this.basketWinProbability(
'@
Replace-Required $eaApiRef $oldSettingsRead $newSettingsRead 'force heartbeat runtime entryMode AUTO_MOMENTUM'

Replace-Required $eaApiRef @'
      settings: settings?.settings || {},
'@ @'
      settings: runtimeSettings,
'@ 'send normalized runtime settings to EA'

Write-Utf8 $EaApiPath $eaApiRef.Value

# ---------------------------------------------------------------------------
# Web: all four modes retain their own behavior, but the direction summary and
# order-plan UI never expose a BUY/SELL lock. The mode is stored independently.
# ---------------------------------------------------------------------------
$web = Read-Utf8 $WebPath
$webRef = [ref]$web

Replace-Required $webRef @'
  const directionLabel = entryMode === "SELL_ONLY" ? "SELL เท่านั้น" : entryMode === "BUY_ONLY" ? "BUY เท่านั้น" : "EA เลือก BUY / SELL";
'@ @'
  const directionLabel = "EA เลือก BUY / SELL อัตโนมัติ";
'@ 'make direction summary always automatic'

Write-Utf8 $WebPath $webRef.Value

# ---------------------------------------------------------------------------
# Contract checks: no customer-facing mode may restore a directional lock.
# ---------------------------------------------------------------------------
$finalApi = Read-Utf8 $ApiPath
$finalEaApi = Read-Utf8 $EaApiPath
$finalWeb = Read-Utf8 $WebPath

foreach ($sentinel in @(
  'body.controlMode !== undefined',
  'clean.controlMode = controlMode',
  'clean.entryMode = "AUTO_MOMENTUM";'
)) {
  if (-not $finalApi.Contains($sentinel)) { throw "Bot API sentinel missing: $sentinel" }
}
foreach ($sentinel in @(
  'const runtimeSettings = {',
  'entryMode: "AUTO_MOMENTUM"',
  'settings: runtimeSettings'
)) {
  if (-not $finalEaApi.Contains($sentinel)) { throw "EA API sentinel missing: $sentinel" }
}
foreach ($sentinel in @(
  'props.onEdit?.("controlMode",mode)',
  'props.onEdit?.("entryMode","AUTO_MOMENTUM")',
  'วิเคราะห์ BUY / SELL อัตโนมัติ',
  'ไม่ล็อกฝั่ง',
  'const directionLabel = "EA เลือก BUY / SELL อัตโนมัติ";'
)) {
  if (-not $finalWeb.Contains($sentinel)) { throw "Web sentinel missing: $sentinel" }
}
if ($finalWeb.Contains('props.onEdit?.("entryMode",fixedDirection)')) {
  throw "Legacy fixedDirection lock is still active"
}
if ($finalWeb.Contains('<option value="BUY_ONLY">BUY เท่านั้น</option>') -or
    $finalWeb.Contains('<option value="SELL_ONLY">SELL เท่านั้น</option>')) {
  throw "Legacy BUY/SELL selector is still visible in customer control modes"
}

Write-Host "All control modes now use automatic BUY/SELL direction at save, runtime and UI levels."
