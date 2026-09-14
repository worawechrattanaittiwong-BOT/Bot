param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\FastBasketBot.mq5",
  [Parameter(Mandatory = $false)][string]$ApiPath = "apps\api\src\bot.controller.ts",
  [Parameter(Mandatory = $false)][string]$WebPath = "apps\web\app\dashboard\page.tsx",
  [Parameter(Mandatory = $false)][string]$BuildWorkflowPath = ".github\workflows\build-mt5-ea.yml"
)

$ErrorActionPreference = "Stop"

function Read-Utf8([string]$path) {
  if (-not (Test-Path $path)) { throw "File not found: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}

function Write-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText((Resolve-Path $path), $text, [System.Text.UTF8Encoding]::new($false))
}

function Replace-Required([ref]$textRef, [string]$old, [string]$new, [string]$label) {
  if ($textRef.Value.Contains($new)) { Write-Host "$label already applied"; return }
  if (-not $textRef.Value.Contains($old)) { throw "Patch anchor not found: $label" }
  $textRef.Value = $textRef.Value.Replace($old, $new)
  Write-Host "Applied $label"
}

function Replace-IfPresent([ref]$textRef, [string]$old, [string]$new, [string]$label) {
  if ($textRef.Value.Contains($new)) { Write-Host "$label already applied"; return }
  if ($textRef.Value.Contains($old)) {
    $textRef.Value = $textRef.Value.Replace($old, $new)
    Write-Host "Applied $label"
    return
  }
  Write-Host "$label skipped (anchor not present)"
}

# ---------------------------------------------------------------------------
# EA: ZERO GRID V2 — all MT5 account trade modes, Hedging + Netting aware.
# ---------------------------------------------------------------------------
$ea = Read-Utf8 $EaPath
$eaRef = [ref]$ea

Replace-IfPresent $eaRef '#property version   "1.0.1"' '#property version   "1.0.2"' 'EA version 1.0.2'
Replace-IfPresent $eaRef '#define SCENOVA_EA_VERSION "1.0.1"' '#define SCENOVA_EA_VERSION "1.0.2"' 'runtime version 1.0.2'
Replace-IfPresent $eaRef '#define SCENOVA_PRODUCT_VERSION "1.0.1"' '#define SCENOVA_PRODUCT_VERSION "1.0.2"' 'product version 1.0.2'
Replace-IfPresent $eaRef '// ZERO GRID is isolated from AUTO/RACE and hard-locked to Demo/Tester.' '// ZERO GRID is isolated from AUTO/RACE and supports MT5 Demo/Real on Hedging/Netting accounts.' 'ZERO GRID input compatibility comment'

Replace-IfPresent $eaRef @'
double g_zeroGridStartEquity = 0.0;
bool   g_zeroGridClosing = false;
'@ @'
double g_zeroGridStartEquity = 0.0; // telemetry only; close decisions use isolated ZERO GRID P/L
datetime g_zeroGridCycleStartedAt = 0;
bool   g_zeroGridClosing = false;
'@ 'add ZERO GRID cycle start timestamp'

Replace-IfPresent $eaRef 'g_zeroGridBaseLot = MathMax(0.01, InpZeroGridBaseLot);' 'g_zeroGridBaseLot = MathMax(0.0001, InpZeroGridBaseLot);' 'allow broker micro-volume base lot input'
Replace-IfPresent $eaRef 'g_zeroGridBaseLot = MathMax(0.01, JsonNumber(json, "zeroGridBaseLot", g_zeroGridBaseLot));' 'g_zeroGridBaseLot = MathMax(0.0001, JsonNumber(json, "zeroGridBaseLot", g_zeroGridBaseLot));' 'allow remote micro-volume base lot input'

if (-not $eaRef.Value.Contains('ZERO GRID V2 - All MT5 account modes')) {
  $zeroGridPattern = '(?s)// ZERO GRID V1 .*?(?=// Brain V17 RACE)'
  $match = [regex]::Match($eaRef.Value, $zeroGridPattern)
  if (-not $match.Success) { throw 'Patch anchor not found: ZERO GRID V1 block' }

  $zeroGridBlock = @'
// ZERO GRID V2 - All MT5 account modes ---------------------------------------
// Price-only symmetric ladder. Isolated from AUTO/RACE. Supports MT5 Demo,
// Real and Contest accounts. Hedging keeps both sides live; Netting/Exchange
// locks to the first triggered side so the broker cannot merge opposite
// exposure into the same symbol position.
bool ZeroGridModeEnabled()
{
   return g_engineMode == "ZERO_GRID" || g_controlMode == "ZERO_GRID";
}

bool ZeroGridAccountIsHedging()
{
   ENUM_ACCOUNT_MARGIN_MODE mode=(ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   return mode == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING;
}

bool ZeroGridAccountIsNetting()
{
   ENUM_ACCOUNT_MARGIN_MODE mode=(ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   return mode == ACCOUNT_MARGIN_MODE_RETAIL_NETTING || mode == ACCOUNT_MARGIN_MODE_EXCHANGE;
}

string ZeroGridAccountModeLabel()
{
   if(ZeroGridAccountIsHedging()) return "HEDGING";
   if(ZeroGridAccountIsNetting()) return "NETTING";
   return "UNKNOWN";
}

bool ZeroGridStopOrdersSupported()
{
   long orderMode=SymbolInfoInteger(_Symbol,SYMBOL_ORDER_MODE);
   return (orderMode & SYMBOL_ORDER_STOP) == SYMBOL_ORDER_STOP;
}

string ZeroGridComment(bool buySide,int level)
{
   return "SaaSZeroGrid" + (buySide ? "B" : "S") + StringFormat("%02d",level);
}

bool IsZeroGridComment(string comment)
{
   return StringFind(comment,"SaaSZeroGrid") == 0;
}

string ZeroGridStateKey(string suffix)
{
   string magicPart=IntegerToString((int)(InpMagic % 1000000));
   return "SCNZG_" + IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN)) + "_" + _Symbol + "_" + magicPart + "_" + suffix;
}

void SaveZeroGridCycleState()
{
   if(g_zeroGridCenter > 0.0)
      GlobalVariableSet(ZeroGridStateKey("CENTER"),g_zeroGridCenter);
   if(g_zeroGridStartEquity > 0.0)
      GlobalVariableSet(ZeroGridStateKey("EQUITY"),g_zeroGridStartEquity);
   if(g_zeroGridCycleStartedAt > 0)
      GlobalVariableSet(ZeroGridStateKey("START"),(double)g_zeroGridCycleStartedAt);
}

void LoadZeroGridCycleState()
{
   if(g_zeroGridCenter <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("CENTER")))
      g_zeroGridCenter=GlobalVariableGet(ZeroGridStateKey("CENTER"));
   if(g_zeroGridStartEquity <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("EQUITY")))
      g_zeroGridStartEquity=GlobalVariableGet(ZeroGridStateKey("EQUITY"));
   if(g_zeroGridCycleStartedAt <= 0 && GlobalVariableCheck(ZeroGridStateKey("START")))
      g_zeroGridCycleStartedAt=(datetime)(long)GlobalVariableGet(ZeroGridStateKey("START"));
}

void ResetZeroGridCycleState()
{
   g_zeroGridCenter=0.0;
   g_zeroGridStartEquity=0.0;
   g_zeroGridCycleStartedAt=0;
   g_zeroGridClosing=false;
   if(GlobalVariableCheck(ZeroGridStateKey("CENTER"))) GlobalVariableDel(ZeroGridStateKey("CENTER"));
   if(GlobalVariableCheck(ZeroGridStateKey("EQUITY"))) GlobalVariableDel(ZeroGridStateKey("EQUITY"));
   if(GlobalVariableCheck(ZeroGridStateKey("START"))) GlobalVariableDel(ZeroGridStateKey("START"));
}

int ZeroGridPositionCount()
{
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      string comment=PositionGetString(POSITION_COMMENT);
      if(IsZeroGridComment(comment) || g_zeroGridCycleStartedAt>0) count++;
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
      if(OrderGetString(ORDER_SYMBOL)==_Symbol && OrderGetInteger(ORDER_MAGIC)==InpMagic && OrderGetString(ORDER_COMMENT)==wanted)
         return true;
   }
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)==_Symbol && PositionGetInteger(POSITION_MAGIC)==InpMagic && PositionGetString(POSITION_COMMENT)==wanted)
         return true;
   }

   // On Netting accounts MT5 may merge multiple fills into one position and the
   // position comment cannot reliably preserve every triggered level. History
   // is therefore authoritative for one-shot level recovery after fills/restart.
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
         if(HistoryOrderGetString(ticket,ORDER_COMMENT)==wanted) return true;
      }
   }
   return false;
}

double ZeroGridCycleNet()
{
   LoadZeroGridCycleState();
   double total=0.0;

   // Floating P/L is isolated to this EA + symbol. Do not use account equity
   // delta because unrelated trades, deposits or other symbols would corrupt
   // the ZERO GRID close threshold.
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      total += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   }

   // Include realized profit, swap, commission and fees from this cycle.
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

double ZeroGridRequiredCloseNet()
{
   return MathMax(0.01,g_zeroGridMinNetProfitMoney) + MathMax(0.0,g_zeroGridCloseReserveMoney);
}

double ZeroGridTickSize()
{
   double tick=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   if(tick<=0.0) tick=_Point;
   return MathMax(_Point,tick);
}

double ZeroGridMinPendingDistancePrice()
{
   long stops=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_STOPS_LEVEL);
   long freeze=SymbolInfoInteger(_Symbol,SYMBOL_TRADE_FREEZE_LEVEL);
   double brokerDistance=(double)MathMax(stops,freeze)*_Point;
   return MathMax(ZeroGridTickSize(),brokerDistance);
}

double ZeroGridEffectiveStepPrice()
{
   return MathMax(g_zeroGridStepPrice,ZeroGridMinPendingDistancePrice()+ZeroGridTickSize());
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

int ZeroGridPositionDirection()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      return PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? 1 : -1;
   }
   return 0;
}

bool ZeroGridSendPending(bool buySide,int level)
{
   if(level<1 || level>g_zeroGridLevelsPerSide || ZeroGridLevelExists(buySide,level))
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
   if(g_ordersInWindow>=g_maxOrdersPerMinute)
   {
      g_executionStatus="ZERO_GRID_RATE_LIMIT";
      return false;
   }

   double volume=NormalizeTradeVolume(g_zeroGridBaseLot * level);
   if(volume<=0.0)
   {
      g_executionStatus="ZERO_GRID_INVALID_LOT";
      return false;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
   {
      g_executionStatus="ZERO_GRID_WAIT_TICK";
      return false;
   }

   double gridStep=ZeroGridEffectiveStepPrice();
   double minDistance=ZeroGridMinPendingDistancePrice();
   double rawPrice=buySide
      ? g_zeroGridCenter + gridStep * level
      : g_zeroGridCenter - gridStep * level;
   if(buySide)
      rawPrice=MathMax(rawPrice,tick.ask+minDistance);
   else
      rawPrice=MathMin(rawPrice,tick.bid-minDistance);
   double price=ZeroGridNormalizePendingPrice(buySide,rawPrice);

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

   g_executionStatus="ZERO_GRID_PENDING_RETRY";
   return false;
}

bool ZeroGridEnsureLadder()
{
   if(g_zeroGridCenter<=0.0)
      return false;

   bool complete=true;
   int nettingDirection=ZeroGridAccountIsNetting() ? ZeroGridPositionDirection() : 0;
   for(int level=1;level<=g_zeroGridLevelsPerSide;level++)
   {
      // Hedging: both sides stay available. Netting: before the first fill both
      // sides are staged; after the first fill only that side may add levels.
      if(nettingDirection>=0 && !ZeroGridLevelExists(true,level) && !ZeroGridSendPending(true,level)) complete=false;
      if(nettingDirection<=0 && !ZeroGridLevelExists(false,level) && !ZeroGridSendPending(false,level)) complete=false;
      if(g_ordersInWindow>=g_maxOrdersPerMinute) break;
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

void ZeroGridClosePositions()
{
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      ClosePositionByTicket(ticket);
   }
}

bool StartZeroGridCycle()
{
   if(!ZeroGridModeEnabled()) return false;
   if(g_state!=STATE_RUNNING || !g_access || (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      g_executionStatus="ZERO_GRID_CONTROL_NOT_FRESH";
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
      MqlTick tick;
      if(!SymbolInfoTick(_Symbol,tick))
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return true;
      }
      double mid=(tick.bid+tick.ask)*0.5;
      g_zeroGridCenter=ZeroGridNormalizePendingPrice(true,mid);
      g_zeroGridStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);
      g_zeroGridCycleStartedAt=TimeCurrent();
      g_zeroGridClosing=false;
      SaveZeroGridCycleState();
   }

   ZeroGridEnsureLadder();
   if(ZeroGridAccountIsNetting())
      g_executionStatus=ZeroGridPendingCount()>0 ? "ZERO_GRID_LADDER_READY_NETTING" : "ZERO_GRID_BUILDING_LADDER";
   else
      g_executionStatus=ZeroGridPendingCount()>0 ? "ZERO_GRID_LADDER_READY" : "ZERO_GRID_BUILDING_LADDER";
   return true;
}

bool ManageZeroGrid()
{
   int positions=ZeroGridPositionCount();
   int pending=ZeroGridPendingCount();
   LoadZeroGridCycleState();

   if(g_zeroGridClosing)
   {
      ZeroGridCancelPending();
      ZeroGridClosePositions();
      if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)
      {
         double realized=ZeroGridCycleNet();
         Print("ZERO GRID cycle closed net=",DoubleToString(realized,2));
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_CLOSED";
      }
      else
         g_executionStatus="ZERO_GRID_CLOSE_RETRY";
      return true;
   }

   // If mode is changed while a ZERO GRID cycle owns positions, cancel pending
   // entries and let that owned cycle drain safely. Do not hand it to AUTO/RACE.
   if(!ZeroGridModeEnabled())
   {
      ZeroGridCancelPending();
      if(positions<=0)
      {
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_STOPPED_FLAT";
         return true;
      }

      double drainNet=ZeroGridCycleNet();
      if(drainNet>=ZeroGridRequiredCloseNet())
      {
         g_zeroGridClosing=true;
         g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
         ZeroGridClosePositions();
      }
      else
         g_executionStatus="ZERO_GRID_DRAINING";
      return true;
   }

   // Netting/Exchange account: after the first side triggers, remove the
   // opposite pending ladder so future fills cannot offset/merge the position.
   if(ZeroGridAccountIsNetting() && positions>0)
   {
      int direction=ZeroGridPositionDirection();
      if(direction>0)
      {
         ZeroGridCancelPendingSide(false);
         g_executionStatus="ZERO_GRID_NETTING_SIDE_LOCK_BUY";
      }
      else if(direction<0)
      {
         ZeroGridCancelPendingSide(true);
         g_executionStatus="ZERO_GRID_NETTING_SIDE_LOCK_SELL";
      }
   }

   if(positions>0)
   {
      double cycleNet=ZeroGridCycleNet();
      double required=ZeroGridRequiredCloseNet();
      if(cycleNet>=required)
      {
         g_zeroGridClosing=true;
         g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
         ZeroGridCancelPending();
         ZeroGridClosePositions();
         return true;
      }
   }

   if(g_zeroGridCenter<=0.0)
      return StartZeroGridCycle();

   ZeroGridEnsureLadder();
   if(positions>0)
      g_executionStatus=ZeroGridAccountIsNetting() ? "ZERO_GRID_ACTIVE_NETTING" : "ZERO_GRID_ACTIVE";
   else
      g_executionStatus=ZeroGridAccountIsNetting() ? "ZERO_GRID_LADDER_READY_NETTING" : "ZERO_GRID_LADDER_READY";
   return true;
}

'@

  $eaRef.Value = [regex]::Replace($eaRef.Value, $zeroGridPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $zeroGridBlock }, 1)
  Write-Host 'Applied ZERO GRID V2 all-account execution block'
} else {
  Write-Host 'ZERO GRID V2 all-account execution block already applied'
}

Write-Utf8 $EaPath $eaRef.Value

# ---------------------------------------------------------------------------
# API: accept symbol/broker micro steps without imposing gold-centric minima.
# ---------------------------------------------------------------------------
$api = Read-Utf8 $ApiPath
$apiRef = [ref]$api
Replace-IfPresent $apiRef 'numberSetting("zeroGridStepPrice", 0.01, 1000);' 'numberSetting("zeroGridStepPrice", 0.00000001, 1000);' 'API ZERO GRID price-step lower bound'
Replace-IfPresent $apiRef 'numberSetting("zeroGridBaseLot", 0.01, 100);' 'numberSetting("zeroGridBaseLot", 0.0001, 100);' 'API ZERO GRID base-lot lower bound'
Write-Utf8 $ApiPath $apiRef.Value

# ---------------------------------------------------------------------------
# Web Bot Settings: describe universal account/symbol handling accurately.
# ---------------------------------------------------------------------------
$web = Read-Utf8 $WebPath
$webRef = [ref]$web
Replace-IfPresent $webRef 'Demo/Tester · วาง BUY STOP + SELL STOP สองฝั่ง เพิ่ม Lot ตามระดับ และปิดทั้งชุดทันทีเมื่อกำไรรวมสุทธิถึงขั้นต่ำ' 'รองรับ MT5 Demo/Real · Hedging วางสองฝั่ง และ Netting ล็อกฝั่งแรกอัตโนมัติ พร้อมปรับ Lot/ราคาให้ตรงข้อกำหนดโบรกเกอร์' 'ZERO GRID mode description'
Replace-IfPresent $webRef 'ZERO GRID · Demo/Tester only' 'ZERO GRID · รองรับบัญชี MT5' 'ZERO GRID engine badge'
Replace-IfPresent $webRef 'วางกริดสองฝั่งแบบ one-shot และปิดเมื่อ Cycle Net ถึงขั้นต่ำ' 'Demo/Real · Hedging/Netting · ปรับ Tick, Stops Level และ Lot Step ตามโบรกเกอร์อัตโนมัติ' 'ZERO GRID engine detail'
Replace-IfPresent $webRef 'ไม่ใช้ Brain/Indicator เลือกฝั่ง' 'ไม่ใช้ Brain/Indicator · บัญชี Netting จะล็อกฝั่งแรกหลัง Trigger' 'ZERO GRID direction note'
Replace-IfPresent $webRef 'zeroGridStepPrice} suffix="$"' 'zeroGridStepPrice} suffix="ราคา"' 'ZERO GRID price-step suffix'
Replace-IfPresent $webRef 'ค่าเริ่มต้น $3.00 ต่อระดับ' 'ค่าเริ่มต้น 3.00 หน่วยราคา · ระบบปรับขั้นต่ำตาม Tick/Stops Level ของ Symbol' 'ZERO GRID price-step help'
Replace-IfPresent $webRef 'Level n = Base Lot × n' 'Level n = Base Lot × n · ปรับตาม Min/Max/Step ของโบรกเกอร์' 'ZERO GRID lot help'
Replace-IfPresent $webRef 'zeroGridMinNetProfitMoney} suffix="USD"' 'zeroGridMinNetProfitMoney} suffix="เงินบัญชี"' 'ZERO GRID min-profit currency label'
Replace-IfPresent $webRef 'ค่าเริ่มต้น +0.01 แล้วปิดทั้ง Basket ทันที' 'ค่าเริ่มต้น +0.01 หน่วยเงินบัญชี แล้วปิดทั้ง Basket ทันที' 'ZERO GRID min-profit help'
Replace-IfPresent $webRef 'zeroGridCloseReserveMoney} suffix="USD"' 'zeroGridCloseReserveMoney} suffix="เงินบัญชี"' 'ZERO GRID reserve currency label'
Replace-IfPresent $webRef 'เพิ่มเผื่อ Commission/Fees ตอน Close' 'หน่วยเงินบัญชี · เพิ่มเผื่อ Commission/Fees ตอน Close' 'ZERO GRID reserve help'
Write-Utf8 $WebPath $webRef.Value

# ---------------------------------------------------------------------------
# Build gate: replace the obsolete Demo-only sentinel with universal V2 gates.
# ---------------------------------------------------------------------------
$build = Read-Utf8 $BuildWorkflowPath
$buildRef = [ref]$build
Replace-IfPresent $buildRef @'
            'ZERO_GRID_DEMO_ONLY',
'@ @'
            'bool ZeroGridAccountIsNetting()',
            'ZERO_GRID_LADDER_READY_NETTING',
            'SYMBOL_TRADE_TICK_SIZE',
            'HistoryOrdersTotal()',
'@ 'build ZERO GRID V2 sentinels'
Write-Utf8 $BuildWorkflowPath $buildRef.Value

Write-Host 'ZERO GRID V2 all-MT5 upgrade complete.'
