#ifndef SCENOVA_AUTO_VECTOR_EDGE_LIVE_V1_MQH
#define SCENOVA_AUTO_VECTOR_EDGE_LIVE_V1_MQH

#include "AutoVectorEdgeV1.mqh"

#define VECTOR_EDGE_LIVE_V1_VERSION "1.0.0"

double g_vectorEdgeLiveBuyEV = 0.0;
double g_vectorEdgeLiveSellEV = 0.0;
double g_vectorEdgeLiveRatio = 0.0;
double g_vectorEdgeLiveEntropy = 1.0;
string g_vectorEdgeLiveReason = "WARMUP";

bool VectorEdgeLiveBuildInput(VECTOR_EDGE_INPUT &input)
{
   if(!AutoV20Enabled()) return false;

   double buyCost=MathMax(0.0,g_autoV20Buy.knownCostMoney);
   double sellCost=MathMax(0.0,g_autoV20Sell.knownCostMoney);
   double buyGrossWin=MathMax(0.0,g_autoV20Buy.expectedProfitMoney+buyCost);
   double buyGrossLoss=MathMax(0.0,g_autoV20Buy.expectedLossMoney-buyCost);
   double sellGrossWin=MathMax(0.0,g_autoV20Sell.expectedProfitMoney+sellCost);
   double sellGrossLoss=MathMax(0.0,g_autoV20Sell.expectedLossMoney-sellCost);

   input.buyProbability=VectorClamp01(g_autoV20Buy.winProbability/100.0);
   input.sellProbability=VectorClamp01(g_autoV20Sell.winProbability/100.0);
   input.buyExpectedWinMoney=buyGrossWin;
   input.buyExpectedLossMoney=buyGrossLoss;
   input.buyKnownCostMoney=buyCost;
   input.sellExpectedWinMoney=sellGrossWin;
   input.sellExpectedLossMoney=sellGrossLoss;
   input.sellKnownCostMoney=sellCost;
   input.volatilityNoise=MathMin(1.0,MathAbs(g_atrRatio-1.0));

   double spreadRef=g_adaptiveSpreadLimit>0.0 ? g_adaptiveSpreadLimit : g_spreadP95;
   if(spreadRef<=0.0) spreadRef=MathMax(1.0,g_spreadMedian);
   input.spreadPenalty=MathMax(0.0,MathMin(2.0,CurrentSpreadPoints()/MathMax(1.0,spreadRef)-1.0));

   double bestConfidence=MathMax(g_autoV20Buy.confidence,g_autoV20Sell.confidence);
   input.modelUncertainty=1.0-VectorClamp01(bestConfidence/100.0);
   input.persistence=g_autoV20PhaseSince>0
      ? VectorClamp01((double)MathMax(0,TimeCurrent()-g_autoV20PhaseSince)/30.0)
      : 0.0;
   double motionScale=MathMax(1.0,InpStrongFlowPoints);
   input.velocity=MathMax(-1.0,MathMin(1.0,g_autoV20LastMomentum/motionScale));
   input.acceleration=MathMax(-1.0,MathMin(1.0,(g_autoV20LastMomentum-g_autoV20PreviousMomentum)/motionScale));
   return true;
}

bool AutoVectorEdgeLiveAllow(const int direction,string &reason)
{
   reason="VECTOR_ALLOW";
   if(direction==0 || !AutoV20Enabled()) return direction!=0;

   // Do not let an uncalibrated warm-up sample change live trading behavior.
   if(g_autoV20Buy.winSamples<20 || g_autoV20Sell.winSamples<20)
   {
      g_vectorEdgeLiveReason="WARMUP_ALLOW";
      reason=g_vectorEdgeLiveReason;
      return true;
   }

   VECTOR_EDGE_INPUT input;
   if(!VectorEdgeLiveBuildInput(input))
   {
      reason="VECTOR_INPUT_UNAVAILABLE_ALLOW";
      return true;
   }

   VECTOR_EDGE_OUTPUT edge=VectorEvaluateEdge(input);
   g_vectorEdgeLiveBuyEV=edge.buyEV;
   g_vectorEdgeLiveSellEV=edge.sellEV;
   g_vectorEdgeLiveRatio=edge.edgeRatio;
   g_vectorEdgeLiveEntropy=edge.entropy;

   if(!edge.valid)
   {
      g_vectorEdgeLiveReason="INVALID_ALLOW";
      reason=g_vectorEdgeLiveReason;
      return true;
   }
   if(!edge.positiveExpectancy)
   {
      g_vectorEdgeLiveReason="VECTOR_NEGATIVE_EV";
      reason=g_vectorEdgeLiveReason;
      return false;
   }
   if(edge.preferredDirection!=0 && edge.preferredDirection!=direction)
   {
      g_vectorEdgeLiveReason="VECTOR_DIRECTION_DISAGREE";
      reason=g_vectorEdgeLiveReason;
      return false;
   }
   if(edge.edgeRatio<15.0)
   {
      g_vectorEdgeLiveReason="VECTOR_EDGE_TOO_WEAK";
      reason=g_vectorEdgeLiveReason;
      return false;
   }

   g_vectorEdgeLiveReason="VECTOR_CONFIRMED";
   reason=g_vectorEdgeLiveReason;
   return true;
}

#endif
