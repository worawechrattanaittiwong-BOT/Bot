from pathlib import Path
import re

EA = Path("mt5/FastBasketBot.mq5")
TEST = Path("tests/zero-grid-close-geometry-contract.ps1")

text = EA.read_text(encoding="utf-8")

# Version bump is required whenever the MT5 source changes. Release publication
# stays disabled on this branch; this only identifies the candidate runtime.
for old, new in [
    ('#property version   "1.0.12"', '#property version   "1.0.13"'),
    ('#define SCENOVA_EA_VERSION "1.0.12"', '#define SCENOVA_EA_VERSION "1.0.13"'),
    ('#define SCENOVA_PRODUCT_VERSION "1.0.12"', '#define SCENOVA_PRODUCT_VERSION "1.0.13"'),
]:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f"missing version anchor: {old}")
    text = text.replace(old, new, 1)

# 1) Preserve a successfully placed first-side L1 while retrying only the side
# that is missing. The old logic cancelled the successful side and rebuilt both,
# which created visible place/cancel/place churn and extra broker round-trips.
first_pair_pattern = re.compile(
    r"   // Stage the trigger pair FIRST\..*?(?=   bool firstPairReady=)",
    re.S,
)
first_pair_replacement = r'''   // Stage the trigger pair FIRST. On a flat cycle preserve any L1 that
   // the broker already accepted and retry ONLY the missing side. This avoids
   // place -> cancel -> recenter -> place churn when one side is accepted a few
   // hundred milliseconds before the other side.
   if(needBuy && needSell && ZeroGridPositionCount()==0)
   {
      bool pairReady=
         ZeroGridLevelExists(true,1) && ZeroGridLevelExists(false,1);

      for(int pairAttempt=0;pairAttempt<3 && !pairReady;pairAttempt++)
      {
         bool buyReady=ZeroGridLevelExists(true,1);
         bool sellReady=ZeroGridLevelExists(false,1);

         if(!buyReady)
         {
            attemptsThisPass++;
            ZeroGridSendPending(true,1);
         }
         if(!sellReady)
         {
            attemptsThisPass++;
            ZeroGridSendPending(false,1);
         }

         buyReady=ZeroGridLevelExists(true,1);
         sellReady=ZeroGridLevelExists(false,1);
         pairReady=buyReady && sellReady;
         if(!pairReady)
            g_executionStatus="ZERO_GRID_RETRY_MISSING_L1";
      }

      if(!pairReady)
      {
         g_executionStatus="ZERO_GRID_WAIT_FIRST_PAIR";
         return false;
      }
   }
   else
   {
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
   }

'''
text, n = first_pair_pattern.subn(first_pair_replacement, text, count=1)
if n != 1:
    raise SystemExit(f"first-pair patch count={n}, expected 1")

# 2) Profit close order: smallest lot first (0.02 -> 0.04 -> 0.06 ...).
# For equal lot sizes, preserve the previous safety preference: profitable first,
# then nearest-to-live price, then deterministic ticket order.
close_selector_pattern = re.compile(
    r"// Profit exit geometry:.*?return bestTicket;\n}\n\n(?=void ZeroGridClosePositions\(\))",
    re.S,
)
close_selector_replacement = r'''// Profit exit geometry: close the smallest owned lot first so a ZERO basket
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

'''
text, n = close_selector_pattern.subn(close_selector_replacement, text, count=1)
if n != 1:
    raise SystemExit(f"close-selector patch count={n}, expected 1")

# Guardrails: the normal-cycle rearm remains same-pass and synchronous; do not
# introduce async trade requests or touch AUTO/RACE execution paths.
required = [
    'g_executionStatus="ZERO_GRID_REARMING";',
    'return StartZeroGridCycle();',
    'const int maxCloseRequestsPerPass=8;',
    'ZERO_GRID_RETRY_MISSING_L1',
    'double bestVolume=1.0e100;',
    'volume<bestVolume-lotTolerance',
]
for needle in required:
    if needle not in text:
        raise SystemExit(f"missing post-patch guard: {needle}")
if 'OrderSendAsync' in text:
    raise SystemExit("unsafe scope expansion: OrderSendAsync found")
if 'ZERO_GRID_RETRY_FIRST_PAIR' in text:
    raise SystemExit("obsolete destructive first-pair retry still present")

EA.write_text(text, encoding="utf-8", newline="\n")

# Extend the contract that CI already runs. This stays ZERO-only and makes the
# no-churn + small-lot-first behavior regression-protected.
test = TEST.read_text(encoding="utf-8")
old = """Require-Contains $ea 'ulong ZeroGridNearestCloseTicket()' 'nearest-price close selector'\nRequire-Contains $ea 'int profitRank=floating>=0.0 ? 0 : 1;' 'profitable tickets close first'\nRequire-Contains $ea 'MathAbs(openPrice-mid)' 'distance-from-live-price close ordering'\nRequire-Contains $ea 'ClosePositionByTicket(ticket);' 'selected ticket close'\n"""
new = """Require-Contains $ea 'ulong ZeroGridNearestCloseTicket()' 'ZERO close selector'\nRequire-Contains $ea 'double bestVolume=1.0e100;' 'smallest-lot close priority'\nRequire-Contains $ea 'volume<bestVolume-lotTolerance' 'ascending lot close ordering'\nRequire-Contains $ea 'int profitRank=floating>=0.0 ? 0 : 1;' 'same-lot profitable-ticket tie-break'\nRequire-Contains $ea 'MathAbs(openPrice-livePrice)' 'same-lot nearest-price tie-break'\nRequire-Contains $ea 'ZERO_GRID_RETRY_MISSING_L1' 'retry only missing first-side trigger'\nRequire-NotContains $ea 'ZERO_GRID_RETRY_FIRST_PAIR' 'destructive first-pair cancel/rebuild loop'\nRequire-Contains $ea 'ClosePositionByTicket(ticket);' 'selected ticket close'\n"""
if new not in test:
    if old not in test:
        raise SystemExit("test contract anchor not found")
    test = test.replace(old, new, 1)
TEST.write_text(test, encoding="utf-8", newline="\n")

print("ZERO fast-rearm / small-lot-first patch applied")
