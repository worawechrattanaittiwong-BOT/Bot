$ErrorActionPreference = 'Stop'
function Read-Text([string]$path){ if(-not (Test-Path $path)){throw "Missing $path"}; [System.IO.File]::ReadAllText((Resolve-Path $path)) }
function Block([string]$text,[string]$sig){ $s=$text.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}; $b=$text.IndexOf("{",$s); $d=0; for($i=$b;$i -lt $text.Length;$i++){ if($text[$i] -eq "{"){$d++} elseif($text[$i] -eq "}"){$d--; if($d -eq 0){return $text.Substring($s,$i-$s+1)}}}; throw "Unclosed $sig" }
function Need([string]$text,[string]$needle,[string]$message){ if(-not $text.Contains($needle)){throw $message} }
function Forbid([string]$text,[string]$needle,[string]$message){ if($text.Contains($needle)){throw $message} }

$ea=Read-Text 'mt5/FastBasketBot.mq5'
$vec=Read-Text 'mt5/include/AutoVectorEdgeLive.mqh'
$precision=Block $ea 'int AutoPrecisionDirection(double momentum)'
$send=Block $ea 'bool SendMarketOrder(int direction)'
$enabled=Block $ea 'bool AutoEnabled()'

# Keep activity: first-four score policy stays relaxed; there is no forced quota.
Need $precision 'bool relaxedFirstFour=count<4;' 'AUTO relaxed early score policy disappeared'
Forbid $precision 'dailyTradeQuota' 'AUTO must not force orders to hit a daily quota'
Forbid $precision 'minimumTradesPerDay' 'AUTO must not force orders to hit a daily quota'

# Position 2+ is winner-only and pauses during wrong-direction confirmation.
Need $precision 'g_autoExitCandidateSince>0' 'AUTO must pause adds during exit confirmation'
Need $precision 'EXIT_CANDIDATE_NO_ADD' 'AUTO exit-candidate add rejection missing'
Need $precision 'progress<0.0 || (progress<required && !pb.resumed)' 'AUTO must not average down'
Need $precision 'double addProgressFactor=relaxedFirstFour ? 0.05 : 0.08;' 'AUTO early-add progress policy missing'
Need $precision 'EARLY_WINNER_PROGRESS' 'AUTO early winner-add telemetry missing'
Need $precision 'EARLY_PULLBACK_RESUME' 'AUTO early pullback-resume telemetry missing'

# Positions 2-4 only get hard Vector safety vetoes; position 5+ remains strict.
Need $precision 'if(!vectorLiveAllowed && !relaxedFirstFour)' 'AUTO position 5+ Vector gate missing'
Need $precision 'VECTOR_SELECTED_NEGATIVE_EV' 'AUTO early negative-EV veto missing'
Need $precision 'VECTOR_DIRECTION_DISAGREE' 'AUTO early direction-disagree veto missing'
Need $precision 'AUTO_VECTOR_EDGE_SAFETY_WAIT' 'AUTO Vector safety telemetry missing'

# Vector uncertainty must use the selected side.
Need $vec 'const int selectedDirection=0' 'Vector selected-side context missing'
Need $vec 'if(selectedDirection>0) selectedConfidence=g_autoBuy.confidence;' 'BUY selected confidence missing'
Need $vec 'else if(selectedDirection<0) selectedConfidence=g_autoSell.confidence;' 'SELL selected confidence missing'
Need $vec 'VectorEdgeLiveBuildInput(edgeInput,direction)' 'Vector selected direction not wired into live evaluation'

# Existing AUTO-generated broker SL/TP protection remains mandatory.
Need $send 'request.sl=autoPlan.slPrice;' 'AUTO-generated SL missing'
Need $send 'request.tp=autoPlan.tpPrice;' 'AUTO Broker TP must be on every new AUTO position'
Need $send 'AUTO_BROKER_PROTECTION_INVALID' 'AUTO broker-protection validation missing'

# Isolation: AUTO remains its own execution owner and precision code must not call other engines.
Need $enabled 'if(g_engineMode != "AUTO") return false;' 'AUTO engine isolation missing'
Need $enabled 'EffectiveExecutionMode() == "AUTO"' 'AUTO execution isolation missing'
Need $enabled 'g_controlMode == "AUTO"' 'AUTO control isolation missing'
Forbid $precision 'Race' 'AUTO precision must not call RACE'
Forbid $precision 'ZeroGrid' 'AUTO precision must not call ZERO GRID'
Forbid $precision 'FlipLock' 'AUTO precision must not call FLIP LOCK'
Forbid $precision 'Counter' 'AUTO precision must not call COUNTER'

Write-Host 'AUTO safe-profit isolation contract PASS'
