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
Need $mobile 'root.dataset.scenovaMobileTheme = "dark"' 'Mobile UI must force the approved dark theme'
Need $mobile 'data-mobile-ui-only="true"' 'Mobile UI-only marker missing'
Need $css '@media (max-width:767px)' 'Mobile UI must remain isolated below the mobile breakpoint'
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

if($mobile.Contains('Appearance') -or $mobile.Contains('prefers-color-scheme: light') -or $mobile.Contains('setTheme(')){
  throw 'Dark-only mobile UI must not expose or auto-select a light theme'
}

Write-Host 'SCENOVA mobile UI M1 shell + dark-only theme contract: PASS'
