using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Scenova.CloudSetup;

internal static class Program
{
    private const string SetupVersion = "0.1.0";
    private const string DefaultApiBase = "https://snvea-bot.online/backend";
    private const string RootPath = @"C:\BotTrading";
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SCENOVA-CLOUD-WORKER-V1");

    private sealed record EnrollmentResponse(string RunnerId, string WorkerKey);

    public static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.Title = "SCENOVA Cloud Server Setup";

        try
        {
            if (!OperatingSystem.IsWindows())
                throw new InvalidOperationException("SCENOVA Cloud Setup รองรับ Windows Server เท่านั้น");

            EnsureAdministrator();

            var options = ParseArgs(args);
            var apiBase = GetOption(options, "api") ?? Prompt("API URL", DefaultApiBase);
            var runnerId = GetOption(options, "runner") ?? Prompt("Server ID / Runner ID");
            var token = GetOption(options, "token") ?? PromptSecret("Enrollment Token");

            ValidateInput(apiBase, runnerId, token);

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

            PrepareDirectories();

            var protectedKey = Convert.ToBase64String(
                ProtectedData.Protect(
                    Encoding.UTF8.GetBytes(enrolled.WorkerKey),
                    Entropy,
                    DataProtectionScope.LocalMachine));

            var config = new
            {
                RunnerId = enrolled.RunnerId,
                ApiBase = apiBase.TrimEnd('/'),
                Root = RootPath,
                WorkerKeyProtected = protectedKey,
                KeyProtection = "DPAPI_LOCAL_MACHINE",
                SetupVersion,
                EnrolledAtUtc = DateTimeOffset.UtcNow.ToString("O")
            };

            var workerDir = Path.Combine(RootPath, "worker");
            var configPath = Path.Combine(workerDir, "config.json");
            var tempPath = configPath + ".tmp";

            await File.WriteAllTextAsync(
                tempPath,
                JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }),
                new UTF8Encoding(false));

            File.Move(tempPath, configPath, true);

            Console.WriteLine();
            Console.WriteLine("✅ Server Enrollment สำเร็จ");
            Console.WriteLine($"Server: {enrolled.RunnerId}");
            Console.WriteLine($"Config: {configPath}");
            Console.WriteLine("Enrollment Token ไม่ถูกบันทึกไว้ในเครื่อง");
            Console.WriteLine();
            Console.WriteLine("Phase 3 จะติดตั้ง SCENOVA Cloud Worker จาก config นี้");
            Console.WriteLine("กด Enter เพื่อปิด");
            Console.ReadLine();
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("❌ ติดตั้งไม่สำเร็จ");
            Console.Error.WriteLine(ex.Message);
            Console.Error.WriteLine();
            Console.Error.WriteLine("กด Enter เพื่อปิด");
            Console.ReadLine();
            return 1;
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

            var key = current[2..];
            var value = args[++i];
            result[key] = value;
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
        ConsoleKeyInfo key;

        while ((key = Console.ReadKey(intercept: true)).Key != ConsoleKey.Enter)
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

    private static void ValidateInput(string apiBase, string runnerId, string token)
    {
        if (!Uri.TryCreate(apiBase, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrWhiteSpace(uri.UserInfo))
            throw new InvalidOperationException("API URL ต้องเป็น HTTPS ที่ถูกต้อง");

        if (!Regex.IsMatch(runnerId, "^[a-zA-Z0-9_-]{3,80}$"))
            throw new InvalidOperationException("Server ID ไม่ถูกต้อง");

        if (token.Length is < 32 or > 200)
            throw new InvalidOperationException("Enrollment Token ไม่ถูกต้อง");
    }

    private static string SafeServerMessage(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return "กรุณาสร้าง Enrollment ใหม่จากหน้า Admin";
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("message", out var message))
            {
                return message.ValueKind == JsonValueKind.String
                    ? message.GetString() ?? "กรุณาลองใหม่"
                    : "กรุณาลองใหม่";
            }
        }
        catch
        {
            // Do not echo raw server bodies because they can contain diagnostics.
        }

        return "กรุณาสร้าง Enrollment ใหม่จากหน้า Admin";
    }
}
