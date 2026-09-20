$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$message) {
  if (-not $text.Contains($needle)) { throw $message }
}

$api = Read-Text 'apps/api/src/bot.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'

foreach ($field in @(
  'autoProfitTargetMoney',
  'manualBasketProfitTargetMoney',
  'manualPerPositionProfitMoney',
  'raceCloseAllProfitMoney',
  'zeroGridMinNetProfitMoney'
)) {
  Need $api $field "API missing per-mode profit field: $field"
  Need $web $field "Dashboard missing per-mode profit field: $field"
}

Need $api 'clean.basketProfitTargetMoney = autoProfitTargetMoney;' 'AUTO must mirror only AUTO target to EA runtime'
Need $api 'clean.basketProfitTargetMoney = manualBasketProfitTargetMoney;' 'MANUAL must mirror only MANUAL basket target'
Need $api 'clean.perPositionProfitMoney = manualPerPositionProfitMoney;' 'MANUAL per-position target must remain MANUAL-only'
Need $api 'effectiveProfitProfileMode === "RACE"' 'RACE must clear generic AUTO/MANUAL target mirror'
Need $api 'effectiveProfitProfileMode === "ZERO_GRID"' 'ZERO GRID must clear generic AUTO/MANUAL target mirror'
Need $api 'clean.profitTargetMode = "OFF";' 'isolated engines must disable generic profit target mode'
Need $api 'MANUAL เลือกกำไรต่อไม้หรือกำไรรวมทั้งชุดได้อย่างใดอย่างหนึ่งเท่านั้น' 'MANUAL target conflict guard missing'

Need $web 'เป้ากำไร AUTO' 'AUTO needs a dedicated visible profit input'
Need $web 'เป้ากำไร MANUAL ทั้งชุด' 'MANUAL needs a dedicated basket profit input'
Need $web 'ใช้เฉพาะ MANUAL · ไม่เปลี่ยนค่า AUTO/RACE/ZERO' 'Dashboard must explain MANUAL target isolation'
Need $web 'payload.basketProfitTargetMoney = Number(payload.autoProfitTargetMoney || 0);' 'Web save must map AUTO profile to runtime mirror'
Need $web 'payload.basketProfitTargetMoney = Number(payload.manualBasketProfitTargetMoney || 0);' 'Web save must map MANUAL profile to runtime mirror'
Need $web 'payload.perPositionProfitMoney = Number(payload.manualPerPositionProfitMoney || 0);' 'Web save must map MANUAL per-position profile'
Need $web 'payload.profitTargetMode = "OFF";' 'RACE/ZERO/FLIP must not inherit generic AUTO/MANUAL target'

Write-Host 'Per-mode profit target isolation contract PASS'
