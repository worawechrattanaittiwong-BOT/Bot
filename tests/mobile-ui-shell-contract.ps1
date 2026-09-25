$ErrorActionPreference = "Stop"

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$message) {
  if(-not $text.Contains($needle)){throw $message}
}

$layout = Read-Text 'apps/web/app/layout.tsx'
$mobile = Read-Text 'apps/web/components/MobileExperience.tsx'
$css = Read-Text 'apps/web/app/mobile-ui.css'
$sidebar = Read-Text 'apps/web/components/OwnerSidebar.tsx'

Need $layout 'import "./mobile-ui.css";' 'Mobile UI stylesheet must load after existing dashboard styles'
Need $layout '<MobileExperience />' 'Mobile theme experience must be mounted once at root'
Need $mobile 'scenova-mobile-theme' 'Mobile theme persistence key missing'
Need $mobile 'data-mobile-ui-only="true"' 'Mobile UI-only marker missing'
Need $mobile 'prefers-color-scheme: light' 'Mobile theme should honor device preference on first use'
Need $css '@media (max-width:767px)' 'Mobile UI must remain isolated below the mobile breakpoint'
Need $css 'data-scenova-mobile-theme="light"' 'Light mode CSS contract missing'
Need $css 'body.scn-mobile-app-route .mobile-only.mobile-nav' 'Mobile app navigation shell missing'
Need $css 'env(safe-area-inset-bottom)' 'Mobile shell must respect device safe area'
Need $sidebar 'mobile-nav-icon' 'Mobile navigation must expose app-style icon slots'

if($css -match '@media\s*\(min-width:[^)]+\)\s*\{[^}]*scn-mobile-theme-toggle'){
  throw 'Mobile theme control must not be enabled by a desktop min-width rule'
}

$forbidden = @(
  'mt5/FastBasketBot.mq5',
  'RaceAnalysisDirection',
  'ProcessRaceFill',
  'ManageRaceBasket'
)
foreach($needle in $forbidden){
  if($mobile.Contains($needle) -or $css.Contains($needle)){
    throw "Mobile UI foundation leaked into trading logic: $needle"
  }
}

Write-Host 'SCENOVA mobile UI M1 shell + light mode contract: PASS'
