using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace ScenovaInstaller;

internal static class ScenovaClient
{
    internal static HttpClient NewHttpClient()
    {
        var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("SCENOVA-Installer", "2.0.6"));
        return http;
    }

    internal static async Task<T> PostJsonAsync<T>(HttpClient http, string url, object payload)
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
                var error = JsonSerializer.Deserialize<ApiError>(text, ScenovaRuntime.JsonOptions);
                throw new InvalidOperationException(error?.Message ?? "SCENOVA server rejected the request");
            }
            catch (JsonException)
            {
                throw new InvalidOperationException("SCENOVA server error: " + (int)response.StatusCode);
            }
        }

        var result = JsonSerializer.Deserialize<T>(text, ScenovaRuntime.JsonOptions);
        return result ?? throw new InvalidOperationException("invalid response from SCENOVA server");
    }

    internal static async Task<byte[]> DownloadArtifactAsync(
        HttpClient http,
        string apiBase,
        string instanceId,
        string installToken)
    {
        var payload = JsonSerializer.Serialize(
            new { instanceId, installToken },
            ScenovaRuntime.JsonOptions);

        using var response = await http.PostAsync(
            apiBase.TrimEnd('/') + "/api/ea/artifact",
            new StringContent(payload, Encoding.UTF8, "application/json"));

        if (!response.IsSuccessStatusCode)
        {
            var text = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException("EA download failed: " + text);
        }

        return await response.Content.ReadAsByteArrayAsync();
    }
}
