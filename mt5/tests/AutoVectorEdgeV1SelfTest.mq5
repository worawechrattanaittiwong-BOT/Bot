#property strict
#property script_show_inputs

#include "..\include\AutoVectorEdgeV1.mqh"

int g_vectorTestPassed = 0;
int g_vectorTestFailed = 0;

void VectorTestCheck(const bool condition,const string name)
{
   if(condition)
   {
      g_vectorTestPassed++;
      Print("PASS: ",name);
   }
   else
   {
      g_vectorTestFailed++;
      Print("FAIL: ",name);
   }
}

VECTOR_EDGE_INPUT VectorTestBaseInput()
{
   VECTOR_EDGE_INPUT input;
   input.buyProbability = 0.70;
   input.sellProbability = 0.30;
   input.buyExpectedWinMoney = 10.0;
   input.buyExpectedLossMoney = 4.0;
   input.buyKnownCostMoney = 0.5;
   input.sellExpectedWinMoney = 7.0;
   input.sellExpectedLossMoney = 5.0;
   input.sellKnownCostMoney = 0.5;
   input.volatilityNoise = 0.10;
   input.spreadPenalty = 0.10;
   input.modelUncertainty = 0.15;
   input.persistence = 0.80;
   input.velocity = 0.70;
   input.acceleration = 0.40;
   return input;
}

void OnStart()
{
   VECTOR_EDGE_INPUT balanced = VectorTestBaseInput();
   balanced.buyProbability = 0.50;
   balanced.sellProbability = 0.50;
   VECTOR_EDGE_OUTPUT balancedOut = VectorEvaluateEdge(balanced);
   VectorTestCheck(balancedOut.valid,"50/50 input is valid");
   VectorTestCheck(balancedOut.entropy > 0.99,"50/50 probability has high entropy");

   VECTOR_EDGE_INPUT directional = VectorTestBaseInput();
   directional.buyProbability = 0.90;
   directional.sellProbability = 0.10;
   VECTOR_EDGE_OUTPUT directionalOut = VectorEvaluateEdge(directional);
   VectorTestCheck(directionalOut.entropy < balancedOut.entropy,
                   "directional probability lowers entropy");
   VectorTestCheck(directionalOut.preferredDirection == 1,
                   "strong BUY economics prefer BUY");

   VECTOR_EDGE_INPUT baseInput = VectorTestBaseInput();
   VECTOR_EDGE_OUTPUT baseOut = VectorEvaluateEdge(baseInput);

   VECTOR_EDGE_INPUT expensive = VectorTestBaseInput();
   expensive.buyKnownCostMoney = 5.0;
   VECTOR_EDGE_OUTPUT expensiveOut = VectorEvaluateEdge(expensive);
   VectorTestCheck(expensiveOut.buyEV < baseOut.buyEV,
                   "higher known cost reduces BUY EV");

   VECTOR_EDGE_INPUT negative = VectorTestBaseInput();
   negative.buyExpectedWinMoney = 1.0;
   negative.buyExpectedLossMoney = 10.0;
   negative.buyKnownCostMoney = 2.0;
   negative.sellExpectedWinMoney = 1.0;
   negative.sellExpectedLossMoney = 10.0;
   negative.sellKnownCostMoney = 2.0;
   VECTOR_EDGE_OUTPUT negativeOut = VectorEvaluateEdge(negative);
   VectorTestCheck(!negativeOut.positiveExpectancy,
                   "negative EV is not positive expectancy");
   VectorTestCheck(negativeOut.edgeRatio <= 0.000001,
                   "negative EV cannot create edge score");

   VectorTestCheck(baseOut.fractionalKelly >= 0.0 &&
                   baseOut.fractionalKelly <= 0.25,
                   "fractional Kelly stays within hard cap");
   VectorTestCheck(baseOut.riskMultiplier >= 0.0 &&
                   baseOut.riskMultiplier <= 1.0,
                   "diagnostic risk multiplier stays normalized");

   PrintFormat("VECTOR_EDGE_SELF_TEST passed=%d failed=%d",
               g_vectorTestPassed,g_vectorTestFailed);
}
