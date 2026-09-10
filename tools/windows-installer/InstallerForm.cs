using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ScenovaInstaller;

internal sealed class InstallerForm : Form
{
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
        Style = ProgressBarStyle.Marquee,
        Visible = false
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
        Text = "โหมดขั้นสูง",
        AutoSize = true
    };

    private readonly Button _install = MakeButton("ติดตั้ง / อัปเดตอัตโนมัติ", 230);
    private readonly Button _repair = MakeButton("ตรวจและซ่อม", 145);
    private readonly Button _verify = MakeButton("ตรวจสอบอีกครั้ง", 145);
    private readonly Button _rollback = MakeButton("ย้อนกลับ", 120);
    private readonly Button _uninstall = MakeButton("ถอน SCENOVA", 130);
    private readonly Button _rescan = MakeButton("สแกน MT5 ใหม่", 135);

    private List<TerminalChoice> _terminals = [];
    private InstallationAssessment? _assessment;
    private bool _busy;

    internal InstallerForm()
    {
        Text = InstallerConstants.ProductName + " v" + InstallerConstants.Version;
        Width = 1080;
        Height = 760;
        MinimumSize = new Size(940, 660);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(5, 16, 35);
        ForeColor = Color.FromArgb(232, 242, 255);
        Font = new Font("Segoe UI", 9.5f);

        _channel.Items.AddRange(["Stable", "Beta", "Admin Test"]);
        var state = ScenovaRuntime.ReadState();
        var desiredChannel = state.ReleaseChannel switch
        {
            "Beta" => 1,
            "AdminTest" => 2,
            _ => 0
        };
        _channel.SelectedIndex = desiredChannel;

        ConfigureHealthList();
        BuildLayout();

        _install.Click += async (_, _) => await InstallOrUpdateAsync();
        _repair.Click += async (_, _) => await RepairAsync();
        _verify.Click += async (_, _) => await RefreshAllAsync();
        _rollback.Click += async (_, _) => await RollbackAsync();
        _uninstall.Click += async (_, _) => await UninstallAsync();
        _rescan.Click += async (_, _) => await RefreshAllAsync();
        _terminal.SelectedIndexChanged += async (_, _) => await AssessSelectedAsync();
        _channel.SelectedIndexChanged += (_, _) =>
        {
            var next = ScenovaRuntime.ReadState();
            next.ReleaseChannel = SelectedReleaseChannel();
            ScenovaRuntime.SaveState(next);
            RenderAdvancedDetails(null);
        };
        _advancedMode.CheckedChanged += (_, _) =>
        {
            _advancedDetails.Visible = _advancedMode.Checked;
            RenderAdvancedDetails(null);
        };

        Shown += async (_, _) => await RefreshAllAsync();
    }

    private static Button MakeButton(string text, int width) =>
        new()
        {
            Text = text,
            Width = width,
            Height = 38,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(17, 76, 145),
            ForeColor = Color.White,
            Margin = new Padding(4),
            Cursor = Cursors.Hand
        };

    private void ConfigureHealthList()
    {
        _health.BackColor = Color.FromArgb(8, 26, 52);
        _health.ForeColor = Color.FromArgb(222, 236, 255);
        _health.BorderStyle = BorderStyle.FixedSingle;
        _health.Columns.Add("ระบบ", 220);
        _health.Columns.Add("สถานะ", 120);
        _health.Columns.Add("รายละเอียด", 470);
    }

    private void BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 4,
            Padding = new Padding(18),
            BackColor = BackColor
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 72));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 28));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 76));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));

        var header = new Panel { Dock = DockStyle.Fill };
        var brand = new Label
        {
            Text = "SCENOVA",
            Font = new Font("Segoe UI", 27, FontStyle.Bold),
            ForeColor = Color.FromArgb(41, 176, 255),
            AutoSize = true,
            Location = new Point(6, 3)
        };
        var title = new Label
        {
            Text = "Smart Installer",
            Font = new Font("Segoe UI", 20, FontStyle.Bold),
            ForeColor = Color.White,
            AutoSize = true,
            Location = new Point(220, 10)
        };
        var subtitle = new Label
        {
            Text = "ค้นหา MT5 · ติดตั้ง · ซ่อม · อัปเดตอย่างปลอดภัย · ยืนยันการเชื่อมต่อ",
            ForeColor = Color.FromArgb(155, 189, 225),
            AutoSize = true,
            Location = new Point(222, 51)
        };
        header.Controls.Add(brand);
        header.Controls.Add(title);
        header.Controls.Add(subtitle);
        root.Controls.Add(header, 0, 0);
        root.SetColumnSpan(header, 2);

        var selector = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            Padding = new Padding(2)
        };
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 125));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 165));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 145));
        selector.Controls.Add(new Label
        {
            Text = "MetaTrader 5",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.FromArgb(188, 214, 244)
        }, 0, 0);
        selector.Controls.Add(_terminal, 1, 0);

        var channelPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false
        };
        channelPanel.Controls.Add(_channel);
        channelPanel.Controls.Add(_advancedMode);
        selector.Controls.Add(channelPanel, 2, 0);
        selector.Controls.Add(_rescan, 3, 0);

        root.Controls.Add(selector, 0, 1);
        root.SetColumnSpan(selector, 2);

        var center = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Padding = new Padding(0, 4, 8, 4)
        };
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));
        center.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 16));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 116));
        center.Controls.Add(_score, 0, 0);
        center.Controls.Add(_health, 0, 1);
        center.Controls.Add(_progress, 0, 2);
        center.Controls.Add(_status, 0, 3);
        root.Controls.Add(center, 0, 2);

        var right = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            Padding = new Padding(8, 4, 0, 4),
            BackColor = Color.FromArgb(7, 22, 46)
        };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 138));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var liveTitle = new Label
        {
            Text = "Live Status / Verification",
            Dock = DockStyle.Top,
            Height = 28,
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            ForeColor = Color.FromArgb(94, 194, 255)
        };
        var livePanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10) };
        livePanel.Controls.Add(_live);
        livePanel.Controls.Add(liveTitle);
        right.Controls.Add(livePanel, 0, 0);
        right.Controls.Add(_advancedDetails, 0, 1);
        root.Controls.Add(right, 1, 2);

        var actions = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Padding = new Padding(0, 10, 0, 0)
        };
        _install.BackColor = Color.FromArgb(0, 140, 230);
        actions.Controls.Add(_install);
        actions.Controls.Add(_repair);
        actions.Controls.Add(_verify);
        actions.Controls.Add(_rollback);
        actions.Controls.Add(_uninstall);
        root.Controls.Add(actions, 0, 3);
        root.SetColumnSpan(actions, 2);

        Controls.Add(root);
    }

    private async Task RefreshAllAsync()
    {
        if (_busy) return;

        _terminals = TerminalDiscovery.Discover();
        var previous = (_terminal.SelectedItem as TerminalChoice)?.DataPath
                       ?? ScenovaRuntime.ReadState().LastTerminalPath;
        _terminal.Items.Clear();
        foreach (var item in _terminals)
            _terminal.Items.Add(item);

        if (_terminals.Count == 0)
        {
            _terminal.Enabled = false;
            _status.Text = "ไม่พบ MT5 · กรุณาเปิด MetaTrader 5 อย่างน้อย 1 ครั้ง แล้วกดสแกนใหม่";
            _score.Text = "Installation Score: 0/100 · NEED ACTION";
            RenderHealth(new InstallationAssessment
            {
                Score = 0,
                Summary = "ไม่พบ MetaTrader 5",
                Checks =
                [
                    new HealthCheckResult
                    {
                        Code = "MT5_NOT_FOUND",
                        Title = "Auto Detect MT5",
                        Detail = "ไม่พบ MetaQuotes Terminal Data Folder",
                        State = HealthState.NeedAction,
                        Weight = 1
                    }
                ]
            });
            return;
        }

        _terminal.Enabled = true;
        var index = _terminals.FindIndex(x =>
            string.Equals(x.DataPath, previous, StringComparison.OrdinalIgnoreCase));
        _terminal.SelectedIndex = index >= 0 ? index : 0;
        await AssessSelectedAsync();
    }

    private async Task AssessSelectedAsync()
    {
        if (_busy || _terminal.SelectedItem is not TerminalChoice terminal)
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
        _health.Items.Clear();
        foreach (var check in assessment.Checks)
        {
            var status = check.State switch
            {
                HealthState.Ready => "READY",
                HealthState.AutoFix => "AUTO FIX",
                HealthState.Warning => "WARNING",
                HealthState.NeedAction => "NEED ACTION",
                _ => "INFO"
            };
            var item = new ListViewItem(check.Title);
            item.SubItems.Add(status);
            item.SubItems.Add(check.Detail);
            item.ForeColor = check.State switch
            {
                HealthState.Ready => Color.FromArgb(99, 230, 175),
                HealthState.NeedAction => Color.FromArgb(255, 153, 117),
                HealthState.Warning => Color.FromArgb(255, 210, 113),
                HealthState.AutoFix => Color.FromArgb(96, 190, 255),
                _ => Color.FromArgb(210, 225, 245)
            };
            _health.Items.Add(item);
        }

        _score.Text =
            $"Installation Score: {assessment.Score}/100 · {assessment.Summary}";
        _score.Font = new Font("Segoe UI", 13, FontStyle.Bold);
        _score.ForeColor = assessment.Score >= 90
            ? Color.FromArgb(73, 238, 179)
            : assessment.Score >= 70
                ? Color.FromArgb(92, 190, 255)
                : Color.FromArgb(255, 178, 98);
    }

    private async Task InstallOrUpdateAsync()
    {
        if (_terminal.SelectedItem is not TerminalChoice terminal) return;
        SetBusy(true);
        AgentConfig? profile = null;
        try
        {
            await InstallerDiagnostics.LogAsync("INSTALL_BEGIN", terminal.DataPath);
            _status.Text = "กำลังตรวจ System Health...";
            var assessment = await SmartHealthEngine.AssessAsync(terminal);
            RenderHealth(assessment);

            if (assessment.Checks.Any(x => x.State == HealthState.NeedAction))
            {
                var blocking = assessment.Checks
                    .Where(x => x.State == HealthState.NeedAction)
                    .Select(x => x.Title);
                throw new InvalidOperationException(
                    "ต้องแก้ก่อนติดตั้ง: " + string.Join(", ", blocking));
            }

            Directory.CreateDirectory(ScenovaRuntime.BaseDir);
            Directory.CreateDirectory(ScenovaRuntime.StagingDir);

            profile = SelectedProfile();
            var code = ScenovaRuntime.ReadEnrollmentCode();

            if (profile is null && string.IsNullOrWhiteSpace(code))
                throw new InvalidOperationException(
                    "ไฟล์นี้ไม่มีรหัสติดตั้ง กรุณาดาวน์โหลดจาก SCENOVA Control Center");

            if (!string.IsNullOrWhiteSpace(code))
            {
                _status.Text = "กำลังเชื่อม Slot และ Smart Terminal Matching...";
                profile = await EnrollProfileAsync(terminal, code!, profile);
            }

            if (profile is null)
                throw new InvalidOperationException(
                    "ไม่พบ SCENOVA Profile สำหรับ Terminal นี้");

            var token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected)
                        ?? throw new InvalidOperationException("install token unavailable");

            using var http = ScenovaClient.NewHttpClient();
            var heartbeat = await TryHeartbeatAsync(profile, http);

            if (heartbeat is null)
            {
                // New install can download directly from enroll metadata already
                // stored in the profile. Existing installs require server check.
                if (string.IsNullOrWhiteSpace(profile.EaHash))
                    throw new InvalidOperationException(
                        "SCENOVA Server ยังไม่คืนข้อมูล EA release");
            }
            else
            {
                _status.Text = "กำลังวางแผนอัปเดตเฉพาะ Component ที่จำเป็น...";
                var plan = SmartHealthEngine.BuildPlan(terminal, profile, heartbeat);
                _status.Text = plan.Summary;

                if (!string.IsNullOrWhiteSpace(heartbeat.ArtifactHash))
                {
                    await SmartAgentRunner.EnsureEaArtifactAsync(
                        http,
                        profile,
                        token,
                        heartbeat,
                        ScenovaRuntime.DiagnosticsPath);
                }

                if (heartbeat.SafeToRestart)
                {
                    AgentRunner.EnsureMt5RunningWithEa(profile, forceReload: true);
                }
                else if (SmartAgentRunner.PendingUpdateExists(profile))
                {
                    _status.Text =
                        "พบ Position/สถานะ RUNNING · เก็บ EA ใหม่ไว้ใน Staging แล้ว จะอัปเดตอัตโนมัติเมื่อ Safe Stop";
                }
            }

            if (!File.Exists(profile.EaBinaryPath) && !string.IsNullOrWhiteSpace(profile.EaHash))
            {
                _status.Text = "กำลังดาวน์โหลด EA ด้วย Resume / Retry...";
                var staged = Path.Combine(
                    ScenovaRuntime.StagingDir,
                    "install-" + profile.InstanceId + ".ex5");
                await ScenovaClient.DownloadArtifactResumableAsync(
                    http,
                    profile.ApiBase,
                    profile.InstanceId,
                    token,
                    staged,
                    profile.EaHash,
                    profile.ReleaseChannel);

                BackupManager.CreateSnapshot(profile, terminal.DataPath);
                Directory.CreateDirectory(Path.GetDirectoryName(profile.EaBinaryPath)!);
                File.Move(staged, profile.EaBinaryPath, true);
            }

            _status.Text = "กำลัง Migrate preset โดยรักษาค่าที่คุณตั้งไว้...";
            PresetManager.Migrate(
                Path.Combine(
                    profile.TerminalDataPath,
                    "MQL5",
                    "Presets",
                    "SCENOVA-FastBasketBot.set"),
                profile.ApiBase,
                profile.InstanceId,
                token);

            profile.InstallerVersion = InstallerConstants.Version;
            // Preserve the Server-resolved channel. A requested Beta/AdminTest
            // channel may have been safely downgraded to Stable by policy.
            if (string.IsNullOrWhiteSpace(profile.ReleaseChannel))
                profile.ReleaseChannel = SelectedReleaseChannel();
            profile.UpdatedAt = DateTimeOffset.UtcNow.ToString("O");
            ScenovaRuntime.SaveOrUpdateProfile(profile, makePrimary: true);

            _status.Text = "กำลังติดตั้ง / ซ่อม Device Agent...";
            AgentRunner.InstallAndStart();

            if (!AgentRunner.IsMt5Running(profile))
            {
                _status.Text = "กำลังเปิด MT5 พร้อม SCENOVA...";
                AgentRunner.EnsureMt5RunningWithEa(profile, forceReload: false);
            }

            _status.Text = "กำลัง Post-install Self Test...";
            var verified = await WaitForVerificationAsync(profile, TimeSpan.FromSeconds(40));

            var state = ScenovaRuntime.ReadState();
            state.LastAction = "INSTALL_OR_UPDATE";
            state.LastResult = verified is not null && verified.EaOnline ? "SUCCESS" : "PARTIAL";
            state.LastInstallAt = DateTimeOffset.UtcNow.ToString("O");
            state.LastAgentVersion = InstallerConstants.AgentVersion;
            state.LastEaVersion = verified?.EaVersion ?? profile.EaVersion;
            state.LastEaHash = profile.EaHash;
            state.LastErrorCode = "";
            ScenovaRuntime.SaveState(state);

            await ReportTelemetryAsync(
                profile,
                "INSTALL_OR_UPDATE",
                state.LastResult,
                InstallerErrorCode.None);

            if (verified is not null && verified.EaOnline)
            {
                _status.Text =
                    "พร้อมใช้งาน · Agent Online · EA " +
                    (verified.EaVersion ?? "OK") +
                    " · Account " +
                    (verified.AccountNumber ?? "กำลังยืนยัน") +
                    " · " +
                    (verified.Server ?? "");
            }
            else
            {
                _status.Text =
                    "ติดตั้งสำเร็จ แต่ EA ยังไม่ Heartbeat · กด “ตรวจและซ่อม” เพื่อให้ระบบแก้การเปิด MT5 / preset / permission";
            }

            await RefreshAllAsync();
        }
        catch (Exception ex)
        {
            var code = InstallerDiagnostics.Classify(ex);
            await InstallerDiagnostics.LogAsync("INSTALL_ERROR", code + " " + ex.Message);
            SaveFailureState("INSTALL_OR_UPDATE", code);

            if (profile is not null)
                await ReportTelemetryAsync(profile, "INSTALL_OR_UPDATE", "FAILED", code);

            _status.Text =
                "ไม่สำเร็จ [" + code + "] · " +
                InstallerDiagnostics.Friendly(code, ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
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

    private async Task RepairAsync()
    {
        if (_terminal.SelectedItem is not TerminalChoice terminal) return;
        SetBusy(true);
        try
        {
            _status.Text = "กำลัง Auto Fix...";
            var actions = await InstallerRepair.RepairAsync(terminal);
            var profile = SelectedProfile();

            if (profile is not null)
            {
                var heartbeat = await TryHeartbeatAsync(profile);
                if (heartbeat is not null)
                {
                    var token = ScenovaRuntime.TryUnprotect(profile.InstallTokenProtected);
                    if (!string.IsNullOrWhiteSpace(token))
                    {
                        using var http = ScenovaClient.NewHttpClient();
                        await SmartAgentRunner.EnsureEaArtifactAsync(
                            http,
                            profile,
                            token,
                            heartbeat,
                            ScenovaRuntime.DiagnosticsPath);
                    }

                    if (heartbeat.SafeToRestart && !heartbeat.EaOnline)
                        AgentRunner.EnsureMt5RunningWithEa(profile, forceReload: true);
                }

                await ReportTelemetryAsync(
                    profile,
                    "REPAIR",
                    "SUCCESS",
                    InstallerErrorCode.None);
            }

            var state = ScenovaRuntime.ReadState();
            state.LastAction = "REPAIR";
            state.LastResult = "SUCCESS";
            state.LastRepairAt = DateTimeOffset.UtcNow.ToString("O");
            state.LastErrorCode = "";
            ScenovaRuntime.SaveState(state);

            _status.Text = "ซ่อมเสร็จ · " + string.Join(" · ", actions);
            await RefreshAllAsync();
        }
        catch (Exception ex)
        {
            var code = InstallerDiagnostics.Classify(ex);
            SaveFailureState("REPAIR", code);
            _status.Text = "ซ่อมไม่สำเร็จ [" + code + "] · " +
                           InstallerDiagnostics.Friendly(code, ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
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
            await RefreshAllAsync();
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
            await RefreshAllAsync();
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
        AgentConfig profile,
        TimeSpan timeout)
    {
        var deadline = DateTimeOffset.UtcNow + timeout;
        AgentHeartbeatResponse? last = null;
        while (DateTimeOffset.UtcNow < deadline)
        {
            last = await TryHeartbeatAsync(profile);
            if (last is not null)
            {
                var localHash = File.Exists(profile.EaBinaryPath)
                    ? BackupManager.HashFile(profile.EaBinaryPath)
                    : "";
                var hashOk = string.IsNullOrWhiteSpace(last.ArtifactHash) ||
                             string.Equals(
                                 localHash,
                                 last.ArtifactHash,
                                 StringComparison.OrdinalIgnoreCase);

                var accountOk = string.IsNullOrWhiteSpace(profile.ExpectedAccountNumber) ||
                                string.IsNullOrWhiteSpace(last.AccountNumber) ||
                                string.Equals(
                                    profile.ExpectedAccountNumber,
                                    last.AccountNumber,
                                    StringComparison.OrdinalIgnoreCase);
                var serverOk = string.IsNullOrWhiteSpace(profile.ExpectedServer) ||
                               string.IsNullOrWhiteSpace(last.Server) ||
                               string.Equals(
                                   profile.ExpectedServer,
                                   last.Server,
                                   StringComparison.OrdinalIgnoreCase);

                if (!accountOk || !serverOk)
                    throw new InvalidOperationException("account mismatch");

                if (last.EaOnline && hashOk && !last.AgentUpdateRequired)
                    return last;
            }

            await Task.Delay(TimeSpan.FromSeconds(2));
        }
        return last;
    }

    private void RenderLive(
        AgentConfig? profile,
        AgentHeartbeatResponse? heartbeat)
    {
        if (profile is null)
        {
            _live.Text =
                "EA: ยังไม่ติดตั้ง\r\n" +
                "Agent: " + (File.Exists(AgentRunner.AgentPath) ? "พบไฟล์" : "ยังไม่ติดตั้ง") + "\r\n" +
                "Heartbeat: รอการติดตั้ง\r\n" +
                "Release Channel: " + SelectedReleaseChannel();
            return;
        }

        var localHash = File.Exists(profile.EaBinaryPath)
            ? BackupManager.HashFile(profile.EaBinaryPath)
            : "";
        var hashOk = heartbeat is not null &&
                     !string.IsNullOrWhiteSpace(heartbeat.ArtifactHash) &&
                     string.Equals(
                         localHash,
                         heartbeat.ArtifactHash,
                         StringComparison.OrdinalIgnoreCase);

        _live.Text =
            "EA Version: " + (heartbeat?.EaVersion ?? profile.EaVersion ?? "—") + "\r\n" +
            "Agent: " + (File.Exists(AgentRunner.AgentPath) ? "Installed" : "Missing") + "\r\n" +
            "Heartbeat: " + (heartbeat?.EaOnline == true ? "OK" : "WAITING") + "\r\n" +
            "Hash: " + (hashOk ? "OK" : SmartAgentRunner.PendingUpdateExists(profile) ? "UPDATE PENDING" : "CHECK") + "\r\n" +
            "Account: " + (heartbeat?.AccountNumber ?? profile.VerifiedAccountNumber ?? "—") + "\r\n" +
            "Server: " + (heartbeat?.Server ?? profile.VerifiedServer ?? "—") + "\r\n" +
            "Channel: " + (heartbeat?.ReleaseChannel ?? profile.ReleaseChannel);
        _live.ForeColor = heartbeat?.EaOnline == true
            ? Color.FromArgb(88, 231, 177)
            : Color.FromArgb(143, 194, 239);
    }

    private void RenderAdvancedDetails(AgentHeartbeatResponse? heartbeat)
    {
        if (!_advancedMode.Checked)
        {
            _advancedDetails.Visible = false;
            return;
        }

        _advancedDetails.Visible = true;
        _advancedDetails.BackColor = Color.FromArgb(4, 15, 31);
        _advancedDetails.ForeColor = Color.FromArgb(176, 208, 238);

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
        _progress.Visible = busy;
        _install.Enabled = !busy;
        _repair.Enabled = !busy;
        _verify.Enabled = !busy;
        _rollback.Enabled = !busy;
        _uninstall.Enabled = !busy;
        _rescan.Enabled = !busy;
        _terminal.Enabled = !busy && _terminals.Count > 0;
        _channel.Enabled = !busy;
    }
}
