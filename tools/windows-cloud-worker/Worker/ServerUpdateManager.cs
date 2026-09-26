using System.Diagnostics;

namespace Scenova.CloudWorker;

internal sealed class ServerUpdateManager
{
    private readonly WorkerConfig _config;
    private readonly WorkerClient _client;

    public ServerUpdateManager(WorkerConfig config, WorkerClient client)
    {
        _config = config;
        _client = client;
    }

    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        var envelope = await _client.PostAsync<ServerSoftwareUpdateEnvelope>(
            "server-updates/next",
            new { },
            cancellationToken);

        if (envelope.Update is null) return false;
        var update = envelope.Update;

        try
        {
            var bytes = await _client.DownloadServerSetupAsync(
                update.SetupUrl,
                cancellationToken);

            var packageDir = Path.Combine(_config.Root, "packages", "server");
            Directory.CreateDirectory(packageDir);

            var safeVersion = new string(update.TargetSetupVersion
                .Where(c => char.IsLetterOrDigit(c) || c == '.' || c == '-')
                .ToArray());
            if (string.IsNullOrWhiteSpace(safeVersion)) safeVersion = "latest";

            var target = Path.Combine(
                packageDir,
                "SCENOVA-Cloud-Setup-" + safeVersion + ".exe");
            var temp = target + ".tmp";
            await File.WriteAllBytesAsync(temp, bytes, cancellationToken);
            File.Move(temp, target, true);

            await _client.PostAsync(
                "server-updates/result",
                new
                {
                    serverUpdateId = update.Id,
                    result = "RESTARTING",
                    resultCode = ""
                },
                cancellationToken);

            var process = Process.Start(new ProcessStartInfo
            {
                FileName = target,
                Arguments = "--unattended",
                WorkingDirectory = packageDir,
                UseShellExecute = true
            });

            if (process is null)
                throw new InvalidOperationException("SERVER_SETUP_START_FAILED");

            return true;
        }
        catch (Exception ex)
        {
            try
            {
                await _client.PostAsync(
                    "server-updates/result",
                    new
                    {
                        serverUpdateId = update.Id,
                        result = "FAILED",
                        resultCode = Normalize(ex.Message)
                    },
                    cancellationToken);
            }
            catch { }

            return false;
        }
    }

    private static string Normalize(string? value)
    {
        var clean = new string((value ?? "SERVER_UPDATE_FAILED")
            .ToUpperInvariant()
            .Select(c => char.IsLetterOrDigit(c) || c == '_' ? c : '_')
            .ToArray())
            .Trim('_');

        return string.IsNullOrWhiteSpace(clean)
            ? "SERVER_UPDATE_FAILED"
            : clean[..Math.Min(64, clean.Length)];
    }
}
