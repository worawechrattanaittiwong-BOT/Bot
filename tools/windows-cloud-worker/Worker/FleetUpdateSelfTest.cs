using System.Text;

namespace Scenova.CloudWorker;

internal static class FleetUpdateSelfTest
{
    public static int Run()
    {
        var root = Path.Combine(
            Path.GetTempPath(),
            "SCENOVA-FleetUpdate-SelfTest-" + Guid.NewGuid().ToString("N"));

        try
        {
            var instanceId = Guid.NewGuid().ToString();
            var updateId = Guid.NewGuid().ToString();
            var instance = Path.Combine(root, "instances", instanceId);
            var experts = Path.Combine(instance, "MQL5", "Experts");
            Directory.CreateDirectory(experts);

            var currentEa = Path.Combine(experts, "FastBasketBot.ex5");
            var oldBytes = Encoding.UTF8.GetBytes("SCENOVA-OLD-EA-" + Guid.NewGuid());
            var newBytes = Encoding.UTF8.GetBytes("SCENOVA-NEW-EA-" + Guid.NewGuid());
            File.WriteAllBytes(currentEa, oldBytes);

            var newSha = EaPackageStore.HashBytes(newBytes);
            var package = EaPackageStore.CachePackage(
                root,
                "9.9.9-selftest",
                newSha,
                newBytes);

            var backup = EaPackageStore.BackupCurrent(
                root,
                instanceId,
                updateId,
                currentEa);

            if (backup.PreviousSha256 != EaPackageStore.HashBytes(oldBytes))
                throw new InvalidOperationException("backup hash mismatch");

            EaPackageStore.ReplaceEa(currentEa, package, newSha);
            if (EaPackageStore.HashFile(currentEa) != newSha)
                throw new InvalidOperationException("EA update replacement failed");

            var backupPath = EaPackageStore.BackupPath(root, instanceId, updateId);
            EaPackageStore.ReplaceEa(
                currentEa,
                backupPath,
                backup.PreviousSha256);

            if (EaPackageStore.HashFile(currentEa) != backup.PreviousSha256)
                throw new InvalidOperationException("EA rollback replacement failed");

            var packageCount = Directory
                .EnumerateFiles(
                    Path.Combine(root, "packages", "ea"),
                    "*.ex5",
                    SearchOption.AllDirectories)
                .Count();

            if (packageCount != 1)
                throw new InvalidOperationException("EA package cache is not single-copy");

            Console.WriteLine("PASS: Fleet Update caches one verified EA package");
            Console.WriteLine("PASS: current EA is backed up before replacement");
            Console.WriteLine("PASS: rollback restores the exact previous SHA256");
            Console.WriteLine("PASS: self-test never launches MT5 or contacts Backend");
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
