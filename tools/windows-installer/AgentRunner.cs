using System.Diagnostics;
using Microsoft.Win32;

namespace ScenovaInstaller;

/// <summary>
/// Windows Agent process helpers.
///
/// MT5 PROCESS OWNERSHIP POLICY
/// ----------------------------
/// Background install, repair, account switching and update checks are NEVER
/// allowed to start/stop/restart MT5. Process control is allowed only when the
/// authenticated Server returns a still-active one-time manual action that was
/// created by the customer pressing a Dashboard button.
/// </summary>
internal static class AgentRunner
{
    internal static string AgentPath =>
        Path.Combine(ScenovaRuntime.BaseDir, "SCENOVA-Agent-v3.exe");

    private static string LegacyAgentPath =>
        Path.Combine(ScenovaRuntime.BaseDir, "SCENOVA-Agent-v2.exe");

    private static string SafeKey(AgentConfig config)
    {
        var raw = string.IsNullOrWhiteSpace(config.InstanceId) ? "default" : config.InstanceId;
        var safe = string.Concat(raw.Select(ch => char.IsLetterOrDigit(ch) ? ch : '_'));
        return safe.Length > 72 ? safe[..72] : safe;
    }

    private static string ManualActionStampPath(AgentConfig config) =>
        Path.Combine(ScenovaRuntime.BaseDir, "manual-mt5-action-" + SafeKey(config) + ".stamp");

    internal static bool IsMt5Running(AgentConfig config)
    {
        var terminalExe = ScenovaRuntime.ResolveTerminalExecutable(config.TerminalDataPath);
        if (string.IsNullOrWhiteSpace(terminalExe) || !File.Exists(terminalExe))
            return false;

        var matching = FindTargetMt5Processes(terminalExe);
        try { return matching.Count > 0; }
        finally
        {
            foreach (var process in matching) process.Dispose();
        }
    }

    internal static void RemoveStartupRegistration()
    {
        try
        {
            using var runKey = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Run", true);
            runKey?.DeleteValue("SCENOVA MT5 Agent", false);
        }
        catch { }
    }

    internal static void InstallAndStart()
    {
        Directory.CreateDirectory(ScenovaRuntime.BaseDir);
        var source = Environment.ProcessPath
                     ?? throw new InvalidOperationException("SCENOVA installer path unavailable");
        var agentPath = AgentPath;

        if (!string.Equals(source, agentPath, StringComparison.OrdinalIgnoreCase))
        {
            StopExistingAgent(agentPath);
            CopyExecutableWithRetry(source, agentPath);
        }

        if (File.Exists(agentPath))
        {
            try
            {
                StopExistingAgent(LegacyAgentPath);
                if (File.Exists(LegacyAgentPath)) File.Delete(LegacyAgentPath);
            }
            catch { }
        }

        using (var runKey = Registry.CurrentUser.OpenSubKey(
                   @"Software\Microsoft\Windows\CurrentVersion\Run", true))
        {
            runKey?.SetValue("SCENOVA MT5 Agent", "\"" + agentPath + "\" --agent");
        }

        var legacyStartup = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Startup),
            "SCENOVA-MT5-Agent.cmd");
        try { if (File.Exists(legacyStartup)) File.Delete(legacyStartup); }
        catch { }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = agentPath,
                Arguments = "--agent",
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
        }
        catch { }
    }

    /// <summary>
    /// Compatibility entry point used by existing Agent flows. The function
    /// remains harmless unless the Server has a pending explicit user action:
    /// - forceReload=true  => UPDATE_EA_RESTART only
    /// - forceReload=false => CONNECT_MT5 only
    /// No pending button action means an immediate no-op.
    /// </summary>
    internal static bool EnsureMt5RunningWithEa(AgentConfig config, bool forceReload)
    {
        var action = FetchAuthorizedManualAction(config, forceReload);
        if (action is null) return false;

        var actionId = (action.ManualActionId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(actionId)) return false;

        var stampPath = ManualActionStampPath(config);
        if (StampMatches(stampPath, actionId))
        {
            AcknowledgeManualAction(config, actionId, true, "คำสั่งนี้ถูกดำเนินการแล้ว");
            return false;
        }

        try
        {
            var terminalExe = ScenovaRuntime.ResolveTerminalExecutable(config.TerminalDataPath);
            if (string.IsNullOrWhiteSpace(terminalExe) || !File.Exists(terminalExe))
                throw new InvalidOperationException("ไม่พบ terminal64.exe ของ MT5 ที่เลือก");

            var matching = FindTargetMt5Processes(terminalExe);
            try
            {
                // Both explicit buttons authorize one controlled restart when
                // MT5 is already open. CONNECT also starts MT5 if it is closed.
                foreach (var process in matching)
                    StopTargetMt5(process);
            }
            finally
            {
                foreach (var process in matching) process.Dispose();
            }

            StartTargetMt5(config, terminalExe);
            WriteStamp(stampPath, actionId);
            AcknowledgeManualAction(
                config,
                actionId,
                true,
                forceReload
                    ? "อัปเดต EA และรีสตาร์ท MT5 ตามคำสั่งผู้ใช้แล้ว"
                    : "เปิด/รีสตาร์ท MT5 ตามคำสั่งผู้ใช้แล้ว");
            return true;
        }
        catch (Exception ex)
        {
            AcknowledgeManualAction(
                config,
                actionId,
                false,
                "ดำเนินการ MT5 ไม่สำเร็จ: " + InstallerDiagnostics.Sanitize(ex.Message));
            return false;
        }
    }

    private static AgentActionResponse? FetchAuthorizedManualAction(
        AgentConfig config,
        bool forceReload)
    {
        try
        {
            var token = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected);
            if (string.IsNullOrWhiteSpace(token)) return null;

            using var http = ScenovaClient.NewHttpClient();
            var response = ScenovaClient.PostJsonAsync<AgentActionResponse>(
                http,
                config.ApiBase.TrimEnd('/') + "/api/ea/agent-actions",
                new { instanceId = config.InstanceId, installToken = token })
                .GetAwaiter().GetResult();

            if (!response.ManualActionPending || !response.ManualActionAllowed ||
                !response.SafeToRestart || response.Positions > 0)
                return null;

            var expected = forceReload ? "UPDATE_EA_RESTART" : "CONNECT_MT5";
            return string.Equals(
                response.ManualActionName,
                expected,
                StringComparison.OrdinalIgnoreCase)
                ? response
                : null;
        }
        catch
        {
            return null;
        }
    }

    private static void AcknowledgeManualAction(
        AgentConfig config,
        string actionId,
        bool success,
        string message)
    {
        try
        {
            var token = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected);
            if (string.IsNullOrWhiteSpace(token)) return;
            using var http = ScenovaClient.NewHttpClient();
            _ = ScenovaClient.PostJsonAsync<AgentActionAckResponse>(
                http,
                config.ApiBase.TrimEnd('/') + "/api/ea/agent-actions/ack",
                new
                {
                    instanceId = config.InstanceId,
                    installToken = token,
                    actionId,
                    status = success ? "ACKED" : "FAILED",
                    message
                }).GetAwaiter().GetResult();
        }
        catch { }
    }

    private static void StartTargetMt5(AgentConfig config, string terminalExe)
    {
        var startupConfig = Path.Combine(
            ScenovaRuntime.BaseDir,
            "mt5-scenova-manual-" + SafeKey(config) + ".ini");
        var lines = new List<string>
        {
            "[Experts]",
            "Enabled=1",
            "AllowLiveTrading=1",
            "Account=0",
            "Profile=0",
            "Chart=0",
            "",
            "[StartUp]",
            "Expert=SCENOVA\\FastBasketBot",
            "ExpertParameters=SCENOVA-FastBasketBot.set"
        };
        if (!string.IsNullOrWhiteSpace(config.StartupSymbol))
            lines.Add("Symbol=" + config.StartupSymbol.Trim());
        lines.Add("Period=M5");
        File.WriteAllLines(startupConfig, lines, new System.Text.UTF8Encoding(false));

        Process.Start(new ProcessStartInfo
        {
            FileName = terminalExe,
            Arguments = "/config:\"" + startupConfig + "\"",
            WorkingDirectory = Path.GetDirectoryName(terminalExe) ?? "",
            UseShellExecute = true
        });
    }

    private static List<Process> FindTargetMt5Processes(string terminalExe)
    {
        var result = new List<Process>();
        var normalized = Path.GetFullPath(terminalExe);
        foreach (var process in Process.GetProcessesByName("terminal64"))
        {
            try
            {
                var runningPath = process.MainModule?.FileName;
                if (!string.IsNullOrWhiteSpace(runningPath) &&
                    string.Equals(
                        Path.GetFullPath(runningPath),
                        normalized,
                        StringComparison.OrdinalIgnoreCase))
                {
                    result.Add(process);
                    continue;
                }
            }
            catch { }
            process.Dispose();
        }
        return result;
    }

    private static void StopTargetMt5(Process process)
    {
        if (process.HasExited) return;
        try { process.CloseMainWindow(); }
        catch { }
        if (!process.WaitForExit(8000))
        {
            process.Kill(entireProcessTree: true);
            process.WaitForExit(5000);
        }
    }

    private static bool StampMatches(string path, string value)
    {
        try
        {
            return File.Exists(path) &&
                   string.Equals(File.ReadAllText(path).Trim(), value.Trim(), StringComparison.Ordinal);
        }
        catch { return false; }
    }

    private static void WriteStamp(string path, string value)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, value.Trim());
        }
        catch { }
    }

    private static void StopExistingAgent(string agentPath)
    {
        var currentProcessId = Environment.ProcessId;
        var normalizedAgentPath = Path.GetFullPath(agentPath);
        foreach (var process in Process.GetProcesses())
        {
            try
            {
                if (process.Id == currentProcessId) continue;
                string? runningPath = null;
                try { runningPath = process.MainModule?.FileName; }
                catch { }

                var pathMatches = !string.IsNullOrWhiteSpace(runningPath) &&
                    string.Equals(
                        Path.GetFullPath(runningPath),
                        normalizedAgentPath,
                        StringComparison.OrdinalIgnoreCase);
                var nameMatches =
                    string.Equals(process.ProcessName, "SCENOVA-Agent-v3", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(process.ProcessName, "SCENOVA-Agent-v2", StringComparison.OrdinalIgnoreCase);
                if (!pathMatches && !nameMatches) continue;

                process.Kill(entireProcessTree: true);
                if (!process.WaitForExit(5000))
                    throw new IOException("SCENOVA Agent did not stop within 5 seconds.");
            }
            catch { }
            finally { process.Dispose(); }
        }
        Thread.Sleep(350);
    }

    private static void CopyExecutableWithRetry(string source, string agentPath)
    {
        Exception? lastError = null;
        for (var attempt = 1; attempt <= 12; attempt++)
        {
            try
            {
                File.Copy(source, agentPath, true);
                return;
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                lastError = ex;
                Thread.Sleep(250);
            }
        }
        throw new InvalidOperationException(
            "ไม่สามารถอัปเดต SCENOVA Device Agent ได้ กรุณารอสักครู่แล้วกดติดตั้งอีกครั้ง",
            lastError);
    }
}
