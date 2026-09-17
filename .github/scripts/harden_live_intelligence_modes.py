from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def patch(rel, old, new, expected=1):
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{rel}: expected {expected}, found {count}: {old[:120]!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


EA = "mt5/FastBasketBot.mq5"
LIVE = "mt5/include/LiveExecutionModesV1.mqh"

# PARALLEL_UNIVERSE uses the exact AUTO V20 order plan (planned lot + bound
# entry/SL/TP), while FLIP_LOCK intentionally uses its own one-position dynamic
# stop path so a reopen can preserve the previous leg's volume.
patch(
    EA,
    '   bool autoV20=AutoV20Enabled() && !g_tacticalCountertrendActive;',
    '   bool autoV20=(AutoV20Enabled() || g_controlMode=="PARALLEL_UNIVERSE") &&\n'
    '      !g_tacticalCountertrendActive;'
)

patch(
    EA,
    '   request.comment = autoV20\n'
    '      ? "SaaSAutoV20"\n'
    '      : (g_engineMode == "RACE"\n'
    '      ? "SaaSRace"\n'
    '      : (g_tacticalCountertrendActive ? "SaaSTactical" : "SaaSBasket"));',
    '   request.comment = g_controlMode=="FLIP_LOCK"\n'
    '      ? "SaaSFlipLock"\n'
    '      : (g_controlMode=="PARALLEL_UNIVERSE"\n'
    '      ? "SaaSParallelUniverse"\n'
    '      : (autoV20\n'
    '      ? "SaaSAutoV20"\n'
    '      : (g_engineMode == "RACE"\n'
    '      ? "SaaSRace"\n'
    '      : (g_tacticalCountertrendActive ? "SaaSTactical" : "SaaSBasket"))));'
)

# A live intelligence owner never takes over an existing basket from another
# owner, and an existing intelligence-owned position is never handed to AUTO/
# RACE/ZERO mid-cycle. Server settings are retried on every heartbeat and apply
# automatically once the EA is flat.
patch(
    EA,
    '   // Hard isolation: one execution owner at a time. controlMode is authoritative\n'
    '   // when both are present; partial/legacy payloads are normalized immediately.\n'
    '   if(hasControlMode)\n'
    '   {',
    '   // Hard isolation: one execution owner at a time. controlMode is authoritative\n'
    '   // when both are present; partial/legacy payloads are normalized immediately.\n'
    '   bool requestedIntelligenceMode = requestedControlMode=="FLIP_LOCK" ||\n'
    '      requestedControlMode=="PARALLEL_UNIVERSE";\n'
    '   bool currentIntelligenceMode = g_controlMode=="FLIP_LOCK" ||\n'
    '      g_controlMode=="PARALLEL_UNIVERSE";\n'
    '   bool intelligenceOwnerChange = hasControlMode &&\n'
    '      requestedControlMode!=g_controlMode &&\n'
    '      (requestedIntelligenceMode || currentIntelligenceMode);\n'
    '   bool intelligenceExposure = BasketPositionCount()>0 ||\n'
    '      RescuePositionCount()>0 || ZeroGridPositionCount()>0 ||\n'
    '      ZeroGridPendingCount()>0;\n'
    '   bool deferIntelligenceOwnerChange = intelligenceOwnerChange && intelligenceExposure;\n'
    '   if(deferIntelligenceOwnerChange)\n'
    '   {\n'
    '      g_executionStatus="MODE_CHANGE_WAIT_FLAT";\n'
    '   }\n'
    '   else if(hasControlMode)\n'
    '   {'
)

patch(
    EA,
    '   if(hasControlMode || hasEngineMode)\n'
    '      g_settingsSynchronized = true;',
    '   if((hasControlMode || hasEngineMode) && !deferIntelligenceOwnerChange)\n'
    '      g_settingsSynchronized = true;'
)

# Once FLIP LOCK has armed a protected-profit line, a fast reversal must still
# be processed even when current floating profit falls back below the original
# arming threshold.
patch(
    LIVE,
    'double g_flipLockPendingLot = 0.0;\n'
    'ulong  g_flipLockLastActionMs = 0;',
    'double g_flipLockPendingLot = 0.0;\n'
    'bool   g_flipLockArmed = false;\n'
    'ulong  g_flipLockLastActionMs = 0;'
)
patch(
    LIVE,
    '   g_flipLockPendingLot=0.0;\n'
    '   g_flipLockLastActionMs=0;',
    '   g_flipLockPendingLot=0.0;\n'
    '   g_flipLockArmed=false;\n'
    '   g_flipLockLastActionMs=0;'
)
patch(
    LIVE,
    '      g_flipLockExtremePrice=0.0;\n'
    '      g_flipLockTriggerPrice=0.0;\n'
    '      g_flipLockLastActionMs=GetTickCount64();',
    '      g_flipLockExtremePrice=0.0;\n'
    '      g_flipLockTriggerPrice=0.0;\n'
    '      g_flipLockArmed=false;\n'
    '      g_flipLockLastActionMs=GetTickCount64();'
)
patch(
    LIVE,
    '   if(cycleProfit<protectedProfit)\n'
    '   {\n'
    '      g_flipLockState="ACTIVE_WAIT_PROFIT";\n'
    '      g_executionStatus="FLIP_LOCK_WAIT_PROFIT";\n'
    '      return true;\n'
    '   }\n\n'
    '   double distance=FlipLockDistancePoints()*_Point;',
    '   if(!g_flipLockArmed && cycleProfit<protectedProfit)\n'
    '   {\n'
    '      g_flipLockState="ACTIVE_WAIT_PROFIT";\n'
    '      g_executionStatus="FLIP_LOCK_WAIT_PROFIT";\n'
    '      return true;\n'
    '   }\n'
    '   if(cycleProfit>=protectedProfit)\n'
    '      g_flipLockArmed=true;\n\n'
    '   double distance=FlipLockDistancePoints()*_Point;'
)

print("LIVE_INTELLIGENCE_MODES_HARDEN_OK")
