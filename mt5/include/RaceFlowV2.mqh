// RACE VNext Phase 1 - candle flow only. No non-RACE state is touched.
#ifndef __SCENOVA_RACE_FLOW_V2_MQH__
#define __SCENOVA_RACE_FLOW_V2_MQH__

int RaceV2SignedDirection(double value)
{
   if(value>0.15) return 1;
   if(value<-0.15) return -1;
   return 0;
}

double RaceV2FlowScore()
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   int copied=CopyRates(_Symbol,PERIOD_M5,1,7,rates);
   if(copied<5)
      return 0.0;

   double atr=MathMax(1.0,AverageTrueRangePoints(PERIOD_M5,g_atrPeriod));
   double score=0.0;
   int limit=MathMin(copied,7);
   for(int i=0;i<limit;i++)
   {
      double body=(rates[i].close-rates[i].open)/_Point;
      double range=MathMax(_Point,rates[i].high-rates[i].low)/_Point;
      double efficiency=MathMin(1.0,MathAbs(body)/MathMax(1.0,range));
      double normalized=MathMin(1.5,MathAbs(body)/atr);
      double recency=1.0-(double)i/(double)(limit+1);
      if(body>0.0)
         score+=(0.55+efficiency*0.45)*normalized*recency;
      else if(body<0.0)
         score-=(0.55+efficiency*0.45)*normalized*recency;
   }

   // Reward orderly continuation: 3 of the latest 4 closed candles agreeing
   // is more useful to RACE than one oversized candle.
   int bulls=0,sells=0;
   int recent=MathMin(copied,4);
   for(int i=0;i<recent;i++)
   {
      if(rates[i].close>rates[i].open) bulls++;
      else if(rates[i].close<rates[i].open) sells++;
   }
   if(bulls>=3) score+=0.80;
   if(sells>=3) score-=0.80;

   return MathMax(-4.0,MathMin(4.0,score));
}

int RaceV2RejectionDirection()
{
   MqlRates rates[];
   ArraySetAsSeries(rates,true);
   if(CopyRates(_Symbol,PERIOD_M5,1,2,rates)<2)
      return 0;

   double range=MathMax(_Point,rates[0].high-rates[0].low);
   double bodyHigh=MathMax(rates[0].open,rates[0].close);
   double bodyLow=MathMin(rates[0].open,rates[0].close);
   double upper=rates[0].high-bodyHigh;
   double lower=bodyLow-rates[0].low;

   if(lower/range>=0.42 && lower>upper*1.35)
      return 1;
   if(upper/range>=0.42 && upper>lower*1.35)
      return -1;
   return 0;
}

#endif
