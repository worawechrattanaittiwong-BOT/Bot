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

function Insert-BeforeRequired([ref]$textRef, [string]$anchor, [string]$block, [string]$sentinel, [string]$label) {
  if ($textRef.Value.Contains($sentinel)) { Write-Host "$label already applied"; return }
  $index = $textRef.Value.IndexOf($anchor, [System.StringComparison]::Ordinal)
  if ($index -lt 0) { throw "Patch anchor not found: $label" }
  $textRef.Value = $textRef.Value.Insert($index, $block + "`r`n`r`n")
  Write-Host "Applied $label"
}

# ---------------------------------------------------------------------------
# EA: isolated ZERO GRID engine for Demo / Strategy Tester only.
# ---------------------------------------------------------------------------
$ea = Read-Utf8 $EaPath
$eaRef = [ref]$ea

Replace-Required $eaRef '#property version   "1.0.0"' '#property version   "1.0.1"' 'EA version 1.0.1'
Replace-Required $eaRef '#define SCENOVA_EA_VERSION "1.0.0"' '#define SCENOVA_EA_VERSION "1.0.1"' 'runtime version 1.0.1'
Replace-Required $eaRef '#define SCENOVA_PRODUCT_VERSION "1.0.0"' '#define SCENOVA_PRODUCT_VERSION "1.0.1"' 'product version 1.0.1'

Replace-Required $eaRef @'
input string          InpEngineMode           = "AUTO";
'@ @'
input string          InpEngineMode           = "AUTO";
// ZERO GRID is isolated from AUTO/RACE and hard-locked to Demo/Tester.
input double          InpZeroGridStepPrice     = 3.0;
input int             InpZeroGridLevelsPerSide = 30;
input double          InpZeroGridBaseLot       = 0.03;
input double          InpZeroGridMinNetProfitMoney = 0.01;
input double          InpZeroGridCloseReserveMoney = 0.00;
'@ 'add ZERO GRID inputs'

Replace-Required $eaRef @'
string g_engineMode = "AUTO";
string g_controlMode = "LEGACY";
'@ @'
string g_engineMode = "AUTO";
string g_controlMode = "LEGACY";
double g_zeroGridStepPrice = 3.0;
int    g_zeroGridLevelsPerSide = 30;
double g_zeroGridBaseLot = 0.03;
double g_zeroGridMinNetProfitMoney = 0.01;
double g_zeroGridCloseReserveMoney = 0.0;
double g_zeroGridCenter = 0.0;
double g_zeroGridStartEquity = 0.0;
bool   g_zeroGridClosing = false;
'@ 'add ZERO GRID runtime state'

Replace-Required $eaRef @'
   g_engineMode = InpEngineMode;
   StringToUpper(g_engineMode);
   if(g_engineMode != "RACE")
      g_engineMode = "AUTO";
'@ @'
   g_engineMode = InpEngineMode;
   StringToUpper(g_engineMode);
   if(g_engineMode != "RACE" && g_engineMode != "ZERO_GRID")
      g_engineMode = "AUTO";
   g_zeroGridStepPrice = MathMax(_Point, InpZeroGridStepPrice);
   g_zeroGridLevelsPerSide = (int)MathMax(1, MathMin(30, InpZeroGridLevelsPerSide));
   g_zeroGridBaseLot = MathMax(0.01, InpZeroGridBaseLot);
   g_zeroGridMinNetProfitMoney = MathMax(0.01, InpZeroGridMinNetProfitMoney);
   g_zeroGridCloseReserveMoney = MathMax(0.0, InpZeroGridCloseReserveMoney);
'@ 'initialize ZERO GRID without touching AUTO/RACE'

$zeroSettings = @'
   g_zeroGridStepPrice = MathMax(_Point, JsonNumber(json, "zeroGridStepPrice", g_zeroGridStepPrice));
   g_zeroGridLevelsPerSide = (int)MathMax(1.0, MathMin(30.0, JsonNumber(json, "zeroGridLevelsPerSide", g_zeroGridLevelsPerSide)));
   g_zeroGridBaseLot = MathMax(0.01, JsonNumber(json, "zeroGridBaseLot", g_zeroGridBaseLot));
   g_zeroGridMinNetProfitMoney = MathMax(0.01, JsonNumber(json, "zeroGridMinNetProfitMoney", g_zeroGridMinNetProfitMoney));
   g_zeroGridCloseReserveMoney = MathMax(0.0, JsonNumber(json, "zeroGridCloseReserveMoney", g_zeroGridCloseReserveMoney));

'@
Insert-BeforeRequired $eaRef '   string requestedEngineMode = JsonString(json, "engineMode", "");' $zeroSettings 'zeroGridStepPrice", g_zeroGridStepPrice' 'apply ZERO GRID remote settings'

Replace-Required $eaRef @'
   if(requestedEngineMode == "AUTO" || requestedEngineMode == "RACE")
      g_engineMode = requestedEngineMode;
'@ @'
   if(requestedEngineMode == "AUTO" || requestedEngineMode == "RACE" || requestedEngineMode == "ZERO_GRID")
      g_engineMode = requestedEngineMode;
'@ 'accept ZERO GRID engine mode'

Replace-Required $eaRef @'
   if(requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||
      requestedControlMode == "ASSISTED" || requestedControlMode == "MANUAL" ||
      requestedControlMode == "LEGACY")
'@ @'
   if(requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||
      requestedControlMode == "ZERO_GRID" ||
      requestedControlMode == "ASSISTED" || requestedControlMode == "MANUAL" ||
      requestedControlMode == "LEGACY")
'@ 'accept ZERO GRID control mode'

Replace-Required $eaRef '   return g_engineMode != "RACE" && g_controlMode == "AUTO";' '   return g_engineMode == "AUTO" && g_controlMode == "AUTO";' 'keep AUTO brain isolated from ZERO GRID'

$zeroGridBlock = @'
// ZERO GRID V1 ---------------------------------------------------------------
// Price-only symmetric pending ladder. Demo/Tester only. No AUTO/RACE brain,
// confidence, indicators, rescue or tactical logic participates in this mode.
bool ZeroGridModeEnabled()
{
   return g_engineMode == "ZERO_GRID" || g_controlMode == "ZERO_GRID";
}

bool ZeroGridDemoAllowed()
{
   if(MQLInfoInteger(MQL_TESTER))
      return true;
   return (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO;
}

bool ZeroGridHedgingAllowed()
{
   if(MQLInfoInteger(MQL_TESTER))
      return true;
   return (ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE) == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING;
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
}

void LoadZeroGridCycleState()
{
   if(g_zeroGridCenter <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("CENTER")))
      g_zeroGridCenter=GlobalVariableGet(ZeroGridStateKey("CENTER"));
   if(g_zeroGridStartEquity <= 0.0 && GlobalVariableCheck(ZeroGridStateKey("EQUITY")))
      g_zeroGridStartEquity=GlobalVariableGet(ZeroGridStateKey("EQUITY"));
}

void ResetZeroGridCycleState()
{
   g_zeroGridCenter=0.0;
   g_zeroGridStartEquity=0.0;
   g_zeroGridClosing=false;
   if(GlobalVariableCheck(ZeroGridStateKey("CENTER"))) GlobalVariableDel(ZeroGridStateKey("CENTER"));
   if(GlobalVariableCheck(ZeroGridStateKey("EQUITY"))) GlobalVariableDel(ZeroGridStateKey("EQUITY"));
}

int ZeroGridPositionCount()
{
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(IsZeroGridComment(PositionGetString(POSITION_COMMENT))) count++;
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
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(IsZeroGridComment(PositionGetString(POSITION_COMMENT))) continue;
      count++;
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
   return false;
}

double ZeroGridCycleNet()
{
   LoadZeroGridCycleState();
   if(g_zeroGridStartEquity > 0.0)
      return AccountInfoDouble(ACCOUNT_EQUITY) - g_zeroGridStartEquity;

   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(!IsZeroGridComment(PositionGetString(POSITION_COMMENT))) continue;
      total += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   }
   return total;
}

double ZeroGridRequiredCloseNet()
{
   return MathMax(0.01,g_zeroGridMinNetProfitMoney) + MathMax(0.0,g_zeroGridCloseReserveMoney);
}

bool ZeroGridSendPending(bool buySide,int level)
{
   if(level<1 || level>g_zeroGridLevelsPerSide || ZeroGridLevelExists(buySide,level))
      return true;
   if(g_zeroGridCenter<=0.0)
      return false;
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

   double price=buySide
      ? g_zeroGridCenter + g_zeroGridStepPrice * level
      : g_zeroGridCenter - g_zeroGridStepPrice * level;
   price=NormalizeDouble(price,_Digits);

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
   for(int level=1;level<=g_zeroGridLevelsPerSide;level++)
   {
      if(!ZeroGridLevelExists(true,level) && !ZeroGridSendPending(true,level)) complete=false;
      if(!ZeroGridLevelExists(false,level) && !ZeroGridSendPending(false,level)) complete=false;
      if(g_ordersInWindow>=g_maxOrdersPerMinute) break;
   }
   return complete;
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
      if(!IsZeroGridComment(PositionGetString(POSITION_COMMENT))) continue;
      ClosePositionByTicket(ticket);
   }
}

bool StartZeroGridCycle()
{
   if(!ZeroGridModeEnabled()) return false;
   if(!ZeroGridDemoAllowed())
   {
      g_executionStatus="ZERO_GRID_DEMO_ONLY";
      return true;
   }
   if(!ZeroGridHedgingAllowed())
   {
      g_executionStatus="ZERO_GRID_HEDGING_REQUIRED";
      return true;
   }
   if(ZeroGridForeignPositionCount()>0)
   {
      g_executionStatus="ZERO_GRID_FOREIGN_POSITION_BLOCK";
      return true;
   }
   if(g_state!=STATE_RUNNING || !g_access || (!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid()))
   {
      g_executionStatus="ZERO_GRID_CONTROL_NOT_FRESH";
      return true;
   }

   LoadZeroGridCycleState();
   if(g_zeroGridCenter<=0.0)
   {
      MqlTick tick;
      if(!SymbolInfoTick(_Symbol,tick))
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return true;
      }
      g_zeroGridCenter=NormalizeDouble((tick.bid+tick.ask)*0.5,_Digits);
      g_zeroGridStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);
      g_zeroGridClosing=false;
      SaveZeroGridCycleState();
   }

   ZeroGridEnsureLadder();
   g_executionStatus=ZeroGridPendingCount()>0 ? "ZERO_GRID_LADDER_READY" : "ZERO_GRID_BUILDING_LADDER";
   return true;
}

bool ManageZeroGrid()
{
   int positions=ZeroGridPositionCount();
   int pending=ZeroGridPendingCount();
   LoadZeroGridCycleState();

   if(!ZeroGridDemoAllowed())
   {
      ZeroGridCancelPending();
      g_executionStatus="ZERO_GRID_DEMO_ONLY";
      return true;
   }

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

   if(!ZeroGridModeEnabled())
   {
      ZeroGridCancelPending();
      if(positions<=0)
      {
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_STOPPED_FLAT";
         return true;
      }
      g_executionStatus="ZERO_GRID_DRAINING";
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

   if(!ZeroGridModeEnabled())
      return true;

   if(g_zeroGridCenter<=0.0)
      return StartZeroGridCycle();

   ZeroGridEnsureLadder();
   g_executionStatus=positions>0 ? "ZERO_GRID_ACTIVE" : "ZERO_GRID_LADDER_READY";
   return true;
}
'@
Insert-BeforeRequired $eaRef '// Brain V17 RACE' $zeroGridBlock 'bool ZeroGridModeEnabled()' 'insert ZERO GRID demo engine'

Replace-Required $eaRef @'
   // Strict mode ownership: a RACE Basket is always managed by RACE until it
'@ @'
   // ZERO GRID owns its tagged positions and pending orders until flat. This
   // branch executes before AUTO/RACE management so the engines never mix.
   if(ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)
   {
      ManageZeroGrid();
      return;
   }

   // Strict mode ownership: a RACE Basket is always managed by RACE until it
'@ 'route existing ZERO GRID cycle away from AUTO/RACE'

Replace-Required $eaRef @'
   // RACE starts only from a flat account. AUTO below is intentionally left
'@ @'
   // ZERO GRID starts only when selected and the EA-owned basket is flat.
   if(ZeroGridModeEnabled() && count<=0 && rescueCount<=0)
   {
      StartZeroGridCycle();
      return;
   }

   // RACE starts only from a flat account. AUTO below is intentionally left
'@ 'start ZERO GRID before RACE/AUTO'

Replace-Required $eaRef '   Print("CloseAllBasket reason=", reason);' @'
   Print("CloseAllBasket reason=", reason);
   // Any global/safety close must also remove ZERO GRID pending orders.
   if(ZeroGridPendingCount()>0)
      ZeroGridCancelPending();
'@ 'cancel ZERO GRID pending orders on global close'

Write-Utf8 $EaPath $eaRef.Value

# ---------------------------------------------------------------------------
# API: validate the new mode/settings without changing existing defaults.
# ---------------------------------------------------------------------------
$api = Read-Utf8 $ApiPath
$apiRef = [ref]$api
Replace-Required $apiRef '["AUTO", "RACE", "ASSISTED", "MANUAL"]' '["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL"]' 'accept ZERO GRID control mode in API'
Replace-Required $apiRef '["AUTO", "RACE"].includes(engineMode)' '["AUTO", "RACE", "ZERO_GRID"].includes(engineMode)' 'accept ZERO GRID engine mode in API'
Replace-Required $apiRef @'
    numberSetting("maxOrdersPerMinute", 1, 5000, true);
    booleanSetting("adaptiveEngine");
'@ @'
    numberSetting("maxOrdersPerMinute", 1, 5000, true);
    numberSetting("zeroGridStepPrice", 0.01, 1000);
    numberSetting("zeroGridLevelsPerSide", 1, 30, true);
    numberSetting("zeroGridBaseLot", 0.01, 100);
    numberSetting("zeroGridMinNetProfitMoney", 0.01, 100000);
    numberSetting("zeroGridCloseReserveMoney", 0, 100000);
    booleanSetting("adaptiveEngine");
'@ 'validate ZERO GRID settings in API'
Write-Utf8 $ApiPath $apiRef.Value

# ---------------------------------------------------------------------------
# Web: add mode card and dedicated ZERO GRID settings.
# ---------------------------------------------------------------------------
$web = Read-Utf8 $WebPath
$webRef = [ref]$web
Replace-Required $webRef @'
  engineMode: "AUTO",
  entryMode: "AUTO_MOMENTUM"
'@ @'
  engineMode: "AUTO",
  zeroGridStepPrice: 3,
  zeroGridLevelsPerSide: 30,
  zeroGridBaseLot: 0.03,
  zeroGridMinNetProfitMoney: 0.01,
  zeroGridCloseReserveMoney: 0,
  entryMode: "AUTO_MOMENTUM"
'@ 'add ZERO GRID web defaults'

Replace-Required $webRef @'
  const inferredControlMode = engineMode === "RACE" ? "RACE" : entryMode === "AUTO_MOMENTUM" ? "AUTO" : hasManualExit ? "MANUAL" : "ASSISTED";
'@ @'
  const inferredControlMode = engineMode === "ZERO_GRID" ? "ZERO_GRID" : engineMode === "RACE" ? "RACE" : entryMode === "AUTO_MOMENTUM" ? "AUTO" : hasManualExit ? "MANUAL" : "ASSISTED";
'@ 'infer ZERO GRID control mode'
Replace-Required $webRef '["AUTO","RACE","ASSISTED","MANUAL"]' '["AUTO","RACE","ZERO_GRID","ASSISTED","MANUAL"]' 'allow ZERO GRID in web control modes'

Replace-Required $webRef @'
    RACE:{title:"โหมดซิ่ง",subtitle:"เร่งจังหวะเปิดไม้ 2× เพื่อไล่ให้ครบ Max Positions เร็วขึ้น โดยยังแยกการบริหารกำไร/การโดนลากจาก AUTO"},
    ASSISTED:{title:"ช่วยตัดสินใจ",subtitle:"EA วิเคราะห์ BUY / SELL และเข้าไม้อัตโนมัติ คุณเลือกแนวทางบริหารรอบ"},
'@ @'
    RACE:{title:"โหมดซิ่ง",subtitle:"เร่งจังหวะเปิดไม้ 2× เพื่อไล่ให้ครบ Max Positions เร็วขึ้น โดยยังแยกการบริหารกำไร/การโดนลากจาก AUTO"},
    ZERO_GRID:{title:"ZERO GRID",subtitle:"Demo/Tester · วาง BUY STOP + SELL STOP สองฝั่ง เพิ่ม Lot ตามระดับ และปิดทั้งชุดทันทีเมื่อกำไรรวมสุทธิถึงขั้นต่ำ"},
    ASSISTED:{title:"ช่วยตัดสินใจ",subtitle:"EA วิเคราะห์ BUY / SELL และเข้าไม้อัตโนมัติ คุณเลือกแนวทางบริหารรอบ"},
'@ 'add ZERO GRID mode copy'

Replace-Required $webRef @'
    // Keep the currently selected direction when switching control modes.
    if (mode === "RACE") {
'@ @'
    // ZERO GRID is price-only and does not use AUTO direction/brain settings.
    if (mode === "ZERO_GRID") {
      props.onEdit?.("engineMode","ZERO_GRID");
      props.onEdit?.("profitTargetMode","OFF");
      props.onEdit?.("manualStopLossPoints",0);
      return;
    }
    // Keep the currently selected direction when switching control modes.
    if (mode === "RACE") {
'@ 'apply ZERO GRID mode settings'

Replace-Required $webRef @'
                {id:"RACE",icon:"status",tag:"เร็วสุด"},
                {id:"ASSISTED",icon:"target",tag:"กึ่งอัตโนมัติ"},
'@ @'
                {id:"RACE",icon:"status",tag:"เร็วสุด"},
                {id:"ZERO_GRID",icon:"layers",tag:"Demo Grid"},
                {id:"ASSISTED",icon:"target",tag:"กึ่งอัตโนมัติ"},
'@ 'add ZERO GRID mode card'

Replace-Required $webRef @'
                  <div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="gold" size={17}/>Symbol</label><strong>{props.symbol || "—"}</strong></div>
                  <label className="cc-bot-v2-field"><span><ScenovaIcon name="trend" size={17}/>ทิศทาง</span><select className="input" value={entryMode} onChange={e=>props.onEdit?.("entryMode",e.target.value)}><option value="AUTO_MOMENTUM">อัตโนมัติ · EA เลือก BUY / SELL</option><option value="BUY_ONLY">BUY เท่านั้น</option><option value="SELL_ONLY">SELL เท่านั้น</option></select><small>{entryMode === "AUTO_MOMENTUM" ? "M1 / M5 / M15 / M30 / H1 วิเคราะห์ทิศทางอัตโนมัติ" : "บังคับทิศตามที่เลือกจนกว่าจะเปลี่ยนค่า"}</small></label>
                  <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</span><select className="input" value={String(props.settings.maxPositions||1)} onChange={e=>props.onEdit?.("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}</select></label>
                  <label className="cc-bot-v2-field"><span><ScenovaIcon name="lot" size={17}/>Lot ต่อไม้</span><select className="input" value={String(props.settings.lot||0.01)} onChange={e=>props.onEdit?.("lot",e.target.value)}>{[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1].map(v=><option key={v} value={v}>{Number(v).toFixed(2)} Lot</option>)}</select></label>
'@ @'
                  <div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="gold" size={17}/>Symbol</label><strong>{props.symbol || "—"}</strong></div>
                  {controlMode==="ZERO_GRID" ? <>
                    <div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="trend" size={17}/>ทิศทาง</label><strong>BUY STOP + SELL STOP</strong><small>ไม่ใช้ Brain/Indicator เลือกฝั่ง</small></div>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>ระยะ Grid</span><NumberInput value={props.settings.zeroGridStepPrice} suffix="$" onCommit={(v:string)=>props.onEdit?.("zeroGridStepPrice",v)}/><small>ค่าเริ่มต้น $3.00 ต่อระดับ</small></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>ระดับต่อฝั่ง</span><select className="input" value={String(props.settings.zeroGridLevelsPerSide||30)} onChange={e=>props.onEdit?.("zeroGridLevelsPerSide",e.target.value)}>{[5,10,15,20,25,30].map(v=><option key={v} value={v}>{v} ระดับ / ฝั่ง</option>)}</select></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="lot" size={17}/>Base Lot</span><NumberInput value={props.settings.zeroGridBaseLot} suffix="Lot" onCommit={(v:string)=>props.onEdit?.("zeroGridBaseLot",v)}/><small>Level n = Base Lot × n</small></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="profit" size={17}/>กำไรสุทธิขั้นต่ำ</span><MoneyInput value={props.settings.zeroGridMinNetProfitMoney} suffix="USD" onCommit={(v:string)=>props.onEdit?.("zeroGridMinNetProfitMoney",v)}/><small>ค่าเริ่มต้น +0.01 แล้วปิดทั้ง Basket ทันที</small></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="shield" size={17}/>สำรองค่าปิด</span><MoneyInput value={props.settings.zeroGridCloseReserveMoney} suffix="USD" onCommit={(v:string)=>props.onEdit?.("zeroGridCloseReserveMoney",v)}/><small>เพิ่มเผื่อ Commission/Fees ตอน Close</small></label>
                  </> : <>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="trend" size={17}/>ทิศทาง</span><select className="input" value={entryMode} onChange={e=>props.onEdit?.("entryMode",e.target.value)}><option value="AUTO_MOMENTUM">อัตโนมัติ · EA เลือก BUY / SELL</option><option value="BUY_ONLY">BUY เท่านั้น</option><option value="SELL_ONLY">SELL เท่านั้น</option></select><small>{entryMode === "AUTO_MOMENTUM" ? "M1 / M5 / M15 / M30 / H1 วิเคราะห์ทิศทางอัตโนมัติ" : "บังคับทิศตามที่เลือกจนกว่าจะเปลี่ยนค่า"}</small></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="layers" size={17}/>จำนวนไม้สูงสุด</span><select className="input" value={String(props.settings.maxPositions||1)} onChange={e=>props.onEdit?.("maxPositions",e.target.value)}>{[1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,50,75,100].map(v=><option key={v} value={v}>{v} ไม้</option>)}</select></label>
                    <label className="cc-bot-v2-field"><span><ScenovaIcon name="lot" size={17}/>Lot ต่อไม้</span><select className="input" value={String(props.settings.lot||0.01)} onChange={e=>props.onEdit?.("lot",e.target.value)}>{[0.01,0.02,0.03,0.05,0.1,0.2,0.3,0.5,1].map(v=><option key={v} value={v}>{Number(v).toFixed(2)} Lot</option>)}</select></label>
                  </>}
'@ 'show dedicated ZERO GRID settings'

Replace-Required $webRef @'
                <div className="cc-bot-v2-engine-line"><ScenovaIcon name="spark" size={16}/><b>Basket Ladder อัตโนมัติ</b><span>EA กระจายจังหวะเพิ่มไม้ตาม ATR และแรงตลาด</span></div>
'@ @'
                <div className="cc-bot-v2-engine-line"><ScenovaIcon name="spark" size={16}/><b>{controlMode==="ZERO_GRID"?"ZERO GRID · Demo/Tester only":"Basket Ladder อัตโนมัติ"}</b><span>{controlMode==="ZERO_GRID"?"วางกริดสองฝั่งแบบ one-shot และปิดเมื่อ Cycle Net ถึงขั้นต่ำ":"EA กระจายจังหวะเพิ่มไม้ตาม ATR และแรงตลาด"}</span></div>
'@ 'show ZERO GRID engine description'

Replace-Required $webRef @'
                      <span>{String(settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO SMART" : settings.entryMode}</span>
'@ @'
                      <span>{String(settings.engineMode || "AUTO").toUpperCase() === "ZERO_GRID" ? "ZERO GRID" : String(settings.engineMode || "AUTO").toUpperCase() === "RACE" ? "RACE" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO SMART" : settings.entryMode}</span>
'@ 'show ZERO GRID hero chip'

Write-Utf8 $WebPath $webRef.Value

# ---------------------------------------------------------------------------
# MT5 build workflow: update the AUTO isolation sentinel and validate ZERO GRID.
# ---------------------------------------------------------------------------
$build = Read-Utf8 $BuildWorkflowPath
$buildRef = [ref]$build
Replace-Required $buildRef 'return g_engineMode != "RACE" && g_controlMode == "AUTO";' 'return g_engineMode == "AUTO" && g_controlMode == "AUTO";' 'update AUTO isolation build sentinel'
Replace-Required $buildRef @'
            'SaaSRace',
            'TradePermissionStatus',
'@ @'
            'SaaSRace',
            'bool ZeroGridModeEnabled()',
            'ZERO_GRID_DEMO_ONLY',
            'SaaSZeroGrid',
            'TradePermissionStatus',
'@ 'add ZERO GRID build sentinels'
Write-Utf8 $BuildWorkflowPath $buildRef.Value

# Contract checks ------------------------------------------------------------
$finalEa = Read-Utf8 $EaPath
$finalApi = Read-Utf8 $ApiPath
$finalWeb = Read-Utf8 $WebPath
foreach($sentinel in @(
  'bool ZeroGridModeEnabled()',
  'ACCOUNT_TRADE_MODE_DEMO',
  'ACCOUNT_MARGIN_MODE_RETAIL_HEDGING',
  'SaaSZeroGrid',
  'ZERO_GRID_CLOSING_PROFIT',
  'return g_engineMode == "AUTO" && g_controlMode == "AUTO";'
)) { if(-not $finalEa.Contains($sentinel)) { throw "EA sentinel missing: $sentinel" } }
foreach($sentinel in @('"ZERO_GRID"','zeroGridStepPrice','zeroGridMinNetProfitMoney')) { if(-not $finalApi.Contains($sentinel)) { throw "API sentinel missing: $sentinel" } }
foreach($sentinel in @('ZERO_GRID:{title:"ZERO GRID"','zeroGridLevelsPerSide','Demo/Tester only')) { if(-not $finalWeb.Contains($sentinel)) { throw "Web sentinel missing: $sentinel" } }

Write-Host "ZERO GRID V1 Demo/Tester runtime integration complete."
