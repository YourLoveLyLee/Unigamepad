using System.Collections.ObjectModel;
using System.IO;
using System.Windows;
using Microsoft.Win32;
using PhantomCompanion.ADB;
using PhantomCompanion.Communication.Transport;
using PhantomCompanion.Desktop.Services;
using PhantomCompanion.Diagnostics;
using PhantomCompanion.InputCore.Profiles;
using PhantomCompanion.InputCore.State;
using PhantomCompanion.VirtualGamepad;

namespace PhantomCompanion.Desktop.ViewModels;

public sealed class MappingRowItem : ObservableObject
{
    public string InputKey { get; }
    public string DisplayLabel { get; }

    private XboxButtonTarget _gamepadTarget;
    public XboxButtonTarget GamepadTarget
    {
        get => _gamepadTarget;
        set => SetProperty(ref _gamepadTarget, value);
    }

    private KbMouseActionType _kbActionType;
    public KbMouseActionType KbActionType
    {
        get => _kbActionType;
        set => SetProperty(ref _kbActionType, value);
    }

    private string _kbKeyName = string.Empty;
    public string KbKeyName
    {
        get => _kbKeyName;
        set => SetProperty(ref _kbKeyName, value);
    }

    public MappingRowItem(string inputKey, string displayLabel)
    {
        InputKey = inputKey;
        DisplayLabel = displayLabel;
    }
}

public sealed class MainViewModel : ObservableObject, IDisposable
{
    private readonly CompanionOrchestrator _orchestrator;

    private int _selectedTabIndex;
    public int SelectedTabIndex
    {
        get => _selectedTabIndex;
        set => SetProperty(ref _selectedTabIndex, value);
    }

    private ControllerProfile _selectedProfile;
    public ControllerProfile SelectedProfile
    {
        get => _selectedProfile;
        set
        {
            if (SetProperty(ref _selectedProfile, value) && value is not null)
            {
                _orchestrator.Profiles.SelectProfile(value.Id);
                LoadMappingRowsFromProfile(value);
                OnPropertyChanged(nameof(IsUniversalGamepadMode));
                OnPropertyChanged(nameof(IsKeyboardMouseMode));
                OnPropertyChanged(nameof(CanDeleteSelectedProfile));
                RefreshStatusFields();
            }
        }
    }

    public ObservableCollection<ControllerProfile> ProfilesList { get; } = new();
    public ObservableCollection<MappingRowItem> MappingRows { get; } = new();
    public ObservableCollection<AdbDeviceInfo> AdbDevices { get; } = new();
    public ObservableCollection<DiagnosticLogEntry> DiagnosticLogs { get; } = new();

    public Array OutputModes { get; } = Enum.GetValues<OutputMode>();
    public Array XboxTargets { get; } = Enum.GetValues<XboxButtonTarget>();
    public Array KbMouseActions { get; } = Enum.GetValues<KbMouseActionType>();
    public Array TouchpadModes { get; } = Enum.GetValues<TouchpadMode>();

    public bool IsUniversalGamepadMode
    {
        get => SelectedProfile.OutputMode == OutputMode.UniversalGamepad;
        set
        {
            if (value && SelectedProfile.OutputMode != OutputMode.UniversalGamepad)
            {
                SelectedProfile.OutputMode = OutputMode.UniversalGamepad;
                ApplyAndSaveProfileEdits();
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsKeyboardMouseMode));
            }
        }
    }

    public bool IsKeyboardMouseMode
    {
        get => SelectedProfile.OutputMode == OutputMode.KeyboardMouse;
        set
        {
            if (value && SelectedProfile.OutputMode != OutputMode.KeyboardMouse)
            {
                SelectedProfile.OutputMode = OutputMode.KeyboardMouse;
                ApplyAndSaveProfileEdits();
                OnPropertyChanged();
                OnPropertyChanged(nameof(IsUniversalGamepadMode));
            }
        }
    }

    public bool CanDeleteSelectedProfile => SelectedProfile is { IsBuiltIn: false };

    private string _newProfileName = string.Empty;
    public string NewProfileName
    {
        get => _newProfileName;
        set => SetProperty(ref _newProfileName, value);
    }

    // Honest 6-step system verification readout
    private SystemVerificationState _verification;
    public SystemVerificationState Verification
    {
        get => _verification;
        private set => SetProperty(ref _verification, value);
    }

    private AdbStatusSnapshot _adbStatus;
    public AdbStatusSnapshot AdbStatus
    {
        get => _adbStatus;
        private set => SetProperty(ref _adbStatus, value);
    }

    private LatencyTelemetry _telemetry = new(null, 0, 0, 0, 0, 0);
    public LatencyTelemetry Telemetry
    {
        get => _telemetry;
        private set => SetProperty(ref _telemetry, value);
    }

    private string _windowsProbeSummary = "Run Windows Device Probe in Diagnostics to inspect live HID & XInput interfaces.";
    public string WindowsProbeSummary
    {
        get => _windowsProbeSummary;
        private set => SetProperty(ref _windowsProbeSummary, value);
    }

    private string _stickSummary = "LX: 0.00  LY: 0.00  |  RX: 0.00  RY: 0.00";
    public string StickSummary
    {
        get => _stickSummary;
        private set => SetProperty(ref _stickSummary, value);
    }

    private string _customAdbPath;
    public string CustomAdbPath
    {
        get => _customAdbPath;
        set
        {
            if (SetProperty(ref _customAdbPath, value))
            {
                _orchestrator.Settings.CustomAdbPath = value;
                _orchestrator.Adb.SetCustomAdbPath(value);
                _orchestrator.SaveSettings();
            }
        }
    }

    private int _webSocketPort;
    public int WebSocketPort
    {
        get => _webSocketPort;
        set => SetProperty(ref _webSocketPort, value);
    }

    public bool AutoStartServer
    {
        get => _orchestrator.Settings.AutoStartServer;
        set
        {
            _orchestrator.Settings.AutoStartServer = value;
            _orchestrator.SaveSettings();
            OnPropertyChanged();
        }
    }

    public bool AutoForwardAdb
    {
        get => _orchestrator.Settings.AutoForwardAdb;
        set
        {
            _orchestrator.Settings.AutoForwardAdb = value;
            _orchestrator.SaveSettings();
            OnPropertyChanged();
        }
    }

    public string WebSocketEndpoint => $"ws://127.0.0.1:{_orchestrator.Settings.WebSocketPort}";
    public string WebSocketStateLabel => _orchestrator.WebSocketServer.State.ToString();

    public RelayCommand SelectSectionCommand { get; }
    public RelayCommand StartServerCommand { get; }
    public RelayCommand StopServerCommand { get; }
    public RelayCommand RefreshAdbCommand { get; }
    public RelayCommand ProbeWindowsGamepadCommand { get; }
    public RelayCommand SendTestGamepadReportCommand { get; }
    public RelayCommand SaveProfileCommand { get; }
    public RelayCommand CreateProfileCommand { get; }
    public RelayCommand DuplicateProfileCommand { get; }
    public RelayCommand DeleteProfileCommand { get; }
    public RelayCommand ResetBuiltInProfileCommand { get; }
    public RelayCommand ExportProfileCommand { get; }
    public RelayCommand ImportProfileCommand { get; }
    public RelayCommand BrowseAdbCommand { get; }
    public RelayCommand ApplyPortCommand { get; }
    public RelayCommand ClearLogsCommand { get; }

    public event Action<ControllerStateSnapshot>? ControllerVisualStateReady;

    public MainViewModel(CompanionOrchestrator orchestrator)
    {
        _orchestrator = orchestrator;
        _selectedProfile = _orchestrator.Profiles.ActiveProfile;
        _verification = _orchestrator.BuildVerificationState();
        _adbStatus = _orchestrator.Adb.CurrentStatus;
        _customAdbPath = _orchestrator.Settings.CustomAdbPath;
        _webSocketPort = _orchestrator.Settings.WebSocketPort;

        RefreshProfilesCollection();
        LoadMappingRowsFromProfile(_selectedProfile);

        SelectSectionCommand = new RelayCommand(idx =>
        {
            if (idx is string s && int.TryParse(s, out int n)) SelectedTabIndex = n;
        });

        StartServerCommand = new RelayCommand(async () =>
        {
            await _orchestrator.WebSocketServer.StartAsync();
            RefreshStatusFields();
        });

        StopServerCommand = new RelayCommand(async () =>
        {
            await _orchestrator.WebSocketServer.StopAsync();
            RefreshStatusFields();
        });

        RefreshAdbCommand = new RelayCommand(async () =>
        {
            await _orchestrator.Adb.RefreshAndForwardAsync(_orchestrator.Settings.WebSocketPort);
            RefreshStatusFields();
        });

        ProbeWindowsGamepadCommand = new RelayCommand(() =>
        {
            _orchestrator.VirtualGamepad.RefreshStatusAndEnsureDevice();
            var diag = GamepadDiagnostics.Collect(_orchestrator.VirtualGamepad);
            WindowsProbeSummary =
                $"{diag.DriverStatus.GuidanceMessage}\n" +
                $"HID Probe: {diag.DiscoverySnapshot.Summary}\n" +
                $"Last 14B HID Report: {diag.LastReportHex} | Submitted: {diag.ReportsSubmitted}";
            RefreshStatusFields();
        });

        SendTestGamepadReportCommand = new RelayCommand(() =>
        {
            var res = _orchestrator.VirtualGamepad.SendDiagnosticNeutralPulse();
            WindowsProbeSummary = res.Message;
            RefreshStatusFields();
        });

        SaveProfileCommand = new RelayCommand(ApplyAndSaveProfileEdits);

        CreateProfileCommand = new RelayCommand(() =>
        {
            var created = _orchestrator.Profiles.CreateProfile(
                string.IsNullOrWhiteSpace(NewProfileName) ? "Custom Preset" : NewProfileName,
                OutputMode.KeyboardMouse);
            NewProfileName = string.Empty;
            RefreshProfilesCollection();
            SelectedProfile = created;
        });

        DuplicateProfileCommand = new RelayCommand(() =>
        {
            var copy = _orchestrator.Profiles.DuplicateProfile(SelectedProfile.Id);
            RefreshProfilesCollection();
            SelectedProfile = copy;
        });

        DeleteProfileCommand = new RelayCommand(() =>
        {
            if (_orchestrator.Profiles.DeleteCustomProfile(SelectedProfile.Id))
            {
                RefreshProfilesCollection();
                SelectedProfile = _orchestrator.Profiles.ActiveProfile;
            }
        });

        ResetBuiltInProfileCommand = new RelayCommand(() =>
        {
            var reset = _orchestrator.Profiles.ResetBuiltInProfile(SelectedProfile.Id);
            if (reset is not null)
            {
                RefreshProfilesCollection();
                SelectedProfile = reset;
            }
        });

        ExportProfileCommand = new RelayCommand(() =>
        {
            var dlg = new SaveFileDialog
            {
                Filter = "Phantom Profile (*.json)|*.json",
                FileName = $"{SelectedProfile.Name.Replace(' ', '_')}.phantom-profile.json"
            };
            if (dlg.ShowDialog() == true)
            {
                File.WriteAllText(dlg.FileName, _orchestrator.Profiles.ExportProfileJson(SelectedProfile.Id));
            }
        });

        ImportProfileCommand = new RelayCommand(() =>
        {
            var dlg = new OpenFileDialog { Filter = "JSON Files (*.json)|*.json" };
            if (dlg.ShowDialog() == true)
            {
                var imported = _orchestrator.Profiles.ImportProfileJson(File.ReadAllText(dlg.FileName));
                RefreshProfilesCollection();
                SelectedProfile = imported;
            }
        });

        BrowseAdbCommand = new RelayCommand(() =>
        {
            var dlg = new OpenFileDialog
            {
                Filter = "adb.exe|adb.exe|Executable (*.exe)|*.exe",
                Title = "Locate Android Debug Bridge (adb.exe)"
            };
            if (dlg.ShowDialog() == true)
            {
                CustomAdbPath = dlg.FileName;
            }
        });

        ApplyPortCommand = new RelayCommand(async () =>
        {
            await _orchestrator.RestartWebSocketAsync(WebSocketPort);
            OnPropertyChanged(nameof(WebSocketEndpoint));
            RefreshStatusFields();
        });

        ClearLogsCommand = new RelayCommand(() =>
        {
            _orchestrator.Logger.Clear();
            DiagnosticLogs.Clear();
        });

        _orchestrator.ControllerStateUpdated += snap =>
        {
            Application.Current?.Dispatcher.BeginInvoke(() =>
            {
                StickSummary = $"LX: {snap.LeftStickX:F2}  LY: {snap.LeftStickY:F2}  |  RX: {snap.RightStickX:F2}  RY: {snap.RightStickY:F2}  |  L2: {snap.L2Value:F2}  R2: {snap.R2Value:F2}";
                ControllerVisualStateReady?.Invoke(snap);
            });
        };

        _orchestrator.StatusRefreshed += () => Application.Current?.Dispatcher.BeginInvoke(RefreshStatusFields);
        _orchestrator.Adb.StatusChanged += _ => Application.Current?.Dispatcher.BeginInvoke(RefreshStatusFields);
        _orchestrator.Logger.EntryAdded += entry => Application.Current?.Dispatcher.BeginInvoke(() =>
        {
            DiagnosticLogs.Insert(0, entry);
            while (DiagnosticLogs.Count > 200) DiagnosticLogs.RemoveAt(DiagnosticLogs.Count - 1);
        });
    }

    public async Task StartAsync()
    {
        await _orchestrator.InitializeAsync();
        RefreshStatusFields();
    }

    public void RefreshTelemetryTick()
    {
        Telemetry = _orchestrator.WebSocketServer.GetTelemetry();
        Verification = _orchestrator.BuildVerificationState();
    }

    private void RefreshProfilesCollection()
    {
        ProfilesList.Clear();
        foreach (var p in _orchestrator.Profiles.Profiles)
        {
            ProfilesList.Add(p);
        }
    }

    private void LoadMappingRowsFromProfile(ControllerProfile profile)
    {
        MappingRows.Clear();
        var orderedKeys = new[]
        {
            ("L1", "L1 (Upper Left Trigger)"),
            ("R1", "R1 (Upper Right Trigger)"),
            ("L2", "L2 (Lower Left Trigger)"),
            ("R2", "R2 (Lower Right Trigger)"),
            ("SQUARE", "Square (Left Face)"),
            ("TRIANGLE", "Triangle (Top Face)"),
            ("CIRCLE", "Circle (Right Face)"),
            ("CROSS", "Cross (Bottom Face)"),
            ("UP", "D-Pad Up"),
            ("DOWN", "D-Pad Down"),
            ("LEFT", "D-Pad Left"),
            ("RIGHT", "D-Pad Right"),
            ("TOUCHPAD_CLICK", "Touchpad Click")
        };

        foreach (var (key, label) in orderedKeys)
        {
            var row = new MappingRowItem(key, label)
            {
                GamepadTarget = profile.GamepadMappings.GetValueOrDefault(key, XboxButtonTarget.None)
            };
            if (profile.KbMouseMappings.TryGetValue(key, out var kb))
            {
                row.KbActionType = kb.ActionType;
                row.KbKeyName = kb.KeyName;
            }
            MappingRows.Add(row);
        }
    }

    private void ApplyAndSaveProfileEdits()
    {
        foreach (var row in MappingRows)
        {
            SelectedProfile.GamepadMappings[row.InputKey] = row.GamepadTarget;
            SelectedProfile.KbMouseMappings[row.InputKey] = new KbMouseBinding
            {
                ActionType = row.KbActionType,
                KeyName = row.KbKeyName?.Trim() ?? string.Empty,
                Description = row.KbActionType == KbMouseActionType.None ? "Unassigned" : row.KbKeyName
            };
        }
        _orchestrator.Profiles.Save();
        _orchestrator.Pipeline.SetActiveProfile(SelectedProfile);
        RefreshStatusFields();
        _orchestrator.Logger.Info("Profile", $"Saved mappings for '{SelectedProfile.Name}'.");
    }

    private void RefreshStatusFields()
    {
        Verification = _orchestrator.BuildVerificationState();
        AdbStatus = _orchestrator.Adb.CurrentStatus;
        Telemetry = _orchestrator.WebSocketServer.GetTelemetry();
        OnPropertyChanged(nameof(WebSocketStateLabel));
        OnPropertyChanged(nameof(WebSocketEndpoint));

        AdbDevices.Clear();
        foreach (var d in AdbStatus.Devices)
        {
            AdbDevices.Add(d);
        }
    }

    public void Dispose()
    {
        _orchestrator.Dispose();
    }
}
