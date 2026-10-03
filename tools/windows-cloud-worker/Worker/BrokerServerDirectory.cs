using System.Text;

namespace Scenova.CloudWorker;

internal sealed record BrokerServerDirectoryEntry(
    string BrokerCode,
    string ServerName,
    string Environment);

internal sealed class BrokerServerDirectory
{
    private readonly WorkerConfig _config;

    public BrokerServerDirectory(WorkerConfig config)
    {
        _config = config;
    }

    public IReadOnlyList<BrokerServerDirectoryEntry> Read()
    {
        var result = new Dictionary<string, BrokerServerDirectoryEntry>(
            StringComparer.OrdinalIgnoreCase);
        var instancesRoot = Path.Combine(_config.Root, "instances");
        if (!Directory.Exists(instancesRoot))
            return Array.Empty<BrokerServerDirectoryEntry>();

        foreach (var instancePath in Directory.EnumerateDirectories(instancesRoot))
        {
            var brokerCode = InstalledBrokerCode(instancePath);
            if (string.IsNullOrWhiteSpace(brokerCode))
                continue;

            foreach (var configName in new[] { "Config", "config" })
            {
                var serversPath = Path.Combine(instancePath, configName, "servers.dat");
                if (!File.Exists(serversPath))
                    continue;

                foreach (var serverName in ExtractServerNames(serversPath, brokerCode))
                {
                    var key = brokerCode + "|" + serverName;
                    if (!result.ContainsKey(key))
                    {
                        result[key] = new BrokerServerDirectoryEntry(
                            brokerCode,
                            serverName,
                            EnvironmentOf(serverName));
                    }
                }
            }
        }

        return result.Values
            .OrderBy(item => EnvironmentRank(item.Environment))
            .ThenBy(item => item.ServerName, StringComparer.OrdinalIgnoreCase)
            .Take(250)
            .ToArray();
    }

    private static string InstalledBrokerCode(string instancePath)
    {
        try
        {
            var marker = Path.Combine(instancePath, "broker-platform.txt");
            if (!File.Exists(marker)) return "";

            var value = File.ReadAllText(marker).Trim();
            var separator = value.IndexOf('|');
            if (separator >= 0)
                value = value[..separator];

            return value.Trim().ToUpperInvariant();
        }
        catch
        {
            return "";
        }
    }

    internal static IReadOnlyList<string> ExtractServerNames(
        string serversPath,
        string brokerCode)
    {
        try
        {
            var info = new FileInfo(serversPath);
            if (!info.Exists || info.Length <= 0 || info.Length > 32 * 1024 * 1024)
                return Array.Empty<string>();

            var bytes = File.ReadAllBytes(serversPath);
            var runs = new List<string>();
            runs.AddRange(ExtractAsciiRuns(bytes));
            runs.AddRange(ExtractUtf16LeRuns(bytes, 0));
            runs.AddRange(ExtractUtf16LeRuns(bytes, 1));

            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var run in runs)
            {
                foreach (var value in ServerTokens(run, brokerCode))
                    names.Add(value);
            }

            return names
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static IEnumerable<string> ServerTokens(string run, string brokerCode)
    {
        if (!string.Equals(brokerCode, "EXNESS", StringComparison.OrdinalIgnoreCase))
            yield break;

        // Read only broker-native MT5 names already present in the Exness
        // terminal directory. Never synthesize Trial/Real numbers.
        var cursor = 0;
        while (cursor < run.Length)
        {
            var start = run.IndexOf("Exness", cursor, StringComparison.OrdinalIgnoreCase);
            if (start < 0) yield break;

            var end = start;
            while (end < run.Length && IsServerNameChar(run[end]) && end - start < 96)
                end++;

            var candidate = run[start..end].Trim();
            if (
                candidate.Length >= 8 &&
                candidate.Contains("MT5", StringComparison.OrdinalIgnoreCase) &&
                candidate.StartsWith("Exness", StringComparison.OrdinalIgnoreCase)
            )
                yield return candidate;

            cursor = Math.Max(start + 1, end);
        }
    }

    private static bool IsServerNameChar(char value) =>
        char.IsLetterOrDigit(value) ||
        value is '-' or '_' or '.' or '(' or ')';

    private static IEnumerable<string> ExtractAsciiRuns(byte[] bytes)
    {
        var buffer = new StringBuilder();
        foreach (var value in bytes)
        {
            if (value is >= 32 and <= 126)
            {
                buffer.Append((char)value);
                continue;
            }

            if (buffer.Length >= 5)
                yield return buffer.ToString();
            buffer.Clear();
        }

        if (buffer.Length >= 5)
            yield return buffer.ToString();
    }

    private static IEnumerable<string> ExtractUtf16LeRuns(byte[] bytes, int offset)
    {
        var buffer = new StringBuilder();

        for (var i = offset; i + 1 < bytes.Length; i += 2)
        {
            var low = bytes[i];
            var high = bytes[i + 1];
            if (high == 0 && low is >= 32 and <= 126)
            {
                buffer.Append((char)low);
                continue;
            }

            if (buffer.Length >= 5)
                yield return buffer.ToString();
            buffer.Clear();
        }

        if (buffer.Length >= 5)
            yield return buffer.ToString();
    }

    private static string EnvironmentOf(string serverName)
    {
        var upper = serverName.ToUpperInvariant();
        if (upper.Contains("TRIAL") || upper.Contains("DEMO"))
            return "DEMO";
        if (upper.Contains("REAL") || upper.Contains("LIVE"))
            return "REAL";
        return "UNKNOWN";
    }

    private static int EnvironmentRank(string environment) =>
        environment switch
        {
            "REAL" => 0,
            "DEMO" => 1,
            _ => 2
        };
}
