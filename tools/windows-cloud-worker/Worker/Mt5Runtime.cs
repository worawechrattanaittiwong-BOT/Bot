using System.Diagnostics;
using System.Text;
using System.Security.Cryptography;

namespace Scenova.CloudWorker;

internal sealed record PreparedInstance(
    string InstancePath,
    string TerminalPath,
    string PresetPath,
    string StartupPath);

internal sealed class Mt5Runtime
{
    private readonly WorkerConfig _config;
    private readonly string _instancesPath;
    private readonly string _templatePath;
    private readonly Dictionary<string, DateTimeOffset> _retryAfter =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _offlineRepairAttempted =
        new(StringComparer.OrdinalIgnoreCase);

    public Mt5Runtime(WorkerConfig config)
    {
        _config = config;
        _instancesPath = Path.Combine(config.Root, "instances");
        _templatePath = Path.Combine(config.Root, "template");
    }

    public bool TemplateReady =>
        File.Exists(Path.Combine(_templatePath, "terminal64.exe")) &&
        File.Exists(Path.Combine(_templatePath, "MQL5", "Experts", "FastBasketBot.ex5")) &&
        File.Exists(Path.Combine(_templatePath, "cloud-template.ready"));

    public int ActiveInstanceCount()
    {
        var prefix = Path.GetFullPath(_instancesPath).TrimEnd('\\') + "\\";
        return EnumerateTerminalProcesses()
            .Count(item => item.Path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    public IReadOnlyList<CloudInstanceDiagnostic> Diagnostics()
    {
        var result = new List<CloudInstanceDiagnostic>();
        if (!Directory.Exists(_instancesPath)) return result;

        foreach (var instancePath in Directory.EnumerateDirectories(_instancesPath))
        {
            var instanceId = Path.GetFileName(instancePath);
            if (!Guid.TryParse(instanceId, out _)) continue;

            var terminal = Path.Combine(instancePath, "terminal64.exe");
            var chartRoot = Path.Combine(instancePath, "Profiles", "Charts");
            var chartFiles = 0;
            try
            {
                if (Directory.Exists(chartRoot))
                    chartFiles = Directory.EnumerateFiles(
                        chartRoot, "*.chr", SearchOption.AllDirectories).Count();
            }
            catch { }

            result.Add(new CloudInstanceDiagnostic
            {
                InstanceId = instanceId,
                TerminalRunning = HasExactTerminal(terminal),
                ChartFiles = chartFiles,
                LatestExpertLog = LatestMt5LogSignal(Path.Combine(instancePath, "MQL5", "Logs")),
                LatestJournalLog = LatestMt5LogSignal(Path.Combine(instancePath, "logs"))
            });
        }

        return result.Take(50).ToArray();
    }

    private static string LatestMt5LogSignal(string directory)
    {
        try
        {
            if (!Directory.Exists(directory)) return "";
            var file = Directory.EnumerateFiles(directory, "*.log", SearchOption.TopDirectoryOnly)
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();
            if (file is null) return "";

            var lines = File.ReadLines(file)
                .TakeLast(160)
                .Where(line =>
                    line.Contains("SCENOVA", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("FastBasketBot", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("WebRequest", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("failed", StringComparison.OrdinalIgnoreCase) ||
                    line.Contains("error", StringComparison.OrdinalIgnoreCase))
                .TakeLast(8)
                .ToArray();

            var joined = string.Join(" | ", lines);
            return joined.Length <= 1800 ? joined : joined[^1800..];
        }
        catch
        {
            return "";
        }
    }

    internal PreparedInstance PrepareInstanceFiles(CloudJob job)
    {
        var instancePath = GetInstancePath(job.InstanceId);
        var marker = Path.Combine(instancePath, "cloud-provisioned");
        var alreadyProvisioned = File.Exists(marker);

        if (!alreadyProvisioned)
        {
            if (!TemplateReady) throw new InvalidOperationException("Template is not verified");

            Directory.CreateDirectory(instancePath);
            CopyTemplate(_templatePath, instancePath);
            File.WriteAllText(marker, "1", new UTF8Encoding(false));
        }

        var terminal = Path.Combine(instancePath, "terminal64.exe");
        var ea = Path.Combine(instancePath, "MQL5", "Experts", "FastBasketBot.ex5");
        if (!File.Exists(terminal) || !File.Exists(ea))
            throw new InvalidOperationException("Missing MT5 or EA");

        var presetDir = Path.Combine(instancePath, "MQL5", "Presets");
        Directory.CreateDirectory(presetDir);

        var presetPath = Path.Combine(presetDir, "SCENOVA-Cloud.set");
        File.WriteAllLines(
            presetPath,
            new[]
            {
                "InpApiBase=" + SafeIniValue(_config.EffectiveApiBase),
                "InpInstanceId=" + SafeIniValue(job.InstanceId),
                "InpInstallToken=" + SafeIniValue(job.InstallToken)
            },
            Encoding.Unicode);

        var startupPath = Path.Combine(instancePath, "cloud-start.ini");
        File.WriteAllLines(
            startupPath,
            new[]
            {
                "[Common]",
                "Login=" + SafeIniValue(job.AccountNumberText),
                "Password=" + SafeIniValue(job.TradingPassword),
                "Server=" + SafeIniValue(job.BrokerServer),
                "KeepPrivate=1",
                "NewsEnable=0",
                "ProxyEnable=0",
                "CertInstall=0",
                "EnableDpiAware=1",
                "[Charts]",
                "MaxBars=5000",
                "[Experts]",
                "Enabled=1",
                "AllowLiveTrading=1",
                "AllowDllImport=0",
                "WebRequest=1",
                "Account=0",
                "Profile=0",
                "Chart=0",
                "[StartUp]",
                "Expert=FastBasketBot",
                "ExpertParameters=SCENOVA-Cloud.set",
                "Symbol=" + SafeIniValue(job.Symbol),
                "Period=M5"
            },
            Encoding.Unicode);

        return new PreparedInstance(instancePath, terminal, presetPath, startupPath);
    }

    public EaApplyOutcome ApplyEaUpdate(
        CloudJob job,
        FleetUpdateJob update,
        string packagePath)
    {
        var prepared = PrepareInstanceFiles(job);
        var currentEa = Path.Combine(
            prepared.InstancePath,
            "MQL5",
            "Experts",
            "FastBasketBot.ex5");

        var backup = EaPackageStore.BackupCurrent(
            _config.Root,
            job.InstanceId,
            update.Id,
            currentEa);

        if (!StopInstance(job.InstanceId))
            throw new EaApplyException("PROCESS_STILL_RUNNING", backup.PreviousSha256);

        try
        {
            EaPackageStore.ReplaceEa(
                currentEa,
                packagePath,
                update.TargetSha256);

            LaunchPrepared(prepared);
            return new EaApplyOutcome(backup.PreviousSha256);
        }
        catch (Exception ex)
        {
            try
            {
                EaPackageStore.ReplaceEa(
                    currentEa,
                    backup.BackupPath,
                    backup.PreviousSha256);
                LaunchPrepared(prepared);
                throw new EaApplyException(
                    "UPDATE_FAILED_ROLLED_BACK",
                    backup.PreviousSha256,
                    ex);
            }
            catch (EaApplyException)
            {
                throw;
            }
            catch (Exception rollbackError)
            {
                throw new EaApplyException(
                    "UPDATE_FAILED_ROLLBACK_FAILED",
                    backup.PreviousSha256,
                    rollbackError);
            }
        }
    }

    public EaApplyOutcome ApplyEaRollback(
        CloudJob job,
        FleetUpdateJob update)
    {
        if (string.IsNullOrWhiteSpace(update.SourceInstanceUpdateId))
            throw new EaApplyException("ROLLBACK_SOURCE_REQUIRED");

        var prepared = PrepareInstanceFiles(job);
        var currentEa = Path.Combine(
            prepared.InstancePath,
            "MQL5",
            "Experts",
            "FastBasketBot.ex5");

        var sourceBackup = EaPackageStore.BackupPath(
            _config.Root,
            job.InstanceId,
            update.SourceInstanceUpdateId);

        if (!File.Exists(sourceBackup))
            throw new EaApplyException("ROLLBACK_BACKUP_MISSING");

        var currentBackup = EaPackageStore.BackupCurrent(
            _config.Root,
            job.InstanceId,
            update.Id,
            currentEa);

        if (!StopInstance(job.InstanceId))
            throw new EaApplyException("PROCESS_STILL_RUNNING", currentBackup.PreviousSha256);

        try
        {
            EaPackageStore.ReplaceEa(
                currentEa,
                sourceBackup,
                update.TargetSha256);

            LaunchPrepared(prepared);
            return new EaApplyOutcome(currentBackup.PreviousSha256);
        }
        catch (Exception ex)
        {
            try
            {
                EaPackageStore.ReplaceEa(
                    currentEa,
                    currentBackup.BackupPath,
                    currentBackup.PreviousSha256);
                LaunchPrepared(prepared);
                throw new EaApplyException(
                    "ROLLBACK_FAILED_RESTORED_CURRENT",
                    currentBackup.PreviousSha256,
                    ex);
            }
            catch (EaApplyException)
            {
                throw;
            }
            catch (Exception restoreError)
            {
                throw new EaApplyException(
                    "ROLLBACK_FAILED_RESTORE_FAILED",
                    currentBackup.PreviousSha256,
                    restoreError);
            }
        }
    }

    public async Task ProcessCommandAsync(
        WorkerCommand command,
        WorkerClient client,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(command.Name, "STOP_INSTANCE", StringComparison.Ordinal)) return;

        var result = "STOP_FAILED";
        var errorCode = "STOP_FAILED";

        try
        {
            if (StopInstance(command.InstanceId))
            {
                result = "STOP_CONFIRMED";
                errorCode = "";
            }
            else
            {
                errorCode = "PROCESS_STILL_RUNNING";
            }
        }
        catch
        {
            result = "STOP_FAILED";
            errorCode = "STOP_FAILED";
        }

        await client.PostAsync("command-result", new
        {
            commandId = command.Id,
            instanceId = command.InstanceId,
            executionGeneration = command.ExecutionGeneration,
            result,
            errorCode
        }, cancellationToken);
    }

    public async Task StartOrRecoverAsync(
        CloudJob job,
        WorkerClient client,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(job.RuntimeStopState) &&
            !string.Equals(job.RuntimeStopState, "NONE", StringComparison.OrdinalIgnoreCase))
            return;

        if (job.EaOnline)
            _offlineRepairAttempted.Remove(job.InstanceId);

        var instancePath = GetInstancePath(job.InstanceId);
        var terminal = Path.Combine(instancePath, "terminal64.exe");

        // Bootstrap repair for Cloud instances that have never managed to
        // heartbeat. Once the customer/server control state is STOPPED, it is
        // safe to refresh only this terminal's EA from the verified template.
        // This breaks the deadlock where an old/broken EA cannot heartbeat and
        // therefore cannot qualify for the normal deferred fleet-update path.
        if (!job.EaOnline &&
            string.Equals(job.DesiredState, "STOPPED", StringComparison.OrdinalIgnoreCase) &&
            File.Exists(Path.Combine(instancePath, "cloud-provisioned")) &&
            TemplateReady &&
            !_offlineRepairAttempted.Contains(job.InstanceId) &&
            (!_retryAfter.TryGetValue(job.InstanceId, out var repairRetryAt) ||
             repairRetryAt <= DateTimeOffset.UtcNow))
        {
            // Never restart a permanently offline MT5 in a loop. One repair
            // attempt is enough until a fresh EA heartbeat proves recovery.
            _offlineRepairAttempted.Add(job.InstanceId);
            _retryAfter[job.InstanceId] = DateTimeOffset.UtcNow.AddSeconds(60);

            try
            {
                if (!StopInstance(job.InstanceId))
                    return;

                // Never overwrite an existing provisioned EA during heartbeat
                // recovery. Fleet Update is the sole owner of EA version changes.
                // The template may legitimately lag behind a newer per-instance
                // EA and copying it here would silently downgrade the runtime.
                var instanceEa = Path.Combine(
                    instancePath,
                    "MQL5",
                    "Experts",
                    "FastBasketBot.ex5");
                if (!File.Exists(instanceEa))
                {
                    var templateEa = Path.Combine(
                        _templatePath,
                        "MQL5",
                        "Experts",
                        "FastBasketBot.ex5");
                    Directory.CreateDirectory(Path.GetDirectoryName(instanceEa)!);
                    File.Copy(templateEa, instanceEa, overwrite: false);
                }

                var repaired = PrepareInstanceFiles(job);
                LaunchPrepared(repaired);

                await client.PostAsync("provision-result", new
                {
                    instanceId = job.InstanceId,
                    errorCode = ""
                }, cancellationToken);
                return;
            }
            catch
            {
                try
                {
                    await client.PostAsync("provision-result", new
                    {
                        instanceId = job.InstanceId,
                        errorCode = "CHECK_TEMPLATE_OR_TERMINAL"
                    }, cancellationToken);
                }
                catch { }
                return;
            }
        }

        if (HasExactTerminal(terminal))
        {
            var startup = Path.Combine(instancePath, "cloud-start.ini");
            // The assigned-job snapshot can still report EA online from the
            // heartbeat that happened immediately before an update restart.
            // Keep the startup file longer than the API's 30-second EA-online
            // freshness window so that stale pre-restart state cannot delete it
            // before the new MT5 process has attached FastBasketBot.
            if (job.EaOnline &&
                File.Exists(startup) &&
                StartupConfigCleanupAllowed(startup))
            {
                try { File.Delete(startup); } catch { }
            }

            return;
        }

        if (_retryAfter.TryGetValue(job.InstanceId, out var retryAt) &&
            retryAt > DateTimeOffset.UtcNow)
            return;

        _retryAfter[job.InstanceId] = DateTimeOffset.UtcNow.AddSeconds(60);

        var alreadyProvisioned = File.Exists(Path.Combine(instancePath, "cloud-provisioned"));
        var recoveryAuthorized = false;

        if (alreadyProvisioned)
        {
            try
            {
                var decision = await client.PostAsync<RecoveryDecision>(
                    "recovery-check",
                    new
                    {
                        instanceId = job.InstanceId,
                        executionGeneration = job.ExecutionGeneration
                    },
                    cancellationToken);

                if (!decision.Allow) return;
                recoveryAuthorized = true;

                if (HasExactTerminal(terminal)) return;
            }
            catch
            {
                return;
            }
        }

        try
        {
            var prepared = PrepareInstanceFiles(job);

            if (!HasExactTerminal(prepared.TerminalPath))
                LaunchPrepared(prepared);

            if (recoveryAuthorized)
            {
                await client.PostAsync("recovery-result", new
                {
                    instanceId = job.InstanceId,
                    executionGeneration = job.ExecutionGeneration,
                    result = "STARTED",
                    errorCode = ""
                }, cancellationToken);
            }

            await client.PostAsync("provision-result", new
            {
                instanceId = job.InstanceId,
                errorCode = ""
            }, cancellationToken);
        }
        catch
        {
            if (recoveryAuthorized)
            {
                try
                {
                    await client.PostAsync("recovery-result", new
                    {
                        instanceId = job.InstanceId,
                        executionGeneration = job.ExecutionGeneration,
                        result = "FAILED",
                        errorCode = "RECOVERY_START_FAILED"
                    }, cancellationToken);
                }
                catch { }
            }

            try
            {
                await client.PostAsync("provision-result", new
                {
                    instanceId = job.InstanceId,
                    errorCode = "CHECK_TEMPLATE_OR_TERMINAL"
                }, cancellationToken);
            }
            catch { }
        }
    }

    private void LaunchPrepared(PreparedInstance prepared)
    {
        if (HasExactTerminal(prepared.TerminalPath)) return;

        // Cloud instances are fully Worker-managed; keep startup deterministic. MT5 persists every open
        // chart in Profiles/Charts and /config [StartUp] opens another chart on
        // each recovery. Without clearing the persisted workspace, unattended
        // restarts accumulate duplicate XAUUSD,M5 charts (and may attach the EA
        // more than once). Rebuild only the chart workspace while the terminal
        // is stopped; credentials, presets, history and the EA binary remain.
        ResetCloudChartWorkspace(prepared.InstancePath);

        Process.Start(new ProcessStartInfo
        {
            FileName = prepared.TerminalPath,
            Arguments = $"/portable /config:\"{prepared.StartupPath}\"",
            WorkingDirectory = prepared.InstancePath,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden
        });

        var deadline = DateTimeOffset.UtcNow.AddSeconds(15);
        while (DateTimeOffset.UtcNow < deadline)
        {
            if (HasExactTerminal(prepared.TerminalPath)) return;
            Thread.Sleep(250);
        }

        throw new InvalidOperationException("MT5_RESTART_FAILED");
    }

    internal static void ResetCloudChartWorkspace(string instancePath)
    {
        var profilesRoot = Path.Combine(instancePath, "Profiles");
        var chartsRoot = Path.Combine(profilesRoot, "Charts");

        try
        {
            if (Directory.Exists(chartsRoot))
                Directory.Delete(chartsRoot, recursive: true);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException("MT5_CHART_PROFILE_RESET_FAILED", ex);
        }

        // MT5 may remember the last profile name separately. Remove only these
        // profile-selection hints so startup is driven by cloud-start.ini.
        foreach (var name in new[] { "lastprofile.ini", "LastProfile.ini" })
        {
            var path = Path.Combine(profilesRoot, name);
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("MT5_LAST_PROFILE_RESET_FAILED", ex);
            }
        }

        Directory.CreateDirectory(chartsRoot);
    }

    private static bool StartupConfigCleanupAllowed(string startupPath)
    {
        try
        {
            var age = DateTime.UtcNow - File.GetLastWriteTimeUtc(startupPath);
            return age >= TimeSpan.FromSeconds(35);
        }
        catch
        {
            return false;
        }
    }

    private bool StopInstance(string instanceId)
    {
        var terminal = Path.Combine(GetInstancePath(instanceId), "terminal64.exe");
        var matches = EnumerateTerminalProcesses()
            .Where(item => string.Equals(item.Path, terminal, StringComparison.OrdinalIgnoreCase))
            .ToArray();

        foreach (var item in matches)
        {
            try
            {
                using var process = Process.GetProcessById(item.Pid);
                process.Kill(entireProcessTree: true);
                process.WaitForExit(15_000);
            }
            catch { }
        }

        return !HasExactTerminal(terminal);
    }

    private string GetInstancePath(string instanceId)
    {
        if (!Guid.TryParse(instanceId, out _))
            throw new InvalidOperationException("Invalid instance ID");

        var root = Path.GetFullPath(_instancesPath).TrimEnd('\\') + "\\";
        var path = Path.GetFullPath(Path.Combine(_instancesPath, instanceId));
        if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Invalid instance path");

        return path;
    }

    private bool HasExactTerminal(string terminalPath) =>
        EnumerateTerminalProcesses()
            .Any(item => string.Equals(item.Path, terminalPath, StringComparison.OrdinalIgnoreCase));

    private static string SafeIniValue(string? value)
    {
        var result = value ?? "";
        if (result.IndexOfAny(['\r', '\n', '\0']) >= 0)
            throw new InvalidOperationException("Invalid configuration value");
        return result;
    }

    private static void CopyTemplate(string source, string destination)
    {
        foreach (var directory in Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(source, directory);
            Directory.CreateDirectory(Path.Combine(destination, relative));
        }

        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            if (string.Equals(Path.GetFileName(file), "cloud-template.ready", StringComparison.OrdinalIgnoreCase))
                continue;

            var relative = Path.GetRelativePath(source, file);
            var target = Path.Combine(destination, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target, overwrite: true);
        }
    }

    private static List<(int Pid, string Path)> EnumerateTerminalProcesses()
    {
        var result = new List<(int, string)>();
        foreach (var process in Process.GetProcessesByName("terminal64"))
        {
            using (process)
            {
                try
                {
                    var path = process.MainModule?.FileName;
                    if (!string.IsNullOrWhiteSpace(path))
                        result.Add((process.Id, Path.GetFullPath(path)));
                }
                catch
                {
                    // Ignore inaccessible terminals outside this Worker session.
                }
            }
        }

        return result;
    }
}
