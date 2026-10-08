using System.Text;

namespace Scenova.CloudSetup;

internal static class SetupSelfTest
{
    public static int Run()
    {
        var root = Path.Combine(
            Path.GetTempPath(),
            "SCENOVA-CloudSetup-SelfTest-" + Guid.NewGuid().ToString("N"));

        try
        {
            Directory.CreateDirectory(Path.Combine(root, "worker"));
            Directory.CreateDirectory(Path.Combine(root, "template", "MQL5", "Experts"));
            Directory.CreateDirectory(Path.Combine(root, "instances"));
            Directory.CreateDirectory(Path.Combine(root, "packages"));
            Directory.CreateDirectory(Path.Combine(root, "backups"));
            Directory.CreateDirectory(Path.Combine(root, "logs"));

            var canonicalApi = Program.NormalizeApiBase("https://www.snvea-bot.online/backend/");
            if (!string.Equals(
                    canonicalApi,
                    "https://snvea-bot.online/backend",
                    StringComparison.Ordinal))
                throw new InvalidOperationException("SCENOVA API canonicalization failed");

            var worker = PayloadInstaller.ExtractWorker(root);
            if (!File.Exists(worker) || new FileInfo(worker).Length < 64 * 1024)
                throw new InvalidOperationException("embedded Worker extraction failed");

            var embeddedEa = Path.Combine(root, "packages", "FastBasketBot.ex5");
            PayloadInstaller.ExtractEa(embeddedEa);
            if (!File.Exists(embeddedEa) || new FileInfo(embeddedEa).Length < 10 * 1024)
                throw new InvalidOperationException("embedded EA extraction failed");

            var embeddedProbe = Path.Combine(root, "packages", "ScenovaSymbolProbe.ex5");
            PayloadInstaller.ExtractSymbolProbe(embeddedProbe);
            if (!File.Exists(embeddedProbe) || new FileInfo(embeddedProbe).Length < 2 * 1024)
                throw new InvalidOperationException("embedded Symbol Probe extraction failed");

            File.WriteAllBytes(
                Path.Combine(root, "template", "terminal64.exe"),
                Encoding.ASCII.GetBytes("MZ-SETUP-SELF-TEST"));
            File.WriteAllBytes(
                Path.Combine(root, "template", "MQL5", "Experts", "FastBasketBot.ex5"),
                Encoding.ASCII.GetBytes(new string('E', 11 * 1024)));
            File.WriteAllBytes(
                Path.Combine(root, "template", "MQL5", "Experts", "ScenovaSymbolProbe.ex5"),
                Encoding.ASCII.GetBytes(new string('P', 3 * 1024)));
            File.WriteAllText(
                Path.Combine(root, "template", "cloud-template.ready"),
                "SELF_TEST");

            if (!Mt5TemplateManager.IsReady(root))
                throw new InvalidOperationException("template readiness validation failed");

            var config = Path.Combine(root, "worker", "config.json");
            File.WriteAllText(config, "{}");

            var script = WorkerStartupManager.BuildRegistrationScript(
                "self-test-01",
                worker,
                config,
                @"SCENOVA\Worker");

            if (!script.Contains("RestartCount 999", StringComparison.Ordinal) ||
                !script.Contains("LogonType Interactive", StringComparison.Ordinal) ||
                !script.Contains("AtLogOn", StringComparison.Ordinal))
                throw new InvalidOperationException("auto-start registration plan incomplete");

            var targets = WindowsAclManager.PlannedTargets(root, config);
            if (!targets.Contains(root, StringComparer.OrdinalIgnoreCase) ||
                !targets.Contains(config, StringComparer.OrdinalIgnoreCase) ||
                !targets.Contains(Path.Combine(root, "instances"), StringComparer.OrdinalIgnoreCase))
                throw new InvalidOperationException("ACL plan incomplete");

            if (Directory.EnumerateDirectories(Path.Combine(root, "instances")).Any())
                throw new InvalidOperationException("self-test touched customer instances");

            Console.WriteLine("PASS: SCENOVA API URL is canonicalized to the non-www origin");
            Console.WriteLine("PASS: embedded Worker payload is valid");
            Console.WriteLine("PASS: embedded EA payload is valid");
            Console.WriteLine("PASS: embedded Symbol Probe payload is valid");
            Console.WriteLine("PASS: MT5 template readiness validation is strict");
            Console.WriteLine("PASS: auto-start plan uses interactive logon and restart policy");
            Console.WriteLine("PASS: ACL plan covers Server runtime without touching customer instances");
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
}
