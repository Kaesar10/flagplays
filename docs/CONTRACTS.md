# FlagPlays — Contrato de arquitectura (LEER ANTES DE ESCRIBIR CÓDIGO)

App web de pizarra/libreta de flag football. **Sin dependencias, sin build step.**
Vanilla ES modules servidos por `node server.mjs`. UI 100% en español de España.

## Estructura de ficheros y propiedad

| Fichero | Dueño | Notas |
|---|---|---|
| `index.html`, `server.mjs`, `package.json` | Lead | no tocar |
| `styles/base.css` | Lead | tokens de diseño |
| `styles/app.css` | Lead | layout |
| `styles/print.css` | print-ux | solo impresión |
| `styles/print-ui.css` | print-ux | UI del diálogo de impresión |
| `src/field.js` | Lead | geometría |
| `src/model.js` | Lead | modelo de datos |
| `src/state.js` | Lead | store + undo/redo |
| `src/renderer.js` | Lead | SVG del campo |
| `src/editor.js` | Lead | interacción |
| `src/ui.js` | Lead | modales/toasts |
| `src/playback.js` | Lead | animación |
| `src/library.js` | Lead | lista de jugadas |
| `src/inspector.js` | Lead | panel de propiedades |
| `src/main.js` | Lead | bootstrap |
| `qa/e2e.html` | Lead | arnés de pruebas visuales (iframe + escenarios) |
| `src/presets.js` | **presets** | datos puros |
| `src/sim.js` | **sim-logic** | simulación + análisis puro |
| `src/print.js` | **print-ux** | muñequeras + hojas |
| `src/share.js` | **share-io** | PNG/JSON/URL compartir |
| `tests/*.mjs` | cada uno | `node tests/x.mjs` |

**Nadie escribe ficheros de otro dueño.** Si necesitas un cambio en un fichero ajeno,
mándale un mensaje al Lead con el snippet exacto.

## Sistema de coordenadas (TODO en yardas)

- `x`: 0 = centro del campo. **Positivo = derecha de la ofensiva.**
- `y`: 0 = línea de scrimmage (LOS). **Positivo = campo profundo (hacia la defensa).**
- Todos los jugadores y puntos de ruta se guardan **relativos al LOS**, así una jugada
  sirve desde cualquier yarda.
- Solo el renderer convierte a píxeles.

## Modelo de datos

```js
/** @typedef {{x:number, y:number}} Pt */

/** Punto de ruta. curve = cómo llega el segmento que TERMINA en este punto. */
/** @typedef {{x:number, y:number, curve:'line'|'smooth'}} PathPoint */

/** @typedef {'qb'|'c'|'wr'|'rb'|'te'|'dl'|'lb'|'db'|'s'} Role */

/** @typedef {'route'|'motion'|'rush'|'zone'|'block'|'handoff'} PathType */

/** @typedef {null
 *   | {type:'man',      targetId:string}      // cubre a un receptor concreto
 *   | {type:'zone',     landmark:Pt, depth:number} // zona: profundidad de drop en yardas
 *   | {type:'rush',     lane:number}          // 0=exterior izq, 1=medio, 2=exterior der
 *   | {type:'cover3'|'cover2'|'cover1'|'cover0'}
 * } Assignment */

/** @typedef {{
 *   id:string, team:'offense'|'defense', pos:Pt,
 *   label:string, role:Role, number:string,
 *   path:PathPoint[]|null, pathType:PathType,
 *   assignment:Assignment
 * }} Player */

/** @typedef {{
 *   id:string, name:string, type:'offense'|'defense',
 *   formation:string,     // id de formación (ver presets.js) o ''
 *   category:string,      // 'Pase corto' | 'Pase profundo' | 'Carrera' | 'Zona' | 'Hombre' | 'Especial'
 *   tags:string[], notes:string,
 *   field:{width:number, depth:number, ez:number},  // width=ancho jugable, depth=fondo dibujado sobre LOS
 *   players:Player[],
 *   ball:{ targetId:string|null, releaseAt:number },  // releaseAt en segundos
 *   meta:{ createdAt:number, updatedAt:number, version:number }
 * }} Play */

/** @typedef {{
 *   id:string, name:string, version:number,
 *   plays:Play[],
 *   folders:{id:string,name:string,color:string}[],
 *   roster:{id:string,name:string,number:string}[],
 *   settings:{ field:(4|5|6|7|8), units:'yd'|'m', showDefense:boolean, theme:'turf'|'slate' }
 * }} Playbook */
```

Campo del modelo (constantes en `field.js`, no duplicar):
`field = { width: 40, depth: 25, ez: 10 }` por defecto para 7v7.

## API obligatoria de cada módulo

### `src/field.js` (Lead, ya existe — leerlo)
```js
export const FORMATS = { 5:{players:5, width:30, depth:25, ez:10}, 7:{...}, ... }
export function fieldToPx(pt, view)      // -> {x,y} px
export function pxToField(px, view)      // -> {x,y} yardas
export function makeView({field, width, height, padding, losY, flipped})
export function snapYard(v)
export function clampToField(pt, field)
export function dist(a,b), export function lerp(a,b,t)
```

### `src/model.js` (Lead, ya existe — leerlo)
```js
export function uid()
export function createPlay(partial?)         -> Play
export function createPlayer(partial?)       -> Player
export function normalizePlay(raw)           -> Play (migra/valida)
export function clonePlay(play, nameSuffix?) -> Play
export function validatePlay(play)           -> {ok:boolean, errors:string[]}
export function playToJSON(play) / playFromJSON(str)
export function emptyPlaybook()              -> Playbook
export function normalizePlaybook(raw)       -> Playbook
export function P_CATEGORIES  // string[] de categorías
export function ROLES         // {role: {label, short, color}}
```

### `src/renderer.js` (Lead)
```js
/** SVG en texto, sin DOM. Usado por print.js, share.js y el editor. */
export function playToSVG(play, opts) -> string
// opts: {
//   width=800, height=600,      // px del viewport
//   mode='static'|'editor'|'print'|'card',   // card = miniatura para muñequera
//   time=0,                     // segundos: posiciona jugadores sobre su ruta
//   showDefense=true, showRoutes=true, showLabels=true, showNotes=false,
//   flipped=false,              // true = visto desde la defensa
//   highlight:string[]=[],      // ids resaltados
//   bg=true, padding=14
// }
/** Solo el contenido (sin <svg>), para poder incrustar en otro SVG. */
export function playToSVGInner(play, opts) -> string
export function computePlayDuration(play) -> number   // segundos, mínimo 1.5
export function playerAtTime(player, t, duration) -> Pt   // posición en yardas
export function pathPointsPx(player, view) -> {x,y}[]  // helper exportado
export const COLORS  // {offense, defense, ball, route, ...}
```

### `src/presets.js` (presets)
```js
export const FORMATIONS = [ { id, name, type:'offense'|'defense', format:7, players:[{label, role, x, y}] , notes } ]
export const ROUTES = [ { id, name, points:[{x,y}...], category, desc } ]  // plantillas de ruta en yardas
export const DEFENSES = [ { id, name, type:'defense', players:[...], desc } ]
export const STARTER_PLAYS = [ Play, ... ]   // >= 10 jugadas completas y jugables
export const CONCEPTS = [ { id, name, desc, tags, formationId, routes:{label:routeId} } ]
export function buildPlayFromConcept(conceptId, opts) -> Play   // usa model.js
export function applyFormation(play, formationId) -> Play        // recoloca manteniendo roles
export function listRoutesByCategory() -> Record<string, Route[]>
```

### `src/sim.js` (sim-logic)
```js
export const LEVELS = { youth, rec, competitive }   // {label, reactDelay, speed, sepPenalty}
/** Simula ofensiva (con rutas) contra defensa (con assignments).
 *  Paso fijo 1/30 s hasta `duration`. */
export function simulate(play, opts) -> SimResult
// opts: { level='rec', qbReads=true, duration? }
/** SimResult = { duration, frames:[Frame], outcome:{result, reason, openAt, openTargetId, separation}, players:Record<string,Dt[]> }
 *  Frame = { t, positions:Record<string,Pt>, ball:null|{x,y,inAir}, open:{
 *      playerId:string, sep:number, state:'open'|'tight'|'covered' }[] }
 */
export function gradeMatchup(play, defense, opts) -> { grade:'strong'|'ok'|'tough', reason:string, sim:SimResult }
export function analyzePlay(play, defenses, opts) -> {
   rows:[{defenseId, defenseName, level, grade, reason}],
   summary:{strong:number, ok:number, tough:number, verdict:string}
}
export function openness(attackers, defenders, t) -> {playerId,sep,state}[]
export function interpolate(play, t) -> Record<string,Pt>   // vector de posiciones a t
```

### `src/print.js` (print-ux)
```js
export function openPrintDialog(state, opts)   // abre modal de configuración y llama a window.print()
export function renderWristbandSheet(plays, opts) -> string   // HTML
export function renderCallSheet(playbook, opts) -> string     // HTML
export function renderPlaySheet(play, opts) -> string         // HTML, 1 jugada/página
export function installPrintStyles()                          // inyecta <style> de @page
```
Opciones de muñequera: `{ size:'4x6'|'3.5x5'|'3x5'|'custom', cols, rows, playsPerCard, showNumbers, showName, showDiagram }`.
Mínimo: 1, 2, 4, 6, 12 jugadas por hoja; rejilla con líneas de corte; nombre + diagrama pequeño + número de llamada.

### `src/share.js` (share-io)
```js
export async function exportPNG(play, opts) -> Blob          // usa renderer.playToSVG
export async function copyPlayImage(play, opts) -> boolean    // al portapapeles
export function playToShareURL(play) -> string                // #p=<base64 deflate-lite>
export function playFromLocationHash() -> Play|null
export function exportPlaybookJSON(playbook) -> void          // descarga .json
export async function importPlaybookFile(file) -> Playbook
export async function exportGIF(play, opts) -> Blob|null      // opcional (stretch)
export function downloadBlob(blob, filename)
```

## Convenciones de código
- ES modules, `import` explícito con extensión (`.js`).
- Sin `npm install`. Sin CDN. Sin `<script>` inline.
- Nada de `innerHTML` con datos del usuario sin escapar: usar `escapeHTML()` de `ui.js`.
- Comentarios y textos de UI **en español**. Identificadores en inglés.
- Cada módulo debe poder importarse en Node sin DOM en sus funciones puras
  (las que usan DOM van en funciones separadas y se guardan con `typeof document!== 'undefined'`).
- Tests: `node tests/<modulo>.mjs`, `assert` de node:assert. Mínimo 8 asserts por módulo.
  Se ejecutan todos con `npm test` (`node tests/run.mjs`).

## Diseño / estética
- Tema oscuro "turf". Tokens en `styles/base.css` (usar variables, no colores sueltos).
- Acento lima `--accent`, ofensiva `--off`, defensa `--def`. Muy alto contraste.
- Nada de emojis en la UI. Iconos: `src/icons.js` (sprite SVG del Lead) o `<svg>` propio.
- Densidad de herramienta profesional: alto 32-36px en controles, radios 8-10px.
