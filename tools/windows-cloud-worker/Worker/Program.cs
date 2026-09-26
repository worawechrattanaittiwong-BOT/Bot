using System.Threading;

namespace Scenova.CloudWorker;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (!OperatingSystem.IsWindows())
                throw new InvalidOperationException("SCENOVA Cloud Worker รองรับ Windows เท่านั้น");

            if (args.Any(arg => string.Equals(arg, "--provision-self-test", StringComparison.OrdinalIgnoreCase)))
                return ProvisioningSelfTest.Run();

            if (args.Any(arg => string.Equals(arg, "--fleet-update-self-test", StringComparison.OrdinalIgnoreCase)))
                return FleetUpdateSelfTest.Run();

            var configPath = WorkerConfig.ResolveConfigPath(args);
            var config = WorkerConfig.Load(configPath);

            using var mutex = new Mutex(false, @"Local\SCENOVA-CloudWorker");
            if (!mutex.WaitOne(0)) return 0;

            using var shutdown = new CancellationTokenSource();
            Console.CancelKeyPress += (_, e) =>
            {
                e.Cancel = true;
                shutdown.Cancel();
            };

            using var client = new WorkerClient(config);
            var loop = new WorkerLoop(config, client);

            try
            {
                await loop.RunAsync(shutdown.Token);
            }
            finally
            {
                try { mutex.ReleaseMutex(); } catch { }
            }

            return 0;
        }
        catch (Exception ex)
        {
            try
            {
                Directory.CreateDirectory(@"C:\BotTrading\worker");
                var msg=(ex.Message??string.Empty).Replace("\r"," ").Replace("\n"," ");
                if(msg.Length>160) msg=msg[..160];
                File.WriteAllText(
                    @"C:\BotTrading\worker\last-status.txt",
                    "WORKER_START_FAILED " + DateTimeOffset.UtcNow.ToString("O") + " " + msg);
            }
            catch { }

            return 1;
        }
    }
}
