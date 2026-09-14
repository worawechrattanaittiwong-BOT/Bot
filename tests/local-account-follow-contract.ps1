$ErrorActionPreference = "Stop"
function Require-Contains([string]$text,[string]$needle,[string]$label) { if (-not $text.Contains($needle)) { throw "Missing contract: $label -> $needle" } }
function Require-NotContains([string]$text,[string]$needle,[string]$label) { if ($text.Contains($needle)) { throw "Obsolete customer Slot contract: $label -> $needle" } }
$eaApi = [System.IO.File]::ReadAllText((Resolve-Path "apps/api/src/ea.controller.ts"))
$botApi = [System.IO.File]::ReadAllText((Resolve-Path "apps/api/src/bot.controller.ts"))
$page = [System.IO.File]::ReadAllText((Resolve-Path "apps/web/app/dashboard/page.tsx"))
$layout = [System.IO.File]::ReadAllText((Resolve-Path "apps/web/app/layout.tsx"))
$nav = [System.IO.File]::ReadAllText((Resolve-Path "apps/web/components/CustomerNavigationLabels.tsx"))
Require-Contains $eaApi 'const customerSubscription = await this.db.one(' 'user-level LOCAL membership'
Require-Contains $eaApi 'AUTO_FOLLOW_MT5_ACCOUNT' 'automatic MT5 account follow audit'
Require-Contains $eaApi 'previousBoundPositions <= 0' 'only auto-switch when old account is flat'
Require-Contains $eaApi 'AND user_id<>$3' 'cross-customer MT5 identity protection'
Require-Contains $eaApi 'instance.desired_state = "STOPPED";' 'safe stop after automatic account switch'
Require-Contains $botApi 'bi.last_seen_at DESC NULLS LAST' 'automatic active installation selection'
Require-NotContains $page 'className="slot-switcher"' 'customer Slot selector removed'
Require-NotContains $page 'เลือก Slot ที่ต้องการควบคุม' 'customer Slot chooser copy removed'
Require-NotContains $layout '<Mt5AccountSwitchAssistant />' 'manual account-switch assistant removed'
Require-NotContains $nav 'Accounts, slots, devices & connections' 'navigation Slot wording removed'
Require-NotContains $botApi 'ต้องมี Trial หรือ Subscription ที่ตรงกับ Slot' 'access Slot wording removed'
Write-Host 'LOCAL account-follow / no customer Slot contract: PASS'
