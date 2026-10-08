using System.Diagnostics;
using System.Text;

namespace Scenova.CloudSetup;

internal static class Mt5TemplateManager
{
    public static bool IsReady(string root)
    {
        var target = Path.Combine(root, "template");
        return
            File.Exists(Path.Combine(target, "cloud-template.ready")) &&
            File.Exists(Path.Combine(target, "terminal64.exe")) &&
            File.Exists(Path.Combine(target, "MQL5", "Experts", "FastBasketBot.ex5")) &&
            File.Exists(Path.Combine(target, "MQL5", "Experts", "ScenovaSymbolProbe.ex5"));
    }

    public static void Prepare(string root, string apiBase, string? explicitSource)
    {
        var instances = Path.Combine(root, "instances");
        var target = Path.Combine(root, "template");
        var readyMarker = Path.Combine(target, "cloud-template.ready");

        var currentTerminal = Path.Combine(target, "terminal64.exe");
        var currentEa = Path.Combine(
            target,
            "MQL5",
            "Experts",
            "FastBasketBot.ex5");
        var currentProbe = Path.Combine(
            target,
            "MQL5",
            "Experts",
            "ScenovaSymbolProbe.ex5");

        if (IsReady(root))
        {
            PayloadInstaller.ExtractEa(currentEa);
            PayloadInstaller.ExtractSymbolProbe(currentProbe);
            Console.WriteLine("MT5 Template พร้อมอยู่แล้ว · รีเฟรช EA และ Symbol Probe จาก Setup รุ่นล่าสุดแล้ว");
            return;
        }

        // Upgrade an already verified production template in place when only
        // a new SCENOVA payload is missing. Never force a manual MT5 template
        // rebuild merely because a new helper EX5 was introduced.
        if (File.Exists(readyMarker) &&
            File.Exists(currentTerminal) &&
            File.Exists(currentEa))
        {
            PayloadInstaller.ExtractEa(currentEa);
            PayloadInstaller.ExtractSymbolProbe(currentProbe);
            Console.WriteLine("MT5 Template เดิมผ่านการยืนยันแล้ว · เพิ่ม/รีเฟรช Symbol Probe โดยไม่แตะบัญชีลูกค้า");
            return;
        }

        if (File.Exists(readyMarker))
        {
            try { File.Delete(readyMarker); } catch { }
        }

        if (Directory.Exists(instances) &&
            Directory.EnumerateDirectories(instances).Any())
            throw new InvalidOperationException(
                "มี Cloud MT5 instance อยู่แล้ว จึงไม่แทนที่ Template อัตโนมัติ");

        var terminal = ResolveTerminal(explicitSource);
        var sourceDir = Path.GetDirectoryName(terminal)
            ?? throw new InvalidOperationException("ไม่พบโฟลเดอร์ MT5 ต้นทาง");

        var staging = target + ".staging";
        if (Directory.Exists(staging)) Directory.Delete(staging, true);
        Directory.CreateDirectory(staging);

        Console.WriteLine($"กำลังสร้าง MT5 Template จาก {sourceDir}");
        CopyDirectory(sourceDir, staging);
        SanitizeTemplate(staging);

        var stagedTerminal = Path.Combine(staging, "terminal64.exe");
        if (!File.Exists(stagedTerminal))
            throw new InvalidOperationException("Template ไม่มี terminal64.exe");

        var eaTarget = Path.Combine(staging, "MQL5", "Experts", "FastBasketBot.ex5");
        PayloadInstaller.ExtractEa(eaTarget);
        PayloadInstaller.ExtractSymbolProbe(Path.Combine(
            staging,
            "MQL5",
            "Experts",
            "ScenovaSymbolProbe.ex5"));

        File.WriteAllText(
            Path.Combine(staging, "cloud-template.prepared"),
            "Prepared " + DateTimeOffset.UtcNow.ToString("O"),
            new UTF8Encoding(false));

        if (Directory.Exists(target)) Directory.Delete(target, true);
        Directory.Move(staging, target);

        Console.WriteLine();
        Console.WriteLine("MT5 Template ถูกเตรียมอัตโนมัติแล้ว");
        Console.WriteLine("MetaTrader 5 กำหนดให้ผู้ใช้เพิ่ม WebRequest URL จาก Tools > Options > Expert Advisors ด้วยตนเอง");
        var allowedOrigin = ApiOrigin(apiBase);
        Console.WriteLine($"เพิ่ม URL นี้: {allowedOrigin}");
        Console.WriteLine($"API path ที่ EA ใช้: {apiBase.TrimEnd('/')}");
        Console.WriteLine("เปิด Allow WebRequest for listed URL และเปิด Algo Trading จากนั้นปิด MT5 Template");
        Console.WriteLine();

        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = Path.Combine(target, "terminal64.exe"),
            Arguments = "/portable",
            WorkingDirectory = target,
            UseShellExecute = true
        });

        Console.Write("เมื่อทำเสร็จและปิด MT5 แล้ว พิมพ์ YES เพื่อยืนยัน Template: ");
        var confirmed = Console.ReadLine()?.Trim();
        if (!string.Equals(confirmed, "YES", StringComparison.Ordinal))
            throw new InvalidOperationException(
                "Template ยังไม่ถูกยืนยัน ระบบจะไม่เปิดรับ Cloud instance จนกว่าจะรัน Setup ใหม่");

        if (IsTemplateTerminalRunning(Path.Combine(target, "terminal64.exe")))
            throw new InvalidOperationException("กรุณาปิด MT5 Template ก่อนยืนยัน");

        File.WriteAllText(
            Path.Combine(target, "cloud-template.ready"),
            "Verified by operator " + DateTimeOffset.UtcNow.ToString("O"),
            new UTF8Encoding(false));

        Console.WriteLine("✅ MT5 Template พร้อมใช้งาน");
    }

    private static string ApiOrigin(string apiBase)
    {
        if (!Uri.TryCreate(apiBase, UriKind.Absolute, out var uri))
            return apiBase.TrimEnd('/');

        return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
    }

    private static string ResolveTerminal(string? explicitSource)
    {
        if (!string.IsNullOrWhiteSpace(explicitSource))
        {
            var candidate = NormalizeTerminal(explicitSource);
            if (candidate is not null) return candidate;
            throw new InvalidOperationException("--mt5-source ไม่พบ terminal64.exe");
        }

        var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var terminalRoot = Path.Combine(appData, "MetaQuotes", "Terminal");
        if (Directory.Exists(terminalRoot))
        {
            foreach (var origin in Directory.EnumerateFiles(
                         terminalRoot,
                         "origin.txt",
                         SearchOption.AllDirectories))
            {
                try
                {
                    var raw = File.ReadAllText(origin).Trim('\0', ' ', '\r', '\n', '\t');
                    var normalized = NormalizeTerminal(raw);
                    if (normalized is not null) candidates.Add(normalized);
                }
                catch { }
            }
        }

        AddKnownCandidate(
            candidates,
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "MetaTrader 5",
                "terminal64.exe"));

        AddKnownCandidate(
            candidates,
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                "MetaTrader 5",
                "terminal64.exe"));

        var list = candidates
            .Where(path => !path.StartsWith(@"C:\BotTrading\", StringComparison.OrdinalIgnoreCase))
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (list.Count == 0)
        {
            Console.Write("ไม่พบ MT5 อัตโนมัติ กรุณาใส่ path terminal64.exe: ");
            var manual = Console.ReadLine()?.Trim() ?? "";
            var normalized = NormalizeTerminal(manual);
            if (normalized is not null) return normalized;

            throw new InvalidOperationException(
                "ไม่พบ MetaTrader 5 กรุณาติดตั้งและเปิด MT5 ของ Broker อย่างน้อย 1 ครั้ง แล้วรัน Setup ใหม่");
        }

        if (list.Count == 1) return list[0];

        Console.WriteLine("พบ MT5 หลายตัว:");
        for (var i = 0; i < list.Count; i++)
            Console.WriteLine($" [{i + 1}] {list[i]}");

        Console.Write("เลือกหมายเลข MT5 ที่จะใช้เป็น Cloud Template: ");
        if (!int.TryParse(Console.ReadLine(), out var selected) ||
            selected < 1 ||
            selected > list.Count)
            throw new InvalidOperationException("ไม่ได้เลือก MT5 ที่ถูกต้อง");

        return list[selected - 1];
    }

    private static void AddKnownCandidate(HashSet<string> candidates, string path)
    {
        var normalized = NormalizeTerminal(path);
        if (normalized is not null) candidates.Add(normalized);
    }

    private static string? NormalizeTerminal(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;

        var path = raw.Trim().Trim('"');
        if (Directory.Exists(path))
            path = Path.Combine(path, "terminal64.exe");

        if (!File.Exists(path) ||
            !string.Equals(Path.GetFileName(path), "terminal64.exe", StringComparison.OrdinalIgnoreCase))
            return null;

        return Path.GetFullPath(path);
    }

    private static void CopyDirectory(string source, string destination)
    {
        foreach (var directory in Directory.EnumerateDirectories(source, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(source, directory);
            Directory.CreateDirectory(Path.Combine(destination, relative));
        }

        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(source, file);
            var target = Path.Combine(destination, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target, true);
        }
    }

    private static void SanitizeTemplate(string root)
    {
        var deleteFiles = new[]
        {
            Path.Combine(root, "config", "accounts.dat"),
            Path.Combine(root, "cloud-start.ini"),
            Path.Combine(root, "cloud-provisioned")
        };

        foreach (var file in deleteFiles)
        {
            try { if (File.Exists(file)) File.Delete(file); } catch { }
        }

        var deleteDirectories = new[]
        {
            Path.Combine(root, "logs"),
            Path.Combine(root, "MQL5", "Logs"),
            Path.Combine(root, "MQL5", "Files"),
            Path.Combine(root, "Tester", "logs")
        };

        foreach (var directory in deleteDirectories)
        {
            try { if (Directory.Exists(directory)) Directory.Delete(directory, true); } catch { }
        }

        Directory.CreateDirectory(Path.Combine(root, "MQL5", "Experts"));
        Directory.CreateDirectory(Path.Combine(root, "MQL5", "Presets"));
    }

    private static bool IsTemplateTerminalRunning(string terminalPath)
    {
        foreach (var process in Process.GetProcessesByName("terminal64"))
        {
            using (process)
            {
                try
                {
                    if (string.Equals(
                        process.MainModule?.FileName,
                        terminalPath,
                        StringComparison.OrdinalIgnoreCase))
                        return true;
                }
                catch { }
            }
        }

        return false;
    }
}
