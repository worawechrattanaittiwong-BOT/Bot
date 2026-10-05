// SCENOVA AUTO + VECTOR EDGE — Phase 3 Counterfactual A/B Harness
// ----------------------------------------------------------------
// Branch-only validation build. Production FastBasketBot.mq5 stays unchanged.
// Variant A remains authoritative; Variant B only classifies actual A entries.

#define OnInit  ScenovaBaseOnInit
#define OnTick  ScenovaBaseOnTick
#define OnTimer ScenovaBaseOnTimer
#include "FastBasketBot.mq5"
#undef OnInit
#undef OnTick
#undef OnTimer

#include "include\AutoVectorEdge.mqh"
#include "include\AutoVectorEdgeShadow.mqh"
#include "include\AutoVectorEdgeAB.mqh"

bool VectorEdgeHarnessRealAccount()
{
   if(MQLInfoInteger(MQL_TESTER))
      return false;
   return (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE) ==
          ACCOUNT_TRADE_MODE_REAL;
}

int OnInit()
{
   // Phase 3 harness is validation-only. Refuse accidental REAL-account use.
   if(VectorEdgeHarnessRealAccount())
   {
      Print("VECTOR EDGE A/B HARNESS BLOCKED: real account is not permitted.");
      return INIT_FAILED;
   }
   return ScenovaBaseOnInit();
}

void VectorEdgeABPostBaseEvent(const ulong orderMarkerBefore)
{
   // Other execution modes are completely outside VECTOR EDGE ownership.
   if(!AutoEnabled())
      return;

   // g_lastOrderMs changes after the successful AUTO SendMarketOrder path.
   if(g_lastOrderMs == orderMarkerBefore)
      return;

   int actualDirection = BasketDirection();
   if(actualDirection == 0)
      actualDirection = g_cachedAdaptiveDirection;

   AutoVectorEdgeABObserveActualEntry(actualDirection);
}

void OnTick()
{
   ulong orderMarkerBefore = g_lastOrderMs;
   ScenovaBaseOnTick();

   // Post-processing only; the base tick has already completed its decisions.
   VectorEdgeABPostBaseEvent(orderMarkerBefore);
}

void OnTimer()
{
   ulong orderMarkerBefore = g_lastOrderMs;

   // Existing timer logic always runs first and remains authoritative.
   ScenovaBaseOnTimer();

   // Outside AUTO, do nothing beyond the unchanged base engine.
   if(!AutoEnabled())
      return;

   AutoVectorEdgeShadowObserve();
   VectorEdgeABPostBaseEvent(orderMarkerBefore);
}
