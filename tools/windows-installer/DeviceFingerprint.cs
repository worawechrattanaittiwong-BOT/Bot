using Microsoft.Win32;
using System.Security.Cryptography;
using System.Text;

namespace ScenovaInstaller;

internal static class DeviceFingerprint
{
    internal static string Current()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
            var machineGuid = Convert.ToString(key?.GetValue("MachineGuid"))?.Trim();
            if (string.IsNullOrWhiteSpace(machineGuid))
                return "";

            var bytes = Encoding.UTF8.GetBytes("SCENOVA-DEVICE-V1:" + machineGuid);
            return Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        }
        catch
        {
            return "";
        }
    }
}

