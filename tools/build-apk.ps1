#Requires -Version 5.1
<#
.SYNOPSIS
    Compila FlagPlays en un APK firmado sin Gradle ni Android Studio.

.DESCRIPTION
    Pipeline clásico de compilación Android desde PowerShell:
      1. Copia la web (index.html, src/, styles/, assets/) a android/app/src/main/assets/www.
      2. aapt2 compile   -> build/res.zip
      3. aapt2 link      -> build/base.apk (+ base-debug.apk con --debug-mode)
      4. javac           -> build/classes (R.java generado por aapt2 + Java de la app)
      5. d8              -> build/dex/classes.dex
      6. re-empaquetado  -> normaliza rutas de assets (/ en vez de \) y añade classes.dex
      7. zipalign -f -p 4
      8. apksigner (keystore dist/flagplays.jks, alias flagplays, pass flagplays)
      9. Verificación (badging, firma, contenido)

    Salida: dist/FlagPlays.apk y dist/FlagPlays-debug.apk

.PARAMETER Clean
    Borra android/build antes de compilar.

.PARAMETER SdkPath
    Ruta del Android SDK. Por defecto: $env:ANDROID_HOME, $env:ANDROID_SDK_ROOT o
    %LOCALAPPDATA%\Android\Sdk.

.PARAMETER BuildToolsVersion
    Versión de build-tools (por defecto 35.0.1). Si no existe se usa la última 35.x.

.PARAMETER NoDebugApk
    No genera dist/FlagPlays-debug.apk.

.EXAMPLE
    pwsh -File tools/build-apk.ps1 -Clean

.EXAMPLE
    pwsh -File tools/build-apk.ps1 -SdkPath "C:\Users\Usuario\AppData\Local\Android\Sdk"
#>
[CmdletBinding()]
param(
    [switch]$Clean,
    [string]$SdkPath = "",
    [string]$BuildToolsVersion = "35.0.1",
    [switch]$NoDebugApk
)

$ErrorActionPreference = "Stop"
$script:Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Text)
    Write-Host "    OK  $Text" -ForegroundColor Green
}

function Write-Info {
    param([string]$Text)
    Write-Host "    $Text" -ForegroundColor DarkGray
}

function Fail {
    param([string]$Text)
    Write-Host ""
    Write-Host "ERROR: $Text" -ForegroundColor Red
    exit 1
}

function Assert-Exit {
    param([string]$What)
    if ($LASTEXITCODE -ne 0) {
        Fail "$What falló (exit code $LASTEXITCODE)"
    }
}

function Assert-File {
    param([string]$Path, [string]$What)
    if (-not (Test-Path -LiteralPath $Path)) {
        Fail "Falta $What en '$Path'."
    }
}

function Format-Size {
    param([long]$Bytes)
    if ($Bytes -ge 1MB) {
        return ("{0:N2} MB" -f ($Bytes / 1MB))
    }
    return ("{0:N1} KB" -f ($Bytes / 1KB))
}

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root "index.html"))) {
    Fail "No encuentro la raíz del proyecto FlagPlays (index.html) a partir de '$PSScriptRoot'."
}

$AndroidDir = Join-Path $Root "android"
$AppMain = Join-Path $AndroidDir "app\src\main"
$Manifest = Join-Path $AppMain "AndroidManifest.xml"
$ResDir = Join-Path $AppMain "res"
$JavaSrcDir = Join-Path $AppMain "java"
$AssetsDir = Join-Path $AppMain "assets"
$WwwDir = Join-Path $AssetsDir "www"
$BuildDir = Join-Path $AndroidDir "build"
$GenDir = Join-Path $BuildDir "gen"
$ClassesDir = Join-Path $BuildDir "classes"
$DexDir = Join-Path $BuildDir "dex"
$DistDir = Join-Path $Root "dist"
$Keystore = Join-Path $DistDir "flagplays.jks"

# Web de origen (solo lectura: el build la copia, nunca la modifica).
$WebFiles = @(
    @{ Path = (Join-Path $Root "index.html"); Label = "index.html" },
    @{ Path = (Join-Path $Root "src");        Label = "src/" },
    @{ Path = (Join-Path $Root "styles");     Label = "styles/" },
    @{ Path = (Join-Path $Root "assets");     Label = "assets/" }
)

# ---------------------------------------------------------------------------
# SDK / JDK
# ---------------------------------------------------------------------------

if (-not $SdkPath) {
    if ($env:ANDROID_HOME) { $SdkPath = $env:ANDROID_HOME }
    elseif ($env:ANDROID_SDK_ROOT) { $SdkPath = $env:ANDROID_SDK_ROOT }
    else { $SdkPath = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
}
Assert-File $SdkPath "el Android SDK"
$SdkPath = (Resolve-Path -LiteralPath $SdkPath).Path

$BuildToolsRoot = Join-Path $SdkPath "build-tools"
Assert-File $BuildToolsRoot "la carpeta build-tools del SDK"
$BuildToolsDir = Join-Path $BuildToolsRoot $BuildToolsVersion
if (-not (Test-Path -LiteralPath $BuildToolsDir)) {
    $fallback = Get-ChildItem -LiteralPath $BuildToolsRoot -Directory |
        Where-Object { $_.Name -like "35.*" } |
        Sort-Object { [version]($_.Name -replace "[^0-9.]", "") } |
        Select-Object -Last 1
    if ($null -eq $fallback) {
        Fail "No encuentro build-tools '$BuildToolsVersion' ni ninguna 35.x en '$BuildToolsRoot'."
    }
    $BuildToolsDir = $fallback.FullName
    $BuildToolsVersion = $fallback.Name
}

$PlatformJar = Join-Path $SdkPath "platforms\android-35\android.jar"
Assert-File $PlatformJar "platforms\android-35\android.jar"

if (-not $env:JAVA_HOME) {
    Fail "JAVA_HOME no está definido. Instala/define el JDK 21 (p. ej. D:\Instaladores\jdk-21.0.12.1+1)."
}
$JavaHome = $env:JAVA_HOME.TrimEnd('\')
$Javac = Join-Path $JavaHome "bin\javac.exe"
$Jar = Join-Path $JavaHome "bin\jar.exe"
$Keytool = Join-Path $JavaHome "bin\keytool.exe"
Assert-File $Javac "javac (JAVA_HOME=$JavaHome)"
Assert-File $Jar "jar (JAVA_HOME=$JavaHome)"
Assert-File $Keytool "keytool (JAVA_HOME=$JavaHome)"
# d8.bat y apksigner.bat necesitan java en el PATH: se añade el del JDK.
$env:PATH = "$JavaHome\bin;$env:PATH"

$Aapt2 = Join-Path $BuildToolsDir "aapt2.exe"
$Zipalign = Join-Path $BuildToolsDir "zipalign.exe"
$Apksigner = Join-Path $BuildToolsDir "apksigner.bat"
$D8 = Join-Path $BuildToolsDir "d8.bat"
Assert-File $Aapt2 "aapt2.exe (build-tools $BuildToolsVersion)"
Assert-File $Zipalign "zipalign.exe (build-tools $BuildToolsVersion)"
Assert-File $Apksigner "apksigner.bat (build-tools $BuildToolsVersion)"
Assert-File $D8 "d8.bat (build-tools $BuildToolsVersion)"

# Fuentes propias.
Assert-File $Manifest "AndroidManifest.xml"
Assert-File $ResDir "la carpeta res/"
Assert-File $JavaSrcDir "la carpeta java/"
foreach ($item in $WebFiles) {
    Assert-File $item.Path $item.Label
}

Write-Host "FlagPlays - build de APK (sin Gradle)" -ForegroundColor White
Write-Info "Proyecto:     $Root"
Write-Info "SDK:          $SdkPath"
Write-Info "Build-tools:  $BuildToolsVersion"
Write-Info "JDK:          $JavaHome"

# ---------------------------------------------------------------------------
# Limpieza / estructura
# ---------------------------------------------------------------------------

if ($Clean -and (Test-Path -LiteralPath $BuildDir)) {
    Remove-Item -LiteralPath $BuildDir -Recurse -Force
    Write-Info "android/build borrado (-Clean)"
}
foreach ($stale in @($GenDir, $ClassesDir, $DexDir)) {
    if (Test-Path -LiteralPath $stale) {
        Remove-Item -LiteralPath $stale -Recurse -Force
    }
}
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
$ResZip = Join-Path $BuildDir "res.zip"
if (Test-Path -LiteralPath $ResZip) {
    Remove-Item -LiteralPath $ResZip -Force
}

# ---------------------------------------------------------------------------
# 1. Copiar la web a assets/www
# ---------------------------------------------------------------------------

Write-Step "1/9 Copiando la web a android/app/src/main/assets/www"

$ExcludedDirs = @("qa", "tools", "tests", "docs", "node_modules", ".git", ".vscode")
$ExcludedExt = @(".md", ".py", ".ps1", ".map")

if (Test-Path -LiteralPath $WwwDir) {
    Remove-Item -LiteralPath $WwwDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $WwwDir | Out-Null

Copy-Item -LiteralPath (Join-Path $Root "index.html") -Destination (Join-Path $WwwDir "index.html") -Force
# Manifest de PWA (icono/nombre al instalar la versión web desde el navegador)
$webManifest = Join-Path $Root "manifest.webmanifest"
if (Test-Path $webManifest) {
    Copy-Item -LiteralPath $webManifest -Destination (Join-Path $WwwDir "manifest.webmanifest") -Force
}
foreach ($dirName in @("src", "styles", "assets")) {
    Copy-Item -LiteralPath (Join-Path $Root $dirName) -Destination $WwwDir -Recurse -Force
}

Get-ChildItem -LiteralPath $WwwDir -Recurse -Directory -ErrorAction SilentlyContinue |
    Where-Object { $ExcludedDirs -contains $_.Name } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
Get-ChildItem -LiteralPath $WwwDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $ExcludedExt -contains $_.Extension.ToLowerInvariant() } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

foreach ($rel in @("index.html", "src\main.js", "styles\app.css")) {
    Assert-File (Join-Path $WwwDir $rel) "assets/www/$rel tras la copia"
}
$webFileCount = (Get-ChildItem -LiteralPath $WwwDir -Recurse -File).Count
$webBytes = (Get-ChildItem -LiteralPath $WwwDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Ok "$webFileCount ficheros web ($(Format-Size $webBytes))"

# ---------------------------------------------------------------------------
# 2. aapt2 compile
# ---------------------------------------------------------------------------

Write-Step "2/9 aapt2 compile (recursos)"
& $Aapt2 compile --dir $ResDir -o $ResZip
Assert-Exit "aapt2 compile"
Assert-File $ResZip "build/res.zip"
Write-Ok "recursos compilados"

# ---------------------------------------------------------------------------
# 3. aapt2 link
# ---------------------------------------------------------------------------

Write-Step "3/9 aapt2 link (manifest + recursos + assets)"
$BaseApk = Join-Path $BuildDir "base.apk"
& $Aapt2 link -o $BaseApk -I $PlatformJar --manifest $Manifest -R $ResZip -A $AssetsDir --java $GenDir --auto-add-overlay
Assert-Exit "aapt2 link"
Assert-File $BaseApk "build/base.apk"
Write-Ok "base.apk generado (R.java en build/gen)"

$BaseDebugApk = Join-Path $BuildDir "base-debug.apk"
if (-not $NoDebugApk) {
    & $Aapt2 link -o $BaseDebugApk -I $PlatformJar --manifest $Manifest -R $ResZip -A $AssetsDir --java $GenDir --auto-add-overlay --debug-mode
    Assert-Exit "aapt2 link (debug)"
    Assert-File $BaseDebugApk "build/base-debug.apk"
    Write-Ok "base-debug.apk generado (android:debuggable=true)"
}

# ---------------------------------------------------------------------------
# 4. javac
# ---------------------------------------------------------------------------

Write-Step "4/9 javac (R.java + MainActivity + provider)"
New-Item -ItemType Directory -Force -Path $ClassesDir | Out-Null
$JavaFiles = @()
$JavaFiles += Get-ChildItem -LiteralPath $GenDir -Recurse -Filter *.java | ForEach-Object { $_.FullName }
$JavaFiles += Get-ChildItem -LiteralPath $JavaSrcDir -Recurse -Filter *.java | ForEach-Object { $_.FullName }
if ($JavaFiles.Count -eq 0) {
    Fail "No hay ficheros .java que compilar."
}
Write-Info "$($JavaFiles.Count) ficheros .java"

$JavacArgs = @("-source", "17", "-target", "17", "-encoding", "UTF-8", "-Xlint:-options",
    "-classpath", $PlatformJar, "-d", $ClassesDir) + $JavaFiles
$JavacOutput = & $Javac @JavacArgs 2>&1
$JavacCode = $LASTEXITCODE
foreach ($line in @($JavacOutput)) {
    $text = "$line"
    if ($text -match "error") {
        Write-Host "    $text" -ForegroundColor Red
    } elseif ($text.Trim()) {
        Write-Info $text
    }
}
if ($JavacCode -ne 0) {
    Fail "javac falló (exit code $JavacCode)"
}
$classCount = (Get-ChildItem -LiteralPath $ClassesDir -Recurse -Filter *.class).Count
Write-Ok "$classCount clases compiladas"

# ---------------------------------------------------------------------------
# 5. d8 -> classes.dex
# ---------------------------------------------------------------------------

Write-Step "5/9 d8 (classes.dex)"
$ClassesJar = Join-Path $BuildDir "classes.jar"
if (Test-Path -LiteralPath $ClassesJar) {
    Remove-Item -LiteralPath $ClassesJar -Force
}
& $Jar --create --file $ClassesJar -C $ClassesDir .
Assert-Exit "jar --create classes.jar"
New-Item -ItemType Directory -Force -Path $DexDir | Out-Null
& $D8 --lib $PlatformJar --min-api 24 --output $DexDir $ClassesJar
Assert-Exit "d8"
$DexFile = Join-Path $DexDir "classes.dex"
Assert-File $DexFile "build/dex/classes.dex"
Write-Ok "classes.dex ($(Format-Size (Get-Item -LiteralPath $DexFile).Length))"

# ---------------------------------------------------------------------------
# 6. Empaquetar: normalizar rutas de assets + classes.dex
# ---------------------------------------------------------------------------

Write-Step "6/9 Empaquetando (rutas de assets + classes.dex)"
# aapt2 link -A en Windows escribe las entradas de assets con '\' (assets\www\index.html).
# AssetManager solo resuelve '/', así que se reescribe el zip normalizando nombres.
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

function Build-UnsignedApk {
    param([string]$BaseApkPath, [string]$OutPath)

    if (Test-Path -LiteralPath $OutPath) { Remove-Item -LiteralPath $OutPath -Force }
    $source = [System.IO.Compression.ZipFile]::OpenRead($BaseApkPath)
    $dest = [System.IO.Compression.ZipFile]::Open($OutPath, [System.IO.Compression.ZipArchiveMode]::Create)
    $written = New-Object 'System.Collections.Generic.List[string]'
    try {
        foreach ($entry in $source.Entries) {
            $name = $entry.FullName.Replace('\', '/')
            if ($name -eq 'classes.dex') { continue }
            if ($entry.CompressedLength -eq $entry.Length) {
                $level = [System.IO.Compression.CompressionLevel]::NoCompression
            } else {
                $level = [System.IO.Compression.CompressionLevel]::Optimal
            }
            $newEntry = $dest.CreateEntry($name, $level)
            try { $newEntry.LastWriteTime = $entry.LastWriteTime } catch { }
            $srcStream = $entry.Open()
            $dstStream = $newEntry.Open()
            try {
                $srcStream.CopyTo($dstStream)
            } finally {
                $dstStream.Dispose()
                $srcStream.Dispose()
            }
            $written.Add($name)
        }

        $dexEntry = $dest.CreateEntry("classes.dex", [System.IO.Compression.CompressionLevel]::Optimal)
        $dexIn = [System.IO.File]::OpenRead($DexFile)
        $dexOut = $dexEntry.Open()
        try {
            $dexIn.CopyTo($dexOut)
        } finally {
            $dexOut.Dispose()
            $dexIn.Dispose()
        }
        $written.Add("classes.dex")

        # En modo Create, ZipArchive.Entries no es inspeccionable: se valida la lista escrita.
        $badNames = @($written | Where-Object { $_.Contains('\') })
        if ($badNames.Count -gt 0) {
            throw "Quedan $($badNames.Count) entradas con '\' en el APK"
        }
    } finally {
        $dest.Dispose()
        $source.Dispose()
    }
}

$UnsignedApk = Join-Path $BuildDir "unsigned.apk"
Build-UnsignedApk -BaseApkPath $BaseApk -OutPath $UnsignedApk
Assert-File $UnsignedApk "build/unsigned.apk"
Write-Ok "unsigned.apk: assets/www/*, classes.dex y rutas normalizadas"

$UnsignedDebugApk = Join-Path $BuildDir "unsigned-debug.apk"
if (-not $NoDebugApk) {
    Build-UnsignedApk -BaseApkPath $BaseDebugApk -OutPath $UnsignedDebugApk
    Assert-File $UnsignedDebugApk "build/unsigned-debug.apk"
    Write-Ok "unsigned-debug.apk generado"
}

# ---------------------------------------------------------------------------
# 7. zipalign
# ---------------------------------------------------------------------------

Write-Step "7/9 zipalign -f -p 4"
$AlignedApk = Join-Path $BuildDir "aligned.apk"
if (Test-Path -LiteralPath $AlignedApk) { Remove-Item -LiteralPath $AlignedApk -Force }
& $Zipalign -f -p 4 $UnsignedApk $AlignedApk
Assert-Exit "zipalign"
Assert-File $AlignedApk "build/aligned.apk"
Write-Ok "aligned.apk"

$AlignedDebugApk = Join-Path $BuildDir "aligned-debug.apk"
if (-not $NoDebugApk) {
    if (Test-Path -LiteralPath $AlignedDebugApk) { Remove-Item -LiteralPath $AlignedDebugApk -Force }
    & $Zipalign -f -p 4 $UnsignedDebugApk $AlignedDebugApk
    Assert-Exit "zipalign (debug)"
    Write-Ok "aligned-debug.apk"
}

# ---------------------------------------------------------------------------
# 8. Firma
# ---------------------------------------------------------------------------

Write-Step "8/9 Firma con apksigner"
if (-not (Test-Path -LiteralPath $Keystore)) {
    Write-Info "Generando keystore nuevo: dist/flagplays.jks"
    & $Keytool -genkeypair -keystore $Keystore -storetype PKCS12 -alias flagplays `
        -storepass flagplays -keypass flagplays -keyalg RSA -keysize 2048 `
        -validity 10000 -dname "CN=FlagPlays, O=FlagPlays, C=ES" -noprompt
    Assert-Exit "keytool -genkeypair"
    Write-Ok "keystore dist/flagplays.jks creado"
} else {
    Write-Info "Reutilizando keystore existente: dist/flagplays.jks"
}

$ApkOut = Join-Path $DistDir "FlagPlays.apk"
if (Test-Path -LiteralPath $ApkOut) { Remove-Item -LiteralPath $ApkOut -Force }
& $Apksigner sign --ks $Keystore --ks-type PKCS12 --ks-pass pass:flagplays `
    --ks-key-alias flagplays --key-pass pass:flagplays --v4-signing-enabled false --out $ApkOut $AlignedApk
Assert-Exit "apksigner sign (release)"
Assert-File $ApkOut "dist/FlagPlays.apk"
Write-Ok "dist/FlagPlays.apk firmado"

if (-not $NoDebugApk) {
    $ApkDebugOut = Join-Path $DistDir "FlagPlays-debug.apk"
    if (Test-Path -LiteralPath $ApkDebugOut) { Remove-Item -LiteralPath $ApkDebugOut -Force }
    & $Apksigner sign --ks $Keystore --ks-type PKCS12 --ks-pass pass:flagplays `
        --ks-key-alias flagplays --key-pass pass:flagplays --v4-signing-enabled false --out $ApkDebugOut $AlignedDebugApk
    Assert-Exit "apksigner sign (debug)"
    Write-Ok "dist/FlagPlays-debug.apk firmado"
}

# ---------------------------------------------------------------------------
# 9. Verificación
# ---------------------------------------------------------------------------

Write-Step "9/9 Verificación"

Write-Host "    apksigner verify --print-certs dist/FlagPlays.apk" -ForegroundColor DarkGray
$SignerOutput = & $Apksigner verify --print-certs $ApkOut 2>&1
$SignerCode = $LASTEXITCODE
foreach ($line in @($SignerOutput)) { Write-Info "$line" }
if ($SignerCode -ne 0) {
    Fail "apksigner verify falló"
}
Write-Ok "firma verificada"

Write-Host "    aapt2 dump badging dist/FlagPlays.apk" -ForegroundColor DarkGray
$Badging = & $Aapt2 dump badging $ApkOut 2>&1
Assert-Exit "aapt2 dump badging"
$BadgingPattern = "^(package:|minSdkVersion:|targetSdkVersion:|uses-permission:|application-label:|application-icon-|application:|launchable-activity:|application-debuggable)"
foreach ($line in @($Badging)) {
    $text = "$line"
    if ($text -match $BadgingPattern) {
        Write-Info $text
    }
}
if (-not ($Badging | Where-Object { "$_" -match "^package: name='com\.flagplays\.app'" })) {
    Fail "El APK no declara el package com.flagplays.app"
}
if (-not ($Badging | Where-Object { "$_" -match "^minSdkVersion:'24'" })) {
    Fail "minSdk no es 24 en el APK"
}
if (-not ($Badging | Where-Object { "$_" -match "^targetSdkVersion:'35'" })) {
    Fail "targetSdk no es 35 en el APK"
}
if (-not ($Badging | Where-Object { "$_" -match "^application-label:'FlagPlays'" })) {
    Fail "El label de la app no es FlagPlays"
}
Write-Ok "badging correcto (package/version/sdk/label/iconos)"

if (-not $NoDebugApk) {
    $DebugBadging = & $Aapt2 dump badging (Join-Path $DistDir "FlagPlays-debug.apk") 2>&1
    Assert-Exit "aapt2 dump badging (debug)"
    if (-not ($DebugBadging | Where-Object { "$_" -match "^application-debuggable" })) {
        Fail "FlagPlays-debug.apk no es debuggable"
    }
    Write-Ok "FlagPlays-debug.apk marcado como debuggable"
}

Write-Host "    contenido del APK" -ForegroundColor DarkGray
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Zip = [System.IO.Compression.ZipFile]::OpenRead($ApkOut)
try {
    $ApkEntries = @($Zip.Entries | ForEach-Object { $_.FullName })
} finally {
    $Zip.Dispose()
}
$MustHave = @("assets/www/index.html", "assets/www/src/main.js", "assets/www/styles/app.css", "classes.dex", "AndroidManifest.xml")
foreach ($entry in $MustHave) {
    if (-not ($ApkEntries -contains $entry)) {
        Fail "Falta '$entry' dentro del APK"
    }
    Write-Info "  $entry"
}
Write-Ok "assets web y classes.dex presentes ($($ApkEntries.Count) entradas)"

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------

$script:Stopwatch.Stop()
Write-Host ""
Write-Host "Listo en $([math]::Round($script:Stopwatch.Elapsed.TotalSeconds, 1)) s" -ForegroundColor Green
$releaseSize = (Get-Item -LiteralPath $ApkOut).Length
Write-Host ("  dist\FlagPlays.apk        {0}" -f (Format-Size $releaseSize)) -ForegroundColor White
if (-not $NoDebugApk) {
    $debugOut = Join-Path $DistDir "FlagPlays-debug.apk"
    $debugSize = (Get-Item -LiteralPath $debugOut).Length
    Write-Host ("  dist\FlagPlays-debug.apk  {0}  (debuggable)" -f (Format-Size $debugSize)) -ForegroundColor White
}
Write-Host ""
Write-Host "Instalar y probar:" -ForegroundColor Cyan
Write-Host "  & `"$SdkPath\platform-tools\adb.exe`" install -r `"$ApkOut`"" -ForegroundColor DarkGray
Write-Host "  & `"$SdkPath\platform-tools\adb.exe`" shell am start -n com.flagplays.app/.MainActivity" -ForegroundColor DarkGray

exit 0
