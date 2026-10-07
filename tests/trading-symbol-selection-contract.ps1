$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing symbol contract source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Assert-Contains([string]$text,[string]$needle,[string]$label) {
  if (-not $text.Contains($needle)) { throw "Trading symbol contract missing: $label" }
}
function Assert-NotContains([string]$text,[string]$needle,[string]$label) {
  if ($text.Contains($needle)) { throw "Trading symbol contract forbids: $label" }
}

$controller = Read-Text 'apps/api/src/trading-symbol.controller.ts'
$bot = Read-Text 'apps/api/src/bot.controller.ts'
$workerApi = Read-Text 'apps/api/src/worker.controller.ts'
$dashboard = Read-Text 'apps/web/app/dashboard/page.tsx'
$adminApi = Read-Text 'apps/api/src/admin.controller.ts'
$ownerApi = Read-Text 'apps/api/src/owner-management.controller.ts'
$eaApi = Read-Text 'apps/api/src/ea.controller.ts'
$cloudModels = Read-Text 'tools/windows-cloud-worker/Worker/Models.cs'
$cloudRuntime = Read-Text 'tools/windows-cloud-worker/Worker/Mt5Runtime.cs'
$workerLoop = Read-Text 'tools/windows-cloud-worker/Worker/WorkerLoop.cs'
$cloudRelease = Read-Text 'apps/api/src/cloud-server-release.ts'
$selfTest = Read-Text 'tools/windows-cloud-worker/Worker/ProvisioningSelfTest.cs'
$symbolProbe = Read-Text 'mt5/ScenovaSymbolProbe.mq5'

# Connection is credential-first. There must be no USD/USDc or guessed Symbol selection.
Assert-Contains $bot "'symbolResolutionMode','DISCOVERY'" 'Cloud connect enters discovery mode'
Assert-Contains $bot "'symbolDiscoveryState','SCANNING'" 'Cloud connect records discovery progress'
Assert-Contains $bot 'symbolDiscoveryPending: mode === "CLOUD"' 'Cloud connect tells Web that discovery is pending'
Assert-Contains $bot "firstConnectPrimeArmed: false" 'Cloud connect cannot auto-start trading before customer Symbol confirmation'
Assert-Contains $bot 'symbolResolutionMode !== "EXACT"' 'Start is blocked until an exact customer-confirmed Symbol exists'
Assert-NotContains $bot 'startupSymbolForAccountType' 'server-side startup Symbol guessing'
Assert-NotContains $bot 'normalizeSymbolAccountType' 'USD/USDc Symbol profile guessing'
Assert-NotContains $dashboard 'ประเภท Symbol ของบัญชี' 'Symbol/account-type picker on MT5 connection form'
Assert-NotContains $dashboard 'symbolAccountType' 'legacy connect profile state'
Assert-Contains $dashboard 'discoveredXauSymbols' 'Web consumes XAU symbols discovered by the VPS'
Assert-Contains $dashboard 'symbolDiscoveryReady === true' 'Web waits for real MT5 discovery before prompting'
Assert-Contains $dashboard 'symbolAutoPromptedSlotRef' 'Web opens customer confirmation once per discovery cycle'
Assert-Contains $dashboard 'ระบบจะไม่เติมหรือลอง suffix ให้อัตโนมัติ' 'Web explains exact no-guess policy'
Assert-Contains $dashboard 'กำลังตรวจหา XAU จาก MT5' 'Web shows discovery progress'

# The API may accept only an exact XAU string reported by the actual runtime.
Assert-Contains $controller 'discovered_xau_symbols' 'Cloud symbol endpoint reads Worker discovery telemetry'
Assert-Contains $controller 'discoveredXauSymbols' 'Cloud symbol endpoint exposes discovered XAU symbols'
Assert-Contains $controller '!requestedSymbol.toUpperCase().startsWith("XAU")' 'non-XAU selection is rejected'
Assert-Contains $controller 'item.toUpperCase() === requestedSymbol.toUpperCase()' 'selection must exactly match a discovered broker symbol'
Assert-Contains $controller "'symbolResolutionMode','EXACT'" 'customer confirmation persists exact mode'
Assert-Contains $controller "'symbolDiscoveryState','CONFIRMED'" 'customer confirmation closes discovery'
Assert-Contains $controller "'symbolSelectedBy','CUSTOMER'" 'customer is recorded as Symbol authority'
Assert-NotContains $controller 'resolveBrokerTradingSymbol' 'API broker suffix guessing'
Assert-NotContains $controller 'resolveAccountProfileTradingSymbol' 'API account-profile suffix guessing'
Assert-NotContains $controller 'return root + "m"' 'hard-coded broker suffix fallback'
Assert-Contains $adminApi '"2.2.36"' 'Admin Cloud exact selection requires discovery-capable Worker'
Assert-Contains $ownerApi '"2.2.36"' 'Owner Cloud exact selection requires discovery-capable Worker'
Assert-NotContains $eaApi 'AUTO_DISCOVER_CLOUD_SYMBOL' 'EA heartbeat must never auto-select a Symbol for the customer'
Assert-NotContains $eaApi 'ACCOUNT_PROFILE' 'EA heartbeat must not repair guessed Symbol profiles'

# Worker opens MT5 first without a trading EA, scans real terminal data, then uses only the confirmed exact name.
Assert-Contains $cloudModels 'public bool SymbolDiscoveryPending => !HasConfirmedSymbol;' 'Worker has explicit discovery phase'
Assert-Contains $cloudModels 'public string Symbol => HasConfirmedSymbol ? RequestedSymbol : "";' 'Worker has no default Symbol'
Assert-NotContains $cloudModels 'ResolveBrokerSymbol' 'Worker broker suffix resolver'
Assert-NotContains $cloudModels 'FallbackSymbol' 'Worker fallback Symbol'
Assert-NotContains $cloudModels 'StartupSymbolCandidates' 'Worker guessed Symbol candidate list'
Assert-Contains $cloudRuntime 'symbol-discovery.started' 'Worker marks the real MT5 discovery session'
Assert-Contains $cloudRuntime 'DiscoverRawXauCandidates' 'Worker may use raw MT5 files only to bootstrap the non-trading validator'
Assert-Contains $cloudRuntime 'ReadValidatedXauSymbols' 'Customer choices come only from the validated MT5 probe result'
Assert-Contains $cloudRuntime 'scenova-xau-usable.txt' 'Worker reads the validated usable-XAU result file'
Assert-Contains $cloudRuntime 'value.StartsWith("XAU"' 'Worker filters discovery to XAU only'
Assert-Contains $cloudRuntime '"Enabled=0"' 'Discovery phase launches MT5 with Expert execution disabled'
Assert-Contains $cloudRuntime '"AllowLiveTrading=0"' 'Discovery phase cannot trade'
Assert-Contains $cloudRuntime '"WebRequest=0"' 'Discovery phase does not start EA network control'
Assert-Contains $cloudRuntime 'string.IsNullOrWhiteSpace(prepared.Symbol)' 'launch path distinguishes discovery from confirmed exact Symbol'
Assert-NotContains $cloudRuntime 'symbol bootstrap retry' 'Worker guessed retry loop'
Assert-NotContains $cloudRuntime 'prepared.StartupSymbols' 'Worker startup candidate iteration'
Assert-Contains $workerApi 'discoveredXauSymbols?: string[]' 'Worker heartbeat accepts discovered XAU list'
Assert-Contains $workerApi '/^XAU[A-Za-z0-9._#-]{3,29}$/i' 'Server sanitizes Worker discovery to XAU names'
Assert-Contains $symbolProbe 'SYMBOL_TRADE_MODE_DISABLED' 'Probe rejects disabled broker symbols'
Assert-Contains $symbolProbe 'SYMBOL_TRADE_MODE_CLOSEONLY' 'Probe rejects close-only broker symbols'
Assert-Contains $symbolProbe 'SERIES_SYNCHRONIZED' 'Probe requires synchronized M5 series'
Assert-Contains $symbolProbe 'CopyRates(symbol,PERIOD_M5' 'Probe requires usable M5 chart data'
Assert-Contains $symbolProbe 'SYMBOL_VOLUME_MIN' 'Probe verifies the broker exposes executable volume metadata'
Assert-Contains $dashboard 'เปิดกราฟ M5 ได้และอนุญาตเทรด' 'Web explains that only usable/tradable XAU symbols are shown'

# Release and self-test must carry the new protocol.
Assert-Contains $workerLoop 'Version = "2.2.36"' 'Worker version bumped for Symbol discovery protocol'
Assert-Contains $cloudRelease 'workerVersion: "2.2.36"' 'Server publishes discovery-capable Worker'
Assert-Contains $cloudRelease 'setupVersion: "0.6.25"' 'Cloud Setup bumped with the new Worker'
Assert-Contains $selfTest 'new Cloud account must enter symbol discovery without a guessed symbol' 'self-test covers no-guess discovery'
Assert-Contains $selfTest 'customer-confirmed exact symbol must be preserved byte-for-byte' 'self-test covers exact Symbol authority'

Write-Host 'Trading symbol MT5 discovery contract PASS.'
