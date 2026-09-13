$ErrorActionPreference = 'Stop'

$sourcePath = Join-Path $PSScriptRoot '..\mt5\FastBasketBot.mq5'
$source = Get-Content $sourcePath -Raw
foreach($requiredPolicy in @(
  'double AutoV20MinimumNetRR\(\)',
  'return 1\.25;',
  'double AutoV20RiskCappedVolume\(',
  'NET_RR_BELOW_1_25',
  'AUTO_V20_BROKER_PROTECTION_INVALID',
  'AUTO_V20_PRICE_MOVED_REEVALUATE'
)) {
  if($source -notmatch $requiredPolicy) {
    throw "AUTO V20 source policy missing: $requiredPolicy"
  }
}
$minimumNetRR = 1.25

# Deterministic policy regression, NOT a broker-history MT5 backtest.
# Both engines consume the exact same canonical market snapshots and the same
# forward P/L outcome for each direction. This protects the decision policy
# against starvation and obvious regressions in the four requested regimes.

$defaults = @{
  h1=0;m30=0;m15=0;m5=0;m1=0;ema5=0;ema15=0;mom=0.0;
  paBuy=0.0;paSell=0.0;locBuy=0.0;locSell=0.0;pbBuy=50.0;pbSell=50.0;
  rrBuy=1.35;rrSell=1.35;outBuy=0.0;outSell=0.0;setup=0;phase=0;
  weakening=$false;turned=0;decel=0
}
function Case([string]$scenario,[string]$name,[hashtable]$v) {
  $h=@{}; foreach($k in $defaults.Keys){$h[$k]=$defaults[$k]}; foreach($k in $v.Keys){$h[$k]=$v[$k]}
  $h.scenario=$scenario; $h.name=$name; [pscustomobject]$h
}

# PowerShell command invocations inside @() are separated by newlines. Do not
# put commas after the hashtable argument: a trailing comma turns the argument
# into Object[] and breaks the [hashtable] parameter conversion on pwsh/Linux.
$cases=@(
  Case 'STRONG_DOWN_BOUNCE' 'down-impulse' @{h1=-1;m30=-1;m15=-1;m5=-1;m1=-1;ema5=-1;ema15=-1;mom=-1.1;paSell=20;locSell=5;pbSell=60;rrSell=1.5;outSell=1.2;outBuy=-1.0;phase=-1}
  Case 'STRONG_DOWN_BOUNCE' 'down-bottom-warning' @{h1=-1;m30=-1;m15=-1;m5=-1;m1=1;ema5=-1;ema15=-1;mom=-0.35;paBuy=20;paSell=8;locBuy=14;locSell=-10;pbBuy=65;pbSell=38;rrBuy=1.4;rrSell=0.9;outSell=-1.1;outBuy=0.8;weakening=$true;decel=1}
  Case 'STRONG_DOWN_BOUNCE' 'down-confirmed-bounce' @{h1=-1;m30=-1;m15=-1;m5=1;m1=1;ema5=1;ema15=-1;mom=0.45;paBuy=30;locBuy=14;locSell=-14;pbBuy=85;pbSell=25;rrBuy=1.6;rrSell=0.8;outBuy=1.0;outSell=-1.2;weakening=$true;turned=1}
  Case 'STRONG_DOWN_BOUNCE' 'down-bounce-late-loss' @{h1=-1;m30=-1;m15=0;m5=1;m1=1;ema5=1;ema15=-1;mom=0.75;paBuy=25;locBuy=10;locSell=-8;pbBuy=82;pbSell=30;rrBuy=1.5;rrSell=0.9;outBuy=-0.3;outSell=-0.9;weakening=$true;turned=1}

  Case 'STRONG_UP_PULLBACK' 'up-chase-terminal' @{h1=1;m30=1;m15=1;m5=1;m1=1;ema5=1;ema15=1;mom=1.2;paBuy=20;locBuy=-12;pbBuy=48;rrBuy=0.95;rrSell=1.3;outBuy=-0.8;outSell=0.2;phase=1}
  Case 'STRONG_UP_PULLBACK' 'up-pullback-running' @{h1=1;m30=1;m15=1;m5=-1;m1=-1;ema5=1;ema15=1;mom=-0.25;paBuy=10;locBuy=8;pbBuy=58;rrBuy=1.45;rrSell=1.0;outBuy=0.9;outSell=-0.7;phase=1}
  Case 'STRONG_UP_PULLBACK' 'up-pullback-resume' @{h1=1;m30=1;m15=1;m5=1;m1=1;ema5=1;ema15=1;mom=0.45;paBuy=30;locBuy=12;pbBuy=90;rrBuy=1.65;rrSell=0.9;outBuy=1.3;outSell=-1.0;phase=1}
  Case 'STRONG_UP_PULLBACK' 'up-continuation' @{h1=1;m30=1;m15=1;m5=1;m1=0;ema5=1;ema15=1;mom=0.35;paBuy=20;locBuy=5;pbBuy=75;rrBuy=1.35;rrSell=0.9;outBuy=0.8;outSell=-0.6;phase=1}

  Case 'SIDEWAY' 'range-conflict-a' @{m5=1;m1=-1;mom=0.1;paBuy=5;paSell=5;locBuy=2;locSell=2;pbBuy=45;pbSell=45;rrBuy=1.05;rrSell=1.05;outBuy=-0.4;outSell=-0.3}
  Case 'SIDEWAY' 'range-conflict-b' @{m5=-1;m1=1;mom=-0.12;paBuy=8;paSell=8;locBuy=4;locSell=4;pbBuy=50;pbSell=50;rrBuy=1.05;rrSell=1.05;outBuy=-0.3;outSell=-0.4}
  Case 'SIDEWAY' 'range-clean-buy' @{m5=1;m1=1;ema5=1;mom=0.3;paBuy=25;locBuy=10;locSell=-8;pbBuy=70;pbSell=35;rrBuy=1.35;rrSell=0.9;outBuy=-0.2;outSell=-0.5;phase=1}
  Case 'SIDEWAY' 'range-clean-sell' @{m5=-1;m1=-1;ema5=-1;mom=-0.28;paSell=25;locSell=9;locBuy=-8;pbSell=70;pbBuy=35;rrSell=1.3;rrBuy=0.9;outSell=0.55;outBuy=-0.45;phase=-1}

  Case 'FALSE_BREAKOUT' 'fake-up-break' @{h1=1;m30=1;m15=1;m5=1;m1=1;ema5=1;ema15=1;mom=1.4;paBuy=30;locBuy=-16;pbBuy=45;rrBuy=0.75;rrSell=1.5;outBuy=-1.4;outSell=0.9;phase=1}
  Case 'FALSE_BREAKOUT' 'fake-up-fails' @{h1=1;m30=1;m15=0;m5=-1;m1=-1;ema5=-1;ema15=1;mom=-0.7;paSell=30;locSell=12;locBuy=-10;pbSell=85;pbBuy=25;rrSell=1.6;rrBuy=0.8;outSell=1.1;outBuy=-0.9;weakening=$true;turned=-1}
  Case 'FALSE_BREAKOUT' 'fake-down-break' @{h1=-1;m30=-1;m15=-1;m5=-1;m1=-1;ema5=-1;ema15=-1;mom=-1.3;paSell=25;locSell=-15;pbSell=45;rrSell=0.8;rrBuy=1.5;outSell=-1.2;outBuy=0.8;phase=-1}
  Case 'FALSE_BREAKOUT' 'fake-down-fails' @{h1=-1;m30=-1;m15=0;m5=1;m1=1;ema5=1;ema15=-1;mom=0.65;paBuy=30;locBuy=12;locSell=-10;pbBuy=85;pbSell=30;rrBuy=1.6;rrSell=0.8;outBuy=1.0;outSell=-0.8;weakening=$true;turned=1}
)

function MacroDirection($r) {
  $s=$r.h1*3+$r.m30*2+$r.m15*2
  if($s -ge 3){return 1}; if($s -le -3){return -1}; return 0
}
function LegacyDecision($r) {
  [double]$buy=0; [double]$sell=0
  if($r.setup -eq 1){$buy+=30}elseif($r.setup -eq -1){$sell+=30}
  $mw=[Math]::Min(28,[Math]::Abs($r.mom)*22)
  if($r.mom -gt 0){$buy+=$mw}elseif($r.mom -lt 0){$sell+=$mw}
  foreach($p in @(@('m1',8),@('m5',14),@('m15',12),@('ema5',10),@('ema15',8))){
    $v=$r.($p[0]); $w=[double]$p[1]
    if($v -eq 1){$buy+=$w}elseif($v -eq -1){$sell+=$w}
  }
  $macro=MacroDirection $r
  if($macro -eq 1){$buy+=16}elseif($macro -eq -1){$sell+=16}
  if($buy -gt $sell+1){return 1}; if($sell -gt $buy+1){return -1}
  if($r.mom -gt 0){return 1}; if($r.mom -lt 0){return -1}; if($macro -ne 0){return $macro}; return $r.m5
}
function V20Side($r,[int]$d) {
  [double]$macro=0
  foreach($p in @(@('h1',12),@('m30',9),@('m15',7))){$v=$r.($p[0]);$w=[double]$p[1];if($v -eq $d){$macro+=$w}elseif($v -eq -$d){$macro-=$w}}
  [double]$exe=0
  foreach($p in @(@('m5',14),@('m1',7),@('ema5',4))){$v=$r.($p[0]);$w=[double]$p[1];if($v -eq $d){$exe+=$w}elseif($v -eq -$d){$exe-=$w}}
  $pa=if($d -eq 1){$r.paBuy}else{$r.paSell}; $exe += [Math]::Max(0,[Math]::Min(7,$pa/5))
  $directional=$d*$r.mom; [double]$mom=0
  if($directional -gt 0){$mom=[Math]::Min(14,$directional*11)}elseif($directional -lt 0){$mom=-[Math]::Min(18,-$directional*14)}
  $macroDir=MacroDirection $r; $reversal=$macroDir -ne 0 -and $macroDir -eq -$d
  if($reversal){if($r.turned -eq $d){$mom+=12}elseif($r.decel -eq $d){$mom+=7}else{$mom-=8}}
  $loc=if($d -eq 1){$r.locBuy}else{$r.locSell}; $pb=if($d -eq 1){$r.pbBuy}else{$r.pbSell}
  $conf=50+$macro*0.55+$exe*0.8+$mom*0.7+$loc*0.6+($pb-50)*0.18
  if($r.phase -eq $d){$conf+=4}; if($reversal -and $r.weakening){$conf+=5}
  $conf=[Math]::Max(0,[Math]::Min(100,$conf)); $rr=if($d -eq 1){$r.rrBuy}else{$r.rrSell}
  $bonus=if($rr -ge 1.55){5}elseif($rr -ge 1.2){2}elseif($rr -lt 1){-10}elseif($rr -lt 1.1){-5}else{0}
  [pscustomobject]@{direction=$d;confidence=$conf;rank=[Math]::Max(0,[Math]::Min(100,$conf+$bonus));rr=$rr}
}
function V20Decision($r) {
  $b=V20Side $r 1; $s=V20Side $r -1; $edge=$b.rank-$s.rank
  if([Math]::Abs($edge) -lt 5){return [pscustomobject]@{direction=0;reason='CONFLICT'}}
  $sel=if($edge -gt 0){$b}else{$s}
  if($sel.confidence -lt 60 -or $sel.rank -lt 64){return [pscustomobject]@{direction=0;reason='QUALITY'}}
  if($sel.rr -lt $minimumNetRR){return [pscustomobject]@{direction=0;reason='RR'}}
  [pscustomobject]@{direction=$sel.direction;reason='TRADE'}
}
function Evaluate([string]$engine) {
  $equity=0.0;$peak=0.0;$maxDd=0.0;$orders=0;$rejects=@{};$byScenario=@{};$sum=0.0
  foreach($r in $cases){
    if($engine -eq 'Legacy'){$d=LegacyDecision $r;$reason='TRADE'}else{$v=V20Decision $r;$d=$v.direction;$reason=$v.reason}
    $pnl=if($d -eq 1){$r.outBuy}elseif($d -eq -1){$r.outSell}else{0.0}
    if($d -ne 0){$orders++;$equity+=$pnl;$sum+=$pnl;$peak=[Math]::Max($peak,$equity);$maxDd=[Math]::Max($maxDd,$peak-$equity)}else{$rejects[$reason]=1+($rejects[$reason]??0)}
    if(-not $byScenario.ContainsKey($r.scenario)){$byScenario[$r.scenario]=0.0};$byScenario[$r.scenario]+=$pnl
  }
  [pscustomobject]@{engine=$engine;netProfit=[Math]::Round($sum,2);maxDrawdown=[Math]::Round($maxDd,2);averagePerBasket=[Math]::Round($(if($orders){$sum/$orders}else{0}),3);orders=$orders;rejections=$rejects;byScenario=$byScenario}
}

$legacy=Evaluate 'Legacy'; $v20=Evaluate 'V20'
$report=[pscustomobject]@{
  testType='DETERMINISTIC_POLICY_REGRESSION_NOT_MT5_HISTORY_BACKTEST'
  sameDataset=$true
  scenarios=@('STRONG_DOWN_BOUNCE','STRONG_UP_PULLBACK','SIDEWAY','FALSE_BREAKOUT')
  legacy=$legacy
  v20=$v20
  orderRetention=[Math]::Round($v20.orders/[Math]::Max(1,$legacy.orders),3)
}
$report | ConvertTo-Json -Depth 8

if($v20.orders -lt 8){throw "AUTO V20 trade starvation: only $($v20.orders) orders"}
if($v20.orders -lt [Math]::Ceiling($legacy.orders*0.5)){throw 'AUTO V20 reduced orders below 50% of legacy fixture'}
if($v20.netProfit -le $legacy.netProfit){throw 'AUTO V20 canonical net profit did not improve'}
if($v20.maxDrawdown -ge $legacy.maxDrawdown){throw 'AUTO V20 canonical drawdown did not improve'}
if($v20.averagePerBasket -le $legacy.averagePerBasket){throw 'AUTO V20 average Basket result did not improve'}
if(($v20.rejections.Keys | Measure-Object).Count -eq 0){throw 'AUTO V20 produced no explicit rejection reasons'}
Write-Host 'AUTO V20 deterministic policy regression PASS'
