using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ScenovaInstaller;

internal sealed class InstallerForm : Form
{
    private const string InstallerVersion = "2.0.6";
    private const string LastUpdated = "7 กันยายน 2026";
    private readonly ComboBox _terminal = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 520 };
    private readonly Button _install = new() { Text = "ติดตั้ง SCENOVA", Width = 180, Height = 42 };
    private readonly Label _status = new() { AutoSize = false, Width = 620, Height = 90, Text = "พร้อมติดตั้ง" };
    private readonly ProgressBar _progress = new() { Width = 620, Height = 18, Style = ProgressBarStyle.Marquee, Visible = false };
    private readonly List<TerminalChoice> _terminals = FindTerminals();

    internal InstallerForm()
    {
        Text = "SCENOVA MT5 BOT EA v" + InstallerVersion;
        Width = 700;
        Height = 390;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;

        var title = new Label
        {
            Text = "SCENOVA MT5 BOT EA v" + InstallerVersion,
            Font = new Font(Font.FontFamily, 18, FontStyle.Bold),
            AutoSize = true
        };
        var versionInfo = new Label
        {
            Text = "เวอร์ชัน " + InstallerVersion + " · อัปเดตล่าสุด " + LastUpdated,
            AutoSize = true,
            Font = new Font(Font.FontFamily, 9, FontStyle.Bold)
        };
        var subtitle = new Label
        {
            Text = "ติดตั้งจากเว็บไซต์ SCENOVA เท่านั้น · ไม่ต้องใช้ CMD หรือ PowerShell",
            AutoSize = true
        };
        var terminalLabel = new Label
        {
            Text = "MetaTrader 5 ที่ต้องการติดตั้ง",
            AutoSize = true
        };
        var note = new Label
        {
            Text = "ระบบจะลง EA, preset และตัวอัปเดต SCENOVA ให้อัตโนมัติ",
            AutoSize = true
        };

        foreach (var terminal in _terminals) _terminal.Items.Add(terminal);
        if (_terminal.Items.Count > 0) _terminal.SelectedIndex = 0;

        _install.Click += async (_, _) => await InstallAsync();

        var panel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Padding = new Padding(28),
            AutoScroll = true
        };
        panel.Controls.Add(title);
        panel.Controls.Add(versionInfo);
        panel.Controls.Add(subtitle);
        panel.Controls.Add(new Label { Height = 12 });
        panel.Controls.Add(terminalLabel);
        panel.Controls.Add(_terminal);
        panel.Controls.Add(note);
        panel.Controls.Add(new Label { Height = 8 });
        panel.Controls.Add(_install);
        panel.Controls.Add(_progress);
        panel.Controls.Add(_status);
        Controls.Add(panel);

        if (_terminals.Count == 0)
        {
            _install.Enabled = false;
            _status.Text = "ไม่พบ MetaTrader 5 กรุณาติดตั้งและเปิด MT5 อย่างน้อย 1 ครั้งก่อน";
        }
        if (string.IsNullOrEmpty(ScenovaRuntime.ReadEnrollmentCode()))
        {
            _install.Enabled = false;
            _status.Text = "ไฟล์นี้ไม่มีรหัสติดตั้ง กรุณา Login SCENOVA แล้วดาวน์โหลดจากหน้าเว็บไซต์อีกครั้ง";
        }
    }

    private async Task InstallAsync()
    {
        if (_terminal.SelectedItem is not TerminalChoice terminal) return;
        var code = ScenovaRuntime.ReadEnrollmentCode();
        if (string.IsNullOrEmpty(code)) return;

        _install.Enabled = false;
        _progress.Visible = true;

        try
        {
            _status.Text = "กำลังเชื่อม Slot กับ SCENOVA...";
            Directory.CreateDirectory(ScenovaRuntime.BaseDir);

            var existing = ScenovaRuntime.ReadConfig();
            var devicePublicId = existing?.DevicePublicId;
            var deviceSecret = existing is null
                ? null
                : ScenovaRuntime.TryUnprotect(existing.DeviceSecretProtected);

            if (string.IsNullOrWhiteSpace(devicePublicId))
                devicePublicId = Guid.NewGuid().ToString("N");
            if (string.IsNullOrWhiteSpace(deviceSecret))
                deviceSecret = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

            var (legacyInstanceId, legacyInstallToken) = ScenovaRuntime.ReadLegacyCredentials();

            using var http = ScenovaClient.NewHttpClient();
            var enroll = await ScenovaClient.PostJsonAsync<EnrollResponse>(
                http,
                ScenovaRuntime.ProductionApiBase + "/api/installer/enroll",
                new
                {
                    code,
                    devicePublicId,
                    deviceSecret,
                    hostname = Environment.MachineName,
                    terminalPath = terminal.DataPath,
                    legacyInstanceId,
                    legacyInstallToken
                });

            if (string.IsNullOrWhiteSpace(enroll.InstanceId) ||
                string.IsNullOrWhiteSpace(enroll.InstallToken))
                throw new InvalidOperationException("SCENOVA server did not return installation credentials");

            _status.Text = "กำลังติดตั้ง FastBasketBot.ex5...";
            var expertsDir = Path.Combine(terminal.DataPath, "MQL5", "Experts", "SCENOVA");
            var presetsDir = Path.Combine(terminal.DataPath, "MQL5", "Presets");
            Directory.CreateDirectory(expertsDir);
            Directory.CreateDirectory(presetsDir);

            var eaPath = Path.Combine(expertsDir, "FastBasketBot.ex5");
            var eaBytes = await ScenovaClient.DownloadArtifactAsync(
                http,
                enroll.ApiBase,
                enroll.InstanceId,
                enroll.InstallToken);

            if (!string.IsNullOrWhiteSpace(enroll.ArtifactHash))
            {
                var hash = Convert.ToHexString(SHA256.HashData(eaBytes)).ToLowerInvariant();
                if (!string.Equals(hash, enroll.ArtifactHash, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("EA integrity verification failed");
            }
            await File.WriteAllBytesAsync(eaPath, eaBytes);

            var setPath = Path.Combine(presetsDir, "SCENOVA-FastBasketBot.set");
            await File.WriteAllLinesAsync(
                setPath,
                BuildSetLines(enroll.ApiBase, enroll.InstanceId, enroll.InstallToken),
                new UTF8Encoding(false));

            var config = new AgentConfig
            {
                ApiBase = enroll.ApiBase,
                WebBase = enroll.WebBase,
                InstanceId = enroll.InstanceId,
                InstallTokenProtected = ScenovaRuntime.Protect(enroll.InstallToken),
                DevicePublicId = devicePublicId,
                DeviceSecretProtected = ScenovaRuntime.Protect(deviceSecret),
                TerminalDataPath = terminal.DataPath,
                EaBinaryPath = eaPath,
                StartupSymbol = enroll.StartupSymbol,
                InstalledAt = DateTimeOffset.Now.ToString("O")
            };

            await File.WriteAllTextAsync(
                ScenovaRuntime.ConfigPath,
                JsonSerializer.Serialize(config, ScenovaRuntime.JsonOptions),
                new UTF8Encoding(false));

            _status.Text = "กำลังเปิดตัวอัปเดต SCENOVA และ MT5 พร้อม EA...";
            AgentRunner.InstallAndStart();

            var mt5Started = AgentRunner.EnsureMt5RunningWithEa(config, forceReload: true);
            if (!mt5Started)
                throw new InvalidOperationException("ติดตั้งไฟล์สำเร็จ แต่ไม่พบ terminal64.exe ของ MT5 ที่เลือก");

            _status.Text = "กำลังรอ FastBasketBot เชื่อมต่อกับ SCENOVA...";
            var eaReady = await WaitForEaConnectionAsync(
                http,
                config,
                deviceSecret,
                TimeSpan.FromSeconds(35));

            _progress.Visible = false;
            if (eaReady)
            {
                _status.Text =
                    "ติดตั้งสำเร็จ และ FastBasketBot เชื่อมต่อ SCENOVA แล้ว\r\nกลับไปหน้า Control Center ได้เลย";
                _install.Text = "ติดตั้งสำเร็จ";
            }
            else
            {
                _status.Text =
                    "ติดตั้งและเปิด MT5 แล้ว แต่ EA ยังไม่เชื่อมต่อ\r\nตรวจ MT5 > Tools > Options > Expert Advisors > Allow WebRequest สำหรับ https://snvea-bot.online/backend";
                _install.Text = "ติดตั้งแล้ว";
                _install.Enabled = true;
            }
        }
        catch (Exception ex)
        {
            _progress.Visible = false;
            _install.Enabled = true;
            _status.Text = "ติดตั้งไม่สำเร็จ: " + FriendlyError(ex);
        }
    }

    private static async Task<bool> WaitForEaConnectionAsync(
        HttpClient http,
        AgentConfig config,
        string deviceSecret,
        TimeSpan timeout)
    {
        var installToken = ScenovaRuntime.TryUnprotect(config.InstallTokenProtected);
        if (string.IsNullOrWhiteSpace(installToken))
            return false;

        var deadline = DateTimeOffset.UtcNow + timeout;
        while (DateTimeOffset.UtcNow < deadline)
        {
            try
            {
                var eaHash = "";
                if (File.Exists(config.EaBinaryPath))
                {
                    eaHash = Convert.ToHexString(
                        SHA256.HashData(await File.ReadAllBytesAsync(config.EaBinaryPath)))
                        .ToLowerInvariant();
                }

                var heartbeat = await ScenovaClient.PostJsonAsync<AgentHeartbeatResponse>(
                    http,
                    config.ApiBase.TrimEnd('/') + "/api/ea/agent-heartbeat",
                    new
                    {
                        instanceId = config.InstanceId,
                        installToken,
                        agentVersion = "2.0.6",
                        terminalPath = config.TerminalDataPath,
                        eaHash,
                        hostname = Environment.MachineName,
                        devicePublicId = config.DevicePublicId,
                        deviceSecret
                    });

                if (heartbeat.EaOnline &&
                    !string.IsNullOrWhiteSpace(heartbeat.EaVersion))
                    return true;
            }
            catch
            {
                // Keep waiting while MT5 starts and the EA initializes.
            }

            await Task.Delay(TimeSpan.FromSeconds(2));
        }

        return false;
    }

    private static string FriendlyError(Exception ex)
    {
        var msg = ex.Message;
        return msg.Length > 300 ? msg[..300] : msg;
    }

    private static List<TerminalChoice> FindTerminals()
    {
        var result = new List<TerminalChoice>();
        var root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MetaQuotes",
            "Terminal");
        if (!Directory.Exists(root)) return result;

        foreach (var dir in Directory.GetDirectories(root))
        {
            if (!Directory.Exists(Path.Combine(dir, "MQL5"))) continue;
            var originFile = Path.Combine(dir, "origin.txt");
            var origin = "";
            try
            {
                if (File.Exists(originFile))
                    origin = File.ReadAllText(originFile).Trim('\0', ' ', '\r', '\n');
            }
            catch { }

            result.Add(new TerminalChoice
            {
                DataPath = dir,
                Display = string.IsNullOrWhiteSpace(origin) ? dir : origin
            });
        }
        return result;
    }

    private static string[] BuildSetLines(string apiBase, string instanceId, string installToken) =>
    [
        "InpApiBase=" + apiBase,
        "InpInstanceId=" + instanceId,
        "InpInstallToken=" + installToken,
        "InpMagic=26090501",
        "InpLot=0.01",
        "InpMaxPositions=10",
        "InpBasketTriggerMoney=2",
        "InpBasketTrailMoney=0.5",
        "InpMaxBasketLossMoney=10",
        "InpDailyLossMoney=25",
        "InpMaxSpreadPoints=300",
        "InpMinOrderIntervalMs=300",
        "InpMaxOrdersPerMinute=120",
        "InpEntryMode=0",
        "InpMomentumTicks=20",
        "InpMomentumEntryPoints=8.0",
        "InpStrongFlowPoints=25.0",
        "InpFlowTrailBoost=0.60",
        "InpPauseOnManualTrade=true",
        "InpHeartbeatSeconds=3",
        "InpMaxOfflineLeaseSeconds=600"
    ];
}
