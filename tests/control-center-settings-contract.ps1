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

Need $page 'cc-v17-split-grid' 'V17 left/right Control Center grid missing'
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
Need $page 'cc-v17-action-row' 'Compact bot action row missing'
if($page.Contains('cc-v17-control-identity')) { throw 'Removed Control Center identity header must not render' }
if($page.Contains('cc-v17-control-meta')) { throw 'Removed Symbol/Lot/EA Sync header must not render' }
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

Need $page 'cc-v15' 'V15 readable Control Center marker missing'
Need $css 'font-size:13px!important' 'V15 standard 13px settings typography missing'
Need $css 'font-size:14px!important' 'V15 section-title typography missing'
Need $css 'min-height:calc(100vh - 300px)!important' 'V15 viewport-filling workspace rule missing'
Need $css 'max-height:none!important' 'V15 must remove the old desktop workspace max-height cap'
if($css.Contains('cc-v15 .cc-v12-control-grid{height:calc(100vh - 345px)')) { throw 'V15 still uses the old capped workspace height' }

Need $page 'cc-v17-split-grid' 'V17 left/right split grid missing'
Need $page 'cc-v17-settings-column' 'V17 left settings column missing'
Need $page 'cc-v17-running-positions' 'V17 right Running Positions card missing'
Need $page 'openPositions.length ? [...openPositions].reverse().map' 'Running Positions must use live MT5 openPositions'
Need $page 'position.openPrice' 'Running Positions must expose the actual open price'
Need $page 'position.profit' 'Running Positions must expose live P&L'
Need $page 'cc-bot-v17-add-setting' 'Inactive optional settings must collapse behind Add Setting'
Need $page 'raceCloseAllProfitEnabled&&<label' 'RACE target amount must hide when Close-All Profit is disabled'
Need $css 'grid-template-columns:minmax(0,1fr) minmax(0,1fr)' 'Desktop Settings / Running Positions must be a true 50/50 left-right split'
Need $css '.cc-v17-running-table .row' 'Running Positions table styling missing'
Need $css '.cc-bot-v17-contract-copy{display:none!important' 'Ownership/safety contract copy must stay hidden from the concise settings UI'

Need $css '.cc-v17-settings-column .cc-bot-v2-main{grid-template-columns:1fr!important' 'Bot Settings panels must stack in one vertical column'
Need $css '.cc-v17-settings-column .cc-bot-v2-fields{' 'Bot Settings two-column row override missing'
Need $css 'grid-template-columns:1fr!important;' 'Bot Settings fields must render one row per setting (name/control)'

Need $css 'Control Center V18 · single-card Bot Settings' 'Single-card Bot Settings marker missing'
Need $css '.cc-v17-settings-column .cc-bot-v2-panel{' 'Single-card section override missing'
Need $css 'background:transparent!important;' 'Nested settings panels must be visually merged into one card'
Need $css '.cc-v17-settings-column .cc-bot-v2-panel:last-child{' 'Single-card final section rule missing'
