using System.Diagnostics;

namespace ScenovaInstaller;

internal static class RuntimeMigrationAgent
{
    private static string SafeKey(AgentConfig config)
    {
        var raw = string.IsNullOrWhiteSpace(config.InstanceId) ? "default" : config.InstanceId;
        var safe = string.Concat(raw.Select(ch => char.IsLetterOrDigit(ch) ? ch : '_'));
        return safe.Length > 72 ? safe[..72] : safe;
    }

    private static string PendingPath(AgentConfig config) =>
        Path.Combine(ScenovaRuntime.BaseDir, "runtime-migration-" + SafeKey(config) + ".pending");

    internal static async Task<bool> ProcessAsync(
        AgentConfig config,
        string installToken,
        string logPath)
    {
        RuntimeMigrationPollResponse poll;
        try
        {
            using var http = ScenovaClient.NewHttpClient();
            poll = await ScenovaClient.PostJsonAsync<RuntimeMigrationPollResponse>(
                http,
                config.ApiBase.TrimEnd('/') + "/api/runtime-migration/agent/poll",
                new { instanceId = config.InstanceId, installToken });
        }
        catch
        {
            // A migration stop may have committed and revoked this old token while
            // the HTTP response was lost. Never restart MT5 merely because the
            // follow-up poll cannot authenticate.
            return File.Exists(PendingPath(config));
        }

        if (!string.Equals(
                poll.Action,
                "STOP_LOCAL_RUNTIME",
                StringComparison.OrdinalIgnoreCase))
            return false;
        if (string.IsNullOrWhiteSpace(poll.MigrationId) || poll.ExecutionGeneration <= 0)
            return true;

        var pending = PendingPath(config);
        try
        {
            Directory.CreateDirectory(ScenovaRuntime.BaseDir);
            File.WriteAllText(
                pending,
                poll.MigrationId + "|" + poll.ExecutionGeneration);
        }
        catch { }

        var result = "STOP_FAILED";
        var errorCode = "LOCAL_TERMINAL_STOP_FAILED";
        try
        {
            var terminalExe = ScenovaRuntime.ResolveTerminalExecutable(config.TerminalDataPath);
            if (string.IsNullOrWhiteSpace(terminalExe) || !File.Exists(terminalExe))
            {
                errorCode = "LOCAL_TERMINAL_NOT_FOUND";
            }
            else if (StopExactTerminal(terminalExe))
            {
                result = "STOP_CONFIRMED";
                errorCode = "";
            }
        }
        catch
        {
            errorCode = "LOCAL_TERMINAL_STOP_EXCEPTION";
        }

        try
        {
            using var http = ScenovaClient.NewHttpClient();
            var confirmed = await ScenovaClient.PostJsonAsync<RuntimeMigrationConfirmResponse>(
                http,
                config.ApiBase.TrimEnd('/') + "/api/runtime-migration/agent/confirm",
                new
                {
                    instanceId = config.InstanceId,
                    installToken,
                    migrationId = poll.MigrationId,
                    executionGeneration = poll.ExecutionGeneration,
                    result,
                    errorCode
                });

            await AppendLogAsync(
                logPath,
                "Runtime migration Local stop result=" + result +
                " state=" + (confirmed.State ?? "") +
                " profile=" + SafeKey(config));

            if (confirmed.RemoveProfile)
            {
                // The Server has already rotated the execution lease and moved
                // ownership away from this Local runtime. Remove the stale local
                // profile so it cannot keep polling with the revoked token.
                ScenovaRuntime.RemoveProfile(config.InstanceId);
            }
            TryDelete(pending);
        }
        catch
        {
            // Keep the marker. The Server may already have committed the handoff;
            // the next cycle will fail closed and will never auto-restart MT5.
        }

        // Once a migration stop has been observed, skip every normal/manual MT5
        // restart path for this profile during the current Agent cycle.
        return true;
    }

    private static bool StopExactTerminal(string terminalExe)
    {
        var normalized = Path.GetFullPath(terminalExe);
        var targets = FindExactProcesses(normalized);
        try
        {
            foreach (var process in targets)
            {
                if (process.HasExited) continue;
                try { process.CloseMainWindow(); } catch { }
                if (!process.WaitForExit(8000))
                {
                    process.Kill(entireProcessTree: true);
                    process.WaitForExit(5000);
                }
            }
        }
        finally
        {
            foreach (var process in targets) process.Dispose();
        }

        var remaining = FindExactProcesses(normalized);
        try { return remaining.Count == 0; }
        finally
        {
            foreach (var process in remaining) process.Dispose();
        }
    }

    private static List<Process> FindExactProcesses(string normalizedTerminalExe)
    {
        var result = new List<Process>();
        foreach (var process in Process.GetProcessesByName("terminal64"))
        {
            try
            {
                var path = process.MainModule?.FileName;
                if (!string.IsNullOrWhiteSpace(path) &&
                    string.Equals(
                        Path.GetFullPath(path),
                        normalizedTerminalExe,
                        StringComparison.OrdinalIgnoreCase))
                {
                    result.Add(process);
                    continue;
                }
            }
            catch { }
            process.Dispose();
        }
        return result;
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch { }
    }

    private static async Task AppendLogAsync(string path, string message)
    {
        try
        {
            await File.AppendAllTextAsync(
                path,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " +
                InstallerDiagnostics.Sanitize(message) + Environment.NewLine);
        }
        catch { }
    }
}

internal sealed class RuntimeMigrationPollResponse
{
    public bool Ok { get; set; }
    public string? Action { get; set; }
    public string? MigrationId { get; set; }
    public long ExecutionGeneration { get; set; }
}

internal sealed class RuntimeMigrationConfirmResponse
{
    public bool Ok { get; set; }
    public string? State { get; set; }
    public bool RemoveProfile { get; set; }
}
