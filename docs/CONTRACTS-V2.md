# CONTRATOS v2 — Personalización, PDF y Árbol de rutas

Extiende `docs/CONTRACTS.md`. Se mantienen todas las reglas: **cero dependencias**, módulos ES
nativos, sin build, UI en español de España, y **nadie escribe ficheros de otro dueño**.

## Ficheros nuevos y propiedad

| Fichero | Dueño | Contenido |
|---|---|---|
| `src/pdf.js` | **pdf-writer** | Escritor de PDF (primitivas vectoriales + texto) |
| `src/route-tree.js` | **tree-model** | Modelo, disposición (layout) y SVG del árbol de rutas |
| `src/tree-ui.js`, `styles/tree.css` | **tree-ui** | Editor de árbol de rutas (interfaz) |
| `src/afm.js` | Lead (ya existe) | Anchuras de Helvetica/Bold/Oblique por código WinAnsi |
| `src/appearance.js` | Lead | Temas de campo, apariencia, colores por jugador |
| `src/tree-pdf.js` | Lead | Puente `layoutTree` → PDF |
| `src/renderer.js`, `src/inspector.js`, `src/state.js`, `src/model.js`, `src/main.js` | Lead | integración |
| `tests/pdf.mjs`, `tests/route-tree.mjs`, `tests/tree-ui.mjs` | cada uno | `node tests/<x>.mjs` |

---

## A. `src/pdf.js` — escritor de PDF 1.4 (pdf-writer)

Sin dependencias. **Único import permitido:** `import { AFM_WIDTHS, charWidth, encodedWidth } from './afm.js';`

### Sistema de coordenadas
**Origen arriba a la izquierda, `y` crece hacia abajo**, en puntos (pt). El módulo invierte
internamente a coordenadas PDF. Todas las funciones de la API usan esta convención.
1 pt = 1/72 pulgada. A4 = 595.28 × 841.89 pt. Carta = 612 × 792 pt.

### API obligatoria

```js
export const PAGE_SIZES = { A4: {width:595.28, height:841.89}, Letter: {width:612, height:792}, A3: {...} };

export function createPdf(options = {}) -> Pdf
// options: { size:'A4'|'Letter'|'A3'|{width,height}, landscape?:boolean, margin?:number,
//            title?:string, author?:string, subject?:string, creator?:string, compress?:false }
```

Métodos de la instancia:

```js
pdf.width  pdf.height  pdf.margin  pdf.pageCount
pdf.addPage(opts?)            // -> número de página (1-based). opts {size, landscape, margin}
pdf.setPage(n)
pdf.saveState() / pdf.restoreState()
pdf.translate(x, y)           // traslada el sistema de coordenadas actual
pdf.rotate(deg, cx?, cy?)     // opcional pero recomendado
pdf.rect(x, y, w, h, style?)  // style {fill, stroke, lineWidth=1, radius=0, dash:'6 4', fillOpacity, strokeOpacity, opacity}
pdf.circle(cx, cy, r, style?)
pdf.ellipse(cx, cy, rx, ry, style?)
pdf.line(x1, y1, x2, y2, style?)
pdf.polyline(points, style?)  // points [{x,y}]; style {..., close:false, arrowEnd:false}
pdf.polygon(points, style?)
pdf.text(str, x, y, style?)   // style {font:'regular'|'bold'|'italic'|'bolditalic', size=11,
                              //        color='#111827', align:'left'|'center'|'right',
                              //        baseline:'top'|'middle'|'bottom'|'alphabetic', opacity, maxWidth}
pdf.measureText(str, style?) -> number      // anchura en pt
pdf.wrapText(str, maxWidth, style?) -> string[]
pdf.textBlock(str, x, y, style?) -> number  // multilínea, devuelve el alto consumido
                              // style añade: {lineHeight=1.35, maxWidth, maxLines}
pdf.bytes() -> Uint8Array
pdf.blob() -> Blob            // 'application/pdf'
pdf.download(filename)        // usa blob + <a download> (guardas typeof document)
pdf.validate() -> {ok:boolean, errors:string[]}   // comprobación estructural del PDF generado
```

### Requisitos técnicos (no negociables)

1. **Cabecera** `%PDF-1.4`, objetos numerados, **tabla xref correcta** (los offsets en bytes
   deben ser exactos), `trailer` con `/Root` y `/Size`, y `%%EOF`. Sin xref el PDF no abre.
2. **Fuentes estándar** sin embeber: `Helvetica`, `Helvetica-Bold`, `Helvetica-Oblique`,
   `Helvetica-BoldOblique`, todas con `/Encoding /WinAnsiEncoding`.
3. **Texto en español**: codificar a **WinAnsi (CP1252)**. Tildes, `ñ`, `ü`, `¿`, `¡`, `º`,
   `ª`, `«`, `»`, `°`, `€` deben salir bien. Caracteres no representables → `?`.
   Definir el mapa CP1252 explícito (32..255) en el módulo.
4. **Escapado** en cadenas PDF: `(`, `)`, `\` y caracteres de control.
5. **Anchuras con `src/afm.js`**: `encodedWidth(codePoints, fontName)`; la fuente por defecto
   cuando `font:'regular'` es `'Helvetica'`, `'bold'` → `'Helvetica-Bold'`, etc. Así
   `align:'center'|'right'` y `wrapText` son exactos.
6. **Opacidad** vía `/ExtGState` (`/ca`, `/CA`), reutilizando un recurso por valor.
7. **Colores** acepta `'#rrggbb'`, `'#rgb'`, `[r,g,b]` 0-255. Convierte a operadores `rg`/`RG`.
8. **Estilos de línea**: `lineWidth`, `dash` (`'6 4'` → `[6 4] 0 d`), `lineCap` `'butt'|'round'|'square'`,
   `lineJoin` `'miter'|'round'|'bevel'`.
9. **Métricas de página**: cada página con su propio `/Contents` y `/Resources`; el texto
   no debe salirse nunca: helper `pdf.fits(str, maxWidth, style) -> boolean`.
10. Sin compresión (streams sin `/Filter`), para poder auditar el contenido con tests.

### Tests (`tests/pdf.mjs`, mínimo 40 asserts)
- Cabecera, `%%EOF`, `trailer`, `/Count` = páginas, offsets xref apuntan a `N 0 obj`.
- `bytes()` es `Uint8Array` y empieza por `%PDF-`.
- Texto con `(` `)` `\` escapado y recuperable.
- WinAnsi: generar un PDF con `Árbol de rutas — ñandú ¿qué?` y comprobar que el stream
  contiene los bytes CP1252 correctos (p.ej. `\xF1` para ñ, `\xE1` para á) y que
  `measureText` coincide con `encodedWidth` de `afm.js`.
- `wrapText` parte en varias líneas y ninguna excede `maxWidth` (medido con `measureText`).
- `align:'center'` deja el texto centrado: `x + (maxWidth - width)/2` ± 0.01.
- `validate()` devuelve `ok:true` y 0 errores para un documento con 3 páginas, rectángulos,
  círculos, polilíneas, dashes, opacidad y texto.
- `pageCount` correcto y `setPage` no rompe el contenido previo.
- Un PDF guardado en disco (`qa/pdf-sample.pdf`) para revisión visual.

---

## B. `src/route-tree.js` — modelo y dibujo del árbol de rutas (tree-model)

Un **árbol de rutas** es un diagrama de árbol donde cada nodo es una ruta/lectura y las
aristas marcan la progresión (qué opción sigue si la anterior no está). Sirve tanto para el
árbol de pases clásico numerado como para una progresión del QB o un árbol de concepto.

Puedes importar `./model.js` (uid, createPlayer…) y `./presets.js` (`ROUTES`, `getRoute`).

```js
/** @typedef {{x:number,y:number}} Pt */

/** @typedef {{
 *   id:string, parentId:string|null,
 *   number:string,        // "1", "2", "3", "A", "B"… (libre)
 *   title:string,         // "Rueda exterior"
 *   subtitle:string,      // "Profundidad 12 yd · banda derecha"
 *   kind:'root'|'route'|'read'|'concept',
 *   routeId:string|null,  // id de ROUTES
 *   points:Pt[],          // ruta propia (yardas, relativa al origen) si no hay routeId
 *   depth:number,         // yardas al break
 *   notes:string,
 *   color:string|null
 * }} TreeNode */

/** @typedef {{
 *   id:string, name:string, kind:'passing'|'progression'|'concept'|'coverage',
 *   orientation:'horizontal'|'vertical',
 *   nodes:TreeNode[], notes:string,
 *   meta:{createdAt:number, updatedAt:number}
 * }} RouteTree */
```

API:

```js
export const TREE_KINDS = { passing:{label,desc,orientation}, progression:{...}, concept:{...}, coverage:{...} };
export function uid(prefix?)                        // ids estables
export function createTree(kind='passing', name?)   -> RouteTree   // con nodo raíz
export function normalizeTree(raw)                  -> RouteTree   // valida y migra; lanza si es ilegible
export function cloneTree(tree)                     -> RouteTree
export function treeStats(tree) -> { nodes, leaves, maxDepth, branches, totalYards }
export function addNode(tree, parentId, partial?)   -> { tree, node }   // inmutable o mutando copia, documenta cuál
export function removeNode(tree, id)                -> RouteTree        // elimina el subárbol
export function updateNode(tree, id, patch)         -> RouteTree
export function moveNode(tree, id, newParentId)     -> RouteTree        // evita ciclos
export function nodeRoute(tree, node)               -> Pt[]             // resuelve routeId o points
export function treeOutline(tree)                   -> [{id, depth, number, title, hasChildren}]
export const PRESET_TREES = [ {id, name, desc, build: () => RouteTree}, ... ];
export function buildPresetTree(id)                 -> RouteTree

/** Disposición. Unidades abstractas (~pt). Coordenadas absolutas dentro del diagrama. */
export function layoutTree(tree, opts?) -> Layout
// opts: { orientation?, nodeW=170, nodeH=112, gapX=56, gapY=26, padding=26,
//         routeArea={x:10,y:40,w:150,h:60}, showNotes:false, sortChildren:false }
// Layout = {
//   width, height,
//   nodes: [{ id, x, y, w, h, number, title, subtitle, kind, color, depth, notes,
//             routePoints: Pt[],           // ABSOLUTOS, listos para dibujar una polilínea
//             routeBox: {x,y,w,h},         // zona del mini-diagrama dentro del nodo
//             labelLines: string[],        // título ya partido en líneas
//             subLines: string[] }],
//   edges: [{ fromId, toId, points: Pt[] }],   // codo ortogonal padre->hijo
//   legend: [{ id, number, title, depth, notes }],
//   bounds: { x, y, width, height }
// }
export function renderTreeSVG(tree, opts?) -> string
// opts: { width=1100, theme:'dark'|'print', selectedId, showLegend=true,
//         title, subtitle, footer, watermark, nodeScale }
// Debe ser SVG válido, autocontenido (xmlns, viewBox) y sin dependencias externas.
export function renderNodeThumb(node, opts?) -> string   // mini SVG de una ruta (para listas)
```

Requisitos:
- **Disposición de árbol ordenada**: las hojas se apilan sin solaparse; el padre se centra
  verticalmente respecto de sus hijos. Soporta `horizontal` (raíz a la izquierda) y
  `vertical` (raíz arriba). Nada de solapes: los tests lo verificarán.
- **Mini-diagrama de ruta** dentro de cada nodo: la ruta se dibuja desde el borde inferior
  del recuadro (`y = routeBox.y + routeBox.h`), escalada para caber con margen, con una
  línea de scrimmage tenue y una punta de flecha.
- **Presets obligatorios** (todos jugables y con geometría realista):
  1. `classic-9` — árbol de pases clásico 1-9 (raíz + 9 rutas numeradas; usa `ROUTES`).
  2. `qb-progression` — progresión del QB de 3 lecturas con condiciones ("si hombre…" / "si zona…").
  3. `concept-mesh` — árbol de concepto con 3 variantes del mismo concepto.
  4. `coverage-tree` — árbol de decisión contra coberturas (Hombre/Zona → 2-3 rutas cada una).
- **Temas**: `dark` (para pantalla, usa los colores del tema turf de `styles/base.css`) y
  `print` (fondo blanco, tinta #111827, líneas #111827). Sin depender del CSS: colores inline.
- Español en todos los textos por defecto. Sin emojis.

### Tests (`tests/route-tree.mjs`, mínimo 45 asserts)
- `createTree` crea raíz; `addNode`/`removeNode`/`moveNode` mantienen la integridad
  (sin huérfanos, sin ciclos — `moveNode` a un descendiente debe lanzar o ser no-op).
- `normalizeTree(JSON.parse(JSON.stringify(tree)))` es idempotente y conserva nodos y orden.
- Todos los `PRESET_TREES` pasan `normalizeTree`, tienen ≥ 5 nodos y ≥ 2 niveles de profundidad.
- `layoutTree`: ningún par de nodos se solapa (comprobar rectángulos), todas las aristas
  conectan nodos existentes, `bounds` contiene a todos los nodos, `width/height` > 0.
- `layoutTree` es determinista (misma entrada → misma salida).
- `renderTreeSVG` empieza por `<svg`, tiene `xmlns`, `viewBox`, cierra `</svg>`, no contiene
  `NaN` ni `undefined`, y el número de `<text>` es ≥ número de nodos.
- `treeStats` coherente (leaves = nodos sin hijos).
- `nodeRoute` devuelve ≥ 2 puntos para cada nodo con `routeId` válido de `ROUTES`.

---

## C. `src/tree-ui.js` + `styles/tree.css` — editor del árbol (tree-ui)

Interfaz de pantalla completa para crear y editar árboles de rutas. **Solo consumes la API de
`route-tree.js`**; no reimplementes disposición ni dibujo.

```js
export function createTreeEditor({ root, tree, onChange, onExportPdf, onClose }) -> {
  render(), destroy(), getTree(), setTree(tree)
}
```
- `root`: contenedor DOM (una `<div>` vacía que te da main.js, ocupa toda la pantalla).
- `onChange(tree)`: se llama en cada cambio (main.js guarda y persiste).
- `onExportPdf(tree)`: el botón «Exportar PDF» llama a esto; main.js genera el PDF.
- Debe montar su propio HTML dentro de `root` y limpiar en `destroy()`.

Disposición (rejilla de 3 zonas, altura completa):
- **Izquierda (240px)**: nombre del árbol editable, selector de tipo, selector de orientación,
  desplegable de presets («Cargar plantilla…»), botón «Nuevo árbol», y el **esquema** en
  forma de lista anidada (`treeOutline`) con número + título, botón «+» para añadir hijo en
  nodos seleccionados y papelera para borrar subárbol.
- **Centro**: vista previa del árbol (`renderTreeSVG`) escalada para caber, con fondo del tema
  oscuro. Clic en un nodo de la vista previa lo selecciona (los nodos deben llevar
  `data-node-id` en el SVG — pídeselo a `renderTreeSVG` vía `opts.selectedId` y usa el
  evento sobre `[data-node-id]`; si `renderTreeSVG` no los expone, selecciona desde la lista).
- **Derecha (320px)**: propiedades del nodo seleccionado: número, título, subtítulo,
  ruta (rejilla de tarjetas de `ROUTES` con miniatura usando `renderNodeThumb`), profundidad
  (slider 0-30 yd), notas (textarea), color (paleta de 8 + «automático»).
- **Barra superior**: título «Árbol de rutas», subtítulo con estadísticas
  (`treeStats`), botones «Exportar PDF» (primario), «Imprimir» (opcional) y «Cerrar».
- **Estado vacío** cuando no hay nodo seleccionado: mensaje de ayuda.
- Atajos: `Supr` borra el nodo, `Esc` cierra, `Flechas` navegan por el esquema.
- Accesibilidad: roles, `aria-label` en iconos, foco visible, Escape cierra.
- **Estilo**: reutiliza los tokens de `styles/base.css` (`--bg-1`, `--bg-2`, `--line`,
  `--accent`, `--tx-0/1/2/3`, `--r-md`, `--mono`), tipografía y densidad de la app.
  Clases con prefijo `tr-` en `styles/tree.css`. Nada de gradientes ni sombras pesadas.
  Controles de 30-32px de alto, radios 6-9px. Sin emojis.

### Tests (`tests/tree-ui.mjs`, mínimo 12 asserts)
Solo para las funciones puras exportadas además de la de UI (por ejemplo
`treeOutline` re-exportado y `nodeFormDefaults(node)`): nada de DOM, el editor se prueba
manualmente con el arnés `qa/e2e.html`.
