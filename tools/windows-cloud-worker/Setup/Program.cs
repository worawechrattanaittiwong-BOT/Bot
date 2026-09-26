using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Scenova.CloudSetup;

internal static class Program
{
    internal const string SetupVersion = "0.4.0";
    private const string DefaultApiBase = "https://snvea-bot.online/backend";
    private const string RootPath = @"C:\BotTrading";
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SCENOVA-CLOUD-WORKER-V1");

    private sealed record EnrollmentResponse(string RunnerId, string WorkerKey);

    private sealed class ExistingConfig
    {
        public string RunnerId { get; set; } = "";
        public string ApiBase { get; set; } = "";
        public string WorkerKeyProtected { get; set; } = "";
    }

    public static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "SCENOVA Cloud Server Setup";

        if (args.Any(arg =>
                string.Equals(arg, "--setup-self-test", StringComparison.OrdinalIgnoreCase)))
            return SetupSelfTest.Run();

        try
        {
            if (!OperatingSystem.IsWindows())
                throw new InvalidOperationException("SCENOVA Cloud Setup รองรับ Windows Server เท่านั้น");

            EnsureAdministrator();
            PrepareDirectories();

            var options = ParseArgs(args);
            var configPath = Path.Combine(RootPath, "worker", "config.json");
            var existing = TryLoadExistingConfig(configPath);

            var runnerId = GetOption(options, "runner")
                           ?? existing?.RunnerId
                           ?? Prompt("Server ID / Runner ID");

            var apiBase = GetOption(options, "api")
                          ?? existing?.ApiBase
                          ?? Prompt("API URL", DefaultApiBase);

            ValidateApiAndRunner(apiBase, runnerId);

            if (existing is null ||
                !string.Equals(existing.RunnerId, runnerId, StringComparison.OrdinalIgnoreCase) ||
                string.IsNullOrWhiteSpace(existing.WorkerKeyProtected))
            {
                var token = GetOption(options, "token") ?? PromptSecret("Enrollment Token");
                if (token.Length is < 32 or > 200)
                    throw new InvalidOperationException("Enrollment Token ไม่ถูกต้อง");

                Console.WriteLine();
                Console.WriteLine("กำลังลงทะเบียน Server กับ SCENOVA...");

                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
                var endpoint = apiBase.TrimEnd('/') + "/api/server-enrollment/activate";
                using var response = await http.PostAsJsonAsync(endpoint, new
                {
                    runnerId,
                    enrollmentToken = token,
                    hostname = Environment.MachineName
                });

                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    throw new InvalidOperationException(
                        $"Server enrollment ไม่สำเร็จ ({(int)response.StatusCode}). " +
                        SafeServerMessage(body));
                }

                var enrolled = await response.Content.ReadFromJsonAsync<EnrollmentResponse>(
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (enrolled is null ||
                    string.IsNullOrWhiteSpace(enrolled.RunnerId) ||
                    string.IsNullOrWhiteSpace(enrolled.WorkerKey))
                    throw new InvalidOperationException("Server ตอบข้อมูลลงทะเบียนไม่ครบ");

                SaveConfig(configPath, enrolled.RunnerId, apiBase, enrolled.WorkerKey);
                runnerId = enrolled.RunnerId;
                Console.WriteLine("✅ Server Enrollment สำเร็จ");
            }
            else
            {
                Console.WriteLine("พบ Server Enrollment เดิมแล้ว กำลังตรวจและ Repair โดยไม่ใช้ Token ซ้ำ");
            }

            StampSetupVersion(configPath);

            Mt5TemplateManager.Prepare(
                RootPath,
                apiBase,
                GetOption(options, "mt5-source"));

            Console.WriteLine();
            Console.WriteLine("กำลังติดตั้ง/Repair Cloud Worker, Auto Start และ Windows Permission...");

            var report = await RepairManager.RepairAsync(
                RootPath,
                runnerId,
                SetupVersion,
                apiBase,
                configPath);

            Console.WriteLine();
            foreach (var check in report.Checks)
            {
                Console.WriteLine(
                    $"{(check.Passed ? "✅" : "❌")} {check.Name}: {check.Detail}");
            }

            if (!report.Ready)
                throw new InvalidOperationException(
                    "Server Setup ยังไม่ผ่าน Health Check กรุณาแก้รายการที่ขึ้น ❌ แล้วเปิด Setup ซ้ำ");

            Console.WriteLine();
            Console.WriteLine("✅ SCENOVA Cloud Server READY");
            Console.WriteLine($"Server: {runnerId}");
            Console.WriteLine($"Setup: v{SetupVersion}");
            Console.WriteLine($"Root: {RootPath}");
            Console.WriteLine($"Auto Start: {WorkerStartupManager.TaskName(runnerId)}");
            Console.WriteLine("Enrollment Token ไม่ถูกบันทึกไว้ในเครื่อง");
            Console.WriteLine("สามารถตัด Remote Desktop ได้ แต่บัญชี Windows สำหรับ MT5 ต้องคง session ไว้");
            Console.WriteLine();
            Console.WriteLine("กด Enter เพื่อปิด Setup");
            Console.ReadLine();
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("❌ ติดตั้ง/Repair ไม่สำเร็จ");
            Console.Error.WriteLine(ex.Message);
            Console.Error.WriteLine();
            Console.Error.WriteLine("กด Enter เพื่อปิด");
            Console.ReadLine();
            return 1;
        }
    }

    private static void SaveConfig(string path, string runnerId, string apiBase, string workerKey)
    {
        var protectedKey = Convert.ToBase64String(
            ProtectedData.Protect(
                Encoding.UTF8.GetBytes(workerKey),
                Entropy,
                DataProtectionScope.LocalMachine));

        var config = new
        {
            RunnerId = runnerId,
            ApiBase = apiBase.TrimEnd('/'),
            Root = RootPath,
            WorkerKeyProtected = protectedKey,
            KeyProtection = "DPAPI_LOCAL_MACHINE",
            SetupVersion,
            EnrolledAtUtc = DateTimeOffset.UtcNow.ToString("O")
        };

        var tempPath = path + ".tmp";
        File.WriteAllText(
            tempPath,
            JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }),
            new UTF8Encoding(false));
        File.Move(tempPath, path, true);
    }

    private static void StampSetupVersion(string path)
    {
        var node = JsonNode.Parse(File.ReadAllText(path)) as JsonObject
            ?? throw new InvalidOperationException("Cloud Worker config ไม่ถูกต้อง");

        node["SetupVersion"] = SetupVersion;

        var tempPath = path + ".setup";
        File.WriteAllText(
            tempPath,
            node.ToJsonString(new JsonSerializerOptions { WriteIndented = true }),
            new UTF8Encoding(false));
        File.Move(tempPath, path, true);
    }

    private static ExistingConfig? TryLoadExistingConfig(string path)
    {
        if (!File.Exists(path)) return null;

        try
        {
            return JsonSerializer.Deserialize<ExistingConfig>(
                File.ReadAllText(path),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch
        {
            return null;
        }
    }

    private static void EnsureAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        if (!principal.IsInRole(WindowsBuiltInRole.Administrator))
            throw new InvalidOperationException("กรุณาเปิด SCENOVA Cloud Setup ด้วยสิทธิ์ Administrator");
    }

    private static void PrepareDirectories()
    {
        foreach (var path in new[]
        {
            RootPath,
            Path.Combine(RootPath, "worker"),
            Path.Combine(RootPath, "template"),
            Path.Combine(RootPath, "instances"),
            Path.Combine(RootPath, "packages"),
            Path.Combine(RootPath, "backups"),
            Path.Combine(RootPath, "logs")
        })
        {
            Directory.CreateDirectory(path);
        }
    }

    private static Dictionary<string, string> ParseArgs(string[] args)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < args.Length; i++)
        {
            var current = args[i];
            if (!current.StartsWith("--", StringComparison.Ordinal) || i + 1 >= args.Length)
                continue;

            result[current[2..]] = args[++i];
        }

        return result;
    }

    private static string? GetOption(Dictionary<string, string> options, string key) =>
        options.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value.Trim()
            : null;

    private static string Prompt(string label, string? defaultValue = null)
    {
        Console.Write(defaultValue is null ? $"{label}: " : $"{label} [{defaultValue}]: ");
        var value = Console.ReadLine()?.Trim();
        return string.IsNullOrWhiteSpace(value) ? defaultValue ?? string.Empty : value;
    }

    private static string PromptSecret(string label)
    {
        Console.Write($"{label}: ");
        var buffer = new StringBuilder();

        while (Console.ReadKey(intercept: true) is var key && key.Key != ConsoleKey.Enter)
        {
            if (key.Key == ConsoleKey.Backspace)
            {
                if (buffer.Length > 0) buffer.Length--;
                continue;
            }

            if (!char.IsControl(key.KeyChar)) buffer.Append(key.KeyChar);
        }

        Console.WriteLine();
        return buffer.ToString().Trim();
    }

    private static void ValidateApiAndRunner(string apiBase, string runnerId)
    {
        if (!Uri.TryCreate(apiBase, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrWhiteSpace(uri.UserInfo))
            throw new InvalidOperationException("API URL ต้องเป็น HTTPS ที่ถูกต้อง");

        if (!Regex.IsMatch(runnerId, "^[a-zA-Z0-9_-]{3,80}$"))
            throw new InvalidOperationException("Server ID ไม่ถูกต้อง");
    }

    private static string SafeServerMessage(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return "กรุณาสร้าง Enrollment ใหม่จากหน้า Admin";

        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("message", out var message) &&
                message.ValueKind == JsonValueKind.String)
                return message.GetString() ?? "กรุณาลองใหม่";
        }
        catch { }

        return "กรุณาสร้าง Enrollment ใหม่จากหน้า Admin";
    }
}
