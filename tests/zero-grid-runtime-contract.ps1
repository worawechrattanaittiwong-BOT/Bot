$ErrorActionPreference = 'Stop'
function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing contract source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Assert-Contains([string]$text,[string]$needle,[string]$label) {
  if (-not $text.Contains($needle)) { throw "ZERO runtime contract missing: $label" }
}
$mq5 = Read-Text 'mt5/FastBasketBot.mq5'
$apiRelease = Read-Text 'apps/api/src/release-version.ts'
$bot = Read-Text 'apps/api/src/bot.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'
Assert-Contains $mq5 '#define ZERO_GRID_MAX_LEVELS 30' 'EA max 30 per side'
Assert-Contains $mq5 'JsonNumber(json, "zeroGridLevelsPerSide", g_zeroGridLevelsPerSide)' 'EA consumes saved per-side levels'
Assert-Contains $mq5 'for(int level=2;level<=levels;level++)' 'EA stages deeper configured levels'
Assert-Contains $mq5 '#define SCENOVA_RUNTIME_CONTRACT "ZERO_GRID_LEVELS_1_30_V1"' 'EA loaded-runtime contract'
Assert-Contains $mq5 '\"runtimeContract\":\"%s\"' 'heartbeat runtime contract telemetry'
Assert-Contains $mq5 '\"zeroGridConfiguredLevelsPerSide\":%d' 'heartbeat configured ZERO levels telemetry'
Assert-Contains $mq5 '\"zeroGridEffectiveLevelsPerSide\":%d' 'heartbeat effective ZERO levels telemetry'
Assert-Contains $mq5 '\"zeroGridMaxLevelsPerSide\":%d' 'heartbeat max ZERO levels telemetry'
Assert-Contains $apiRelease 'EA_RUNTIME_CONTRACT = "ZERO_GRID_LEVELS_1_30_V1"' 'API required runtime contract'
Assert-Contains $apiRelease 'ZERO_GRID_MAX_LEVELS_PER_SIDE = 30' 'API ZERO max 30'
Assert-Contains $bot 'runtimeContractMatch = currentRuntimeContract === requiredRuntimeContract' 'API loaded-runtime verification'
Assert-Contains $bot 'appliedLevels !== requestedLevels' 'ZERO saved-vs-applied start guard'
Assert-Contains $bot 'appliedMode !== "ZERO_GRID"' 'ZERO mode applied guard'
Assert-Contains $web 'EA รับค่าแล้ว:' 'ZERO UI applied confirmation'
Assert-Contains $web 'เลือกได้ 1–30 Pending ต่อฝั่ง' 'ZERO UI 1-30 explanation'
Assert-Contains $web 'EA ใน MT5 ยังไม่ได้โหลด Runtime ล่าสุด' 'loaded-runtime update alert'
Write-Host 'ZERO GRID loaded-runtime contract PASS.'
