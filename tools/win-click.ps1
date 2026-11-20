# Clic en coordenadas de pantalla (para manejar la app durante la verificación).
param([int]$X, [int]$Y, [int]$Count = 1, [int]$DelayMs = 0)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Clicker {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
}
"@
[Clicker]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null
# Trae la ventana de FlagPlays al frente antes de hacer clic.
$proc = Get-Process -Name FlagPlays -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($proc) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Focuser {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@ -ErrorAction SilentlyContinue
  [Focuser]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 400
}
[Clicker]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 120
for ($i = 0; $i -lt $Count; $i++) {
  [Clicker]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)   # left down
  Start-Sleep -Milliseconds 40
  [Clicker]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)   # left up
  Start-Sleep -Milliseconds 120
}
if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs }
Write-Host "clic en $X,$Y"
