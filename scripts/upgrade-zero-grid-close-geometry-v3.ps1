param(
  [Parameter(Mandatory = $false)][string]$EaPath = "mt5\FastBasketBot.mq5",
  [Parameter(Mandatory = $false)][string]$WebPath = "apps\web\app\dashboard\page.tsx"
)

$ErrorActionPreference = "Stop"
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Read-Text([string]$path) {
  if (-not (Test-Path $path)) { throw "File not found: $path" }
  return [System.IO.File]::ReadAllText((Resolve-Path $path))
}

function Write-Lf([string]$path,[string]$text) {
  $normalized = $text.Replace("`r`n","`n").Replace("`r","`n")
  [System.IO.File]::WriteAllText((Resolve-Path $path),$normalized,$utf8)
}

function Replace-Required([ref]$textRef,[string]$old,[string]$new,[string]$label) {
  if ($textRef.Value.Contains($new)) {
    Write-Host "$label already applied"
    return
  }
  if (-not $textRef.Value.Contains($old)) { throw "Patch anchor not found: $label" }
  $textRef.Value = $textRef.Value.Replace($old,$new)
  Write-Host "Applied $label"
}

function Replace-IfPresent([ref]$textRef,[string]$old,[string]$new,[string]$label) {
  if ($textRef.Value.Contains($new)) {
    Write-Host "$label already applied"
    return
  }
  if ($textRef.Value.Contains($old)) {
    $textRef.Value = $textRef.Value.Replace($old,$new)
    Write-Host "Applied $label"
    return
  }
  Write-Host "$label skipped (anchor not present)"
}

$ea = Read-Text $EaPath
$ea = $ea.Replace("`r`n","`n").Replace("`r","`n")
$eaRef = [ref]$ea

Replace-IfPresent $eaRef '#property version   "1.0.2"' '#property version   "1.0.3"' 'EA version 1.0.3'
Replace-IfPresent $eaRef '#define SCENOVA_EA_VERSION "1.0.2"' '#define SCENOVA_EA_VERSION "1.0.3"' 'runtime version 1.0.3'
Replace-IfPresent $eaRef '#define SCENOVA_PRODUCT_VERSION "1.0.2"' '#define SCENOVA_PRODUCT_VERSION "1.0.3"' 'product version 1.0.3'

$oldSpacing = @'
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
'@

$newSpacing = @'
// ZERO GRID V2.1 geometry: the first entry hugs the live market at the broker-safe
// Stops/Freeze boundary, while the configured Grid Step is reserved for spacing
// BETWEEN levels. This avoids compressed/duplicate pending prices when price moves.
double ZeroGridEffectiveStepPrice()
{
   double tick=ZeroGridTickSize();
   double requested=MathMax(g_zeroGridStepPrice,tick);
   double units=MathCeil((requested/tick)-1e-10);
   return NormalizeDouble(units*tick,_Digits);
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
   double existing=ZeroGridExistingPendingAnchorPrice(buySide);
   if(existing>0.0) return existing;

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick)) return 0.0;

   // Opening geometry "hubs inward": level 1 sits as close to live price as
   // the broker permits, with one extra tick of safety beyond Stops/Freeze.
   double entryBuffer=ZeroGridMinPendingDistancePrice()+ZeroGridTickSize();
   double raw=buySide ? tick.ask+entryBuffer : tick.bid-entryBuffer;
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
'@
Replace-Required $eaRef $oldSpacing $newSpacing 'ZERO GRID inward entry geometry and even spacing'

$oldSendPrice = @'
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
'@

$newSendPrice = @'
   double price=ZeroGridPendingLevelPrice(buySide,level);
   if(price<=0.0)
   {
      g_executionStatus="ZERO_GRID_WAIT_TICK";
      return false;
   }
'@
Replace-Required $eaRef $oldSendPrice $newSendPrice 'ZERO GRID broker-safe evenly spaced pending placement'

$oldClose = @'
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
'@

$newClose = @'
// Profit exit geometry "hubs outward": on Hedging accounts close one owned
// position at a time, starting with the profitable ticket nearest live price,
// then progressively moving farther away. Netting naturally has one symbol
// position, so the same routine remains compatible there.
ulong ZeroGridNearestCloseTicket()
{
   MqlTick tick;
   bool hasTick=SymbolInfoTick(_Symbol,tick);
   double mid=hasTick ? (tick.bid+tick.ask)*0.5 : 0.0;
   double tolerance=MathMax(ZeroGridTickSize()*0.5,_Point*0.5);
   ulong bestTicket=0;
   int bestProfitRank=99;
   double bestDistance=1.0e100;
   double bestOpenPrice=-1.0e100;

   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;

      double openPrice=PositionGetDouble(POSITION_PRICE_OPEN);
      double floating=PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP);
      int profitRank=floating>=0.0 ? 0 : 1;
      double distance=hasTick ? MathAbs(openPrice-mid) : 0.0;

      bool better=false;
      if(bestTicket==0 || profitRank<bestProfitRank)
         better=true;
      else if(profitRank==bestProfitRank)
      {
         if(distance<bestDistance-tolerance)
            better=true;
         else if(MathAbs(distance-bestDistance)<=tolerance && openPrice>bestOpenPrice)
            better=true;
      }

      if(better)
      {
         bestTicket=ticket;
         bestProfitRank=profitRank;
         bestDistance=distance;
         bestOpenPrice=openPrice;
      }
   }
   return bestTicket;
}

void ZeroGridClosePositions()
{
   ulong ticket=ZeroGridNearestCloseTicket();
   if(ticket==0) return;
   ClosePositionByTicket(ticket);
}
'@
Replace-Required $eaRef $oldClose $newClose 'ZERO GRID nearest-price outward close sequence'

Write-Lf $EaPath $eaRef.Value

$web = Read-Text $WebPath
$web = $web.Replace("`r`n","`n").Replace("`r","`n")
$webRef = [ref]$web
Replace-IfPresent $webRef 'ค่าเริ่มต้น 3.00 หน่วยราคา · ระบบปรับขั้นต่ำตาม Tick/Stops Level ของ Symbol' 'ระยะระหว่างระดับ · ไม้แรกหุบเข้าชิดราคาตาม Stops/Freeze และทุกระดับเว้นช่องไฟตาม Tick Size' 'ZERO GRID spacing help'
Replace-IfPresent $webRef 'Demo/Real · Hedging/Netting · ปรับ Tick, Stops Level และ Lot Step ตามโบรกเกอร์อัตโนมัติ' 'Demo/Real · เปิด Grid หุบเข้าชิดราคา · ปิดจากไม้ใกล้ราคาไล่ออก · รองรับ Hedging/Netting' 'ZERO GRID inward/outward engine detail'
Write-Lf $WebPath $webRef.Value

Write-Host 'ZERO GRID V2.1 inward-entry / nearest-out close geometry upgrade complete.'
