$ErrorActionPreference = 'Stop'
function Read-Text([string]$path){ if(-not (Test-Path $path)){throw "Missing $path"}; [System.IO.File]::ReadAllText((Resolve-Path $path)) }
function Block([string]$text,[string]$sig){ $s=$text.IndexOf($sig); if($s -lt 0){throw "Missing $sig"}; $b=$text.IndexOf("{",$s); $d=0; for($i=$b;$i -lt $text.Length;$i++){ if($text[$i] -eq "{"){$d++} elseif($text[$i] -eq "}"){$d--; if($d -eq 0){return $text.Substring($s,$i-$s+1)}}}; throw "Unclosed $sig" }
function Need([string]$text,[string]$needle,[string]$message){ if(-not $text.Contains($needle)){throw $message} }
function Forbid([string]$text,[string]$needle,[string]$message){ if($text.Contains($needle)){throw $message} }

$ea=Read-Text 'mt5/FastBasketBot.mq5'
$vec=Read-Text 'mt5/include/AutoVectorEdgeLiveV1.mqh'
$release=Read-Text 'apps/api/src/release-version.ts'
$manage=Block $ea 'bool AutoV20ManageOpenBasket('
$wrong=Block $ea 'bool AutoV21WrongDirectionConfirmed('
$precision=Block $ea 'int AutoV20PrecisionDirection(double momentum)'
$send=Block $ea 'bool SendMarketOrder(int direction)'
$dynamic=Block $ea 'void ManageDynamicProtection()'
$onTick=Block $ea 'void OnTick()'

Need $ea '#define AUTO_V21_POLICY "AUTO_V21_BALANCED_EXIT_V1"' 'AUTO V21 marker missing'
Need $ea '#define AUTO_V21_EXIT_CYCLE_GRACE_SECONDS 30' 'AUTO loss exit must have 30-second cycle grace'
Need $ea '#define AUTO_V21_EXIT_LAST_FILL_GRACE_SECONDS 15' 'AUTO loss exit must have post-fill grace'
Need $ea '#define AUTO_V21_EXIT_CONFIRM_SECONDS 10' 'normal AUTO reversal must persist'
Need $ea '#define AUTO_V21_EXIT_SEVERE_CONFIRM_SECONDS 6' 'severe AUTO reversal must still persist'
Need $wrong 'atrM5*0.32' 'AUTO V21 must reject shallow pullback noise'
Need $wrong 'g_trendM5==opposite' 'AUTO V21 must require completed M5 reversal evidence'
Need $wrong 'g_emaTrendM5==opposite' 'AUTO V21 must require EMA structure evidence'
Need $wrong 'g_autoV20ExitCandidateSince=now' 'AUTO V21 must arm before soft close'
Need $wrong 'g_autoV20ExitCandidatePeakAdverse*0.70' 'AUTO V21 must cancel on meaningful rebound'
Need $wrong 'AutoVectorEdgeLiveExitLost(direction)' 'Vector edge loss must only confirm balanced exit'
Forbid $manage 'progress<=-atrPoints*0.18' 'obsolete fast 0.18 ATR close remains'
Need $manage 'EffectiveBasketLossLimit()' 'hard basket loss must bypass soft grace'
Need $manage 'AUTO_V21_EXIT_CANDIDATE' 'candidate must pause new AUTO adds'
Need $manage 'SmartProfitReversalDetected' 'AUTO may bank profit early on confirmed deterioration'
Need $manage 'AutoProfitGivebackDetected' 'AUTO may bank protected giveback before TP'
Need $manage 'AUTO_V21_EARLY_PROFIT_REVERSAL' 'early profit reversal reason missing'
Need $manage 'AUTO_V21_EARLY_PROFIT_GIVEBACK' 'early profit giveback reason missing'
Need $ea 'targetOpenedAt' 'restart migration must recover the oldest AUTO position target'
Need $send 'g_autoV20BasketTargetPrice' 'AUTO add must inherit canonical TP'
Need $send 'g_autoV20BasketStopPrice' 'AUTO add must inherit canonical/tighter SL'
Need $dynamic 'desiredTP=NormalizeTargetPriceToTick(g_autoV20BasketTargetPrice,direction);' 'Dynamic engine must keep canonical AUTO TP broker-tick aligned when no hard money target is active'
Need $dynamic 'bool clearAutoMoneyTargetTP =' 'AUTO hard money target must explicitly clear any old Broker TP'
Need $dynamic 'g_basketProfitTarget > 0.0 && currentTP > 0.0' 'AUTO hard money target must own profit exit instead of Broker TP'
Need $precision 'AutoV21ApplyNoIncreaseLotCap(selected);' 'AUTO add must never increase Lot above established ceiling'
Need $precision 'AutoV21RiskBudgetAllows(selected,count,riskReason)' 'AUTO risk ceiling must block instead of resizing Lot'
Need $onTick 'autoV21NoRescue' 'AUTO must skip new Rescue engine'
Need $ea 'bool g_rescueEnabled = false;' 'Adaptive Rescue must default disabled globally'
Need $ea 'g_executionStatus="RESCUE_DISABLED";' 'Recovery hedge execution must stay disabled'
Need $vec 'SELECTED_SIDE_WARMUP_ALLOW' 'Vector warmup must be selected-side based'
Need $vec 'AutoVectorEdgeLiveExitLost' 'Vector exit confirmation helper missing'
Need $vec 'never a direct close and never a lot-sizing signal' 'Vector Kelly/risk must not increase customer Lot'
$eaVersionMatch = [regex]::Match($ea, '#property\s+version\s+"([^"]+)"')
$releaseVersionMatch = [regex]::Match($release, 'DEFAULT_EA_VERSION\s*=\s*"([^"]+)"')
if(-not $eaVersionMatch.Success -or -not $releaseVersionMatch.Success){
  throw 'EA release version marker missing'
}
if($eaVersionMatch.Groups[1].Value -ne $releaseVersionMatch.Groups[1].Value){
  throw ("EA release version mismatch: EA={0} API={1}" -f $eaVersionMatch.Groups[1].Value,$releaseVersionMatch.Groups[1].Value)
}
Write-Host 'AUTO V21 balanced exit / hard-target TP / no-rescue / no-lot-increase contract PASS'
