namespace PhantomCompanion.VirtualGamepad;

public enum BackendAvailabilityState
{
    Ready,
    DriverNotInstalled,
    DeviceCreationFailed,
    AccessDenied,
    UnsupportedPlatform
}

public sealed record GamepadBackendResult(
    bool Success,
    BackendAvailabilityState State,
    string Message,
    int? Win32ErrorCode = null);

public interface IVirtualGamepadBackend : IDisposable
{
    string BackendName { get; }
    bool IsDeviceCreated { get; }
    BackendAvailabilityState AvailabilityState { get; }

    GamepadBackendResult ProbeAndConnect();
    GamepadBackendResult SubmitReport(in PhantomHidInputReport report);
    void Disconnect();
}
