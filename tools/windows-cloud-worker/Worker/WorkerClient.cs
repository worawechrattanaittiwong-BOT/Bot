using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Scenova.CloudWorker;

internal sealed class WorkerClient : IDisposable
{
    private readonly WorkerConfig _config;
    private readonly HttpClient _http;
    private readonly JsonSerializerOptions _json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public WorkerClient(WorkerConfig config)
    {
        _config = config;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        _http.DefaultRequestHeaders.Add("x-worker-key", config.WorkerKey);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("SCENOVA-CloudWorker/" + WorkerLoop.Version);
    }

    public async Task<T> PostAsync<T>(string route, object payload, CancellationToken cancellationToken)
    {
        var body = MergeRunner(payload);
        using var response = await _http.PostAsJsonAsync(
            _config.EffectiveApiBase.TrimEnd('/') + "/api/worker/" + route,
            body,
            _json,
            cancellationToken);

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(_json, cancellationToken)
               ?? throw new InvalidOperationException("Empty worker API response");
    }

    public async Task PostAsync(string route, object payload, CancellationToken cancellationToken)
    {
        var body = MergeRunner(payload);
        using var response = await _http.PostAsJsonAsync(
            _config.EffectiveApiBase.TrimEnd('/') + "/api/worker/" + route,
            body,
            _json,
            cancellationToken);

        response.EnsureSuccessStatusCode();
    }

    public async Task<int> RelayEaRuntimeEventAsync(
        string payload,
        CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            payload,
            _json) ?? new Dictionary<string, object?>();
        body["runnerId"] = _config.RunnerId;

        using var response = await _http.PostAsJsonAsync(
            _config.EffectiveApiBase.TrimEnd('/') + "/api/worker/runtime-event",
            body,
            _json,
            cancellationToken);
        return (int)response.StatusCode;
    }

    public async Task<EaRelayResult> RelayEaHeartbeatAsync(
        string payload,
        CancellationToken cancellationToken)
    {
        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync(
            _config.EffectiveApiBase.TrimEnd('/') + "/api/ea/heartbeat",
            content,
            cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        return new EaRelayResult((int)response.StatusCode, body);
    }

    public async Task<int> RelayEaJournalAsync(
        string payload,
        CancellationToken cancellationToken)
    {
        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync(
            _config.EffectiveApiBase.TrimEnd('/') + "/api/ea/journal",
            content,
            cancellationToken);
        return (int)response.StatusCode;
    }

    public async Task<byte[]> DownloadUpdateArtifactAsync(
        string instanceUpdateId,
        CancellationToken cancellationToken)
    {
        var body = MergeRunner(new { instanceUpdateId });
        using var response = await _http.PostAsJsonAsync(
            _config.EffectiveApiBase.TrimEnd('/') + "/api/worker/updates/artifact",
            body,
            _json,
            cancellationToken);

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync(cancellationToken);
    }

    public async Task<byte[]> DownloadServerSetupAsync(
        string url,
        CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.Equals(uri.Host, "snvea-bot.online", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("SERVER_UPDATE_URL_INVALID");

        using var download = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        using var response = await download.GetAsync(uri, cancellationToken);
        response.EnsureSuccessStatusCode();

        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        if (bytes.Length < 1024 * 1024)
            throw new InvalidOperationException("SERVER_UPDATE_PAYLOAD_INVALID");

        return bytes;
    }

    private Dictionary<string, object?> MergeRunner(object payload)
    {
        var result = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            JsonSerializer.Serialize(payload, _json),
            _json) ?? new Dictionary<string, object?>();

        result["runnerId"] = _config.RunnerId;
        return result;
    }

    public void Dispose() => _http.Dispose();
}
