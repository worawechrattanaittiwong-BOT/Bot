using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;

namespace Scenova.CloudSetup;

internal static class PayloadInstaller
{
    private const string WorkerResource = "SCENOVA.Payload.SCENOVA-CloudWorker.exe";
    private const string EaResource = "SCENOVA.Payload.FastBasketBot.ex5";
    private const string SymbolProbeResource = "SCENOVA.Payload.ScenovaSymbolProbe.ex5";

    public static string ExtractWorker(string root)
    {
        var workerDir = Path.Combine(root, "worker");
        Directory.CreateDirectory(workerDir);

        var target = Path.Combine(workerDir, "SCENOVA-CloudWorker.exe");
        ExtractResource(
            WorkerResource,
            target,
            minimumBytes: 64 * 1024,
            beforeReplace: () => StopMatchingWorker(target));

        return target;
    }

    public static void ExtractEa(string target)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        ExtractResource(EaResource, target, minimumBytes: 10 * 1024);
    }

    public static void ExtractSymbolProbe(string target)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        ExtractResource(SymbolProbeResource, target, minimumBytes: 2 * 1024);
    }

    private static void ExtractResource(
        string resourceName,
        string target,
        int minimumBytes,
        Action? beforeReplace = null)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var source = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException(
                $"Setup payload หาย: {resourceName}. กรุณาดาวน์โหลด SCENOVA Cloud Setup รุ่นล่าสุด");

        var temp = target + ".tmp";
        try
        {
            using (var output = File.Create(temp))
                source.CopyTo(output);

            var info = new FileInfo(temp);
            if (info.Length < minimumBytes)
                throw new InvalidOperationException($"Setup payload ไม่สมบูรณ์: {resourceName}");

            if (File.Exists(target) &&
                string.Equals(HashFile(target), HashFile(temp), StringComparison.OrdinalIgnoreCase))
            {
                File.Delete(temp);
                return;
            }

            beforeReplace?.Invoke();
            File.Move(temp, target, true);
        }
        finally
        {
            try
            {
                if (File.Exists(temp)) File.Delete(temp);
            }
            catch { }
        }
    }

    private static string HashFile(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream));
    }

    private static void StopMatchingWorker(string workerPath)
    {
        var expected = Path.GetFullPath(workerPath);

        foreach (var process in Process.GetProcessesByName("SCENOVA-CloudWorker"))
        {
            using (process)
            {
                try
                {
                    var path = process.MainModule?.FileName;
                    if (string.IsNullOrWhiteSpace(path) ||
                        !string.Equals(
                            Path.GetFullPath(path),
                            expected,
                            StringComparison.OrdinalIgnoreCase))
                        continue;

                    // The updater Setup is launched by this Worker. Killing the
                    // whole process tree would also kill the Setup that is performing
                    // the replacement. Stop only the Worker process.
                    process.Kill(entireProcessTree: false);
                    if (!process.WaitForExit(15_000))
                        throw new InvalidOperationException("Cloud Worker เดิมยังไม่หยุด จึงไม่แทนที่ไฟล์");
                }
                catch (InvalidOperationException)
                {
                    throw;
                }
                catch
                {
                    // Ignore unrelated/inaccessible processes.
                }
            }
        }
    }
}
