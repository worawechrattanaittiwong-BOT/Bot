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
// Brain V20 AUTO-only decision context -------------------------------------
// These structures are intentionally isolated from RACE/Turbo and the legacy
// ASSISTED/MANUAL execution paths. AUTO evaluates BUY and SELL independently
// and publishes only the selected side into the shared execution telemetry.
struct AUTO_V20_LEVELS
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

struct AUTO_V20_PULLBACK
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

struct AUTO_V20_SIDE
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
Insert-BeforeRequired 'enum ENUM_BOT_STATE' $autoTypes 'struct AUTO_V20_SIDE' 'AUTO V20 analysis types'

$autoGlobals = @'
string g_controlMode = "AUTO";
AUTO_V20_LEVELS g_autoV20Levels;
AUTO_V20_SIDE g_autoV20Buy;
AUTO_V20_SIDE g_autoV20Sell;
string g_autoV20Phase = "INITIALIZING";
string g_autoV20PhaseCandidate = "INITIALIZING";
int g_autoV20PhaseCandidateTicks = 0;
datetime g_autoV20PhaseSince = 0;
double g_autoV20LastMomentum = 0.0;
double g_autoV20PreviousMomentum = 0.0;
long g_autoV20DecisionId = 0;
string g_autoV20DecisionKind = "NONE";
string g_autoV20DecisionReason = "NONE";
string g_autoV20RejectReason = "NONE";
string g_autoV20DirectionChangeReason = "NONE";
string g_autoV20AddReason = "NONE";
double g_autoV20AggregateRiskMoney = 0.0;
double g_autoV20BasketStopPrice = 0.0;
double g_autoV20BasketTargetPrice = 0.0;
datetime g_autoV20BasketStartedAt = 0;
double g_autoV20PeakProfit = 0.0;
double g_autoV20Confidence = 0.0;
double g_autoV20WinProbability = 0.0;
int g_autoV20WinSamples = 0;
double g_autoV20AverageNet = 0.0;
'@
Insert-AfterRequired 'string g_engineMode = "AUTO";' $autoGlobals 'g_autoV20DecisionId' 'AUTO V20 runtime state'

$controlModeSettings = @'
   string requestedControlMode = JsonString(json, "controlMode", g_controlMode);
   StringToUpper(requestedControlMode);
   if(requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||
      requestedControlMode == "ASSISTED" || requestedControlMode == "MANUAL")
      g_controlMode = requestedControlMode;

'@
Insert-BeforeRequired '   string mode = JsonString(json, "entryMode", "");' $controlModeSettings 'requestedControlMode = JsonString(json, "controlMode"' 'apply controlMode to EA runtime'

$autoFunctions = @'
// Brain V20 AUTO Precision --------------------------------------------------
// Scope contract: V20 runs ONLY when the website controlMode is AUTO and the
// isolated RACE engine is not active. Other modes continue through the exact
// legacy V19/V18/V16 paths below this block.
bool AutoV20Enabled()
{
   return g_engineMode != "RACE" && g_controlMode == "AUTO";
}

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
   targetDistance=AutoV20Clamp(targetDistance,atrPrice*0.28,atrPrice*0.90);

   side.slPrice=side.direction>0
      ? side.entryPrice-stopDistance
      : side.entryPrice+stopDistance;
   side.tpPrice=side.direction>0
      ? side.entryPrice+targetDistance
      : side.entryPrice-targetDistance;

   double grossProfit=MathAbs(AutoV20ProfitForMove(
      side.direction,g_lot,side.entryPrice,side.tpPrice));
   double grossLoss=MathAbs(AutoV20ProfitForMove(
      side.direction,g_lot,side.entryPrice,side.slPrice));
   side.rr=grossLoss>0.0 ? grossProfit/grossLoss : 0.0;

   double sizeFactor=0.50;
   if(side.rr>=1.55 && side.confidence>=76.0) sizeFactor=1.00;
   else if(side.rr>=1.20 && side.confidence>=67.0) sizeFactor=0.75;
   side.plannedLot=NormalizeTradeVolume(g_lot*sizeFactor);
   if(side.plannedLot<=0.0)
      side.plannedLot=NormalizeTradeVolume(g_lot);

   side.expectedProfitMoney=MathAbs(AutoV20ProfitForMove(
      side.direction,side.plannedLot,side.entryPrice,side.tpPrice));
   side.expectedLossMoney=MathAbs(AutoV20ProfitForMove(
      side.direction,side.plannedLot,side.entryPrice,side.slPrice));
   side.knownCostMoney=CurrentSpreadCost(side.plannedLot);
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

   if(selected.rr<1.05)
   {
      g_autoV20RejectReason="RR_BELOW_1_05";
      g_adaptiveBlockReason="AUTO_V20_WAIT_RR";
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
      );
      g_autoV20AggregateRiskMoney=selected.aggregateRiskMoney;
      if(g_maxBasketLoss>0.0 && selected.aggregateRiskMoney>g_maxBasketLoss)
      {
         g_autoV20RejectReason="ADD_EXCEEDS_USER_BASKET_RISK";
         g_adaptiveBlockReason="AUTO_V20_RISK_LIMIT";
         return 0;
      }
   }
   else
      g_autoV20AggregateRiskMoney=selected.expectedLossMoney;

   if(preliminary!=0 && preliminary!=direction)
      g_autoV20DirectionChangeReason="FINAL_RR_LOCATION_HISTORY_CHANGED_SIDE";

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

bool AutoV20ManageOpenBasket(double momentum)
{
   if(!AutoV20Enabled() || BasketPositionCount()<=0 || BasketHasRacePosition())
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

   if(g_autoV20BasketStartedAt<=0)
      g_autoV20BasketStartedAt=TimeCurrent();

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
      g_autoV20PeakProfit>=armProfit &&
      cycleProfit>0.0)
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
'@
Insert-BeforeRequired 'int AdaptiveEntryDirection(double momentum)' $autoFunctions 'int AutoV20PrecisionDirection(double momentum)' 'AUTO V20 central decision engine'

$oldAutoDirection = @'
   int rawDirection = BrainV13SmartDirection(momentum);
   g_marketRegimeDetail = DetailedMarketRegime(momentum, rawDirection);
'@
$newAutoDirection = @'
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
'@
Replace-Required $oldAutoDirection $newAutoDirection 'route only controlMode AUTO into V20 central decision'

$oldCorrection = @'
      if(!tacticalBasket && BrainV8HandleBasketReversal(momentum))
         return;

      // Brain V13: first protect an entry that is objectively wrong. This is
      // not an entry gate; it only manages an already-open Basket.
      if(!tacticalBasket && BrainV13FastWrongEntryCorrection(momentum))
         return;
'@
$newCorrection = @'
      if(!tacticalBasket && AutoV20Enabled())
      {
         if(AutoV20ManageOpenBasket(momentum))
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
'   if(!AutoV20Enabled() && BasketFillEnabled() && count > 0 && !g_burstActive && count < g_maxPositions)' `
'disable legacy burst rearm only for AUTO V20'
Replace-Required `
'   if(BasketFillEnabled() && g_burstActive)' `
'   if(!AutoV20Enabled() && BasketFillEnabled() && g_burstActive)' `
'disable active burst queue only for AUTO V20'
Replace-Required `
'   if(BasketFillEnabled() && count > 0)' `
'   if(!AutoV20Enabled() && BasketFillEnabled() && count > 0)' `
'allow AUTO V20 to re-evaluate every add'
Replace-Required `
'   if(count > 0 && !BasketFillEnabled() && !AdaptiveBasketAddAllowed(direction))' `
'   if(count > 0 && !AutoV20Enabled() && !BasketFillEnabled() && !AdaptiveBasketAddAllowed(direction))' `
'legacy add gate stays non-AUTO V20 only'

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
   if(sent && AutoV20Enabled())
      AutoV20OnOrderSent(direction);
   if(sent || (!AutoV20Enabled() && BasketFillEnabled() && !g_tacticalCountertrendActive))
   {
      RegisterOrderRequest();
      if(!AutoV20Enabled() && BasketFillEnabled() && !g_tacticalCountertrendActive)
         ArmBurst(direction);
   }
'@
Replace-Required $oldSend $newSend 'AUTO V20 sends one re-evaluated order at a time'

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
      if(!AutoV20Enabled())
      {
         BrainV16RearmExistingBasket();
         ProcessBurstQueue();
      }
      RefreshChartStatus();
      return;
   }
'@
Replace-Required $oldTimerTester $newTimerTester 'tester timer preserves legacy burst outside AUTO V20'

$oldTimerLive = @'
   FlushPendingBasketJournal();
   BrainV16RearmExistingBasket();
   ProcessBurstQueue();
   RefreshChartStatus();
'@
$newTimerLive = @'
   FlushPendingBasketJournal();
   if(!AutoV20Enabled())
   {
      BrainV16RearmExistingBasket();
      ProcessBurstQueue();
   }
   RefreshChartStatus();
'@
Replace-Required $oldTimerLive $newTimerLive 'live timer preserves legacy burst outside AUTO V20'

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
      if(AutoV20Enabled())
         AutoV20ResetCycle();
      if(g_state == STATE_SAFE_STOP)
'@
Replace-Required $oldFlatReset $newFlatReset 'reset AUTO V20 cycle only when flat'

foreach($sentinel in @(
  '#property version   "1.059"',
  'struct AUTO_V20_SIDE',
  'bool AutoV20Enabled()',
  'int AutoV20PrecisionDirection(double momentum)',
  'AutoV20ScanM5Levels',
  'AutoV20EvaluatePullback',
  'AutoV20UpdateTrendPhase',
  'AUTO_V20_WAIT_CONFLICT',
  'ADD_EXCEEDS_USER_BASKET_RISK',
  'AUTO_V20_MODERATE_TARGET',
  'requestedControlMode = JsonString(json, "controlMode"',
  'if(!AutoV20Enabled() && BasketFillEnabled() && g_burstActive)',
  'if(sent && AutoV20Enabled())'
)) {
  if(-not $text.Contains($sentinel)) { throw "V20 sentinel missing: $sentinel" }
}

[System.IO.File]::WriteAllText((Resolve-Path $EaPath),$text,[System.Text.UTF8Encoding]::new($false))
Write-Host "Brain V20 AUTO-only precision refactor patch complete: $EaPath"
