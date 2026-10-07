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
    public CloudJob? Job { get; set; }
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

internal sealed class ServerSoftwareUpdateEnvelope
{
    public ServerSoftwareUpdateJob? Update { get; set; }
}

internal sealed class ServerSoftwareUpdateJob
{
    public string Id { get; set; } = "";
    public string TargetWorkerVersion { get; set; } = "";
    public string TargetSetupVersion { get; set; } = "";
    public string TargetSetupSha256 { get; set; } = "";
    public string SetupUrl { get; set; } = "";
}

internal sealed class FleetUpdateEnvelope
{
    public FleetUpdateJob? Update { get; set; }
}

internal sealed class FleetUpdateJob
{
    public string Id { get; set; } = "";
    public string ServerUpdateJobId { get; set; } = "";
    public string InstanceId { get; set; } = "";
    public string Action { get; set; } = "";
    public string? SourceInstanceUpdateId { get; set; }
    public string TargetVersion { get; set; } = "";
    public string? TargetSha256 { get; set; }
}

internal sealed record EaApplyOutcome(string PreviousSha256);

internal sealed class EaApplyException : Exception
{
    public string Code { get; }
    public string? PreviousSha256 { get; }

    public EaApplyException(string code, string? previousSha256 = null, Exception? inner = null)
        : base(code, inner)
    {
        Code = code;
        PreviousSha256 = previousSha256;
    }
}

internal sealed class CloudJob
{
    public string InstanceId { get; set; } = "";
    public bool EaOnline { get; set; }
    public string DesiredState { get; set; } = "STOPPED";
    public JsonElement AccountNumber { get; set; }
    public string Broker { get; set; } = "";
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

    public string RequestedSymbol
    {
        get
        {
            if (Settings.ValueKind == JsonValueKind.Object &&
                Settings.TryGetProperty("startupSymbol", out var startupSymbol) &&
                startupSymbol.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(startupSymbol.GetString()))
                return startupSymbol.GetString()!.Trim();

            if (Settings.ValueKind == JsonValueKind.Object &&
                Settings.TryGetProperty("symbol", out var symbol) &&
                symbol.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(symbol.GetString()))
                return symbol.GetString()!.Trim();

            return "";
        }
    }

    public string SymbolResolutionMode
    {
        get
        {
            if (Settings.ValueKind == JsonValueKind.Object &&
                Settings.TryGetProperty("symbolResolutionMode", out var mode) &&
                mode.ValueKind == JsonValueKind.String)
                return (mode.GetString() ?? "").Trim().ToUpperInvariant();
            return "";
        }
    }

    public bool HasConfirmedSymbol =>
        string.Equals(SymbolResolutionMode, "EXACT", StringComparison.Ordinal) &&
        !string.IsNullOrWhiteSpace(RequestedSymbol);

    public bool SymbolDiscoveryPending => !HasConfirmedSymbol;

    // A customer-confirmed broker-native symbol is the only symbol authority.
    // The Worker must never add, remove or guess a suffix.
    public string Symbol => HasConfirmedSymbol ? RequestedSymbol : "";
}

internal sealed class CloudInstanceDiagnostic
{
    public string InstanceId { get; set; } = "";
    public bool TerminalRunning { get; set; }
    public int ChartFiles { get; set; }
    public bool ChartHasFastBasketBot { get; set; }
    public string EaSha256 { get; set; } = "";
    public long EaBytes { get; set; }
    public bool StartupConfigExists { get; set; }
    public bool PresetCloudRelayEnabled { get; set; }
    public int RelayRequestFiles { get; set; }
    public int RelayResponseFiles { get; set; }
    public string ExpertLogUpdatedAt { get; set; } = "";
    public string JournalLogUpdatedAt { get; set; } = "";
    public string LatestExpertLog { get; set; } = "";
    public string LatestJournalLog { get; set; } = "";
    public string BrokerPlatform { get; set; } = "";
    public string BrokerPlatformError { get; set; } = "";
    public IReadOnlyList<string> DiscoveredXauSymbols { get; set; } = Array.Empty<string>();
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
    public string SetupVersion { get; set; } = "";
    public IReadOnlyList<BrokerServerDirectoryEntry> BrokerServers { get; set; } = Array.Empty<BrokerServerDirectoryEntry>();
    public IReadOnlyList<CloudInstanceDiagnostic> Instances { get; set; } = Array.Empty<CloudInstanceDiagnostic>();
}
