// SCENOVA AUTO + VECTOR EDGE — Phase 3 Counterfactual A/B Harness
// ----------------------------------------------------------------
// Variant A remains the unchanged production AUTO behavior.
// Variant B is observation-only and can only classify A decisions as
// KEEP or WOULD_BLOCK. It cannot create, suppress, resize, or close trades.
//
// This file is branch-only and must not replace FastBasketBot.mq5.

#define OnTimer ScenovaBaseOnTimer
#include "FastBasketBot.mq5"
#undef OnTimer

#include "include\AutoVectorEdgeV1.mqh"
#include "include\AutoVectorEdgeShadowV1.mqh"
#include "include\AutoVectorEdgeABV1.mqh"

void OnTimer()
{
   // Existing engine always executes first and remains authoritative.
   ScenovaBaseOnTimer();

   // Phase 2 read-only snapshot/logging.
   AutoVectorEdgeShadowObserve();

   // Phase 3 counterfactual classification only.
   // This observer never feeds its decision back into execution.
   AutoVectorEdgeABObserve();
}
