
int ZeroGridPositionCount()
{
   LoadZeroGridCycleState();
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(ZeroGridOwnsSelectedPosition()) count++;
   }
   return count;
}

int ZeroGridPendingCount()
{
   int count=0;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(IsZeroGridComment(OrderGetString(ORDER_COMMENT))) count++;
   }
   return count;
}

int ZeroGridForeignPositionCount()
{
   int count=0;
   bool netting=ZeroGridAccountIsNetting();
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol) continue;

      long magic=PositionGetInteger(POSITION_MAGIC);
      string comment=PositionGetString(POSITION_COMMENT);
      if(magic==InpMagic && IsZeroGridComment(comment)) continue;

      // Netting merges all exposure on one symbol, so any existing position on
      // this symbol must be treated as foreign. Hedging can safely coexist with
      // unrelated/manual positions as long as they are not owned by this EA.
      if(netting || magic==InpMagic) count++;
   }
   return count;
}

bool ZeroGridLevelExists(bool buySide,int level)
{
   string wanted=ZeroGridComment(buySide,level);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)==_Symbol &&
         OrderGetInteger(ORDER_MAGIC)==InpMagic &&
         OrderGetString(ORDER_COMMENT)==wanted)
         return true;
   }
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol &&
         PositionGetInteger(POSITION_MAGIC)==InpMagic &&
         PositionGetString(POSITION_COMMENT)==wanted)
         return true;
   }

   LoadZeroGridCycleState();
   if(g_zeroGridCycleStartedAt>0 && HistorySelect(g_zeroGridCycleStartedAt,TimeCurrent()+60))
   {
      int total=HistoryOrdersTotal();
      for(int i=0;i<total;i++)
      {
         ulong ticket=HistoryOrderGetTicket(i);
         if(ticket==0) continue;
         if(HistoryOrderGetString(ticket,ORDER_SYMBOL)!=_Symbol) continue;
         if(HistoryOrderGetInteger(ticket,ORDER_MAGIC)!=InpMagic) continue;
         if(HistoryOrderGetString(ticket,ORDER_COMMENT)!=wanted) continue;
         long state=HistoryOrderGetInteger(ticket,ORDER_STATE);
         if(state==ORDER_STATE_FILLED || state==ORDER_STATE_PARTIAL)
            return true;
      }
   }
   return false;
}

double ZeroGridCycleNet()
{
   LoadZeroGridCycleState();
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;
      total += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   }

   if(g_zeroGridCycleStartedAt>0 && HistorySelect(g_zeroGridCycleStartedAt,TimeCurrent()+60))
   {
      int totalDeals=HistoryDealsTotal();
      for(int i=0;i<totalDeals;i++)
      {
         ulong deal=HistoryDealGetTicket(i);
         if(deal==0) continue;
         if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol) continue;
         if(HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) continue;
         total += HistoryDealGetDouble(deal,DEAL_PROFIT);
         total += HistoryDealGetDouble(deal,DEAL_SWAP);
         total += HistoryDealGetDouble(deal,DEAL_COMMISSION);
         total += HistoryDealGetDouble(deal,DEAL_FEE);
      }
   }
   return total;
}

double ZeroGridEstimatedExitCostMoney()
{
   LoadZeroGridCycleState();
   if(g_zeroGridCycleStartedAt<=0) return 0.0;

   double openVolume=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;
      openVolume += MathMax(0.0,PositionGetDouble(POSITION_VOLUME));
   }
   if(openVolume<=0.0) return 0.0;

   if(!HistorySelect(g_zeroGridCycleStartedAt,TimeCurrent()+60)) return 0.0;
   double entryCost=0.0;
   double entryVolume=0.0;
   int totalDeals=HistoryDealsTotal();
   for(int i=0;i<totalDeals;i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0) continue;
      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol) continue;
      if(HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic) continue;
      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_IN && entry!=DEAL_ENTRY_INOUT) continue;
      double volume=HistoryDealGetDouble(deal,DEAL_VOLUME);
      if(volume<=0.0) continue;
      entryVolume += volume;
      entryCost += MathAbs(HistoryDealGetDouble(deal,DEAL_COMMISSION));
      entryCost += MathAbs(HistoryDealGetDouble(deal,DEAL_FEE));
   }
   if(entryVolume<=0.0 || entryCost<=0.0) return 0.0;

   // MT5 does not expose future closing commission in advance. Estimate it
   // from observed entry cost per lot. Spread is already in POSITION_PROFIT.
   return (entryCost/entryVolume)*openVolume;
}

double ZeroGridRequiredCloseNet()
{
   return MathMax(0.01,g_zeroGridMinNetProfitMoney)
      + MathMax(0.0,g_zeroGridCloseReserveMoney)
      + ZeroGridEstimatedExitCostMoney();
}

double ZeroGridTickSize()
{
   double tick=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tick<=0.0) tick=_Point;
   return MathMax(_Point,tick);
}

double ZeroGridMinPendingDistancePrice()
{
   // New pending orders are constrained by StopsLevel. FreezeLevel mainly
   // limits later modify/delete operations near market and must not push the
   // first ZERO trigger farther away than the broker requires for placement.
   long stops=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   double brokerDistance=(double)MathMax((long)0,stops)*_Point;
   return MathMax(ZeroGridTickSize(),brokerDistance);
}

// ZERO GRID V2.1 geometry: the first entry hugs the live market at the broker-safe
// Stops/Freeze boundary, while the configured Grid Step is reserved for spacing
// BETWEEN levels. This avoids compressed/duplicate pending prices when price moves.
double ZeroGridEffectiveStepPrice()
{
   double tick=ZeroGridTickSize();
   double source=g_zeroGridCycleStepPrice>0.0
      ? g_zeroGridCycleStepPrice
      : (g_zeroGridLowVolatilityEnabled ? 0.30 : g_zeroGridStepPrice);
   double requested=MathMax(source,tick);
   double units=MathCeil((requested/tick)-1e-10);
   return NormalizeDouble(units*tick,_Digits);
}

int ZeroGridEffectiveLevelsPerSide()
{
   int source=g_zeroGridCycleLevelsPerSide>0 ? g_zeroGridCycleLevelsPerSide : g_zeroGridLevelsPerSide;
   return (int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)source));
}

double ZeroGridEffectiveBaseLot()
{
   double source=g_zeroGridCycleBaseLot>0.0 ? g_zeroGridCycleBaseLot : g_zeroGridBaseLot;
   return MathMax(0.0001,source);
}

bool ZeroGridEffectiveLowVolatilityEnabled()
{
   if(g_zeroGridCycleLowVolatility >= 0)
      return g_zeroGridCycleLowVolatility == 1;
   return g_zeroGridLowVolatilityEnabled;
}

double ZeroGridEffectiveLevelLot(int level)
{
   double baseLot=ZeroGridEffectiveBaseLot();
   double requested=ZeroGridEffectiveLowVolatilityEnabled()
      ? baseLot
      : baseLot*MathMax(1,level);
   return NormalizeTradeVolume(requested);
}

double ZeroGridEntryGapPrice()
{
   // Customer geometry is explicit: current/center 4000.00 -> BUY STOP
   // 4001.00 and SELL STOP 3999.00. Keep exactly 1.00 price unit whenever
   // the broker permits it; widen only when StopsLevel genuinely requires it.
   double tick=ZeroGridTickSize();
   double preferredGap=ZeroGridEffectiveLowVolatilityEnabled() ? 0.10 : 1.0;
   double brokerSafeGap=ZeroGridMinPendingDistancePrice()+tick*2.0;
   double gap=MathMax(preferredGap,brokerSafeGap);
   double units=MathCeil((gap/tick)-1e-10);
   return NormalizeDouble(units*tick,_Digits);
}

double ZeroGridNormalizeCenterPrice(double rawPrice)
{
   double tick=ZeroGridTickSize();
   double units=MathRound(rawPrice/tick);
   return NormalizeDouble(units*tick,_Digits);
}

bool ZeroGridRequestedConfigChanged()
{
   if(g_zeroGridCycleStartedAt<=0) return false;
   double tick=ZeroGridTickSize();
   double requestedSource=g_zeroGridLowVolatilityEnabled ? 0.30 : g_zeroGridStepPrice;
   double requestedStep=MathMax(requestedSource,tick);
   requestedStep=NormalizeDouble(MathCeil((requestedStep/tick)-1e-10)*tick,_Digits);
   int requestedLevels=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));
   double requestedLot=MathMax(0.0001,g_zeroGridBaseLot);
   bool requestedLowVolatility=g_zeroGridLowVolatilityEnabled;
   return requestedLowVolatility!=ZeroGridEffectiveLowVolatilityEnabled() ||
          MathAbs(requestedStep-ZeroGridEffectiveStepPrice())>tick*0.5 ||
          requestedLevels!=ZeroGridEffectiveLevelsPerSide() ||
          MathAbs(requestedLot-ZeroGridEffectiveBaseLot())>0.0000001;
}

double ZeroGridNormalizePendingPrice(bool buySide,double rawPrice)
{
   double tick=ZeroGridTickSize();
   double units=rawPrice/tick;
   double price=buySide
      ? MathCeil(units-1e-10)*tick
      : MathFloor(units+1e-10)*tick;
   return NormalizeDouble(price,_Digits);
}

double ZeroGridExistingPendingAnchorPrice(bool buySide)
{
   string prefix=buySide ? "SaaSZeroGridB" : "SaaSZeroGridS";
   double step=ZeroGridEffectiveStepPrice();
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      string comment=OrderGetString(ORDER_COMMENT);
      if(StringFind(comment,prefix)!=0) continue;
      int level=(int)StringToInteger(StringSubstr(comment,StringLen(prefix)));
      if(level<1) continue;
      double orderPrice=OrderGetDouble(ORDER_PRICE_OPEN);
      double anchor=buySide
         ? orderPrice-step*(level-1)
         : orderPrice+step*(level-1);
      return ZeroGridNormalizePendingPrice(buySide,anchor);
   }
   return 0.0;
}

double ZeroGridPendingAnchorPrice(bool buySide)
{
   LoadZeroGridCycleState();
   if(g_zeroGridCenter<=0.0) return 0.0;

   // Preserve exact ladder geometry after the first level exists.
   double existing=ZeroGridExistingPendingAnchorPrice(buySide);
   if(existing>0.0) return existing;

   MqlTick live;
   if(!SymbolInfoTick(_Symbol,live)) return 0.0;

   double gap=ZeroGridEntryGapPrice();
   double raw=buySide ? g_zeroGridCenter+gap : g_zeroGridCenter-gap;

   // Guard the request against a fast quote move while keeping the intended
   // center +/- first-gap geometry whenever the broker allows it.
   double brokerSafe=ZeroGridMinPendingDistancePrice()+ZeroGridTickSize();
   double legal=buySide ? live.ask+brokerSafe : live.bid-brokerSafe;
   if(buySide && raw<legal) raw=legal;
   if(!buySide && raw>legal) raw=legal;

   return ZeroGridNormalizePendingPrice(buySide,raw);
}

double ZeroGridPendingLevelPrice(bool buySide,int level)
{
   if(level<1) return 0.0;
   double anchor=ZeroGridPendingAnchorPrice(buySide);
   if(anchor<=0.0) return 0.0;
   double step=ZeroGridEffectiveStepPrice();
   double raw=buySide
      ? anchor+step*(level-1)
      : anchor-step*(level-1);
   return ZeroGridNormalizePendingPrice(buySide,raw);
}

int ZeroGridPositionDirection()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;
      return PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? 1 : -1;
   }
   return 0;
}

ENUM_ORDER_TYPE_TIME ZeroGridPendingTimeType()
{
   long modes=SymbolInfoInteger(_Symbol,SYMBOL_EXPIRATION_MODE);
   if((modes & SYMBOL_EXPIRATION_GTC)==SYMBOL_EXPIRATION_GTC)
      return ORDER_TIME_GTC;
   if((modes & SYMBOL_EXPIRATION_DAY)==SYMBOL_EXPIRATION_DAY)
      return ORDER_TIME_DAY;
   if((modes & SYMBOL_EXPIRATION_SPECIFIED)==SYMBOL_EXPIRATION_SPECIFIED)
      return ORDER_TIME_SPECIFIED;
   if((modes & SYMBOL_EXPIRATION_SPECIFIED_DAY)==SYMBOL_EXPIRATION_SPECIFIED_DAY)
      return ORDER_TIME_SPECIFIED_DAY;
   return ORDER_TIME_GTC;
}

datetime ZeroGridPendingExpiration(ENUM_ORDER_TYPE_TIME typeTime)
{
   if(typeTime==ORDER_TIME_SPECIFIED || typeTime==ORDER_TIME_SPECIFIED_DAY)
      return TimeCurrent()+30*24*60*60;
   return 0;
}

bool ZeroGridRecenterFlatCycle()
{
   if(ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)
      return false;
   MqlTick live;
   if(!SymbolInfoTick(_Symbol,live))
      return false;
   double mid=(live.bid+live.ask)*0.5;
   g_zeroGridCenter=ZeroGridNormalizeCenterPrice(mid);
   g_zeroGridCycleStartedAt=TimeCurrent();
   g_zeroGridClosing=false;
   SaveZeroGridCycleState();
   return g_zeroGridCenter>0.0;
}

bool ZeroGridSendPending(bool buySide,int level)
{
   if(level<1 || level>ZeroGridEffectiveLevelsPerSide() || ZeroGridLevelExists(buySide,level))
      return true;
   if(g_zeroGridCenter<=0.0)
      return false;
   if(!ZeroGridStopOrdersSupported())
   {
      g_executionStatus="ZERO_GRID_STOP_ORDERS_UNSUPPORTED";
      return false;
   }
   if(g_orderWindowStart==0 || TimeCurrent()-g_orderWindowStart>=60)
   {
      g_orderWindowStart=TimeCurrent();
      g_ordersInWindow=0;
   }

   double volume=ZeroGridEffectiveLevelLot(level);
   if(volume<=0.0)
   {
      g_executionStatus="ZERO_GRID_INVALID_LOT";
      return false;
   }

   // L1 is the critical trigger pair. Retry it immediately with a fresh tick
   // and slightly more broker headroom instead of allowing L2+ to leapfrog it.
   // Deeper levels need fewer retries because their anchor is already fixed by L1.
   int maxPlacementAttempts=(level==1 ? 3 : 2);
   for(int attempt=0;attempt<maxPlacementAttempts;attempt++)
   {
      // ZERO_SIMPLE_STABLE_V117: no strategy/rate gate decides whether a
      // configured pending level may be placed. Broker validity checks below
      // are execution requirements, not market/trend filters.

      MqlTick live;
      if(!SymbolInfoTick(_Symbol,live))
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return false;
      }

      double price=ZeroGridPendingLevelPrice(buySide,level);
      if(price<=0.0)
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return false;
      }

      // First try keeps the intended ~100-point geometry. If the quote moves
      // while the request is being staged, later L1 attempts add only 1 tick
      // at a time and clamp outward to the latest broker-safe boundary.
      double tickSize=ZeroGridTickSize();
      double retryHeadroom=tickSize*(attempt+1);
      double safeDistance=ZeroGridMinPendingDistancePrice()+retryHeadroom;
      double safeBoundary=buySide
         ? ZeroGridNormalizePendingPrice(true,live.ask+safeDistance)
         : ZeroGridNormalizePendingPrice(false,live.bid-safeDistance);

      bool unsafe=(buySide && price<safeBoundary) || (!buySide && price>safeBoundary);
      if(unsafe)
      {
         // Before L1 exists there is no valid ladder geometry to preserve, so
         // move L1 itself to the nearest legal live boundary. Once L1 exists,
         // never distort the configured spacing of L2+.
         if(level==1 && ZeroGridExistingPendingAnchorPrice(buySide)<=0.0)
            price=safeBoundary;
         else
         {
            g_executionStatus="ZERO_GRID_WAIT_SAFE_GEOMETRY";
            return false;
         }
      }

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_PENDING;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      request.volume=volume;
      request.price=price;
      request.type=buySide ? ORDER_TYPE_BUY_STOP : ORDER_TYPE_SELL_STOP;
      request.type_time=ZeroGridPendingTimeType();
      request.expiration=ZeroGridPendingExpiration(request.type_time);
      request.type_filling=ORDER_FILLING_RETURN;
      request.comment=ZeroGridComment(buySide,level);

      ResetLastError();
      bool sent=OrderSend(request,result);
      RegisterOrderRequest();
      g_lastOrderRetcode=(long)result.retcode;
      g_lastOrderError=GetLastError();
      g_lastOrderAt=TimeCurrent();

      if(sent && (result.retcode==TRADE_RETCODE_DONE || result.retcode==TRADE_RETCODE_PLACED))
         return true;

      PrintFormat(
         "ZERO pending retry side=%s level=%d attempt=%d price=%.*f bid=%.*f ask=%.*f retcode=%u error=%d",
         buySide ? "BUY" : "SELL",
         level,
         attempt+1,
         _Digits,price,
         _Digits,live.bid,
         _Digits,live.ask,
         result.retcode,
         g_lastOrderError
      );

      bool retryable=
         result.retcode==TRADE_RETCODE_INVALID_PRICE ||
         result.retcode==TRADE_RETCODE_INVALID_STOPS ||
         result.retcode==TRADE_RETCODE_PRICE_CHANGED ||
         result.retcode==TRADE_RETCODE_PRICE_OFF ||
         result.retcode==TRADE_RETCODE_REQUOTE;
      if(!retryable)
         break;
   }

   g_executionStatus=(level==1 ? "ZERO_GRID_L1_RETRY" : "ZERO_GRID_PENDING_RETRY");
   return false;
}

double ZeroGridPendingLevelVolume(bool buySide,int level)
{
   string wanted=ZeroGridComment(buySide,level);
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(OrderGetString(ORDER_COMMENT)!=wanted) continue;
      return OrderGetDouble(ORDER_VOLUME_INITIAL);
   }
   return 0.0;
}

bool ZeroGridCancelPendingLevel(bool buySide,int level)
{
   string wanted=ZeroGridComment(buySide,level);
   bool ok=true;
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(OrderGetString(ORDER_COMMENT)!=wanted) continue;

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      bool sent=OrderSend(request,result);
      if(sent && TradeResultAccepted(result))
         RegisterOrderRequest();
      else
         ok=false;
   }
   return ok;
}

bool ZeroGridFlatLevelPairValid(int level)
{
   double expected=ZeroGridEffectiveLevelLot(level);
   double buyVolume=ZeroGridPendingLevelVolume(true,level);
   double sellVolume=ZeroGridPendingLevelVolume(false,level);
   double volumeStep=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double tolerance=MathMax(0.0000001,volumeStep*0.25);
   if(expected<=0.0 || buyVolume<=0.0 || sellVolume<=0.0) return false;
   return MathAbs(buyVolume-sellVolume)<=tolerance &&
          MathAbs(buyVolume-expected)<=tolerance &&
          MathAbs(sellVolume-expected)<=tolerance;
}

bool ZeroGridEnsureLadder()
{
   if(g_zeroGridCenter<=0.0)
      return false;

   int positions=ZeroGridPositionCount();
   int levels=ZeroGridEffectiveLevelsPerSide();

   // ZERO_SIMPLE_STABLE_V117
   // Flat cycle = one simple job: make the configured BUY STOP and SELL STOP
   // ladder complete. Keep every accepted correct pending order and retry only
   // the missing/invalid side. Never tear down a good side just because the
   // broker was slower on its mate.
   if(positions==0)
   {
      for(int level=1;level<=levels;level++)
      {
         double expected=ZeroGridEffectiveLevelLot(level);
         double volumeStep=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
         double tolerance=MathMax(0.0000001,volumeStep*0.25);
         double buyVolume=ZeroGridPendingLevelVolume(true,level);
         double sellVolume=ZeroGridPendingLevelVolume(false,level);

         if(buyVolume>0.0 && MathAbs(buyVolume-expected)>tolerance)
         {
            ZeroGridCancelPendingLevel(true,level);
            buyVolume=0.0;
         }
         if(sellVolume>0.0 && MathAbs(sellVolume-expected)>tolerance)
         {
            ZeroGridCancelPendingLevel(false,level);
            sellVolume=0.0;
         }

         if(buyVolume<=0.0)
            ZeroGridSendPending(true,level);
         if(sellVolume<=0.0)
            ZeroGridSendPending(false,level);
      }

      if(ZeroGridPendingCount()!=levels*2)
      {
         g_executionStatus="ZERO_GRID_BUILDING";
         return false;
      }
      for(int level=1;level<=levels;level++)
      {
         if(!ZeroGridFlatLevelPairValid(level))
         {
            g_executionStatus="ZERO_GRID_BUILDING";
            return false;
         }
      }
      return true;
   }

   // Active cycle: a filled level is never recreated. ZeroGridLevelExists()
   // already treats live positions and cycle history as consumed levels. Only
   // a genuinely missing, still-unfilled pending level is repaired.
   bool complete=true;
   for(int level=1;level<=levels;level++)
   {
      if(!ZeroGridLevelExists(true,level))
         if(!ZeroGridSendPending(true,level)) complete=false;
      if(!ZeroGridLevelExists(false,level))
         if(!ZeroGridSendPending(false,level)) complete=false;
   }
   return complete;
}

void ZeroGridCancelPendingSide(bool buySide)
{
   string prefix=buySide ? "SaaSZeroGridB" : "SaaSZeroGridS";
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      string comment=OrderGetString(ORDER_COMMENT);
      if(StringFind(comment,prefix)!=0) continue;

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      OrderSend(request,result);
      RegisterOrderRequest();
   }
}

void ZeroGridCancelPending()
{
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(!IsZeroGridComment(OrderGetString(ORDER_COMMENT))) continue;

      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      OrderSend(request,result);
      RegisterOrderRequest();
   }
}

// Profit exit geometry: close the smallest owned lot first so a ZERO basket
// exits in a predictable 0.02 -> 0.04 -> 0.06 style sequence. For equal lots,
// prefer a profitable ticket, then the ticket nearest live price. Netting has
// one aggregate symbol position, so the same selector remains compatible.
ulong ZeroGridNearestCloseTicket()
{
   MqlTick tick;
   bool hasTick=SymbolInfoTick(_Symbol,tick);
   double priceTolerance=MathMax(ZeroGridTickSize()*0.5,_Point*0.5);
   double volumeStep=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
   double lotTolerance=MathMax(0.0000001,volumeStep*0.25);
   ulong bestTicket=0;
   double bestVolume=1.0e100;
   int bestProfitRank=99;
   double bestDistance=1.0e100;

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;

      long type=PositionGetInteger(POSITION_TYPE);
      double volume=PositionGetDouble(POSITION_VOLUME);
      double openPrice=PositionGetDouble(POSITION_PRICE_OPEN);
      double floating=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
      int profitRank=floating>=0.0 ? 0 : 1;
      double livePrice=hasTick
         ? (type==POSITION_TYPE_BUY ? tick.bid : tick.ask)
         : openPrice;
      double distance=MathAbs(openPrice-livePrice);

      bool sameLot=bestTicket!=0 && MathAbs(volume-bestVolume)<=lotTolerance;
      bool better=false;
      if(bestTicket==0 || volume<bestVolume-lotTolerance)
         better=true;
      else if(sameLot && profitRank<bestProfitRank)
         better=true;
      else if(sameLot && profitRank==bestProfitRank && distance<bestDistance-priceTolerance)
         better=true;
      else if(sameLot && profitRank==bestProfitRank &&
              MathAbs(distance-bestDistance)<=priceTolerance && ticket<bestTicket)
         better=true;

      if(better)
      {
         bestTicket=ticket;
         bestVolume=volume;
         bestProfitRank=profitRank;
         bestDistance=distance;
      }
   }
   return bestTicket;
}

bool ZeroGridClosePositionAsync(ulong ticket)
{
   if(MQLInfoInteger(MQL_TESTER))
      return ClosePositionByTicket(ticket);
   if(ticket==0 || !PositionSelectByTicket(ticket)) return false;
   if(!ZeroGridOwnsSelectedPosition()) return false;
   string symbol=PositionGetString(POSITION_SYMBOL);
   double volume=PositionGetDouble(POSITION_VOLUME);
   long positionType=PositionGetInteger(POSITION_TYPE);
   MqlTick tick;
   if(!SymbolInfoTick(symbol,tick)) return false;
   MqlTradeRequest request={};
   MqlTradeResult result={};
   request.action=TRADE_ACTION_DEAL;
   request.position=ticket;
   request.magic=PositionGetInteger(POSITION_MAGIC);
   request.symbol=symbol;
   request.volume=NormalizeTradeVolume(volume);
   request.deviation=DynamicDeviationPoints();
   request.type_filling=AllowedFillingMode();
   request.comment="SaaSZeroCloseAll";
   if(positionType==POSITION_TYPE_BUY) { request.type=ORDER_TYPE_SELL; request.price=tick.bid; }
   else { request.type=ORDER_TYPE_BUY; request.price=tick.ask; }
   ResetLastError();
   bool sent=OrderSendAsync(request,result);
   if(!sent || !TradeResultAccepted(result))
   {
      Print("ZERO close-all async rejected ticket=",ticket," error=",GetLastError()," retcode=",result.retcode);
      return false;
   }
   return true;
}

void ZeroGridCancelPendingAsync()
{
   if(MQLInfoInteger(MQL_TESTER))
   {
      ZeroGridCancelPending();
      return;
   }
   for(int i=OrdersTotal()-1;i>=0;i--)
   {
      ulong ticket=OrderGetTicket(i);
      if(ticket==0 || !OrderSelect(ticket)) continue;
      if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
      if(!IsZeroGridComment(OrderGetString(ORDER_COMMENT))) continue;
      MqlTradeRequest request={};
      MqlTradeResult result={};
      request.action=TRADE_ACTION_REMOVE;
      request.order=ticket;
      request.magic=InpMagic;
      request.symbol=_Symbol;
      ResetLastError();
      if(OrderSendAsync(request,result) && TradeResultAccepted(result)) RegisterOrderRequest();
      else Print("ZERO cancel-all async rejected order=",ticket," error=",GetLastError()," retcode=",result.retcode);
   }
}

void ZeroGridClosePositions()
{
   // ZERO_GRID_CLOSE_ALL_BURST: queue every owned position exit first, then
   // cancel remaining ZERO pending orders without waiting one network round trip per ticket.
   ulong nowMs=GetTickCount64();
   if(g_zeroGridLastExitBurstMs>0 && nowMs-g_zeroGridLastExitBurstMs<750) return;
   g_zeroGridLastExitBurstMs=nowMs;
   ulong tickets[];
   int ticketCount=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(!ZeroGridOwnsSelectedPosition()) continue;
      ArrayResize(tickets,ticketCount+1);
      tickets[ticketCount++]=ticket;
   }
   int sent=0;
   for(int i=0;i<ticketCount;i++) if(ZeroGridClosePositionAsync(tickets[i])) sent++;
   ZeroGridCancelPendingAsync();
   if(sent>0) g_executionStatus="ZERO_GRID_CLOSE_ALL_BURST";
}

bool StartZeroGridCycle()
{
   if(!ZeroGridModeEnabled())
      return false;

   // ZERO has no trend, momentum, confidence, ATR, session, spread or heartbeat
   // freshness entry filter. Only explicit RUN/access and real broker ability
   // to trade are allowed to stop a new pending ladder.
   if(g_state!=STATE_RUNNING || !g_access)
   {
      g_executionStatus="ZERO_GRID_STOPPED";
      return true;
   }
   if(!ZeroGridHedgingAllowed())
   {
      ZeroGridCancelPending();
      g_executionStatus="ZERO_GRID_HEDGING_REQUIRED";
      return true;
   }
   string permissionStatus=TradePermissionStatus();
   if(permissionStatus!="OK")
   {
      g_executionStatus=permissionStatus;
      return true;
   }
   if(!ZeroGridStopOrdersSupported())
   {
      g_executionStatus="ZERO_GRID_STOP_ORDERS_UNSUPPORTED";
      return true;
   }

   LoadZeroGridCycleState();
   if(g_zeroGridCenter<=0.0 && ZeroGridForeignPositionCount()>0)
   {
      g_executionStatus="ZERO_GRID_FOREIGN_POSITION_BLOCK";
      return true;
   }

   if(g_zeroGridCenter<=0.0)
   {
      // A new cycle always starts from one fresh center and locks only the ZERO
      // settings that define the pending ladder. Nothing from AUTO/RACE is read.
      if(ZeroGridPendingCount()>0)
         ZeroGridCancelPending();

      MqlTick tick;
      if(!SymbolInfoTick(_Symbol,tick))
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return true;
      }

      double mid=(tick.bid+tick.ask)*0.5;
      g_zeroGridCenter=ZeroGridNormalizeCenterPrice(mid);
      g_zeroGridStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);
      g_zeroGridCycleStartedAt=TimeCurrent();
      g_zeroGridClosing=false;
      g_zeroGridLastExitBurstMs=0;
      g_zeroGridCycleLowVolatility=g_zeroGridLowVolatilityEnabled ? 1 : 0;
      g_zeroGridCycleStepPrice=MathMax(ZeroGridTickSize(),g_zeroGridLowVolatilityEnabled ? 0.30 : ZeroGridAllowedStep(g_zeroGridStepPrice));
      g_zeroGridCycleLevelsPerSide=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));
      g_zeroGridCycleBaseLot=MathMax(0.01,g_zeroGridBaseLot);
      g_orderWindowStart=TimeCurrent();
      g_ordersInWindow=0;
      SaveZeroGridCycleState();
   }

   bool ready=ZeroGridEnsureLadder();
   g_executionStatus=ready ? "ZERO_GRID_READY" : "ZERO_GRID_BUILDING";
   return true;
}

bool ManageZeroGrid()
{
   LoadZeroGridCycleState();
   int positions=ZeroGridPositionCount();
   int pending=ZeroGridPendingCount();

   // Once profit close begins, finish it first. When the account is flat,
   // immediately reset and build the next ZERO pending ladder in the same
   // runtime path. The 200 ms timer also calls this path, so rearm does not
   // depend on receiving another market tick.
   if(g_zeroGridClosing)
   {
      ZeroGridClosePositions();
      if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)
      {
         ResetZeroGridCycleState();
         if(ZeroGridModeEnabled() && g_state==STATE_RUNNING && g_access &&
            ZeroGridHedgingAllowed() && TradePermissionStatus()=="OK")
         {
            g_executionStatus="ZERO_GRID_REARMING";
            return StartZeroGridCycle();
         }
         g_executionStatus="ZERO_GRID_STOPPED_FLAT";
      }
      return true;
   }

   // Explicit mode exit / revoked access still removes pending orders immediately.
   // SAFE_STOP is intentionally different: preserve only the pending ladder that
   // already belongs to the current ZERO cycle, let it drain under the normal
   // ZERO profit rule, and never build/replenish another pending order while stopped.
   if(!ZeroGridModeEnabled() || g_state!=STATE_RUNNING || !g_access)
   {
      bool safeStopDrain =
         ZeroGridModeEnabled() &&
         g_state==STATE_SAFE_STOP &&
         g_access &&
         g_safeStopDrainRequested;
      if(!safeStopDrain)
         ZeroGridCancelPending();

      positions=ZeroGridPositionCount();
      pending=ZeroGridPendingCount();
      if(positions<=0 && pending<=0)
      {
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_STOPPED_FLAT";
         return true;
      }
      if(ZeroGridCycleNet()>=ZeroGridRequiredCloseNet())
      {
         g_zeroGridClosing=true;
         SaveZeroGridCycleState();
         g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
         ZeroGridClosePositions();
      }
      else
         g_executionStatus="ZERO_GRID_SAFE_DRAIN";
      return true;
   }

   if(!ZeroGridHedgingAllowed())
   {
      ZeroGridCancelPending();
      g_executionStatus="ZERO_GRID_HEDGING_REQUIRED";
      return true;
   }
   string permissionStatus=TradePermissionStatus();
   if(permissionStatus!="OK")
   {
      g_executionStatus=permissionStatus;
      return true;
   }
   if(!ZeroGridStopOrdersSupported())
   {
      g_executionStatus="ZERO_GRID_STOP_ORDERS_UNSUPPORTED";
      return true;
   }

   // Fresh runtime or a fully empty cycle: start/recenter immediately.
   if(g_zeroGridCenter<=0.0 || (positions==0 && pending==0))
   {
      if(positions==0 && pending==0 && g_zeroGridCenter>0.0)
         ResetZeroGridCycleState();
      return StartZeroGridCycle();
   }

   // The only trading decision inside ZERO: close the ZERO cycle when its own
   // configured real net-profit target is reached. No market opinion is used.
   if(positions>0 && ZeroGridCycleNet()>=ZeroGridRequiredCloseNet())
   {
      g_zeroGridClosing=true;
      SaveZeroGridCycleState();
      g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
      ZeroGridClosePositions();
      if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)
      {
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_REARMING";
         return StartZeroGridCycle();
      }
      return true;
   }

   bool ladderReady=ZeroGridEnsureLadder();
   if(positions>0)
      g_executionStatus="ZERO_GRID_ACTIVE";
   else
      g_executionStatus=ladderReady ? "ZERO_GRID_READY" : "ZERO_GRID_BUILDING";
   return true;
}

// Brain V17 RACE ------------------------------------------------------------
// RACE is a separate execution engine. AUTO never calls these functions.
// Entry scores, confidence, S/R, pullback and model grades are observation
// only here. The engine chooses a direction from the same live context, then
// fills to the user Max Positions target subject only to operational controls
// and explicit risk/exit protections.
bool RaceModeEnabled()
{
   return EffectiveExecutionMode() == "RACE";
}

bool BasketHasRacePosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT), "SaaSRace") >= 0)
         return true;
   }
   return false;
}

void ResetRaceRuntime()
{
   g_raceDirection = 0;
   g_racePeakProfit = 0.0;
   g_raceProfitArmed = false;
   g_raceRecoveryWatch = false;
   g_raceState = "IDLE";
   g_raceCycleStartedAt = 0;
}

int RaceFilledUnits()
{
   double baseVolume = NormalizeTradeVolume(g_lot);
   if(baseVolume <= 0.0)
      return BasketPositionCount();

   double totalVolume = 0.0;
   int positions = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      totalVolume += PositionGetDouble(POSITION_VOLUME);
      positions++;
   }

   int volumeUnits = (int)MathRound(totalVolume / baseVolume);
   return MathMax(positions, MathMax(0, volumeUnits));
}


void RaceResetVolumeWindow(datetime now)
{
   for(int i=0;i<RACE_VOLUME_WINDOW_SECONDS;i++)
   {
      g_raceVolumeBucketSecond[i]=0;
      g_raceVolumeBucketBuy[i]=0.0;
      g_raceVolumeBucketSell[i]=0.0;
      g_raceVolumeBucketSamples[i]=0;
   }
   g_raceVolumeWarmupStartedAt=now;
   g_raceVolumeLastSampleAt=0;
   g_raceVolumeLastMid=0.0;
}

void RaceSampleVolumePressure()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return;

   datetime now=(tick.time>0 ? (datetime)tick.time : TimeCurrent());
   if(now<=0)
      return;

   if(g_raceVolumeWarmupStartedAt<=0 ||
      (g_raceVolumeLastSampleAt>0 && now-g_raceVolumeLastSampleAt>RACE_VOLUME_WINDOW_SECONDS))
      RaceResetVolumeWindow(now);

   int slot=(int)((long)now % RACE_VOLUME_WINDOW_SECONDS);
   if(g_raceVolumeBucketSecond[slot]!=now)
   {
      g_raceVolumeBucketSecond[slot]=now;
      g_raceVolumeBucketBuy[slot]=0.0;
      g_raceVolumeBucketSell[slot]=0.0;
      g_raceVolumeBucketSamples[slot]=0;
   }

   double mid=(tick.bid+tick.ask)*0.5;
   int side=0;
   double weight=1.0;
   bool flaggedBuy=((tick.flags & TICK_FLAG_BUY)!=0);
   bool flaggedSell=((tick.flags & TICK_FLAG_SELL)!=0);

   // Prefer real deal-side volume when the broker publishes it. Most OTC FX/
   // metal feeds expose quote ticks instead, so classify those by uptick/down-
   // tick and count one unit of tick volume per directional price update.
   if(flaggedBuy!=flaggedSell)
   {
      side=flaggedBuy ? 1 : -1;
      double reported=(tick.volume_real>0.0 ? tick.volume_real : (double)tick.volume);
      if(reported>0.0)
         weight=reported;
   }
   else if(g_raceVolumeLastMid>0.0)
   {
      double epsilon=MathMax(_Point*0.05,0.00000001);
      if(mid>g_raceVolumeLastMid+epsilon) side=1;
      else if(mid<g_raceVolumeLastMid-epsilon) side=-1;
   }

   if(side>0)
   {
      g_raceVolumeBucketBuy[slot]+=weight;
      g_raceVolumeBucketSamples[slot]++;
   }
   else if(side<0)
   {
      g_raceVolumeBucketSell[slot]+=weight;
      g_raceVolumeBucketSamples[slot]++;
   }

   g_raceVolumeLastMid=mid;
   g_raceVolumeLastSampleAt=now;
}

void RaceVolumeSnapshot(double &buyPressure,double &sellPressure,int &samples)
{
   buyPressure=0.0;
   sellPressure=0.0;
   samples=0;
   datetime now=TimeCurrent();
   for(int i=0;i<RACE_VOLUME_WINDOW_SECONDS;i++)
   {
      datetime stamp=g_raceVolumeBucketSecond[i];
      if(stamp<=0 || stamp>now || now-stamp>=RACE_VOLUME_WINDOW_SECONDS)
         continue;
      buyPressure+=g_raceVolumeBucketBuy[i];
      sellPressure+=g_raceVolumeBucketSell[i];
      samples+=g_raceVolumeBucketSamples[i];
   }
}

bool RaceVolumeWindowReady()
{
   if(g_raceVolumeWarmupStartedAt<=0 ||
      TimeCurrent()-g_raceVolumeWarmupStartedAt<RACE_VOLUME_WINDOW_SECONDS)
      return false;
   double buyPressure=0.0;
   double sellPressure=0.0;
   int samples=0;
   RaceVolumeSnapshot(buyPressure,sellPressure,samples);
   return samples>0;
}

int RaceVolumeDirection()
{
   if(!RaceVolumeWindowReady())
      return 0;
   double buyPressure=0.0;
   double sellPressure=0.0;
   int samples=0;
   RaceVolumeSnapshot(buyPressure,sellPressure,samples);
   if(samples<=0 || MathAbs(buyPressure-sellPressure)<=0.00000001)
      return 0;
   return buyPressure>sellPressure ? 1 : -1;
}

int RaceM5CandleDirection()
{
   // RACE AUTO reads one thing only for side selection: the latest completed
   // M5 candle. Closed-bar data keeps the chosen side stable and prevents an
   // intrabar flip from opening the opposite direction inside the same cycle.
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, PERIOD_M5, 1, 1, rates) < 1)
      return 0;

   if(rates[0].close > rates[0].open) return 1;
   if(rates[0].close < rates[0].open) return -1;
   return 0;
}

int RaceAnalysisDirection(double momentum)
{
   // Explicit customer direction remains an override. AUTO RACE ignores
   // trend/EMA/timeframes and follows only the rolling 10-second volume side.
   if(g_entryMode == ENTRY_BUY_ONLY) return 1;
   if(g_entryMode == ENTRY_SELL_ONLY) return -1;
   return RaceVolumeDirection();
}

double RaceMidProgressPoints(int direction)
{
   MqlTick tick;
   double anchor = BasketAnchorEntryPrice(direction);
   if(anchor <= 0.0 || !SymbolInfoTick(_Symbol, tick))
      return 0.0;
   double mid = (tick.bid + tick.ask) * 0.5;
   return direction > 0
      ? (mid - anchor) / _Point
      : (anchor - mid) / _Point;
}

bool RaceWrongDirectionConfirmed(
   int direction,
   double momentum,
   bool filling,
   string &reasonOut
)
{
   reasonOut = "NONE";
   if(direction == 0)
      return false;

   // RACE directional invalidation also uses only the latest completed M5
   // candle. The opposite candle alone is not enough to close; price must also
   // have moved meaningfully against the active cycle.
   int m5Direction = RaceM5CandleDirection();
   if(m5Direction == 0 || m5Direction == direction)
      return false;

   double atr = MathMax(
      10.0,
      AverageTrueRangePoints(PERIOD_M5, g_atrPeriod)
   );
   double progress = RaceMidProgressPoints(direction);
   double adverseThreshold = filling ? atr * 0.45 : atr * 0.22;
   bool adverse = progress <= -adverseThreshold;
   bool severe = progress <= -atr * (filling ? 0.75 : 0.50);

   if(severe)
   {
      reasonOut = "RACE_M5_SEVERE_REVERSAL";
      return true;
   }
   if(adverse)
   {
      reasonOut = "RACE_M5_OPPOSITE_CONFIRMED";
      return true;
   }
   return false;
}

bool RaceFlowStillRunning(int direction, double momentum)
{
   // RACE profit-run continuation follows the same 10-second volume majority
   // used for entry. Trend, EMA and candle direction do not participate.
   return RaceVolumeDirection() == direction;
}

double RaceProfitArmMoney(int filledUnits)
{
   // Positive floating P/L already includes spread. This floor simply avoids
   // closing on microscopic noise while still taking profit quickly.
   return MathMax(0.10, MathMin(5.00, filledUnits * 0.02));
}

double RaceGivebackMoney(double peakProfit, double armMoney)
{
   return MathMax(
      0.05,
      MathMin(MathMax(armMoney, 0.10), peakProfit * 0.25)
   );
}

// Brain V18 RACE profit harvest --------------------------------------------
// RACE only: close every profitable RACE ticket continuously. AUTO never
// calls this function. On hedging accounts each blue ticket is closed in full;
// on netting accounts one configured-lot unit is realized per pass because MT5
// exposes only one aggregate position per symbol.
int RaceHarvestProfitablePositions()
{
   int harvested = 0;
   bool hedging = ((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE) ==
                   ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);
   double baseVolume = NormalizeTradeVolume(g_lot);
   double perPositionTarget =
      (g_profitTargetMode == "MANUAL" && g_perPositionProfit > 0.0)
      ? g_perPositionProfit
      : 0.0;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol ||
         PositionGetInteger(POSITION_MAGIC) != InpMagic)
         continue;
      if(StringFind(PositionGetString(POSITION_COMMENT), "SaaSRace") < 0)
         continue;

      double netFloating = PositionGetDouble(POSITION_PROFIT) +
                           PositionGetDouble(POSITION_SWAP);
      if(perPositionTarget > 0.0)
      {
         if(netFloating + 0.00000001 < perPositionTarget)
            continue;
      }
      else if(netFloating <= 0.0)
         continue;

      double positionVolume = PositionGetDouble(POSITION_VOLUME);
      double closeVolume = hedging
         ? positionVolume
         : MathMin(positionVolume, baseVolume);
      if(closeVolume <= 0.0)
         continue;

      if(ClosePositionVolumeByTicket(ticket, closeVolume, "SCNRaceProfit"))
      {
         harvested++;
         g_executionStatus = "RACE_PROFIT_HARVEST";
         g_lastCloseReason = "RACE_PROFIT_HARVEST";
         Print(
            "RACE profit harvest ticket=",ticket,
            " profit=",DoubleToString(netFloating,2),
            " closeVolume=",DoubleToString(closeVolume,2)
         );

         // A netting account has one aggregate position. Realize one unit and
         // let the next tick harvest/refill again instead of flattening the
         // whole aggregate position in one request.
         if(!hedging)
            break;
      }
   }

   return harvested;
}

bool RaceCloseCycle(string reason)
{
   g_raceState = "CLOSING";
   g_executionStatus = reason;
   g_lastCloseReason = reason;
   bool closed = CloseAllBasket(reason);
   if(closed)
      ResetTrail();
   return closed;
}

bool ProcessRaceFill(int direction)
{
   if(direction == 0)
      return false;

   // One-way cycle lock: once a RACE cycle has any open position, every new
   // fill must stay on that same side. A new BUY/SELL decision is allowed only
   // after the entire RACE basket is flat.
   int existingPositions = BasketPositionCount();
   if(existingPositions > 0)
   {
      int existingDirection = BasketDirection();
      if(existingDirection == 0)
      {
         g_executionStatus = "RACE_MIXED_BASKET_BLOCK";
         return false;
      }
      if(existingDirection != direction ||
         (g_raceDirection != 0 && g_raceDirection != direction))
      {
         g_executionStatus = "RACE_DIRECTION_LOCK";
         return false;
      }
   }

   int filledUnits = RaceFilledUnits();
   if(filledUnits >= g_maxPositions)
   {
      g_raceState = "FULL";
      g_executionStatus = "RACE_TARGET_FILLED";
      return true;
   }

   if(g_state != STATE_RUNNING || !g_access ||
      (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      g_executionStatus = "RACE_CONTROL_NOT_FRESH";
      return false;
   }
   if(TradePermissionStatus() != "OK")
   {
      g_executionStatus = "RACE_TRADE_PERMISSION";
      return false;
   }
   if(!CanSendOrder())
   {
      g_executionStatus = "RACE_ORDER_RATE_LIMIT";
      return false;
   }
   if(!AdaptiveSpreadAllowed())
   {
      g_executionStatus = g_spreadStatus == "EXTREME"
         ? "RACE_EXTREME_SPREAD" : "RACE_SPREAD_WAIT";
      return false;
   }
   if(!OpenTradingAllowedForDirection(direction))
   {
      g_executionStatus = "RACE_SYMBOL_DIRECTION_BLOCKED";
      return false;
   }

   // RACE uses the user's configured Lot directly. No adaptive score or risk
   // sizing calculation is allowed to reduce the requested fill count.
   g_adaptiveLot = NormalizeTradeVolume(g_lot);
   if(g_adaptiveLot <= 0.0)
   {
      g_executionStatus = "RACE_INVALID_LOT";
      return false;
   }

   g_entryModel = "RACE_M5_ONE_CANDLE";
   g_entryTrigger = direction > 0 ? "RACE_M5_BUY" : "RACE_M5_SELL";
   g_entryQuality = "RACE";
   g_entryQualityScore = 0.0;
   g_raceDirection = direction;
   if(g_raceCycleStartedAt <= 0)
      g_raceCycleStartedAt = TimeCurrent();

   bool accepted = SendMarketOrder(direction);
   RegisterOrderRequest();
   if(accepted)
   {
      int after = RaceFilledUnits();
      g_raceState = after >= g_maxPositions ? "FULL" : "FILLING";
      g_executionStatus = after >= g_maxPositions
         ? "RACE_TARGET_FILLED"
         : "RACE_FILLING";
      Print(
         "RACE fill accepted direction=",direction,
         " units=",after,
         " target=",g_maxPositions,
         " lot=",DoubleToString(g_adaptiveLot,2)
      );
      return true;
   }

   g_raceState = "FILL_RETRY";
   return false;
}

bool StartRaceCycle(double momentum)
{
   if(!RaceModeEnabled())
      return false;
   if(BasketPositionCount() > 0 || RescuePositionCount() > 0)
      return false;

   ResetRaceRuntime();
   int direction = RaceAnalysisDirection(momentum);
   if(direction == 0)
   {
      g_executionStatus = RaceVolumeWindowReady()
         ? "RACE_VOLUME_BALANCED"
         : "RACE_VOLUME_WARMUP";
      return false;
   }

   g_burstActive = false;
   g_burstNeedsRearm = false;
   g_burstTargetPositions = 0;
   return ProcessRaceFill(direction);
}

bool ManageRaceBasket(double momentum)
{
   int positions = BasketPositionCount();
   if(positions <= 0)
   {
      ResetRaceRuntime();
      return false;
   }

   if(g_raceState == "CLOSING")
   {
      CloseAllBasket("RACE_CLOSE_RETRY");
      return true;
   }

   // RACE close decisions use direct P/L, current price and completed M5 data.
   // Defer expensive market-context refresh to non-close paths only.
   int direction = BasketDirection();
   if(direction == 0)
   {
      RefreshMarketContext(false);
      g_raceState = "MIXED_BASKET";
      g_executionStatus = "RACE_MIXED_BASKET";
      return true;
   }
   g_raceDirection = direction;

   int filledUnits = RaceFilledUnits();
   bool filling = filledUnits < g_maxPositions;
   double floatingProfit = BasketProfit();
   double cycleProfit = BasketCycleProfit();

   // Explicit user loss control remains a hard safety boundary in every mode.
   double lossLimit = EffectiveBasketLossLimit();
   if(lossLimit > 0.0 && cycleProfit <= -lossLimit)
   {
      RaceCloseCycle("RACE_MAX_BASKET_LOSS");
      return true;
   }

   // User-controlled RACE close-all target. This check intentionally runs
   // before wrong-direction analysis and per-ticket profit harvesting so a
   // reached target is acted on immediately with the existing close command.
   if(g_raceCloseAllProfitEnabled &&
      g_raceCloseAllProfitMoney > 0.0 &&
      cycleProfit >= g_raceCloseAllProfitMoney)
   {
      RaceCloseCycle("RACE_CLOSE_ALL_PROFIT_TARGET");
      return true;
   }

   // RACE_PROFIT_FIRST_V116: profitable RACE tickets are harvested before
   // the Max Positions fill gate. Profit exit is never delayed just because the
   // basket is still building. Refill, if needed, happens on a later pass.
   int harvested = g_raceCloseAllProfitEnabled ? 0 : RaceHarvestProfitablePositions();
   if(harvested > 0)
   {
      g_raceProfitArmed = false;
      g_racePeakProfit = 0.0;

      if(BasketPositionCount() <= 0)
      {
         ResetRaceRuntime();
         g_executionStatus = "RACE_PROFIT_HARVEST_FLAT";
         return true;
      }

      g_raceState = "HARVESTED_PROFIT";
      g_executionStatus = "RACE_PROFIT_HARVEST";
      return true;
   }


   // RACE_VOLUME_10S_ROLLOVER_V1: direction comes only from the rolling
   // 10-second BUY/SELL pressure window. If pressure flips, never add another
   // order on the stale side. The old cycle is flattened only when its realized
   // + floating net P/L is non-negative; otherwise existing positions keep
   // their normal per-position profit exits and hard loss protection.
   int volumeDirection = RaceAnalysisDirection(momentum);
   if(volumeDirection != 0 && volumeDirection != direction)
   {
      if(cycleProfit >= 0.0)
      {
         RaceCloseCycle("RACE_VOLUME_ROLLOVER");
         return true;
      }
      g_raceRecoveryWatch = true;
      g_raceState = "ROLLOVER_WAIT";
      g_executionStatus = volumeDirection > 0
         ? "RACE_VOLUME_ROLLOVER_WAIT_BUY"
         : "RACE_VOLUME_ROLLOVER_WAIT_SELL";
      return true;
   }
   // Max Positions remains the requested RACE fill target, but it can no longer
   // block an already-profitable ticket from being banked first.
   if(filling)
   {
      if(volumeDirection == 0)
      {
         g_raceState = "VOLUME_WAIT";
         g_executionStatus = RaceVolumeWindowReady()
            ? "RACE_VOLUME_BALANCED"
            : "RACE_VOLUME_WARMUP";
         return true;
      }
      if(floatingProfit < 0.0)
         g_raceRecoveryWatch = true;
      g_raceState = "FILLING";
      RefreshMarketContext(false);
      ProcessRaceFill(direction);
      return true;
   }

   double armMoney = RaceProfitArmMoney(filledUnits);

   // If a dragged cycle was judged recoverable, take the recovered NET cycle
   // profit quickly. Harvested winners count toward that recovery on purpose.
   if(g_raceRecoveryWatch)
   {
      double recoveryCloseMoney = MathMax(0.02, armMoney * 0.25);
      if(cycleProfit >= recoveryCloseMoney)
      {
         RaceCloseCycle("RACE_RECOVERY_PROFIT");
         return true;
      }
      RefreshMarketContext(false);
      g_raceState = "RECOVERY_WAIT";
      g_executionStatus = "RACE_RECOVERY_WAIT";
      return true;
   }

   // Normal RACE profit-run logic now looks only at the still-open Basket.
   // Realized harvested winners must not accidentally trigger a full-cycle
   // close immediately after an individual blue ticket was banked.
   if(floatingProfit >= armMoney)
   {
      bool flowing = RaceFlowStillRunning(direction,momentum);

      if(!flowing && !g_raceProfitArmed)
      {
         RaceCloseCycle("RACE_QUICK_PROFIT");
         return true;
      }

      if(!g_raceProfitArmed)
      {
         g_raceProfitArmed = true;
         g_racePeakProfit = floatingProfit;
      }
      if(floatingProfit > g_racePeakProfit)
         g_racePeakProfit = floatingProfit;

      double giveback = RaceGivebackMoney(g_racePeakProfit, armMoney);
      if(floatingProfit <= g_racePeakProfit - giveback)
      {
         RaceCloseCycle("RACE_PROFIT_GIVEBACK");
         return true;
      }

      if(!flowing && floatingProfit > 0.0)
      {
         RaceCloseCycle("RACE_FLOW_ENDED_PROFIT");
         return true;
      }

      RefreshMarketContext(false);
      g_raceState = "PROFIT_RUN";
      g_executionStatus = "RACE_PROFIT_RUN";
      return true;
   }

   if(floatingProfit < 0.0)
   {
      g_raceRecoveryWatch = true;
      RefreshMarketContext(false);
      g_raceState = "RECOVERY_WAIT";
      g_executionStatus = "RACE_RECOVERY_WAIT";
      return true;
   }

   RefreshMarketContext(false);
   g_raceState = "FULL_WAIT_PROFIT";
   g_executionStatus = "RACE_FULL_WAIT_PROFIT";
   return true;
}

void OnTick()
{
   SampleSpread();
   RaceSampleVolumePressure();
   bool zeroGridFastPath =
      ZeroGridPositionCount() > 0 ||
      ZeroGridPendingCount() > 0 ||
      (ZeroGridModeEnabled() &&
       BasketPositionCount() <= 0 &&
       RescuePositionCount() <= 0);
   if(!zeroGridFastPath)
   {
      UpdateMomentum();
      RefreshEmaIntelligence(false);
      DrawEmaCurves();
   }
   RefreshDailyBaselineIfNeeded();

   if(g_access && g_lastSuccessfulHeartbeat > 0 &&
      TimeCurrent() - g_lastSuccessfulHeartbeat > InpMaxOfflineLeaseSeconds)
   {
      Print("SaaS lease expired while API is unreachable. Disabling new entries.");
      g_access = false;
      g_runAuthorized = false;
   }

   int count = BasketPositionCount();
   int rescueCount = RescuePositionCount();
   if(count > 0)
   {
      UpdateBasketPeakPositionCount(count);
      EnsureBurstTargets(g_burstActive ? MathMax(1, g_burstTargetPositions) : count);
   }
   else if(rescueCount <= 0)
      ResetBasketCycleState();

   double profit = BasketProfit();
   double momentum = MomentumPoints();
   double dailyProfit = DailyBotProfit();
   if(MQLInfoInteger(MQL_TESTER) && count > 0)
      TesterUpdateCycleMetrics(count,BasketCycleProfit());
   g_executionStatus = "EVALUATING";

   if(g_pendingCloseReason != CLOSE_REASON_NONE)
   {
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      bool closed = CloseAllBasket(CloseReasonText(g_pendingCloseReason));
      g_executionStatus = closed ? CloseCompletionStatus(g_pendingCloseReason) : "CLOSE_RETRY";
      return;
   }

   if(HandleDailyProfitControl(count))
      return;

   if(g_dailyLoss > 0.0 && AccountInfoDouble(ACCOUNT_EQUITY) <= g_dayStartEquity - g_dailyLoss)
   {
      if(count > 0 || rescueCount > 0) CloseAllBasket("DAILY_LOSS");
      g_state = STATE_SAFE_STOP;
      g_runAuthorized = false;
      g_executionStatus = "DAILY_LOSS_LOCK";
      return;
   }

   if(count <= 0 && rescueCount > 0)
   {
      RefreshMarketContext(false);
      ManageAdaptiveRescue();
      g_executionStatus = "RESCUE_EXIT";
      return;
   }

   // ZERO GRID owns its tagged positions and pending orders until flat. This
   // branch executes before AUTO/RACE management so the engines never mix.
   if(g_zeroGridClosing || ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)
   {
      ManageZeroGrid();
      return;
   }

   // Strict mode ownership: a RACE Basket is always managed by RACE until it
   // is flat, even if the web switches back to AUTO mid-cycle. Conversely an
   // AUTO Basket never becomes a RACE Basket just because the setting changed.
   if(count > 0 && BasketHasRacePosition())
   {
      ManageRaceBasket(momentum);
      return;
   }

   if(g_basketJournalId == 0)
      RecoverOpenBasketJournal();

   // Fast path for the existing MANUAL fixed Basket target only. Keep all
   // safety/ownership priorities above unchanged, and do not interfere with
   // an active Rescue cycle. The close command itself remains unchanged.
   if(count > 0 &&
      rescueCount <= 0 &&
      g_rescueState == RESCUE_NORMAL &&
      g_profitTargetMode == "MANUAL" &&
      g_basketProfitTarget > 0.0 &&
      g_perPositionProfit <= 0.0 &&
      g_profitRunTrailPercent <= 0.0)
   {
      double fastCycleProfit = BasketCycleProfit();
      if(fastCycleProfit >= g_basketProfitTarget)
      {
         CloseAllBasket("BASKET_PROFIT_TARGET");
         ResetTrail();
         g_executionStatus = "BASKET_PROFIT_TARGET";
         return;
      }
   }

   if(count > 0)
   {
      bool tacticalBasket=BasketHasTacticalPosition();

      // The existing V20 locked price stop/target can be checked before
      // market-context, journal and protection work without changing its rule.
      if(!tacticalBasket && AutoV20Enabled() && AutoV20FastPriceExit())
         return;

      // Dynamic protection never decides whether an entry is allowed. It only
      // manages exits after a Position exists.
      RefreshMarketContext(false);
      RecoverOpenBasketJournal();
      ManageDynamicProtection();

      if(tacticalBasket)
      {
         g_tacticalCountertrendActive=true;
         g_tacticalCountertrendDirection=BasketDirection();
         string tacticalExitReason="NONE";
         if(TacticalCountertrendExitReady(
            g_tacticalCountertrendDirection,
            momentum,
            BasketCycleProfit(),
            tacticalExitReason))
         {
            CloseAllBasket("TACTICAL_COUNTERTREND_EXIT");
            ResetTrail();
            g_executionStatus="TACTICAL_COUNTERTREND_EXIT";
            g_lastCloseReason=tacticalExitReason;
            return;
         }
      }

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
      bool rescueManaging = tacticalBasket ? false : ManageAdaptiveRescue();
      if(g_rescueState == RESCUE_ACTIVE ||
         g_rescueState == RESCUE_RECOVERY ||
         g_rescueState == RESCUE_EXIT)
      {
         double rescueLossLimit = EffectiveBasketLossLimit();
         double rescueCycleProfit = RescueCombinedCycleProfit();
         if(rescueLossLimit > 0.0 && rescueCycleProfit <= -rescueLossLimit)
         {
            CloseAllBasket("MAX_BASKET_LOSS");
            ResetTrail();
            return;
         }

         // Rescue/Recovery owns position management until the Cycle is closed
         // or the original structure recovers. It never affects first entry.
         if(rescueManaging)
            return;
      }

      // Per-position profit/loss controls are evaluated before basket-level
      // controls. Per-position profit and total Basket profit are mutually
      // exclusive settings, enforced by both Server and EA.
      bool closedIndividual = g_profitTargetMode == "MANUAL"
         ? ManagePerPositionTargets()
         : false;
      if(closedIndividual)
      {
         count = BasketPositionCount();
         profit = BasketProfit();
         dailyProfit = DailyBotProfit();

         if(HandleDailyProfitControl(count))
            return;

         if(count == 0)
         {
            ResetTrail();
            ResetBasketCycleState();
            g_executionStatus = "POSITION_TARGET_CLOSED";
            return;
         }
      }

      double cycleProfit = BasketCycleProfit();
      double effectiveBasketTarget = EffectiveBasketProfitTarget();

      // Auto mode protects a genuinely positive Cycle. A confirmed reversal
      // may bank profit before the dynamic target instead of letting a winner
      // turn red. Manual and Off are never overridden by this decision.
      int profitDefenseDirection = BasketDirection();
      string profitDefenseReason = "NONE";
      if(g_profitTargetMode == "AUTO" &&
         profitDefenseDirection != 0 &&
         SmartProfitReversalDetected(
            profitDefenseDirection,
            cycleProfit,
            profitDefenseReason
         ))
      {
         CloseAllBasket("SMART_PROFIT_REVERSAL");
         ArmMarketRearm(profitDefenseDirection,profitDefenseReason);
         ResetTrail();
         g_executionStatus = "SMART_PROFIT_REVERSAL";
         g_adaptiveBlockReason = profitDefenseReason;
         return;
      }

      if(g_profitTargetMode == "AUTO" &&
         AutoProfitGivebackDetected(profitDefenseDirection,cycleProfit))
      {
         CloseAllBasket("AUTO_PROFIT_GIVEBACK");
         ArmMarketRearm(profitDefenseDirection,"PROFIT_GIVEBACK");
         ResetTrail();
         g_executionStatus = "AUTO_PROFIT_GIVEBACK";
         return;
      }

      // If no manual Basket/per-position target is configured, multi-position
      // trading falls back to an automatic cycle target.
      if(g_profitTargetMode == "MANUAL" &&
         g_basketProfitTarget > 0.0 && g_perPositionProfit <= 0.0)
      {
         if(g_profitRunTrailPercent > 0.0)
         {
            // Arm percentage giveback only after the configured Basket target
            // has actually been reached. Before that, do not trail profit.
            if(g_profitRunPeak <= 0.0 && cycleProfit >= g_basketProfitTarget)
            {
               g_profitRunPeak = cycleProfit;
               SaveBasketCycleState();
               g_executionStatus = "BASKET_PROFIT_RUN_ON";
            }

            if(g_profitRunPeak > 0.0)
            {
               if(cycleProfit > g_profitRunPeak)
               {
                  g_profitRunPeak = cycleProfit;
                  SaveBasketCycleState();
               }

               double closeLevel =
                  g_profitRunPeak * (1.0 - g_profitRunTrailPercent / 100.0);
               if(cycleProfit <= closeLevel)
               {
                  CloseAllBasket("PROFIT_RUN_PERCENT_TRAIL");
                  ResetTrail();
                  g_executionStatus = "PROFIT_RUN_PERCENT_TRAIL";
                  return;
               }
            }
         }
         else if(cycleProfit >= g_basketProfitTarget)
         {
            CloseAllBasket("BASKET_PROFIT_TARGET");
            ResetTrail();
            g_executionStatus = "BASKET_PROFIT_TARGET";
            return;
         }
      }
      else if(g_profitTargetMode == "AUTO" &&
              g_perPositionProfit <= 0.0 &&
              effectiveBasketTarget > 0.0)
      {
         // Automatic Basket mode protects a meaningful unrealized winner when
         // the execution structure rolls over before the full target. Explicit
         // user Basket/position targets are never overridden by this logic.
         if(cycleProfit > g_profitRunPeak + 0.05)
         {
            g_profitRunPeak = cycleProfit;
            SaveBasketCycleState();
         }

         if(cycleProfit >= effectiveBasketTarget)
         {
            CloseAllBasket("BASKET_PROFIT_TARGET");
            ResetTrail();
            g_executionStatus = "BASKET_PROFIT_TARGET";
            return;
         }

      }

      double effectiveBasketLoss = EffectiveBasketLossLimit();
      double lossControlProfit =
         (g_rescueState != RESCUE_NORMAL || RescuePositionCount() > 0)
         ? RescueCombinedCycleProfit()
         : (BasketFillEnabled() ? cycleProfit : profit);
      if(effectiveBasketLoss > 0.0 && lossControlProfit <= -effectiveBasketLoss)
      {
         CloseAllBasket("MAX_BASKET_LOSS");
         ResetTrail();
         return;
      }

      if(g_triggerMoney > 0.0 && g_trailMoney > 0.0 &&
         !g_trailArmed && profit >= g_triggerMoney)
      {
         g_trailArmed = true;
         g_peakProfit = profit;
      }

      if(g_trailArmed)
      {
         if(profit > g_peakProfit) g_peakProfit = profit;

         double effectiveTrail = g_trailMoney;
         int basketDirection = BasketDirection();

         bool flowStrong =
            (basketDirection > 0 && momentum >= InpStrongFlowPoints) ||
            (basketDirection < 0 && momentum <= -InpStrongFlowPoints);

         if(flowStrong)
            effectiveTrail = g_trailMoney * (1.0 + MathMax(0.0, InpFlowTrailBoost));

         if(g_adaptiveEngine)
         {
            if((g_marketRegime == "TREND_UP" || g_marketRegime == "TREND_DOWN") &&
               flowStrong && g_signalConfidence >= g_confidenceThreshold + 10)
               effectiveTrail *= 1.35;
            else if(g_marketRegime == "RANGE" ||
                    g_signalConfidence < g_confidenceThreshold + 5)
               effectiveTrail *= 0.70;
         }

         if(profit <= g_peakProfit - effectiveTrail)
         {
            CloseAllBasket("PROFIT_TRAIL");
            ResetTrail();
            return;
         }
      }

      if(g_state == STATE_SAFE_STOP && !g_trailArmed && profit >= 0.0)
      {
         CloseAllBasket("SAFE_STOP_BREAKEVEN");
         ResetTrail();
         return;
      }

      if(closedIndividual)
      {
         // Do not replace a position on the same tick that it was closed by
         // a profit/loss rule. Re-evaluate the basket on the next market tick.
         return;
      }
   }
   else
   {
      ResetTrail();
      ResetBasketCycleState();
      if(AutoV20Enabled())
         AutoV20ResetCycle();
      if(g_state == STATE_SAFE_STOP)
      {
         g_state = STATE_STOPPED;
         g_executionStatus = "STOPPED";
         return;
      }
   }

   if(g_state != STATE_RUNNING)
   {
      g_executionStatus = (g_state == STATE_SAFE_STOP ? "SAFE_STOP" : "STOPPED");
      return;
   }

   if(!g_access)
   {
      g_executionStatus = "NO_ACCESS";
      return;
   }

   // Hard startup isolation: no execution engine may create a new order
   // until the Server has explicitly selected AUTO/RACE/ZERO_GRID.
   if(!MQLInfoInteger(MQL_TESTER) && !g_settingsSynchronized)
   {
      g_executionStatus = "WAIT_SETTINGS_SYNC";
      return;
   }

   // AUTO/RACE keep the fresh-control entry lease. ZERO GRID is intentionally
   // free-running once Server settings selected ZERO and explicit RUNNING/access hold.
   if(!MQLInfoInteger(MQL_TESTER) && !ZeroGridModeEnabled() && !EntryLeaseValid())
   {
      g_executionStatus = "CONTROL_NOT_FRESH";
      return;
   }

   // WARNING pauses only additional positions while Rescue evaluates the open
   // Basket. It is post-entry management, not a first-entry filter.
   if(count > 0 &&
      g_rescueState == RESCUE_WARNING &&
      !g_burstActive &&
      (!BasketFillEnabled() || count >= g_maxPositions))
   {
      g_executionStatus = g_rescueOldestAgeSeconds >= RescueTimeThresholdSeconds()
         ? "TIME_RESCUE_WARNING"
         : "RESCUE_WARNING";
      return;
   }

   string permissionStatus = TradePermissionStatus();
   if(permissionStatus != "OK")
   {
      g_executionStatus = permissionStatus;
      return;
   }

   // ZERO GRID starts only when selected and the EA-owned basket is flat.
   if(ZeroGridModeEnabled() && count<=0 && rescueCount<=0)
   {
      StartZeroGridCycle();
      return;
   }

   // FLIP LOCK V2 owns its entry + opposite-pending baton lifecycle.
   // It deliberately bypasses AUTO/VECTOR/PARALLEL entry gates while keeping
   // the common authorization, hard daily-loss and broker safety checks above.
   if(FlipLockModeEnabled())
   {
      FlipLockManage();
      return;
   }

   // RACE starts only from a flat account. AUTO below is intentionally left
   // untouched and never evaluates this branch unless engineMode=RACE.
   if(RaceModeEnabled() && count <= 0 && rescueCount <= 0)
   {
      StartRaceCycle(momentum);
      return;
   }

   // V16 self-healing: ProcessBurstQueue can abort on a transient lease or
   // broker-permission interruption. Once control is healthy again, an open
   // Basket below Max Positions is automatically re-armed instead of being
   // stranded forever in BASKET_MANAGING with only one or two positions.
   if(LegacyBasketEngineEnabled() && BasketFillEnabled() && count > 0 && !g_burstActive && count < g_maxPositions)
      BrainV16RearmExistingBasket();

   if(LegacyBasketEngineEnabled() && BasketFillEnabled() && g_burstActive)
   {
      ProcessBurstQueue();
      return;
   }

   if(LegacyBasketEngineEnabled() && BasketFillEnabled() && count > 0)
   {
      g_executionStatus = g_burstTargetPositions > 0 && g_burstRequestsSent >= g_burstTargetPositions
         ? "BASKET_FILL_COMPLETE"
         : "BASKET_MANAGING";
      return;
   }

   // A completed Basket can start a new cycle as soon as a fresh signal passes.
   // There is no profile-specific rearm wait or hidden cooldown.
   g_burstNeedsRearm = false;

   if(!CanSendOrder())
   {
      g_executionStatus = "ORDER_RATE_LIMIT";
      return;
   }

   if(!AdaptiveSpreadAllowed())
   {
      g_executionStatus = g_spreadStatus == "EXTREME"
         ? "EXTREME_SPREAD" : "SPREAD_TOO_HIGH";
      return;
   }

   int direction = AdaptiveEntryDirection(momentum);
   if(direction == 0)
   {
      g_executionStatus = g_adaptiveBlockReason == "" ? "WAITING_MOMENTUM" : g_adaptiveBlockReason;
      return;
   }

   // Brain V12: a previous exit may not freeze the next valid market direction.
   // Clear legacy rearm state instead of waiting for another confirmation gate.
   if(g_marketRearmDirection != 0)
      ClearMarketRearm();

   if(count >= (g_adaptiveEngine ? g_adaptiveMaxPositions : g_maxPositions))
   {
      g_executionStatus = "MAX_POSITIONS";
      return;
   }

   // Never hedge against the current basket. Check this before the add gate
   // so a trend flip is reported honestly as a direction lock, not as a vague
   // "waiting to add" state.
   if(count > 0)
   {
      int basketDirection = BasketDirection();
      if(basketDirection == 0)
      {
         g_executionStatus = "MIXED_BASKET_BLOCKED";
         return;
      }
      if(direction != basketDirection)
      {
         g_executionStatus = "WAITING_DIRECTION_LOCK";
         return;
      }
   }

   if(count > 0 && !AutoV20Enabled() && !BasketFillEnabled() && !AdaptiveBasketAddAllowed(direction))
   {
      g_executionStatus = "WAITING_BASKET_ADD";
      return;
   }

   if(!UserDirectionAllows(direction))
   {
      g_executionStatus = "USER_DIRECTION_LOCK";
      g_adaptiveBlockReason = direction > 0
         ? "USER_DIRECTION_LOCK_SELL_ONLY"
         : "USER_DIRECTION_LOCK_BUY_ONLY";
      return;
   }

   if(!OpenTradingAllowedForDirection(direction))
   {
      g_executionStatus = "SYMBOL_DIRECTION_BLOCKED";
      return;
   }

   // Brain V12: do not re-run market-location or Entry Precision as order
   // blockers here. Direction is already decided; proceed to market execution.
   g_adaptiveBlockReason = "";

   g_executionStatus = direction > 0 ? "READY_BUY" : "READY_SELL";
   bool sent = SendMarketOrder(direction);
   if(sent && AutoV20Enabled())
      AutoV20OnOrderSent(direction);
   if(sent || (LegacyBasketEngineEnabled() && BasketFillEnabled() && !g_tacticalCountertrendActive))
   {
      RegisterOrderRequest();
      if(LegacyBasketEngineEnabled() && BasketFillEnabled() && !g_tacticalCountertrendActive)
         ArmBurst(direction);
   }
}
