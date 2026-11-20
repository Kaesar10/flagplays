#Requires -Version 5.1
<#
.SYNOPSIS
    Compila FlagPlays para Windows (WinForms + WebView2) con csc.exe, sin .NET SDK ni Gradle.

.DESCRIPTION
    Pipeline:
      1. Copia la web (index.html, src/, styles/, assets/, manifest.webmanifest) a windows\www.
      2. Descarga/extrae el SDK de WebView2 (NuGet) a .cache\webview2\<version>\ si no está.
      3. Compila windows\Program.cs con csc.exe (/target:winexe /platform:x64) usando
         windows\app.manifest y windows\FlagPlays.ico.
      4. Ensambla dist\windows\FlagPlays\ (FlagPlays.exe + DLLs de WebView2 + www\).
      5. Genera dist\FlagPlays-Windows-x64.zip.

    La app resultante NO necesita servidor local, ni node, ni internet: la web se sirve
    desde un origen virtual (https://appassets.local) mapeado a la carpeta www.

.PARAMETER Clean
    Borra dist\windows\FlagPlays y el zip antes de compilar (la caché del SDK se conserva).

.PARAMETER WebView2Version
    Versión del paquete NuGet Microsoft.Web.WebView2 (por defecto 1.0.4314.35).

.PARAMETER SkipWebCopy
    No vuelve a copiar la web a windows\www (útil para iterar solo con C#).

.EXAMPLE
    pwsh -NoProfile -ExecutionPolicy Bypass -File tools\build-win.ps1 -Clean
#>
[CmdletBinding()]
param(
    [switch]$Clean,
    [string]$WebView2Version = "1.0.4314.35",
    [switch]$SkipWebCopy
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
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

$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $Root "index.html"))) {
    Fail "No encuentro la raíz del proyecto FlagPlays a partir de '$PSScriptRoot'."
}

$WindowsDir = Join-Path $Root "windows"
$DistDir = Join-Path $Root "dist"
$OutRoot = Join-Path $DistDir "windows"
$OutDir = Join-Path $OutRoot "FlagPlays"
$ZipPath = Join-Path $DistDir "FlagPlays-Windows-x64.zip"
$CacheRoot = Join-Path $Root ".cache\webview2"
$CacheDir = Join-Path $CacheRoot $WebView2Version
$WwwDir = Join-Path $WindowsDir "www"

$ProgramCs = Join-Path $WindowsDir "Program.cs"
$Manifest = Join-Path $WindowsDir "app.manifest"
$Icon = Join-Path $WindowsDir "FlagPlays.ico"

$Csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

Write-Host "FlagPlays para Windows - build con csc.exe (WinForms + WebView2)" -ForegroundColor White
Write-Info "Proyecto: $Root"
Write-Info "Salida:   $OutDir"

Assert-File $Csc "csc.exe de .NET Framework 4.8"
Assert-File $ProgramCs "windows\Program.cs"
Assert-File $Manifest "windows\app.manifest"
Assert-File $Icon "windows\FlagPlays.ico"
foreach ($required in @("index.html", "src\main.js", "styles\app.css")) {
    Assert-File (Join-Path $Root $required) "$required de la web"
}

if ($Clean) {
    foreach ($stale in @($OutDir, $ZipPath)) {
        if (Test-Path -LiteralPath $stale) {
            Remove-Item -LiteralPath $stale -Recurse -Force
            Write-Info "borrado: $stale"
        }
    }
}

# ---------------------------------------------------------------------------
# 1. Copiar la web a windows\www
# ---------------------------------------------------------------------------

Write-Step "1/5 Copiando la web a windows\www"
if ($SkipWebCopy) {
    Write-Info "omitido (-SkipWebCopy)"
} else {
    if (Test-Path -LiteralPath $WwwDir) {
        Remove-Item -LiteralPath $WwwDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $WwwDir | Out-Null

    Copy-Item -LiteralPath (Join-Path $Root "index.html") -Destination (Join-Path $WwwDir "index.html") -Force
    foreach ($dirName in @("src", "styles", "assets")) {
        Copy-Item -LiteralPath (Join-Path $Root $dirName) -Destination $WwwDir -Recurse -Force
    }
    $manifestWeb = Join-Path $Root "manifest.webmanifest"
    if (Test-Path -LiteralPath $manifestWeb) {
        Copy-Item -LiteralPath $manifestWeb -Destination (Join-Path $WwwDir "manifest.webmanifest") -Force
    }

    $excludedDirs = @("qa", "tools", "tests", "docs", "node_modules", ".git", ".vscode")
    $excludedExt = @(".md", ".py", ".ps1", ".map")
    Get-ChildItem -LiteralPath $WwwDir -Recurse -Directory -ErrorAction SilentlyContinue |
        Where-Object { $excludedDirs -contains $_.Name } |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
    Get-ChildItem -LiteralPath $WwwDir -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $excludedExt -contains $_.Extension.ToLowerInvariant() } |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

    foreach ($rel in @("index.html", "src\main.js", "styles\app.css")) {
        Assert-File (Join-Path $WwwDir $rel) "windows\www\$rel tras la copia"
    }
    $webFiles = @(Get-ChildItem -LiteralPath $WwwDir -Recurse -File)
    $webBytes = ($webFiles | Measure-Object -Property Length -Sum).Sum
    Write-Ok "$($webFiles.Count) ficheros web ($(Format-Size $webBytes))"
}

# ---------------------------------------------------------------------------
# 2. SDK de WebView2 (NuGet) en caché
# ---------------------------------------------------------------------------

Write-Step "2/5 SDK de WebView2 $WebView2Version"
$CoreDll = Join-Path $CacheDir "lib\net462\Microsoft.Web.WebView2.Core.dll"
$WinFormsDll = Join-Path $CacheDir "lib\net462\Microsoft.Web.WebView2.WinForms.dll"
$LoaderDll = Join-Path $CacheDir "runtimes\win-x64\native\WebView2Loader.dll"

if ((Test-Path -LiteralPath $CoreDll) -and (Test-Path -LiteralPath $WinFormsDll) -and (Test-Path -LiteralPath $LoaderDll)) {
    Write-Ok "usando caché: $CacheDir"
} else {
    Write-Info "descargando paquete NuGet..."
    New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
    $nupkg = Join-Path $CacheRoot ("Microsoft.Web.WebView2." + $WebView2Version + ".nupkg")
    $url = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/" + $WebView2Version
    try {
        if ($PSVersionTable.PSVersion.Major -ge 6) {
            Invoke-WebRequest -Uri $url -OutFile $nupkg
        } else {
            Invoke-WebRequest -Uri $url -OutFile $nupkg -UseBasicParsing
        }
    } catch {
        Fail "No se pudo descargar el SDK de WebView2 desde NuGet: $($_.Exception.Message)"
    }
    if (-not (Test-Path -LiteralPath $nupkg)) {
        Fail "La descarga del SDK de WebView2 no produjo ningún fichero."
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($nupkg)
    try {
        $targets = @(
            "lib/net462/Microsoft.Web.WebView2.Core.dll",
            "lib/net462/Microsoft.Web.WebView2.WinForms.dll",
            "runtimes/win-x64/native/WebView2Loader.dll"
        )
        foreach ($name in $targets) {
            $entry = $archive.Entries | Where-Object { $_.FullName -eq $name } | Select-Object -First 1
            if ($null -eq $entry) {
                Fail "El paquete NuGet no contiene '$name' (versión $WebView2Version no compatible)."
            }
            $destination = Join-Path $CacheDir ($name -replace "/", "\")
            New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
        }
    } finally {
        $archive.Dispose()
    }
    Remove-Item -LiteralPath $nupkg -Force -ErrorAction SilentlyContinue
    Write-Ok "SDK extraído en $CacheDir"
}

Assert-File $CoreDll "Microsoft.Web.WebView2.Core.dll"
Assert-File $WinFormsDll "Microsoft.Web.WebView2.WinForms.dll"
Assert-File $LoaderDll "WebView2Loader.dll"

# ---------------------------------------------------------------------------
# 3. Compilar con csc
# ---------------------------------------------------------------------------

Write-Step "3/5 Compilando con csc.exe"
if (Test-Path -LiteralPath $OutDir) {
    Remove-Item -LiteralPath $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$CscArgs = @(
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/langversion:5",
    "/optimize+",
    "/debug-",
    "/win32icon:$Icon",
    "/win32manifest:$Manifest",
    "/out:$(Join-Path $OutDir 'FlagPlays.exe')",
    "/reference:$CoreDll",
    "/reference:$WinFormsDll",
    "/reference:System.dll",
    "/reference:System.Core.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Web.Extensions.dll",
    $ProgramCs
    (Join-Path $WindowsDir "AssemblyInfo.cs")
)

# csc escribe avisos por stderr: se capturan sin que PowerShell los trate como errores.
$previousEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$cscOutput = & $Csc $CscArgs 2>&1
$cscCode = $LASTEXITCODE
$ErrorActionPreference = $previousEap

foreach ($line in @($cscOutput)) {
    $text = "$line"
    if ($text.Trim().Length -eq 0) { continue }
    if ($text -match ": error ") {
        Write-Host "    $text" -ForegroundColor Red
    } else {
        Write-Info $text
    }
}
if ($cscCode -ne 0) {
    Fail "csc.exe falló (exit code $cscCode)"
}

$ExePath = Join-Path $OutDir "FlagPlays.exe"
Assert-File $ExePath "FlagPlays.exe compilado"

# Comprobación del binario: PE x64 y subsistema GUI.
$bytes = [System.IO.File]::ReadAllBytes($ExePath)
if ($bytes.Length -lt 0x200) {
    Fail "El .exe generado es demasiado pequeño."
}
$peOffset = [System.BitConverter]::ToInt32($bytes, 0x3C)
$optionalMagic = [System.BitConverter]::ToUInt16($bytes, $peOffset + 24)
if ($optionalMagic -ne 0x20B -and $optionalMagic -ne 0x10B) {
    Fail ("Cabecera PE no reconocida (magic=0x{0:X4})" -f $optionalMagic)
}
$machine = [System.BitConverter]::ToUInt16($bytes, $peOffset + 4)
$subsystem = [System.BitConverter]::ToUInt16($bytes, $peOffset + 24 + 0x44)
if ($machine -ne 0x8664) {
    Fail ("El .exe no es x64 (machine=0x{0:X4})" -f $machine)
}
if ($subsystem -ne 2) {
    Fail ("El .exe no es una app de ventanas (subsystem=$subsystem)")
}
Write-Ok "FlagPlays.exe ($(Format-Size (Get-Item -LiteralPath $ExePath).Length), PE x64 GUI)"

# ---------------------------------------------------------------------------
# 4. Ensamblar la carpeta de distribución
# ---------------------------------------------------------------------------

Write-Step "4/5 Ensamblando la carpeta de distribución"
Copy-Item -LiteralPath $CoreDll -Destination $OutDir -Force
Copy-Item -LiteralPath $WinFormsDll -Destination $OutDir -Force
Copy-Item -LiteralPath $LoaderDll -Destination $OutDir -Force
Write-Info "Microsoft.Web.WebView2.Core.dll    $(Format-Size (Get-Item -LiteralPath $CoreDll).Length)"
Write-Info "Microsoft.Web.WebView2.WinForms.dll $(Format-Size (Get-Item -LiteralPath $WinFormsDll).Length)"
Write-Info "WebView2Loader.dll                  $(Format-Size (Get-Item -LiteralPath $LoaderDll).Length)"

$OutWww = Join-Path $OutDir "www"
Copy-Item -LiteralPath $WwwDir -Destination $OutWww -Recurse -Force
foreach ($rel in @("index.html", "src\main.js", "styles\app.css")) {
    Assert-File (Join-Path $OutWww $rel) "www\$rel en la distribución"
}

$Readme = @"
FlagPlays - pizarra de jugadas de flag football
================================================

Requisitos:
  - Windows 10 u 11 de 64 bits.
  - Microsoft Edge WebView2 Runtime (suele venir preinstalado con Windows 11
    y con Microsoft Edge). Si la app no arranca, instala el runtime desde
    https://developer.microsoft.com/microsoft-edge/webview2/

Uso:
  - Doble clic en FlagPlays.exe. No necesita instalador ni servidor local.
  - Funciona sin conexión a internet: la interfaz se carga desde esta misma
    carpeta (www/), sin descargar nada.
  - Tus jugadas se guardan en tu equipo y se conservan entre sesiones.

Atajos:
  - F11: pantalla completa / salir de pantalla completa.
  - Esc: salir de pantalla completa.
  - Ctrl+N: nueva jugada de ataque.

Los ficheros exportados (PNG, PDF, JSON...) se guardan en la carpeta Descargas.

Datos de la app:
  %LOCALAPPDATA%\FlagPlays     (datos del motor web, caché y registro app.log)
"@
Set-Content -LiteralPath (Join-Path $OutDir "LEEME.txt") -Value $Readme -Encoding UTF8

Write-Ok "dist\windows\FlagPlays\ preparado"

# ---------------------------------------------------------------------------
# 5. ZIP
# ---------------------------------------------------------------------------

Write-Step "5/5 Generando el ZIP"
if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -LiteralPath $OutDir -DestinationPath $ZipPath -CompressionLevel Optimal -Force
Assert-File $ZipPath "dist\FlagPlays-Windows-x64.zip"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipArchive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
try {
    $zipEntries = @($zipArchive.Entries | ForEach-Object { $_.FullName })
} finally {
    $zipArchive.Dispose()
}
$zipMustHave = @("FlagPlays/FlagPlays.exe", "FlagPlays/www/index.html", "FlagPlays/Microsoft.Web.WebView2.Core.dll", "FlagPlays/WebView2Loader.dll")
$zipTop = ($zipEntries | Where-Object { $_ -notmatch "/" })
foreach ($entry in $zipMustHave) {
    if (-not ($zipEntries -contains $entry)) {
        Fail "El zip no contiene '$entry'"
    }
}
Write-Ok "zip con $($zipEntries.Count) entradas ($(Format-Size (Get-Item -LiteralPath $ZipPath).Length))"

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------

$runtimeRoot = "C:\Program Files (x86)\Microsoft\EdgeWebView\Application"
$runtimeVersion = "(runtime WebView2 no detectado)"
if (Test-Path -LiteralPath $runtimeRoot) {
    $runtimeDirs = @(Get-ChildItem -LiteralPath $runtimeRoot -Directory |
        Where-Object { $_.Name -match "^\d+\.\d+\.\d+\.\d+$" } |
        Sort-Object { [version]$_.Name })
    if ($runtimeDirs.Count -gt 0) {
        $runtimeVersion = $runtimeDirs[$runtimeDirs.Count - 1].Name
    }
}

$script:Stopwatch.Stop()
Write-Host ""
Write-Host "Listo en $([math]::Round($script:Stopwatch.Elapsed.TotalSeconds, 1)) s" -ForegroundColor Green
Write-Host ("  dist\windows\FlagPlays\FlagPlays.exe   {0}" -f (Format-Size (Get-Item -LiteralPath $ExePath).Length)) -ForegroundColor White
$outBytes = (Get-ChildItem -LiteralPath $OutDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ("  dist\windows\FlagPlays\                {0} en total" -f (Format-Size $outBytes)) -ForegroundColor White
Write-Host ("  dist\FlagPlays-Windows-x64.zip         {0}" -f (Format-Size (Get-Item -LiteralPath $ZipPath).Length)) -ForegroundColor White
Write-Info "SDK WebView2: $WebView2Version   |   Runtime instalado: $runtimeVersion"
Write-Host ""
Write-Host "Ejecutar:" -ForegroundColor Cyan
Write-Host "  & `"$ExePath`"" -ForegroundColor DarkGray
Write-Host "  & `"$ExePath`" --dev    (DevTools + puerto de depuración 9222)" -ForegroundColor DarkGray

exit 0
