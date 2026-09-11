$ErrorActionPreference = 'Stop'

function Read-Normalized([string]$path) {
  return [System.IO.File]::ReadAllText((Resolve-Path $path)).Replace("`r`n", "`n")
}

function Write-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText((Resolve-Path $path), $text, [System.Text.UTF8Encoding]::new($false))
}

function Replace-Required([string]$text, [string]$old, [string]$new, [string]$label) {
  $old = $old.Replace("`r`n", "`n")
  $new = $new.Replace("`r`n", "`n")
  if (-not $text.Contains($old)) {
    throw "Patch anchor not found: $label"
  }
  Write-Host "Patched: $label"
  return $text.Replace($old, $new)
}

# ---------------------------------------------------------------------------
# Brand asset: remove only the connected dark JPEG background from the edges.
# This changes rendering only; the embedded SCENOVA artwork remains the source.
# ---------------------------------------------------------------------------
$brandPath = 'tools/windows-installer/BrandAssets.cs'
$brand = Read-Normalized $brandPath
$brandOld = @'
    internal static Image LoadScenovaLogo()
    {
        var bytes = Convert.FromBase64String(ScenovaLogoJpegBase64);
        using var stream = new MemoryStream(bytes);
        using var image = Image.FromStream(stream);
        return new Bitmap(image);
    }
'@
$brandNew = @'
    internal static Image LoadScenovaLogo()
    {
        var bytes = Convert.FromBase64String(ScenovaLogoJpegBase64);
        using var stream = new MemoryStream(bytes);
        using var image = Image.FromStream(stream);
        using var source = new Bitmap(image);
        return RemoveConnectedBackground(source);
    }

    private static Bitmap RemoveConnectedBackground(Bitmap source)
    {
        var result = new Bitmap(source.Width, source.Height);
        using (var graphics = Graphics.FromImage(result))
        {
            graphics.Clear(Color.Transparent);
            graphics.DrawImageUnscaled(source, 0, 0);
        }

        var background = result.GetPixel(0, 0);
        var visited = new bool[result.Width, result.Height];
        var queue = new Queue<Point>();

        bool SimilarToBackground(Color color)
        {
            var dr = color.R - background.R;
            var dg = color.G - background.G;
            var db = color.B - background.B;
            return dr * dr + dg * dg + db * db <= 46 * 46;
        }

        void Enqueue(int x, int y)
        {
            if (x < 0 || y < 0 || x >= result.Width || y >= result.Height) return;
            if (visited[x, y] || !SimilarToBackground(result.GetPixel(x, y))) return;
            visited[x, y] = true;
            queue.Enqueue(new Point(x, y));
        }

        for (var x = 0; x < result.Width; x++)
        {
            Enqueue(x, 0);
            Enqueue(x, result.Height - 1);
        }
        for (var y = 0; y < result.Height; y++)
        {
            Enqueue(0, y);
            Enqueue(result.Width - 1, y);
        }

        while (queue.Count > 0)
        {
            var point = queue.Dequeue();
            result.SetPixel(point.X, point.Y, Color.Transparent);
            Enqueue(point.X - 1, point.Y);
            Enqueue(point.X + 1, point.Y);
            Enqueue(point.X, point.Y - 1);
            Enqueue(point.X, point.Y + 1);
        }

        return result;
    }
'@
$brand = Replace-Required $brand $brandOld $brandNew 'transparent SCENOVA logo background'
Write-Utf8 $brandPath $brand

# ---------------------------------------------------------------------------
# Installer UI: visual-only refresh. No install/repair/scan/update methods are
# changed here. Layout is made DPI-safe and text columns resize with the window.
# ---------------------------------------------------------------------------
$formPath = 'tools/windows-installer/InstallerForm.cs'
$form = Read-Normalized $formPath

$form = Replace-Required $form @'
internal sealed class InstallerForm : Form
{
'@ @'
internal sealed class InstallerForm : Form
{
    private static readonly Color PrimaryBlue = Color.FromArgb(15, 112, 230);
    private static readonly Color AccentCyan = Color.FromArgb(15, 170, 230);
    private static readonly Color Navy = Color.FromArgb(16, 45, 87);
    private static readonly Color SoftBackground = Color.FromArgb(244, 248, 253);
    private static readonly Color CardBackground = Color.White;
    private static readonly Color BorderBlue = Color.FromArgb(205, 222, 242);
    private static readonly Color MutedText = Color.FromArgb(83, 105, 133);
    private static readonly Color SuccessGreen = Color.FromArgb(0, 145, 91);
'@ 'installer theme colors'

$form = Replace-Required $form @'
        Width = 1080;
        Height = 760;
        MinimumSize = new Size(940, 660);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.White;
        ForeColor = Color.FromArgb(29, 42, 58);
        Font = new Font("Segoe UI", 9.5f);
'@ @'
        Width = 1200;
        Height = 810;
        MinimumSize = new Size(1080, 720);
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        DoubleBuffered = true;
        BackColor = SoftBackground;
        ForeColor = Color.FromArgb(29, 42, 58);
        Font = new Font("Segoe UI", 10f);
'@ 'DPI-safe window size and typography'

$form = Replace-Required $form @'
    private static Button MakeButton(string text, int width) =>
        new()
        {
            Text = text,
            Width = width,
            Height = 38,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(31, 111, 205),
            ForeColor = Color.White,
            Margin = new Padding(4),
            Cursor = Cursors.Hand
        };
'@ @'
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
'@ 'modern action buttons'

$form = Replace-Required $form @'
    private void ConfigureHealthList()
    {
        _health.BackColor = Color.White;
        _health.ForeColor = Color.FromArgb(32, 47, 65);
        _health.BorderStyle = BorderStyle.FixedSingle;
        _health.Columns.Add("ระบบ", 220);
        _health.Columns.Add("สถานะ", 120);
        _health.Columns.Add("รายละเอียด", 470);
    }
'@ @'
    private void ConfigureHealthList()
    {
        _health.BackColor = CardBackground;
        _health.ForeColor = Color.FromArgb(32, 47, 65);
        _health.BorderStyle = BorderStyle.FixedSingle;
        _health.Font = new Font("Segoe UI", 10f);
        _health.Columns.Add("ระบบ");
        _health.Columns.Add("สถานะ");
        _health.Columns.Add("รายละเอียด");
        _health.Resize += (_, _) => ResizeHealthColumns();
        ResizeHealthColumns();
    }

    private void ResizeHealthColumns()
    {
        if (_health.Columns.Count < 3) return;
        var width = Math.Max(640, _health.ClientSize.Width - 6);
        _health.Columns[0].Width = Math.Max(190, (int)(width * 0.29));
        _health.Columns[1].Width = Math.Max(110, (int)(width * 0.17));
        _health.Columns[2].Width = Math.Max(300, width - _health.Columns[0].Width - _health.Columns[1].Width);
    }
'@ 'responsive health columns'

$form = Replace-Required $form @'
            Padding = new Padding(22),
            BackColor = Color.FromArgb(248, 250, 253)
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 72));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 28));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 104));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 76));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
'@ @'
            Padding = new Padding(20),
            BackColor = SoftBackground
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 74));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 26));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 112));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 82));
'@ 'balanced main layout'

$form = Replace-Required $form @'
        var header = new Panel { Dock = DockStyle.Fill };
        var brand = new PictureBox
        {
            Image = _brandLogo,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.White,
            Location = new Point(4, 8),
            Size = new Size(205, 70),
            AccessibleName = "SCENOVA"
        };
        var divider = new Panel
        {
            BackColor = Color.FromArgb(206, 220, 237),
            Location = new Point(220, 12),
            Size = new Size(1, 60)
        };
        var title = new Label
        {
            Text = "SCENOVA Smart Installer",
            Font = new Font("Segoe UI", 20, FontStyle.Bold),
            ForeColor = Color.FromArgb(20, 48, 84),
            AutoSize = true,
            Location = new Point(240, 8)
        };
        var subtitle = new Label
        {
            Text = "ค้นหา MT5 · ติดตั้ง · ซ่อม · อัปเดตอย่างปลอดภัย · ยืนยันการเชื่อมต่อ",
            ForeColor = Color.FromArgb(91, 113, 139),
            AutoSize = true,
            Location = new Point(242, 52)
        };
'@ @'
        var header = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent,
            Padding = new Padding(2)
        };
        var brand = new PictureBox
        {
            Image = _brandLogo,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Transparent,
            Location = new Point(6, 12),
            Size = new Size(225, 74),
            AccessibleName = "SCENOVA"
        };
        var divider = new Panel
        {
            BackColor = BorderBlue,
            Location = new Point(244, 18),
            Size = new Size(2, 62)
        };
        var title = new Label
        {
            Text = "SCENOVA Smart Installer",
            Font = new Font("Segoe UI Semibold", 24f, FontStyle.Bold),
            ForeColor = Navy,
            AutoSize = false,
            AutoEllipsis = true,
            Location = new Point(268, 8),
            Size = new Size(650, 44),
            UseCompatibleTextRendering = true
        };
        var subtitle = new Label
        {
            Text = "ค้นหา MT5 · ติดตั้ง · ซ่อม · อัปเดตอย่างปลอดภัย · ยืนยันการเชื่อมต่อ",
            Font = new Font("Segoe UI", 10.25f),
            ForeColor = MutedText,
            AutoSize = false,
            AutoEllipsis = true,
            Location = new Point(270, 55),
            Size = new Size(690, 32),
            UseCompatibleTextRendering = true
        };
'@ 'transparent brand header and safe text bounds'

$form = Replace-Required $form @'
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
            ForeColor = Color.FromArgb(46, 63, 84)
        }, 0, 0);
'@ @'
            ColumnCount = 4,
            Padding = new Padding(12, 8, 10, 8),
            BackColor = CardBackground,
            Margin = new Padding(0, 0, 0, 8)
        };
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 155));
        selector.Controls.Add(new Label
        {
            Text = "MetaTrader 5",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI Semibold", 10.5f),
            ForeColor = Navy,
            AutoEllipsis = true,
            UseCompatibleTextRendering = true
        }, 0, 0);
'@ 'clean MT5 selector card'

$form = Replace-Required $form @'
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));
        center.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 16));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 116));
'@ @'
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 76));
        center.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 16));
        center.RowStyles.Add(new RowStyle(SizeType.Absolute, 104));
        _score.BackColor = Color.FromArgb(235, 249, 243);
        _score.Padding = new Padding(18, 0, 12, 0);
        _score.UseCompatibleTextRendering = true;
        _status.BackColor = CardBackground;
        _status.ForeColor = MutedText;
        _status.Padding = new Padding(12, 4, 12, 4);
        _status.Font = new Font("Segoe UI", 9.75f);
        _status.UseCompatibleTextRendering = true;
'@ 'score and footer status cards'

$form = Replace-Required $form @'
            Padding = new Padding(8, 4, 0, 4),
            BackColor = Color.FromArgb(238, 246, 255)
        };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 138));
'@ @'
            Padding = new Padding(10, 4, 0, 4),
            BackColor = Color.FromArgb(239, 247, 255)
        };
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 205));
'@ 'larger live status panel'

$form = Replace-Required $form @'
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            ForeColor = Color.FromArgb(24, 104, 196)
        };
        var livePanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(10) };
'@ @'
            Font = new Font("Segoe UI Semibold", 12f, FontStyle.Bold),
            ForeColor = PrimaryBlue,
            UseCompatibleTextRendering = true
        };
        _live.Font = new Font("Segoe UI", 10f);
        _live.ForeColor = Navy;
        _live.Padding = new Padding(2, 6, 2, 0);
        _live.UseCompatibleTextRendering = true;
        var livePanel = new Panel { Dock = DockStyle.Fill, Padding = new Padding(12), BackColor = CardBackground };
'@ 'live status typography'

$form = Replace-Required $form @'
        _install.BackColor = Color.FromArgb(22, 132, 224);
        actions.Controls.Add(_install);
        actions.Controls.Add(_repair);
        actions.Controls.Add(_verify);
        actions.Controls.Add(_rollback);
        actions.Controls.Add(_uninstall);
'@ @'
        _install.BackColor = PrimaryBlue;
        _install.ForeColor = Color.White;
        _install.FlatAppearance.BorderColor = PrimaryBlue;
        foreach (var secondary in new[] { _repair, _verify, _rollback })
        {
            secondary.BackColor = Color.White;
            secondary.ForeColor = PrimaryBlue;
            secondary.FlatAppearance.BorderColor = BorderBlue;
            secondary.FlatAppearance.BorderSize = 1;
        }
        _uninstall.BackColor = Color.White;
        _uninstall.ForeColor = Color.FromArgb(196, 54, 54);
        _uninstall.FlatAppearance.BorderColor = Color.FromArgb(240, 196, 196);
        _uninstall.FlatAppearance.BorderSize = 1;
        actions.Controls.Add(_install);
        actions.Controls.Add(_repair);
        actions.Controls.Add(_verify);
        actions.Controls.Add(_rollback);
        actions.Controls.Add(_uninstall);
'@ 'primary and secondary action styling'

$form = Replace-Required $form @'
        _score.Font = new Font("Segoe UI", 13, FontStyle.Bold);
        _score.ForeColor = assessment.Score >= 90
            ? Color.FromArgb(8, 140, 93)
            : assessment.Score >= 70
                ? Color.FromArgb(25, 104, 190)
                : Color.FromArgb(183, 112, 0);
'@ @'
        _score.Font = new Font("Segoe UI Semibold", 15f, FontStyle.Bold);
        _score.ForeColor = assessment.Score >= 90
            ? SuccessGreen
            : assessment.Score >= 70
                ? PrimaryBlue
                : Color.FromArgb(183, 112, 0);
'@ 'installation score visual hierarchy'

$renderLiveOld = @'
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
            ? Color.FromArgb(8, 140, 93)
            : Color.FromArgb(25, 104, 190);
    }
'@
$renderLiveNew = @'
    private void RenderLive(
        AgentConfig? profile,
        AgentHeartbeatResponse? heartbeat)
    {
        if (profile is null)
        {
            _live.Text =
                "EA Version: ยังไม่ติดตั้ง\r\n" +
                "Installer: " + InstallerConstants.Version + "\r\n" +
                "Agent: " + (File.Exists(AgentRunner.AgentPath) ? "Installed" : "ยังไม่ติดตั้ง") + "\r\n" +
                "Heartbeat: รอการติดตั้ง\r\n" +
                "Channel: " + SelectedReleaseChannel();
            _live.ForeColor = PrimaryBlue;
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
        var runtimeVersion = (heartbeat?.EaVersion ?? "").Trim();
        var requiredVersion = (heartbeat?.EaVersionRequired ?? profile.EaVersion ?? InstallerConstants.Version).Trim();
        var runtimeMatches = !string.IsNullOrWhiteSpace(runtimeVersion) &&
                             !string.IsNullOrWhiteSpace(requiredVersion) &&
                             string.Equals(runtimeVersion, requiredVersion, StringComparison.OrdinalIgnoreCase);
        var versionLine = runtimeMatches
            ? "EA Version: " + requiredVersion
            : "EA Runtime: " + (string.IsNullOrWhiteSpace(runtimeVersion) ? "รอตรวจ" : runtimeVersion) +
              "  →  ล่าสุด " + (string.IsNullOrWhiteSpace(requiredVersion) ? InstallerConstants.Version : requiredVersion);

        _live.Text =
            versionLine + "\r\n" +
            "Installer / Agent: " + InstallerConstants.Version + "\r\n" +
            "Agent: " + (File.Exists(AgentRunner.AgentPath) ? "Installed" : "Missing") + "\r\n" +
            "Heartbeat: " + (heartbeat?.EaOnline == true ? "OK" : "WAITING") + "\r\n" +
            "Hash: " + (hashOk ? "OK" : SmartAgentRunner.PendingUpdateExists(profile) ? "UPDATE PENDING" : "CHECK") + "\r\n" +
            "Account: " + (heartbeat?.AccountNumber ?? profile.VerifiedAccountNumber ?? "—") + "\r\n" +
            "Server: " + (heartbeat?.Server ?? profile.VerifiedServer ?? "—");
        _live.ForeColor = heartbeat?.EaOnline == true && runtimeMatches && hashOk
            ? SuccessGreen
            : runtimeMatches
                ? PrimaryBlue
                : Color.FromArgb(190, 111, 0);
    }
'@
$form = Replace-Required $form $renderLiveOld $renderLiveNew 'accurate runtime versus required version display'
Write-Utf8 $formPath $form

# ---------------------------------------------------------------------------
# Manual EA update bug: one user click must first transition the EA to SAFE_STOP
# before the Agent's safe-to-restart gate can authorize exactly one MT5 restart.
# ---------------------------------------------------------------------------
$manualPath = 'apps/api/src/manual-mt5.controller.ts'
$manual = Read-Normalized $manualPath
$manualOld = @'
    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='STOPPED',
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'startAfterRepairRequested',false,
             'startAfterRepairStatus','IDLE',
             'manualMt5ActionName',$2::text,
             'manualMt5ActionId',$3::text,
             'manualMt5ActionRequestedAt',$4::text,
             'manualMt5ActionStatus','PENDING',
             'manualMt5ActionSource','USER',
             'manualMt5ActionMessage',$5::text
           )
       WHERE id=$1`,
      [instance.id, action, actionId, requestedAt, message]
    );

    return {
'@
$manualNew = @'
    await this.db.query(
      `UPDATE bot_instances
       SET desired_state='SAFE_STOP',
           metrics=COALESCE(metrics,'{}'::jsonb) || jsonb_build_object(
             'startAfterRepairRequested',false,
             'startAfterRepairStatus','IDLE',
             'manualMt5ActionName',$2::text,
             'manualMt5ActionId',$3::text,
             'manualMt5ActionRequestedAt',$4::text,
             'manualMt5ActionStatus','PENDING',
             'manualMt5ActionSource','USER',
             'manualMt5ActionMessage',$5::text
           )
       WHERE id=$1`,
      [instance.id, action, actionId, requestedAt, message]
    );

    // The restart gate requires actual_state to leave RUNNING. Merely changing
    // desired_state was not enough because an online EA could remain RUNNING
    // indefinitely with no matching control command. Deliver one SAFE_STOP so
    // the EA acknowledges a restart-safe state; no position is force-closed.
    await this.db.query(
      "UPDATE bot_commands SET status='ACKED',acked_at=now() WHERE bot_instance_id=$1 AND status IN ('PENDING','DELIVERED') AND command IN ('START','SAFE_STOP','CLOSE_ALL')",
      [instance.id]
    );
    await this.db.query(
      "INSERT INTO bot_commands(bot_instance_id,command) VALUES($1,'SAFE_STOP')",
      [instance.id]
    );

    return {
'@
$manual = Replace-Required $manual $manualOld $manualNew 'manual EA update SAFE_STOP handoff'
Write-Utf8 $manualPath $manual

# Permanent contract test (run here and later from CI).
$testPath = 'tests/manual-ea-update-contract.ps1'
$test = @'
$ErrorActionPreference = 'Stop'

$manual = [System.IO.File]::ReadAllText((Resolve-Path 'apps/api/src/manual-mt5.controller.ts'))
$agent = [System.IO.File]::ReadAllText((Resolve-Path 'tools/windows-installer/AgentRunner.cs'))
$smart = [System.IO.File]::ReadAllText((Resolve-Path 'tools/windows-installer/SmartAgentRunner.cs'))

foreach ($required in @(
  "SET desired_state='SAFE_STOP'",
  "INSERT INTO bot_commands(bot_instance_id,command) VALUES(`$1,'SAFE_STOP')",
  "manualMt5ActionName",
  "manualMt5ActionSource','USER'"
)) {
  if (-not $manual.Contains($required)) { throw "Manual update contract missing: $required" }
}
if (-not $agent.Contains('forceReload=true  => UPDATE_EA_RESTART only')) { throw 'Agent one-click update authorization contract missing' }
if (-not $agent.Contains('WriteStamp(stampPath, actionId);')) { throw 'Agent one-restart stamp missing' }
if (-not $smart.Contains('Waiting for explicit update button restart')) { throw 'Background update must remain restart-free' }
if (-not $smart.Contains('PendingReloadPath(config)')) { throw 'Pending reload marker missing' }
Write-Host 'Manual EA update one-click / one-restart contract PASS'
'@
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $testPath), $test, [System.Text.UTF8Encoding]::new($false))

Write-Host 'Installer UI refresh + manual EA restart fix prepared.'
