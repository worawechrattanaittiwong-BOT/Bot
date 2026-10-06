#property strict
#property script_show_inputs

#include "..\include\AutoVectorEdge.mqh"
#define VECTOR_EDGE_AB_PURE_ONLY
#include "..\include\AutoVectorEdgeAB.mqh"
#undef VECTOR_EDGE_AB_PURE_ONLY

int g_abTestPassed = 0;
int g_abTestFailed = 0;

void ABTestCheck(const bool condition,const string name)
{
   if(condition)
   {
      g_abTestPassed++;
      Print("PASS: ",name);
   }
   else
   {
      g_abTestFailed++;
      Print("FAIL: ",name);
   }
}

VECTOR_EDGE_OUTPUT ABStrongEdge(const int direction)
{
   VECTOR_EDGE_OUTPUT edge;
   edge.valid = true;
   edge.preferredDirection = direction;
   edge.entropy = 0.55;
   edge.directionalAgreement = 0.80;
   edge.buyEV = direction > 0 ? 4.0 : 1.0;
   edge.sellEV = direction < 0 ? 4.0 : 1.0;
   edge.edgeRatio = 70.0;
   edge.fractionalKelly = 0.05;
   edge.riskMultiplier = 0.50;
   edge.positiveExpectancy = true;
   edge.exitEdgeLost = false;
   edge.reason = "STRONG_EDGE";
   return edge;
}

void OnStart()
{
   ABTestCheck(!VECTOR_EDGE_AB_EXECUTION_ENABLED,
               "Phase 3 execution flag is hard OFF");

   VECTOR_EDGE_OUTPUT buyEdge = ABStrongEdge(1);
   VECTOR_EDGE_AB_RESULT keep = VectorEdgeABEvaluate(true,1,buyEdge);
   ABTestCheck(keep.variantBWouldAllow,
               "matching strong BUY is kept counterfactually");

   VECTOR_EDGE_AB_RESULT noPromote = VectorEdgeABEvaluate(false,0,buyEdge);
   ABTestCheck(!noPromote.variantBWouldAllow &&
               noPromote.variantBReason == "A_DID_NOT_ENTER",
               "Variant B never promotes an AUTO no-trade");

   VECTOR_EDGE_OUTPUT sellEdge = ABStrongEdge(-1);
   VECTOR_EDGE_AB_RESULT mismatch = VectorEdgeABEvaluate(true,1,sellEdge);
   ABTestCheck(!mismatch.variantBWouldAllow &&
               mismatch.variantBReason == "DIRECTION_DISAGREEMENT",
               "direction disagreement blocks B only");

   VECTOR_EDGE_OUTPUT weak = ABStrongEdge(1);
   weak.edgeRatio = 25.0;
   VECTOR_EDGE_AB_RESULT weakResult = VectorEdgeABEvaluate(true,1,weak);
   ABTestCheck(!weakResult.variantBWouldAllow &&
               weakResult.variantBReason == "EDGE_BELOW_40",
               "weak edge is counterfactually blocked");

   VECTOR_EDGE_OUTPUT negative = ABStrongEdge(1);
   negative.positiveExpectancy = false;
   negative.edgeRatio = 0.0;
   VECTOR_EDGE_AB_RESULT negativeResult = VectorEdgeABEvaluate(true,1,negative);
   ABTestCheck(!negativeResult.variantBWouldAllow &&
               negativeResult.variantBReason == "NO_POSITIVE_EXPECTANCY",
               "negative expectancy is blocked");

   VECTOR_EDGE_OUTPUT noisy = ABStrongEdge(1);
   noisy.directionalAgreement = 0.20;
   VECTOR_EDGE_AB_RESULT noisyResult = VectorEdgeABEvaluate(true,1,noisy);
   ABTestCheck(!noisyResult.variantBWouldAllow &&
               noisyResult.variantBReason == "MOTION_DISAGREEMENT",
               "low motion agreement is blocked");

   PrintFormat("VECTOR_EDGE_AB_SELF_TEST passed=%d failed=%d",
               g_abTestPassed,g_abTestFailed);
}
