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
Need $page 'cc-rated-mode-option' 'Rated mode option marker missing'
Need $page 'cc-race-recommended-badge' 'RACE recommended badge missing'
Need $css '.cc-bot-v12-mode-select.is-rated-mode' 'Rated selected-state styling missing'
Need $css '.cc-race-recommended-badge' 'RACE recommendation badge styling missing'
foreach($mode in @('<option value="AUTO">AUTO</option>','<option value="RACE" className="cc-rated-mode-option">★★★ RACE</option>','<option value="COUNTER" className="cc-rated-mode-option">★★ COUNTER</option>','<option value="FLIP_LOCK" className="cc-rated-mode-option">★★ FLIP LOCK</option>','<option value="MANUAL">MANUAL</option>')) {
  Need $page $mode "Concise mode dropdown option missing: $mode"
}
Need $page '<option value="ZERO_GRID" className="cc-rated-mode-option" disabled={zeroGridBlockedForSymbol}>★ ZERO GRID' 'ZERO GRID rated dropdown option must remain available for supported symbols and disable on BTC/XBT'
Need $page 'Win Rate วันนี้' 'Daily Win Rate KPI missing'
Need $page 'Drawdown วันนี้' 'Daily Drawdown KPI missing'
Need $page 'PERFORMANCE BY MODE' 'Per-mode performance card missing'
Need $page 'modePerformanceToday.map' 'Per-mode performance rows must use real API data'
Need $page 'cc-v13-hero-actions' 'Hero bot action deck missing'
Need $page 'const botCommandLockRef = useRef(false);' 'Start/Stop synchronous command lock missing'
Need $page 'const [botCommandLocked, setBotCommandLocked] = useState(false);' 'Start/Stop visual lock state missing'
Need $page 'if (singleClickBotCommand && botCommandLockRef.current) return;' 'Start/Stop duplicate-click guard missing'
Need $page 'botCommandLockRef.current = true;' 'Start/Stop command lock must engage before API call'
Need $page 'setBotCommandLocked(false);' 'Start/Stop command lock must release after command completes'
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

Need $css 'Control Center V54 · compact mobile Bot Settings' 'Mobile Bot Settings compact layout marker missing'
Need $css '--settings-label:116px' 'Mobile Bot Settings label column must shrink to prevent control collisions'
Need $css 'grid-template-columns:68px minmax(0,1fr)!important;' 'Mobile risk toggle/value controls must fit without overlap'
Need $css '.cc-v19-settings-card .cc-bot-v2-limit-grid .toggle-setting-label .setting-toggle-text' 'Mobile risk rows must hide redundant switch text'
Need $css 'height:auto!important;' 'Mobile Bot Settings must not inherit clipped desktop fixed height'

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
Need $page 'raceProfitTargetMode==="BASKET"' 'RACE Basket profit selector missing'
Need $page 'raceProfitTargetMode==="POSITION"' 'RACE per-position profit selector missing'
Need $page 'racePerPositionProfitMoney' 'RACE per-position profit amount missing'
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


Need $page 'alwaysShowInput' 'Always-visible optional setting controls missing'
Need $page 'settingHelpLabel("profit-kind","รูปแบบกำไร"' 'Aligned Basket/per-position selector with tap help missing'
Need $page 'cc-bot-v2-choice-inline' 'Aligned MANUAL profit selector missing'
if($page.Contains('revealedOptional')) { throw 'Legacy global optional reveal state must stay removed' }
Need $page 'cc-bot-manual-risk-add' 'MANUAL must provide a single optional-risk add control'
Need $page 'revealedManualRisk' 'MANUAL optional-risk reveal state missing'

Need $page 'autoLot' 'AUTO Lot profile missing'
Need $page 'autoMaxPositions' 'AUTO max-position profile missing'
Need $page 'raceLot' 'RACE Lot profile missing'
Need $page 'raceMaxPositions' 'RACE max-position profile missing'
Need $page 'counterLot' 'COUNTER Lot profile missing'
Need $page 'counterMaxPositions' 'COUNTER max-position profile missing'
Need $page 'counterPerPositionProfitMoney' 'COUNTER per-position profit profile missing'
Need $page 'จำนวนไม้รวม' 'COUNTER UI must expose one total-position setting'
Need $page 'BUY {v/2} / SELL {v/2}' 'COUNTER UI must show the automatic half split'
Need $page 'flipLockLot' 'FLIP LOCK Lot profile missing'
Need $page 'manualLot' 'MANUAL Lot profile missing'
Need $page 'manualMaxPositions' 'MANUAL max-position profile missing'
Need $page 'editModeSizing' 'Mode-specific sizing edit helper missing'
Need $page 'manualMaxBasketLossMoney' 'MANUAL optional risk profile missing'
Need $bot 'numberSetting("autoLot", 0.01, 100)' 'API must persist AUTO Lot profile'
Need $bot 'numberSetting("raceMaxPositions", 1, 100, true)' 'API must persist RACE max-position profile'
Need $bot 'numberSetting("counterLot", 0.01, 100)' 'API must persist COUNTER Lot profile'
Need $bot 'จำนวนไม้รวม COUNTER ต้องเป็น 10, 20, 30 ... ถึง 200' 'API must validate COUNTER total-position profile'
Need $bot 'clean.counterMaxPositions = counterTotalPositions;' 'API must persist normalized COUNTER total positions'
Need $bot 'clean.maxPositions = counterTotalPositions / 2;' 'API must map COUNTER total positions to per-side runtime capacity'
Need $bot 'numberSetting("manualLot", 0.01, 100)' 'API must persist MANUAL Lot profile'
Need $bot 'numberSetting("manualDailyProfitTargetMoney", 0, maxAccountMoney)' 'API must persist MANUAL optional risk profile'
Need $db '"manualDailyProfitTargetMoney":0.0' 'New accounts must default MANUAL optional daily profit to OFF'
Need $db '"counterMaxPositions":10' 'New accounts must default COUNTER to 10 total positions'
Need $db '"counterSizingVersion":2' 'New accounts must use COUNTER total-slot sizing V2'

Need $page 'cc-bot-manual-risk-add-all' 'MANUAL reveal-all button missing'
Need $page '[riskProfile.basket]:true,[riskProfile.dailyLoss]:true,[riskProfile.dailyProfit]:true' 'MANUAL reveal-all must show all three hidden risk controls together'
if($page.Contains('<select className="input" value="" onChange={e=>{if(e.target.value)setRevealedManualRisk')) { throw 'MANUAL optional risk must not use one-by-one selector' }
Need $page '"cc-bot-mode-"+controlMode.toLowerCase()' 'Mode-specific Bot Settings class missing'

Need $layout 'SystemPopupProvider' 'Global System Popup provider must wrap the web app'
Need $popup 'export function SystemPopupProvider' 'System Popup provider component missing'
Need $popup 'export function useSystemPopup' 'System Popup hook missing'
Need $popup 'kind: "confirm"' 'System Popup confirm mode missing'
Need $globals 'SCENOVA System Popup · global UI standard' 'Global System Popup visual standard missing'
Need $globals '.sc-system-popup-layer.is-confirm' 'Centered confirm overlay styling missing'
Need $page 'useSystemPopup' 'Dashboard must use the global System Popup'
Need $page 'confirmPopup({tone:"warning",title:"ยืนยันปิดสถานะทั้งหมด"' 'Close All Positions must use the centered system confirm popup'
if($page.Contains('page-notice">{error}')) { throw 'Dashboard must not render the legacy floating error notice' }
if($page.Contains('page-notice">{notice}')) { throw 'Dashboard must not render the legacy floating success notice' }
Need $manualActions 'useSystemPopup' 'Manual MT5 actions must use the global System Popup'
if($manualActions.Contains('window.confirm(')) { throw 'Manual MT5 actions must not use native browser confirm' }
if($manualActions.Contains('scenova-manual-toast ok')) { throw 'Manual MT5 actions must not render the legacy corner toast' }
if($page.Contains('Low Volatility</small>')) { throw 'ZERO GRID embedded controls must not show helper descriptions' }
if($page.Contains('เลือกได้ 1–30 ระดับต่อฝั่ง · รอ EA Sync หลังบันทึก')) { throw 'ZERO GRID level helper copy must be removed' }
if($page.Contains('ใช้ Lot เท่ากันทุกระดับ')) { throw 'ZERO GRID lot helper copy must be removed' }

Need $page 'TRADING MODE GUIDE' 'Trading mode guide modal missing'
Need $page 'Adaptive Directional · ไม่ใช่ Martingale' 'AUTO guide must disclose its non-Martingale strategy type'
Need $page 'Momentum / Fast Entry · ไม่ใช่ Martingale' 'RACE guide must disclose its non-Martingale strategy type'
Need $page 'Single Position + Safety SL + 100-Point Profit Trail · ไม่ใช่ Martingale' 'FLIP LOCK guide must disclose fixed 100-point broker-SL profit trail and non-Martingale behavior'
Need $page 'Dual-Sided Pending Grid · Progressive Sizing' 'ZERO GRID guide must describe the dual-sided progressive grid professionally'
Need $page 'Base Lot × Level · เพิ่ม Lot ตามระดับ' 'ZERO GRID guide must explain linear level sizing concisely'
Need $page 'Net Basket Target · ปิดทั้งรอบเมื่อถึงเป้า' 'ZERO GRID guide must explain basket exit concisely'
Need $page 'minimum:"500 USD"' 'ZERO GRID capital guide must keep the requested 500 USD reference minimum'
Need $page 'minimum:"10 USD"' 'Capital guide must include the requested 10 USD low-capital reference where configured'
Need $page 'comfortable:"100+ USD"' 'RACE capital guide must include the requested 100 USD suitable reference'
Need $page 'cc-mode-guide-capital-tiers' 'Trading mode guide capital tiers missing'
Need $css '.cc-mode-guide-system{' 'Trading mode strategy summary styling missing'
Need $css '.cc-mode-guide-capital{' 'Trading mode capital guide styling missing'
Need $css '.cc-mode-guide-capital-tiers{' 'Trading mode capital tiers styling missing'

# Final CSS owner contract: verify only the currently authoritative layout layers.
Need $css 'Control Center V55 · mobile readable Bot Settings height' 'Current mobile readable settings layer missing'
Need $css 'Control Center V56 · desktop three-card breathing room' 'Current desktop three-card layout layer missing'
Need $css 'grid-template-columns:36.33fr 30.33fr 33.34fr!important;' 'Current desktop three-card proportions missing'
Need $css 'height:470px!important;' 'Current neighboring desktop card height missing'
Need $css 'Settings itself follows its visible rows with one-row bottom breathing room.' 'Desktop Bot Settings must be content-sized'
Need $css 'padding-bottom:var(--settings-row)!important;' 'Desktop Bot Settings bottom breathing room must equal one settings row'
Need $css 'max-height:none!important;' 'Desktop Bot Settings must not keep a fixed max-height'
Need $css 'Control Center V57 · relaxed mobile Bot Settings spacing' 'Current mobile settings spacing layer missing'
Need $css '--settings-row:50px' 'Current mobile settings row rhythm missing'
Need $css '--settings-control-h:36px' 'Current mobile settings control height missing'
Need $css 'Control Center V58 · Bot Settings visual polish only' 'Current Bot Settings visual-polish layer missing'
Need $css '--desktop-form-control-width:66.666%' 'Desktop Bot Settings must share one right-edge control width across every mode'
Need $css '--desktop-form-control-h:34px' 'Desktop standard controls must share one canonical height'
Need $css '.cc-v19-settings-card .cc-bot-v2-main .cc-bot-v2-field>.cc-bot-v2-choice-row,' 'Desktop RACE/MANUAL segmented controls must use the shared right-column owner'
Need $css '.cc-v19-settings-card .cc-bot-v2-toggle-row>.cc-bot-v2-control-cell,' 'Desktop ZERO GRID toggle must use the shared right-column owner'
Need $css 'Risk rows use the exact MANUAL standard-row geometry.' 'Desktop risk rows must use the MANUAL row geometry at the original CSS owner'
Need $css 'height:38px!important;' 'Desktop risk row height must match the MANUAL 38px row'
Need $css 'padding:2px!important;' 'Desktop risk row padding must match the MANUAL row'
Need $css 'Risk rows follow the same desktop row rhythm as the MANUAL profit target:' 'Current desktop risk-row control-height marker missing'
Need $css '.cc-v19-settings-card .cc-bot-v2-limit-grid .money-input-shell,' 'Desktop risk amount fields must use the shared control-height owner'
Need $css 'height:var(--desktop-form-control-h)!important;' 'Desktop risk amount fields must match the canonical 34px desktop control height'
if($css.Contains('Give the risk controls real vertical breathing room')) { throw 'Obsolete 44px / 6px desktop risk-row owner must not return' }
if($css.Contains('Risk money box breathing room only')) { throw 'Obsolete risk-field margin shim must not return' }
if($css.Contains('grid-auto-rows:52px!important;')) { throw 'Old 52px desktop risk-row owner must not return; risk rows now follow the MANUAL profit-target rhythm' }
Need $page 'cc-bot-setting-help-label' 'Bot Settings help labels missing'
Need $page 'onPointerEnter={event=>' 'Desktop hover help behavior missing'
Need $page 'event.pointerType==="mouse"' 'Desktop help must react to mouse hover only'
Need $page 'setTimeout(()=>{' 'Mobile long-press help timer missing'
Need $page '},450);' 'Mobile help must require a deliberate long press'
Need $page 'onPointerUp={event=>' 'Mobile help must dismiss when the finger is released'
Need $page 'ขาดทุนถึงยอดนี้ EA จะปิดออเดอร์ของรอบทันที' 'Basket-loss plain-language help missing'
Need $page 'ขาดทุนรวมถึงยอดนี้ บอทจะหยุดเทรดทั้งวัน' 'Daily-loss plain-language help missing'
Need $page 'กำไรรวมถึงยอดนี้ บอทจะหยุดเพื่อเก็บกำไร' 'Daily-profit plain-language help missing'
Need $page 'EA จะไม่เปิดออเดอร์เกินจำนวนนี้' 'Max-position plain-language help missing'
Need $page 'กำหนดขนาด Lot ของแต่ละออเดอร์' 'Lot plain-language help missing'
Need $css 'Control Center V60 · hover + long-press help for Bot Settings' 'Hover/long-press Bot Settings help styling missing'
Need $css '.cc-bot-setting-help-popover' 'Help popover styling missing'
Need $css ':has(.cc-bot-setting-help-popover)' 'Visible help must raise its whole row above neighboring controls'
Need $css 'z-index:10020;' 'Help popover must render above selects and inputs'
Need $css 'overflow:visible!important;' 'Visible help row must not clip the popover'
Need $css '-webkit-touch-callout:none;' 'Mobile long-press help must suppress the native callout'

Need $css 'Control Center V59 · mobile authoritative alignment' 'Current mobile authoritative alignment layer missing'
Need $css '--mobile-form-control-width:66.666%' 'All mobile modes must share the same right-edge control width'
Need $css '--mobile-form-row-h:52px' 'Standard mobile settings rows must share one vertical rhythm'
Need $css '.cc-v19-settings-card .cc-bot-v2-main .cc-bot-v2-field>select.input,' 'Standard mobile selects must use the shared right-column owner'
Need $css '.cc-v19-settings-card .cc-bot-v2-main .cc-bot-v2-field>.cc-bot-v2-choice-row,' 'RACE/MANUAL segmented controls must use the shared right-column owner'
Need $css 'grid-template-columns:68px minmax(0,1fr)!important;' 'Current mobile risk toggle/value alignment missing'
if($css.Contains('--mobile-auto-control-width')) { throw 'AUTO-only mobile width owner must not return; all modes share one right-column geometry' }
Need $css '.cc-v19-settings-card .cc-bot-mode-manual .cc-bot-v2-body{' 'MANUAL no-scroll selector missing'
Need $css 'overflow-y:hidden!important;' 'MANUAL baseline must remain no-scroll'
