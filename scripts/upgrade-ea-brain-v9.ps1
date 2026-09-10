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

function Replace-InFunctionRequired(
  [string]$functionAnchor,
  [string]$old,
  [string]$new,
  [string]$sentinel,
  [string]$label
) {
  if ($script:text.Contains($sentinel)) {
    Write-Host "$label already applied"
    return
  }
  $functionIndex = $script:text.IndexOf($functionAnchor, [System.StringComparison]::Ordinal)
  if ($functionIndex -lt 0) { throw "Function anchor not found: $label" }
  $oldIndex = $script:text.IndexOf($old, $functionIndex, [System.StringComparison]::Ordinal)
  if ($oldIndex -lt 0) { throw "Patch anchor not found in function: $label" }
  $script:text = $script:text.Remove($oldIndex, $old.Length).Insert($oldIndex, $new)
  Write-Host "Applied $label"
}

# Release metadata. The patch is deliberately idempotent so rebuilds do not
# rewrite unrelated sections of the EA.
Replace-Required '#property version   "1.047"' '#property version   "1.048"' 'EA version 1.048'
Replace-Required '#define SCENOVA_EA_VERSION "1.047"' '#define SCENOVA_EA_VERSION "1.048"' 'runtime version 1.048'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.9"' '#define SCENOVA_PRODUCT_VERSION "2.0.10"' 'product version 2.0.10'

# Production SaaS control must never be sent over plaintext HTTP.
Replace-Required '      bool apiOk = (StringFind(InpApiBase, "https://") == 0 || StringFind(InpApiBase, "http://") == 0);' '      bool apiOk = (StringFind(InpApiBase, "https://") == 0);' 'HTTPS-only SaaS API configuration'

# Persist every close intent that can span multiple tickets/restarts.
Replace-Required '   CLOSE_REASON_REMOTE      = 6' @'
   CLOSE_REASON_REMOTE      = 6,
   CLOSE_REASON_BRAIN_REVERSAL = 7,
   CLOSE_REASON_TACTICAL       = 8,
   CLOSE_REASON_RESCUE         = 9
'@ 'extended persistent close reasons'

$brainV9 = @'
// Brain V9 -----------------------------------------------------------------
// Scoped hardening layer. It does not replace the established setup engines;
// it only enforces customer direction, model-aware confirmation and symmetric
// terminal-exhaustion protection before execution.
bool UserDirectionAllows(int direction)
{
   if(direction == 0)
      return true;
   if(g_entryMode == ENTRY_BUY_ONLY)
      return direction > 0;
   if(g_entryMode == ENTRY_SELL_ONLY)
      return direction < 0;
   return true;
}

int EnforceUserDirectionLock(int direction)
{
   if(UserDirectionAllows(direction))
      return direction;

   g_adaptiveBlockReason = direction > 0
      ? "USER_DIRECTION_LOCK_SELL_ONLY"
      : "USER_DIRECTION_LOCK_BUY_ONLY";
   return 0;
}

bool BrainV9StrongUpImpulse(double momentum)
{
   double threshold = MathMax(2.0, g_adaptiveMomentumThreshold);
   int bullishVotes = 0;
   if(g_trendM1 > 0) bullishVotes++;
   if(g_trendM5 > 0) bullishVotes++;
   if(g_emaTrendM5 > 0) bullishVotes++;
   if(g_emaTrendM15 > 0) bullishVotes++;

   bool momentumStrong = momentum >= threshold * 0.72;
   bool trendStrong = bullishVotes >= 3;
   bool directionalPressure = g_plusDiM5 > g_minusDiM5 && g_adxM5 >= 20.0;
   return momentumStrong && trendStrong && directionalPressure;
}

bool BrainV9UpsideExhaustion(double momentum)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double extension = BrainV8LatestSwingExtensionAtr(1);
   bool overbought = g_rsiM1 >= 66.0 || g_rsiM5 >= 63.0;
   bool supplyTouch = PriceInsideOrNearZone(
      price, g_supplyZoneLow, g_supplyZoneHigh, atrPrice * 0.16
   );
   bool supplyNear = g_supplyZoneLow > price &&
      (g_supplyZoneLow - price) / atrPrice <= 0.34 &&
      g_supplyZoneScore >= 48.0;
   bool extended = extension >= 0.72;
   bool decelerating = !MomentumSupportsDirection(1, momentum, 0.95) ||
      BrainV8ConfirmationCandleReady(-1);

   int evidence = 0;
   if(overbought) evidence++;
   if(supplyTouch || supplyNear) evidence++;
   if(extended) evidence++;
   if(decelerating) evidence++;
   return evidence >= 2 && (extended || supplyTouch || supplyNear);
}

bool BrainV9ContrarianSellReady(double momentum)
{
   if(!BrainV9StrongUpImpulse(momentum))
      return false;
   if(!BrainV9UpsideExhaustion(momentum))
      return false;
   if(!BrainV8ConfirmationCandleReady(-1))
      return false;

   string microState = "NEUTRAL";
   double micro = MicroStructureScore(-1, microState);
   bool reclaim = g_emaReclaimState == "LOSE_EMA21_DOWN";
   bool structureTurn = micro >= 56.0 || g_trendM1 < 0 || reclaim;
   bool pullback = PullbackRetestReady(-1, momentum) ||
                   BrainV8RecentPullbackSequence(-1);
   return structureTurn && pullback;
}

int BrainV9ApplyExhaustionPolicy(int rawDirection, double momentum)
{
   if(BrainV8StrongDownImpulse(momentum))
   {
      int candidate = BrainV8ApplyContrarianPolicy(rawDirection, momentum);
      return EnforceUserDirectionLock(candidate);
   }

   if(BrainV9StrongUpImpulse(momentum))
   {
      if(BrainV9ContrarianSellReady(momentum) && UserDirectionAllows(-1))
      {
         g_entryModel = "UPSIDE_EXHAUSTION_REVERSAL";
         g_entryTrigger = "BEARISH_REVERSAL_CONFIRMATION";
         g_entryBias = "SELL";
         g_reversalStatus = "STRONG_UP_SELL_CONFIRMED";
         g_priceLocationState = "CONTRARIAN_SELL_READY";
         g_adaptiveBlockReason = "";
         return -1;
      }

      g_entryBias = UserDirectionAllows(-1) ? "SELL" : "BUY";
      g_reversalStatus = "STRONG_UP_WAIT_SELL";
      g_priceLocationState = "WAIT_SELL_REVERSAL";
      g_adaptiveBlockReason = UserDirectionAllows(-1)
         ? "STRONG_UP_NO_BUY_WAIT_SELL"
         : "BUY_ONLY_STRONG_UP_WAIT_PULLBACK";
      return 0;
   }

   return EnforceUserDirectionLock(rawDirection);
}

bool BrainV9ModelConfirmationReady(int direction, double momentum)
{
   bool breakoutModel = StringFind(g_entryModel, "BREAKOUT") >= 0 ||
                        StringFind(g_entryTrigger, "BREAKOUT") >= 0;
   if(breakoutModel)
   {
      if(!BrainV8ConfirmationCandleReady(direction))
      {
         g_adaptiveBlockReason = "WAIT_CONFIRMATION_CANDLE";
         g_priceLocationState = "WAIT_CONFIRMATION_CANDLE";
         return false;
      }

      // DirectSetupReady already classifies a compact clean breakout as safe.
      // Only an extended/wicky breakout that explicitly armed the retest flag
      // must wait for a retest here.
      if(g_breakoutRetestRequired)
      {
         double level = direction > 0 ? g_majorResistance : g_majorSupport;
         if(level <= 0.0)
            level = direction > 0 ? g_nearestResistance : g_nearestSupport;
         double atrPrice = MathMax(
            _Point * 10.0,
            AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
         );
         double buffer = MathMax(_Point * 3.0, atrPrice * 0.04);
         if(level > 0.0 && !BreakoutRetestConfirmed(direction, level, buffer))
         {
            g_adaptiveBlockReason = "WAITING_BREAKOUT_RETEST";
            g_priceLocationState = "WAIT_BREAKOUT_RETEST";
            return false;
         }
      }
      return true;
   }

   bool locationModel =
      StringFind(g_entryModel, "PULLBACK") >= 0 ||
      StringFind(g_entryModel, "EXHAUSTION_REVERSAL") >= 0 ||
      StringFind(g_entryTrigger, "REVERSAL") >= 0 ||
      StringFind(g_entryTrigger, "RETEST") >= 0 ||
      g_entryModel == "LEVEL_REACTION";
   if(locationModel)
      return BrainV8PullbackConfirmationReady(direction, momentum);

   // Continuation/news/caution models were already validated by their own
   // setup functions. Require a completed direction candle, but do not invent
   // a pullback requirement that contradicts those models.
   if(!BrainV8ConfirmationCandleReady(direction))
   {
      g_adaptiveBlockReason = "WAIT_CONFIRMATION_CANDLE";
      g_priceLocationState = "WAIT_CONFIRMATION_CANDLE";
      return false;
   }
   return true;
}
'@
Insert-BeforeRequired 'bool MarketLocationEntryAllowed(int direction, bool fastRevalidation)' $brainV9 'bool BrainV9ModelConfirmationReady(int direction, double momentum)' 'Brain V9 scoped hardening functions'

Replace-Required '   rawDirection = BrainV8ApplyContrarianPolicy(rawDirection, momentum);' '   rawDirection = BrainV9ApplyExhaustionPolicy(rawDirection, momentum);' 'symmetric exhaustion policy with user direction lock'
Replace-Required '   if(!BrainV8PullbackConfirmationReady(rawDirection, momentum))' '   if(!BrainV9ModelConfirmationReady(rawDirection, momentum))' 'model-aware confirmation gate'

$oldThresholdRefresh = @'
   if(g_confidenceGateEnabled)
      DynamicConfidenceThreshold(rawDirection);
   else
      g_effectiveConfidenceThreshold = 0.0;
'@
$newThresholdRefresh = @'
   // BrainV8QualityGate above owns the authoritative confidence threshold for
   // this decision. Do not overwrite telemetry with a weaker display value.
'@
Replace-Required $oldThresholdRefresh $newThresholdRefresh 'single authoritative confidence threshold'

$directionExecutionGuard = @'
   if(!UserDirectionAllows(direction))
   {
      g_executionStatus = "USER_DIRECTION_LOCK";
      g_adaptiveBlockReason = direction > 0
         ? "USER_DIRECTION_LOCK_SELL_ONLY"
         : "USER_DIRECTION_LOCK_BUY_ONLY";
      return;
   }

'@
Insert-BeforeInFunction 'void OnTick()' '   if(!OpenTradingAllowedForDirection(direction))' $directionExecutionGuard 'g_executionStatus = "USER_DIRECTION_LOCK";' 'final user direction execution guard'

# Keep SaaS control responsive if the API/network is slow. Journals already use
# their own shorter timeout; this changes only the default control POST timeout.
Replace-Required '   return HttpPostJsonTimeout(url, payload, response, 5000);' '   return HttpPostJsonTimeout(url, payload, response, 1200);' 'bounded control heartbeat timeout'

# Dynamic broker-aware deviation and one bounded retry for transient price
# movement. This changes transport behavior only; entry/exit strategy is untouched.
$executionHelpers = @'
int DynamicDeviationPoints()
{
   double spread = CurrentSpreadPoints();
   double atr = AverageTrueRangePoints(PERIOD_M5, g_atrPeriod);
   if(spread <= 0.0 || spread >= 999999.0)
      spread = 5.0;
   if(atr <= 0.0)
      atr = spread * 4.0;

   double deviation = MathMax(5.0, MathMax(spread * 1.50, atr * 0.12));
   return (int)MathRound(MathMin(80.0, deviation));
}

bool OrderSendWithPriceRetry(MqlTradeRequest &request, MqlTradeResult &result)
{
   request.deviation = DynamicDeviationPoints();
   ResetLastError();
   bool sent = OrderSend(request, result);
   if(sent && TradeResultAccepted(result))
      return true;

   long retcode = (long)result.retcode;
   bool retryable =
      retcode == TRADE_RETCODE_PRICE_CHANGED ||
      retcode == TRADE_RETCODE_REQUOTE ||
      retcode == TRADE_RETCODE_PRICE_OFF;
   if(!retryable)
      return sent;

   MqlTick tick;
   if(!SymbolInfoTick(request.symbol, tick))
      return sent;
   if(request.type == ORDER_TYPE_BUY)
      request.price = tick.ask;
   else if(request.type == ORDER_TYPE_SELL)
      request.price = tick.bid;
   else
      return sent;

   request.deviation = DynamicDeviationPoints();
   ResetLastError();
   return OrderSend(request, result);
}
'@
Insert-BeforeRequired 'long RescueMagic()' $executionHelpers 'bool OrderSendWithPriceRetry(MqlTradeRequest &request, MqlTradeResult &result)' 'dynamic deviation and bounded price retry'

Replace-InFunctionRequired 'bool SendRescueOrder(int direction,double requestedVolume)' 'if(!OrderSend(request,result) || !TradeResultAccepted(result))' 'if(!OrderSendWithPriceRetry(request,result) || !TradeResultAccepted(result))' 'SendRescueOrder(int direction,double requestedVolume) /* V9_RETRY */' 'rescue order bounded retry'
# Mark each changed function locally so idempotence cannot be confused by the
# helper implementation containing the same call text.
Replace-InFunctionRequired 'bool SendRescueOrder(int direction,double requestedVolume)' 'bool SendRescueOrder(int direction,double requestedVolume)' 'bool SendRescueOrder(int direction,double requestedVolume) /* V9_RETRY */' 'bool SendRescueOrder(int direction,double requestedVolume) /* V9_RETRY */' 'mark rescue retry'

Replace-InFunctionRequired 'bool ClosePositionVolumeByTicket(ulong ticket,double requestedVolume,string comment)' 'if(!OrderSend(request,result))' 'if(!OrderSendWithPriceRetry(request,result))' 'ClosePositionVolumeByTicket(ulong ticket,double requestedVolume,string comment) /* V9_RETRY */' 'partial close bounded retry'
Replace-InFunctionRequired 'bool ClosePositionVolumeByTicket(ulong ticket,double requestedVolume,string comment)' 'bool ClosePositionVolumeByTicket(ulong ticket,double requestedVolume,string comment)' 'bool ClosePositionVolumeByTicket(ulong ticket,double requestedVolume,string comment) /* V9_RETRY */' 'bool ClosePositionVolumeByTicket(ulong ticket,double requestedVolume,string comment) /* V9_RETRY */' 'mark partial close retry'

Replace-InFunctionRequired 'bool SendMarketOrder(int direction)' 'if(!OrderSend(request, result))' 'if(!OrderSendWithPriceRetry(request, result))' 'bool SendMarketOrder(int direction) /* V9_RETRY */' 'market order bounded retry'
Replace-InFunctionRequired 'bool SendMarketOrder(int direction)' 'bool SendMarketOrder(int direction)' 'bool SendMarketOrder(int direction) /* V9_RETRY */' 'bool SendMarketOrder(int direction) /* V9_RETRY */' 'mark market retry'

Replace-InFunctionRequired 'bool ClosePositionByTicket(ulong ticket)' 'if(!OrderSend(request, result))' 'if(!OrderSendWithPriceRetry(request, result))' 'bool ClosePositionByTicket(ulong ticket) /* V9_RETRY */' 'close order bounded retry'
Replace-InFunctionRequired 'bool ClosePositionByTicket(ulong ticket)' 'bool ClosePositionByTicket(ulong ticket)' 'bool ClosePositionByTicket(ulong ticket) /* V9_RETRY */' 'bool ClosePositionByTicket(ulong ticket) /* V9_RETRY */' 'mark close retry'

# Extend close-reason persistence without changing the existing exit decisions.
$closeReasonAdds = @'
   if(StringFind(reason, "BRAIN_V8_REVERSAL") == 0 ||
      StringFind(reason, "BRAIN_V9_REVERSAL") == 0)
      return CLOSE_REASON_BRAIN_REVERSAL;
   if(StringFind(reason, "TACTICAL_COUNTERTREND") == 0)
      return CLOSE_REASON_TACTICAL;
   if(StringFind(reason, "RESCUE_") == 0)
      return CLOSE_REASON_RESCUE;
'@
Insert-BeforeInFunction 'int CloseReasonCode(string reason)' '   return CLOSE_REASON_NONE;' $closeReasonAdds 'return CLOSE_REASON_BRAIN_REVERSAL;' 'persist Brain/Tactical/Rescue close intent'

$closeTextAdds = @'
   if(reasonCode == CLOSE_REASON_BRAIN_REVERSAL) return "BRAIN_REVERSAL_EXIT";
   if(reasonCode == CLOSE_REASON_TACTICAL) return "TACTICAL_COUNTERTREND_EXIT";
   if(reasonCode == CLOSE_REASON_RESCUE) return "RESCUE_RECOVERY_EXIT";
'@
Insert-BeforeInFunction 'string CloseReasonText(int reasonCode)' '   return "CLOSE_ALL";' $closeTextAdds 'CLOSE_REASON_BRAIN_REVERSAL) return "BRAIN_REVERSAL_EXIT";' 'restore persisted extended close intent'

$closeStatusAdds = @'
   if(reasonCode == CLOSE_REASON_BRAIN_REVERSAL) return "BASKET_REVERSAL_EXIT";
   if(reasonCode == CLOSE_REASON_TACTICAL) return "TACTICAL_COUNTERTREND_EXIT";
   if(reasonCode == CLOSE_REASON_RESCUE) return "RESCUE_EXIT";
'@
Insert-BeforeInFunction 'string CloseCompletionStatus(int reasonCode)' '   return "STOPPED";' $closeStatusAdds 'CLOSE_REASON_BRAIN_REVERSAL) return "BASKET_REVERSAL_EXIT";' 'extended close completion status'

Replace-Required '(restoredReason >= CLOSE_REASON_DAILY_LOSS && restoredReason <= CLOSE_REASON_REMOTE)' '(restoredReason >= CLOSE_REASON_DAILY_LOSS && restoredReason <= CLOSE_REASON_RESCUE)' 'restore all persistent close reasons'

# Make the lot contract match runtime behavior. Unified intelligence chooses
# timing/protection; the customer configured lot remains the executed lot.
Replace-Required '// Adaptive Engine: deterministic, testable safeguards. The configured lot is
// always treated as a ceiling; adaptive sizing can reduce it, never increase it.' '// Adaptive Engine: deterministic, testable safeguards. The configured lot is
// customer-controlled and is used directly after broker volume normalization.' 'accurate lot sizing contract'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V9 scoped hardening patch complete: $Path"