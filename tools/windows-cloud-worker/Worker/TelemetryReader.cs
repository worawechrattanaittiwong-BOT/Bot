using System.Management;

namespace Scenova.CloudWorker;

internal static class TelemetryReader
{
    public static WorkerTelemetry Read(bool templateReady)
    {
        var telemetry = new WorkerTelemetry { TemplateReady = templateReady };

        try
        {
            var loads = new List<double>();
            using var cpuSearch = new ManagementObjectSearcher("SELECT LoadPercentage FROM Win32_Processor");
            foreach (ManagementObject item in cpuSearch.Get())
            {
                if (item["LoadPercentage"] is not null &&
                    double.TryParse(item["LoadPercentage"].ToString(), out var load))
                    loads.Add(load);
            }

            if (loads.Count > 0) telemetry.CpuPercent = Math.Round(loads.Average(), 1);
        }
        catch { }

        try
        {
            using var osSearch = new ManagementObjectSearcher(
                "SELECT TotalVisibleMemorySize,FreePhysicalMemory FROM Win32_OperatingSystem");

            foreach (ManagementObject item in osSearch.Get())
            {
                if (double.TryParse(item["TotalVisibleMemorySize"]?.ToString(), out var totalKb) &&
                    double.TryParse(item["FreePhysicalMemory"]?.ToString(), out var freeKb))
                {
                    telemetry.RamTotalGb = Math.Round(totalKb / 1024d / 1024d, 1);
                    telemetry.RamUsedGb = Math.Round((totalKb - freeKb) / 1024d / 1024d, 1);
                }
                break;
            }
        }
        catch { }

        try
        {
            var drive = new DriveInfo(Path.GetPathRoot(@"C:\")!);
            telemetry.DiskFreeGb = Math.Round(drive.AvailableFreeSpace / 1024d / 1024d / 1024d, 1);
            telemetry.DiskTotalGb = Math.Round(drive.TotalSize / 1024d / 1024d / 1024d, 1);
        }
        catch { }

        return telemetry;
    }
}
