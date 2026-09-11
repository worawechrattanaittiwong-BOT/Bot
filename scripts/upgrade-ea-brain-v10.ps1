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

Replace-Required '#property version   "1.048"' '#property version   "1.049"' 'EA version 1.049'
Replace-Required '#define SCENOVA_EA_VERSION "1.048"' '#define SCENOVA_EA_VERSION "1.049"' 'runtime version 1.049'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.10"' '#define SCENOVA_PRODUCT_VERSION "2.0.11"' 'product version 2.0.11'

$brainV10 = @'
// Brain V10 ----------------------------------------------------------------
// Trend-phase entry policy:
// - Never chase a strong impulse into the bottom/top.
// - Permit trend continuation only AFTER a real counter-trend pullback and a
//   fresh direction candle, while meaningful room remains to the next
//   Demand/Support or Supply/Resistance area.
// - Keep the existing exhaustion reversal logic for late-trend conditions.
bool BrainV10PullbackSequenceOnTf(int direction, ENUM_TIMEFRAMES timeframe)
{
   if(direction == 0)
      return false;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, timeframe, 1, 6, rates);
   if(copied < 5)
      return false;

   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );

   bool counterSeen = false;
   double pullbackHigh = rates[1].high;
   double pullbackLow = rates[1].low;
   int upto = copied < 4 ? copied : 4;
   for(int i = 1; i < upto; i++)
   {
      bool counterCandle = direction < 0
         ? rates[i].close > rates[i].open
         : rates[i].close < rates[i].open;
      if(counterCandle)
         counterSeen = true;
      pullbackHigh = MathMax(pullbackHigh, rates[i].high);
      pullbackLow = MathMin(pullbackLow, rates[i].low);
   }

   bool directionConfirm = direction < 0
      ? (rates[0].close < rates[0].open && rates[0].close < rates[1].close)
      : (rates[0].close > rates[0].open && rates[0].close > rates[1].close);
   bool meaningfulPullback = (pullbackHigh - pullbackLow) >= atrPrice * 0.10;

   return counterSeen && meaningfulPullback && directionConfirm;
}

bool BrainV10RecentPullbackContinuation(int direction)
{
   return BrainV10PullbackSequenceOnTf(direction, PERIOD_M1) ||
          BrainV10PullbackSequenceOnTf(direction, PERIOD_M5);
}

bool BrainV10ContinuationReady(int direction, double momentum, string &reasonOut)
{
   reasonOut = "NONE";
   if(direction == 0 || !UserDirectionAllows(direction))
   {
      reasonOut = "USER_DIRECTION_LOCK";
      return false;
   }

   bool strongImpulse = direction < 0
      ? BrainV8StrongDownImpulse(momentum)
      : BrainV9StrongUpImpulse(momentum);
   if(!strongImpulse)
   {
      reasonOut = "NO_STRONG_IMPULSE";
      return false;
   }

   // Once the impulse is already exhausted, continuation is disabled. The
   // existing reversal engine owns that phase instead.
   bool exhausted = direction < 0
      ? BrainV8DownsideExhaustion(momentum)
      : BrainV9UpsideExhaustion(momentum);
   if(exhausted)
   {
      reasonOut = "EXHAUSTION_PHASE";
      return false;
   }

   double extensionAtr = BrainV8LatestSwingExtensionAtr(direction);
   if(extensionAtr >= 0.82)
   {
      reasonOut = "SWING_TOO_EXTENDED";
      return false;
   }

   // Require enough reward space before allowing a continuation entry. This is
   // the hard protection against SELL-at-the-bottom / BUY-at-the-top.
   double targetRoomAtr = SpaceToTargetAtr(direction);
   if(targetRoomAtr < 0.60)
   {
      reasonOut = "INSUFFICIENT_TARGET_ROOM";
      return false;
   }

   // Preserve the established M1/M5 terminal-zone guard.
   if(BrainV8LocalZoneBlocked(direction, false))
   {
      reasonOut = direction < 0 ? "NEAR_DEMAND_SUPPORT" : "NEAR_SUPPLY_RESISTANCE";
      return false;
   }

   // Do not continue selling an already oversold leg or buying an already
   // overbought leg even if a short-lived confirmation candle appears.
   if(direction < 0 && (g_rsiM1 <= 34.0 || g_rsiM5 <= 37.0))
   {
      reasonOut = "OVERSOLD_BOTTOM_PROTECTION";
      return false;
   }
   if(direction > 0 && (g_rsiM1 >= 66.0 || g_rsiM5 >= 63.0))
   {
      reasonOut = "OVERBOUGHT_TOP_PROTECTION";
      return false;
   }

   int trendVotes = 0;
   if(g_trendM5 == direction) trendVotes++;
   if(g_trendM15 == direction) trendVotes++;
   if(g_emaTrendM5 == direction) trendVotes++;
   if(g_emaTrendM15 == direction) trendVotes++;
   if(trendVotes < 3)
   {
      reasonOut = "TREND_NOT_CONFIRMED";
      return false;
   }

   if(!BrainV10RecentPullbackContinuation(direction))
   {
      reasonOut = "WAIT_REAL_PULLBACK";
      return false;
   }

   if(!BrainV8ConfirmationCandleReady(direction))
   {
      reasonOut = "WAIT_CONFIRMATION_CANDLE";
      return false;
   }

   return true;
}

int BrainV10ApplyTrendPhasePolicy(int rawDirection, double momentum)
{
   if(BrainV8StrongDownImpulse(momentum))
   {
      // Late downtrend: keep the existing confirmed exhaustion BUY path.
      if(BrainV8ContrarianBuyReady(momentum) && UserDirectionAllows(1))
      {
         g_entryModel = "DOWNSIDE_EXHAUSTION_REVERSAL";
         g_entryTrigger = "BULLISH_REVERSAL_CONFIRMATION";
         g_entryBias = "BUY";
         g_reversalStatus = "STRONG_DOWN_BUY_CONFIRMED";
         g_priceLocationState = "CONTRARIAN_BUY_READY";
         g_adaptiveBlockReason = "";
         return EnforceUserDirectionLock(1);
      }

      string continuationReason = "NONE";
      if(BrainV10ContinuationReady(-1, momentum, continuationReason))
      {
         g_entryModel = "DOWNTREND_PULLBACK_CONTINUATION";
         g_entryTrigger = "BEARISH_PULLBACK_CONFIRMATION";
         g_entryBias = "SELL";
         g_reversalStatus = "STRONG_DOWN_PULLBACK_SELL_CONFIRMED";
         g_priceLocationState = "PULLBACK_CONTINUATION_SELL_READY";
         g_adaptiveBlockReason = "";
         return EnforceUserDirectionLock(-1);
      }

      double extensionAtr = BrainV8LatestSwingExtensionAtr(-1);
      double roomAtr = SpaceToTargetAtr(-1);
      bool bottomPhase = BrainV8DownsideExhaustion(momentum) ||
                         extensionAtr >= 0.82 || roomAtr < 0.60 ||
                         g_rsiM1 <= 34.0 || g_rsiM5 <= 37.0;
      if(bottomPhase)
      {
         g_entryBias = UserDirectionAllows(1) ? "BUY" : "SELL";
         g_reversalStatus = "STRONG_DOWN_BOTTOM_PROTECTION";
         g_priceLocationState = "WAIT_BUY_REVERSAL";
         g_adaptiveBlockReason = "STRONG_DOWN_NO_SELL_WAIT_BUY";
      }
      else
      {
         g_entryBias = "SELL";
         g_reversalStatus = "STRONG_DOWN_WAIT_PULLBACK_SELL";
         g_priceLocationState = "WAIT_PULLBACK_CONTINUATION";
         g_adaptiveBlockReason = "STRONG_DOWN_WAIT_PULLBACK_SELL";
      }
      return 0;
   }

   if(BrainV9StrongUpImpulse(momentum))
   {
      // Symmetric top protection: do not BUY the final spike. A confirmed
      // exhaustion reversal may SELL; otherwise only a pullback continuation
      // with room to the next supply/resistance may BUY.
      if(BrainV9ContrarianSellReady(momentum) && UserDirectionAllows(-1))
      {
         g_entryModel = "UPSIDE_EXHAUSTION_REVERSAL";
         g_entryTrigger = "BEARISH_REVERSAL_CONFIRMATION";
         g_entryBias = "SELL";
         g_reversalStatus = "STRONG_UP_SELL_CONFIRMED";
         g_priceLocationState = "CONTRARIAN_SELL_READY";
         g_adaptiveBlockReason = "";
         return EnforceUserDirectionLock(-1);
      }

      string continuationReason = "NONE";
      if(BrainV10ContinuationReady(1, momentum, continuationReason))
      {
         g_entryModel = "UPTREND_PULLBACK_CONTINUATION";
         g_entryTrigger = "BULLISH_PULLBACK_CONFIRMATION";
         g_entryBias = "BUY";
         g_reversalStatus = "STRONG_UP_PULLBACK_BUY_CONFIRMED";
         g_priceLocationState = "PULLBACK_CONTINUATION_BUY_READY";
         g_adaptiveBlockReason = "";
         return EnforceUserDirectionLock(1);
      }

      double extensionAtr = BrainV8LatestSwingExtensionAtr(1);
      double roomAtr = SpaceToTargetAtr(1);
      bool topPhase = BrainV9UpsideExhaustion(momentum) ||
                      extensionAtr >= 0.82 || roomAtr < 0.60 ||
                      g_rsiM1 >= 66.0 || g_rsiM5 >= 63.0;
      if(topPhase)
      {
         g_entryBias = UserDirectionAllows(-1) ? "SELL" : "BUY";
         g_reversalStatus = "STRONG_UP_TOP_PROTECTION";
         g_priceLocationState = "WAIT_SELL_REVERSAL";
         g_adaptiveBlockReason = "STRONG_UP_NO_BUY_WAIT_SELL";
      }
      else
      {
         g_entryBias = "BUY";
         g_reversalStatus = "STRONG_UP_WAIT_PULLBACK_BUY";
         g_priceLocationState = "WAIT_PULLBACK_CONTINUATION";
         g_adaptiveBlockReason = "STRONG_UP_WAIT_PULLBACK_BUY";
      }
      return 0;
   }

   return EnforceUserDirectionLock(rawDirection);
}
'@
Insert-BeforeRequired 'int BrainV9ApplyExhaustionPolicy(int rawDirection, double momentum)' $brainV10 'int BrainV10ApplyTrendPhasePolicy(int rawDirection, double momentum)' 'Brain V10 trend-phase functions'

Replace-Required '   rawDirection = BrainV9ApplyExhaustionPolicy(rawDirection, momentum);' '   rawDirection = BrainV10ApplyTrendPhasePolicy(rawDirection, momentum);' 'trend-phase policy wiring'

$oldModelGate = @'
bool BrainV9ModelConfirmationReady(int direction, double momentum)
{
   bool breakoutModel = StringFind(g_entryModel, "BREAKOUT") >= 0 ||
'@
$newModelGate = @'
bool BrainV9ModelConfirmationReady(int direction, double momentum)
{
   // Brain V10 continuation setups already proved a real counter-trend
   // pullback, target room and terminal-zone safety inside the phase policy.
   // Re-check only the fresh direction candle here so a second generic
   // pullback gate cannot starve an otherwise valid continuation entry.
   if(g_entryModel == "DOWNTREND_PULLBACK_CONTINUATION" ||
      g_entryModel == "UPTREND_PULLBACK_CONTINUATION")
   {
      if(!BrainV8ConfirmationCandleReady(direction))
      {
         g_adaptiveBlockReason = "WAIT_CONFIRMATION_CANDLE";
         g_priceLocationState = "WAIT_CONFIRMATION_CANDLE";
         return false;
      }
      return true;
   }

   bool breakoutModel = StringFind(g_entryModel, "BREAKOUT") >= 0 ||
'@
Replace-Required $oldModelGate $newModelGate 'avoid duplicate pullback gate for Brain V10 continuation'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V10 patch complete: $Path"
