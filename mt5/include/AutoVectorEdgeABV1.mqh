#ifndef SCENOVA_AUTO_VECTOR_EDGE_AB_V1_MQH
#define SCENOVA_AUTO_VECTOR_EDGE_AB_V1_MQH

// Phase 3 counterfactual A/B observer.
// Variant A = existing AUTO V20 (always remains the real execution path).
// Variant B = hypothetical VECTOR EDGE filter over A's accepted decisions.
// This module MUST NOT send/modify/cancel/close orders or write execution state.

#define VECTOR_EDGE_AB_V1_VERSION "1.0.0-counterfactual"

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

   // B is filter-only. It can never promote a rejected/no-trade A decision.
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
   result.variantBReason = "KEEP_AUTO_DECISION";
   return result;
}

#ifndef VECTOR_EDGE_AB_PURE_ONLY

long g_vectorEdgeABLastDecisionId = -1;
long g_vectorEdgeABDecisions = 0;
long g_vectorEdgeABVariantAEntries = 0;
long g_vectorEdgeABVariantBKeep = 0;
long g_vectorEdgeABVariantBBlock = 0;
long g_vectorEdgeABDirectionMismatch = 0;

string VectorEdgeABSummaryJson()
{
   return StringFormat(
      "{\"version\":\"%s\",\"executionEnabled\":false,\"decisions\":%I64d,\"variantAEntries\":%I64d,\"variantBKeep\":%I64d,\"variantBBlock\":%I64d,\"directionMismatch\":%I64d}",
      VECTOR_EDGE_AB_V1_VERSION,
      g_vectorEdgeABDecisions,
      g_vectorEdgeABVariantAEntries,
      g_vectorEdgeABVariantBKeep,
      g_vectorEdgeABVariantBBlock,
      g_vectorEdgeABDirectionMismatch
   );
}

void AutoVectorEdgeABObserve()
{
   // Same hard scope as Phase 2: AUTO V20 only.
   if(!AutoV20Enabled())
      return;

   // A/B samples are decision-scoped, not timer-scoped.
   if(g_autoV20DecisionId <= 0 || g_autoV20DecisionId == g_vectorEdgeABLastDecisionId)
      return;

   g_vectorEdgeABLastDecisionId = g_autoV20DecisionId;
   g_vectorEdgeABDecisions++;

   int aDirection = g_cachedAdaptiveDirection;
   bool aAccepted = (aDirection != 0 && g_autoV20RejectReason == "NONE");

   // Refresh the read-only VECTOR EDGE snapshot from the same AUTO diagnostics.
   VECTOR_EDGE_INPUT input;
   VECTOR_EDGE_OUTPUT edge = g_vectorEdgeShadowOutput;
   if(AutoVectorEdgeShadowBuildInput(input))
      edge = VectorEvaluateEdge(input);

   VECTOR_EDGE_AB_RESULT ab = VectorEdgeABEvaluate(aAccepted,aDirection,edge);

   if(aAccepted)
   {
      g_vectorEdgeABVariantAEntries++;
      if(ab.variantBWouldAllow)
         g_vectorEdgeABVariantBKeep++;
      else
         g_vectorEdgeABVariantBBlock++;
   }
   if(aAccepted && edge.valid && edge.preferredDirection != 0 &&
      edge.preferredDirection != aDirection)
      g_vectorEdgeABDirectionMismatch++;

   // Counterfactual log only. No value below is assigned back to AUTO execution.
   PrintFormat(
      "VECTOR_EDGE_AB {\"version\":\"%s\",\"executionEnabled\":false,\"decisionId\":%I64d,\"decisionKind\":\"%s\",\"aAccepted\":%s,\"aDirection\":%d,\"aReason\":\"%s\",\"aRejectReason\":\"%s\",\"bWouldAllow\":%s,\"bReason\":\"%s\",\"vectorDirection\":%d,\"edgeRatio\":%.2f,\"entropy\":%.4f,\"agreement\":%.4f,\"buyEV\":%.4f,\"sellEV\":%.4f}",
      VECTOR_EDGE_AB_V1_VERSION,
      g_autoV20DecisionId,
      g_autoV20DecisionKind,
      aAccepted ? "true" : "false",
      aDirection,
      g_autoV20DecisionReason,
      g_autoV20RejectReason,
      ab.variantBWouldAllow ? "true" : "false",
      ab.variantBReason,
      edge.preferredDirection,
      edge.edgeRatio,
      edge.entropy,
      edge.directionalAgreement,
      edge.buyEV,
      edge.sellEV
   );

   if(g_vectorEdgeABDecisions % 25 == 0)
      Print("VECTOR_EDGE_AB_SUMMARY ",VectorEdgeABSummaryJson());
}

#endif // VECTOR_EDGE_AB_PURE_ONLY

#endif // SCENOVA_AUTO_VECTOR_EDGE_AB_V1_MQH
