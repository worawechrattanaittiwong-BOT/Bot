$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Need([string]$text,[string]$needle,[string]$message) {
  if (-not $text.Contains($needle)) { throw $message }
}
function Forbid([string]$text,[string]$needle,[string]$message) {
  if ($text.Contains($needle)) { throw $message }
}
function Block([string]$text,[string]$sig) {
  $start=$text.IndexOf($sig)
  if($start -lt 0){ throw "Missing $sig" }
  $brace=$text.IndexOf('{',$start)
  $depth=0
  for($i=$brace;$i -lt $text.Length;$i++){
    if($text[$i] -eq '{'){$depth++}
    elseif($text[$i] -eq '}'){
      $depth--
      if($depth -eq 0){ return $text.Substring($start,$i-$start+1) }
    }
  }
  throw "Unclosed $sig"
}

$ea=Read-Text 'mt5/FastBasketBot.mq5'
$cloudRelay=Read-Text 'tools/windows-cloud-worker/Worker/CloudEaRelay.cs'
$cloudWorker=Read-Text 'tools/windows-cloud-worker/Worker/WorkerLoop.cs'
$cloudWorkerProject=Read-Text 'tools/windows-cloud-worker/Worker/ScenovaCloudWorker.csproj'
$cloudSetup=Read-Text 'tools/windows-cloud-worker/Setup/Program.cs'
$cloudSetupProject=Read-Text 'tools/windows-cloud-worker/Setup/ScenovaCloudSetup.csproj'
$cloudRelease=Read-Text 'apps/api/src/cloud-server-release.ts'
$localRelay=Read-Text 'tools/windows-installer/LocalRealtimeRelay.cs'
$agent=Read-Text 'tools/windows-installer/SmartAgentRunner.cs'
$api=Read-Text 'apps/api/src/runtime-event.controller.ts'
$service=Read-Text 'apps/api/src/runtime-event.service.ts'
$web=Read-Text 'apps/web/app/dashboard/page.tsx'
$release=Read-Text 'apps/api/src/release-version.ts'

$snapshot=Block $ea 'void PublishLiveExecutionSnapshot(bool force=false)'
$onTick=Block $ea 'void OnTick()'

Need $ea '#define LIVE_EXECUTION_SNAPSHOT_INTERVAL_MS 200' 'EA live execution cadence must be 200ms'
Need $snapshot 'scenova-live-' 'EA must publish replaceable live snapshot files'
Need $snapshot 'OpenPositionsTelemetryJson()' 'EA live snapshot must contain current position P/L'
Need $snapshot 'FileOpen(' 'EA live snapshot must use local file transport'
Forbid $snapshot 'WebRequest(' 'EA 200ms snapshot path must never call network WebRequest'
Forbid $snapshot 'HttpPostJson(' 'EA 200ms snapshot path must never call SaaS HTTP'
Need $onTick 'PublishLiveExecutionSnapshot(false);' 'MT5 tick path must refresh live execution snapshot'
Need $ea 'PublishLiveExecutionSnapshot(true);' 'trade transactions must force immediate snapshot refresh'

Need $cloudRelay 'LiveExecutionRelayInterval = TimeSpan.FromMilliseconds(100)' 'Cloud Worker must scan live snapshots faster than the 200ms source cadence'
Need $cloudRelay 'RunLiveExecutionRelayLoopAsync' 'Cloud Worker live execution relay loop missing'
Need $cloudRelay 'scenova-live-*.snapshot.txt' 'Cloud Worker must scan replaceable live snapshots'
Need $cloudRelay 'RelayEaRuntimeEventAsync' 'Cloud Worker must reuse authenticated runtime event relay'
Need $cloudRelay 'writeTicks <= previousTicks' 'Cloud Worker must not resend unchanged snapshots'

Need $localRelay 'ScanInterval = TimeSpan.FromMilliseconds(100)' 'Local Agent must scan live snapshots faster than 200ms'
Need $localRelay '/api/ea/runtime-event' 'Local Agent must relay live execution to authenticated EA runtime endpoint'
Need $localRelay 'installToken' 'Local Agent live relay must authenticate with the instance install token'
Need $agent 'Task.Run(LocalRealtimeRelay.RunAsync)' 'Smart Agent must start the local realtime relay independently'

Need $api '"LIVE_EXECUTION"' 'Runtime API must accept LIVE_EXECUTION events'
Need $api '@Post("runtime-event")' 'Authenticated Local EA runtime event endpoint missing'
Need $api "metrics->>'liveExecutionAtMs'" 'Runtime API must reject out-of-order live snapshots'
Need $api 'liveExecutionReceivedAtMs' 'Runtime API must timestamp received live snapshots'
Need $service 'occurredAtMs?: number | null;' 'SSE runtime event type must preserve millisecond source time'

Need $web 'LIVE EXECUTION · 200ms' 'Dashboard must identify the 200ms Live Execution lane'
Need $web '}, 200);' 'Dashboard realtime coalescing must be 200ms'
Need $web 'String(event.eventType || "").toUpperCase() !== "LIVE_EXECUTION"' 'LIVE_EXECUTION must render from SSE without full dashboard reload'
Need $web 'liveExecutionAtMs > 0 && openPositions.length > 0' 'Live Net Profit must prefer fresh position snapshot P/L'

# Release chains that actually deploy the new runtime capability.
$eaVersion=[regex]::Match($ea,'#property\s+version\s+"([^"]+)"').Groups[1].Value
$apiEa=[regex]::Match($release,'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"').Groups[1].Value
if($eaVersion -ne '1.1.21' -or $apiEa -ne $eaVersion){ throw "EA live execution release mismatch: EA=$eaVersion API=$apiEa" }

$workerVersion=[regex]::Match($cloudWorker,'Version\s*=\s*"([^"]+)"').Groups[1].Value
$workerProject=[regex]::Match($cloudWorkerProject,'<Version>([^<]+)</Version>').Groups[1].Value
$promotedWorker=[regex]::Match($cloudRelease,'workerVersion:\s*"([^"]+)"').Groups[1].Value
if($workerVersion -ne '2.2.32' -or $workerProject -ne $workerVersion -or $promotedWorker -ne $workerVersion){
  throw "Cloud Worker live execution release mismatch"
}

$setupVersion=[regex]::Match($cloudSetup,'SetupVersion\s*=\s*"([^"]+)"').Groups[1].Value
$setupProject=[regex]::Match($cloudSetupProject,'<Version>([^<]+)</Version>').Groups[1].Value
$promotedSetup=[regex]::Match($cloudRelease,'setupVersion:\s*"([^"]+)"').Groups[1].Value
if($setupVersion -ne '0.6.22' -or $setupProject -ne $setupVersion -or $promotedSetup -ne $setupVersion){
  throw "Cloud Setup live execution release mismatch"
}

Write-Host 'Live Execution 200ms end-to-end contract PASS'
