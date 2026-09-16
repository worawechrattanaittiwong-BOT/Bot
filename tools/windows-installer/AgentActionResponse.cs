namespace ScenovaInstaller;

internal sealed class AgentActionResponse
{
    public bool Ok { get; set; }
    public bool AccountChangeRequested { get; set; }
    public string? AccountChangeRequestId { get; set; }
    public bool PendingAccountDetected { get; set; }
    public string? PendingAccountNumber { get; set; }
    public string? PendingServer { get; set; }
    public bool EaOnline { get; set; }
    public string? EaVersion { get; set; }
    public string? EaVersionRequired { get; set; }
    public bool SafeToRestart { get; set; }
    public int Positions { get; set; }
    public bool ManualActionPending { get; set; }
    public bool ManualActionAllowed { get; set; }
    public string? ManualActionName { get; set; }
    public string? ManualActionId { get; set; }
    public string? ManualActionRequestedAt { get; set; }
    public string? ManualActionStatus { get; set; }
}

internal sealed class AgentActionAckResponse
{
    public bool Ok { get; set; }
    public string? ActionId { get; set; }
    public string? Status { get; set; }
}

internal sealed class TradingSymbolAgentResponse
{
    public bool Ok { get; set; }
    public string? DesiredSymbol { get; set; }
    public bool ExplicitSymbolSelected { get; set; }
    public string? CurrentSymbol { get; set; }
    public int? SymbolTradeMode { get; set; }
    public bool? SymbolTradingAllowed { get; set; }
    public bool SymbolReady { get; set; }
}
