# FlagPlays para Android (APK)

La app se puede instalar en un móvil Android como una aplicación normal («APK»), sin
navegador, sin conexión y con sus datos guardados en el propio teléfono.

## Instalar

1. Copia `dist/FlagPlays.apk` al teléfono (cable USB, Google Drive, WhatsApp a ti mismo…).
2. En el móvil, abre el fichero con el explorador de archivos.
3. Android pedirá permiso para «instalar apps de origen desconocido»: actívalo para la app
   con la que lo abras (es lo normal en cualquier APK que no venga de Play Store).
4. Instalar → abrir. Ya tienes FlagPlays en el cajón de aplicaciones.

> Es una APK firmada con clave propia de desarrollo: funciona en cualquier Android 7.0
> (API 24) o superior. Para publicarla en Play Store habría que firmarla con una clave de
> publicación y subirla en formato `.aab`, pero para instalar y usar no hace falta nada más.

## Primer arranque

Al abrirla por primera vez pide leer y aceptar los **términos y condiciones**; la aceptación
se guarda en el teléfono y no vuelve a salir. Para releerlos: menú **⋮ → Términos y
condiciones**.

## Qué cambia respecto a la versión web

- **Funciona sin conexión**: todo (HTML, CSS, JS, jugadas de ejemplo) va dentro del APK.
- **Guardar ficheros**: los PDF de los árboles de rutas, las imágenes PNG y los JSON se
  guardan en la carpeta **Descargas** del teléfono mediante el puente nativo.
- **Imprimir**: «Imprimir / Guardar PDF» abre el diálogo de impresión de Android, que
  incluye la opción nativa *Guardar como PDF*.
- **Botón atrás**: cierra primero el diálogo, panel o menú que esté abierto; si no hay nada
  abierto, sale de la app (con aviso de doble pulsación).
- **Compartir**: los enlaces de jugada usan el selector de compartir de Android.
- Pantalla completa con barras del sistema del color de la app y respeto de las áreas
  seguras (notch y barra de gestos).

## Recompilar el APK

Requisitos (ya instalados en este equipo): JDK 21, Android SDK con `build-tools` y
`platforms/android-35`. **No hace falta Gradle ni Android Studio.**

```powershell
# Una pasada completa: copia la web, compila, enlaza y firma
powershell -ExecutionPolicy Bypass -File tools\build-apk.ps1

# Limpiando antes (recomendado si cambias recursos o el manifest)
powershell -ExecutionPolicy Bypass -File tools\build-apk.ps1 -Clean
```

Salida: `dist\FlagPlays.apk` (y `dist\FlagPlays-debug.apk` si se pide la variante
depurable). El script copia **cada vez** la web actual (`index.html`, `src/`, `styles/`,
`assets/`) dentro de `assets/www`, así que cualquier cambio en la interfaz se refleja en el
siguiente build.

### Estructura

```
android/
  app/src/main/
    AndroidManifest.xml
    java/com/flagplays/app/MainActivity.java   WebView + puente nativo (guardar, imprimir, compartir)
    java/com/flagplays/app/FlagPlaysProvider.java  FileProvider para guardar en Descargas
    assets/www/                  ← copia de la web (la genera el build)
    res/                         iconos, splash, temas
tools/
  build-apk.ps1                  aapt2 + javac + d8 + zipalign + apksigner
  make-icons.py                  genera los iconos del lanzador y de la PWA
dist/
  FlagPlays.apk                  APK firmado, listo para instalar
  flagplays.jks                  keystore de desarrollo
```

### Cómo carga la web el WebView

Los módulos ES **no** se pueden cargar desde `file://` (el navegador los bloquea por
origen). Por eso `MainActivity` intercepta las peticiones a `https://appassets.local/…` y
sirve los ficheros de `assets/www` con su MIME correcto: para el WebView es una web normal
servida por HTTPS, con lo que funcionan los módulos, el `localStorage` y el canvas.

### Puente JavaScript

`window.AndroidBridge` expone:

| Método | Uso |
| --- | --- |
| `saveFile(nombre, base64, mime)` | Guarda en Descargas (PDF, PNG, JSON) |
| `printHtml(html)` | Diálogo de impresión de Android con esa hoja |
| `shareText(texto)` | Selector de compartir |
| `vibrate(ms)` | Vibración corta |
| `getVersion()` | Versión de la app |

En la web esos métodos no existen y `src/native.js` cae en las APIs del navegador
(`<a download>`, `window.print()`), así que el mismo código funciona en los dos sitios.
