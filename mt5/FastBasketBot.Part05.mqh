
bool IndicatorV6TimingReady(int direction)
{
   if(g_indicatorV6Mode<INDICATOR_V6_TIMING || direction==0)
      return true;

   bool multiWeak=
      g_indicatorCompositeScore<40.0 &&
      g_indicatorLocationScore<40.0 &&
      g_indicatorExecutionScore<42.0;
   if(!multiWeak)
   {
      if(MQLInfoInteger(MQL_TESTER) && g_indicatorWaitStartedAt>0)
         g_testIndicatorWaitSecondsSum +=
            MathMax(0.0,(double)(TimeCurrent()-g_indicatorWaitStartedAt));
      g_indicatorWaitStartedAt=0;
      g_indicatorWaitDirection=0;
      g_indicatorWaitReason="NONE";
      return true;
   }

   // Reversal/retest/sweep models already carry location evidence and should
   // never be starved by the optional indicator timing layer.
   bool protectedModel=
      StringFind(g_entryTrigger,"REVERSAL")>=0 ||
      StringFind(g_entryTrigger,"RETEST")>=0 ||
      g_liquidityScore>=65.0 ||
      g_microStructureScore>=75.0;
   if(protectedModel)
   {
      if(MQLInfoInteger(MQL_TESTER) && g_indicatorWaitStartedAt>0)
         g_testIndicatorWaitSecondsSum +=
            MathMax(0.0,(double)(TimeCurrent()-g_indicatorWaitStartedAt));
      g_indicatorWaitStartedAt=0;
      g_indicatorWaitDirection=0;
      g_indicatorWaitReason="PROTECTED_MODEL";
      return true;
   }

   datetime now=TimeCurrent();
   if(g_indicatorWaitStartedAt<=0 || g_indicatorWaitDirection!=direction)
   {
      g_indicatorWaitStartedAt=now;
      g_indicatorWaitDirection=direction;
      g_indicatorWaitReason=g_indicatorWhy;
      if(MQLInfoInteger(MQL_TESTER))
         g_testIndicatorWaitEvents++;
      return false;
   }

   int maxWait=MathMax(5,MathMin(60,InpIndicatorMaxWaitSeconds));
   if(now-g_indicatorWaitStartedAt>=maxWait)
   {
      if(MQLInfoInteger(MQL_TESTER))
         g_testIndicatorWaitSecondsSum +=
            MathMax(0.0,(double)(now-g_indicatorWaitStartedAt));
      g_indicatorWaitStartedAt=0;
      g_indicatorWaitDirection=0;
      g_indicatorWaitReason="BOUNDED_FALLBACK";
      return true;
   }
   return false;
}

void RefreshCycleIndicators()
{
   g_rsiM1 = RsiValue(PERIOD_M1,1);
   g_rsiM5 = RsiValue(PERIOD_M5,1);
   AdxSnapshotAt(PERIOD_M5,1,g_adxM5,g_plusDiM5,g_minusDiM5);
   AdxSnapshotAt(PERIOD_M5,3,g_adxPreviousM5,g_plusDiPreviousM5,g_minusDiPreviousM5);
   g_vwapM5 = SessionVwap(PERIOD_M5,48);
   RefreshIndicatorV6Context();

   MqlTick tick;
   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod) * _Point
   );
   if(SymbolInfoTick(_Symbol,tick) && g_vwapM5 > 0.0)
   {
      double price = (tick.bid+tick.ask)*0.5;
      g_vwapDistanceAtr = (price-g_vwapM5)/MathMax(_Point,atrPrice);
   }
   else
      g_vwapDistanceAtr = 0.0;

   g_rsiDivergenceBuyScore = RsiDivergenceScore(1);
   g_rsiDivergenceSellScore = RsiDivergenceScore(-1);
   g_demandZoneScore = DemandSupplyZoneScore(1);
   g_supplyZoneScore = DemandSupplyZoneScore(-1);
   g_demandZoneQuality = ZoneQualityLabel(g_demandZoneScore);
   g_supplyZoneQuality = ZoneQualityLabel(g_supplyZoneScore);
   // Context-only fields that depend on current Demand/Supply are refreshed
   // after those zones are available.
   UpdateLevelMemory();
}


bool ReversalOpportunityReady(int direction,double momentum,double &scoreOut)
{
   scoreOut = direction > 0 ? g_demandZoneScore : g_supplyZoneScore;
   if(direction == 0 || scoreOut < 52.0)
      return false;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   string lowerState = LowerTimeframeStateForDirection(direction);
   bool m1Turn = RecentDirectionalBody(direction,PERIOD_M1);
   bool m5Support =
      g_trendM5 == direction ||
      RecentDirectionalBody(direction,PERIOD_M5);
   bool emaTurn =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");
   bool momentumTurn = MomentumSupportsDirection(direction,momentum,0.30);
   bool divergence = direction > 0
      ? g_rsiDivergenceBuyScore > 0.0
      : g_rsiDivergenceSellScore > 0.0;

   bool executionConfirmed =
      lowerState != "REVERSAL" &&
      (
         (m1Turn && (m5Support || emaTurn || paScore >= 22.0 || momentumTurn)) ||
         (emaTurn && paScore >= 18.0) ||
         (m5Support && paScore >= 28.0) ||
         (divergence && ExecutionTurningEvent(direction,momentum))
      );

   if(!executionConfirmed)
      return false;

   if(m1Turn) scoreOut += 6.0;
   if(m5Support) scoreOut += 8.0;
   if(emaTurn) scoreOut += 8.0;
   if(momentumTurn) scoreOut += 4.0;
   if(divergence) scoreOut += 6.0;
   if(paScore >= 28.0) scoreOut += 6.0;
   scoreOut = MathMin(100.0,scoreOut);

   // Counter-macro reversal is allowed before H1 flips, but it needs stronger
   // evidence than a same-direction pullback continuation.
   double threshold = g_macroTrendDirection == -direction ? 70.0 : 60.0;
   return scoreOut >= threshold;
}


string MarketCycleStateForDirection(int direction,double momentum)
{
   if(direction == 0)
      return "PULLBACK";

   double reversalScore = 0.0;
   if(ReversalOpportunityReady(direction,momentum,reversalScore))
   {
      g_reversalStatus = direction > 0 ? "REVERSAL_BUY_CONFIRMED" : "REVERSAL_SELL_CONFIRMED";
      return "REVERSAL_CONFIRMED";
   }

   if(g_entryModel == "BREAKOUT" || g_entryTrigger == "NEWS_CONTINUATION")
      return "BREAKOUT";

   if(g_entryModel == "BREAKOUT_RETEST" ||
      g_entryModel == "PULLBACK_RETEST" ||
      g_priceLocationState == "BREAKOUT_RETEST_READY" ||
      g_priceLocationState == "PULLBACK_RETEST_READY")
      return "RETEST";

   string lowerState = LowerTimeframeStateForDirection(direction);
   double adverseZone = direction > 0 ? g_supplyZoneScore : g_demandZoneScore;
   double reversalEvidence = direction > 0
      ? g_rsiDivergenceSellScore
      : g_rsiDivergenceBuyScore;
   double oppositePa = direction > 0 ? g_priceActionSellScore : g_priceActionBuyScore;

   if(adverseZone >= 55.0 &&
      (lowerState == "REVERSAL" || reversalEvidence > 0.0 || oppositePa >= 24.0))
   {
      g_reversalStatus = direction > 0 ? "REVERSAL_SELL_SETUP" : "REVERSAL_BUY_SETUP";
      return "REVERSAL_SETUP";
   }

   double exhaustion=0.0, extensionAtr=0.0, wick=0.0;
   string reason="NONE";
   if(DirectionalExhaustion(direction,exhaustion,extensionAtr,wick,reason))
      return "EXHAUSTION";

   if(lowerState == "PULLBACK" || lowerState == "REVERSAL")
      return "PULLBACK";

   return "TREND_CONTINUATION";
}


void ArmMarketRearm(int direction,string reason)
{
   if(direction == 0)
      return;
   g_marketRearmDirection = direction;
   g_marketRearmAt = TimeCurrent();
   g_marketRearmReason = reason;
}

void ClearMarketRearm()
{
   g_marketRearmDirection = 0;
   g_marketRearmAt = 0;
   g_marketRearmReason = "NONE";
}

bool MarketRearmReady(int direction,double momentum)
{
   if(g_marketRearmDirection == 0 || direction != g_marketRearmDirection)
      return true;

   double reversalScore = 0.0;
   bool zoneTurn = ReversalOpportunityReady(direction,momentum,reversalScore);
   bool freshClosedBody = RecentDirectionalBodyAfter(
      direction,
      PERIOD_M1,
      g_marketRearmAt
   );
   bool liveTurn =
      LowerTimeframeSupportsDirection(direction) &&
      (
         MomentumSupportsDirection(direction,momentum,0.45) ||
         (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
         (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN")
      );

   if(freshClosedBody || liveTurn || zoneTurn)
   {
      ClearMarketRearm();
      return true;
   }
   return false;
}

string LowerTimeframeStateForDirection(int direction)
{
   if(direction == 0)
      return "NEUTRAL";

   bool m1Body = RecentDirectionalBody(direction,PERIOD_M1);
   bool m5Body = RecentDirectionalBody(direction,PERIOD_M5);
   bool oppositeM1Body = RecentDirectionalBody(-direction,PERIOD_M1);
   bool oppositeM5Body = RecentDirectionalBody(-direction,PERIOD_M5);

   if(g_trendM5 == direction)
   {
      if(g_trendM1 == direction || g_trendM1 == 0 || m1Body)
         return "CONFIRMED";
      if(g_trendM1 == -direction && oppositeM1Body)
         return "PULLBACK";
      return "PULLBACK";
   }

   if(g_trendM5 == -direction)
   {
      if(g_trendM1 == -direction || oppositeM5Body)
         return "REVERSAL";
      if(g_trendM1 == direction && m1Body)
         return "PULLBACK";
      return "REVERSAL";
   }

   if(g_trendM1 == direction || m1Body)
      return m5Body ? "CONFIRMED" : "PULLBACK";
   if(g_trendM1 == -direction || oppositeM1Body)
      return "PULLBACK";

   return "NEUTRAL";
}

bool ExecutionTurningEvent(int direction,double momentum)
{
   if(direction == 0)
      return false;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool m1Body = RecentDirectionalBody(direction,PERIOD_M1);
   bool m5Body = RecentDirectionalBody(direction,PERIOD_M5);
   bool emaTurn =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");
   bool momentumTurn = MomentumSupportsDirection(direction,momentum,0.25);

   return (m1Body && (emaTurn || momentumTurn || paScore >= 18.0)) ||
      m5Body || (emaTurn && paScore >= 18.0);
}

bool LowerTimeframeSupportsDirection(int direction)
{
   string state = LowerTimeframeStateForDirection(direction);
   return state == "CONFIRMED";
}


bool HigherTimeframeSupportsDirection(int direction)
{
   int votes = 0;
   if(g_trendM15 == direction) votes++;
   if(g_trendM30 == direction) votes++;
   if(g_trendH1 == direction) votes++;
   return votes >= 2;
}

bool MomentumSupportsDirection(int direction, double momentum, double factor)
{
   double threshold = MathMax(1.0, g_adaptiveMomentumThreshold * factor);
   return direction > 0 ? momentum >= threshold : momentum <= -threshold;
}

int RecentDirectionalRun(int direction, ENUM_TIMEFRAMES timeframe, int bars)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int need = MathMax(2, bars);
   if(CopyRates(_Symbol, timeframe, 1, need, rates) < need)
      return 0;

   int run = 0;
   for(int i = 0; i < need; i++)
   {
      bool same = direction > 0
         ? rates[i].close > rates[i].open
         : rates[i].close < rates[i].open;
      if(!same)
         break;
      run++;
   }
   return run;
}

bool DirectionalExhaustion(
   int direction,
   double &scoreOut,
   double &extensionAtrOut,
   double &wickRatioOut,
   string &reasonOut
)
{
   scoreOut = 0.0;
   extensionAtrOut = 0.0;
   wickRatioOut = 0.0;
   reasonOut = "NONE";

   MqlTick tick;
   if(direction == 0 || !SymbolInfoTick(_Symbol,tick))
      return false;

   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod) * _Point
   );

   double terminalRetracement = 2.0;
   if(g_fibM15Direction == direction)
      terminalRetracement = MathMin(terminalRetracement,g_fibM15Retracement);
   if(g_fibM5Direction == direction)
      terminalRetracement = MathMin(terminalRetracement,g_fibM5Retracement);

   double impulseRange = 0.0;
   if(g_fibDirection == direction && g_fibSwingHigh > g_fibSwingLow)
      impulseRange = g_fibSwingHigh-g_fibSwingLow;
   extensionAtrOut = impulseRange > 0.0
      ? impulseRange/atrPrice*MathMax(0.0,1.0-MathMin(1.0,terminalRetracement))
      : 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,4,rates) >= 4)
   {
      double range = MathMax(_Point,rates[0].high-rates[0].low);
      double lowerWick = MathMin(rates[0].open,rates[0].close)-rates[0].low;
      double upperWick = rates[0].high-MathMax(rates[0].open,rates[0].close);
      wickRatioOut = direction < 0 ? lowerWick/range : upperWick/range;
      if(wickRatioOut >= 0.35) scoreOut += 15.0;
      if(wickRatioOut >= 0.55) scoreOut += 10.0;
   }

   if(terminalRetracement <= 0.236)
   {
      scoreOut += 20.0;
      reasonOut = "FIB_TERMINAL_ZONE";
   }
   if(terminalRetracement <= 0.10)
      scoreOut += 8.0;

   if(extensionAtrOut >= 1.25)
   {
      scoreOut += 14.0;
      if(reasonOut == "NONE") reasonOut = "EXTENDED_IMPULSE";
   }
   if(extensionAtrOut >= 1.80)
      scoreOut += 8.0;

   int run = RecentDirectionalRun(direction,PERIOD_M5,4);
   if(run >= 3) scoreOut += 8.0;

   double adverseZone = direction > 0 ? g_supplyZoneScore : g_demandZoneScore;
   if(adverseZone >= 75.0)
   {
      scoreOut += 18.0;
      reasonOut = direction > 0 ? "STRONG_SUPPLY" : "STRONG_DEMAND";
   }
   if(adverseZone >= 90.0)
      scoreOut += 8.0;

   bool nearTerminalLevel = direction < 0
      ? (g_nearestSupport > 0.0 && price-g_nearestSupport <= atrPrice*0.28)
      : (g_nearestResistance > 0.0 && g_nearestResistance-price <= atrPrice*0.28);
   if(nearTerminalLevel)
   {
      scoreOut += 12.0;
      if(reasonOut == "NONE")
         reasonOut = direction < 0 ? "NEAR_SUPPORT" : "NEAR_RESISTANCE";
   }

   double reversalDivergence = direction < 0
      ? g_rsiDivergenceBuyScore
      : g_rsiDivergenceSellScore;
   if(reversalDivergence > 0.0)
   {
      scoreOut += 10.0;
      if(reasonOut == "NONE") reasonOut = "RSI_DIVERGENCE";
   }

   bool rsiExtended = direction < 0 ? g_rsiM5 <= 32.0 : g_rsiM5 >= 68.0;
   if(rsiExtended) scoreOut += 6.0;

   if(MathAbs(g_vwapDistanceAtr) >= 0.90)
      scoreOut += 6.0;
   if(MathAbs(g_vwapDistanceAtr) >= 1.35)
      scoreOut += 5.0;

   bool adxFading = g_adxPreviousM5 > 0.0 &&
      g_adxM5 > 0.0 &&
      g_adxPreviousM5-g_adxM5 >= 2.5;
   bool directionalDiFading = direction > 0
      ? (g_plusDiPreviousM5 > 0.0 && g_plusDiM5 < g_plusDiPreviousM5*0.88)
      : (g_minusDiPreviousM5 > 0.0 && g_minusDiM5 < g_minusDiPreviousM5*0.88);
   if(adxFading) scoreOut += 7.0;
   if(adxFading && directionalDiFading)
   {
      scoreOut += 7.0;
      if(reasonOut == "NONE") reasonOut = "ADX_DI_EXHAUSTION";
   }

   if(wickRatioOut >= 0.45 && reasonOut == "NONE")
      reasonOut = "ADVERSE_WICK";

   return scoreOut >= 55.0;
}


bool PullbackRetestReady(int direction, double momentum)
{
   bool fibPullback =
      (g_fibM15Direction == direction &&
       g_fibM15Retracement >= 0.236 && g_fibM15Retracement <= 0.786) ||
      (g_fibM5Direction == direction &&
       g_fibM5Retracement >= 0.236 && g_fibM5Retracement <= 0.786);
   bool executionTurn =
      RecentDirectionalBody(direction, PERIOD_M1) ||
      RecentDirectionalBody(direction, PERIOD_M5) ||
      MomentumSupportsDirection(direction, momentum, 0.20);

   if(fibPullback && executionTurn)
      return true;

   // Fallback when an active Fib cannot be formed: demand a measurable pullback
   // from the recent M5 extreme, then a fresh directional execution candle.
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 10, rates) < 10)
      return false;

   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double extreme = direction > 0 ? rates[0].high : rates[0].low;
   for(int i = 1; i < 10; i++)
      extreme = direction > 0 ? MathMax(extreme, rates[i].high) : MathMin(extreme, rates[i].low);

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return false;
   double current = direction > 0 ? tick.bid : tick.ask;
   double pullback = direction > 0 ? extreme - current : current - extreme;

   return pullback >= atrPrice * 0.18 && executionTurn;
}

bool CleanBreakoutImpulse(int direction, double level, double buffer)
{
   if(level <= 0.0)
      return false;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 2, rates) < 2)
      return false;

   double atrPrice = MathMax(
      _Point * 12.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod) * _Point
   );
   double range = MathMax(_Point, rates[0].high - rates[0].low);
   double body = MathAbs(rates[0].close - rates[0].open);
   double bodyRatio = body / range;
   double adverseWick = direction > 0
      ? rates[0].high - MathMax(rates[0].open, rates[0].close)
      : MathMin(rates[0].open, rates[0].close) - rates[0].low;
   double adverseWickRatio = adverseWick / range;
   double closeDistance = MathAbs(rates[0].close - level);

   bool directionalClose = direction > 0
      ? rates[0].close > level + buffer
      : rates[0].close < level - buffer;

   return directionalClose &&
      bodyRatio >= 0.45 &&
      adverseWickRatio <= 0.30 &&
      range <= atrPrice * 1.60 &&
      closeDistance <= atrPrice * 0.80;
}

bool BreakoutRetestConfirmed(int direction, double level, double buffer)
{
   if(level <= 0.0)
      return false;

   ENUM_TIMEFRAMES timeframes[2] = {PERIOD_M1, PERIOD_M5};
   for(int t = 0; t < 2; t++)
   {
      MqlRates rates[];
      ArraySetAsSeries(rates, true);
      if(CopyRates(_Symbol, timeframes[t], 1, 3, rates) < 3)
         continue;

      if(direction > 0)
      {
         bool broke = rates[1].close > level + buffer;
         bool retested = rates[0].low <= level + buffer * 1.5;
         bool held = rates[0].close > level && rates[0].close > rates[0].open;
         if(broke && retested && held)
            return true;
      }
      else
      {
         bool broke = rates[1].close < level - buffer;
         bool retested = rates[0].high >= level - buffer * 1.5;
         bool held = rates[0].close < level && rates[0].close < rates[0].open;
         if(broke && retested && held)
            return true;
      }
   }
   return false;
}

void RegisterAntiChase(
   int direction,
   double score,
   double extensionAtr,
   double wickRatio,
   string reason,
   double referenceLevel,
   bool breakoutRetest
)
{
   if(!g_antiChaseActive || score >= g_exhaustionScore)
   {
      g_antiChaseActive = true;
      g_antiChaseDirection = direction;
      g_exhaustionScore = score;
      g_extensionAtr = extensionAtr;
      g_adverseWickRatio = wickRatio;
      g_antiChaseReason = reason;
      g_breakoutReferenceLevel = referenceLevel;
      g_breakoutRetestRequired = breakoutRetest;
      g_priceLocationState = breakoutRetest ? "WAIT_BREAKOUT_RETEST" : "WAIT_PULLBACK";
   }
}

bool AntiChaseLocationReady(
   int direction,
   double momentum,
   bool breakoutModel,
   double breakoutLevel,
   double breakoutBuffer,
   string &triggerOverride
)
{
   triggerOverride = "NONE";

   double exhaustion = 0.0;
   double extensionAtr = 0.0;
   double adverseWick = 0.0;
   string reason = "NONE";
   bool exhausted = DirectionalExhaustion(
      direction,
      exhaustion,
      extensionAtr,
      adverseWick,
      reason
   );

   if(breakoutModel)
   {
      bool retestReady = BreakoutRetestConfirmed(
         direction,
         breakoutLevel,
         breakoutBuffer
      );
      bool cleanBreak = CleanBreakoutImpulse(
         direction,
         breakoutLevel,
         breakoutBuffer
      );

      if(retestReady)
      {
         g_breakoutRetestReady = true;
         g_breakoutRetestRequired = false;
         g_breakoutReferenceLevel = breakoutLevel;
         g_exhaustionScore = exhaustion;
         g_extensionAtr = extensionAtr;
         g_adverseWickRatio = adverseWick;
         g_priceLocationState = "BREAKOUT_RETEST_READY";
         g_antiChaseReason = "RETEST_CONFIRMED";
         triggerOverride = "BREAKOUT_RETEST";
         return true;
      }

      if(cleanBreak && !exhausted)
      {
         g_breakoutRetestReady = false;
         g_breakoutRetestRequired = false;
         g_breakoutReferenceLevel = breakoutLevel;
         return true;
      }

      RegisterAntiChase(
         direction,
         MathMax(exhaustion, 55.0),
         extensionAtr,
         adverseWick,
         exhausted ? reason : "BREAKOUT_EXTENDED_OR_WICKY",
         breakoutLevel,
         true
      );
      return false;
   }

   if(!exhausted)
      return true;

   if(PullbackRetestReady(direction, momentum))
   {
      g_exhaustionScore = exhaustion;
      g_extensionAtr = extensionAtr;
      g_adverseWickRatio = adverseWick;
      g_priceLocationState = "PULLBACK_RETEST_READY";
      g_antiChaseReason = reason;
      triggerOverride = "PULLBACK_RETEST";
      return true;
   }

   RegisterAntiChase(
      direction,
      exhaustion,
      extensionAtr,
      adverseWick,
      reason,
      0.0,
      false
   );
   return false;
}

bool ExecutionConfirmationReady(
   int direction,
   double momentum,
   bool requireHigherTimeframe
)
{
   bool higher = HigherTimeframeSupportsDirection(direction);
   string lowerState = LowerTimeframeStateForDirection(direction);
   bool microConfirmed = lowerState == "CONFIRMED";
   bool turningEvent = ExecutionTurningEvent(direction,momentum);
   bool emaExecution =
      g_emaTrendM5 == direction ||
      (g_emaTrendM1 == direction && g_emaTrendM15 == direction);
   bool emaMacro =
      g_emaTrendM15 == direction ||
      g_emaTrendM30 == direction ||
      g_emaTrendH1 == direction;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool priceAction = paScore >= 18.0;
   bool emaReclaim =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");
   bool momentumReady = MomentumSupportsDirection(direction,momentum,0.40);

   if(requireHigherTimeframe && !higher)
      return false;

   // A temporary M1 pullback does not flip Macro, but it prevents a fresh
   // entry until a real turning event appears. A lower-TF reversal blocks the
   // continuation path completely.
   if(lowerState == "REVERSAL")
      return false;
   if(lowerState == "PULLBACK" && !turningEvent)
      return false;

   return (microConfirmed || turningEvent) &&
      emaExecution &&
      (emaMacro || higher) &&
      (priceAction || emaReclaim || momentumReady);
}


bool IsTrackedEconomicEventName(string name)
{
   string upper = name;
   StringToUpper(upper);
   return StringFind(upper,"NONFARM") >= 0 ||
      StringFind(upper,"NON-FARM") >= 0 ||
      StringFind(upper,"NFP") >= 0 ||
      StringFind(upper,"CONSUMER PRICE") >= 0 ||
      StringFind(upper,"CPI") >= 0 ||
      StringFind(upper,"FOMC") >= 0 ||
      StringFind(upper,"FEDERAL FUNDS") >= 0 ||
      StringFind(upper,"INTEREST RATE") >= 0 ||
      StringFind(upper,"RATE DECISION") >= 0;
}

void RefreshEconomicCalendarContext()
{
   datetime now = TimeTradeServer();
   if(now <= 0) now = TimeCurrent();
   if(g_lastCalendarRefreshAt > 0 && now-g_lastCalendarRefreshAt < 60)
      return;
   g_lastCalendarRefreshAt = now;
   g_newsCalendarActive = false;
   g_newsEventName = "NONE";
   g_newsEventMinutes = 9999;

   if(MQLInfoInteger(MQL_TESTER))
      return;

   string currency = SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
   if(currency == "")
      currency = "USD";

   MqlCalendarValue values[];
   int count = CalendarValueHistory(values,now-900,now+3600,"",currency);
   if(count <= 0)
      return;

   int nearestAbsMinutes = 1000000;
   for(int i=0;i<count;i++)
   {
      MqlCalendarEvent event;
      if(!CalendarEventById(values[i].event_id,event))
         continue;
      if(event.importance != CALENDAR_IMPORTANCE_HIGH)
         continue;
      if(!IsTrackedEconomicEventName(event.name))
         continue;

      int minutes = (int)MathRound((double)(values[i].time-now)/60.0);
      int absMinutes = MathAbs(minutes);
      if(absMinutes < nearestAbsMinutes)
      {
         nearestAbsMinutes = absMinutes;
         g_newsEventMinutes = minutes;
         g_newsEventName = event.name;
      }
   }

   // Calendar is context only. Price action still decides direction and entry.
   g_newsCalendarActive = nearestAbsMinutes <= 60;
}

void RefreshNewsMode(double momentum)
{
   RefreshEconomicCalendarContext();

   bool newsContext = g_newsCalendarActive || g_marketRegime == "HIGH_VOLATILITY";
   if(!newsContext)
   {
      g_newsMode = "NORMAL";
      return;
   }

   int impulseDirection = momentum > 0.0 ? 1 : momentum < 0.0 ? -1 : 0;
   if(impulseDirection == 0)
   {
      g_newsMode = "NEWS_WAIT_IMPULSE";
      return;
   }

   double ex=0.0, ext=0.0, wick=0.0;
   string exReason="NONE";
   if(DirectionalExhaustion(impulseDirection,ex,ext,wick,exReason))
   {
      g_newsMode = "NEWS_EXHAUSTION";
      return;
   }

   if(g_priceLocationState == "BREAKOUT_RETEST_READY" ||
      g_priceLocationState == "PULLBACK_RETEST_READY" ||
      PullbackRetestReady(impulseDirection,momentum))
   {
      g_newsMode = "NEWS_RETEST";
      return;
   }

   // Do not chase the first live spike. Continuation requires a completed M5
   // directional body or established M5 trend plus execution evidence.
   bool completedImpulse =
      RecentDirectionalBody(impulseDirection,PERIOD_M5) &&
      (g_trendM5 == impulseDirection ||
       g_emaTrendM5 == impulseDirection);
   if(completedImpulse &&
      MomentumSupportsDirection(impulseDirection,momentum,0.55))
   {
      g_newsMode = "NEWS_CONTINUATION";
      return;
   }

   g_newsMode = "NEWS_WAIT_IMPULSE";
}

bool NewsImpulseExecutionReady(int direction,double momentum)
{
   if(g_newsMode == "NORMAL" ||
      g_newsMode == "NEWS_WAIT_IMPULSE" ||
      g_newsMode == "NEWS_EXHAUSTION")
      return false;

   double paScore = direction > 0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool emaAligned = g_emaTrendM5 == direction;
   bool m5Aligned = g_trendM5 == direction;
   string lowerState = LowerTimeframeStateForDirection(direction);
   bool turning = ExecutionTurningEvent(direction,momentum);

   if(g_newsMode == "NEWS_RETEST")
      return turning &&
         lowerState != "REVERSAL" &&
         (emaAligned || m5Aligned || paScore >= 22.0);

   int evidence = 0;
   if(m5Aligned) evidence++;
   if(emaAligned) evidence++;
   if(paScore >= 18.0) evidence++;
   if(lowerState == "CONFIRMED") evidence++;

   return g_newsMode == "NEWS_CONTINUATION" &&
      MomentumSupportsDirection(direction,momentum,0.60) &&
      RecentDirectionalBody(direction,PERIOD_M5) &&
      evidence >= 2;
}


bool DirectSetupReady(
   int direction,
   double momentum,
   string &modelOut,
   double &scoreOut
)
{
   scoreOut = EvaluateMarketLocationScore(direction);
   modelOut = g_entryModel;

   bool microSupport = LowerTimeframeSupportsDirection(direction);
   bool higherSupport = HigherTimeframeSupportsDirection(direction);
   bool lightMomentum = MomentumSupportsDirection(direction, momentum, 0.30);
   bool strongMomentum = MomentumSupportsDirection(
      direction,
      momentum,
      g_marketRegime == "HIGH_VOLATILITY" ? 0.65 : 0.80
   );
   double paScore = direction > 0
      ? g_priceActionBuyScore
      : g_priceActionSellScore;
   bool priceActionReady = paScore >= 18.0;
   bool emaExecution =
      g_emaTrendM5 == direction ||
      (g_emaTrendM1 == direction && g_emaTrendM15 == direction);
   bool emaReclaim =
      (direction > 0 && g_emaReclaimState == "RECLAIM_EMA21_UP") ||
      (direction < 0 && g_emaReclaimState == "LOSE_EMA21_DOWN");

   double atrPrice = MathMax(
      _Point * 20.0,
      AverageTrueRangePoints(PERIOD_M15, g_atrPeriod) * _Point
   );
   double breakoutBuffer = MathMax(_Point * 8.0, atrPrice * 0.18) * 0.18;
   double breakoutLevel = direction > 0 ? g_majorResistance : g_majorSupport;
   string locationTrigger = "NONE";

   // Breakout no longer means "sell/buy immediately". A clean, compact break
   // may execute directly; an extended/wicky break must retest first.
   if(modelOut == "BREAKOUT")
   {
      if(!AntiChaseLocationReady(
         direction,
         momentum,
         true,
         breakoutLevel,
         breakoutBuffer,
         locationTrigger
      ))
         return false;

      if(locationTrigger != "NONE")
         modelOut = locationTrigger;
      return true;
   }

   // All other setups pass through terminal-location awareness. This protects
   // against selling the bottom / buying the top while preserving valid
   // pullback, OB, Fib, level and continuation entries.
   if(!AntiChaseLocationReady(
      direction,
      momentum,
      false,
      0.0,
      0.0,
      locationTrigger
   ))
      return false;

   if(locationTrigger != "NONE")
      modelOut = locationTrigger;

   if(modelOut == "PULLBACK_RETEST")
      return microSupport &&
         emaExecution &&
         (priceActionReady || emaReclaim || lightMomentum);

   // Pullback/reaction models already have a real location thesis. They still
   // need a fresh execution turn so an old OB/Fib level cannot trigger by itself.
   if(g_entryModel == "OB_FIB_PULLBACK" ||
      g_entryModel == "ORDER_BLOCK_PULLBACK" ||
      g_entryModel == "FIB_PULLBACK" ||
      g_entryModel == "LEVEL_REACTION")
      return microSupport &&
         (priceActionReady || emaReclaim || lightMomentum);

   if(g_entryModel == "CONTINUATION")
      return ExecutionConfirmationReady(direction,momentum,true);

   if(g_marketRegime == "HIGH_VOLATILITY" &&
      NewsImpulseExecutionReady(direction,momentum))
      return true;

   if(g_entryModel == "CAUTION_ZONE")
      return strongMomentum &&
         microSupport &&
         higherSupport &&
         emaExecution &&
         priceActionReady;

   // No bare trend/momentum fallback here. If there is no identifiable setup
   // and no confirmed execution event, the engine waits for the next event.
   return false;
}

int SetupFirstDirection(double momentum)
{
   g_entryTrigger = "NONE";
   g_reversalStatus = "NONE";
   g_antiChaseActive = false;
   g_antiChaseDirection = 0;
   g_exhaustionScore = 0.0;
   g_extensionAtr = 0.0;
   g_adverseWickRatio = 0.0;
   g_priceLocationState = "NORMAL";
   g_antiChaseReason = "NONE";
   g_breakoutRetestRequired = false;
   g_breakoutRetestReady = false;
   g_breakoutReferenceLevel = 0.0;

   if(g_entryMode == ENTRY_BUY_ONLY || g_entryMode == ENTRY_SELL_ONLY)
   {
      int fixedDirection = g_entryMode == ENTRY_BUY_ONLY ? 1 : -1;
      string lowerState = LowerTimeframeStateForDirection(fixedDirection);
      g_lowerTimeframeState = lowerState;
      string fixedModel = "NONE";
      double fixedScore = 0.0;

      if(lowerState != "REVERSAL" &&
         DirectSetupReady(fixedDirection,momentum,fixedModel,fixedScore))
      {
         EvaluateMarketLocationScore(fixedDirection);
         g_entryTrigger = fixedModel != "NONE" ? fixedModel : g_entryModel;
         return fixedDirection;
      }

      if(lowerState != "REVERSAL" &&
         ExecutionConfirmationReady(fixedDirection,momentum,false))
      {
         string locationTrigger = "NONE";
         if(AntiChaseLocationReady(
            fixedDirection,momentum,false,0.0,0.0,locationTrigger))
         {
            EvaluateMarketLocationScore(fixedDirection);
            g_entryTrigger = locationTrigger != "NONE"
               ? locationTrigger : "STRUCTURE_EXECUTION";
            return fixedDirection;
         }
      }
      return 0;
   }

   string buyModel="NONE", sellModel="NONE";
   double buyScore=0.0, sellScore=0.0;
   bool buyReady = DirectSetupReady(1,momentum,buyModel,buyScore);
   bool sellReady = DirectSetupReady(-1,momentum,sellModel,sellScore);

   int chosen=0;
   string chosenModel="NONE";
   if(buyReady && !sellReady)
   {
      chosen=1; chosenModel=buyModel;
   }
   else if(sellReady && !buyReady)
   {
      chosen=-1; chosenModel=sellModel;
   }
   else if(buyReady && sellReady)
   {
      if(MathAbs(buyScore-sellScore) >= 4.0)
         chosen = buyScore > sellScore ? 1 : -1;
      else if(momentum > 0.0)
         chosen = 1;
      else if(momentum < 0.0)
         chosen = -1;
      else if(g_macroTrendDirection != 0)
         chosen = g_macroTrendDirection;
      else
         chosen = buyScore >= sellScore ? 1 : -1;
      chosenModel = chosen > 0 ? buyModel : sellModel;
   }

   // Reversal Engine: H1 does not have to flip first. A quality Demand/Supply
   // zone plus M1/M5/EMA/PA turning evidence can override late continuation.
   if(g_macroTrendDirection != 0)
   {
      int reversalDirection = -g_macroTrendDirection;
      double reversalScore=0.0;
      if(ReversalOpportunityReady(reversalDirection,momentum,reversalScore) &&
         (chosen == 0 || chosen == g_macroTrendDirection))
      {
         chosen = reversalDirection;
         chosenModel = reversalDirection > 0 ? "REVERSAL_BUY" : "REVERSAL_SELL";
         g_reversalOpportunityDirection = reversalDirection;
         g_reversalOpportunityScore = reversalScore;
         g_reversalStatus = reversalDirection > 0
            ? "REVERSAL_BUY_CONFIRMED"
            : "REVERSAL_SELL_CONFIRMED";
      }
   }

   // Macro is context only. It can continue only after execution timing agrees;
   // a strong lower-TF reversal can never be overridden by H1/M30/M15.
   if(chosen == 0 && g_macroTrendDirection != 0)
   {
      string macroLower = LowerTimeframeStateForDirection(g_macroTrendDirection);
      if(macroLower != "REVERSAL" &&
         ExecutionConfirmationReady(g_macroTrendDirection,momentum,true))
      {
         string locationTrigger="NONE";
         if(AntiChaseLocationReady(
            g_macroTrendDirection,momentum,false,0.0,0.0,locationTrigger))
         {
            chosen = g_macroTrendDirection;
            chosenModel = locationTrigger != "NONE"
               ? locationTrigger : "STRUCTURE_EXECUTION";
         }
      }
   }

   if(chosen == 0 &&
      (g_newsCalendarActive || g_marketRegime == "HIGH_VOLATILITY"))
   {
      int momentumDirection = momentum > 0.0 ? 1 : momentum < 0.0 ? -1 : 0;
      if(momentumDirection != 0 &&
         NewsImpulseExecutionReady(momentumDirection,momentum))
      {
         string locationTrigger="NONE";
         if(AntiChaseLocationReady(
            momentumDirection,momentum,false,0.0,0.0,locationTrigger))
         {
            chosen=momentumDirection;
            chosenModel = locationTrigger != "NONE"
               ? locationTrigger
               : (g_newsMode == "NEWS_RETEST" ? "NEWS_RETEST" : "NEWS_CONTINUATION");
         }
      }
   }

   if(chosen != 0)
   {
      g_lowerTimeframeState = LowerTimeframeStateForDirection(chosen);

      if(g_antiChaseActive && g_antiChaseDirection != chosen)
      {
         g_antiChaseActive=false;
         g_antiChaseDirection=0;
         g_exhaustionScore=0.0;
         g_extensionAtr=0.0;
         g_adverseWickRatio=0.0;
         g_antiChaseReason="NONE";
         g_breakoutRetestRequired=false;
         g_breakoutRetestReady=false;
         g_breakoutReferenceLevel=0.0;
         g_priceLocationState =
            (chosenModel=="PULLBACK_RETEST" || chosenModel=="BREAKOUT_RETEST")
            ? "RETEST_READY" : "NORMAL";
      }

      if(!g_antiChaseActive)
      {
         if(chosenModel=="BREAKOUT_RETEST" || chosenModel=="NEWS_RETEST")
            g_priceLocationState="BREAKOUT_RETEST_READY";
         else if(chosenModel=="PULLBACK_RETEST")
            g_priceLocationState="PULLBACK_RETEST_READY";
         else
         {
            g_priceLocationState="NORMAL";
            g_exhaustionScore=0.0;
            g_extensionAtr=0.0;
            g_adverseWickRatio=0.0;
            g_antiChaseReason="NONE";
            g_breakoutRetestRequired=false;
            g_breakoutRetestReady=false;
            g_breakoutReferenceLevel=0.0;
         }
      }

      EvaluateMarketLocationScore(chosen);
      g_entryTrigger = chosenModel != "NONE" ? chosenModel : g_entryModel;
      g_marketCycleState = MarketCycleStateForDirection(chosen,momentum);
   }
   else
   {
      int contextDirection = g_macroTrendDirection != 0
         ? g_macroTrendDirection
         : (momentum > 0.0 ? 1 : momentum < 0.0 ? -1 : 0);
      g_lowerTimeframeState = LowerTimeframeStateForDirection(contextDirection);
      g_marketCycleState = MarketCycleStateForDirection(contextDirection,momentum);
   }

   return chosen;
}



double EvaluateMarketLocationScore(int direction)
{
   RefreshMarketContext(false);
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return 0.0;
   double price = (tick.bid + tick.ask) * 0.5;
   double atrPrice = MathMax(_Point * 20.0, AverageTrueRangePoints(PERIOD_M15, g_atrPeriod) * _Point);
   double nearBuffer = MathMax(_Point * 8.0, atrPrice * 0.18);

   g_structureScore = 18.0;
   if(g_trendM1 == direction) g_structureScore += 5.0;
   else if(g_trendM1 == -direction) g_structureScore -= 2.25;
   if(g_trendM5 == direction) g_structureScore += 8.0;
   else if(g_trendM5 == -direction) g_structureScore -= 3.60;
   if(g_trendM15 == direction) g_structureScore += 12.0;
   else if(g_trendM15 == -direction) g_structureScore -= 5.40;
   if(g_trendM30 == direction) g_structureScore += 12.0;
   else if(g_trendM30 == -direction) g_structureScore -= 5.40;
   if(g_trendH1 == direction) g_structureScore += 15.0;
   else if(g_trendH1 == -direction) g_structureScore -= 6.75;
   g_structureScore = MathMax(0.0, MathMin(52.0, g_structureScore));

   g_locationScore = 8.0;
   bool nearSupport = direction > 0 && g_nearestSupport > 0.0 &&
                       price - g_nearestSupport <= nearBuffer;
   bool nearResistance = direction < 0 && g_nearestResistance > 0.0 &&
                         g_nearestResistance - price <= nearBuffer;
   bool inOrderBlock = direction > 0
      ? PriceInsideOrNearZone(price, g_bullishOrderBlockLow, g_bullishOrderBlockHigh, nearBuffer * 0.35)
      : PriceInsideOrNearZone(price, g_bearishOrderBlockLow, g_bearishOrderBlockHigh, nearBuffer * 0.35);
   double desiredLevelStrength = direction > 0 ? g_supportStrength : g_resistanceStrength;
   double desiredObStrength = direction > 0 ? g_bullishOrderBlockStrength : g_bearishOrderBlockStrength;
   double desiredObQuality = direction > 0 ? g_bullishOrderBlockQuality : g_bearishOrderBlockQuality;
   double desiredObLow = direction > 0 ? g_bullishOrderBlockLow : g_bearishOrderBlockLow;
   double desiredObHigh = direction > 0 ? g_bullishOrderBlockHigh : g_bearishOrderBlockHigh;

   double fibM5Score = FibonacciSetupScore(
      direction, g_fibM5Direction, g_fibM5Retracement, g_fibM5Strength);
   double fibM15Score = FibonacciSetupScore(
      direction, g_fibM15Direction, g_fibM15Retracement, g_fibM15Strength);
   g_fibConfluenceScore = MathMax(fibM5Score, fibM15Score);
   if(fibM5Score > 0.0 && fibM15Score > 0.0 &&
      g_fibM5Direction == g_fibM15Direction)
      g_fibConfluenceScore = MathMin(22.0,
         g_fibConfluenceScore + MathMin(fibM5Score, fibM15Score) * 0.45 + 3.0);
   bool fibConfluence = g_fibConfluenceScore > 0.0;

   // Fibonacci Setup Scoring v2: normalized 0-100 quality. This score is
   // advisory and never becomes a standalone entry permission.
   double primaryRetracement = direction == g_fibM15Direction
      ? g_fibM15Retracement
      : direction == g_fibM5Direction ? g_fibM5Retracement : 0.0;
   double primaryFibStrength = direction == g_fibM15Direction
      ? g_fibM15Strength
      : direction == g_fibM5Direction ? g_fibM5Strength : 0.0;
   g_fibSetupScore = 0.0;
   if(primaryRetracement >= 0.382 && primaryRetracement <= 0.786)
   {
      g_fibSetupScore = 22.0 + MathMin(20.0, primaryFibStrength * 0.20);
      if(primaryRetracement >= 0.500 && primaryRetracement <= 0.705)
         g_fibSetupScore += 18.0;
      if(MathAbs(primaryRetracement - 0.618) <= 0.050)
         g_fibSetupScore += 12.0;
      else if(MathAbs(primaryRetracement - 0.705) <= 0.045)
         g_fibSetupScore += 8.0;
   }
   if(fibM5Score > 0.0 && fibM15Score > 0.0 &&
      g_fibM5Direction == direction && g_fibM15Direction == direction)
      g_fibSetupScore += 15.0;
   if(inOrderBlock) g_fibSetupScore += MathMin(8.0, desiredObQuality * 0.08);
   if(nearSupport || nearResistance) g_fibSetupScore += MathMin(7.0, desiredLevelStrength * 0.07);
   g_fibSetupScore = MathMax(0.0, MathMin(100.0, g_fibSetupScore));
   g_fibSetupGrade = g_fibSetupScore >= 80.0 ? "A" :
                     g_fibSetupScore >= 60.0 ? "B" :
                     g_fibSetupScore > 0.0 ? "C" : "NONE";

   int confluenceCount = 0;
   if(nearSupport || nearResistance)
   {
      g_locationScore += 4.0 + desiredLevelStrength * 0.10;
      confluenceCount++;
   }
   if(inOrderBlock)
   {
      g_locationScore += 4.0 + desiredObStrength * 0.10;
      confluenceCount++;
   }
   if(fibConfluence)
   {
      g_locationScore += g_fibConfluenceScore;
      confluenceCount++;
   }
   if(RecentDirectionalRejection(direction, desiredObLow, desiredObHigh, nearBuffer * 0.25))
      g_locationScore += 7.0;
   if(confluenceCount >= 2)
      g_locationScore += 6.0;

   double breakoutLevel = direction > 0 ? g_majorResistance : g_majorSupport;
   bool breakout = ConfirmedLevelBreak(direction, breakoutLevel, nearBuffer * 0.18);
   if(breakout)
      g_locationScore += 12.0;

   // Opposing areas reduce confidence but never become a hidden hard block.
   bool nearOpposingLevel = direction > 0
      ? (g_majorResistance > price && g_majorResistance - price <= nearBuffer)
      : (g_majorSupport > 0.0 && price > g_majorSupport && price - g_majorSupport <= nearBuffer);
   bool inOpposingOrderBlock = direction > 0
      ? PriceInsideOrNearZone(price, g_bearishOrderBlockLow, g_bearishOrderBlockHigh, nearBuffer * 0.25)
      : PriceInsideOrNearZone(price, g_bullishOrderBlockLow, g_bullishOrderBlockHigh, nearBuffer * 0.25);
   double opposingObStrength = direction > 0 ? g_bearishOrderBlockStrength : g_bullishOrderBlockStrength;
   if(nearOpposingLevel && !breakout)
      g_locationScore -= 12.0;
   if(inOpposingOrderBlock)
      g_locationScore -= 6.0 + opposingObStrength * 0.06;

   if(inOrderBlock && fibConfluence)
      g_entryModel = "OB_FIB_PULLBACK";
   else if(inOrderBlock)
      g_entryModel = "ORDER_BLOCK_PULLBACK";
   else if(fibConfluence)
      g_entryModel = "FIB_PULLBACK";
   else if(nearSupport || nearResistance)
      g_entryModel = "LEVEL_REACTION";
   else if(breakout)
      g_entryModel = "BREAKOUT";
   else if(nearOpposingLevel || inOpposingOrderBlock)
      g_entryModel = "CAUTION_ZONE";
   else
      g_entryModel = "CONTINUATION";

   g_locationScore = MathMax(0.0, MathMin(48.0, g_locationScore));
   g_entryScore = MathMax(0.0, MathMin(100.0, g_structureScore + g_locationScore));

   // Entry Quality A/B/C is a readable quality label, not a gate.
   double setupBonus =
      g_entryModel == "OB_FIB_PULLBACK" ? 10.0 :
      g_entryModel == "BREAKOUT" ? 8.0 :
      g_entryModel == "ORDER_BLOCK_PULLBACK" ? 7.0 :
      g_entryModel == "FIB_PULLBACK" ? 6.0 :
      g_entryModel == "LEVEL_REACTION" ? 5.0 : 2.0;
   double emaQuality = direction > 0
      ? g_emaConfluenceScoreBuy
      : g_emaConfluenceScoreSell;
   double priceActionQuality = direction > 0
      ? g_priceActionBuyScore
      : g_priceActionSellScore;

   g_entryQualityScore =
      g_entryScore * 0.45 +
      g_fibSetupScore * 0.18 +
      desiredObQuality * 0.12 +
      emaQuality * 0.12 +
      MathMin(100.0,priceActionQuality*2.0) * 0.08 +
      setupBonus;
   if(HigherTimeframeSupportsDirection(direction))
      g_entryQualityScore += 5.0;
   g_entryQualityScore = MathMax(0.0, MathMin(100.0, g_entryQualityScore));
   g_entryQuality = g_entryQualityScore >= 75.0 ? "A" :
                    g_entryQualityScore >= 55.0 ? "B" : "C";
   return g_entryScore;
}

double SpaceToTargetAtr(int direction)
{
   MqlTick tick;
   if(direction == 0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   double price = (tick.bid+tick.ask)*0.5;
   double atrPrice = MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double target = 0.0;

   if(direction > 0)
   {
      if(g_nearestResistance > price)
         target = g_nearestResistance;
      if(g_supplyZoneLow > price && (target <= 0.0 || g_supplyZoneLow < target))
         target = g_supplyZoneLow;
   }
   else
   {
      if(g_nearestSupport > 0.0 && g_nearestSupport < price)
         target = g_nearestSupport;
      if(g_demandZoneHigh > 0.0 && g_demandZoneHigh < price &&
         (target <= 0.0 || g_demandZoneHigh > target))
         target = g_demandZoneHigh;
   }

   if(target <= 0.0)
      return 99.0;
   return MathAbs(target-price)/MathMax(_Point,atrPrice);
}


double LiquiditySweepScore(int direction,string &stateOut)
{
   stateOut="NONE";
   if(direction==0)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M1,1,8,rates)<8)
      return 0.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double reference=direction>0 ? rates[1].low : rates[1].high;
   int equalTouches=0;
   for(int i=2;i<=6;i++)
   {
      if(direction>0)
         reference=MathMin(reference,rates[i].low);
      else
         reference=MathMax(reference,rates[i].high);
   }
   for(int i=1;i<=6;i++)
   {
      double p=direction>0 ? rates[i].low : rates[i].high;
      if(MathAbs(p-reference)<=atrPrice*0.08)
         equalTouches++;
   }

   double range=MathMax(_Point,rates[0].high-rates[0].low);
   double lowerWick=MathMin(rates[0].open,rates[0].close)-rates[0].low;
   double upperWick=rates[0].high-MathMax(rates[0].open,rates[0].close);
   double rejection=direction>0 ? lowerWick/range : upperWick/range;
   bool swept=direction>0
      ? rates[0].low<reference-atrPrice*0.02 && rates[0].close>reference
      : rates[0].high>reference+atrPrice*0.02 && rates[0].close<reference;

   double score=0.0;
   if(swept)
   {
      score=62.0;
      if(rejection>=0.35) score+=12.0;
      if(rejection>=0.50) score+=8.0;
      if(equalTouches>=2) score+=10.0;
      stateOut=direction>0 ? "SELL_SIDE_LIQUIDITY_SWEEP" : "BUY_SIDE_LIQUIDITY_SWEEP";
   }
   else
   {
      MqlTick tick;
      if(SymbolInfoTick(_Symbol,tick))
      {
         double price=(tick.bid+tick.ask)*0.5;
         double distance=MathAbs(price-reference)/MathMax(_Point,atrPrice);
         if(distance<=0.18)
         {
            score=22.0;
            stateOut=direction>0 ? "NEAR_SELL_SIDE_LIQUIDITY" : "NEAR_BUY_SIDE_LIQUIDITY";
         }
      }
   }

   // A matching M5 rejection increases quality, but M5 confirmation is never
   // mandatory for a liquidity signal.
   MqlRates m5[];
   ArraySetAsSeries(m5,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,2,m5)>=2)
   {
      double r=MathMax(_Point,m5[0].high-m5[0].low);
      double wick=direction>0
         ? (MathMin(m5[0].open,m5[0].close)-m5[0].low)/r
         : (m5[0].high-MathMax(m5[0].open,m5[0].close))/r;
      if(wick>=0.35)
         score+=8.0;
   }
   return MathMax(0.0,MathMin(100.0,score));
}

double MicroStructureScore(int direction,string &stateOut)
{
   stateOut="NEUTRAL";
   if(direction==0)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M1,1,7,rates)<7)
      return 0.0;

   double priorHigh=rates[1].high;
   double priorLow=rates[1].low;
   for(int i=2;i<=5;i++)
   {
      priorHigh=MathMax(priorHigh,rates[i].high);
      priorLow=MathMin(priorLow,rates[i].low);
   }

   double range=MathMax(_Point,rates[0].high-rates[0].low);
   double body=MathAbs(rates[0].close-rates[0].open);
   bool directionalBody=body>=range*0.28 &&
      (direction>0 ? rates[0].close>rates[0].open : rates[0].close<rates[0].open);
   bool bos=direction>0
      ? directionalBody && rates[0].close>priorHigh
      : directionalBody && rates[0].close<priorLow;

   double score=0.0;
   if(bos)
   {
      bool counterBefore=g_trendM1==-direction || g_trendM5==-direction;
      score=counterBefore ? 86.0 : 76.0;
      stateOut=counterBefore
         ? (direction>0 ? "CHOCH_UP" : "CHOCH_DOWN")
         : (direction>0 ? "MICRO_BOS_UP" : "MICRO_BOS_DOWN");
   }
   else
   {
      bool reclaim=direction>0
         ? directionalBody && rates[0].close>rates[1].high
         : directionalBody && rates[0].close<rates[1].low;
      if(reclaim)
      {
         score=56.0;
         stateOut=direction>0 ? "MICRO_RECLAIM_UP" : "MICRO_RECLAIM_DOWN";
      }
      else if(RecentDirectionalBody(direction,PERIOD_M1))
      {
         score=28.0;
         stateOut=direction>0 ? "MICRO_BODY_UP" : "MICRO_BODY_DOWN";
      }
   }

   if(RecentDirectionalBody(direction,PERIOD_M5))
      score+=8.0;
   return MathMax(0.0,MathMin(100.0,score));
}

double FairValueGapScore(int direction,string &stateOut)
{
   stateOut="NONE";
   if(direction==0)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M1,1,10,rates)<10)
      return 0.0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0.0;
   double price=(tick.bid+tick.ask)*0.5;
   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );

   double best=0.0;
   for(int i=0;i<=6;i++)
   {
      double gapLow=0.0,gapHigh=0.0;
      bool gap=false;
      if(direction>0 && rates[i].low>rates[i+2].high)
      {
         gapLow=rates[i+2].high;
         gapHigh=rates[i].low;
         gap=true;
      }
      else if(direction<0 && rates[i].high<rates[i+2].low)
      {
         gapLow=rates[i].high;
         gapHigh=rates[i+2].low;
         gap=true;
      }
      if(!gap)
         continue;

      double gapAtr=(gapHigh-gapLow)/MathMax(_Point,atrPrice);
      if(gapAtr<0.03)
         continue;

      bool retest=price>=gapLow-atrPrice*0.05 &&
                  price<=gapHigh+atrPrice*0.05;
      double center=(gapLow+gapHigh)*0.5;
      double distance=MathAbs(price-center)/MathMax(_Point,atrPrice);
      double score=retest
         ? MathMin(82.0,52.0+gapAtr*80.0)
         : (distance<=0.35 ? MathMin(45.0,20.0+gapAtr*55.0) : 0.0);
      if(score>best)
      {
         best=score;
         stateOut=retest
            ? (direction>0 ? "FVG_RETEST_BUY" : "FVG_RETEST_SELL")
            : (direction>0 ? "FVG_NEAR_BUY" : "FVG_NEAR_SELL");
      }
   }
   return MathMax(0.0,MathMin(100.0,best));
}

double EntryDistanceFromValueAtr(int direction)
{
   MqlTick tick;
   if(direction==0 || !SymbolInfoTick(_Symbol,tick))
      return 0.0;

   double price=direction>0 ? tick.ask : tick.bid;
   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double reference=0.0;
   if(direction>0)
   {
      reference=ClosestBelow(price,g_demandZoneHigh,g_nearestSupport,g_ema21);
      reference=ClosestBelow(price,reference,g_vwapM5,0.0);
      if(reference<=0.0)
         return 0.0;
      return MathMax(0.0,(price-reference)/MathMax(_Point,atrPrice));
   }

   reference=ClosestAbove(price,g_supplyZoneLow,g_nearestResistance,g_ema21);
   reference=ClosestAbove(price,reference,g_vwapM5,0.0);
   if(reference<=0.0)
      return 0.0;
   return MathMax(0.0,(reference-price)/MathMax(_Point,atrPrice));
}

void RefreshEntryPrecisionIntelligence(int direction,double momentum)
{
   if(direction==0)
   {
      g_entryPrecisionState="LEGACY";
      g_entryPrecisionReason="NO_DIRECTION";
      g_entryPrecisionScore=50.0;
      return;
   }

   g_liquidityScore=LiquiditySweepScore(direction,g_liquidityState);
   g_microStructureScore=MicroStructureScore(direction,g_microStructureState);
   g_fvgScore=FairValueGapScore(direction,g_fvgState);
   g_entryDistanceAtr=EntryDistanceFromValueAtr(direction);
   g_spaceToTargetAtr=SpaceToTargetAtr(direction);
   g_expectedMoveAtr=MathMin(4.0,MathMax(0.0,g_spaceToTargetAtr));

   double atrPoints=MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)
   );
   g_executionCostAtr=CurrentSpreadPoints()/MathMax(1.0,atrPoints);
   RefreshIndicatorV6Scores(direction,momentum);

   double zoneScore=direction>0 ? g_demandZoneScore : g_supplyZoneScore;
   double score=50.0;
   score+=g_liquidityScore*0.12;
   score+=g_microStructureScore*0.14;
   score+=g_fvgScore*0.08;
   score+=MathMax(0.0,zoneScore-50.0)*0.16;
   if(ExecutionTurningEvent(direction,momentum))
      score+=7.0;
   if(g_macroTrendDirection==direction)
      score+=4.0;
   if(g_spaceToTargetAtr>=0.55)
      score+=6.0;
   else if(g_spaceToTargetAtr<=0.18)
      score-=8.0;

   if(g_entryDistanceAtr>=0.45)
      score-=10.0;
   if(g_entryDistanceAtr>=0.80)
      score-=8.0;
   if(g_executionCostAtr>=0.12)
      score-=4.0;

   double exhaustion=0.0,extensionAtr=0.0,wick=0.0;
   string exhaustionReason="NONE";
   if(DirectionalExhaustion(direction,exhaustion,extensionAtr,wick,exhaustionReason))
      score-=MathMin(14.0,6.0+exhaustion*0.08);

   // Setup history is intentionally a small advisory weight. A poor recent
   // sample can never veto a valid trade or reduce Max Positions.
   bool setupHistoryMatches=
      g_setupWinSamples>=12 &&
      g_setupHistoryDirection==direction &&
      g_setupHistoryModel==g_entryModel;
   if(setupHistoryMatches)
      score+=(g_setupEvScore-50.0)*0.16;

   // V6 contributes a bounded family-level soft weight only. SHADOW contributes
   // zero. No individual indicator can block or dominate Entry Precision.
   if(g_indicatorV6Mode>=INDICATOR_V6_SOFT_WEIGHT)
      score+=MathMax(-8.0,MathMin(8.0,(g_indicatorCompositeScore-50.0)*0.16));

   g_entryPrecisionScore=MathMax(0.0,MathMin(100.0,score));
   if(g_entryPrecisionScore>=78.0)
      g_entryPrecisionState="IDEAL_ENTRY";
   else if(g_entryPrecisionScore>=54.0)
      g_entryPrecisionState="ACCEPTABLE_ENTRY";
   else
      g_entryPrecisionState="CHASE_ENTRY";

   if(g_liquidityScore>=65.0)
      g_entryPrecisionReason=g_liquidityState;
   else if(g_microStructureScore>=65.0)
      g_entryPrecisionReason=g_microStructureState;
   else if(g_fvgScore>=52.0)
      g_entryPrecisionReason=g_fvgState;
   else if(g_entryDistanceAtr>=0.45)
      g_entryPrecisionReason="PRICE_EXTENDED_FROM_VALUE";
   else if(g_spaceToTargetAtr<=0.18)
      g_entryPrecisionReason="LIMITED_SPACE_TO_TARGET";
   else
      g_entryPrecisionReason="MULTI_FACTOR_ENTRY";

   // Expected-value score is normalized for comparison/telemetry, not used as
   // a profitability guarantee and never used as a hard entry gate.
   g_setupEvScore=MathMax(0.0,MathMin(100.0,g_setupEvScore));
}


double LocalExtremeRiskScore(int direction,string &stateOut,double &levelOut)
{
   stateOut="NONE";
   levelOut=0.0;
   if(direction==0)
      return 0.0;

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,7,rates)<7)
      return 0.0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double price=(tick.bid+tick.ask)*0.5;
   double priorHigh=rates[1].high;
   double priorLow=rates[1].low;
   for(int i=2;i<=5;i++)
   {
      priorHigh=MathMax(priorHigh,rates[i].high);
      priorLow=MathMin(priorLow,rates[i].low);
   }

   double range=MathMax(_Point,rates[0].high-rates[0].low);
   double upperWick=rates[0].high-MathMax(rates[0].open,rates[0].close);
   double lowerWick=MathMin(rates[0].open,rates[0].close)-rates[0].low;
   double wickRatio=direction>0 ? upperWick/range : lowerWick/range;
   bool oppositeBody=direction>0
      ? rates[0].close<rates[0].open
      : rates[0].close>rates[0].open;

   bool failedBreakout=direction>0
      ? (rates[0].high>priorHigh+atrPrice*0.02 &&
         rates[0].close<priorHigh+atrPrice*0.015)
      : (rates[0].low<priorLow-atrPrice*0.02 &&
         rates[0].close>priorLow-atrPrice*0.015);

   bool nearExtreme=direction>0
      ? price>=priorHigh-atrPrice*0.22
      : price<=priorLow+atrPrice*0.22;

   double adverseZone=direction>0 ? g_supplyZoneScore : g_demandZoneScore;
   bool nearAdverseZone=direction>0
      ? (g_supplyZoneLow>0.0 &&
         g_supplyZoneLow-price<=atrPrice*0.30 &&
         g_supplyZoneHigh>=price-atrPrice*0.10)
      : (g_demandZoneHigh>0.0 &&
         price-g_demandZoneHigh<=atrPrice*0.30 &&
         g_demandZoneLow<=price+atrPrice*0.10);

   string lowerState=LowerTimeframeStateForDirection(direction);
   double score=0.0;
   if(nearExtreme) score+=24.0;
   if(failedBreakout) score+=36.0;
   if(wickRatio>=0.32) score+=12.0;
   if(wickRatio>=0.50) score+=8.0;
   if(oppositeBody) score+=10.0;
   if(lowerState=="PULLBACK") score+=7.0;
   if(lowerState=="REVERSAL") score+=18.0;
   if(adverseZone>=70.0 && nearAdverseZone) score+=12.0;

   double exhaustion=0.0,extensionAtr=0.0,adverseWick=0.0;
   string exhaustionReason="NONE";
   if(DirectionalExhaustion(
      direction,exhaustion,extensionAtr,adverseWick,exhaustionReason))
      score+=MathMin(14.0,6.0+exhaustion*0.08);

   levelOut=direction>0 ? priorHigh : priorLow;
   if(failedBreakout)
      stateOut=direction>0 ? "FAILED_BREAKOUT_TOP" : "FAILED_BREAKOUT_BOTTOM";
   else if(nearExtreme && wickRatio>=0.32 && oppositeBody)
      stateOut=direction>0 ? "TOP_REJECTION" : "BOTTOM_REJECTION";
   else if(nearExtreme)
      stateOut=direction>0 ? "LOCAL_TOP_RISK" : "LOCAL_BOTTOM_RISK";

   return MathMax(0.0,MathMin(100.0,score));
}

bool BreakoutHoldConfirmed(int direction,double referenceLevel)
{
   if(direction==0 || referenceLevel<=0.0)
      return false;

   MqlRates m5[];
   ArraySetAsSeries(m5,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,2,m5)<2)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double price=(tick.bid+tick.ask)*0.5;
   double range=MathMax(_Point,m5[0].high-m5[0].low);
   double body=MathAbs(m5[0].close-m5[0].open);
   bool directionalBody=body>=range*0.30 &&
      (direction>0 ? m5[0].close>m5[0].open : m5[0].close<m5[0].open);
   bool closedThrough=direction>0
      ? m5[0].close>referenceLevel+atrPrice*0.04
      : m5[0].close<referenceLevel-atrPrice*0.04;
   bool holding=direction>0
      ? price>=referenceLevel-atrPrice*0.03
      : price<=referenceLevel+atrPrice*0.03;

   string microState="NEUTRAL";
   double micro=MicroStructureScore(direction,microState);
   bool executionSupport=
      micro>=45.0 ||
      RecentDirectionalBody(direction,PERIOD_M1) ||
      ExecutionTurningEvent(direction,MomentumPoints());

   return directionalBody && closedThrough && holding && executionSupport;
}
