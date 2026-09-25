using System.Diagnostics;
using Microsoft.Win32;
using System.Windows.Forms;

namespace ScenovaInstaller;

/// <summary>
/// Windows Agent process helpers.
///
/// MT5 PROCESS OWNERSHIP POLICY
/// ----------------------------
/// Background install, repair, account switching and update checks are NEVER
/// allowed to start/stop/restart MT5. Process control requires a Dashboard
/// manual action, or the foreground Installer button together with a fresh
/// authenticated, restart-safe Server response. Background callers must use
/// EnsureMt5RunningWithEa; the Installer entry point is never called by Agent.
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

    private static string NormalizeStartupSymbol(string? value)
    {
        var symbol = (value ?? "").Trim();
        if (symbol.Length == 0 || symbol.Length > 64) return "";
        return symbol.All(ch =>
            char.IsLetterOrDigit(ch) ||
            ch == '.' || ch == '_' || ch == '#' || ch == '-')
            ? symbol
            : "";
    }

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

    // Called only from the foreground Installer's explicit check/update click.
    // Reuse the normal MT5 launch configuration and restrict process ownership
    // to the selected Terminal. Never restart while the Server sees trading.
    internal static bool ConnectFromInstallerButton(AgentConfig config, AgentHeartbeatResponse permission)
    {
        if (!permission.DeviceVerified || !permission.SafeToRestart || permission.Positions != 0)
            return false;
        if (string.IsNullOrWhiteSpace(permission.ArtifactHash) || !File.Exists(config.EaBinaryPath) ||
            !string.Equals(BackupManager.HashFile(config.EaBinaryPath), permission.ArtifactHash, StringComparison.OrdinalIgnoreCase))
            return false;

        var terminalExe = ScenovaRuntime.ResolveTerminalExecutable(config.TerminalDataPath);
        if (string.IsNullOrWhiteSpace(terminalExe) || !File.Exists(terminalExe))
            throw new InvalidOperationException("ไม่พบ terminal64.exe ของ MT5 ที่เลือก");

        var symbolSnapshot = FetchTradingSymbolSnapshot(config);
        if (!string.IsNullOrWhiteSpace(symbolSnapshot?.DesiredSymbol))
        {
            var symbol = NormalizeStartupSymbol(symbolSnapshot.DesiredSymbol);
            if (string.IsNullOrWhiteSpace(symbol))
                throw new InvalidOperationException("Symbol ที่เลือกไม่ถูกต้อง");
            config.StartupSymbol = symbol;
            ScenovaRuntime.SaveOrUpdateProfile(config, config.IsPrimary);
        }

        var matching = FindTargetMt5Processes(terminalExe);
        try
        {
            foreach (var process in matching) StopTargetMt5(process);
        }
        finally
        {
            foreach (var process in matching) process.Dispose();
        }
        StartTargetMt5(config, terminalExe);
        return true;
    }

    internal static void StartInstalledAgentIfNeeded()
    {
        if (!File.Exists(AgentPath)) return;
        var processes = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(AgentPath));
        try
        {
            foreach (var process in processes)
            {
                try
                {
                    if (string.Equals(process.MainModule?.FileName, AgentPath, StringComparison.OrdinalIgnoreCase))
                        return;
                }
                catch { }
            }
        }
        finally
        {
            foreach (var process in processes) process.Dispose();
        }
        Process.Start(new ProcessStartInfo
        {
            FileName = AgentPath, Arguments = "--agent",
            UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden
        });
    }

    /// <summary>
    /// Compatibility entry point used by existing Agent flows. The function
    /// remains harmless unless the Server has a pending explicit user action:
    /// - forceReload=true  => UPDATE_EA_RESTART only
    /// - forceReload=false => CONNECT_MT5 only
    /// No pending button action means an immediate no-op.
    ///
    /// Success is ACKed only after the Server observes EA heartbeat again. For
    /// UPDATE_EA_RESTART the reported runtime version must also equal the
    /// required EA version. Starting terminal64.exe alone is never success.
    /// </summary>
    internal static bool EnsureMt5RunningWithEa(AgentConfig config, bool forceReload)
    {
        if (Application.MessageLoop)
        {
            var worker = Task.Run(() => EnsureMt5RunningWithEa(config, forceReload));
            while (!worker.IsCompleted)
            {
                Application.DoEvents();
                Thread.Sleep(20);
            }
            return worker.GetAwaiter().GetResult();
        }

        var action = FetchAuthorizedManualAction(config, forceReload);
        if (action is null) return false;

        var actionId = (action.ManualActionId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(actionId)) return false;

        var requestedSymbol = FetchTradingSymbolSnapshot(config);
        var rawDesiredSymbol = (requestedSymbol?.DesiredSymbol ?? "").Trim();
        var expectedSymbol = NormalizeStartupSymbol(rawDesiredSymbol);
        if (!string.IsNullOrWhiteSpace(rawDesiredSymbol) && string.IsNullOrWhiteSpace(expectedSymbol))
        {
            AcknowledgeManualAction(
                config,
                actionId,
                false,
                "Symbol ที่เลือกไม่ถูกต้อง ระบบไม่ได้รีสตาร์ท MT5");
            return false;
        }

        if (!string.IsNullOrWhiteSpace(expectedSymbol) &&
            !string.Equals(
                NormalizeStartupSymbol(config.StartupSymbol),
                expectedSymbol,
                StringComparison.OrdinalIgnoreCase))
        {
            config.StartupSymbol = expectedSymbol;
            config.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");
            ScenovaRuntime.SaveOrUpdateProfile(config, config.IsPrimary);
        }

        var stampPath = ManualActionStampPath(config);
        if (StampMatches(stampPath, actionId))
        {
            var verifiedExisting = WaitForManualActionVerification(
                config,
                actionId,
                forceReload,
                expectedSymbol,
                timeoutSeconds: 12,
                out var existingSnapshot,
                out var existingSymbolSnapshot);
            if (verifiedExisting)
            {
                AcknowledgeManualAction(
                    config,
                    actionId,
                    true,
                    forceReload
                        ? "EA เวอร์ชันใหม่เชื่อมต่อและตรวจสอบสำเร็จแล้ว"
                        : "MT5 และ EA เชื่อมต่อกลับมาบน Symbol ที่เลือกแล้ว");
                return true;
            }

            AcknowledgeManualAction(
                config,
                actionId,
                false,
                BuildVerificationFailureMessage(
                    forceReload,
                    expectedSymbol,
                    existingSnapshot,
                    existingSymbolSnapshot));
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

            var verified = WaitForManualActionVerification(
                config,
                actionId,
                forceReload,
                expectedSymbol,
                timeoutSeconds: 55,
                out var snapshot,
                out var symbolSnapshot);
            if (!verified)
            {
                AcknowledgeManualAction(
                    config,
                    actionId,
                    false,
                    BuildVerificationFailureMessage(
                        forceReload,
                        expectedSymbol,
                        snapshot,
                        symbolSnapshot));
                return false;
            }

            AcknowledgeManualAction(
                config,
                actionId,
                true,
                forceReload
                    ? "อัปเดต EA สำเร็จ ตรวจพบ Runtime เวอร์ชันล่าสุดแล้ว"
                    : "เชื่อมต่อ MT5 สำเร็จ EA โหลด Symbol ที่เลือกและ Broker อนุญาตให้เปิดออเดอร์แล้ว");
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

    private static AgentActionResponse? FetchActionSnapshot(AgentConfig config)
    {
        try
        {
            var token = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected);
            if (string.IsNullOrWhiteSpace(token)) return null;

            using var http = ScenovaClient.NewHttpClient();
            return ScenovaClient.PostJsonAsync<AgentActionResponse>(
                http,
                config.ApiBase.TrimEnd('/') + "/api/ea/agent-actions",
                new { instanceId = config.InstanceId, installToken = token })
                .GetAwaiter().GetResult();
        }
        catch
        {
            return null;
        }
    }

    private static TradingSymbolAgentResponse? FetchTradingSymbolSnapshot(AgentConfig config)
    {
        try
        {
            var token = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected);
            if (string.IsNullOrWhiteSpace(token)) return null;

            using var http = ScenovaClient.NewHttpClient();
            return ScenovaClient.PostJsonAsync<TradingSymbolAgentResponse>(
                http,
                config.ApiBase.TrimEnd('/') + "/api/ea/trading-symbol/status",
                new { instanceId = config.InstanceId, installToken = token })
                .GetAwaiter().GetResult();
        }
        catch
        {
            return null;
        }
    }

    private static AgentActionResponse? FetchAuthorizedManualAction(
        AgentConfig config,
        bool forceReload)
    {
        var response = FetchActionSnapshot(config);
        if (response is null ||
            !response.ManualActionPending ||
            !response.ManualActionAllowed ||
            !response.SafeToRestart ||
            response.Positions > 0)
            return null;

        var expected = forceReload ? "UPDATE_EA_RESTART" : "CONNECT_MT5";
        return string.Equals(
            response.ManualActionName,
            expected,
            StringComparison.OrdinalIgnoreCase)
            ? response
            : null;
    }

    private static bool WaitForManualActionVerification(
        AgentConfig config,
        string actionId,
        bool forceReload,
        string expectedSymbol,
        int timeoutSeconds,
        out AgentActionResponse? lastSnapshot,
        out TradingSymbolAgentResponse? lastSymbolSnapshot)
    {
        lastSnapshot = null;
        lastSymbolSnapshot = null;
        var deadline = DateTimeOffset.UtcNow.AddSeconds(Math.Max(5, timeoutSeconds));
        while (DateTimeOffset.UtcNow < deadline)
        {
            Thread.Sleep(2000);
            var snapshot = FetchActionSnapshot(config);
            if (snapshot is null) continue;
            lastSnapshot = snapshot;

            // A newer click replaced this action. Never ACK the old one.
            if (!string.Equals(
                    snapshot.ManualActionId,
                    actionId,
                    StringComparison.Ordinal))
                return false;

            if (!snapshot.EaOnline) continue;

            var symbolSnapshot = FetchTradingSymbolSnapshot(config);
            if (symbolSnapshot is not null)
                lastSymbolSnapshot = symbolSnapshot;

            if (!string.IsNullOrWhiteSpace(expectedSymbol))
            {
                var currentSymbol = NormalizeStartupSymbol(symbolSnapshot?.CurrentSymbol);
                if (!string.Equals(currentSymbol, expectedSymbol, StringComparison.OrdinalIgnoreCase))
                    continue;

                // CONNECT is also the explicit Symbol-change action. Refuse to
                // ACK success when the Broker exposes the symbol as disabled or
                // close-only. LONGONLY/SHORTONLY remain valid and are enforced
                // by the EA per direction.
                if (!forceReload && symbolSnapshot?.SymbolTradingAllowed == false)
                    return false;
            }

            if (!forceReload) return true;

            var current = (snapshot.EaVersion ?? "").Trim();
            var required = (snapshot.EaVersionRequired ?? "").Trim();
            var runtimeContractReady = snapshot.RuntimeContractMatch != false;
            if (!string.IsNullOrWhiteSpace(current) &&
                !string.IsNullOrWhiteSpace(required) &&
                string.Equals(current, required, StringComparison.OrdinalIgnoreCase) &&
                runtimeContractReady)
                return true;
        }
        return false;
    }

    private static string BuildVerificationFailureMessage(
        bool forceReload,
        string expectedSymbol,
        AgentActionResponse? snapshot,
        TradingSymbolAgentResponse? symbolSnapshot)
    {
        if (snapshot is null)
            return "MT5 ถูกสั่งเปิดแล้ว แต่ Server ยังตรวจการเชื่อมต่อไม่สำเร็จ กรุณากดอีกครั้ง";
        if (!snapshot.EaOnline)
            return "MT5 เปิดกลับมาแล้ว แต่ EA ยังไม่เชื่อมต่อ Server กรุณาตรวจ WebRequest/EA แล้วกดอีกครั้ง";

        if (!string.IsNullOrWhiteSpace(expectedSymbol))
        {
            var currentSymbol = NormalizeStartupSymbol(symbolSnapshot?.CurrentSymbol);
            if (!string.Equals(currentSymbol, expectedSymbol, StringComparison.OrdinalIgnoreCase))
            {
                return "MT5 เชื่อมต่อแล้ว แต่ EA ยังไม่ได้โหลด Symbol " + expectedSymbol +
                       " (ปัจจุบัน " + (currentSymbol.Length > 0 ? currentSymbol : "ไม่ทราบ") +
                       ") กรุณาตรวจชื่อ Symbol ให้ตรงกับ Market Watch ของ Broker";
            }
            if (!forceReload && symbolSnapshot?.SymbolTradingAllowed == false)
            {
                return "Broker ไม่อนุญาตเปิดออเดอร์ใหม่บน Symbol " + expectedSymbol +
                       " (Disabled/Close Only) กรุณาเลือก Symbol อื่นที่บัญชีนี้เทรดได้";
            }
        }

        if (forceReload && snapshot.RuntimeContractMatch == false)
        {
            var currentContract = string.IsNullOrWhiteSpace(snapshot.RuntimeContract)
                ? "ไม่ทราบ"
                : snapshot.RuntimeContract;
            var requiredContract = string.IsNullOrWhiteSpace(snapshot.RuntimeContractRequired)
                ? "ล่าสุด"
                : snapshot.RuntimeContractRequired;
            return $"MT5 โหลด EA แล้ว แต่ Runtime Contract ยังเป็น {currentContract} (ต้องการ {requiredContract}) กรุณากดอัปเดตอีกครั้ง";
        }

        if (forceReload)
        {
            var current = string.IsNullOrWhiteSpace(snapshot.EaVersion)
                ? "ไม่ทราบ"
                : snapshot.EaVersion;
            var required = string.IsNullOrWhiteSpace(snapshot.EaVersionRequired)
                ? "ล่าสุด"
                : snapshot.EaVersionRequired;
            return $"MT5 เชื่อมต่อแล้ว แต่ EA Runtime ยังเป็น {current} (ต้องการ {required}) กรุณากดอัปเดตอีกครั้ง";
        }
        return "MT5 ยังไม่ยืนยันการเชื่อมต่อ กรุณากดเชื่อมต่ออีกครั้ง";
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
        var startupSymbol = NormalizeStartupSymbol(config.StartupSymbol);
        if (!string.IsNullOrWhiteSpace(startupSymbol))
            lines.Add("Symbol=" + startupSymbol);
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
