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

function FunctionBlock([string]$text,[string]$signature) {
  $start=$text.IndexOf($signature,[System.StringComparison]::Ordinal)
  if($start -lt 0){ throw "Missing function: $signature" }
  $brace=$text.IndexOf("{",$start,[System.StringComparison]::Ordinal)
  if($brace -lt 0){ throw "Missing function body: $signature" }
  $depth=0
  for($i=$brace;$i -lt $text.Length;$i++) {
    if($text[$i] -eq "{") { $depth++ }
    elseif($text[$i] -eq "}") {
      $depth--
      if($depth -eq 0) { return $text.Substring($start,$i-$start+1) }
    }
  }
  throw "Unclosed function: $signature"
}

$ea=ReadText $EaPath
$autoEnabled=FunctionBlock $ea 'bool AutoEnabled()'
$autoEntry=FunctionBlock $ea 'int AutoPrecisionDirection(double momentum)'
$autoExit=FunctionBlock $ea 'bool AutoManageOpenBasket(double momentum)'
$raceEnabled=FunctionBlock $ea 'bool RaceModeEnabled()'
$raceStart=FunctionBlock $ea 'bool StartRaceCycle(double momentum)'
$raceManage=FunctionBlock $ea 'bool ManageRaceBasket(double momentum)'
$zeroEnabled=FunctionBlock $ea 'bool ZeroGridModeEnabled()'
$zeroManage=FunctionBlock $ea 'bool ManageZeroGrid()'

$required=@(
  'ORDER_TYPE_BUY_STOP',
  'ORDER_TYPE_SELL_STOP',
  'SaaSZeroGrid',
  'SaaSRace',
  'SaaSAuto',
  'bool AdaptiveBasketAddAllowed(int direction)',
  'bool BrainV16RearmExistingBasket()'
)
foreach($s in $required){ if(-not $ea.Contains($s)){ throw "Isolation sentinel missing: $s" } }

if(-not $autoEnabled.Contains('if(g_engineMode != "AUTO") return false;')) {
  throw 'AUTO engine gate is not explicit'
}
if(-not $autoEnabled.Contains('EffectiveExecutionMode() == "AUTO"') -or
   -not $autoEnabled.Contains('g_controlMode == "AUTO"')) {
  throw 'AUTO execution/control gate changed'
}
if(-not $raceEnabled.Contains('EffectiveExecutionMode() == "RACE"')) {
  throw 'RACE execution gate changed'
}
if(-not $zeroEnabled.Contains('EffectiveExecutionMode() == "ZERO_GRID"')) {
  throw 'ZERO GRID execution gate changed'
}

foreach($block in @($autoEntry,$autoExit)) {
  if($block.Contains('ManageZeroGrid(') -or $block.Contains('StartRaceCycle(') -or $block.Contains('ManageRaceBasket(')) {
    throw 'AUTO core directly calls ZERO GRID or RACE'
  }
}
foreach($block in @($raceStart,$raceManage)) {
  if($block.Contains('ManageZeroGrid(') -or $block.Contains('AutoPrecisionDirection(') -or $block.Contains('AutoManageOpenBasket(')) {
    throw 'RACE core directly calls AUTO or ZERO GRID'
  }
}
if($zeroManage.Contains('StartRaceCycle(') -or $zeroManage.Contains('ManageRaceBasket(') -or
   $zeroManage.Contains('AutoPrecisionDirection(') -or $zeroManage.Contains('AutoManageOpenBasket(')) {
  throw 'ZERO GRID core directly calls AUTO or RACE'
}

Write-Host "ZERO GRID isolation OK: AUTO, RACE and ZERO GRID remain separately gated and do not call each other's core managers."
