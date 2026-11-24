; ============================================================================
;  Instalador de FlagPlays para Windows (Inno Setup 6)
;  Genera dist\Instalador-FlagPlays-<versión>.exe
;  Instalación POR USUARIO (sin permisos de administrador).
; ============================================================================

#define AppName        "FlagPlays"
#ifndef AppVersion
  #define AppVersion   "1.1.0"
#endif
#ifndef AppVersionQuad
  #define AppVersionQuad "1.1.0.0"
#endif
#define AppPublisher   "FlagPlays"
#define AppExe         "FlagPlays.exe"
#define AppId          "{{B7E4C1A2-9F3D-4C6E-8A15-2D7F90C3E8B4}}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL=https://flagplays.app
AppSupportURL=https://flagplays.app
AppComments=Pizarra y libreta de jugadas de flag football
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableWelcomePage=no
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline
OutputDir=..\dist
OutputBaseFilename=Instalador-FlagPlays-{#AppVersion}
SetupIconFile=..\windows\FlagPlays.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
AppMutex=Local\FlagPlays.SingleInstance
CloseApplications=yes
RestartApplications=no
LicenseFile=..\windows\LICENCIA.txt
MinVersion=10.0
VersionInfoVersion={#AppVersionQuad}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription=Instalador de {#AppName}
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}
VersionInfoCopyright=© 2026 {#AppPublisher}

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
spanish.CreateDesktopIcon=Crear un &acceso directo en el escritorio
spanish.LaunchProgram=Ejecutar {#AppName}
english.CreateDesktopIcon=Create a &desktop shortcut
english.LaunchProgram=Launch {#AppName}
spanish.NoWebView2=Atención: este equipo no parece tener el componente «WebView2» de Microsoft, que FlagPlays necesita para dibujar la aplicación.%n%nEn Windows 10 y 11 suele venir instalado. Si al abrir FlagPlays ves un aviso, descarga el instalador gratuito «Evergreen Bootstrapper» desde:%nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703
english.NoWebView2=Warning: this computer does not seem to have Microsoft "WebView2", which FlagPlays needs to draw the app.%n%nIt usually comes with Windows 10 and 11. If FlagPlays shows a warning when opening, download the free "Evergreen Bootstrapper" from:%nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "..\dist\windows\FlagPlays\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Licencia y guía visibles en la carpeta de instalación
Source: "..\windows\LICENCIA.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"
Name: "{group}\Licencia"; Filename: "{app}\LICENCIA.txt"
Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; La libreta del usuario (%LOCALAPPDATA%\FlagPlays) NO se borra al desinstalar:
; así no se pierden las jugadas si alguien reinstala.
Type: filesandordirs; Name: "{app}"

[Code]
{ ¿Está instalado el runtime de WebView2? Se comprueba en las dos ubicaciones
  habituales (máquina y usuario) para no molestar con un aviso inútil. }
function WebView2Installed(): Boolean;
var
  Version: String;
begin
  Result :=
    RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) or
    RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) or
    RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version);
  Result := Result and (Version <> '');
end;

procedure InitializeWizard();
begin
  if not WebView2Installed() then
    MsgBox(ExpandConstant('{cm:NoWebView2}'), mbInformation, MB_OK);
end;
