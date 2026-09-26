$ErrorActionPreference = 'Stop'
function Read-Text([string]$path){ if(-not (Test-Path $path)){throw "Missing $path"}; [System.IO.File]::ReadAllText((Resolve-Path $path)) }
function Block([string]$text,[string]$sig){ $s=$text.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}; $b=$text.IndexOf("{",$s); $d=0; for($i=$b;$i -lt $text.Length;$i++){ if($text[$i] -eq "{"){$d++} elseif($text[$i] -eq "}"){$d--; if($d -eq 0){return $text.Substring($s,$i-$s+1)}}}; throw "Unclosed $sig" }
function Need([string]$text,[string]$needle,[string]$message){ if(-not $text.Contains($needle)){throw $message} }
function Forbid([string]$text,[string]$needle,[string]$message){ if($text.Contains($needle)){throw $message} }

$ea=Read-Text 'mt5/FastBasketBot.mq5'
$flip=Read-Text 'mt5/include/FlipLockV1.mqh'
$release=Read-Text 'apps/api/src/release-version.ts'
$onTick=Block $ea 'void OnTick()'
$onTimer=Block $ea 'void OnTimer()'
$onTrade=Block $ea 'void OnTradeTransaction('
$dynamic=Block $ea 'void ManageDynamicProtection()'
$race=Block $ea 'bool ManageRaceBasket(double momentum)'
$zero=Block $ea 'bool ManageZeroGrid()'
$fastClose=Block $ea 'bool FastProfitClosePriority()'
$flipManage=Block $flip 'void FlipLockManage()'
$flipSync=Block $flip 'bool FlipLockSyncBaton('

Need $ea '#define LOCAL_EXECUTION_PLANE_V1 "MT5_TICK_DIRECT_V1"' 'local execution plane marker missing'
Need $onTick 'g_lastMarketTickMs=GetTickCount64();' 'MT5 tick clock must be captured before mode management'

$accessGate=$onTick.IndexOf('if(!g_access)')
foreach($entry in @(
  'ManageZeroGrid();',
  'FlipLockManage();',
  'ManageRaceBasket(momentum);',
  'ManageDynamicProtection();',
  'AutoV20ManageOpenBasket(momentum)'
)){
  $idx=$onTick.IndexOf($entry)
  if($idx -lt 0 -or $accessGate -lt 0 -or $idx -gt $accessGate){
    throw "open-position local management must run before the server access/new-entry gate: $entry"
  }
}

Need $dynamic 'GetTickCount64()' 'AUTO/MANUAL dynamic protection must use the local monotonic clock'
Need $dynamic 'LOCAL_DYNAMIC_PROTECTION_INTERVAL_MS' 'dynamic SL update cadence must be millisecond local'
Forbid $dynamic 'now - g_lastDynamicProtectionAt < 2' 'obsolete 2-second dynamic SL throttle remains'

Need $race 'BasketProfit()' 'RACE management must use local MT5 position P/L'
Forbid $race 'HttpPostJson' 'RACE price/exit management must never call SaaS HTTP'
Need $zero 'ZeroGridCycleNet()' 'ZERO close decision must use local MT5 cycle net'
Forbid $zero 'HttpPostJson' 'ZERO price/close management must never call SaaS HTTP'
Need $fastClose 'if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)' 'ZERO fast close must detect fully-flat completion'
Need $fastClose 'FinalizeBasketJournal();' 'ZERO confirmed-flat close must finalize performance Basket before cycle reset'
Need $fastClose 'ResetZeroGridCycleState();' 'ZERO fast close must clear its close latch when flat'
Need $fastClose '? "ZERO_GRID_REARMING"' 'ZERO fast close must preserve normal RUNNING rearm behavior'
Need $fastClose ': "ZERO_GRID_STOPPED_FLAT";' 'ZERO fast close must release STOP/SAFE_STOP without blocking heartbeat'

Need $flipManage 'bool canOpenNewCycle=' 'SaaS authorization must control only new FLIP risk'
Need $flipManage 'A live FLIP-owned position is always protected from the local MT5 quote.' 'live FLIP position protection must bypass SaaS latency'
Need $flipSync 'SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE)' 'FLIP SL must follow broker tick increments'
Need $flipSync 'FLIP_LOCK_STOP_SYNC_MIN_MS' 'FLIP SL local cadence missing'

$flipTimer=$onTimer.IndexOf('FlipLockManage();')
$zeroTimer=$onTimer.IndexOf('ManageZeroGrid();')
$heartbeatTimer=$onTimer.IndexOf('SendHeartbeat();')
if($flipTimer -lt 0 -or $zeroTimer -lt 0 -or $heartbeatTimer -lt 0 -or
   $flipTimer -gt $heartbeatTimer -or $zeroTimer -gt $heartbeatTimer){
  throw 'local FLIP/ZERO maintenance must run before synchronous heartbeat HTTP'
}
Need $onTimer 'LOCAL_EXECUTION_NETWORK_QUIET_MS' 'heartbeat must yield while local ticks are busy'
Need $onTimer 'LOCAL_EXECUTION_HEARTBEAT_MAX_DEFER_MS' 'heartbeat defer must remain bounded'
Need $ea '#define LOCAL_EXECUTION_LIVE_HTTP_TIMEOUT_MS 120' 'non-heartbeat live HTTP timeout must stay below one local management burst'
Need $ea '#define LOCAL_EXECUTION_HEARTBEAT_HTTP_TIMEOUT_MS 1200' 'active heartbeat needs enough HTTPS transport time to stay connected'
Need $ea '#define FLAT_HEARTBEAT_HTTP_TIMEOUT_MS 4000' 'flat heartbeat needs enough time for a fresh TLS connection'
Need $ea '#define FLAT_HEARTBEAT_RETRY_DELAY_MS 100' 'flat transport retry must remain bounded'
Need $ea '#define ZERO_GRID_JOURNAL_FORCE_INTERVAL_MS 3000' 'ZERO journal backlog needs a bounded transport slot'
Need $ea '#define ZERO_GRID_JOURNAL_HTTP_TIMEOUT_MS 500' 'ZERO journal transport needs a reliable timeout'
Need $onTimer 'zeroJournalForceDue' 'ZERO journal must not starve behind continuous pending exposure'
Need $ea 'bool PostTradeJournalDeal(ulong dealTicket)' 'ZERO journal delivery must report success for retry'
Need $ea 'if(!PostTradeJournalDeal(ticket))' 'failed ZERO deal journal must stay queued'
Need $ea 'HeartbeatHttpTimeoutMs()' 'heartbeat must use its dedicated execution-aware timeout'
Need $ea 'IsHttpTransportFailure(code,webError) && !LocalExecutionExposureActive()' 'heartbeat transport retry must be flat-only'
Need $ea 'Connection: close' 'heartbeat must force a fresh HTTP connection'
Need $ea 'g_lastHeartbeatHttpStatus = realHttpStatus ? code : 0;' 'non-HTTP transport codes must never be published as HTTP status'
Need $ea 'if(realHttpStatus)' 'server-contact time must require a real HTTP response'
Need $ea 'bool suppressLivePriceTelemetry=LocalExecutionExposureActive();' 'active exposure must suppress price-heavy heartbeat telemetry'
Need $ea '\"livePriceTelemetrySuppressed\":true' 'live control heartbeat must declare price telemetry suppression'
Need $ea 'if(StringLen(payload) >= 2 && !suppressLivePriceTelemetry)' 'price-heavy diagnostics must be flat-state only'

Need $onTrade 'QueueDeferredDealJournal(trans.deal,false);' 'normal deal journal must be queued'
Need $onTrade 'QueueDeferredDealJournal(trans.deal,true);' 'rescue deal journal must be queued'
Forbid $onTrade 'PostTradeJournalDeal(trans.deal)' 'OnTradeTransaction must never block on normal journal HTTP'
Forbid $onTrade 'PostRescueJournalDeal(trans.deal)' 'OnTradeTransaction must never block on rescue journal HTTP'

Forbid $ea 'JsonNumber(response, "marketBid"' 'server marketBid must never be an execution input'
Forbid $ea 'JsonNumber(response, "marketAsk"' 'server marketAsk must never be an execution input'
Need $ea '\"executionPriceSource\":\"MT5_LOCAL_TICK\"' 'heartbeat must identify MT5 as execution price source'
Need $ea '\"serverPriceControl\":false' 'heartbeat must declare server price is telemetry-only'
$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA release version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}

Write-Host 'MT5 local execution plane contract PASS'
