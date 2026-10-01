// RACE VNext Phase 3 - post-flat observation only. No other mode uses this.
#ifndef __SCENOVA_RACE_REENTRY_V1_MQH__
#define __SCENOVA_RACE_REENTRY_V1_MQH__

#define RACE_REENTRY_PROFIT_OBSERVE_SECONDS 6
#define RACE_REENTRY_LOSS_OBSERVE_SECONDS 20

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

   datetime now=TimeCurrent();
   bool previousCycleWasLoss=g_raceLastObservedCycleProfit<0.0;

   g_raceHadExposure=false;
   g_raceReentryPending=true;
   g_raceReentryStartedAt=now;
   g_raceReentryObserveSeconds=previousCycleWasLoss
      ? RACE_REENTRY_LOSS_OBSERVE_SECONDS
      : RACE_REENTRY_PROFIT_OBSERVE_SECONDS;

   // After a losing cycle, discard the old pressure that led into the loss.
   // RACE then needs a fresh 30-second volume window before another AUTO entry.
   // Profitable/flat cycles keep the rolling flow and can re-arm quickly.
   if(previousCycleWasLoss)
      RaceResetVolumeWindow(now);
}

bool RaceReentryObserveReady()
{
   if(!g_raceReentryPending)
      return true;

   datetime now=TimeCurrent();
   if(g_raceReentryStartedAt<=0)
      g_raceReentryStartedAt=now;

   int elapsed=(int)(now-g_raceReentryStartedAt);
   int requiredSeconds=MathMax(
      1,
      g_raceReentryObserveSeconds
   );

   if(elapsed<requiredSeconds)
   {
      g_raceState="REENTRY_OBSERVE";
      g_executionStatus=requiredSeconds>=RACE_REENTRY_LOSS_OBSERVE_SECONDS
         ? "RACE_REENTRY_AFTER_LOSS"
         : "RACE_REENTRY_AFTER_PROFIT";
      return false;
   }

   g_raceReentryPending=false;
   g_raceReentryStartedAt=0;
   g_raceReentryObserveSeconds=RACE_REENTRY_PROFIT_OBSERVE_SECONDS;
   g_raceDirection=0;
   g_raceState="IDLE";
   return true;
}

#endif
