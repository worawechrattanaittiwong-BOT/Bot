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
# The customer asked to remove developer-oriented copy from the picker.
# Preserve the contract by asserting that the picker only lists exact choices.
Assert-Contains $dashboard 'tradingSymbolOptions.map(item=><option key={item} value={item}' 'Web renders exact discovered choices without guessed suffixes'
Assert-Contains $dashboard 'Market Watch' 'Web shows Market Watch discovery progress'

# Initial Cloud MT5 selection is XAU-only. Confirmed-account switching allows exact EA Market Watch choices including BTC.
Assert-Contains $controller 'discovered_xau_symbols' 'Cloud symbol endpoint reads Worker discovery telemetry'
Assert-Contains $controller 'discoveredXauSymbols' 'Cloud symbol endpoint exposes discovered XAU symbols'
Assert-Contains $controller '!alreadyConnected && !requestedSymbol.toUpperCase().startsWith("XAU")' 'first Cloud MT5 connection rejects non-XAU selection'
Assert-Contains $controller 'connectedAccountSymbolChoices(instance.metrics)' 'post-connect Symbol picker reads exact EA Market Watch'
Assert-Contains $controller 'exactConnectedAccountSymbol(requestedSymbol, instance.metrics)' 'post-connect selection requires an exact MT5 symbol'
Assert-Contains $controller 'pendingOrders > 0' 'confirmed account Symbol changes block pending orders'
Assert-Contains $dashboard 'const choices = connected ? result?.marketWatchSymbols : result?.discoveredXauSymbols' 'initial and post-connect Symbol choices remain isolated'
Assert-Contains $adminApi 'const postConnect = String(slot.settings?.symbolResolutionMode' 'admin Symbol flow distinguishes initial vs confirmed account'
Assert-Contains $ownerApi 'const postConnect = String(slot.settings?.symbolResolutionMode' 'owner Symbol flow distinguishes initial vs confirmed account'
Assert-Contains $adminApi 'exactConnectedAccountSymbol(requestedSymbol, slot.metrics)' 'admin exact Symbol provenance required'
Assert-Contains $ownerApi 'exactConnectedAccountSymbol(requestedSymbol, slot.metrics)' 'owner exact Symbol provenance required'
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

# Worker opens MT5 first without a trading EA, reads exact XAU names from MT5 Market Watch, then uses only the customer-confirmed exact name.
Assert-Contains $cloudModels 'public bool SymbolDiscoveryPending => !HasConfirmedSymbol;' 'Worker has explicit discovery phase'
Assert-Contains $cloudModels 'public string Symbol => HasConfirmedSymbol ? RequestedSymbol : "";' 'Worker has no default Symbol'
Assert-NotContains $cloudModels 'ResolveBrokerSymbol' 'Worker broker suffix resolver'
Assert-NotContains $cloudModels 'FallbackSymbol' 'Worker fallback Symbol'
Assert-NotContains $cloudModels 'StartupSymbolCandidates' 'Worker guessed Symbol candidate list'
Assert-Contains $cloudRuntime 'symbol-discovery.started' 'Worker marks the real MT5 discovery session'
Assert-Contains $cloudRuntime 'DiscoverMarketWatchXauSymbols' 'Worker reads customer choices directly from MT5 Market Watch'
Assert-Contains $cloudRuntime '"selected-*.dat"' 'Worker reads the MT5 account-specific Market Watch database'
Assert-Contains $cloudRuntime 'value.StartsWith("XAU"' 'Worker filters discovery to XAU only'
Assert-NotContains $cloudRuntime '"symbols.sel"' 'Worker must not use the MT4 Market Watch file name in MT5 discovery'
Assert-NotContains $cloudRuntime 'DiscoverRawXauCandidates' 'Worker must not bootstrap discovery from raw broker cache'
Assert-NotContains $cloudRuntime 'ReadValidatedXauSymbols' 'Worker must not depend on a probe result file'
Assert-NotContains $cloudRuntime 'EnsureSymbolDiscoveryProbe' 'Worker must not start/rotate a discovery Probe'
Assert-Contains $cloudRuntime '"Enabled=0"' 'Discovery phase launches MT5 with Expert execution disabled'
Assert-Contains $cloudRuntime '"AllowLiveTrading=0"' 'Discovery phase cannot trade'
Assert-Contains $cloudRuntime '"WebRequest=0"' 'Discovery phase does not start EA network control'
Assert-Contains $cloudRuntime 'string.IsNullOrWhiteSpace(prepared.Symbol)' 'launch path distinguishes discovery from confirmed exact Symbol'
Assert-NotContains $cloudRuntime 'symbol bootstrap retry' 'Worker guessed retry loop'
Assert-NotContains $cloudRuntime 'prepared.StartupSymbols' 'Worker startup candidate iteration'
Assert-Contains $workerApi 'discoveredXauSymbols?: string[]' 'Worker heartbeat accepts discovered XAU list'
Assert-Contains $workerApi '/^XAU[A-Za-z0-9._#-]{3,29}$/i' 'Server sanitizes Worker discovery to XAU names'
Assert-Contains $dashboard 'Market Watch ของ MT5 บัญชีนี้' 'Web explains that customer choices come from Market Watch'
Assert-Contains $dashboard 'onClick={applyTradingSymbol}' 'Web requires explicit customer Symbol confirmation'

# Release and self-test must carry the new protocol.
Assert-Contains $workerLoop 'Version = "2.2.38"' 'Worker version bumped for Symbol discovery protocol'
Assert-Contains $cloudRelease 'workerVersion: "2.2.38"' 'Server publishes discovery-capable Worker'
Assert-Contains $cloudRelease 'setupVersion: "0.6.25"' 'Cloud Setup bumped with the new Worker'
Assert-Contains $selfTest 'new Cloud account must enter symbol discovery without a guessed symbol' 'self-test covers no-guess discovery'
Assert-Contains $selfTest 'customer-confirmed exact symbol must be preserved byte-for-byte' 'self-test covers exact Symbol authority'

Write-Host 'Trading symbol MT5 discovery contract PASS.'
