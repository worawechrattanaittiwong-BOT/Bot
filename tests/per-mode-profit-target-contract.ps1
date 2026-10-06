$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$message) {
  if (-not $text.Contains($needle)) { throw $message }
}
function Forbid([string]$text,[string]$needle,[string]$message) {
  if ($text.Contains($needle)) { throw $message }
}

$api = Read-Text 'apps/api/src/bot.controller.ts'
$web = Read-Text 'apps/web/app/dashboard/page.tsx'
$db = Read-Text 'database/001_init.sql'
$migration = Read-Text 'database/069_profit_target_defaults.sql'

foreach ($field in @(
  'autoProfitTargetMoney',
  'manualBasketProfitTargetMoney',
  'manualPerPositionProfitMoney',
  'raceCloseAllProfitMoney',
  'counterPerPositionProfitMoney',
  'zeroGridMinNetProfitMoney'
)) {
  Need $api $field "API missing per-mode profit field: $field"
  Need $web $field "Dashboard missing per-mode profit field: $field"
}

Need $api 'clean.basketProfitTargetMoney = autoProfitTargetMoney;' 'AUTO must mirror only AUTO target to EA runtime'
Need $api 'clean.basketProfitTargetMoney = manualBasketProfitTargetMoney;' 'MANUAL must mirror only MANUAL basket target'
Need $api 'clean.perPositionProfitMoney = manualPerPositionProfitMoney;' 'MANUAL per-position target must remain MANUAL-only'
Need $api 'effectiveProfitProfileMode === "RACE"' 'RACE must clear generic AUTO/MANUAL target mirror'
Need $api 'effectiveProfitProfileMode === "COUNTER"' 'COUNTER must clear generic AUTO/MANUAL target mirror'
Need $api 'effectiveProfitProfileMode === "ZERO_GRID"' 'ZERO GRID must clear generic AUTO/MANUAL target mirror'
Need $api 'clean.profitTargetMode = "OFF";' 'isolated engines must disable generic profit target mode'
Need $api 'MANUAL เลือกกำไรต่อไม้หรือกำไรรวมทั้งชุดได้อย่างใดอย่างหนึ่งเท่านั้น' 'MANUAL target conflict guard missing'

Forbid $web 'settingHelpLabel("auto-profit-target"' 'AUTO money target control must be hidden from the dashboard'
Forbid $web 'เป้ากำไร AUTO' 'AUTO money target label must be hidden from the dashboard'
Need $web 'เป้ากำไร MANUAL ทั้งชุด' 'MANUAL needs a dedicated basket profit input'
Need $web 'ใช้เฉพาะ MANUAL · ไม่เปลี่ยนค่า AUTO/RACE/COUNTER/ZERO' 'Dashboard must explain MANUAL target isolation'
Need $web 'payload.basketProfitTargetMoney = Number(payload.autoProfitTargetMoney || 0);' 'Web save must map AUTO profile to runtime mirror'
Need $web 'payload.basketProfitTargetMoney = Number(payload.manualBasketProfitTargetMoney || 0);' 'Web save must map MANUAL profile to runtime mirror'
Need $web 'payload.perPositionProfitMoney = Number(payload.manualPerPositionProfitMoney || 0);' 'Web save must map MANUAL per-position profile'
Need $web 'payload.profitTargetMode = "OFF";' 'RACE/COUNTER/ZERO/FLIP must not inherit generic AUTO/MANUAL target'

# Only modes with a direct configurable trade-profit target default to 1.
# AUTO has no visible money target and FLIP LOCK uses trailing SL, so they stay untouched.
Need $web 'manualBasketProfitTargetMoney: 1' 'MANUAL Basket target must default to 1'
Need $web 'raceCloseAllProfitMoney: 1' 'RACE Basket target must default to 1'
Need $web 'racePerPositionProfitMoney: 1' 'RACE per-position target must default to 1'
Need $web 'counterPerPositionProfitMoney: 1' 'COUNTER per-position target must default to 1'
Need $web 'zeroGridMinNetProfitMoney: 1' 'ZERO GRID net target must default to 1'
Need $web 'manualPerPositionProfitMoney||1' 'MANUAL per-position selector must start at 1 when first selected'
Need $api 'clean.raceCloseAllProfitMoney = 1;' 'API RACE Basket fallback must default to 1'
Need $api 'clean.racePerPositionProfitMoney = 1;' 'API RACE per-position fallback must default to 1'
Need $api 'clean.counterPerPositionProfitMoney = 1;' 'API COUNTER fallback must remain 1'
Need $api 'clean.zeroGridMinNetProfitMoney = 1;' 'API ZERO GRID fallback must remain 1'
Need $db '"manualBasketProfitTargetMoney":1.0' 'New accounts must default MANUAL Basket target to 1'
Need $db '"raceCloseAllProfitMoney":1.0' 'New accounts must default RACE Basket target to 1'
Need $db '"racePerPositionProfitMoney":1.0' 'New accounts must default RACE per-position target to 1'
Need $db '"counterPerPositionProfitMoney":1.0' 'New accounts must default COUNTER target to 1'
Need $db '"zeroGridMinNetProfitMoney":1.0' 'New accounts must default ZERO GRID target to 1'
Need $migration 'Existing saved customer settings remain untouched.' 'Profit-default migration must not overwrite existing customer settings'
Need $migration '"manualBasketProfitTargetMoney":1.0' 'Deployed DB default migration must include MANUAL target 1'
Need $migration '"racePerPositionProfitMoney":1.0' 'Deployed DB default migration must include RACE target 1'
Need $migration '"zeroGridMinNetProfitMoney":1.0' 'Deployed DB default migration must include ZERO target 1'

Write-Host 'Per-mode profit target isolation contract PASS'
