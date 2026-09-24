// RACE VNext Phase 5 - audit/telemetry serialization only.
#ifndef __SCENOVA_RACE_TELEMETRY_V1_MQH__
#define __SCENOVA_RACE_TELEMETRY_V1_MQH__

string RaceTelemetryJsonEscape(string value)
{
   StringReplace(value,"\\","\\\\");
   StringReplace(value,"\"","\\\"");
   StringReplace(value,"\r"," ");
   StringReplace(value,"\n"," ");
   return value;
}

string RaceTelemetryCurrentJsonFragment()
{
   string state=RaceTelemetryJsonEscape(g_raceState);
   string leg=RaceTelemetryJsonEscape(g_raceVNextLegPhase);
   string loss=RaceTelemetryJsonEscape(g_raceLossState);
   string news=RaceTelemetryJsonEscape(g_raceNewsPauseEvent);

   return StringFormat(
      ",\"raceTelemetryVersion\":1"
      ",\"raceDirection\":%d"
      ",\"raceState\":\"%s\""
      ",\"raceFlowScore\":%.6f"
      ",\"raceStructureDirection\":%d"
      ",\"raceRejectionDirection\":%d"
      ",\"raceLegPhase\":\"%s\""
      ",\"raceDecisionScore\":%.6f"
      ",\"raceLossState\":\"%s\""
      ",\"raceTotalLot\":%.8f"
      ",\"raceProjectedLot\":%.8f"
      ",\"raceAverageEntry\":%.10f"
      ",\"raceMoneyPerPoint\":%.8f"
      ",\"raceEstimatedCostMoney\":%.4f"
      ",\"raceNoisePoints\":%.4f"
      ",\"raceNoiseMoney\":%.4f"
      ",\"raceProjectedStructureLossMoney\":%.4f"
      ",\"raceStructureInvalidPrice\":%.10f"
      ",\"raceRiskMismatch\":%s"
      ",\"raceNewsPauseActive\":%s"
      ",\"raceNewsPauseEvent\":\"%s\""
      ",\"raceNewsPauseMinutes\":%d"
      ",\"raceReentryPending\":%s",
      g_raceDirection,
      state,
      g_raceVNextFlowScore,
      g_raceVNextStructureDirection,
      g_raceVNextRejectionDirection,
      leg,
      g_raceVNextDecisionScore,
      loss,
      g_raceExposureTotalLot,
      g_raceExposureProjectedLot,
      g_raceExposureAverageEntry,
      g_raceExposureMoneyPerPoint,
      g_raceExposureEstimatedCostMoney,
      g_raceExposureNoisePoints,
      g_raceExposureNoiseMoney,
      g_raceExposureProjectedStructureLossMoney,
      g_raceExposureStructureInvalidPrice,
      g_raceExposureRiskMismatch ? "true" : "false",
      g_raceNewsPauseActive ? "true" : "false",
      news,
      g_raceNewsPauseMinutes,
      g_raceReentryPending ? "true" : "false"
   );
}

#endif
