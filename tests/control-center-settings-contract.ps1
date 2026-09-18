$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$message) {
  if (-not $text.Contains($needle)) { throw $message }
}

$page = Read-Text 'apps/web/app/dashboard/page.tsx'
$css = Read-Text 'apps/web/app/premium-dashboard.css'
$bot = Read-Text 'apps/api/src/bot.controller.ts'
$eaApi = Read-Text 'apps/api/src/ea.controller.ts'

Need $page 'cc-v12-control-grid' 'V12 compact control grid missing'
Need $page '<BotSettingsModal' 'Bot Settings workspace missing'
Need $page 'embedded' 'Bot Settings must be embedded on the Control Center'
Need $page 'cc-bot-v12-mode-select' 'Trading Mode dropdown missing'
foreach($mode in @('<option value="AUTO">AUTO</option>','<option value="RACE">RACE</option>','<option value="FLIP_LOCK">FLIP LOCK</option>','<option value="ZERO_GRID">ZERO GRID</option>','<option value="MANUAL">MANUAL</option>')) {
  Need $page $mode "Concise mode dropdown option missing: $mode"
}
Need $page 'Win Rate วันนี้' 'Daily Win Rate KPI missing'
Need $page 'Drawdown วันนี้' 'Daily Drawdown KPI missing'
Need $page 'PERFORMANCE BY MODE' 'Per-mode performance card missing'
Need $page 'modePerformanceToday.map' 'Per-mode performance rows must use real API data'
Need $page 'AI EXECUTION CONTROL' 'Single AI execution control card missing'
Need $page 'SCENOVA INTELLIGENCE CORE' 'AI/Genetic intelligence card missing'
Need $page 'AI-driven & Genetic Algorithm' 'AI-driven Genetic Algorithm identity missing'
if($page.Contains('<LivePriceChart points={livePricePoints}')) { throw 'Price chart must not render on V12 Control Center' }

Need $bot 'modeToday: controlModes.map' 'Dashboard per-mode stats payload missing'
Need $bot "AT TIME ZONE 'Asia/Bangkok'" 'Today stats must use Bangkok-local day'
Need $bot 'drawdownMoney: maxDrawdown' 'Realized daily drawdown calculation missing'
Need $bot 'drawdownPercent:' 'Daily drawdown percent missing'
Need $eaApi 'controlMode: journalControlMode' 'Journal must persist execution mode ownership'
Need $css '.cc-v12-control-grid' 'V12 layout styling missing'
Need $css '.cc-bot-v2-embedded' 'Inline settings styling missing'
Need $css 'grid-template-columns:repeat(6' 'Desktop KPI row must fit the six decision-critical cards'
Need $page 'cc-v13-hero-intelligence' 'Hero AI/Genetic execution summary missing'
Need $page 'SCENOVA INTELLIGENCE CORE' 'Merged system intelligence card missing'
Need $css '.cc-v13-system-intelligence' 'Readable merged system card styling missing'
Need $css '.cc-v12-quick-actions{grid-template-columns:repeat(2' 'Control buttons must use a compact two-column deck'
if($page.Contains('cc-v6-command start')) { throw 'Duplicate oversized hero Start button still exists' }

Write-Host 'Control Center V12 inline-settings/per-mode-performance contract PASS'

Need $page 'cc-bot-v14-head-save' 'Top-right Save Settings button missing'
Need $page '>การเปิดออเดอร์</b>' 'Concise entry section title missing'
Need $page '>กำไร / Stop Loss</b>' 'Concise exit section title missing'
Need $page '>Risk Controls</b>' 'Concise risk section title missing'
Need $css '.cc-bot-v2-embedded .cc-bot-v2-field>small' 'Embedded helper-text suppression missing'
Need $css '.cc-bot-v2-embedded .cc-bot-v2-limit-grid{' 'Reference-style risk rows missing'
Need $css '.cc-bot-v14-head-save{' 'Reference-style top save button styling missing'
if($page.Contains('onLabel="เปิด · ปิดทั้งหมดเมื่อถึงเป้า"')) { throw 'RACE toggle still contains explanatory label' }
