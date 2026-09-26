using System.Security.Cryptography;

namespace Scenova.CloudWorker;

internal static class EaPackageStore
{
    public static string HashBytes(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    public static string HashFile(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    public static string CachePackage(
        string root,
        string version,
        string expectedSha256,
        byte[] bytes)
    {
        ValidateSha(expectedSha256);
        var actual = HashBytes(bytes);
        if (!string.Equals(actual, expectedSha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("EA_PACKAGE_HASH_MISMATCH");

        var safeVersion = SanitizeSegment(version, "version");
        var directory = Path.Combine(root, "packages", "ea", safeVersion);
        Directory.CreateDirectory(directory);

        var target = Path.Combine(directory, expectedSha256.ToLowerInvariant() + ".ex5");
        if (File.Exists(target) &&
            string.Equals(HashFile(target), expectedSha256, StringComparison.OrdinalIgnoreCase))
            return target;

        var temp = target + ".tmp";
        File.WriteAllBytes(temp, bytes);

        if (!string.Equals(HashFile(temp), expectedSha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(temp);
            throw new InvalidOperationException("EA_PACKAGE_HASH_MISMATCH");
        }

        File.Move(temp, target, true);
        return target;
    }

    public static (string BackupPath, string PreviousSha256) BackupCurrent(
        string root,
        string instanceId,
        string updateId,
        string currentEaPath)
    {
        if (!File.Exists(currentEaPath))
            throw new FileNotFoundException("Current EA not found", currentEaPath);

        var instance = SanitizeGuid(instanceId, "instance ID");
        var update = SanitizeGuid(updateId, "update ID");
        var backupDir = Path.Combine(root, "backups", instance, update);
        Directory.CreateDirectory(backupDir);

        var backupPath = Path.Combine(backupDir, "FastBasketBot.ex5");
        var previousSha = HashFile(currentEaPath);

        if (!File.Exists(backupPath))
            File.Copy(currentEaPath, backupPath, false);

        return (backupPath, previousSha);
    }

    public static string BackupPath(string root, string instanceId, string sourceUpdateId)
    {
        var instance = SanitizeGuid(instanceId, "instance ID");
        var update = SanitizeGuid(sourceUpdateId, "source update ID");
        return Path.Combine(root, "backups", instance, update, "FastBasketBot.ex5");
    }

    public static void ReplaceEa(string currentEaPath, string sourcePath, string? expectedSha256)
    {
        if (!File.Exists(sourcePath))
            throw new FileNotFoundException("EA package not found", sourcePath);

        if (!string.IsNullOrWhiteSpace(expectedSha256))
        {
            ValidateSha(expectedSha256);
            if (!string.Equals(
                    HashFile(sourcePath),
                    expectedSha256,
                    StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("EA_PACKAGE_HASH_MISMATCH");
        }

        var temp = currentEaPath + ".update";
        Directory.CreateDirectory(Path.GetDirectoryName(currentEaPath)!);
        File.Copy(sourcePath, temp, true);

        if (!string.IsNullOrWhiteSpace(expectedSha256) &&
            !string.Equals(
                HashFile(temp),
                expectedSha256,
                StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(temp);
            throw new InvalidOperationException("EA_PACKAGE_HASH_MISMATCH");
        }

        File.Move(temp, currentEaPath, true);
    }

    private static void ValidateSha(string value)
    {
        if (value.Length != 64 || value.Any(c => !Uri.IsHexDigit(c)))
            throw new InvalidOperationException("Invalid SHA256");
    }

    private static string SanitizeGuid(string value, string label)
    {
        if (!Guid.TryParse(value, out var id))
            throw new InvalidOperationException("Invalid " + label);
        return id.ToString();
    }

    private static string SanitizeSegment(string value, string label)
    {
        var clean = String.Concat((value ?? "").Where(c =>
            char.IsLetterOrDigit(c) || c is '.' or '-' or '_'));
        if (string.IsNullOrWhiteSpace(clean) || clean.Length > 64)
            throw new InvalidOperationException("Invalid " + label);
        return clean;
    }
}
