[Setup]
AppName=PHANTOM COMPANION
AppVersion=1.0.0
AppPublisher=Phantom Peripheral Architecture
DefaultDirName={autopf}\PhantomCompanion
DefaultGroupName=Phantom Companion
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputBaseFilename=PhantomCompanion-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Files]
Source: "..\Desktop\bin\Release\net8.0-windows\win-x64\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\Documentation\*"; DestDir: "{app}\Documentation"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\Phantom Companion"; Filename: "{app}\PhantomCompanion.exe"
Name: "{autodesktop}\Phantom Companion"; Filename: "{app}\PhantomCompanion.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\PhantomCompanion.exe"; Description: "Launch Phantom Companion"; Flags: nowait postinstall skipifsilent
