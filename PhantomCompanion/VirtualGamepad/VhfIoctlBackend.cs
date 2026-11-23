using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using PhantomCompanion.Diagnostics;

namespace PhantomCompanion.VirtualGamepad;

/// <summary>
/// Real Win32 DeviceIoControl bridge to the PhantomVhfDriver KMDF/VHF device interface (\\.\PhantomVhfGamepad).
/// Never simulates a virtual controller if the kernel driver is absent.
/// </summary>
public sealed class VhfIoctlBackend : IVirtualGamepadBackend
{
    public const string SymbolicDevicePath = @"\\.\PhantomVhfGamepad";

    // CTL_CODE(FILE_DEVICE_UNKNOWN (0x22), 0x801, METHOD_BUFFERED (0), FILE_WRITE_DATA (2))
    private const uint IOCTL_PHANTOM_SUBMIT_REPORT = (0x00000022u << 16) | (0x0002u << 14) | (0x801u << 2) | 0u;
    private const uint IOCTL_PHANTOM_RESET_STATE = (0x00000022u << 16) | (0x0002u << 14) | (0x802u << 2) | 0u;

    private readonly DiagnosticLogger _logger;
    private readonly object _gate = new();
    private SafeFileHandle? _deviceHandle;

    public string BackendName => "Microsoft VHF Kernel HID (PhantomVhfDriver)";
    public bool IsDeviceCreated => _deviceHandle is { IsInvalid: false, IsClosed: false };
    public BackendAvailabilityState AvailabilityState { get; private set; } = BackendAvailabilityState.DriverNotInstalled;

    public VhfIoctlBackend(DiagnosticLogger logger)
    {
        _logger = logger;
        if (!OperatingSystem.IsWindows())
        {
            AvailabilityState = BackendAvailabilityState.UnsupportedPlatform;
        }
    }

    public GamepadBackendResult ProbeAndConnect()
    {
        if (!OperatingSystem.IsWindows())
        {
            AvailabilityState = BackendAvailabilityState.UnsupportedPlatform;
            return new GamepadBackendResult(false, AvailabilityState, "VHF IOCTL backend is Windows-only.");
        }

        lock (_gate)
        {
            if (IsDeviceCreated)
            {
                AvailabilityState = BackendAvailabilityState.Ready;
                return new GamepadBackendResult(true, AvailabilityState, "Connected to Phantom VHF virtual gamepad device.");
            }

            var handle = CreateFileW(
                SymbolicDevicePath,
                GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                IntPtr.Zero,
                OPEN_EXISTING,
                0,
                IntPtr.Zero);

            if (handle.IsInvalid)
            {
                int err = Marshal.GetLastWin32Error();
                handle.Dispose();

                AvailabilityState = err switch
                {
                    5 => BackendAvailabilityState.AccessDenied,
                    2 or 3 => BackendAvailabilityState.DriverNotInstalled,
                    _ => BackendAvailabilityState.DeviceCreationFailed
                };

                string msg = err switch
                {
                    5 => "Access denied opening \\\\.\\PhantomVhfGamepad. Verify driver ACLs or run with appropriate privileges.",
                    2 or 3 => "PhantomVhfDriver is not installed or its VHF device node is inactive. Install the signed VHF driver for Universal Gamepad mode.",
                    _ => $"Failed to open \\\\.\\PhantomVhfGamepad (Win32 error {err})."
                };

                _logger.Warning("VHF", msg);
                return new GamepadBackendResult(false, AvailabilityState, msg, err);
            }

            _deviceHandle = handle;
            AvailabilityState = BackendAvailabilityState.Ready;
            _logger.Info("VHF", "Opened handle to \\\\.\\PhantomVhfGamepad; virtual HID gamepad ready.");
            return new GamepadBackendResult(true, AvailabilityState, "Virtual HID gamepad created via PhantomVhfDriver.");
        }
    }

    public GamepadBackendResult SubmitReport(in PhantomHidInputReport report)
    {
        if (!OperatingSystem.IsWindows())
        {
            return new GamepadBackendResult(false, BackendAvailabilityState.UnsupportedPlatform, "Windows only.");
        }

        lock (_gate)
        {
            if (!IsDeviceCreated)
            {
                return new GamepadBackendResult(false, AvailabilityState, "Virtual gamepad device is not open.");
            }

            byte[] payload = GamepadReportBuilder.SerializeHidReport(report);
            bool ok = DeviceIoControl(
                _deviceHandle!,
                IOCTL_PHANTOM_SUBMIT_REPORT,
                payload,
                (uint)payload.Length,
                IntPtr.Zero,
                0,
                out _,
                IntPtr.Zero);

            if (!ok)
            {
                int err = Marshal.GetLastWin32Error();
                _logger.Error("VHF", $"IOCTL_PHANTOM_SUBMIT_REPORT failed (Win32 error {err}). Closing device handle.");
                DisconnectInternal();
                AvailabilityState = BackendAvailabilityState.DeviceCreationFailed;
                return new GamepadBackendResult(false, AvailabilityState, $"DeviceIoControl failed (err={err}).", err);
            }

            return new GamepadBackendResult(true, BackendAvailabilityState.Ready, "Report submitted.");
        }
    }

    public void Disconnect()
    {
        lock (_gate)
        {
            if (IsDeviceCreated && OperatingSystem.IsWindows())
            {
                DeviceIoControl(
                    _deviceHandle!,
                    IOCTL_PHANTOM_RESET_STATE,
                    Array.Empty<byte>(),
                    0,
                    IntPtr.Zero,
                    0,
                    out _,
                    IntPtr.Zero);
            }
            DisconnectInternal();
        }
    }

    private void DisconnectInternal()
    {
        _deviceHandle?.Dispose();
        _deviceHandle = null;
        AvailabilityState = OperatingSystem.IsWindows()
            ? BackendAvailabilityState.DriverNotInstalled
            : BackendAvailabilityState.UnsupportedPlatform;
    }

    public void Dispose()
    {
        Disconnect();
    }

    #region Native Win32
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint FILE_SHARE_READ = 0x01;
    private const uint FILE_SHARE_WRITE = 0x02;
    private const uint OPEN_EXISTING = 3;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string lpFileName,
        uint dwDesiredAccess,
        uint dwShareMode,
        IntPtr lpSecurityAttributes,
        uint dwCreationDisposition,
        uint dwFlagsAndAttributes,
        IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DeviceIoControl(
        SafeFileHandle hDevice,
        uint dwIoControlCode,
        byte[] lpInBuffer,
        uint nInBufferSize,
        IntPtr lpOutBuffer,
        uint nOutBufferSize,
        out uint lpBytesReturned,
        IntPtr lpOverlapped);
    #endregion
}
