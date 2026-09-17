#ifndef SCENOVA_AUTO_VECTOR_EDGE_LIVE_V1_MQH
#define SCENOVA_AUTO_VECTOR_EDGE_LIVE_V1_MQH

// Live AUTO integration for VECTOR EDGE.
// This module never sends or closes orders. It only evaluates the already-built
// AUTO V20 BUY/SELL candidates and may veto a weak decision when BOTH sides have
// enough historical evidence. Cold-start behavior remains permissive.

#define VECTOR_EDGE_LIVE_V1_VERSION "1.0.0"
#define VECTOR_EDGE_LIVE_MIN_HISTORY 20
#define VECTOR_EDGE_LIVE_MIN_RATIO 20.0
#define VECTOR_EDGE_LIVE_MIN_AGREEMENT 0.30

double g_vectorLiveEdgeRatio = 0.0;
double g_vectorLiveEntropy = 1.0;
double g_vectorLiveBuyEV = 0.0;
double g_vectorLiveSellEV = 0.0;
int    g_vectorLivePreferredDirection = 0;
bool   g_vectorLiveEvidenceReady = false;
string g_vectorLiveReason = "NOT_EVALUATED";

double VectorLiveClampSigned(const double value)
{
   if(value < -1.0) return -1.0;
   if(value > 1.0) return 1.0;
   return value;
}

double VectorLiveProbability(const AUTO_V20_SIDE &side)
{
   if(side.winSamples >= VECTOR_EDGE_LIVE_MIN_HISTORY)
      return VectorClamp01(side.winProbability / 100.0);
   return VectorClamp01(side.confidence / 100.0);
}

double VectorLiveGrossProfit(const AUTO_V20_SIDE &side)
{
   if(side.direction != 0 && side.plannedLot > 0.0 &&
      side.entryPrice > 0.0 && side.tpPrice > 0.0)
   {
      double gross = MathAbs(AutoV20ProfitForMove(
         side.direction,side.plannedLot,side.entryPrice,side.tpPrice));
      if(gross > 0.0) return gross;
   }
   if(side.expectedProfitMoney <= 0.0) return 0.0;
   return side.expectedProfitMoney + MathMax(0.0,side.knownCostMoney);
}

double VectorLiveGrossLoss(const AUTO_V20_SIDE &side)
{
   if(side.direction != 0 && side.plannedLot > 0.0 &&
      side.entryPrice > 0.0 && side.slPrice > 0.0)
   {
      double gross = MathAbs(AutoV20ProfitForMove(
         side.direction,side.plannedLot,side.entryPrice,side.slPrice));
      if(gross > 0.0) return gross;
   }
   return MathMax(0.0,side.expectedLossMoney-MathMax(0.0,side.knownCostMoney));
}

double VectorLiveSpreadPenalty()
{
   double spread = CurrentSpreadPoints();
   if(spread <= 0.0 || spread >= 999999.0) return 1.0;
   double reference = g_adaptiveSpreadLimit > 0.0 ? g_adaptiveSpreadLimit :
      (g_spreadP95 > 0.0 ? g_spreadP95 : g_spreadMedian);
   if(reference <= 0.0) return 0.25;
   return MathMin(2.0,MathMax(0.0,spread/reference-1.0));
}

bool AutoVectorEdgeLiveEvaluate(VECTOR_EDGE_OUTPUT &edge)
{
   VECTOR_EDGE_INPUT input;
   input.buyProbability = VectorLiveProbability(g_autoV20Buy);
   input.sellProbability = VectorLiveProbability(g_autoV20Sell);
   input.buyExpectedWinMoney = VectorLiveGrossProfit(g_autoV20Buy);
   input.buyExpectedLossMoney = VectorLiveGrossLoss(g_autoV20Buy);
   input.buyKnownCostMoney = MathMax(0.0,g_autoV20Buy.knownCostMoney);
   input.sellExpectedWinMoney = VectorLiveGrossProfit(g_autoV20Sell);
   input.sellExpectedLossMoney = VectorLiveGrossLoss(g_autoV20Sell);
   input.sellKnownCostMoney = MathMax(0.0,g_autoV20Sell.knownCostMoney);
   input.volatilityNoise = g_atrRatio > 0.0 ?
      MathMin(1.0,MathAbs(g_atrRatio-1.0)) : 0.25;
   input.spreadPenalty = VectorLiveSpreadPenalty();
   double bestConfidence = MathMax(g_autoV20Buy.confidence,g_autoV20Sell.confidence);
   input.modelUncertainty = 1.0-VectorClamp01(bestConfidence/100.0);
   input.persistence = g_autoV20PhaseSince > 0 ?
      VectorClamp01((double)MathMax(0,TimeCurrent()-g_autoV20PhaseSince)/30.0) : 0.0;
   double motionScale = MathMax(1.0,InpStrongFlowPoints);
   input.velocity = VectorLiveClampSigned(g_autoV20LastMomentum/motionScale);
   input.acceleration = VectorLiveClampSigned(
      (g_autoV20LastMomentum-g_autoV20PreviousMomentum)/motionScale);

   edge = VectorEvaluateEdge(input);
   g_vectorLiveEdgeRatio = edge.edgeRatio;
   g_vectorLiveEntropy = edge.entropy;
   g_vectorLiveBuyEV = edge.buyEV;
   g_vectorLiveSellEV = edge.sellEV;
   g_vectorLivePreferredDirection = edge.preferredDirection;
   g_vectorLiveEvidenceReady =
      g_autoV20Buy.winSamples >= VECTOR_EDGE_LIVE_MIN_HISTORY &&
      g_autoV20Sell.winSamples >= VECTOR_EDGE_LIVE_MIN_HISTORY;
   g_vectorLiveReason = edge.reason;
   return edge.valid;
}

bool AutoVectorEdgeLiveAllow(const int direction,string &reason)
{
   reason = "VECTOR_EDGE_NOT_READY";
   VECTOR_EDGE_OUTPUT edge;
   if(!AutoVectorEdgeLiveEvaluate(edge))
   {
      // Never turn temporary diagnostic unavailability into a live trading halt.
      reason = "VECTOR_EDGE_DIAGNOSTIC_UNAVAILABLE";
      return true;
   }

   if(!g_vectorLiveEvidenceReady)
   {
      reason = "VECTOR_EDGE_COLD_START_ALLOW";
      return true;
   }
   if(!edge.positiveExpectancy)
   {
      reason = "VECTOR_EDGE_NO_POSITIVE_EV";
      return false;
   }
   if(edge.preferredDirection != direction)
   {
      reason = "VECTOR_EDGE_DIRECTION_CONFLICT";
      return false;
   }
   if(edge.edgeRatio < VECTOR_EDGE_LIVE_MIN_RATIO)
   {
      reason = "VECTOR_EDGE_TOO_WEAK";
      return false;
   }
   if(edge.directionalAgreement < VECTOR_EDGE_LIVE_MIN_AGREEMENT)
   {
      reason = "VECTOR_EDGE_MOTION_CONFLICT";
      return false;
   }

   reason = "VECTOR_EDGE_CONFIRMED";
   return true;
}

#endif // SCENOVA_AUTO_VECTOR_EDGE_LIVE_V1_MQH
