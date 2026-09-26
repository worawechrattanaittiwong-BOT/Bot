using System.Diagnostics;
using System.Security.Principal;

namespace Scenova.CloudSetup;

internal static class WindowsAclManager
{
    public static IReadOnlyList<string> PlannedTargets(string root, string configPath)
    {
        return new[]
        {
            root,
            Path.Combine(root, "worker"),
            configPath,
            Path.Combine(root, "template"),
            Path.Combine(root, "instances"),
            Path.Combine(root, "packages"),
            Path.Combine(root, "backups"),
            Path.Combine(root, "logs")
        };
    }

    public static void Harden(string root, string configPath)
    {
        using var identity = WindowsIdentity.GetCurrent();
        var currentSid = identity.User?.Value;
        if (string.IsNullOrWhiteSpace(currentSid))
            throw new InvalidOperationException("ไม่พบ Windows SID สำหรับตั้ง Permission");

        foreach (var target in PlannedTargets(root, configPath).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!File.Exists(target) && !Directory.Exists(target))
                continue;

            Apply(target, currentSid);
        }
    }

    private static void Apply(string path, string currentSid)
    {
        var isDirectory = Directory.Exists(path);
        var permission = isDirectory ? "(OI)(CI)F" : "F";

        Run(path, "/inheritance:r", false);

        // Remove broad built-in access if it was explicitly granted before repair.
        Run(
            path,
            "/remove:g",
            true,
            "*S-1-1-0",
            "*S-1-5-11",
            "*S-1-5-32-545");

        Run(path, "/grant:r", false, "*" + currentSid + ":" + permission);
        Run(path, "/grant:r", false, "*S-1-5-18:" + permission);
        Run(path, "/grant:r", false, "*S-1-5-32-544:" + permission);
    }

    private static void Run(
        string path,
        string operation,
        bool allowFailure,
        params string[] args)
    {
        var start = new ProcessStartInfo
        {
            FileName = "icacls.exe",
            UseShellExecute = false,
            CreateNoWindow = true
        };
        start.ArgumentList.Add(path);
        start.ArgumentList.Add(operation);
        foreach (var arg in args) start.ArgumentList.Add(arg);

        using var process = Process.Start(start)
            ?? throw new InvalidOperationException("ไม่สามารถเปิด icacls เพื่อป้องกันไฟล์ Server");

        process.WaitForExit();
        if (!allowFailure && process.ExitCode != 0)
            throw new InvalidOperationException("ตั้ง Windows Permission ไม่สำเร็จ: " + path);
    }
}
