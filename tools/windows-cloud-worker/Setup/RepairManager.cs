namespace Scenova.CloudSetup;

internal static class RepairManager
{
    public static async Task<SetupHealthReport> RepairAsync(
        string root,
        string runnerId,
        string setupVersion,
        string apiBase,
        string configPath)
    {
        var workerPath = PayloadInstaller.ExtractWorker(root);

        WindowsAclManager.Harden(root, configPath);

        WorkerStartupManager.EnsureRegistered(
            runnerId,
            workerPath,
            configPath);

        WorkerStartupManager.Start(runnerId);

        return await SetupHealthCheck.RunAsync(
            root,
            runnerId,
            setupVersion,
            apiBase,
            workerPath,
            configPath);
    }
}
