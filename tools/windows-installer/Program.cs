namespace ScenovaInstaller;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Any(a => string.Equals(a, "--agent", StringComparison.OrdinalIgnoreCase)))
        {
            SmartAgentRunner.RunAsync().GetAwaiter().GetResult();
            return;
        }

        ApplicationConfiguration.Initialize();
        var form = new InstallerForm
        {
            Text = InstallerConstants.ProductName + " v" + AgentBuildInfo.Version
        };
        Application.Run(form);
    }
}
