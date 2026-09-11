namespace ScenovaInstaller;

/// <summary>
/// Version reported by the long-running Device Agent. This is kept separate
/// from legacy InstallerConstants so the Server can require the first Agent
/// build that supports verified one-time Dashboard MT5 actions.
/// </summary>
internal static class AgentBuildInfo
{
    internal const string Version = "1.0.0";
}
