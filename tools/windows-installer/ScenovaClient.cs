using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ScenovaInstaller;

internal static class ScenovaClient
{
    // One shared socket pool for the lifetime of the SCENOVA process.
    // NewHttpClient() may still be disposed by callers, but disposeHandler:false
    // keeps the underlying TCP/TLS pool alive. This avoids reconnecting/TLS
    // handshakes every Agent heartbeat loop and makes short network hiccups much
    // less visible to the EA/dashboard.
    private static readonly SocketsHttpHandler SharedHandler = new()
    {
        AutomaticDecompression =
            DecompressionMethods.GZip |
            DecompressionMethods.Deflate |
            DecompressionMethods.Brotli,
        ConnectTimeout = TimeSpan.FromSeconds(5),
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        PooledConnectionIdleTimeout = TimeSpan.FromMinutes(2),
        MaxConnectionsPerServer = 16,
        EnableMultipleHttp2Connections = true,
        UseCookies = false
    };

    internal static HttpClient NewHttpClient()
    {
        var http = new HttpClient(SharedHandler, disposeHandler: false)
        {
            // Artifact downloads can legitimately take longer than a heartbeat.
            // PostJsonAsync has its own shorter per-attempt timeout below.
            Timeout = TimeSpan.FromSeconds(45),
            DefaultRequestVersion = HttpVersion.Version20,
            DefaultVersionPolicy = HttpVersionPolicy.RequestVersionOrLower
        };
        http.DefaultRequestHeaders.UserAgent.Add(
            new ProductInfoHeaderValue("SCENOVA-Installer", InstallerConstants.Version));
        http.DefaultRequestHeaders.Accept.Add(
            new MediaTypeWithQualityHeaderValue("application/json"));
        return http;
    }

    internal static async Task<T> PostJsonAsync<T>(
        HttpClient http,
        string url,
        object payload)
    {
        var json = JsonSerializer.Serialize(payload, ScenovaRuntime.JsonOptions);
        Exception? last = null;

        // Heartbeat/control calls are idempotent from the Agent point of view.
        // Retry transport errors plus temporary HTTP failures, but never keep
        // retrying authentication/validation failures such as 400/401/403.
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Content = new StringContent(json, Encoding.UTF8, "application/json")
                };
                using var attemptTimeout = new CancellationTokenSource(
                    TimeSpan.FromSeconds(8));
                using var response = await http.SendAsync(
                    request,
                    HttpCompletionOption.ResponseContentRead,
                    attemptTimeout.Token);
                var text = await response.Content.ReadAsStringAsync(
                    attemptTimeout.Token);

                if (response.IsSuccessStatusCode)
                {
                    var result = JsonSerializer.Deserialize<T>(
                        text,
                        ScenovaRuntime.JsonOptions);
                    return result ??
                        throw new InvalidOperationException(
                            "invalid response from SCENOVA server");
                }

                var status = (int)response.StatusCode;
                if (IsRetryableStatus(status))
                {
                    last = new HttpRequestException(
                        "SCENOVA temporary server response HTTP " + status,
                        null,
                        response.StatusCode);
                    if (attempt < 4)
                    {
                        await Task.Delay(RetryDelay(response, attempt));
                        continue;
                    }
                    break;
                }

                throw ApiFailure(response.StatusCode, text);
            }
            catch (Exception ex) when (
                ex is HttpRequestException ||
                ex is TaskCanceledException ||
                ex is OperationCanceledException)
            {
                last = ex;
                if (attempt < 4)
                {
                    await Task.Delay(RetryDelay(null, attempt));
                    continue;
                }
            }
        }

        throw new InvalidOperationException(
            "SCENOVA network request failed after resilient retry",
            last);
    }

    private static bool IsRetryableStatus(int status) =>
        status == 408 ||
        status == 425 ||
        status == 429 ||
        status >= 500;

    private static TimeSpan RetryDelay(HttpResponseMessage? response, int attempt)
    {
        try
        {
            var retryAfter = response?.Headers.RetryAfter;
            if (retryAfter?.Delta is { } delta && delta > TimeSpan.Zero)
                return delta > TimeSpan.FromSeconds(5)
                    ? TimeSpan.FromSeconds(5)
                    : delta;

            if (retryAfter?.Date is { } date)
            {
                var wait = date - DateTimeOffset.UtcNow;
                if (wait > TimeSpan.Zero)
                    return wait > TimeSpan.FromSeconds(5)
                        ? TimeSpan.FromSeconds(5)
                        : wait;
            }
        }
        catch
        {
            // Fall through to bounded exponential backoff.
        }

        var baseMs = attempt switch
        {
            1 => 250,
            2 => 600,
            3 => 1200,
            _ => 2000
        };
        return TimeSpan.FromMilliseconds(
            baseMs + Random.Shared.Next(25, 176));
    }

    private static InvalidOperationException ApiFailure(
        HttpStatusCode status,
        string text)
    {
        try
        {
            var error = JsonSerializer.Deserialize<ApiError>(
                text,
                ScenovaRuntime.JsonOptions);
            return new InvalidOperationException(
                error?.Message ??
                "SCENOVA server rejected the request: HTTP " + (int)status);
        }
        catch (JsonException)
        {
            return new InvalidOperationException(
                "SCENOVA server error: HTTP " + (int)status);
        }
    }

    internal static async Task<bool> CanReachApiAsync()
    {
        try
        {
            using var http = NewHttpClient();
            http.Timeout = TimeSpan.FromSeconds(6);
            using var response = await http.GetAsync(
                ScenovaRuntime.ProductionWebBase,
                HttpCompletionOption.ResponseHeadersRead);
            return (int)response.StatusCode < 500;
        }
        catch
        {
            return false;
        }
    }

    internal static async Task<byte[]> DownloadArtifactAsync(
        HttpClient http,
        string apiBase,
        string instanceId,
        string installToken)
    {
        Directory.CreateDirectory(ScenovaRuntime.StagingDir);
        var temp = Path.Combine(
            ScenovaRuntime.StagingDir,
            "legacy-download-" + Guid.NewGuid().ToString("N") + ".ex5");
        try
        {
            await DownloadArtifactResumableAsync(
                http,
                apiBase,
                instanceId,
                installToken,
                temp,
                expectedHash: "",
                releaseChannel: "Stable");
            return await File.ReadAllBytesAsync(temp);
        }
        finally
        {
            try { if (File.Exists(temp)) File.Delete(temp); } catch { }
        }
    }

    internal static async Task DownloadArtifactResumableAsync(
        HttpClient http,
        string apiBase,
        string instanceId,
        string installToken,
        string destinationPath,
        string expectedHash,
        string releaseChannel)
    {
        Directory.CreateDirectory(
            Path.GetDirectoryName(destinationPath) ?? ScenovaRuntime.StagingDir);

        Exception? last = null;
        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                var offset = File.Exists(destinationPath)
                    ? new FileInfo(destinationPath).Length
                    : 0L;

                var payload = JsonSerializer.Serialize(
                    new
                    {
                        instanceId,
                        installToken,
                        offset,
                        releaseChannel
                    },
                    ScenovaRuntime.JsonOptions);

                using var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    apiBase.TrimEnd('/') + "/api/ea/artifact")
                {
                    Content = new StringContent(
                        payload,
                        Encoding.UTF8,
                        "application/json")
                };

                using var response = await http.SendAsync(
                    request,
                    HttpCompletionOption.ResponseHeadersRead);

                if (!response.IsSuccessStatusCode)
                {
                    var text = await response.Content.ReadAsStringAsync();
                    var status = (int)response.StatusCode;
                    if (IsRetryableStatus(status))
                        throw new HttpRequestException(
                            "EA download temporary HTTP " + status,
                            null,
                            response.StatusCode);
                    throw new InvalidOperationException(
                        "EA download failed: " + text);
                }

                var supportsOffset =
                    response.Headers.TryGetValues(
                        "X-SCENOVA-Artifact-Offset",
                        out var values) &&
                    long.TryParse(values.FirstOrDefault(), out var serverOffset) &&
                    serverOffset == offset;

                var mode = offset > 0 && supportsOffset
                    ? FileMode.Append
                    : FileMode.Create;

                await using (var source = await response.Content.ReadAsStreamAsync())
                await using (var target = new FileStream(
                    destinationPath,
                    mode,
                    FileAccess.Write,
                    FileShare.None,
                    81920,
                    useAsync: true))
                {
                    await source.CopyToAsync(target);
                    await target.FlushAsync();
                }

                if (string.IsNullOrWhiteSpace(expectedHash))
                    return;

                var actual = BackupManager.HashFile(destinationPath);
                if (string.Equals(
                    actual,
                    expectedHash,
                    StringComparison.OrdinalIgnoreCase))
                    return;

                // If an older server ignored offset or the partial file is from
                // another release, restart cleanly on the next retry.
                File.Delete(destinationPath);
                throw new InvalidOperationException(
                    "EA integrity verification failed after download");
            }
            catch (Exception ex) when (
                ex is IOException ||
                ex is HttpRequestException ||
                ex is TaskCanceledException ||
                ex is InvalidOperationException)
            {
                last = ex;
                if (attempt < 4)
                    await Task.Delay(RetryDelay(null, attempt));
            }
        }

        throw new InvalidOperationException(
            "EA download failed after resume/retry attempts",
            last);
    }

    internal static async Task SendInstallerTelemetryAsync(
        HttpClient http,
        string apiBase,
        object payload)
    {
        try
        {
            _ = await PostJsonAsync<InstallerTelemetryResponse>(
                http,
                apiBase.TrimEnd('/') + "/api/installer/telemetry",
                payload);
        }
        catch
        {
            // Diagnostics must never break installation.
        }
    }
}

internal sealed class InstallerTelemetryResponse
{
    public bool Ok { get; set; }
}
