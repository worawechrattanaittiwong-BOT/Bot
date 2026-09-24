// RACE VNext Phase 1 - compact M5 market structure for RACE only.
#ifndef __SCENOVA_RACE_STRUCTURE_V2_MQH__
#define __SCENOVA_RACE_STRUCTURE_V2_MQH__

double RaceV2WindowHigh(int startShift,int count)
{
   double value=-DBL_MAX;
   for(int i=startShift;i<startShift+count;i++)
      value=MathMax(value,iHigh(_Symbol,PERIOD_M5,i));
   return value;
}

double RaceV2WindowLow(int startShift,int count)
{
   double value=DBL_MAX;
   for(int i=startShift;i<startShift+count;i++)
      value=MathMin(value,iLow(_Symbol,PERIOD_M5,i));
   return value;
}

int RaceV2StructureDirection()
{
   double atrPrice=MathMax(_Point*8.0,AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point);
   double buffer=atrPrice*0.05;

   double recentHigh=RaceV2WindowHigh(1,3);
   double recentLow=RaceV2WindowLow(1,3);
   double priorHigh=RaceV2WindowHigh(4,3);
   double priorLow=RaceV2WindowLow(4,3);

   bool hh=recentHigh>priorHigh+buffer;
   bool hl=recentLow>priorLow+buffer;
   bool lh=recentHigh<priorHigh-buffer;
   bool ll=recentLow<priorLow-buffer;

   if(hh && hl) return 1;
   if(lh && ll) return -1;

   // Transitional structure gets a direction only when both extrema lean the
   // same way; mixed extrema remain neutral instead of creating a fake trend.
   if(recentHigh>priorHigh && recentLow>=priorLow) return 1;
   if(recentHigh<priorHigh && recentLow<=priorLow) return -1;
   return 0;
}

double RaceV2StructureInvalidPrice(int direction)
{
   if(direction>0)
      return RaceV2WindowLow(1,6);
   if(direction<0)
      return RaceV2WindowHigh(1,6);
   return 0.0;
}

#endif
