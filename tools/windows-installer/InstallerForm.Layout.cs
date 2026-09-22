using System.Drawing.Drawing2D;

namespace ScenovaInstaller;

internal sealed partial class InstallerForm
{
    private readonly Label _stateBadge = new();
    private readonly Label _terminalNote = new();
    private readonly Label _updateSummary = new();
    private readonly Label _stepCaption = new();
    private readonly Panel _advancedPanel = new();

    private static Label TextLabel(string text, float size, Color color, bool bold = false) => new()
    {
        Text = text, Dock = DockStyle.Fill, AutoSize = false,
        Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular),
        ForeColor = color, BackColor = Color.Transparent,
        TextAlign = ContentAlignment.MiddleLeft, Margin = Padding.Empty
    };

    private void BuildLayout()
    {
        var scroll = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = SoftBackground };
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Top, Height = 850, ColumnCount = 1, RowCount = 8,
            Padding = new Padding(26, 16, 26, 14), BackColor = SoftBackground,
            Margin = Padding.Empty
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var height in new[] { 72, 84, 146, 62 })
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 0));

        var brandRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, Margin = Padding.Empty };
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 62));
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 174));
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 196));
        brandRow.Controls.Add(new PictureBox
        {
            Image = _brandLogo, SizeMode = PictureBoxSizeMode.Zoom, Dock = DockStyle.Fill,
            BackColor = Color.Transparent, Margin = new Padding(0, 2, 10, 4), AccessibleName = "โลโก้ SCENOVA"
        }, 0, 0);
        brandRow.Controls.Add(TextLabel("SCENOVA", 21, Navy, true), 1, 0);
        brandRow.Controls.Add(TextLabel("Smart Installer", 16, MutedText), 2, 0);
        _stateBadge.Dock = DockStyle.Fill;
        _stateBadge.TextAlign = ContentAlignment.MiddleCenter;
        _stateBadge.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        _stateBadge.Margin = new Padding(0, 15, 0, 15);
        SetBadge("รอตรวจสอบ", PrimaryBlue);
        brandRow.Controls.Add(_stateBadge, 3, 0);
        root.Controls.Add(brandRow, 0, 0);

        var welcome = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, Margin = new Padding(0, 2, 0, 12) };
        welcome.RowStyles.Add(new RowStyle(SizeType.Percent, 60));
        welcome.RowStyles.Add(new RowStyle(SizeType.Percent, 40));
        welcome.Controls.Add(TextLabel("ยินดีต้อนรับสู่ SCENOVA Smart Installer", 23, Navy, true), 0, 0);
        welcome.Controls.Add(TextLabel("ตรวจสอบเวอร์ชัน ติดตั้ง และอัปเดตให้คุณในปุ่มเดียว", 11, MutedText), 0, 1);
        root.Controls.Add(welcome, 0, 1);

        var features = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4, Margin = Padding.Empty };
        for (var i = 0; i < 4; i++) features.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        _terminalNote.Text = "ค้นหาโปรแกรม MT5\r\nที่ติดตั้งอยู่ในเครื่อง";
        _updateSummary.Text = "ตรงกันแล้วจะไม่ติดตั้งซ้ำ\r\nอัปเดตเฉพาะส่วนที่จำเป็น";
        _score.Text = "รอตรวจสอบ";
        _live.Text = "รอยืนยันเวอร์ชัน\r\nและการเชื่อมต่อ EA";
        features.Controls.Add(FeatureCard("\uE7F4", "ค้นหา MetaTrader 5", _terminalNote), 0, 0);
        features.Controls.Add(FeatureCard("\uE895", "ตรวจสอบและอัปเดต", _updateSummary), 1, 0);
        features.Controls.Add(FeatureCard("\uE9D9", "ความพร้อมของเครื่อง", _score), 2, 0);
        features.Controls.Add(FeatureCard("\uE73E", "ยืนยันการเชื่อมต่อ", _live), 3, 0);
        root.Controls.Add(features, 0, 2);

        var selector = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, ColumnCount = 3, Margin = new Padding(0, 10, 0, 10),
            Padding = new Padding(8, 6, 8, 0)
        };
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 145));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 166));
        selector.Controls.Add(TextLabel("MT5 ที่ต้องการใช้", 10, Navy, true), 0, 0);
        _terminal.Margin = new Padding(0, 3, 16, 0);
        selector.Controls.Add(_terminal, 1, 0);
        _channelSummary.Dock = DockStyle.Fill;
        _channelSummary.Margin = Padding.Empty;
        selector.Controls.Add(_channelSummary, 2, 0);
        root.Controls.Add(selector, 0, 3);

        var checkCard = new InstallerCard { Dock = DockStyle.Fill, Margin = Padding.Empty, Padding = new Padding(18, 10, 18, 12) };
        var checks = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 4, ColumnCount = 1, BackColor = Color.Transparent };
        checks.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        checks.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        checks.RowStyles.Add(new RowStyle(SizeType.Absolute, 12));
        checks.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        var checkHeader = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Margin = Padding.Empty };
        checkHeader.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
        checkHeader.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        checkHeader.Controls.Add(TextLabel("สถานะการตรวจสอบ", 14, Navy, true), 0, 0);
        _stepCaption.Dock = DockStyle.Fill;
        _stepCaption.TextAlign = ContentAlignment.MiddleRight;
        _stepCaption.ForeColor = MutedText;
        _stepCaption.Font = new Font("Segoe UI", 9);
        _stepCaption.Text = "ผลลัพธ์จากการตรวจสอบจริง";
        checkHeader.Controls.Add(_stepCaption, 1, 0);
        checks.Controls.Add(checkHeader, 0, 0);
        _health.Margin = new Padding(0, 6, 0, 8);
        checks.Controls.Add(_health, 0, 1);
        _progress.Dock = DockStyle.Fill;
        _progress.Margin = new Padding(0, 1, 0, 3);
        checks.Controls.Add(_progress, 0, 2);
        _status.Dock = DockStyle.Fill;
        _status.Padding = new Padding(12, 6, 12, 6);
        _status.Font = new Font("Segoe UI", 10);
        _status.Margin = new Padding(0, 4, 0, 0);
        _status.UseCompatibleTextRendering = false;
        _status.BackColor = Color.FromArgb(234, 244, 255);
        _status.ForeColor = Navy;
        _status.Text = "กดตรวจสอบและอัปเดต ระบบจะตรวจให้ครบและแจ้งผลที่นี่";
        checks.Controls.Add(_status, 0, 3);
        checkCard.Controls.Add(checks);
        root.Controls.Add(checkCard, 0, 4);

        var actions = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 2, Margin = new Padding(0, 12, 0, 0) };
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 22));
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 56));
        actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 22));
        actions.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        actions.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        _install.Dock = DockStyle.Fill;
        _install.Margin = Padding.Empty;
        _install.Font = new Font("Segoe UI", 16, FontStyle.Bold);
        _install.FlatAppearance.BorderSize = 0;
        _install.FlatAppearance.MouseOverBackColor = Color.FromArgb(0, 94, 210);
        _install.AccessibleDescription = "ตรวจสอบ ติดตั้งหรืออัปเดตเมื่อจำเป็น และยืนยันผลในครั้งเดียว";
        actions.Controls.Add(_install, 1, 0);
        var hint = TextLabel("ตรวจสอบก่อนทุกครั้ง  •  ตรงกันแล้วไม่อัปเดตซ้ำ  •  อัปเดตแล้วตรวจยืนยันให้", 9, MutedText);
        hint.TextAlign = ContentAlignment.MiddleCenter;
        actions.Controls.Add(hint, 0, 1);
        actions.SetColumnSpan(hint, 3);
        root.Controls.Add(actions, 0, 5);

        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Margin = Padding.Empty };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        footer.Controls.Add(TextLabel("SCENOVA Smart Installer  v" + InstallerConstants.Version, 9, MutedText), 0, 0);
        _advancedMode.Anchor = AnchorStyles.Right;
        footer.Controls.Add(_advancedMode, 1, 0);
        root.Controls.Add(footer, 0, 6);

        _advancedPanel.Dock = DockStyle.Fill;
        _advancedPanel.Visible = false;
        _advancedPanel.Padding = new Padding(0, 8, 0, 0);
        var advanced = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2 };
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 185));
        advanced.Controls.Add(_advancedDetails, 0, 0);
        var tools = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false };
        _channel.Width = 166;
        tools.Controls.Add(_channel);
        foreach (var button in new[] { _rollback, _uninstall })
        {
            button.Width = 166;
            button.Height = 38;
            button.BackColor = Color.White;
            button.ForeColor = button == _uninstall ? Color.Firebrick : PrimaryBlue;
            button.FlatAppearance.BorderColor = BorderBlue;
            tools.Controls.Add(button);
        }
        advanced.Controls.Add(tools, 1, 0);
        _advancedPanel.Controls.Add(advanced);
        root.Controls.Add(_advancedPanel, 0, 7);
        scroll.Controls.Add(root);
        Controls.Add(scroll);

        void ResizeContent()
        {
            var scale = DeviceDpi / 96f;
            root.RowStyles[7].Height = _advancedMode.Checked ? 160 * scale : 0;
            root.Height = Math.Max((int)((850 + (_advancedMode.Checked ? 160 : 0)) * scale), scroll.ClientSize.Height);
        }
        scroll.Resize += (_, _) => ResizeContent();
        _advancedMode.CheckedChanged += (_, _) => ResizeContent();
    }

    private static Control FeatureCard(string glyph, string title, Label content)
    {
        var card = new InstallerCard { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 10, 0), Padding = new Padding(12, 10, 12, 8) };
        var grid = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 1, BackColor = Color.Transparent };
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        grid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var icon = TextLabel(glyph, 26, PrimaryBlue);
        icon.Font = new Font("Segoe MDL2 Assets", 25);
        icon.TextAlign = ContentAlignment.MiddleCenter;
        grid.Controls.Add(icon, 0, 0);
        var heading = TextLabel(title, 11, Navy, true);
        heading.TextAlign = ContentAlignment.MiddleCenter;
        grid.Controls.Add(heading, 0, 1);
        content.Dock = DockStyle.Fill;
        content.Font = new Font("Segoe UI", 9);
        content.TextAlign = ContentAlignment.MiddleCenter;
        content.BackColor = Color.Transparent;
        content.ForeColor = MutedText;
        content.Margin = Padding.Empty;
        grid.Controls.Add(content, 0, 2);
        card.Controls.Add(grid);
        return card;
    }

    private void SetBadge(string text, Color color)
    {
        _stateBadge.Text = "●  " + text;
        _stateBadge.ForeColor = color;
        _stateBadge.BackColor = color == SuccessGreen ? Color.FromArgb(225, 247, 235) : Color.FromArgb(232, 241, 255);
    }

    private void SetStep(int number, string text)
    {
        _stepCaption.Text = $"ขั้นตอน {number} / 4  ·  {text}";
        _status.Text = text;
        _status.BackColor = Color.FromArgb(234, 244, 255);
        _status.ForeColor = Navy;
        SetBadge("กำลังดำเนินการ", PrimaryBlue);
    }

    private void ShowResult(string text, bool success)
    {
        _status.Text = text;
        _status.BackColor = success ? Color.FromArgb(227, 247, 238) : Color.FromArgb(255, 246, 226);
        _status.ForeColor = success ? SuccessGreen : Color.FromArgb(151, 96, 12);
        _stepCaption.Text = "ตรวจสอบล่าสุด " + DateTime.Now.ToString("HH:mm:ss");
        SetBadge(success ? "ยืนยันเรียบร้อย" : "ยังไม่ครบขั้นตอน", success ? SuccessGreen : Color.FromArgb(151, 96, 12));
    }

    private sealed class InstallerCard : Panel
    {
        internal InstallerCard()
        {
            DoubleBuffered = true;
            BackColor = SoftBackground;
            ResizeRedraw = true;
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            base.OnPaintBackground(e);
            if (ClientSize.Width < 2 || ClientSize.Height < 2) return;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var rect = new RectangleF(.5f, .5f, ClientSize.Width - 1, ClientSize.Height - 1);
            var radius = Math.Min(14f * DeviceDpi / 96f, Math.Min(rect.Width, rect.Height) / 2);
            using var path = new GraphicsPath();
            path.AddArc(rect.Left, rect.Top, radius * 2, radius * 2, 180, 90);
            path.AddArc(rect.Right - radius * 2, rect.Top, radius * 2, radius * 2, 270, 90);
            path.AddArc(rect.Right - radius * 2, rect.Bottom - radius * 2, radius * 2, radius * 2, 0, 90);
            path.AddArc(rect.Left, rect.Bottom - radius * 2, radius * 2, radius * 2, 90, 90);
            path.CloseFigure();
            using var fill = new LinearGradientBrush(rect, Color.White, Color.FromArgb(248, 252, 255), 90f);
            using var border = new Pen(BorderBlue);
            e.Graphics.FillPath(fill, path);
            e.Graphics.DrawPath(border, path);
        }
    }
}
