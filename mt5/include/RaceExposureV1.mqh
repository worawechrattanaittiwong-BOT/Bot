// RACE VNext Phase 2 - exposure math isolated to RACE.
#ifndef __SCENOVA_RACE_EXPOSURE_V1_MQH__
#define __SCENOVA_RACE_EXPOSURE_V1_MQH__

double RaceV1OpenVolume()
{
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
         StringFind(PositionGetString(POSITION_COMMENT),"SaaSRace")<0)
         continue;
      total+=PositionGetDouble(POSITION_VOLUME);
   }
   return MathMax(0.0,total);
}

double RaceV1AverageEntry()
{
   double volume=0.0;
   double weighted=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
   {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket))
         continue;
      if(PositionGetString(POSITION_SYMBOL)!=_Symbol ||
         PositionGetInteger(POSITION_MAGIC)!=InpMagic ||
         StringFind(PositionGetString(POSITION_COMMENT),"SaaSRace")<0)
         continue;
      double lot=PositionGetDouble(POSITION_VOLUME);
      double price=PositionGetDouble(POSITION_PRICE_OPEN);
      volume+=lot;
      weighted+=lot*price;
   }
   return volume>0.0 ? weighted/volume : 0.0;
}

double RaceV1MoneyPerPoint(double volume)
{
   if(volume<=0.0)
      return 0.0;
   double tickSize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
   double tickValue=MathAbs(SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE_PROFIT));
   if(tickValue<=0.0)
      tickValue=MathAbs(SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE));
   if(tickSize<=0.0 || tickValue<=0.0)
      return 0.0;
   return tickValue*(_Point/tickSize)*volume;
}

double RaceV1EntryCommissionMoney()
{
   if(g_raceCycleStartedAt<=0)
      return 0.0;
   datetime from=g_raceCycleStartedAt-60;
   if(!HistorySelect(from,TimeCurrent()))
      return 0.0;

   double cost=0.0;
   int total=HistoryDealsTotal();
   for(int i=0;i<total;i++)
   {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0)
         continue;
      if(HistoryDealGetString(deal,DEAL_SYMBOL)!=_Symbol ||
         HistoryDealGetInteger(deal,DEAL_MAGIC)!=InpMagic)
         continue;
      long entry=HistoryDealGetInteger(deal,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_IN && entry!=DEAL_ENTRY_INOUT)
         continue;
      string comment=HistoryDealGetString(deal,DEAL_COMMENT);
      if(StringFind(comment,"SaaSRace")<0)
         continue;
      cost+=MathAbs(HistoryDealGetDouble(deal,DEAL_COMMISSION));
   }
   return cost;
}

double RaceV1CurrentPrice(int direction)
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol,tick))
      return 0.0;
   if(direction>0) return tick.bid;
   if(direction<0) return tick.ask;
   return (tick.bid+tick.ask)*0.5;
}

double RaceV1AdversePoints(int direction)
{
   double average=RaceV1AverageEntry();
   double price=RaceV1CurrentPrice(direction);
   if(average<=0.0 || price<=0.0 || direction==0)
      return 0.0;
   double signedProgress=direction>0
      ? (price-average)/_Point
      : (average-price)/_Point;
   return MathMax(0.0,-signedProgress);
}

void RaceV1UpdateExposureTelemetry(int direction,double nextVolume)
{
   double currentVolume=RaceV1OpenVolume();
   double average=RaceV1AverageEntry();
   double projectedVolume=currentVolume+MathMax(0.0,nextVolume);

   double currentPrice=RaceV1CurrentPrice(direction);
   double projectedAverage=average;
   if(nextVolume>0.0 && currentPrice>0.0)
   {
      projectedAverage=currentVolume>0.0
         ? (average*currentVolume+currentPrice*nextVolume)/projectedVolume
         : currentPrice;
   }

   double spread=CurrentSpreadPoints();
   if(spread<=0.0 || spread>=999999.0)
      spread=0.0;
   double atrM1=MathMax(1.0,AverageTrueRangePoints(PERIOD_M1,g_atrPeriod));
   double atrM5=MathMax(1.0,AverageTrueRangePoints(PERIOD_M5,g_atrPeriod));

   double noisePoints=MathMax(
      spread*2.50,
      MathMax(atrM1*0.55,atrM5*0.18)
   );

   double moneyPerPoint=RaceV1MoneyPerPoint(projectedVolume);
   double commission=RaceV1EntryCommissionMoney();
   double estimatedCost=spread*moneyPerPoint+commission;
   double noiseMoney=noisePoints*moneyPerPoint+commission;

   double invalidPrice=RaceV2StructureInvalidPrice(direction);
   double structureLoss=0.0;
   if(projectedAverage>0.0 && invalidPrice>0.0 && moneyPerPoint>0.0)
   {
      double atrBufferPrice=atrM5*_Point*0.18;
      double stopPrice=direction>0
         ? invalidPrice-atrBufferPrice
         : invalidPrice+atrBufferPrice;
      double distancePoints=MathAbs(projectedAverage-stopPrice)/_Point;
      structureLoss=distancePoints*moneyPerPoint+estimatedCost;
   }

   g_raceExposureTotalLot=currentVolume;
   g_raceExposureProjectedLot=projectedVolume;
   g_raceExposureAverageEntry=projectedAverage;
   g_raceExposureMoneyPerPoint=moneyPerPoint;
   g_raceExposureEstimatedCostMoney=estimatedCost;
   g_raceExposureNoisePoints=noisePoints;
   g_raceExposureNoiseMoney=noiseMoney;
   g_raceExposureProjectedStructureLossMoney=structureLoss;
   g_raceExposureStructureInvalidPrice=invalidPrice;
}

#endif
