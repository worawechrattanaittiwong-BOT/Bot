param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\FastBasketBot.mq5",
  [Parameter(Mandatory = $false)][string]$ApiPath = "apps\api\src\bot.controller.ts",
  [Parameter(Mandatory = $false)][string]$WebPath = "apps\web\app\dashboard\page.tsx",
  [Parameter(Mandatory = $false)][string]$BuildWorkflowPath = ".github\workflows\build-mt5-ea.yml"
)

$ErrorActionPreference = "Stop"

function Require-Contains([string]$text,[string]$needle,[string]$label) {
  if (-not $text.Contains($needle)) { throw "Missing contract: $label -> $needle" }
}
function Require-NotContains([string]$text,[string]$needle,[string]$label) {
  if ($text.Contains($needle)) { throw "Obsolete contract still present: $label -> $needle" }
}

$ea = [System.IO.File]::ReadAllText((Resolve-Path $EaPath))
$api = [System.IO.File]::ReadAllText((Resolve-Path $ApiPath))
$web = [System.IO.File]::ReadAllText((Resolve-Path $WebPath))
$build = [System.IO.File]::ReadAllText((Resolve-Path $BuildWorkflowPath))

Require-Contains $ea 'ZERO GRID V2 - All MT5 account modes' 'V2 engine marker'
Require-Contains $ea 'bool ZeroGridAccountIsHedging()' 'hedging detection'
Require-Contains $ea 'bool ZeroGridAccountIsNetting()' 'netting detection'
Require-Contains $ea 'ACCOUNT_MARGIN_MODE_RETAIL_NETTING' 'retail netting support'
Require-Contains $ea 'ACCOUNT_MARGIN_MODE_EXCHANGE' 'exchange/netting support'
Require-Contains $ea 'ZERO_GRID_NETTING_SIDE_LOCK_BUY' 'netting side lock BUY'
Require-Contains $ea 'ZERO_GRID_NETTING_SIDE_LOCK_SELL' 'netting side lock SELL'
Require-Contains $ea 'HistoryOrdersTotal()' 'one-shot recovery via order history'
Require-Contains $ea 'HistoryDealsTotal()' 'isolated realized cycle P/L'
Require-Contains $ea 'DEAL_COMMISSION' 'commission-aware cycle P/L'
Require-Contains $ea 'DEAL_FEE' 'fee-aware cycle P/L'
Require-Contains $ea 'SYMBOL_TRADE_TICK_SIZE' 'broker tick-size normalization'
Require-Contains $ea 'SYMBOL_TRADE_STOPS_LEVEL' 'broker stop-distance normalization'
Require-Contains $ea 'SYMBOL_VOLUME_MIN' 'broker minimum lot normalization'
Require-Contains $ea 'SYMBOL_VOLUME_MAX' 'broker maximum lot normalization'
Require-Contains $ea 'SYMBOL_VOLUME_STEP' 'broker lot-step normalization'
Require-Contains $ea 'ZERO_GRID_STOP_ORDERS_UNSUPPORTED' 'symbol capability guard'
Require-NotContains $ea 'bool ZeroGridDemoAllowed()' 'Demo-only account gate'
Require-NotContains $ea 'ZERO_GRID_DEMO_ONLY' 'Demo-only status gate'
Require-NotContains $ea 'if(!ZeroGridHedgingAllowed())' 'Hedging-only start gate'

Require-Contains $api 'numberSetting("zeroGridStepPrice", 0.00000001, 1000);' 'micro price-step API range'
Require-Contains $api 'numberSetting("zeroGridBaseLot", 0.0001, 100);' 'micro lot API range'

Require-Contains $web 'ZERO GRID · รองรับบัญชี MT5' 'universal settings badge'
Require-Contains $web 'บัญชี Netting จะล็อกฝั่งแรกหลัง Trigger' 'netting settings explanation'
Require-Contains $web 'suffix="เงินบัญชี"' 'account-currency setting labels'
Require-NotContains $web 'ZERO GRID · Demo/Tester only' 'obsolete Demo-only UI label'

Require-Contains $build 'bool ZeroGridAccountIsNetting()' 'build universal-account sentinel'
Require-Contains $build 'SYMBOL_TRADE_TICK_SIZE' 'build broker-normalization sentinel'
Require-NotContains $build "'ZERO_GRID_DEMO_ONLY'," 'obsolete Demo-only build sentinel'

Write-Host 'ZERO GRID all-MT5 contract: PASS'
