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

function Insert-BeforeInFunction([string]$functionAnchor, [string]$needle, [string]$block, [string]$sentinel, [string]$label) {
  if ($script:text.Contains($sentinel)) {
    Write-Host "$label already applied"
    return
  }
  $functionIndex = $script:text.IndexOf($functionAnchor, [System.StringComparison]::Ordinal)
  if ($functionIndex -lt 0) { throw "Function anchor not found: $label" }
  $needleIndex = $script:text.IndexOf($needle, $functionIndex, [System.StringComparison]::Ordinal)
  if ($needleIndex -lt 0) { throw "Needle not found in function: $label" }
  $script:text = $script:text.Insert($needleIndex, $block + "`r`n")
  Write-Host "Applied $label"
}

Replace-Required '#property version   "1.051"' '#property version   "1.052"' 'EA version 1.052'
Replace-Required '#define SCENOVA_EA_VERSION "1.051"' '#define SCENOVA_EA_VERSION "1.052"' 'runtime version 1.052'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.13"' '#define SCENOVA_PRODUCT_VERSION "2.0.14"' 'product version 2.0.14'
Replace-Required 'input int             InpTimeRescueMinutes     = 20;' 'input int             InpTimeRescueMinutes     = 5;' 'faster adaptive rescue default'

$brainV13 = @'
// Brain V13 ----------------------------------------------------------------
// Smart entry without entry starvation:
// - All market intelligence contributes WEIGHT, never a first-entry veto.
// - Setup, momentum, trend, EMA, DI/ADX, macro, RSI and supply/demand vote.
// - If evidence is mixed, momentum/macro/M5 provides a deterministic fallback.
// - A genuinely wrong entry is corrected early from adverse excursion plus
//   opposite market evidence; ordinary noise is left to Adaptive Rescue.
int BrainV13SmartDirection(double momentum)
{
   double buyScore = 0.0;
   double sellScore = 0.0;

   int setupDirection = SetupFirstDirection(momentum);
   if(setupDirection > 0) buyScore += 30.0;
   else if(setupDirection < 0) sellScore += 30.0;

   double momentumBase = MathMax(2.0, g_adaptiveMomentumThreshold);
   double momentumWeight = MathMin(28.0, MathAbs(momentum) / momentumBase * 22.0);
   if(momentum > 0.0) buyScore += momentumWeight;
   else if(momentum < 0.0) sellScore += momentumWeight;

   if(g_trendM1 > 0) buyScore += 8.0; else if(g_trendM1 < 0) sellScore += 8.0;
   if(g_trendM5 > 0) buyScore += 14.0; else if(g_trendM5 < 0) sellScore += 14.0;
   if(g_trendM15 > 0) buyScore += 12.0; else if(g_trendM15 < 0) sellScore += 12.0;
   if(g_emaTrendM5 > 0) buyScore += 10.0; else if(g_emaTrendM5 < 0) sellScore += 10.0;
   if(g_emaTrendM15 > 0) buyScore += 8.0; else if(g_emaTrendM15 < 0) sellScore += 8.0;

   if(g_macroTrendDirection > 0) buyScore += 16.0;
   else if(g_macroTrendDirection < 0) sellScore += 16.0;

   if(g_plusDiM5 > g_minusDiM5 && g_adxM5 >= 18.0) buyScore += 8.0;
   else if(g_minusDiM5 > g_plusDiM5 && g_adxM5 >= 18.0) sellScore += 8.0;

   // Location/oscillator intelligence is advisory only. It can improve which
   // side wins the vote, but it can never turn both sides into NO TRADE.
   if(g_rsiM1 >= 74.0 || g_rsiM5 >= 76.0)
   {
      buyScore -= 6.0;
      sellScore += 3.0;
   }
   else if(g_rsiM1 <= 26.0 || g_rsiM5 <= 24.0)
   {
      sellScore -= 6.0;
      buyScore += 3.0;
   }

   if(g_supplyZoneScore >= 70.0) buyScore -= 5.0;
   if(g_demandZoneScore >= 70.0) sellScore -= 5.0;

   int direction = 0;
   double edge = buyScore - sellScore;
   if(edge > 1.0) direction = 1;
   else if(edge < -1.0) direction = -1;
   else if(momentum > 0.0) direction = 1;
   else if(momentum < 0.0) direction = -1;
   else if(g_macroTrendDirection != 0) direction = g_macroTrendDirection;
   else if(g_trendM5 != 0) direction = g_trendM5;
   else if(g_trendM1 != 0) direction = g_trendM1;

   if(direction == 0)
   {
      g_entryModel = "NONE";
      g_entryTrigger = "NONE";
      g_entryBias = "BOTH";
      g_adaptiveBlockReason = "WAITING_DIRECTION";
      return 0;
   }

   g_entryModel = setupDirection == direction
      ? "SMART_SETUP_WEIGHTED"
      : "SMART_WEIGHTED_DIRECTION";
   g_entryTrigger = direction > 0 ? "SMART_BUY" : "SMART_SELL";
   g_entryBias = direction > 0 ? "BUY" : "SELL";
   g_adaptiveBlockReason = "";
   return EnforceUserDirectionLock(direction);
}

bool BrainV13FastWrongEntryCorrection(double momentum)
{
   int count = BasketPositionCount();
   if(count <= 0)
      return false;

   int direction = BasketDirection();
   if(direction == 0)
      return false;

   double atrPoints = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod)
   );
   double progress = BasketFavorableProgressPoints(direction);

   // Ignore normal noise. Recovery only arms after a meaningful adverse move.
   if(progress > -atrPoints * 0.12)
      return false;

   int opposite = -direction;
   int oppositeVotes = 0;
   if(MomentumSupportsDirection(opposite, momentum, 0.18)) oppositeVotes++;
   if(g_trendM1 == opposite) oppositeVotes++;
   if(g_trendM5 == opposite) oppositeVotes++;
   if(g_emaTrendM5 == opposite) oppositeVotes++;
   if(g_macroTrendDirection == opposite) oppositeVotes++;
   if(BrainV8ConfirmationCandleReady(opposite)) oppositeVotes++;

   bool severeAdverse = progress <= -atrPoints * 0.35;
   bool confirmedWrong = oppositeVotes >= 4 || (severeAdverse && oppositeVotes >= 3);

   if(!confirmedWrong)
   {
      if(progress <= -atrPoints * 0.18)
      {
         g_executionStatus = "RECOVERY_WATCH";
         g_fillBlockReason = "WRONG_ENTRY_WATCH";
      }
      return false;
   }

   // Do not martingale into a thesis that has already failed. Close the wrong
   // Basket; on the next tick Brain V13 re-scores the market and may enter the
   // opposite side immediately if that direction is still real.
   g_burstActive = false;
   g_burstNeedsRearm = false;
   g_fillBlockReason = "FAST_CORRECTION_EXIT";
   g_reversalStatus = "FAST_CORRECTION_CONFIRMED";
   g_executionStatus = "FAST_CORRECTION_EXIT";
   g_lastCloseReason = "BRAIN_V13_WRONG_ENTRY";

   bool closed = CloseAllBasket("BRAIN_V13_WRONG_ENTRY");
   if(closed)
   {
      ResetTrail();
      ClearMarketRearm();
   }
   return closed;
}
'@
Insert-BeforeRequired 'int AdaptiveEntryDirection(double momentum)' $brainV13 'int BrainV13SmartDirection(double momentum)' 'Brain V13 smart entry and correction functions'

Replace-Required 'int rawDirection = BrainV12DirectDirection(momentum);' 'int rawDirection = BrainV13SmartDirection(momentum);' 'use Brain V13 weighted direction'

$correctionCall = @'
      // Brain V13: first protect an entry that is objectively wrong. This is
      // not an entry gate; it only manages an already-open Basket.
      if(!tacticalBasket && BrainV13FastWrongEntryCorrection(momentum))
         return;
'@
Insert-BeforeInFunction 'void OnTick()' '      bool rescueManaging = tacticalBasket ? false : ManageAdaptiveRescue();' $correctionCall 'BrainV13FastWrongEntryCorrection(momentum)' 'run fast wrong-entry correction before rescue'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V13 smart entry + fast correction patch complete: $Path"
