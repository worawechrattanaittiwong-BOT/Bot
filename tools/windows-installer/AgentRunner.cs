using System.Diagnostics;
using System.Security.Cryptography;
using Microsoft.Win32;

namespace ScenovaInstaller;

internal static class AgentRunner
{
    internal static void InstallAndStart()
    {
        Directory.CreateDirectory(ScenovaRuntime.BaseDir);

        var source = Environment.ProcessPath
                     ?? throw new InvalidOperationException("SCENOVA installer path unavailable");
        var agentPath = Path.Combine(ScenovaRuntime.BaseDir, "SCENOVA-Agent-v2.exe");

        if (!string.Equals(source, agentPath, StringComparison.OrdinalIgnoreCase))
        {
            StopExistingAgent(agentPath);
            CopyExecutableWithRetry(source, agentPath);
        }

        using (var runKey = Registry.CurrentUser.OpenSubKey(
                   @"Software\Microsoft\Windows\CurrentVersion\Run", true))
        {
            runKey?.SetValue(
                "SCENOVA MT5 Agent",
                "\"" + agentPath + "\" --agent");
        }

        var legacyStartup = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Startup),
            "SCENOVA-MT5-Agent.cmd");
        try
        {
            if (File.Exists(legacyStartup)) File.Delete(legacyStartup);
        }
        catch { }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = agentPath,
                Arguments = "--agent",
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
        }
        catch { }
    }

    private static void StopExistingAgent(string agentPath)
    {
        var processName = Path.GetFileNameWithoutExtension(agentPath);
        var currentProcessId = Environment.ProcessId;

        foreach (var process in Process.GetProcessesByName(processName))
        {
            try
            {
                if (process.Id == currentProcessId)
                    continue;

                string? runningPath = null;
                try
                {
                    runningPath = process.MainModule?.FileName;
                }
                catch
                {
                    // The process name is unique to SCENOVA Agent. If Windows
                    // prevents reading MainModule, still stop the old Agent.
                }

                if (!string.IsNullOrWhiteSpace(runningPath) &&
                    !string.Equals(runningPath, agentPath, StringComparison.OrdinalIgnoreCase))
                    continue;

                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
            catch
            {
                // File replacement below has retries and will surface a clear
                // error if Windows still keeps the old Agent executable locked.
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    private static void CopyExecutableWithRetry(string source, string agentPath)
    {
        Exception? lastError = null;

        for (var attempt = 1; attempt <= 12; attempt++)
        {
            try
            {
                File.Copy(source, agentPath, true);
                return;
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                lastError = ex;
                Thread.Sleep(250);
            }
        }

        throw new InvalidOperationException(
            "ไม่สามารถอัปเดต SCENOVA Device Agent ได้ กรุณารอสักครู่แล้วกดติดตั้งอีกครั้ง",
            lastError);
    }

    internal static async Task RunAsync()
    {
        Directory.CreateDirectory(ScenovaRuntime.BaseDir);
        var logPath = Path.Combine(ScenovaRuntime.BaseDir, "agent-v2.log");

        using var mutex = new Mutex(
            true,
            "Local\\SCENOVA-MT5-Agent-v2-" + Environment.UserName,
            out var createdNew);
        if (!createdNew) return;

        while (true)
        {
            try
            {
                var config = ScenovaRuntime.ReadConfig()
                             ?? throw new InvalidOperationException("config-v2.json not found");
                var installToken = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected)
                                   ?? throw new InvalidOperationException("install token unavailable");
                var deviceSecret = ScenovaRuntime.TryUnprotect(config.DeviceSecretProtected)
                                   ?? throw new InvalidOperationException("device secret unavailable");

                var eaHash = "";
                if (File.Exists(config.EaBinaryPath))
                {
                    eaHash = Convert.ToHexString(
                        SHA256.HashData(await File.ReadAllBytesAsync(config.EaBinaryPath)))
                        .ToLowerInvariant();
                }

                using var http = ScenovaClient.NewHttpClient();
                var heartbeat = await ScenovaClient.PostJsonAsync<AgentHeartbeatResponse>(
                    http,
                    config.ApiBase.TrimEnd('/') + "/api/ea/agent-heartbeat",
                    new
                    {
                        instanceId = config.InstanceId,
                        installToken,
                        agentVersion = "2.0.0",
                        terminalPath = config.TerminalDataPath,
                        eaHash,
                        hostname = Environment.MachineName,
                        devicePublicId = config.DevicePublicId,
                        deviceSecret
                    });

                if (!heartbeat.DeviceVerified)
                    throw new InvalidOperationException("device verification failed");

                await AppendLogAsync(logPath, "Heartbeat OK. device=" + config.DevicePublicId);
            }
            catch (Exception ex)
            {
                await AppendLogAsync(logPath, "ERROR: " + ex.Message);
            }

            await Task.Delay(TimeSpan.FromSeconds(15));
        }
    }

    private static async Task AppendLogAsync(string path, string message)
    {
        try
        {
            await File.AppendAllTextAsync(
                path,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message + Environment.NewLine);
        }
        catch { }
    }
}
