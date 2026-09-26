namespace Scenova.CloudWorker;

internal sealed class FleetUpdateManager
{
    private readonly WorkerConfig _config;
    private readonly WorkerClient _client;
    private readonly Mt5Runtime _mt5;

    public FleetUpdateManager(
        WorkerConfig config,
        WorkerClient client,
        Mt5Runtime mt5)
    {
        _config = config;
        _client = client;
        _mt5 = mt5;
    }

    public async Task ProcessNextAsync(
        IReadOnlyList<CloudJob> assigned,
        CancellationToken cancellationToken)
    {
        var envelope = await _client.PostAsync<FleetUpdateEnvelope>(
            "updates/next",
            new { },
            cancellationToken);

        if (envelope.Update is null) return;
        var update = envelope.Update;

        var job = assigned.FirstOrDefault(item =>
            string.Equals(
                item.InstanceId,
                update.InstanceId,
                StringComparison.OrdinalIgnoreCase));

        if (job is null)
        {
            await ReportFailed(
                update,
                "INSTANCE_NOT_ASSIGNED",
                null,
                cancellationToken);
            return;
        }

        try
        {
            EaApplyOutcome outcome;

            if (string.Equals(update.Action, "UPDATE", StringComparison.Ordinal))
            {
                if (string.IsNullOrWhiteSpace(update.TargetSha256))
                    throw new InvalidOperationException("UPDATE_HASH_REQUIRED");

                var bytes = await _client.DownloadUpdateArtifactAsync(
                    update.Id,
                    cancellationToken);

                var packagePath = EaPackageStore.CachePackage(
                    _config.Root,
                    update.TargetVersion,
                    update.TargetSha256,
                    bytes);

                outcome = _mt5.ApplyEaUpdate(job, update, packagePath);
            }
            else if (string.Equals(update.Action, "ROLLBACK", StringComparison.Ordinal))
            {
                outcome = _mt5.ApplyEaRollback(job, update);
            }
            else
            {
                throw new InvalidOperationException("UNSUPPORTED_UPDATE_ACTION");
            }

            await _client.PostAsync(
                "updates/result",
                new
                {
                    instanceUpdateId = update.Id,
                    result = "APPLIED",
                    resultCode = "",
                    previousSha256 = outcome.PreviousSha256
                },
                cancellationToken);
        }
        catch (EaApplyException ex)
        {
            await ReportFailed(
                update,
                ex.Code,
                ex.PreviousSha256,
                cancellationToken);
        }
        catch (Exception ex)
        {
            var code = NormalizeError(ex.Message, update.Action);
            await ReportFailed(update, code, null, cancellationToken);
        }
    }

    private Task ReportFailed(
        FleetUpdateJob update,
        string code,
        string? previousSha256,
        CancellationToken cancellationToken)
    {
        return _client.PostAsync(
            "updates/result",
            new
            {
                instanceUpdateId = update.Id,
                result = "FAILED",
                resultCode = NormalizeError(code, update.Action),
                previousSha256
            },
            cancellationToken);
    }

    private static string NormalizeError(string? value, string action)
    {
        var clean = new string((value ?? "")
            .ToUpperInvariant()
            .Select(c => char.IsLetterOrDigit(c) || c == '_' ? c : '_')
            .ToArray())
            .Trim('_');

        if (clean.Length > 64) clean = clean[..64];
        if (!string.IsNullOrWhiteSpace(clean)) return clean;

        return string.Equals(action, "ROLLBACK", StringComparison.Ordinal)
            ? "ROLLBACK_FAILED"
            : "UPDATE_FAILED";
    }
}
