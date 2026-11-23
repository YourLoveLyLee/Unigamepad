# Virtual Gamepad Driver Research & Architecture Decision

## Why Not ViGEmBus by Default?
- **ViGEmBus** (by Nefarius Software Solutions) was officially **discontinued and retired in 2023** and is no longer maintained for future Windows kernel updates. While older signed releases exist in the wild, building a greenfield product around a retired third-party driver introduces long-term maintenance and Windows compatibility risk.

## Selected Long-Term Kernel Architecture: Microsoft Virtual HID Framework (VHF)
- Windows 10/11 includes **VHF (`VhfKm.lib` / `vhf.inf`)** as an inbox kernel framework maintained by Microsoft.
- `PhantomVhfDriver` is a clean, purpose-built **KMDF + VHF driver** (`Driver/PhantomVhfDriver/`) that registers a standard USB HID Gamepad (`Usage Page: Generic Desktop`, `Usage: Game Pad`) with 16 buttons, 8-way hat switch, 2x 8-bit triggers, and 4x 16-bit thumbstick axes.
- The user-mode companion (`VhfIoctlBackend`) submits 14-byte `PhantomHidInputReport` buffers to `\\.\PhantomVhfGamepad` via `DeviceIoControl`.

## XInput vs. HID / DirectInput Compatibility
- **HID & DirectInput Games / Steam Input / SDL2**: Automatically recognize any standard HID Gamepad enumerated by Windows VHF (`VID_1209 / PID_7A3E`). When Steam Input or Xbox Gamepad mapping is active, HID devices map transparently to Xbox-style controls.
- **Native XInput-Only Games**: Windows `xinput1_4.dll` only exposes devices matching Microsoft's GIP / Xbox 360 / Xbox One hardware interface (`XUSB`). A raw HID driver alone does not register as an `XInput` slot unless paired with either a Virtual XUSB bus driver (e.g., Xbox 360 PDO emulation) or a user-space input mapper like Steam Input / SDL.
- **Anti-Cheat & Protected Titles**: Games protected by kernel anti-cheat systems (e.g., Vanguard, EAC, BattlEye) may inspect or reject virtual controllers or synthetic input (`SendInput`). Phantom Companion explicitly documents this and never makes false universal claims.

## Driver Signing Reality
- All production Windows 10/11 x64 systems with Secure Boot require KMDF drivers to be signed via an **EV Code Signing Certificate + Microsoft Hardware Dev Center Attestation Signing**.
- **Keyboard & Mouse Mode (`Win32SendInputBackend`)** requires **zero kernel drivers** and works immediately on any Windows 10/11 system.
