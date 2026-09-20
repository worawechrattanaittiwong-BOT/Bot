$ErrorActionPreference = 'Stop'

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing file: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}
function Block([string]$text,[string]$sig) {
  $s=$text.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}
  $b=$text.IndexOf("{",$s); $d=0
  for($i=$b;$i -lt $text.Length;$i++){
    if($text[$i] -eq "{"){$d++}
    elseif($text[$i] -eq "}"){$d--; if($d -eq 0){return $text.Substring($s,$i-$s+1)}}
  }
  throw "Unclosed $sig"
}
function Need([string]$text,[string]$needle,[string]$message) {
  if(-not $text.Contains($needle)){throw $message}
}
function Forbid([string]$text,[string]$needle,[string]$message) {
  if($text.Contains($needle)){throw $message}
}

$ea = Read-Text 'mt5/FastBasketBot.mq5'
$send = Block $ea 'bool SendRescueOrder('
$adjust = Block $ea 'void AdjustRescueHedge()'
$manage = Block $ea 'bool ManageAdaptiveRescue()'

Need $ea 'InpAdaptiveRescueEngine  = false' 'Adaptive Rescue input must default OFF'
Need $ea 'bool g_rescueEnabled = false;' 'Adaptive Rescue runtime must default OFF'
Need $ea 'g_rescueEnabled = false; // Recovery/hedge engine permanently disabled.' 'OnInit must force Rescue OFF'
Need $ea '// Adaptive Rescue / Recovery is disabled for every control mode.' 'settings apply must force Rescue OFF'

Need $send 'g_executionStatus="RESCUE_DISABLED";' 'Rescue sender must report disabled'
Need $send 'return false;' 'Rescue sender must reject every open request'
Forbid $send 'TRADE_ACTION_DEAL' 'Rescue sender must not construct market orders'
Forbid $send 'OrderSendWithPriceRetry' 'Rescue sender must not send broker orders'
Forbid $send 'SCNRescue"' 'Rescue sender must not create SCNRescue opens'

Need $adjust 'g_executionStatus="RESCUE_DISABLED";' 'Rescue hedge adjustment must be a no-op'
Forbid $adjust 'SendRescueOrder' 'Rescue hedge adjustment must not open opposite positions'
Forbid $adjust 'ReduceRescueVolume' 'Rescue hedge adjustment must not rebalance positions'

Need $manage 'CloseRescuePositions();' 'legacy Rescue positions must be cleaned up after upgrade'
Need $manage 'ResetRescueState();' 'legacy Rescue state must reset'
Need $manage 'g_rescueEnabled=false;' 'Rescue manager must hard-disable runtime'
Forbid $manage 'AdjustRescueHedge();' 'Rescue manager must never enter hedge/recovery logic'
Forbid $manage 'PartialCloseWorstPrimary();' 'Rescue manager must not perform recovery partial-close logic'
Forbid $manage 'RescueReversalScore(' 'Rescue manager must not evaluate recovery entries'

Write-Host 'Adaptive Rescue disabled contract PASS'
