using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ScenovaInstaller;

internal static class ScenovaRuntime
{
    internal const string ProductionApiBase = "https://snvea-bot.online/backend";
    internal const string ProductionWebBase = "https://snvea-bot.online";
    internal static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    internal static string BaseDir =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SCENOVA");

    internal static string ConfigPath => Path.Combine(BaseDir, "config-v2.json");
    internal static string ProfilesPath => Path.Combine(BaseDir, "profiles-v3.json");
    internal static string PendingInstallPath => Path.Combine(BaseDir, "pending-install-v2.json");
    internal static string StatePath => Path.Combine(BaseDir, "smart-installer-state-v3.json");
    internal static string BackupDir => Path.Combine(BaseDir, "backups-v3");
    internal static string StagingDir => Path.Combine(BaseDir, "staging-v3");
    internal static string DiagnosticsPath => Path.Combine(BaseDir, "smart-installer-v3.log");

    internal static string? ResolveTerminalExecutable(string terminalDataPath)
    {
        try
        {
            var originPath = Path.Combine(terminalDataPath, "origin.txt");
            if (!File.Exists(originPath)) return null;

            var origin = File.ReadAllText(originPath).Trim('\0', ' ', '\r', '\n');
            if (string.IsNullOrWhiteSpace(origin)) return null;

            if (File.Exists(origin) &&
                string.Equals(Path.GetFileName(origin), "terminal64.exe", StringComparison.OrdinalIgnoreCase))
                return origin;

            var terminalExe = Path.Combine(origin, "terminal64.exe");
            return File.Exists(terminalExe) ? terminalExe : null;
        }
        catch
        {
            return null;
        }
    }

    internal static string Protect(string value)
    {
        var protectedBytes = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(value),
            null,
            DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(protectedBytes);
    }

    internal static string? TryUnprotect(string? value)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var bytes = ProtectedData.Unprotect(
                Convert.FromBase64String(value),
                null,
                DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return null;
        }
    }

    internal static AgentConfig? ReadConfig()
    {
        try
        {
            var profiles = ReadProfiles();
            if (profiles.Count > 0)
            {
                var selected = profiles.FirstOrDefault(x => x.IsPrimary) ?? profiles[0];
                return selected;
            }

            if (!File.Exists(ConfigPath)) return null;
            return JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(ConfigPath), JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    internal static List<AgentConfig> ReadProfiles()
    {
        try
        {
            if (File.Exists(ProfilesPath))
            {
                var store = JsonSerializer.Deserialize<AgentProfileStore>(
                    File.ReadAllText(ProfilesPath),
                    JsonOptions);
                if (store?.Profiles is { Count: > 0 })
                    return store.Profiles
                        .Where(x => !string.IsNullOrWhiteSpace(x.InstanceId))
                        .GroupBy(x => x.InstanceId, StringComparer.OrdinalIgnoreCase)
                        .Select(g => g.Last())
                        .ToList();
            }

            if (File.Exists(ConfigPath))
            {
                var legacy = JsonSerializer.Deserialize<AgentConfig>(
                    File.ReadAllText(ConfigPath),
                    JsonOptions);
                if (legacy is not null && !string.IsNullOrWhiteSpace(legacy.InstanceId))
                    return [legacy];
            }
        }
        catch { }

        return [];
    }

    internal static void SaveOrUpdateProfile(AgentConfig config, bool makePrimary = true)
    {
        Directory.CreateDirectory(BaseDir);
        var profiles = ReadProfiles();

        if (makePrimary)
        {
            foreach (var item in profiles)
                item.IsPrimary = false;
            config.IsPrimary = true;
        }

        var index = profiles.FindIndex(x =>
            string.Equals(x.InstanceId, config.InstanceId, StringComparison.OrdinalIgnoreCase));
        if (index >= 0)
            profiles[index] = config;
        else
            profiles.Add(config);

        var store = new AgentProfileStore
        {
            Version = 3,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("O"),
            Profiles = profiles
        };
        File.WriteAllText(
            ProfilesPath,
            JsonSerializer.Serialize(store, JsonOptions),
            new UTF8Encoding(false));

        // Keep the legacy file synchronized with the primary profile so
        // pre-v3 tooling and emergency recovery remain compatible.
        var primary = profiles.FirstOrDefault(x => x.IsPrimary) ?? config;
        File.WriteAllText(
            ConfigPath,
            JsonSerializer.Serialize(primary, JsonOptions),
            new UTF8Encoding(false));
    }

    internal static void RemoveProfile(string instanceId)
    {
        var profiles = ReadProfiles()
            .Where(x => !string.Equals(
                x.InstanceId,
                instanceId,
                StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (profiles.Count > 0 && profiles.All(x => !x.IsPrimary))
            profiles[0].IsPrimary = true;

        Directory.CreateDirectory(BaseDir);
        var store = new AgentProfileStore
        {
            Version = 3,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("O"),
            Profiles = profiles
        };
        File.WriteAllText(
            ProfilesPath,
            JsonSerializer.Serialize(store, JsonOptions),
            new UTF8Encoding(false));

        var primary = profiles.FirstOrDefault(x => x.IsPrimary) ?? profiles.FirstOrDefault();
        if (primary is not null)
        {
            File.WriteAllText(
                ConfigPath,
                JsonSerializer.Serialize(primary, JsonOptions),
                new UTF8Encoding(false));
        }
        else
        {
            try { if (File.Exists(ConfigPath)) File.Delete(ConfigPath); } catch { }
        }
    }

    internal static SmartInstallerState ReadState()
    {
        try
        {
            if (!File.Exists(StatePath)) return new SmartInstallerState();
            return JsonSerializer.Deserialize<SmartInstallerState>(
                File.ReadAllText(StatePath),
                JsonOptions) ?? new SmartInstallerState();
        }
        catch
        {
            return new SmartInstallerState();
        }
    }

    internal static void SaveState(SmartInstallerState state)
    {
        Directory.CreateDirectory(BaseDir);
        state.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");
        File.WriteAllText(
            StatePath,
            JsonSerializer.Serialize(state, JsonOptions),
            new UTF8Encoding(false));
    }

    internal static string? ReadEnrollmentCode()
    {
        var path = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(path)) return null;

        var name = Path.GetFileNameWithoutExtension(path);
        const string prefix = "SCENOVA-Setup-";
        if (!name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;

        var code = name[prefix.Length..].Trim();

        // Versioned downloads use:
        // SCENOVA-Setup-v2.0.3-<enrollment>.exe
        // Strip only a valid leading semantic version so the API receives the
        // original enrollment code rather than "v2.0.3-<code>".
        if (code.StartsWith("v", StringComparison.OrdinalIgnoreCase))
        {
            var separator = code.IndexOf('-');
            if (separator > 1 &&
                Version.TryParse(code[1..separator], out _))
            {
                code = code[(separator + 1)..].Trim();
            }
        }

        // Browsers may append " (1)", " (2)", ... when the same
        // personalized installer is downloaded more than once. Strip only that
        // local duplicate suffix so the original enrollment code stays valid.
        var duplicateMarker = code.LastIndexOf(" (", StringComparison.Ordinal);
        if (duplicateMarker > 0 && code.EndsWith(")", StringComparison.Ordinal))
        {
            var suffix = code[(duplicateMarker + 2)..^1];
            if (int.TryParse(suffix, out _))
                code = code[..duplicateMarker].Trim();
        }

        return code.Length >= 12 ? code : null;
    }

    internal static PendingInstallIdentity? ReadPendingInstallIdentity()
    {
        try
        {
            if (!File.Exists(PendingInstallPath)) return null;
            return JsonSerializer.Deserialize<PendingInstallIdentity>(
                File.ReadAllText(PendingInstallPath),
                JsonOptions);
        }
        catch
        {
            return null;
        }
    }

    internal static void SavePendingInstallIdentity(string devicePublicId, string deviceSecret)
    {
        Directory.CreateDirectory(BaseDir);
        var pending = new PendingInstallIdentity
        {
            DevicePublicId = devicePublicId,
            DeviceSecretProtected = Protect(deviceSecret),
            CreatedAt = DateTimeOffset.Now.ToString("O")
        };
        File.WriteAllText(
            PendingInstallPath,
            JsonSerializer.Serialize(pending, JsonOptions),
            new UTF8Encoding(false));
    }

    internal static void ClearPendingInstallIdentity()
    {
        try
        {
            if (File.Exists(PendingInstallPath))
                File.Delete(PendingInstallPath);
        }
        catch { }
    }

    internal static (string? InstanceId, string? InstallToken) ReadLegacyCredentials()
    {
        try
        {
            var current = ReadConfig();
            var currentToken = TryUnprotect(current?.InstallTokenProtected);
            if (!string.IsNullOrWhiteSpace(current?.InstanceId) &&
                !string.IsNullOrWhiteSpace(currentToken))
                return (current.InstanceId, currentToken);

            var path = Path.Combine(BaseDir, "config.json");
            if (!File.Exists(path)) return (null, null);
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            var root = doc.RootElement;
            var instanceId = root.TryGetProperty("InstanceId", out var id) ? id.GetString() : null;
            var protectedToken = root.TryGetProperty("InstallTokenProtected", out var token) ? token.GetString() : null;
            return (instanceId, TryUnprotect(protectedToken));
        }
        catch
        {
            return (null, null);
        }
    }
}

internal sealed class TerminalChoice
{
    public string DataPath { get; init; } = "";
    public string Display { get; init; } = "";
    public string ExecutablePath { get; init; } = "";
    public string BrokerHint { get; init; } = "";
    public string OriginPath { get; init; } = "";
    public bool IsRunning { get; init; }
    public bool IsExistingScenovaTarget { get; init; }
    public DateTimeOffset LastSeenAt { get; init; }
    public int MatchScore { get; set; }
    public string MatchReason { get; set; } = "";
    public override string ToString() => Display;
}

internal sealed class PendingInstallIdentity
{
    public string DevicePublicId { get; set; } = "";
    public string DeviceSecretProtected { get; set; } = "";
    public string CreatedAt { get; set; } = "";
}

internal sealed class AgentProfileStore
{
    public int Version { get; set; } = 3;
    public string UpdatedAt { get; set; } = "";
    public List<AgentConfig> Profiles { get; set; } = [];
}

internal sealed class SmartInstallerState
{
    public string InstallerVersion { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string ReleaseChannel { get; set; } = "Stable";
    public string LastAction { get; set; } = "";
    public string LastResult { get; set; } = "";
    public string LastErrorCode { get; set; } = "";
    public int LastHealthScore { get; set; }
    public string LastHealthAt { get; set; } = "";
    public string LastInstallAt { get; set; } = "";
    public string LastRepairAt { get; set; } = "";
    public string LastRollbackAt { get; set; } = "";
    public string LastTerminalPath { get; set; } = "";
    public string LastEaVersion { get; set; } = "";
    public string LastEaHash { get; set; } = "";
    public string LastAgentVersion { get; set; } = "";
    public bool SignatureValid { get; set; }
    public List<string> RecentErrors { get; set; } = [];
}

internal sealed class AgentConfig
{
    public string ApiBase { get; set; } = ScenovaRuntime.ProductionApiBase;
    public string WebBase { get; set; } = ScenovaRuntime.ProductionWebBase;
    public string InstanceId { get; set; } = "";
    public string InstallTokenProtected { get; set; } = "";
    public string DevicePublicId { get; set; } = "";
    public string DeviceSecretProtected { get; set; } = "";
    public string TerminalDataPath { get; set; } = "";
    public string EaBinaryPath { get; set; } = "";
    public string StartupSymbol { get; set; } = "";
    public string InstalledAt { get; set; } = "";
    public string UpdatedAt { get; set; } = "";
    public string InstallerVersion { get; set; } = "";
    public string ReleaseChannel { get; set; } = "Stable";
    // Installed artifact identity is updated only from local file/apply state.
    // Desired release identity is tracked separately from verified runtime state.
    public string EaVersion { get; set; } = "";
    public string EaHash { get; set; } = "";
    public string PreviousEaHash { get; set; } = "";
    public string DesiredEaVersion { get; set; } = "";
    public string DesiredEaHash { get; set; } = "";
    public string VerifiedRuntimeVersion { get; set; } = "";
    public string VerifiedRuntimeContract { get; set; } = "";
    public string LastEaVerifiedAt { get; set; } = "";
    public bool IsPrimary { get; set; }
    public string TerminalBrokerHint { get; set; } = "";
    public string VerifiedAccountNumber { get; set; } = "";
    public string VerifiedServer { get; set; } = "";
    public string ExpectedAccountNumber { get; set; } = "";
    public string ExpectedServer { get; set; } = "";
}

internal sealed class EnrollResponse
{
    public string InstanceId { get; set; } = "";
    public string InstallToken { get; set; } = "";
    public string ApiBase { get; set; } = ScenovaRuntime.ProductionApiBase;
    public string WebBase { get; set; } = ScenovaRuntime.ProductionWebBase;
    public string? ArtifactHash { get; set; }
    public string StartupSymbol { get; set; } = "";
    public bool PreservedLegacyToken { get; set; }
    public string AgentVersionRequired { get; set; } = "";
    public string EaVersionRequired { get; set; } = "";
    public string ReleaseChannel { get; set; } = "Stable";
    public string? ExpectedAccountNumber { get; set; }
    public string? ExpectedServer { get; set; }
}

internal sealed class AgentHeartbeatResponse
{
    public bool DeviceVerified { get; set; }
    public bool ArtifactAvailable { get; set; }
    public string? ArtifactHash { get; set; }
    public bool EaOnline { get; set; }
    public string? EaVersion { get; set; }
    public double EaLastSeenAgeSeconds { get; set; }
    public bool? TerminalTradeAllowed { get; set; }
    public bool? MqlTradeAllowed { get; set; }
    public bool SafeToRestart { get; set; }
    public bool AgentUpdateRequired { get; set; }
    public string? AgentVersionRequired { get; set; }
    public string? AgentDownloadUrl { get; set; }
    public string? EaVersionRequired { get; set; }
    public string? RuntimeContract { get; set; }
    public string? RuntimeContractRequired { get; set; }
    public bool? RuntimeContractMatch { get; set; }
    public string? EaUpdateState { get; set; }
    public bool AgentUpdateAvailable { get; set; }
    public string? AccountNumber { get; set; }
    public string? Server { get; set; }
    public string? Broker { get; set; }
    public int Positions { get; set; }
    public string? DesiredState { get; set; }
    public string? ActualState { get; set; }
    public string? ReleaseChannel { get; set; }
}

internal sealed class ApiError
{
    [JsonPropertyName("message")]
    public string? Message { get; set; }
}
