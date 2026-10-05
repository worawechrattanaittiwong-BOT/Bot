#ifndef SCENOVA_AUTO_VECTOR_EDGE_LIVE_MQH
#define SCENOVA_AUTO_VECTOR_EDGE_LIVE_MQH

#include "AutoVectorEdge.mqh"

#define VECTOR_EDGE_LIVE_BUILD "1.2.0"

double g_vectorEdgeLiveBuyEV = 0.0;
double g_vectorEdgeLiveSellEV = 0.0;
double g_vectorEdgeLiveRatio = 0.0;
double g_vectorEdgeLiveEntropy = 1.0;
string g_vectorEdgeLiveReason = "WARMUP";

bool VectorEdgeLiveBuildInput(VECTOR_EDGE_INPUT &edgeInput,const int selectedDirection=0)
{
   if(!AutoEnabled()) return false;

   double buyCost=MathMax(0.0,g_autoBuy.knownCostMoney);
   double sellCost=MathMax(0.0,g_autoSell.knownCostMoney);
   double buyGrossWin=MathMax(0.0,g_autoBuy.expectedProfitMoney+buyCost);
   double buyGrossLoss=MathMax(0.0,g_autoBuy.expectedLossMoney-buyCost);
   double sellGrossWin=MathMax(0.0,g_autoSell.expectedProfitMoney+sellCost);
   double sellGrossLoss=MathMax(0.0,g_autoSell.expectedLossMoney-sellCost);

   edgeInput.buyProbability=VectorClamp01(g_autoBuy.winProbability/100.0);
   edgeInput.sellProbability=VectorClamp01(g_autoSell.winProbability/100.0);
   edgeInput.buyExpectedWinMoney=buyGrossWin;
   edgeInput.buyExpectedLossMoney=buyGrossLoss;
   edgeInput.buyKnownCostMoney=buyCost;
   edgeInput.sellExpectedWinMoney=sellGrossWin;
   edgeInput.sellExpectedLossMoney=sellGrossLoss;
   edgeInput.sellKnownCostMoney=sellCost;
   edgeInput.volatilityNoise=MathMin(1.0,MathAbs(g_atrRatio-1.0));

   double spreadRef=g_adaptiveSpreadLimit>0.0 ? g_adaptiveSpreadLimit : g_spreadP95;
   if(spreadRef<=0.0) spreadRef=MathMax(1.0,g_spreadMedian);
   edgeInput.spreadPenalty=MathMax(0.0,MathMin(2.0,CurrentSpreadPoints()/MathMax(1.0,spreadRef)-1.0));

   // Uncertainty follows the side being evaluated. A strong opposite-side
   // score must not make the selected side look artificially certain.
   double selectedConfidence=MathMax(g_autoBuy.confidence,g_autoSell.confidence);
   if(selectedDirection>0) selectedConfidence=g_autoBuy.confidence;
   else if(selectedDirection<0) selectedConfidence=g_autoSell.confidence;
   edgeInput.modelUncertainty=1.0-VectorClamp01(selectedConfidence/100.0);
   edgeInput.persistence=g_autoPhaseSince>0
      ? VectorClamp01((double)MathMax(0,TimeCurrent()-g_autoPhaseSince)/30.0)
      : 0.0;
   double motionScale=MathMax(1.0,InpStrongFlowPoints);
   edgeInput.velocity=MathMax(-1.0,MathMin(1.0,g_autoLastMomentum/motionScale));
   edgeInput.acceleration=MathMax(-1.0,MathMin(1.0,(g_autoLastMomentum-g_autoPreviousMomentum)/motionScale));
   return true;
}

bool AutoVectorEdgeLiveAllow(const int direction,string &reason)
{
   reason="VECTOR_ALLOW";
   if(direction==0 || !AutoEnabled()) return direction!=0;

   int selectedSamples=direction>0 ? g_autoBuy.winSamples : g_autoSell.winSamples;
   int oppositeSamples=direction>0 ? g_autoSell.winSamples : g_autoBuy.winSamples;
   if(selectedSamples<20)
   {
      g_vectorEdgeLiveReason="SELECTED_SIDE_WARMUP_ALLOW";
      reason=g_vectorEdgeLiveReason;
      return true;
   }

   VECTOR_EDGE_INPUT edgeInput;
   if(!VectorEdgeLiveBuildInput(edgeInput,direction))
   {
      reason="VECTOR_INPUT_UNAVAILABLE_ALLOW";
      return true;
   }

   VECTOR_EDGE_OUTPUT edge=VectorEvaluateEdge(edgeInput);
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
   double selectedEV=direction>0 ? edge.buyEV : edge.sellEV;
   if(selectedEV<=0.0)
   {
      g_vectorEdgeLiveReason="VECTOR_SELECTED_NEGATIVE_EV";
      reason=g_vectorEdgeLiveReason;
      return false;
   }
   if(oppositeSamples>=20)
   {
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
   }

   g_vectorEdgeLiveReason="VECTOR_CONFIRMED";
   reason=g_vectorEdgeLiveReason;
   return true;
}

bool AutoVectorEdgeLiveExitLost(const int direction)
{
   if(direction==0 || !AutoEnabled()) return false;
   int selectedSamples=direction>0 ? g_autoBuy.winSamples : g_autoSell.winSamples;
   if(selectedSamples<20) return false;
   VECTOR_EDGE_INPUT edgeInput;
   if(!VectorEdgeLiveBuildInput(edgeInput,direction)) return false;
   VECTOR_EDGE_OUTPUT edge=VectorEvaluateEdge(edgeInput);
   if(!edge.valid) return false;
   double selectedEV=direction>0 ? edge.buyEV : edge.sellEV;
   int oppositeSamples=direction>0 ? g_autoSell.winSamples : g_autoBuy.winSamples;
   if(selectedEV<=0.0) return true;
   // Confirmation only: never a direct close and never a lot-sizing signal.
   return oppositeSamples>=20 && edge.exitEdgeLost && edge.preferredDirection==-direction;
}

#endif
