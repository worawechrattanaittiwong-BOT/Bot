using System.Diagnostics;
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

    private static string RestartStampPath(AgentConfig config) =>
        Path.Combine(ScenovaRuntime.BaseDir, "restart-" + SafeKey(config) + ".stamp");

    private static string PermissionStampPath(AgentConfig config) =>
        Path.Combine(ScenovaRuntime.BaseDir, "permission-" + SafeKey(config) + ".stamp");

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

        var startedProfiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var repairedPermissions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        await InstallerDiagnostics.LogAsync("AGENT_START", "Smart Agent v" + InstallerConstants.AgentVersion);

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
                    await ProcessProfileAsync(
                        profile,
                        logPath,
                        startedProfiles,
                        repairedPermissions);
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
        string logPath,
        HashSet<string> startedProfiles,
        HashSet<string> repairedPermissions)
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
                agentVersion = InstallerConstants.AgentVersion,
                terminalPath = config.TerminalDataPath,
                eaHash = localHash,
                hostname = Environment.MachineName,
                devicePublicId = config.DevicePublicId,
                deviceSecret,
                releaseChannel = config.ReleaseChannel,
                installerStatus = new
                {
                    version = InstallerConstants.Version,
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

        await StageOrApplyEaAsync(http, config, token, localHash, heartbeat, logPath);

        var reloadPending = File.Exists(PendingReloadPath(config));
        if (reloadPending &&
            heartbeat.SafeToRestart &&
            CooldownElapsed(RestartStampPath(config), TimeSpan.FromMinutes(3)))
        {
            if (AgentRunner.EnsureMt5RunningWithEa(config, forceReload: true))
            {
                MarkNow(RestartStampPath(config));
                TryDelete(PendingReloadPath(config));
                startedProfiles.Add(key);
                repairedPermissions.Remove(key);
                await AppendLogAsync(logPath, "Safe EA reload completed. profile=" + key);
            }
        }
        else if (!heartbeat.EaOnline && heartbeat.SafeToRestart && !startedProfiles.Contains(key))
        {
            if (AgentRunner.EnsureMt5RunningWithEa(config, forceReload: false))
            {
                startedProfiles.Add(key);
                await AppendLogAsync(logPath, "MT5 auto-start requested. profile=" + key);
            }
        }
        else if (
            heartbeat.EaOnline &&
            heartbeat.SafeToRestart &&
            heartbeat.TerminalTradeAllowed == true &&
            heartbeat.MqlTradeAllowed == false &&
            !repairedPermissions.Contains(key) &&
            CooldownElapsed(PermissionStampPath(config), TimeSpan.FromHours(6)))
        {
            if (AgentRunner.EnsureMt5RunningWithEa(config, forceReload: true))
            {
                repairedPermissions.Add(key);
                MarkNow(PermissionStampPath(config));
                await AppendLogAsync(logPath, "Trading permission repair requested. profile=" + key);
            }
        }
        else if (heartbeat.MqlTradeAllowed == true)
        {
            repairedPermissions.Remove(key);
            TryDelete(PermissionStampPath(config));
        }

        if (heartbeat.AgentUpdateRequired)
        {
            await AppendLogAsync(
                logPath,
                "Installer/Agent update required. local=" + InstallerConstants.AgentVersion +
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
            return;
        }

        Directory.CreateDirectory(ScenovaRuntime.StagingDir);
        var pending = PendingEaPath(config);
        if (!File.Exists(pending) ||
            !string.Equals(BackupManager.HashFile(pending), expected, StringComparison.OrdinalIgnoreCase))
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

        // Safe Update invariant: if the server sees RUNNING state or positions,
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
            "EA staged file applied while safe. profile=" + SafeKey(config));
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
        config.InstallerVersion = InstallerConstants.Version;
        config.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");

        if (!string.IsNullOrWhiteSpace(heartbeat.EaVersionRequired))
            config.EaVersion = heartbeat.EaVersionRequired;
        if (!string.IsNullOrWhiteSpace(heartbeat.ArtifactHash))
            config.EaHash = heartbeat.ArtifactHash;

        ScenovaRuntime.SaveOrUpdateProfile(config, config.IsPrimary);
    }

    private static bool CooldownElapsed(string path, TimeSpan cooldown)
    {
        try
        {
            if (!File.Exists(path)) return true;
            if (!long.TryParse(File.ReadAllText(path).Trim(), out var seconds))
                return true;
            return DateTimeOffset.UtcNow -
                DateTimeOffset.FromUnixTimeSeconds(seconds) >= cooldown;
        }
        catch
        {
            return true;
        }
    }

    private static void MarkNow(string path)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(
                path,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString());
        }
        catch { }
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
