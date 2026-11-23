namespace PhantomCompanion.VirtualGamepad;

public sealed record GamepadDiagnosticSnapshot(
    DriverInstallationStatus DriverStatus,
    WindowsGamepadDiscoverySnapshot DiscoverySnapshot,
    bool VirtualDeviceCreated,
    long ReportsSubmitted,
    string LastReportHex);

public static class GamepadDiagnostics
{
    public static GamepadDiagnosticSnapshot Collect(VirtualGamepadManager manager)
    {
        var drv = DriverStatusManager.CheckDriverStatus();
        var disc = DeviceDiscovery.ProbeWindowsDevices();
        var bytes = GamepadReportBuilder.SerializeHidReport(manager.LastSubmittedReport);
        string hex = BitConverter.ToString(bytes);
        return new GamepadDiagnosticSnapshot(
            drv,
            disc,
            manager.IsVirtualDeviceCreated,
            manager.ReportsSubmitted,
            hex);
    }
}
