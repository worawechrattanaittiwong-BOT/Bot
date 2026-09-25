using System.Diagnostics;
using System.Reflection;

namespace Scenova.CloudSetup;

internal static class PayloadInstaller
{
    private const string WorkerResource = "SCENOVA.Payload.SCENOVA-CloudWorker.exe";
    private const string EaResource = "SCENOVA.Payload.FastBasketBot.ex5";

    public static string ExtractWorker(string root)
    {
        var workerDir = Path.Combine(root, "worker");
        Directory.CreateDirectory(workerDir);

        var target = Path.Combine(workerDir, "SCENOVA-CloudWorker.exe");
        ExtractResource(WorkerResource, target, minimumBytes: 64 * 1024);
        return target;
    }

    public static void ExtractEa(string target)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        ExtractResource(EaResource, target, minimumBytes: 10 * 1024);
    }

    public static void StartWorker(string workerPath, string configPath)
    {
        var existing = Process.GetProcessesByName("SCENOVA-CloudWorker");
        foreach (var process in existing)
        {
            using (process)
            {
                try
                {
                    if (string.Equals(
                        process.MainModule?.FileName,
                        workerPath,
                        StringComparison.OrdinalIgnoreCase))
                        return;
                }
                catch { }
            }
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = workerPath,
            Arguments = $"--config \"{configPath}\"",
            WorkingDirectory = Path.GetDirectoryName(workerPath)!,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });
    }

    private static void ExtractResource(string resourceName, string target, int minimumBytes)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var source = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException(
                $"Setup payload หาย: {resourceName}. กรุณาดาวน์โหลด SCENOVA Cloud Setup รุ่นล่าสุด");

        var temp = target + ".tmp";
        using (var output = File.Create(temp))
            source.CopyTo(output);

        var info = new FileInfo(temp);
        if (info.Length < minimumBytes)
        {
            File.Delete(temp);
            throw new InvalidOperationException($"Setup payload ไม่สมบูรณ์: {resourceName}");
        }

        File.Move(temp, target, true);
    }
}
