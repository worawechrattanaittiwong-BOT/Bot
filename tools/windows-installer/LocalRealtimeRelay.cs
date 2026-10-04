using System.Net.Http.Json;
using System.Text.Json;

namespace ScenovaInstaller;

internal static class LocalRealtimeRelay
{
    private static readonly TimeSpan ScanInterval = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan ProfileRefreshInterval = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(2);
    private static readonly Dictionary<string, long> LastWriteTicks =
        new(StringComparer.OrdinalIgnoreCase);

    internal static async Task RunAsync()
    {
        using var http = ScenovaClient.NewHttpClient();
        var profiles = new List<AgentConfig>();
        var nextProfileRefresh = DateTimeOffset.MinValue;

        while (true)
        {
            try
            {
                var now = DateTimeOffset.UtcNow;
                if (now >= nextProfileRefresh)
                {
                    profiles = ScenovaRuntime.ReadProfiles();
                    nextProfileRefresh = now.Add(ProfileRefreshInterval);
                }

                if (profiles.Count > 0)
                {
                    await Task.WhenAll(
                        profiles.Select(profile => ProcessProfileAsync(http, profile)));
                }
            }
            catch
            {
                // Live dashboard telemetry is best-effort. The newest snapshot
                // remains on disk and is retried on the next pass.
            }

            await Task.Delay(ScanInterval);
        }
    }

    private static async Task ProcessProfileAsync(HttpClient http, AgentConfig config)
    {
        if (string.IsNullOrWhiteSpace(config.InstanceId) ||
            string.IsNullOrWhiteSpace(config.TerminalDataPath))
            return;

        var filesPath = Path.Combine(config.TerminalDataPath, "MQL5", "Files");
        if (!Directory.Exists(filesPath))
            return;

        string? snapshotPath;
        try
        {
            snapshotPath = Directory.EnumerateFiles(
                    filesPath,
                    "scenova-live-*.snapshot.txt",
                    SearchOption.TopDirectoryOnly)
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();
        }
        catch
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(snapshotPath))
            return;

        long writeTicks;
        try
        {
            writeTicks = File.GetLastWriteTimeUtc(snapshotPath).Ticks;
        }
        catch
        {
            return;
        }

        if (LastWriteTicks.TryGetValue(snapshotPath, out var previousTicks) &&
            writeTicks <= previousTicks)
            return;

        string payload;
        try
        {
            payload = (await File.ReadAllTextAsync(snapshotPath)).Trim();
        }
        catch
        {
            return;
        }

        if (payload.Length < 32 ||
            !payload.Contains(""LIVE_EXECUTION"", StringComparison.Ordinal))
            return;

        var installToken = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected);
        if (string.IsNullOrWhiteSpace(installToken))
            return;

        Dictionary<string, object?> body;
        try
        {
            body = JsonSerializer.Deserialize<Dictionary<string, object?>>(
                payload,
                ScenovaRuntime.JsonOptions) ?? new Dictionary<string, object?>();
        }
        catch
        {
            return;
        }

        body["instanceId"] = config.InstanceId;
        body["installToken"] = installToken;

        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                config.ApiBase.TrimEnd('/') + "/api/ea/runtime-event")
            {
                Content = JsonContent.Create(body, options: ScenovaRuntime.JsonOptions)
            };
            using var timeout = new CancellationTokenSource(RequestTimeout);
            using var response = await http.SendAsync(
                request,
                HttpCompletionOption.ResponseContentRead,
                timeout.Token);

            if (response.IsSuccessStatusCode)
                LastWriteTicks[snapshotPath] = writeTicks;
        }
        catch
        {
            // Keep the watermark unchanged so the latest snapshot retries.
        }
    }
}
