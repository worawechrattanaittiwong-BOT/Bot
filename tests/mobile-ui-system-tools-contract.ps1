$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}
$page=Read-Text 'apps/web/app/dashboard/page.tsx'
$experience=Read-Text 'apps/web/components/MobileExperience.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'
Need $page 'id="mobile-system-center"' 'M7 mobile System Center missing'
Need $page 'statusDialogRef.current?.showModal()' 'M7 must reuse existing status dialog'
Need $page 'setLogsOpen(true)' 'M7 must reuse existing Live Logs handler'
Need $page 'setActiveView("account")' 'M7 installer shortcut must reuse existing MT5 & EA view'
Need $page 'softwareUpdate.currentEaVersion' 'M7 EA version status missing'
Need $page 'softwareUpdate.currentVersion' 'M7 Agent version status missing'
Need $experience '/dashboard?view=overview#mobile-system-center' 'M7 More/System navigation target missing'
Need $css 'SCENOVA Mobile UX Upgrade · M7' 'M7 styles missing'
Need $css '.bot-log-drawer.cc-terminal-drawer' 'M7 mobile terminal layout missing'
Need $css '.cc-status-dialog' 'M7 mobile status dialog layout missing'
Need $css '@media (max-width:767px)' 'M7 must remain mobile scoped'
Write-Host 'SCENOVA mobile UI M7 installer/update/logs/system contract: PASS'
