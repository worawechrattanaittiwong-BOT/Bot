$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}
$page=Read-Text 'apps/web/app/performance/page.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'
Need $page 'CustomerMobileNav' 'M5 customer mobile navigation missing on Performance'
Need $page 'OwnerMobileNav' 'M5 owner mobile navigation missing on Performance'
Need $page 'scn-mobile-performance-page' 'M5 stable performance mobile surface missing'
Need $page 'scn-mobile-stat-periods' 'M5 mobile report period control missing'
Need $page 'onClick={()=>applyDays(1)}' 'M5 Today period must reuse existing report handler'
Need $page 'onClick={()=>applyDays(30)}' 'M5 Month period must reuse existing report handler'
Need $page 'scn-mobile-performance-metrics' 'M5 mobile metrics surface missing'
Need $page 'scn-mobile-performance-results' 'M5 mobile result cards surface missing'
Need $css 'SCENOVA Mobile UX Upgrade · M5' 'M5 styles missing'
Need $css '.scn-mobile-performance-metrics' 'M5 metric grid styles missing'
Need $css '@media (max-width:767px)' 'M5 must remain mobile scoped'
Write-Host 'SCENOVA mobile UI M5 performance/stats contract: PASS'
