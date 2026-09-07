namespace ScenovaInstaller;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Any(a => string.Equals(a, "--agent", StringComparison.OrdinalIgnoreCase)))
        {
            AgentRunner.RunAsync().GetAwaiter().GetResult();
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new InstallerForm());
    }
}
