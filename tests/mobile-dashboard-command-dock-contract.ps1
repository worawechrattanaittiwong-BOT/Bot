$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}

$page=Read-Text 'apps/web/app/dashboard/page.tsx'
$css=Read-Text 'apps/web/app/globals.css'
$summary=Read-Text 'apps/web/components/BotPerformanceSummary.tsx'
$mirror=Read-Text 'apps/web/components/MobileMirrorOverlay.tsx'

Need $page 'className="cc-mobile-command stop"' 'Persistent mobile Stop control missing'
Need $page '<b>หยุดบอท</b>' 'Persistent mobile Stop label must be explicit'
Need $page 'command("/bot/stop"' 'Persistent mobile Stop must reuse existing Safe Stop handler'
Need $page 'command("/bot/start"' 'Persistent mobile Start must reuse existing Start handler'
Need $css '.cc-v19-hero-quick-actions .start' 'Upper duplicate Start cleanup missing'
Need $css '.cc-v19-hero-quick-actions .stop' 'Upper duplicate Stop cleanup missing'
Need $css 'display:none!important' 'Upper duplicate Start/Stop must be hidden on phone'
Need $css '.cc-mobile-command-dock' 'Persistent mobile command dock styles missing'
Need $css 'z-index:2600!important' 'Primary bot command dock must stay above secondary launchers'
Need $page 'mobile-app-head-actions' 'Mobile sidebar menu must be hosted in the safe top app header'
Need $css '.mobile-app-head .owner-mobile-nav-trigger-wrap' 'Mobile sidebar trigger must use the top app header placement'
Need $css 'position:static!important' 'Mobile sidebar trigger must stay away from the persistent Stop control'
Need $summary 'left:12px;right:auto;bottom:calc(94px + env(safe-area-inset-bottom));z-index:2200' 'Bot summary launcher must sit above and away from command dock'
Need $mirror 'className="cc-mobile-mirror-launch"' 'Mobile Mirror launcher must have a dedicated safe-placement class'
Need $css '.cc-mobile-mirror-launch{' 'Mobile Mirror launcher safe-placement styles missing'
Need $css 'bottom:calc(90px + env(safe-area-inset-bottom))!important;' 'Mobile Mirror launcher must sit above the Start/Stop dock'
Need $css 'z-index:2590!important;' 'Mobile Mirror launcher must remain below the Start/Stop dock in stacking order'
Write-Host 'SCENOVA mobile dashboard command hierarchy contract: PASS'
