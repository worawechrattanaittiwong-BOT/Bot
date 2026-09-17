#ifndef SCENOVA_LIVE_EXECUTION_MODES_V1_MQH
#define SCENOVA_LIVE_EXECUTION_MODES_V1_MQH

// Dedicated execution owners. These paths are mutually exclusive with
// AUTO/RACE/ZERO_GRID/ASSISTED/MANUAL through EffectiveExecutionMode().
#define LIVE_INTELLIGENCE_MODES_V1_VERSION "1.0.0"
#define FLIP_LOCK_MAX_FLIPS_PER_CYCLE 6
#define FLIP_LOCK_COOLDOWN_MS 2000
#define PARALLEL_UNIVERSE_MIN_SAMPLES 30

string g_flipLockState = "IDLE";
int    g_flipLockDirection = 0;
int    g_flipLockPendingDirection = 0;
int    g_flipLockFlips = 0;
double g_flipLockExtremePrice = 0.0;
double g_flipLockTriggerPrice = 0.0;
double g_flipLockPendingLot = 0.0;
ulong  g_flipLockLastActionMs = 0;

string g_parallelUniverseState = "IDLE";
double g_parallelUniverseBuyEV = 0.0;
double g_parallelUniverseSellEV = 0.0;
int    g_parallelUniverseDirection = 0;

bool FlipLockModeEnabled()
{
   return EffectiveExecutionMode() == "FLIP_LOCK";
}

bool ParallelUniverseModeEnabled()
{
   return EffectiveExecutionMode() == "PARALLEL_UNIVERSE";
}

double FlipLockCurrentVolume()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      return PositionGetDouble(POSITION_VOLUME);
   }
   return NormalizeTradeVolume(g_lot);
}

void FlipLockResetCycle()
{
   g_flipLockState="IDLE";
   g_flipLockDirection=0;
   g_flipLockPendingDirection=0;
   g_flipLockFlips=0;
   g_flipLockExtremePrice=0.0;
   g_flipLockTriggerPrice=0.0;
   g_flipLockPendingLot=0.0;
   g_flipLockLastActionMs=0;
}

double FlipLockDistancePoints()
{
   double atr=MathMax(1.0,AverageTrueRangePoints(PERIOD_M1,g_atrPeriod));
   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0) spread=1.0;
   return MathMax(atr*0.35,MathMax(spread*3.0,5.0));
}

double FlipLockMinimumProtectedProfit()
{
   double lot=g_flipLockPendingLot>0.0 ? g_flipLockPendingLot : FlipLockCurrentVolume();
   return MathMax(0.20,CurrentSpreadCost(MathMax(0.0001,lot))*2.0);
}

bool FlipLockOpenDirection(const int direction,const double requestedLot,const string status)
{
   if(direction==0) return false;
   g_adaptiveLot=NormalizeTradeVolume(requestedLot>0.0 ? requestedLot : g_lot);
   g_executionStatus=status;
   bool sent=SendMarketOrder(direction);
   if(sent)
   {
      RegisterOrderRequest();
      g_flipLockDirection=direction;
      g_flipLockExtremePrice=0.0;
      g_flipLockTriggerPrice=0.0;
      g_flipLockLastActionMs=GetTickCount64();
      g_flipLockState="ACTIVE";
   }
   return sent;
}

bool HandleFlipLockMode(const double momentum)
{
   if(!FlipLockModeEnabled()) return false;

   int count=BasketPositionCount();
   int rescue=RescuePositionCount();
   if(rescue>0)
   {
      g_executionStatus="FLIP_LOCK_RESCUE_POSITION_BLOCK";
      return true;
   }

   // Complete a switch only after the previous leg is confirmed flat.
   if(g_flipLockPendingDirection!=0)
   {
      if(count>0)
      {
         g_flipLockState="FLIP_CLOSING";
         g_executionStatus="FLIP_LOCK_CLOSING";
         CloseAllBasket("FLIP_LOCK_SWITCH_RETRY");
         return true;
      }

      ulong nowMs=GetTickCount64();
      if(g_flipLockLastActionMs>0 && nowMs-g_flipLockLastActionMs<FLIP_LOCK_COOLDOWN_MS)
      {
         g_executionStatus="FLIP_LOCK_COOLDOWN";
         return true;
      }

      int reopenDirection=g_flipLockPendingDirection;
      double reopenLot=g_flipLockPendingLot;
      if(FlipLockOpenDirection(reopenDirection,reopenLot,"FLIP_LOCK_REOPEN"))
      {
         g_flipLockPendingDirection=0;
         g_flipLockPendingLot=0.0;
      }
      else
         g_executionStatus="FLIP_LOCK_REOPEN_RETRY";
      return true;
   }

   // FLIP LOCK owns exactly one normal position. It never averages down.
   if(count<=0)
   {
      FlipLockResetCycle();
      int direction=AutoV20PrecisionDirection(momentum);
      if(direction==0)
      {
         g_flipLockState="WAIT_ENTRY";
         g_executionStatus="FLIP_LOCK_WAIT_ENTRY";
         return true;
      }
      double planned=g_adaptiveLot>0.0 ? g_adaptiveLot : NormalizeTradeVolume(g_lot);
      FlipLockOpenDirection(direction,planned,"FLIP_LOCK_FIRST_ENTRY");
      return true;
   }

   if(count!=1)
   {
      g_executionStatus="FLIP_LOCK_SINGLE_POSITION_REQUIRED";
      return true;
   }

   int direction=BasketDirection();
   if(direction==0)
   {
      g_executionStatus="FLIP_LOCK_MIXED_POSITION_BLOCK";
      return true;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      g_executionStatus="FLIP_LOCK_WAIT_TICK";
      return true;
   }

   double livePrice=direction>0 ? tick.bid : tick.ask;
   if(g_flipLockDirection!=direction || g_flipLockExtremePrice<=0.0)
   {
      g_flipLockDirection=direction;
      g_flipLockExtremePrice=livePrice;
      g_flipLockTriggerPrice=0.0;
   }

   if(direction>0)
      g_flipLockExtremePrice=MathMax(g_flipLockExtremePrice,livePrice);
   else
      g_flipLockExtremePrice=MathMin(g_flipLockExtremePrice,livePrice);

   double cycleProfit=BasketCycleProfit();
   double protectedProfit=FlipLockMinimumProtectedProfit();
   if(cycleProfit<protectedProfit)
   {
      g_flipLockState="ACTIVE_WAIT_PROFIT";
      g_executionStatus="FLIP_LOCK_WAIT_PROFIT";
      return true;
   }

   double distance=FlipLockDistancePoints()*_Point;
   g_flipLockTriggerPrice=direction>0
      ? g_flipLockExtremePrice-distance
      : g_flipLockExtremePrice+distance;
   g_flipLockState="ARMED";
   g_executionStatus="FLIP_LOCK_ARMED";

   bool crossed=direction>0
      ? livePrice<=g_flipLockTriggerPrice
      : livePrice>=g_flipLockTriggerPrice;
   if(!crossed) return true;

   if(g_flipLockFlips>=FLIP_LOCK_MAX_FLIPS_PER_CYCLE)
   {
      g_executionStatus="FLIP_LOCK_MAX_FLIPS_REACHED";
      return true;
   }

   ulong nowMs=GetTickCount64();
   if(g_flipLockLastActionMs>0 && nowMs-g_flipLockLastActionMs<FLIP_LOCK_COOLDOWN_MS)
   {
      g_executionStatus="FLIP_LOCK_COOLDOWN";
      return true;
   }

   g_flipLockPendingDirection=-direction;
   g_flipLockPendingLot=FlipLockCurrentVolume();
   g_flipLockFlips++;
   g_flipLockLastActionMs=nowMs;
   g_flipLockState="FLIP_CLOSING";
   g_executionStatus="FLIP_LOCK_SWITCH";
   CloseAllBasket("FLIP_LOCK_SWITCH");
   return true;
}

bool ParallelUniverseEvidenceReady()
{
   return g_autoV20Buy.winSamples>=PARALLEL_UNIVERSE_MIN_SAMPLES &&
          g_autoV20Sell.winSamples>=PARALLEL_UNIVERSE_MIN_SAMPLES;
}

bool HandleParallelUniverseMode(const double momentum)
{
   if(!ParallelUniverseModeEnabled()) return false;

   int count=BasketPositionCount();
   int rescue=RescuePositionCount();
   if(rescue>0)
   {
      g_parallelUniverseState="BLOCK_RESCUE";
      g_executionStatus="PARALLEL_UNIVERSE_RESCUE_BLOCK";
      return true;
   }

   // One decision, one position, one risk budget. Never ladder/add in this mode.
   if(count>0)
   {
      g_parallelUniverseState="HOLDING";
      g_executionStatus="PARALLEL_UNIVERSE_HOLDING";
      return true;
   }

   int liveDirection=AutoV20PrecisionDirection(momentum);
   if(liveDirection==0)
   {
      g_parallelUniverseState="WAIT_LIVE_CONTEXT";
      g_executionStatus="PARALLEL_UNIVERSE_WAIT_LIVE_CONTEXT";
      return true;
   }

   if(!ParallelUniverseEvidenceReady())
   {
      g_parallelUniverseState="WAIT_HISTORY";
      g_executionStatus="PARALLEL_UNIVERSE_WAIT_HISTORY";
      return true;
   }

   VECTOR_EDGE_OUTPUT universe;
   if(!AutoVectorEdgeLiveEvaluate(universe) || !universe.valid)
   {
      g_parallelUniverseState="WAIT_MODEL";
      g_executionStatus="PARALLEL_UNIVERSE_WAIT_MODEL";
      return true;
   }

   g_parallelUniverseBuyEV=universe.buyEV;
   g_parallelUniverseSellEV=universe.sellEV;
   g_parallelUniverseDirection=universe.preferredDirection;

   double chosenEV=liveDirection>0 ? universe.buyEV : universe.sellEV;
   double otherEV=liveDirection>0 ? universe.sellEV : universe.buyEV;
   double costFloor=MathMax(
      MathMax(g_autoV20Buy.knownCostMoney,g_autoV20Sell.knownCostMoney)*0.50,
      0.05);

   if(!universe.positiveExpectancy || universe.preferredDirection!=liveDirection)
   {
      g_parallelUniverseState="UNIVERSE_DISAGREEMENT";
      g_executionStatus="PARALLEL_UNIVERSE_DISAGREEMENT";
      return true;
   }
   if(chosenEV<=0.0 || chosenEV-otherEV<costFloor)
   {
      g_parallelUniverseState="EDGE_TOO_SMALL";
      g_executionStatus="PARALLEL_UNIVERSE_EDGE_TOO_SMALL";
      return true;
   }

   AUTO_V20_SIDE selected=liveDirection>0 ? g_autoV20Buy : g_autoV20Sell;
   if(selected.averageNet<=0.0)
   {
      g_parallelUniverseState="HISTORY_NET_NOT_POSITIVE";
      g_executionStatus="PARALLEL_UNIVERSE_HISTORY_NET_NOT_POSITIVE";
      return true;
   }

   g_adaptiveLot=selected.plannedLot>0.0
      ? selected.plannedLot
      : NormalizeTradeVolume(g_lot);
   g_executionStatus=liveDirection>0
      ? "PARALLEL_UNIVERSE_BUY"
      : "PARALLEL_UNIVERSE_SELL";
   bool sent=SendMarketOrder(liveDirection);
   if(sent)
   {
      RegisterOrderRequest();
      g_parallelUniverseState="HOLDING";
   }
   else
      g_parallelUniverseState="ORDER_RETRY";
   return true;
}

#endif // SCENOVA_LIVE_EXECUTION_MODES_V1_MQH
