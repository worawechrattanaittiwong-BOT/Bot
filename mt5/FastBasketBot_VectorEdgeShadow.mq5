// SCENOVA AUTO + VECTOR EDGE — Phase 2 Shadow Harness
// ----------------------------------------------------
// Branch-only observation build. Production FastBasketBot.mq5 stays unchanged.
// The base engine executes first; VECTOR EDGE only reads AUTO V20 afterward.

#define OnInit  ScenovaBaseOnInit
#define OnTimer ScenovaBaseOnTimer
#include "FastBasketBot.mq5"
#undef OnInit
#undef OnTimer

#include "include\AutoVectorEdgeV1.mqh"
#include "include\AutoVectorEdgeShadowV1.mqh"

bool VectorEdgeShadowHarnessRealAccount()
{
   if(MQLInfoInteger(MQL_TESTER))
      return false;
   return (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE) ==
          ACCOUNT_TRADE_MODE_REAL;
}

int OnInit()
{
   // Shadow validation must never be attached accidentally to a REAL account.
   if(VectorEdgeShadowHarnessRealAccount())
   {
      Print("VECTOR EDGE SHADOW HARNESS BLOCKED: real account is not permitted.");
      return INIT_FAILED;
   }
   return ScenovaBaseOnInit();
}

void OnTimer()
{
   // Preserve the exact base timer execution order first.
   ScenovaBaseOnTimer();

   // Hard wrapper boundary: other modes run only the unchanged base engine.
   if(!AutoV20Enabled())
      return;

   AutoVectorEdgeShadowObserve();
}
