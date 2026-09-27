namespace Scenova.CloudWorker;

internal sealed class WorkerLoop
{
    internal const string Version = "2.2.18";

    private readonly WorkerConfig _config;
    private readonly WorkerClient _client;
    private readonly Mt5Runtime _mt5;
    private readonly ServerUpdateManager _serverUpdates;
    private readonly FleetUpdateManager _updates;
    private readonly CloudEaRelay _eaRelay;
    private readonly string _statusPath;

    public WorkerLoop(WorkerConfig config, WorkerClient client)
    {
        _config = config;
        _client = client;
        _mt5 = new Mt5Runtime(config);
        _serverUpdates = new ServerUpdateManager(config, client);
        _updates = new FleetUpdateManager(config, client, _mt5);
        _eaRelay = new CloudEaRelay(config, client);
        _statusPath = Path.Combine(config.Root, "worker", "last-status.txt");
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.Combine(_config.Root, "worker"));
        using var relayCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var relayTask = _eaRelay.RunAsync(relayCts.Token);

        try
        {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var templateReady = _mt5.TemplateReady;
                var telemetry = TelemetryReader.Read(templateReady);
                telemetry.SetupVersion = _config.SetupVersion;
                telemetry.Instances = _mt5.Diagnostics();

                await _client.PostAsync("heartbeat", new
                {
                    hostname = Environment.MachineName,
                    activeInstances = _mt5.ActiveInstanceCount(),
                    telemetry
                }, cancellationToken);

                // Server update is independent from customer MT5 lifecycles.
                // It replaces/restarts only Worker/Setup and leaves terminals running.
                if (await _serverUpdates.ProcessNextAsync(cancellationToken))
                    return;

                var commands = await _client.PostAsync<CommandEnvelope>(
                    "commands",
                    new { },
                    cancellationToken);

                if (commands.Command is not null)
                    await _mt5.ProcessCommandAsync(commands.Command, _client, cancellationToken);

                var assigned = await _client.PostAsync<AssignedResponse>(
                    "assigned",
                    new { },
                    cancellationToken);

                await _updates.ProcessNextAsync(
                    assigned.Jobs,
                    cancellationToken);

                foreach (var job in assigned.Jobs)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await _mt5.StartOrRecoverAsync(job, _client, cancellationToken);
                }

                if (templateReady)
                {
                    var next = await _client.PostAsync<ClaimResponse>(
                        "claim-next",
                        new { },
                        cancellationToken);

                    if (next.Job is not null)
                        await _mt5.StartOrRecoverAsync(next.Job, _client, cancellationToken);
                }

                WriteStatus("OK " + DateTimeOffset.UtcNow.ToString("O"));
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                WriteStatus("API_OR_WORKER_RETRY " + DateTimeOffset.UtcNow.ToString("O"));
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
        }
        finally
        {
            relayCts.Cancel();
            try { await relayTask; } catch (OperationCanceledException) { }
        }
    }

    private void WriteStatus(string status)
    {
        try { File.WriteAllText(_statusPath, status); } catch { }
    }
}
