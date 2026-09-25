$ErrorActionPreference="Stop"
function Read-Text([string]$path){if(-not(Test-Path $path)){throw "Missing source: $path"};[System.IO.File]::ReadAllText((Resolve-Path $path))}
function Need([string]$text,[string]$needle,[string]$message){if(-not $text.Contains($needle)){throw $message}}
$page=Read-Text 'apps/web/app/dashboard/page.tsx'
$mobile=Read-Text 'apps/web/components/MobileExperience.tsx'
$css=Read-Text 'apps/web/app/mobile-ui.css'
$summary=Read-Text 'apps/web/components/BotPerformanceSummary.tsx'

Need $page 'id="trade-control"' 'Dashboard mobile command center anchor missing'
Need $page 'className="start"' 'Start handler button missing'
Need $page 'className="stop"' 'Safe Stop handler button missing'
Need $page 'className="close"' 'Close All handler button missing'
Need $page 'className="settings"' 'Direct Settings utility missing from command center'
Need $page 'command("/bot/start"' 'Existing Start command handler must remain'
Need $page 'command("/bot/stop"' 'Existing Safe Stop command handler must remain'
Need $page 'command("/bot/close-all"' 'Existing Close All command handler must remain'
Need $mobile '/dashboard?view=overview#trade-control' 'Trade tab must open the command center'
Need $css 'SCENOVA Dashboard Command Center' 'Dashboard professional mobile control styles missing'
Need $css 'button.start' 'Primary Start hierarchy missing'
Need $css 'button.stop' 'Safe Stop hierarchy missing'
Need $css 'button.close' 'Close All hierarchy missing'
Need $css '.cc-v47-live-state .cc-status-trigger-copy' 'Readable bot status strip missing'
Need $css 'body[data-scn-mobile-route="dashboard"] .bps-launcher' 'Summary launcher overlap prevention missing'
Need $summary 'position:static;width:100%;justify-content:center' 'Mobile summary must not float above bottom controls'

$hero=$page.IndexOf('id="trade-control"')
$kpi=$page.IndexOf('className="cc-kpi-grid cc-v3-kpis cc-v6-kpis cc-v12-kpis cc-v13-kpis"')
$telemetry=$page.IndexOf('className="cc-v6-telemetry"')
$system=$page.IndexOf('className="mobile-only scn-mobile-system-center"')
if($hero -lt 0 -or $kpi -lt 0 -or $telemetry -lt 0 -or $system -lt 0){throw 'Dashboard command hierarchy markers missing'}
if(-not($hero -lt $kpi -and $kpi -lt $telemetry -and $telemetry -lt $system)){throw 'Mobile dashboard hierarchy must be Command -> KPI -> Telemetry -> System'}

Write-Host 'SCENOVA dashboard mobile professional command center contract: PASS'
