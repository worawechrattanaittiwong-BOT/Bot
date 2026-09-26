using System.Diagnostics;
using System.Security.Principal;

namespace Scenova.CloudSetup;

internal static class WorkerStartupManager
{
    public static string TaskName(string runnerId) => "SCENOVA-CloudWorker-" + runnerId;

    public static string BuildRegistrationScript(
        string runnerId,
        string workerPath,
        string configPath,
        string windowsUser)
    {
        static string Ps(string value) => "'" + value.Replace("'", "''") + "'";

        var taskName = TaskName(runnerId);
        var workerArgs = "--config \"" + configPath + "\"";

        return
            "$ErrorActionPreference='Stop';" +
            "$action=New-ScheduledTaskAction -Execute " + Ps(workerPath) +
            " -Argument " + Ps(workerArgs) + ";" +
            "$trigger=New-ScheduledTaskTrigger -AtLogOn -User " + Ps(windowsUser) + ";" +
            "$principal=New-ScheduledTaskPrincipal -UserId " + Ps(windowsUser) +
            " -LogonType Interactive -RunLevel Highest;" +
            "$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew " +
            "-RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) " +
            "-ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable;" +
            "Register-ScheduledTask -TaskName " + Ps(taskName) +
            " -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null;";
    }

    public static void EnsureRegistered(
        string runnerId,
        string workerPath,
        string configPath)
    {
        using var identity = WindowsIdentity.GetCurrent();
        var windowsUser = identity.Name;
        if (string.IsNullOrWhiteSpace(windowsUser))
            throw new InvalidOperationException("ไม่พบบัญชี Windows สำหรับ Cloud Worker");

        RunPowerShell(BuildRegistrationScript(
            runnerId,
            workerPath,
            configPath,
            windowsUser));

        if (!IsRegistered(runnerId))
            throw new InvalidOperationException("สร้าง Auto Start ของ Cloud Worker ไม่สำเร็จ");
    }

    public static bool IsRegistered(string runnerId)
    {
        var taskName = TaskName(runnerId);
        var script =
            "$task=Get-ScheduledTask -TaskName '" +
            taskName.Replace("'", "''") +
            "' -ErrorAction SilentlyContinue;" +
            "if($null -eq $task){exit 1}else{exit 0}";

        return RunPowerShell(script, throwOnError: false) == 0;
    }

    public static void Start(string runnerId)
    {
        var taskName = TaskName(runnerId);
        var script =
            "$ErrorActionPreference='Stop';" +
            "Start-ScheduledTask -TaskName '" +
            taskName.Replace("'", "''") +
            "';";
        RunPowerShell(script);
    }

    public static bool IsWorkerRunning(string workerPath)
    {
        var expected = Path.GetFullPath(workerPath);

        foreach (var process in Process.GetProcessesByName("SCENOVA-CloudWorker"))
        {
            using (process)
            {
                try
                {
                    var path = process.MainModule?.FileName;
                    if (!string.IsNullOrWhiteSpace(path) &&
                        string.Equals(
                            Path.GetFullPath(path),
                            expected,
                            StringComparison.OrdinalIgnoreCase))
                        return true;
                }
                catch
                {
                    // Ignore unrelated/inaccessible processes.
                }
            }
        }

        return false;
    }

    private static int RunPowerShell(string script, bool throwOnError = true)
    {
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = "powershell.exe",
            UseShellExecute = false,
            CreateNoWindow = true,
            ArgumentList =
            {
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script
            }
        }) ?? throw new InvalidOperationException("ไม่สามารถเปิด PowerShell สำหรับตั้งค่า Auto Start");

        process.WaitForExit();

        if (throwOnError && process.ExitCode != 0)
            throw new InvalidOperationException("ตั้งค่า Auto Start ของ Cloud Worker ไม่สำเร็จ");

        return process.ExitCode;
    }
}
