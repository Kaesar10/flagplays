# Genera el Android App Bundle (.aab) que exige Google Play.
#
# El build normal produce un APK (para instalar a mano); Play necesita un AAB.
# Este script reutiliza lo compilado por build-apk.ps1 (dex y recursos) y monta
# el módulo "base" con la herramienta oficial bundletool.
#
# Uso: pwsh -NoProfile -ExecutionPolicy Bypass -File tools\build-aab.ps1
param(
    [string]$SdkPath = '',
    [string]$JavaHome = '',
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $Root 'android'
$BuildDir = Join-Path $AndroidDir 'build'
$DistDir = Join-Path $Root 'dist'
$CacheDir = Join-Path $Root '.cache'
$BundleToolJar = Join-Path $CacheDir 'bundletool.jar'
$OutAab = Join-Path $DistDir 'FlagPlays.aab'
$Keystore = Join-Path $DistDir 'flagplays.jks'
$KeystorePass = 'flagplays'
$KeyAlias = 'flagplays'

function Write-Step($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

# --- SDK y JDK -------------------------------------------------------------
if (-not $SdkPath) {
    $SdkPath = $env:ANDROID_HOME
    if (-not $SdkPath) { $SdkPath = $env:ANDROID_SDK_ROOT }
    if (-not $SdkPath) { $SdkPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
}
if (-not (Test-Path $SdkPath)) { Fail "No encuentro el Android SDK en $SdkPath" }
if (-not $JavaHome) {
    $candidatos = @($env:JAVA_HOME, 'D:\Instaladores\jdk-21.0.12.1+1', 'C:\Program Files\Java\jdk-21') | Where-Object { $_ -and (Test-Path $_) }
    $JavaHome = $candidatos | Select-Object -First 1
}
if (-not $JavaHome) { Fail 'No encuentro un JDK (define JAVA_HOME).' }

$BuildToolsDir = Get-ChildItem (Join-Path $SdkPath 'build-tools') -Directory | Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } | Select-Object -Last 1
$PlatformsDir = Join-Path $SdkPath 'platforms'
$Platform = Get-ChildItem $PlatformsDir -Directory | Sort-Object Name | Select-Object -Last 1
$PlatformJar = Join-Path $Platform.FullName 'android.jar'
$Aapt2 = Join-Path $BuildToolsDir.FullName 'aapt2.exe'
$Java = Join-Path $JavaHome 'bin\java.exe'
$JarSigner = Join-Path $JavaHome 'bin\jarsigner.exe'

foreach ($f in @($Aapt2, $PlatformJar, $Java, $JarSigner)) { if (-not (Test-Path $f)) { Fail "Falta $f" } }

$AppMain = Join-Path $AndroidDir 'app\src\main'
$ResDir = Join-Path $AppMain 'res'
$AssetsDir = Join-Path $AppMain 'assets'
$Manifest = Join-Path $AppMain 'AndroidManifest.xml'
$ClassesDex = Join-Path $BuildDir 'dex\classes.dex'
foreach ($f in @($ResDir, $AssetsDir, $Manifest, $ClassesDex)) {
    if (-not (Test-Path $f)) { Fail "Falta $f. Ejecuta antes tools\build-apk.ps1" }
}

New-Item -ItemType Directory -Force -Path $DistDir, $CacheDir | Out-Null
if ($Clean -and (Test-Path $BuildDir)) { Remove-Item (Join-Path $BuildDir 'aab') -Recurse -Force -ErrorAction SilentlyContinue }

# --- 1. bundletool ---------------------------------------------------------
if (-not (Test-Path $BundleToolJar)) {
    Write-Step 'Descargando bundletool'
    $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/google/bundletool/releases/latest' -Headers @{ 'User-Agent' = 'flagplays' } -TimeoutSec 60
    $asset = $rel.assets | Where-Object { $_.name -like 'bundletool-all-*.jar' } | Select-Object -First 1
    if (-not $asset) { Fail 'No encuentro bundletool-all-*.jar en la última release.' }
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $BundleToolJar -UseBasicParsing -TimeoutSec 300
    Write-Host "    $($rel.tag_name) · $([math]::Round((Get-Item $BundleToolJar).Length / 1MB, 1)) MB"
}

# --- 2. recursos en formato protobuf --------------------------------------
Write-Step '1/4 aapt2 compile (proto)'
$ResProto = Join-Path $BuildDir 'res-proto.zip'
& $Aapt2 compile --dir $ResDir -o $ResProto
if ($LASTEXITCODE -ne 0) { Fail 'aapt2 compile' }

Write-Step '2/4 aapt2 link --proto-format'
$BaseProto = Join-Path $BuildDir 'base-proto.apk'
& $Aapt2 link --proto-format -o $BaseProto -I $PlatformJar --manifest $Manifest -R $ResProto -A $AssetsDir --auto-add-overlay
if ($LASTEXITCODE -ne 0) { Fail 'aapt2 link --proto-format' }

# --- 3. montar el módulo base del bundle ----------------------------------
Write-Step '3/4 Montando el módulo base'
$ProtoDir = Join-Path $BuildDir 'proto'
if (Test-Path $ProtoDir) { Remove-Item $ProtoDir -Recurse -Force }
Expand-Archive -Path $BaseProto -DestinationPath $ProtoDir -Force

$ModuleDir = Join-Path $BuildDir 'module'
if (Test-Path $ModuleDir) { Remove-Item $ModuleDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $ModuleDir 'manifest'), (Join-Path $ModuleDir 'dex') | Out-Null

Copy-Item (Join-Path $ProtoDir 'AndroidManifest.xml') (Join-Path $ModuleDir 'manifest\AndroidManifest.xml') -Force
if (Test-Path (Join-Path $ProtoDir 'resources.pb')) {
    Copy-Item (Join-Path $ProtoDir 'resources.pb') (Join-Path $ModuleDir 'resources.pb') -Force
}
# Los recursos (iconos, splash) viajan como ficheros dentro de res/.
if (Test-Path (Join-Path $ProtoDir 'res')) {
    Copy-Item (Join-Path $ProtoDir 'res') $ModuleDir -Recurse -Force
}
if (Test-Path (Join-Path $ProtoDir 'assets')) {
    Copy-Item (Join-Path $ProtoDir 'assets') $ModuleDir -Recurse -Force
} else {
    Copy-Item $AssetsDir $ModuleDir -Recurse -Force
}
Copy-Item $ClassesDex (Join-Path $ModuleDir 'dex\classes.dex') -Force

# aapt2 escribe rutas con '\' en los assets: el bundle necesita '/'
$ModuleZip = Join-Path $BuildDir 'base.zip'
if (Test-Path $ModuleZip) { Remove-Item $ModuleZip -Force }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open($ModuleZip, [IO.Compression.ZipArchiveMode]::Create)
try {
    Push-Location $ModuleDir
    try {
        Get-ChildItem -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring($ModuleDir.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { Pop-Location }
} finally { $zip.Dispose() }

# --- 4. bundle + firma ----------------------------------------------------
Write-Step '4/4 bundletool build-bundle'
if (Test-Path $OutAab) { Remove-Item $OutAab -Force }
& $Java -jar $BundleToolJar build-bundle --modules=$ModuleZip --output=$OutAab
if ($LASTEXITCODE -ne 0) { Fail 'bundletool build-bundle' }

Write-Step 'Firmando el .aab (upload key)'
& $JarSigner -keystore $Keystore -storepass $KeystorePass -keypass $KeystorePass -sigalg SHA256withRSA -digestalg SHA-256 $OutAab $KeyAlias
if ($LASTEXITCODE -ne 0) { Fail 'jarsigner' }

$hash = (Get-FileHash $OutAab -Algorithm SHA256).Hash
Write-Host ''
Write-Host "Listo: $OutAab" -ForegroundColor Green
Write-Host ("  {0:N2} MB  |  SHA-256 {1}" -f ((Get-Item $OutAab).Length / 1MB), $hash)
Write-Host '  Súbelo en Play Console → Producción/Pruebas → Crear versión → Subir .aab'
