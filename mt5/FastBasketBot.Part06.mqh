
bool TacticalCountertrendSignal(
   int mainDirection,
   double momentum,
   int &directionOut,
   double &scoreOut,
   string &reasonOut
)
{
   directionOut=0;
   scoreOut=0.0;
   reasonOut="NONE";

   // Respect explicit BUY_ONLY / SELL_ONLY. Tactical opposite entries exist
   // only in AUTO mode, so customer direction settings are never overridden.
   if(g_entryMode!=ENTRY_AUTO_MOMENTUM ||
      mainDirection==0 ||
      g_macroTrendDirection==0 ||
      mainDirection!=g_macroTrendDirection)
      return false;

   string extremeState="NONE";
   double extremeLevel=0.0;
   double extremeScore=LocalExtremeRiskScore(
      mainDirection,extremeState,extremeLevel
   );
   if(extremeScore<68.0 || BreakoutHoldConfirmed(mainDirection,extremeLevel))
      return false;

   int opposite=-mainDirection;
   string microState="NEUTRAL";
   double microScore=MicroStructureScore(opposite,microState);
   string liquidityState="NONE";
   double liquidityScore=LiquiditySweepScore(opposite,liquidityState);
   double paScore=opposite>0 ? g_priceActionBuyScore : g_priceActionSellScore;

   bool oppositeM1=RecentDirectionalBody(opposite,PERIOD_M1);
   bool oppositeM5=RecentDirectionalBody(opposite,PERIOD_M5) ||
                   g_trendM5==opposite;
   bool momentumTurn=MomentumSupportsDirection(opposite,momentum,0.30);
   bool emaTurn=(opposite>0 && g_emaReclaimState=="RECLAIM_EMA21_UP") ||
                (opposite<0 && g_emaReclaimState=="LOSE_EMA21_DOWN");

   int confirmations=0;
   if(oppositeM1) confirmations++;
   if(oppositeM5) confirmations++;
   if(microScore>=55.0) confirmations++;
   if(momentumTurn) confirmations++;
   if(emaTurn) confirmations++;
   if(paScore>=24.0) confirmations++;

   bool structuralFailure=StringFind(extremeState,"FAILED_BREAKOUT")>=0 ||
                          extremeScore>=80.0;
   scoreOut=
      extremeScore*0.50 +
      microScore*0.22 +
      MathMin(100.0,paScore*2.0)*0.12 +
      liquidityScore*0.08 +
      (oppositeM5 ? 6.0 : 0.0) +
      (momentumTurn ? 4.0 : 0.0);
   scoreOut=MathMax(0.0,MathMin(100.0,scoreOut));

   if(!structuralFailure || confirmations<2 || scoreOut<68.0)
      return false;

   directionOut=opposite;
   reasonOut=opposite>0
      ? "TACTICAL_COUNTERTREND_BUY"
      : "TACTICAL_COUNTERTREND_SELL";
   return true;
}

int ApplyLocalExtremeDecision(int rawDirection,double momentum)
{
   g_tacticalCountertrendActive=false;
   g_tacticalCountertrendDirection=0;
   g_tacticalCountertrendScore=0.0;
   g_tacticalCountertrendReason="NONE";
   g_breakoutHoldConfirmed=false;

   int contextDirection=rawDirection!=0
      ? rawDirection
      : g_macroTrendDirection;
   if(contextDirection==0)
   {
      g_localExtremeState="NONE";
      g_localExtremeScore=0.0;
      g_localExtremeLevel=0.0;
      g_failedBreakoutState="NONE";
      return rawDirection;
   }

   // In AUTO, a confirmed counter-macro REVERSAL from V2 is already a proper
   // location trade. Do not let the local-extreme continuation guard cancel it.
   if(g_entryMode==ENTRY_AUTO_MOMENTUM &&
      rawDirection!=0 &&
      g_macroTrendDirection!=0 &&
      rawDirection!=g_macroTrendDirection)
      return rawDirection;

   string state="NONE";
   double level=0.0;
   double risk=LocalExtremeRiskScore(contextDirection,state,level);
   g_localExtremeState=state;
   g_localExtremeScore=risk;
   g_localExtremeLevel=level;
   g_failedBreakoutState=StringFind(state,"FAILED_BREAKOUT")>=0
      ? state : "NONE";

   if(risk<65.0)
   {
      g_localExtremeWaitStartedAt=0;
      return rawDirection;
   }

   if(BreakoutHoldConfirmed(contextDirection,level))
   {
      g_breakoutHoldConfirmed=true;
      g_localExtremeState="BREAKOUT_HOLD_CONFIRMED";
      g_localExtremeWaitStartedAt=0;
      return rawDirection;
   }

   int tacticalDirection=0;
   double tacticalScore=0.0;
   string tacticalReason="NONE";
   if(TacticalCountertrendSignal(
      contextDirection,momentum,tacticalDirection,tacticalScore,tacticalReason))
   {
      g_tacticalCountertrendActive=true;
      g_tacticalCountertrendDirection=tacticalDirection;
      g_tacticalCountertrendScore=tacticalScore;
      g_tacticalCountertrendReason=tacticalReason;
      g_entryTrigger=tacticalReason;
      g_entryModel="TACTICAL_COUNTERTREND";
      g_entryPrecisionState="TACTICAL_ENTRY";
      g_entryPrecisionReason=state;
      g_lowerTimeframeState=LowerTimeframeStateForDirection(tacticalDirection);
      g_marketCycleState="PULLBACK";
      g_localExtremeWaitStartedAt=0;
      return tacticalDirection;
   }

   if(g_localExtremeWaitStartedAt<=0)
      g_localExtremeWaitStartedAt=TimeCurrent();
   g_adaptiveBlockReason=contextDirection>0
      ? "BUY_WAIT_PULLBACK"
      : "SELL_WAIT_PULLBACK";
   g_entryPrecisionState="WAIT_LOCAL_EXTREME";
   g_entryPrecisionReason=state;
   return 0;
}

bool BasketHasTacticalPosition()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),"SaaSTactical")>=0)
         return true;
   }
   return false;
}

double TacticalTakeProfitPrice(int direction,double entryPrice)
{
   if(direction==0 || entryPrice<=0.0)
      return 0.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double minDistance=(
      MathMax(
         (double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL),
         0.0
      )+2.0
   )*_Point;
   double targetDistance=MathMax(minDistance,atrPrice*0.45);
   double target=direction>0
      ? entryPrice+targetDistance
      : entryPrice-targetDistance;

   double structure=direction>0
      ? ClosestAbove(entryPrice,g_ema21,g_vwapM5,g_nearestResistance)
      : ClosestBelow(entryPrice,g_ema21,g_vwapM5,g_nearestSupport);
   if(structure>0.0)
   {
      double distance=MathAbs(structure-entryPrice);
      if(distance>=minDistance && distance<=atrPrice*0.80)
         target=structure;
   }

   int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   if(direction>0)
      target=MathMax(target,entryPrice+minDistance);
   else
      target=MathMin(target,entryPrice-minDistance);
   return NormalizeDouble(target,digits);
}

bool TacticalCountertrendExitReady(
   int direction,
   double momentum,
   double cycleProfit,
   string &reasonOut
)
{
   reasonOut="NONE";
   if(direction==0 || !BasketHasTacticalPosition())
      return false;

   int macroDirection=g_macroTrendDirection;
   if(macroDirection==0 || macroDirection!= -direction)
      return false;

   string microState="NEUTRAL";
   double microScore=MicroStructureScore(macroDirection,microState);
   bool m5Resume=g_trendM5==macroDirection ||
                 RecentDirectionalBody(macroDirection,PERIOD_M5);
   bool m1Resume=g_trendM1==macroDirection ||
                 RecentDirectionalBody(macroDirection,PERIOD_M1);
   bool executionResume=ExecutionTurningEvent(macroDirection,momentum) ||
                        microScore>=55.0;
   bool momentumResume=MomentumSupportsDirection(
      macroDirection,momentum,0.38
   );

   if(!m5Resume || !executionResume)
      return false;

   // Bank any tactical profit as soon as Macro resumes. If M1 + momentum also
   // resume strongly, cut the scalp even slightly red rather than Rescue/Hedge.
   if(cycleProfit>0.0 || (m1Resume && momentumResume))
   {
      reasonOut="TACTICAL_MACRO_RESUME";
      return true;
   }
   return false;
}

void ResetPrecisionWait()
{
   g_precisionWaitStartedAt=0;
   g_precisionWaitDirection=0;
   g_precisionWaitReason="NONE";
   g_precisionWaitMaxSeconds=0;
}

bool EntryPrecisionReady(int direction,double momentum,bool firstPosition)
{
   if(!firstPosition)
   {
      ResetPrecisionWait();
      return true;
   }

   RefreshEntryPrecisionIntelligence(direction,momentum);

   if(g_tacticalCountertrendActive)
   {
      g_entryPrecisionState="TACTICAL_ENTRY";
      g_entryPrecisionReason=g_tacticalCountertrendReason;
      ResetPrecisionWait();
      return true;
   }

   if(!IndicatorV6TimingReady(direction))
   {
      g_entryPrecisionState="INDICATOR_CONTEXT_WAIT";
      g_entryPrecisionReason=g_indicatorWaitReason;
      g_adaptiveBlockReason="WAIT_INDICATOR_CONTEXT";
      return false;
   }

   // Reversal/retest/sweep entries already contain a better-price thesis and
   // should never be delayed by this optional optimizer.
   bool locationEntry=
      StringFind(g_entryTrigger,"REVERSAL")>=0 ||
      StringFind(g_entryTrigger,"RETEST")>=0 ||
      g_liquidityScore>=65.0 ||
      g_microStructureScore>=78.0 ||
      g_fvgScore>=60.0;

   if(g_entryPrecisionState!="CHASE_ENTRY" || locationEntry)
   {
      ResetPrecisionWait();
      return true;
   }

   // Only clearly extended entries get a short better-price wait. Ordinary
   // lower scores are immediately downgraded to ACCEPTABLE rather than blocked.
   bool severeChase=g_entryDistanceAtr>=0.45 || g_exhaustionScore>=55.0;
   if(!severeChase)
   {
      g_entryPrecisionState="ACCEPTABLE_ENTRY";
      g_entryPrecisionReason="SOFT_SCORE_FALLBACK";
      ResetPrecisionWait();
      return true;
   }

   int maxWait=(g_newsMode!="NORMAL" || g_marketRegime=="HIGH_VOLATILITY")
      ? 8
      : (g_marketRegime=="RANGE" ? 12 : 18);
   datetime now=TimeCurrent();
   if(g_precisionWaitStartedAt<=0 || g_precisionWaitDirection!=direction)
   {
      g_precisionWaitStartedAt=now;
      g_precisionWaitDirection=direction;
      g_precisionWaitReason="WAIT_BETTER_PRICE";
      g_precisionWaitMaxSeconds=maxWait;
      g_entryPrecisionReason="WAIT_BETTER_PRICE";
      return false;
   }

   g_precisionWaitMaxSeconds=maxWait;
   if(now-g_precisionWaitStartedAt>=maxWait)
   {
      // Timeout may relax an ordinary chase, but it may NEVER force a BUY at a
      // confirmed local top or a SELL at a confirmed local bottom. Those waits
      // end only when price pulls back or a real breakout holds.
      string extremeState="NONE";
      double extremeLevel=0.0;
      double extremeRisk=LocalExtremeRiskScore(
         direction,extremeState,extremeLevel
      );
      if(extremeRisk>=65.0 &&
         !BreakoutHoldConfirmed(direction,extremeLevel))
      {
         g_entryPrecisionState="WAIT_LOCAL_EXTREME";
         g_entryPrecisionReason=extremeState;
         g_adaptiveBlockReason=direction>0
            ? "BUY_WAIT_PULLBACK"
            : "SELL_WAIT_PULLBACK";
         g_precisionWaitStartedAt=now;
         return false;
      }

      g_entryPrecisionState="ACCEPTABLE_FALLBACK";
      g_entryPrecisionReason="MAX_WAIT_FALLBACK";
      ResetPrecisionWait();
      return true;
   }

   g_entryPrecisionReason="WAIT_BETTER_PRICE";
   return false;
}

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

   // Brain V11: confidence is a quality preference, not a permanent deadlock.
   // Market location, model confirmation and directional structure remain hard
   // safety gates. Only catastrophically weak confidence can veto an entry.
   // This lets the EA recover naturally after a losing streak instead of
   // requiring a trade to reset a streak while simultaneously forbidding it.
   bool confidenceBelowPreferred = g_signalConfidence < confidenceFloor;
   double catastrophicFloor = MathMax(38.0, confidenceFloor - 18.0);
   if(g_confidenceGateEnabled &&
      confidenceBelowPreferred &&
      g_signalConfidence < catastrophicFloor)
   {
      g_adaptiveBlockReason = "WAITING_CONFIDENCE_EXTREME";
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

bool MarketLocationEntryAllowed(int direction, bool fastRevalidation)
{
   RefreshMarketContext(false);
   if(BrainV8LocalZoneBlocked(direction, fastRevalidation))
      return false;

   double brainV8SwingExtension = BrainV8LatestSwingExtensionAtr(direction);
   double brainV8MaxExtension = fastRevalidation ? 0.80 : 0.95;
   g_extensionAtr = MathMax(g_extensionAtr, brainV8SwingExtension);
   if(brainV8SwingExtension >= brainV8MaxExtension)
   {
      g_adaptiveBlockReason = "WAITING_PULLBACK_RETEST";
      g_priceLocationState = "SWING_EXTENDED_WAIT_PULLBACK";
      g_antiChaseActive = true;
      g_antiChaseDirection = direction;
      g_antiChaseReason = "SWING_EXTENSION";
      g_breakoutRetestRequired = false;
      return false;
   }
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      g_adaptiveBlockReason = "NO_TICK";
      return false;
   }

   EvaluateMarketLocationScore(direction);

   double exhaustion=0.0, extensionAtr=0.0, adverseWick=0.0;
   string exhaustionReason="NONE";
   bool exhausted = DirectionalExhaustion(
      direction,exhaustion,extensionAtr,adverseWick,exhaustionReason
   );

   double adverseZone = direction > 0 ? g_supplyZoneScore : g_demandZoneScore;
   double terminalThreshold = fastRevalidation ? 84.0 : 78.0;
   g_spaceToTargetAtr = SpaceToTargetAtr(direction);

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double price=(tick.bid+tick.ask)*0.5;
   double adverseDistanceAtr=99.0;
   if(direction>0 && g_supplyZoneLow>price)
      adverseDistanceAtr=(g_supplyZoneLow-price)/MathMax(_Point,atrPrice);
   else if(direction<0 && g_demandZoneHigh>0.0 && g_demandZoneHigh<price)
      adverseDistanceAtr=(price-g_demandZoneHigh)/MathMax(_Point,atrPrice);
   bool nearAdverseZone=adverseDistanceAtr<=(fastRevalidation ? 0.24 : 0.30);

   // Hard gate only for a clearly dangerous terminal location that is ACTUALLY
   // close to price. A strong but distant Demand/Supply zone must never starve
   // the entry engine. RSI/ADX/VWAP remain advisory.
   bool terminalZone =
      adverseZone >= terminalThreshold &&
      nearAdverseZone &&
      (g_spaceToTargetAtr <= 0.22 || exhausted);
   bool noRoomAndExhausted =
      g_spaceToTargetAtr <= 0.12 &&
      adverseZone >= 70.0 &&
      nearAdverseZone &&
      exhausted;

   if(terminalZone || noRoomAndExhausted)
   {
      g_adaptiveBlockReason = direction > 0
         ? "WAIT_TERMINAL_SUPPLY"
         : "WAIT_TERMINAL_DEMAND";
      g_priceLocationState = direction > 0
         ? "SUPPLY_TERMINAL"
         : "DEMAND_TERMINAL";
      return false;
   }

   return true;
}


double DynamicConfidenceThreshold(int direction)
{
   double threshold = MathMax(48.0, MathMin(60.0, (double)g_confidenceThreshold));

   if(g_entryModel == "OB_FIB_PULLBACK")
      threshold = MathMin(threshold, 48.0);
   else if(g_entryModel == "ORDER_BLOCK_PULLBACK")
      threshold = MathMin(threshold, 50.0);
   else if(g_entryModel == "FIB_PULLBACK")
      threshold = MathMin(threshold, 50.0);
   else if(g_entryModel == "LEVEL_REACTION")
      threshold = MathMin(threshold, 52.0);
   else if(g_entryModel == "BREAKOUT")
      threshold = MathMin(threshold, 52.0);

   if(g_locationScore >= 40.0)
      threshold = MathMin(threshold, 49.0);
   else if(g_locationScore >= 32.0)
      threshold = MathMin(threshold, 52.0);

   if(g_fibConfluenceScore >= 14.0)
      threshold = MathMin(threshold, 50.0);

   if(g_entryModel == "CAUTION_ZONE")
      threshold = MathMax(threshold, 60.0);

   if(g_macroTrendDirection != 0 && direction != g_macroTrendDirection)
      threshold = MathMax(threshold, 60.0);

   if(g_trendM30 == -direction && g_trendH1 == -direction)
      threshold = MathMax(threshold, 64.0);

   // High volatility/news does not raise the threshold.
   g_effectiveConfidenceThreshold = MathMax(48.0, MathMin(64.0, threshold));
   return g_effectiveConfidenceThreshold;
}



double EffectiveHardStopMultiplier()
{
   double multiplier = g_hardStopAtrMultiplier;
   if(g_marketRegime == "HIGH_VOLATILITY") multiplier *= 1.25;
   else if(g_marketRegime == "QUIET") multiplier *= 0.85;
   return MathMax(0.5, MathMin(10.0, multiplier));
}

double EffectiveHardStopDistancePoints()
{
   if(!g_adaptiveEngine || g_atrPoints <= 0.0 || g_hardStopAtrMultiplier <= 0.0)
      return 0.0;

   double brokerMinimumPoints =
      (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   return MathMax(
      g_atrPoints * EffectiveHardStopMultiplier(),
      brokerMinimumPoints + 1.0
   );
}

double EffectiveStopLossDistancePoints()
{
   double brokerMinimumPoints =
      (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);

   if(g_manualStopLossPoints > 0.0)
      return MathMax(g_manualStopLossPoints, brokerMinimumPoints + 1.0);

   return EffectiveHardStopDistancePoints();
}

string StopLossModeName()
{
   return g_manualStopLossPoints > 0.0 ? "MANUAL_POINTS" : "SYSTEM_ATR";
}

double AdaptiveTradeVolume()
{
   // Lot is customer-controlled. Adaptive intelligence may decide WHEN to
   // trade, spacing, direction, confidence and protection, but it must never
   // silently reduce the customer's configured order volume.
   g_minimumLotOverrideActive = false;
   return NormalizeTradeVolume(g_lot);
}

string DetailedMarketRegime(double momentum, int direction)
{
   double absMomentum = MathAbs(momentum);
   double threshold = MathMax(1.0, g_adaptiveMomentumThreshold);

   if(g_marketRegime == "HIGH_VOLATILITY")
   {
      if(absMomentum >= threshold * 0.55)
         return "NEWS_IMPULSE";
      return "VOLATILITY_EXPANSION";
   }

   if(g_entryModel == "BREAKOUT")
      return "BREAKOUT_EXPANSION";

   if(direction != 0)
   {
      bool microAgainst = g_trendM1 == -direction || g_trendM5 == -direction;
      if(microAgainst)
         return "TREND_PULLBACK";
      if(absMomentum >= threshold * 0.85)
         return "TREND_ACCELERATION";
      return "TREND_CONTINUATION";
   }

   if(g_marketRegime == "QUIET")
      return "LOW_VOLATILITY";

   if(g_trendM5 != 0 && (g_trendM5 == g_trendM15 || g_trendM5 == g_trendM30))
      return "RANGE_BREAK_ATTEMPT";

   if(g_marketRegime == "RANGE")
      return "RANGE_ROTATION";

   return "TRANSITION";
}

// Brain V12 ----------------------------------------------------------------
// Direct execution policy requested for production trading:
// - Intelligence remains available for telemetry, exits and basket management.
// - First-entry direction is NOT vetoed by confidence, pullback, RSI, S/R,
//   terminal-zone, anti-chase or Entry Precision filters.
// - Prefer a real setup when one exists, then fall back to live momentum,
//   lower-timeframe trend consensus, and finally macro direction.
// - Operational safety still applies later in OnTick: SaaS access/lease,
//   broker trade permission, explicit BUY_ONLY/SELL_ONLY, rate limit,
//   max positions and extreme spread protection.
int BrainV12DirectDirection(double momentum)
{
   int direction = SetupFirstDirection(momentum);
   if(direction != 0)
   {
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(direction);
   }

   double threshold = MathMax(2.0, g_adaptiveMomentumThreshold);
   double directMomentum = MathMax(1.0, threshold * 0.25);
   if(momentum >= directMomentum)
   {
      g_entryModel = "DIRECT_MOMENTUM";
      g_entryTrigger = "MOMENTUM_BUY";
      g_entryBias = "BUY";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(1);
   }
   if(momentum <= -directMomentum)
   {
      g_entryModel = "DIRECT_MOMENTUM";
      g_entryTrigger = "MOMENTUM_SELL";
      g_entryBias = "SELL";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(-1);
   }

   int buyVotes = 0;
   int sellVotes = 0;
   if(g_trendM1 > 0) buyVotes++; else if(g_trendM1 < 0) sellVotes++;
   if(g_trendM5 > 0) buyVotes++; else if(g_trendM5 < 0) sellVotes++;
   if(g_trendM15 > 0) buyVotes++; else if(g_trendM15 < 0) sellVotes++;
   if(g_emaTrendM5 > 0) buyVotes++; else if(g_emaTrendM5 < 0) sellVotes++;
   if(g_emaTrendM15 > 0) buyVotes++; else if(g_emaTrendM15 < 0) sellVotes++;

   if(buyVotes >= 3 && buyVotes > sellVotes)
   {
      g_entryModel = "DIRECT_TREND";
      g_entryTrigger = "TREND_BUY";
      g_entryBias = "BUY";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(1);
   }
   if(sellVotes >= 3 && sellVotes > buyVotes)
   {
      g_entryModel = "DIRECT_TREND";
      g_entryTrigger = "TREND_SELL";
      g_entryBias = "SELL";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(-1);
   }

   if(g_macroTrendDirection != 0)
   {
      direction = g_macroTrendDirection;
      g_entryModel = "DIRECT_MACRO";
      g_entryTrigger = direction > 0 ? "MACRO_BUY" : "MACRO_SELL";
      g_entryBias = direction > 0 ? "BUY" : "SELL";
      g_adaptiveBlockReason = "";
      return EnforceUserDirectionLock(direction);
   }

   g_entryModel = "NONE";
   g_entryTrigger = "NONE";
   g_entryBias = "BOTH";
   g_adaptiveBlockReason = "WAITING_DIRECTION";
   return 0;
}

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

// Brain V20 AUTO Precision --------------------------------------------------
// Scope contract: V20 runs ONLY when the website controlMode is AUTO and the
// isolated RACE engine is not active. Other modes continue through the exact
// legacy V19/V18/V16 paths below this block.
bool AutoV20Enabled()
{
   if(g_engineMode != "AUTO") return false;
   return g_controlMode == "AUTO" ||
          g_controlMode == "FLIP_LOCK" ||
          g_controlMode == "PARALLEL_UNIVERSE";
}

#include "include\\AutoVectorEdgeLiveV1.mqh"
#include "include\\ParallelUniverseV1.mqh"
#include "include\\FlipLockV1.mqh"

double AutoV20Clamp(double value,double minimum,double maximum)
{
   return MathMax(minimum,MathMin(maximum,value));
}

void AutoV20ResetSide(AUTO_V20_SIDE &side,int direction)
{
   side.direction=direction;
   side.confidence=0.0;
   side.rankScore=0.0;
   side.macroScore=0.0;
   side.executionScore=0.0;
   side.momentumScore=0.0;
   side.momentumWithPoints=0.0;
   side.momentumAgainstPoints=0.0;
   side.locationScore=0.0;
   side.pullbackScore=0.0;
   side.pullbackSwingStart=0.0;
   side.pullbackSwingExtreme=0.0;
   side.pullbackRetracement=0.0;
   side.pullbackState="NONE";
   side.entryPrice=0.0;
   side.tpPrice=0.0;
   side.slPrice=0.0;
   side.rr=0.0;
   side.expectedProfitMoney=0.0;
   side.expectedLossMoney=0.0;
   side.knownCostMoney=0.0;
   side.plannedLot=0.0;
   side.aggregateRiskMoney=0.0;
   side.winProbability=0.0;
   side.winSamples=0;
   side.averageNet=0.0;
   side.model="NONE";
   side.reason="NONE";
   side.rejectReason="NONE";
   side.reversal=false;
}

void AutoV20ResetCycle()
{
   g_autoV20BasketStopPrice=0.0;
   g_autoV20BasketTargetPrice=0.0;
   g_autoV20BasketStartedAt=0;
   g_autoV20PeakProfit=0.0;
   g_autoV20AggregateRiskMoney=0.0;
   g_autoV20AddReason="NONE";
}

void AutoV20ScanM5Levels(AUTO_V20_LEVELS &levels)
{
   levels.nearestSupport=0.0;
   levels.nearestResistance=0.0;
   levels.majorSupport=0.0;
   levels.majorResistance=0.0;
   levels.nearestSupportDistanceAtr=99.0;
   levels.nearestResistanceDistanceAtr=99.0;
   levels.majorSupportDistanceAtr=99.0;
   levels.majorResistanceDistanceAtr=99.0;
   levels.nearestSupportStrength=0.0;
   levels.nearestResistanceStrength=0.0;
   levels.majorSupportStrength=0.0;
   levels.majorResistanceStrength=0.0;
   levels.formingBase=0.0;
   levels.formingCeiling=0.0;
   levels.roleFlipState="NONE";

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;
   double price=(tick.bid+tick.ask)*0.5;
   double atrPrice=MathMax(_Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,120,rates);
   if(copied<12)
      return;

   levels.formingBase=MathMin(rates[0].low,MathMin(rates[1].low,rates[2].low));
   levels.formingCeiling=MathMax(rates[0].high,MathMax(rates[1].high,rates[2].high));

   double nearestSupportDistance=DBL_MAX;
   double nearestResistanceDistance=DBL_MAX;
   double majorSupportScore=-DBL_MAX;
   double majorResistanceScore=-DBL_MAX;

   for(int i=2;i<copied-2;i++)
   {
      bool pivotLow=
         rates[i].low<=rates[i-1].low && rates[i].low<rates[i-2].low &&
         rates[i].low<=rates[i+1].low && rates[i].low<rates[i+2].low;
      bool pivotHigh=
         rates[i].high>=rates[i-1].high && rates[i].high>rates[i-2].high &&
         rates[i].high>=rates[i+1].high && rates[i].high>rates[i+2].high;
      if(!pivotLow && !pivotHigh)
         continue;

      double level=pivotLow ? rates[i].low : rates[i].high;
      int touches=0;
      double tolerance=atrPrice*0.08;
      for(int j=0;j<copied;j++)
      {
         if(rates[j].low<=level+tolerance && rates[j].high>=level-tolerance)
            touches++;
      }
      double recency=MathMax(0.0,20.0-(double)i*0.18);
      double strength=AutoV20Clamp(18.0+touches*5.0+recency,0.0,100.0);

      if(pivotLow && level<=price)
      {
         double distance=price-level;
         if(distance<nearestSupportDistance)
         {
            nearestSupportDistance=distance;
            levels.nearestSupport=level;
            levels.nearestSupportStrength=strength;
         }
         double majorScore=strength-(distance/atrPrice)*4.0;
         if(majorScore>majorSupportScore)
         {
            majorSupportScore=majorScore;
            levels.majorSupport=level;
            levels.majorSupportStrength=strength;
         }
      }
      if(pivotHigh && level>=price)
      {
         double distance=level-price;
         if(distance<nearestResistanceDistance)
         {
            nearestResistanceDistance=distance;
            levels.nearestResistance=level;
            levels.nearestResistanceStrength=strength;
         }
         double majorScore=strength-(distance/atrPrice)*4.0;
         if(majorScore>majorResistanceScore)
         {
            majorResistanceScore=majorScore;
            levels.majorResistance=level;
            levels.majorResistanceStrength=strength;
         }
      }

      // A confirmed pivot that price crossed on the latest completed M5 bar is
      // tracked separately from active support/resistance so role changes are
      // never mistaken for an untouched level.
      if(pivotHigh && level<price &&
         rates[0].close>level && rates[1].close<=level)
         levels.roleFlipState="RESISTANCE_TO_SUPPORT";
      if(pivotLow && level>price &&
         rates[0].close<level && rates[1].close>=level)
         levels.roleFlipState="SUPPORT_TO_RESISTANCE";
   }

   if(levels.nearestSupport>0.0)
      levels.nearestSupportDistanceAtr=(price-levels.nearestSupport)/atrPrice;
   if(levels.nearestResistance>0.0)
      levels.nearestResistanceDistanceAtr=(levels.nearestResistance-price)/atrPrice;
   if(levels.majorSupport>0.0)
      levels.majorSupportDistanceAtr=(price-levels.majorSupport)/atrPrice;
   if(levels.majorResistance>0.0)
      levels.majorResistanceDistanceAtr=(levels.majorResistance-price)/atrPrice;
}
