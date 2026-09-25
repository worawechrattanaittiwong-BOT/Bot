$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path -LiteralPath $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}

$expected=@(
'app/account/page.tsx',
'app/admin/cloud-hardening/page.tsx',
'app/admin/cloud-test/page.tsx',
'app/admin/commission/page.tsx',
'app/admin/page.tsx',
'app/admin/service-links/page.tsx',
'app/admin/system-test/page.tsx',
'app/cloud/page.tsx',
'app/dashboard/page.tsx',
'app/login/page.tsx',
'app/onboarding/page.tsx',
'app/packages/page.tsx',
'app/page.tsx',
'app/partner/page.tsx',
'app/performance/[slug]/page.tsx',
'app/performance/page.tsx',
'app/referrals/details/page.tsx',
'app/referrals/page.tsx',
'app/reset-password/page.tsx',
'app/runtime-migration/page.tsx',
'app/shared-performance/[slug]/page.tsx',
'app/trading-symbol/page.tsx',
'app/verify-2fa/page.tsx',
'app/verify-email/page.tsx',
'app/website/page.tsx'
)
$webRoot=(Resolve-Path 'apps/web').Path
$actual=Get-ChildItem 'apps/web/app' -Recurse -Filter 'page.tsx' |
  ForEach-Object { $_.FullName.Substring($webRoot.Length+1).Replace('\','/') } |
  Sort-Object
$missing=$expected | Where-Object {$_ -notin $actual}
$unexpected=$actual | Where-Object {$_ -notin $expected}
if($missing.Count -gt 0){throw ('Final mobile parity route missing: '+($missing -join ', '))}
if($unexpected.Count -gt 0){throw ('New route requires mobile parity review: '+($unexpected -join ', '))}

$experience=Read-Text 'apps/web/components/MobileExperience.tsx'
$dashboard=Read-Text 'apps/web/app/dashboard/page.tsx'
$account=Read-Text 'apps/web/app/account/page.tsx'
$packages=Read-Text 'apps/web/app/packages/page.tsx'
$performance=Read-Text 'apps/web/app/performance/page.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'
$ci=Read-Text '.github/workflows/ci.yml'

foreach($needle in @('label:"Home"','label:"Trade"','label:"Orders"','label:"Stats"','<span>More</span>')){
  Need $experience $needle "Final 5-tab mobile nav missing: $needle"
}
foreach($needle in @('/account','/packages','/cloud','/referrals','/partner','/runtime-migration','#mobile-system-center')){
  Need $experience $needle "Final More navigation missing: $needle"
}
foreach($needle in @('id="bot-settings"','id="live-orders"','id="mobile-order-history"','id="mobile-basket-history"','id="mobile-system-center"')){
  Need $dashboard $needle "Dashboard mobile feature parity missing: $needle"
}
foreach($needle in @('scn-mobile-account-hub','phone-settings','Two-Factor Authentication','Trial & Packages')){
  Need $account $needle "Account mobile feature parity missing: $needle"
}
foreach($needle in @('id="trial-access"','id="access-center"','id="membership-history"','checkoutLocal','checkoutCloud','requestOtp')){
  Need $packages $needle "Packages mobile feature parity missing: $needle"
}
foreach($needle in @('CustomerMobileNav','OwnerMobileNav','scn-mobile-stat-periods','scn-mobile-performance-metrics')){
  Need $performance $needle "Performance mobile feature parity missing: $needle"
}
foreach($pair in @(
  @('apps/web/app/login/page.tsx','scn-mobile-auth-page'),
  @('apps/web/app/onboarding/page.tsx','scn-mobile-auth-page'),
  @('apps/web/app/reset-password/page.tsx','scn-mobile-auth-page'),
  @('apps/web/app/verify-email/page.tsx','scn-mobile-auth-page'),
  @('apps/web/app/verify-2fa/page.tsx','scn-mobile-auth-page'),
  @('apps/web/app/website/page.tsx','scn-mobile-marketing-page'),
  @('apps/web/app/shared-performance/[slug]/page.tsx','scn-mobile-public-performance'),
  @('apps/web/app/performance/[slug]/page.tsx','scn-mobile-public-performance')
)){
  Need (Read-Text $pair[0]) $pair[1] ("Public/auth mobile coverage missing: "+$pair[0])
}
Need (Read-Text 'apps/web/app/page.tsx') 'redirect("/dashboard?view=overview")' 'Root route must remain a dashboard redirect'
foreach($phase in 1..8){
  Need $ci ("Mobile UI M"+$phase) ("CI is missing Mobile M"+$phase+" contract")
}
Need $experience 'root.dataset.scenovaMobileTheme = "dark"' 'Final dark-only mobile theme contract missing'
Need $css 'env(safe-area-inset-bottom)' 'Final safe-area coverage missing'

Write-Host ('SCENOVA final mobile feature parity: PASS · '+$actual.Count+' routes reviewed')
