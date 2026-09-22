namespace ScenovaInstaller;

internal static class BrandAssets
{
    private const string ScenovaLogoJpegBase64 = "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";

    internal static Image LoadInstallerMark()
    {
        using var stream = typeof(BrandAssets).Assembly.GetManifestResourceStream("ScenovaInstaller.BrandMark")
            ?? throw new InvalidOperationException("SCENOVA installer logo is missing");
        using var image = Image.FromStream(stream);
        return new Bitmap(image);
    }

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
}
