
void AutoV20EvaluatePullback(int direction,double momentum,AUTO_V20_PULLBACK &pb)
{
   pb.direction=direction;
   pb.swingStart=0.0;
   pb.swingExtreme=0.0;
   pb.swingRangeAtr=0.0;
   pb.retracement=0.0;
   pb.sequenceValid=false;
   pb.started=false;
   pb.resumed=false;
   pb.tooDeep=false;
   pb.score=35.0;
   pb.state="NO_SWING";

   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,18,rates);
   if(copied<10)
      return;

   int highIndex=0,lowIndex=0;
   double high=rates[0].high,low=rates[0].low;
   for(int i=1;i<copied;i++)
   {
      if(rates[i].high>high) { high=rates[i].high; highIndex=i; }
      if(rates[i].low<low) { low=rates[i].low; lowIndex=i; }
   }
   double atrPrice=MathMax(_Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);
   double range=MathMax(_Point,high-low);
   pb.swingRangeAtr=range/atrPrice;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;
   double current=(tick.bid+tick.ask)*0.5;

   if(direction>0)
   {
      pb.swingStart=low;
      pb.swingExtreme=high;
      pb.sequenceValid=lowIndex>highIndex;
      pb.retracement=AutoV20Clamp((high-current)/range,0.0,1.5);
   }
   else
   {
      pb.swingStart=high;
      pb.swingExtreme=low;
      pb.sequenceValid=highIndex>lowIndex;
      pb.retracement=AutoV20Clamp((current-low)/range,0.0,1.5);
   }

   pb.started=pb.sequenceValid && pb.retracement>=0.12;
   pb.tooDeep=pb.retracement>0.78;
   bool directionalBody=
      RecentDirectionalBody(direction,PERIOD_M1) ||
      RecentDirectionalBody(direction,PERIOD_M5);
   double directionalMomentum=(double)direction*momentum;
   pb.resumed=pb.started && !pb.tooDeep && directionalBody &&
      directionalMomentum>=-MathMax(1.0,g_adaptiveMomentumThreshold*0.15);

   if(!pb.sequenceValid)
   {
      pb.score=28.0;
      pb.state="SWING_SEQUENCE_MISMATCH";
   }
   else if(pb.tooDeep)
   {
      pb.score=20.0;
      pb.state="PULLBACK_TOO_DEEP";
   }
   else if(pb.retracement>=0.24 && pb.retracement<=0.58 && pb.resumed)
   {
      pb.score=90.0;
      pb.state="PULLBACK_RESUMED";
   }
   else if(pb.retracement>=0.18 && pb.retracement<=0.70)
   {
      pb.score=pb.resumed ? 78.0 : 58.0;
      pb.state=pb.resumed ? "PULLBACK_RESUMED" : "PULLBACK_IN_PROGRESS";
   }
   else if(pb.retracement<0.12)
   {
      pb.score=52.0;
      pb.state="IMPULSE_NOT_RETRACED";
   }
   else
   {
      pb.score=42.0;
      pb.state="PULLBACK_UNCONFIRMED";
   }
}

void AutoV20UpdateTrendPhase(double momentum)
{
   int macroScore=g_trendH1*3+g_trendM30*2+g_trendM15*2;
   int macro=macroScore>=3 ? 1 : macroScore<=-3 ? -1 : 0;
   double threshold=MathMax(2.0,g_adaptiveMomentumThreshold);
   string candidate="BALANCED";

   if(macro!=0)
   {
      AUTO_V20_PULLBACK pb;
      AutoV20EvaluatePullback(macro,momentum,pb);
      double directionalMomentum=(double)macro*momentum;
      bool accelerating=
         directionalMomentum>=threshold*0.75 &&
         g_trendM5==macro &&
         ((macro>0 && g_plusDiM5>=g_minusDiM5) ||
          (macro<0 && g_minusDiM5>=g_plusDiM5));
      bool weakening=
         pb.retracement>=0.58 ||
         (directionalMomentum<=-threshold*0.18 && g_trendM5==-macro) ||
         (g_adxPreviousM5>0.0 && g_adxM5<g_adxPreviousM5-3.0);

      if(weakening)
         candidate=macro>0 ? "UP_WEAKENING" : "DOWN_WEAKENING";
      else if(pb.started && !pb.resumed)
         candidate=macro>0 ? "UP_PULLBACK" : "DOWN_PULLBACK";
      else if(pb.resumed)
         candidate=macro>0 ? "UP_CONTINUATION" : "DOWN_CONTINUATION";
      else if(accelerating)
         candidate=macro>0 ? "UP_ACCELERATION" : "DOWN_ACCELERATION";
      else
         candidate=macro>0 ? "UP_TREND" : "DOWN_TREND";
   }
   else if(g_trendM5!=0 && g_trendM1==g_trendM5)
      candidate=g_trendM5>0 ? "LOCAL_UP" : "LOCAL_DOWN";
   else
      candidate="RANGE_TRANSITION";

   // Two consecutive evaluations are required for an ordinary phase change.
   // This hysteresis stops a single momentum tick from flipping market phase.
   if(candidate==g_autoV20PhaseCandidate)
      g_autoV20PhaseCandidateTicks++;
   else
   {
      g_autoV20PhaseCandidate=candidate;
      g_autoV20PhaseCandidateTicks=1;
   }

   if(g_autoV20Phase=="INITIALIZING" ||
      g_autoV20PhaseCandidateTicks>=2)
   {
      if(g_autoV20Phase!=candidate)
      {
         g_autoV20Phase=candidate;
         g_autoV20PhaseSince=TimeCurrent();
      }
   }
}

double AutoV20ProfitForMove(int direction,double volume,double openPrice,double closePrice)
{
   double result=0.0;
   ENUM_ORDER_TYPE type=direction>0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!OrderCalcProfit(type,_Symbol,volume,openPrice,closePrice,result))
      return 0.0;
   return result;
}

// Net RR remains execution telemetry and a ranking input. It is deliberately
// not an entry gate: AUTO must evaluate and execute valid market opportunities
// rather than wait indefinitely for a fixed reward/risk number.
double AutoV20NetRewardRisk(double grossReward,double grossRisk,double cost)
{
   if(grossReward<=0.0 || grossRisk<=0.0 || grossReward<=cost)
      return 0.0;
   return (grossReward-cost)/(grossRisk+cost);
}

void AutoV20PlanPrices(AUTO_V20_SIDE &side,AUTO_V20_LEVELS &levels)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;
   double atrPrice=MathMax(_Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);
   side.entryPrice=side.direction>0 ? tick.ask : tick.bid;

   double stopDistance=atrPrice*0.58;
   if(side.direction>0 && levels.nearestSupport>0.0 &&
      levels.nearestSupport<side.entryPrice)
   {
      double structureDistance=side.entryPrice-(levels.nearestSupport-atrPrice*0.08);
      if(structureDistance>=atrPrice*0.30 && structureDistance<=atrPrice*0.85)
         stopDistance=structureDistance;
   }
   else if(side.direction<0 && levels.nearestResistance>side.entryPrice)
   {
      double structureDistance=(levels.nearestResistance+atrPrice*0.08)-side.entryPrice;
      if(structureDistance>=atrPrice*0.30 && structureDistance<=atrPrice*0.85)
         stopDistance=structureDistance;
   }
   stopDistance=AutoV20Clamp(stopDistance,atrPrice*0.36,atrPrice*0.78);

   double configuredStop=EffectiveStopLossDistancePoints()*_Point;
   if(configuredStop>_Point)
      stopDistance=MathMin(stopDistance,configuredStop);

   // Default target must be meaningfully larger than the protected stop. A
   // nearby opposing M5 level may shorten it; the net-RR policy then rejects
   // that setup instead of accepting a trade that can lose more than it earns.
   double targetDistance=MathMax(atrPrice*0.76,stopDistance*1.55);
   if(side.direction>0 && levels.nearestResistance>side.entryPrice)
   {
      double room=levels.nearestResistance-side.entryPrice-atrPrice*0.05;
      if(room>=atrPrice*0.28 && room<=atrPrice*1.40)
         targetDistance=MathMin(targetDistance,room);
   }
   else if(side.direction<0 && levels.nearestSupport>0.0 &&
           levels.nearestSupport<side.entryPrice)
   {
      double room=side.entryPrice-levels.nearestSupport-atrPrice*0.05;
      if(room>=atrPrice*0.28 && room<=atrPrice*1.40)
         targetDistance=MathMin(targetDistance,room);
   }
   targetDistance=AutoV20Clamp(targetDistance,atrPrice*0.28,atrPrice*1.35);

   side.slPrice=side.direction>0
      ? side.entryPrice-stopDistance
      : side.entryPrice+stopDistance;
   side.tpPrice=side.direction>0
      ? side.entryPrice+targetDistance
      : side.entryPrice-targetDistance;

   double grossProfitPerLot=MathAbs(AutoV20ProfitForMove(
      side.direction,1.0,side.entryPrice,side.tpPrice));
   double grossLossPerLot=MathAbs(AutoV20ProfitForMove(
      side.direction,1.0,side.entryPrice,side.slPrice));
   double costPerLot=CurrentSpreadCost(1.0);
   side.rr=AutoV20NetRewardRisk(grossProfitPerLot,grossLossPerLot,costPerLot);

   double sizeFactor=0.50;
   if(side.rr>=1.55 && side.confidence>=76.0) sizeFactor=1.00;
   else if(side.rr>=1.20 && side.confidence>=67.0) sizeFactor=0.75;
   side.plannedLot=NormalizeTradeVolume(g_lot*sizeFactor);
   side.knownCostMoney=costPerLot*side.plannedLot;
   side.expectedProfitMoney=MathMax(0.0,grossProfitPerLot*side.plannedLot-side.knownCostMoney);
   side.expectedLossMoney=grossLossPerLot*side.plannedLot+side.knownCostMoney;
}

double AutoV20AggregateRiskAtStop(int direction,double stopPrice,double newLot)
{
   if(stopPrice<=0.0)
      return 0.0;
   double risk=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),"SaaSRace")>=0) continue;
      long type=PositionGetInteger(POSITION_TYPE);
      int posDirection=type==POSITION_TYPE_BUY ? 1 : -1;
      if(posDirection!=direction) continue;
      double p=AutoV20ProfitForMove(
         direction,
         PositionGetDouble(POSITION_VOLUME),
         PositionGetDouble(POSITION_PRICE_OPEN),
         stopPrice
      );
      if(p<0.0) risk+=-p;
   }

   if(newLot>0.0)
   {
      MqlTick tick;
      if(SymbolInfoTick(_Symbol,tick))
      {
         double entry=direction>0 ? tick.ask : tick.bid;
         double p=AutoV20ProfitForMove(direction,newLot,entry,stopPrice);
         if(p<0.0) risk+=-p;
      }
   }
   return risk;
}

void AutoV20AttachHistory(AUTO_V20_SIDE &side)
{
   bool setupMatch=
      g_setupWinSamples>0 &&
      g_setupHistoryDirection==side.direction &&
      g_setupHistoryModel==side.model;
   if(setupMatch)
   {
      side.winProbability=g_setupWinProbability;
      side.winSamples=g_setupWinSamples;
      side.averageNet=g_setupAverageNet;
   }
   else if(side.direction>0)
   {
      side.winProbability=g_buyWinProbability;
      side.winSamples=g_buyWinSamples;
      side.averageNet=g_buyAverageNet;
   }
   else
   {
      side.winProbability=g_sellWinProbability;
      side.winSamples=g_sellWinSamples;
      side.averageNet=g_sellAverageNet;
   }

   // Real statistics stay separate from model Confidence. History contributes
   // only a small reliability-weighted rank adjustment, never overwrites the
   // model score or masquerades as Confidence.
   if(side.winSamples>=20)
   {
      double reliability=MathMin(1.0,(double)side.winSamples/60.0);
      side.rankScore+=AutoV20Clamp(
         (side.winProbability-50.0)*0.10*reliability,-4.0,4.0);
   }
}

void AutoV20EvaluateSide(
   int direction,
   double momentum,
   AUTO_V20_LEVELS &levels,
   AUTO_V20_SIDE &side
)
{
   AutoV20ResetSide(side,direction);
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      side.rejectReason="NO_TICK";
      return;
   }

   double threshold=MathMax(2.0,g_adaptiveMomentumThreshold);
   double directionalNow=(double)direction*momentum;
   double directionalPrevious=(double)direction*g_autoV20PreviousMomentum;
   side.momentumWithPoints=MathMax(0.0,directionalNow);
   side.momentumAgainstPoints=MathMax(0.0,-directionalNow);

   // Macro direction: H1/M30/M15 only. EMA may corroborate once, but cannot be
   // counted repeatedly as a second copy of the same old trend.
   double macro=0.0;
   if(g_trendH1==direction) macro+=12.0; else if(g_trendH1==-direction) macro-=12.0;
   if(g_trendM30==direction) macro+=9.0; else if(g_trendM30==-direction) macro-=9.0;
   if(g_trendM15==direction) macro+=7.0; else if(g_trendM15==-direction) macro-=7.0;
   int emaMacroVotes=0;
   if(g_emaTrendH1==direction) emaMacroVotes++;
   if(g_emaTrendM30==direction) emaMacroVotes++;
   if(g_emaTrendM15==direction) emaMacroVotes++;
   int emaMacroAgainst=0;
   if(g_emaTrendH1==-direction) emaMacroAgainst++;
   if(g_emaTrendM30==-direction) emaMacroAgainst++;
   if(g_emaTrendM15==-direction) emaMacroAgainst++;
   if(emaMacroVotes>=2) macro+=4.0;
   else if(emaMacroAgainst>=2) macro-=4.0;
   side.macroScore=AutoV20Clamp(macro,-24.0,24.0);

   // Execution timing is M5/M1. EMA M5 is one corroborating vote, not another
   // complete trend stack.
   double execution=0.0;
   if(g_trendM5==direction) execution+=14.0; else if(g_trendM5==-direction) execution-=13.0;
   if(g_trendM1==direction) execution+=7.0; else if(g_trendM1==-direction) execution-=7.0;
   if(g_emaTrendM5==direction) execution+=4.0;
   else if(g_emaTrendM5==-direction) execution-=4.0;
   double pa=direction>0 ? g_priceActionBuyScore : g_priceActionSellScore;
   execution+=AutoV20Clamp(pa/5.0,0.0,7.0);
   side.executionScore=AutoV20Clamp(execution,-24.0,24.0);

   // Momentum is strictly directional. Opposing momentum is a penalty, never
   // converted to positive Confidence through MathAbs(). Reversal setups use
   // deceleration/turn evidence separately.
   double momentumScore=0.0;
   if(directionalNow>0.0)
      momentumScore+=MathMin(14.0,directionalNow/threshold*11.0);
   else if(directionalNow<0.0)
      momentumScore-=MathMin(18.0,(-directionalNow)/threshold*14.0);

   int macroDirection=g_macroTrendDirection;
   side.reversal=macroDirection!=0 && macroDirection==-direction;
   if(side.reversal)
   {
      bool turned=directionalNow>0.0 && directionalPrevious<=0.0;
      bool deceleratingAgainst=
         directionalNow>directionalPrevious+threshold*0.15;
      if(turned) momentumScore+=12.0;
      else if(deceleratingAgainst) momentumScore+=7.0;
      else momentumScore-=8.0;
   }
   side.momentumScore=AutoV20Clamp(momentumScore,-20.0,20.0);

   AUTO_V20_PULLBACK pb;
   AutoV20EvaluatePullback(direction,momentum,pb);
   side.pullbackScore=pb.score;
   side.pullbackSwingStart=pb.swingStart;
   side.pullbackSwingExtreme=pb.swingExtreme;
   side.pullbackRetracement=pb.retracement;
   side.pullbackState=pb.state;

   double location=0.0;
   if(direction>0)
   {
      if(levels.nearestSupportDistanceAtr<=0.45)
         location+=MathMin(10.0,levels.nearestSupportStrength*0.10);
      if(levels.nearestResistanceDistanceAtr<=0.24)
         location-=12.0;
      location+=AutoV20Clamp((g_demandZoneScore-50.0)*0.10,-4.0,6.0);
      location-=MathMax(0.0,(g_supplyZoneScore-65.0)*0.08);
      if(levels.roleFlipState=="RESISTANCE_TO_SUPPORT") location+=5.0;
   }
   else
   {
      if(levels.nearestResistanceDistanceAtr<=0.45)
         location+=MathMin(10.0,levels.nearestResistanceStrength*0.10);
      if(levels.nearestSupportDistanceAtr<=0.24)
         location-=12.0;
      location+=AutoV20Clamp((g_supplyZoneScore-50.0)*0.10,-4.0,6.0);
      location-=MathMax(0.0,(g_demandZoneScore-65.0)*0.08);
      if(levels.roleFlipState=="SUPPORT_TO_RESISTANCE") location+=5.0;
   }
   side.locationScore=AutoV20Clamp(location,-18.0,18.0);

   double confidence=50.0+
      side.macroScore*0.55+
      side.executionScore*0.80+
      side.momentumScore*0.70+
      side.locationScore*0.60+
      (side.pullbackScore-50.0)*0.18;

   bool phaseSupports=
      (direction>0 && (StringFind(g_autoV20Phase,"UP_")==0 || g_autoV20Phase=="LOCAL_UP")) ||
      (direction<0 && (StringFind(g_autoV20Phase,"DOWN_")==0 || g_autoV20Phase=="LOCAL_DOWN"));
   bool phaseWeakening=StringFind(g_autoV20Phase,"WEAKENING")>=0;
   if(phaseSupports && !phaseWeakening) confidence+=4.0;
   if(side.reversal && phaseWeakening) confidence+=5.0;
   if(side.reversal && !phaseWeakening && g_trendM5==-direction) confidence-=7.0;

   side.confidence=AutoV20Clamp(confidence,0.0,100.0);

   if(side.reversal)
   {
      side.model="AUTO_REVERSAL";
      side.reason=pb.resumed ? "REVERSAL_DECEL_PULLBACK_RESUME" : "REVERSAL_DECEL_EXECUTION";
   }
   else if(pb.started && pb.resumed)
   {
      side.model="AUTO_PULLBACK_CONTINUATION";
      side.reason="UNIFIED_PULLBACK_RESUME";
   }
   else if((direction>0 && levels.roleFlipState=="RESISTANCE_TO_SUPPORT") ||
           (direction<0 && levels.roleFlipState=="SUPPORT_TO_RESISTANCE"))
   {
      side.model="AUTO_BREAKOUT_RETEST";
      side.reason="CONFIRMED_LEVEL_ROLE_FLIP";
   }
   else if(macroDirection==direction)
   {
      side.model="AUTO_TREND_CONTINUATION";
      side.reason="MACRO_WITH_EXECUTION";
   }
   else
   {
      side.model="AUTO_RANGE_REACTION";
      side.reason="LOCAL_EXECUTION_LOCATION";
   }

   AutoV20PlanPrices(side,levels);
   side.rankScore=side.confidence;
   if(side.rr>=1.55) side.rankScore+=5.0;
   else if(side.rr>=1.20) side.rankScore+=2.0;
   else if(side.rr<1.00) side.rankScore-=10.0;
   else if(side.rr<1.10) side.rankScore-=5.0;
   AutoV20AttachHistory(side);
   side.rankScore=AutoV20Clamp(side.rankScore,0.0,100.0);
}

void AutoV20PublishSelected(AUTO_V20_SIDE &side)
{
   g_entryModel=side.model;
   g_entryTrigger=side.direction>0 ? "AUTO_V20_BUY" : "AUTO_V20_SELL";
   g_entryBias=side.direction>0 ? "BUY" : "SELL";
   g_entryQualityScore=side.rankScore;
   g_entryQuality=side.rankScore>=78.0 ? "A" : side.rankScore>=68.0 ? "B" : "C";
   g_modelConfidence=side.confidence;
   g_signalConfidence=side.confidence;
   g_historicalWinProbability=side.winProbability;
   g_historicalWinSamples=side.winSamples;
   g_confidenceSource="MODEL_SEPARATE_FROM_HISTORY";
   g_autoV20Confidence=side.confidence;
   g_autoV20WinProbability=side.winProbability;
   g_autoV20WinSamples=side.winSamples;
   g_autoV20AverageNet=side.averageNet;
   g_adaptiveLot=side.plannedLot;
   g_adaptiveMaxPositions=g_maxPositions;
   g_adaptiveEntrySpacingMs=g_minOrderIntervalMs;
   g_effectiveConfidenceThreshold=0.0;
}

int AutoV20PrecisionDirection(double momentum)
{
   g_autoV20DecisionId++;
   g_autoV20DecisionKind=BasketPositionCount()>0 ? "ADD" : "FIRST";
   g_autoV20DecisionReason="NONE";
   g_autoV20RejectReason="NONE";
   g_autoV20DirectionChangeReason="NONE";
   g_autoV20AddReason="NONE";

   g_autoV20PreviousMomentum=g_autoV20LastMomentum;
   AutoV20UpdateTrendPhase(momentum);
   AutoV20ScanM5Levels(g_autoV20Levels);
   AutoV20EvaluateSide(1,momentum,g_autoV20Levels,g_autoV20Buy);
   AutoV20EvaluateSide(-1,momentum,g_autoV20Levels,g_autoV20Sell);
   g_autoV20LastMomentum=momentum;

   int count=BasketPositionCount();
   int basketDirection=count>0 ? BasketDirection() : 0;
   int preliminary=
      g_autoV20Buy.confidence>g_autoV20Sell.confidence ? 1 :
      g_autoV20Sell.confidence>g_autoV20Buy.confidence ? -1 : 0;

   AUTO_V20_SIDE selected;
   AutoV20ResetSide(selected,0);
   int direction=0;

   if(count>0)
   {
      if(basketDirection==0)
      {
         g_autoV20RejectReason="MIXED_AUTO_BASKET";
         g_adaptiveBlockReason="AUTO_V20_MIXED_BASKET";
         return 0;
      }
      direction=basketDirection;
      selected=direction>0 ? g_autoV20Buy : g_autoV20Sell;
   }
   else if(g_entryMode==ENTRY_BUY_ONLY)
   {
      direction=1;
      selected=g_autoV20Buy;
   }
   else if(g_entryMode==ENTRY_SELL_ONLY)
   {
      direction=-1;
      selected=g_autoV20Sell;
   }
   else
   {
      double edge=g_autoV20Buy.rankScore-g_autoV20Sell.rankScore;
      if(MathAbs(edge)<5.0)
      {
         g_autoV20RejectReason="BUY_SELL_EDGE_TOO_SMALL";
         g_adaptiveBlockReason="AUTO_V20_WAIT_CONFLICT";
         Print("AUTO V20 reject id=",g_autoV20DecisionId,
               " reason=",g_autoV20RejectReason,
               " buy=",DoubleToString(g_autoV20Buy.rankScore,1),
               " sell=",DoubleToString(g_autoV20Sell.rankScore,1));
         return 0;
      }
      direction=edge>0.0 ? 1 : -1;
      selected=direction>0 ? g_autoV20Buy : g_autoV20Sell;
   }

   double minimumConfidence=count>0 ? 62.0 : 60.0;
   double minimumRank=count>0 ? 66.0 : 64.0;
   if(g_marketRegime=="HIGH_VOLATILITY")
   {
      minimumConfidence+=3.0;
      minimumRank+=3.0;
   }
   else if(g_marketRegime=="RANGE")
      minimumRank+=2.0;

   if(selected.confidence<minimumConfidence || selected.rankScore<minimumRank)
   {
      g_autoV20RejectReason="CENTRAL_SCORE_NOT_READY";
      g_adaptiveBlockReason="AUTO_V20_WAIT_QUALITY";
      Print("AUTO V20 reject id=",g_autoV20DecisionId,
            " side=",direction>0 ? "BUY" : "SELL",
            " confidence=",DoubleToString(selected.confidence,1),
            " rank=",DoubleToString(selected.rankScore,1),
            " model=",selected.model);
      return 0;
   }

   if(count>0)
   {
      double atrPoints=MathMax(10.0,
         AverageTrueRangePoints(PERIOD_M5,g_atrPeriod));
      double progress=BasketFavorableProgressPoints(direction);
      AUTO_V20_PULLBACK pb;
      AutoV20EvaluatePullback(direction,momentum,pb);
      double required=MathMax(2.0,atrPoints*0.08);

      // Never average down in Precision AUTO. An add requires either favorable
      // progress from the latest fill or a completed pullback that has resumed,
      // and the current price may not be meaningfully adverse to the last fill.
      if(progress<0.0 || (progress<required && !pb.resumed))
      {
         g_autoV20RejectReason="ADD_NEEDS_FAVORABLE_PROGRESS";
         g_autoV20AddReason="WAIT_PROGRESS_OR_PULLBACK_RESUME";
         g_adaptiveBlockReason="AUTO_V20_WAIT_ADD";
         return 0;
      }
      g_autoV20AddReason=progress>=required
         ? "FAVORABLE_PROGRESS"
         : "UNIFIED_PULLBACK_RESUME";

      selected.aggregateRiskMoney=AutoV20AggregateRiskAtStop(
         direction,
         g_autoV20BasketStopPrice>0.0 ? g_autoV20BasketStopPrice : selected.slPrice,
         selected.plannedLot
      )+selected.knownCostMoney;
      g_autoV20AggregateRiskMoney=selected.aggregateRiskMoney;
   }
   else
      g_autoV20AggregateRiskMoney=selected.expectedLossMoney;

   if(preliminary!=0 && preliminary!=direction)
      g_autoV20DirectionChangeReason="FINAL_RR_LOCATION_HISTORY_CHANGED_SIDE";

   string vectorLiveReason="NONE";
   if(!AutoVectorEdgeLiveAllow(direction,vectorLiveReason))
   {
      g_autoV20RejectReason=vectorLiveReason;
      g_adaptiveBlockReason="AUTO_VECTOR_EDGE_WAIT";
      g_cachedAdaptiveDirection=0;
      g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;
      return 0;
   }

   string parallelReason="NONE";
   if(!ParallelUniverseLiveAllow(direction,parallelReason))
   {
      g_autoV20RejectReason=parallelReason;
      g_adaptiveBlockReason="PARALLEL_UNIVERSE_WAIT";
      g_cachedAdaptiveDirection=0;
      g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;
      return 0;
   }

   g_autoV20DecisionReason=selected.reason;
   g_autoV20RejectReason="NONE";
   g_adaptiveBlockReason="";
   AutoV20PublishSelected(selected);
   g_cachedAdaptiveDirection=direction;
   g_cachedAdaptiveBlockReason="";

   Print("AUTO V20 decision id=",g_autoV20DecisionId,
         " kind=",g_autoV20DecisionKind,
         " side=",direction>0 ? "BUY" : "SELL",
         " buy=",DoubleToString(g_autoV20Buy.rankScore,1),
         " sell=",DoubleToString(g_autoV20Sell.rankScore,1),
         " confidence=",DoubleToString(selected.confidence,1),
         " winProb=",DoubleToString(selected.winProbability,1),
         " samples=",selected.winSamples,
         " rr=",DoubleToString(selected.rr,2),
         " reason=",selected.reason,
         " addReason=",g_autoV20AddReason,
         " change=",g_autoV20DirectionChangeReason);
   return direction;
}

void AutoV20OnOrderSent(int direction)
{
   AUTO_V20_SIDE selected=direction>0 ? g_autoV20Buy : g_autoV20Sell;
   if(g_autoV20BasketStartedAt<=0)
   {
      g_autoV20BasketStartedAt=TimeCurrent();
      g_autoV20BasketStopPrice=selected.slPrice;
      g_autoV20BasketTargetPrice=selected.tpPrice;
      g_autoV20PeakProfit=0.0;
   }
   else
   {
      // Adds may tighten risk, never widen the original Auto thesis.
      if(direction>0 && selected.slPrice>0.0)
         g_autoV20BasketStopPrice=MathMax(g_autoV20BasketStopPrice,selected.slPrice);
      else if(direction<0 && selected.slPrice>0.0)
         g_autoV20BasketStopPrice=
            g_autoV20BasketStopPrice<=0.0
               ? selected.slPrice
               : MathMin(g_autoV20BasketStopPrice,selected.slPrice);
   }
}

bool AutoV20FastPriceExit()
{
   if(!AutoV20Enabled() || BasketPositionCount()<=0 || BasketHasRacePosition())
      return false;
   int direction=BasketDirection();
   if(direction==0)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;
   double exitPrice=direction>0 ? tick.bid : tick.ask;

   if(g_autoV20BasketStopPrice>0.0)
   {
      bool stopHit=direction>0
         ? exitPrice<=g_autoV20BasketStopPrice
         : exitPrice>=g_autoV20BasketStopPrice;
      if(stopHit)
      {
         bool closed=CloseAllBasket("AUTO_V20_STRUCTURE_STOP");
         if(closed) AutoV20ResetCycle();
         g_executionStatus="AUTO_V20_STRUCTURE_STOP";
         return true;
      }
   }

   if(g_autoV20BasketTargetPrice>0.0 && g_profitTargetMode=="AUTO")
   {
      bool targetHit=direction>0
         ? exitPrice>=g_autoV20BasketTargetPrice
         : exitPrice<=g_autoV20BasketTargetPrice;
      if(targetHit)
      {
         bool closed=CloseAllBasket("AUTO_V20_MODERATE_TARGET");
         if(closed) AutoV20ResetCycle();
         g_executionStatus="AUTO_V20_MODERATE_TARGET";
         return true;
      }
   }
   return false;
}

bool AutoV20ManageOpenBasket(double momentum)
{
   if(!AutoV20Enabled() || BasketPositionCount()<=0 || BasketHasRacePosition())
      return false;
   int direction=BasketDirection();
   if(direction==0)
      return false;

   // Preserve the original V20 stop/target precedence at the original call site.
   if(AutoV20FastPriceExit())
      return true;

   if(g_autoV20BasketStartedAt<=0)
      g_autoV20BasketStartedAt=TimeCurrent();

   double atrPoints=MathMax(10.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod));

   double progress=BasketFavorableProgressPoints(direction);
   int opposite=-direction;
   int oppositeEvidence=0;
   if(g_trendM5==opposite) oppositeEvidence++;
   if(g_trendM1==opposite) oppositeEvidence++;
   if(g_emaTrendM5==opposite) oppositeEvidence++;
   if(MomentumSupportsDirection(opposite,momentum,0.35)) oppositeEvidence++;
   if(progress<=-atrPoints*0.18 && oppositeEvidence>=3)
   {
      bool closed=CloseAllBasket("AUTO_V20_CONFIRMED_WRONG");
      if(closed) AutoV20ResetCycle();
      g_executionStatus="AUTO_V20_CONFIRMED_WRONG";
      return true;
   }

   double cycleProfit=BasketCycleProfit();
   if(cycleProfit>g_autoV20PeakProfit)
      g_autoV20PeakProfit=cycleProfit;
   double armProfit=MathMax(0.05,
      MathMax(g_autoV20Buy.expectedProfitMoney,g_autoV20Sell.expectedProfitMoney)*0.35);
   if(g_profitTargetMode=="AUTO" &&
      g_autoV20PeakProfit>=armProfit)
   {
      double giveback=MathMax(0.05,g_autoV20PeakProfit*0.25);
      if(cycleProfit<=g_autoV20PeakProfit-giveback)
      {
         bool closed=CloseAllBasket("AUTO_V20_PROFIT_GIVEBACK");
         if(closed) AutoV20ResetCycle();
         g_executionStatus="AUTO_V20_PROFIT_GIVEBACK";
         return true;
      }
   }

   long ageSeconds=(long)MathMax(0,TimeCurrent()-g_autoV20BasketStartedAt);
   bool flowStillValid=
      g_trendM5==direction ||
      MomentumSupportsDirection(direction,momentum,0.20);
   if(ageSeconds>=12*60 && cycleProfit>0.0 && !flowStillValid)
   {
      bool closed=CloseAllBasket("AUTO_V20_TIME_BANK_PROFIT");
      if(closed) AutoV20ResetCycle();
      g_executionStatus="AUTO_V20_TIME_BANK_PROFIT";
      return true;
   }
   if(ageSeconds>=25*60 && cycleProfit<=0.0)
   {
      bool closed=CloseAllBasket("AUTO_V20_TIME_STOP");
      if(closed) AutoV20ResetCycle();
      g_executionStatus="AUTO_V20_TIME_STOP";
      return true;
   }
   return false;
}

int AdaptiveEntryDirection(double momentum)
{
   g_minimumLotOverrideActive = false;
   if(!g_adaptiveEngine)
   {
      int rawDirection = EntryDirection(momentum);
      g_adaptiveBlockReason = "";
      g_marketRegime = "DISABLED";
      g_signalConfidence = rawDirection == 0 ? 0.0 : 100.0;
      g_modelConfidence = g_signalConfidence;
      g_historicalWinProbability = 0.0;
      g_historicalWinSamples = 0;
      g_confidenceSource = "MODEL";
      g_adaptiveLot = NormalizeTradeVolume(g_lot);
      return rawDirection;
   }

   datetime now = TimeCurrent();

   // Session is market context, not a hard entry gate. Broker/symbol trading
   // permission remains authoritative and is checked before order execution.

   // Cache expensive multi-timeframe history reads for one second.
   if(g_lastAdaptiveEvaluation == now)
   {
      g_adaptiveBlockReason = g_cachedAdaptiveBlockReason;
      return g_cachedAdaptiveDirection;
   }
   g_lastAdaptiveEvaluation = now;
   g_cachedAdaptiveDirection = 0;
   g_adaptiveBlockReason = "";

   g_atrPoints = AverageTrueRangePoints(PERIOD_M15, g_atrPeriod);
   g_atrBaselinePoints = AverageTrueRangePoints(PERIOD_M15, MathMax(30, g_atrPeriod * 3));
   if(g_atrPoints <= 0.0)
   {
      g_marketRegime = "DATA_NOT_READY";
      g_signalConfidence = 0.0;
      g_modelConfidence = 0.0;
      g_adaptiveBlockReason = "ADAPTIVE_DATA_NOT_READY";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   RefreshMarketContext(false);
   int trendM1 = g_trendM1;
   int trendM5 = g_trendM5;
   int trendM15 = g_trendM15;
   int trendM30 = g_trendM30;
   int trendH1 = g_trendH1;

   // Macro Trend is H1/M30/M15 only. M5/M1 never define the macro bias;
   // they are reserved for execution timing and reversal confirmation.
   int macroScore = trendH1*3 + trendM30*2 + trendM15*2;
   int regimeDirection = macroScore >= 3 ? 1 : macroScore <= -3 ? -1 : 0;
   g_macroTrendDirection = regimeDirection;
   g_entryBias = regimeDirection > 0 ? "BUY" : regimeDirection < 0 ? "SELL" : "BOTH";
   g_atrRatio = g_atrBaselinePoints > 0.0 ? g_atrPoints / g_atrBaselinePoints : 1.0;

   // ATR is a volatility input, not an on/off switch. A high reading moves the
   // engine into a defensive profile: smaller lot, fewer positions, wider
   // spacing and stronger confirmation. This keeps market-open trading usable.
   bool atrSoftLimitExceeded = g_maxAtrPoints > 0.0 && g_atrPoints > g_maxAtrPoints;
   if(atrSoftLimitExceeded || g_atrRatio >= 1.60)
      g_marketRegime = "HIGH_VOLATILITY";
   else if(g_atrRatio <= 0.55)
      g_marketRegime = "QUIET";
   else if(regimeDirection > 0)
      g_marketRegime = "TREND_UP";
   else if(regimeDirection < 0)
      g_marketRegime = "TREND_DOWN";
   else
      g_marketRegime = "RANGE";

   g_sessionProfile = CurrentSessionProfile();
   double momentumFactor = 1.0;
   // News/high-volatility trading remains enabled; ATR expansion must not make
   // the entry trigger harder simply because a news impulse is in progress.
   if(g_marketRegime == "HIGH_VOLATILITY") momentumFactor = 0.95;
   else if(g_marketRegime == "QUIET") momentumFactor = 0.70;
   else if(g_marketRegime == "RANGE") momentumFactor = 1.10;
   g_adaptiveMomentumThreshold = MathMax(2.0, InpMomentumEntryPoints * momentumFactor);
   RefreshNewsMode(momentum);

   // Setup-first: S/R, Order Block, Fibonacci, Breakout and Structure can all
   // trigger an entry directly. Momentum accelerates timing but is not the only
   // path into the market.
   // Brain V12: take the real market direction directly. Setup intelligence is
   // preferred, but no price-location or pullback policy is allowed to turn a
   // valid BUY/SELL direction back into zero.
   if(AutoV20Enabled())
   {
      int autoDirection=AutoV20PrecisionDirection(momentum);
      g_marketRegimeDetail=DetailedMarketRegime(momentum,autoDirection);
      if(autoDirection==0)
      {
         g_cachedAdaptiveDirection=0;
         g_cachedAdaptiveBlockReason=g_adaptiveBlockReason;
      }
      return autoDirection;
   }

   int rawDirection = BrainV13SmartDirection(momentum);
   g_marketRegimeDetail = DetailedMarketRegime(momentum, rawDirection);

   if(rawDirection == 0)
   {
      if(g_macroTrendDirection != 0 && g_adaptiveBlockReason == "")
      {
         string lowerWait = LowerTimeframeStateForDirection(g_macroTrendDirection);
         g_lowerTimeframeState = lowerWait;
         if(lowerWait == "PULLBACK" && !g_antiChaseActive)
            g_adaptiveBlockReason = "WAITING_EXECUTION_TURN";
         else if(lowerWait == "REVERSAL" && !g_antiChaseActive)
            g_adaptiveBlockReason = "WAITING_REVERSAL_CONFIRMATION";
      }
      g_signalConfidence = 0.0;
      g_modelConfidence = 0.0;
      g_historicalWinProbability = 0.0;
      g_historicalWinSamples = 0;
      g_confidenceSource = "MODEL";
      g_effectiveConfidenceThreshold = 0.0;
      if(g_antiChaseActive && g_adaptiveBlockReason == "")
         g_adaptiveBlockReason = g_breakoutRetestRequired
            ? "WAITING_BREAKOUT_RETEST"
            : "WAITING_PULLBACK_RETEST";
      else if(g_adaptiveBlockReason == "")
         g_adaptiveBlockReason = "WAITING_SETUP";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }

   double momentumStrength = MathMin(2.0, MathAbs(momentum) / MathMax(1.0, g_adaptiveMomentumThreshold));
   double score = 12.0 + momentumStrength * 10.0;
   bool directionalRegime = g_marketRegime == "TREND_UP" || g_marketRegime == "TREND_DOWN";
   double weightM1 = directionalRegime ? 8.0 : 8.0;
   double weightM5 = directionalRegime ? 12.0 : 11.0;
   double weightM15 = directionalRegime ? 14.0 : 11.0;
   double weightM30 = directionalRegime ? 14.0 : 10.0;
   double weightH1 = directionalRegime ? 15.0 : 10.0;
   if(trendM1 == rawDirection) score += weightM1;
   else if(trendM1 == -rawDirection) score -= weightM1 * 0.70;
   if(trendM5 == rawDirection) score += weightM5;
   else if(trendM5 == -rawDirection) score -= weightM5 * 0.60;
   if(trendM15 == rawDirection) score += weightM15;
   else if(trendM15 == -rawDirection) score -= weightM15 * 0.45;
   if(trendM30 == rawDirection) score += weightM30;
   else if(trendM30 == -rawDirection) score -= weightM30 * 0.45;
   if(trendH1 == rawDirection) score += weightH1;
   else if(trendH1 == -rawDirection) score -= weightH1 * 0.45;
   score += MathMax(0.0, 12.0 - g_spreadConfidencePenalty * 0.60);
   score += g_marketRegime == "HIGH_VOLATILITY" ? 5.0 : g_marketRegime == "QUIET" ? 5.0 : 8.0;
   score += MathMax(0.0, MathMin(8.0, g_executionQuality * 0.08));

   // Price location is confluence, not a wall of mandatory filters.
   double marketEntryScore = EvaluateMarketLocationScore(rawDirection);
   score = score * 0.64 + marketEntryScore * 0.36;

   // Higher-timeframe disagreement is a confidence penalty, not a veto. A
   // strong OB/Fib/level reaction can still trade, while weak counter-trend
   // setups naturally fall below the selected profile's confidence threshold.
   if(g_entryMode == ENTRY_AUTO_MOMENTUM &&
      g_macroTrendDirection != 0 && rawDirection != g_macroTrendDirection)
      score -= 10.0;
   if(trendM30 == -rawDirection && trendH1 == -rawDirection)
      score -= 12.0;

   // Brain V11: loss history is advisory and bounded. It may make the engine
   // more selective, but it must never create a self-locking no-trade state.
   score -= MathMin(6.0, g_consecutiveLosses * 1.5);
   g_modelConfidence = MathMax(0.0, MathMin(100.0, score));
   g_historicalWinProbability = rawDirection > 0
      ? g_buyWinProbability
      : g_sellWinProbability;
   g_historicalWinSamples = rawDirection > 0
      ? g_buyWinSamples
      : g_sellWinSamples;

   // Convert the old formula score into a probability estimate backed by real
   // completed Baskets. Twelve samples are required before history can affect
   // execution; a 24-sample prior prevents a short lucky/unlucky run from
   // taking control. As history grows, the real win rate becomes dominant.
   if(g_historicalWinSamples >= 12)
   {
      const double priorSamples = 24.0;
      g_signalConfidence =
         (g_modelConfidence * priorSamples +
          g_historicalWinProbability * g_historicalWinSamples) /
         (priorSamples + g_historicalWinSamples);
      g_confidenceSource = g_historicalWinSamples >= 30
         ? "BASKET_HISTORY"
         : "BLENDED";
   }
   else
   {
      g_signalConfidence = g_modelConfidence;
      g_confidenceSource = "MODEL";
   }
   g_signalConfidence = MathMax(0.0, MathMin(100.0, g_signalConfidence));

   // Position count is controlled only by the user's Max Positions setting.
   // Adaptive Intelligence may decide when to enter, but never lowers this cap.
   g_adaptiveMaxPositions = g_maxPositions;

   // No hidden adaptive waiting. Once a real setup is ready, only the normal
   // order-rate protection applies.
   g_adaptiveEntrySpacingMs = g_minOrderIntervalMs;
   g_effectiveConfidenceThreshold = 0.0;

   // Brain V12: market-location, pullback/confirmation and confidence/structure
   // engines are telemetry only for FIRST ENTRY. They must not veto a valid
   // BUY/SELL direction. Existing exit and basket-management protections stay.
   g_adaptiveBlockReason = "";

   // Brain V12: confidence, structure, market location, RSI, support/resistance,
   // pullback and Entry Precision remain visible for telemetry but are not
   // allowed to block the first BUY/SELL order. Operational safety owns gating.

   g_adaptiveLot = AdaptiveTradeVolume();
   if(g_adaptiveLot <= 0.0)
   {
      g_adaptiveBlockReason = "RISK_LIMIT_TOO_SMALL";
      g_cachedAdaptiveBlockReason = g_adaptiveBlockReason;
      return 0;
   }
   g_cachedAdaptiveBlockReason = "";
   g_cachedAdaptiveDirection = rawDirection;
   return rawDirection;
}

string CurrentSessionProfile()
{
   MqlDateTime parts;
   datetime now = TimeTradeServer();
   if(now <= 0) now = TimeCurrent();
   TimeToStruct(now, parts);
   if(parts.hour < 7) return "ASIAN";
   if(parts.hour < 13) return "LONDON";
   if(parts.hour < 22) return "NEW_YORK";
   return "ROLLOVER";
}

double LastBasketEntryPrice(int direction)
{
   long newestTime = -1;
   ulong newestTicket = 0;
   double newestPrice = 0.0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;

      long type = PositionGetInteger(POSITION_TYPE);
      if((direction > 0 && type != POSITION_TYPE_BUY) ||
         (direction < 0 && type != POSITION_TYPE_SELL))
         continue;

      long openedAt = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(openedAt > newestTime || (openedAt == newestTime && ticket > newestTicket))
      {
         newestTime = openedAt;
         newestTicket = ticket;
         newestPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      }
   }
   return newestPrice;
}

double BasketFavorableProgressPoints(int direction)
{
   MqlTick tick;
   double lastPrice = LastBasketEntryPrice(direction);
   if(lastPrice <= 0.0 || !SymbolInfoTick(_Symbol, tick))
      return 0.0;

   if(direction > 0)
      return (tick.bid - lastPrice) / _Point;
   return (lastPrice - tick.ask) / _Point;
}

bool DirectionalMomentumStillValid(int direction, double thresholdMultiplier)
{
   double momentum = MomentumPoints();
   double threshold = g_adaptiveMomentumThreshold * thresholdMultiplier;
   return direction > 0 ? momentum >= threshold : momentum <= -threshold;
}

bool AdaptiveBasketAddAllowed(int direction)
{
   int count = BasketPositionCount();
   string brainV8AddReason = "NONE";
   if(count > 0 && BrainV16BasketAdverseMove(direction, brainV8AddReason))
   {
      g_adaptiveBlockReason = brainV8AddReason;
      return false;
   }
   g_pyramidProgressPoints = 0.0;
   g_pyramidRequiredPoints = 0.0;

   if(!g_adaptiveEngine || count <= 0)
      return true;
   if(direction != BasketDirection())
      return false;

   if(count >= g_adaptiveMaxPositions)
      return false;

   // MaxPositions is a ceiling, not "fire all positions now".
   // Every add must happen on the profitable side of the latest entry.
   g_pyramidProgressPoints = BasketFavorableProgressPoints(direction);

   bool directionalTrend =
      (g_macroTrendDirection > 0 && direction > 0) ||
      (g_macroTrendDirection < 0 && direction < 0);

   // Adds use favorable price progress + live setup/structure. Confidence is
   // not a gate here either.
   g_pyramidRequiredPoints = MathMax(3.0, g_atrPoints * (directionalTrend ? 0.05 : 0.04));
   if(g_pyramidProgressPoints < g_pyramidRequiredPoints)
      return false;

   EvaluateMarketLocationScore(direction);
   if(g_entryModel == "CAUTION_ZONE")
      return DirectionalMomentumStillValid(direction, 0.55) &&
         LowerTimeframeSupportsDirection(direction);

   if(LowerTimeframeSupportsDirection(direction) ||
      HigherTimeframeSupportsDirection(direction) ||
      DirectionalMomentumStillValid(direction, 0.35))
      return true;

   return false;
}

void PersistAdaptiveRiskState()
{
   GlobalVariableSet(DailyRiskStateKey("ALOSS2"), (double)g_consecutiveLosses);
}

void RestoreAdaptiveRiskState()
{
   // ALOSS in older builds counted every losing position. v1.027 counts one
   // completed Basket/Rescue Cycle as one decision, so migrate to a clean key.
   string lossKey = DailyRiskStateKey("ALOSS2");
   g_consecutiveLosses = GlobalVariableCheck(lossKey)
      ? (int)GlobalVariableGet(lossKey)
      : 0;

   string legacyLossKey = DailyRiskStateKey("ALOSS");
   if(GlobalVariableCheck(legacyLossKey)) GlobalVariableDel(legacyLossKey);

   string cooldownKey = DailyRiskStateKey("ACOOL");
   if(GlobalVariableCheck(cooldownKey)) GlobalVariableDel(cooldownKey);
}

void UpdateAdaptiveLossStateFromBasket(double net)
{
   // One losing 10-position Basket is one losing decision, not ten losses.
   // Track streak at completed Cycle level so risk scaling is statistically sane.
   if(net < -0.01)
      g_consecutiveLosses++;
   else if(net > 0.01)
      g_consecutiveLosses = 0;
   PersistAdaptiveRiskState();
}

string SpreadProfileKey(string suffix)
{
   string brokerServer = AccountInfoString(ACCOUNT_SERVER);
   long serverHash = 0;
   for(int i = 0; i < StringLen(brokerServer); i++)
      serverHash = (serverHash * 31 + StringGetCharacter(brokerServer, i)) % 1000000007;
   return StringFormat(
      "SCN_SPR_%I64d_%I64d_%I64d_%s_%s",
      (long)AccountInfoInteger(ACCOUNT_LOGIN),
      InpMagic,
      serverHash,
      _Symbol,
      suffix
   );
}

void PersistSpreadProfile()
{
   if(g_spreadMedian <= 0.0 || g_spreadP95 <= 0.0)
      return;
   GlobalVariableSet(SpreadProfileKey("MED"), g_spreadMedian);
   GlobalVariableSet(SpreadProfileKey("P90"), g_spreadP90);
   GlobalVariableSet(SpreadProfileKey("P95"), g_spreadP95);
   GlobalVariableSet(SpreadProfileKey("P99"), g_spreadP99);
}

void RestoreSpreadProfile()
{
   string medianKey = SpreadProfileKey("MED");
   string p95Key = SpreadProfileKey("P95");
   if(!GlobalVariableCheck(medianKey) || !GlobalVariableCheck(p95Key))
      return;

   g_spreadMedian = GlobalVariableGet(medianKey);
   g_spreadP95 = GlobalVariableGet(p95Key);
   string p90Key = SpreadProfileKey("P90");
   string p99Key = SpreadProfileKey("P99");
   g_spreadP90 = GlobalVariableCheck(p90Key) ? GlobalVariableGet(p90Key) : g_spreadMedian;
   g_spreadP99 = GlobalVariableCheck(p99Key) ? GlobalVariableGet(p99Key) : g_spreadP95;
   g_spreadProfileRestored = g_spreadMedian > 0.0 && g_spreadP95 > 0.0;
}

double SpreadPercentile(double &sorted[], int count, double percentile)
{
   if(count <= 0) return 0.0;
   int index = (int)MathFloor((count - 1) * MathMax(0.0, MathMin(1.0, percentile)));
   return sorted[index];
}

void RecalculateSpreadProfile()
{
   if(g_spreadHistoryCount <= 0)
      return;

   double sorted[];
   ArrayResize(sorted, g_spreadHistoryCount);
   for(int i = 0; i < g_spreadHistoryCount; i++)
      sorted[i] = g_spreadHistory[i];
   ArraySort(sorted);

   g_spreadMedian = SpreadPercentile(sorted, g_spreadHistoryCount, 0.50);
   g_spreadP90 = SpreadPercentile(sorted, g_spreadHistoryCount, 0.90);
   g_spreadP95 = SpreadPercentile(sorted, g_spreadHistoryCount, 0.95);
   g_spreadP99 = SpreadPercentile(sorted, g_spreadHistoryCount, 0.99);

   // P95 follows normal broker conditions while the median multiplier prevents
   // a compressed session from making the gate unrealistically narrow.
   g_adaptiveSpreadLimit = MathMax(g_spreadP95 * 1.15, g_spreadMedian * 1.75);
   g_adaptiveSpreadLimit = MathMax(g_adaptiveSpreadLimit, 1.0);
}

void SampleSpread()
{
   datetime now = TimeCurrent();
   if(now <= 0 || now == g_lastSpreadSampleAt)
      return;

   double spread = CurrentSpreadPoints();
   if(spread <= 0.0 || spread >= 999999.0)
      return;

   g_lastSpreadSampleAt = now;
   g_spreadHistory[g_spreadHistoryIndex] = spread;
   g_spreadHistoryIndex = (g_spreadHistoryIndex + 1) % SPREAD_HISTORY_CAPACITY;
   if(g_spreadHistoryCount < SPREAD_HISTORY_CAPACITY)
      g_spreadHistoryCount++;

   if((!g_spreadProfileRestored && g_spreadHistoryCount <= 60) ||
      (!g_spreadProfileRestored && g_spreadHistoryCount % 5 == 0) ||
      (g_spreadProfileRestored && g_spreadHistoryCount >= SPREAD_MIN_SAMPLES && g_spreadHistoryCount % 5 == 0))
      RecalculateSpreadProfile();

   bool profileReady = g_spreadHistoryCount >= SPREAD_MIN_SAMPLES || g_spreadProfileRestored;
   if(!profileReady)
   {
      // During warm-up use the broker's own live distribution. The configured
      // spread is only a floor, never an arbitrary hard ceiling.
      double bootstrapLimit = 0.0;
      if(g_spreadHistoryCount >= 5 && g_spreadMedian > 0.0)
         bootstrapLimit = MathMax(g_spreadP95 * 1.35, g_spreadMedian * 2.25);
      if(bootstrapLimit <= 0.0)
         bootstrapLimit = MathMax(1.0, spread * 2.25);
      g_adaptiveSpreadLimit = bootstrapLimit;
      g_spreadStatus = "WARMUP";
   }

   double elevatedLevel = g_spreadP90 > 0.0 ? g_spreadP90 : g_adaptiveSpreadLimit * 0.75;
   bool aboveLimit = spread > g_adaptiveSpreadLimit;
   if(aboveLimit)
      g_spreadHighSeconds++;
   else
      g_spreadHighSeconds = 0;

   double emergencySpreadLimit = MathMax(
      g_adaptiveSpreadLimit * 3.0,
      MathMax(g_spreadP99 * 2.0, g_spreadMedian * 5.0)
   );
   if(emergencySpreadLimit <= 0.0)
      emergencySpreadLimit = MathMax(1.0, spread * 3.0);

   if(spread > emergencySpreadLimit)
      g_spreadStatus = "EXTREME";
   else if(g_spreadHighSeconds >= 3)
      g_spreadStatus = "NEWS_WIDE";
   else if(aboveLimit || spread > elevatedLevel)
      g_spreadStatus = profileReady ? "ELEVATED" : "WARMUP";
   else
      g_spreadStatus = profileReady ? "NORMAL" : "WARMUP";

   g_spreadConfidencePenalty = 0.0;
   if(spread > elevatedLevel && g_adaptiveSpreadLimit > elevatedLevel)
   {
      // News spread should not become a hidden 20-point Confidence veto.
      // EXTREME spread is already blocked by AdaptiveSpreadAllowed().
      double maxSpreadPenalty = g_spreadStatus == "NEWS_WIDE" ? 4.0 : 10.0;
      g_spreadConfidencePenalty = MathMin(
         maxSpreadPenalty,
         maxSpreadPenalty * (spread - elevatedLevel) /
            MathMax(1.0, g_adaptiveSpreadLimit - elevatedLevel)
      );
   }

   if(g_spreadHistoryCount >= SPREAD_MIN_SAMPLES && g_spreadHistoryCount % 60 == 0)
      PersistSpreadProfile();
}

bool AdaptiveSpreadAllowed()
{
   double current = CurrentSpreadPoints();
   if(current <= 0.0 || current >= 999999.0)
      return false;

   if(!g_adaptiveEngine)
      return g_maxSpread <= 0 || current <= g_maxSpread;

   // Allow normal news-session widening. Only an extreme spread several times
   // the learned broker distribution remains a hard execution stop.
   if(g_adaptiveSpreadLimit <= 0.0)
      return true;

   double emergencySpreadLimit = MathMax(
      g_adaptiveSpreadLimit * 3.0,
      MathMax(g_spreadP99 * 2.0, g_spreadMedian * 5.0)
   );
   if(emergencySpreadLimit <= 0.0)
      return true;
   return current <= emergencySpreadLimit;
}

double CurrentSpreadPoints()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return 999999.0;
   return (double)MathRound((tick.ask - tick.bid) / _Point);
}

double CurrentSpreadPrice()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick)) return 0.0;
   return MathMax(0.0, tick.ask - tick.bid);
}

double CurrentSpreadCost(double volume)
{
   MqlTick tick;
   if(volume <= 0.0 || !SymbolInfoTick(_Symbol, tick) || tick.ask <= tick.bid)
      return 0.0;

   double profit = 0.0;
   if(OrderCalcProfit(ORDER_TYPE_BUY, _Symbol, volume, tick.ask, tick.bid, profit))
      return MathAbs(profit);

   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tickValue <= 0.0) tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize <= 0.0 || tickValue <= 0.0)
      return 0.0;
   return MathAbs((tick.ask - tick.bid) / tickSize * tickValue * volume);
}

double EffectiveBasketProfitTarget()
{
   if(g_profitTargetMode == "AUTO" && BasketHasTacticalPosition())
      return 0.0;

   if(g_profitTargetMode == "OFF")
      return 0.0;

   // Per-position profit mode is mutually exclusive with Basket profit.
   if(g_profitTargetMode == "MANUAL" && g_perPositionProfit > 0.0)
      return 0.0;

   // Explicit website setting always wins.
   if(g_profitTargetMode == "MANUAL" && g_basketProfitTarget > 0.0)
      return g_basketProfitTarget;

   // Automatic Basket target is a fallback when the user left Basket profit off.
   if(g_profitTargetMode == "AUTO" &&
      BasketFillEnabled() && g_burstTargetMoney > 0.0)
      return g_burstTargetMoney;

   return 0.0;
}

double EffectiveBasketLossLimit()
{
   // 0 means OFF exactly. Never invent a hidden Basket loss behind the user's
   // setting in every workflow.
   return MathMax(0.0, g_maxBasketLoss);
}

void EnsureBurstTargets(int plannedPositions)
{
   if(g_profitTargetMode != "AUTO" ||
      !BasketFillEnabled() ||
      g_burstTargetMoney > 0.0)
      return;

   int targetCount = MathMax(1, plannedPositions);
   double volume = g_adaptiveLot > 0.0 ? g_adaptiveLot : NormalizeTradeVolume(g_lot);
   double plannedSpreadCost = CurrentSpreadCost(volume) * targetCount;
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double fallbackTarget = MathMax(0.50, MathMax(plannedSpreadCost * 0.50, equity * 0.0002));
   double dynamicTarget = 0.0;

   int direction = BasketDirection();
   double anchorPrice = BasketAnchorEntryPrice(direction);
   if(direction != 0 && anchorPrice > 0.0)
   {
      double stopPrice = DynamicInitialStopPrice(direction, anchorPrice);
      double takeProfitPrice = DynamicTakeProfitPrice(direction, anchorPrice, stopPrice);
      double projectedPerPosition = 0.0;
      ENUM_ORDER_TYPE orderType = direction > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      if(takeProfitPrice > 0.0 &&
         OrderCalcProfit(orderType, _Symbol, volume, anchorPrice, takeProfitPrice, projectedPerPosition))
      {
         // Ladder entries occur progressively, so use a conservative portion of
         // the anchor projection instead of pretending all ten fills are at rung 1.
         dynamicTarget = MathAbs(projectedPerPosition) * targetCount * 0.60;
         if(equity > 0.0)
            dynamicTarget = MathMin(dynamicTarget, equity * 0.005);
         g_dynamicStopPrice = stopPrice;
         g_dynamicTakeProfitPrice = takeProfitPrice;
      }
   }

   // Keep the automatic reward meaningful relative to the configured loss
   // budget. Smart Profit Defense may still bank a smaller positive Cycle when
   // the graph confirms a reversal.
   double expectancyFloor = 0.0;
   if(g_maxBasketLoss > 0.0)
   {
      expectancyFloor = g_maxBasketLoss * 0.30;
      if(equity > 0.0)
         expectancyFloor = MathMin(expectancyFloor,equity * 0.01);
   }

   g_burstTargetMoney = MathMax(
      fallbackTarget,
      MathMax(dynamicTarget,expectancyFloor)
   );

   // Loss protection is never synthesized. If the user sets Basket Loss to 0,
   // the effective Basket loss is OFF.
   g_burstLossMoney = 0.0;
}

double BasketAnchorEntryPrice(int direction)
{
   long oldestTime = 0;
   double oldestPrice = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      long type = PositionGetInteger(POSITION_TYPE);
      if((direction > 0 && type != POSITION_TYPE_BUY) ||
         (direction < 0 && type != POSITION_TYPE_SELL))
         continue;

      long openedAt = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(oldestTime == 0 || openedAt < oldestTime)
      {
         oldestTime = openedAt;
         oldestPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      }
   }
   return oldestPrice;
}

double BasketProgressFromAnchorPoints(int direction)
{
   MqlTick tick;
   double anchorPrice = BasketAnchorEntryPrice(direction);
   if(anchorPrice <= 0.0 || !SymbolInfoTick(_Symbol, tick))
      return 0.0;
   return direction > 0
      ? (tick.bid - anchorPrice) / _Point
      : (anchorPrice - tick.ask) / _Point;
}

int EffectiveLadderTargetPositions(int direction)
{
   int target = MathMax(1,g_maxPositions);
   g_performanceRiskMode = target <= 1 ? "SINGLE" : "USER_TARGET";
   return target;
}

double LadderFractionForRung(int rung)
{
   if(rung <= 1) return 0.0;
   if(rung == 2) return 0.08;
   if(rung == 3) return 0.16;
   if(rung == 4) return 0.26;
   if(rung == 5) return 0.38;
   if(rung == 6) return 0.52;
   if(rung == 7) return 0.68;
   if(rung == 8) return 0.86;
   if(rung == 9) return 1.06;
   if(rung == 10) return 1.28;
   return 1.28 + (rung - 10) * 0.18;
}

// Brain V14: target-aware ladder density. Small Baskets keep the original
// spacing, while large user targets distribute positions across a bounded ATR
// span instead of demanding an impossible 17+ ATR move for 100 positions.
// This changes spacing only; adverse-flow, reversal, permission and spread
// safety still decide whether another position may actually be added.
double BalancedLadderFractionForRung(int rung, int targetPositions)
{
   if(rung <= 1)
      return 0.0;

   int target = MathMax(2, targetPositions);
   if(target <= 10)
      return LadderFractionForRung(rung);

   double progress = (double)(rung - 1) / (double)(target - 1);
   progress = MathMax(0.0, MathMin(1.0, progress));

   double maxSpanAtr = target <= 20 ? 1.50 :
                       target <= 50 ? 2.20 :
                       target <= 100 ? 3.00 :
                       3.00 + MathMin(2.00, (target - 100) * 0.01);

   // Slightly convex curve: early adds are available without clustering at
   // one price, later adds need progressively more favorable continuation.
   double fraction = maxSpanAtr * MathPow(progress, 1.10);
   return MathMax(0.05, fraction);
}

bool RecentDirectionalBodyAfter(
   int direction,
   ENUM_TIMEFRAMES timeframe,
   datetime since
)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, timeframe, 1, 2, rates) < 2)
      return false;
   if(since > 0 && rates[0].time < since)
      return false;

   double range = MathMax(_Point, rates[0].high - rates[0].low);
   double body = MathAbs(rates[0].close - rates[0].open);
   if(body < range * 0.25)
      return false;

   return direction > 0
      ? rates[0].close > rates[0].open
      : rates[0].close < rates[0].open;
}


double BasketAddDistanceFromLocalExtremeAtr(
   int direction,
   double extremeLevel
)
{
   if(direction==0 || extremeLevel<=0.0)
      return 99.0;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 99.0;

   double atrPrice=MathMax(
      _Point*12.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double current=direction>0 ? tick.bid : tick.ask;
   return direction>0
      ? (extremeLevel-current)/MathMax(_Point,atrPrice)
      : (current-extremeLevel)/MathMax(_Point,atrPrice);
}

bool BasketAddLocationAllowed(
   int direction,
   int count,
   string &reasonOut
)
{
   reasonOut="NONE";
   if(direction==0 || count<=0)
      return true;

   RefreshIndicatorV6Scores(direction,MomentumPoints());
   if(g_indicatorV6Mode==INDICATOR_V6_ADAPTIVE &&
      g_indicatorCompositeScore<34.0 &&
      g_indicatorLocationScore<36.0 &&
      g_indicatorStructureScore<40.0 &&
      g_indicatorExecutionScore<40.0)
   {
      reasonOut="INDICATOR_CONTEXT_ADD_WAIT";
      return false;
   }

   string extremeState="NONE";
   double extremeLevel=0.0;
   double extremeRisk=LocalExtremeRiskScore(
      direction,extremeState,extremeLevel
   );
   bool breakoutHold=BreakoutHoldConfirmed(direction,extremeLevel);
   double distanceFromExtremeAtr=
      BasketAddDistanceFromLocalExtremeAtr(direction,extremeLevel);

   // Positive distance means price has pulled away from the directional edge.
   // Slightly negative values mean a live probe above/below the old extreme.
   bool nearDirectionalEdge=
      distanceFromExtremeAtr<=0.18 &&
      distanceFromExtremeAtr>=-0.12;

   double atrPoints=MathMax(
      10.0,
      g_atrPoints>0.0
         ? g_atrPoints
         : AverageTrueRangePoints(PERIOD_M15,g_atrPeriod)
   );
   double anchorProgressAtr=
      MathMax(0.0,BasketProgressFromAnchorPoints(direction)) /
      MathMax(1.0,atrPoints);

   g_spaceToTargetAtr=SpaceToTargetAtr(direction);
   double exhaustion=0.0,extensionAtr=0.0,adverseWick=0.0;
   string exhaustionReason="NONE";
   bool exhausted=DirectionalExhaustion(
      direction,exhaustion,extensionAtr,adverseWick,exhaustionReason
   );

   bool retestReady=PullbackRetestReady(direction,MomentumPoints());
   bool executionTurn=ExecutionTurningEvent(direction,MomentumPoints());
   bool safePullback=
      distanceFromExtremeAtr>=0.18 &&
      (retestReady || executionTurn);

   // Basket completion must never outrank location safety. This specifically
   // prevents rungs 2..N from being stacked at a local top/bottom simply
   // because the 10-minute fill schedule is behind.
   bool localEdgeChase=
      nearDirectionalEdge &&
      !breakoutHold &&
      (
         extremeRisk>=52.0 ||
         anchorProgressAtr>=0.35 ||
         count>=3
      );

   bool exhaustedAtEdge=
      exhausted &&
      nearDirectionalEdge &&
      !breakoutHold &&
      !safePullback;

   bool noTargetRoom=
      g_spaceToTargetAtr<=0.16 &&
      !breakoutHold &&
      !safePullback;

   if(localEdgeChase || exhaustedAtEdge || noTargetRoom)
   {
      reasonOut=direction>0
         ? "LOCAL_TOP_ADD_BLOCK"
         : "LOCAL_BOTTOM_ADD_BLOCK";
      g_localExtremeState=extremeState;
      g_localExtremeScore=extremeRisk;
      g_localExtremeLevel=extremeLevel;
      g_breakoutHoldConfirmed=false;
      return false;
   }

   if(breakoutHold)
   {
      g_breakoutHoldConfirmed=true;
      g_localExtremeState="BREAKOUT_HOLD_CONFIRMED";
   }

   return true;
}

// Brain V15 -----------------------------------------------------------------
// Basket continuation is deliberately much lighter than first-entry logic.
// Max Positions is the user's exact ceiling. Once the first position exists,
// the add engine only needs: same Basket direction, no severe adverse move,
// and real price separation/progress from the latest filled position.
// S/R, RSI, pullback, terminal-zone, Entry Precision and continuation-score
// logic remain telemetry/quality inputs but cannot veto a valid continuation.
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
