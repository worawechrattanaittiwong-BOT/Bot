#ifndef SCENOVA_AUTO_VECTOR_EDGE_V1_MQH
#define SCENOVA_AUTO_VECTOR_EDGE_V1_MQH

// SCENOVA AUTO VECTOR EDGE V1
// Pure decision-support math for AUTO. This module MUST NOT send, modify,
// cancel, or close orders. It is intentionally isolated so it can run in
// SHADOW mode before any future AUTO integration.

#define VECTOR_EDGE_V1_VERSION "1.0.0-shadow"

struct VECTOR_EDGE_INPUT
{
   double buyProbability;       // 0..1, supplied by the existing AUTO model
   double sellProbability;      // 0..1, supplied by the existing AUTO model
   double expectedWinMoney;     // expected gross winner in account currency
   double expectedLossMoney;    // positive magnitude of expected loser
   double knownCostMoney;       // spread/commission/fees reserve
   double volatilityNoise;      // normalized >= 0
   double spreadPenalty;        // normalized >= 0
   double modelUncertainty;     // 0..1
   double persistence;          // 0..1
   double velocity;             // signed normalized short-horizon velocity
   double acceleration;         // signed normalized short-horizon acceleration
};

struct VECTOR_EDGE_OUTPUT
{
   bool   valid;
   int    preferredDirection;   // +1 BUY, -1 SELL, 0 NONE
   double entropy;              // 0 structured .. 1 uncertain
   double directionalAgreement; // 0..1
   double buyEV;
   double sellEV;
   double edgeRatio;            // normalized 0..100 diagnostic score
   double fractionalKelly;      // diagnostic only, 0..0.25 hard capped
   double riskMultiplier;       // diagnostic only, 0..1
   bool   positiveExpectancy;
   bool   exitEdgeLost;
   string reason;
};

double VectorClamp01(const double value)
{
   if(value < 0.0) return 0.0;
   if(value > 1.0) return 1.0;
   return value;
}

double VectorSafeLog2(const double value)
{
   if(value <= 0.0) return 0.0;
   return MathLog(value) / MathLog(2.0);
}

// Binary information entropy. 0 means one side dominates, 1 means 50/50.
double VectorBinaryEntropy(const double probability)
{
   double p = VectorClamp01(probability);
   if(p <= 0.0 || p >= 1.0) return 0.0;
   double q = 1.0 - p;
   return -(p * VectorSafeLog2(p) + q * VectorSafeLog2(q));
}

// Expected value after known execution costs. Loss magnitude must be positive.
double VectorExpectedValue(const double winProbability,
                           const double expectedWinMoney,
                           const double expectedLossMoney,
                           const double knownCostMoney)
{
   double p = VectorClamp01(winProbability);
   double win = MathMax(0.0, expectedWinMoney);
   double loss = MathMax(0.0, expectedLossMoney);
   double cost = MathMax(0.0, knownCostMoney);
   return (p * win) - ((1.0 - p) * loss) - cost;
}

// Conservative Kelly diagnostic. It is NEVER an order-size instruction.
// Cap at 0.25 so a future integration cannot accidentally expose full Kelly.
double VectorFractionalKelly(const double winProbability,
                             const double expectedWinMoney,
                             const double expectedLossMoney)
{
   double p = VectorClamp01(winProbability);
   double loss = MathMax(0.0000001, expectedLossMoney);
   double b = MathMax(0.0, expectedWinMoney) / loss;
   if(b <= 0.0) return 0.0;

   double q = 1.0 - p;
   double fullKelly = (b * p - q) / b;
   if(fullKelly <= 0.0) return 0.0;

   // Quarter-Kelly only for diagnostic use.
   return MathMin(0.25, fullKelly * 0.25);
}

// Directional agreement rewards velocity/acceleration that point the same way.
double VectorDirectionalAgreement(const int direction,
                                  const double velocity,
                                  const double acceleration)
{
   if(direction == 0) return 0.0;

   double v = direction * velocity;
   double a = direction * acceleration;
   double velocityScore = VectorClamp01(0.5 + 0.5 * v);
   double accelerationScore = VectorClamp01(0.5 + 0.5 * a);
   return VectorClamp01((velocityScore * 0.60) + (accelerationScore * 0.40));
}

VECTOR_EDGE_OUTPUT VectorEvaluateEdge(const VECTOR_EDGE_INPUT &input)
{
   VECTOR_EDGE_OUTPUT out;
   out.valid = false;
   out.preferredDirection = 0;
   out.entropy = 1.0;
   out.directionalAgreement = 0.0;
   out.buyEV = 0.0;
   out.sellEV = 0.0;
   out.edgeRatio = 0.0;
   out.fractionalKelly = 0.0;
   out.riskMultiplier = 0.0;
   out.positiveExpectancy = false;
   out.exitEdgeLost = false;
   out.reason = "INVALID";

   double buyP = VectorClamp01(input.buyProbability);
   double sellP = VectorClamp01(input.sellProbability);
   double probabilitySum = buyP + sellP;
   if(probabilitySum <= 0.0000001)
   {
      out.reason = "NO_PROBABILITY_CONTEXT";
      return out;
   }

   // Normalize BUY/SELL probability mass so entropy is comparable.
   buyP /= probabilitySum;
   sellP /= probabilitySum;

   out.entropy = VectorBinaryEntropy(buyP);
   out.buyEV = VectorExpectedValue(buyP,
                                   input.expectedWinMoney,
                                   input.expectedLossMoney,
                                   input.knownCostMoney);
   out.sellEV = VectorExpectedValue(sellP,
                                    input.expectedWinMoney,
                                    input.expectedLossMoney,
                                    input.knownCostMoney);

   if(out.buyEV > out.sellEV)
      out.preferredDirection = 1;
   else if(out.sellEV > out.buyEV)
      out.preferredDirection = -1;
   else
      out.preferredDirection = 0;

   double bestEV = MathMax(out.buyEV, out.sellEV);
   double chosenProbability = out.preferredDirection > 0 ? buyP :
                              out.preferredDirection < 0 ? sellP : 0.5;

   out.directionalAgreement = VectorDirectionalAgreement(out.preferredDirection,
                                                         input.velocity,
                                                         input.acceleration);

   double uncertainty = VectorClamp01(input.modelUncertainty);
   double persistence = VectorClamp01(input.persistence);
   double structure = 1.0 - out.entropy;
   double noisePenalty = MathMax(0.0, input.volatilityNoise) +
                         MathMax(0.0, input.spreadPenalty) +
                         uncertainty;

   // Diagnostic score only. Positive expectancy is required before any score.
   if(bestEV > 0.0)
   {
      double evScale = bestEV / MathMax(0.01,
                                       MathMax(input.expectedLossMoney,
                                               input.knownCostMoney + 0.01));
      double rawEdge = evScale *
                       (0.35 + 0.65 * persistence) *
                       (0.35 + 0.65 * out.directionalAgreement) *
                       (0.50 + 0.50 * structure);
      rawEdge /= (1.0 + noisePenalty);
      out.edgeRatio = MathMin(100.0, MathMax(0.0, rawEdge * 100.0));
      out.positiveExpectancy = true;
   }

   out.fractionalKelly = VectorFractionalKelly(chosenProbability,
                                               input.expectedWinMoney,
                                               input.expectedLossMoney);

   // Conservative diagnostic multiplier. Never used directly by execution V1.
   out.riskMultiplier = VectorClamp01((out.edgeRatio / 100.0) *
                                      (1.0 - uncertainty) *
                                      (0.5 + 0.5 * persistence));

   // Edge-loss diagnostic for a future dynamic-exit shadow observer.
   // It deliberately does not close anything in V1.
   out.exitEdgeLost = (bestEV <= 0.0 ||
                       out.edgeRatio < 20.0 ||
                       out.directionalAgreement < 0.35);

   out.valid = true;
   if(!out.positiveExpectancy)
      out.reason = "NEGATIVE_EXPECTANCY";
   else if(out.edgeRatio < 20.0)
      out.reason = "WEAK_EDGE";
   else if(out.edgeRatio < 40.0)
      out.reason = "OBSERVE_EDGE";
   else if(out.edgeRatio < 60.0)
      out.reason = "MODERATE_EDGE";
   else if(out.edgeRatio < 80.0)
      out.reason = "STRONG_EDGE";
   else
      out.reason = "RARE_EDGE";

   return out;
}

#endif // SCENOVA_AUTO_VECTOR_EDGE_V1_MQH
