#ifndef SCENOVA_PARALLEL_UNIVERSE_V1_MQH
#define SCENOVA_PARALLEL_UNIVERSE_V1_MQH

#define PARALLEL_UNIVERSE_V1_VERSION "1.0.1"

string g_parallelUniverseReason="IDLE";
double g_parallelUniverseExpectedValue=0.0;
int g_parallelUniverseSamples=0;

bool ParallelUniverseModeEnabled()
{
   string mode=g_controlMode;
   StringToUpper(mode);
   return mode=="PARALLEL_UNIVERSE";
}

bool ParallelUniverseLiveAllow(const int direction,string &reason)
{
   reason="PARALLEL_ALLOW";
   if(!ParallelUniverseModeEnabled() || direction==0)
      return direction!=0;

   AUTO_V20_SIDE side=direction>0 ? g_autoV20Buy : g_autoV20Sell;
   bool setupMatch=
      g_setupWinSamples>=20 &&
      g_setupHistoryDirection==direction &&
      g_setupHistoryModel==side.model;

   if(setupMatch)
   {
      double p=MathMax(0.0,MathMin(1.0,g_setupWinProbability/100.0));
      double avgWin=MathMax(0.0,g_setupAvgWin);
      double avgLoss=MathAbs(MathMin(0.0,g_setupAvgLoss));
      double ev=p*avgWin-(1.0-p)*avgLoss;
      g_parallelUniverseExpectedValue=ev;
      g_parallelUniverseSamples=g_setupWinSamples;

      if(ev<=0.0)
      {
         g_parallelUniverseReason="MATCHED_SETUP_NEGATIVE_EV";
         reason=g_parallelUniverseReason;
         return false;
      }
      if(g_setupWinProbability<45.0 && g_setupAverageNet<=0.0)
      {
         g_parallelUniverseReason="MATCHED_SETUP_LOW_SURVIVAL";
         reason=g_parallelUniverseReason;
         return false;
      }

      if(g_indicatorHistorySamples>=20 &&
         g_indicatorHistoryWinProbability<42.0 &&
         g_indicatorHistoryExpectedValue<0.0)
      {
         g_parallelUniverseReason="MATCHED_INDICATOR_HISTORY_NEGATIVE";
         reason=g_parallelUniverseReason;
         return false;
      }

      g_parallelUniverseReason="MATCHED_SETUP_CONFIRMED";
      reason=g_parallelUniverseReason;
      return true;
   }

   if(side.winSamples>=30)
   {
      g_parallelUniverseSamples=side.winSamples;
      g_parallelUniverseExpectedValue=side.averageNet;
      if(side.winProbability<42.0 && side.averageNet<0.0)
      {
         g_parallelUniverseReason="SIDE_HISTORY_NEGATIVE";
         reason=g_parallelUniverseReason;
         return false;
      }
   }

   g_parallelUniverseReason="HISTORY_WARMUP_ALLOW";
   reason=g_parallelUniverseReason;
   return true;
}

#endif
