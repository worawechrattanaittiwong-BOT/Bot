// RACE VNext Phase 4 - news pause for new/additional RACE entries only.
#ifndef __SCENOVA_RACE_NEWS_V1_MQH__
#define __SCENOVA_RACE_NEWS_V1_MQH__

#define RACE_NEWS_BEFORE_NORMAL_MINUTES 10
#define RACE_NEWS_AFTER_NORMAL_MINUTES 7
#define RACE_NEWS_BEFORE_MAJOR_MINUTES 15
#define RACE_NEWS_AFTER_MAJOR_MINUTES 15

bool RaceNewsNameContains(string name,string needle)
{
   string hay=name;
   string key=needle;
   StringToLower(hay);
   StringToLower(key);
   return StringFind(hay,key)>=0;
}

bool RaceNewsIsMajorEvent(string name)
{
   return
      RaceNewsNameContains(name,"nonfarm") ||
      RaceNewsNameContains(name,"non-farm") ||
      RaceNewsNameContains(name,"employment change") ||
      RaceNewsNameContains(name,"consumer price") ||
      RaceNewsNameContains(name,"cpi") ||
      RaceNewsNameContains(name,"fomc") ||
      RaceNewsNameContains(name,"federal reserve") ||
      RaceNewsNameContains(name,"fed chair") ||
      RaceNewsNameContains(name,"powell") ||
      RaceNewsNameContains(name,"pce");
}

bool RaceNewsPauseActive(string &reasonOut)
{
   reasonOut="NONE";
   g_raceNewsPauseActive=false;
   g_raceNewsPauseEvent="NONE";
   g_raceNewsPauseMinutes=9999;

   if(MQLInfoInteger(MQL_TESTER))
      return false;

   datetime now=TimeCurrent();
   string currency=SymbolInfoString(_Symbol,SYMBOL_CURRENCY_PROFIT);
   if(currency=="")
      currency="USD";

   // RACE owns its own narrow execution window so AUTO's news behavior remains
   // unchanged. Only HIGH-impact tracked events are considered.
   MqlCalendarValue values[];
   int count=CalendarValueHistory(values,now-900,now+3600,"",currency);
   if(count<=0)
      return false;

   int bestAbs=1000000;
   string bestName="NONE";
   int bestMinutes=9999;
   bool bestMajor=false;

   for(int i=0;i<count;i++)
   {
      MqlCalendarEvent event;
      if(!CalendarEventById(values[i].event_id,event))
         continue;
      if(event.importance!=CALENDAR_IMPORTANCE_HIGH)
         continue;
      if(!IsTrackedEconomicEventName(event.name))
         continue;

      int minutes=(int)MathRound((double)(values[i].time-now)/60.0);
      bool major=RaceNewsIsMajorEvent(event.name);
      int before=major
         ? RACE_NEWS_BEFORE_MAJOR_MINUTES
         : RACE_NEWS_BEFORE_NORMAL_MINUTES;
      int after=major
         ? RACE_NEWS_AFTER_MAJOR_MINUTES
         : RACE_NEWS_AFTER_NORMAL_MINUTES;

      bool inside=minutes>=0
         ? minutes<=before
         : MathAbs(minutes)<=after;
      if(!inside)
         continue;

      int absMinutes=MathAbs(minutes);
      if(absMinutes<bestAbs)
      {
         bestAbs=absMinutes;
         bestName=event.name;
         bestMinutes=minutes;
         bestMajor=major;
      }
   }

   if(bestAbs==1000000)
      return false;

   g_raceNewsPauseActive=true;
   g_raceNewsPauseEvent=bestName;
   g_raceNewsPauseMinutes=bestMinutes;
   reasonOut=bestMajor ? "RACE_MAJOR_NEWS_WINDOW" : "RACE_HIGH_NEWS_WINDOW";
   return true;
}

#endif
