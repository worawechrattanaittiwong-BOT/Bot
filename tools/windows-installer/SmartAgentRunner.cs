using System.Security.Cryptography;

namespace ScenovaInstaller;

internal static class SmartAgentRunner
{
    private static string SafeKey(AgentConfig config)
    {
        var raw = string.IsNullOrWhiteSpace(config.InstanceId) ? "default" : config.InstanceId;
        var safe = string.Concat(raw.Select(ch => char.IsLetterOrDigit(ch) ? ch : '_'));
        return safe.Length > 72 ? safe[..72] : safe;
    }

    private static string PendingEaPath(AgentConfig config) =>
        Path.Combine(ScenovaRuntime.StagingDir, "FastBasketBot-" + SafeKey(config) + ".pending.ex5");

    private static string PendingReloadPath(AgentConfig config) =>
        Path.Combine(ScenovaRuntime.StagingDir, "reload-" + SafeKey(config) + ".pending");

    internal static async Task RunAsync()
    {
        Directory.CreateDirectory(ScenovaRuntime.BaseDir);
        Directory.CreateDirectory(ScenovaRuntime.StagingDir);

        var logPath = Path.Combine(ScenovaRuntime.BaseDir, "agent-v3.log");
        using var mutex = new Mutex(
            true,
            "Local\\SCENOVA-Smart-Agent-v3-" + Environment.UserName,
            out var createdNew);
        if (!createdNew) return;

        await InstallerDiagnostics.LogAsync(
            "AGENT_START",
            "Smart Agent v" + AgentBuildInfo.Version);

        while (true)
        {
            var profiles = ScenovaRuntime.ReadProfiles();
            if (profiles.Count == 0)
            {
                await AppendLogAsync(logPath, "No SCENOVA profiles configured.");
                await Task.Delay(TimeSpan.FromSeconds(15));
                continue;
            }

            foreach (var profile in profiles)
            {
                try
                {
                    await ProcessProfileAsync(profile, logPath);
                }
                catch (Exception ex)
                {
                    await AppendLogAsync(
                        logPath,
                        "ERROR profile=" + SafeKey(profile) + " " +
                        InstallerDiagnostics.Sanitize(ex.Message));
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(15));
        }
    }

    private static async Task ProcessProfileAsync(
        AgentConfig config,
        string logPath)
    {
        var key = SafeKey(config);
        var token = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected)
                    ?? throw new InvalidOperationException("install token unavailable");
        var deviceSecret = ScenovaRuntime.TryUnprotect(config.DeviceSecretProtected)
                           ?? throw new InvalidOperationException("device secret unavailable");

        var localHash = File.Exists(config.EaBinaryPath)
            ? BackupManager.HashFile(config.EaBinaryPath)
            : "";

        using var http = ScenovaClient.NewHttpClient();
        var heartbeat = await ScenovaClient.PostJsonAsync<AgentHeartbeatResponse>(
            http,
            config.ApiBase.TrimEnd('/') + "/api/ea/agent-heartbeat",
            new
            {
                instanceId = config.InstanceId,
                installToken = token,
                agentVersion = AgentBuildInfo.Version,
                terminalPath = config.TerminalDataPath,
                eaHash = localHash,
                hostname = Environment.MachineName,
                devicePublicId = config.DevicePublicId,
                deviceSecret,
                releaseChannel = config.ReleaseChannel,
                installerStatus = new
                {
                    version = AgentBuildInfo.Version,
                    channel = config.ReleaseChannel,
                    localHash,
                    stagedUpdate = File.Exists(PendingEaPath(config)),
                    healthScore = ScenovaRuntime.ReadState().LastHealthScore,
                    profileCount = ScenovaRuntime.ReadProfiles().Count
                }
            });

        UpdateVerifiedIdentity(config, heartbeat);

        var presetPath = Path.Combine(
            config.TerminalDataPath,
            "MQL5",
            "Presets",
            "SCENOVA-FastBasketBot.set");
        PresetManager.Migrate(
            presetPath,
            config.ApiBase,
            config.InstanceId,
            token);

        // The Agent may stage/apply the latest EX5 while the server says it is
        // safe. This never controls the MT5 process. A loaded runtime is changed
        // only after an explicit Dashboard action authorizes one restart.
        await StageOrApplyEaAsync(http, config, token, localHash, heartbeat, logPath);

        var reloadPending = File.Exists(PendingReloadPath(config));
        if (reloadPending && heartbeat.SafeToRestart)
        {
            // This call is a no-op unless the customer has pressed
            // "อัปเดต EA ตอนนี้" and the Server still exposes that one-time
            // UPDATE_EA_RESTART action.
            if (AgentRunner.EnsureMt5RunningWithEa(config, forceReload: true))
            {
                TryDelete(PendingReloadPath(config));
                await AppendLogAsync(
                    logPath,
                    "Manual EA update restart completed. profile=" + key);
            }
        }

        if (!heartbeat.EaOnline && heartbeat.SafeToRestart)
        {
            // This call is a no-op unless the customer has pressed
            // "เชื่อมต่อ MT5". There is intentionally no background auto-start.
            if (AgentRunner.EnsureMt5RunningWithEa(config, forceReload: false))
            {
                await AppendLogAsync(
                    logPath,
                    "Manual MT5 connect/restart completed. profile=" + key);
            }
        }

        // IMPORTANT: account switching, permission repair, normal heartbeat,
        // Agent repair and background EA update checks are intentionally NOT
        // allowed to start/stop/restart terminal64.exe.

        if (heartbeat.AgentUpdateRequired)
        {
            await AppendLogAsync(
                logPath,
                "Installer/Agent update required. local=" + AgentBuildInfo.Version +
                " required=" + (heartbeat.AgentVersionRequired ?? ""));
        }

        await AppendLogAsync(
            logPath,
            "Heartbeat OK profile=" + key +
            " eaOnline=" + heartbeat.EaOnline +
            " eaVersion=" + (heartbeat.EaVersion ?? "") +
            " account=" + (heartbeat.AccountNumber ?? "") +
            " server=" + (heartbeat.Server ?? "") +
            " positions=" + heartbeat.Positions +
            " safe=" + heartbeat.SafeToRestart +
            " channel=" + (heartbeat.ReleaseChannel ?? config.ReleaseChannel));
    }

    internal static bool PendingUpdateExists(AgentConfig config) =>
        File.Exists(PendingEaPath(config)) || File.Exists(PendingReloadPath(config));

    internal static async Task EnsureEaArtifactAsync(
        HttpClient http,
        AgentConfig config,
        string installToken,
        AgentHeartbeatResponse heartbeat,
        string logPath)
    {
        var localHash = File.Exists(config.EaBinaryPath)
            ? BackupManager.HashFile(config.EaBinaryPath)
            : "";
        await StageOrApplyEaAsync(
            http,
            config,
            installToken,
            localHash,
            heartbeat,
            logPath);
    }

    private static async Task StageOrApplyEaAsync(
        HttpClient http,
        AgentConfig config,
        string token,
        string localHash,
        AgentHeartbeatResponse heartbeat,
        string logPath)
    {
        var expected = (heartbeat.ArtifactHash ?? "").Trim().ToLowerInvariant();
        if (!heartbeat.ArtifactAvailable || string.IsNullOrWhiteSpace(expected))
            return;

        if (string.Equals(localHash, expected, StringComparison.OrdinalIgnoreCase))
        {
            TryDelete(PendingEaPath(config));

            // The binary on disk can already be current while the EA loaded on
            // the chart is still an older runtime. Preserve a reload marker when
            // the Server reports that mismatch so the explicit update button can
            // authorize a single MT5 restart.
            if (!string.IsNullOrWhiteSpace(heartbeat.EaVersion) &&
                !string.IsNullOrWhiteSpace(heartbeat.EaVersionRequired) &&
                !string.Equals(
                    heartbeat.EaVersion,
                    heartbeat.EaVersionRequired,
                    StringComparison.OrdinalIgnoreCase))
            {
                File.WriteAllText(PendingReloadPath(config), expected);
            }
            return;
        }

        Directory.CreateDirectory(ScenovaRuntime.StagingDir);
        var pending = PendingEaPath(config);
        if (!File.Exists(pending) ||
            !string.Equals(
                BackupManager.HashFile(pending),
                expected,
                StringComparison.OrdinalIgnoreCase))
        {
            TryDelete(pending);
            await ScenovaClient.DownloadArtifactResumableAsync(
                http,
                config.ApiBase,
                config.InstanceId,
                token,
                pending,
                expected,
                config.ReleaseChannel);
            await AppendLogAsync(
                logPath,
                "EA staged. profile=" + SafeKey(config) +
                " hash=" + expected +
                " safeToRestart=" + heartbeat.SafeToRestart);
        }

        File.WriteAllText(PendingReloadPath(config), expected);

        // Safe Update invariant: if the Server sees RUNNING state or positions,
        // the live EX5 is never replaced. Only the staged copy changes.
        if (!heartbeat.SafeToRestart)
            return;

        BackupManager.CreateSnapshot(config, config.TerminalDataPath);

        var apply = config.EaBinaryPath + ".apply";
        Directory.CreateDirectory(Path.GetDirectoryName(config.EaBinaryPath)!);
        File.Copy(pending, apply, true);
        var applyHash = BackupManager.HashFile(apply);
        if (!string.Equals(applyHash, expected, StringComparison.OrdinalIgnoreCase))
        {
            TryDelete(apply);
            throw new InvalidOperationException("EA staging integrity verification failed");
        }

        File.Move(apply, config.EaBinaryPath, true);
        config.PreviousEaHash = config.EaHash;
        config.EaHash = expected;
        config.EaVersion = heartbeat.EaVersionRequired ?? config.EaVersion;
        config.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");
        ScenovaRuntime.SaveOrUpdateProfile(config, config.IsPrimary);

        TryDelete(pending);
        await AppendLogAsync(
            logPath,
            "EA staged file applied while safe. Waiting for explicit update button restart. profile=" +
            SafeKey(config));
    }

    private static void UpdateVerifiedIdentity(
        AgentConfig config,
        AgentHeartbeatResponse heartbeat)
    {
        config.VerifiedAccountNumber =
            heartbeat.AccountNumber ?? config.VerifiedAccountNumber;
        config.VerifiedServer =
            heartbeat.Server ?? config.VerifiedServer;
        config.ReleaseChannel =
            heartbeat.ReleaseChannel ?? config.ReleaseChannel;
        config.InstallerVersion = AgentBuildInfo.Version;
        config.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");

        if (!string.IsNullOrWhiteSpace(heartbeat.EaVersionRequired))
            config.EaVersion = heartbeat.EaVersionRequired;
        if (!string.IsNullOrWhiteSpace(heartbeat.ArtifactHash))
            config.EaHash = heartbeat.ArtifactHash;

        ScenovaRuntime.SaveOrUpdateProfile(config, config.IsPrimary);
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch { }
    }

    private static async Task AppendLogAsync(string path, string message)
    {
        try
        {
            await File.AppendAllTextAsync(
                path,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " +
                InstallerDiagnostics.Sanitize(message) +
                Environment.NewLine);
        }
        catch { }
    }
}
