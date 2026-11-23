# PhantomVhfDriver Build & Code-Signing Guide

> **Notice:** Kernel-mode driver binaries (`.sys` / `.cat`) cannot be compiled or Microsoft-signed inside the Linux workspace environment. This folder contains the complete KMDF + Microsoft Virtual HID Framework (VHF) C source, HID Report Descriptor, INF, and Visual Studio WDK project file for Windows 10/11 x64 compilation.

## Prerequisites on Windows Build Machine
1. Visual Studio 2022 with **Desktop development with C++**
2. **Windows SDK** (10.0.22621+ or matching WDK version)
3. **Windows Driver Kit (WDK)** matching the SDK version

## Production Release Signing (End-User PCs with Secure Boot Enabled)
Windows 10/11 x64 requires kernel-mode drivers to be signed before loading:
1. Build `PhantomVhfDriver.vcxproj` in `Release | x64`.
2. Obtain an **Extended Validation (EV) Code Signing Certificate** and register with the **Microsoft Hardware Dev Center**.
3. Create the `.cat` catalog via `Inf2Cat.exe`, submit the driver package for **Microsoft Attestation Signing**, and download the Microsoft-signed `.sys` + `.cat`.
4. Install as Administrator via:
   ```powershell
   pnputil /add-driver PhantomVhfDriver.inf /install
   devcon install PhantomVhfDriver.inf Root\PhantomVhfGamepad
   ```

## Local Developer Testing Only (Explicit Opt-In)
On a dedicated test VM where Microsoft Attestation Signing is not yet available, Windows only loads test-signed drivers if the machine administrator explicitly enables test signing:
```cmd
bcdedit /set testsigning on
```
**Never** disable Secure Boot or DSE automatically on an end-user machine. **Keyboard & Mouse mode (`SendInput`) works immediately out of the box without any kernel driver.**
