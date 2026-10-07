$ErrorActionPreference = 'Stop'

$web = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/performance/page.tsx'))
$css = [System.IO.File]::ReadAllText((Resolve-Path 'apps/web/app/performance/performance.module.css'))
$api = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-analytics.controller.ts'))

foreach ($required in @(
  'BOT PERFORMANCE SUMMARY',
  'My Performance Only',
  'ownAccounts',
  'account.userId===options?.user?.id',
  'แชร์ Read-only',
  'วันนี้',
  '7 วัน',
  '30 วัน',
  '90 วัน',
  'SummaryChart',
  'Directional Analytics',
  'Streaks'
)) {
  if (-not $web.Contains($required)) { throw "Own performance summary page missing: $required" }
}

foreach ($required in @(
  'buyWinRate',
  'sellWinRate',
  'expectedPayoff',
  'largestProfitTrade',
  'maxWinStreak',
  'averageLossStreak'
)) {
  if (-not $api.Contains($required)) { throw "Performance summary analytics missing: $required" }
}

if ($web.Contains('ภาพรวมทั้งระบบ')) { throw 'Trading Performance page must not expose system-wide performance view' }
if ($web.Contains('รายลูกค้า / รายบัญชี')) { throw 'Trading Performance page must not expose other customer drill-down' }
if ($web.Contains('<h1>Trading Performance & Backtest</h1>')) { throw 'Redundant page title must stay removed from compact performance view' }
if ($web.Contains('customDays')) { throw 'Custom-day number input must stay removed from compact performance view' }
if ($web.Contains('className={styles.shareCard}')) { throw 'Share controls must stay integrated into the main performance controls' }

$actions = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/performance-actions.controller.ts'))

foreach ($required in @(
  'realAccounts',
  'demoAccounts',
  'Live Accounts (REAL)',
  'Demo Accounts',
  'Trading Slot / Account',
  'Slot #{account.slotNumber',
  'currentSlotAccounts',
  'slotStatus',
  'chooseAccount',
  'availableBacktests.some',
  'Performance response does not match the selected Slot',
  'clearAllPerformanceData',
  '/performance-actions/reset-test-data',
  'ล้างข้อมูลทั้งระบบ',
  'Account Type',
  'compareCurrentAccounts'
)) {
  if (-not $web.Contains($required)) { throw "Performance multi-Slot/reset UI missing: $required" }
}
if ($web.Contains('currentRealDemoAccounts')) { throw 'Performance must not collapse multiple Slots into one REAL + one DEMO account' }
if ($web.Contains('.slice(0,1)')) { throw 'Performance selector must not cap REAL/DEMO groups to one Slot each' }

foreach ($required in @(
  'instance_metrics',
  'accountTradeMode',
  'accountType',
  'demo|practice|trial|contest',
  'instance_last_seen_at',
  'account_created_at',
  'account_display_name',
  'slot_status',
  "a.status='ACTIVE'",
  "ls.status IN ('ACTIVE','AVAILABLE')",
  'AND slot_id=$2::uuid',
  '@Query("accountId") accountId = ""'
)) {
  if (-not $api.Contains($required)) { throw "Performance REAL/DEMO classification missing: $required" }
}

if (-not $actions.Contains('@Post("reset-test-data")')) { throw 'Owner performance reset endpoint missing' }
if (-not $actions.Contains('DELETE FROM trade_journal')) { throw 'Performance reset must clear trade journal' }
if (-not $actions.Contains('preserved: ["users", "mt5_accounts", "bot_instances", "subscriptions", "settings"]')) { throw 'Performance reset must preserve account/config data' }


if (-not $web.Contains('styles.mainOwner')) { throw 'Owner performance layout must use a dedicated non-offset main class' }
if (-not $web.Contains('styles.mainCustomer')) { throw 'Customer performance layout must preserve fixed-sidebar offset separately' }

if (-not $web.Contains('controlsOpen')) { throw 'Performance options must remain collapsible' }
if (-not $web.Contains('styles.optionsDrawer')) { throw 'Performance options panel UI missing' }
if (-not $web.Contains('styles.optionsButton')) { throw 'Performance options button missing' }
if (-not $web.Contains('styles.modeBoxes')) { throw 'Performance report source must use compact selectable boxes' }
if (-not $web.Contains('styles.strategyCheck')) { throw 'Strategy modes must use checkbox-style selection boxes' }
if (-not $css.Contains('Performance compact right-options rail v2')) { throw 'Performance options must use the compact right-side vertical rail' }
if ($web.Contains('className={styles.controlCard}')) { throw 'External performance control card must stay removed so summary can fill the viewport' }

foreach ($required in @(
  'PERFORMANCE_PREFS_KEY',
  'readPerformancePreferences',
  'confirmPerformancePreferences',
  'window.localStorage.setItem',
  'ยืนยัน',
  'styles.saveSettingsButton'
)) {
  if (-not $web.Contains($required)) { throw "Performance saved-report preferences missing: $required" }
}
if (-not $css.Contains('Performance viewport fit + saved report controls')) { throw 'Performance desktop viewport-fit contract missing' }
if (-not $css.Contains('aspect-ratio:1000 / 136!important')) { throw 'Performance capital chart must keep the compact desktop aspect ratio' }

$ea = [System.IO.File]::ReadAllText((Resolve-Path 'mt5/FastBasketBot.mq5'))
if (-not $ea.Contains('\"accountTradeMode\":%d')) { throw 'EA heartbeat must publish authoritative accountTradeMode' }
if (-not $ea.Contains('AccountInfoInteger(ACCOUNT_TRADE_MODE)')) { throw 'EA account type telemetry must come from MT5 ACCOUNT_TRADE_MODE' }

Write-Host 'Own-only popup-style Trading Performance contract PASS'
