from pathlib import Path


def replace_between(text: str, start: str, end: str, replacement: str) -> str:
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"start marker missing: {start}")
    b = text.find(end, a + len(start))
    if b < 0:
        raise SystemExit(f"end marker missing: {end}")
    return text[:a] + replacement.rstrip() + "\n\n" + text[b:]


ea_path = Path("mt5/FastBasketBot.mq5")
ea = ea_path.read_text(encoding="utf-8")

if '#property version   "1.0.17"' in ea and 'ZERO_SIMPLE_STABLE_V117' in ea:
    print("ZERO v1.0.17 already applied")
else:
    for old, new in [
        ('#property version   "1.0.16"', '#property version   "1.0.17"'),
        ('#define SCENOVA_EA_VERSION "1.0.16"', '#define SCENOVA_EA_VERSION "1.0.17"'),
        ('#define SCENOVA_PRODUCT_VERSION "1.0.16"', '#define SCENOVA_PRODUCT_VERSION "1.0.17"'),
    ]:
        if old not in ea:
            raise SystemExit(f"version marker missing: {old}")
        ea = ea.replace(old, new, 1)

    # ZERO placement must not inherit any AUTO/RACE order-rate gate. The broker
    # itself remains the authority for valid price, stops, volume and trade state.
    rate_start = ea.find("      // ZERO is a dedicated pending-order engine.")
    if rate_start >= 0:
        rate_end = ea.find("\n\n      MqlTick live;", rate_start)
        if rate_end < 0:
            raise SystemExit("ZERO rate-limit block end missing")
        ea = ea[:rate_start] + (
            "      // ZERO_SIMPLE_STABLE_V117: no strategy/rate gate decides whether a\n"
            "      // configured pending level may be placed. Broker validity checks below\n"
            "      // are execution requirements, not market/trend filters."
        ) + ea[rate_end:]

    ensure = r'''bool ZeroGridEnsureLadder()
{
   if(g_zeroGridCenter<=0.0)
      return false;

   int positions=ZeroGridPositionCount();
   int levels=ZeroGridEffectiveLevelsPerSide();

   // ZERO_SIMPLE_STABLE_V117
   // Flat cycle = one simple job: make the configured BUY STOP and SELL STOP
   // ladder complete. Keep every accepted correct pending order and retry only
   // the missing/invalid side. Never tear down a good side just because the
   // broker was slower on its mate.
   if(positions==0)
   {
      for(int level=1;level<=levels;level++)
      {
         double expected=NormalizeTradeVolume(ZeroGridEffectiveBaseLot()*level);
         double volumeStep=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
         double tolerance=MathMax(0.0000001,volumeStep*0.25);
         double buyVolume=ZeroGridPendingLevelVolume(true,level);
         double sellVolume=ZeroGridPendingLevelVolume(false,level);

         if(buyVolume>0.0 && MathAbs(buyVolume-expected)>tolerance)
         {
            ZeroGridCancelPendingLevel(true,level);
            buyVolume=0.0;
         }
         if(sellVolume>0.0 && MathAbs(sellVolume-expected)>tolerance)
         {
            ZeroGridCancelPendingLevel(false,level);
            sellVolume=0.0;
         }

         if(buyVolume<=0.0)
            ZeroGridSendPending(true,level);
         if(sellVolume<=0.0)
            ZeroGridSendPending(false,level);
      }

      if(ZeroGridPendingCount()!=levels*2)
      {
         g_executionStatus="ZERO_GRID_BUILDING";
         return false;
      }
      for(int level=1;level<=levels;level++)
      {
         if(!ZeroGridFlatLevelPairValid(level))
         {
            g_executionStatus="ZERO_GRID_BUILDING";
            return false;
         }
      }
      return true;
   }

   // Active cycle: a filled level is never recreated. ZeroGridLevelExists()
   // already treats live positions and cycle history as consumed levels. Only
   // a genuinely missing, still-unfilled pending level is repaired.
   bool complete=true;
   for(int level=1;level<=levels;level++)
   {
      if(!ZeroGridLevelExists(true,level))
         if(!ZeroGridSendPending(true,level)) complete=false;
      if(!ZeroGridLevelExists(false,level))
         if(!ZeroGridSendPending(false,level)) complete=false;
   }
   return complete;
}'''
    ea = replace_between(ea, "bool ZeroGridEnsureLadder()", "void ZeroGridCancelPendingSide", ensure)

    start = r'''bool StartZeroGridCycle()
{
   if(!ZeroGridModeEnabled())
      return false;

   // ZERO has no trend, momentum, confidence, ATR, session, spread or heartbeat
   // freshness entry filter. Only explicit RUN/access and real broker ability
   // to trade are allowed to stop a new pending ladder.
   if(g_state!=STATE_RUNNING || !g_access)
   {
      g_executionStatus="ZERO_GRID_STOPPED";
      return true;
   }
   if(!ZeroGridHedgingAllowed())
   {
      ZeroGridCancelPending();
      g_executionStatus="ZERO_GRID_HEDGING_REQUIRED";
      return true;
   }
   string permissionStatus=TradePermissionStatus();
   if(permissionStatus!="OK")
   {
      g_executionStatus=permissionStatus;
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
      // A new cycle always starts from one fresh center and locks only the ZERO
      // settings that define the pending ladder. Nothing from AUTO/RACE is read.
      if(ZeroGridPendingCount()>0)
         ZeroGridCancelPending();

      MqlTick tick;
      if(!SymbolInfoTick(_Symbol,tick))
      {
         g_executionStatus="ZERO_GRID_WAIT_TICK";
         return true;
      }

      double mid=(tick.bid+tick.ask)*0.5;
      g_zeroGridCenter=ZeroGridNormalizeCenterPrice(mid);
      g_zeroGridStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);
      g_zeroGridCycleStartedAt=TimeCurrent();
      g_zeroGridClosing=false;
      g_zeroGridLastExitBurstMs=0;
      g_zeroGridCycleStepPrice=MathMax(ZeroGridTickSize(),ZeroGridAllowedStep(g_zeroGridStepPrice));
      g_zeroGridCycleLevelsPerSide=(int)MathMax(1.0,MathMin((double)ZERO_GRID_MAX_LEVELS,(double)g_zeroGridLevelsPerSide));
      g_zeroGridCycleBaseLot=MathMax(0.01,g_zeroGridBaseLot);
      g_orderWindowStart=TimeCurrent();
      g_ordersInWindow=0;
      SaveZeroGridCycleState();
   }

   bool ready=ZeroGridEnsureLadder();
   g_executionStatus=ready ? "ZERO_GRID_READY" : "ZERO_GRID_BUILDING";
   return true;
}'''
    ea = replace_between(ea, "bool StartZeroGridCycle()", "bool ManageZeroGrid()", start)

    manage = r'''bool ManageZeroGrid()
{
   LoadZeroGridCycleState();
   int positions=ZeroGridPositionCount();
   int pending=ZeroGridPendingCount();

   // Once profit close begins, finish it first. When the account is flat,
   // immediately reset and build the next ZERO pending ladder in the same
   // runtime path. The 200 ms timer also calls this path, so rearm does not
   // depend on receiving another market tick.
   if(g_zeroGridClosing)
   {
      ZeroGridClosePositions();
      if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)
      {
         ResetZeroGridCycleState();
         if(ZeroGridModeEnabled() && g_state==STATE_RUNNING && g_access &&
            ZeroGridHedgingAllowed() && TradePermissionStatus()=="OK")
         {
            g_executionStatus="ZERO_GRID_REARMING";
            return StartZeroGridCycle();
         }
         g_executionStatus="ZERO_GRID_STOPPED_FLAT";
      }
      return true;
   }

   // Explicit mode exit / Stop / revoked access stops NEW pending triggers.
   // Existing ZERO positions are not mixed into another engine; they are kept
   // isolated and may close only when their ZERO net-profit close condition is met.
   if(!ZeroGridModeEnabled() || g_state!=STATE_RUNNING || !g_access)
   {
      ZeroGridCancelPending();
      positions=ZeroGridPositionCount();
      if(positions<=0)
      {
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_STOPPED_FLAT";
         return true;
      }
      if(ZeroGridCycleNet()>=ZeroGridRequiredCloseNet())
      {
         g_zeroGridClosing=true;
         SaveZeroGridCycleState();
         g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
         ZeroGridClosePositions();
      }
      else
         g_executionStatus="ZERO_GRID_SAFE_DRAIN";
      return true;
   }

   if(!ZeroGridHedgingAllowed())
   {
      ZeroGridCancelPending();
      g_executionStatus="ZERO_GRID_HEDGING_REQUIRED";
      return true;
   }
   string permissionStatus=TradePermissionStatus();
   if(permissionStatus!="OK")
   {
      g_executionStatus=permissionStatus;
      return true;
   }
   if(!ZeroGridStopOrdersSupported())
   {
      g_executionStatus="ZERO_GRID_STOP_ORDERS_UNSUPPORTED";
      return true;
   }

   // Fresh runtime or a fully empty cycle: start/recenter immediately.
   if(g_zeroGridCenter<=0.0 || (positions==0 && pending==0))
   {
      if(positions==0 && pending==0 && g_zeroGridCenter>0.0)
         ResetZeroGridCycleState();
      return StartZeroGridCycle();
   }

   // The only trading decision inside ZERO: close the ZERO cycle when its own
   // configured real net-profit target is reached. No market opinion is used.
   if(positions>0 && ZeroGridCycleNet()>=ZeroGridRequiredCloseNet())
   {
      g_zeroGridClosing=true;
      SaveZeroGridCycleState();
      g_executionStatus="ZERO_GRID_CLOSING_PROFIT";
      ZeroGridClosePositions();
      if(ZeroGridPositionCount()==0 && ZeroGridPendingCount()==0)
      {
         ResetZeroGridCycleState();
         g_executionStatus="ZERO_GRID_REARMING";
         return StartZeroGridCycle();
      }
      return true;
   }

   bool ladderReady=ZeroGridEnsureLadder();
   if(positions>0)
      g_executionStatus="ZERO_GRID_ACTIVE";
   else
      g_executionStatus=ladderReady ? "ZERO_GRID_READY" : "ZERO_GRID_BUILDING";
   return true;
}'''
    ea = replace_between(ea, "bool ManageZeroGrid()", "// Brain V17 RACE", manage)

    ea_path.write_text(ea, encoding="utf-8")

# Release metadata follows the EA runtime version.
release_path = Path("apps/api/src/release-version.ts")
release = release_path.read_text(encoding="utf-8")
release = release.replace('export const DEFAULT_EA_VERSION = "1.0.16";', 'export const DEFAULT_EA_VERSION = "1.0.17";')
release_path.write_text(release, encoding="utf-8")

# Update legacy ZERO tests so they protect the simple implementation instead of
# forcing the v1.0.16 atomic rollback behavior back into the runtime.
sim_path = Path("tests/zero-grid-v1-simulation.mjs")
sim = sim_path.read_text(encoding="utf-8")
sim = sim.replace('assert.match(ea, /ZERO_PAIR_ATOMIC_V116/, "flat ZERO ladder must be atomic BUY\\/SELL pairs");\nassert.match(ea, /ZERO_GRID_PAIR_ROLLBACK/, "one-sided accepted pair must roll back");', 'assert.match(ea, /ZERO_SIMPLE_STABLE_V117/, "ZERO must use the simple stable pending engine");\nassert.doesNotMatch(ea, /ZERO_GRID_PAIR_ROLLBACK/, "ZERO must not churn accepted orders with pair rollback");')
sim_path.write_text(sim, encoding="utf-8")

close_path = Path("tests/zero-grid-close-geometry-contract.ps1")
close = close_path.read_text(encoding="utf-8")
close = close.replace('#property version   \\"1.0.16\\"', '#property version   \\"1.0.17\\"')
close = close.replace("'ZERO_PAIR_ATOMIC_V116' 'flat ladder requires exact BUY/SELL pairs'", "'ZERO_SIMPLE_STABLE_V117' 'simple stable ZERO pending engine'")
close_path.write_text(close, encoding="utf-8")

# The official build guard must check the new runtime contract, not retired
# first-pair/rollback markers.
build_path = Path(".github/workflows/build-mt5-ea.yml")
build = build_path.read_text(encoding="utf-8")
build = build.replace('# Release metadata trigger: EA v1.0.15 loaded-runtime + ZERO settings contract.', '# Release metadata trigger: EA v1.0.17 simple stable ZERO pending runtime.')
build = build.replace("            'ZERO_GRID_RETRY_MISSING_L1',\n", "            'ZERO_SIMPLE_STABLE_V117',\n")
build = build.replace("            'ZERO_GRID_WAIT_FIRST_PAIR',\n", "            'ZERO_GRID_READY',\n")
build = build.replace("            'ZERO_GRID_REBUILD_MISSING_L1',\n", "            'ZERO_GRID_BUILDING',\n")
build = build.replace("            'for(int level=2;level<=levels;level++)',\n", "            'for(int level=1;level<=levels;level++)',\n")
build_path.write_text(build, encoding="utf-8")

print("Applied ZERO simple stable v1.0.17")
