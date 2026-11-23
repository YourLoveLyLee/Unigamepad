# Build, Installation & Setup Guide

## 1. Automated Builds via GitHub Actions (Recommended)
Push this repository to GitHub. The workflow `.github/workflows/build-phantom.yml` builds two downloadable artifacts on every push:
1. **`PhantomCompanion-win-x64`**: Runs `dotnet test` and publishes `PhantomCompanion.exe` (self-contained `.NET 8` Windows x64).
2. **`PhantomController-android-debug-apk`**: Builds the Vite web bundle into `android-controller/app/src/main/assets/www` and compiles `app-debug.apk`.

## 2. Local Windows Companion Build (.NET 8 SDK)
```powershell
cd PhantomCompanion
dotnet test PhantomCompanion.sln
dotnet publish Desktop\PhantomCompanion.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

## 3. Android APK Local Build (Android Studio / Gradle)
```bash
npm run build
rm -rf android-controller/app/src/main/assets/www
cp -r dist android-controller/app/src/main/assets/www
cd android-controller
./gradlew assembleDebug
```

## 4. Realme C51 Phone Setup
1. Install `app-debug.apk` on your Realme C51 (or open the hosted web UI).
2. Enable **Developer Options -> USB Debugging**.
3. Connect the phone to Windows with a USB data cable and accept the **Allow USB Debugging (RSA fingerprint)** dialog.
4. Launch `PhantomCompanion.exe` on Windows; it automatically detects `adb.exe` and creates `adb reverse tcp:8765 tcp:8765`.
5. In the phone controller **Settings -> Diagnostics & AI -> Windows Companion Bridge**, click **Connect USB**.

## 5. Optional VHF Kernel Driver (Universal Gamepad Mode)
See `Driver/PhantomVhfDriver/README_DRIVER_SIGNING.md` for WDK compilation and Microsoft Attestation Signing steps. **Keyboard & Mouse mode (including the built-in `BATTLEGROUNDS` profile) works immediately without installing any kernel driver.**
