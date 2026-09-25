$ErrorActionPreference = "Stop"

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$message) {
  if(-not $text.Contains($needle)){throw $message}
}

$page = Read-Text 'apps/web/app/dashboard/page.tsx'
$css = Read-Text 'apps/web/app/mobile-ui.css'

Need $page 'id="live-orders"' 'Mobile Orders anchor missing from the existing live positions section'
Need $css 'SCENOVA Mobile UX Upgrade · M2' 'M2 mobile dashboard styles missing'
Need $css '.cc-v19-hero-quick-actions' 'M2 must preserve the existing bot control buttons'
Need $css '.cc-v3-kpis.cc-v6-kpis' 'M2 mobile KPI layout missing'
Need $css '.cc-v17-running-table .row' 'M2 mobile live-order card layout missing'
Need $css '@media (max-width:767px)' 'M2 must remain mobile scoped'

$forbidden = @(
  'fetch("/bot/',
  'RaceAnalysisDirection',
  'ProcessRaceFill',
  'ManageRaceBasket'
)
foreach($needle in $forbidden){
  if($css.Contains($needle)){
    throw "M2 presentation CSS must not contain execution logic: $needle"
  }
}

Write-Host 'SCENOVA mobile UI M2 dashboard/home contract: PASS'
