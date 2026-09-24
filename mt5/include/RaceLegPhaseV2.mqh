// RACE VNext Phase 1 - leg phase classifier. Advisory to RACE direction only.
#ifndef __SCENOVA_RACE_LEG_PHASE_V2_MQH__
#define __SCENOVA_RACE_LEG_PHASE_V2_MQH__

string RaceV2LegPhase(
   int volumeDirection,
   int flowDirection,
   int structureDirection,
   int rejectionDirection
)
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,6,rates);
   if(copied<5)
      return "START";

   double atr=MathMax(1.0,AverageTrueRangePoints(PERIOD_M5,g_atrPeriod));
   double body0=MathAbs(rates[0].close-rates[0].open)/_Point;
   double body1=MathAbs(rates[1].close-rates[1].open)/_Point;
   double body2=MathAbs(rates[2].close-rates[2].open)/_Point;

   bool shrinking=body0<body1*0.72 && body1<body2*1.05;
   bool rejectionAgainst=rejectionDirection!=0 && rejectionDirection==-volumeDirection;

   if((shrinking && rejectionAgainst) ||
      (flowDirection!=0 && flowDirection==-volumeDirection &&
       structureDirection!=volumeDirection))
      return "EXHAUSTION";

   if(flowDirection==volumeDirection && structureDirection==volumeDirection)
   {
      if(body0>=atr*0.65 || body1>=atr*0.65)
         return "EXPANSION";
      return "CONTINUATION";
   }

   if(structureDirection==volumeDirection && flowDirection!=volumeDirection)
      return "PULLBACK";

   if(structureDirection==0)
      return "START";

   return "TRANSITION";
}

#endif
