#ifndef SCENOVA_AUTO_VECTOR_EDGE_AB_V1_MQH
#define SCENOVA_AUTO_VECTOR_EDGE_AB_V1_MQH

// Phase 3 counterfactual A/B observer.
// Variant A = actual existing AUTO V20 entries.
// Variant B = hypothetical VECTOR EDGE filter over those actual entries.
// B is filter-only and has no execution authority.

#define VECTOR_EDGE_AB_V1_VERSION "1.2.0-actual-entry-counterfactual"

const bool VECTOR_EDGE_AB_EXECUTION_ENABLED = false;
const double VECTOR_EDGE_AB_MIN_EDGE_RATIO = 40.0;
const double VECTOR_EDGE_AB_MIN_AGREEMENT = 0.35;
const double VECTOR_EDGE_AB_MAX_ENTROPY = 0.98;

struct VECTOR_EDGE_AB_RESULT
{
   bool valid;
   bool variantAAccepted;
   int variantADirection;
   bool variantBWouldAllow;
   string variantBReason;
};

VECTOR_EDGE_AB_RESULT VectorEdgeABEvaluate(const bool variantAAccepted,
                                           const int variantADirection,
                                           const VECTOR_EDGE_OUTPUT &edge)
{
   VECTOR_EDGE_AB_RESULT result;
   result.valid = true;
   result.variantAAccepted = variantAAccepted;
   result.variantADirection = variantADirection;
   result.variantBWouldAllow = false;
   result.variantBReason = "A_DID_NOT_ENTER";

   if(!variantAAccepted || variantADirection == 0)
      return result;

   if(!edge.valid)
   {
      result.variantBReason = "VECTOR_INVALID";
      return result;
   }
   if(!edge.positiveExpectancy)
   {
      result.variantBReason = "NO_POSITIVE_EXPECTANCY";
      return result;
   }
   if(edge.preferredDirection != variantADirection)
   {
      result.variantBReason = "DIRECTION_DISAGREEMENT";
      return result;
   }
   if(edge.edgeRatio < VECTOR_EDGE_AB_MIN_EDGE_RATIO)
   {
      result.variantBReason = "EDGE_BELOW_40";
      return result;
   }
   if(edge.directionalAgreement < VECTOR_EDGE_AB_MIN_AGREEMENT)
   {
      result.variantBReason = "MOTION_DISAGREEMENT";
      return result;
   }
   if(edge.entropy > VECTOR_EDGE_AB_MAX_ENTROPY)
   {
      result.variantBReason = "ENTROPY_TOO_HIGH";
      return result;
   }

   result.variantBWouldAllow = true;
   result.variantBReason = "KEEP_AUTO_ENTRY";
   return result;
}

#ifndef VECTOR_EDGE_AB_PURE_ONLY

long g_vectorEdgeABActualEntries = 0;
long g_vectorEdgeABEvaluatedEntries = 0;
long g_vectorEdgeABVariantBKeep = 0;
long g_vectorEdgeABVariantBBlock = 0;
long g_vectorEdgeABDirectionMismatch = 0;
long g_vectorEdgeABInvalidSnapshots = 0;
long g_vectorEdgeABInsufficientEvidence = 0;

bool VectorEdgeABEvidenceReady()
{
   // Preferred direction compares BUY vs SELL EV. Do not mix a historical win
   // probability on one side with an uncalibrated model-score proxy on the other.
   return g_autoV20Buy.winSamples >= 20 && g_autoV20Sell.winSamples >= 20;
}

string VectorEdgeABSummaryJson()
{
   return StringFormat(
      "{\"version\":\"%s\",\"executionEnabled\":false,\"actualAEntries\":%I64d,\"evaluatedEntries\":%I64d,\"variantBKeep\":%I64d,\"variantBBlock\":%I64d,\"directionMismatch\":%I64d,\"invalidSnapshots\":%I64d,\"insufficientEvidence\":%I64d}",
      VECTOR_EDGE_AB_V1_VERSION,
      g_vectorEdgeABActualEntries,
      g_vectorEdgeABEvaluatedEntries,
      g_vectorEdgeABVariantBKeep,
      g_vectorEdgeABVariantBBlock,
      g_vectorEdgeABDirectionMismatch,
      g_vectorEdgeABInvalidSnapshots,
      g_vectorEdgeABInsufficientEvidence
   );
}

void AutoVectorEdgeABObserveActualEntry(const int actualDirection)
{
   if(!AutoV20Enabled() || actualDirection == 0)
      return;

   g_vectorEdgeABActualEntries++;

   VECTOR_EDGE_INPUT input;
   VECTOR_EDGE_OUTPUT edge;
   edge.valid = false;
   edge.preferredDirection = 0;
   edge.entropy = 1.0;
   edge.directionalAgreement = 0.0;
   edge.buyEV = 0.0;
   edge.sellEV = 0.0;
   edge.edgeRatio = 0.0;
   edge.fractionalKelly = 0.0;
   edge.riskMultiplier = 0.0;
   edge.positiveExpectancy = false;
   edge.exitEdgeLost = true;
   edge.reason = "SNAPSHOT_UNAVAILABLE";

   if(AutoVectorEdgeShadowBuildInput(input))
      edge = VectorEvaluateEdge(input);

   bool evidenceReady = VectorEdgeABEvidenceReady();
   if(!evidenceReady)
   {
      g_vectorEdgeABInsufficientEvidence++;
      PrintFormat(
         "VECTOR_EDGE_AB_ENTRY {\"version\":\"%s\",\"executionEnabled\":false,\"actualEntry\":true,\"evaluated\":false,\"decisionId\":%I64d,\"aDirection\":%d,\"probabilitySource\":\"%s\",\"bReason\":\"INSUFFICIENT_TWO_SIDE_HISTORY\"}",
         VECTOR_EDGE_AB_V1_VERSION,g_autoV20DecisionId,actualDirection,
         g_vectorEdgeShadowProbabilitySource
      );
      return;
   }

   if(!edge.valid)
   {
      g_vectorEdgeABInvalidSnapshots++;
      PrintFormat(
         "VECTOR_EDGE_AB_ENTRY {\"version\":\"%s\",\"executionEnabled\":false,\"actualEntry\":true,\"evaluated\":false,\"decisionId\":%I64d,\"aDirection\":%d,\"bReason\":\"VECTOR_INVALID\"}",
         VECTOR_EDGE_AB_V1_VERSION,g_autoV20DecisionId,actualDirection
      );
      return;
   }

   g_vectorEdgeABEvaluatedEntries++;
   VECTOR_EDGE_AB_RESULT ab = VectorEdgeABEvaluate(true,actualDirection,edge);

   if(ab.variantBWouldAllow)
      g_vectorEdgeABVariantBKeep++;
   else
      g_vectorEdgeABVariantBBlock++;

   if(edge.preferredDirection != 0 && edge.preferredDirection != actualDirection)
      g_vectorEdgeABDirectionMismatch++;

   PrintFormat(
      "VECTOR_EDGE_AB_ENTRY {\"version\":\"%s\",\"executionEnabled\":false,\"actualEntry\":true,\"evaluated\":true,\"decisionId\":%I64d,\"decisionKind\":\"%s\",\"aDirection\":%d,\"aReason\":\"%s\",\"probabilitySource\":\"%s\",\"bWouldAllow\":%s,\"bReason\":\"%s\",\"vectorDirection\":%d,\"edgeRatio\":%.2f,\"entropy\":%.4f,\"agreement\":%.4f,\"buyEV\":%.4f,\"sellEV\":%.4f}",
      VECTOR_EDGE_AB_V1_VERSION,
      g_autoV20DecisionId,
      g_autoV20DecisionKind,
      actualDirection,
      g_autoV20DecisionReason,
      g_vectorEdgeShadowProbabilitySource,
      ab.variantBWouldAllow ? "true" : "false",
      ab.variantBReason,
      edge.preferredDirection,
      edge.edgeRatio,
      edge.entropy,
      edge.directionalAgreement,
      edge.buyEV,
      edge.sellEV
   );

   if(g_vectorEdgeABActualEntries % 25 == 0)
      Print("VECTOR_EDGE_AB_SUMMARY ",VectorEdgeABSummaryJson());
}

#endif // VECTOR_EDGE_AB_PURE_ONLY

#endif // SCENOVA_AUTO_VECTOR_EDGE_AB_V1_MQH
