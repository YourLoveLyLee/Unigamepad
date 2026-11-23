using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows.Threading;
using PhantomCompanion.ADB;
using PhantomCompanion.Communication.Transport;
using PhantomCompanion.Communication.WebSocket;
using PhantomCompanion.Diagnostics;
using PhantomCompanion.InputCore.Processing;
using PhantomCompanion.InputCore.Profiles;
using PhantomCompanion.InputCore.State;
using PhantomCompanion.KeyboardMouse;
using PhantomCompanion.VirtualGamepad;

namespace PhantomCompanion.Desktop.Services;

public sealed class CompanionSettings
{
    public string CustomAdbPath { get; set; } = string.Empty;
    public int WebSocketPort { get; set; } = 8765;
    public bool AutoStartServer { get; set; } = true;
    public bool AutoForwardAdb { get; set; } = true;
    public bool ReleaseAllOnDisconnect { get; set; } = true;
}

public sealed class CompanionOrchestrator : IDisposable
{
    private static readonly string SettingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "PhantomCompanion",
        "settings.json");

    public DiagnosticLogger Logger { get; } = new(250);
    public ProfileManager Profiles { get; }
    public VirtualGamepadManager VirtualGamepad { get; }
    public Win32SendInputBackend KeyboardMouse { get; }
    public InputPipeline Pipeline { get; }
    public AdbManager Adb { get; }
    public LocalWebSocketServer WebSocketServer { get; private set; }
    public CompanionSettings Settings { get; private set; }

    private readonly DispatcherTimer _continuousTickTimer;
    private long _lastTickStamp = Stopwatch.GetTimestamp();
    private DateTimeOffset _lastInputUtc = DateTimeOffset.MinValue;

    public bool IsReceivingRecentInput => (DateTimeOffset.UtcNow - _lastInputUtc).TotalSeconds < 2.0;

    public event Action<ControllerStateSnapshot>? ControllerStateUpdated;
    public event Action? StatusRefreshed;

    public CompanionOrchestrator()
    {
        Settings = LoadSettings();
        Profiles = new ProfileManager();

        var vhfBackend = new VhfIoctlBackend(Logger);
        VirtualGamepad = new VirtualGamepadManager(vhfBackend, Logger);
        KeyboardMouse = new Win32SendInputBackend(Logger);

        Pipeline = new InputPipeline(Profiles.ActiveProfile, VirtualGamepad, KeyboardMouse);
        Adb = new AdbManager(Logger);
        if (!string.IsNullOrWhiteSpace(Settings.CustomAdbPath))
        {
            Adb.SetCustomAdbPath(Settings.CustomAdbPath);
        }

        WebSocketServer = CreateWebSocketServer(Settings.WebSocketPort);

        Profiles.ActiveProfileChanged += profile =>
        {
            Pipeline.SetActiveProfile(profile);
            Logger.Info("Profile", $"Active profile switched to '{profile.Name}' ({profile.OutputMode}).");
            if (profile.OutputMode == OutputMode.UniversalGamepad)
            {
                VirtualGamepad.RefreshStatusAndEnsureDevice();
            }
            StatusRefreshed?.Invoke();
        };

        Pipeline.StateChanged += snap =>
        {
            _lastInputUtc = DateTimeOffset.UtcNow;
            ControllerStateUpdated?.Invoke(snap);
        };

        _continuousTickTimer = new DispatcherTimer(DispatcherPriority.Send)
        {
            Interval = TimeSpan.FromMilliseconds(8) // ~125Hz smooth continuous stick/WASD & aim tick
        };
        _continuousTickTimer.Tick += (_, _) =>
        {
            long now = Stopwatch.GetTimestamp();
            double dt = (now - _lastTickStamp) / (double)Stopwatch.Frequency;
            _lastTickStamp = now;
            Pipeline.TickContinuous(dt);
        };
    }

    private LocalWebSocketServer CreateWebSocketServer(int port)
    {
        var server = new LocalWebSocketServer(Pipeline, Logger, port);
        server.StateChanged += _ => StatusRefreshed?.Invoke();
        server.ClientConnected += () => StatusRefreshed?.Invoke();
        server.ClientDisconnected += () => StatusRefreshed?.Invoke();
        return server;
    }

    public async Task InitializeAsync()
    {
        _continuousTickTimer.Start();
        VirtualGamepad.RefreshStatusAndEnsureDevice();

        if (Settings.AutoStartServer)
        {
            await WebSocketServer.StartAsync().ConfigureAwait(false);
        }

        if (Settings.AutoForwardAdb)
        {
            await Adb.RefreshAndForwardAsync(Settings.WebSocketPort).ConfigureAwait(false);
            Adb.StartMonitoring(Settings.WebSocketPort, TimeSpan.FromSeconds(3));
        }

        StatusRefreshed?.Invoke();
    }

    public async Task RestartWebSocketAsync(int port)
    {
        int clamped = port is >= 1024 and <= 65535 ? port : 8765;
        Settings.WebSocketPort = clamped;
        SaveSettings();

        await WebSocketServer.DisposeAsync().ConfigureAwait(false);
        WebSocketServer = CreateWebSocketServer(clamped);
        await WebSocketServer.StartAsync().ConfigureAwait(false);
        if (Settings.AutoForwardAdb)
        {
            Adb.StartMonitoring(clamped, TimeSpan.FromSeconds(3));
        }
        StatusRefreshed?.Invoke();
    }

    public SystemVerificationState BuildVerificationState()
    {
        var adb = Adb.CurrentStatus;
        var profile = Profiles.ActiveProfile;
        bool phoneConnected = WebSocketServer.HasActiveClient;
        bool wsListening = WebSocketServer.State is TransportState.Listening or TransportState.Connected;
        bool driverOk = VirtualGamepad.IsDriverInstalled;
        bool devCreated = VirtualGamepad.IsVirtualDeviceCreated;
        bool winDetect = VirtualGamepad.IsWindowsDetectingGamepad;

        string modeLabel = profile.OutputMode == OutputMode.UniversalGamepad
            ? "Universal Gamepad"
            : "Keyboard & Mouse";

        string detail = profile.OutputMode == OutputMode.KeyboardMouse
            ? (phoneConnected
                ? "Active: Keyboard & Mouse emulation (SendInput)."
                : "Ready for Keyboard & Mouse mode once Android controller connects.")
            : (!driverOk
                ? "Universal Gamepad requires PhantomVhfDriver (KMDF/VHF) to be installed; Keyboard & Mouse mode needs no driver."
                : devCreated && winDetect
                    ? "Virtual HID gamepad active and detected by Windows."
                    : VirtualGamepad.StatusMessage);

        return new SystemVerificationState(
            adb.AdbInstalled,
            phoneConnected,
            wsListening,
            phoneConnected && IsReceivingRecentInput,
            driverOk,
            devCreated,
            winDetect,
            modeLabel,
            profile.Name,
            detail);
    }

    public void SaveSettings()
    {
        try
        {
            var dir = Path.GetDirectoryName(SettingsPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(SettingsPath, JsonSerializer.Serialize(Settings, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex)
        {
            Logger.Warning("Settings", $"Failed to persist settings: {ex.Message}");
        }
    }

    private static CompanionSettings LoadSettings()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                return JsonSerializer.Deserialize<CompanionSettings>(File.ReadAllText(SettingsPath)) ?? new CompanionSettings();
            }
        }
        catch { }
        return new CompanionSettings();
    }

    public void Dispose()
    {
        _continuousTickTimer.Stop();
        Adb.Dispose();
        WebSocketServer.DisposeAsync().AsTask().GetAwaiter().GetResult();
        Pipeline.ReleaseAllOnDisconnect();
        VirtualGamepad.Dispose();
        KeyboardMouse.Dispose();
    }
}
