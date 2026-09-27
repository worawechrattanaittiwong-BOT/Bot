using System.Diagnostics;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;

namespace Scenova.CloudWorker;

internal sealed record PreparedInstance(
    string InstancePath,
    string TerminalPath,
    string PresetPath,
    string StartupPath,
    string Symbol);

internal sealed class Mt5Runtime
{
    private const int SwMaximize = 3;
    private const uint WmMdiMaximize = 0x0225;
    private delegate bool EnumWindowProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowProc callback, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

    private readonly WorkerConfig _config;
    private readonly string _instancesPath;
    private readonly string _templatePath;
    private readonly BrokerPlatformManager _brokerPlatforms;
    private readonly HashSet<string> _brokerMigrationAttempted =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _autoLaunchAttempted =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, int> _maximizedProcessByInstance =
        new(StringComparer.OrdinalIgnoreCase);

    public Mt5Runtime(WorkerConfig config)
    {
        _config = config;
        _instancesPath = Path.Combine(config.Root, "instances");
        _templatePath = Path.Combine(config.Root, "template");
        _brokerPlatforms = new BrokerPlatformManager(config);
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

    internal bool ShouldAutoLaunch(string instanceId, bool terminalRunning)
    {
        if (terminalRunning)
        {
            // A confirmed running MT5 rearms exactly one future automatic
            // launch. Normal supervision never stops or restarts it here.
            _autoLaunchAttempted.Remove(instanceId);
            return false;
        }

        // Claim one launch attempt until a running terminal is observed again.
        // If startup fails immediately, keep the claim to prevent a 10-second
        // unattended launch loop.
        return _autoLaunchAttempted.Add(instanceId);
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
            var terminalRunning = HasExactTerminal(terminal);
            var chartRoots = new[]
            {
                Path.Combine(instancePath, "MQL5", "Profiles", "Charts"),
                Path.Combine(instancePath, "Profiles", "Charts")
            };
            var chartFiles = 0;
            var chartHasFastBasketBot = false;
            foreach (var chartRoot in chartRoots)
            {
                try
                {
                    if (!Directory.Exists(chartRoot)) continue;
                    foreach (var chart in Directory.EnumerateFiles(
                                 chartRoot, "*.chr", SearchOption.AllDirectories))
                    {
                        chartFiles++;
                        if (!chartHasFastBasketBot)
                        {
                            try
                            {
                                var text = File.ReadAllText(chart);
                                chartHasFastBasketBot =
                                    text.Contains("FastBasketBot", StringComparison.OrdinalIgnoreCase);
                            }
                            catch { }
                        }
                    }
                }
                catch { }
            }

            var readyMarker = Path.Combine(
                instancePath,
                "MQL5",
                "Files",
                "scenova-ea-ready.txt");
            var attachMarkerMatches =
                terminalRunning &&
                EaReadyMarkerMatches(readyMarker, instanceId);

            var eaPath = Path.Combine(instancePath, "MQL5", "Experts", "FastBasketBot.ex5");
            var eaSha256 = "";
            long eaBytes = 0;
            try
            {
                if (File.Exists(eaPath))
                {
                    eaBytes = new FileInfo(eaPath).Length;
                    using var stream = File.OpenRead(eaPath);
                    eaSha256 = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
                }
            }
            catch { }

            var presetPath = Path.Combine(instancePath, "MQL5", "Presets", "SCENOVA-Cloud.set");
            var presetCloudRelayEnabled = false;
            try
            {
                presetCloudRelayEnabled =
                    File.Exists(presetPath) &&
                    File.ReadAllText(presetPath)
                        .Contains("InpCloudRelay=true", StringComparison.OrdinalIgnoreCase);
            }
            catch { }

            var filesPath = Path.Combine(instancePath, "MQL5", "Files");
            var relayRequestFiles = 0;
            var relayResponseFiles = 0;
            try
            {
                if (Directory.Exists(filesPath))
                {
                    relayRequestFiles = Directory.EnumerateFiles(
                        filesPath, "scenova-hb-*.request.txt", SearchOption.TopDirectoryOnly).Count();
                    relayResponseFiles = Directory.EnumerateFiles(
                        filesPath, "scenova-hb-*.response.txt", SearchOption.TopDirectoryOnly).Count();
                }
            }
            catch { }

            var expertLogDir = Path.Combine(instancePath, "MQL5", "Logs");
            var journalLogDir = Path.Combine(instancePath, "logs");
            result.Add(new CloudInstanceDiagnostic
            {
                InstanceId = instanceId,
                TerminalRunning = terminalRunning,
                ChartFiles = chartFiles,
                ChartHasFastBasketBot = chartHasFastBasketBot || attachMarkerMatches,
                EaSha256 = eaSha256,
                EaBytes = eaBytes,
                StartupConfigExists = File.Exists(Path.Combine(instancePath, "cloud-start.ini")),
                PresetCloudRelayEnabled = presetCloudRelayEnabled,
                RelayRequestFiles = relayRequestFiles,
                RelayResponseFiles = relayResponseFiles,
                ExpertLogUpdatedAt = LatestLogUpdatedAt(expertLogDir),
                JournalLogUpdatedAt = LatestLogUpdatedAt(journalLogDir),
                LatestExpertLog = LatestMt5LogSignal(expertLogDir),
                LatestJournalLog = LatestMt5LogSignal(journalLogDir),
                BrokerPlatform = _brokerPlatforms.InstalledPlatform(instancePath),
                BrokerPlatformError = ReadSmallText(
                    Path.Combine(instancePath, "broker-platform-error.txt"))
            });
        }

        return result.Take(50).ToArray();
    }

    private static string ReadSmallText(string path)
    {
        try
        {
            if (!File.Exists(path)) return "";
            var value = File.ReadAllText(path).Trim();
            if (value.Length > 240)
                value = value.Substring(value.Length - 240);
            return value;
        }
        catch
        {
            return "";
        }
    }

    private static string LatestLogUpdatedAt(string directory)
    {
        try
        {
            if (!Directory.Exists(directory)) return "";
            var file = Directory.EnumerateFiles(directory, "*.log", SearchOption.TopDirectoryOnly)
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .FirstOrDefault();
            return file is null
                ? ""
                : File.GetLastWriteTimeUtc(file).ToString("O");
        }
        catch
        {
            return "";
        }
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
            Directory.CreateDirectory(instancePath);

            var brokerPlatformReady =
                !string.IsNullOrWhiteSpace(_brokerPlatforms.InstalledPlatform(instancePath)) &&
                File.Exists(Path.Combine(instancePath, "terminal64.exe"));

            if (brokerPlatformReady)
            {
                if (!TemplateReady)
                    throw new InvalidOperationException("Template is not verified");

                var brokerEa = Path.Combine(
                    instancePath,
                    "MQL5",
                    "Experts",
                    "FastBasketBot.ex5");
                var templateEa = Path.Combine(
                    _templatePath,
                    "MQL5",
                    "Experts",
                    "FastBasketBot.ex5");

                Directory.CreateDirectory(Path.GetDirectoryName(brokerEa)!);
                File.Copy(templateEa, brokerEa, overwrite: true);
            }
            else
            {
                if (!TemplateReady)
                    throw new InvalidOperationException("Template is not verified");

                CopyTemplate(_templatePath, instancePath);
            }

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
                "InpInstallToken=" + SafeIniValue(job.InstallToken),
                "InpCloudRelay=true"
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

        return new PreparedInstance(instancePath, terminal, presetPath, startupPath, job.Symbol);
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
                // This stop is allowed only because an explicit Fleet Update
                // is being rolled back. Normal Worker supervision never stops MT5.
                StopInstance(job.InstanceId);
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
                // This stop is allowed only because an explicit rollback is
                // restoring the previous EA binary.
                StopInstance(job.InstanceId);
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
        var isStop = string.Equals(command.Name, "STOP_INSTANCE", StringComparison.Ordinal);
        var isReload = string.Equals(command.Name, "RELOAD_INSTANCE", StringComparison.Ordinal);
        if (!isStop && !isReload) return;

        var result = isReload ? "RELOAD_FAILED" : "STOP_FAILED";
        var errorCode = result;

        try
        {
            if (!StopInstance(command.InstanceId))
            {
                errorCode = "PROCESS_STILL_RUNNING";
            }
            else if (isReload)
            {
                if (command.Job is null ||
                    !string.Equals(command.Job.InstanceId, command.InstanceId, StringComparison.OrdinalIgnoreCase) ||
                    command.Job.ExecutionGeneration != command.ExecutionGeneration)
                    throw new InvalidOperationException("RELOAD_JOB_MISMATCH");

                var prepared = PrepareInstanceFiles(command.Job);
                LaunchPrepared(prepared);
                result = "RELOAD_CONFIRMED";
                errorCode = "";
            }
            else
            {
                result = "STOP_CONFIRMED";
                errorCode = "";
            }
        }
        catch (Exception ex)
        {
            result = isReload ? "RELOAD_FAILED" : "STOP_FAILED";
            var normalized = new string(ex.Message
                .ToUpperInvariant()
                .Select(c => char.IsLetterOrDigit(c) || c == '_' ? c : '_')
                .ToArray())
                .Trim('_');
            errorCode = string.IsNullOrWhiteSpace(normalized)
                ? result
                : normalized[..Math.Min(64, normalized.Length)];
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

        if (!await EnsureBrokerPlatformAsync(job, cancellationToken))
            return;

        var instancePath = GetInstancePath(job.InstanceId);
        var terminal = Path.Combine(instancePath, "terminal64.exe");

        // Normal supervision must never recycle a healthy MT5 merely because
        // the EA heartbeat is late/offline. A confirmed running process only
        // rearms one future launch in case the user later closes MT5.
        if (HasExactTerminal(terminal))
        {
            ShouldAutoLaunch(job.InstanceId, terminalRunning: true);
            TryApplyChartLayout(job, terminal);

            var startup = Path.Combine(instancePath, "cloud-start.ini");
            if (job.EaOnline &&
                File.Exists(startup) &&
                StartupConfigCleanupAllowed(startup))
            {
                try { File.Delete(startup); } catch { }
            }
            return;
        }

        // If MT5 was previously observed running and the user closes it,
        // reopen it once. If that launch fails before MT5 is observed running
        // again, do not keep retrying and never stop another running process.
        if (!ShouldAutoLaunch(job.InstanceId, terminalRunning: false))
            return;

        try
        {
            var prepared = PrepareInstanceFiles(job);
            LaunchPrepared(prepared, requireEaAttach: false);

            await client.PostAsync("provision-result", new
            {
                instanceId = job.InstanceId,
                errorCode = ""
            }, cancellationToken);
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
        }
    }

    private async Task<bool> EnsureBrokerPlatformAsync(
        CloudJob job,
        CancellationToken cancellationToken)
    {
        var instancePath = GetInstancePath(job.InstanceId);
        if (!_brokerPlatforms.NeedsInstall(job, instancePath))
            return true;

        // A failed broker migration must never become a 10-second stop/start
        // loop. Retry only after the Worker itself is intentionally updated or
        // restarted.
        if (!_brokerMigrationAttempted.Add(job.InstanceId))
            return false;

        var terminal = Path.Combine(instancePath, "terminal64.exe");
        if (HasExactTerminal(terminal) && !StopInstance(job.InstanceId))
            return false;

        try
        {
            await _brokerPlatforms.InstallAsync(
                job,
                instancePath,
                cancellationToken);

            // Some broker installers start the terminal after installation.
            // Close only that exact per-instance process so SCENOVA can launch
            // it once with the authoritative cloud-start.ini.
            StopInstance(job.InstanceId);

            _autoLaunchAttempted.Remove(job.InstanceId);
            _maximizedProcessByInstance.Remove(job.InstanceId);
            return true;
        }
        catch (Exception ex)
        {
            try
            {
                File.WriteAllText(
                    Path.Combine(instancePath, "broker-platform-error.txt"),
                    DateTimeOffset.UtcNow.ToString("O") + " " + NormalizeRuntimeError(ex.Message),
                    new UTF8Encoding(false));
            }
            catch { }

            // BrokerPlatformManager restores the previous Config/EA on failure.
            // Bring the old terminal back once instead of leaving the customer
            // with no MT5 at all.
            try
            {
                if (File.Exists(terminal))
                {
                    _autoLaunchAttempted.Remove(job.InstanceId);
                    var prepared = PrepareInstanceFiles(job);
                    LaunchPrepared(prepared, requireEaAttach: false);
                }
            }
            catch { }

            return false;
        }
    }

    private static string NormalizeRuntimeError(string? value)
    {
        var clean = new string((value ?? "BROKER_PLATFORM_FAILED")
            .ToUpperInvariant()
            .Select(c => char.IsLetterOrDigit(c) || c == '_' ? c : '_')
            .ToArray())
            .Trim('_');

        return string.IsNullOrWhiteSpace(clean)
            ? "BROKER_PLATFORM_FAILED"
            : clean[..Math.Min(96, clean.Length)];
    }

    private void LaunchPrepared(
        PreparedInstance prepared,
        bool requireEaAttach = true)
    {
        if (HasExactTerminal(prepared.TerminalPath))
        {
            TryMaximizeChart(prepared);
            return;
        }

        var instanceId = Path.GetFileName(
            prepared.InstancePath.TrimEnd(
                Path.DirectorySeparatorChar,
                Path.AltDirectorySeparatorChar));
        var readyMarker = Path.Combine(
            prepared.InstancePath,
            "MQL5",
            "Files",
            "scenova-ea-ready.txt");

        try { if (File.Exists(readyMarker)) File.Delete(readyMarker); } catch { }

        // Every intentional launch starts from one clean chart workspace.
        // Never recycle the terminal here just because broker/EA initialization
        // takes longer than expected.
        ResetCloudChartWorkspace(prepared.InstancePath);

        Process.Start(new ProcessStartInfo
        {
            FileName = prepared.TerminalPath,
            Arguments = $"/portable /config:\"{prepared.StartupPath}\"",
            WorkingDirectory = prepared.InstancePath,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Maximized
        });

        _autoLaunchAttempted.Add(instanceId);

        var deadline = DateTimeOffset.UtcNow.AddSeconds(30);
        while (DateTimeOffset.UtcNow < deadline)
        {
            var running = HasExactTerminal(prepared.TerminalPath);
            if (running && EaReadyMarkerMatches(readyMarker, instanceId))
            {
                TryMaximizeChart(prepared);
                return;
            }

            Thread.Sleep(250);
        }

        if (HasExactTerminal(prepared.TerminalPath))
        {
            TryMaximizeChart(prepared);
            if (!requireEaAttach)
                return;

            // Explicit update/reload callers may treat this as verification
            // failure, but normal supervision must never kill this terminal.
            throw new InvalidOperationException("EA_ATTACH_TIMEOUT");
        }

        throw new InvalidOperationException("TERMINAL_START_FAILED");
    }

    private void TryApplyChartLayout(CloudJob job, string terminalPath)
    {
        var terminal = EnumerateTerminalProcesses()
            .FirstOrDefault(item =>
                string.Equals(item.Path, terminalPath, StringComparison.OrdinalIgnoreCase));
        if (terminal.Pid <= 0) return;

        if (_maximizedProcessByInstance.TryGetValue(job.InstanceId, out var appliedPid) &&
            appliedPid == terminal.Pid)
            return;

        var instancePath = GetInstancePath(job.InstanceId);
        var prepared = new PreparedInstance(
            instancePath,
            terminalPath,
            Path.Combine(instancePath, "MQL5", "Presets", "SCENOVA-Cloud.set"),
            Path.Combine(instancePath, "cloud-start.ini"),
            job.Symbol);

        if (TryMaximizeChart(prepared))
            _maximizedProcessByInstance[job.InstanceId] = terminal.Pid;
    }

    private static bool TryMaximizeChart(PreparedInstance prepared)
    {
        try
        {
            var terminal = EnumerateTerminalProcesses()
                .FirstOrDefault(item =>
                    string.Equals(item.Path, prepared.TerminalPath, StringComparison.OrdinalIgnoreCase));
            if (terminal.Pid <= 0) return false;

            using var process = Process.GetProcessById(terminal.Pid);
            var deadline = DateTimeOffset.UtcNow.AddSeconds(5);
            while (DateTimeOffset.UtcNow < deadline)
            {
                process.Refresh();
                var mainWindow = process.MainWindowHandle;
                if (mainWindow != IntPtr.Zero)
                {
                    ShowWindowAsync(mainWindow, SwMaximize);
                    IntPtr chartWindow = IntPtr.Zero;
                    EnumChildWindows(
                        mainWindow,
                        (handle, _) =>
                        {
                            var title = new StringBuilder(256);
                            if (GetWindowText(handle, title, title.Capacity) <= 0)
                                return true;

                            var text = title.ToString();
                            if (text.Contains(prepared.Symbol, StringComparison.OrdinalIgnoreCase) &&
                                text.Contains("M5", StringComparison.OrdinalIgnoreCase))
                            {
                                chartWindow = handle;
                                return false;
                            }

                            return true;
                        },
                        IntPtr.Zero);

                    if (chartWindow != IntPtr.Zero)
                    {
                        var parent = GetParent(chartWindow);
                        if (parent != IntPtr.Zero)
                            SendMessage(parent, WmMdiMaximize, chartWindow, IntPtr.Zero);
                        ShowWindowAsync(chartWindow, SwMaximize);
                        return true;
                    }
                }

                Thread.Sleep(250);
            }
        }
        catch
        {
            // Window layout is cosmetic. Never fail or restart a healthy MT5
            // only because Windows did not expose the chart child in time.
        }

        return false;
    }

    private static bool EaReadyMarkerMatches(string markerPath, string instanceId)
    {
        try
        {
            if (!File.Exists(markerPath)) return false;
            var lines = File.ReadAllLines(markerPath);
            return lines.Length >= 2 &&
                   !string.IsNullOrWhiteSpace(lines[0]) &&
                   string.Equals(lines[1].Trim(), instanceId, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    internal static void ResetCloudChartWorkspace(string instancePath)
    {
        // Portable MT5 stores chart profiles below MQL5\Profiles. Older copied
        // templates may also contain a root Profiles folder, so clean both.
        var profileRoots = new[]
        {
            Path.Combine(instancePath, "MQL5", "Profiles"),
            Path.Combine(instancePath, "Profiles")
        };

        foreach (var profilesRoot in profileRoots)
        {
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
        }

        Directory.CreateDirectory(
            Path.Combine(instancePath, "MQL5", "Profiles", "Charts"));
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
