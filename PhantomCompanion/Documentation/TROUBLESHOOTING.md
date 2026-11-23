# Troubleshooting Guide

| Symptom | Cause | Resolution |
| --- | --- | --- |
| ADB not detected | `adb.exe` not on `PATH` or installed | Install Android SDK Platform-Tools or set exact `adb.exe` path in **Settings -> Browse**. |
| Device shows `unauthorized` | Phone USB debugging RSA prompt unaccepted | Unlock Realme C51 screen, tap **Always allow from this computer**, click **Scan USB & Forward ADB**. |
| Device shows `offline` | Loose USB cable or charge-only cable | Use a data-capable USB cable and switch Android USB preference to **File Transfer / PTP**. |
| Phone connects, `BATTLEGROUNDS` moves mouse, but Universal Gamepad shows `VHF DRIVER: False` | `PhantomVhfDriver` kernel driver not yet compiled/signed/installed | Normal when driver isn't installed. Keyboard & Mouse mode works without a driver; see `README_DRIVER_SIGNING.md` for driver setup. |
| Anti-cheat game ignores mouse/keys | Elevated game process (Admin) or anti-cheat blocks user-mode `SendInput` | Run Phantom Companion with matching elevation only if appropriate, or verify whether the title restricts virtual input. |
| Controller buttons stuck after cable unplug | Physical USB drop | Companion detects WebSocket closure automatically and invokes `ReleaseAllOnDisconnect()` within milliseconds. |
