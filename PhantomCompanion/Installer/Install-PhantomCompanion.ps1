#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "$env:ProgramFiles\PhantomCompanion",
    [string]$DriverInfPath = ""
)

$ErrorActionPreference = "Stop"
Write-Host "=== PHANTOM COMPANION INSTALLER ===" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# 1. Copy Desktop application binaries if built in .\publish
$publishDir = Join-Path $PSScriptRoot "..\Desktop\bin\Release\net8.0-windows\win-x64\publish"
if (Test-Path $publishDir) {
    Copy-Item -Path "$publishDir\*" -Destination $InstallDir -Recurse -Force
    Write-Host "[OK] Copied PhantomCompanion binaries to $InstallDir" -ForegroundColor Green
} else {
    Write-Host "[INFO] Published binaries not found at $publishDir. Build Desktop first or run GitHub Actions release artifact." -ForegroundColor Yellow
}

# 2. Optional signed VHF virtual gamepad driver installation (only if supplied & signed)
if (-not [string]::IsNullOrWhiteSpace($DriverInfPath) -and (Test-Path $DriverInfPath)) {
    Write-Host "[INFO] Installing signed PhantomVhfDriver package via pnputil..." -ForegroundColor Cyan
    & pnputil.exe /add-driver $DriverInfPath /install
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Driver installation returned exit code $LASTEXITCODE. Ensure the driver catalog is Microsoft-signed (or test-signing is explicitly enabled on a test machine). Keyboard & Mouse mode still works without the driver."
    } else {
        Write-Host "[OK] PhantomVhfDriver registered." -ForegroundColor Green
    }
} else {
    Write-Host "[INFO] Skipping kernel driver installation (Keyboard & Mouse mode works immediately without kernel drivers)." -ForegroundColor Gray
}

# 3. Create Start Menu shortcut
$exePath = Join-Path $InstallDir "PhantomCompanion.exe"
if (Test-Path $exePath) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Phantom Companion.lnk"
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $InstallDir
    $shortcut.Save()
    Write-Host "[OK] Start Menu shortcut created." -ForegroundColor Green
}
