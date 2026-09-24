// RACE VNext Phase 1 - deterministic side combiner. It never blocks RACE.
#ifndef __SCENOVA_RACE_DECISION_V2_MQH__
#define __SCENOVA_RACE_DECISION_V2_MQH__

int RaceV2DecisionDirection(
   int volumeDirection,
   int flowDirection,
   int structureDirection,
   int rejectionDirection,
   string legPhase,
   double &scoreOut
)
{
   double score=(double)volumeDirection*4.0;
   score+=(double)flowDirection*2.5;
   score+=(double)structureDirection*3.0;
   score+=(double)rejectionDirection*1.5;

   if(legPhase=="CONTINUATION" || legPhase=="EXPANSION")
      score+=(double)volumeDirection*1.5;
   else if(legPhase=="PULLBACK")
      score+=(double)structureDirection*0.8;
   else if(legPhase=="EXHAUSTION")
   {
      // Exhaustion does not create a WAIT gate. It removes the urge to chase
      // the old flow and lets structure/rejection decide whether the side flips.
      score-=(double)volumeDirection*2.5;
      if(rejectionDirection!=0)
         score+=(double)rejectionDirection*1.5;
   }

   scoreOut=score;
   if(score>0.0) return 1;
   if(score<0.0) return -1;
   return volumeDirection;
}

#endif
