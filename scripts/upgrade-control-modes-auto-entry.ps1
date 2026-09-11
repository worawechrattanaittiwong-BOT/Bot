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
# Bot API: keep the user's selected direction. AUTO_MOMENTUM remains default,
# while BUY_ONLY / SELL_ONLY are valid explicit choices in every control mode.
# ---------------------------------------------------------------------------
$api = Read-Utf8 $ApiPath
$apiRef = [ref]$api

Replace-Required $apiRef @'
      // BUY_ONLY / SELL_ONLY are accepted only for backward compatibility.
      // All customer-facing control modes now use automatic BUY/SELL analysis.
      clean.entryMode = "AUTO_MOMENTUM";
'@ @'
      // Direction is user-selectable in every control mode.
      // AUTO_MOMENTUM lets the EA choose; BUY_ONLY / SELL_ONLY pin the side.
      clean.entryMode = entryMode;
'@ 'preserve selected entryMode'

Write-Utf8 $ApiPath $apiRef.Value

# ---------------------------------------------------------------------------
# EA heartbeat API: deliver the stored direction exactly as saved. Do not
# override BUY_ONLY / SELL_ONLY back to AUTO_MOMENTUM at runtime.
# ---------------------------------------------------------------------------
$eaApi = Read-Utf8 $EaApiPath
$eaApiRef = [ref]$eaApi

Replace-Required $eaApiRef @'
    // Runtime contract: every customer-facing mode chooses BUY/SELL itself.
    // Override stale legacy direction locks before settings reach the EA.
    const runtimeSettings = {
      ...(settings?.settings || {}),
      entryMode: "AUTO_MOMENTUM"
    };
'@ @'
    // Runtime contract: preserve the direction selected by the customer.
    const runtimeSettings = settings?.settings || {};
'@ 'preserve runtime entryMode'

Write-Utf8 $EaApiPath $eaApiRef.Value

# ---------------------------------------------------------------------------
# Web: every control mode exposes three direction choices. Changing the control
# mode must not silently reset an existing BUY/SELL choice.
# ---------------------------------------------------------------------------
$web = Read-Utf8 $WebPath
$webRef = [ref]$web

Replace-Required $webRef @'
    // Every customer-facing mode uses automatic BUY/SELL analysis. Direction
    // locking is not part of mode selection anymore.
    props.onEdit?.("entryMode","AUTO_MOMENTUM");
'@ @'
    // Keep the currently selected direction when switching control modes.
'@ 'stop mode switch from forcing AUTO direction'

Replace-Required $webRef @'
  const directionLabel = "EA เลือก BUY / SELL อัตโนมัติ";
'@ @'
  const directionLabel = entryMode === "SELL_ONLY" ? "SELL เท่านั้น" : entryMode === "BUY_ONLY" ? "BUY เท่านั้น" : "อัตโนมัติ · EA เลือก BUY / SELL";
'@ 'show selected direction in summary'

Replace-Required $webRef @'
                  <div className="cc-bot-v2-field auto-value"><label><ScenovaIcon name="trend" size={17}/>ทิศทาง</label><strong>วิเคราะห์ BUY / SELL อัตโนมัติ</strong><small>M1 / M5 / M15 / M30 / H1 · ไม่ล็อกฝั่ง</small></div>
'@ @'
                  <label className="cc-bot-v2-field"><span><ScenovaIcon name="trend" size={17}/>ทิศทาง</span><select className="input" value={entryMode} onChange={e=>props.onEdit?.("entryMode",e.target.value)}><option value="AUTO_MOMENTUM">อัตโนมัติ · EA เลือก BUY / SELL</option><option value="BUY_ONLY">BUY เท่านั้น</option><option value="SELL_ONLY">SELL เท่านั้น</option></select><small>{entryMode === "AUTO_MOMENTUM" ? "M1 / M5 / M15 / M30 / H1 วิเคราะห์ทิศทางอัตโนมัติ" : "บังคับทิศตามที่เลือกจนกว่าจะเปลี่ยนค่า"}</small></label>
'@ 'restore AUTO BUY SELL direction selector'

Write-Utf8 $WebPath $webRef.Value

# ---------------------------------------------------------------------------
# Contract checks.
# ---------------------------------------------------------------------------
$finalApi = Read-Utf8 $ApiPath
$finalEaApi = Read-Utf8 $EaApiPath
$finalWeb = Read-Utf8 $WebPath

foreach ($sentinel in @(
  'body.controlMode !== undefined',
  'clean.controlMode = controlMode',
  'clean.entryMode = entryMode;'
)) {
  if (-not $finalApi.Contains($sentinel)) { throw "Bot API sentinel missing: $sentinel" }
}
foreach ($sentinel in @(
  'const runtimeSettings = settings?.settings || {};',
  'settings: runtimeSettings'
)) {
  if (-not $finalEaApi.Contains($sentinel)) { throw "EA API sentinel missing: $sentinel" }
}
foreach ($sentinel in @(
  'props.onEdit?.("controlMode",mode)',
  '<option value="AUTO_MOMENTUM">อัตโนมัติ · EA เลือก BUY / SELL</option>',
  '<option value="BUY_ONLY">BUY เท่านั้น</option>',
  '<option value="SELL_ONLY">SELL เท่านั้น</option>',
  'props.onEdit?.("entryMode",e.target.value)',
  'const directionLabel = entryMode === "SELL_ONLY"'
)) {
  if (-not $finalWeb.Contains($sentinel)) { throw "Web sentinel missing: $sentinel" }
}
if ($finalWeb.Contains('props.onEdit?.("entryMode","AUTO_MOMENTUM");')) {
  throw "Control-mode switching still forces AUTO_MOMENTUM"
}
if ($finalApi.Contains('clean.entryMode = "AUTO_MOMENTUM";')) {
  throw "Bot API still forces AUTO_MOMENTUM"
}
if ($finalEaApi.Contains('entryMode: "AUTO_MOMENTUM"')) {
  throw "EA heartbeat still forces AUTO_MOMENTUM"
}

Write-Host "Direction selector enabled: AUTO_MOMENTUM / BUY_ONLY / SELL_ONLY in every control mode."
