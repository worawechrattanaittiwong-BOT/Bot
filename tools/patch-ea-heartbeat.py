from pathlib import Path

mq5_path = Path("mt5/FastBasketBot.mq5")
text = mq5_path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")

old_version = '#property version   "1.045"'
new_version = '#property version   "1.046"'
assert text.count(old_version) == 1, "Expected EA version 1.045 exactly once"
text = text.replace(old_version, new_version, 1)

old_status = '''   bool terminalOnline = TerminalConnectedNow();
   bool serverFresh = g_lastSuccessfulHeartbeat > 0 &&
      TimeCurrent() - g_lastSuccessfulHeartbeat <= InpMaxOfflineLeaseSeconds;
   string connectionText = !terminalOnline ? "MT5 OFFLINE" : serverFresh ? "CONNECTED" : "CONNECTING";
   color statusColor = !terminalOnline ? clrTomato : serverFresh ? clrLimeGreen : clrGold;
   RenderChartStatus(connectionText, statusColor, g_executionStatus);
}
'''
new_status = '''   bool terminalOnline = TerminalConnectedNow();
   int heartbeatAge = g_lastSuccessfulHeartbeat > 0
      ? (int)MathMax(0, TimeCurrent() - g_lastSuccessfulHeartbeat)
      : -1;
   int connectedFreshSeconds = MathMax(9, InpHeartbeatSeconds * 4);
   bool serverFresh = heartbeatAge >= 0 && heartbeatAge <= connectedFreshSeconds;
   bool serverWithinLease = heartbeatAge >= 0 && heartbeatAge <= InpMaxOfflineLeaseSeconds;
   string connectionText = !terminalOnline
      ? "MT5 OFFLINE"
      : serverFresh
         ? "CONNECTED"
         : serverWithinLease ? "RECONNECTING" : "CONNECTING";
   color statusColor = !terminalOnline
      ? clrTomato
      : serverFresh ? clrLimeGreen : clrGold;
   RenderChartStatus(connectionText, statusColor, g_executionStatus);
}
'''
assert text.count(old_status) == 1, "RefreshChartStatus connection block was not found exactly once"
text = text.replace(old_status, new_status, 1)

old_failure = '''   if(code < 200 || code >= 300)
   {
      // Fail closed for new entries immediately when control cannot be verified.
      g_runAuthorized = false;
      if(g_state == STATE_RUNNING)
         g_executionStatus = "CONTROL_NOT_FRESH";

      Print("SCENOVA heartbeat failed. HTTP=", code, " error=", webError, " URL=", heartbeatUrl);

      if(code == -1)
      {
         RenderChartStatus("NETWORK ERROR", clrTomato, "WebRequest error " + IntegerToString(webError));
      }
      else if(code == 401)
      {
         RenderChartStatus("AUTH FAILED", clrTomato, "Reload the newest SCENOVA .set file");
      }
      else
      {
         RenderChartStatus("NOT CONNECTED", clrTomato, "HTTP " + IntegerToString(code));
      }
      return;
   }

   g_lastSuccessfulHeartbeat = TimeCurrent();
'''
new_failure = '''   if(code < 200 || code >= 300)
   {
      // A single Wi-Fi/ISP/API packet loss must not flap RUNNING -> STOPPED ->
      // RUNNING. Keep the last verified RUNNING authorization only for a short
      // bounded grace window. Authentication/authorization failures still fail
      // closed immediately, and the longer offline lease remains the absolute
      // access limit for all new entries.
      bool transientFailure =
         code == -1 || code == 408 || code == 425 || code == 429 || code >= 500;
      int transientGraceSeconds = MathMax(9, MathMin(20, InpHeartbeatSeconds * 5));
      bool verifiedControlStillFresh =
         g_lastSuccessfulHeartbeat > 0 &&
         TimeCurrent() - g_lastSuccessfulHeartbeat <= transientGraceSeconds;

      Print("SCENOVA heartbeat failed. HTTP=", code, " error=", webError, " URL=", heartbeatUrl,
            " transient=", transientFailure, " grace=", verifiedControlStillFresh);

      if(transientFailure && verifiedControlStillFresh)
      {
         if(g_state == STATE_RUNNING && g_runAuthorized)
            g_executionStatus = "CONTROL_RETRYING";
         RenderChartStatus("RECONNECTING", clrGold, g_executionStatus);
         return;
      }

      // Beyond the short grace period, or on a real auth/control rejection,
      // fail closed for NEW entries. Existing Basket risk/profit management
      // continues locally and MT5 itself is never restarted by this logic.
      g_runAuthorized = false;
      if(g_state == STATE_RUNNING)
         g_executionStatus = "CONTROL_NOT_FRESH";

      if(code == 401 || code == 403)
      {
         RenderChartStatus("AUTH FAILED", clrTomato, "Reload the newest SCENOVA .set file");
      }
      else if(code == -1)
      {
         RenderChartStatus("NETWORK ERROR", clrTomato, "WebRequest error " + IntegerToString(webError));
      }
      else
      {
         RenderChartStatus("NOT CONNECTED", clrTomato, "HTTP " + IntegerToString(code));
      }
      return;
   }

   g_lastSuccessfulHeartbeat = TimeCurrent();
'''
assert text.count(old_failure) == 1, "Heartbeat failure block was not found exactly once"
text = text.replace(old_failure, new_failure, 1)

mq5_path.write_text(text, encoding="utf-8", newline="\n")

release_path = Path("apps/api/src/release-version.ts")
release = release_path.read_text(encoding="utf-8-sig")
old_release = 'export const DEFAULT_EA_VERSION = "1.045";'
new_release = 'export const DEFAULT_EA_VERSION = "1.046";'
assert release.count(old_release) == 1, "DEFAULT_EA_VERSION 1.045 was not found exactly once"
release_path.write_text(release.replace(old_release, new_release, 1), encoding="utf-8", newline="\n")

print("Heartbeat resilience patch applied successfully")
