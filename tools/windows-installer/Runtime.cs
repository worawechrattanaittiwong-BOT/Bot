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
            if (!File.Exists(ConfigPath)) return null;
            return JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(ConfigPath), JsonOptions);
        }
        catch
        {
            return null;
        }
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

        return code.Length >= 12 ? code : null;
    }

    internal static (string? InstanceId, string? InstallToken) ReadLegacyCredentials()
    {
        try
        {
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
    public override string ToString() => Display;
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
    public string InstalledAt { get; set; } = "";
}

internal sealed class EnrollResponse
{
    public string InstanceId { get; set; } = "";
    public string InstallToken { get; set; } = "";
    public string ApiBase { get; set; } = ScenovaRuntime.ProductionApiBase;
    public string WebBase { get; set; } = ScenovaRuntime.ProductionWebBase;
    public string? ArtifactHash { get; set; }
    public bool PreservedLegacyToken { get; set; }
}

internal sealed class AgentHeartbeatResponse
{
    public bool DeviceVerified { get; set; }
    public bool ArtifactAvailable { get; set; }
    public string? ArtifactHash { get; set; }
}

internal sealed class ApiError
{
    [JsonPropertyName("message")]
    public string? Message { get; set; }
}
