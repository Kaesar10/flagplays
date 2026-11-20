# Captura la ventana de FlagPlays.exe y la guarda en PNG.
param([string]$Out = "qa\win-capture.png", [int]$WaitMs = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Cap {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
# Sin esto, en pantallas con escalado (125 %, 150 %…) Windows devuelve
# coordenadas virtualizadas y la captura sale recortada.
try { [Win32Cap]::SetProcessDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch { }
if ($WaitMs -gt 0) { Start-Sleep -Milliseconds $WaitMs }

$proc = Get-Process -Name "FlagPlays" -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Host "No hay ventana de FlagPlays abierta"; exit 1 }

$h = $proc.MainWindowHandle
if ([Win32Cap]::IsIconic($h)) { [Win32Cap]::ShowWindow($h, 9) | Out-Null }
[Win32Cap]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 700

$r = New-Object Win32Cap+RECT
[Win32Cap]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left
$hgt = $r.Bottom - $r.Top
Write-Host "ventana ${w}x${hgt} en ($($r.Left),$($r.Top))"

$bmp = New-Object System.Drawing.Bitmap($w, $hgt)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 2 = PW_RENDERFULLCONTENT (necesario para capturar contenido de WebView2)
$ok = [Win32Cap]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()
if (-not $ok) {
    # Plan B: captura de pantalla en la zona de la ventana
    $bmp2 = New-Object System.Drawing.Bitmap($w, $hgt)
    $g2 = [System.Drawing.Graphics]::FromImage($bmp2)
    $g2.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size($w, $hgt)))
    $g2.Dispose()
    $bmp.Dispose()
    $bmp = $bmp2
}
$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save((Resolve-Path -LiteralPath ".").Path + "\" + $Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "guardada $Out"
