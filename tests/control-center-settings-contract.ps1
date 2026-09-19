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
$db = Read-Text 'database/001_init.sql'
$layout = Read-Text 'apps/web/app/layout.tsx'
$popup = Read-Text 'apps/web/components/SystemPopupProvider.tsx'
$manualActions = Read-Text 'apps/web/components/Mt5ManualActionControls.tsx'
$globals = Read-Text 'apps/web/app/globals.css'

Need $page 'cc-v19-three-card-grid' 'Three-card Control Center grid missing'
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
Need $page 'cc-v13-hero-actions' 'Hero bot action deck missing'
if($page.Contains('cc-v17-control-identity')) { throw 'Removed Control Center identity header must not render' }
if($page.Contains('cc-v17-control-meta')) { throw 'Removed Symbol/Lot/EA Sync header must not render' }
if($page.Contains('<LivePriceChart points={livePricePoints}')) { throw 'Price chart must not render on V12 Control Center' }

Need $bot 'modeToday: controlModes.map' 'Dashboard per-mode stats payload missing'
Need $bot "AT TIME ZONE 'Asia/Bangkok'" 'Today stats must use Bangkok-local day'
Need $bot 'drawdownMoney: maxDrawdown' 'Realized daily drawdown calculation missing'
Need $bot 'drawdownPercent:' 'Daily drawdown percent missing'
Need $eaApi 'controlMode: journalControlMode' 'Journal must persist execution mode ownership'
Need $css '.cc-v12-control-grid' 'V12 layout styling missing'
Need $css '.cc-bot-v2-embedded' 'Inline settings styling missing'
Need $css 'grid-template-columns:repeat(6' 'Desktop KPI row must fit the six decision-critical cards'
Need $page 'cc-v13-hero-actions' 'Hero bot action deck missing'
Need $css '.cc-v13-hero-actions .cc-v19-hero-quick-actions' 'Hero control buttons styling missing'
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

Need $page 'cc-v19-three-card-grid' 'V19 three-column workspace missing'
Need $page 'cc-v17-settings-column' 'V17 left settings column missing'
Need $page 'cc-v17-running-positions' 'V17 right Running Positions card missing'
Need $page 'openPositions.length ? [...openPositions].reverse().map' 'Running Positions must use live MT5 openPositions'
Need $page 'position.openPrice' 'Running Positions must expose the actual open price'
Need $page 'position.profit' 'Running Positions must expose live P&L'
if($page.Contains('cc-bot-v17-add-setting')) { throw 'Dashboard must expose optional settings instead of Add Setting rows' }
Need $page 'disabled={!raceCloseAllProfitEnabled}' 'RACE target amount must remain visible but disabled when Close-All Profit is off'
Need $css 'grid-template-columns:minmax(330px,.92fr) minmax(390px,1.08fr) minmax(330px,.92fr)' 'Desktop workspace must use three columns'
Need $css '.cc-v17-running-table .row' 'Running Positions table styling missing'
Need $css '.cc-bot-v17-contract-copy{display:none!important' 'Ownership/safety contract copy must stay hidden from the concise settings UI'

Need $css '.cc-v17-settings-column .cc-bot-v2-main{grid-template-columns:1fr!important' 'Bot Settings panels must stack in one vertical column'
Need $css '.cc-v17-settings-column .cc-bot-v2-fields{' 'Bot Settings two-column row override missing'
Need $css 'grid-template-columns:1fr!important;' 'Bot Settings fields must render one row per setting (name/control)'

Need $css 'Control Center V18 · single-card Bot Settings' 'Single-card Bot Settings marker missing'
Need $css '.cc-v17-settings-column .cc-bot-v2-panel{' 'Single-card section override missing'
Need $css 'background:transparent!important;' 'Nested settings panels must be visually merged into one card'
Need $css '.cc-v17-settings-column .cc-bot-v2-panel:last-child{' 'Single-card final section rule missing'

Need $page 'cc-v13-hero-actions' 'Bot controls must live inside the hero card'
if($page.Contains('Adaptive Algorithmic Engine')) { throw 'Adaptive Algorithmic Engine hero copy must be removed' }
if($page.Contains('cc-v17-action-row')) { throw 'Separate action row below KPI cards must be removed' }
Need $page 'cc-v19-three-card-grid' 'Three-column Control Center workspace missing'
Need $page 'cc-v12-mode-performance' 'Per-mode win-rate performance card missing'
if($page.Contains('cc-v13-system-intelligence')) { throw 'Redundant Intelligence Core card must not remain in the lower workspace' }
Need $css '.cc-page-head-overview{display:none!important}' 'Overview Control Center title header must be hidden'
Need $css 'grid-template-columns:minmax(330px,.92fr) minmax(390px,1.08fr) minmax(330px,.92fr)' 'Three-column desktop layout missing'

Need $css 'Control Center V20 · flat single-form Bot Settings' 'Flat single-form Bot Settings marker missing'
Need $css '.cc-v19-settings-card .cc-bot-v2-section-title.compact{' 'Flat settings section-title override missing'
Need $css 'display:none!important;' 'Numbered settings section headers must be hidden'
Need $css '.cc-v19-settings-card .cc-bot-v2-mode-section,' 'Merged settings panel override missing'
Need $css 'border-bottom:0!important;' 'Internal settings section dividers must be removed'

Need $css 'Control Center V21 · compact fixed-height settings' 'Compact fixed-height Bot Settings marker missing'
Need $css 'height:520px!important;' 'Bot Settings and adjacent workspace cards must share the compact fixed height'
Need $css 'height:474px!important;' 'Compact fixed settings body height missing'
Need $css '.cc-v19-settings-card .cc-bot-v2-limit-grid>div{' 'Compact Risk Controls rows missing'
Need $css 'grid-template-columns:minmax(126px,.88fr) minmax(160px,1.12fr)!important;' 'Compact label-control row layout missing'
Need $css '.cc-v19-settings-card .cc-bot-v2-lowvol-note{' 'ZERO GRID compact embedded treatment missing'

Need $page 'alwaysShowInput' 'Always-visible optional setting controls missing'
Need $page 'cc-bot-v2-inline-toggle-value' 'Aligned RACE toggle/value control missing'
Need $page 'cc-bot-v2-choice-inline' 'Aligned MANUAL profit selector missing'
if($page.Contains('revealedOptional')) { throw 'Legacy global optional reveal state must stay removed' }
Need $page 'cc-bot-manual-risk-add' 'MANUAL must provide a single optional-risk add control'
Need $page 'revealedManualRisk' 'MANUAL optional-risk reveal state missing'
Need $css 'Control Center V22 · professional settings form' 'Professional settings form marker missing'
Need $css '--settings-label:178px' 'Shared settings label column missing'
Need $css '.cc-v19-settings-card .cc-bot-v12-mode-select{' 'Primary trading mode styling missing'
Need $css 'grid-template-columns:76px minmax(0,1fr)!important;' 'Toggle/value alignment missing'

Need $page 'autoLot' 'AUTO Lot profile missing'
Need $page 'autoMaxPositions' 'AUTO max-position profile missing'
Need $page 'raceLot' 'RACE Lot profile missing'
Need $page 'raceMaxPositions' 'RACE max-position profile missing'
Need $page 'flipLockLot' 'FLIP LOCK Lot profile missing'
Need $page 'manualLot' 'MANUAL Lot profile missing'
Need $page 'manualMaxPositions' 'MANUAL max-position profile missing'
Need $page 'editModeSizing' 'Mode-specific sizing edit helper missing'
Need $page 'manualMaxBasketLossMoney' 'MANUAL optional risk profile missing'
Need $bot 'numberSetting("autoLot", 0.01, 100)' 'API must persist AUTO Lot profile'
Need $bot 'numberSetting("raceMaxPositions", 1, 100, true)' 'API must persist RACE max-position profile'
Need $bot 'numberSetting("manualLot", 0.01, 100)' 'API must persist MANUAL Lot profile'
Need $bot 'numberSetting("manualDailyProfitTargetMoney", 0, 100000)' 'API must persist MANUAL optional risk profile'
Need $db '"manualDailyProfitTargetMoney":0.0' 'New accounts must default MANUAL optional daily profit to OFF'
Need $css 'Control Center V23 · mode profiles + equal-height cards' 'V23 settings/card polish marker missing'
Need $css 'position:static!important;' 'Embedded setting toggles must not float over the header'
Need $css '.cc-v19-settings-card .cc-bot-manual-risk-add{' 'MANUAL optional-risk add-control styling missing'

Need $page 'cc-bot-manual-risk-add-all' 'MANUAL reveal-all button missing'
Need $page '[riskProfile.basket]:true,[riskProfile.dailyLoss]:true,[riskProfile.dailyProfit]:true' 'MANUAL reveal-all must show all three hidden risk controls together'
if($page.Contains('<select className="input" value="" onChange={e=>{if(e.target.value)setRevealedManualRisk')) { throw 'MANUAL optional risk must not use one-by-one selector' }
Need $css 'Control Center V24 · MANUAL reveal-all + no idle scroll' 'V24 MANUAL reveal-all marker missing'
Need $page '"cc-bot-mode-"+controlMode.toLowerCase()' 'Mode-specific Bot Settings class missing'
Need $css 'Control Center V25 · compact MANUAL within original card height' 'V25 compact MANUAL marker missing'
Need $css '.cc-v19-settings-card .cc-bot-mode-manual{' 'MANUAL-specific compact rhythm missing'
Need $css '--settings-row:38px' 'MANUAL row height must be compact'
Need $css 'height:520px!important;' 'Workspace cards must remain at the original compact height'
Need $css 'height:474px!important;' 'Bot Settings body must remain at the original compact height'

Need $layout 'SystemPopupProvider' 'Global System Popup provider must wrap the web app'
Need $popup 'export function SystemPopupProvider' 'System Popup provider component missing'
Need $popup 'export function useSystemPopup' 'System Popup hook missing'
Need $popup 'kind: "confirm"' 'System Popup confirm mode missing'
Need $globals 'SCENOVA System Popup · global UI standard' 'Global System Popup visual standard missing'
Need $globals '.sc-system-popup-layer.is-confirm' 'Centered confirm overlay styling missing'
Need $page 'useSystemPopup' 'Dashboard must use the global System Popup'
Need $page 'confirmPopup({tone:"warning",title:"ปิดออเดอร์ทั้งหมด"' 'Close All must use the centered system confirm popup'
if($page.Contains('page-notice">{error}')) { throw 'Dashboard must not render the legacy floating error notice' }
if($page.Contains('page-notice">{notice}')) { throw 'Dashboard must not render the legacy floating success notice' }
Need $manualActions 'useSystemPopup' 'Manual MT5 actions must use the global System Popup'
if($manualActions.Contains('window.confirm(')) { throw 'Manual MT5 actions must not use native browser confirm' }
if($manualActions.Contains('scenova-manual-toast ok')) { throw 'Manual MT5 actions must not render the legacy corner toast' }
if($page.Contains('Low Volatility</small>')) { throw 'ZERO GRID embedded controls must not show helper descriptions' }
if($page.Contains('เลือกได้ 1–30 ระดับต่อฝั่ง · รอ EA Sync หลังบันทึก')) { throw 'ZERO GRID level helper copy must be removed' }
if($page.Contains('ใช้ Lot เท่ากันทุกระดับ')) { throw 'ZERO GRID lot helper copy must be removed' }
Need $css 'Control Center V26 · content-fit compact workspace' 'Content-fit workspace marker missing'
Need $css 'height:auto!important;' 'Workspace cards must auto-fit active mode content'
Need $css 'overflow:visible!important;' 'Bot Settings must grow naturally with visible controls'
Need $css 'max-height:180px!important;' 'Running Positions must scroll internally in the compact card'
Need $css 'max-height:210px!important;' 'Performance by Mode must stay compact inside the matched card'

Need $css 'Control Center V27 · compact independent cards' 'V27 independent-card marker missing'
Need $css 'align-items:start!important;' 'Three-card grid must not stretch sibling cards'
Need $css 'align-self:start!important;' 'Each workspace card must keep its own content height'
Need $css '--settings-row:36px' 'All Bot Settings modes must use the same compact row rhythm'
Need $css 'max-height:260px!important;' 'Running Positions must scroll internally only when rows exceed compact height'
Need $css 'max-height:272px!important;' 'Performance card must scroll internally only when needed'

Need $css 'Control Center V28 · MANUAL-height fixed settings card' 'V28 MANUAL-height fixed card marker missing'
Need $css 'height:520px!important;' 'Bot Settings must stay at the MANUAL baseline height across modes'
Need $css 'height:476px!important;' 'Fixed Bot Settings body height missing'
Need $css '--settings-row:36px' 'All modes must share MANUAL-style compact row spacing'
Need $css 'align-items:start!important;' 'Changing modes must not stretch the grid row'

Need $css 'Control Center V29 · all three cards fixed to MANUAL baseline' 'V29 equal-card baseline marker missing'
Need $css '.cc-v19-three-card-grid>section,' 'All three workspace cards must share one sizing rule'
Need $css 'height:520px!important;' 'All three cards must stay at the MANUAL baseline height'
Need $css 'max-height:520px!important;' 'All three cards must never stretch beyond the MANUAL baseline'
Need $css '--settings-row:36px' 'All modes must keep MANUAL-style compact row spacing'
Need $css 'height:38px!important;' 'Performance rows must stay compact instead of stretching'
