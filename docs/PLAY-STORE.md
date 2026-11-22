# Publicar FlagPlays en Google Play

Todo el material que pide la consola está generado. Esta guía tiene los textos exactos
para copiar y pegar, y el orden de los trámites.

## 0. Lo que hace falta antes de empezar (solo una vez)

1. **Cuenta de desarrollador de Google Play**: 25 USD de pago único, en
   <https://play.google.com/console/signup>. Hay que verificar identidad (DNI) y dirección.
   Si la cuenta es **personal** (no de empresa), Google exige además **12 testers durante
   14 días** antes de poder publicar en producción.
2. **Acceso a la consola**: con la misma cuenta de Google.

> La creación de la app **no se puede hacer por API**: Google solo permite crearla desde la
> consola web. El resto (versiones, textos, imágenes) sí se puede subir desde aquí.

## 1. Material ya listo en este repositorio

| Qué | Fichero | Dónde va en la consola |
|---|---|---|
| Bundle que se sube | `dist/FlagPlays.aab` (0,31 MB) | Producción → Crear versión → Subir |
| Icono | `store/icono-512.png` (512×512) | Ficha de Play → Gráficos → Icono |
| Gráfico destacado | `store/grafico-destacado-1024x500.png` | Ficha de Play → Gráficos |
| Capturas | `store/captura-1-editor.png`, `store/captura-2-animacion.png` (1080×1920) | Ficha de Play → Gráficos → Capturas de teléfono |
| Política de privacidad | `docs/privacidad.html` | Ficha de Play → Política de privacidad (URL) |

**URL de la política ya publicada** (GitHub Pages):

```
https://kaesar10.github.io/flagplays/privacidad.html
```

Resto de textos legales publicados en el mismo sitio:

| Documento | URL |
|---|---|
| Índice legal | https://kaesar10.github.io/flagplays/legal.html |
| Política de privacidad | https://kaesar10.github.io/flagplays/privacidad.html |
| Términos y condiciones | https://kaesar10.github.io/flagplays/terminos.html |
| Aviso legal | https://kaesar10.github.io/flagplays/aviso-legal.html |
| Licencia de uso | https://kaesar10.github.io/flagplays/licencia.html |
| Seguridad de datos (Play) | https://kaesar10.github.io/flagplays/datos-play.html |

Los mismos textos están dentro de la app (menú ⋮ → **Información legal**) y en un
documento de Google Drive: `Mi unidad/Flag/26-27/Playboook/FlagPlays - Textos legales.docx`.

El `.aab` se regenera con:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File tools\build-aab.ps1
```

## 2. Crear la app

Consola → **Crear app**:

- **Nombre**: `FlagPlays`
- **Idioma predeterminado**: Español (España)
- **Tipo**: Aplicación
- **Gratis o de pago**: Gratis
- Aceptar las declaraciones (políticas de programas, leyes de exportación de EE. UU.)

## 3. Ficha de Play (textos para copiar)

**Nombre de la app (máx. 30)**
```
FlagPlays
```

**Descripción breve (máx. 80)**
```
Pizarra de jugadas de flag football: dibuja, anima, simula y exporta tu playbook.
```

**Descripción completa (máx. 4000)**
```
FlagPlays es la libreta y la pizarra de jugadas de tu equipo de flag football, pensada para entrenadores y jugadores de 5 contra 5 y 7 contra 7.

DIBUJA TUS JUGADAS
Arrastra a los jugadores, traza las rutas punto a punto, coloca la defensa y guarda la jugada en tu libreta. Cada jugador puede tener su color y su forma, y el campo se adapta a 5v5 o 7v7.

ANIMA Y SIMULA
Reproduce la jugada con el balón en movimiento, a la velocidad que quieras. El simulador te dice si la jugada es completa, incompleta o interceptada, y el análisis te explica los motivos y compara lecturas.

CATÁLOGO DE JUGADAS
Más de 100 jugadas listas para usar, filtradas por tipo (pase o carrera), distancia, zona que atacan, formación, situación (campo o zona roja) y contra qué defensa funcionan. Puedes añadirlas a tu libreta y editarlas a tu gusto.

ÁRBOL DE RUTAS
Monta el árbol de rutas del equipo, reordena los nodos arrastrando, cambia la jerarquía y edita cada ruta sobre el propio diagrama. Se exporta a PDF.

MUÑEQUERAS Y HOJAS DE JUGADAS
Genera muñequeras con el tamaño exacto que necesites, en centímetros, eligiendo columnas y filas. Cada celda lleva su jugada, escalada al tamaño de la celda. También hojas de jugadas, tarjetas de bolsillo y call sheet del entrenador, todo imprimible o en PDF.

SIN CONEXIÓN Y SIN CUENTAS
No hay registro, no hay publicidad y no se envía nada a ningún servidor: tus jugadas se quedan en tu dispositivo. La aplicación funciona íntegramente sin conexión a internet.

La misma aplicación está disponible también para Windows, y el código es libre: puedes pedir el repositorio al creador.
```

**Categoría**: Deportes
**Etiquetas**: flag football, deportes, entrenador, playbook
**Correo de contacto**: kaesar10@gmail.com
**Sitio web** (opcional): https://github.com/Kaesar10/flagplays

## 4. Declaraciones de la consola

### Seguridad de los datos
- ¿Tu app recoge o comparte datos de usuario? **No**.
- Con eso, todas las secciones quedan "no se recopilan datos".
- ¿Los datos se cifran en tránsito? No aplica (no hay tránsito).

### Clasificación de contenido (cuestionario IARC)
- Categoría: **Deportes / Utilidades**.
- Sin violencia, sin contenido sexual, sin drogas, sin apuestas, sin lenguaje soez.
- Sin compras dentro de la app, sin publicidad.
- Resultado esperado: **PEGI 3 / Todos**.

### Público objetivo
- Grupo de edad: **13 años o más** (herramienta para entrenadores).
- No está dirigida a niños: evita el programa "Diseñada para familias".

### Anuncios
- **No contiene anuncios**.

### Acceso a la app
- No hay inicio de sesión ni credenciales: "Todas las funciones están disponibles sin iniciar sesión".

### Permisos sensibles
Solo declara `WRITE_EXTERNAL_STORAGE` (máx. Android 9) y `VIBRATE`. No hay permisos
sensibles que justificar.

## 5. Subir la versión

1. **Producción** (o *Prueba interna* si aún no tienes 12 testers) → **Crear versión**.
2. Acepta la firma de apps de Play (Play App Signing).
3. Sube `dist/FlagPlays.aab`.
4. Notas de la versión:
```
Primera versión: editor de jugadas, animación, simulador, catálogo de 104 jugadas,
árbol de rutas y muñequeras configurables en centímetros.
```
5. Revisa los errores que marque la consola y dale a **Iniciar implementación**.

## 6. Comprobar el bundle antes de subirlo (opcional)

```powershell
# Crear APKs para probar el bundle en un móvil
java -jar .cache\bundletool.jar build-apks --bundle dist\FlagPlays.aab --output dist\FlagPlays.apks --mode=universal
# Instalar en el móvil conectado
java -jar .cache\bundletool.jar install-apks --apks dist\FlagPlays.apks
```

## 7. Después de publicar

- Para actualizar: sube `versionCode` +1 en `android/app/src/main/AndroidManifest.xml`,
  recompila con `tools\build-aab.ps1` y sube el nuevo `.aab`.
- El APK de `dist/` sigue siendo útil para pasar la app a mano, pero Play solo acepta `.aab`.


## Capturas de la ficha (piel Neo-turf)

Seis capturas de teléfono a 1080 x 1920 px (9:16), generadas desde la app real
con el nuevo diseño. Orden recomendado en la ficha:

1. `store/play-01-editor.png` — editor con la tira de jugadas
2. `store/play-02-animar.png` — animación a mitad de jugada
3. `store/play-03-simular.png` — veredicto del simulador
4. `store/play-04-catalogo.png` — catálogo con filtros
5. `store/play-05-rutas.png` — biblioteca de rutas
6. `store/play-06-munequeras.png` — muñequeras y vista previa
