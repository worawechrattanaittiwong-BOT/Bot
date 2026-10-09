using System.Text;
using System.Text.Json;

namespace Scenova.CloudWorker;

internal static class ProvisioningSelfTest
{
    public static int Run()
    {
        var root = Path.Combine(
            Path.GetTempPath(),
            "SCENOVA-CloudWorker-SelfTest-" + Guid.NewGuid().ToString("N"));

        try
        {
            var template = Path.Combine(root, "template");
            Directory.CreateDirectory(Path.Combine(template, "MQL5", "Experts"));
            Directory.CreateDirectory(Path.Combine(template, "MQL5", "Presets"));
            Directory.CreateDirectory(Path.Combine(root, "instances"));

            File.WriteAllBytes(Path.Combine(template, "terminal64.exe"), Encoding.ASCII.GetBytes("MZ-SELF-TEST"));
            File.WriteAllBytes(
                Path.Combine(template, "MQL5", "Experts", "FastBasketBot.ex5"),
                Encoding.ASCII.GetBytes("SCENOVA-EA-SELF-TEST"));
            File.WriteAllBytes(
                Path.Combine(template, "MQL5", "Experts", "ScenovaSymbolProbe.ex5"),
                Encoding.ASCII.GetBytes("SCENOVA-SYMBOL-PROBE-SELF-TEST"));
            File.WriteAllText(Path.Combine(template, "cloud-template.ready"), "SELF_TEST", new UTF8Encoding(false));
            File.WriteAllText(Path.Combine(template, "template-sentinel.txt"), "UNCHANGED", new UTF8Encoding(false));

            var config = new WorkerConfig
            {
                RunnerId = "phase5-self-test",
                ApiBase = "https://www.snvea-bot.online/backend",
                Root = root
            };

            var runtime = new Mt5Runtime(config);
            if (!runtime.TemplateReady) throw new InvalidOperationException("self-test template not ready");

            var autoLaunchId = Guid.NewGuid().ToString();
            if (!runtime.ShouldAutoLaunch(autoLaunchId, terminalRunning: false))
                throw new InvalidOperationException("initial MT5 auto-launch was not allowed");
            if (runtime.ShouldAutoLaunch(autoLaunchId, terminalRunning: false))
                throw new InvalidOperationException("failed MT5 auto-launch would loop");
            if (runtime.ShouldAutoLaunch(autoLaunchId, terminalRunning: true))
                throw new InvalidOperationException("running MT5 requested an unnecessary launch");
            if (!runtime.ShouldAutoLaunch(autoLaunchId, terminalRunning: false))
                throw new InvalidOperationException("manual MT5 close was not rearmed for one launch");
            if (runtime.ShouldAutoLaunch(autoLaunchId, terminalRunning: false))
                throw new InvalidOperationException("manual-close recovery would loop");

            var brokerPlatforms = new BrokerPlatformManager(config);
            using (var brokerAccount = JsonDocument.Parse("123456"))
            using (var brokerSettings = JsonDocument.Parse("{}"))
            {
                var exnessJob = new CloudJob
                {
                    InstanceId = Guid.NewGuid().ToString(),
                    AccountNumber = brokerAccount.RootElement.Clone(),
                    Broker = "Exness",
                    BrokerServer = "Exness-MT5Trial14",
                    Settings = brokerSettings.RootElement.Clone()
                };
                if (!string.Equals(
                        brokerPlatforms.RequiredPlatform(exnessJob),
                        "EXNESS",
                        StringComparison.Ordinal))
                    throw new InvalidOperationException("Exness broker platform mapping failed");

                if (!exnessJob.SymbolDiscoveryPending ||
                    !string.IsNullOrWhiteSpace(exnessJob.Symbol))
                    throw new InvalidOperationException("new Cloud account must enter symbol discovery without a guessed symbol");

                using (var exactSettings = JsonDocument.Parse("{\"startupSymbol\":\"XAUUSDm\",\"symbolResolutionMode\":\"EXACT\"}"))
                {
                    var exactJob = new CloudJob
                    {
                        InstanceId = Guid.NewGuid().ToString(),
                        AccountNumber = brokerAccount.RootElement.Clone(),
                        Broker = "Exness",
                        BrokerServer = "Exness-MT5Trial14",
                        Settings = exactSettings.RootElement.Clone()
                    };
                    if (exactJob.SymbolDiscoveryPending ||
                        !string.Equals(exactJob.Symbol, "XAUUSDm", StringComparison.Ordinal))
                        throw new InvalidOperationException("customer-confirmed exact symbol must be preserved byte-for-byte");
                }

                var genericJob = new CloudJob
                {
                    InstanceId = Guid.NewGuid().ToString(),
                    AccountNumber = brokerAccount.RootElement.Clone(),
                    Broker = "Other",
                    BrokerServer = "Other-MT5",
                    Settings = brokerSettings.RootElement.Clone()
                };
                if (!string.IsNullOrWhiteSpace(brokerPlatforms.RequiredPlatform(genericJob)))
                    throw new InvalidOperationException("generic broker was forced to a dedicated platform");

                if (!BrokerPlatformManager.IsInstallerSuccessExitCode(0) ||
                    !BrokerPlatformManager.IsInstallerSuccessExitCode(1) ||
                    BrokerPlatformManager.IsInstallerSuccessExitCode(2))
                    throw new InvalidOperationException("MetaTrader installer exit-code contract failed");
            }

            var created = new List<(CloudJob Job, PreparedInstance Prepared)>();
            var checkpoints = new HashSet<int> { 1, 2, 5, 20 };

            for (var i = 1; i <= 20; i++)
            {
                var id = Guid.NewGuid().ToString();
                using var accountJson = JsonDocument.Parse((900000 + i).ToString());
                using var settingsJson = JsonDocument.Parse("{\"startupSymbol\":\"XAUUSDm\",\"symbol\":\"XAUUSDm\",\"symbolResolutionMode\":\"EXACT\"}");

                var job = new CloudJob
                {
                    InstanceId = id,
                    AccountNumber = accountJson.RootElement.Clone(),
                    BrokerServer = "SCENOVA-Demo-" + i,
                    TradingPassword = "demo-password-" + i,
                    InstallToken = "install-token-" + i,
                    ExecutionGeneration = 1,
                    RuntimeStopState = "NONE",
                    Settings = settingsJson.RootElement.Clone()
                };

                var prepared = runtime.PrepareInstanceFiles(job);
                created.Add((job, prepared));

                if (checkpoints.Contains(i))
                {
                    var count = Directory.EnumerateDirectories(Path.Combine(root, "instances")).Count();
                    if (count != i)
                        throw new InvalidOperationException($"checkpoint {i} expected {i} isolated instances but found {count}");
                }
            }

            if (created.Select(item => item.Prepared.InstancePath).Distinct(StringComparer.OrdinalIgnoreCase).Count() != 20)
                throw new InvalidOperationException("instance paths are not isolated");

            for (var i = 0; i < created.Count; i++)
            {
                var number = i + 1;
                var item = created[i];
                var preset = File.ReadAllText(item.Prepared.PresetPath, Encoding.Unicode);
                var startup = File.ReadAllText(item.Prepared.StartupPath, Encoding.Unicode);

                AssertContains(preset, "InpApiBase=https://snvea-bot.online/backend", "canonical API base");
                AssertContains(preset, "InpInstanceId=" + item.Job.InstanceId, "instance id");
                AssertContains(preset, "InpInstallToken=install-token-" + number, "install token");
                AssertContains(preset, "InpCloudRelay=true", "Cloud heartbeat relay");
                AssertContains(preset, "InpStartupSymbol=XAUUSDm", "customer-confirmed startup symbol passed to EA");
                AssertContains(startup, "Login=" + (900000 + number), "account");
                AssertContains(startup, "Password=demo-password-" + number, "password");
                AssertContains(startup, "Server=SCENOVA-Demo-" + number, "broker server");
                AssertContains(startup, "Symbol=XAUUSDm", "customer-confirmed startup symbol");
                AssertContains(startup, "ProxyEnable=0", "proxy disabled");
                AssertContains(startup, "WebRequest=1", "WebRequest enabled");
                AssertContains(startup, "Chart=0", "chart-change trading remains enabled");

                var next = number == 20 ? 1 : number + 1;
                if (startup.Contains("demo-password-" + next, StringComparison.Ordinal))
                    throw new InvalidOperationException($"credential crossed instance boundary at {number}");
            }

            var chartProfile = Path.Combine(created[0].Prepared.InstancePath, "MQL5", "Profiles", "Charts", "Default");
            Directory.CreateDirectory(chartProfile);
            File.WriteAllText(Path.Combine(chartProfile, "chart01.chr"), "old-chart-1");
            File.WriteAllText(Path.Combine(chartProfile, "chart02.chr"), "old-chart-2");
            Directory.CreateDirectory(Path.Combine(created[0].Prepared.InstancePath, "MQL5", "Profiles"));
            File.WriteAllText(
                Path.Combine(created[0].Prepared.InstancePath, "MQL5", "Profiles", "lastprofile.ini"),
                "Default");
            Mt5Runtime.ResetCloudChartWorkspace(created[0].Prepared.InstancePath);
            if (Directory.EnumerateFiles(
                    Path.Combine(created[0].Prepared.InstancePath, "MQL5", "Profiles", "Charts"),
                    "*",
                    SearchOption.AllDirectories).Any())
                throw new InvalidOperationException("cloud chart workspace was not reset");
            if (File.Exists(Path.Combine(created[0].Prepared.InstancePath, "MQL5", "Profiles", "lastprofile.ini")))
                throw new InvalidOperationException("last profile hint was not reset");

            var brokerDirectoryInstance = created[0].Prepared.InstancePath;
            File.WriteAllText(
                Path.Combine(brokerDirectoryInstance, "broker-platform.txt"),
                "EXNESS|" + DateTimeOffset.UtcNow.ToString("O"),
                new UTF8Encoding(false));
            var brokerConfig = Path.Combine(brokerDirectoryInstance, "Config");
            Directory.CreateDirectory(brokerConfig);
            File.WriteAllBytes(
                Path.Combine(brokerConfig, "servers.dat"),
                Encoding.Unicode.GetBytes(
                    "header\0Exness-MT5Trial6\0Exness-MT5Real25\0Exness-MT4Real1\0"));
            var brokerDirectory = new BrokerServerDirectory(config).Read();
            if (!brokerDirectory.Any(item =>
                    item.BrokerCode == "EXNESS" &&
                    item.ServerName == "Exness-MT5Trial6" &&
                    item.Environment == "DEMO"))
                throw new InvalidOperationException("Exness MT5 Trial server was not read from servers.dat");
            if (!brokerDirectory.Any(item =>
                    item.BrokerCode == "EXNESS" &&
                    item.ServerName == "Exness-MT5Real25" &&
                    item.Environment == "REAL"))
                throw new InvalidOperationException("Exness MT5 Real server was not read from servers.dat");
            if (brokerDirectory.Any(item => item.ServerName.Contains("MT4", StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException("MT4 server leaked into the MT5 server directory");

            var sentinel = File.ReadAllText(Path.Combine(template, "template-sentinel.txt"));
            if (!string.Equals(sentinel, "UNCHANGED", StringComparison.Ordinal))
                throw new InvalidOperationException("template was mutated by provisioning");

            if (File.Exists(Path.Combine(template, "cloud-start.ini")))
                throw new InvalidOperationException("template received customer startup config");

            Console.WriteLine("PASS: isolated provisioning checkpoints 1 -> 2 -> 5 -> 20");
            Console.WriteLine("PASS: SCENOVA API base is canonicalized before writing EA presets");
            Console.WriteLine("PASS: per-instance account, credential, token and startup files remain isolated");
            Console.WriteLine("PASS: duplicate MT5 chart profiles are cleared before Cloud startup");
            Console.WriteLine("PASS: Cloud provisioning never guesses broker symbol suffixes; exact customer selection is preserved");
            Console.WriteLine("PASS: MT5 manual close rearms one automatic reopen without a launch loop");
            Console.WriteLine("PASS: MetaTrader automatic installer accepts success exit codes 0/1");
            Console.WriteLine("PASS: live broker MT5 server directory is read from servers.dat without inventing names");
            Console.WriteLine("PASS: self-test never launches terminal64.exe or contacts a broker/backend");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("FAIL: " + ex.Message);
            return 1;
        }
        finally
        {
            try
            {
                if (Directory.Exists(root)) Directory.Delete(root, true);
            }
            catch { }
        }
    }

    private static void AssertContains(string text, string expected, string label)
    {
        if (!text.Contains(expected, StringComparison.Ordinal))
            throw new InvalidOperationException($"missing {label}: {expected}");
    }
}
