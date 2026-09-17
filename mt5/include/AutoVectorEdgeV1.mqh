#ifndef SCENOVA_AUTO_VECTOR_EDGE_V1_MQH
#define SCENOVA_AUTO_VECTOR_EDGE_V1_MQH

// SCENOVA AUTO VECTOR EDGE V1
// Pure decision-support math for AUTO. No trade/order APIs are allowed here.

#define VECTOR_EDGE_V1_VERSION "1.2.2-shadow"

struct VECTOR_EDGE_INPUT
{
   double buyProbability;
   double sellProbability;
   double buyExpectedWinMoney;
   double buyExpectedLossMoney;
   double buyKnownCostMoney;
   double sellExpectedWinMoney;
   double sellExpectedLossMoney;
   double sellKnownCostMoney;
   double volatilityNoise;
   double spreadPenalty;
   double modelUncertainty;
   double persistence;
   double velocity;
   double acceleration;
};

struct VECTOR_EDGE_OUTPUT
{
   bool valid;
   int preferredDirection;
   double entropy;
   double directionalAgreement;
   double buyEV;
   double sellEV;
   double edgeRatio;
   double fractionalKelly;
   double riskMultiplier;
   bool positiveExpectancy;
   bool exitEdgeLost;
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

double VectorBinaryEntropy(const double probability)
{
   double p = VectorClamp01(probability);
   if(p <= 0.0 || p >= 1.0) return 0.0;
   double q = 1.0 - p;
   return -(p * VectorSafeLog2(p) + q * VectorSafeLog2(q));
}

double VectorExpectedValue(const double winProbability,
                           const double expectedWinMoney,
                           const double expectedLossMoney,
                           const double knownCostMoney)
{
   double p = VectorClamp01(winProbability);
   double win = MathMax(0.0,expectedWinMoney);
   double loss = MathMax(0.0,expectedLossMoney);
   double cost = MathMax(0.0,knownCostMoney);
   return (p * win) - ((1.0 - p) * loss) - cost;
}

double VectorFractionalKelly(const double winProbability,
                             const double expectedWinMoney,
                             const double expectedLossMoney)
{
   double p = VectorClamp01(winProbability);
   double loss = MathMax(0.0000001,expectedLossMoney);
   double b = MathMax(0.0,expectedWinMoney) / loss;
   if(b <= 0.0) return 0.0;

   double fullKelly = (b * p - (1.0 - p)) / b;
   if(fullKelly <= 0.0) return 0.0;
   return MathMin(0.25,fullKelly * 0.25);
}

double VectorDirectionalAgreement(const int direction,
                                  const double velocity,
                                  const double acceleration)
{
   if(direction == 0) return 0.0;
   double velocityScore = VectorClamp01(0.5 + 0.5 * direction * velocity);
   double accelerationScore = VectorClamp01(0.5 + 0.5 * direction * acceleration);
   return VectorClamp01(velocityScore * 0.60 + accelerationScore * 0.40);
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
   out.exitEdgeLost = true;
   out.reason = "INVALID";

   double buyP = VectorClamp01(input.buyProbability);
   double sellP = VectorClamp01(input.sellProbability);
   double probabilitySum = buyP + sellP;

   // Entropy is relative-direction ambiguity only. 0%/0% is valid evidence
   // when historical samples exist upstream; represent it as maximally
   // non-directional rather than invalidating EV math.
   if(probabilitySum > 0.0000001)
      out.entropy = VectorBinaryEntropy(buyP / probabilitySum);
   else
      out.entropy = 1.0;

   // EV/Kelly keep each side's absolute probability; never normalize them.
   out.buyEV = VectorExpectedValue(buyP,input.buyExpectedWinMoney,
                                   input.buyExpectedLossMoney,input.buyKnownCostMoney);
   out.sellEV = VectorExpectedValue(sellP,input.sellExpectedWinMoney,
                                    input.sellExpectedLossMoney,input.sellKnownCostMoney);

   if(out.buyEV > out.sellEV)
      out.preferredDirection = 1;
   else if(out.sellEV > out.buyEV)
      out.preferredDirection = -1;

   double bestEV = MathMax(out.buyEV,out.sellEV);
   double chosenProbability = out.preferredDirection > 0 ? buyP :
                              out.preferredDirection < 0 ? sellP : 0.5;
   double chosenWin = out.preferredDirection > 0 ? input.buyExpectedWinMoney :
                      out.preferredDirection < 0 ? input.sellExpectedWinMoney : 0.0;
   double chosenLoss = out.preferredDirection > 0 ? input.buyExpectedLossMoney :
                       out.preferredDirection < 0 ? input.sellExpectedLossMoney : 0.0;
   double chosenCost = out.preferredDirection > 0 ? input.buyKnownCostMoney :
                       out.preferredDirection < 0 ? input.sellKnownCostMoney : 0.0;

   out.directionalAgreement = VectorDirectionalAgreement(
      out.preferredDirection,input.velocity,input.acceleration
   );

   double uncertainty = VectorClamp01(input.modelUncertainty);
   double persistence = VectorClamp01(input.persistence);
   double structure = 1.0 - out.entropy;
   double noisePenalty = MathMax(0.0,input.volatilityNoise) +
                         MathMax(0.0,input.spreadPenalty) + uncertainty;

   if(bestEV > 0.0 && out.preferredDirection != 0)
   {
      double netLoss = MathMax(0.01,chosenLoss + chosenCost);
      double rawEdge = (bestEV / netLoss) *
                       (0.35 + 0.65 * persistence) *
                       (0.35 + 0.65 * out.directionalAgreement) *
                       (0.50 + 0.50 * structure);
      rawEdge /= (1.0 + noisePenalty);
      out.edgeRatio = MathMin(100.0,MathMax(0.0,rawEdge * 100.0));
      out.positiveExpectancy = true;
   }

   double netWinForKelly = MathMax(0.0,chosenWin - chosenCost);
   double netLossForKelly = MathMax(0.0000001,chosenLoss + chosenCost);
   out.fractionalKelly = VectorFractionalKelly(
      chosenProbability,netWinForKelly,netLossForKelly
   );

   out.riskMultiplier = VectorClamp01((out.edgeRatio / 100.0) *
                                      (1.0 - uncertainty) *
                                      (0.5 + 0.5 * persistence));

   out.exitEdgeLost = (bestEV <= 0.0 || out.preferredDirection == 0 ||
                       out.edgeRatio < 20.0 || out.directionalAgreement < 0.35);

   out.valid = true;
   if(!out.positiveExpectancy)
      out.reason = "NEGATIVE_OR_AMBIGUOUS_EXPECTANCY";
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
