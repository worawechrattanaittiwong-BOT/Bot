#ifndef SCENOVA_FLIP_LOCK_V1_MQH
#define SCENOVA_FLIP_LOCK_V1_MQH

// FLIP LOCK V2 mirrors the mobile-MT5 baton pattern:
//   1 live market position + 1 opposite STOP pending order.
// The current position SL and the opposite pending order share the same
// trigger price.  As price moves in the position's favour the pair only
// tightens; it never loosens.  FLIP LOCK owns its own starter entry and does
// not wait for AUTO/VECTOR/Parallel-Universe approval.
#define FLIP_LOCK_V1_VERSION "3.0.0"
#define FLIP_LOCK_PENDING_COMMENT "SCNFlipLock"
#define FLIP_LOCK_LIVE_COMMENT "SCNFlipLockLive"
#define FLIP_LOCK_FLAT_PENDING_GRACE_SECONDS 2

int g_flipLockDirection=0;
double g_flipLockPeakPrice=0.0;
double g_flipLockTriggerPrice=0.0;
bool g_flipLockArmed=false;
int g_flipLockFlipCount=0;
datetime g_flipLockLastFlipAt=0;
datetime g_flipLockLastFlatAt=0;
datetime g_flipLockFlatPendingSince=0;
string g_flipLockReason="IDLE";

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
   g_flipLockReason="IDLE";
   if(resetCounter) g_flipLockFlipCount=0;
}

double FlipLockBrokerMinDistancePoints()
{
   double stops=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   double freeze=(double)SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL);
   return MathMax(2.0,MathMax(stops,freeze)+2.0);
}

double FlipLockTrailDistancePoints()
{
   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0) spread=5.0;
   double atr=AverageTrueRangePoints(PERIOD_M1,MathMax(5,g_atrPeriod));
   if(atr<=0.0) atr=spread*4.0;

   // Normal markets keep the baton close.  During a fast candle ATR expands
   // the distance automatically, matching the wide trailing gap visible in
   // the reference clip without using a fixed-dollar stop.
   return MathMax(
      FlipLockBrokerMinDistancePoints(),
      MathMax(10.0,MathMax(spread*3.0,atr*0.25))
   );
}

double FlipLockNormalizePrice(const double price)
{
   int digits=(int)SymbolInfoInteger(_Symbol,SYMBOL_DIGITS);
   return NormalizeDouble(price,MathMax(0,digits));
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
   request.price=FlipLockNormalizePrice(triggerPrice);
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

   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_MODIFY;
   request.order=ticket;
   request.symbol=_Symbol;
   request.magic=InpMagic;
   request.price=FlipLockNormalizePrice(triggerPrice);
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
   double executablePrice=direction>0 ? tick.bid : tick.ask;
   double distance=FlipLockTrailDistancePoints()*_Point;
   double candidate=direction>0
      ? executablePrice-distance
      : executablePrice+distance;
   return FlipLockNormalizePrice(candidate);
}

bool FlipLockTriggerIsLegal(const int direction,const double trigger,const MqlTick &tick)
{
   double minDistance=FlipLockBrokerMinDistancePoints()*_Point;
   if(direction>0) return trigger<=tick.bid-minDistance;
   return trigger>=tick.ask+minDistance;
}

bool FlipLockSyncBaton(const ulong positionTicket,const int direction,const double positionVolume,const double currentSl,const MqlTick &tick)
{
   if(positionTicket==0 || direction==0 || positionVolume<=0.0) return false;

   double candidate=FlipLockCandidateTrigger(direction,tick);
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

   ulong pendingTicket=0;
   int pendingDirection=0;
   double pendingPrice=0.0;
   double pendingVolume=0.0;
   bool hasPending=FlipLockFindPending(pendingTicket,pendingDirection,pendingPrice,pendingVolume);
   int wantedPendingDirection=-direction;

   if(hasPending && pendingDirection!=wantedPendingDirection)
   {
      FlipLockRemovePendingTicket(pendingTicket);
      pendingTicket=0;
      pendingDirection=0;
      pendingPrice=0.0;
      pendingVolume=0.0;
      hasPending=false;
   }

   double trigger=g_flipLockTriggerPrice;
   double moveThreshold=MathMax(2.0,FlipLockTrailDistancePoints()*0.10)*_Point;
   bool stopNeedsUpdate=currentSl<=0.0 || MathAbs(currentSl-trigger)>=moveThreshold;
   bool pendingNeedsUpdate=!hasPending || MathAbs(pendingPrice-trigger)>=moveThreshold;

   // Tighten the protective SL first.  If the pending update is rejected the
   // position is still protected; this is safer than creating an unpaired hedge.
   if(stopNeedsUpdate && !FlipLockSetPositionStop(positionTicket,trigger))
   {
      g_flipLockReason="SL_SYNC_RETRY";
      g_executionStatus="FLIP_LOCK_SL_SYNC_RETRY";
      return false;
   }

   if(!hasPending)
   {
      if(!FlipLockPlacePending(wantedPendingDirection,trigger,positionVolume))
      {
         g_flipLockReason="PENDING_CREATE_RETRY";
         g_executionStatus="FLIP_LOCK_PENDING_RETRY";
         return false;
      }
   }
   else if(pendingNeedsUpdate && !FlipLockModifyPending(pendingTicket,trigger))
   {
      g_flipLockReason="PENDING_TRAIL_RETRY";
      g_executionStatus="FLIP_LOCK_PENDING_TRAIL_RETRY";
      return false;
   }

   g_flipLockArmed=true;
   g_flipLockReason="BATON_ARMED";
   g_executionStatus=direction>0 ? "FLIP_LOCK_BUY_SELL_STOP" : "FLIP_LOCK_SELL_BUY_STOP";
   return true;
}

void FlipLockManageFlatState()
{
   ulong pendingTicket=0;
   int pendingDirection=0;
   double pendingPrice=0.0;
   double pendingVolume=0.0;
   bool hasPending=FlipLockFindPending(pendingTicket,pendingDirection,pendingPrice,pendingVolume);

   if(hasPending)
   {
      // A paired SL and STOP can be reported in either order by the broker.
      // Give the pending deal a short grace window.  If the account is still
      // flat afterwards, convert the intended baton direction to a market entry
      // and remove the orphan pending so FLIP LOCK never stays flat indefinitely.
      if(g_flipLockFlatPendingSince<=0)
         g_flipLockFlatPendingSince=TimeCurrent();

      if(TimeCurrent()-g_flipLockFlatPendingSince<FLIP_LOCK_FLAT_PENDING_GRACE_SECONDS)
      {
         g_flipLockReason="WAIT_PENDING_FILL";
         g_executionStatus="FLIP_LOCK_WAIT_PENDING_FILL";
         return;
      }

      FlipLockRemovePendingTicket(pendingTicket);
      g_flipLockFlipCount++;
      g_flipLockLastFlipAt=TimeCurrent();
      g_flipLockFlatPendingSince=0;
      FlipLockOpenStarter(pendingDirection);
      return;
   }

   g_flipLockFlatPendingSince=0;
   FlipLockOpenStarter();
}

void FlipLockManage()
{
   if(!FlipLockModeEnabled())
   {
      // This cleanup path is intentionally safe to call on every timer.  The EA
      // wrapper should invoke FlipLockManage() even after a mode switch so a
      // broker-side pending order can never survive outside FLIP LOCK.
      FlipLockRemoveAllPending();
      FlipLockResetTracking(true);
      return;
   }

   if(g_state!=STATE_RUNNING || !g_access || !g_runAuthorized)
   {
      FlipLockRemoveAllPending();
      g_flipLockReason="WAIT_RUN_AUTHORIZATION";
      return;
   }

   int count=BasketPositionCount();
   if(count<=0)
   {
      if(g_flipLockLastFlatAt<=0) g_flipLockLastFlatAt=TimeCurrent();
      FlipLockManageFlatState();
      return;
   }
   g_flipLockLastFlatAt=0;
   g_flipLockFlatPendingSince=0;

   if(!BasketHasFlipLockPosition())
   {
      // A foreign AUTO/MANUAL position is not converted into a FLIP LOCK
      // position. Remove any stale baton and wait until the prior owner is flat.
      FlipLockRemoveAllPending();
      g_flipLockReason="WAIT_FOREIGN_POSITION";
      g_executionStatus="FLIP_LOCK_WAIT_EXISTING_POSITION";
      return;
   }

   // The reference behaviour is exactly one live market position.  During the
   // few milliseconds in which a broker reports both sides, do not add or trail
   // anything; the paired SL/pending settlement is allowed to finish first.
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
