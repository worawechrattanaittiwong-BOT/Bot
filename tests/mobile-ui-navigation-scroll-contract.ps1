$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}
$mobile=Read-Text 'apps/web/components/MobileExperience.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'

Need $mobile 'MOBILE_SCROLL_TARGET_KEY' 'Stable mobile hash-target retry missing'
Need $mobile 'window.location.assign(targetHref)' 'Mobile primary navigation must use reliable full navigation when route/query changes'
Need $mobile 'scrollIntoView({ behavior:"smooth", block:"start" })' 'Same-page mobile anchors must scroll reliably'
Need $mobile 'body.dataset.scnMobileRoute' 'Mobile route marker missing'
Need $mobile 'sidebar.elevated-sidebar' 'Owner/Admin mobile menu detection missing'
Need $mobile 'OWNER / ADMIN' 'Owner/Admin destinations must remain reachable after hiding old role rail'
Need $css 'SCENOVA Mobile Shell Cleanup' 'Mobile shell cleanup styles missing'
Need $css 'overflow-y:auto!important' 'Mobile document vertical scrolling must be explicitly enabled'
Need $css 'mobile-nav.owner-mobile-nav' 'Duplicate role rail cleanup missing'
Need $css 'padding-bottom:calc(94px + env(safe-area-inset-bottom))' 'Global bottom dock clearance missing'
Need $css 'body[data-scn-mobile-route="runtime-migration"] main' 'Standalone runtime page bottom clearance missing'
Need $css '.scn-mobile-performance-info>div>div' 'Performance metadata overflow fix missing'
Need $css 'grid-template-columns:1fr!important' 'Performance metadata must stack cleanly on phones'
Write-Host 'SCENOVA mobile shell navigation + scroll stability contract: PASS'
