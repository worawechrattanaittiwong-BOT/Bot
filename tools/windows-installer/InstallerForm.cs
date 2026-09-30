using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ScenovaInstaller;

internal sealed partial class InstallerForm : Form
{
    private static readonly Color PrimaryBlue = Color.FromArgb(15, 112, 230);
    private static readonly Color AccentCyan = Color.FromArgb(15, 170, 230);
    private static readonly Color Navy = Color.FromArgb(16, 45, 87);
    private static readonly Color SoftBackground = Color.FromArgb(244, 248, 253);
    private static readonly Color CardBackground = Color.White;
    private static readonly Color BorderBlue = Color.FromArgb(205, 222, 242);
    private static readonly Color MutedText = Color.FromArgb(83, 105, 133);
    private static readonly Color SuccessGreen = Color.FromArgb(0, 145, 91);
    private readonly ComboBox _terminal = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        Dock = DockStyle.Fill
    };
    private readonly ComboBox _channel = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        Width = 150
    };
    private readonly ListView _health = new()
    {
        View = View.Details,
        FullRowSelect = true,
        GridLines = false,
        HeaderStyle = ColumnHeaderStyle.Nonclickable,
        Dock = DockStyle.Fill
    };
    private readonly Label _score = new()
    {
        AutoSize = false,
        Height = 56,
        Dock = DockStyle.Top,
        TextAlign = ContentAlignment.MiddleLeft
    };
    private readonly Label _status = new()
    {
        AutoSize = false,
        Height = 64,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft
    };
    private readonly Label _live = new()
    {
        AutoSize = false,
        Height = 118,
        Dock = DockStyle.Top
    };
    private readonly ProgressBar _progress = new()
    {
        Dock = DockStyle.Top,
        Height = 14,
        Minimum = 0,
        Maximum = 100,
        Value = 0,
        Style = ProgressBarStyle.Continuous,
        Visible = true
    };
    private readonly TextBox _advancedDetails = new()
    {
        Dock = DockStyle.Fill,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Vertical,
        Visible = false
    };
    private readonly CheckBox _advancedMode = new()
    {
        Text = "รายละเอียดและเครื่องมือเพิ่มเติม",
        AutoSize = true,
        ForeColor = Color.FromArgb(46, 63, 84)
    };
    private readonly Label _channelSummary = new()
    {
        AutoSize = false,
        Width = 150,
        Height = 30,
        TextAlign = ContentAlignment.MiddleCenter,
        ForeColor = Color.FromArgb(28, 93, 171),
        BackColor = Color.FromArgb(235, 245, 255)
    };

    private readonly Button _install = MakePrimaryButton("⟳  ตรวจสอบและอัปเดต", 520);
    private readonly Button _rollback = MakeButton("ย้อนกลับ", 120);
    private readonly Button _uninstall = MakeButton("ถอน SCENOVA", 130);

    private List<TerminalChoice> _terminals = [];
    private InstallationAssessment? _assessment;
    private readonly Image _brandLogo = BrandAssets.LoadInstallerMark();
    private bool _busy;
    private bool _refreshing;

    internal InstallerForm()
    {
        Text = InstallerConstants.ProductName + " v" + InstallerConstants.Version;
        ClientSize = new Size(1320, 900);
        MinimumSize = new Size(1100, 780);
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        DoubleBuffered = true;
        BackColor = SoftBackground;
        ForeColor = Color.FromArgb(29, 42, 58);
        Font = new Font("Segoe UI", 10f);

        _channel.Items.AddRange(["Stable", "Beta", "Admin Test"]);
        var state = ScenovaRuntime.ReadState();
        var desiredChannel = state.ReleaseChannel switch
        {
            "Beta" => 1,
            "AdminTest" => 2,
            _ => 0
        };
        _channel.SelectedIndex = desiredChannel;
        _channel.Visible = false;
        _channelSummary.Text = "ช่องทาง: " + SelectedReleaseChannel();

        ConfigureHealthList();
        BuildLayout();

        _install.Click += async (_, _) => await InstallOrUpdateAsync();
        _rollback.Click += async (_, _) => await RollbackAsync();
        _uninstall.Click += async (_, _) => await UninstallAsync();
        _terminal.SelectedIndexChanged += async (_, _) =>
        {
            if (_busy || _refreshing) return;
            SetBusy(true);
            try { await AssessSelectedAsync(force: true); }
            catch (Exception ex) { ShowResult(InstallerDiagnostics.Friendly(InstallerDiagnostics.Classify(ex), ex.Message), false); }
            finally { SetBusy(false); }
        };
        _channel.SelectedIndexChanged += (_, _) =>
        {
            var next = ScenovaRuntime.ReadState();
            next.ReleaseChannel = SelectedReleaseChannel();
            ScenovaRuntime.SaveState(next);
            _channelSummary.Text = "ช่องทาง: " + SelectedReleaseChannel();
            ShowResult("เปลี่ยนช่องทางแล้ว · กดตรวจสอบและอัปเดตเพื่อเปรียบเทียบเวอร์ชัน", false);
            RenderAdvancedDetails(null);
        };
        _advancedMode.CheckedChanged += (_, _) =>
        {
            _advancedPanel.Visible = _advancedMode.Checked;
            _advancedDetails.Visible = _advancedMode.Checked;
            _channel.Visible = _advancedMode.Checked;
            RenderAdvancedDetails(null);
        };

        Shown += async (_, _) => await RefreshAllAsync();
        FormClosing += (_, e) =>
        {
            if (!_busy) return;
            e.Cancel = true;
            _status.Text = "กำลังดำเนินการ กรุณารอให้เสร็จก่อนปิดหน้าต่าง";
        };
    }

    private static Button MakeButton(string text, int width) =>
        new()
        {
            Text = text,
            Width = width,
            Height = 46,
            FlatStyle = FlatStyle.Flat,
            BackColor = PrimaryBlue,
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 10f),
            Margin = new Padding(5, 4, 5, 4),
            Padding = new Padding(8, 0, 8, 0),
            Cursor = Cursors.Hand,
            UseCompatibleTextRendering = true
        };

    private static Button MakePrimaryButton(string text, int width) =>
        new InstallerPrimaryButton
        {
            Text = text,
            Width = width,
            Height = 64,
            BackColor = PrimaryBlue,
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 15f, FontStyle.Bold),
            Margin = new Padding(5, 4, 5, 4),
            Padding = new Padding(12, 0, 12, 0)
        };

    private void ConfigureHealthList()
    {
        _health.BackColor = CardBackground;
        _health.ForeColor = Color.FromArgb(32, 47, 65);
        _health.BorderStyle = BorderStyle.None;
        _health.Font = new Font("Segoe UI", 10.5f);
        _health.HeaderStyle = ColumnHeaderStyle.None;
        _health.Columns.Add("รายการ");
        _health.Columns.Add("รายละเอียด");
        _health.Columns.Add("สถานะ");
        _health.Resize += (_, _) => ResizeHealthColumns();
        ResizeHealthColumns();
    }

    private void ResizeHealthColumns()
    {
        if (_health.Columns.Count < 3) return;
        var width = Math.Max(1, _health.ClientSize.Width - SystemInformation.VerticalScrollBarWidth - 8);
        _health.Columns[0].Width = (int)(width * 0.31);
        _health.Columns[1].Width = (int)(width * 0.49);
        _health.Columns[2].Width = Math.Max(1, width - _health.Columns[0].Width - _health.Columns[1].Width);
    }


    private async Task RefreshAllAsync(bool force = false)
    {
        if ((_busy && !force) || _refreshing) return;
        var alreadyBusy = _busy;
        _refreshing = true;
        SetBusy(true);
        try
        {
            var previous = (_terminal.SelectedItem as TerminalChoice)?.DataPath
                           ?? ScenovaRuntime.ReadState().LastTerminalPath;
            _terminals = await Task.Run(TerminalDiscovery.Discover);
            _terminal.Items.Clear();
            foreach (var item in _terminals) _terminal.Items.Add(item);
            _assessment = null;

            if (_terminals.Count == 0)
            {
                _terminalNote.Text = "ยังไม่พบ MetaTrader 5";
                _live.Text = "รอเลือก MT5";
                _assessment = new InstallationAssessment
                {
                    Score = 0, Summary = "ยังไม่พบ MetaTrader 5",
                    Checks =
                    [
                        new HealthCheckResult
                        {
                            Code = "MT5_NOT_FOUND", Title = "ค้นหา MetaTrader 5",
                            Detail = "เปิด MT5 อย่างน้อยหนึ่งครั้ง แล้วกดตรวจสอบและอัปเดต",
                            State = HealthState.NeedAction, Weight = 1
                        }
                    ]
                };
                RenderHealth(_assessment);
                ShowResult("ยังไม่พบ MT5 · เปิดโปรแกรม MetaTrader 5 แล้วกดตรวจสอบและอัปเดตอีกครั้ง", false);
                return;
            }

            var index = _terminals.FindIndex(x => string.Equals(x.DataPath, previous, StringComparison.OrdinalIgnoreCase));
            _terminal.SelectedIndex = index >= 0 ? index : 0;
            _terminalNote.Text = $"พบ MT5 {_terminals.Count} รายการ\r\nพร้อมใช้งาน";
            await AssessSelectedAsync(force: true);
        }
        catch (Exception ex)
        {
            if (force) throw;
            ShowResult(InstallerDiagnostics.Friendly(InstallerDiagnostics.Classify(ex), ex.Message), false);
        }
        finally
        {
            _refreshing = false;
            SetBusy(alreadyBusy);
        }
    }

    private async Task AssessSelectedAsync(bool force = false)
    {
        if ((_busy && !force) || _terminal.SelectedItem is not TerminalChoice terminal)
            return;

        _assessment = await SmartHealthEngine.AssessAsync(terminal);
        RenderHealth(_assessment);

        var state = ScenovaRuntime.ReadState();
        state.InstallerVersion = InstallerConstants.Version;
        state.LastHealthScore = _assessment.Score;
        state.LastHealthAt = DateTimeOffset.UtcNow.ToString("O");
        state.LastTerminalPath = terminal.DataPath;
        state.ReleaseChannel = SelectedReleaseChannel();
        var signature = SignatureVerifier.CheckSelf();
        state.SignatureValid = signature.Signed && signature.Trusted;
        ScenovaRuntime.SaveState(state);

        var profile = SelectedProfile();
        AgentHeartbeatResponse? heartbeat = null;
        if (profile is not null)
            heartbeat = await TryHeartbeatAsync(profile);

        RenderLive(profile, heartbeat);
        RenderAdvancedDetails(heartbeat);
    }

    private void RenderHealth(InstallationAssessment assessment)
    {
        HealthCheckResult? Find(string code) =>
            assessment.Checks.FirstOrDefault(x =>
                string.Equals(x.Code, code, StringComparison.OrdinalIgnoreCase));

        HealthState Combine(params string[] codes)
        {
            var states = codes
                .Select(Find)
                .Where(x => x is not null)
                .Select(x => x!.State)
                .ToList();

            if (states.Any(x => x == HealthState.NeedAction)) return HealthState.NeedAction;
            if (states.Any(x => x == HealthState.Warning)) return HealthState.Warning;
            if (states.Any(x => x == HealthState.AutoFix)) return HealthState.AutoFix;
            return HealthState.Ready;
        }

        var terminal = _terminal.SelectedItem as TerminalChoice;
        var profile = SelectedProfile();
        var rows = new[]
        {
            new
            {
                Title = "ค้นหา MetaTrader 5",
                State = Combine("MT5_DETECTED", "TERMINAL_MATCH"),
                Detail = terminal is null
                    ? "ยังไม่พบ MetaTrader 5"
                    : "พบ " + (string.IsNullOrWhiteSpace(terminal.BrokerHint) ? "MetaTrader 5" : terminal.BrokerHint)
            },
            new
            {
                Title = "ตรวจสอบเวอร์ชัน",
                State = Combine("AGENT", "EXISTING_INSTALL"),
                Detail = profile is not null && !string.IsNullOrWhiteSpace(profile.EaVersion)
                    ? "เวอร์ชัน " + profile.EaVersion + " พร้อมตรวจสอบอัปเดต"
                    : "พร้อมติดตั้งเวอร์ชันล่าสุด"
            },
            new
            {
                Title = "ตรวจสอบการเชื่อมต่อ",
                State = Combine("API_REACHABLE"),
                Detail = Find("API_REACHABLE")?.State == HealthState.NeedAction
                    ? "ยังเชื่อมต่อ SCENOVA ไม่ได้"
                    : "เชื่อมต่อ SCENOVA ได้"
            },
            new
            {
                Title = "ติดตั้ง / อัปเดต",
                State = Combine("WINDOWS_ARCH", "MQL5_WRITE", "DISK_SPACE"),
                Detail = Combine("WINDOWS_ARCH", "MQL5_WRITE", "DISK_SPACE") == HealthState.NeedAction
                    ? "มีรายการที่ต้องแก้ก่อนติดตั้ง"
                    : "พร้อมติดตั้งและอัปเดต"
            }
        };

        _health.BeginUpdate();
        try
        {
            _health.Items.Clear();
            foreach (var row in rows)
            {
                var status = row.State switch
                {
                    HealthState.NeedAction => "ต้องตรวจสอบ",
                    HealthState.Warning => "ควรตรวจสอบ",
                    HealthState.AutoFix => "พร้อมติดตั้ง",
                    _ => "เรียบร้อย"
                };
                var prefix = row.State is HealthState.Ready or HealthState.Info ? "✓  " : "•  ";
                var item = new ListViewItem(prefix + row.Title);
                item.SubItems.Add(row.Detail);
                item.SubItems.Add(status);
                item.ForeColor = row.State switch
                {
                    HealthState.NeedAction => Color.FromArgb(193, 62, 46),
                    HealthState.Warning => Color.FromArgb(151, 96, 12),
                    HealthState.AutoFix => PrimaryBlue,
                    _ => SuccessGreen
                };
                _health.Items.Add(item);
            }
        }
        finally
        {
            _health.EndUpdate();
        }

        _displayScore = assessment.Ready
            ? 100
            : rows.Count(x => x.State != HealthState.NeedAction) * 25;

        _score.Text = assessment.Ready ? "พร้อมใช้งาน" : "ต้องตรวจสอบ";
        _score.ForeColor = assessment.Ready ? SuccessGreen : Color.FromArgb(151, 96, 12);

        _progress.Value = Math.Clamp(_displayScore, 0, 100);
        _progressPercent.Text = _busy ? "" : _displayScore + "%";
        _progressPercent.ForeColor = _displayScore == 100 ? SuccessGreen : MutedText;
    }

    private async Task InstallOrUpdateAsync()
    {
        if (_busy) return;
        SetBusy(true);
        AgentConfig? profile = null;
        try
        {
            SetStep(1, "กำลังค้นหา MT5 และตรวจสอบความพร้อม");
            await RefreshAllAsync(force: true);
            if (_terminal.SelectedItem is not TerminalChoice terminal) return;
            if (_assessment is null || !_assessment.Ready)
                throw new InvalidOperationException("กรุณาแก้รายการที่ระบุว่าต้องดำเนินการ แล้วกดปุ่มนี้อีกครั้ง");

            profile = SelectedProfile();
            var enrollmentCode = ScenovaRuntime.ReadEnrollmentCode();
            var newInstall = profile is null;
            if (newInstall)
            {
                if (string.IsNullOrWhiteSpace(enrollmentCode))
                    throw new InvalidOperationException("กรุณาดาวน์โหลดตัวติดตั้งจากหน้า MT5 & EA ในบัญชี SCENOVA ของคุณ");
                SetStep(2, "กำลังเชื่อมต่อบัญชี SCENOVA กับ MT5 ที่เลือก");
                profile = await EnrollProfileAsync(terminal, enrollmentCode, null);
            }
            if (profile is null) throw new InvalidOperationException("ไม่พบข้อมูลการติดตั้งสำหรับ MT5 ที่เลือก");

            var token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected)
                ?? throw new InvalidOperationException("ข้อมูลการเชื่อมต่อไม่ครบ กรุณาดาวน์โหลดตัวติดตั้งจากบัญชี SCENOVA อีกครั้ง");
            using var http = ScenovaClient.NewHttpClient();
            SetStep(2, "กำลังตรวจสอบเวอร์ชันและการเชื่อมต่อ");
            var heartbeat = await TryHeartbeatAsync(profile, http);

            // Cloud -> Local rotates the installation lease. A PC can still have
            // the old Local profile on disk, so the freshly downloaded Setup must
            // be allowed to replace that stale token instead of looping forever
            // on the previous profile.
            if (heartbeat is null &&
                !newInstall &&
                !string.IsNullOrWhiteSpace(enrollmentCode))
            {
                SetStep(2, "กำลังรับสิทธิ์ Local ใหม่จาก SCENOVA");
                profile = await EnrollProfileAsync(terminal, enrollmentCode, profile);
                token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected)
                    ?? throw new InvalidOperationException("รับสิทธิ์ Local ใหม่แล้ว แต่ข้อมูลการเชื่อมต่อไม่ครบ");
                heartbeat = await TryHeartbeatAsync(profile, http);
            }

            heartbeat ??= throw new InvalidOperationException(
                "SCENOVA Server ยังไม่ตอบกลับ จึงยังยืนยันเวอร์ชันล่าสุดไม่ได้");
            EnsureAccountMatches(profile, heartbeat);
            var plan = SmartHealthEngine.BuildPlan(terminal, profile, heartbeat);
            var repairPreset = newInstall || plan.RepairPreset || !PresetMatches(profile, token);
            var filesMatch = plan.VerifyOnly && !repairPreset;
            RenderLive(profile, heartbeat);
            RenderAdvancedDetails(heartbeat);

            // A matching file on disk alone is not proof that MT5 loaded it.
            // Skip all installers, preset writes and restarts only after every check passes.
            if (filesMatch && IsVerified(profile, heartbeat))
            {
                _updateSummary.Text = "เวอร์ชันและไฟล์ตรงกัน\r\nไม่จำเป็นต้องอัปเดต";
                ShowResult("ตรวจสอบแล้ว ทุกอย่างพร้อมใช้งาน ไม่จำเป็นต้องอัปเดต", true);
                return;
            }

            var requiredAgent = string.IsNullOrWhiteSpace(heartbeat.AgentVersionRequired)
                ? InstallerConstants.AgentVersion : heartbeat.AgentVersionRequired;
            if ((plan.InstallAgent || plan.UpdateAgent || heartbeat.AgentUpdateRequired) &&
                !VersionsMatch(InstallerConstants.AgentVersion, requiredAgent))
                throw new InvalidOperationException(
                    "ตัวติดตั้งนี้มี Agent " + InstallerConstants.AgentVersion +
                    " แต่ระบบต้องการ " + requiredAgent +
                    " · กรุณาดาวน์โหลดตัวติดตั้งล่าสุดจากหน้า MT5 & EA");

            Directory.CreateDirectory(ScenovaRuntime.BaseDir);
            Directory.CreateDirectory(ScenovaRuntime.StagingDir);
            var needEaUpdate = plan.InstallEa || plan.UpdateEa;
            var needsReload = !VersionsMatch(heartbeat.EaVersion, heartbeat.EaVersionRequired);
            if (needEaUpdate)
            {
                if (!heartbeat.ArtifactAvailable || string.IsNullOrWhiteSpace(heartbeat.ArtifactHash))
                    throw new InvalidOperationException("ยังไม่มีไฟล์ EA ที่ยืนยันความถูกต้องได้จาก Server กรุณาลองใหม่ภายหลัง");
                SetStep(3, "กำลังดาวน์โหลดและติดตั้งอัปเดต");
            }
            else
            {
                SetStep(3, filesMatch ? "ทุกอย่างตรงกันแล้ว กำลังตรวจสอบการเชื่อมต่อ" : "กำลังเตรียมเวอร์ชันล่าสุด");
            }
            _updateSummary.Text = needEaUpdate ? "กำลังอัปเดต EA\r\nเก็บค่าการใช้งานเดิมไว้" : "ตรวจเฉพาะส่วนที่จำเป็น";

            if (needEaUpdate || needsReload || SmartAgentRunner.PendingUpdateExists(profile))
                await SmartAgentRunner.EnsureEaArtifactAsync(http, profile, token, heartbeat, ScenovaRuntime.DiagnosticsPath);

            if (repairPreset)
            {
                SetStep(3, "กำลังจัดเตรียมค่าการเชื่อมต่อ");
                PresetManager.Migrate(PresetPath(profile), profile.ApiBase, profile.InstanceId, token);
            }

            if (plan.InstallAgent || plan.UpdateAgent)
            {
                SetStep(3, "กำลังติดตั้งส่วนที่จำเป็น");
                await Task.Run(AgentRunner.InstallAndStart);
            }
            else
            {
                await Task.Run(AgentRunner.StartInstalledAgentIfNeeded);
            }

            profile.InstallerVersion = InstallerConstants.Version;
            profile.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");
            ScenovaRuntime.SaveOrUpdateProfile(profile, makePrimary: true);

            // The explicit foreground click permits one connection/reload only
            // after a fresh Server check. Automatic refresh never enters here.
            heartbeat = await TryHeartbeatAsync(profile, http)
                ?? throw new InvalidOperationException("SCENOVA Server ยังไม่ตอบกลับ จึงยังโหลด EA ใหม่ไม่ได้");
            EnsureAccountMatches(profile, heartbeat);
            if (heartbeat.SafeToRestart && heartbeat.Positions == 0 &&
                (!heartbeat.EaOnline || !VersionsMatch(heartbeat.EaVersion, heartbeat.EaVersionRequired)))
            {
                // A release may have changed or an earlier update may have
                // been staged while trading; apply only the freshly approved file.
                await SmartAgentRunner.EnsureEaArtifactAsync(http, profile, token, heartbeat, ScenovaRuntime.DiagnosticsPath);
                SetStep(3, "กำลังเชื่อมต่อ MT5 และโหลดเวอร์ชันล่าสุด");
                await Task.Run(() => AgentRunner.ConnectFromInstallerButton(profile, heartbeat));
            }

            SetStep(4, "กำลังตรวจสอบความเรียบร้อย");
            var verified = await WaitForVerificationAsync(profile, TimeSpan.FromSeconds(40));
            var complete = verified is not null && IsVerified(profile, verified);
            RenderLive(profile, verified);
            RenderAdvancedDetails(verified);
            _assessment = await SmartHealthEngine.AssessAsync(terminal);
            RenderHealth(_assessment);

            var state = ScenovaRuntime.ReadState();
            state.LastAction = "CHECK_AND_UPDATE";
            state.LastResult = complete ? "SUCCESS" : "PARTIAL";
            if (newInstall || !filesMatch) state.LastInstallAt = DateTimeOffset.UtcNow.ToString("O");
            state.LastAgentVersion = File.Exists(AgentRunner.AgentPath)
                ? FileVersionInfo.GetVersionInfo(AgentRunner.AgentPath).FileVersion ?? "" : "";
            state.LastEaVersion = verified?.EaVersion ?? "";
            state.LastEaHash = File.Exists(profile.EaBinaryPath) ? BackupManager.HashFile(profile.EaBinaryPath) : "";
            state.LastErrorCode = complete ? "" : InstallerErrorCode.EaOffline.ToString();
            ScenovaRuntime.SaveState(state);
            await ReportTelemetryAsync(profile, "CHECK_AND_UPDATE", state.LastResult,
                complete ? InstallerErrorCode.None : InstallerErrorCode.EaOffline);

            if (complete)
            {
                _updateSummary.Text = "เวอร์ชันล่าสุด\r\nตรวจยืนยันเรียบร้อย";
                ShowResult(filesMatch
                    ? "ตรวจสอบแล้ว ทุกอย่างพร้อมใช้งาน"
                    : "อัปเดตและตรวจสอบเรียบร้อย พร้อมใช้งาน", true);
            }
            else
            {
                _updateSummary.Text = "ยังรอยืนยันจาก MT5";
                var latest = verified ?? heartbeat;
                var message = !latest.SafeToRestart && (needEaUpdate || SmartAgentRunner.PendingUpdateExists(profile))
                    ? "เตรียมอัปเดตแล้ว · MT5 ยังทำงานหรือมีออเดอร์อยู่ จึงยังยืนยันว่าอัปเดตสำเร็จไม่ได้"
                    : SmartAgentRunner.PendingUpdateExists(profile) || !VersionsMatch(latest.EaVersion, latest.EaVersionRequired)
                        ? "ไฟล์อัปเดตพร้อมแล้ว แต่ MT5 ยังไม่ยืนยันเวอร์ชันใหม่ · ตรวจการเชื่อมต่อแล้วกดตรวจสอบและอัปเดตอีกครั้ง"
                        : "ยังยืนยันการเชื่อมต่อ EA ไม่สำเร็จ · เปิด MT5 และตรวจว่า FastBasketBot อยู่บนกราฟ แล้วกดปุ่มนี้อีกครั้ง";
                ShowResult(message, false);
            }
        }
        catch (Exception ex)
        {
            var code = InstallerDiagnostics.Classify(ex);
            await InstallerDiagnostics.LogAsync("CHECK_UPDATE_ERROR", code + " " + ex.Message);
            SaveFailureState("CHECK_AND_UPDATE", code);
            if (profile is not null)
            {
                try { await ReportTelemetryAsync(profile, "CHECK_AND_UPDATE", "FAILED", code); }
                catch { /* Telemetry must not hide the original failure. */ }
            }
            _updateSummary.Text = "ยังดำเนินการไม่สำเร็จ";
            ShowResult(InstallerDiagnostics.Friendly(code, ex.Message), false);
        }
        finally { SetBusy(false); }
    }

    private static string PresetPath(AgentConfig profile) =>
        Path.Combine(profile.TerminalDataPath, "MQL5", "Presets", "SCENOVA-FastBasketBot.set");

    private static bool PresetMatches(AgentConfig profile, string token)
    {
        var path = PresetPath(profile);
        if (!File.Exists(path)) return false;
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var line in File.ReadLines(path))
        {
            var equals = line.IndexOf('=');
            if (equals <= 0) continue;
            values[line[..equals].Trim()] = line[(equals + 1)..].Split("||")[0].Trim();
        }
        return values.TryGetValue("InpApiBase", out var api) && api.TrimEnd('/') == profile.ApiBase.TrimEnd('/') &&
               values.TryGetValue("InpInstanceId", out var instance) && instance == profile.InstanceId &&
               values.TryGetValue("InpInstallToken", out var savedToken) && savedToken == token &&
               PresetManager.Defaults.Keys.All(values.ContainsKey);
    }

    private static bool VersionsMatch(string? actual, string? required)
    {
        if (string.IsNullOrWhiteSpace(actual) || string.IsNullOrWhiteSpace(required)) return false;
        static string Normalize(string value) => string.Join(".", value.Trim().TrimStart('v', 'V').Split('.').Take(3));
        return string.Equals(Normalize(actual), Normalize(required), StringComparison.OrdinalIgnoreCase);
    }

    private static void EnsureAccountMatches(AgentConfig profile, AgentHeartbeatResponse heartbeat)
    {
        if ((!string.IsNullOrWhiteSpace(profile.ExpectedAccountNumber) && !string.IsNullOrWhiteSpace(heartbeat.AccountNumber) &&
             !string.Equals(profile.ExpectedAccountNumber, heartbeat.AccountNumber, StringComparison.OrdinalIgnoreCase)) ||
            (!string.IsNullOrWhiteSpace(profile.ExpectedServer) && !string.IsNullOrWhiteSpace(heartbeat.Server) &&
             !string.Equals(profile.ExpectedServer, heartbeat.Server, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("account mismatch");
    }

    private static bool IsVerified(AgentConfig profile, AgentHeartbeatResponse heartbeat)
    {
        if (!heartbeat.DeviceVerified || !heartbeat.EaOnline || heartbeat.AgentUpdateRequired ||
            string.IsNullOrWhiteSpace(heartbeat.ArtifactHash) || !File.Exists(profile.EaBinaryPath) ||
            !File.Exists(AgentRunner.AgentPath))
            return false;
        if (!string.Equals(BackupManager.HashFile(profile.EaBinaryPath), heartbeat.ArtifactHash, StringComparison.OrdinalIgnoreCase))
            return false;
        if (!VersionsMatch(heartbeat.EaVersion, heartbeat.EaVersionRequired ?? profile.EaVersion) ||
            !VersionsMatch(FileVersionInfo.GetVersionInfo(AgentRunner.AgentPath).FileVersion,
                heartbeat.AgentVersionRequired ?? InstallerConstants.AgentVersion))
            return false;
        if ((!string.IsNullOrWhiteSpace(profile.ExpectedAccountNumber) &&
             !string.Equals(profile.ExpectedAccountNumber, heartbeat.AccountNumber, StringComparison.OrdinalIgnoreCase)) ||
            (!string.IsNullOrWhiteSpace(profile.ExpectedServer) &&
             !string.Equals(profile.ExpectedServer, heartbeat.Server, StringComparison.OrdinalIgnoreCase)))
            return false;
        var token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected);
        return !string.IsNullOrWhiteSpace(token) && PresetMatches(profile, token);
    }

    private async Task<AgentConfig> EnrollProfileAsync(
        TerminalChoice terminal,
        string code,
        AgentConfig? existing)
    {
        var pending = ScenovaRuntime.ReadPendingInstallIdentity();
        var devicePublicId = existing?.DevicePublicId ?? pending?.DevicePublicId;
        var deviceSecret = existing is not null
            ? ScenovaRuntime.TryUnprotect(existing.DeviceSecretProtected)
            : ScenovaRuntime.TryUnprotect(pending?.DeviceSecretProtected);

        if (string.IsNullOrWhiteSpace(devicePublicId))
            devicePublicId = Guid.NewGuid().ToString("N");
        if (string.IsNullOrWhiteSpace(deviceSecret))
            deviceSecret = Convert.ToHexString(
                RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();

        ScenovaRuntime.SavePendingInstallIdentity(devicePublicId, deviceSecret);
        var (legacyInstanceId, legacyToken) = ScenovaRuntime.ReadLegacyCredentials();

        using var http = ScenovaClient.NewHttpClient();
        var enroll = await ScenovaClient.PostJsonAsync<EnrollResponse>(
            http,
            ScenovaRuntime.ProductionApiBase + "/api/installer/enroll",
            new
            {
                code,
                devicePublicId,
                deviceSecret,
                deviceFingerprint = DeviceFingerprint.Current(),
                hostname = Environment.MachineName,
                terminalPath = terminal.DataPath,
                legacyInstanceId = existing?.InstanceId ?? legacyInstanceId,
                legacyInstallToken =
                    existing is not null
                        ? ScenovaRuntime.TryUnprotect(existing.InstallTokenProtected)
                        : legacyToken,
                releaseChannel = SelectedReleaseChannel()
            });

        if (string.IsNullOrWhiteSpace(enroll.InstanceId) ||
            string.IsNullOrWhiteSpace(enroll.InstallToken))
            throw new InvalidOperationException(
                "SCENOVA Server ไม่คืน installation credentials");

        var experts = Path.Combine(
            terminal.DataPath,
            "MQL5",
            "Experts",
            "SCENOVA");
        Directory.CreateDirectory(experts);

        var profile = existing ?? new AgentConfig();
        profile.ApiBase = enroll.ApiBase;
        profile.WebBase = enroll.WebBase;
        profile.InstanceId = enroll.InstanceId;
        profile.InstallTokenProtected = ScenovaRuntime.Protect(enroll.InstallToken);
        profile.DevicePublicId = devicePublicId;
        profile.DeviceSecretProtected = ScenovaRuntime.Protect(deviceSecret);
        profile.TerminalDataPath = terminal.DataPath;
        profile.EaBinaryPath = Path.Combine(experts, "FastBasketBot.ex5");
        profile.StartupSymbol = enroll.StartupSymbol;
        profile.InstalledAt = string.IsNullOrWhiteSpace(profile.InstalledAt)
            ? DateTimeOffset.UtcNow.ToString("O")
            : profile.InstalledAt;
        profile.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");
        profile.InstallerVersion = InstallerConstants.Version;
        profile.ReleaseChannel = enroll.ReleaseChannel;
        profile.EaVersion = enroll.EaVersionRequired;
        profile.EaHash = enroll.ArtifactHash ?? "";
        profile.TerminalBrokerHint = terminal.BrokerHint;
        profile.ExpectedAccountNumber = enroll.ExpectedAccountNumber ?? "";
        profile.ExpectedServer = enroll.ExpectedServer ?? "";
        profile.IsPrimary = true;

        ScenovaRuntime.SaveOrUpdateProfile(profile, true);
        ScenovaRuntime.ClearPendingInstallIdentity();
        return profile;
    }


    private async Task RollbackAsync()
    {
        var profile = SelectedProfile();
        if (profile is null)
        {
            _status.Text = "ยังไม่มี SCENOVA Profile สำหรับย้อนกลับ";
            return;
        }

        SetBusy(true);
        try
        {
            var heartbeat = await TryHeartbeatAsync(profile);
            if (heartbeat is not null && !heartbeat.SafeToRestart)
                throw new InvalidOperationException(
                    "Update pending: ต้อง Safe Stop และไม่มี Position ก่อน Rollback");

            if (!BackupManager.RestoreLatest(profile))
                throw new InvalidOperationException("rollback backup unavailable");

            AgentRunner.EnsureMt5RunningWithEa(profile, forceReload: true);

            var state = ScenovaRuntime.ReadState();
            state.LastAction = "ROLLBACK";
            state.LastResult = "SUCCESS";
            state.LastRollbackAt = DateTimeOffset.UtcNow.ToString("O");
            state.LastErrorCode = "";
            ScenovaRuntime.SaveState(state);

            await ReportTelemetryAsync(
                profile,
                "ROLLBACK",
                "SUCCESS",
                InstallerErrorCode.None);
            _status.Text = "Rollback สำเร็จ · เปิด MT5 ด้วย Backup ล่าสุดแล้ว";
            await RefreshAllAsync(force: true);
        }
        catch (Exception ex)
        {
            var code = ex.Message.Contains("backup", StringComparison.OrdinalIgnoreCase)
                ? InstallerErrorCode.RollbackUnavailable
                : InstallerErrorCode.UpdatePending;
            SaveFailureState("ROLLBACK", code);
            _status.Text = "Rollback ไม่สำเร็จ [" + code + "] · " +
                           InstallerDiagnostics.Friendly(code, ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async Task UninstallAsync()
    {
        if (_terminal.SelectedItem is not TerminalChoice terminal) return;
        var profile = SelectedProfile();

        if (profile is not null)
        {
            var heartbeat = await TryHeartbeatAsync(profile);
            if (heartbeat is not null && !heartbeat.SafeToRestart)
            {
                _status.Text =
                    "ยังถอนไม่ได้ · Bot/Position ยังทำงานอยู่ กรุณา Safe Stop และปิด Position ก่อน";
                return;
            }
        }

        var confirm = MessageBox.Show(
            "ถอนเฉพาะ SCENOVA จาก MT5 ที่เลือก?\r\nMT5, Indicators, Templates และ EA อื่นจะไม่ถูกลบ",
            "SCENOVA Smart Uninstall",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        if (confirm != DialogResult.Yes) return;

        SetBusy(true);
        try
        {
            InstallerRepair.CleanUninstall(terminal);
            if (profile is not null)
            {
                ScenovaRuntime.RemoveProfile(profile.InstanceId);
                await ReportTelemetryAsync(
                    profile,
                    "UNINSTALL",
                    "SUCCESS",
                    InstallerErrorCode.None);
            }

            _status.Text = "ถอน SCENOVA จาก Terminal นี้แล้ว · ไม่แตะ MT5 หรือไฟล์ของระบบอื่น";
            await RefreshAllAsync(force: true);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private AgentConfig? SelectedProfile()
    {
        if (_terminal.SelectedItem is not TerminalChoice terminal)
            return null;

        return ScenovaRuntime.ReadProfiles().FirstOrDefault(x =>
            string.Equals(
                x.TerminalDataPath,
                terminal.DataPath,
                StringComparison.OrdinalIgnoreCase));
    }

    private async Task<AgentHeartbeatResponse?> TryHeartbeatAsync(
        AgentConfig profile,
        HttpClient? existingHttp = null)
    {
        var token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected);
        var secret = ScenovaRuntime.TryUnprotect(profile.DeviceSecretProtected);
        if (string.IsNullOrWhiteSpace(token) ||
            string.IsNullOrWhiteSpace(secret))
            return null;

        var owns = existingHttp is null;
        var http = existingHttp ?? ScenovaClient.NewHttpClient();
        try
        {
            var localHash = File.Exists(profile.EaBinaryPath)
                ? BackupManager.HashFile(profile.EaBinaryPath)
                : "";

            var response = await ScenovaClient.PostJsonAsync<AgentHeartbeatResponse>(
                http,
                profile.ApiBase.TrimEnd('/') + "/api/ea/agent-heartbeat",
                new
                {
                    instanceId = profile.InstanceId,
                    installToken = token,
                    agentVersion = InstallerConstants.AgentVersion,
                    terminalPath = profile.TerminalDataPath,
                    eaHash = localHash,
                    hostname = Environment.MachineName,
                    devicePublicId = profile.DevicePublicId,
                    deviceSecret = secret,
                    deviceFingerprint = DeviceFingerprint.Current(),
                    releaseChannel = SelectedReleaseChannel(),
                    installerStatus = new
                    {
                        version = InstallerConstants.Version,
                        channel = SelectedReleaseChannel(),
                        localHash,
                        stagedUpdate = SmartAgentRunner.PendingUpdateExists(profile),
                        healthScore = _assessment?.Score ?? 0,
                        profileCount = ScenovaRuntime.ReadProfiles().Count
                    }
                });

            profile.ReleaseChannel = response.ReleaseChannel ?? profile.ReleaseChannel;
            profile.VerifiedAccountNumber =
                response.AccountNumber ?? profile.VerifiedAccountNumber;
            profile.VerifiedServer =
                response.Server ?? profile.VerifiedServer;
            profile.EaVersion = response.EaVersionRequired ??
                                response.EaVersion ??
                                profile.EaVersion;
            if (!string.IsNullOrWhiteSpace(response.ArtifactHash))
                profile.EaHash = response.ArtifactHash;
            profile.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");
            ScenovaRuntime.SaveOrUpdateProfile(profile, profile.IsPrimary);

            return response;
        }
        catch (Exception ex)
        {
            await InstallerDiagnostics.LogAsync(
                "HEARTBEAT_FAIL",
                ex.Message);
            return null;
        }
        finally
        {
            if (owns) http.Dispose();
        }
    }

    private async Task<AgentHeartbeatResponse?> WaitForVerificationAsync(
        AgentConfig profile, TimeSpan timeout)
    {
        var deadline = DateTimeOffset.UtcNow + timeout;
        AgentHeartbeatResponse? last = null;
        while (DateTimeOffset.UtcNow < deadline)
        {
            last = await TryHeartbeatAsync(profile);
            if (last is not null)
            {
                EnsureAccountMatches(profile, last);
                if (IsVerified(profile, last)) return last;
                RenderLive(profile, last);
            }
            await Task.Delay(TimeSpan.FromSeconds(2));
        }
        // The caller must use IsVerified; a final heartbeat is not success.
        return last;
    }

    private void RenderLive(AgentConfig? profile, AgentHeartbeatResponse? heartbeat)
    {
        if (profile is null)
        {
            _live.Text = "ยังไม่ได้เชื่อมต่อ";
            _live.ForeColor = MutedText;
            return;
        }

        var verified = heartbeat is not null && IsVerified(profile, heartbeat);
        if (verified)
        {
            _live.Text = "เชื่อมต่อแล้ว\r\nพร้อมใช้งาน";
            _live.ForeColor = SuccessGreen;
            return;
        }

        if (heartbeat?.EaOnline == true)
        {
            _live.Text = "เชื่อมต่อแล้ว\r\nกำลังตรวจสอบ";
            _live.ForeColor = PrimaryBlue;
            return;
        }

        _live.Text = "รอการเชื่อมต่อ";
        _live.ForeColor = MutedText;
    }

    private void RenderAdvancedDetails(AgentHeartbeatResponse? heartbeat)
    {
        if (!_advancedMode.Checked)
        {
            _advancedDetails.Visible = false;
            return;
        }

        _advancedDetails.Visible = true;
        _advancedDetails.BackColor = Color.White;
        _advancedDetails.ForeColor = Color.FromArgb(46, 63, 84);

        var terminal = _terminal.SelectedItem as TerminalChoice;
        var profile = SelectedProfile();
        var signature = SignatureVerifier.CheckSelf();
        var lines = new List<string>
        {
            "SCENOVA Smart Installer " + InstallerConstants.Version,
            "Profiles: " + ScenovaRuntime.ReadProfiles().Count,
            "Release Channel: " + SelectedReleaseChannel(),
            "",
            "Terminal:",
            terminal?.DataPath ?? "—",
            terminal?.ExecutablePath ?? "—",
            "Broker hint: " + (terminal?.BrokerHint ?? "—"),
            "Match: " + (terminal?.MatchScore ?? 0) + "/100 " + (terminal?.MatchReason ?? ""),
            "",
            "Signature:",
            signature.Signed
                ? (signature.Trusted ? "TRUSTED " : "SIGNED / UNVERIFIED ") + signature.Publisher
                : "UNSIGNED BUILD",
            "",
            "Profile:",
            "Instance: " + (profile?.InstanceId ?? "—"),
            "EA Path: " + (profile?.EaBinaryPath ?? "—"),
            "EA Hash: " + (profile is not null && File.Exists(profile.EaBinaryPath)
                ? BackupManager.HashFile(profile.EaBinaryPath)
                : "—"),
            "Expected Account: " + (profile?.ExpectedAccountNumber ?? "—"),
            "Verified Account: " + (heartbeat?.AccountNumber ?? profile?.VerifiedAccountNumber ?? "—"),
            "Server: " + (heartbeat?.Server ?? profile?.VerifiedServer ?? "—"),
            "Positions: " + (heartbeat?.Positions.ToString() ?? "—"),
            "SafeToRestart: " + (heartbeat?.SafeToRestart.ToString() ?? "—"),
            "Agent Required: " + (heartbeat?.AgentVersionRequired ?? "—"),
            "EA Required: " + (heartbeat?.EaVersionRequired ?? "—"),
            "Backup: " + (BackupManager.LatestSnapshot() ?? "—"),
            "Diagnostics: " + ScenovaRuntime.DiagnosticsPath
        };
        _advancedDetails.Text = string.Join(Environment.NewLine, lines);
    }

    private string SelectedReleaseChannel() =>
        _channel.SelectedIndex switch
        {
            1 => "Beta",
            2 => "AdminTest",
            _ => "Stable"
        };

    private async Task ReportTelemetryAsync(
        AgentConfig profile,
        string action,
        string result,
        InstallerErrorCode errorCode)
    {
        var token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected);
        if (string.IsNullOrWhiteSpace(token)) return;

        using var http = ScenovaClient.NewHttpClient();
        await ScenovaClient.SendInstallerTelemetryAsync(
            http,
            profile.ApiBase,
            new
            {
                instanceId = profile.InstanceId,
                installToken = token,
                installerVersion = InstallerConstants.Version,
                action,
                result,
                errorCode = errorCode.ToString(),
                healthScore = _assessment?.Score ?? 0,
                terminalCount = _terminals.Count,
                selectedTerminal = profile.TerminalDataPath,
                releaseChannel = profile.ReleaseChannel,
                components = new
                {
                    agent = File.Exists(AgentRunner.AgentPath),
                    ea = File.Exists(profile.EaBinaryPath),
                    pendingUpdate = SmartAgentRunner.PendingUpdateExists(profile),
                    profileCount = ScenovaRuntime.ReadProfiles().Count
                }
            });
    }

    private void SaveFailureState(
        string action,
        InstallerErrorCode errorCode)
    {
        var state = ScenovaRuntime.ReadState();
        state.LastAction = action;
        state.LastResult = "FAILED";
        state.LastErrorCode = errorCode.ToString();
        state.RecentErrors.Insert(0, DateTimeOffset.UtcNow.ToString("O") + " " + errorCode);
        if (state.RecentErrors.Count > 10)
            state.RecentErrors = state.RecentErrors.Take(10).ToList();
        ScenovaRuntime.SaveState(state);
    }

    private void SetBusy(bool busy)
    {
        _busy = busy;
        _install.Enabled = !busy;
        _rollback.Enabled = !busy;
        _uninstall.Enabled = !busy;
        _terminal.Enabled = !busy && _terminals.Count > 0;
        _channel.Enabled = !busy;

        _progress.Visible = true;
        if (busy)
        {
            _progress.Style = ProgressBarStyle.Marquee;
            _progress.MarqueeAnimationSpeed = 24;
            _progressPercent.Text = "";
        }
        else
        {
            _progress.MarqueeAnimationSpeed = 0;
            _progress.Style = ProgressBarStyle.Continuous;
            _progress.Value = Math.Clamp(_displayScore, 0, 100);
            _progressPercent.Text = _displayScore + "%";
        }

        _install.Text = busy ? "กำลังดำเนินการ…" : "⟳  ตรวจสอบและอัปเดต";
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
            _brandLogo.Dispose();
        base.Dispose(disposing);
    }
}
