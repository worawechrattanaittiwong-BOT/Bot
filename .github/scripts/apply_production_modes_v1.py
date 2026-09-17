from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def patch(path: str, old: str, new: str, count: int = 1):
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    found = text.count(old)
    if found != count:
        raise SystemExit(f"{path}: expected {count} occurrence(s), found {found}: {old[:100]!r}")
    p.write_text(text.replace(old, new, count), encoding="utf-8")


def append_after(path: str, anchor: str, addition: str):
    patch(path, anchor, anchor + addition)


# ---------------------------------------------------------------------------
# EA release identity: force installed runtime to match the new production brain.
# ---------------------------------------------------------------------------
patch("mt5/FastBasketBot.mq5", '#property version   "1.0.23"', '#property version   "1.0.24"')
patch("mt5/FastBasketBot.mq5", '#define SCENOVA_EA_VERSION "1.0.23"', '#define SCENOVA_EA_VERSION "1.0.24"')
patch("mt5/FastBasketBot.mq5", '#define SCENOVA_PRODUCT_VERSION "1.0.23"', '#define SCENOVA_PRODUCT_VERSION "1.0.24"')
patch("mt5/FastBasketBot.mq5", '#define SCENOVA_RUNTIME_CONTRACT "RACE_VOLUME_10S_ROLLOVER_V1"', '#define SCENOVA_RUNTIME_CONTRACT "VECTOR_FLIP_PARALLEL_V1"')
append_after(
    "mt5/FastBasketBot.mq5",
    '#property description "Use Demo and forward testing before live trading."\n',
    '\n#include "include\\AutoVectorEdgeV1.mqh"\n'
)

# New mode settings. Defaults are deliberately conservative.
append_after(
    "mt5/FastBasketBot.mq5",
    'input double          InpZeroGridCloseReserveMoney = 0.20;\n',
    '''\n// FLIP LOCK: one position, lock a profitable move, then reverse only after\n// a confirmed giveback from the cycle peak. No martingale or averaging.\ninput double          InpFlipLockMinProfitMoney = 1.00;\ninput double          InpFlipLockGivebackMoney  = 0.30;\ninput int             InpFlipLockMaxFlips       = 3;\ninput int             InpFlipLockCooldownSeconds = 10;\n// PARALLEL UNIVERSE: empirical-history gate over the shared AUTO+VECTOR brain.\ninput int             InpParallelMinSamples     = 30;\ninput double          InpParallelMinWinRate      = 52.0;\ninput bool            InpParallelRequirePositiveSetup = true;\n'''
)

append_after(
    "mt5/FastBasketBot.mq5",
    'double g_raceCloseAllProfitMoney = 0.50;\n',
    '''\n// Isolated production-mode runtime state.\ndouble g_flipLockMinProfitMoney = 1.00;\ndouble g_flipLockGivebackMoney = 0.30;\nint    g_flipLockMaxFlips = 3;\nint    g_flipLockCooldownSeconds = 10;\ndouble g_flipLockPeakProfit = 0.0;\nbool   g_flipLockArmed = false;\nint    g_flipLockFlips = 0;\ndatetime g_flipLockLastFlipAt = 0;\nint    g_parallelMinSamples = 30;\ndouble g_parallelMinWinRate = 52.0;\nbool   g_parallelRequirePositiveSetup = true;\nVECTOR_EDGE_OUTPUT g_autoVectorEdge;\nbool   g_autoVectorEdgeValid = false;\nbool   g_autoVectorEdgeMature = false;\nstring g_autoVectorEdgeProbabilitySource = "NONE";\n'''
)

# OnInit input defaults.
append_after(
    "mt5/FastBasketBot.mq5",
    '   g_raceCloseAllProfitMoney = MathMax(0.01, InpRaceCloseAllProfitMoney);\n',
    '''   g_flipLockMinProfitMoney = MathMax(0.01, InpFlipLockMinProfitMoney);\n   g_flipLockGivebackMoney = MathMax(0.01, InpFlipLockGivebackMoney);\n   g_flipLockMaxFlips = (int)MathMax(1.0,MathMin(20.0,(double)InpFlipLockMaxFlips));\n   g_flipLockCooldownSeconds = (int)MathMax(1.0,MathMin(3600.0,(double)InpFlipLockCooldownSeconds));\n   g_parallelMinSamples = (int)MathMax(20.0,MathMin(500.0,(double)InpParallelMinSamples));\n   g_parallelMinWinRate = MathMax(40.0,MathMin(90.0,InpParallelMinWinRate));\n   g_parallelRequirePositiveSetup = InpParallelRequirePositiveSetup;\n'''
)

# Runtime mode ownership.
patch(
    "mt5/FastBasketBot.mq5",
    '''   if(control == "ZERO_GRID") return "ZERO_GRID";\n   if(control == "RACE") return "RACE";\n   if(control == "AUTO" || control == "ASSISTED" || control == "MANUAL")\n      return "AUTO";''',
    '''   if(control == "ZERO_GRID") return "ZERO_GRID";\n   if(control == "RACE") return "RACE";\n   if(control == "FLIP_LOCK") return "FLIP_LOCK";\n   if(control == "PARALLEL_UNIVERSE") return "PARALLEL_UNIVERSE";\n   if(control == "AUTO" || control == "ASSISTED" || control == "MANUAL")\n      return "AUTO";'''
)
append_after(
    "mt5/FastBasketBot.mq5",
    '''bool ZeroGridModeEnabled()\n{\n   return EffectiveExecutionMode() == "ZERO_GRID";\n}\n''',
    '''\nbool FlipLockModeEnabled()\n{\n   return EffectiveExecutionMode() == "FLIP_LOCK";\n}\n\nbool ParallelUniverseModeEnabled()\n{\n   return EffectiveExecutionMode() == "PARALLEL_UNIVERSE";\n}\n'''
)

# Accept the two control modes from SaaS settings; both intentionally use engine AUTO.
patch(
    "mt5/FastBasketBot.mq5",
    '''      requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||\n      requestedControlMode == "ZERO_GRID" || requestedControlMode == "ASSISTED" ||\n      requestedControlMode == "MANUAL" || requestedControlMode == "LEGACY";''',
    '''      requestedControlMode == "AUTO" || requestedControlMode == "RACE" ||\n      requestedControlMode == "ZERO_GRID" || requestedControlMode == "FLIP_LOCK" ||\n      requestedControlMode == "PARALLEL_UNIVERSE" || requestedControlMode == "ASSISTED" ||\n      requestedControlMode == "MANUAL" || requestedControlMode == "LEGACY";'''
)
append_after(
    "mt5/FastBasketBot.mq5",
    '   g_raceCloseAllProfitMoney = MathMax(0.01, JsonNumber(json, "raceCloseAllProfitMoney", g_raceCloseAllProfitMoney));\n',
    '''\n   g_flipLockMinProfitMoney = MathMax(0.01,JsonNumber(json,"flipLockMinProfitMoney",g_flipLockMinProfitMoney));\n   g_flipLockGivebackMoney = MathMax(0.01,JsonNumber(json,"flipLockGivebackMoney",g_flipLockGivebackMoney));\n   g_flipLockMaxFlips = (int)MathMax(1.0,MathMin(20.0,MathRound(JsonNumber(json,"flipLockMaxFlips",g_flipLockMaxFlips))));\n   g_flipLockCooldownSeconds = (int)MathMax(1.0,MathMin(3600.0,MathRound(JsonNumber(json,"flipLockCooldownSeconds",g_flipLockCooldownSeconds))));\n   g_parallelMinSamples = (int)MathMax(20.0,MathMin(500.0,MathRound(JsonNumber(json,"parallelUniverseMinSamples",g_parallelMinSamples))));\n   g_parallelMinWinRate = MathMax(40.0,MathMin(90.0,JsonNumber(json,"parallelUniverseMinWinRate",g_parallelMinWinRate)));\n   g_parallelRequirePositiveSetup = JsonBool(json,"parallelUniverseRequirePositiveSetup",g_parallelRequirePositiveSetup);\n'''
)

# ---------------------------------------------------------------------------
# AUTO + VECTOR EDGE: production live intelligence layer.
# It changes rank only after AUTO has independently evaluated both directions.
# Mature history may veto a direction with non-positive EV; Kelly never sizes orders.
# ---------------------------------------------------------------------------
vector_live = r'''
// AUTO + VECTOR EDGE production layer ---------------------------------------
double AutoVectorEdgeProbability(const AUTO_V20_SIDE &side,string &source)
{
   if(side.winSamples>=20)
   {
      source="HISTORY";
      return VectorClamp01(side.winProbability/100.0);
   }
   source="MODEL_PROXY";
   return VectorClamp01(side.confidence/100.0);
}

double AutoVectorEdgeGrossMove(const AUTO_V20_SIDE &side,bool win)
{
   double target=win ? side.tpPrice : side.slPrice;
   if(side.direction==0 || side.plannedLot<=0.0 || side.entryPrice<=0.0 || target<=0.0)
      return 0.0;
   return MathAbs(AutoV20ProfitForMove(side.direction,side.plannedLot,side.entryPrice,target));
}

bool AutoVectorEdgeBuildInput(double momentum,VECTOR_EDGE_INPUT &input)
{
   string buySource="NONE",sellSource="NONE";
   input.buyProbability=AutoVectorEdgeProbability(g_autoV20Buy,buySource);
   input.sellProbability=AutoVectorEdgeProbability(g_autoV20Sell,sellSource);
   g_autoVectorEdgeProbabilitySource=buySource==sellSource ? buySource : buySource+"+"+sellSource;

   input.buyKnownCostMoney=MathMax(0.0,g_autoV20Buy.knownCostMoney);
   input.sellKnownCostMoney=MathMax(0.0,g_autoV20Sell.knownCostMoney);
   input.buyExpectedWinMoney=AutoVectorEdgeGrossMove(g_autoV20Buy,true);
   input.buyExpectedLossMoney=AutoVectorEdgeGrossMove(g_autoV20Buy,false);
   input.sellExpectedWinMoney=AutoVectorEdgeGrossMove(g_autoV20Sell,true);
   input.sellExpectedLossMoney=AutoVectorEdgeGrossMove(g_autoV20Sell,false);

   if(input.buyExpectedWinMoney<=0.0 || input.buyExpectedLossMoney<=0.0 ||
      input.sellExpectedWinMoney<=0.0 || input.sellExpectedLossMoney<=0.0)
      return false;

   double spread=CurrentSpreadPoints();
   double reference=g_adaptiveSpreadLimit>0.0 ? g_adaptiveSpreadLimit :
      (g_spreadP95>0.0 ? g_spreadP95 : g_spreadMedian);
   input.spreadPenalty=reference>0.0
      ? MathMin(2.0,MathMax(0.0,spread/reference-1.0)) : 0.25;
   input.volatilityNoise=g_atrRatio>0.0
      ? MathMin(1.0,MathAbs(g_atrRatio-1.0)) : 0.25;
   double bestConfidence=MathMax(g_autoV20Buy.confidence,g_autoV20Sell.confidence);
   input.modelUncertainty=1.0-VectorClamp01(bestConfidence/100.0);
   input.persistence=g_autoV20PhaseSince>0
      ? VectorClamp01((double)MathMax(0,TimeCurrent()-g_autoV20PhaseSince)/30.0) : 0.0;
   double scale=MathMax(1.0,InpStrongFlowPoints);
   input.velocity=MathMax(-1.0,MathMin(1.0,momentum/scale));
   input.acceleration=MathMax(-1.0,MathMin(1.0,(momentum-g_autoV20PreviousMomentum)/scale));
   return true;
}

void AutoVectorEdgeApply(double momentum)
{
   g_autoVectorEdgeValid=false;
   g_autoVectorEdgeMature=g_autoV20Buy.winSamples>=20 && g_autoV20Sell.winSamples>=20;
   VECTOR_EDGE_INPUT input;
   if(!AutoVectorEdgeBuildInput(momentum,input))
      return;
   g_autoVectorEdge=VectorEvaluateEdge(input);
   g_autoVectorEdgeValid=g_autoVectorEdge.valid;
   if(!g_autoVectorEdgeValid || !g_autoVectorEdge.positiveExpectancy ||
      g_autoVectorEdge.preferredDirection==0)
      return;

   double reliability=g_autoVectorEdgeMature
      ? MathMin(1.0,(double)MathMin(g_autoV20Buy.winSamples,g_autoV20Sell.winSamples)/60.0)
      : 0.20;
   double boost=MathMin(6.0,g_autoVectorEdge.edgeRatio*0.06)*reliability;
   double penalty=MathMin(4.0,g_autoVectorEdge.edgeRatio*0.04)*reliability;
   if(g_autoVectorEdge.preferredDirection>0)
   {
      g_autoV20Buy.rankScore+=boost;
      g_autoV20Sell.rankScore-=penalty;
   }
   else
   {
      g_autoV20Sell.rankScore+=boost;
      g_autoV20Buy.rankScore-=penalty;
   }
}

bool AutoVectorEdgeDirectionAllowed(int direction,string &reason)
{
   reason="OK";
   if(!g_autoVectorEdgeValid || !g_autoVectorEdgeMature)
      return true;
   double ownEv=direction>0 ? g_autoVectorEdge.buyEV : g_autoVectorEdge.sellEV;
   double otherEv=direction>0 ? g_autoVectorEdge.sellEV : g_autoVectorEdge.buyEV;
   if(ownEv<=0.0 && otherEv>0.0)
   {
      reason="VECTOR_NEGATIVE_EV";
      return false;
   }
   if(g_autoVectorEdge.preferredDirection!=0 &&
      g_autoVectorEdge.preferredDirection!=direction &&
      g_autoVectorEdge.edgeRatio>=60.0)
   {
      reason="VECTOR_STRONG_OPPOSITE_EDGE";
      return false;
   }
   return true;
}

'''
patch("mt5/FastBasketBot.mq5", 'int AutoV20PrecisionDirection(double momentum)\n{', vector_live + 'int AutoV20PrecisionDirection(double momentum)\n{')
patch(
    "mt5/FastBasketBot.mq5",
    '''   AutoV20EvaluateSide(1,momentum,g_autoV20Levels,g_autoV20Buy);\n   AutoV20EvaluateSide(-1,momentum,g_autoV20Levels,g_autoV20Sell);\n   g_autoV20LastMomentum=momentum;''',
    '''   AutoV20EvaluateSide(1,momentum,g_autoV20Levels,g_autoV20Buy);\n   AutoV20EvaluateSide(-1,momentum,g_autoV20Levels,g_autoV20Sell);\n   AutoVectorEdgeApply(momentum);\n   g_autoV20LastMomentum=momentum;'''
)
patch(
    "mt5/FastBasketBot.mq5",
    '''   if(selected.confidence<minimumConfidence || selected.rankScore<minimumRank)\n   {''',
    '''   string vectorGateReason="OK";\n   if(!AutoVectorEdgeDirectionAllowed(direction,vectorGateReason))\n   {\n      g_autoV20RejectReason=vectorGateReason;\n      g_adaptiveBlockReason=vectorGateReason;\n      return 0;\n   }\n\n   if(selected.confidence<minimumConfidence || selected.rankScore<minimumRank)\n   {'''
)

# ---------------------------------------------------------------------------
# Isolated live mode managers. They own execution completely when selected.
# ---------------------------------------------------------------------------
modes_code = r'''
// FLIP LOCK + PARALLEL UNIVERSE production engines -------------------------
void ResetFlipLockRuntime(bool fullReset)
{
   g_flipLockPeakProfit=0.0;
   g_flipLockArmed=false;
   if(fullReset)
   {
      g_flipLockFlips=0;
      g_flipLockLastFlipAt=0;
   }
}

bool NewModeOperationalEntryAllowed()
{
   if(g_state!=STATE_RUNNING || !g_access)
      return false;
   if(!MQLInfoInteger(MQL_TESTER) && !EntryLeaseValid())
      return false;
   if(TradePermissionStatus()!="OK")
      return false;
   if(!CanSendOrder() || !AdaptiveSpreadAllowed())
      return false;
   return true;
}

bool NewModeOpenInitial(int direction,string acceptedStatus)
{
   if(direction==0 || !NewModeOperationalEntryAllowed())
      return false;
   AUTO_V20_SIDE selected=direction>0 ? g_autoV20Buy : g_autoV20Sell;
   g_adaptiveLot=selected.plannedLot>0.0 ? selected.plannedLot : NormalizeTradeVolume(g_lot);
   if(g_adaptiveLot<=0.0)
      return false;
   if(!SendMarketOrder(direction))
      return false;
   RegisterOrderRequest();
   g_executionStatus=acceptedStatus;
   return true;
}

void ManageFlipLock(double momentum)
{
   int count=BasketPositionCount();
   int rescue=RescuePositionCount();
   if(rescue>0)
   {
      g_executionStatus="FLIP_LOCK_RESCUE_BLOCK";
      return;
   }

   if(count<=0)
   {
      // A just-completed flip gets a cooldown before a brand-new cycle may start.
      if(g_flipLockLastFlipAt>0 && TimeCurrent()-g_flipLockLastFlipAt<g_flipLockCooldownSeconds)
      {
         g_executionStatus="FLIP_LOCK_COOLDOWN";
         return;
      }
      ResetFlipLockRuntime(g_flipLockLastFlipAt==0);
      if(!NewModeOperationalEntryAllowed())
      {
         g_executionStatus="FLIP_LOCK_WAIT_CONTROL";
         return;
      }
      int direction=AutoV20PrecisionDirection(momentum);
      if(direction==0)
      {
         g_executionStatus="FLIP_LOCK_WAIT_SETUP";
         return;
      }
      if(NewModeOpenInitial(direction,"FLIP_LOCK_ACTIVE"))
      {
         g_flipLockPeakProfit=0.0;
         g_flipLockArmed=false;
      }
      return;
   }

   int direction=BasketDirection();
   if(direction==0 || count!=1)
   {
      g_executionStatus="FLIP_LOCK_SINGLE_POSITION_REQUIRED";
      return;
   }

   double profit=BasketCycleProfit();
   if(profit>g_flipLockPeakProfit)
      g_flipLockPeakProfit=profit;
   if(!g_flipLockArmed && g_flipLockPeakProfit>=g_flipLockMinProfitMoney)
      g_flipLockArmed=true;

   if(!g_flipLockArmed)
   {
      g_executionStatus="FLIP_LOCK_BUILDING_PROFIT";
      return;
   }

   double dynamicGiveback=MathMax(
      g_flipLockGivebackMoney,
      CurrentSpreadCost(VolumeForMagic(InpMagic,direction))*1.50
   );
   double triggerProfit=g_flipLockPeakProfit-dynamicGiveback;
   double protectedFloor=MathMax(0.01,g_flipLockMinProfitMoney*0.20);
   if(profit>triggerProfit || profit<protectedFloor)
   {
      g_executionStatus=profit<protectedFloor
         ? "FLIP_LOCK_PROTECTED_FLOOR_LOST"
         : "FLIP_LOCK_ARMED";
      return;
   }
   if(TimeCurrent()-g_flipLockLastFlipAt<g_flipLockCooldownSeconds)
   {
      g_executionStatus="FLIP_LOCK_COOLDOWN";
      return;
   }

   double previousVolume=VolumeForMagic(InpMagic,direction);
   int opposite=-direction;
   if(!CloseAllBasket("FLIP_LOCK_SWITCH") || BasketPositionCount()!=0 || RescuePositionCount()!=0)
   {
      g_executionStatus="FLIP_LOCK_CLOSE_RETRY";
      return;
   }

   g_flipLockLastFlipAt=TimeCurrent();
   g_flipLockFlips++;
   ResetTrail();
   g_flipLockPeakProfit=0.0;
   g_flipLockArmed=false;

   if(g_flipLockFlips>g_flipLockMaxFlips)
   {
      g_executionStatus="FLIP_LOCK_MAX_FLIPS_BANKED";
      return;
   }
   if(!NewModeOperationalEntryAllowed())
   {
      g_executionStatus="FLIP_LOCK_CLOSED_NO_REOPEN";
      return;
   }

   g_adaptiveLot=NormalizeTradeVolume(previousVolume>0.0 ? previousVolume : g_lot);
   if(SendMarketOrder(opposite))
   {
      RegisterOrderRequest();
      g_executionStatus="FLIP_LOCK_SWITCHED";
   }
   else
      g_executionStatus="FLIP_LOCK_REOPEN_FAILED";
}

bool ParallelUniverseEvidenceAllows(int direction,string &reason)
{
   reason="NONE";
   AUTO_V20_SIDE side=direction>0 ? g_autoV20Buy : g_autoV20Sell;
   if(side.winSamples<g_parallelMinSamples)
   {
      reason="PARALLEL_NEEDS_HISTORY";
      return false;
   }
   if(side.winProbability<g_parallelMinWinRate)
   {
      reason="PARALLEL_WIN_RATE_LOW";
      return false;
   }
   if(side.averageNet<=0.0)
   {
      reason="PARALLEL_AVERAGE_NET_NONPOSITIVE";
      return false;
   }

   bool setupMatches=g_setupWinSamples>=12 &&
      g_setupHistoryDirection==direction &&
      g_setupHistoryModel==side.model;
   if(g_parallelRequirePositiveSetup && setupMatches &&
      (g_setupAverageNet<=0.0 || g_setupEvScore<50.0))
   {
      reason="PARALLEL_SETUP_EV_NONPOSITIVE";
      return false;
   }
   if(g_autoVectorEdgeValid && g_autoVectorEdgeMature)
   {
      double ev=direction>0 ? g_autoVectorEdge.buyEV : g_autoVectorEdge.sellEV;
      if(ev<=0.0)
      {
         reason="PARALLEL_VECTOR_EV_NONPOSITIVE";
         return false;
      }
   }
   return true;
}

void ManageParallelUniverse(double momentum)
{
   if(RescuePositionCount()>0)
   {
      g_executionStatus="PARALLEL_RESCUE_BLOCK";
      return;
   }
   if(BasketPositionCount()>0)
   {
      g_executionStatus="PARALLEL_MANAGING";
      return;
   }
   if(!NewModeOperationalEntryAllowed())
   {
      g_executionStatus="PARALLEL_WAIT_CONTROL";
      return;
   }

   int direction=AutoV20PrecisionDirection(momentum);
   if(direction==0)
   {
      g_executionStatus="PARALLEL_WAIT_AUTO_VECTOR";
      return;
   }
   string reason="NONE";
   if(!ParallelUniverseEvidenceAllows(direction,reason))
   {
      g_executionStatus=reason;
      return;
   }
   NewModeOpenInitial(direction,"PARALLEL_ENTRY_ACCEPTED");
}

'''
patch("mt5/FastBasketBot.mq5", 'void OnTick()\n{', modes_code + 'void OnTick()\n{')

# Hard owner branches before generic AUTO/legacy position management.
patch(
    "mt5/FastBasketBot.mq5",
    '''   if(g_zeroGridClosing || ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)\n   {\n      ManageZeroGrid();\n      return;\n   }\n\n   if(count > 0)''',
    '''   if(g_zeroGridClosing || ZeroGridPositionCount()>0 || ZeroGridPendingCount()>0)\n   {\n      ManageZeroGrid();\n      return;\n   }\n\n   // FLIP LOCK and PARALLEL UNIVERSE own all entry/position behavior when selected.\n   // Global daily/basket safety checks above remain shared; AUTO/RACE/legacy logic below\n   // cannot execute in the same tick.\n   if(FlipLockModeEnabled())\n   {\n      ManageFlipLock(momentum);\n      return;\n   }\n   if(ParallelUniverseModeEnabled())\n   {\n      ManageParallelUniverse(momentum);\n      return;\n   }\n\n   if(count > 0)'''
)

# Ensure the order comment identifies mode ownership in broker history.
patch(
    "mt5/FastBasketBot.mq5",
    '''   request.comment = autoV20\n      ? "SaaSAutoV20"\n      : (g_engineMode == "RACE"\n      ? "SaaSRace"\n      : (g_tacticalCountertrendActive ? "SaaSTactical" : "SaaSBasket"));''',
    '''   request.comment = autoV20\n      ? "SaaSAutoVector"\n      : (FlipLockModeEnabled()\n      ? "SaaSFlipLock"\n      : (ParallelUniverseModeEnabled()\n      ? "SaaSParallel"\n      : (g_engineMode == "RACE"\n      ? "SaaSRace"\n      : (g_tacticalCountertrendActive ? "SaaSTactical" : "SaaSBasket"))));'''
)

# ---------------------------------------------------------------------------
# API settings and heartbeat contract.
# ---------------------------------------------------------------------------
append_after(
    "apps/api/src/bot.controller.ts",
    '    numberSetting("raceCloseAllProfitMoney", 0.01, 100000);\n',
    '''    numberSetting("flipLockMinProfitMoney", 0.01, 100000);\n    numberSetting("flipLockGivebackMoney", 0.01, 100000);\n    numberSetting("flipLockMaxFlips", 1, 20, true);\n    numberSetting("flipLockCooldownSeconds", 1, 3600, true);\n    numberSetting("parallelUniverseMinSamples", 20, 500, true);\n    numberSetting("parallelUniverseMinWinRate", 40, 90);\n    booleanSetting("parallelUniverseRequirePositiveSetup");\n'''
)
patch(
    "apps/api/src/bot.controller.ts",
    'if (requestedControlMode !== null && !["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL"].includes(requestedControlMode))',
    'if (requestedControlMode !== null && !["AUTO", "RACE", "ZERO_GRID", "FLIP_LOCK", "PARALLEL_UNIVERSE", "ASSISTED", "MANUAL"].includes(requestedControlMode))',
    count=1
)
append_after(
    "apps/api/src/bot.controller.ts",
    '''    if (raceSelected) {\n      if (body.raceCloseAllProfitEnabled === undefined) clean.raceCloseAllProfitEnabled = true;\n      if (body.raceCloseAllProfitMoney === undefined) clean.raceCloseAllProfitMoney = 0.5;\n    }\n''',
    '''\n    if (requestedControlMode === "FLIP_LOCK") {\n      clean.engineMode = "AUTO";\n      clean.profitTargetMode = "OFF";\n      clean.maxPositions = 1;\n      if (body.flipLockMinProfitMoney === undefined) clean.flipLockMinProfitMoney = 1.0;\n      if (body.flipLockGivebackMoney === undefined) clean.flipLockGivebackMoney = 0.3;\n      if (body.flipLockMaxFlips === undefined) clean.flipLockMaxFlips = 3;\n      if (body.flipLockCooldownSeconds === undefined) clean.flipLockCooldownSeconds = 10;\n    }\n    if (requestedControlMode === "PARALLEL_UNIVERSE") {\n      clean.engineMode = "AUTO";\n      clean.maxPositions = 1;\n      if (body.parallelUniverseMinSamples === undefined) clean.parallelUniverseMinSamples = 30;\n      if (body.parallelUniverseMinWinRate === undefined) clean.parallelUniverseMinWinRate = 52;\n      if (body.parallelUniverseRequirePositiveSetup === undefined) clean.parallelUniverseRequirePositiveSetup = true;\n    }\n'''
)

# Heartbeat runtime accepts and preserves both new control modes.
patch(
    "apps/api/src/ea.controller.ts",
    'if (!["AUTO", "RACE", "ZERO_GRID", "ASSISTED", "MANUAL"].includes(savedControlMode))',
    'if (!["AUTO", "RACE", "ZERO_GRID", "FLIP_LOCK", "PARALLEL_UNIVERSE", "ASSISTED", "MANUAL"].includes(savedControlMode))',
    count=1
)

# Release server version/runtime contract.
patch("apps/api/src/release-version.ts", 'export const DEFAULT_EA_VERSION = "1.0.23";', 'export const DEFAULT_EA_VERSION = "1.0.24";')
patch("apps/api/src/release-version.ts", 'export const EA_RUNTIME_CONTRACT = "RACE_VOLUME_10S_ROLLOVER_V1";', 'export const EA_RUNTIME_CONTRACT = "VECTOR_FLIP_PARALLEL_V1";')

# ---------------------------------------------------------------------------
# Web settings UI.
# ---------------------------------------------------------------------------
append_after(
    "apps/web/app/dashboard/page.tsx",
    '  raceCloseAllProfitMoney: 0.5,\n',
    '''  flipLockMinProfitMoney: 1.0,\n  flipLockGivebackMoney: 0.3,\n  flipLockMaxFlips: 3,\n  flipLockCooldownSeconds: 10,\n  parallelUniverseMinSamples: 30,\n  parallelUniverseMinWinRate: 52,\n  parallelUniverseRequirePositiveSetup: true,\n'''
)
patch(
    "apps/web/app/dashboard/page.tsx",
    'const controlMode = ["AUTO","RACE","ZERO_GRID","MANUAL"].includes(requestedControlMode)',
    'const controlMode = ["AUTO","RACE","ZERO_GRID","FLIP_LOCK","PARALLEL_UNIVERSE","MANUAL"].includes(requestedControlMode)'
)
append_after(
    "apps/web/app/dashboard/page.tsx",
    '    ZERO_GRID:{title:"ZERO GRID",subtitle:"วางคำสั่ง BUY STOP และ SELL STOP แบบสมมาตร รองรับ 1–30 ระดับต่อฝั่ง"},\n',
    '''    FLIP_LOCK:{title:"FLIP LOCK",subtitle:"ล็อกกำไรของสถานะเดิม แล้วสลับ BUY ↔ SELL เมื่อราคาย้อนผ่านเส้น Flip ที่ระบบคำนวณ"},\n    PARALLEL_UNIVERSE:{title:"PARALLEL UNIVERSE",subtitle:"ใช้ AUTO + VECTOR EDGE แล้วกรองด้วยผลลัพธ์จากเหตุการณ์ย้อนหลังที่มีบริบทใกล้เคียงก่อนเข้า"},\n'''
)
patch(
    "apps/web/app/dashboard/page.tsx",
    '''                {id:"RACE",icon:"status",tag:"ดำเนินการเร็ว"},\n                {id:"ZERO_GRID",icon:"layers",tag:"กริดแบบ Hedging"},\n                {id:"MANUAL",icon:"settings",tag:"กำหนดรายละเอียด"}''',
    '''                {id:"RACE",icon:"status",tag:"ดำเนินการเร็ว"},\n                {id:"ZERO_GRID",icon:"layers",tag:"กริดแบบ Hedging"},\n                {id:"FLIP_LOCK",icon:"trend",tag:"สลับทิศล็อกกำไร"},\n                {id:"PARALLEL_UNIVERSE",icon:"brain",tag:"สถิติหลายจักรวาล"},\n                {id:"MANUAL",icon:"settings",tag:"กำหนดรายละเอียด"}'''
)
patch(
    "apps/web/app/dashboard/page.tsx",
    '''    props.onEdit?.("engineMode","AUTO");\n    if (mode === "AUTO") {''',
    '''    props.onEdit?.("engineMode","AUTO");\n    if (mode === "FLIP_LOCK") {\n      props.onEdit?.("profitTargetMode","OFF");\n      props.onEdit?.("manualStopLossPoints",0);\n      props.onEdit?.("maxPositions",1);\n      if (!Number.isFinite(Number(props.settings?.flipLockMinProfitMoney)) || Number(props.settings?.flipLockMinProfitMoney)<=0) props.onEdit?.("flipLockMinProfitMoney",1.0);\n      if (!Number.isFinite(Number(props.settings?.flipLockGivebackMoney)) || Number(props.settings?.flipLockGivebackMoney)<=0) props.onEdit?.("flipLockGivebackMoney",0.3);\n      if (!Number.isFinite(Number(props.settings?.flipLockMaxFlips)) || Number(props.settings?.flipLockMaxFlips)<1) props.onEdit?.("flipLockMaxFlips",3);\n      if (!Number.isFinite(Number(props.settings?.flipLockCooldownSeconds)) || Number(props.settings?.flipLockCooldownSeconds)<1) props.onEdit?.("flipLockCooldownSeconds",10);\n      return;\n    }\n    if (mode === "PARALLEL_UNIVERSE") {\n      props.onEdit?.("profitTargetMode","AUTO");\n      props.onEdit?.("manualStopLossPoints",0);\n      props.onEdit?.("maxPositions",1);\n      if (!Number.isFinite(Number(props.settings?.parallelUniverseMinSamples)) || Number(props.settings?.parallelUniverseMinSamples)<20) props.onEdit?.("parallelUniverseMinSamples",30);\n      if (!Number.isFinite(Number(props.settings?.parallelUniverseMinWinRate))) props.onEdit?.("parallelUniverseMinWinRate",52);\n      if (typeof props.settings?.parallelUniverseRequirePositiveSetup !== "boolean") props.onEdit?.("parallelUniverseRequirePositiveSetup",true);\n      return;\n    }\n    if (mode === "AUTO") {'''
)

# Add dedicated settings cards immediately after the standard fields grid.
ui_special = r'''
                {controlMode==="FLIP_LOCK"&&<div className="cc-bot-v2-lowvol-card active">
                  <div className="cc-bot-v2-lowvol-copy"><span className="cc-bot-v2-lowvol-icon"><ScenovaIcon name="trend" size={22}/></span><div><small>FLIP LOCK ENGINE</small><b>ล็อกกำไรแล้วสลับทิศแบบ 1 Position</b><p>เมื่อกำไรทำจุดสูงสุดแล้วถอยกลับตามระยะที่กำหนด ระบบจะปิดสถานะเดิมก่อน แล้วเปิดฝั่งตรงข้ามด้วย Lot เดิม ไม่มี Martingale และไม่ถัวเพิ่ม</p></div></div>
                  <div className="cc-bot-v2-fields">
                    <label className="cc-bot-v2-field"><span>กำไรขั้นต่ำก่อน Arm</span><MoneyInput value={props.settings.flipLockMinProfitMoney||1} suffix="USD" onCommit={(v:string)=>props.onEdit?.("flipLockMinProfitMoney",v)}/></label>
                    <label className="cc-bot-v2-field"><span>ยอมให้กำไรย่อก่อน Flip</span><MoneyInput value={props.settings.flipLockGivebackMoney||0.3} suffix="USD" onCommit={(v:string)=>props.onEdit?.("flipLockGivebackMoney",v)}/></label>
                    <label className="cc-bot-v2-field"><span>Flip สูงสุดต่อ Cycle</span><select className="input" value={String(props.settings.flipLockMaxFlips||3)} onChange={e=>props.onEdit?.("flipLockMaxFlips",Number(e.target.value))}>{[1,2,3,4,5,6].map(v=><option key={v} value={v}>{v} ครั้ง</option>)}</select></label>
                    <label className="cc-bot-v2-field"><span>Cooldown หลัง Flip</span><select className="input" value={String(props.settings.flipLockCooldownSeconds||10)} onChange={e=>props.onEdit?.("flipLockCooldownSeconds",Number(e.target.value))}>{[5,10,15,30,60].map(v=><option key={v} value={v}>{v} วินาที</option>)}</select></label>
                  </div>
                </div>}
                {controlMode==="PARALLEL_UNIVERSE"&&<div className="cc-bot-v2-lowvol-card active">
                  <div className="cc-bot-v2-lowvol-copy"><span className="cc-bot-v2-lowvol-icon"><ScenovaIcon name="brain" size={22}/></span><div><small>PARALLEL UNIVERSE ENGINE</small><b>ให้ประวัติช่วยยืนยันก่อนเข้า</b><p>AUTO + VECTOR EDGE เลือกทิศก่อน จากนั้นระบบต้องพบจำนวนเคสย้อนหลังและผลเฉลี่ยตามเกณฑ์ จึงจะอนุญาต 1 Position</p></div></div>
                  <div className="cc-bot-v2-fields">
                    <label className="cc-bot-v2-field"><span>ตัวอย่างขั้นต่ำ</span><select className="input" value={String(props.settings.parallelUniverseMinSamples||30)} onChange={e=>props.onEdit?.("parallelUniverseMinSamples",Number(e.target.value))}>{[20,30,40,60,100].map(v=><option key={v} value={v}>{v} เคส</option>)}</select></label>
                    <label className="cc-bot-v2-field"><span>Win rate ขั้นต่ำ</span><select className="input" value={String(props.settings.parallelUniverseMinWinRate||52)} onChange={e=>props.onEdit?.("parallelUniverseMinWinRate",Number(e.target.value))}>{[50,52,55,58,60,65].map(v=><option key={v} value={v}>{v}%</option>)}</select></label>
                    <div className="cc-bot-v2-field"><span>Setup EV</span><SwitchSetting checked={props.settings.parallelUniverseRequirePositiveSetup!==false} onChange={(v:boolean)=>props.onEdit?.("parallelUniverseRequirePositiveSetup",v)} onLabel="ต้องเป็นบวกเมื่อมีข้อมูล" offLabel="ไม่บังคับ Setup EV"/></div>
                  </div>
                </div>}
'''
patch(
    "apps/web/app/dashboard/page.tsx",
    '                <div className="cc-bot-v2-fields">\n                  <div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="gold" size={17}/>Symbol</label><strong>{props.symbol || "—"}</strong></div>',
    ui_special + '                <div className="cc-bot-v2-fields">\n                  <div className="cc-bot-v2-field readonly"><label><ScenovaIcon name="gold" size={17}/>Symbol</label><strong>{props.symbol || "—"}</strong></div>'
)

# Hero mode label must not collapse new modes to AUTO.
patch(
    "apps/web/app/dashboard/page.tsx",
    'String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO" : settings.entryMode',
    'String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "FLIP_LOCK" ? "FLIP LOCK" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "PARALLEL_UNIVERSE" ? "PARALLEL UNIVERSE" : String(settings.controlMode || settings.engineMode || "AUTO").toUpperCase() === "MANUAL" ? "MANUAL" : settings.entryMode === "AUTO_MOMENTUM" ? "AUTO + VECTOR" : settings.entryMode',
    count=1
)

# Build workflow comments/sentinels follow the new release.
patch(
    ".github/workflows/build-mt5-ea.yml",
    '# Release metadata trigger: EA v1.0.23 RACE 10-second volume rollover runtime.',
    '# Release metadata trigger: EA v1.0.24 AUTO+VECTOR / FLIP LOCK / PARALLEL runtime.'
)

print("production modes v1 patch applied")
