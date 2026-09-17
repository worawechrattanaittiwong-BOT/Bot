#ifndef SCENOVA_FLIP_LOCK_V1_MQH
#define SCENOVA_FLIP_LOCK_V1_MQH

#define FLIP_LOCK_V1_VERSION "1.0.0"
#define FLIP_LOCK_MAX_FLIPS 6
#define FLIP_LOCK_COOLDOWN_SECONDS 8

int g_flipLockDirection=0;
double g_flipLockPeakPrice=0.0;
double g_flipLockTriggerPrice=0.0;
bool g_flipLockArmed=false;
int g_flipLockFlipCount=0;
datetime g_flipLockLastFlipAt=0;
datetime g_flipLockLastFlatAt=0;
string g_flipLockReason="IDLE";

bool FlipLockModeEnabled()
{
   string mode=g_controlMode;
   StringToUpper(mode);
   return mode=="FLIP_LOCK";
}

void FlipLockResetTracking(const bool resetCounter)
{
   g_flipLockDirection=0;
   g_flipLockPeakPrice=0.0;
   g_flipLockTriggerPrice=0.0;
   g_flipLockArmed=false;
   g_flipLockReason="IDLE";
   if(resetCounter) g_flipLockFlipCount=0;
}

double FlipLockProtectedProfitMinimum()
{
   double lot=MathMax(0.01,NormalizeTradeVolume(g_lot));
   double executionReserve=MathMax(0.0,CurrentSpreadCost(lot))*2.5;
   return MathMax(0.50,executionReserve);
}

double FlipLockTrailDistancePoints()
{
   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0) spread=5.0;
   double atr=AverageTrueRangePoints(PERIOD_M1,MathMax(5,g_atrPeriod));
   if(atr<=0.0) atr=spread*4.0;
   return MathMax(10.0,MathMax(spread*3.0,atr*0.25));
}

bool FlipLockCloseOwnedPositions()
{
   bool allClosed=true;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;

      string comment=PositionGetString(POSITION_COMMENT);
      if(StringFind(comment,"SaaSRace")>=0 || StringFind(comment,"SCNRescue")>=0)
         continue;

      if(!ClosePositionByTicket(ticket)) allClosed=false;
   }
   return allClosed;
}

bool FlipLockOpenOpposite(const int oldDirection)
{
   if(oldDirection==0 || BasketPositionCount()!=0) return false;
   if(g_state!=STATE_RUNNING || !g_access || !g_runAuthorized) return false;
   if(!EntryLeaseValid() || TradePermissionStatus()!="OK") return false;

   int nextDirection=-oldDirection;
   bool sent=SendMarketOrder(nextDirection);
   if(sent)
   {
      RegisterOrderRequest();
      g_flipLockFlipCount++;
      g_flipLockLastFlipAt=TimeCurrent();
      g_flipLockDirection=nextDirection;
      g_flipLockPeakPrice=0.0;
      g_flipLockTriggerPrice=0.0;
      g_flipLockArmed=false;
      g_flipLockReason="FLIPPED";
      g_executionStatus=nextDirection>0 ? "FLIP_LOCK_BUY" : "FLIP_LOCK_SELL";
   }
   return sent;
}

void FlipLockManage()
{
   if(!FlipLockModeEnabled())
   {
      FlipLockResetTracking(true);
      return;
   }

   int count=BasketPositionCount();
   if(count<=0)
   {
      if(g_flipLockLastFlatAt<=0) g_flipLockLastFlatAt=TimeCurrent();
      if(TimeCurrent()-g_flipLockLastFlatAt>=30) FlipLockResetTracking(true);
      return;
   }
   g_flipLockLastFlatAt=0;

   // Production contract: FLIP LOCK is intentionally single-position only.
   if(count!=1)
   {
      g_flipLockReason="WAIT_SINGLE_POSITION";
      g_executionStatus="FLIP_LOCK_WAIT_SINGLE_POSITION";
      return;
   }

   int direction=BasketDirection();
   if(direction==0) return;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick)) return;
   double executablePrice=direction>0 ? tick.bid : tick.ask;

   if(g_flipLockDirection!=direction)
   {
      g_flipLockDirection=direction;
      g_flipLockPeakPrice=executablePrice;
      g_flipLockTriggerPrice=0.0;
      g_flipLockArmed=false;
   }

   if(direction>0) g_flipLockPeakPrice=MathMax(g_flipLockPeakPrice,executablePrice);
   else g_flipLockPeakPrice=(g_flipLockPeakPrice<=0.0)
      ? executablePrice
      : MathMin(g_flipLockPeakPrice,executablePrice);

   double profit=BasketProfit();
   if(profit<FlipLockProtectedProfitMinimum())
   {
      g_flipLockReason="WAIT_PROTECTED_PROFIT";
      return;
   }

   double distance=FlipLockTrailDistancePoints()*_Point;
   double candidate=direction>0
      ? g_flipLockPeakPrice-distance
      : g_flipLockPeakPrice+distance;

   if(!g_flipLockArmed)
   {
      g_flipLockTriggerPrice=candidate;
      g_flipLockArmed=true;
   }
   else if(direction>0)
      g_flipLockTriggerPrice=MathMax(g_flipLockTriggerPrice,candidate);
   else
      g_flipLockTriggerPrice=MathMin(g_flipLockTriggerPrice,candidate);

   g_flipLockReason="ARMED";
   g_executionStatus="FLIP_LOCK_ARMED";

   bool hit=direction>0
      ? executablePrice<=g_flipLockTriggerPrice
      : executablePrice>=g_flipLockTriggerPrice;
   if(!hit) return;

   if(g_flipLockFlipCount>=FLIP_LOCK_MAX_FLIPS)
   {
      g_flipLockReason="MAX_FLIPS_REACHED";
      g_executionStatus="FLIP_LOCK_MAX_FLIPS";
      return;
   }
   if(g_flipLockLastFlipAt>0 &&
      TimeCurrent()-g_flipLockLastFlipAt<FLIP_LOCK_COOLDOWN_SECONDS)
      return;

   int oldDirection=direction;
   g_flipLockReason="FLIPPING";
   g_executionStatus="FLIP_LOCK_FLIPPING";

   if(!FlipLockCloseOwnedPositions())
   {
      g_flipLockReason="CLOSE_RETRY";
      return;
   }
   if(BasketPositionCount()!=0)
   {
      g_flipLockReason="WAIT_CLOSE_CONFIRM";
      return;
   }

   FlipLockOpenOpposite(oldDirection);
}

#endif
