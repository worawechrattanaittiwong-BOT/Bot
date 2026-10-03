namespace Scenova.CloudWorker;

internal sealed class WorkerLoop
{
    internal const string Version = "2.2.31";
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan HeartbeatRequestTimeout = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan TelemetryInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan TelemetryRequestTimeout = TimeSpan.FromSeconds(15);

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
        using var backgroundCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var relayTask = _eaRelay.RunAsync(backgroundCts.Token);
        var heartbeatTask = RunHeartbeatLoopAsync(backgroundCts.Token);
        var telemetryTask = RunTelemetryLoopAsync(backgroundCts.Token);

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var phase = "work-cycle";
                try
                {
                    var templateReady = _mt5.TemplateReady;

                    // Server update is independent from customer MT5 lifecycles.
                    // It replaces/restarts only Worker/Setup and leaves terminals running.
                    phase = "server-update";
                    if (await _serverUpdates.ProcessNextAsync(cancellationToken))
                        return;

                    phase = "commands";
                    var commands = await _client.PostAsync<CommandEnvelope>(
                        "commands",
                        new { },
                        cancellationToken);

                    if (commands.Command is not null)
                    {
                        phase = "process-command";
                        await _mt5.ProcessCommandAsync(commands.Command, _client, cancellationToken);
                    }

                    phase = "assigned";
                    var assigned = await _client.PostAsync<AssignedResponse>(
                        "assigned",
                        new { },
                        cancellationToken);

                    phase = "instance-updates";
                    await _updates.ProcessNextAsync(
                        assigned.Jobs,
                        cancellationToken);

                    foreach (var job in assigned.Jobs)
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        phase = "start-or-recover-assigned";
                        await _mt5.StartOrRecoverAsync(job, _client, cancellationToken);
                    }

                    if (templateReady)
                    {
                        phase = "claim-next";
                        var next = await _client.PostAsync<ClaimResponse>(
                            "claim-next",
                            new { },
                            cancellationToken);

                        if (next.Job is not null)
                        {
                            phase = "start-or-recover-claimed";
                            await _mt5.StartOrRecoverAsync(next.Job, _client, cancellationToken);
                        }
                    }

                    WriteStatus("OK " + DateTimeOffset.UtcNow.ToString("O"));
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    var message = ex.Message.Replace('\r', ' ').Replace('\n', ' ');
                    if (message.Length > 500) message = message[..500];
                    var diagnostic =
                        "API_OR_WORKER_RETRY " + DateTimeOffset.UtcNow.ToString("O") +
                        " phase=" + phase +
                        " runner=" + _config.RunnerId +
                        " error=" + ex.GetType().Name +
                        " message=" + message;
                    WriteStatus(diagnostic);
                    Console.Error.WriteLine(diagnostic);
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
            backgroundCts.Cancel();
            try { await Task.WhenAll(relayTask, heartbeatTask, telemetryTask); }
            catch (OperationCanceledException) { }
        }
    }

    private async Task RunHeartbeatLoopAsync(CancellationToken cancellationToken)
    {
        // Liveness must stay independent from WMI, filesystem scans, log reads,
        // EA hashing and MT5 diagnostics. If any diagnostics stall, the Server
        // must still know this Windows Worker is alive.
        while (!cancellationToken.IsCancellationRequested)
        {
            var startedAt = DateTime.UtcNow;
            try
            {
                using var requestCts =
                    CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                requestCts.CancelAfter(HeartbeatRequestTimeout);

                await _client.PostAsync(
                    "heartbeat",
                    new { hostname = Environment.MachineName },
                    requestCts.Token);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                var message = ex.Message.Replace('\r', ' ').Replace('\n', ' ');
                if (message.Length > 500) message = message[..500];
                Console.Error.WriteLine(
                    "WORKER_LIVENESS_RETRY " + DateTimeOffset.UtcNow.ToString("O") +
                    " runner=" + _config.RunnerId +
                    " error=" + ex.GetType().Name +
                    " message=" + message);
            }

            var elapsed = DateTime.UtcNow - startedAt;
            var delay = HeartbeatInterval - elapsed;
            if (delay < TimeSpan.Zero) delay = TimeSpan.Zero;

            try
            {
                await Task.Delay(delay, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunTelemetryLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var startedAt = DateTime.UtcNow;
            try
            {
                // Keep potentially blocking Windows/WMI/file diagnostics off the
                // lightweight liveness path. One stuck telemetry pass must never
                // make the customer-facing VPS connection badge go offline.
                var snapshot = await Task.Run(() =>
                {
                    var templateReady = _mt5.TemplateReady;
                    var telemetry = TelemetryReader.Read(templateReady);
                    telemetry.SetupVersion = _config.SetupVersion;
                    telemetry.BrokerServers = _mt5.BrokerServers();
                    telemetry.Instances = _mt5.Diagnostics();
                    return new
                    {
                        ActiveInstances = _mt5.ActiveInstanceCount(),
                        Telemetry = telemetry
                    };
                }, cancellationToken);

                using var requestCts =
                    CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                requestCts.CancelAfter(TelemetryRequestTimeout);

                await _client.PostAsync("heartbeat", new
                {
                    hostname = Environment.MachineName,
                    activeInstances = snapshot.ActiveInstances,
                    telemetry = snapshot.Telemetry
                }, requestCts.Token);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                var message = ex.Message.Replace('\r', ' ').Replace('\n', ' ');
                if (message.Length > 500) message = message[..500];
                Console.Error.WriteLine(
                    "WORKER_TELEMETRY_RETRY " + DateTimeOffset.UtcNow.ToString("O") +
                    " runner=" + _config.RunnerId +
                    " error=" + ex.GetType().Name +
                    " message=" + message);
            }

            var elapsed = DateTime.UtcNow - startedAt;
            var delay = TelemetryInterval - elapsed;
            if (delay < TimeSpan.Zero) delay = TimeSpan.Zero;

            try
            {
                await Task.Delay(delay, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private void WriteStatus(string status)
    {
        try { File.WriteAllText(_statusPath, status); } catch { }
    }
}
