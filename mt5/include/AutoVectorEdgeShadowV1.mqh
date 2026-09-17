#ifndef SCENOVA_AUTO_VECTOR_EDGE_SHADOW_V1_MQH
#define SCENOVA_AUTO_VECTOR_EDGE_SHADOW_V1_MQH

// Phase 2 shadow adapter.
// IMPORTANT: reads existing AUTO V20 diagnostics only. It must never send,
// modify, cancel, close, resize, or gate any order.

#define VECTOR_EDGE_SHADOW_V1_VERSION "1.1.0"
#define VECTOR_EDGE_SHADOW_SAMPLE_MS 1000
#define VECTOR_EDGE_SHADOW_LOG_MS 5000

VECTOR_EDGE_OUTPUT g_vectorEdgeShadowOutput;
bool   g_vectorEdgeShadowActive = false;
long   g_vectorEdgeShadowSamples = 0;
ulong  g_vectorEdgeShadowLastSampleMs = 0;
ulong  g_vectorEdgeShadowLastLogMs = 0;
string g_vectorEdgeShadowProbabilitySource = "NONE";

double VectorShadowClampSigned(const double value)
{
   if(value < -1.0) return -1.0;
   if(value > 1.0) return 1.0;
   return value;
}

double VectorShadowSideProbability(const AUTO_V20_SIDE &side,
                                   string &source)
{
   // A historical 0% win rate is still real history. Do not silently replace
   // it with model confidence merely because the value is zero.
   if(side.winSamples >= 20)
   {
      source = "HISTORY";
      return VectorClamp01(side.winProbability / 100.0);
   }

   if(side.confidence > 0.0)
   {
      source = "MODEL_SCORE_PROXY";
      return VectorClamp01(side.confidence / 100.0);
   }

   source = "NEUTRAL_FALLBACK";
   return 0.5;
}

double VectorShadowPersistence()
{
   if(g_autoV20PhaseSince <= 0)
      return 0.0;

   long ageSeconds = (long)MathMax(0, TimeCurrent() - g_autoV20PhaseSince);
   return VectorClamp01((double)ageSeconds / 30.0);
}

double VectorShadowSpreadPenalty()
{
   double spread = CurrentSpreadPoints();
   if(spread <= 0.0 || spread >= 999999.0)
      return 1.0;

   double reference = g_adaptiveSpreadLimit > 0.0
      ? g_adaptiveSpreadLimit
      : (g_spreadP95 > 0.0 ? g_spreadP95 : g_spreadMedian);

   if(reference <= 0.0)
      return 0.25; // profile not ready: conservative diagnostic uncertainty

   // Normal spread should have zero excess penalty. Only widening above the
   // learned reference is penalized.
   double ratio = spread / reference;
   return MathMin(2.0, MathMax(0.0, ratio - 1.0));
}

double VectorShadowVolatilityNoise()
{
   if(g_atrRatio <= 0.0)
      return 0.25; // unknown is not the same as perfectly normal

   return MathMin(1.0, MathAbs(g_atrRatio - 1.0));
}

bool AutoVectorEdgeShadowBuildInput(VECTOR_EDGE_INPUT &input)
{
   // Hard scope boundary: AUTO V20 only. ASSISTED/MANUAL may share the AUTO
   // engine family but AutoV20Enabled() is false for those control modes.
   if(!AutoV20Enabled())
      return false;

   if(!MQLInfoInteger(MQL_TESTER) && !g_settingsSynchronized)
      return false;

   string buySource = "NONE";
   string sellSource = "NONE";
   input.buyProbability = VectorShadowSideProbability(g_autoV20Buy,buySource);
   input.sellProbability = VectorShadowSideProbability(g_autoV20Sell,sellSource);

   g_vectorEdgeShadowProbabilitySource = buySource == sellSource
      ? buySource
      : buySource + "+" + sellSource;

   input.buyExpectedWinMoney = MathMax(0.0,g_autoV20Buy.expectedProfitMoney);
   input.buyExpectedLossMoney = MathMax(0.0,g_autoV20Buy.expectedLossMoney);
   input.buyKnownCostMoney = MathMax(0.0,g_autoV20Buy.knownCostMoney);
   input.sellExpectedWinMoney = MathMax(0.0,g_autoV20Sell.expectedProfitMoney);
   input.sellExpectedLossMoney = MathMax(0.0,g_autoV20Sell.expectedLossMoney);
   input.sellKnownCostMoney = MathMax(0.0,g_autoV20Sell.knownCostMoney);

   input.volatilityNoise = VectorShadowVolatilityNoise();
   input.spreadPenalty = VectorShadowSpreadPenalty();

   double bestConfidence = MathMax(g_autoV20Buy.confidence,g_autoV20Sell.confidence);
   input.modelUncertainty = 1.0 - VectorClamp01(bestConfidence / 100.0);
   input.persistence = VectorShadowPersistence();

   double motionScale = MathMax(1.0,InpStrongFlowPoints);
   input.velocity = VectorShadowClampSigned(g_autoV20LastMomentum / motionScale);
   input.acceleration = VectorShadowClampSigned(
      (g_autoV20LastMomentum - g_autoV20PreviousMomentum) / motionScale
   );

   return true;
}

string AutoVectorEdgeShadowTelemetryJson()
{
   if(!g_vectorEdgeShadowActive)
      return "{\"vectorEdgeShadowActive\":false}";

   return StringFormat(
      "{\"vectorEdgeShadowActive\":true,\"version\":\"%s\",\"samples\":%I64d,\"probabilitySource\":\"%s\",\"preferredDirection\":%d,\"entropy\":%.4f,\"directionalAgreement\":%.4f,\"buyEV\":%.4f,\"sellEV\":%.4f,\"edgeRatio\":%.2f,\"fractionalKelly\":%.4f,\"riskMultiplier\":%.4f,\"positiveExpectancy\":%s,\"exitEdgeLost\":%s,\"reason\":\"%s\"}",
      VECTOR_EDGE_V1_VERSION,
      g_vectorEdgeShadowSamples,
      g_vectorEdgeShadowProbabilitySource,
      g_vectorEdgeShadowOutput.preferredDirection,
      g_vectorEdgeShadowOutput.entropy,
      g_vectorEdgeShadowOutput.directionalAgreement,
      g_vectorEdgeShadowOutput.buyEV,
      g_vectorEdgeShadowOutput.sellEV,
      g_vectorEdgeShadowOutput.edgeRatio,
      g_vectorEdgeShadowOutput.fractionalKelly,
      g_vectorEdgeShadowOutput.riskMultiplier,
      g_vectorEdgeShadowOutput.positiveExpectancy ? "true" : "false",
      g_vectorEdgeShadowOutput.exitEdgeLost ? "true" : "false",
      g_vectorEdgeShadowOutput.reason
   );
}

void AutoVectorEdgeShadowObserve()
{
   if(!AutoV20Enabled())
   {
      g_vectorEdgeShadowActive = false;
      g_vectorEdgeShadowProbabilitySource = "OUTSIDE_AUTO_V20";
      return;
   }

   ulong nowMs = GetTickCount64();
   if(g_vectorEdgeShadowLastSampleMs > 0 &&
      nowMs - g_vectorEdgeShadowLastSampleMs < VECTOR_EDGE_SHADOW_SAMPLE_MS)
      return;

   g_vectorEdgeShadowLastSampleMs = nowMs;

   VECTOR_EDGE_INPUT input;
   if(!AutoVectorEdgeShadowBuildInput(input))
   {
      g_vectorEdgeShadowActive = false;
      return;
   }

   // Pure diagnostic call. No VECTOR EDGE output is assigned to execution.
   g_vectorEdgeShadowOutput = VectorEvaluateEdge(input);
   g_vectorEdgeShadowActive = g_vectorEdgeShadowOutput.valid;
   g_vectorEdgeShadowSamples++;

   if(g_vectorEdgeShadowLastLogMs == 0 ||
      nowMs - g_vectorEdgeShadowLastLogMs >= VECTOR_EDGE_SHADOW_LOG_MS)
   {
      g_vectorEdgeShadowLastLogMs = nowMs;
      Print("VECTOR_EDGE_SHADOW ",AutoVectorEdgeShadowTelemetryJson());
   }
}

#endif // SCENOVA_AUTO_VECTOR_EDGE_SHADOW_V1_MQH
