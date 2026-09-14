from pathlib import Path
import re


ea_path = Path("mt5/FastBasketBot.mq5")
test_path = Path("tests/zero-grid-v1-simulation.mjs")
ea = ea_path.read_text(encoding="utf-8")

if "double preferredGap=1.0;" not in ea:
    raise SystemExit("ZERO ~100-point first-offset patch is missing; aborting targeted L1 repair")

# Root cause of the missing first order:
# the old ladder loop could continue with L2/L3/... when L1 was rejected for a
# fast quote/stops-level change. Once a deeper pending existed, that side's
# anchor became frozen and the missing L1 could remain broker-invalid forever.
# Fix it in two layers:
# 1) L1 gets a few immediate broker-safe retries with fresh prices.
# 2) Both required L1 orders must exist before any deeper level is staged.
#    A legacy broken ladder (L2+ exists while active L1 is missing) is rebuilt.

send_fn = r'''bool ZeroGridSendPending\(bool buySide,int level\)\n\{[\s\S]*?\n\}\n\nbool ZeroGridEnsureLadder\(\)'''
new_send = '''bool ZeroGridSendPending(bool buySide,int level)
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

   double volume=NormalizeTradeVolume(ZeroGridEffectiveBaseLot()*level);
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
      if(g_ordersInWindow>=g_maxOrdersPerMinute)
      {
         g_executionStatus="ZERO_GRID_RATE_LIMIT";
         return false;
      }

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
      request.type_time=ORDER_TIME_GTC;
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
         result.retcode==TRADE_RETCODE_REQUOTE;
      if(!retryable)
         break;
   }

   g_executionStatus=(level==1 ? "ZERO_GRID_L1_RETRY" : "ZERO_GRID_PENDING_RETRY");
   return false;
}

bool ZeroGridEnsureLadder()'''
ea2, count = re.subn(send_fn, new_send, ea, count=1)
if count != 1:
    raise SystemExit(f"ZeroGridSendPending block replacement count={count}")
ea = ea2

ensure_fn = r'''bool ZeroGridEnsureLadder\(\)\n\{[\s\S]*?\n\}\n\nvoid ZeroGridCancelPendingSide'''
new_ensure = '''bool ZeroGridEnsureLadder()
{
   if(g_zeroGridCenter<=0.0)
      return false;

   bool complete=true;
   int nettingDirection=ZeroGridAccountIsNetting() ? ZeroGridPositionDirection() : 0;
   int attemptsThisPass=0;
   int levels=ZeroGridEffectiveLevelsPerSide();
   int maxAttemptsPerPass=MathMin(60,levels*2+4);

   // Repair ladders created by the previous bug: if L2+ is active on a side
   // while that side has no active L1 and the cycle is still flat, discard the
   // malformed pending set. The next tick starts a clean pair from live price.
   if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()>0)
   {
      bool buyL1Active=false;
      bool sellL1Active=false;
      bool buyHigherActive=false;
      bool sellHigherActive=false;
      string buyL1=ZeroGridComment(true,1);
      string sellL1=ZeroGridComment(false,1);

      for(int i=OrdersTotal()-1;i>=0;i--)
      {
         ulong ticket=OrderGetTicket(i);
         if(ticket==0 || !OrderSelect(ticket)) continue;
         if(OrderGetString(ORDER_SYMBOL)!=_Symbol || OrderGetInteger(ORDER_MAGIC)!=InpMagic) continue;
         string comment=OrderGetString(ORDER_COMMENT);
         if(comment==buyL1) buyL1Active=true;
         else if(comment==sellL1) sellL1Active=true;
         else if(StringFind(comment,"SaaSZeroGridB")==0) buyHigherActive=true;
         else if(StringFind(comment,"SaaSZeroGridS")==0) sellHigherActive=true;
      }

      if((buyHigherActive && !buyL1Active) || (sellHigherActive && !sellL1Active))
      {
         ZeroGridCancelPending();
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_REBUILD_MISSING_L1";
         return false;
      }
   }

   bool needBuy=nettingDirection>=0;
   bool needSell=nettingDirection<=0;

   // Stage the trigger pair FIRST. Never allow L2/L3/... to exist while a
   // required L1 is missing. This is the key guarantee for fast symmetric ZERO.
   if(needBuy && !ZeroGridLevelExists(true,1))
   {
      attemptsThisPass++;
      if(!ZeroGridSendPending(true,1)) complete=false;
   }
   if(needSell && !ZeroGridLevelExists(false,1))
   {
      attemptsThisPass++;
      if(!ZeroGridSendPending(false,1)) complete=false;
   }

   bool firstPairReady=
      (!needBuy || ZeroGridLevelExists(true,1)) &&
      (!needSell || ZeroGridLevelExists(false,1));
   if(!firstPairReady)
   {
      g_executionStatus="ZERO_GRID_WAIT_FIRST_PAIR";
      return false;
   }

   // Once L1 is confirmed, fill the rest as fast as the broker/rate limit allows.
   for(int level=2;level<=levels;level++)
   {
      if(needBuy && !ZeroGridLevelExists(true,level))
      {
         attemptsThisPass++;
         if(!ZeroGridSendPending(true,level)) complete=false;
         if(attemptsThisPass>=maxAttemptsPerPass) break;
      }
      if(needSell && !ZeroGridLevelExists(false,level))
      {
         attemptsThisPass++;
         if(!ZeroGridSendPending(false,level)) complete=false;
         if(attemptsThisPass>=maxAttemptsPerPass) break;
      }
      if(g_ordersInWindow>=g_maxOrdersPerMinute)
      {
         complete=false;
         break;
      }
   }
   return complete;
}

void ZeroGridCancelPendingSide'''
ea2, count = re.subn(ensure_fn, new_ensure, ea, count=1)
if count != 1:
    raise SystemExit(f"ZeroGridEnsureLadder block replacement count={count}")
ea = ea2

ea_path.write_text(ea, encoding="utf-8", newline="\n")

# Add regression assertions without disturbing the existing price/profit model.
test = test_path.read_text(encoding="utf-8")
marker = 'console.log("ZERO GRID ~100-point first-offset, fast paired staging and real-net regression passed");'
assertions = '''assert.match(ea, /int maxPlacementAttempts=\\(level==1 \\? 3 : 2\\)/, "L1 must retry immediately");
assert.match(ea, /ZERO_GRID_WAIT_FIRST_PAIR/, "deeper ladder must wait for both required L1 orders");
assert.match(ea, /ZERO_GRID_REBUILD_MISSING_L1/, "legacy malformed ladders must rebuild");
assert.match(ea, /for\\(int level=2;level<=levels;level\\+\\+\\)/, "deeper staging must begin at level 2 after L1 pair");
'''
if assertions not in test:
    if marker not in test:
        raise SystemExit("ZERO regression console marker not found")
    test = test.replace(marker, assertions + marker, 1)
    test_path.write_text(test, encoding="utf-8", newline="\n")

print("ZERO L1 repair applied: immediate retry, first-pair gate, malformed-ladder rebuild")
