# FlagPlays · Propuestas de diseño gráfico

Documento de trabajo para decidir el nuevo aspecto de la app (PC y móvil).
Las maquetas están en `docs/diseno/` y son la misma pantalla resuelta con tres
lenguajes visuales distintos, para comparar de un vistazo.

---

## 1. Por qué la app "echa para atrás" hoy

No es un problema de talento, es de sistema: ahora mismo casi todo comunica lo
mismo. Estas son las causas concretas y medibles:

| # | Síntoma | Dónde se nota | Efecto |
|---|---|---|---|
| 1 | **Todo es del mismo gris-azul** (`--bg-0` a `--bg-4`, 5 pasos casi idénticos) | Paneles, tarjetas, barras | El ojo no distingue qué es cada cosa: jerarquía plana |
| 2 | **Un solo color de acento** (lima `#9ae63f`) para todo | Botones, activos, datos | Nada destaca porque todo destaca igual |
| 3 | **Secciones sin identidad**: Jugadas, Rutas, Catálogo, Árbol y Muñequeras se ven igual | Barra de navegación | No hay mapa mental: el usuario no sabe dónde está |
| 4 | **Iconos de línea fina a 16 px** con trazo 1.5 | Barra, herramientas | Se leen como "app de aficionado", poco contundentes |
| 5 | **Tipografía única y pequeña** (11–13 px) sin contraste de familia | En todas partes | Falta carácter; los títulos no pesan |
| 6 | **Cero atmósfera**: fondos planos, sin sombras profundas ni degradados | Ventana completa | Se ve "de desarrollo" |
| 7 | **Sin movimiento**: aparecer/desaparecer sin transición | Cambios de modo, secciones | Se siente tosco, anticuado |

La buena noticia: los 7 se arreglan sobre todo **con tokens y CSS** (`styles/base.css`
y `styles/app.css`), sin tocar la lógica ni el renderizador del campo.

---

## 2. Las tres propuestas

### A · "Sideline" — deportivo y contundente
> La app como pizarra de banquillo: oscuro, alto contraste, tipografía condensada
> en mayúsculas y un lima eléctrico que muerde.

- **Paleta**: base `#05080b` / `#0a1218`, acento `#c6f432`, secundario azul pista `#2f7dff`, aviso coral.
- **Tipografía**: títulos condensados en mayúsculas con tracking amplio; datos en monoespaciada.
- **Navegación**: pestañas en mayúsculas, activa con relleno lima y sombra dura inferior.
- **Iconos**: trazo 2.2, esquinas rectas, 20 px.
- **Campo**: tema *night* con marco interior lima muy tenue.
- **Sensación**: agresiva, "herramienta de entrenador". Riesgo: puede cansar en sesiones largas y el mayúsculas constante ocupa más ancho.

`docs/diseno/propuesta-A-escritorio.png` · `docs/diseno/propuesta-A-movil.png`

### B · "Tactical Editorial" — libreta de entrenador impresa
> Claridad de papel: fondo hueso, tinta, serif en la marca y rojo balón como acento.
> El campo es un plano de verdad, en blanco.

- **Paleta**: papel `#f7f4ec`, tinta `#14181b`, rojo `#cf3f2b`, azul pizarra `#1e5fbf`, verde `#2b7a45`.
- **Tipografía**: serif (Georgia/Charter) para títulos; sans para interfaz; mono para cifras.
- **Navegación**: pestañas con subrayado rojo, sin relleno; bordes de 2 px y cuadrícula de papel de fondo.
- **Iconos**: trazo 1.75, 18 px, mucho aire.
- **Campo**: tema *paper* (blanco), que es además el que se usa al imprimir.
- **Sensación**: seria, "playbook de toda la vida", muy legible al sol en un campo. Riesgo: en interiores de noche deslumbra; menos "app moderna".

`docs/diseno/propuesta-B-escritorio.png` · `docs/diseno/propuesta-B-movil.png`

### C · "Neo-turf" — moderna, con color por sección ⭐
> Grafito con halos de color, paneles de cristal y **un color por sección**.
> La más actual y la que resuelve el punto 3 del diagnóstico.

- **Paleta base**: `#0a0e11`, superficies translúcidas `rgba(255,255,255,.05)`, bordes `rgba(255,255,255,.1)`.
- **Color por sección** (el corazón de la propuesta):

  | Sección | Color | Uso |
  |---|---|---|
  | Jugadas | lima `#b4f13f` | activo, botón principal |
  | Rutas | cian `#45d9e8` | iconos y cabecera de la sección |
  | Catálogo | violeta `#a78bfa` | chips de filtro y contador |
  | Árbol | ámbar `#ffb020` | nodos y conectores |
  | Muñequeras | rosa `#ff6b9a` | botón de imprimir/PDF |

- **Tipografía**: Inter con escala clara (11 / 12 / 13 / 15 / 18 / 24) y `-0.01em` en títulos.
- **Navegación**: píldoras con punto de color; al entrar en una sección, su color tiñe cabecera, iconos y botones (no el resto de la app).
- **Iconos**: duotono (relleno + trazo) a 22–24 px, con un glifo propio por sección.
- **Campo**: tema *blueprint* con sombra profunda y halo; el campo gana protagonismo.
- **Sensación**: moderna sin ser fría, muy reconocible en capturas de Play Store. Riesgo: hay que vigilar el contraste AA en textos sobre cristal (se resuelve con `#f4f8f6` sobre `#0a0e11`, ratio 15:1).

`docs/diseno/propuesta-C-escritorio.png` · `docs/diseno/propuesta-C-movil.png`

---

## 3. Mi recomendación

**C como base**, con dos injertos:

1. **De B, la sección Muñequeras e impresión**: al ser material que se imprime,
   que use el lenguaje papel (B) dentro de la app. Refuerza la metáfora y evita
   que la vista previa blanca desentone con el resto.
2. **De A, el marcador de la cabecera**: la marca "FlagPlays" con el icono de
   bandera en un cuadrado lima y el nombre en mayúsculas condensadas. Da carácter
   sin cargar toda la interfaz de mayúsculas.

Es decir: **C en la app, B en el papel, A en la marca**.

---

## 4. Qué se toca (y qué no)

Todo esto es presentación; **no se toca** ni el modelo de datos, ni el
renderizador del campo, ni PDF/impresión, ni la lógica de rutas o simulador.

| Fase | Trabajo | Archivos | Esfuerzo |
|---|---|---|---|
| 1 | Tokens nuevos: color por sección, sombras, radios, escala tipográfica | `styles/base.css` | 1–2 h |
| 2 | Barra superior + navegación con color por sección | `styles/app.css`, `src/main.js` (nav), `src/icons.js` | 3–4 h |
| 3 | Set de iconos duotono (≈24 glifos) | `src/icons.js` | 3–4 h |
| 4 | Tarjetas de la libreta y del catálogo con el nuevo lenguaje | `styles/app.css`, `styles/catalog.css` | 2–3 h |
| 5 | Sección activa teñida (cabecera + acentos) | `styles/*.css` por sección | 3–4 h |
| 6 | Móvil: barra mínima, tira de jugadas y hoja con la nueva piel | `styles/mobile.css` | 2–3 h |
| 7 | Micro-interacciones: transiciones de sección, hover, foco, feedback al guardar | CSS + `src/main.js` | 1–2 h |
| 8 | Repaso de contraste AA y tamaños táctiles | `tests/` (nuevo test de tokens) | 1–2 h |

Además, para la ficha de Play: **nuevas capturas** con el rediseño (2–4 h de
trabajo aparte, se generan solas desde el emulador).

---

## 5. Detalles que marcan la diferencia (aplicables a cualquiera de las tres)

- **Estado del campo**: un halo de luz tenue detrás del jugador seleccionado y
  estela al arrastrar (ya existe el dibujo, falta el brillo).
- **Contador de jugadas vivo**: el número de la libreta con animación al añadir.
- **Guardado visible**: "Guardado a las 20:41" con punto verde que pulsa 1 s.
- **Vacíos útiles**: cuando no hay jugadas, un botón grande "Crear mi primera jugada"
  en vez de un texto gris.
- **Cabecera de sección con color**: al entrar en Catálogo, una línea de 3 px violeta
  bajo la barra y el icono de la sección a color.
- **Feedback táctil**: `navigator.vibrate(8)` al coger un jugador (ya existe el
  puente Android).
- **Transición de modo** Editar → Animar: fundido de 120 ms del campo (no salto).

---

## 6. Decisión

Hay que elegir una base antes de implementar:

- **A** si buscas contundencia deportiva y no te importa el mayúsculas.
- **B** si la app se usa sobre todo impresa y al aire libre.
- **C** si quieres la imagen más moderna y diferenciar secciones por color
  (mi recomendación).
- **Mezcla C + B + A** si te convence mi recomendación de la sección 3.

En cuanto me digas cuál, empiezo por la fase 1 y 2 (tokens y barra), que es donde
se ve el cambio de golpe, y te paso capturas de la app real antes de seguir.
