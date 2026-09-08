using System.Diagnostics;
using System.Security.Cryptography;
using Microsoft.Win32;

namespace ScenovaInstaller;

internal static class AgentRunner
{
    internal static void InstallAndStart()
    {
        Directory.CreateDirectory(ScenovaRuntime.BaseDir);

        var source = Environment.ProcessPath
                     ?? throw new InvalidOperationException("SCENOVA installer path unavailable");
        var agentPath = Path.Combine(ScenovaRuntime.BaseDir, "SCENOVA-Agent-v2.exe");

        if (!string.Equals(source, agentPath, StringComparison.OrdinalIgnoreCase))
        {
            StopExistingAgent(agentPath);
            CopyExecutableWithRetry(source, agentPath);
        }

        using (var runKey = Registry.CurrentUser.OpenSubKey(
                   @"Software\Microsoft\Windows\CurrentVersion\Run", true))
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
            if (File.Exists(legacyStartup)) File.Delete(legacyStartup);
        }
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
                    // Continue with the process-name fallback below.
                }

                var pathMatches =
                    !string.IsNullOrWhiteSpace(runningPath) &&
                    string.Equals(
                        Path.GetFullPath(runningPath),
                        normalizedAgentPath,
                        StringComparison.OrdinalIgnoreCase);

                // SCENOVA-Agent-v2.exe is a renamed copy of the single-file
                // SCENOVA-Setup assembly. Depending on Windows/.NET, the
                // running process can be reported under either name.
                var nameMatches =
                    string.Equals(process.ProcessName, "SCENOVA-Agent-v2", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(process.ProcessName, "SCENOVA-Setup", StringComparison.OrdinalIgnoreCase);

                if (!pathMatches && !nameMatches)
                    continue;

                process.Kill(entireProcessTree: true);
                if (!process.WaitForExit(5000))
                    throw new IOException("SCENOVA Agent did not stop within 5 seconds.");
            }
            catch
            {
                // File replacement below retries. If a matching process still
                // owns the executable, the installer returns a clear error.
            }
            finally
            {
                process.Dispose();
            }
        }

        // Give Windows a short moment to release the executable image mapping.
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

    private static bool RefreshEaCredentialPreset(AgentConfig config, string installToken)
    {
        var presetsDir = Path.Combine(config.TerminalDataPath, "MQL5", "Presets");
        Directory.CreateDirectory(presetsDir);
        var presetPath = Path.Combine(presetsDir, "SCENOVA-FastBasketBot.set");

        var desired = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["InpApiBase"] = config.ApiBase.TrimEnd('/'),
            ["InpInstanceId"] = config.InstanceId,
            ["InpInstallToken"] = installToken
        };

        var lines = File.Exists(presetPath)
            ? File.ReadAllLines(presetPath).ToList()
            : new List<string>();

        var found = new HashSet<string>(StringComparer.Ordinal);
        var changed = !File.Exists(presetPath);

        for (var i = 0; i < lines.Count; i++)
        {
            foreach (var item in desired)
            {
                var prefix = item.Key + "=";
                if (!lines[i].StartsWith(prefix, StringComparison.Ordinal))
                    continue;

                found.Add(item.Key);
                var next = prefix + item.Value;
                if (!string.Equals(lines[i], next, StringComparison.Ordinal))
                {
                    lines[i] = next;
                    changed = true;
                }
                break;
            }
        }

        foreach (var item in desired)
        {
            if (found.Contains(item.Key))
                continue;
            lines.Insert(0, item.Key + "=" + item.Value);
            changed = true;
        }

        if (changed)
            File.WriteAllLines(presetPath, lines, new System.Text.UTF8Encoding(false));

        return changed;
    }

    internal static bool EnsureMt5RunningWithEa(AgentConfig config, bool forceReload)
    {
        var terminalExe = ScenovaRuntime.ResolveTerminalExecutable(config.TerminalDataPath);
        if (string.IsNullOrWhiteSpace(terminalExe) || !File.Exists(terminalExe))
            return false;

        var matching = FindTargetMt5Processes(terminalExe);
        try
        {
            if (matching.Count > 0 && !forceReload)
                return true;

            if (forceReload)
            {
                foreach (var process in matching)
                    StopTargetMt5(process);
            }
        }
        finally
        {
            foreach (var process in matching)
                process.Dispose();
        }

        var startupConfig = Path.Combine(ScenovaRuntime.BaseDir, "mt5-scenova-startup.ini");
        var lines = new List<string>
        {
            "[Experts]",
            "Enabled=1",
            "AllowLiveTrading=1",
            "Account=1",
            "Profile=1",
            "Chart=1",
            "",
            "[StartUp]",
            "Expert=SCENOVA\\FastBasketBot",
            "ExpertParameters=SCENOVA-FastBasketBot.set"
        };

        if (!string.IsNullOrWhiteSpace(config.StartupSymbol))
            lines.Add("Symbol=" + config.StartupSymbol.Trim());

        lines.Add("Period=M1");
        File.WriteAllLines(startupConfig, lines, new System.Text.UTF8Encoding(false));

        Process.Start(new ProcessStartInfo
        {
            FileName = terminalExe,
            Arguments = "/config:\"" + startupConfig + "\"",
            WorkingDirectory = Path.GetDirectoryName(terminalExe) ?? "",
            UseShellExecute = true
        });
        return true;
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
            catch
            {
                // Ignore MT5 instances that cannot be matched safely by path.
            }

            process.Dispose();
        }

        return result;
    }

    private static void StopTargetMt5(Process process)
    {
        try
        {
            if (process.HasExited) return;

            try
            {
                process.CloseMainWindow();
            }
            catch { }

            if (!process.WaitForExit(5000))
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
        }
        catch { }
    }

    private static async Task<bool> UpdateEaIfNeededAsync(
        HttpClient http,
        AgentConfig config,
        string installToken,
        string localEaHash,
        AgentHeartbeatResponse heartbeat,
        string logPath)
    {
        if (!heartbeat.ArtifactAvailable ||
            string.IsNullOrWhiteSpace(heartbeat.ArtifactHash) ||
            string.Equals(localEaHash, heartbeat.ArtifactHash, StringComparison.OrdinalIgnoreCase))
            return false;

        var eaBytes = await ScenovaClient.DownloadArtifactAsync(
            http,
            config.ApiBase,
            config.InstanceId,
            installToken);

        var downloadedHash = Convert.ToHexString(SHA256.HashData(eaBytes)).ToLowerInvariant();
        if (!string.Equals(downloadedHash, heartbeat.ArtifactHash, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("downloaded EA hash does not match server artifact");

        Directory.CreateDirectory(Path.GetDirectoryName(config.EaBinaryPath) ?? ScenovaRuntime.BaseDir);
        var tempPath = config.EaBinaryPath + ".update";
        await File.WriteAllBytesAsync(tempPath, eaBytes);
        File.Move(tempPath, config.EaBinaryPath, true);

        await AppendLogAsync(
            logPath,
            "EA updated automatically. hash=" + downloadedHash);

        EnsureMt5RunningWithEa(config, forceReload: true);
        return true;
    }

    internal static async Task RunAsync()
    {
        Directory.CreateDirectory(ScenovaRuntime.BaseDir);
        var logPath = Path.Combine(ScenovaRuntime.BaseDir, "agent-v2.log");

        using var mutex = new Mutex(
            true,
            "Local\\SCENOVA-MT5-Agent-v2-" + Environment.UserName,
            out var createdNew);
        if (!createdNew) return;

        var attemptedInitialMt5Start = false;
        var attemptedEaPermissionRepair = false;
        var attemptedEaOfflineRepair = false;

        while (true)
        {
            try
            {
                var config = ScenovaRuntime.ReadConfig()
                             ?? throw new InvalidOperationException("config-v2.json not found");
                var installToken = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected)
                                   ?? throw new InvalidOperationException("install token unavailable");
                var deviceSecret = ScenovaRuntime.TryUnprotect(config.DeviceSecretProtected)
                                   ?? throw new InvalidOperationException("device secret unavailable");

                var eaHash = "";
                if (File.Exists(config.EaBinaryPath))
                {
                    eaHash = Convert.ToHexString(
                        SHA256.HashData(await File.ReadAllBytesAsync(config.EaBinaryPath)))
                        .ToLowerInvariant();
                }

                using var http = ScenovaClient.NewHttpClient();
                var heartbeat = await ScenovaClient.PostJsonAsync<AgentHeartbeatResponse>(
                    http,
                    config.ApiBase.TrimEnd('/') + "/api/ea/agent-heartbeat",
                    new
                    {
                        instanceId = config.InstanceId,
                        installToken,
                        agentVersion = "2.0.9",
                        terminalPath = config.TerminalDataPath,
                        eaHash,
                        hostname = Environment.MachineName,
                        devicePublicId = config.DevicePublicId,
                        deviceSecret
                    });

                // Keep the EA preset credentials synchronized with the Agent's
                // authenticated config. This repairs the common case where MT5
                // is still running with an old .set token after reinstall/update.
                var presetCredentialsChanged = RefreshEaCredentialPreset(config, installToken);

                // DeviceVerified is telemetry only. The install token and
                // Server entitlement are authoritative for trading access.
                var updated = await UpdateEaIfNeededAsync(
                    http,
                    config,
                    installToken,
                    eaHash,
                    heartbeat,
                    logPath);

                if (updated)
                {
                    attemptedInitialMt5Start = true;
                    attemptedEaPermissionRepair = false;
                    attemptedEaOfflineRepair = false;
                }
                else if (
                    !heartbeat.EaOnline &&
                    !attemptedEaOfflineRepair &&
                    (
                        presetCredentialsChanged ||
                        heartbeat.EaLastSeenAgeSeconds < 0 ||
                        heartbeat.EaLastSeenAgeSeconds > 20
                    ))
                {
                    // If Agent authentication works but the EA heartbeat is stale,
                    // refresh Instance/Token in the preset and force one clean MT5
                    // reload. This self-heals AUTHENTICATION FAILED caused by a
                    // stale chart input without asking the customer to edit .set.
                    attemptedEaOfflineRepair = EnsureMt5RunningWithEa(config, forceReload: true);
                    attemptedInitialMt5Start = attemptedEaOfflineRepair || attemptedInitialMt5Start;
                    if (attemptedEaOfflineRepair)
                        await AppendLogAsync(
                            logPath,
                            "EA offline/auth repair requested. presetChanged=" +
                            presetCredentialsChanged +
                            " lastSeenAge=" + heartbeat.EaLastSeenAgeSeconds.ToString("0"));
                }
                else if (!heartbeat.EaOnline && !attemptedInitialMt5Start)
                {
                    attemptedInitialMt5Start = EnsureMt5RunningWithEa(config, forceReload: false);
                    if (attemptedInitialMt5Start)
                        await AppendLogAsync(logPath, "MT5 start requested automatically.");
                }
                else if (
                    heartbeat.EaOnline &&
                    heartbeat.TerminalTradeAllowed == true &&
                    heartbeat.MqlTradeAllowed == false &&
                    !attemptedEaPermissionRepair)
                {
                    // MT5 global Algo Trading is already ON, but this EA chart
                    // reports Allow Algo Trading OFF. Relaunch once with the
                    // SCENOVA startup config, which explicitly sets
                    // AllowLiveTrading=1 for the Expert.
                    attemptedEaPermissionRepair = EnsureMt5RunningWithEa(config, forceReload: true);
                    if (attemptedEaPermissionRepair)
                        await AppendLogAsync(
                            logPath,
                            "EA trading permission repair requested automatically.");
                }
                else if (heartbeat.EaOnline)
                {
                    attemptedEaOfflineRepair = false;
                    if (heartbeat.MqlTradeAllowed == true)
                        attemptedEaPermissionRepair = false;
                }

                await AppendLogAsync(
                    logPath,
                    "Heartbeat OK. device=" + config.DevicePublicId +
                    " eaOnline=" + heartbeat.EaOnline +
                    " eaVersion=" + (heartbeat.EaVersion ?? ""));
            }
            catch (Exception ex)
            {
                await AppendLogAsync(logPath, "ERROR: " + ex.Message);
            }

            await Task.Delay(TimeSpan.FromSeconds(15));
        }
    }

    private static async Task AppendLogAsync(string path, string message)
    {
        try
        {
            await File.AppendAllTextAsync(
                path,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine);
        }
        catch { }
    }
}
