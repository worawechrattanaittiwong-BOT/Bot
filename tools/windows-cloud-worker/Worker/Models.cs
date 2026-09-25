using System.Text.Json;

namespace Scenova.CloudWorker;

internal sealed class CommandEnvelope
{
    public WorkerCommand? Command { get; set; }
}

internal sealed class WorkerCommand
{
    public long Id { get; set; }
    public string InstanceId { get; set; } = "";
    public long ExecutionGeneration { get; set; }
    public string Name { get; set; } = "";
}

internal sealed class AssignedResponse
{
    public List<CloudJob> Jobs { get; set; } = [];
}

internal sealed class ClaimResponse
{
    public CloudJob? Job { get; set; }
}

internal sealed class RecoveryDecision
{
    public bool Allow { get; set; }
}

internal sealed class CloudJob
{
    public string InstanceId { get; set; } = "";
    public bool EaOnline { get; set; }
    public JsonElement AccountNumber { get; set; }
    public string BrokerServer { get; set; } = "";
    public long ExecutionGeneration { get; set; }
    public string RuntimeStopState { get; set; } = "NONE";
    public string TradingPassword { get; set; } = "";
    public string InstallToken { get; set; } = "";
    public JsonElement Settings { get; set; }

    public string AccountNumberText =>
        AccountNumber.ValueKind switch
        {
            JsonValueKind.String => AccountNumber.GetString() ?? "",
            JsonValueKind.Number => AccountNumber.GetRawText(),
            _ => ""
        };

    public string Symbol
    {
        get
        {
            if (Settings.ValueKind == JsonValueKind.Object &&
                Settings.TryGetProperty("symbol", out var symbol) &&
                symbol.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(symbol.GetString()))
                return symbol.GetString()!.Trim();

            return "XAUUSD";
        }
    }
}

internal sealed class WorkerTelemetry
{
    public double? CpuPercent { get; set; }
    public double? RamUsedGb { get; set; }
    public double? RamTotalGb { get; set; }
    public double? DiskFreeGb { get; set; }
    public double? DiskTotalGb { get; set; }
    public bool TemplateReady { get; set; }
    public string Version { get; set; } = WorkerLoop.Version;
}
