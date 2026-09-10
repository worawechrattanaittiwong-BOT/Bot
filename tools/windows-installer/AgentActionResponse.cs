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
    public bool SafeToRestart { get; set; }
    public int Positions { get; set; }
}
