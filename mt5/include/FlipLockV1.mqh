#ifndef SCENOVA_FLIP_LOCK_V1_MQH
#define SCENOVA_FLIP_LOCK_V1_MQH

// FLIP LOCK V6 is a local tick-driven one-position profit-lock engine:
//   1 FLIP-owned market position, no pre-placed opposite STOP order.
// The starter uses a wide ATR/spread Safety Stop. As soon as the MT5 quote has
// enough positive distance to place a broker-legal lock above/below entry, the
// SL arms locally and then follows every meaningful price step without waiting
// for SaaS price/commands. Server state controls NEW risk only.
#define FLIP_LOCK_V1_VERSION "6.0.1"
#define FLIP_LOCK_PENDING_COMMENT "SCNFlipLock"
#define FLIP_LOCK_LIVE_COMMENT "SCNFlipLockLive"
#define FLIP_LOCK_FLAT_PENDING_GRACE_SECONDS 2
#define FLIP_LOCK_UNARMED_RESTART_COOLDOWN_SECONDS 5
#define FLIP_LOCK_ARM_USD_PER_001_LOT 0.25
#define FLIP_LOCK_STOP_SYNC_MIN_MS 120

int g_flipLockDirection=0;
double g_flipLockPeakPrice=0.0;
double g_flipLockTriggerPrice=0.0;
bool g_flipLockArmed=false;
int g_flipLockFlipCount=0;
datetime g_flipLockLastFlipAt=0;
datetime g_flipLockLastFlatAt=0;
datetime g_flipLockFlatPendingSince=0;
string g_flipLockReason="IDLE";
ulong g_flipLockLastStopSyncMs=0;

bool FlipLockModeEnabled()
{
   string mode=g_controlMode;
   StringToUpper(mode);
   return mode=="FLIP_LOCK";
}

bool FlipLockTradeAccepted(const uint retcode)
{
   return retcode==TRADE_RETCODE_DONE ||
          retcode==TRADE_RETCODE_PLACED ||
          retcode==TRADE_RETCODE_DONE_PARTIAL ||
          retcode==TRADE_RETCODE_NO_CHANGES;
}

void FlipLockResetTracking(const bool resetCounter)
{
   g_flipLockDirection=0;
   g_flipLockPeakPrice=0.0;
   g_flipLockTriggerPrice=0.0;
   g_flipLockArmed=false;
   g_flipLockLastFlatAt=0;
   g_flipLockFlatPendingSince=0;
   g_flipLockLastStopSyncMs=0;
   g_flipLockReason="IDLE";
   if(resetCounter) g_flipLockFlipCount=0;
}

double FlipLockBrokerMinDistancePoints()
{
   double stops=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   double freeze=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL);
   return MathMax(2.0,MathMax(stops,freeze)+2.0);
}

double FlipLockAtrPoints()
{
   double m1=AverageTrueRangePoints(PERIOD_M1,MathMax(5,g_atrPeriod));
   if(m1>0.0) return m1;

   // M1 can be unavailable for a few ticks immediately after attach/restart.
   // Use a real higher-timeframe ATR as fallback; never manufacture volatility
   // from Spread because that produced a dangerously tight starter stop.
   double m5=AverageTrueRangePoints(PERIOD_M5,MathMax(5,g_atrPeriod));
   if(m5>0.0) return m5;
   return 0.0;
}

bool FlipLockStartReady()
{
   if(FlipLockAtrPoints()>0.0)
      return true;

   g_flipLockReason="WAIT_ATR";
   g_executionStatus="FLIP_LOCK_WAIT_ATR";
   return false;
}

double FlipLockTrailDistancePoints()
{
   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0) return 0.0;

   double atr=FlipLockAtrPoints();
   if(atr<=0.0) return 0.0;

   // The baton is a PROFIT-lock trail, not the starter safety stop. Keep enough
   // room for live spread/noise while still following a profitable move.
   return MathMax(
      FlipLockBrokerMinDistancePoints(),
      MathMax(spread*3.0,atr*0.35)
   );
}

double FlipLockSafetyDistancePoints()
{
   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0) return 0.0;
   double atr=FlipLockAtrPoints();
   if(atr<=0.0) return 0.0;

   // Starter protection must be materially wider than the baton. It exists only
   // as catastrophic broker-side protection until the trade has moved far
   // enough in profit for the true lock/flip baton to arm.
   return MathMax(
      FlipLockBrokerMinDistancePoints(),
      MathMax(spread*8.0,atr*1.25)
   );
}

double FlipLockInitialSafetyStopPrice(const int direction,const double entryPrice,const MqlTick &tick)
{
   double points=FlipLockSafetyDistancePoints();
   if(direction==0 || entryPrice<=0.0 || points<=0.0) return 0.0;

   double stop=direction>0
      ? entryPrice-points*_Point
      : entryPrice+points*_Point;

   // Keep the stop broker-legal even if spread changes between quote capture and
   // request send.
   double minimum=FlipLockBrokerMinDistancePoints()*_Point;
   if(direction>0)
      stop=MathMin(stop,tick.bid-minimum);
   else
      stop=MathMax(stop,tick.ask+minimum);
   return NormalizeStopPriceToTick(stop,direction);
}

double FlipLockProfitReservePoints()
{
   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0) return FlipLockBrokerMinDistancePoints();
   return MathMax(FlipLockBrokerMinDistancePoints(),spread*0.50);
}

double FlipLockArmProfitMoney(const double volume)
{
   if(volume<=0.0) return 0.0;
   // User contract: start profit locking at approximately $0.25 for 0.01 lot
   // and scale linearly with the actual FLIP LOCK position volume.
   return FLIP_LOCK_ARM_USD_PER_001_LOT*(volume/0.01);
}

double FlipLockPositionProfitMoney(const ulong positionTicket)
{
   if(positionTicket==0 || !PositionSelectByTicket(positionTicket))
      return -DBL_MAX;
   return PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
}

double FlipLockBreakEvenFloorPrice(const int direction,const double openPrice)
{
   if(direction==0 || openPrice<=0.0) return 0.0;
   double reserve=FlipLockProfitReservePoints()*_Point;
   return NormalizeTargetPriceToTick(
      direction>0 ? openPrice+reserve : openPrice-reserve,
      direction
   );
}

bool FlipLockProfitLockReady(
   const ulong positionTicket,
   const int direction,
   const double openPrice,
   const MqlTick &tick
)
{
   if(positionTicket==0 || direction==0 || openPrice<=0.0)
      return false;

   double current=FlipLockPositionProfitMoney(positionTicket);
   if(current<=0.0)
      return false;

   // Do not wait for a SaaS/money threshold. Arm at the first MT5 tick where a
   // positive break-even reserve is actually legal at the broker.
   double floor=FlipLockBreakEvenFloorPrice(direction,openPrice);
   double minimum=FlipLockBrokerMinDistancePoints()*_Point;
   if(direction>0)
      return floor>openPrice && floor<=tick.bid-minimum;
   return floor<openPrice && floor>=tick.ask+minimum;
}

double FlipLockNormalizePrice(const double price)
{
   return NormalizePriceToTick(price);
}

bool FlipLockFindPosition(ulong &ticket,int &direction,double &volume,double &sl,double &tp)
{
   ticket=0;
   direction=0;
   volume=0.0;
   sl=0.0;
   tp=0.0;

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong current=PositionGetTicket(i);
      if(current==0 || !PositionSelectByTicket(current)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;

      string comment=PositionGetString(POSITION_COMMENT);
      // Strict ownership: FLIP LOCK may manage only positions created by its
      // own starter or opposite pending baton. Never seize an AUTO/MANUAL/RACE
      // position merely because the website switched control modes.
      if(StringFind(comment,FLIP_LOCK_PENDING_COMMENT)<0)
         continue;

      long type=PositionGetInteger(POSITION_TYPE);
      if(type!=POSITION_TYPE_BUY && type!=POSITION_TYPE_SELL) continue;

      ticket=current;
      direction=type==POSITION_TYPE_BUY ? 1 : -1;
      volume=PositionGetDouble(POSITION_VOLUME);
      sl=PositionGetDouble(POSITION_SL);
      tp=PositionGetDouble(POSITION_TP);
      return true;
   }
   return false;
}

bool BasketHasFlipLockPosition()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong current=PositionGetTicket(i);
      if(current==0 || !PositionSelectByTicket(current)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(StringFind(PositionGetString(POSITION_COMMENT),FLIP_LOCK_PENDING_COMMENT)>=0)
         return true;
   }
   return false;
}

bool FlipLockFindPending(ulong &ticket,int &direction,double &price,double &volume)
{
   ticket=0;
   direction=0;
   price=0.0;
   volume=0.0;

   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong current=OrderGetTicket(i);
      if(current==0 || !OrderSelect(current)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol ||
         OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(StringFind(OrderGetString(ORDER_COMMENT),FLIP_LOCK_PENDING_COMMENT)<0)
         continue;

      ENUM_ORDER_TYPE type=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if(type!=ORDER_TYPE_BUY_STOP && type!=ORDER_TYPE_SELL_STOP) continue;

      ticket=current;
      direction=type==ORDER_TYPE_BUY_STOP ? 1 : -1;
      price=OrderGetDouble(ORDER_PRICE_OPEN);
      volume=OrderGetDouble(ORDER_VOLUME_CURRENT);
      return true;
   }
   return false;
}

bool FlipLockRemovePendingTicket(const ulong ticket)
{
   if(ticket==0 || !OrderSelect(ticket)) return true;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_REMOVE;
   request.order=ticket;
   request.symbol=_Symbol;
   request.magic=InpMagic;

   ResetLastError();
   bool sent=OrderSend(request,result);
   g_lastOrderError=GetLastError();
   g_lastOrderRetcode=(long)result.retcode;
   return sent && FlipLockTradeAccepted(result.retcode);
}

void FlipLockRemoveAllPending()
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol ||
         OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(StringFind(OrderGetString(ORDER_COMMENT),FLIP_LOCK_PENDING_COMMENT)<0)
         continue;
      FlipLockRemovePendingTicket(ticket);
   }
}

bool FlipLockSetPositionStop(const ulong positionTicket,const double triggerPrice)
{
   if(positionTicket==0 || !PositionSelectByTicket(positionTicket)) return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_SLTP;
   request.position=positionTicket;
   request.symbol=_Symbol;
   request.magic=InpMagic;
   request.sl=FlipLockNormalizePrice(triggerPrice);
   request.tp=PositionGetDouble(POSITION_TP);

   ResetLastError();
   bool sent=OrderSend(request,result);
   g_lastOrderError=GetLastError();
   g_lastOrderRetcode=(long)result.retcode;
   return sent && FlipLockTradeAccepted(result.retcode);
}

bool FlipLockPlacePending(const int direction,const double triggerPrice,const double requestedVolume)
{
   if(direction==0 || requestedVolume<=0.0) return false;

   double volume=NormalizeTradeVolume(requestedVolume);
   if(volume<=0.0) return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_PENDING;
   request.magic=InpMagic;
   request.symbol=_Symbol;
   request.volume=volume;
   request.price=NormalizeTargetPriceToTick(triggerPrice,direction);
   request.type=direction>0 ? ORDER_TYPE_BUY_STOP : ORDER_TYPE_SELL_STOP;
   request.type_time=ORDER_TIME_GTC;
   request.type_filling=ORDER_FILLING_RETURN;
   request.comment=FLIP_LOCK_PENDING_COMMENT;

   ResetLastError();
   bool sent=OrderSend(request,result);
   g_lastOrderError=GetLastError();
   g_lastOrderRetcode=(long)result.retcode;
   if(sent && FlipLockTradeAccepted(result.retcode))
   {
      g_lastOrderAt=TimeCurrent();
      return true;
   }
   return false;
}

bool FlipLockModifyPending(const ulong ticket,const double triggerPrice)
{
   if(ticket==0 || !OrderSelect(ticket)) return false;

   ENUM_ORDER_TYPE pendingType=(ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
   int direction=pendingType==ORDER_TYPE_BUY_STOP ? 1 :
                 pendingType==ORDER_TYPE_SELL_STOP ? -1 : 0;
   if(direction==0) return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_MODIFY;
   request.order=ticket;
   request.symbol=_Symbol;
   request.magic=InpMagic;
   request.price=NormalizeTargetPriceToTick(triggerPrice,direction);
   request.stoplimit=OrderGetDouble(ORDER_PRICE_STOPLIMIT);
   request.sl=OrderGetDouble(ORDER_SL);
   request.tp=OrderGetDouble(ORDER_TP);
   request.type_time=(ENUM_ORDER_TYPE_TIME)OrderGetInteger(ORDER_TYPE_TIME);
   request.expiration=(datetime)OrderGetInteger(ORDER_TIME_EXPIRATION);

   ResetLastError();
   bool sent=OrderSend(request,result);
   g_lastOrderError=GetLastError();
   g_lastOrderRetcode=(long)result.retcode;
   return sent && FlipLockTradeAccepted(result.retcode);
}

int FlipLockStarterDirection()
{
   if(g_entryMode==ENTRY_BUY_ONLY) return 1;
   if(g_entryMode==ENTRY_SELL_ONLY) return -1;

   // AUTO_MOMENTUM in FLIP LOCK means only "choose the first side".  It does
   // not call AUTO V20, VECTOR EDGE or historical filters.
   double momentum=MomentumPoints();
   if(momentum>0.0) return 1;
   if(momentum<0.0) return -1;
   if(g_macroTrendDirection>0) return 1;
   if(g_macroTrendDirection<0) return -1;
   if(g_trendM5>0) return 1;
   if(g_trendM5<0) return -1;
   if(g_trendM1>0) return 1;
   if(g_trendM1<0) return -1;

   double open0=iOpen(_Symbol,PERIOD_M1,0);
   double close0=iClose(_Symbol,PERIOD_M1,0);
   if(open0>0.0 && close0>0.0 && close0!=open0)
      return close0>open0 ? 1 : -1;

   double open1=iOpen(_Symbol,PERIOD_M1,1);
   double close1=iClose(_Symbol,PERIOD_M1,1);
   if(open1>0.0 && close1>0.0 && close1!=open1)
      return close1>open1 ? 1 : -1;

   // Deterministic final fallback: start BUY rather than remaining flat.
   return 1;
}

int FlipLockReactiveDirection()
{
   // Re-entry happens only AFTER the previous FLIP-owned position has closed.
   // Read the live M1 candle first so we do not pre-commit to BUY/SELL with a
   // pending order before the candle shows its current force.
   double open0=iOpen(_Symbol,PERIOD_M1,0);
   double close0=iClose(_Symbol,PERIOD_M1,0);
   double high0=iHigh(_Symbol,PERIOD_M1,0);
   double low0=iLow(_Symbol,PERIOD_M1,0);
   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0) spread=1.0;

   double bodyPoints=(open0>0.0 && close0>0.0)
      ? (close0-open0)/_Point
      : 0.0;
   double rangePoints=(high0>0.0 && low0>0.0 && high0>=low0)
      ? (high0-low0)/_Point
      : 0.0;
   double bodyRatio=rangePoints>0.0
      ? MathMin(1.0,MathAbs(bodyPoints)/rangePoints)
      : 0.0;
   double momentum=MomentumPoints();

   double score=0.0;
   double bodyGate=MathMax(1.0,spread*0.20);
   if(MathAbs(bodyPoints)>=bodyGate)
      score+=(bodyPoints>0.0 ? 1.0 : -1.0)*(1.0+bodyRatio*2.0);

   double momentumGate=MathMax(1.0,spread*0.15);
   if(MathAbs(momentum)>=momentumGate)
      score+=(momentum>0.0 ? 1.0 : -1.0)*1.50;

   // Small tie-breakers only; the current candle + momentum dominate.
   if(g_trendM1>0) score+=0.35;
   else if(g_trendM1<0) score-=0.35;
   if(g_trendM5>0) score+=0.15;
   else if(g_trendM5<0) score-=0.15;

   if(score>0.0) return 1;
   if(score<0.0) return -1;

   if(bodyPoints>0.0) return 1;
   if(bodyPoints<0.0) return -1;
   if(momentum>0.0) return 1;
   if(momentum<0.0) return -1;

   // The user requested immediate re-entry. If the live candle is perfectly
   // neutral, continue opposite the previous side rather than staying flat.
   if(g_flipLockDirection!=0) return -g_flipLockDirection;
   return FlipLockStarterDirection();
}

bool FlipLockOpenStarter(const int forcedDirection=0)
{
   if(BasketPositionCount()!=0 || RescuePositionCount()!=0) return false;
   if(g_state!=STATE_RUNNING || !g_access || !g_runAuthorized) return false;
   if(!g_settingsSynchronized || !EntryLeaseValid() || TradePermissionStatus()!="OK")
      return false;
   if(g_spreadStatus=="EXTREME")
   {
      g_flipLockReason="WAIT_EXTREME_SPREAD";
      g_executionStatus="FLIP_LOCK_EXTREME_SPREAD";
      return false;
   }

   if(!FlipLockStartReady())
      return false;

   int direction=forcedDirection!=0 ? forcedDirection : FlipLockStarterDirection();
   if(direction==0) return false;

   // Publish FLIP LOCK-specific entry metadata before entering the shared
   // broker sender. This keeps trade journals and execution ownership truthful.
   g_entryModel="FLIP_LOCK_BATON";
   g_entryTrigger=direction>0 ? "FLIP_LOCK_START_BUY" : "FLIP_LOCK_START_SELL";
   g_entryQuality="FLIP_LOCK";
   g_entryQualityScore=0.0;

   bool sent=SendMarketOrder(direction);
   if(sent)
   {
      RegisterOrderRequest();
      g_flipLockDirection=direction;
      g_flipLockPeakPrice=0.0;
      g_flipLockTriggerPrice=0.0;
      g_flipLockArmed=false;
      g_flipLockLastFlatAt=0;
      g_flipLockFlatPendingSince=0;
      g_flipLockReason="STARTER_OPENED";
      g_executionStatus=direction>0 ? "FLIP_LOCK_START_BUY" : "FLIP_LOCK_START_SELL";
   }
   else
   {
      g_flipLockReason="STARTER_RETRY";
   }
   return sent;
}

double FlipLockCandidateTrigger(const int direction,const MqlTick &tick)
{
   double distancePoints=FlipLockTrailDistancePoints();
   if(direction==0 || distancePoints<=0.0)
      return 0.0;

   double executablePrice=direction>0 ? tick.bid : tick.ask;
   double distance=distancePoints*_Point;
   double candidate=direction>0
      ? executablePrice-distance
      : executablePrice+distance;
   return NormalizeStopPriceToTick(candidate,direction);
}

bool FlipLockTriggerIsLegal(const int direction,const double trigger,const MqlTick &tick)
{
   double minDistance=FlipLockBrokerMinDistancePoints()*_Point;
   if(direction>0) return trigger<=tick.bid-minDistance;
   return trigger>=tick.ask+minDistance;
}

bool FlipLockSyncBaton(
   const ulong positionTicket,
   const int direction,
   const double positionVolume,
   const double currentSl,
   const MqlTick &tick
)
{
   if(positionTicket==0 || direction==0 || positionVolume<=0.0) return false;
   if(!PositionSelectByTicket(positionTicket)) return false;

   double openPrice=PositionGetDouble(POSITION_PRICE_OPEN);
   double candidate=FlipLockCandidateTrigger(direction,tick);
   if(candidate<=0.0)
   {
      g_flipLockReason="WAIT_ATR";
      g_executionStatus="FLIP_LOCK_WAIT_ATR";
      return false;
   }

   if(!g_flipLockArmed)
   {
      if(!FlipLockProfitLockReady(positionTicket,direction,openPrice,tick))
      {
         // Safety Stop stays broker-side until the current MT5 quote can support
         // a genuinely positive, broker-legal stop. No server price is involved.
         FlipLockRemoveAllPending();
         g_flipLockTriggerPrice=0.0;
         g_flipLockReason="WAIT_LOCAL_PROFIT_LOCK";
         g_executionStatus="FLIP_LOCK_WAIT_PROFIT_LOCK";
         return true;
      }

      double breakEvenFloor=FlipLockBreakEvenFloorPrice(direction,openPrice);
      if(direction>0)
         candidate=MathMax(candidate,breakEvenFloor);
      else
         candidate=MathMin(candidate,breakEvenFloor);

      if(!FlipLockTriggerIsLegal(direction,candidate,tick))
      {
         g_flipLockReason="WAIT_PROFIT_LOCK_DISTANCE";
         g_executionStatus="FLIP_LOCK_WAIT_PROFIT_LOCK";
         return true;
      }
   }

   if(g_flipLockTriggerPrice<=0.0)
      g_flipLockTriggerPrice=candidate;
   else if(direction>0)
      g_flipLockTriggerPrice=MathMax(g_flipLockTriggerPrice,candidate);
   else
      g_flipLockTriggerPrice=MathMin(g_flipLockTriggerPrice,candidate);

   if(!FlipLockTriggerIsLegal(direction,g_flipLockTriggerPrice,tick))
   {
      g_flipLockReason="WAIT_LEGAL_TRIGGER_DISTANCE";
      return false;
   }

   FlipLockRemoveAllPending();

   double trigger=g_flipLockTriggerPrice;
   double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tickSize<=0.0) tickSize=_Point;
   double moveThreshold=MathMax(_Point,tickSize);
   bool stopImproved=currentSl<=0.0 ||
      (direction>0
         ? trigger>=currentSl+moveThreshold-1e-12
         : trigger<=currentSl-moveThreshold+1e-12);

   ulong nowMs=GetTickCount64();
   bool syncReady=
      g_flipLockLastStopSyncMs==0 ||
      nowMs-g_flipLockLastStopSyncMs>=FLIP_LOCK_STOP_SYNC_MIN_MS;
   bool urgentMove=currentSl<=0.0 || MathAbs(currentSl-trigger)>=moveThreshold*3.0;

   // Track the MT5 quote aggressively, but avoid flooding the broker with
   // multiple SLTP requests inside the same ~120 ms burst.
   if(stopImproved && (syncReady || urgentMove))
   {
      if(!FlipLockSetPositionStop(positionTicket,trigger))
      {
         g_flipLockReason="SL_TRAIL_RETRY";
         g_executionStatus="FLIP_LOCK_SL_TRAIL_RETRY";
         return false;
      }
      g_flipLockLastStopSyncMs=nowMs;
   }

   g_flipLockArmed=true;
   g_flipLockReason="LOCAL_PROFIT_TRAIL_ARMED";
   g_executionStatus=direction>0 ? "FLIP_LOCK_BUY_TRAILING" : "FLIP_LOCK_SELL_TRAILING";
   return true;
}

void FlipLockManageFlatState()
{
   // V5 has no pre-placed direction order. Clean any stale pending from an older
   // build, then decide the next side from the live candle only after exit.
   FlipLockRemoveAllPending();
   g_flipLockFlatPendingSince=0;

   // A deliberate Start after a fully stopped/flat run begins a new risk cycle.
   // Temporary flat settlement during a BUY<->SELL handoff keeps the previous
   // direction/armed state and therefore does not reset accumulated run P/L.
   if(!g_flipLockArmed && g_flipLockDirection==0 && g_flipLockFlipCount==0)
      ResetBasketCycleState();

   if(!g_flipLockArmed && g_flipLockDirection!=0)
   {
      // The starter hit its wide Safety Stop before profit-lock arming. Do not
      // churn straight back into the market on the same spread/tick.
      if(g_flipLockLastFlatAt>0 &&
         TimeCurrent()-g_flipLockLastFlatAt<FLIP_LOCK_UNARMED_RESTART_COOLDOWN_SECONDS)
      {
         g_flipLockReason="WAIT_RESTART_COOLDOWN";
         g_executionStatus="FLIP_LOCK_WAIT_RESTART_COOLDOWN";
         return;
      }

      FlipLockResetTracking(false);
      FlipLockOpenStarter();
      return;
   }

   if(g_flipLockArmed)
   {
      // Profit close / trailing-SL exit: evaluate the just-forming candle NOW,
      // then re-enter immediately with a market order in the stronger direction.
      int reactiveDirection=FlipLockReactiveDirection();
      g_flipLockFlipCount++;
      g_flipLockLastFlipAt=TimeCurrent();
      FlipLockOpenStarter(reactiveDirection);
      return;
   }

   FlipLockOpenStarter();
}

void FlipLockManage()
{
   bool selected=FlipLockModeEnabled();
   bool ownsLivePosition=BasketHasFlipLockPosition();

   if(!selected && !ownsLivePosition)
   {
      FlipLockRemoveAllPending();
      FlipLockResetTracking(true);
      return;
   }

   int count=BasketPositionCount();
   bool canOpenNewCycle=
      selected &&
      g_state==STATE_RUNNING &&
      g_access &&
      g_runAuthorized &&
      g_settingsSynchronized &&
      EntryLeaseValid() &&
      TradePermissionStatus()=="OK";

   if(count<=0)
   {
      if(g_flipLockLastFlatAt<=0) g_flipLockLastFlatAt=TimeCurrent();

      // Server/control state governs NEW exposure only. Never create a new FLIP
      // position while stopped/offline/not selected.
      if(!canOpenNewCycle)
      {
         FlipLockRemoveAllPending();
         // A stopped/unauthorized FLIP with no live position is a finished run.
         // Clear the baton/P&L state so a later authorized Start begins clean.
         FlipLockResetTracking(true);
         ResetBasketCycleState();
         g_flipLockReason="WAIT_RUN_AUTHORIZATION";
         g_executionStatus=selected
            ? "FLIP_LOCK_WAIT_RUN_AUTHORIZATION"
            : "FLIP_LOCK_STOPPED_FLAT";
         return;
      }

      FlipLockManageFlatState();
      return;
   }

   g_flipLockLastFlatAt=0;
   g_flipLockFlatPendingSince=0;

   if(!ownsLivePosition)
   {
      FlipLockRemoveAllPending();
      g_flipLockReason="WAIT_FOREIGN_POSITION";
      g_executionStatus="FLIP_LOCK_WAIT_EXISTING_POSITION";
      return;
   }

   // A live FLIP-owned position is always protected from the local MT5 quote.
   // Mode switches, heartbeat latency, lost SaaS access or stale authorization
   // may block RE-ENTRY, but must never freeze the current broker SL.
   if(count!=1)
   {
      g_flipLockReason="WAIT_SINGLE_POSITION";
      g_executionStatus="FLIP_LOCK_WAIT_SINGLE_POSITION";
      return;
   }

   ulong positionTicket=0;
   int direction=0;
   double volume=0.0;
   double currentSl=0.0;
   double currentTp=0.0;
   if(!FlipLockFindPosition(positionTicket,direction,volume,currentSl,currentTp) || direction==0)
      return;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick)) return;
   double executablePrice=direction>0 ? tick.bid : tick.ask;

   if(g_flipLockDirection!=direction)
   {
      if(g_flipLockDirection!=0)
      {
         g_flipLockFlipCount++;
         g_flipLockLastFlipAt=TimeCurrent();
      }
      g_flipLockDirection=direction;
      g_flipLockPeakPrice=executablePrice;
      g_flipLockTriggerPrice=0.0;
      g_flipLockArmed=false;
      g_flipLockLastStopSyncMs=0;
   }

   if(direction>0)
      g_flipLockPeakPrice=MathMax(g_flipLockPeakPrice,executablePrice);
   else
      g_flipLockPeakPrice=g_flipLockPeakPrice<=0.0
         ? executablePrice
         : MathMin(g_flipLockPeakPrice,executablePrice);

   FlipLockSyncBaton(positionTicket,direction,volume,currentSl,tick);
}

#endif
