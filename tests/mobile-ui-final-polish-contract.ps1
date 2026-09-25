$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}
$experience=Read-Text 'apps/web/components/MobileExperience.tsx'
$layout=Read-Text 'apps/web/app/layout.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'
Need $experience 'window.addEventListener("offline"' 'M8 offline feedback missing'
Need $experience 'scn-mobile-network-state' 'M8 network state UI missing'
Need $experience 'pathname === "/performance"' 'M8 authenticated Performance route classification missing'
if($experience -match '(?m)^\s*"/performance",\s*$'){throw 'Public /performance/[slug] must not inherit private app navigation via prefix matching'}
Need $layout 'Viewport' 'M8 Next viewport contract missing'
Need $layout 'viewportFit: "cover"' 'M8 safe-area viewport-fit missing'
Need $layout 'appleWebApp' 'M8 standalone mobile metadata missing'
Need $css 'SCENOVA Mobile UX Upgrade · M8' 'M8 final polish styles missing'
Need $css '.scn-mobile-auth-page' 'M8 auth mobile coverage missing'
Need $css '.scn-mobile-marketing-page' 'M8 marketing mobile coverage missing'
Need $css '.scn-mobile-public-performance' 'M8 public performance mobile coverage missing'
Need $css '@media (max-width:360px)' 'M8 narrow-phone coverage missing'
Need $css 'prefers-reduced-motion:reduce' 'M8 reduced-motion handling missing'
Write-Host 'SCENOVA mobile UI M8 app-feel/public/offline contract: PASS'
