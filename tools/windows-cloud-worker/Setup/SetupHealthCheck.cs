using System.Diagnostics;
using System.Text.Json;

namespace Scenova.CloudSetup;

internal sealed record SetupCheck(string Name, bool Passed, string Detail);

internal sealed record SetupHealthReport(
    bool Ready,
    string Status,
    string RunnerId,
    string SetupVersion,
    DateTimeOffset CheckedAtUtc,
    IReadOnlyList<SetupCheck> Checks);

internal static class SetupHealthCheck
{
    public static async Task<SetupHealthReport> RunAsync(
        string root,
        string runnerId,
        string setupVersion,
        string apiBase,
        string workerPath,
        string configPath)
    {
        var checks = new List<SetupCheck>
        {
            CheckFile("WORKER_EXE", workerPath, 64 * 1024),
            CheckConfig(configPath),
            new(
                "AUTO_START",
                WorkerStartupManager.IsRegistered(runnerId),
                WorkerStartupManager.TaskName(runnerId)),
            new(
                "MT5_TEMPLATE",
                Mt5TemplateManager.IsReady(root),
                Path.Combine(root, "template"))
        };

        var workerRunning = await WaitForWorkerAsync(workerPath, TimeSpan.FromSeconds(15));
        checks.Add(new SetupCheck(
            "WORKER_PROCESS",
            workerRunning,
            workerRunning ? "running" : "not running"));

        var backend = await CheckBackendAsync(apiBase);
        checks.Add(backend);

        var ready = checks.All(item => item.Passed);
        var report = new SetupHealthReport(
            ready,
            ready ? "READY" : "FAILED",
            runnerId,
            setupVersion,
            DateTimeOffset.UtcNow,
            checks);

        Persist(root, report);
        return report;
    }

    private static SetupCheck CheckFile(string name, string path, long minimumBytes)
    {
        try
        {
            var info = new FileInfo(path);
            var ok = info.Exists && info.Length >= minimumBytes;
            return new SetupCheck(name, ok, ok ? path : "missing/incomplete");
        }
        catch
        {
            return new SetupCheck(name, false, "unreadable");
        }
    }

    private static SetupCheck CheckConfig(string configPath)
    {
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(configPath));
            var root = doc.RootElement;

            var runner = root.TryGetProperty("RunnerId", out var runnerId)
                ? runnerId.GetString()
                : null;
            var protectedKey = root.TryGetProperty("WorkerKeyProtected", out var key)
                ? key.GetString()
                : null;

            var ok =
                !string.IsNullOrWhiteSpace(runner) &&
                !string.IsNullOrWhiteSpace(protectedKey);

            return new SetupCheck("WORKER_CONFIG", ok, ok ? "protected config present" : "invalid config");
        }
        catch
        {
            return new SetupCheck("WORKER_CONFIG", false, "unreadable config");
        }
    }

    private static async Task<bool> WaitForWorkerAsync(string workerPath, TimeSpan timeout)
    {
        var deadline = DateTimeOffset.UtcNow + timeout;

        while (DateTimeOffset.UtcNow < deadline)
        {
            if (WorkerStartupManager.IsWorkerRunning(workerPath))
                return true;

            await Task.Delay(500);
        }

        return WorkerStartupManager.IsWorkerRunning(workerPath);
    }

    private static async Task<SetupCheck> CheckBackendAsync(string apiBase)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            using var response = await http.GetAsync(apiBase.TrimEnd('/') + "/api/health");
            if (!response.IsSuccessStatusCode)
                return new SetupCheck("BACKEND_HTTPS", false, "HTTP " + (int)response.StatusCode);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var ok = doc.RootElement.TryGetProperty("ok", out var value) &&
                     value.ValueKind == JsonValueKind.True;

            return new SetupCheck("BACKEND_HTTPS", ok, ok ? "reachable" : "unexpected response");
        }
        catch (Exception ex)
        {
            var detail = ex.GetType().Name;
            return new SetupCheck("BACKEND_HTTPS", false, detail);
        }
    }

    private static void Persist(string root, SetupHealthReport report)
    {
        try
        {
            var path = Path.Combine(root, "worker", "setup-health.json");
            File.WriteAllText(
                path,
                JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // Health persistence is diagnostic only; the returned result remains authoritative.
        }
    }
}
