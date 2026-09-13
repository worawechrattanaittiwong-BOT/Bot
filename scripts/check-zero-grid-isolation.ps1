param(
  [string]$EaPath = "mt5/FastBasketBot.mq5",
  [string]$ApiPath = "apps/api/src/bot.controller.ts",
  [string]$WebPath = "apps/web/app/dashboard/page.tsx",
  [string]$BuildWorkflowPath = ".github/workflows/build-mt5-ea.yml"
)

$ErrorActionPreference = "Stop"

function ReadText([string]$path) {
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}

function Slice([string]$text,[string]$start,[string]$end) {
  $a=$text.IndexOf($start,[System.StringComparison]::Ordinal)
  if($a -lt 0){ throw "Missing start marker: $start" }
  $b=$text.IndexOf($end,$a,[System.StringComparison]::Ordinal)
  if($b -lt 0){ throw "Missing end marker: $end" }
  return $text.Substring($a,$b-$a)
}

function HashText([string]$text) {
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes=[System.Text.Encoding]::UTF8.GetBytes($text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-","")
  } finally { $sha.Dispose() }
}

$root=(Resolve-Path ".").Path
$temp=Join-Path ([System.IO.Path]::GetTempPath()) ("scenova-zg-isolation-"+[guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $temp | Out-Null

$eaBefore=ReadText $EaPath
$raceStart='// Brain V17 RACE'
$raceEnd='void OnTick()'
$raceBefore=Slice $eaBefore $raceStart $raceEnd
$raceHashBefore=HashText $raceBefore

$criticalSentinels=@(
  'bool RaceModeEnabled()',
  'return g_engineMode == "RACE";',
  'ManageRaceBasket(momentum);',
  'StartRaceCycle(momentum);',
  'bool AutoV20ManageOpenBasket(double momentum)',
  'bool AdaptiveBasketAddAllowed(int direction)',
  'bool BrainV16RearmExistingBasket()'
)
foreach($s in $criticalSentinels){ if(-not $eaBefore.Contains($s)){ throw "Baseline sentinel missing: $s" } }

$eaTmp=Join-Path $temp "FastBasketBot.mq5"
$apiTmp=Join-Path $temp "bot.controller.ts"
$webTmp=Join-Path $temp "page.tsx"
$buildTmp=Join-Path $temp "build-mt5-ea.yml"
Copy-Item $EaPath $eaTmp
Copy-Item $ApiPath $apiTmp
Copy-Item $WebPath $webTmp
Copy-Item $BuildWorkflowPath $buildTmp

& (Join-Path $root "scripts/upgrade-zero-grid-demo-v1.ps1") -EaPath $eaTmp -ApiPath $apiTmp -WebPath $webTmp -BuildWorkflowPath $buildTmp

$eaAfter=ReadText $eaTmp
$raceAfter=Slice $eaAfter $raceStart $raceEnd
$raceHashAfter=HashText $raceAfter
if($raceHashAfter -ne $raceHashBefore){ throw "RACE core changed by ZERO GRID patch" }

foreach($s in $criticalSentinels){ if(-not $eaAfter.Contains($s)){ throw "Existing-engine sentinel changed/missing: $s" } }

$zgSentinels=@(
  'bool ZeroGridModeEnabled()',
  'ORDER_TYPE_BUY_STOP',
  'ORDER_TYPE_SELL_STOP',
  'SaaSZeroGrid',
  'ZERO_GRID'
)
foreach($s in $zgSentinels){ if(-not $eaAfter.Contains($s)){ throw "ZERO GRID sentinel missing: $s" } }

Write-Host "ZERO GRID isolation OK: RACE core byte-identical; AUTO/Rescue sentinels preserved."
Remove-Item -Recurse -Force $temp
