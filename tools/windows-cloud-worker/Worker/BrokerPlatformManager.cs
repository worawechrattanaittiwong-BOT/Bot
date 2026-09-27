using System.Diagnostics;
using System.Text;

namespace Scenova.CloudWorker;

internal sealed class BrokerPlatformManager
{
    private const string ExnessCode = "EXNESS";
    private static readonly Uri ExnessInstaller = new(
        "https://download.terminal.free/cdn/web/exness.technologies.ltd/mt5/exness5setup.exe");

    private readonly WorkerConfig _config;

    public BrokerPlatformManager(WorkerConfig config)
    {
        _config = config;
    }

    public string RequiredPlatform(CloudJob job)
    {
        var broker = (job.Broker ?? "").Trim();
        var server = (job.BrokerServer ?? "").Trim();

        if (broker.Contains("exness", StringComparison.OrdinalIgnoreCase) ||
            server.StartsWith("Exness-", StringComparison.OrdinalIgnoreCase))
            return ExnessCode;

        return "";
    }

    public string InstalledPlatform(string instancePath)
    {
        try
        {
            var marker = Path.Combine(instancePath, "broker-platform.txt");
            if (!File.Exists(marker)) return "";
            var value = File.ReadAllText(marker).Trim();
            var separator = value.IndexOf('|');
            if (separator >= 0) value = value.Substring(0, separator);
            return value.Trim().ToUpperInvariant();
        }
        catch
        {
            return "";
        }
    }

    public bool NeedsInstall(CloudJob job, string instancePath)
    {
        var required = RequiredPlatform(job);
        if (string.IsNullOrWhiteSpace(required)) return false;
        return !string.Equals(
            InstalledPlatform(instancePath),
            required,
            StringComparison.OrdinalIgnoreCase);
    }

    public async Task InstallAsync(
        CloudJob job,
        string instancePath,
        CancellationToken cancellationToken)
    {
        var required = RequiredPlatform(job);
        if (!string.Equals(required, ExnessCode, StringComparison.Ordinal))
            throw new InvalidOperationException("BROKER_PLATFORM_UNSUPPORTED");

        Directory.CreateDirectory(instancePath);

        var installer = await GetInstallerAsync(
            required,
            ExnessInstaller,
            cancellationToken);

        var configPath = Path.Combine(instancePath, "Config");
        var configBackup = Path.Combine(
            instancePath,
            ".scenova-config-backup-" + Guid.NewGuid().ToString("N"));

        byte[]? eaBackup = null;
        var eaPath = Path.Combine(
            instancePath,
            "MQL5",
            "Experts",
            "FastBasketBot.ex5");

        try
        {
            if (File.Exists(eaPath))
                eaBackup = await File.ReadAllBytesAsync(eaPath, cancellationToken);

            if (Directory.Exists(configPath))
                Directory.Move(configPath, configBackup);

            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = installer,
                Arguments = $"/auto /path:\"{instancePath}\"",
                WorkingDirectory = Path.GetDirectoryName(installer)!,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            }) ?? throw new InvalidOperationException("BROKER_INSTALLER_START_FAILED");

            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromMinutes(5));

            try
            {
                await process.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                try { process.Kill(entireProcessTree: true); } catch { }
                throw new InvalidOperationException("BROKER_INSTALLER_TIMEOUT");
            }

            // MetaTrader's web installer can return exit code 1 after a
            // successful /auto install. Do not roll back a valid broker
            // runtime solely because of that code; terminal64.exe is verified
            // below before the platform is accepted.
            if (!IsInstallerSuccessExitCode(process.ExitCode))
                throw new InvalidOperationException("BROKER_INSTALLER_FAILED_" + process.ExitCode);

            var terminal = Path.Combine(instancePath, "terminal64.exe");
            var deadline = DateTimeOffset.UtcNow.AddMinutes(2);
            while (!File.Exists(terminal) && DateTimeOffset.UtcNow < deadline)
            {
                await Task.Delay(500, cancellationToken);
            }

            if (!File.Exists(terminal))
                throw new InvalidOperationException("BROKER_TERMINAL_MISSING");

            if (eaBackup is not null)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(eaPath)!);
                await File.WriteAllBytesAsync(eaPath, eaBackup, cancellationToken);
            }

            File.WriteAllText(
                Path.Combine(instancePath, "broker-platform.txt"),
                required + "|" + DateTimeOffset.UtcNow.ToString("O"),
                new UTF8Encoding(false));

            try
            {
                var previousError = Path.Combine(instancePath, "broker-platform-error.txt");
                if (File.Exists(previousError)) File.Delete(previousError);
            }
            catch { }

            if (Directory.Exists(configBackup))
            {
                try { Directory.Delete(configBackup, recursive: true); } catch { }
            }
        }
        catch
        {
            try
            {
                if (Directory.Exists(configPath))
                    Directory.Delete(configPath, recursive: true);
            }
            catch { }

            try
            {
                if (Directory.Exists(configBackup))
                    Directory.Move(configBackup, configPath);
            }
            catch { }

            try
            {
                if (eaBackup is not null)
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(eaPath)!);
                    await File.WriteAllBytesAsync(eaPath, eaBackup, CancellationToken.None);
                }
            }
            catch { }

            throw;
        }
    }

    internal static bool IsInstallerSuccessExitCode(int exitCode) =>
        exitCode is 0 or 1;

    private async Task<string> GetInstallerAsync(
        string brokerCode,
        Uri uri,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(uri.Host, "download.terminal.free", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("BROKER_INSTALLER_URL_INVALID");

        var dir = Path.Combine(_config.Root, "packages", "brokers", brokerCode);
        Directory.CreateDirectory(dir);

        var target = Path.Combine(dir, "mt5setup.exe");
        if (LooksLikeExecutable(target))
            return target;

        var temp = target + ".tmp";
        try { if (File.Exists(temp)) File.Delete(temp); } catch { }

        using var http = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(5)
        };
        http.DefaultRequestHeaders.UserAgent.ParseAdd(
            "SCENOVA-CloudWorker/" + WorkerLoop.Version);

        using var response = await http.GetAsync(
            uri,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        response.EnsureSuccessStatusCode();

        await using (var input = await response.Content.ReadAsStreamAsync(cancellationToken))
        await using (var output = File.Create(temp))
        {
            await input.CopyToAsync(output, cancellationToken);
        }

        if (!LooksLikeExecutable(temp))
            throw new InvalidOperationException("BROKER_INSTALLER_PAYLOAD_INVALID");

        File.Move(temp, target, true);
        return target;
    }

    private static bool LooksLikeExecutable(string path)
    {
        try
        {
            var info = new FileInfo(path);
            if (!info.Exists || info.Length < 256 * 1024) return false;

            using var stream = File.OpenRead(path);
            return stream.ReadByte() == 'M' && stream.ReadByte() == 'Z';
        }
        catch
        {
            return false;
        }
    }
}
