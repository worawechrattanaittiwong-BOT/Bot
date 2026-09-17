// SCENOVA AUTO + VECTOR EDGE — Phase 2 Shadow Harness
// ----------------------------------------------------
// This is a branch-only observation build. It deliberately leaves
// FastBasketBot.mq5 unchanged.
//
// Safety design:
// 1) The production EA is included unchanged.
// 2) Only OnTimer is wrapped.
// 3) The original OnTimer runs FIRST and preserves all existing behavior.
// 4) VECTOR EDGE runs AFTERWARD and only reads AUTO V20 diagnostics.
// 5) VECTOR EDGE output is written to the Experts/Tester log only.
// 6) No VECTOR EDGE value is fed back into trading decisions.
//
// DO NOT publish this harness as the normal production EA until shadow
// telemetry has been reviewed and an explicit later rollout is approved.

#define OnTimer ScenovaBaseOnTimer
#include "FastBasketBot.mq5"
#undef OnTimer

#include "include\AutoVectorEdgeV1.mqh"
#include "include\AutoVectorEdgeShadowV1.mqh"

void OnTimer()
{
   // Preserve the exact base timer execution order first.
   ScenovaBaseOnTimer();

   // Read-only post-processing. This function has no trade actions.
   AutoVectorEdgeShadowObserve();
}
