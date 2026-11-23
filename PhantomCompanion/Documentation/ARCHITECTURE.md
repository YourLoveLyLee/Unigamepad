# Phantom Companion System Architecture

```
ANDROID PHONE (Realme C51)
  Phantom Controller (Android APK / Mobile Web UI)
        │  JSON events over WebSocket (ws://127.0.0.1:8765)
        ▼
USB CABLE + ADB REVERSE TUNNEL (adb reverse tcp:8765 tcp:8765)
        │
        ▼
WINDOWS COMPANION (.NET 8)
  ├── PhantomCompanion.ADB            (adb.exe discovery, device auth checks, reverse forwarding)
  ├── PhantomCompanion.Communication  (Localhost-only WebSocket listener, schema validation, RTT)
  ├── PhantomCompanion.InputCore      (ProtocolParser, ProfileManager, InputPipeline, ShapeStick)
  ├── PhantomCompanion.KeyboardMouse  (Mode B: Win32 SendInput WASD + mouse aim + M1/M2 + keys)
  ├── PhantomCompanion.VirtualGamepad (Mode A: DeviceDiscovery, GamepadReportBuilder, VhfIoctlBackend)
  └── PhantomCompanion.Desktop        (WPF DualSense-matched UI: Controller, Connection, Profiles, Diagnostics, Settings)
        │
        ├─[Mode A: Universal Gamepad]──► DeviceIoControl(\\.\PhantomVhfGamepad) ──► PhantomVhfDriver (KMDF+VHF) ──► Windows HID Stack
        └─[Mode B: Keyboard & Mouse]───► Win32 SendInput() ──► Windows Raw/Desktop Input Queue
```

## Mutual Exclusion Guarantee
`InputPipeline.SetActiveProfile()` immediately calls `ReleaseAll()` on both `IGamepadSink` and `IKeyboardMouseSink` whenever switching between `OutputMode.UniversalGamepad` and `OutputMode.KeyboardMouse`, preventing stuck keys or ghost triggers.
