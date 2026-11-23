using PhantomCompanion.Diagnostics;
using PhantomCompanion.InputCore.Processing;
using PhantomCompanion.InputCore.Profiles;
using PhantomCompanion.InputCore.State;

namespace PhantomCompanion.VirtualGamepad;

public sealed class VirtualGamepadManager : IGamepadSink, IDisposable
{
    private readonly IVirtualGamepadBackend _backend;
    private readonly DiagnosticLogger _logger;
    private readonly object _gate = new();

    private PhantomHidInputReport _lastReport;
    private long _reportsSubmitted;
    private bool _windowsDetected;

    public bool IsDriverInstalled { get; private set; }
    public bool IsVirtualDeviceCreated => _backend.IsDeviceCreated;
    public bool IsWindowsDetectingGamepad => _windowsDetected;
    public string StatusMessage { get; private set; } = "Virtual gamepad not initialized.";
    public PhantomHidInputReport LastSubmittedReport => _lastReport;
    public long ReportsSubmitted => Interlocked.Read(ref _reportsSubmitted);

    public event Action? StatusChanged;

    public VirtualGamepadManager(IVirtualGamepadBackend backend, DiagnosticLogger logger)
    {
        _backend = backend;
        _logger = logger;
    }

    public void RefreshStatusAndEnsureDevice()
    {
        lock (_gate)
        {
            var drv = DriverStatusManager.CheckDriverStatus();
            IsDriverInstalled = drv.DriverServiceExists && drv.DriverRunning;

            var connectResult = _backend.ProbeAndConnect();
            var discovery = DeviceDiscovery.ProbeWindowsDevices();
            _windowsDetected = discovery.PhantomHidEnumerated;

            if (connectResult.Success && discovery.PhantomHidEnumerated)
            {
                IsDriverInstalled = true;
                StatusMessage = "Virtual HID gamepad active and enumerated in Windows.";
            }
            else if (connectResult.Success)
            {
                IsDriverInstalled = true;
                StatusMessage = "VHF device handle opened; waiting for Windows HID enumeration.";
            }
            else
            {
                StatusMessage = !drv.DriverServiceExists ? drv.GuidanceMessage : connectResult.Message;
            }
        }

        StatusChanged?.Invoke();
    }

    public void ApplyState(ControllerStateSnapshot state, ControllerProfile profile)
    {
        var xboxState = GamepadReportBuilder.BuildState(state, profile);
        var report = GamepadReportBuilder.ToHidReport(xboxState);
        _lastReport = report;

        if (!_backend.IsDeviceCreated)
        {
            // Do not fake hardware submission when kernel driver is missing
            return;
        }

        var result = _backend.SubmitReport(report);
        if (result.Success)
        {
            Interlocked.Increment(ref _reportsSubmitted);
        }
        else
        {
            StatusMessage = result.Message;
            StatusChanged?.Invoke();
        }
    }

    public void ReleaseAll()
    {
        var neutral = new PhantomHidInputReport
        {
            ReportId = PhantomHidInputReport.ExpectedReportId,
            HatSwitch = 8
        };
        _lastReport = neutral;
        if (_backend.IsDeviceCreated)
        {
            _backend.SubmitReport(neutral);
        }
    }

    public GamepadBackendResult SendDiagnosticNeutralPulse()
    {
        if (!_backend.IsDeviceCreated)
        {
            return new GamepadBackendResult(
                false,
                _backend.AvailabilityState,
                "Cannot submit test report: PhantomVhfDriver is not installed or active.");
        }

        var neutral = new PhantomHidInputReport
        {
            ReportId = PhantomHidInputReport.ExpectedReportId,
            HatSwitch = 8
        };
        return _backend.SubmitReport(neutral);
    }

    public void Dispose()
    {
        ReleaseAll();
        _backend.Dispose();
    }
}
