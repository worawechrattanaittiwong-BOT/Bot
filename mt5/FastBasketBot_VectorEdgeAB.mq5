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

#include "include\AutoVectorEdgeV1.mqh"
#include "include\AutoVectorEdgeShadowV1.mqh"
#include "include\AutoVectorEdgeABV1.mqh"

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
   // g_lastOrderMs is changed by RegisterOrderRequest() after a successful AUTO
   // SendMarketOrder path. Therefore this observes actual A execution, not just
   // a non-zero cached direction/decision candidate.
   if(g_lastOrderMs == orderMarkerBefore || !AutoV20Enabled())
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
   VectorEdgeABPostBaseEvent(orderMarkerBefore);
}

void OnTimer()
{
   ulong orderMarkerBefore = g_lastOrderMs;

   // Existing timer logic always runs first and remains authoritative.
   ScenovaBaseOnTimer();

   // Phase 2 read-only snapshot/logging.
   AutoVectorEdgeShadowObserve();

   // Phase 3 only reacts if the base event actually registered an order.
   VectorEdgeABPostBaseEvent(orderMarkerBefore);
}
