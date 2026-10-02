#ifndef SCENOVA_FLIP_LOCK_V1_MQH
#define SCENOVA_FLIP_LOCK_V1_MQH

// FLIP LOCK 1.2.0 - M1 one-position protected-profit engine.
// A live FLIP position starts with the existing wide Safety SL. Once price has
// moved far enough into profit for a broker-legal stop beyond entry, the SL
// jumps to protected profit and then trails the executable market price at a
// fixed 100-point distance. The SL only tightens; it never moves backward.
// No opposite pending baton is used.
#define FLIP_LOCK_V1_VERSION "1.2.0"
#define FLIP_LOCK_PENDING_COMMENT "SCNFlipLock"
#define FLIP_LOCK_LIVE_COMMENT "SCNFlipLockLive"
#define FLIP_LOCK_UNARMED_RESTART_COOLDOWN_SECONDS 5
#define FLIP_LOCK_STOP_SYNC_MIN_MS 250
#define FLIP_LOCK_TRAIL_DISTANCE_POINTS 100.0

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
int g_flipLockPendingDirection=0;
double g_flipLockPendingTriggerPrice=0.0;

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

bool FlipLockAccountIsHedging()
{
   return (ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE)
      == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING;
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
   g_flipLockPendingDirection=0;
   g_flipLockPendingTriggerPrice=0.0;
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
   // 1.1.0 is intentionally M1-only. No M5/H1/macro fallback is allowed.
   return AverageTrueRangePoints(PERIOD_M1,MathMax(5,g_atrPeriod));
}

bool FlipLockStartReady()
{
   if(FlipLockAtrPoints()>0.0)
      return true;
   g_flipLockReason="WAIT_M1_ATR";
   g_executionStatus="FLIP_LOCK_WAIT_M1_ATR";
   return false;
}

double FlipLockTrailDistancePoints()
{
   double spread=CurrentSpreadPoints();
   double atr=FlipLockAtrPoints();
   if(spread<=0.0 || spread>=999999.0 || atr<=0.0)
      return 0.0;

   // Normal reversal baton: closer than the catastrophe Safety Stop, but not so
   // tight that ordinary M1 spread/noise flips the side on every tick.
   return MathMax(
      FlipLockBrokerMinDistancePoints(),
      MathMax(spread*3.0,atr*0.45)
   );
}

double FlipLockSafetyDistancePoints()
{
   double spread=CurrentSpreadPoints();
   double atr=FlipLockAtrPoints();
   if(spread<=0.0 || spread>=999999.0 || atr<=0.0)
      return 0.0;

   // Broker-side catastrophe protection. The opposite pending baton is the
   // normal flip mechanism and sits materially closer than this stop.
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
   double minimum=FlipLockBrokerMinDistancePoints()*_Point;
   if(direction>0)
      stop=MathMin(stop,tick.bid-minimum);
   else
      stop=MathMax(stop,tick.ask+minimum);
   return NormalizeStopPriceToTick(stop,direction);
}

double FlipLockNormalizePrice(const double price)
{
   return NormalizePriceToTick(price);
}

bool FlipLockOwnedPosition(const ulong ticket)
{
   if(ticket==0 || !PositionSelectByTicket(ticket)) return false;
   if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
      PositionGetInteger(POSITION_MAGIC)!=InpMagic) return false;
   return StringFind(PositionGetString(POSITION_COMMENT),FLIP_LOCK_PENDING_COMMENT)>=0;
}

int FlipLockOwnedPositionCount()
{
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(FlipLockOwnedPosition(ticket)) count++;
   }
   return count;
}

bool FlipLockFindPosition(ulong &ticket,int &direction,double &volume,double &sl,double &tp)
{
   ticket=0;
   direction=0;
   volume=0.0;
   sl=0.0;
   tp=0.0;
   long newestTime=-1;

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong current=PositionGetTicket(i);
      if(!FlipLockOwnedPosition(current)) continue;

      long opened=(long)PositionGetInteger(POSITION_TIME_MSC);
      if(ticket!=0 && opened<newestTime) continue;

      long type=PositionGetInteger(POSITION_TYPE);
      if(type!=POSITION_TYPE_BUY && type!=POSITION_TYPE_SELL) continue;
      ticket=current;
      newestTime=opened;
      direction=type==POSITION_TYPE_BUY ? 1 : -1;
      volume=PositionGetDouble(POSITION_VOLUME);
      sl=PositionGetDouble(POSITION_SL);
      tp=PositionGetDouble(POSITION_TP);
   }
   return ticket!=0;
}

bool BasketHasFlipLockPosition()
{
   return FlipLockOwnedPositionCount()>0;
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
         OrderGetInteger(ORDER_MAGIC)!=InpMagic ||
         StringFind(OrderGetString(ORDER_COMMENT),FLIP_LOCK_PENDING_COMMENT)<0)
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

bool FlipLockSetPositionStop(const ulong positionTicket,const double stopPrice)
{
   if(positionTicket==0 || stopPrice<=0.0 || !PositionSelectByTicket(positionTicket))
      return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_SLTP;
   request.position=positionTicket;
   request.symbol=_Symbol;
   request.magic=InpMagic;
   request.sl=FlipLockNormalizePrice(stopPrice);
   request.tp=PositionGetDouble(POSITION_TP);

   ResetLastError();
   bool sent=OrderSend(request,result);
   g_lastOrderError=GetLastError();
   g_lastOrderRetcode=(long)result.retcode;
   if(sent && FlipLockTradeAccepted(result.retcode))
   {
      g_dynamicStopPrice=request.sl;
      g_lastOrderAt=TimeCurrent();
      return true;
   }
   return false;
}

void FlipLockRemoveAllPending()
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol ||
         OrderGetInteger(ORDER_MAGIC)!=InpMagic ||
         StringFind(OrderGetString(ORDER_COMMENT),FLIP_LOCK_PENDING_COMMENT)<0)
         continue;
      FlipLockRemovePendingTicket(ticket);
   }
}

bool FlipLockPlacePending(const int direction,const double triggerPrice,const double requestedVolume)
{
   if(direction==0 || requestedVolume<=0.0 || triggerPrice<=0.0) return false;

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
      g_flipLockPendingDirection=direction;
      g_flipLockPendingTriggerPrice=request.price;
      return true;
   }
   return false;
}

bool FlipLockModifyPending(const ulong ticket,const double triggerPrice)
{
   if(ticket==0 || !OrderSelect(ticket) || triggerPrice<=0.0) return false;

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
   if(sent && FlipLockTradeAccepted(result.retcode))
   {
      g_flipLockPendingDirection=direction;
      g_flipLockPendingTriggerPrice=request.price;
      return true;
   }
   return false;
}

int FlipLockStarterDirection()
{
   if(g_entryMode==ENTRY_BUY_ONLY) return 1;
   if(g_entryMode==ENTRY_SELL_ONLY) return -1;

   double atr=FlipLockAtrPoints();
   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0) spread=1.0;

   // M1-only direction: live candle first, latest completed M1 candle second.
   double open0=iOpen(_Symbol,PERIOD_M1,0);
   double close0=iClose(_Symbol,PERIOD_M1,0);
   double body0=(open0>0.0 && close0>0.0) ? (close0-open0)/_Point : 0.0;
   double gate=MathMax(1.0,MathMax(spread*0.15,atr>0.0 ? atr*0.03 : 0.0));
   if(MathAbs(body0)>=gate)
      return body0>0.0 ? 1 : -1;

   double open1=iOpen(_Symbol,PERIOD_M1,1);
   double close1=iClose(_Symbol,PERIOD_M1,1);
   double body1=(open1>0.0 && close1>0.0) ? (close1-open1)/_Point : 0.0;
   if(MathAbs(body1)>=gate)
      return body1>0.0 ? 1 : -1;

   return 0;
}

int FlipLockReactiveDirection()
{
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
   if(direction==0)
   {
      g_flipLockReason="WAIT_M1_DIRECTION";
      g_executionStatus="FLIP_LOCK_WAIT_M1_DIRECTION";
      return false;
   }

   // The shared sender forces FLIP volume to NormalizeTradeVolume(g_lot).
   // No martingale or adaptive lot scaling is allowed.
   g_entryModel="FLIP_LOCK_M1_PROFIT_LOCK";
   g_entryTrigger=direction>0 ? "FLIP_LOCK_M1_START_BUY" : "FLIP_LOCK_M1_START_SELL";
   g_entryQuality="FLIP_LOCK_M1";
   g_entryQualityScore=0.0;

   bool sent=SendMarketOrder(direction);
   if(sent)
   {
      RegisterOrderRequest();
      g_flipLockDirection=direction;
      g_flipLockPeakPrice=0.0;
      g_flipLockTriggerPrice=0.0;
      g_flipLockPendingDirection=0;
      g_flipLockPendingTriggerPrice=0.0;
      g_flipLockArmed=false;
      g_flipLockLastFlatAt=0;
      g_flipLockReason="M1_STARTER_OPENED";
      g_executionStatus=direction>0 ? "FLIP_LOCK_M1_START_BUY" : "FLIP_LOCK_M1_START_SELL";
   }
   else
      g_flipLockReason="STARTER_RETRY";
   return sent;
}

double FlipLockProfitLockPrice(
   const int direction,
   const double openPrice,
   const MqlTick &tick
)
{
   if(direction==0 || openPrice<=0.0)
      return 0.0;

   double trailPoints=MathMax(
      FLIP_LOCK_TRAIL_DISTANCE_POINTS,
      FlipLockBrokerMinDistancePoints()
   );
   double executablePrice=direction>0 ? tick.bid : tick.ask;
   double target=direction>0
      ? executablePrice-trailPoints*_Point
      : executablePrice+trailPoints*_Point;

   // Do not replace the wide Safety SL until the fixed-distance trail itself
   // sits on the profitable side of entry. Broker Stops/Freeze legality is
   // already included in trailPoints above.
   if(direction>0)
   {
      if(target<=openPrice) return 0.0;
   }
   else
   {
      if(target>=openPrice) return 0.0;
   }

   return NormalizeStopPriceToTick(target,direction);
}

bool FlipLockProfitStopIsLegal(
   const int direction,
   const double stopPrice,
   const double openPrice,
   const MqlTick &tick
)
{
   if(direction==0 || stopPrice<=0.0 || openPrice<=0.0) return false;
   double minimum=FlipLockBrokerMinDistancePoints()*_Point;
   if(direction>0)
      return stopPrice>openPrice && stopPrice<=tick.bid-minimum;
   return stopPrice<openPrice && stopPrice>=tick.ask+minimum;
}

bool FlipLockSyncProfitLock(
   const ulong positionTicket,
   const int direction,
   const double positionVolume,
   const double currentSl,
   const MqlTick &tick
)
{
   if(positionTicket==0 || direction==0 || positionVolume<=0.0) return false;
   if(!PositionSelectByTicket(positionTicket)) return false;

   const double openPrice=PositionGetDouble(POSITION_PRICE_OPEN);
   const double target=FlipLockProfitLockPrice(
      direction,
      openPrice,
      tick
   );

   // Until the 100-point trailing stop can sit beyond entry legally, leave the
   // original wide Safety SL untouched.
   if(target<=0.0 || !FlipLockProfitStopIsLegal(direction,target,openPrice,tick))
   {
      g_flipLockReason="WAIT_PROFIT_LOCK_DISTANCE";
      g_executionStatus="FLIP_LOCK_WAIT_PROFIT_LOCK";
      return true;
   }

   double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tickSize<=0.0) tickSize=_Point;
   bool improved=currentSl<=0.0 ||
      (direction>0
         ? target>=currentSl+tickSize-1e-12
         : target<=currentSl-tickSize+1e-12);

   if(!improved)
   {
      g_flipLockArmed=true;
      g_flipLockTriggerPrice=currentSl;
      g_flipLockReason="PROFIT_LOCK_HOLD";
      g_executionStatus=direction>0
         ? "FLIP_LOCK_BUY_PROFIT_LOCK"
         : "FLIP_LOCK_SELL_PROFIT_LOCK";
      return true;
   }

   ulong nowMs=GetTickCount64();
   bool syncReady=g_flipLockLastStopSyncMs==0 ||
      nowMs-g_flipLockLastStopSyncMs>=FLIP_LOCK_STOP_SYNC_MIN_MS;
   if(!syncReady)
      return true;

   if(!FlipLockSetPositionStop(positionTicket,target))
   {
      g_flipLockReason="SL_PROFIT_LOCK_RETRY";
      g_executionStatus="FLIP_LOCK_SL_PROFIT_LOCK_RETRY";
      return false;
   }

   g_flipLockLastStopSyncMs=nowMs;
   g_flipLockTriggerPrice=target;
   g_flipLockArmed=true;
   g_flipLockReason="LOCAL_100_POINT_PROFIT_TRAIL";
   g_executionStatus=direction>0
      ? "FLIP_LOCK_BUY_PROFIT_LOCK"
      : "FLIP_LOCK_SELL_PROFIT_LOCK";
   return true;
}

bool FlipLockClosePositionTicket(const ulong ticket)
{
   if(!FlipLockOwnedPosition(ticket)) return true;

   long type=PositionGetInteger(POSITION_TYPE);
   double volume=PositionGetDouble(POSITION_VOLUME);
   if(volume<=0.0) return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick)) return false;

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_DEAL;
   request.position=ticket;
   request.symbol=_Symbol;
   request.magic=InpMagic;
   request.volume=NormalizeTradeVolume(volume);
   request.deviation=DynamicDeviationPoints();
   request.type_filling=AllowedFillingMode();
   request.type=type==POSITION_TYPE_BUY ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
   request.price=request.type==ORDER_TYPE_BUY ? tick.ask : tick.bid;
   request.comment=FLIP_LOCK_LIVE_COMMENT;

   ResetLastError();
   bool sent=OrderSend(request,result);
   g_lastOrderError=GetLastError();
   g_lastOrderRetcode=(long)result.retcode;
   return sent && FlipLockTradeAccepted(result.retcode);
}

bool FlipLockReconcileHedgingPositions()
{
   int ownCount=FlipLockOwnedPositionCount();
   if(ownCount<=1) return true;
   if(!FlipLockAccountIsHedging()) return false;

   ulong keepTicket=0;
   long keepTime=-1;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(!FlipLockOwnedPosition(ticket)) continue;
      long opened=(long)PositionGetInteger(POSITION_TIME_MSC);
      if(keepTicket==0 || opened>=keepTime)
      {
         keepTicket=ticket;
         keepTime=opened;
      }
   }
   if(keepTicket==0) return false;

   bool ok=true;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || ticket==keepTicket || !FlipLockOwnedPosition(ticket)) continue;
      if(!FlipLockClosePositionTicket(ticket)) ok=false;
   }

   if(ok)
   {
      g_flipLockFlipCount++;
      g_flipLockLastFlipAt=TimeCurrent();
      g_flipLockReason="HEDGING_PENDING_FLIP_RECONCILE";
      g_executionStatus="FLIP_LOCK_PENDING_FLIP_RECONCILE";
   }
   return ok;
}

bool FlipLockPendingTriggerCrossed()
{
   if(!g_flipLockArmed ||
      g_flipLockPendingDirection==0 ||
      g_flipLockPendingTriggerPrice<=0.0)
      return false;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick)) return false;
   double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tickSize<=0.0) tickSize=_Point;
   double tolerance=tickSize*2.0;

   if(g_flipLockPendingDirection>0)
      return tick.ask>=g_flipLockPendingTriggerPrice-tolerance;
   return tick.bid<=g_flipLockPendingTriggerPrice+tolerance;
}

bool FlipLockHistoryPositionOwned(const ulong positionId)
{
   if(positionId==0 || !HistorySelectByPosition(positionId))
      return false;

   int total=HistoryDealsTotal();
   for(int i=0;i<total;i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0) continue;
      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_IN && entry!=DEAL_ENTRY_INOUT) continue;
      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol) continue;
      if(HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) continue;

      string comment=HistoryDealGetString(deal,DEAL_COMMENT);
      if(StringFind(comment,FLIP_LOCK_LIVE_COMMENT)>=0 ||
         StringFind(comment,FLIP_LOCK_PENDING_COMMENT)>=0)
         return true;
   }
   return false;
}

bool FlipLockLastExitWasStop()
{
   datetime now=TimeCurrent();
   if(!HistorySelect(now-86400,now+60))
      return false;

   int total=HistoryDealsTotal();
   ulong latestExit=0;
   long latestTime=-1;
   ulong latestPositionId=0;
   long latestReason=0;

   for(int i=0;i<total;i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0) continue;
      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol ||
         HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic)
         continue;

      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_OUT &&
         entry!=DEAL_ENTRY_OUT_BY &&
         entry!=DEAL_ENTRY_INOUT)
         continue;

      long dealTime=(long)HistoryDealGetInteger(deal,DEAL_TIME_MSC);
      if(latestExit==0 || dealTime>=latestTime)
      {
         latestExit=deal;
         latestTime=dealTime;
         latestPositionId=(ulong)HistoryDealGetInteger(deal,DEAL_POSITION_ID);
         latestReason=HistoryDealGetInteger(deal,DEAL_REASON);
      }
   }

   if(latestExit==0 || latestReason!=DEAL_REASON_SL)
      return false;

   return FlipLockHistoryPositionOwned(latestPositionId);
}


void FlipLockManageFlatState()
{
   // New engine never pre-places the opposite side. Remove stale pending orders
   // left by an older 1.1.0 build before deciding any new market exposure.
   FlipLockRemoveAllPending();
   g_flipLockFlatPendingSince=0;

   if(g_flipLockDirection!=0 && FlipLockLastExitWasStop())
   {
      // SL is the FLIP handoff trigger. A BUY stop-out means price reversed
      // downward, so continue with SELL. A SELL stop-out means price reversed
      // upward, so continue with BUY. Do not re-read M1 for this handoff.
      int nextDirection=-g_flipLockDirection;
      g_flipLockReason=nextDirection>0
         ? "SL_HANDOFF_TO_BUY"
         : "SL_HANDOFF_TO_SELL";

      // Keep the previous direction until the replacement order is accepted so
      // a transient broker reject cannot lose the required BUY<->SELL handoff.
      if(FlipLockOpenStarter(nextDirection))
      {
         g_flipLockFlipCount++;
         g_flipLockLastFlipAt=TimeCurrent();
      }
      return;
   }

   if(g_flipLockDirection!=0)
   {
      // Manual/Close-All/non-SL exits are not reversal signals. Reset the old
      // leg and let the normal M1 starter choose a fresh side after cooldown.
      if(g_flipLockLastFlatAt>0 &&
         TimeCurrent()-g_flipLockLastFlatAt<FLIP_LOCK_UNARMED_RESTART_COOLDOWN_SECONDS)
      {
         g_flipLockReason="WAIT_RESTART_COOLDOWN";
         g_executionStatus="FLIP_LOCK_WAIT_RESTART_COOLDOWN";
         return;
      }
      FlipLockResetTracking(false);
   }
   else
      ResetBasketCycleState();

   FlipLockOpenStarter();
}

void FlipLockManage()
{
   bool selected=FlipLockModeEnabled();
   int ownCount=FlipLockOwnedPositionCount();
   bool ownsLivePosition=ownCount>0;

   if(!selected && !ownsLivePosition)
   {
      FlipLockRemoveAllPending();
      FlipLockResetTracking(true);
      return;
   }

   // 1.2.0 has no opposite pending baton. Clean any stale order from 1.1.0.
   FlipLockRemoveAllPending();

   int totalCount=BasketPositionCount();
   bool canOpenNewCycle=
      selected &&
      g_state==STATE_RUNNING &&
      g_access &&
      g_runAuthorized &&
      g_settingsSynchronized &&
      EntryLeaseValid() &&
      TradePermissionStatus()=="OK";

   if(totalCount<=0)
   {
      if(g_flipLockLastFlatAt<=0) g_flipLockLastFlatAt=TimeCurrent();

      if(!canOpenNewCycle)
      {
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

   if(!ownsLivePosition)
   {
      g_flipLockReason="WAIT_FOREIGN_POSITION";
      g_executionStatus="FLIP_LOCK_WAIT_EXISTING_POSITION";
      return;
   }

   if(ownCount!=1 || totalCount!=ownCount)
   {
      g_flipLockReason=ownCount>1
         ? "WAIT_SINGLE_POSITION"
         : "WAIT_FOREIGN_POSITION";
      g_executionStatus=ownCount>1
         ? "FLIP_LOCK_WAIT_SINGLE_POSITION"
         : "FLIP_LOCK_WAIT_EXISTING_POSITION";
      return;
   }

   ulong positionTicket=0;
   int direction=0;
   double volume=0.0,currentSl=0.0,currentTp=0.0;
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

   // Server state controls only NEW exposure. A live FLIP position must keep
   // tightening its broker SL from the local MT5 quote even during Stop/offline.
   FlipLockSyncProfitLock(positionTicket,direction,volume,currentSl,tick);

   if(!canOpenNewCycle)
   {
      g_flipLockReason=g_flipLockArmed
         ? "PROFIT_LOCK_MANAGE_ONLY"
         : "LIVE_SAFETY_ONLY";
      g_executionStatus=g_flipLockArmed
         ? "FLIP_LOCK_PROFIT_LOCK_MANAGE_ONLY"
         : "FLIP_LOCK_LIVE_SAFETY_ONLY";
   }
}

#endif
