# FlagPlays para Windows (app nativa)

Aplicación de escritorio real: un `.exe` que se abre con doble clic, sin navegador, sin
`node`, sin servidor local y sin conexión a internet.

## Qué es

`FlagPlays.exe` es una app **WinForms** que hospeda el motor **WebView2** que ya trae
Windows (el mismo de Edge). No empaqueta Chromium ni Node: el ejecutable pesa unos cientos
de KB y el motor web es el del sistema, siempre actualizado.

- **Sin servidor**: la web se carga desde disco mediante un mapeo de host virtual
  (`https://appassets.local/… → windows\www\`). No se abre ningún puerto ni proceso servidor.
- **Sin internet**: no hay ni una petición externa; además la app **bloquea** cualquier
  navegación que no sea a su propio origen, así que aunque hubiera red no puede salir.
- **Datos persistentes** en `%LOCALAPPDATA%\FlagPlays\WebView2` (libreta, temas, árboles y
  preferencias sobreviven al cerrar).
- **Todo funciona**: editor, rutas, animación, simulación, análisis, árboles de rutas con
  exportación a PDF vectorial, personalización completa, librería, importar/exportar.

### Primer arranque

La primera vez que se abre pide leer y aceptar los **términos y condiciones** (el texto está
en `src/terms.js`). La aceptación se guarda en el equipo y no vuelve a aparecer; para releerlos,
menú **⋮ → Términos y condiciones**.

### Integración con el escritorio

| Acción | Comportamiento |
| --- | --- |
| Exportar PDF / PNG / JSON | Se guarda en la carpeta **Descargas** y la app avisa con un aviso flotante |
| «Imprimir / Guardar PDF» | Abre el diálogo de impresión de Windows, con *Microsoft Print to PDF* |
| Compartir un enlace | Lo copia al portapapeles |
| Cerrar y reabrir | Mantiene la libreta y el tamaño/posición de la ventana |
| Doble clic en el .exe estando abierta | Trae al frente la ventana existente (instancia única) |

## Instalar / usar

### Para pasar a los amigos: `Instalador-FlagPlays-1.0.exe`

`dist\Instalador-FlagPlays-1.0.exe` (~2,4 MB) es el instalador. Se lo pasas a quien quieras
y lo ejecuta con doble clic:

1. Siguiente → siguiente → instalar. **No pide contraseña de administrador**: se instala
   solo para el usuario, en `%LOCALAPPDATA%\Programs\FlagPlays`.
2. Crea acceso directo en el **escritorio** y en el **menú Inicio**.
3. Aparece en **Aplicaciones instaladas** de Windows, con su desinstalador.
4. Al desinstalar **no borra las jugadas** (se guardan aparte, en
   `%LOCALAPPDATA%\FlagPlays`), así que reinstalar no te deja sin libreta.

> Windows mostrará el aviso azul «Windows protegió tu PC» porque el instalador no está
> firmado con un certificado de pago. Es lo normal en software pequeño sin distribuidor:
> hay que pulsar **«Más información» → «Ejecutar de todos modos»**. Solo pasa la primera vez.

### Sin instalador (portable)

La carpeta `dist\windows\FlagPlays\` es portable: cópiala donde quieras y ejecuta
`FlagPlays.exe`. También hay un ZIP: `dist\FlagPlays-Windows-x64.zip`.

No requiere instalar nada aparte: WebView2 viene con Windows 10 y 11 (en Windows 10 muy
antiguo podría faltar; en ese caso el propio programa avisa y enlaza al instalador oficial).

### Comprobado en la máquina real

- El `.exe` **no abre ningún puerto** en escucha (`Get-NetTCPConnection -State Listen` vacío
  para el proceso y sus hijos): no hay servidor.
- Arranca con `--host-resolver-rules="MAP * ~NOTFOUND"`, es decir **con el DNS bloqueado por
  completo** para el motor web, y la app carga y funciona igual: todo sale del disco.
- Ventana 1440×900 lógicos a 150 % de escalado (2160×1350 físicos), barra de título oscura,
  y se abre en el monitor donde está el usuario.

## Recompilar

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File tools\build-win.ps1         # exe + zip
pwsh -NoProfile -ExecutionPolicy Bypass -File tools\build-win.ps1 -Clean   # desde cero

# Instalador (necesita Inno Setup 6; el script lo instala si falta)
pwsh -NoProfile -ExecutionPolicy Bypass -File tools\build-installer.ps1
```

Requisitos (ya presentes en este equipo): Windows con WebView2 Runtime y el compilador de
.NET Framework (`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`). La primera vez el
script descarga el SDK de WebView2 desde NuGet y lo cachea en `.cache\webview2\`.

```
windows/
  Program.cs            Ventana WinForms + WebView2 + puente con la web
  app.manifest          DPI awareness y asInvoker
  FlagPlays.ico         Icono del ejecutable
  www/                  ← copia de la web (la genera el build)
tools/
  build-win.ps1         csc + SDK de WebView2 → dist\windows\FlagPlays + ZIP
dist/
  windows\FlagPlays\    App portable (exe + DLLs + www)
  FlagPlays-Windows-x64.zip
```

### Cómo habla la web con Windows

`src/native.js` detecta `window.chrome.webview` y usa `postMessage`; el host responde con
`PostWebMessageAsJson`. Los mensajes son `saveFile`, `print` y `copyText`, y las respuestas
`saved` / `error` (que la web muestra como aviso flotante). En el navegador y en Android el
mismo módulo usa las APIs equivalentes, así que la web no tiene código específico de
plataforma.
