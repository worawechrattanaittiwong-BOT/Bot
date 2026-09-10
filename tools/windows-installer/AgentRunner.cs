using System.Diagnostics;
using Microsoft.Win32;

namespace ScenovaInstaller;

/// <summary>
/// Windows Agent process helpers.
///
/// LOCAL MT5 PROCESS OWNERSHIP POLICY
/// ----------------------------------
/// SCENOVA may observe whether the customer's MT5 process is running, but it
/// must never start, stop, close, kill, restart or relaunch terminal64.exe.
/// The customer owns the MT5 lifecycle. Installer, repair, account switching,
/// EA updates and permission diagnostics must not change that lifecycle.
///
/// Keep all MT5 process-control entry points centralized here so accidental
/// callers remain harmless.
/// </summary>
internal static class AgentRunner
{
    internal static string AgentPath =>
        Path.Combine(ScenovaRuntime.BaseDir, "SCENOVA-Agent-v3.exe");

    private static string LegacyAgentPath =>
        Path.Combine(ScenovaRuntime.BaseDir, "SCENOVA-Agent-v2.exe");

    /// <summary>
    /// Read-only MT5 process detection. This method never changes the process.
    /// </summary>
    internal static bool IsMt5Running(AgentConfig config)
    {
        var terminalExe = ScenovaRuntime.ResolveTerminalExecutable(config.TerminalDataPath);
        if (string.IsNullOrWhiteSpace(terminalExe) || !File.Exists(terminalExe))
            return false;

        var normalized = Path.GetFullPath(terminalExe);
        foreach (var process in Process.GetProcessesByName("terminal64"))
        {
            using (process)
            {
                try
                {
                    var path = process.MainModule?.FileName;
                    if (!string.IsNullOrWhiteSpace(path) &&
                        string.Equals(
                            Path.GetFullPath(path),
                            normalized,
                            StringComparison.OrdinalIgnoreCase))
                        return true;
                }
                catch
                {
                    // Process inspection can be denied by Windows. Treat that
                    // process as unknown and continue; never attempt repair.
                }
            }
        }

        return false;
    }

    internal static void RemoveStartupRegistration()
    {
        try
        {
            using var runKey = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Run",
                true);
            runKey?.DeleteValue("SCENOVA MT5 Agent", false);
        }
        catch { }
    }

    /// <summary>
    /// Installs/restarts only the SCENOVA Device Agent process.
    /// This method never touches terminal64.exe.
    /// </summary>
    internal static void InstallAndStart()
    {
        Directory.CreateDirectory(ScenovaRuntime.BaseDir);

        var source = Environment.ProcessPath
                     ?? throw new InvalidOperationException(
                         "SCENOVA installer path unavailable");
        var agentPath = AgentPath;

        if (!string.Equals(source, agentPath, StringComparison.OrdinalIgnoreCase))
        {
            StopExistingAgent(agentPath);
            CopyExecutableWithRetry(source, agentPath);
        }

        // v3 is a side-by-side Agent filename upgrade. Only SCENOVA Agent
        // processes are stopped here; MT5 is never touched.
        if (File.Exists(agentPath))
        {
            try
            {
                StopExistingAgent(LegacyAgentPath);
                if (File.Exists(LegacyAgentPath))
                    File.Delete(LegacyAgentPath);
            }
            catch { }
        }

        using (var runKey = Registry.CurrentUser.OpenSubKey(
                   @"Software\Microsoft\Windows\CurrentVersion\Run",
                   true))
        {
            runKey?.SetValue(
                "SCENOVA MT5 Agent",
                "\"" + agentPath + "\" --agent");
        }

        var legacyStartup = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Startup),
            "SCENOVA-MT5-Agent.cmd");
        try
        {
            if (File.Exists(legacyStartup))
                File.Delete(legacyStartup);
        }
        catch { }

        try
        {
            // This starts SCENOVA-Agent-v3.exe only, never MT5.
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
    /// Legacy compatibility entry point retained for existing callers.
    ///
    /// IMPORTANT: It intentionally performs NO ACTION. Older code paths may
    /// still ask the Agent to start/reload MT5 during repair, account switching
    /// or EA update. Keeping this as a hard no-op guarantees those requests can
    /// never affect the customer's MT5 process.
    /// </summary>
    internal static bool EnsureMt5RunningWithEa(AgentConfig config, bool forceReload)
    {
        _ = config;
        _ = forceReload;
        return false;
    }

    private static void StopExistingAgent(string agentPath)
    {
        var currentProcessId = Environment.ProcessId;
        var normalizedAgentPath = Path.GetFullPath(agentPath);

        foreach (var process in Process.GetProcesses())
        {
            try
            {
                if (process.Id == currentProcessId)
                    continue;

                string? runningPath = null;
                try
                {
                    runningPath = process.MainModule?.FileName;
                }
                catch
                {
                    // Continue with the SCENOVA Agent name fallback below.
                }

                var pathMatches =
                    !string.IsNullOrWhiteSpace(runningPath) &&
                    string.Equals(
                        Path.GetFullPath(runningPath),
                        normalizedAgentPath,
                        StringComparison.OrdinalIgnoreCase);

                // Match SCENOVA Agent copies only. Never match terminal64.
                var nameMatches =
                    string.Equals(
                        process.ProcessName,
                        "SCENOVA-Agent-v3",
                        StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(
                        process.ProcessName,
                        "SCENOVA-Agent-v2",
                        StringComparison.OrdinalIgnoreCase);

                if (!pathMatches && !nameMatches)
                    continue;

                process.Kill(entireProcessTree: true);
                if (!process.WaitForExit(5000))
                    throw new IOException(
                        "SCENOVA Agent did not stop within 5 seconds.");
            }
            catch
            {
                // File replacement below retries. A failure to stop an Agent
                // must never be escalated into touching MT5.
            }
            finally
            {
                process.Dispose();
            }
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
            catch (Exception ex)
                when (ex is IOException || ex is UnauthorizedAccessException)
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
