using System.Diagnostics;

namespace PhantomCompanion.VirtualGamepad;

public sealed record DriverInstallationStatus(
    bool DriverServiceExists,
    bool DriverRunning,
    bool TestSigningEnabled,
    string ServiceName,
    string GuidanceMessage);

public static class DriverStatusManager
{
    public const string ServiceName = "PhantomVhfDriver";

    public static DriverInstallationStatus CheckDriverStatus()
    {
        if (!OperatingSystem.IsWindows())
        {
            return new DriverInstallationStatus(
                false,
                false,
                false,
                ServiceName,
                "Driver status checks require Windows 10/11 x64.");
        }

        string scOut = RunCommand("sc.exe", new[] { "query", ServiceName });
        bool exists = !scOut.Contains("FAILED 1060", StringComparison.OrdinalIgnoreCase) &&
                      scOut.Contains("SERVICE_NAME", StringComparison.OrdinalIgnoreCase);
        bool running = exists && scOut.Contains("RUNNING", StringComparison.OrdinalIgnoreCase);

        string bcdOut = RunCommand("bcdedit.exe", Array.Empty<string>());
        bool testSigning = bcdOut.Contains("testsigning", StringComparison.OrdinalIgnoreCase) &&
                           bcdOut.Contains("Yes", StringComparison.OrdinalIgnoreCase);

        string msg = running
            ? "PhantomVhfDriver service is installed and running."
            : exists
                ? "PhantomVhfDriver is installed but not currently running."
                : "PhantomVhfDriver KMDF/VHF driver is not installed. Universal Gamepad mode requires installing the signed driver package (see Documentation/BUILD_AND_INSTALL.md); Keyboard & Mouse mode works immediately without a driver.";

        return new DriverInstallationStatus(exists, running, testSigning, ServiceName, msg);
    }

    private static string RunCommand(string exe, string[] args)
    {
        try
        {
            using var p = new Process();
            p.StartInfo = new ProcessStartInfo
            {
                FileName = exe,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };
            foreach (var a in args) p.StartInfo.ArgumentList.Add(a);
            p.Start();
            string stdout = p.StandardOutput.ReadToEnd();
            p.WaitForExit(2000);
            return stdout;
        }
        catch
        {
            return string.Empty;
        }
    }
}
