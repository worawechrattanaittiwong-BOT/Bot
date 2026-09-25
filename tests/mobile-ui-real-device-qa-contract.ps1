$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}
$mobile=Read-Text 'apps/web/components/MobileExperience.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'

if($mobile.Contains('className="scn-mobile-theme-toggle"')){throw 'Real-device QA: floating theme pill must not be rendered'}
if($mobile.Contains('scn-mobile-more-theme') -or $mobile.Contains('Appearance') -or $mobile.Contains('setTheme(')){throw 'Real-device QA: mobile theme switching must be removed'}
Need $css 'SCENOVA Mobile Visual QA Fix' 'Real-device visual QA CSS block missing'
Need $css '.cc-v6-gold-stage' 'Decorative mobile gold tile cleanup missing'
Need $css '.cc-v19-three-card-grid .cc-v17-running-positions' 'Live execution fixed-height override missing'
Need $css '.cc-v19-settings-card .cc-bot-v2-embedded' 'Settings fixed-height override missing'
Need $css 'height:auto!important' 'Phone cards must return to content height'
Need $css '--m-primary-nav-height:62px' 'Bottom navigation compact QA size missing'
Need $css 'padding-bottom:calc(var(--m-primary-nav-height) + 40px' 'Bottom navigation content clearance missing'
Write-Host 'SCENOVA real-device mobile visual QA contract: PASS'
