namespace Scenova.CloudWorker;

internal sealed class CloudEaRelay
{
    private static readonly TimeSpan HeartbeatRequestMaxAge = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan HeartbeatResponseMaxAge = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan HeartbeatRelayTimeout = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan JournalFileSettleAge = TimeSpan.FromMilliseconds(250);
    private static readonly TimeSpan LiveExecutionRelayInterval = TimeSpan.FromMilliseconds(100);
    private static readonly TimeSpan LiveExecutionRequestTimeout = TimeSpan.FromSeconds(2);

    private readonly WorkerConfig _config;
    private readonly WorkerClient _client;
    private readonly string _instancesPath;
    private readonly Dictionary<string, DateTime> _eventRetryAfterUtc =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, DateTime> _journalRetryAfterUtc =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, long> _liveExecutionLastWriteTicks =
        new(StringComparer.OrdinalIgnoreCase);

    public CloudEaRelay(WorkerConfig config, WorkerClient client)
    {
        _config = config;
        _client = client;
        _instancesPath = Path.Combine(config.Root, "instances");
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var heartbeatTask = RunHeartbeatRelayLoopAsync(cancellationToken);
        var eventTask = RunRuntimeEventRelayLoopAsync(cancellationToken);
        var liveExecutionTask = RunLiveExecutionRelayLoopAsync(cancellationToken);
        var journalTask = RunJournalRelayLoopAsync(cancellationToken);
        await Task.WhenAll(heartbeatTask, eventTask, liveExecutionTask, journalTask);
    }

    private async Task RunHeartbeatRelayLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (Directory.Exists(_instancesPath))
                {
                    var instancePaths = Directory.EnumerateDirectories(_instancesPath).ToArray();
                    await Task.WhenAll(
                        instancePaths.Select(instancePath =>
                            ProcessHeartbeatAsync(instancePath, cancellationToken)));
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                // Heartbeat relay retries per pass. One MT5/API delay must not
                // block heartbeat delivery for other instances.
            }

            try
            {
                await Task.Delay(100, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunRuntimeEventRelayLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (Directory.Exists(_instancesPath))
                {
                    foreach (var instancePath in Directory.EnumerateDirectories(_instancesPath))
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        await ProcessRuntimeEventsAsync(instancePath, cancellationToken);
                    }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                // Runtime events are best-effort local queue files and retry later.
            }

            try
            {
                await Task.Delay(100, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunLiveExecutionRelayLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (Directory.Exists(_instancesPath))
                {
                    var instancePaths = Directory.EnumerateDirectories(_instancesPath).ToArray();
                    await Task.WhenAll(
                        instancePaths.Select(instancePath =>
                            ProcessLiveExecutionSnapshotAsync(instancePath, cancellationToken)));
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                // Replaceable snapshots are best-effort. The newest file remains
                // available and is retried on the next pass.
            }

            try
            {
                await Task.Delay(LiveExecutionRelayInterval, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task ProcessLiveExecutionSnapshotAsync(
        string instancePath,
        CancellationToken cancellationToken)
    {
        var filesPath = Path.Combine(instancePath, "MQL5", "Files");
        if (!Directory.Exists(filesPath)) return;

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
        catch (IOException) { return; }
        catch (UnauthorizedAccessException) { return; }

        if (string.IsNullOrWhiteSpace(snapshotPath)) return;

        long writeTicks;
        try { writeTicks = File.GetLastWriteTimeUtc(snapshotPath).Ticks; }
        catch (IOException) { return; }
        catch (UnauthorizedAccessException) { return; }

        if (_liveExecutionLastWriteTicks.TryGetValue(snapshotPath, out var previousTicks) &&
            writeTicks <= previousTicks)
            return;

        string payload;
        try { payload = (await File.ReadAllTextAsync(snapshotPath, cancellationToken)).Trim(); }
        catch (IOException) { return; }
        catch (UnauthorizedAccessException) { return; }

        if (payload.Length < 32 || !payload.Contains(""LIVE_EXECUTION"", StringComparison.Ordinal))
            return;

        try
        {
            using var relayCts =
                CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            relayCts.CancelAfter(LiveExecutionRequestTimeout);
            var statusCode = await _client.RelayEaRuntimeEventAsync(payload, relayCts.Token);
            if (statusCode >= 200 && statusCode < 300)
                _liveExecutionLastWriteTicks[snapshotPath] = writeTicks;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            // Do not advance the watermark. The latest snapshot will retry.
        }
    }

    private async Task RunJournalRelayLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                if (Directory.Exists(_instancesPath))
                {
                    foreach (var instancePath in Directory.EnumerateDirectories(_instancesPath))
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        await ProcessJournalEventsAsync(instancePath, cancellationToken);
                    }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                // Journal files are durable. A transient filesystem/API error
                // leaves them on disk for a later pass.
            }

            try
            {
                await Task.Delay(100, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task ProcessHeartbeatAsync(
        string instancePath,
        CancellationToken cancellationToken)
    {
        var filesPath = Path.Combine(instancePath, "MQL5", "Files");
        if (!Directory.Exists(filesPath)) return;

        CleanupExpiredHeartbeatFiles(filesPath);

        string? requestPath;
        try
        {
            // Only the newest request can still be useful to the EA. Older
            // single-use requests are left for the stale-file cleanup instead
            // of consuming relay time ahead of current control-plane liveness.
            requestPath = Directory.EnumerateFiles(
                    filesPath,
                    "scenova-hb-*.request.txt",
                    SearchOption.TopDirectoryOnly)
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();
        }
        catch (IOException) { return; }
        catch (UnauthorizedAccessException) { return; }

        if (string.IsNullOrWhiteSpace(requestPath)) return;

        string[] lines;
        try { lines = await File.ReadAllLinesAsync(requestPath, cancellationToken); }
        catch (IOException) { return; }
        catch (UnauthorizedAccessException) { return; }

        if (lines.Length < 2 || string.IsNullOrWhiteSpace(lines[0]))
            return;

        var requestId = lines[0].Trim();
        var payload = string.Join("\n", lines.Skip(1)).Trim();
        if (payload.Length < 16) return;

        var responsePath = requestPath.Replace(
            ".request.txt",
            ".response.txt",
            StringComparison.OrdinalIgnoreCase);
        var tempPath = responsePath + ".tmp";

        int statusCode;
        string body;
        try
        {
            using var relayCts =
                CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            relayCts.CancelAfter(HeartbeatRelayTimeout);

            var result = await _client.RelayEaHeartbeatAsync(payload, relayCts.Token);
            statusCode = result.StatusCode;
            body = result.Body.Replace("\r", "").Replace("\n", "");
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            statusCode = 0;
            body = "{}";
        }

        try
        {
            await File.WriteAllTextAsync(
                tempPath,
                requestId + Environment.NewLine +
                statusCode + Environment.NewLine +
                body,
                cancellationToken);
            File.Move(tempPath, responsePath, true);
            DeleteRequestIfUnchanged(requestPath, requestId);
        }
        catch
        {
            try { if (File.Exists(tempPath)) File.Delete(tempPath); } catch { }
        }
    }

    private async Task ProcessRuntimeEventsAsync(
        string instancePath,
        CancellationToken cancellationToken)
    {
        var filesPath = Path.Combine(instancePath, "MQL5", "Files");
        if (!Directory.Exists(filesPath)) return;

        // Realtime status events are fire-and-retry files. The EA never waits
        // for internet I/O; this relay owns delivery and keeps failed files in
        // the local queue. This loop is intentionally separate from heartbeat
        // relay so event backlog or an upstream delay cannot make MT5 look stale.
        if (_eventRetryAfterUtc.TryGetValue(instancePath, out var retryAfter) &&
            retryAfter > DateTime.UtcNow)
            return;

        var relayFailed = false;
        foreach (var eventPath in Directory.EnumerateFiles(
                     filesPath,
                     "scenova-evt-*.request.txt",
                     SearchOption.TopDirectoryOnly)
                 .OrderBy(File.GetCreationTimeUtc)
                 .Take(64))
        {
            cancellationToken.ThrowIfCancellationRequested();

            string payload;
            try { payload = (await File.ReadAllTextAsync(eventPath, cancellationToken)).Trim(); }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }

            if (payload.Length < 16) continue;

            try
            {
                var statusCode = await _client.RelayEaRuntimeEventAsync(payload, cancellationToken);
                if (statusCode >= 200 && statusCode < 300)
                {
                    File.Delete(eventPath);
                    continue;
                }

                relayFailed = true;
                break;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch
            {
                // Leave the event file in place for a later retry.
                relayFailed = true;
                break;
            }
        }

        if (relayFailed)
            _eventRetryAfterUtc[instancePath] = DateTime.UtcNow.AddSeconds(1);
        else
            _eventRetryAfterUtc.Remove(instancePath);
    }

    private async Task ProcessJournalEventsAsync(
        string instancePath,
        CancellationToken cancellationToken)
    {
        var filesPath = Path.Combine(instancePath, "MQL5", "Files");
        if (!Directory.Exists(filesPath)) return;

        if (_journalRetryAfterUtc.TryGetValue(instancePath, out var retryAfter) &&
            retryAfter > DateTime.UtcNow)
            return;

        var relayFailed = false;
        var now = DateTime.UtcNow;

        foreach (var journalPath in Directory.EnumerateFiles(
                     filesPath,
                     "scenova-journal-*.request.txt",
                     SearchOption.TopDirectoryOnly)
                 .OrderBy(File.GetCreationTimeUtc)
                 .Take(128))
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                if (now - File.GetLastWriteTimeUtc(journalPath) < JournalFileSettleAge)
                    continue;
            }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }

            string payload;
            try
            {
                payload = (await File.ReadAllTextAsync(journalPath, cancellationToken)).Trim();
            }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }

            if (payload.Length < 16)
                continue;

            try
            {
                var statusCode = await _client.RelayEaJournalAsync(payload, cancellationToken);
                if (statusCode >= 200 && statusCode < 300)
                {
                    File.Delete(journalPath);
                    continue;
                }

                // Keep malformed/unauthorized payloads for operator inspection,
                // but move them out of the active queue so one poison file can
                // never block newer journal events.
                if (statusCode is 400 or 422)
                {
                    var failedPath = journalPath.Replace(
                        ".request.txt",
                        ".failed.txt",
                        StringComparison.OrdinalIgnoreCase);
                    File.Move(journalPath, failedPath, true);
                    continue;
                }

                // Authentication, route availability, rate limits and 5xx can
                // all recover after a deployment/rebind. Keep the durable file
                // and retry instead of silently stranding a valid trade event.
                relayFailed = true;
                break;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch
            {
                relayFailed = true;
                break;
            }
        }

        if (relayFailed)
            _journalRetryAfterUtc[instancePath] = DateTime.UtcNow.AddSeconds(1);
        else
            _journalRetryAfterUtc.Remove(instancePath);
    }

    private static void CleanupExpiredHeartbeatFiles(string filesPath)
    {
        var now = DateTime.UtcNow;
        foreach (var path in Directory.EnumerateFiles(
                     filesPath,
                     "scenova-hb-*.*.txt",
                     SearchOption.TopDirectoryOnly))
        {
            try
            {
                var maxAge = path.EndsWith(".request.txt", StringComparison.OrdinalIgnoreCase)
                    ? HeartbeatRequestMaxAge
                    : path.EndsWith(".response.txt", StringComparison.OrdinalIgnoreCase)
                        ? HeartbeatResponseMaxAge
                        : TimeSpan.Zero;
                if (maxAge == TimeSpan.Zero) continue;
                if (now - File.GetLastWriteTimeUtc(path) > maxAge)
                    File.Delete(path);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static void DeleteRequestIfUnchanged(string requestPath, string requestId)
    {
        try
        {
            if (!File.Exists(requestPath)) return;
            string? currentRequestId;
            using (var reader = new StreamReader(requestPath))
                currentRequestId = reader.ReadLine()?.Trim();
            if (string.Equals(currentRequestId, requestId, StringComparison.Ordinal))
                File.Delete(requestPath);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}

internal sealed record EaRelayResult(int StatusCode, string Body);
