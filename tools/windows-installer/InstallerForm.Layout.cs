using System.Drawing.Drawing2D;

namespace ScenovaInstaller;

internal sealed partial class InstallerForm
{
    private readonly Label _stateBadge = new();
    private readonly Label _terminalNote = new();
    private readonly Label _updateSummary = new();
    private readonly Label _stepCaption = new();
    private readonly Label _progressPercent = new();
    private readonly Panel _advancedPanel = new();
    private int _displayScore;

    private static Label TextLabel(string text, float size, Color color, bool bold = false) => new()
    {
        Text = text,
        Dock = DockStyle.Fill,
        AutoSize = false,
        AutoEllipsis = true,
        UseCompatibleTextRendering = false,
        Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular),
        ForeColor = color,
        BackColor = Color.Transparent,
        TextAlign = ContentAlignment.MiddleLeft,
        Margin = Padding.Empty
    };

    private void BuildLayout()
    {
        var scroll = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = SoftBackground
        };

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 790,
            ColumnCount = 1,
            RowCount = 6,
            Padding = new Padding(34, 18, 34, 14),
            BackColor = SoftBackground,
            Margin = Padding.Empty
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 184));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 386));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 0));

        var brandRow = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            Margin = Padding.Empty,
            BackColor = Color.Transparent
        };
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 62));
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 270));
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        brandRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 176));

        brandRow.Controls.Add(new PictureBox
        {
            Image = _brandLogo,
            SizeMode = PictureBoxSizeMode.Zoom,
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 4, 10, 4),
            AccessibleName = "โลโก้ SCENOVA"
        }, 0, 0);

        var brandName = TextLabel("SCENOVA", 22, Navy, true);
        brandName.AutoEllipsis = false;
        brandName.Padding = new Padding(0, 0, 16, 0);
        brandRow.Controls.Add(brandName, 1, 0);

        var productName = TextLabel("Smart Installer", 16, MutedText);
        productName.AutoEllipsis = false;
        productName.Padding = new Padding(18, 0, 0, 0);
        brandRow.Controls.Add(productName, 2, 0);

        _stateBadge.Dock = DockStyle.Fill;
        _stateBadge.TextAlign = ContentAlignment.MiddleCenter;
        _stateBadge.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        _stateBadge.Margin = new Padding(4, 13, 0, 13);
        _stateBadge.AutoEllipsis = true;
        SetBadge("รอตรวจสอบ", PrimaryBlue);
        brandRow.Controls.Add(_stateBadge, 3, 0);
        root.Controls.Add(brandRow, 0, 0);

        var features = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            Margin = new Padding(0, 8, 0, 8),
            BackColor = Color.Transparent
        };
        for (var i = 0; i < 4; i++)
            features.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));

        _terminalNote.Text = "ค้นหา MT5 ที่ติดตั้งอยู่";
        _updateSummary.Text = "ตรวจเวอร์ชันและอัปเดตเมื่อจำเป็น";
        _score.Text = "รอตรวจสอบ";
        _live.Text = "รอการเชื่อมต่อ";

        features.Controls.Add(FeatureCard("\uE7F4", "ค้นหา MetaTrader 5", _terminalNote, new Padding(0, 0, 8, 0)), 0, 0);
        features.Controls.Add(FeatureCard("\uE895", "ติดตั้ง / อัปเดตอัตโนมัติ", _updateSummary, new Padding(4, 0, 4, 0)), 1, 0);
        features.Controls.Add(FeatureCard("\uE9D9", "ความพร้อม", _score, new Padding(8, 0, 4, 0)), 2, 0);
        features.Controls.Add(FeatureCard("\uE73E", "สถานะการเชื่อมต่อ", _live, new Padding(8, 0, 0, 0)), 3, 0);
        root.Controls.Add(features, 0, 1);

        var selector = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            Margin = new Padding(0, 4, 0, 6),
            Padding = new Padding(10, 3, 10, 2),
            BackColor = Color.Transparent
        };
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 164));
        selector.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var selectorLabel = TextLabel("MT5 ที่ต้องการใช้", 10.5f, Navy, true);
        selectorLabel.AutoEllipsis = false;
        selector.Controls.Add(selectorLabel, 0, 0);

        _terminal.Margin = new Padding(0, 3, 0, 3);
        _terminal.Font = new Font("Segoe UI", 10f);
        selector.Controls.Add(_terminal, 1, 0);
        root.Controls.Add(selector, 0, 2);

        var checkCard = new InstallerCard
        {
            Dock = DockStyle.Fill,
            Margin = Padding.Empty,
            Padding = new Padding(20, 12, 20, 12)
        };

        var checks = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 6,
            ColumnCount = 1,
            BackColor = Color.Transparent,
            Margin = Padding.Empty
        };
        checks.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        checks.RowStyles.Add(new RowStyle(SizeType.Absolute, 112));
        checks.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        checks.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        checks.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
        checks.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var checkHeader = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            Margin = Padding.Empty,
            BackColor = Color.Transparent
        };
        checkHeader.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
        checkHeader.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        checkHeader.Controls.Add(TextLabel("สถานะการตรวจสอบ", 14.5f, Navy, true), 0, 0);

        _stepCaption.Dock = DockStyle.Fill;
        _stepCaption.TextAlign = ContentAlignment.MiddleRight;
        _stepCaption.ForeColor = MutedText;
        _stepCaption.Font = new Font("Segoe UI", 9);
        _stepCaption.AutoEllipsis = true;
        _stepCaption.Text = "พร้อมตรวจสอบ";
        checkHeader.Controls.Add(_stepCaption, 1, 0);
        checks.Controls.Add(checkHeader, 0, 0);

        _health.Margin = new Padding(0, 2, 0, 2);
        checks.Controls.Add(_health, 0, 1);

        var progressLine = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            Margin = Padding.Empty,
            BackColor = Color.Transparent
        };
        progressLine.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        progressLine.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 62));

        _progress.Dock = DockStyle.Fill;
        _progress.Margin = new Padding(0, 11, 12, 11);
        progressLine.Controls.Add(_progress, 0, 0);

        _progressPercent.Dock = DockStyle.Fill;
        _progressPercent.Text = "0%";
        _progressPercent.TextAlign = ContentAlignment.MiddleRight;
        _progressPercent.Font = new Font("Segoe UI Semibold", 10);
        _progressPercent.ForeColor = MutedText;
        progressLine.Controls.Add(_progressPercent, 1, 0);
        checks.Controls.Add(progressLine, 0, 2);

        _status.Dock = DockStyle.Fill;
        _status.Padding = new Padding(14, 5, 14, 5);
        _status.Font = new Font("Segoe UI", 10);
        _status.Margin = new Padding(0, 2, 0, 4);
        _status.UseCompatibleTextRendering = false;
        _status.AutoEllipsis = true;
        _status.BackColor = Color.FromArgb(234, 244, 255);
        _status.ForeColor = Navy;
        _status.Text = "กดปุ่มด้านล่างเพื่อเริ่มตรวจสอบ";
        checks.Controls.Add(_status, 0, 3);

        _install.Dock = DockStyle.Fill;
        _install.Margin = new Padding(0, 6, 0, 4);
        _install.Font = new Font("Segoe UI Semibold", 16, FontStyle.Bold);
        _install.FlatAppearance.BorderSize = 0;
        _install.AccessibleDescription = "ตรวจสอบและอัปเดต SCENOVA เมื่อจำเป็น";
        checks.Controls.Add(_install, 0, 4);

        var hint = TextLabel(
            "ตรวจสอบก่อนทุกครั้ง  •  ถ้ามีอัปเดตจะติดตั้งให้  •  ถ้าตรงกันจะไม่ติดตั้งซ้ำ",
            9,
            MutedText);
        hint.TextAlign = ContentAlignment.MiddleCenter;
        hint.AutoEllipsis = false;
        hint.Padding = new Padding(0, 2, 0, 0);
        checks.Controls.Add(hint, 0, 5);

        checkCard.Controls.Add(checks);
        root.Controls.Add(checkCard, 0, 3);

        var footer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            Margin = Padding.Empty,
            BackColor = Color.Transparent
        };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        footer.Controls.Add(TextLabel("SCENOVA Smart Installer  v" + InstallerConstants.Version, 9, MutedText), 0, 0);
        _advancedMode.Anchor = AnchorStyles.Right;
        _advancedMode.Text = "รายละเอียดเพิ่มเติม";
        footer.Controls.Add(_advancedMode, 1, 0);
        root.Controls.Add(footer, 0, 4);

        _advancedPanel.Dock = DockStyle.Fill;
        _advancedPanel.Visible = false;
        _advancedPanel.Padding = new Padding(0, 8, 0, 0);

        var advanced = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            BackColor = Color.Transparent
        };
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        advanced.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 185));
        advanced.Controls.Add(_advancedDetails, 0, 0);

        var tools = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false
        };
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
        root.Controls.Add(_advancedPanel, 0, 5);

        scroll.Controls.Add(root);
        Controls.Add(scroll);

        void ResizeContent()
        {
            root.RowStyles[5].Height = _advancedMode.Checked ? 160 : 0;
            root.Height = 790 + (_advancedMode.Checked ? 160 : 0);
        }

        scroll.Resize += (_, _) => ResizeContent();
        _advancedMode.CheckedChanged += (_, _) => ResizeContent();
    }

    private static Control FeatureCard(string glyph, string title, Label content, Padding margin)
    {
        var card = new InstallerCard
        {
            Dock = DockStyle.Fill,
            Margin = margin,
            Padding = new Padding(16, 12, 16, 10)
        };

        var grid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 3,
            ColumnCount = 1,
            BackColor = Color.Transparent,
            Margin = Padding.Empty
        };
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        grid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var icon = TextLabel(glyph, 32, PrimaryBlue);
        icon.Font = new Font("Segoe MDL2 Assets", 30);
        icon.TextAlign = ContentAlignment.MiddleCenter;
        icon.AutoEllipsis = false;
        grid.Controls.Add(icon, 0, 0);

        var heading = TextLabel(title, 12.2f, Navy, true);
        heading.TextAlign = ContentAlignment.MiddleCenter;
        heading.AutoEllipsis = false;
        grid.Controls.Add(heading, 0, 1);

        content.Dock = DockStyle.Fill;
        content.Font = new Font("Segoe UI", 10);
        content.TextAlign = ContentAlignment.MiddleCenter;
        content.BackColor = Color.Transparent;
        content.ForeColor = MutedText;
        content.Margin = new Padding(4, 2, 4, 0);
        content.AutoEllipsis = false;
        content.UseCompatibleTextRendering = false;
        grid.Controls.Add(content, 0, 2);

        card.Controls.Add(grid);
        return card;
    }

    private void SetBadge(string text, Color color)
    {
        _stateBadge.Text = "●  " + text;
        _stateBadge.ForeColor = color;
        _stateBadge.BackColor = color == SuccessGreen
            ? Color.FromArgb(225, 247, 235)
            : color == PrimaryBlue
                ? Color.FromArgb(232, 241, 255)
                : Color.FromArgb(255, 246, 226);
    }

    private void SetStep(int number, string text)
    {
        _stepCaption.Text = $"กำลังดำเนินการ {number} / 4";
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
        SetBadge(success ? "พร้อมใช้งาน" : "ต้องตรวจสอบ", success ? SuccessGreen : Color.FromArgb(151, 96, 12));
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
            var radius = Math.Min(16f * DeviceDpi / 96f, Math.Min(rect.Width, rect.Height) / 2);

            using var path = RoundedPath(rect, radius);
            using var fill = new LinearGradientBrush(
                rect,
                Color.White,
                Color.FromArgb(247, 251, 255),
                90f);
            using var border = new Pen(BorderBlue);

            e.Graphics.FillPath(fill, path);
            e.Graphics.DrawPath(border, path);
        }
    }

    private sealed class InstallerPrimaryButton : Button
    {
        internal InstallerPrimaryButton()
        {
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand;
            UseCompatibleTextRendering = false;
            DoubleBuffered = true;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var rect = new RectangleF(0.5f, 0.5f, Math.Max(1, Width - 1), Math.Max(1, Height - 1));
            var radius = Math.Min(15f * DeviceDpi / 96f, Math.Min(rect.Width, rect.Height) / 2);

            using var path = RoundedPath(rect, radius);
            using var fill = new LinearGradientBrush(
                rect,
                Enabled ? Color.FromArgb(58, 157, 255) : Color.FromArgb(151, 186, 226),
                Enabled ? Color.FromArgb(20, 103, 231) : Color.FromArgb(124, 160, 203),
                90f);
            using var border = new Pen(Color.FromArgb(110, 179, 244));

            e.Graphics.FillPath(fill, path);
            e.Graphics.DrawPath(border, path);

            TextRenderer.DrawText(
                e.Graphics,
                Text,
                Font,
                Rectangle.Round(rect),
                ForeColor,
                TextFormatFlags.HorizontalCenter |
                TextFormatFlags.VerticalCenter |
                TextFormatFlags.EndEllipsis |
                TextFormatFlags.SingleLine);

            if (Focused && ShowFocusCues)
                ControlPaint.DrawFocusRectangle(e.Graphics, Rectangle.Inflate(Rectangle.Round(rect), -6, -6));
        }
    }

    private static GraphicsPath RoundedPath(RectangleF rect, float radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(rect.Left, rect.Top, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Top, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.Left, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }
}
