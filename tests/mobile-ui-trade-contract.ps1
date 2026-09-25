$ErrorActionPreference = "Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}

$experience=Read-Text 'apps/web/components/MobileExperience.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'
$page=Read-Text 'apps/web/app/dashboard/page.tsx'

Need $experience 'scn-mobile-primary-nav' 'M3 primary 5-tab mobile navigation missing'
Need $experience 'label:"Home"' 'M3 Home navigation missing'
Need $experience 'label:"Trade"' 'M3 Trade navigation missing'
Need $experience 'label:"Orders"' 'M3 Orders navigation missing'
Need $experience 'label:"Stats"' 'M3 Stats navigation missing'
Need $experience '<span>More</span>' 'M3 More navigation missing'
Need $experience '/dashboard?view=overview#trade-control' 'Trade tab must target the mobile bot command center'
Need $experience '/dashboard?view=overview#live-orders' 'Orders tab must target the existing live orders surface'
Need $experience '/packages' 'More sheet must preserve package navigation'
Need $experience '/referrals' 'More sheet must preserve referral navigation'
Need $experience '/runtime-migration' 'More sheet must preserve runtime migration navigation'
Need $page 'id="trade-control"' 'Trade command center destination anchor missing'
Need $page 'className="settings"' 'Trade command center must keep direct Settings access'
Need $page 'id="live-orders"' 'Orders destination anchor missing'
Need $css '#bot-settings .cc-bot-v2-fields' 'M3 settings mobile field layout missing'
Need $css '#bot-settings .cc-bot-v2-footer' 'M3 mobile settings save/footer treatment missing'
Need $css '@media (max-width:767px)' 'M3 must remain mobile-only'

Write-Host 'SCENOVA mobile UI M3 navigation + trade settings contract: PASS'
