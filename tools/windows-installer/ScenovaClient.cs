using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ScenovaInstaller;

internal static class ScenovaClient
{
    internal static HttpClient NewHttpClient()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        http.DefaultRequestHeaders.UserAgent.Add(
            new ProductInfoHeaderValue("SCENOVA-Installer", InstallerConstants.Version));
        return http;
    }

    internal static async Task<T> PostJsonAsync<T>(
        HttpClient http,
        string url,
        object payload)
    {
        Exception? last = null;
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                var json = JsonSerializer.Serialize(payload, ScenovaRuntime.JsonOptions);
                using var response = await http.PostAsync(
                    url,
                    new StringContent(json, Encoding.UTF8, "application/json"));
                var text = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    try
                    {
                        var error = JsonSerializer.Deserialize<ApiError>(
                            text,
                            ScenovaRuntime.JsonOptions);
                        throw new InvalidOperationException(
                            error?.Message ?? "SCENOVA server rejected the request");
                    }
                    catch (JsonException)
                    {
                        throw new InvalidOperationException(
                            "SCENOVA server error: " + (int)response.StatusCode);
                    }
                }

                var result = JsonSerializer.Deserialize<T>(
                    text,
                    ScenovaRuntime.JsonOptions);
                return result ??
                    throw new InvalidOperationException("invalid response from SCENOVA server");
            }
            catch (Exception ex) when (
                ex is HttpRequestException ||
                ex is TaskCanceledException)
            {
                last = ex;
                if (attempt < 3)
                    await Task.Delay(TimeSpan.FromMilliseconds(350 * attempt));
            }
        }

        throw new InvalidOperationException(
            "SCENOVA network request failed after retry",
            last);
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
                    await Task.Delay(TimeSpan.FromMilliseconds(500 * attempt));
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
