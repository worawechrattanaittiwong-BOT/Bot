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

    private const string RuntimeReloadSuffix = "-runtime-reload";

    private static string ArtifactReleaseVersion(string? value)
    {
        var raw = (value ?? "").Trim();
        return raw.EndsWith(RuntimeReloadSuffix, StringComparison.OrdinalIgnoreCase)
            ? raw[..^RuntimeReloadSuffix.Length]
            : raw;
    }

    private static bool RuntimeReloadRequired(AgentHeartbeatResponse heartbeat)
    {
        var required = ArtifactReleaseVersion(heartbeat.EaVersionRequired);
        var current = ArtifactReleaseVersion(heartbeat.EaVersion);
        var versionMismatch =
            !string.IsNullOrWhiteSpace(required) &&
            !string.Equals(current, required, StringComparison.OrdinalIgnoreCase);
        var contractMismatch = heartbeat.RuntimeContractMatch == false;
        return versionMismatch || contractMismatch;
    }

    private static bool RuntimeVerified(AgentHeartbeatResponse heartbeat) =>
        heartbeat.EaOnline &&
        !RuntimeReloadRequired(heartbeat) &&
        heartbeat.RuntimeContractMatch != false;

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

        _ = Task.Run(LocalRealtimeRelay.RunAsync);

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
                deviceFingerprint = DeviceFingerprint.Current(),
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

        UpdateVerifiedIdentity(config, heartbeat, localHash);

        // Migration stop has higher priority than every normal/manual Agent action.
        // If the Server asks this Local runtime to stop, do not stage/reload or
        // run CONNECT_MT5 later in the same cycle because that could reopen the
        // old runtime after ownership has moved to Cloud.
        if (await RuntimeMigrationAgent.ProcessAsync(config, token, logPath))
        {
            await AppendLogAsync(
                logPath,
                "Runtime migration stop handled; skipping normal MT5 actions. profile=" + key);
            return;
        }

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

        if (heartbeat.SafeToRestart)
        {
            // Always poll the guarded UPDATE_EA_RESTART action when restart-safe.
            // PendingReloadPath is only a staging hint; it must never be the
            // authorization gate. The binary on disk can already be current while
            // the loaded EA/runtime contract is stale. In that case there is no
            // pending file marker, but the explicit Web Update button still needs
            // to restart MT5 once so the current EX5 is loaded again.
            //
            // EnsureMt5RunningWithEa() remains a no-op unless the Server exposes
            // a still-active one-time UPDATE_EA_RESTART action, so background
            // heartbeats can never restart MT5 by themselves.
            if (AgentRunner.EnsureMt5RunningWithEa(config, forceReload: true))
            {
                TryDelete(PendingReloadPath(config));
                await AppendLogAsync(
                    logPath,
                    "Manual EA update restart completed. profile=" + key);
            }
        }

        if (heartbeat.SafeToRestart)
        {
            // CONNECT_MT5 is also used by authoritative Web Symbol selection.
            // Call the guarded helper even while EA is online: it remains a no-op
            // unless the Server exposes a still-active explicit action. This lets
            // the Web force MT5 to reopen on the selected Symbol without a second
            // button click once the account is flat and restart-safe.
            if (AgentRunner.EnsureMt5RunningWithEa(config, forceReload: false))
            {
                await AppendLogAsync(
                    logPath,
                    "Manual/Web-authorized MT5 connect or Symbol switch completed. profile=" + key);
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

            // The binary on disk can already be current while the loaded runtime
            // is stale. Runtime identity includes both semantic version and the
            // runtime contract; either mismatch requires one explicit reload.
            if (RuntimeReloadRequired(heartbeat))
                File.WriteAllText(PendingReloadPath(config), expected);
            else if (RuntimeVerified(heartbeat))
                TryDelete(PendingReloadPath(config));

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
        config.EaVersion = ArtifactReleaseVersion(heartbeat.EaVersionRequired ?? config.EaVersion);
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
        AgentHeartbeatResponse heartbeat,
        string localHash)
    {
        config.VerifiedAccountNumber =
            heartbeat.AccountNumber ?? config.VerifiedAccountNumber;
        config.VerifiedServer =
            heartbeat.Server ?? config.VerifiedServer;
        config.ReleaseChannel =
            heartbeat.ReleaseChannel ?? config.ReleaseChannel;
        config.InstallerVersion = AgentBuildInfo.Version;
        config.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");

        // Server-advertised release metadata is desired state only. Never copy it
        // into installed/verified fields before the local EX5 and loaded runtime
        // have independently proven that state.
        if (!string.IsNullOrWhiteSpace(heartbeat.EaVersionRequired))
            config.DesiredEaVersion = ArtifactReleaseVersion(heartbeat.EaVersionRequired);
        if (!string.IsNullOrWhiteSpace(heartbeat.ArtifactHash))
            config.DesiredEaHash = heartbeat.ArtifactHash;
        if (!string.IsNullOrWhiteSpace(localHash))
            config.EaHash = localHash;

        if (!string.IsNullOrWhiteSpace(heartbeat.EaVersion))
            config.VerifiedRuntimeVersion = ArtifactReleaseVersion(heartbeat.EaVersion);
        if (!string.IsNullOrWhiteSpace(heartbeat.RuntimeContract))
            config.VerifiedRuntimeContract = heartbeat.RuntimeContract;

        if (RuntimeVerified(heartbeat))
        {
            config.EaVersion = ArtifactReleaseVersion(heartbeat.EaVersion);
            config.LastEaVerifiedAt = DateTimeOffset.UtcNow.ToString("O");
        }

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
