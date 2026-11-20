# Arranca el emulador, instala el APK y captura pantallas de la app.
$ErrorActionPreference = 'Continue'
$Sdk = "C:\Users\Usuario\AppData\Local\Android\Sdk"
$Adb = Join-Path $Sdk "platform-tools\adb.exe"
$Emu = Join-Path $Sdk "emulator\emulator.exe"
$Apk = Join-Path $PSScriptRoot "..\dist\FlagPlays.apk"
$Out = Join-Path $PSScriptRoot "..\qa"

function Log($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m) }

$devices = & $Adb devices
if ($devices -notmatch "emulator-\d+\s+device") {
    Log "arrancando emulador…"
    Start-Process -FilePath $Emu -ArgumentList '-avd','medium_phone','-no-snapshot-load','-no-audio','-gpu','swiftshader_indirect' -WindowStyle Hidden
}

& $Adb wait-for-device | Out-Null
for ($i = 0; $i -lt 90; $i++) {
    $boot = (& $Adb shell getprop sys.boot_completed 2>$null) -join ""
    if ($boot -match "1") { break }
    Start-Sleep -Seconds 2
}
Log "emulador listo"

# Desbloquea y quita dialogos del sistema
& $Adb shell input keyevent 82 | Out-Null
& $Adb shell wm dismiss-keyguard 2>$null | Out-Null

Log "instalando APK"
& $Adb install -r --no-incremental $Apk 2>&1 | Select-Object -Last 2

& $Adb shell am force-stop com.flagplays.app 2>$null | Out-Null
& $Adb shell am start -n com.flagplays.app/.MainActivity 2>&1 | Select-Object -Last 1
Start-Sleep -Seconds 6

function Shot($name) {
    & $Adb shell screencap -p /sdcard/s.png | Out-Null
    & $Adb pull /sdcard/s.png (Join-Path $Out "$name.png") 2>&1 | Out-Null
    Log "captura $name"
}

Shot "emu-1"

# Abre el panel de propiedades (botón sliders: lado derecho de la barra de herramientas)
& $Adb shell wm size
Shot "emu-2"

# Pulsa el menú "..." (aprox. 74% del ancho, 8% del alto)
$size = (& $Adb shell wm size) -join ""
Log "tamaño: $size"
& $Adb shell input tap 296 88
Start-Sleep -Seconds 1
Shot "emu-3"
& $Adb shell input keyevent 4
Start-Sleep -Milliseconds 600

# Pulsa el botón de librería (icono capas)
& $Adb shell input tap 350 88
Start-Sleep -Seconds 1
Shot "emu-4"
& $Adb shell input keyevent 4
Start-Sleep -Milliseconds 600

# Modo Animar
& $Adb shell input tap 210 88
Start-Sleep -Seconds 3
Shot "emu-5"

Log "hecho"
