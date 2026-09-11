param(
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
# EA heartbeat API: RACE is exactly 2x the normal order cadence.
# Normal modes remain at 300 ms / 120 requests per minute.
# RACE uses 150 ms / 240 requests per minute even for previously saved settings.
# ---------------------------------------------------------------------------
$eaApi = Read-Utf8 $EaApiPath
$eaApiRef = [ref]$eaApi

Replace-Required $eaApiRef @'
    // Runtime contract: preserve the direction selected by the customer.
    const runtimeSettings = settings?.settings || {};
'@ @'
    // Runtime contract: preserve the direction selected by the customer.
    // RACE runs at exactly 2x the normal order cadence without changing AUTO.
    const runtimeSettings = { ...(settings?.settings || {}) };
    if (String(runtimeSettings.engineMode || "").toUpperCase() === "RACE") {
      runtimeSettings.minOrderIntervalMs = 150;
      runtimeSettings.maxOrdersPerMinute = 240;
    }
'@ 'apply 2x RACE runtime cadence'

Write-Utf8 $EaApiPath $eaApiRef.Value

# ---------------------------------------------------------------------------
# Web: persist the same effective cadence so saved settings and runtime agree.
# ---------------------------------------------------------------------------
$web = Read-Utf8 $WebPath
$webRef = [ref]$web

Replace-Required $webRef @'
      payload.minOrderIntervalMs = 300;
      payload.maxOrdersPerMinute = 120;
'@ @'
      const raceSpeedX2 = String(payload.engineMode || "").toUpperCase() === "RACE";
      payload.minOrderIntervalMs = raceSpeedX2 ? 150 : 300;
      payload.maxOrdersPerMinute = raceSpeedX2 ? 240 : 120;
'@ 'persist 2x RACE cadence from web'

Replace-Required $webRef @'
    RACE:{title:"โหมดซิ่ง",subtitle:"เปิดให้ครบ Max Positions แบบไม่ใช้คะแนนกั้น แล้วบริหารกำไร/การโดนลากแยกจาก AUTO"},
'@ @'
    RACE:{title:"โหมดซิ่ง",subtitle:"เร่งจังหวะเปิดไม้ 2× เพื่อไล่ให้ครบ Max Positions เร็วขึ้น โดยยังแยกการบริหารกำไร/การโดนลากจาก AUTO"},
'@ 'show RACE 2x speed description'

Write-Utf8 $WebPath $webRef.Value

# ---------------------------------------------------------------------------
# Contract checks.
# ---------------------------------------------------------------------------
$finalApi = Read-Utf8 $EaApiPath
$finalWeb = Read-Utf8 $WebPath

foreach ($sentinel in @(
  'const runtimeSettings = { ...(settings?.settings || {}) };',
  'String(runtimeSettings.engineMode || "").toUpperCase() === "RACE"',
  'runtimeSettings.minOrderIntervalMs = 150;',
  'runtimeSettings.maxOrdersPerMinute = 240;'
)) {
  if (-not $finalApi.Contains($sentinel)) { throw "EA API sentinel missing: $sentinel" }
}

foreach ($sentinel in @(
  'const raceSpeedX2 = String(payload.engineMode || "").toUpperCase() === "RACE";',
  'payload.minOrderIntervalMs = raceSpeedX2 ? 150 : 300;',
  'payload.maxOrdersPerMinute = raceSpeedX2 ? 240 : 120;',
  'เร่งจังหวะเปิดไม้ 2×'
)) {
  if (-not $finalWeb.Contains($sentinel)) { throw "Web sentinel missing: $sentinel" }
}

Write-Host "RACE cadence is now 2x: 150 ms spacing and 240 requests/minute. AUTO remains 300 ms / 120."
