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
            File.Copy(source, agentPath, true);

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
