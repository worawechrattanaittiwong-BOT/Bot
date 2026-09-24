// RACE VNext Phase 3 - post-flat observation only. No other mode uses this.
#ifndef __SCENOVA_RACE_REENTRY_V1_MQH__
#define __SCENOVA_RACE_REENTRY_V1_MQH__

#define RACE_REENTRY_OBSERVE_SECONDS 4

void RaceReentryMarkExposure()
{
   g_raceHadExposure=true;
   g_raceReentryPending=false;
   g_raceReentryStartedAt=0;
}

void RaceReentryDetectFlatTransition()
{
   if(!g_raceHadExposure)
      return;
   if(BasketHasRacePosition())
      return;

   g_raceHadExposure=false;
   g_raceReentryPending=true;
   g_raceReentryStartedAt=TimeCurrent();
}

bool RaceReentryObserveReady()
{
   if(!g_raceReentryPending)
      return true;

   datetime now=TimeCurrent();
   if(g_raceReentryStartedAt<=0)
      g_raceReentryStartedAt=now;

   int elapsed=(int)(now-g_raceReentryStartedAt);
   if(elapsed<RACE_REENTRY_OBSERVE_SECONDS)
   {
      g_raceState="REENTRY_OBSERVE";
      g_executionStatus="RACE_REENTRY_OBSERVE";
      return false;
   }

   g_raceReentryPending=false;
   g_raceReentryStartedAt=0;
   g_raceDirection=0;
   g_raceState="IDLE";
   return true;
}

#endif
