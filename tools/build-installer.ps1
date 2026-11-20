# Genera el instalador de FlagPlays (dist\Instalador-FlagPlays-<version>.exe).
# Requiere Inno Setup 6; si no está, lo descarga e instala para el usuario actual.
param([switch]$Clean, [switch]$SkipInnoInstall)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Iss = Join-Path $PSScriptRoot 'installer.iss'
$Cache = Join-Path $Root '.cache\inno'
$InnoUrl = 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_4/innosetup-6.7.4.exe'

function Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

function Find-Iscc {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
        'C:\Program Files\Inno Setup 6\ISCC.exe',
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 7\ISCC.exe'),
        'C:\Program Files (x86)\Inno Setup 7\ISCC.exe'
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    return $null
}

Step "Comprobando Inno Setup"
$iscc = Find-Iscc
if (-not $iscc) {
    if ($SkipInnoInstall) { Fail "No encuentro ISCC.exe y se ha pedido no instalar nada." }
    Step "No está instalado: descargando Inno Setup 6"
    New-Item -ItemType Directory -Force -Path $Cache | Out-Null
    $setup = Join-Path $Cache 'innosetup.exe'
    if (-not (Test-Path $setup)) {
        Invoke-WebRequest -Uri $InnoUrl -OutFile $setup -UseBasicParsing
    }
    $sig = (Get-AuthenticodeSignature $setup).Status
    Write-Host "    descargado $([math]::Round((Get-Item $setup).Length / 1MB, 2)) MB (firma: $sig)"
    Step "Instalando Inno Setup para el usuario actual (sin admin)"
    Start-Process -FilePath $setup -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/CURRENTUSER' -Wait
    $iscc = Find-Iscc
    if (-not $iscc) { Fail "La instalación de Inno Setup no ha dejado ISCC.exe localizable." }
}
Write-Host "    ISCC: $iscc"

# El instalador empaqueta el build de Windows. Se regenera SIEMPRE: si no, la
# web empaquetada (www/) puede quedarse antigua respecto a src/ y styles/.
Step "Regenerando la app de Windows (www incluida)"
& pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-win.ps1')
if ($LASTEXITCODE -ne 0) { Fail "build-win.ps1 ha fallado." }
$payload = Join-Path $Root 'dist\windows\FlagPlays\FlagPlays.exe'
if (-not (Test-Path $payload)) { Fail "No se ha generado el ejecutable de Windows." }

if ($Clean) {
    Step "Limpiando instaladores anteriores"
    Get-ChildItem (Join-Path $Root 'dist') -Filter 'Instalador-FlagPlays-*.exe' -ErrorAction SilentlyContinue | Remove-Item -Force
}

Step "Compilando el instalador"
& $iscc $Iss
if ($LASTEXITCODE -ne 0) { Fail "ISCC ha devuelto $LASTEXITCODE." }

$out = Get-ChildItem (Join-Path $Root 'dist') -Filter 'Instalador-FlagPlays-*.exe' |
       Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $out) { Fail "No encuentro el instalador generado." }

# Carpeta limpia con lo único que hay que repartir a los amigos.
$shareDir = Join-Path $Root 'dist\PARA-COMPARTIR'
New-Item -ItemType Directory -Force -Path $shareDir | Out-Null
Copy-Item $out.FullName (Join-Path $shareDir $out.Name) -Force
$apk = Join-Path $Root 'dist\FlagPlays.apk'
if (Test-Path $apk) { Copy-Item $apk (Join-Path $shareDir 'FlagPlays-Android.apk') -Force }

$hash = (Get-FileHash $out.FullName -Algorithm SHA256).Hash
Write-Host ""
Write-Host "Listo: $($out.FullName)" -ForegroundColor Green
Write-Host ("  {0:N2} MB  |  SHA-256 {1}" -f ($out.Length / 1MB), $hash)
Write-Host ""
Write-Host "Pásaselo a quien quieras: se instala sin permisos de administrador y aparece en"
Write-Host "Aplicaciones instaladas. Al desinstalar no borra las jugadas del usuario."
