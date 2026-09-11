param(
  [Parameter(Mandatory = $false)]
  [string]$Path = "mt5\FastBasketBot.mq5"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Path)) { throw "EA source not found: $Path" }
$text = [System.IO.File]::ReadAllText((Resolve-Path $Path))

function Replace-Required([string]$old, [string]$new, [string]$label) {
  if ($script:text.Contains($new)) {
    Write-Host "$label already applied"
    return
  }
  if (-not $script:text.Contains($old)) { throw "Patch anchor not found: $label" }
  $script:text = $script:text.Replace($old, $new)
  Write-Host "Applied $label"
}

function Insert-BeforeRequired([string]$anchor, [string]$block, [string]$sentinel, [string]$label) {
  if ($script:text.Contains($sentinel)) {
    Write-Host "$label already applied"
    return
  }
  $index = $script:text.IndexOf($anchor, [System.StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Patch anchor not found: $label" }
  $script:text = $script:text.Insert($index, $block + "`r`n`r`n")
  Write-Host "Applied $label"
}

Replace-Required '#property version   "1.054"' '#property version   "1.055"' 'EA version 1.055'
Replace-Required '#define SCENOVA_EA_VERSION "1.054"' '#define SCENOVA_EA_VERSION "1.055"' 'runtime version 1.055'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.16"' '#define SCENOVA_PRODUCT_VERSION "2.0.17"' 'product version 2.0.17'

$v16Engine = @'
// Brain V16 -----------------------------------------------------------------
// V15 could still stall at one or two positions for two independent reasons:
// 1) add/adverse progress used the opposite quote side, so spread looked like
//    an adverse market move; and 2) a transient lease/permission interruption
//    could AbortBurst(), after which an existing Basket was never re-armed.
// V16 uses same-side executable prices, a cumulative adverse guard from the
// first entry, paced target-aware filling, and self-heals an interrupted burst.
double BrainV16FillProgressPoints(int direction)
{
   MqlTick tick;
   double lastPrice = LastBasketEntryPrice(direction);
   if(lastPrice <= 0.0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   // Compare BUY ask->ask and SELL bid->bid. The broker spread is therefore
   // not misclassified as favorable/adverse market movement.
   return direction > 0
      ? (tick.ask - lastPrice) / _Point
      : (lastPrice - tick.bid) / _Point;
}

double BrainV16AnchorProgressPoints(int direction)
{
   MqlTick tick;
   double anchor = BasketAnchorEntryPrice(direction);
   if(anchor <= 0.0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   return direction > 0
      ? (tick.ask - anchor) / _Point
      : (anchor - tick.bid) / _Point;
}

bool BrainV16BasketAdverseMove(int direction, string &reasonOut)
{
   reasonOut = "NONE";
   if(direction == 0)
      return false;

   double atr = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)
   );
   double lastProgress = BrainV16FillProgressPoints(direction);
   double anchorProgress = BrainV16AnchorProgressPoints(direction);
   double momentum = MomentumPoints();
   bool oppositeCandle = BrainV8ConfirmationCandleReady(-direction);
   bool oppositeMomentum = MomentumSupportsDirection(-direction,momentum,0.22);
   string lowerState = LowerTimeframeStateForDirection(direction);

   // A micro reversal alone is not enough to freeze a 20/50/100-position
   // Basket. It must coincide with real same-side adverse displacement.
   bool meaningfulAdverse =
      anchorProgress <= -atr * 0.08 ||
      lastProgress <= -atr * 0.05;
   bool severeAdverse = anchorProgress <= -atr * 0.22;
   bool confirmedLowerReversal =
      lowerState == "REVERSAL" &&
      anchorProgress <= -atr * 0.05 &&
      (oppositeCandle || oppositeMomentum);
   bool confirmedOppositeFlow =
      oppositeCandle && oppositeMomentum && meaningfulAdverse;

   if(severeAdverse && (oppositeCandle || oppositeMomentum))
   {
      reasonOut = "V16_SEVERE_ADVERSE_STOP";
      return true;
   }
   if(confirmedLowerReversal)
   {
      reasonOut = "V16_CONFIRMED_LOWER_REVERSAL";
      return true;
   }
   if(confirmedOppositeFlow)
   {
      reasonOut = "V16_CONFIRMED_OPPOSITE_FLOW";
      return true;
   }
   return false;
}

bool BrainV16BalancedAddReady(
   int direction,
   int count,
   int targetPositions,
   double atr
)
{
   if(direction == 0 || count <= 0 || count >= targetPositions)
      return false;

   MqlTick tick;
   double lastEntry = LastBasketEntryPrice(direction);
   if(lastEntry <= 0.0 || !SymbolInfoTick(_Symbol,tick))
   {
      g_ladderMode = "V16_NO_TICK";
      g_fillBlockReason = "V16_NO_TICK";
      return false;
   }

   double progress = BrainV16FillProgressPoints(direction);
   double currentSameSide = direction > 0 ? tick.ask : tick.bid;
   double betterPricePoints = direction > 0
      ? (lastEntry - currentSameSide) / _Point
      : (currentSameSide - lastEntry) / _Point;

   // Large user targets need denser rungs. This is still price-separated when
   // the market is moving, but no longer requires 100 independent large moves.
   double targetScale = targetPositions >= 80 ? 0.010 :
                        targetPositions >= 50 ? 0.014 :
                        targetPositions >= 20 ? 0.020 : 0.035;
   double requiredProgress = MathMax(
      targetPositions >= 20 ? 2.0 : 3.0,
      atr * targetScale
   );

   bool favorableStep = progress >= requiredProgress;
   bool modestPullback =
      betterPricePoints >= MathMax(2.0,atr * 0.018) &&
      betterPricePoints <= MathMax(4.0,atr * 0.20);

   // Target-aware schedule. For a 100-position test the Basket can progress to
   // the configured ceiling over roughly eight minutes when the market remains
   // stable, instead of waiting for a fresh 2-3 point move for every position.
   double fillWindowSeconds = targetPositions >= 80 ? 480.0 :
                              targetPositions >= 50 ? 360.0 :
                              targetPositions >= 20 ? 240.0 : 0.0;
   bool scheduleBehind = false;
   bool stableForScheduledFill = false;
   if(fillWindowSeconds > 0.0 && g_burstStartedAt > 0)
   {
      double elapsed = MathMax(
         0.0,
         (double)(TimeCurrent() - g_burstStartedAt)
      );
      double cadence = fillWindowSeconds /
         (double)MathMax(1,targetPositions - 1);
      int expected = MathMin(
         targetPositions,
         1 + (int)MathFloor(elapsed / MathMax(1.0,cadence))
      );
      g_fillExpectedPositions = expected;
      g_fillUrgency = MathMax(
         0.0,
         MathMin(1.0,elapsed / fillWindowSeconds)
      );
      scheduleBehind = count < expected;

      // Scheduled fill is allowed only while the latest fill has not moved
      // meaningfully against us. Cumulative adverse movement is independently
      // guarded by BrainV16BasketAdverseMove() from the first Basket entry.
      double scheduledAdverseBand = MathMax(2.0,atr * 0.025);
      stableForScheduledFill = progress >= -scheduledAdverseBand;
   }

   if(favorableStep)
   {
      g_ladderMode = "V16_PRICE_STEP_READY";
      g_fillBlockReason = "NONE";
      g_ladderRequiredPoints = requiredProgress;
      return true;
   }

   if(modestPullback)
   {
      g_ladderMode = "V16_PULLBACK_FILL_READY";
      g_fillBlockReason = "NONE";
      g_ladderRequiredPoints = requiredProgress;
      return true;
   }

   if(targetPositions >= 20 && scheduleBehind && stableForScheduledFill)
   {
      g_ladderMode = "V16_SCHEDULED_FILL_READY";
      g_fillBlockReason = "NONE";
      g_ladderRequiredPoints = requiredProgress;
      return true;
   }

   g_ladderRequiredPoints = requiredProgress;
   if(scheduleBehind && !stableForScheduledFill)
   {
      g_ladderMode = "V16_WAIT_ADVERSE_DRIFT";
      g_fillBlockReason = "V16_WAIT_ADVERSE_DRIFT";
   }
   else
   {
      g_ladderMode = "V16_WAIT_PACING";
      g_fillBlockReason = "V16_WAIT_PACING";
   }
   return false;
}

bool BrainV16RearmExistingBasket()
{
   if(!BasketFillEnabled() || g_burstActive)
      return false;

   int count = BasketPositionCount();
   if(count <= 0 || count >= g_maxPositions)
      return false;
   if(g_state != STATE_RUNNING || !g_access)
      return false;
   if(!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid())
      return false;
   if(TradePermissionStatus() != "OK")
      return false;

   int direction = BasketDirection();
   if(direction == 0)
      return false;

   datetime originalStartedAt = g_burstStartedAt;
   ArmBurst(direction);
   if(originalStartedAt > 0)
      g_burstStartedAt = originalStartedAt;
   g_burstRequestsSent = count;

   if(g_burstActive)
   {
      g_executionStatus = "V16_BASKET_FILL_REARMED";
      g_fillBlockReason = "NONE";
      Print(
         "V16 basket fill rearmed count=",count,
         " max=",g_maxPositions,
         " target=",g_burstTargetPositions
      );
      return true;
   }
   return false;
}
'@
Insert-BeforeRequired 'bool BrainV15BalancedAddReady(int direction, int count, int targetPositions, double atr)' $v16Engine 'bool BrainV16BalancedAddReady(' 'insert V16 basket fill engine'

# Route both legacy add-safety call sites through the spread-neutral V16 guard.
Replace-Required 'BrainV8BasketAdverseMove(direction, brainV8AddReason)' 'BrainV16BasketAdverseMove(direction, brainV8AddReason)' 'route adaptive add adverse guard through V16'
Replace-Required 'BrainV8BasketAdverseMove(direction, brainV8LadderReason)' 'BrainV16BasketAdverseMove(direction, brainV8LadderReason)' 'route ladder adverse guard through V16'

$oldV15Route = @'
   // V15: do not run the old add-entry intelligence gauntlet. The first entry
   // remains smart; continuation adds are governed by balanced price spacing.
   if(BrainV15BalancedAddReady(direction,count,targetPositions,atr))
      return true;
   return false;
'@
$newV16Route = @'
   // V16: continuation is target-aware, spread-neutral and paced. First-entry
   // intelligence remains unchanged; the Basket no longer stalls at 1-2 fills.
   if(BrainV16BalancedAddReady(direction,count,targetPositions,atr))
      return true;
   return false;
'@
Replace-Required $oldV15Route $newV16Route 'route BasketLadderReady through V16 pacing'

# Rescue warning may observe a Basket, but if there is still capacity it must
# not prevent V16 from self-healing an interrupted burst.
$oldWarningGate = @'
   if(count > 0 && g_rescueState == RESCUE_WARNING && !g_burstActive)
   {
      g_executionStatus = g_rescueOldestAgeSeconds >= RescueTimeThresholdSeconds()
         ? "TIME_RESCUE_WARNING"
         : "RESCUE_WARNING";
      return;
   }
'@
$newWarningGate = @'
   if(count > 0 &&
      g_rescueState == RESCUE_WARNING &&
      !g_burstActive &&
      (!BasketFillEnabled() || count >= g_maxPositions))
   {
      g_executionStatus = g_rescueOldestAgeSeconds >= RescueTimeThresholdSeconds()
         ? "TIME_RESCUE_WARNING"
         : "RESCUE_WARNING";
      return;
   }
'@
Replace-Required $oldWarningGate $newWarningGate 'allow V16 rearm through rescue warning'

$oldPermissionBlock = @'
   string permissionStatus = TradePermissionStatus();
   if(permissionStatus != "OK")
   {
      g_executionStatus = permissionStatus;
      return;
   }

   if(BasketFillEnabled() && g_burstActive)
'@
$newPermissionBlock = @'
   string permissionStatus = TradePermissionStatus();
   if(permissionStatus != "OK")
   {
      g_executionStatus = permissionStatus;
      return;
   }

   // V16 self-healing: ProcessBurstQueue can abort on a transient lease or
   // broker-permission interruption. Once control is healthy again, an open
   // Basket below Max Positions is automatically re-armed instead of being
   // stranded forever in BASKET_MANAGING with only one or two positions.
   if(BasketFillEnabled() && count > 0 && !g_burstActive && count < g_maxPositions)
      BrainV16RearmExistingBasket();

   if(BasketFillEnabled() && g_burstActive)
'@
Replace-Required $oldPermissionBlock $newPermissionBlock 'self-heal interrupted burst on tick'

$oldTesterTimer = @'
   if(MQLInfoInteger(MQL_TESTER))
   {
      ProcessBurstQueue();
      RefreshChartStatus();
      return;
   }
'@
$newTesterTimer = @'
   if(MQLInfoInteger(MQL_TESTER))
   {
      BrainV16RearmExistingBasket();
      ProcessBurstQueue();
      RefreshChartStatus();
      return;
   }
'@
Replace-Required $oldTesterTimer $newTesterTimer 'self-heal interrupted tester burst'

$oldTimerTail = @'
   FlushPendingBasketJournal();
   ProcessBurstQueue();
   RefreshChartStatus();
'@
$newTimerTail = @'
   FlushPendingBasketJournal();
   BrainV16RearmExistingBasket();
   ProcessBurstQueue();
   RefreshChartStatus();
'@
Replace-Required $oldTimerTail $newTimerTail 'self-heal interrupted live burst on timer'

$oldArmPrint = @'
   Print(
      "Basket fill armed direction=", direction,
      " target=", DoubleToString(g_burstTargetMoney, 2),
      " loss=", DoubleToString(g_burstLossMoney, 2)
   );
'@
$newArmPrint = @'
   Print(
      "Basket fill armed direction=", direction,
      " positions=", BasketPositionCount(),
      " max=", g_maxPositions,
      " targetPositions=", g_burstTargetPositions,
      " targetMoney=", DoubleToString(g_burstTargetMoney, 2),
      " loss=", DoubleToString(g_burstLossMoney, 2)
   );
'@
Replace-Required $oldArmPrint $newArmPrint 'log actual runtime Basket target'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V16 self-healing paced basket patch complete: $Path"
