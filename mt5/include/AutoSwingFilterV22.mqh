// AUTO V22 swing-quality filter and R-based protection.
// Scope contract: these helpers are called only from AUTO V20/V21 paths.
// They do not change RACE, COUNTER, ZERO_GRID, FLIP_LOCK or MANUAL behavior.
#ifndef __SCENOVA_AUTO_V22_SWING_FILTER_MQH__
#define __SCENOVA_AUTO_V22_SWING_FILTER_MQH__

#define AUTO_V22_NEWS_BEFORE_MINUTES 20
#define AUTO_V22_NEWS_AFTER_MINUTES 15

int g_autoV22EmaH1_50 = INVALID_HANDLE;
int g_autoV22EmaH1_100 = INVALID_HANDLE;
int g_autoV22EmaH4_50 = INVALID_HANDLE;
int g_autoV22EmaH4_100 = INVALID_HANDLE;
double g_autoV22InitialRiskPoints = 0.0;
string g_autoV22LastFilterReason = "INITIALIZING";
datetime g_autoV22LastNewsCheckAt = 0;
bool g_autoV22CachedNewsPause = false;
string g_autoV22CachedNewsReason = "NONE";

string AutoV22RiskStateKey()
{
   return StringFormat(
      "SCN_A22_R_%I64d_%s_%I64d",
      AccountInfoInteger(ACCOUNT_LOGIN),
      _Symbol,
      InpMagic
   );
}

void AutoV22ResetRiskState()
{
   g_autoV22InitialRiskPoints=0.0;
   string key=AutoV22RiskStateKey();
   if(GlobalVariableCheck(key))
      GlobalVariableDel(key);
}

void AutoV22SetInitialRisk(double entryPrice,double stopPrice)
{
   if(g_autoV22InitialRiskPoints>0.0 || entryPrice<=0.0 || stopPrice<=0.0)
      return;
   double risk=MathAbs(entryPrice-stopPrice)/MathMax(_Point,0.00000001);
   if(risk<=0.0)
      return;
   g_autoV22InitialRiskPoints=risk;
   GlobalVariableSet(AutoV22RiskStateKey(),risk);
}

double AutoV22InitialRisk()
{
   if(g_autoV22InitialRiskPoints>0.0)
      return g_autoV22InitialRiskPoints;
   string key=AutoV22RiskStateKey();
   if(GlobalVariableCheck(key))
      g_autoV22InitialRiskPoints=MathMax(0.0,GlobalVariableGet(key));
   return g_autoV22InitialRiskPoints;
}

void AutoV22RecoverInitialRisk(int direction)
{
   if(AutoV22InitialRisk()>0.0 || direction==0)
      return;

   double weighted=0.0;
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),AUTO_V20_LIVE_COMMENT)<0)
         continue;

      long type=PositionGetInteger(POSITION_TYPE);
      int posDirection=type==POSITION_TYPE_BUY ? 1 : -1;
      if(posDirection!=direction)
         continue;

      double volume=PositionGetDouble(POSITION_VOLUME);
      if(volume<=0.0)
         continue;
      weighted+=PositionGetDouble(POSITION_PRICE_OPEN)*volume;
      total+=volume;
   }

   double entry=total>0.0 ? weighted/total : 0.0;
   if(entry<=0.0 || g_autoV20BasketStopPrice<=0.0)
      return;
   AutoV22SetInitialRisk(entry,g_autoV20BasketStopPrice);
}

bool AutoV22EnsureEmaHandles()
{
   if(g_autoV22EmaH1_50==INVALID_HANDLE)
      g_autoV22EmaH1_50=iMA(_Symbol,PERIOD_H1,50,0,MODE_EMA,PRICE_CLOSE);
   if(g_autoV22EmaH1_100==INVALID_HANDLE)
      g_autoV22EmaH1_100=iMA(_Symbol,PERIOD_H1,100,0,MODE_EMA,PRICE_CLOSE);
   if(g_autoV22EmaH4_50==INVALID_HANDLE)
      g_autoV22EmaH4_50=iMA(_Symbol,PERIOD_H4,50,0,MODE_EMA,PRICE_CLOSE);
   if(g_autoV22EmaH4_100==INVALID_HANDLE)
      g_autoV22EmaH4_100=iMA(_Symbol,PERIOD_H4,100,0,MODE_EMA,PRICE_CLOSE);

   return g_autoV22EmaH1_50!=INVALID_HANDLE &&
      g_autoV22EmaH1_100!=INVALID_HANDLE &&
      g_autoV22EmaH4_50!=INVALID_HANDLE &&
      g_autoV22EmaH4_100!=INVALID_HANDLE;
}

void AutoV22Release()
{
   if(g_autoV22EmaH1_50!=INVALID_HANDLE) IndicatorRelease(g_autoV22EmaH1_50);
   if(g_autoV22EmaH1_100!=INVALID_HANDLE) IndicatorRelease(g_autoV22EmaH1_100);
   if(g_autoV22EmaH4_50!=INVALID_HANDLE) IndicatorRelease(g_autoV22EmaH4_50);
   if(g_autoV22EmaH4_100!=INVALID_HANDLE) IndicatorRelease(g_autoV22EmaH4_100);
   g_autoV22EmaH1_50=INVALID_HANDLE;
   g_autoV22EmaH1_100=INVALID_HANDLE;
   g_autoV22EmaH4_50=INVALID_HANDLE;
   g_autoV22EmaH4_100=INVALID_HANDLE;
}

bool AutoV22EmaValue(int handle,int shift,double &value)
{
   value=0.0;
   if(handle==INVALID_HANDLE)
      return false;
   double buffer[];
   ArraySetAsSeries(buffer,true);
   if(CopyBuffer(handle,0,shift,1,buffer)<1)
      return false;
   value=buffer[0];
   return value>0.0;
}

int AutoV22TrendDirection(
   double closePrice,
   double ema50,
   double ema100,
   double ema100Past
)
{
   int bull=0,bear=0;
   if(closePrice>ema100) bull++; else if(closePrice<ema100) bear++;
   if(ema50>ema100) bull++; else if(ema50<ema100) bear++;
   if(ema100>ema100Past) bull++; else if(ema100<ema100Past) bear++;

   if(bull>=2 && bull>bear) return 1;
   if(bear>=2 && bear>bull) return -1;
   return 0;
}

bool AutoV22MajorNewsName(string name)
{
   string upper=name;
   StringToUpper(upper);
   return StringFind(upper,"NONFARM")>=0 ||
      StringFind(upper,"NON-FARM")>=0 ||
      StringFind(upper,"NFP")>=0 ||
      StringFind(upper,"EMPLOYMENT CHANGE")>=0 ||
      StringFind(upper,"CONSUMER PRICE")>=0 ||
      StringFind(upper,"CPI")>=0 ||
      StringFind(upper,"FOMC")>=0 ||
      StringFind(upper,"FEDERAL FUNDS")>=0 ||
      StringFind(upper,"INTEREST RATE")>=0 ||
      StringFind(upper,"RATE DECISION")>=0 ||
      StringFind(upper,"PCE")>=0 ||
      StringFind(upper,"FED CHAIR")>=0 ||
      StringFind(upper,"POWELL")>=0;
}

bool AutoV22MajorNewsPause(string &reasonOut)
{
   reasonOut="NONE";
   if(MQLInfoInteger(MQL_TESTER))
      return false;

   datetime now=TimeTradeServer();
   if(now<=0) now=TimeCurrent();

   if(g_autoV22LastNewsCheckAt>0 &&
      now-g_autoV22LastNewsCheckAt<30)
   {
      reasonOut=g_autoV22CachedNewsReason;
      return g_autoV22CachedNewsPause;
   }
   g_autoV22LastNewsCheckAt=now;
   g_autoV22CachedNewsPause=false;
   g_autoV22CachedNewsReason="NONE";

   string currency=SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
   if(currency=="") currency="USD";

   MqlCalendarValue values[];
   int count=CalendarValueHistory(values,now-1200,now+3600,"",currency);
   if(count<=0)
      return false;

   int nearest=1000000;
   string nearestName="NONE";
   for(int i=0;i<count;i++)
   {
      MqlCalendarEvent event;
      if(!CalendarEventById(values[i].event_id,event))
         continue;
      if(event.importance!=CALENDAR_IMPORTANCE_HIGH)
         continue;
      if(!AutoV22MajorNewsName(event.name))
         continue;

      int minutes=(int)MathRound((double)(values[i].time-now)/60.0);
      bool inside=minutes>=0
         ? minutes<=AUTO_V22_NEWS_BEFORE_MINUTES
         : MathAbs(minutes)<=AUTO_V22_NEWS_AFTER_MINUTES;
      if(!inside)
         continue;

      int absMinutes=MathAbs(minutes);
      if(absMinutes<nearest)
      {
         nearest=absMinutes;
         nearestName=event.name;
      }
   }

   if(nearest==1000000)
      return false;

   g_autoV22CachedNewsPause=true;
   g_autoV22CachedNewsReason="AUTO_V22_MAJOR_NEWS_"+nearestName;
   reasonOut=g_autoV22CachedNewsReason;
   return true;
}

bool AutoV22StrongExecutionConfirmation(
   int direction,
   double momentum,
   AUTO_V20_PULLBACK &pb
)
{
   if(direction==0)
      return false;

   string pattern=direction>0 ? g_priceActionBuy : g_priceActionSell;
   double patternScore=direction>0 ? g_priceActionBuyScore : g_priceActionSellScore;
   bool namedPattern=
      StringFind(pattern,"ENGULFING")>=0 ||
      StringFind(pattern,"PINBAR")>=0 ||
      StringFind(pattern,"REJECTION")>=0 ||
      StringFind(pattern,"BREAK_RETEST")>=0;

   bool strongPattern=namedPattern && patternScore>=27.0;
   bool m5Confirm=
      BrainV8ConfirmationCandleReady(direction) &&
      g_trendM5==direction &&
      MomentumSupportsDirection(direction,momentum,0.22);
   bool pullbackResume=
      pb.resumed &&
      (RecentDirectionalBody(direction,PERIOD_M5) ||
       (RecentDirectionalBody(direction,PERIOD_M1) &&
        MomentumSupportsDirection(direction,momentum,0.18)));

   return strongPattern || m5Confirm || pullbackResume;
}

bool AutoV22SwingEntryAllowed(
   int direction,
   bool isAdd,
   bool sharedZoneFirst,
   AUTO_V20_PULLBACK &pb,
   AUTO_V20_LEVELS &levels,
   double momentum,
   string &reasonOut
)
{
   reasonOut="NONE";
   g_autoV22LastFilterReason="CHECKING";
   if(direction==0)
   {
      reasonOut="AUTO_V22_NO_DIRECTION";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   string newsReason="NONE";
   if(AutoV22MajorNewsPause(newsReason))
   {
      reasonOut="AUTO_V22_MAJOR_NEWS_WAIT";
      g_autoV22LastFilterReason=newsReason;
      return false;
   }

   if(!AutoV22EnsureEmaHandles())
   {
      reasonOut="AUTO_V22_EMA_NOT_READY";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   MqlRates h4[];
   MqlRates h1[];
   ArraySetAsSeries(h4,true);
   ArraySetAsSeries(h1,true);
   if(CopyRates(_Symbol,PERIOD_H4,1,4,h4)<4 ||
      CopyRates(_Symbol,PERIOD_H1,1,4,h1)<4)
   {
      reasonOut="AUTO_V22_HTF_DATA_NOT_READY";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   double h4e50=0.0,h4e100=0.0,h4e100Past=0.0;
   double h1e50=0.0,h1e100=0.0,h1e100Past=0.0;
   if(!AutoV22EmaValue(g_autoV22EmaH4_50,1,h4e50) ||
      !AutoV22EmaValue(g_autoV22EmaH4_100,1,h4e100) ||
      !AutoV22EmaValue(g_autoV22EmaH4_100,4,h4e100Past) ||
      !AutoV22EmaValue(g_autoV22EmaH1_50,1,h1e50) ||
      !AutoV22EmaValue(g_autoV22EmaH1_100,1,h1e100) ||
      !AutoV22EmaValue(g_autoV22EmaH1_100,4,h1e100Past))
   {
      reasonOut="AUTO_V22_EMA_BUFFER_NOT_READY";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   int h4Direction=AutoV22TrendDirection(h4[0].close,h4e50,h4e100,h4e100Past);
   int h1Direction=AutoV22TrendDirection(h1[0].close,h1e50,h1e100,h1e100Past);

   // H4 is the hard directional anchor. AUTO cannot enter against it.
   if(h4Direction!=direction)
   {
      reasonOut=h4Direction==0
         ? "AUTO_V22_H4_TREND_UNCLEAR"
         : "AUTO_V22_H4_TREND_OPPOSITE";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      reasonOut="AUTO_V22_NO_TICK";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }
   double price=(tick.bid+tick.ask)*0.5;
   double atrH1=MathMax(_Point*20.0,
      AverageTrueRangePoints(PERIOD_H1,g_atrPeriod)*_Point);

   bool correctSide100=direction>0 ? price>h1e100 : price<h1e100;
   if(!correctSide100 || h1Direction==-direction)
   {
      reasonOut="AUTO_V22_H1_NOT_ALIGNED";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   double distanceEma50=MathAbs(price-h1e50);
   bool ema50ValueArea=distanceEma50<=atrH1*0.70;
   bool h1TouchedValue=direction>0
      ? (h1[0].low<=h1e50+atrH1*0.18 && h1[0].close>h1e100)
      : (h1[0].high>=h1e50-atrH1*0.18 && h1[0].close<h1e100);
   bool roleFlip=direction>0
      ? levels.roleFlipState=="RESISTANCE_TO_SUPPORT"
      : levels.roleFlipState=="SUPPORT_TO_RESISTANCE";
   bool setupLocation=
      ema50ValueArea ||
      h1TouchedValue ||
      pb.resumed ||
      sharedZoneFirst ||
      roleFlip;

   if(!setupLocation)
   {
      reasonOut="AUTO_V22_WAIT_PULLBACK_VALUE";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   if(!AutoV22StrongExecutionConfirmation(direction,momentum,pb))
   {
      reasonOut="AUTO_V22_WAIT_M5_M1_CONFIRM";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   // Do not open directly into a nearby opposing M5 reaction level.
   double opposingRoomAtr=direction>0
      ? levels.nearestResistanceDistanceAtr
      : levels.nearestSupportDistanceAtr;
   if(opposingRoomAtr>0.0 && opposingRoomAtr<0.20 && !roleFlip)
   {
      reasonOut="AUTO_V22_OPPOSING_LEVEL_TOO_CLOSE";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   if(isAdd && !AutoV20ZoneStructureIntact(direction))
   {
      reasonOut="AUTO_V22_ADD_STRUCTURE_NOT_INTACT";
      g_autoV22LastFilterReason=reasonOut;
      return false;
   }

   g_autoV22LastFilterReason="AUTO_V22_QUALITY_CONFIRMED";
   return true;
}

double AutoV22AddRequiredProgressPoints(double atrPoints)
{
   double required=MathMax(3.0,atrPoints*0.20);
   double initialRisk=AutoV22InitialRisk();
   if(initialRisk>0.0)
      required=MathMax(required,initialRisk*0.35);
   return required;
}

double AutoV22StepProtectedStop(
   int direction,
   double openPrice,
   double marketPrice,
   double currentSL
)
{
   if(direction==0 || openPrice<=0.0 || marketPrice<=0.0)
      return currentSL;

   double riskPoints=AutoV22InitialRisk();
   if(riskPoints<=0.0)
      return currentSL;

   double progressPoints=direction>0
      ? (marketPrice-openPrice)/_Point
      : (openPrice-marketPrice)/_Point;
   if(progressPoints<riskPoints)
      return currentSL;

   double rMultiple=progressPoints/riskPoints;
   double spreadBuffer=MathMax(2.0,CurrentSpreadPoints()*1.20);
   double lockedPoints=spreadBuffer;

   if(rMultiple>=1.50)
   {
      double lockedR=MathFloor((rMultiple-1.0)/0.50)*0.50;
      lockedR=MathMax(0.50,MathMin(lockedR,rMultiple-0.50));
      lockedPoints=MathMax(lockedPoints,lockedR*riskPoints);
   }

   double stepStop=direction>0
      ? openPrice+lockedPoints*_Point
      : openPrice-lockedPoints*_Point;

   if(currentSL<=0.0)
      return stepStop;
   return direction>0
      ? MathMax(currentSL,stepStop)
      : MathMin(currentSL,stepStop);
}

#endif
