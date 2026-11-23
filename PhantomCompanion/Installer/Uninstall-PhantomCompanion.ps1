#Requires -RunAsAdministrator
param(
    [string]$InstallDir = "$env:ProgramFiles\PhantomCompanion",
    [switch]$RemoveDriver
)

$ErrorActionPreference = "Stop"
Write-Host "=== PHANTOM COMPANION UNINSTALLER ===" -ForegroundColor Cyan

Get-Process -Name "PhantomCompanion" -ErrorAction SilentlyContinue | Stop-Process -Force

if ($RemoveDriver) {
    $oemInfs = & pnputil.exe /enum-drivers | Select-String -Pattern "PhantomVhfDriver" -Context 3,0
    if ($oemInfs) {
        Write-Host "[INFO] Found PhantomVhfDriver in Driver Store. Run 'pnputil /delete-driver <oemXX.inf> /uninstall /force' if full kernel removal is desired." -ForegroundColor Yellow
    }
}

$shortcutPath = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Phantom Companion.lnk"
if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force }
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }

Write-Host "[OK] Phantom Companion uninstalled cleanly." -ForegroundColor Green
