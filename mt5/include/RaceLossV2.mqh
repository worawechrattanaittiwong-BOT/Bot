// RACE VNext Phase 2 - loss-state classifier. No soft state closes a loss.
#ifndef __SCENOVA_RACE_LOSS_V2_MQH__
#define __SCENOVA_RACE_LOSS_V2_MQH__

bool RaceV2StructureBroken(int direction)
{
   double invalidPrice=RaceV2StructureInvalidPrice(direction);
   double price=RaceV1CurrentPrice(direction);
   if(direction==0 || invalidPrice<=0.0 || price<=0.0)
      return false;

   double atrM5Price=MathMax(
      _Point*8.0,
      AverageTrueRangePoints(PERIOD_M5,g_atrPeriod)*_Point
   );
   double buffer=atrM5Price*0.12;

   if(direction>0)
      return price<invalidPrice-buffer;
   return price>invalidPrice+buffer;
}

string RaceV2LossState(
   int direction,
   double momentum,
   bool filling,
   double cycleProfit,
   double floatingProfit,
   string &reasonOut
)
{
   reasonOut="NONE";
   RaceV1UpdateExposureTelemetry(direction,0.0);

   if(direction==0 || cycleProfit>=0.0 || floatingProfit>=0.0)
      return "NORMAL";

   double adversePoints=RaceV1AdversePoints(direction);
   if(adversePoints<=g_raceExposureNoisePoints)
   {
      reasonOut="RACE_COST_NOISE";
      return "COST_NOISE";
   }

   // Classification must never own the soft-exit confirmation clock. The
   // caller immediately evaluates RaceWrongDirectionConfirmed(), which resets
   // the candidate only when the actual confirmation conditions stop holding.
   // Keeping the classifier side-effect free lets the 5-8 second confirmation
   // persist across ticks as designed.
   if(RaceV2StructureBroken(direction))
   {
      reasonOut="RACE_STRUCTURE_INVALID";
      return "STRUCTURE_INVALID";
   }

   int decision=RaceAnalysisDirection(momentum);
   bool oppositeDecision=decision!=0 && decision==-direction;
   bool oppositeStructure=
      g_raceVNextStructureDirection!=0 &&
      g_raceVNextStructureDirection==-direction;

   if(oppositeDecision || oppositeStructure)
   {
      reasonOut="RACE_ADVERSE_WATCH";
      return "ADVERSE_WATCH";
   }

   reasonOut="RACE_PULLBACK_HOLD";
   return "PULLBACK_HOLD";
}

#endif
