using System.Diagnostics;
using PhantomCompanion.Diagnostics;

namespace PhantomCompanion.ADB;

public enum AdbDeviceAuthState
{
    None,
    Authorized,
    Unauthorized,
    Offline
}

public sealed record AdbDeviceInfo(
    string Serial,
    string StateRaw,
    AdbDeviceAuthState AuthState,
    string Model);

public sealed record AdbStatusSnapshot(
    bool AdbInstalled,
    string AdbExecutablePath,
    IReadOnlyList<AdbDeviceInfo> Devices,
    AdbDeviceInfo? ActiveDevice,
    bool ReverseTunnelActive,
    int ForwardedPort,
    string StatusMessage);

public sealed class AdbManager : IDisposable
{
    private readonly DiagnosticLogger _logger;
    private string _configuredAdbPath = string.Empty;
    private CancellationTokenSource? _monitorCts;
    private Task? _monitorTask;

    public AdbStatusSnapshot CurrentStatus { get; private set; }
    public event Action<AdbStatusSnapshot>? StatusChanged;

    public AdbManager(DiagnosticLogger logger)
    {
        _logger = logger;
        var detected = ResolveAdbExecutable(string.Empty);
        CurrentStatus = new AdbStatusSnapshot(
            !string.IsNullOrEmpty(detected),
            detected,
            Array.Empty<AdbDeviceInfo>(),
            null,
            false,
            8765,
            !string.IsNullOrEmpty(detected) ? "ADB executable ready." : "ADB executable not found.");
    }

    public void SetCustomAdbPath(string path)
    {
        _configuredAdbPath = path?.Trim() ?? string.Empty;
    }

    public string ResolveAdbExecutable(string? overridePath = null)
    {
        var candidate = !string.IsNullOrWhiteSpace(overridePath) ? overridePath : _configuredAdbPath;
        if (!string.IsNullOrWhiteSpace(candidate) && File.Exists(candidate))
            return candidate;

        var commonPaths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "platform-tools", "adb.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Android", "Sdk", "platform-tools", "adb.exe"),
            @"C:\platform-tools\adb.exe",
            @"C:\Android\platform-tools\adb.exe"
        };

        foreach (var p in commonPaths)
        {
            if (File.Exists(p)) return p;
        }

        // Probe PATH
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var exe = OperatingSystem.IsWindows() ? "adb.exe" : "adb";
            var full = Path.Combine(dir.Trim(), exe);
            if (File.Exists(full)) return full;
        }

        return string.Empty;
    }

    public async Task<AdbStatusSnapshot> RefreshAndForwardAsync(int port = 8765, CancellationToken ct = default)
    {
        string adbExe = ResolveAdbExecutable();
        if (string.IsNullOrEmpty(adbExe))
        {
            var missing = new AdbStatusSnapshot(
                false,
                string.Empty,
                Array.Empty<AdbDeviceInfo>(),
                null,
                false,
                port,
                "ADB not detected. Install Android platform-tools or set adb.exe path in Settings.");
            UpdateStatus(missing);
            return missing;
        }

        var devicesResult = await RunAdbAsync(adbExe, new[] { "devices", "-l" }, TimeSpan.FromSeconds(5), ct).ConfigureAwait(false);
        if (!devicesResult.Success)
        {
            var errSnap = new AdbStatusSnapshot(
                true,
                adbExe,
                Array.Empty<AdbDeviceInfo>(),
                null,
                false,
                port,
                $"ADB query failed: {devicesResult.StdErr}");
            UpdateStatus(errSnap);
            return errSnap;
        }

        var devices = ParseDevicesOutput(devicesResult.StdOut);
        var authorized = devices.FirstOrDefault(d => d.AuthState == AdbDeviceAuthState.Authorized);

        if (authorized is null)
        {
            var msg = devices.Any(d => d.AuthState == AdbDeviceAuthState.Unauthorized)
                ? "USB debugging authorization pending on phone. Accept the RSA fingerprint prompt on your Realme C51."
                : devices.Any(d => d.AuthState == AdbDeviceAuthState.Offline)
                    ? "Device detected as offline. Unplug and reconnect the USB cable."
                    : "No Android device connected via USB.";

            var snap = new AdbStatusSnapshot(true, adbExe, devices, null, false, port, msg);
            UpdateStatus(snap);
            return snap;
        }

        var reverseResult = await RunAdbAsync(
            adbExe,
            new[] { "-s", authorized.Serial, "reverse", $"tcp:{port}", $"tcp:{port}" },
            TimeSpan.FromSeconds(5),
            ct).ConfigureAwait(false);

        if (!reverseResult.Success)
        {
            _logger.Warning("ADB", $"adb reverse failed for {authorized.Serial}: {reverseResult.StdErr}");
            var failSnap = new AdbStatusSnapshot(
                true,
                adbExe,
                devices,
                authorized,
                false,
                port,
                $"Connected to {authorized.Model} ({authorized.Serial}), but reverse forwarding failed: {reverseResult.StdErr}");
            UpdateStatus(failSnap);
            return failSnap;
        }

        var okSnap = new AdbStatusSnapshot(
            true,
            adbExe,
            devices,
            authorized,
            true,
            port,
            $"USB forward active: {authorized.Model} ({authorized.Serial}) -> tcp:{port}");
        UpdateStatus(okSnap);
        return okSnap;
    }

    public void StartMonitoring(int port = 8765, TimeSpan? interval = null)
    {
        StopMonitoring();
        _monitorCts = new CancellationTokenSource();
        var period = interval ?? TimeSpan.FromSeconds(3);
        _monitorTask = Task.Run(async () =>
        {
            while (!_monitorCts.Token.IsCancellationRequested)
            {
                try
                {
                    await RefreshAndForwardAsync(port, _monitorCts.Token).ConfigureAwait(false);
                    await Task.Delay(period, _monitorCts.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.Warning("ADB", $"Monitor tick error: {ex.Message}");
                }
            }
        }, _monitorCts.Token);
    }

    public void StopMonitoring()
    {
        _monitorCts?.Cancel();
        _monitorCts?.Dispose();
        _monitorCts = null;
        _monitorTask = null;
    }

    public static IReadOnlyList<AdbDeviceInfo> ParseDevicesOutput(string output)
    {
        var list = new List<AdbDeviceInfo>();
        var lines = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (var raw in lines)
        {
            var line = raw.Trim();
            if (line.StartsWith("List of devices", StringComparison.OrdinalIgnoreCase) || string.IsNullOrWhiteSpace(line))
                continue;

            var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) continue;

            string serial = parts[0];
            string stateRaw = parts[1].ToLowerInvariant();
            var auth = stateRaw switch
            {
                "device" => AdbDeviceAuthState.Authorized,
                "unauthorized" => AdbDeviceAuthState.Unauthorized,
                "offline" => AdbDeviceAuthState.Offline,
                _ => AdbDeviceAuthState.None
            };

            string model = serial;
            foreach (var p in parts.Skip(2))
            {
                if (p.StartsWith("model:", StringComparison.OrdinalIgnoreCase))
                {
                    model = p[6..].Replace('_', ' ');
                    break;
                }
            }

            list.Add(new AdbDeviceInfo(serial, stateRaw, auth, model));
        }
        return list;
    }

    private static async Task<(bool Success, string StdOut, string StdErr)> RunAdbAsync(
        string adbExe,
        IEnumerable<string> args,
        TimeSpan timeout,
        CancellationToken ct)
    {
        using var psi = new Process();
        psi.StartInfo = new ProcessStartInfo
        {
            FileName = adbExe,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var arg in args)
        {
            psi.StartInfo.ArgumentList.Add(arg);
        }

        psi.Start();
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(timeout);

        try
        {
            var stdOutTask = psi.StandardOutput.ReadToEndAsync(timeoutCts.Token);
            var stdErrTask = psi.StandardError.ReadToEndAsync(timeoutCts.Token);
            await psi.WaitForExitAsync(timeoutCts.Token).ConfigureAwait(false);
            string stdout = await stdOutTask.ConfigureAwait(false);
            string stderr = await stdErrTask.ConfigureAwait(false);
            return (psi.ExitCode == 0, stdout.Trim(), stderr.Trim());
        }
        catch (OperationCanceledException)
        {
            try { psi.Kill(entireProcessTree: true); } catch { }
            return (false, string.Empty, "ADB command timed out.");
        }
    }

    private void UpdateStatus(AdbStatusSnapshot next)
    {
        bool changed = CurrentStatus.StatusMessage != next.StatusMessage ||
                       CurrentStatus.ReverseTunnelActive != next.ReverseTunnelActive ||
                       CurrentStatus.ActiveDevice?.Serial != next.ActiveDevice?.Serial;
        CurrentStatus = next;
        if (changed)
        {
            _logger.Info("ADB", next.StatusMessage);
        }
        StatusChanged?.Invoke(next);
    }

    public void Dispose()
    {
        StopMonitoring();
    }
}
