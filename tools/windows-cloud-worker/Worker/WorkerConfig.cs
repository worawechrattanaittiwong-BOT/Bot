using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Scenova.CloudWorker;

internal sealed class WorkerConfig
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SCENOVA-CLOUD-WORKER-V1");

    public string RunnerId { get; init; } = "";
    public string ApiBase { get; init; } = "";
    public string Root { get; init; } = "";
    public string WorkerKeyProtected { get; init; } = "";
    public string KeyProtection { get; init; } = "";
    public string SetupVersion { get; init; } = "";

    public string WorkerKey
    {
        get
        {
            if (!string.Equals(KeyProtection, "DPAPI_LOCAL_MACHINE", StringComparison.Ordinal))
                throw new InvalidOperationException("Unsupported worker key protection");

            var protectedBytes = Convert.FromBase64String(WorkerKeyProtected);
            var plain = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(plain);
        }
    }

    public static string ResolveConfigPath(string[] args)
    {
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], "--config", StringComparison.OrdinalIgnoreCase))
                return Path.GetFullPath(args[i + 1]);
        }

        return @"C:\BotTrading\worker\config.json";
    }

    public static WorkerConfig Load(string path)
    {
        if (!File.Exists(path)) throw new FileNotFoundException("Cloud Worker config not found", path);

        var config = JsonSerializer.Deserialize<WorkerConfig>(
            File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("Cloud Worker config invalid");

        if (!Uri.TryCreate(config.ApiBase, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrWhiteSpace(uri.UserInfo))
            throw new InvalidOperationException("Cloud Worker API must use HTTPS");

        if (!System.Text.RegularExpressions.Regex.IsMatch(config.RunnerId, "^[a-zA-Z0-9_-]{3,80}$"))
            throw new InvalidOperationException("Cloud Worker Runner ID invalid");

        var root = Path.GetFullPath(config.Root).TrimEnd('\\');
        if (!string.Equals(root, @"C:\BotTrading", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Unexpected Cloud Worker root");

        _ = config.WorkerKey;
        return config;
    }
}
