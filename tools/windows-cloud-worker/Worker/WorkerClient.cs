using System.Net.Http.Json;
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
