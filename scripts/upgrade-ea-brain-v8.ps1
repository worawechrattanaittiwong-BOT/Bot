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

function Insert-AfterLineInFunction([string]$functionAnchor, [string]$needle, [string]$block, [string]$sentinel, [string]$label) {
  if ($script:text.Contains($sentinel)) {
    Write-Host "$label already applied"
    return
  }
  $functionIndex = $script:text.IndexOf($functionAnchor, [System.StringComparison]::Ordinal)
  if ($functionIndex -lt 0) { throw "Function anchor not found: $label" }
  $needleIndex = $script:text.IndexOf($needle, $functionIndex, [System.StringComparison]::Ordinal)
  if ($needleIndex -lt 0) { throw "Needle not found in function: $label" }
  $lineEnd = $script:text.IndexOf("`n", $needleIndex)
  if ($lineEnd -lt 0) { throw "Line end not found: $label" }
  $script:text = $script:text.Insert($lineEnd + 1, $block + "`r`n")
  Write-Host "Applied $label"
}

Replace-Required '#property version   "1.046"' '#property version   "1.047"' 'EA version 1.047'
Replace-Required '#define SCENOVA_EA_VERSION "1.046"' '#define SCENOVA_EA_VERSION "1.047"' 'runtime version 1.047'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.8"' '#define SCENOVA_PRODUCT_VERSION "2.0.9"' 'product version 2.0.9'
Replace-Required 'input bool            InpConfidenceGateEnabled = false;' 'input bool            InpConfidenceGateEnabled = true;' 'default confidence hard gate'

$brain = @'
// Brain V8 -----------------------------------------------------------------
// Terminal-location protection + contrarian exhaustion engine.
// A strong down impulse is NEVER chased with a new Sell. The engine waits for
// exhaustion + bullish evidence and then permits Buy only after confirmation.
bool BrainV8ConfirmationCandleReady(int direction)
{
   return RecentDirectionalBody(direction, PERIOD_M1) ||
          RecentDirectionalBody(direction, PERIOD_M5);
}

bool BrainV8RecentPullbackSequence(int direction)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M1, 1, 7, rates);
   if(copied < 5)
      return false;

   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double peak = rates[1].high;
   double trough = rates[1].low;
   for(int i = 1; i < copied; i++)
   {
      peak = MathMax(peak, rates[i].high);
      trough = MathMin(trough, rates[i].low);
   }

   bool confirmed = direction > 0
      ? (rates[0].close > rates[0].open && rates[0].close > rates[1].close)
      : (rates[0].close < rates[0].open && rates[0].close < rates[1].close);
   if(!confirmed)
      return false;

   double range = peak - trough;
   if(range < atrPrice * 0.12)
      return false;

   if(direction > 0)
      return rates[0].close > trough + range * 0.38;
   return rates[0].close < peak - range * 0.38;
}

bool BrainV8PullbackConfirmationReady(int direction, double momentum)
{
   if(!BrainV8ConfirmationCandleReady(direction))
   {
      g_adaptiveBlockReason = "WAIT_CONFIRMATION_CANDLE";
      g_priceLocationState = "WAIT_CONFIRMATION_CANDLE";
      return false;
   }

   bool pullbackReady = PullbackRetestReady(direction, momentum) ||
                        BrainV8RecentPullbackSequence(direction);
   if(!pullbackReady)
   {
      g_adaptiveBlockReason = "WAITING_PULLBACK_RETEST";
      g_priceLocationState = "WAIT_PULLBACK";
      return false;
   }

   bool breakoutModel = StringFind(g_entryModel, "BREAKOUT") >= 0 ||
                        StringFind(g_entryTrigger, "BREAKOUT") >= 0;
   if(breakoutModel)
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
         g_breakoutRetestRequired = true;
         return false;
      }
   }
   return true;
}

double BrainV8LatestSwingExtensionAtr(int direction)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(_Symbol, PERIOD_M5, 1, 16, rates);
   if(copied < 8)
      return 0.0;

   double reference = 0.0;
   for(int i = 2; i < copied - 2; i++)
   {
      bool pivot = direction > 0
         ? (rates[i].high >= rates[i-1].high && rates[i].high >= rates[i-2].high &&
            rates[i].high > rates[i+1].high && rates[i].high > rates[i+2].high)
         : (rates[i].low <= rates[i-1].low && rates[i].low <= rates[i-2].low &&
            rates[i].low < rates[i+1].low && rates[i].low < rates[i+2].low);
      if(pivot)
      {
         reference = direction > 0 ? rates[i].high : rates[i].low;
         break;
      }
   }

   if(reference <= 0.0)
   {
      reference = direction > 0 ? rates[1].high : rates[1].low;
      int upto = copied < 9 ? copied : 9;
      for(int i = 2; i < upto; i++)
         reference = direction > 0
            ? MathMax(reference, rates[i].high)
            : MathMin(reference, rates[i].low);
   }

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   if(atrPrice <= 0.0)
      return 0.0;

   double extension = direction > 0
      ? MathMax(0.0, price - reference)
      : MathMax(0.0, reference - price);
   return extension / atrPrice;
}

bool BrainV8LocalZoneBlocked(int direction, bool fastRevalidation)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return true;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );

   double m1Support = 0.0, m1Resistance = 0.0;
   double m1SupportStrength = 0.0, m1ResistanceStrength = 0.0;
   double m5Support = 0.0, m5Resistance = 0.0;
   double m5SupportStrength = 0.0, m5ResistanceStrength = 0.0;
   FindClusteredPivotLevels(
      PERIOD_M1, 120, price, atrPrice,
      m1Support, m1Resistance,
      m1SupportStrength, m1ResistanceStrength
   );
   FindClusteredPivotLevels(
      PERIOD_M5, 120, price, atrPrice,
      m5Support, m5Resistance,
      m5SupportStrength, m5ResistanceStrength
   );

   double thresholdAtr = fastRevalidation ? 0.36 : 0.30;
   double zoneThresholdAtr = thresholdAtr + 0.06;

   if(direction < 0)
   {
      bool nearM1 = m1Support > 0.0 && m1Support <= price &&
         (price - m1Support) / atrPrice <= thresholdAtr &&
         m1SupportStrength >= 30.0;
      bool nearM5 = m5Support > 0.0 && m5Support <= price &&
         (price - m5Support) / atrPrice <= thresholdAtr &&
         m5SupportStrength >= 30.0;
      bool inDemand = PriceInsideOrNearZone(
         price, g_demandZoneLow, g_demandZoneHigh, atrPrice * 0.12
      );
      bool nearDemand = g_demandZoneHigh > 0.0 && g_demandZoneHigh <= price &&
         (price - g_demandZoneHigh) / atrPrice <= zoneThresholdAtr &&
         g_demandZoneScore >= 50.0;
      if(nearM1 || nearM5 || inDemand || nearDemand)
      {
         g_adaptiveBlockReason = "WAIT_TERMINAL_DEMAND";
         g_priceLocationState = "NEAR_M1_M5_DEMAND";
         return true;
      }
   }
   else if(direction > 0)
   {
      bool nearM1 = m1Resistance > price &&
         (m1Resistance - price) / atrPrice <= thresholdAtr &&
         m1ResistanceStrength >= 30.0;
      bool nearM5 = m5Resistance > price &&
         (m5Resistance - price) / atrPrice <= thresholdAtr &&
         m5ResistanceStrength >= 30.0;
      bool inSupply = PriceInsideOrNearZone(
         price, g_supplyZoneLow, g_supplyZoneHigh, atrPrice * 0.12
      );
      bool nearSupply = g_supplyZoneLow > price &&
         (g_supplyZoneLow - price) / atrPrice <= zoneThresholdAtr &&
         g_supplyZoneScore >= 50.0;
      if(nearM1 || nearM5 || inSupply || nearSupply)
      {
         g_adaptiveBlockReason = "WAIT_TERMINAL_SUPPLY";
         g_priceLocationState = "NEAR_M1_M5_SUPPLY";
         return true;
      }
   }
   return false;
}

bool BrainV8StrongDownImpulse(double momentum)
{
   double threshold = MathMax(2.0, g_adaptiveMomentumThreshold);
   int bearishVotes = 0;
   if(g_trendM1 < 0) bearishVotes++;
   if(g_trendM5 < 0) bearishVotes++;
   if(g_emaTrendM5 < 0) bearishVotes++;
   if(g_emaTrendM15 < 0) bearishVotes++;

   bool momentumStrong = momentum <= -threshold * 0.72;
   bool trendStrong = bearishVotes >= 3;
   bool directionalPressure = g_minusDiM5 > g_plusDiM5 && g_adxM5 >= 20.0;
   return momentumStrong && trendStrong && directionalPressure;
}

bool BrainV8DownsideExhaustion(double momentum)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double extension = BrainV8LatestSwingExtensionAtr(-1);
   bool oversold = g_rsiM1 <= 34.0 || g_rsiM5 <= 37.0;
   bool demandTouch = PriceInsideOrNearZone(
      price, g_demandZoneLow, g_demandZoneHigh, atrPrice * 0.16
   );
   bool demandNear = g_demandZoneHigh > 0.0 && g_demandZoneHigh <= price &&
      (price - g_demandZoneHigh) / atrPrice <= 0.34 &&
      g_demandZoneScore >= 48.0;
   bool extended = extension >= 0.72;
   bool decelerating = !MomentumSupportsDirection(-1, momentum, 0.95) ||
      BrainV8ConfirmationCandleReady(1);

   int evidence = 0;
   if(oversold) evidence++;
   if(demandTouch || demandNear) evidence++;
   if(extended) evidence++;
   if(decelerating) evidence++;
   return evidence >= 2 && (extended || demandTouch || demandNear);
}

bool BrainV8ContrarianBuyReady(double momentum)
{
   if(!BrainV8StrongDownImpulse(momentum))
      return false;
   if(!BrainV8DownsideExhaustion(momentum))
      return false;
   if(!BrainV8ConfirmationCandleReady(1))
      return false;

   string microState = "NEUTRAL";
   double micro = MicroStructureScore(1, microState);
   bool reclaim = g_emaReclaimState == "RECLAIM_EMA21_UP";
   bool structureTurn = micro >= 56.0 || g_trendM1 > 0 || reclaim;
   bool pullback = PullbackRetestReady(1, momentum) ||
                   BrainV8RecentPullbackSequence(1);
   return structureTurn && pullback;
}

int BrainV8ApplyContrarianPolicy(int rawDirection, double momentum)
{
   if(!BrainV8StrongDownImpulse(momentum))
      return rawDirection;

   // Explicit product policy: never chase a strong bearish impulse with Sell.
   // Either wait, or buy the confirmed exhaustion reversal.
   if(BrainV8ContrarianBuyReady(momentum))
   {
      g_entryModel = "DOWNSIDE_EXHAUSTION_REVERSAL";
      g_entryTrigger = "BULLISH_REVERSAL_CONFIRMATION";
      g_entryBias = "BUY";
      g_reversalStatus = "STRONG_DOWN_BUY_CONFIRMED";
      g_priceLocationState = "CONTRARIAN_BUY_READY";
      g_adaptiveBlockReason = "";
      return 1;
   }

   g_entryBias = "BUY";
   g_reversalStatus = "STRONG_DOWN_WAIT_BUY";
   g_priceLocationState = "WAIT_BUY_REVERSAL";
   g_adaptiveBlockReason = "STRONG_DOWN_NO_SELL_WAIT_BUY";
   return 0;
}

bool BrainV8QualityGate(int direction, double momentum)
{
   RefreshIndicatorV6Scores(direction, momentum);

   double confidenceFloor = MathMax(
      56.0,
      MathMax((double)g_confidenceThreshold, DynamicConfidenceThreshold(direction))
   );
   if(direction > 0 && g_reversalStatus == "STRONG_DOWN_BUY_CONFIRMED")
      confidenceFloor = MathMax(confidenceFloor, 60.0);

   g_effectiveConfidenceThreshold = confidenceFloor;
   if(g_signalConfidence < confidenceFloor)
   {
      g_adaptiveBlockReason = "WAITING_CONFIDENCE";
      return false;
   }

   string microState = "NONE";
   double microScore = MicroStructureScore(direction, microState);
   bool counterMacro = g_macroTrendDirection != 0 && direction != g_macroTrendDirection;
   double locationStructureFloor = counterMacro ? 32.0 : 27.0;
   double indicatorStructureFloor = counterMacro ? 62.0 : 55.0;
   bool directionalStructure =
      g_trendM5 == direction ||
      g_trendM15 == direction ||
      microScore >= 65.0 ||
      StringFind(g_reversalStatus, "CONFIRMED") >= 0;

   if(g_structureScore < locationStructureFloor ||
      g_indicatorStructureScore < indicatorStructureFloor ||
      !directionalStructure)
   {
      g_adaptiveBlockReason = "WAITING_STRUCTURE_CONFIRMATION";
      return false;
   }
   return true;
}

bool BrainV8BasketAdverseMove(int direction, string &reasonOut)
{
   reasonOut = "NONE";
   double atrPoints = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod)
   );
   double progress = BasketFavorableProgressPoints(direction);
   double momentum = MomentumPoints();
   bool adversePrice = progress <= -atrPoints * 0.06;
   bool oppositeCandle = BrainV8ConfirmationCandleReady(-direction);
   bool oppositeMomentum = MomentumSupportsDirection(-direction, momentum, 0.22);
   string lowerState = LowerTimeframeStateForDirection(direction);

   if(lowerState == "REVERSAL")
   {
      reasonOut = "LOWER_TF_REVERSAL";
      return true;
   }
   if(adversePrice && (oppositeCandle || oppositeMomentum))
   {
      reasonOut = "ADVERSE_MOVE_ADD_BLOCK";
      return true;
   }
   if(oppositeCandle && oppositeMomentum)
   {
      reasonOut = "OPPOSITE_FLOW_ADD_BLOCK";
      return true;
   }
   return false;
}

bool BrainV8ConfirmedBasketReversal(int primaryDirection, double momentum, string &reasonOut)
{
   reasonOut = "NONE";
   int opposite = -primaryDirection;
   if(opposite == 0)
      return false;

   RefreshMarketContext(false);
   double reversalScore = 0.0;
   bool reversalSetup = ReversalOpportunityReady(opposite, momentum, reversalScore);
   string microState = "NONE";
   double microScore = MicroStructureScore(opposite, microState);
   bool candle = BrainV8ConfirmationCandleReady(opposite);
   bool m5Flip = g_trendM5 == opposite || RecentDirectionalBody(opposite, PERIOD_M5);
   bool emaFlip = g_emaTrendM5 == opposite || g_emaTrendM15 == opposite;
   bool momentumFlip = MomentumSupportsDirection(opposite, momentum, 0.35);
   bool structureFlip = microScore >= 68.0 ||
      (g_trendM5 == opposite && g_trendM15 == opposite);

   int evidence = 0;
   if(m5Flip) evidence++;
   if(emaFlip) evidence++;
   if(momentumFlip) evidence++;
   if(structureFlip) evidence++;

   bool zoneConfirmed = reversalSetup && reversalScore >= 72.0 &&
      candle && structureFlip && evidence >= 3;
   bool structuralBreak = candle && microScore >= 78.0 &&
      m5Flip && emaFlip && momentumFlip;

   if(zoneConfirmed || structuralBreak)
   {
      reasonOut = zoneConfirmed
         ? "ZONE_STRUCTURE_REVERSAL"
         : "STRUCTURE_MOMENTUM_REVERSAL";
      return true;
   }
   return false;
}

bool BrainV8HandleBasketReversal(double momentum)
{
   if(BasketPositionCount() <= 0)
      return false;

   int direction = BasketDirection();
   if(direction == 0)
      return false;

   string reason = "NONE";
   if(!BrainV8ConfirmedBasketReversal(direction, momentum, reason))
      return false;

   g_burstActive = false;
   g_burstNeedsRearm = false;
   g_fillBlockReason = "BASKET_REVERSAL_EXIT";
   g_reversalStatus = "BASKET_REVERSAL_CONFIRMED";
   g_executionStatus = "BASKET_REVERSAL_EXIT";
   g_lastCloseReason = reason;
   bool closed = CloseAllBasket("BRAIN_V8_REVERSAL_" + reason);
   if(closed)
      ResetTrail();
   return true;
}
'@

Insert-BeforeRequired 'bool MarketLocationEntryAllowed(int direction, bool fastRevalidation)' $brain 'bool BrainV8ConfirmationCandleReady(int direction)' 'Brain V8 intelligence functions'

$locationGate = @'
   if(BrainV8LocalZoneBlocked(direction, fastRevalidation))
      return false;

   double brainV8SwingExtension = BrainV8LatestSwingExtensionAtr(direction);
   double brainV8MaxExtension = fastRevalidation ? 0.80 : 0.95;
   g_extensionAtr = MathMax(g_extensionAtr, brainV8SwingExtension);
   if(brainV8SwingExtension >= brainV8MaxExtension)
   {
      g_adaptiveBlockReason = "WAITING_PULLBACK_RETEST";
      g_priceLocationState = "SWING_EXTENDED_WAIT_PULLBACK";
      RegisterAntiChaseState(direction, "SWING_EXTENSION", false);
      return false;
   }
'@
Insert-AfterLineInFunction 'bool MarketLocationEntryAllowed(int direction, bool fastRevalidation)' '   RefreshMarketContext(false);' $locationGate 'double brainV8SwingExtension' 'M1/M5 zone and 0.8-0.95 ATR anti-chase gates'

$contrarianGate = @'
   rawDirection = BrainV8ApplyContrarianPolicy(rawDirection, momentum);
'@
Insert-AfterLineInFunction 'int AdaptiveEntryDirection(double momentum)' '   rawDirection = ApplyLocalExtremeDecision(rawDirection,momentum);' $contrarianGate 'BrainV8ApplyContrarianPolicy(rawDirection, momentum)' 'strong-down no-sell contrarian-buy policy'

$entryGate = @'
   if(!BrainV8PullbackConfirmationReady(rawDirection, momentum))
   {
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   if(!BrainV8QualityGate(rawDirection, momentum))
   {
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

'@
Insert-BeforeInFunction 'int AdaptiveEntryDirection(double momentum)' '   // Confidence remains visible for diagnostics and backtests, but Market' $entryGate 'BrainV8PullbackConfirmationReady(rawDirection, momentum)' 'mandatory pullback confidence structure entry gate'

Replace-Required '   // Confidence remains visible for diagnostics and backtests, but Market' '   // Brain V8: confidence is a mandatory execution gate and remains visible for audit.' 'confidence policy comment 1'
Replace-Required '   // Cycle V2 never uses it as a hard gate. Execution is controlled by setup' '   // DynamicConfidenceThreshold remains visible as the effective threshold.' 'confidence policy comment 2'
Replace-Required '   // state, direction lock and terminal safety instead.' '   // Pullback + Structure gates are enforced immediately above.' 'confidence policy comment 3'

$addGate = @'
   string brainV8AddReason = "NONE";
   if(count > 0 && BrainV8BasketAdverseMove(direction, brainV8AddReason))
   {
      g_adaptiveBlockReason = brainV8AddReason;
      return false;
   }
'@
Insert-AfterLineInFunction 'bool AdaptiveBasketAddAllowed(int direction)' '   int count = BasketPositionCount();' $addGate 'string brainV8AddReason = "NONE";' 'stop adding when price turns adverse'

$ladderGate = @'
   string brainV8LadderReason = "NONE";
   if(BrainV8BasketAdverseMove(direction, brainV8LadderReason))
   {
      g_fillBlockReason = brainV8LadderReason;
      g_ladderMode = "ADVERSE_STOP";
      return false;
   }
'@
Insert-AfterLineInFunction 'bool BasketLadderReady(int direction, int count, int targetPositions)' '   g_fillBlockReason = "NONE";' $ladderGate 'string brainV8LadderReason = "NONE";' 'hard stop ladder adds on adverse move'

$reversalGate = @'
      if(!tacticalBasket && BrainV8HandleBasketReversal(momentum))
         return;

'@
Insert-BeforeInFunction 'void OnTick()' '      bool rescueManaging = tacticalBasket ? false : ManageAdaptiveRescue();' $reversalGate 'BrainV8HandleBasketReversal(momentum)' 'close old Basket on confirmed reversal'

Replace-Required '   // Confidence is retained as a quality metric only. It is never an entry gate.' '   // Brain V8: Confidence + Structure are mandatory hard gates for every new Basket.' 'unified confidence policy'

$unifiedGate = @'
   g_confidenceGateEnabled = true;
   g_confidenceThreshold = (int)MathMax(56.0, (double)g_confidenceThreshold);
'@
Insert-AfterLineInFunction 'void ApplyUnifiedTradingEngine()' '   g_confidenceThreshold = 55;' $unifiedGate 'g_confidenceThreshold = (int)MathMax(56.0' 'force hard confidence gate in unified engine'

[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, [System.Text.UTF8Encoding]::new($false))
Write-Host "EA Brain V8 patch complete: $Path"
