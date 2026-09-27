namespace Scenova.CloudWorker;

internal sealed class CloudEaRelay
{
    private readonly WorkerConfig _config;
    private readonly WorkerClient _client;
    private readonly string _instancesPath;

    public CloudEaRelay(WorkerConfig config, WorkerClient client)
    {
        _config = config;
        _client = client;
        _instancesPath = Path.Combine(config.Root, "instances");
    }

    public async Task RunAsync(CancellationToken cancellationToken)
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
                        await ProcessInstanceAsync(instancePath, cancellationToken);
                    }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                // Relay is best-effort per pass. EA retries on its next heartbeat.
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

    private async Task ProcessInstanceAsync(string instancePath, CancellationToken cancellationToken)
    {
        var filesPath = Path.Combine(instancePath, "MQL5", "Files");
        if (!Directory.Exists(filesPath)) return;

        foreach (var requestPath in Directory.EnumerateFiles(
                     filesPath,
                     "scenova-hb-*.request.txt",
                     SearchOption.TopDirectoryOnly))
        {
            cancellationToken.ThrowIfCancellationRequested();

            string[] lines;
            try { lines = await File.ReadAllLinesAsync(requestPath, cancellationToken); }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }

            if (lines.Length < 2 || string.IsNullOrWhiteSpace(lines[0]))
                continue;

            var requestId = lines[0].Trim();
            var payload = string.Join("\n", lines.Skip(1)).Trim();
            if (payload.Length < 16) continue;

            var responsePath = requestPath.Replace(".request.txt", ".response.txt", StringComparison.OrdinalIgnoreCase);
            var tempPath = responsePath + ".tmp";

            int statusCode;
            string body;
            try
            {
                var result = await _client.RelayEaHeartbeatAsync(payload, cancellationToken);
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
                File.Delete(requestPath);
            }
            catch
            {
                try { if (File.Exists(tempPath)) File.Delete(tempPath); } catch { }
            }
        }
    }
}

internal sealed record EaRelayResult(int StatusCode, string Body);
