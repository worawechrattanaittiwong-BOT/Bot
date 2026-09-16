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
$app = Read-Text 'apps/api/src/app.module.ts'
$installer = Read-Text 'apps/api/src/installer.controller.ts'
$runner = Read-Text 'tools/windows-installer/AgentRunner.cs'
$agentContract = Read-Text 'tools/windows-installer/AgentActionResponse.cs'
$agentBuild = Read-Text 'tools/windows-installer/AgentBuildInfo.cs'
$project = Read-Text 'tools/windows-installer/ScenovaInstaller.csproj'
$release = Read-Text 'apps/api/src/release-version.ts'
$page = Read-Text 'apps/web/app/trading-symbol/page.tsx'
$ea = Read-Text 'mt5/FastBasketBot.mq5'
$sidebar = Read-Text 'apps/web/components/OwnerSidebar.tsx'

Assert-Contains $controller 'startupSymbol' 'explicit desired symbol is stored separately from live metrics'
Assert-Contains $controller 'SYMBOL_AGENT_VERSION = "1.0.10"' 'safe symbol switching requires the symbol-aware Agent'
Assert-Contains $controller 'isVersionAtLeast(instance.agent_version, SYMBOL_AGENT_VERSION)' 'old Agent cannot perform symbol switching'
Assert-Contains $controller "positions > 0" 'symbol change is blocked while positions exist'
Assert-Contains $controller "actual_state" 'symbol change observes runtime state'
Assert-Contains $controller 'symbolTradeAllowed' 'broker trade mode is checked'
Assert-Contains $controller 'n !== 0 && n !== 3' 'disabled and close-only broker symbols are rejected while long/short-only remain valid'
Assert-Contains $controller '@Controller("ea/trading-symbol")' 'Agent has authenticated symbol status endpoint'
Assert-Contains $controller 'invalid trading symbol agent authentication' 'Agent symbol endpoint is authenticated'

Assert-Contains $interceptor 'pathname.endsWith("/bot/start")' 'normal Start is blocked on symbol mismatch'
Assert-Contains $interceptor 'pathname.endsWith("/bot/mt5/recover-start")' 'recovery Start is also blocked on symbol mismatch'
Assert-Contains $interceptor 'settings.startupSymbol' 'Start guard uses explicit selected symbol'
Assert-Contains $interceptor 'tradeMode === 0 || tradeMode === 3' 'Start guard rejects broker disabled/close-only mode'
Assert-Contains $app 'TradingSymbolController' 'customer symbol controller is registered'
Assert-Contains $app 'APP_INTERCEPTOR' 'symbol Start guard is globally registered after auth guards'

Assert-Contains $installer "NULLIF(bs.settings->>'startupSymbol','')" 'installer prefers explicit selected startup symbol'
Assert-Contains $installer "NULLIF(bi.metrics->>'symbol','')" 'installer preserves current live symbol only as fallback'
Assert-Contains $runner 'FetchTradingSymbolSnapshot' 'Agent reads desired symbol from Server before restart'
Assert-Contains $runner 'NormalizeStartupSymbol' 'Agent validates symbol before writing MT5 startup config'
Assert-Contains $runner 'SymbolTradingAllowed == false' 'Agent verifies Broker permission after reconnect'
Assert-Contains $runner 'currentSymbol, expectedSymbol' 'Agent verifies the loaded chart/EA symbol'
Assert-Contains $agentContract 'TradingSymbolAgentResponse' 'Windows Agent has symbol verification response contract'

Assert-Contains $agentBuild 'Version = "1.0.10"' 'Agent build version bumped'
Assert-Contains $project '<Version>1.0.10</Version>' 'Installer project version bumped'
Assert-Contains $release 'DEFAULT_INSTALLER_VERSION = "1.0.10"' 'Server publishes symbol-aware installer version'

Assert-Contains $page '/bot/trading-symbol' 'web selector uses dedicated symbol endpoint'
Assert-Contains $page 'CONNECT_MT5' 'customer selection uses one explicit controlled MT5 reconnect'
Assert-Contains $page 'Market Watch' 'web explains exact Broker symbol naming'
Assert-Contains $page 'USDC / THB' 'web explains broker-provided currency/crypto coverage'
Assert-Contains $page 'marketWatchSymbols' 'web selector is populated from MT5 Market Watch telemetry'
Assert-Contains $page 'refreshSymbols' 'web exposes an explicit Market Watch refresh action'
Assert-Contains $page '↻ Refresh' 'web renders the requested Refresh button'
Assert-Contains $ea 'SymbolsTotal(true)' 'EA enumerates selected MT5 Market Watch symbols'
Assert-Contains $ea 'SymbolName(i, true)' 'EA publishes exact broker symbol names from Market Watch'
Assert-Contains $ea 'marketWatchSymbols' 'EA heartbeat publishes Market Watch telemetry'
Assert-Contains $sidebar 'href:"/trading-symbol"' 'symbol selector is reachable from navigation'

Write-Host 'Trading symbol selection safety contract PASS.'
