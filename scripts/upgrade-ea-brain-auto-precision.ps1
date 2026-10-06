param(
  [Parameter(Mandatory = $false)]
  [string]$EaPath = "mt5\FastBasketBot.mq5"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $EaPath)) { throw "EA source not found: $EaPath" }
$text = [System.IO.File]::ReadAllText((Resolve-Path $EaPath))

function Replace-Required([string]$old,[string]$new,[string]$label) {
  if ($script:text.Contains($new)) { Write-Host "$label already applied"; return }
  if (-not $script:text.Contains($old)) { throw "Patch anchor not found: $label" }
  $script:text = $script:text.Replace($old,$new)
  Write-Host "Applied $label"
}
function Insert-BeforeRequired([string]$anchor,[string]$block,[string]$sentinel,[string]$label) {
  if ($script:text.Contains($sentinel)) { Write-Host "$label already applied"; return }
  $index = $script:text.IndexOf($anchor,[System.StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Patch anchor not found: $label" }
  $script:text = $script:text.Insert($index,$block + "`r`n`r`n")
  Write-Host "Applied $label"
}
function Insert-AfterRequired([string]$anchor,[string]$block,[string]$sentinel,[string]$label) {
  if ($script:text.Contains($sentinel)) { Write-Host "$label already applied"; return }
  $index = $script:text.IndexOf($anchor,[System.StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Patch anchor not found: $label" }
  $index += $anchor.Length
  $script:text = $script:text.Insert($index,"`r`n" + $block)
  Write-Host "Applied $label"
}

Replace-Required '#property version   "1.058"' '#property version   "1.059"' 'EA version 1.059'
Replace-Required '#define SCENOVA_EA_VERSION "1.058"' '#define SCENOVA_EA_VERSION "1.059"' 'runtime version 1.059'
Replace-Required '#define SCENOVA_PRODUCT_VERSION "2.0.20"' '#define SCENOVA_PRODUCT_VERSION "2.0.21"' 'product version 2.0.21'

$autoTypes = @'
// AUTO-only decision context -----------------------------------------------
// These structures are intentionally isolated from RACE/Turbo and the legacy
// ASSISTED/MANUAL execution paths. AUTO evaluates BUY and SELL independently
// and publishes only the selected side into the shared execution telemetry.
struct AUTO_LEVELS
{
   double nearestSupport;
   double nearestResistance;
   double majorSupport;
   double majorResistance;
   double nearestSupportDistanceAtr;
   double nearestResistanceDistanceAtr;
   double majorSupportDistanceAtr;
   double majorResistanceDistanceAtr;
   double nearestSupportStrength;
   double nearestResistanceStrength;
   double majorSupportStrength;
   double majorResistanceStrength;
   double formingBase;
   double formingCeiling;
   string roleFlipState;
};

struct AUTO_PULLBACK
{
   int direction;
   double swingStart;
   double swingExtreme;
   double swingRangeAtr;
   double retracement;
   bool sequenceValid;
   bool started;
   bool resumed;
   bool tooDeep;
   double score;
   string state;
};

struct AUTO_SIDE
{
   int direction;
   double confidence;
   double rankScore;
   double macroScore;
   double executionScore;
   double momentumScore;
   double momentumWithPoints;
   double momentumAgainstPoints;
   double locationScore;
   double pullbackScore;
   double entryPrice;
   double tpPrice;
   double slPrice;
   double rr;
   double expectedProfitMoney;
   double expectedLossMoney;
   double knownCostMoney;
   double plannedLot;
   double aggregateRiskMoney;
   double winProbability;
   int winSamples;
   double averageNet;
   string model;
   string reason;
   string rejectReason;
   bool reversal;
};
'@
Insert-BeforeRequired 'enum ENUM_BOT_STATE' $autoTypes 'struct AUTO_SIDE' 'AUTO analysis types'

$autoGlobals = @'
string g_controlMode = "AUTO";
AUTO_LEVELS g_autoLevels;
AUTO_SIDE g_autoBuy;
AUTO_SIDE g_autoSell;
string g_autoPhase = "INITIALIZING";
string g_autoPhaseCandidate = "INITIALIZING";
int g_autoPhaseCandidateTicks = 0;
datetime g_autoPhaseSince = 0;
double g_autoLastMomentum = 0.0;
double g_autoPreviousMomentum = 0.0;
long g_autoDecisionId = 0;
string g_autoDecisionKind = "NONE";
string g_autoDecisionReason = "NONE";
string g_autoRejectReason = "NONE";
string g_autoDirectionChangeReason = "NONE";
string g_autoAddReason = "NONE";
double g_autoAggregateRiskMoney = 0.0;
double g_autoBasketStopPrice = 0.0;
double g_autoBasketTargetPrice = 0.0;
datetime g_autoBasketStartedAt = 0;
double g_autoPeakProfit = 0.0;
double g_autoConfidence = 0.0;
double g_autoWinProbability = 0.0;
int g_autoWinSamples = 0;
double g_autoAverageNet = 0.0;
'@
Insert-AfterRequired 'string g_engineMode = "AUTO";' $autoGlobals 'g_autoDecisionId' 'AUTO runtime state'

$controlModeSettings = @'
   string requestedControlMode = JsonString(json, "controlMode", g_controlMode);
   StringToUpper(requestedControlMode);
   if(requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||
      requestedControlMode == "ASSISTED" || requestedControlMode == "MANUAL")
      g_controlMode = requestedControlMode;

'@
Insert-BeforeRequired '   string mode = JsonString(json, "entryMode", "");' $controlModeSettings 'requestedControlMode = JsonString(json, "controlMode"' 'apply controlMode to EA runtime'

$autoFunctions = @'
// AUTO Core --------------------------------------------------
// Scope contract: AUTO runs ONLY when the website controlMode is AUTO and the
// isolated RACE engine is not active. Other modes continue through the exact
// legacy non-AUTO paths below this block.
bool AutoEnabled()
{
   return g_engineMode != "RACE" && g_controlMode == "AUTO";
}

double AutoClamp(double value,double minimum,double maximum)
{
   return MathMax(minimum,MathMin(maximum,value));
}

void AutoResetSide(AUTO_SIDE &side,int direction)
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

void AutoResetCycle()
{
   g_autoBasketStopPrice=0.0;
   g_autoBasketTargetPrice=0.0;
   g_autoBasketStartedAt=0;
   g_autoPeakProfit=0.0;
   g_autoAggregateRiskMoney=0.0;
   g_autoAddReason="NONE";
}

void AutoScanM5Levels(AUTO_LEVELS &levels)
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
      double strength=AutoClamp(18.0+touches*5.0+recency,0.0,100.0);

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

void AutoEvaluatePullback(int direction,double momentum,AUTO_PULLBACK &pb)
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
      pb.retracement=AutoClamp((high-current)/range,0.0,1.5);
   }
   else
   {
      pb.swingStart=high;
      pb.swingExtreme=low;
      pb.sequenceValid=highIndex>lowIndex;
      pb.retracement=AutoClamp((current-low)/range,0.0,1.5);
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

void AutoUpdateTrendPhase(double momentum)
{
   int macroScore=g_trendH1*3+g_trendM30*2+g_trendM15*2;
   int macro=macroScore>=3 ? 1 : macroScore<=-3 ? -1 : 0;
   double threshold=MathMax(2.0,g_adaptiveMomentumThreshold);
   string candidate="BALANCED";

   if(macro!=0)
   {
      AUTO_PULLBACK pb;
      AutoEvaluatePullback(macro,momentum,pb);
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
   if(candidate==g_autoPhaseCandidate)
      g_autoPhaseCandidateTicks++;
   else
   {
      g_autoPhaseCandidate=candidate;
      g_autoPhaseCandidateTicks=1;
   }

   if(g_autoPhase=="INITIALIZING" ||
      g_autoPhaseCandidateTicks>=2)
   {
      if(g_autoPhase!=candidate)
      {
         g_autoPhase=candidate;
         g_autoPhaseSince=TimeCurrent();
      }
   }
}

double AutoProfitForMove(int direction,double volume,double openPrice,double closePrice)
{
   double result=0.0;
   ENUM_ORDER_TYPE type=direction>0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!OrderCalcProfit(type,_Symbol,volume,openPrice,closePrice,result))
      return 0.0;
   return result;
}

void AutoPlanPrices(AUTO_SIDE &side,AUTO_LEVELS &levels)
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
   stopDistance=AutoClamp(stopDistance,atrPrice*0.36,atrPrice*0.78);

   double configuredStop=EffectiveStopLossDistancePoints()*_Point;
   if(configuredStop>_Point)
      stopDistance=MathMin(stopDistance,configuredStop);

   double targetDistance=atrPrice*0.68;
   if(side.direction>0 && levels.nearestResistance>side.entryPrice)
   {
      double room=levels.nearestResistance-side.entryPrice-atrPrice*0.05;
      if(room>=atrPrice*0.28 && room<=atrPrice*1.05)
         targetDistance=MathMin(targetDistance,room);
   }
   else if(side.direction<0 && levels.nearestSupport>0.0 &&
           levels.nearestSupport<side.entryPrice)
   {
      double room=side.entryPrice-levels.nearestSupport-atrPrice*0.05;
      if(room>=atrPrice*0.28 && room<=atrPrice*1.05)
         targetDistance=MathMin(targetDistance,room);
   }
   targetDistance=AutoClamp(targetDistance,atrPrice*0.28,atrPrice*0.90);

   side.slPrice=side.direction>0
      ? side.entryPrice-stopDistance
      : side.entryPrice+stopDistance;
   side.tpPrice=side.direction>0
      ? side.entryPrice+targetDistance
      : side.entryPrice-targetDistance;

   double grossProfit=MathAbs(AutoProfitForMove(
      side.direction,g_lot,side.entryPrice,side.tpPrice));
   double grossLoss=MathAbs(AutoProfitForMove(
      side.direction,g_lot,side.entryPrice,side.slPrice));
   side.rr=grossLoss>0.0 ? grossProfit/grossLoss : 0.0;

   double sizeFactor=0.50;
   if(side.rr>=1.55 && side.confidence>=76.0) sizeFactor=1.00;
   else if(side.rr>=1.20 && side.confidence>=67.0) sizeFactor=0.75;
   side.plannedLot=NormalizeTradeVolume(g_lot*sizeFactor);
   if(side.plannedLot<=0.0)
      side.plannedLot=NormalizeTradeVolume(g_lot);

   side.expectedProfitMoney=MathAbs(AutoProfitForMove(
      side.direction,side.plannedLot,side.entryPrice,side.tpPrice));
   side.expectedLossMoney=MathAbs(AutoProfitForMove(
      side.direction,side.plannedLot,side.entryPrice,side.slPrice));
   side.knownCostMoney=CurrentSpreadCost(side.plannedLot);
}

double AutoAggregateRiskAtStop(int direction,double stopPrice,double newLot)
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
      double p=AutoProfitForMove(
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
         double p=AutoProfitForMove(direction,newLot,entry,stopPrice);
         if(p<0.0) risk+=-p;
      }
   }
   return risk;
}

void AutoAttachHistory(AUTO_SIDE &side)
{
   bool setupMatch=
      g_setupWinSamples>0 &&
      g_setupHistoryDirection==side.direction &&
      g_setupHistoryModel==side.model;
   if(setupMatch)
   {
      side.winProbability=g_setupWinProbability;
      side.winSamples=g_setupWinSamples;
      double p=side.winProbability/100.0;
      side.averageNet=p*g_setupAvgWin+(1.0-p)*g_setupAvgLoss;
   }
   else if(side.direction>0)
   {
      side.winProbability=g_buyWinProbability;
      side.winSamples=g_buyWinSamples;
      side.averageNet=0.0;
   }
   else
   {
      side.winProbability=g_sellWinProbability;
      side.winSamples=g_sellWinSamples;
      side.averageNet=0.0;
   }

   // Real statistics stay separate from model Confidence. History contributes
   // only a small reliability-weighted rank adjustment, never overwrites the
   // model score or masquerades as Confidence.
   if(side.winSamples>=20)
   {
      double reliability=MathMin(1.0,(double)side.winSamples/60.0);
      side.rankScore+=AutoClamp(
         (side.winProbability-50.0)*0.10*reliability,-4.0,4.0);
   }
}

void AutoEvaluateSide(
   int direction,
   double momentum,
   AUTO_LEVELS &levels,
   AUTO_SIDE &side
)
{
   AutoResetSide(side,direction);
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      side.rejectReason="NO_TICK";
      return;
   }

   double threshold=MathMax(2.0,g_adaptiveMomentumThreshold);
   double directionalNow=(double)direction*momentum;
   double directionalPrevious=(double)direction*g_autoPreviousMomentum;
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
   side.macroScore=AutoClamp(macro,-24.0,24.0);

   // Execution timing is M5/M1. EMA M5 is one corroborating vote, not another
   // complete trend stack.
   double execution=0.0;
   if(g_trendM5==direction) execution+=14.0; else if(g_trendM5==-direction) execution-=13.0;
   if(g_trendM1==direction) execution+=7.0; else if(g_trendM1==-direction) execution-=7.0;
   if(g_emaTrendM5==direction) execution+=4.0;
   else if(g_emaTrendM5==-direction) execution-=4.0;
   double pa=direction>0 ? g_priceActionBuyScore : g_priceActionSellScore;
   execution+=AutoClamp(pa/5.0,0.0,7.0);
   side.executionScore=AutoClamp(execution,-24.0,24.0);

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
   side.momentumScore=AutoClamp(momentumScore,-20.0,20.0);

   AUTO_PULLBACK pb;
   AutoEvaluatePullback(direction,momentum,pb);
   side.pullbackScore=pb.score;

   double location=0.0;
   if(direction>0)
   {
      if(levels.nearestSupportDistanceAtr<=0.45)
         location+=MathMin(10.0,levels.nearestSupportStrength*0.10);
      if(levels.nearestResistanceDistanceAtr<=0.24)
         location-=12.0;
      location+=AutoClamp((g_demandZoneScore-50.0)*0.10,-4.0,6.0);
      location-=MathMax(0.0,(g_supplyZoneScore-65.0)*0.08);
      if(levels.roleFlipState=="RESISTANCE_TO_SUPPORT") location+=5.0;
   }
   else
   {
      if(levels.nearestResistanceDistanceAtr<=0.45)
         location+=MathMin(10.0,levels.nearestResistanceStrength*0.10);
      if(levels.nearestSupportDistanceAtr<=0.24)
         location-=12.0;
      location+=AutoClamp((g_supplyZoneScore-50.0)*0.10,-4.0,6.0);
      location-=MathMax(0.0,(g_demandZoneScore-65.0)*0.08);
      if(levels.roleFlipState=="SUPPORT_TO_RESISTANCE") location+=5.0;
   }
   side.locationScore=AutoClamp(location,-18.0,18.0);

   double confidence=50.0+
      side.macroScore*0.55+
      side.executionScore*0.80+
      side.momentumScore*0.70+
      side.locationScore*0.60+
      (side.pullbackScore-50.0)*0.18;

   bool phaseSupports=
      (direction>0 && (StringFind(g_autoPhase,"UP_")==0 || g_autoPhase=="LOCAL_UP")) ||
      (direction<0 && (StringFind(g_autoPhase,"DOWN_")==0 || g_autoPhase=="LOCAL_DOWN"));
   bool phaseWeakening=StringFind(g_autoPhase,"WEAKENING")>=0;
   if(phaseSupports && !phaseWeakening) confidence+=4.0;
   if(side.reversal && phaseWeakening) confidence+=5.0;
   if(side.reversal && !phaseWeakening && g_trendM5==-direction) confidence-=7.0;

   side.confidence=AutoClamp(confidence,0.0,100.0);

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

   AutoPlanPrices(side,levels);
   side.rankScore=side.confidence;
   if(side.rr>=1.55) side.rankScore+=5.0;
   else if(side.rr>=1.20) side.rankScore+=2.0;
   else if(side.rr<1.00) side.rankScore-=10.0;
   else if(side.rr<1.10) side.rankScore-=5.0;
   AutoAttachHistory(side);
   side.rankScore=AutoClamp(side.rankScore,0.0,100.0);
}

void AutoPublishSelected(AUTO_SIDE &side)
{
   g_entryModel=side.model;
   g_entryTrigger=side.direction>0 ? "AUTO_BUY" : "AUTO_SELL";
   g_entryBias=side.direction>0 ? "BUY" : "SELL";
   g_entryQualityScore=side.rankScore;
   g_entryQuality=side.rankScore>=78.0 ? "A" : side.rankScore>=68.0 ? "B" : "C";
   g_modelConfidence=side.confidence;
   g_signalConfidence=side.confidence;
   g_historicalWinProbability=side.winProbability;
   g_historicalWinSamples=side.winSamples;
   g_confidenceSource="MODEL_SEPARATE_FROM_HISTORY";
   g_autoConfidence=side.confidence;
   g_autoWinProbability=side.winProbability;
   g_autoWinSamples=side.winSamples;
   g_autoAverageNet=side.averageNet;
   g_adaptiveLot=side.plannedLot;
   g_adaptiveMaxPositions=g_maxPositions;
   g_adaptiveEntrySpacingMs=g_minOrderIntervalMs;
   g_effectiveConfidenceThreshold=0.0;
}

int AutoPrecisionDirection(double momentum)
{
   g_autoDecisionId++;
   g_autoDecisionKind=BasketPositionCount()>0 ? "ADD" : "FIRST";
   g_autoDecisionReason="NONE";
   g_autoRejectReason="NONE";
   g_autoDirectionChangeReason="NONE";
   g_autoAddReason="NONE";

   g_autoPreviousMomentum=g_autoLastMomentum;
   AutoUpdateTrendPhase(momentum);
   AutoScanM5Levels(g_autoLevels);
   AutoEvaluateSide(1,momentum,g_autoLevels,g_autoBuy);
   AutoEvaluateSide(-1,momentum,g_autoLevels,g_autoSell);
   g_autoLastMomentum=momentum;

   int count=BasketPositionCount();
   int basketDirection=count>0 ? BasketDirection() : 0;
   int preliminary=
      g_autoBuy.confidence>g_autoSell.confidence ? 1 :
      g_autoSell.confidence>g_autoBuy.confidence ? -1 : 0;

   AUTO_SIDE selected;
   AutoResetSide(selected,0);
   int direction=0;

   if(count>0)
   {
      if(basketDirection==0)
      {
         g_autoRejectReason="MIXED_AUTO_BASKET";
         g_adaptiveBlockReason="AUTO_MIXED_BASKET";
         return 0;
      }
      direction=basketDirection;
      selected=direction>0 ? g_autoBuy : g_autoSell;
   }
   else if(g_entryMode==ENTRY_BUY_ONLY)
   {
      direction=1;
      selected=g_autoBuy;
   }
   else if(g_entryMode==ENTRY_SELL_ONLY)
   {
      direction=-1;
      selected=g_autoSell;
   }
   else
   {
      double edge=g_autoBuy.rankScore-g_autoSell.rankScore;
      if(MathAbs(edge)<5.0)
      {
         g_autoRejectReason="BUY_SELL_EDGE_TOO_SMALL";
         g_adaptiveBlockReason="AUTO_WAIT_CONFLICT";
         Print("AUTO reject id=",g_autoDecisionId,
               " reason=",g_autoRejectReason,
               " buy=",DoubleToString(g_autoBuy.rankScore,1),
               " sell=",DoubleToString(g_autoSell.rankScore,1));
         return 0;
      }
      direction=edge>0.0 ? 1 : -1;
      selected=direction>0 ? g_autoBuy : g_autoSell;
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
      g_autoRejectReason="CENTRAL_SCORE_NOT_READY";
      g_adaptiveBlockReason="AUTO_WAIT_QUALITY";
      Print("AUTO reject id=",g_autoDecisionId,
            " side=",direction>0 ? "BUY" : "SELL",
            " confidence=",DoubleToString(selected.confidence,1),
            " rank=",DoubleToString(selected.rankScore,1),
            " model=",selected.model);
      return 0;
   }

   if(selected.rr<1.05)
   {
      g_autoRejectReason="RR_BELOW_1_05";
      g_adaptiveBlockReason="AUTO_WAIT_RR";
      return 0;
   }

   if(count>0)
   {
      double atrPoints=MathMax(10.0,
         AverageTrueRangePoints(PERIOD_M5,g_atrPeriod));
      double progress=BasketFavorableProgressPoints(direction);
      AUTO_PULLBACK pb;
      AutoEvaluatePullback(direction,momentum,pb);
      double required=MathMax(2.0,atrPoints*0.08);

      // Never average down in Precision AUTO. An add requires either favorable
      // progress from the latest fill or a completed pullback that has resumed,
      // and the current price may not be meaningfully adverse to the last fill.
      if(progress<0.0 || (progress<required && !pb.resumed))
      {
         g_autoRejectReason="ADD_NEEDS_FAVORABLE_PROGRESS";
         g_autoAddReason="WAIT_PROGRESS_OR_PULLBACK_RESUME";
         g_adaptiveBlockReason="AUTO_WAIT_ADD";
         return 0;
      }
      g_autoAddReason=progress>=required
         ? "FAVORABLE_PROGRESS"
         : "UNIFIED_PULLBACK_RESUME";

      selected.aggregateRiskMoney=AutoAggregateRiskAtStop(
         direction,
         g_autoBasketStopPrice>0.0 ? g_autoBasketStopPrice : selected.slPrice,
         selected.plannedLot
      );
      g_autoAggregateRiskMoney=selected.aggregateRiskMoney;
      if(g_maxBasketLoss>0.0 && selected.aggregateRiskMoney>g_maxBasketLoss)
      {
         g_autoRejectReason="ADD_EXCEEDS_USER_BASKET_RISK";
         g_adaptiveBlockReason="AUTO_RISK_LIMIT";
         return 0;
      }
   }
   else
      g_autoAggregateRiskMoney=selected.expectedLossMoney;

   if(preliminary!=0 && preliminary!=direction)
      g_autoDirectionChangeReason="FINAL_RR_LOCATION_HISTORY_CHANGED_SIDE";

   g_autoDecisionReason=selected.reason;
   g_autoRejectReason="NONE";
   g_adaptiveBlockReason="";
   AutoPublishSelected(selected);
   g_cachedAdaptiveDirection=direction;
   g_cachedAdaptiveBlockReason="";

   Print("AUTO decision id=",g_autoDecisionId,
         " kind=",g_autoDecisionKind,
         " side=",direction>0 ? "BUY" : "SELL",
         " buy=",DoubleToString(g_autoBuy.rankScore,1),
         " sell=",DoubleToString(g_autoSell.rankScore,1),
         " confidence=",DoubleToString(selected.confidence,1),
         " winProb=",DoubleToString(selected.winProbability,1),
         " samples=",selected.winSamples,
         " rr=",DoubleToString(selected.rr,2),
         " reason=",selected.reason,
         " addReason=",g_autoAddReason,
         " change=",g_autoDirectionChangeReason);
   return direction;
}

void AutoOnOrderSent(int direction)
{
   AUTO_SIDE selected=direction>0 ? g_autoBuy : g_autoSell;
   if(g_autoBasketStartedAt<=0)
   {
      g_autoBasketStartedAt=TimeCurrent();
      g_autoBasketStopPrice=selected.slPrice;
      g_autoBasketTargetPrice=selected.tpPrice;
      g_autoPeakProfit=0.0;
   }
   else
   {
      // Adds may tighten risk, never widen the original Auto thesis.
      if(direction>0 && selected.slPrice>0.0)
         g_autoBasketStopPrice=MathMax(g_autoBasketStopPrice,selected.slPrice);
      else if(direction<0 && selected.slPrice>0.0)
         g_autoBasketStopPrice=
            g_autoBasketStopPrice<=0.0
               ? selected.slPrice
               : MathMin(g_autoBasketStopPrice,selected.slPrice);
   }
}

bool AutoManageOpenBasket(double momentum)
{
   if(!AutoEnabled() || BasketPositionCount()<=0 || BasketHasRacePosition())
      return false;
   int direction=BasketDirection();
   if(direction==0)
      return false;

   double atrPoints=MathMax(10.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod));
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return false;
   double exitPrice=direction>0 ? tick.bid : tick.ask;

   if(g_autoBasketStartedAt<=0)
      g_autoBasketStartedAt=TimeCurrent();

   if(g_autoBasketStopPrice>0.0)
   {
      bool stopHit=direction>0
         ? exitPrice<=g_autoBasketStopPrice
         : exitPrice>=g_autoBasketStopPrice;
      if(stopHit)
      {
         bool closed=CloseAllBasket("AUTO_STRUCTURE_STOP");
         if(closed) AutoResetCycle();
         g_executionStatus="AUTO_STRUCTURE_STOP";
         return true;
      }
   }

   if(g_autoBasketTargetPrice>0.0 && g_profitTargetMode=="AUTO")
   {
      bool targetHit=direction>0
         ? exitPrice>=g_autoBasketTargetPrice
         : exitPrice<=g_autoBasketTargetPrice;
      if(targetHit)
      {
         bool closed=CloseAllBasket("AUTO_MODERATE_TARGET");
         if(closed) AutoResetCycle();
         g_executionStatus="AUTO_MODERATE_TARGET";
         return true;
      }
   }

   double progress=BasketFavorableProgressPoints(direction);
   int opposite=-direction;
   int oppositeEvidence=0;
   if(g_trendM5==opposite) oppositeEvidence++;
   if(g_trendM1==opposite) oppositeEvidence++;
   if(g_emaTrendM5==opposite) oppositeEvidence++;
   if(MomentumSupportsDirection(opposite,momentum,0.35)) oppositeEvidence++;
   if(progress<=-atrPoints*0.18 && oppositeEvidence>=3)
   {
      bool closed=CloseAllBasket("AUTO_CONFIRMED_WRONG");
      if(closed) AutoResetCycle();
      g_executionStatus="AUTO_CONFIRMED_WRONG";
      return true;
   }

   double cycleProfit=BasketCycleProfit();
   if(cycleProfit>g_autoPeakProfit)
      g_autoPeakProfit=cycleProfit;
   double armProfit=MathMax(0.05,
      MathMax(g_autoBuy.expectedProfitMoney,g_autoSell.expectedProfitMoney)*0.35);
   if(g_profitTargetMode=="AUTO" &&
      g_autoPeakProfit>=armProfit &&
      cycleProfit>0.0)
   {
      double giveback=MathMax(0.05,g_autoPeakProfit*0.25);
      if(cycleProfit<=g_autoPeakProfit-giveback)
      {
         bool closed=CloseAllBasket("AUTO_PROFIT_GIVEBACK");
         if(closed) AutoResetCycle();
         g_executionStatus="AUTO_PROFIT_GIVEBACK";
         return true;
      }
   }

   long ageSeconds=(long)MathMax(0,TimeCurrent()-g_autoBasketStartedAt);
   bool flowStillValid=
      g_trendM5==direction ||
      MomentumSupportsDirection(direction,momentum,0.20);
   if(ageSeconds>=12*60 && cycleProfit>0.0 && !flowStillValid)
   {
      bool closed=CloseAllBasket("AUTO_TIME_BANK_PROFIT");
      if(closed) AutoResetCycle();
      g_executionStatus="AUTO_TIME_BANK_PROFIT";
      return true;
   }
   if(ageSeconds>=25*60 && cycleProfit<=0.0)
   {
      bool closed=CloseAllBasket("AUTO_TIME_STOP");
      if(closed) AutoResetCycle();
      g_executionStatus="AUTO_TIME_STOP";
      return true;
   }
   return false;
}
'@
Insert-BeforeRequired 'int AdaptiveEntryDirection(double momentum)' $autoFunctions 'int AutoPrecisionDirection(double momentum)' 'AUTO central decision engine'

$oldAutoDirection = @'
   int rawDirection = BrainV13SmartDirection(momentum);
   g_marketRegimeDetail = DetailedMarketRegime(momentum, rawDirection);
'@
$newAutoDirection = @'
   if(AutoEnabled())
   {
      int autoDirection=AutoPrecisionDirection(momentum);
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
'@
Replace-Required $oldAutoDirection $newAutoDirection 'route only controlMode AUTO into the central AUTO decision'

$oldCorrection = @'
      if(!tacticalBasket && BrainV8HandleBasketReversal(momentum))
         return;

      // Brain V13: first protect an entry that is objectively wrong. This is
      // not an entry gate; it only manages an already-open Basket.
      if(!tacticalBasket && BrainV13FastWrongEntryCorrection(momentum))
         return;
'@
$newCorrection = @'
      if(!tacticalBasket && AutoEnabled())
      {
         if(AutoManageOpenBasket(momentum))
            return;
      }
      else
      {
         if(!tacticalBasket && BrainV8HandleBasketReversal(momentum))
            return;

         // Legacy correction remains byte-for-byte behavior for non-AUTO modes.
         if(!tacticalBasket && BrainV13FastWrongEntryCorrection(momentum))
            return;
      }
'@
Replace-Required $oldCorrection $newCorrection 'AUTO-only basket management without changing legacy modes'

Replace-Required `
'   if(BasketFillEnabled() && count > 0 && !g_burstActive && count < g_maxPositions)' `
'   if(!AutoEnabled() && BasketFillEnabled() && count > 0 && !g_burstActive && count < g_maxPositions)' `
'disable legacy burst rearm only for AUTO'
Replace-Required `
'   if(BasketFillEnabled() && g_burstActive)' `
'   if(!AutoEnabled() && BasketFillEnabled() && g_burstActive)' `
'disable active burst queue only for AUTO'
Replace-Required `
'   if(BasketFillEnabled() && count > 0)' `
'   if(!AutoEnabled() && BasketFillEnabled() && count > 0)' `
'allow AUTO to re-evaluate every add'
Replace-Required `
'   if(count > 0 && !BasketFillEnabled() && !AdaptiveBasketAddAllowed(direction))' `
'   if(count > 0 && !AutoEnabled() && !BasketFillEnabled() && !AdaptiveBasketAddAllowed(direction))' `
'legacy add gate stays non-AUTO only'

$oldSend = @'
   bool sent = SendMarketOrder(direction);
   if(sent || (BasketFillEnabled() && !g_tacticalCountertrendActive))
   {
      RegisterOrderRequest();
      if(BasketFillEnabled() && !g_tacticalCountertrendActive)
         ArmBurst(direction);
   }
'@
$newSend = @'
   bool sent = SendMarketOrder(direction);
   if(sent && AutoEnabled())
      AutoOnOrderSent(direction);
   if(sent || (!AutoEnabled() && BasketFillEnabled() && !g_tacticalCountertrendActive))
   {
      RegisterOrderRequest();
      if(!AutoEnabled() && BasketFillEnabled() && !g_tacticalCountertrendActive)
         ArmBurst(direction);
   }
'@
Replace-Required $oldSend $newSend 'AUTO sends one re-evaluated order at a time'

$oldTimerTester = @'
   if(MQLInfoInteger(MQL_TESTER))
   {
      BrainV16RearmExistingBasket();
      ProcessBurstQueue();
      RefreshChartStatus();
      return;
   }
'@
$newTimerTester = @'
   if(MQLInfoInteger(MQL_TESTER))
   {
      if(!AutoEnabled())
      {
         BrainV16RearmExistingBasket();
         ProcessBurstQueue();
      }
      RefreshChartStatus();
      return;
   }
'@
Replace-Required $oldTimerTester $newTimerTester 'tester timer preserves legacy burst outside AUTO'

$oldTimerLive = @'
   FlushPendingBasketJournal();
   BrainV16RearmExistingBasket();
   ProcessBurstQueue();
   RefreshChartStatus();
'@
$newTimerLive = @'
   FlushPendingBasketJournal();
   if(!AutoEnabled())
   {
      BrainV16RearmExistingBasket();
      ProcessBurstQueue();
   }
   RefreshChartStatus();
'@
Replace-Required $oldTimerLive $newTimerLive 'live timer preserves legacy burst outside AUTO'

$oldFlatReset = @'
   else
   {
      ResetTrail();
      ResetBasketCycleState();
      if(g_state == STATE_SAFE_STOP)
'@
$newFlatReset = @'
   else
   {
      ResetTrail();
      ResetBasketCycleState();
      if(AutoEnabled())
         AutoResetCycle();
      if(g_state == STATE_SAFE_STOP)
'@
Replace-Required $oldFlatReset $newFlatReset 'reset AUTO cycle only when flat'

foreach($sentinel in @(
  '#property version   "1.059"',
  'struct AUTO_SIDE',
  'bool AutoEnabled()',
  'int AutoPrecisionDirection(double momentum)',
  'AutoScanM5Levels',
  'AutoEvaluatePullback',
  'AutoUpdateTrendPhase',
  'AUTO_WAIT_CONFLICT',
  'ADD_EXCEEDS_USER_BASKET_RISK',
  'AUTO_MODERATE_TARGET',
  'requestedControlMode = JsonString(json, "controlMode"',
  'if(!AutoEnabled() && BasketFillEnabled() && g_burstActive)',
  'if(sent && AutoEnabled())'
)) {
  if(-not $text.Contains($sentinel)) { throw "AUTO sentinel missing: $sentinel" }
}

[System.IO.File]::WriteAllText((Resolve-Path $EaPath),$text,[System.Text.UTF8Encoding]::new($false))
Write-Host "AUTO-only precision refactor patch complete: $EaPath"
