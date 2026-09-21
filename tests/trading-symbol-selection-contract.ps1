$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing symbol contract source: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Assert-Contains([string]$text,[string]$needle,[string]$label) {
  if (-not $text.Contains($needle)) { throw "Trading symbol contract missing: $label" }
}

$controller = Read-Text 'apps/api/src/trading-symbol.controller.ts'
$interceptor = Read-Text 'apps/api/src/trading-symbol.interceptor.ts'
$actions = Read-Text 'apps/api/src/agent-action.controller.ts'
$app = Read-Text 'apps/api/src/app.module.ts'
$installer = Read-Text 'apps/api/src/installer.controller.ts'
$runner = Read-Text 'tools/windows-installer/AgentRunner.cs'
$smartRunner = Read-Text 'tools/windows-installer/SmartAgentRunner.cs'
$agentContract = Read-Text 'tools/windows-installer/AgentActionResponse.cs'
$agentBuild = Read-Text 'tools/windows-installer/AgentBuildInfo.cs'
$project = Read-Text 'tools/windows-installer/ScenovaInstaller.csproj'
$release = Read-Text 'apps/api/src/release-version.ts'
$dashboard = Read-Text 'apps/web/app/dashboard/page.tsx'
$retiredPage = Read-Text 'apps/web/app/trading-symbol/page.tsx'
$ea = Read-Text 'mt5/FastBasketBot.mq5'
$sidebar = Read-Text 'apps/web/components/OwnerSidebar.tsx'
$manualControls = Read-Text 'apps/web/components/Mt5ManualActionControls.tsx'

Assert-Contains $controller 'startupSymbol' 'explicit desired symbol is stored separately from live metrics'
Assert-Contains $controller 'SYMBOL_AGENT_VERSION = "1.0.11"' 'authoritative symbol switching requires the current Agent'
Assert-Contains $controller 'manualMt5ActionSource' 'symbol selection queues an Agent action'
Assert-Contains $controller "'SYMBOL_SELECTION'" 'symbol switch has a dedicated explicit Web action source'
Assert-Contains $controller "'WAITING_FLAT'" 'symbol selection waits safely while positions remain'
Assert-Contains $controller "'CONNECT_MT5'" 'symbol selection automatically reconnects MT5 without a second click'
Assert-Contains $controller 'authority: "WEB"' 'audit log records Web as the symbol authority'
Assert-Contains $controller 'desired_state=''SAFE_STOP''' 'symbol selection prevents new entries before switching'
Assert-Contains $controller 'symbolTradeAllowed' 'broker trade mode is checked'
Assert-Contains $controller 'n !== 0 && n !== 3' 'disabled and close-only broker symbols are rejected while long/short-only remain valid'
Assert-Contains $controller '@Controller("ea/trading-symbol")' 'Agent has authenticated symbol status endpoint'
Assert-Contains $controller 'invalid trading symbol agent authentication' 'Agent symbol endpoint is authenticated'

Assert-Contains $interceptor 'pathname.endsWith("/bot/start")' 'normal Start is blocked on symbol mismatch'
Assert-Contains $interceptor 'pathname.endsWith("/bot/mt5/recover-start")' 'recovery Start is also blocked on symbol mismatch'
Assert-Contains $interceptor 'settings.startupSymbol' 'Start guard uses explicit selected symbol'
Assert-Contains $interceptor 'คำสั่งหน้าเว็บมีสิทธิ์สูงสุด' 'Start guard explains Web symbol authority'
Assert-Contains $interceptor 'tradeMode === 0 || tradeMode === 3' 'Start guard rejects broker disabled/close-only mode'
Assert-Contains $app 'TradingSymbolController' 'symbol controller is registered'
Assert-Contains $app 'APP_INTERCEPTOR' 'symbol Start guard is globally registered after auth guards'

Assert-Contains $actions 'actionSource === "SYMBOL_SELECTION"' 'Agent action API accepts authoritative Web symbol actions'
Assert-Contains $actions '(symbolSelectionAction || previousAgeMs <= ACTION_PENDING_TTL_MS)' 'symbol action does not expire while waiting for a safe switch'
Assert-Contains $actions "'symbolChangeStatus'" 'Agent ACK updates symbol switch status'

Assert-Contains $installer "NULLIF(bs.settings->>'startupSymbol','')" 'installer prefers explicit selected startup symbol'
Assert-Contains $installer "NULLIF(bi.metrics->>'symbol','')" 'installer preserves current live symbol only as fallback'
Assert-Contains $runner 'FetchTradingSymbolSnapshot' 'Agent reads desired symbol from Server before restart'
Assert-Contains $runner 'NormalizeStartupSymbol' 'Agent validates symbol before writing MT5 startup config'
Assert-Contains $runner 'SymbolTradingAllowed == false' 'Agent verifies Broker permission after reconnect'
Assert-Contains $runner 'currentSymbol, expectedSymbol' 'Agent verifies the loaded chart/EA symbol'
Assert-Contains $smartRunner 'if (heartbeat.SafeToRestart)' 'Agent checks explicit CONNECT action even when EA is currently online'
Assert-Contains $smartRunner 'Web-authorized MT5 connect or Symbol switch completed' 'Agent logs Web-authorized Symbol switch completion'
Assert-Contains $agentContract 'TradingSymbolAgentResponse' 'Windows Agent has symbol verification response contract'

Assert-Contains $agentBuild 'Version = "1.0.11"' 'Agent build version bumped'
Assert-Contains $project '<Version>1.0.11</Version>' 'Installer project version bumped'
Assert-Contains $release 'DEFAULT_INSTALLER_VERSION = "1.0.11"' 'Server publishes authoritative-symbol installer version'

Assert-Contains $dashboard '/bot/trading-symbol' 'bot Control Center owns Symbol selection'
Assert-Contains $dashboard 'openTradingSymbolPicker' 'bot has direct Symbol picker action'
Assert-Contains $dashboard 'applyTradingSymbol' 'bot confirms and applies selected Symbol'
Assert-Contains $dashboard 'cc-symbol-picker' 'bot uses compact choose-and-confirm dialog'
Assert-Contains $dashboard 'เลือก Symbol' 'bot renders the Symbol button'
Assert-Contains $dashboard 'marketWatchSymbols' 'bot selector is populated from MT5 Market Watch telemetry'
Assert-Contains $dashboard 'ยืนยัน' 'bot selector has one confirmation action'
if ($dashboard.Contains('/bot/mt5/manual-action') -and $dashboard.Contains('applyTradingSymbol')) {
  # Other dashboard features may use manual-action; Symbol flow itself must not
  # require a separate CONNECT_MT5 click.
  if ($dashboard.Contains('symbolChangeRequiresReconnect') -or $dashboard.Contains('body:JSON.stringify({ action: "CONNECT_MT5" })')) {
    throw 'Symbol picker must not require a second manual CONNECT_MT5 request'
  }
}

Assert-Contains $retiredPage 'redirect("/dashboard?view=overview")' 'legacy Trading Symbol URL redirects to Control Center'
if ($sidebar.Contains('href:"/trading-symbol"')) { throw 'Standalone Trading Symbol navigation must be removed' }

Assert-Contains $manualControls 'actionSource === "SYMBOL_SELECTION"' 'manual controls do not falsely expire queued Symbol action'
Assert-Contains $ea 'SymbolsTotal(true)' 'EA enumerates selected MT5 Market Watch symbols'
Assert-Contains $ea 'SymbolName(i, true)' 'EA publishes exact broker symbol names from Market Watch'
Assert-Contains $ea 'marketWatchSymbols' 'EA heartbeat publishes Market Watch telemetry'

Write-Host 'Trading symbol authoritative Control Center contract PASS.'
