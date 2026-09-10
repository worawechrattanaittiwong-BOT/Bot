using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Microsoft.Win32;

namespace ScenovaInstaller;

internal static class InstallerConstants
{
    internal const string Version = "3.0.0";
    internal const string AgentVersion = "3.0.0";
    internal const string ProductName = "SCENOVA Smart Installer";
    internal const int BackupRetention = 2;
}

internal enum HealthState
{
    Ready,
    Warning,
    NeedAction,
    AutoFix,
    Info
}

internal sealed class HealthCheckResult
{
    public string Code { get; init; } = "";
    public string Title { get; init; } = "";
    public string Detail { get; init; } = "";
    public HealthState State { get; init; } = HealthState.Info;
    public int Weight { get; init; } = 1;
    public bool Passed => State is HealthState.Ready or HealthState.Info;
}

internal sealed class InstallationAssessment
{
    public List<HealthCheckResult> Checks { get; init; } = [];
    public int Score { get; init; }
    public string Summary { get; init; } = "";
    public bool Ready => Checks.All(x => x.State is not HealthState.NeedAction);
}

internal sealed class UpdatePlan
{
    public bool InstallAgent { get; set; }
    public bool UpdateAgent { get; set; }
    public bool InstallEa { get; set; }
    public bool UpdateEa { get; set; }
    public bool RepairPreset { get; set; }
    public bool WaitForSafeRestart { get; set; }
    public bool VerifyOnly { get; set; }
    public string Summary { get; set; } = "";
}

internal enum InstallerErrorCode
{
    None,
    Mt5NotFound,
    Mt5PathInvalid,
    Mql5NotWritable,
    ApiUnavailable,
    EnrollmentMissing,
    EnrollmentExpired,
    ArtifactUnavailable,
    EaHashFailed,
    AgentInstallFailed,
    EaOffline,
    AccountMismatch,
    UpdatePending,
    RollbackUnavailable,
    SignatureInvalid,
    DiskSpaceLow,
    Unknown
}

internal static class InstallerDiagnostics
{
    private static readonly SemaphoreSlim Gate = new(1, 1);

    internal static async Task LogAsync(string eventCode, string message)
    {
        try
        {
            Directory.CreateDirectory(ScenovaRuntime.BaseDir);
            await Gate.WaitAsync();
            try
            {
                await File.AppendAllTextAsync(
                    ScenovaRuntime.DiagnosticsPath,
                    $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz} [{eventCode}] {Sanitize(message)}{Environment.NewLine}",
                    new UTF8Encoding(false));
            }
            finally
            {
                Gate.Release();
            }
        }
        catch { }
    }

    internal static string Sanitize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var text = value.Replace("\r", " ").Replace("\n", " ").Trim();
        if (text.Length > 1200) text = text[..1200];

        // Never persist install tokens or device secrets in diagnostics.
        foreach (var profile in ScenovaRuntime.ReadProfiles())
        {
            var token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected);
            var secret = ScenovaRuntime.TryUnprotect(profile.DeviceSecretProtected);
            if (!string.IsNullOrWhiteSpace(token))
                text = text.Replace(token, "[REDACTED]", StringComparison.Ordinal);
            if (!string.IsNullOrWhiteSpace(secret))
                text = text.Replace(secret, "[REDACTED]", StringComparison.Ordinal);
        }

        return text;
    }

    internal static InstallerErrorCode Classify(Exception ex)
    {
        var msg = ex.Message ?? "";
        if (msg.Contains("MetaTrader 5", StringComparison.OrdinalIgnoreCase) ||
            msg.Contains("terminal64", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.Mt5NotFound;
        if (msg.Contains("write", StringComparison.OrdinalIgnoreCase) ||
            msg.Contains("UnauthorizedAccess", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.Mql5NotWritable;
        if (msg.Contains("รหัสติดตั้งหมดอายุ", StringComparison.OrdinalIgnoreCase) ||
            msg.Contains("expired", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.EnrollmentExpired;
        if (msg.Contains("integrity", StringComparison.OrdinalIgnoreCase) ||
            msg.Contains("hash", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.EaHashFailed;
        if (msg.Contains("artifact", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.ArtifactUnavailable;
        if (msg.Contains("heartbeat", StringComparison.OrdinalIgnoreCase) ||
            msg.Contains("EA ยังไม่เชื่อม", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.EaOffline;
        if (msg.Contains("signature", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.SignatureInvalid;
        if (msg.Contains("disk", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.DiskSpaceLow;
        if (msg.Contains("server", StringComparison.OrdinalIgnoreCase) ||
            msg.Contains("HTTP", StringComparison.OrdinalIgnoreCase))
            return InstallerErrorCode.ApiUnavailable;
        return InstallerErrorCode.Unknown;
    }

    internal static string Friendly(InstallerErrorCode code, string raw)
    {
        return code switch
        {
            InstallerErrorCode.Mt5NotFound =>
                "ไม่พบ MetaTrader 5 ที่พร้อมใช้งาน กรุณาเปิด MT5 อย่างน้อย 1 ครั้ง แล้วกดสแกนใหม่",
            InstallerErrorCode.Mql5NotWritable =>
                "โฟลเดอร์ MT5 ไม่อนุญาตให้เขียนไฟล์ SCENOVA ระบบ Repair สามารถตรวจสิทธิ์และลองใหม่ได้",
            InstallerErrorCode.ApiUnavailable =>
                "เชื่อมต่อ SCENOVA Server ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วกดตรวจสอบอีกครั้ง",
            InstallerErrorCode.EnrollmentExpired =>
                "รหัสติดตั้งหมดอายุ กรุณากลับ Control Center แล้วดาวน์โหลดตัวติดตั้งล่าสุด",
            InstallerErrorCode.EaHashFailed =>
                "ไฟล์ EA ไม่ผ่าน SHA-256 Verification ระบบจะไม่เปิดใช้ไฟล์นี้และสามารถดาวน์โหลดใหม่ได้",
            InstallerErrorCode.AgentInstallFailed =>
                "Device Agent อัปเดตไม่สำเร็จ ระบบ Repair จะหยุด Agent เดิมแล้วลองแทนไฟล์ใหม่อีกครั้ง",
            InstallerErrorCode.EaOffline =>
                "ติดตั้งไฟล์แล้วแต่ EA ยังไม่ Heartbeat ระบบตรวจการเปิด MT5, preset และ WebRequest ให้อัตโนมัติได้",
            InstallerErrorCode.AccountMismatch =>
                "บัญชี MT5 ที่เปิดอยู่ไม่ตรงกับ Slot นี้ ระบบจะไม่ย้ายสิทธิ์โดยเดาเอง",
            InstallerErrorCode.UpdatePending =>
                "พบ Position เปิดอยู่ จึงพักการอัปเดตไว้ก่อน ระบบจะใช้เวอร์ชันใหม่อัตโนมัติเมื่อ Safe Stop",
            InstallerErrorCode.RollbackUnavailable =>
                "ยังไม่มี Backup ที่ปลอดภัยสำหรับย้อนกลับ",
            InstallerErrorCode.SignatureInvalid =>
                "ลายเซ็นตัวติดตั้งไม่ผ่านการตรวจสอบ โปรดใช้ไฟล์จากเว็บไซต์ SCENOVA เท่านั้น",
            InstallerErrorCode.DiskSpaceLow =>
                "พื้นที่ดิสก์ไม่เพียงพอสำหรับ Backup และอัปเดตอย่างปลอดภัย",
            _ => raw.Length > 350 ? raw[..350] : raw
        };
    }
}

internal static class TerminalDiscovery
{
    internal static List<TerminalChoice> Discover()
    {
        var candidates = new Dictionary<string, TerminalChoice>(StringComparer.OrdinalIgnoreCase);
        var existingPaths = ScenovaRuntime.ReadProfiles()
            .Select(x => x.TerminalDataPath)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var appDataRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MetaQuotes",
            "Terminal");

        if (Directory.Exists(appDataRoot))
        {
            foreach (var dir in SafeDirectories(appDataRoot))
            {
                if (!Directory.Exists(Path.Combine(dir, "MQL5"))) continue;
                AddCandidate(candidates, dir, existingPaths);
            }
        }

        // Registry discovery covers broker installations whose data directory
        // has not been used recently enough to be obvious from Program Files.
        foreach (var exe in RegistryTerminalExecutables())
        {
            var data = FindDataPathForExecutable(appDataRoot, exe);
            if (!string.IsNullOrWhiteSpace(data))
                AddCandidate(candidates, data, existingPaths);
        }

        var result = candidates.Values
            .OrderByDescending(x => x.IsExistingScenovaTarget)
            .ThenByDescending(x => x.IsRunning)
            .ThenByDescending(x => x.LastSeenAt)
            .ToList();

        var profiles = ScenovaRuntime.ReadProfiles();
        foreach (var terminal in result)
        {
            var score = 20;
            var reasons = new List<string>();
            if (terminal.IsExistingScenovaTarget)
            {
                score += 45;
                reasons.Add("SCENOVA เดิม");
            }
            if (terminal.IsRunning)
            {
                score += 20;
                reasons.Add("กำลังเปิด");
            }
            if (!string.IsNullOrWhiteSpace(terminal.ExecutablePath))
            {
                score += 10;
                reasons.Add("พบ terminal64.exe");
            }
            if (profiles.Any(x =>
                string.Equals(x.TerminalDataPath, terminal.DataPath, StringComparison.OrdinalIgnoreCase)))
            {
                score += 5;
                reasons.Add("มี Profile");
            }
            terminal.MatchScore = Math.Min(100, score);
            terminal.MatchReason = reasons.Count > 0
                ? string.Join(" · ", reasons)
                : "พบจาก MetaQuotes Data Folder";
        }

        return result;
    }

    private static void AddCandidate(
        Dictionary<string, TerminalChoice> candidates,
        string dataPath,
        HashSet<string> existingPaths)
    {
        try
        {
            var normalized = Path.GetFullPath(dataPath);
            if (candidates.ContainsKey(normalized)) return;

            var originFile = Path.Combine(normalized, "origin.txt");
            var origin = File.Exists(originFile)
                ? File.ReadAllText(originFile).Trim('\0', ' ', '\r', '\n')
                : "";
            var exe = ScenovaRuntime.ResolveTerminalExecutable(normalized) ?? "";
            var broker = InferBroker(origin, exe);
            var isRunning = !string.IsNullOrWhiteSpace(exe) && IsProcessRunning(exe);
            var lastSeen = new DirectoryInfo(normalized).LastWriteTimeUtc;

            candidates[normalized] = new TerminalChoice
            {
                DataPath = normalized,
                OriginPath = origin,
                ExecutablePath = exe,
                BrokerHint = broker,
                IsRunning = isRunning,
                IsExistingScenovaTarget = existingPaths.Contains(normalized) ||
                    File.Exists(Path.Combine(normalized, "MQL5", "Experts", "SCENOVA", "FastBasketBot.ex5")),
                LastSeenAt = new DateTimeOffset(lastSeen, TimeSpan.Zero),
                Display = BuildDisplay(broker, origin, normalized, isRunning)
            };
        }
        catch { }
    }

    private static string BuildDisplay(string broker, string origin, string dataPath, bool running)
    {
        var name = !string.IsNullOrWhiteSpace(broker) ? broker : "MetaTrader 5";
        var location = !string.IsNullOrWhiteSpace(origin) ? origin : dataPath;
        return $"{name} · {(running ? "กำลังเปิด" : "พร้อมเปิด")} · {location}";
    }

    private static string InferBroker(string origin, string exe)
    {
        var source = !string.IsNullOrWhiteSpace(origin)
            ? origin
            : Path.GetDirectoryName(exe) ?? "";
        if (string.IsNullOrWhiteSpace(source)) return "MetaTrader 5";

        var dir = new DirectoryInfo(source);
        var name = dir.Name;
        if (string.Equals(name, "MetaTrader 5", StringComparison.OrdinalIgnoreCase) &&
            dir.Parent is not null)
            name = dir.Parent.Name;
        return string.IsNullOrWhiteSpace(name) ? "MetaTrader 5" : name;
    }

    private static bool IsProcessRunning(string exe)
    {
        try
        {
            var normalized = Path.GetFullPath(exe);
            foreach (var process in Process.GetProcessesByName("terminal64"))
            {
                using (process)
                {
                    try
                    {
                        var path = process.MainModule?.FileName;
                        if (!string.IsNullOrWhiteSpace(path) &&
                            string.Equals(Path.GetFullPath(path), normalized, StringComparison.OrdinalIgnoreCase))
                            return true;
                    }
                    catch { }
                }
            }
        }
        catch { }
        return false;
    }

    private static IEnumerable<string> SafeDirectories(string path)
    {
        try { return Directory.GetDirectories(path); }
        catch { return []; }
    }

    private static IEnumerable<string> RegistryTerminalExecutables()
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in new[] { Registry.CurrentUser, Registry.LocalMachine })
        {
            foreach (var sub in new[]
            {
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                @"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
            })
            {
                try
                {
                    using var key = root.OpenSubKey(sub);
                    if (key is null) continue;
                    foreach (var name in key.GetSubKeyNames())
                    {
                        using var app = key.OpenSubKey(name);
                        var display = Convert.ToString(app?.GetValue("DisplayName")) ?? "";
                        if (!display.Contains("MetaTrader 5", StringComparison.OrdinalIgnoreCase) &&
                            !display.Contains("MT5", StringComparison.OrdinalIgnoreCase))
                            continue;

                        var install = Convert.ToString(app?.GetValue("InstallLocation")) ?? "";
                        var icon = Convert.ToString(app?.GetValue("DisplayIcon")) ?? "";
                        var options = new[]
                        {
                            Path.Combine(install, "terminal64.exe"),
                            icon.Trim('"').Split(',')[0]
                        };
                        foreach (var option in options)
                            if (!string.IsNullOrWhiteSpace(option) && File.Exists(option))
                                found.Add(Path.GetFullPath(option));
                    }
                }
                catch { }
            }
        }
        return found;
    }

    private static string? FindDataPathForExecutable(string appDataRoot, string exe)
    {
        if (!Directory.Exists(appDataRoot)) return null;
        foreach (var dir in SafeDirectories(appDataRoot))
        {
            try
            {
                var resolved = ScenovaRuntime.ResolveTerminalExecutable(dir);
                if (!string.IsNullOrWhiteSpace(resolved) &&
                    string.Equals(Path.GetFullPath(resolved), Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase))
                    return dir;
            }
            catch { }
        }
        return null;
    }
}

internal static class PresetManager
{
    internal static readonly IReadOnlyDictionary<string, string> Defaults =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["InpMagic"] = "26090501",
            ["InpLot"] = "0.01",
            ["InpMaxPositions"] = "10",
            ["InpBasketTriggerMoney"] = "2",
            ["InpBasketTrailMoney"] = "0.5",
            ["InpMaxBasketLossMoney"] = "10",
            ["InpDailyLossMoney"] = "25",
            ["InpMaxSpreadPoints"] = "300",
            ["InpMinOrderIntervalMs"] = "300",
            ["InpMaxOrdersPerMinute"] = "120",
            ["InpEntryMode"] = "0",
            ["InpMomentumTicks"] = "20",
            ["InpMomentumEntryPoints"] = "8.0",
            ["InpStrongFlowPoints"] = "25.0",
            ["InpFlowTrailBoost"] = "0.60",
            ["InpPauseOnManualTrade"] = "true",
            ["InpHeartbeatSeconds"] = "3",
            ["InpMaxOfflineLeaseSeconds"] = "600",
            ["InpAdaptiveEngine"] = "true",
            ["InpRiskPerOrderPercent"] = "0.25",
            ["InpHardStopAtrMultiplier"] = "2.0",
            ["InpAtrPeriod"] = "14",
            ["InpConfidenceThreshold"] = "70",
            ["InpSessionStartHour"] = "0",
            ["InpSessionEndHour"] = "24",
            ["InpMaxAtrPoints"] = "0",
            ["InpCooldownMinutesAfterLoss"] = "5",
            ["InpMaxConsecutiveLosses"] = "3"
        };

    internal static void Migrate(
        string presetPath,
        string apiBase,
        string instanceId,
        string installToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(presetPath)!);

        var lines = File.Exists(presetPath)
            ? File.ReadAllLines(presetPath).ToList()
            : new List<string>();

        var map = Parse(lines);
        // Credentials always follow the authenticated installation.
        map["InpApiBase"] = apiBase.TrimEnd('/');
        map["InpInstanceId"] = instanceId;
        map["InpInstallToken"] = installToken;

        // Existing customer values always win. Only settings absent from an
        // older preset receive current defaults.
        foreach (var item in Defaults)
            if (!map.ContainsKey(item.Key))
                map[item.Key] = item.Value;

        var keysWritten = new HashSet<string>(StringComparer.Ordinal);
        var output = new List<string>();
        foreach (var line in lines)
        {
            var index = line.IndexOf('=');
            if (index <= 0)
            {
                output.Add(line);
                continue;
            }
            var key = line[..index].Trim();
            if (!map.TryGetValue(key, out var value) || keysWritten.Contains(key))
                continue;
            output.Add(key + "=" + value);
            keysWritten.Add(key);
        }

        foreach (var item in map)
            if (!keysWritten.Contains(item.Key))
                output.Add(item.Key + "=" + item.Value);

        File.WriteAllLines(presetPath, output, new UTF8Encoding(false));
    }

    private static Dictionary<string, string> Parse(IEnumerable<string> lines)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var line in lines)
        {
            var index = line.IndexOf('=');
            if (index <= 0) continue;
            var key = line[..index].Trim();
            if (string.IsNullOrWhiteSpace(key)) continue;
            result[key] = line[(index + 1)..];
        }
        return result;
    }
}

internal static class BackupManager
{
    internal static string CreateSnapshot(AgentConfig? config, string terminalDataPath)
    {
        Directory.CreateDirectory(ScenovaRuntime.BackupDir);
        var stamp = DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss-fff");
        var snapshot = Path.Combine(ScenovaRuntime.BackupDir, stamp);
        Directory.CreateDirectory(snapshot);

        CopyIfExists(
            Path.Combine(terminalDataPath, "MQL5", "Experts", "SCENOVA", "FastBasketBot.ex5"),
            Path.Combine(snapshot, "FastBasketBot.ex5"));
        CopyIfExists(
            Path.Combine(terminalDataPath, "MQL5", "Presets", "SCENOVA-FastBasketBot.set"),
            Path.Combine(snapshot, "SCENOVA-FastBasketBot.set"));
        CopyIfExists(ScenovaRuntime.ConfigPath, Path.Combine(snapshot, "config-v2.json"));
        CopyIfExists(ScenovaRuntime.ProfilesPath, Path.Combine(snapshot, "profiles-v3.json"));

        var metadata = new[]
        {
            "createdAt=" + DateTimeOffset.UtcNow.ToString("O"),
            "terminalDataPath=" + terminalDataPath,
            "instanceId=" + (config?.InstanceId ?? ""),
            "eaHash=" + (config?.EaHash ?? ""),
            "eaVersion=" + (config?.EaVersion ?? ""),
            "installerVersion=" + (config?.InstallerVersion ?? "")
        };
        File.WriteAllLines(Path.Combine(snapshot, "snapshot.info"), metadata, new UTF8Encoding(false));
        Prune();
        return snapshot;
    }

    internal static string? LatestSnapshot()
    {
        try
        {
            if (!Directory.Exists(ScenovaRuntime.BackupDir)) return null;
            return Directory.GetDirectories(ScenovaRuntime.BackupDir)
                .OrderByDescending(x => x, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();
        }
        catch
        {
            return null;
        }
    }

    internal static bool RestoreLatest(AgentConfig config)
    {
        var snapshot = LatestSnapshot();
        if (string.IsNullOrWhiteSpace(snapshot)) return false;

        var ea = Path.Combine(snapshot, "FastBasketBot.ex5");
        var set = Path.Combine(snapshot, "SCENOVA-FastBasketBot.set");
        if (!File.Exists(ea) && !File.Exists(set)) return false;

        if (File.Exists(ea))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(config.EaBinaryPath)!);
            File.Copy(ea, config.EaBinaryPath, true);
            config.EaHash = HashFile(config.EaBinaryPath);
        }

        if (File.Exists(set))
        {
            var target = Path.Combine(config.TerminalDataPath, "MQL5", "Presets", "SCENOVA-FastBasketBot.set");
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(set, target, true);
        }

        config.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");
        ScenovaRuntime.SaveOrUpdateProfile(config, config.IsPrimary);
        return true;
    }

    internal static string HashFile(string path)
    {
        if (!File.Exists(path)) return "";
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private static void CopyIfExists(string source, string target)
    {
        try
        {
            if (File.Exists(source))
                File.Copy(source, target, true);
        }
        catch { }
    }

    private static void Prune()
    {
        try
        {
            var all = Directory.GetDirectories(ScenovaRuntime.BackupDir)
                .OrderByDescending(x => x, StringComparer.OrdinalIgnoreCase)
                .ToList();
            foreach (var old in all.Skip(InstallerConstants.BackupRetention))
                Directory.Delete(old, true);
        }
        catch { }
    }
}

internal static class SignatureVerifier
{
    internal static (bool Signed, bool Trusted, string Publisher) CheckSelf()
    {
        try
        {
            var path = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
                return (false, false, "");

            var cert = X509Certificate.CreateFromSignedFile(path);
            if (cert is null) return (false, false, "");
            using var cert2 = new X509Certificate2(cert);
            using var chain = new X509Chain
            {
                ChainPolicy =
                {
                    RevocationMode = X509RevocationMode.Online,
                    RevocationFlag = X509RevocationFlag.ExcludeRoot,
                    VerificationFlags = X509VerificationFlags.NoFlag,
                    UrlRetrievalTimeout = TimeSpan.FromSeconds(5)
                }
            };
            var trusted = chain.Build(cert2);
            return (true, trusted, cert2.Subject);
        }
        catch
        {
            return (false, false, "");
        }
    }
}

internal static class SmartHealthEngine
{
    internal static async Task<InstallationAssessment> AssessAsync(TerminalChoice? terminal)
    {
        var checks = new List<HealthCheckResult>();

        checks.Add(new HealthCheckResult
        {
            Code = "WINDOWS_ARCH",
            Title = "Windows / Architecture",
            Detail = Environment.Is64BitOperatingSystem
                ? "Windows 64-bit พร้อมใช้งาน"
                : "ต้องใช้ Windows 64-bit",
            State = Environment.Is64BitOperatingSystem ? HealthState.Ready : HealthState.NeedAction,
            Weight = 12
        });

        checks.Add(new HealthCheckResult
        {
            Code = "MT5_DETECTED",
            Title = "Auto Detect MT5",
            Detail = terminal is null
                ? "ยังไม่พบ MT5 Data Folder"
                : $"พบ {terminal.BrokerHint} · Match {terminal.MatchScore}/100",
            State = terminal is null ? HealthState.NeedAction : HealthState.Ready,
            Weight = 16
        });

        var exeReady = terminal is not null &&
            !string.IsNullOrWhiteSpace(terminal.ExecutablePath) &&
            File.Exists(terminal.ExecutablePath);
        checks.Add(new HealthCheckResult
        {
            Code = "TERMINAL_MATCH",
            Title = "Smart Terminal Matching",
            Detail = exeReady
                ? "จับคู่ Data Folder กับ terminal64.exe สำเร็จ"
                : "ยังจับคู่ terminal64.exe ไม่สำเร็จ",
            State = exeReady ? HealthState.Ready : HealthState.AutoFix,
            Weight = 10
        });

        var writable = terminal is not null && CanWriteMt5(terminal.DataPath);
        checks.Add(new HealthCheckResult
        {
            Code = "MQL5_WRITE",
            Title = "MT5 File Access",
            Detail = writable
                ? "เขียน Experts / Presets ได้"
                : "ต้องซ่อมสิทธิ์หรือเลือก Terminal อื่น",
            State = writable ? HealthState.Ready : HealthState.NeedAction,
            Weight = 12
        });

        var diskOk = HasDiskSpace(terminal?.DataPath ?? ScenovaRuntime.BaseDir, 150 * 1024 * 1024L);
        checks.Add(new HealthCheckResult
        {
            Code = "DISK_SPACE",
            Title = "Safe Backup Space",
            Detail = diskOk ? "มีพื้นที่สำหรับ Backup / Staging" : "พื้นที่ว่างต่ำกว่า 150 MB",
            State = diskOk ? HealthState.Ready : HealthState.NeedAction,
            Weight = 8
        });

        var networkOk = await ScenovaClient.CanReachApiAsync();
        checks.Add(new HealthCheckResult
        {
            Code = "API_REACHABLE",
            Title = "SCENOVA API",
            Detail = networkOk ? "เชื่อมต่อ Server ได้" : "Server ยังไม่ตอบกลับ",
            State = networkOk ? HealthState.Ready : HealthState.NeedAction,
            Weight = 14
        });

        var agentPath = AgentRunner.AgentPath;
        var agentReady = File.Exists(agentPath);
        checks.Add(new HealthCheckResult
        {
            Code = "AGENT",
            Title = "Device Agent",
            Detail = agentReady
                ? "พบ Agent · " + FileVersionInfo.GetVersionInfo(agentPath).FileVersion
                : "ยังไม่ติดตั้ง Agent · ระบบติดตั้งให้อัตโนมัติ",
            State = agentReady ? HealthState.Ready : HealthState.AutoFix,
            Weight = 8
        });

        var signature = SignatureVerifier.CheckSelf();
        checks.Add(new HealthCheckResult
        {
            Code = "SIGNATURE",
            Title = "Signed Release Verification",
            Detail = signature.Signed
                ? (signature.Trusted ? "ลายเซ็น Windows เชื่อถือได้" : "พบลายเซ็น แต่ Chain ยังยืนยันไม่ได้")
                : "Build นี้ยังไม่มี Authenticode signature",
            State = signature.Signed && signature.Trusted
                ? HealthState.Ready
                : HealthState.Warning,
            Weight = 5
        });

        var existing = terminal is null
            ? null
            : ScenovaRuntime.ReadProfiles().FirstOrDefault(x =>
                string.Equals(x.TerminalDataPath, terminal.DataPath, StringComparison.OrdinalIgnoreCase));
        var eaExists = existing is not null && File.Exists(existing.EaBinaryPath);
        checks.Add(new HealthCheckResult
        {
            Code = "EXISTING_INSTALL",
            Title = "Existing Install Discovery",
            Detail = eaExists
                ? $"พบ SCENOVA เดิม · EA {existing!.EaVersion} · Installer {existing.InstallerVersion}"
                : "พร้อมติดตั้งใหม่",
            State = HealthState.Info,
            Weight = 5
        });

        var max = checks.Sum(x => Math.Max(1, x.Weight));
        var earned = checks.Sum(x =>
            x.State switch
            {
                HealthState.Ready => x.Weight,
                HealthState.Info => x.Weight,
                HealthState.Warning => (int)Math.Round(x.Weight * 0.7),
                HealthState.AutoFix => (int)Math.Round(x.Weight * 0.55),
                _ => 0
            });
        var score = max > 0 ? (int)Math.Round(earned * 100d / max) : 0;

        return new InstallationAssessment
        {
            Checks = checks,
            Score = Math.Clamp(score, 0, 100),
            Summary = score >= 90
                ? "พร้อมใช้งาน"
                : score >= 70
                    ? "พร้อมติดตั้งและมีรายการที่ระบบซ่อมได้"
                    : "มีรายการที่ต้องแก้ก่อนติดตั้ง"
        };
    }

    internal static UpdatePlan BuildPlan(
        TerminalChoice terminal,
        AgentConfig? existing,
        AgentHeartbeatResponse? heartbeat)
    {
        var agentExists = File.Exists(AgentRunner.AgentPath);
        var agentVersion = agentExists
            ? FileVersionInfo.GetVersionInfo(AgentRunner.AgentPath).FileVersion ?? ""
            : "";
        var localHash = existing is not null && File.Exists(existing.EaBinaryPath)
            ? BackupManager.HashFile(existing.EaBinaryPath)
            : "";

        var plan = new UpdatePlan
        {
            InstallAgent = !agentExists,
            UpdateAgent = agentExists &&
                !VersionEquals(agentVersion, heartbeat?.AgentVersionRequired ?? InstallerConstants.AgentVersion),
            InstallEa = existing is null || !File.Exists(existing.EaBinaryPath),
            UpdateEa = existing is not null &&
                !string.IsNullOrWhiteSpace(heartbeat?.ArtifactHash) &&
                !string.Equals(localHash, heartbeat.ArtifactHash, StringComparison.OrdinalIgnoreCase),
            RepairPreset = existing is not null &&
                !File.Exists(Path.Combine(
                    terminal.DataPath, "MQL5", "Presets", "SCENOVA-FastBasketBot.set")),
            WaitForSafeRestart = heartbeat is not null &&
                !heartbeat.SafeToRestart &&
                (!string.IsNullOrWhiteSpace(heartbeat.ArtifactHash) &&
                 !string.Equals(localHash, heartbeat.ArtifactHash, StringComparison.OrdinalIgnoreCase))
        };

        plan.VerifyOnly = !plan.InstallAgent && !plan.UpdateAgent &&
                          !plan.InstallEa && !plan.UpdateEa && !plan.RepairPreset;
        plan.Summary = plan.WaitForSafeRestart
            ? "อัปเดต EA รอ Safe Stop · ส่วนอื่นซ่อมได้ทันที"
            : plan.VerifyOnly
                ? "ทุก Component เป็นเวอร์ชันล่าสุด · ตรวจสอบเท่านั้น"
                : "อัปเดตเฉพาะ Component ที่จำเป็น";
        return plan;
    }

    internal static bool CanWriteMt5(string dataPath)
    {
        try
        {
            var folder = Path.Combine(dataPath, "MQL5", "Experts", "SCENOVA");
            Directory.CreateDirectory(folder);
            var probe = Path.Combine(folder, ".scenova-write-test-" + Guid.NewGuid().ToString("N"));
            File.WriteAllText(probe, "ok", Encoding.ASCII);
            File.Delete(probe);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool HasDiskSpace(string path, long required)
    {
        try
        {
            var full = Path.GetFullPath(path);
            var root = Path.GetPathRoot(full);
            if (string.IsNullOrWhiteSpace(root)) return true;
            var drive = new DriveInfo(root);
            return drive.AvailableFreeSpace >= required;
        }
        catch
        {
            return true;
        }
    }

    private static bool VersionEquals(string a, string b)
    {
        static string Normalize(string value) =>
            string.Join(".", value.Split('.').Take(3));
        return string.Equals(Normalize(a), Normalize(b), StringComparison.OrdinalIgnoreCase);
    }
}

internal static class InstallerRepair
{
    internal static async Task<List<string>> RepairAsync(TerminalChoice terminal)
    {
        var actions = new List<string>();

        Directory.CreateDirectory(ScenovaRuntime.BaseDir);
        Directory.CreateDirectory(ScenovaRuntime.StagingDir);
        Directory.CreateDirectory(Path.Combine(terminal.DataPath, "MQL5", "Experts", "SCENOVA"));
        Directory.CreateDirectory(Path.Combine(terminal.DataPath, "MQL5", "Presets"));
        actions.Add("ตรวจและสร้างโฟลเดอร์ SCENOVA");

        var profile = ScenovaRuntime.ReadProfiles().FirstOrDefault(x =>
            string.Equals(x.TerminalDataPath, terminal.DataPath, StringComparison.OrdinalIgnoreCase));

        if (profile is not null)
        {
            var token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected);
            if (!string.IsNullOrWhiteSpace(token))
            {
                PresetManager.Migrate(
                    Path.Combine(terminal.DataPath, "MQL5", "Presets", "SCENOVA-FastBasketBot.set"),
                    profile.ApiBase,
                    profile.InstanceId,
                    token);
                actions.Add("Migrate preset โดยรักษาค่าลูกค้าเดิม");
            }
        }

        AgentRunner.InstallAndStart();
        actions.Add("ตรวจ/ซ่อม Device Agent และ Startup");

        if (profile is not null && !AgentRunner.IsMt5Running(profile))
        {
            AgentRunner.EnsureMt5RunningWithEa(profile, forceReload: false);
            actions.Add("เปิด MT5 ที่จับคู่ไว้");
        }

        await InstallerDiagnostics.LogAsync("REPAIR", string.Join("; ", actions));
        return actions;
    }

    internal static void CleanUninstall(TerminalChoice terminal)
    {
        var expertDir = Path.Combine(terminal.DataPath, "MQL5", "Experts", "SCENOVA");
        var preset = Path.Combine(terminal.DataPath, "MQL5", "Presets", "SCENOVA-FastBasketBot.set");

        try { if (Directory.Exists(expertDir)) Directory.Delete(expertDir, true); } catch { }
        try { if (File.Exists(preset)) File.Delete(preset); } catch { }

        // Do not touch MT5 itself, other Experts, Indicators, templates or any
        // broker files. The shared Agent remains if another SCENOVA profile exists.
        var remaining = ScenovaRuntime.ReadProfiles()
            .Where(x => !string.Equals(x.TerminalDataPath, terminal.DataPath, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (remaining.Count == 0)
            AgentRunner.RemoveStartupRegistration();
    }
}
