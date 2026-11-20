// ============================================================================
// FlagPlays · src/tree-ui.js — editor del árbol de rutas (interfaz)
// ----------------------------------------------------------------------------
// Pantalla completa de tres zonas: esquema (240px), vista previa (centro) y
// propiedades del nodo (320px). NO dispone ni dibuja el árbol: todo eso vive en
// route-tree.js. Aquí solo se compone la UI, se gestiona la selección y se
// emiten los cambios con onChange(tree).
//
// API pública:
//   createTreeEditor({ root, tree, onChange, onExportPdf, onClose })
//     -> { render(), destroy(), getTree(), setTree(tree) }
//   nodeFormDefaults(node)  -> normaliza los campos editables de un nodo
//   outlineToRows(outline)  -> filas planas para el esquema (función pura)
// ============================================================================
import { icon } from './icons.js';
import { h, toast, popupMenu, confirmDialog, isMenuOpen, hasOpenModal } from './ui.js';
import { ROUTES, customRoutes } from './presets.js';
import {
  layoutTree,
  renderTreeSVG,
  renderNodeThumb,
  treeOutline,
  treeStats,
  createTree,
  addNode,
  removeNode,
  updateNode,
  buildPresetTree,
  PRESET_TREES,
  TREE_KINDS,
  normalizeTree,
  moveNodeUp,
  moveNodeDown,
  reorderNode,
  reparentNode,
  siblingIndex,
  nodeRouteYards,
  setNodeRoute,
  clearNodeRoute,
  mirrorNodeRoute,
  routePointToYards,
  layoutNode,
} from './route-tree.js';

// ---------------------------------------------------------------------------
// Constantes de presentación
// ---------------------------------------------------------------------------
const NODE_KINDS = { root: 'Raíz', route: 'Ruta', read: 'Lectura', concept: 'Concepto' };
/** Punto de corte móvil: por debajo, un panel a la vez con conmutador. */
const MOBILE_QUERY = '(max-width: 900px)';
const PANELS = [
  { id: 'outline', label: 'Esquema' },
  { id: 'tree', label: 'Árbol' },
  { id: 'props', label: 'Propiedades' },
];
const DEPTH_MIN = 0;
const DEPTH_MAX = 30;
const COMMIT_DELAY = 220;
const PREVIEW_FALLBACK_WIDTH = 880;
/** Cabecera que `renderTreeSVG` dibuja encima del layout (título + subtítulo). */
const SVG_HEADER_H = 80;
/** Margen inferior que `renderTreeSVG` añade bajo el layout. */
const SVG_BOTTOM_PAD = 12;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 1.15;
/** Por debajo de esta escala el árbol no se reduce más: se deja scroll. */
const MIN_FIT_SCALE = 0.35;
/** Editor de ruta grande del panel de propiedades (viewBox y escala px/yarda). */
const BIG_ROUTE_W = 280;
const BIG_ROUTE_H = 170;
const BIG_ROUTE_SCALE = 6;
const BIG_ROUTE_ORIGIN_Y = 146;

/** Paleta de 8 colores + «automático» (null). */
const COLOR_SWATCHES = [
  { value: '#9ae63f', label: 'verde turba' },
  { value: '#63c8ff', label: 'azul cielo' },
  { value: '#ffc94d', label: 'amarillo' },
  { value: '#ff7a5c', label: 'naranja' },
  { value: '#ff6b9d', label: 'rosa' },
  { value: '#d7a8ff', label: 'violeta' },
  { value: '#57d98a', label: 'menta' },
  { value: '#eef6f2', label: 'blanco' },
];

// ============================================================================
// 1. Funciones puras (exportadas: son las que prueba tests/tree-ui.mjs)
// ============================================================================

/**
 * Normaliza los campos editables de un nodo del árbol. Tolera nodos
 * incompletos o ilegibles: siempre devuelve las seis claves del formulario con
 * tipos estables. La profundidad se redondea y se recorta a 0-30 yd.
 * @param {object|null|undefined} node
 * @returns {{number:string, title:string, subtitle:string, depth:number, color:string|null, notes:string}}
 */
export function nodeFormDefaults(node) {
  const source = node && typeof node === 'object' ? node : {};
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  const rawDepth = Number(source.depth);
  const depth = Number.isFinite(rawDepth)
    ? Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, Math.round(rawDepth)))
    : DEPTH_MIN;
  const rawColor = text(source.color);
  return {
    number: text(source.number),
    title: text(source.title),
    subtitle: text(source.subtitle),
    depth,
    color: rawColor || null,
    notes: source.notes === null || source.notes === undefined ? '' : String(source.notes),
  };
}

/**
 * Convierte el esquema plano de `treeOutline(tree)` en filas listas para
 * pintar: etiqueta legible, sangría, selección y si tiene hijos.
 * `selectedId` es opcional; si no se pasa se respeta la marca del propio
 * elemento (`selected` / `isSelected`), que es lo que devuelve route-tree.
 * @param {Array<{id:string, depth:number, number?:string, title?:string, hasChildren?:boolean}>} outline
 * @param {string|null} [selectedId]
 * @returns {Array<{id:string, label:string, indent:number, isSelected:boolean, hasChildren:boolean}>}
 */
export function outlineToRows(outline, selectedId = null) {
  const list = Array.isArray(outline) ? outline : [];
  // `treeOutline` numera los niveles desde 1 (la raíz es 1), así que la sangría
  // se calcula relativa a la fila menos profunda para que la raíz quede a ras.
  const depths = list
    .map((entry) => Number(entry && entry.depth))
    .filter((depth) => Number.isFinite(depth))
    .map((depth) => Math.max(0, depth));
  const base = depths.length ? Math.min(...depths) : 0;
  return list.map((entry) => {
    const item = entry && typeof entry === 'object' ? entry : {};
    const id = item.id === null || item.id === undefined ? '' : String(item.id);
    const number = item.number === null || item.number === undefined ? '' : String(item.number).trim();
    const title = item.title === null || item.title === undefined ? '' : String(item.title).trim();
    const label = number && title ? `${number} · ${title}` : number || title || '(sin título)';
    const rawDepth = Number(item.depth);
    const depth = Number.isFinite(rawDepth) ? Math.max(0, rawDepth) : 0;
    const indent = Math.max(0, Math.floor(depth - base));
    const hasChildren = Boolean(item.hasChildren);
    const isSelected =
      selectedId !== null && selectedId !== undefined
        ? id === String(selectedId)
        : Boolean(item.selected ?? item.isSelected);
    return { id, label, indent, isSelected, hasChildren };
  });
}

// ============================================================================
// 2. Utilidades internas (sin estado)
// ============================================================================
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointList(points) {
  if (!Array.isArray(points)) return [];
  return points.map((point) => ({ x: Number(point?.x) || 0, y: Number(point?.y) || 0 }));
}

/** Mini SVG de una plantilla de ruta (respaldo si route-tree no puede dibujarla). */
function fallbackRouteThumb(points, width = 64, height = 24) {
  const list = pointList(points);
  const head = list.length ? list : [{ x: 0, y: 0 }, { x: 0, y: 1 }];
  const xs = [0, ...head.map((p) => p.x)];
  const ys = [0, ...head.map((p) => p.y)];
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - 8) / spanX, (height - 8) / spanY);
  const tx = (x) => 4 + (x - minX) * scale;
  const ty = (y) => height - 4 - (y - minY) * scale;
  const path = [`M ${tx(0).toFixed(2)} ${ty(0).toFixed(2)}`]
    .concat(head.map((p) => `L ${tx(p.x).toFixed(2)} ${ty(p.y).toFixed(2)}`))
    .join(' ');
  const last = head[head.length - 1];
  return (
    `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">` +
    `<path d="${path}"/>` +
    `<circle cx="${tx(last.x).toFixed(2)}" cy="${ty(last.y).toFixed(2)}" r="2.2" fill="currentColor" stroke="none"/>` +
    `</svg>`
  );
}

/** Miniatura de una plantilla de ROUTES para las tarjetas del panel. */
function routeCardThumb(route) {
  try {
    const svg = renderNodeThumb(
      { routeId: route.id, points: route.points, color: null },
      { width: 92, height: 28, theme: 'dark', background: false, padding: 4 }
    );
    if (svg && /<svg/i.test(svg)) return svg;
  } catch {
    /* si route-tree no puede dibujarla, usamos el respaldo local */
  }
  return fallbackRouteThumb(route.points, 92, 28);
}

function rootNodeOf(tree) {
  if (!tree || !Array.isArray(tree.nodes) || !tree.nodes.length) return null;
  return tree.nodes.find((node) => !node.parentId) || tree.nodes[0] || null;
}

function findNodeOf(tree, id) {
  if (!tree || !Array.isArray(tree.nodes) || !id) return null;
  return tree.nodes.find((node) => node.id === id) || null;
}

/** Árbol por defecto: primera plantilla si la hay; si no, un árbol vacío. */
function defaultTree() {
  try {
    const preset = Array.isArray(PRESET_TREES) ? PRESET_TREES[0] : null;
    if (preset) {
      const built = typeof preset.build === 'function' ? preset.build() : buildPresetTree(preset.id);
      if (built) return normalizeTree(built);
    }
  } catch {
    /* seguimos con el árbol mínimo */
  }
  try {
    return normalizeTree(createTree('passing', 'Nuevo árbol'));
  } catch {
    return createTree('passing', 'Nuevo árbol');
  }
}

// ============================================================================
// 3. Editor
// ============================================================================
/**
 * Monta el editor de árbol de rutas dentro de `root`.
 * @param {{root: HTMLElement|string, tree?: object, onChange?: Function, onExportPdf?: Function, onClose?: Function}} options
 */
export function createTreeEditor(options = {}) {
  const container =
    typeof options.root === 'string' ? document.querySelector(options.root) : options.root;
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('createTreeEditor: hace falta un contenedor «root» válido');
  }
  const { onChange, onExportPdf, onClose } = options;

  // ---------- estado ----------
  let current = initialTree(options.tree);
  let selectedId = rootId(current);
  let destroyed = false;
  let previewQueued = false;
  let commitTimer = null;
  let previewObserver = null;
  let previewLayout = null;
  let zoomMode = 'fit';
  let previewDims = { naturalW: 0, naturalH: 0, availW: 0, availH: 0, fit: 1, scale: 1 };
  let propsRefs = { routeCards: [], swatches: [] };
  let panel = 'outline';
  let mobileQuery = null;
  let mobileHandler = null;
  const panelButtons = {};
  // Edición de ruta y arrastre de nodos en el lienzo.
  let editRouteMode = false;
  let drag = null;
  let routePreviewTree = null;
  let suppressPreviewClick = false;
  let bigEditor = null;

  // ---------- referencias al DOM ----------
  const shell = h('div', { class: 'tr-shell', role: 'region', 'aria-label': 'Editor de árbol de rutas' });
  const statsEl = h('div', { class: 'tr-stats', 'aria-live': 'polite' });
  const tabsEl = h('nav', { class: 'tr-tabs', role: 'tablist', 'aria-label': 'Paneles del editor' });
  for (const def of PANELS) {
    const button = h('button', {
      class: 'tr-tab',
      type: 'button',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': `tr-panel-${def.id}`,
      tabindex: '-1',
      text: def.label,
      dataset: { panel: def.id },
    });
    button.addEventListener('click', () => setPanel(def.id));
    panelButtons[def.id] = button;
    tabsEl.append(button);
  }
  tabsEl.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const index = PANELS.findIndex((def) => def.id === panel);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = PANELS[(index + delta + PANELS.length) % PANELS.length];
    event.preventDefault();
    setPanel(next.id, { focusTab: true });
  });
  const nameInput = h('input', {
    class: 'input tr-name',
    type: 'text',
    maxlength: '60',
    'aria-label': 'Nombre del árbol',
    placeholder: 'Nombre del árbol',
  });
  const kindSelect = h('select', { class: 'select', 'aria-label': 'Tipo de árbol' });
  const orientHorizontal = h('button', {
    class: 'tr-seg-btn',
    type: 'button',
    'aria-label': 'Orientación horizontal (raíz a la izquierda)',
    'aria-pressed': 'false',
    html: `${icon('chevron-right', { size: 13 })}<span>Horizontal</span>`,
  });
  const orientVertical = h('button', {
    class: 'tr-seg-btn',
    type: 'button',
    'aria-label': 'Orientación vertical (raíz arriba)',
    'aria-pressed': 'false',
    html: `${icon('chevron-down', { size: 13 })}<span>Vertical</span>`,
  });
  const presetButton = h('button', {
    class: 'btn tr-btn-block',
    type: 'button',
    'aria-haspopup': 'menu',
    html: `${icon('folder', { size: 14 })}<span>Cargar plantilla…</span>`,
  });
  const newTreeButton = h('button', {
    class: 'btn tr-btn-block',
    type: 'button',
    html: `${icon('plus', { size: 14 })}<span>Nuevo árbol</span>`,
  });
  const countEl = h('span', { class: 'tr-side-count mono', text: '0' });
  const outlineEl = h('div', { class: 'tr-outline', role: 'tree', 'aria-label': 'Esquema del árbol' });
  const previewEl = h('div', {
    class: 'tr-preview',
    role: 'group',
    'aria-label': 'Vista previa del árbol de rutas',
  });
  const zoomValueEl = h('span', { class: 'tr-zoom-val mono', text: '100 %' });
  const zoomOutButton = h('button', {
    class: 'tr-zoom-btn',
    type: 'button',
    title: 'Reducir zoom',
    'aria-label': 'Reducir el zoom de la vista previa',
    html: icon('minus', { size: 13 }),
    onclick: () => stepZoom(-1),
  });
  const zoomInButton = h('button', {
    class: 'tr-zoom-btn',
    type: 'button',
    title: 'Aumentar zoom',
    'aria-label': 'Aumentar el zoom de la vista previa',
    html: icon('plus', { size: 13 }),
    onclick: () => stepZoom(1),
  });
  const zoomFitButton = h('button', {
    class: 'tr-zoom-fit',
    type: 'button',
    title: 'Ajustar el árbol a la ventana',
    'aria-label': 'Ajustar el árbol a la ventana',
    'aria-pressed': 'true',
    text: 'Ajustar',
    onclick: setZoomFit,
  });
  const zoomBar = h(
    'div',
    { class: 'tr-zoom', role: 'group', 'aria-label': 'Zoom de la vista previa' },
    zoomOutButton,
    zoomValueEl,
    zoomInButton,
    h('span', { class: 'tr-zoom-sep', 'aria-hidden': 'true' }),
    zoomFitButton
  );
  const zoomNoteEl = h('p', {
    class: 'tr-zoom-note',
    hidden: true,
    text: 'Árbol grande: usa el zoom para moverte',
  });
  const editRouteButton = h('button', {
    class: 'tr-edit-btn',
    type: 'button',
    'aria-pressed': 'false',
    'aria-label': 'Editar la ruta del nodo seleccionado',
    title: 'Editar la ruta del nodo seleccionado (Esc para salir)',
    html: `${icon('pen', { size: 13 })}<span>Editar ruta</span>`,
  });
  const editRouteHint = h('span', {
    class: 'tr-canvas-hint',
    hidden: true,
    text: 'Arrastra los puntos · clic en la zona añade · doble clic o Alt+clic borra',
  });
  const propsEl = h('aside', {
    class: 'tr-props',
    id: 'tr-panel-props',
    'aria-label': 'Propiedades del nodo',
  });

  buildShell();
  container.replaceChildren(shell);
  setupMobile();
  syncControls();
  renderAll();
  observeResize();
  setPanel(panel);
  updateEditRouteButton();

  // ==========================================================================
  // Construcción estática
  // ==========================================================================
  function buildShell() {
    const topbar = h(
      'header',
      { class: 'tr-top' },
      h(
        'div',
        { class: 'tr-ident' },
        h(
          'h1',
          { class: 'tr-title' },
          h('span', { class: 'tr-title-full', text: 'Árbol de rutas' }),
          h('span', { class: 'tr-title-short', text: 'Árbol' })
        ),
        statsEl
      ),
      h('div', { class: 'tr-top-actions' },
        h('button', {
          class: 'btn ghost icon tr-btn-print',
          type: 'button',
          title: 'Imprimir (Ctrl+P)',
          'aria-label': 'Imprimir el árbol',
          html: icon('printer', { size: 15 }),
          onclick: printTree,
        }),
        h('button', {
          class: 'btn primary tr-btn-export',
          type: 'button',
          title: 'Exportar el árbol a PDF',
          'aria-label': 'Exportar el árbol a PDF',
          html: `${icon('download', { size: 14 })}<span>Exportar PDF</span>`,
          onclick: exportPdf,
        }),
        h('span', { class: 'sep', 'aria-hidden': 'true' }),
        h('button', {
          class: 'btn ghost icon tr-btn-close',
          type: 'button',
          title: 'Cerrar (Esc)',
          'aria-label': 'Cerrar el editor',
          html: icon('x', { size: 16 }),
          onclick: closeEditor,
        })
      )
    );

    const side = h(
      'aside',
      { class: 'tr-side', id: 'tr-panel-outline', 'aria-label': 'Esquema y ajustes del árbol' },
      h(
        'div',
        { class: 'tr-side-head' },
        h('label', { class: 'tr-field' }, h('span', { class: 'lbl', text: 'Nombre' }), nameInput),
        h('label', { class: 'tr-field' }, h('span', { class: 'lbl', text: 'Tipo' }), kindSelect),
        h(
          'div',
          { class: 'tr-field' },
          h('span', { class: 'lbl', text: 'Orientación' }),
          h('div', { class: 'tr-seg', role: 'group', 'aria-label': 'Orientación del árbol' }, orientHorizontal, orientVertical)
        ),
        h('div', { class: 'tr-actions' }, presetButton, newTreeButton)
      ),
      h(
        'div',
        { class: 'tr-side-title' },
        h('span', { class: 'tr-side-titletext', text: 'Esquema' }),
        countEl
      ),
      outlineEl,
      h(
        'footer',
        { class: 'tr-hints' },
        h('span', { class: 'tr-hint' }, h('span', { class: 'kbd', text: 'Supr' }), ' borra'),
        h('span', { class: 'tr-hint' }, h('span', { class: 'kbd', text: 'Esc' }), ' cierra'),
        h('span', { class: 'tr-hint', text: 'Flechas navegan' })
      )
    );

    const stage = h(
      'main',
      { class: 'tr-stage', id: 'tr-panel-tree', 'aria-label': 'Vista previa del árbol' },
      h('div', { class: 'tr-canvas-bar' }, editRouteButton, editRouteHint),
      h('div', { class: 'tr-preview-stage' }, previewEl, zoomBar, zoomNoteEl),
      h(
        'footer',
        { class: 'tr-stage-foot' },
        h('span', { class: 'tr-stage-foot-ic', html: icon('cursor', { size: 12 }) }),
        h('span', { text: 'Clic en un nodo para seleccionarlo. Flechas para navegar el esquema.' })
      )
    );

    shell.append(topbar, tabsEl, h('div', { class: 'tr-body' }, side, stage, propsEl));
  }

  // ==========================================================================
  // Estado y selección
  // ==========================================================================
  function initialTree(input) {
    if (input) {
      try {
        return normalizeTree(input);
      } catch {
        /* árbol ilegible: usamos el de por defecto */
      }
    }
    return defaultTree();
  }

  function rootId(tree) {
    const root = rootNodeOf(tree);
    return root ? root.id : null;
  }

  function selectedNode() {
    const node = findNodeOf(current, selectedId);
    if (node) return node;
    const root = rootNodeOf(current);
    return root || null;
  }

  function resolveSelection() {
    if (selectedId && findNodeOf(current, selectedId)) return;
    selectedId = rootId(current);
  }

  function syncControls() {
    if (document.activeElement !== nameInput) nameInput.value = current.name || '';
    kindSelect.replaceChildren(
      ...Object.entries(TREE_KINDS || {}).map(([id, def]) => {
        const option = h('option', { value: id, text: (def && def.label) || id });
        if (def && def.desc) option.title = def.desc;
        if (id === current.kind) option.selected = true;
        return option;
      })
    );
    if (!kindSelect.options.length) {
      kindSelect.append(h('option', { value: current.kind || 'passing', text: current.kind || 'passing' }));
    }
    kindSelect.value = current.kind || kindSelect.options[0].value;
    const horizontal = current.orientation !== 'vertical';
    orientHorizontal.classList.toggle('is-active', horizontal);
    orientVertical.classList.toggle('is-active', !horizontal);
    orientHorizontal.setAttribute('aria-pressed', horizontal ? 'true' : 'false');
    orientVertical.setAttribute('aria-pressed', horizontal ? 'false' : 'true');
  }

  // -------------------------- Paneles en móvil ------------------------------
  function isMobile() {
    return mobileQuery ? mobileQuery.matches : false;
  }

  function setupMobile() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    mobileQuery = window.matchMedia(MOBILE_QUERY);
    mobileHandler = () => {
      if (destroyed) return;
      if (isMobile() && panel === 'tree') schedulePreview();
    };
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', mobileHandler);
    } else if (typeof mobileQuery.addListener === 'function') {
      mobileQuery.addListener(mobileHandler);
    }
  }

  function teardownMobile() {
    if (!mobileQuery || !mobileHandler) return;
    if (typeof mobileQuery.removeEventListener === 'function') {
      mobileQuery.removeEventListener('change', mobileHandler);
    } else if (typeof mobileQuery.removeListener === 'function') {
      mobileQuery.removeListener(mobileHandler);
    }
    mobileQuery = null;
    mobileHandler = null;
  }

  /** Cambia el panel visible en móvil (en escritorio los tres siguen visibles). */
  function setPanel(id, opts = {}) {
    const valid = PANELS.some((def) => def.id === id) ? id : 'outline';
    panel = valid;
    if (shell.dataset.panel !== valid) shell.dataset.panel = valid;
    for (const def of PANELS) {
      const button = panelButtons[def.id];
      if (!button) continue;
      const active = def.id === valid;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    }
    // Al volver al panel del árbol hay que remedir: mientras estuvo oculto el
    // lienzo medía 0 y el zoom de ajuste no era fiable.
    if (valid === 'tree') schedulePreview();
    if (opts.focusTab) panelButtons[valid]?.focus();
  }

  function selectNode(id, opts = {}) {
    const next = id || null;
    if (next && !findNodeOf(current, next)) return;
    // En móvil, tocar un nodo lleva directo a sus propiedades.
    if (next && isMobile()) setPanel('props');
    if (!next && editRouteMode) setEditRouteMode(false);
    if (next === selectedId) {
      if (opts.focusRow) focusOutlineSelected();
      return;
    }
    selectedId = next;
    renderOutline();
    schedulePreview();
    renderProps();
    if (opts.focusRow) focusOutlineSelected();
  }

  function focusOutlineSelected() {
    const row = outlineEl.querySelector('.tr-row-main[tabindex="0"]');
    if (row) row.focus();
  }

  function outlineIds() {
    try {
      return treeOutline(current).map((row) => row.id);
    } catch {
      return [];
    }
  }

  function stepSelection(delta) {
    const ids = outlineIds();
    if (!ids.length) return;
    let index = ids.indexOf(selectedId);
    if (index < 0) index = delta > 0 ? -1 : 0;
    index = clamp(index + delta, 0, ids.length - 1);
    selectNode(ids[index], { focusRow: true });
  }

  function selectFirstChild() {
    if (!selectedId) return;
    const child = current.nodes.find((node) => node.parentId === selectedId);
    if (child) selectNode(child.id, { focusRow: true });
  }

  function selectParent() {
    const node = selectedNode();
    if (node && node.parentId) selectNode(node.parentId, { focusRow: true });
  }

  // ==========================================================================
  // Cambios en el árbol
  // ==========================================================================
  function notify(tree) {
    if (typeof onChange !== 'function' || destroyed) return;
    try {
      onChange(tree);
    } catch (error) {
      console.error('tree-ui: onChange ha lanzado un error', error);
    }
  }

  function commitNow() {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    notify(current);
  }

  function queueCommit() {
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      commitTimer = null;
      notify(current);
    }, COMMIT_DELAY);
  }

  function patchSelected(patch) {
    if (!selectedId) return;
    let next;
    try {
      next = updateNode(current, selectedId, patch);
    } catch {
      return;
    }
    if (next) current = next;
    resolveSelection();
    renderStats();
    renderOutline();
    schedulePreview();
    queueCommit();
  }

  function addChild(parentId) {
    const parent = findNodeOf(current, parentId) || rootNodeOf(current);
    if (!parent) return;
    const before = new Set(current.nodes.map((node) => node.id));
    const number = nextSiblingNumber(parent.id);
    let result;
    try {
      result = addNode(current, parent.id, {
        number,
        title: 'Ruta nueva',
        subtitle: '',
        kind: 'route',
        routeId: null,
        points: [{ x: 0, y: 0 }, { x: 0, y: 8 }],
        depth: 8,
        notes: '',
        color: null,
      });
    } catch (error) {
      console.error('tree-ui: no se pudo añadir el nodo', error);
      return;
    }
    current = result && result.tree ? result.tree : result || current;
    const created =
      (result && result.node) || current.nodes.find((node) => !before.has(node.id)) || null;
    selectedId = created ? created.id : parent.id;
    renderAll();
    if (isMobile()) setPanel('props');
    commitNow();
    const titleInput = propsEl.querySelector('.tr-field-title input');
    if (titleInput) {
      titleInput.focus();
      titleInput.select();
    }
  }

  function nextSiblingNumber(parentId) {
    const siblings = current.nodes.filter((node) => node.parentId === parentId);
    let max = 0;
    for (const sibling of siblings) {
      const numeric = parseInt(String(sibling.number || ''), 10);
      if (Number.isFinite(numeric) && numeric > max) max = numeric;
    }
    return String(max + 1);
  }

  async function deleteNode(id) {
    const node = findNodeOf(current, id);
    if (!node) return;
    if (!node.parentId) {
      toast('La raíz del árbol no se puede borrar', 'info', 1700);
      return;
    }
    const children = current.nodes.filter((child) => child.parentId === id);
    if (children.length) {
      const label = node.title || node.number || 'este nodo';
      const confirmed = await confirmDialog({
        title: 'Borrar subárbol',
        message: `Se eliminarán «${label}» y ${children.length} nodo(s) por debajo.`,
        confirmLabel: 'Borrar',
      });
      if (!confirmed || destroyed) return;
    }
    const parentId = node.parentId;
    try {
      const next = removeNode(current, id);
      if (next) current = next;
    } catch (error) {
      console.error('tree-ui: no se pudo borrar el nodo', error);
      return;
    }
    selectedId = findNodeOf(current, parentId) ? parentId : rootId(current);
    renderAll();
    commitNow();
    focusOutlineSelected();
  }

  function deleteSelected() {
    if (!selectedId) return;
    deleteNode(selectedId);
  }

  function setOrientation(orientation) {
    const next = orientation === 'vertical' ? 'vertical' : 'horizontal';
    if (current.orientation === next) return;
    current = { ...current, orientation: next };
    zoomMode = 'fit';
    syncControls();
    schedulePreview();
    commitNow();
  }

  function setKind(kind) {
    if (!kind || kind === current.kind) return;
    const def = TREE_KINDS && TREE_KINDS[kind];
    current = { ...current, kind };
    if (def && def.orientation) current.orientation = def.orientation;
    zoomMode = 'fit';
    syncControls();
    schedulePreview();
    commitNow();
  }

  function renameTree(name) {
    if (current.name === name) return;
    current = { ...current, name };
    queueCommit();
    schedulePreview();
  }

  // ==========================================================================
  // Estructura: reordenar, reparentar y editar la ruta
  // ==========================================================================
  function applyStructuralTree(next, keepId, opts = {}) {
    if (!next) return;
    current = next;
    if (keepId && findNodeOf(current, keepId)) selectedId = keepId;
    resolveSelection();
    renderStats();
    renderOutline();
    schedulePreview();
    renderProps();
    commitNow();
    if (opts.focusRow) focusOutlineSelected();
  }

  function reorderSibling(id, direction) {
    if (!id) return;
    let next;
    try {
      next = direction > 0 ? moveNodeDown(current, id) : moveNodeUp(current, id);
    } catch {
      return;
    }
    applyStructuralTree(next, id, { focusRow: true });
  }

  function setEditRouteMode(enabled, opts = {}) {
    if (enabled && !findNodeOf(current, selectedId)) {
      toast('Selecciona un nodo para editar su ruta', 'info', 1900);
      return;
    }
    const next = !!enabled;
    if (next === editRouteMode) {
      updateEditRouteButton();
      return;
    }
    editRouteMode = next;
    updateEditRouteButton();
    schedulePreview();
    if (opts.focus) editRouteButton.focus();
  }

  function toggleEditRoute() {
    setEditRouteMode(!editRouteMode);
  }

  function updateEditRouteButton() {
    editRouteButton.classList.toggle('is-active', editRouteMode);
    editRouteButton.setAttribute('aria-pressed', editRouteMode ? 'true' : 'false');
    editRouteHint.hidden = !editRouteMode;
  }

  // -------------------------- Arrastre en el lienzo -------------------------
  function clientToLayout(clientX, clientY) {
    const svg = previewEl.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const box = svg.viewBox && svg.viewBox.baseVal;
    const viewW = box && box.width ? box.width : rect.width;
    const viewH = box && box.height ? box.height : rect.height;
    const viewX = box && box.width ? box.x : 0;
    const viewY = box && box.height ? box.y : 0;
    return {
      x: viewX + ((clientX - rect.left) / rect.width) * viewW - (previewDims.offsetX || 0),
      y: viewY + ((clientY - rect.top) / rect.height) * viewH - (previewDims.headerTop || 0),
    };
  }

  function isDescendantOf(ancestorId, nodeId) {
    let cursor = findNodeOf(current, nodeId);
    let guard = 0;
    while (cursor && guard < 200) {
      if (cursor.parentId === ancestorId) return true;
      cursor = cursor.parentId ? findNodeOf(current, cursor.parentId) : null;
      guard += 1;
    }
    return false;
  }

  function siblingsOf(parentId) {
    return current.nodes.filter((node) => (node.parentId || null) === (parentId || null));
  }

  function layoutNodeAtPoint(pt) {
    if (!previewLayout || !Array.isArray(previewLayout.nodes)) return null;
    return (
      previewLayout.nodes.find(
        (node) => pt.x >= node.x && pt.x <= node.x + node.w && pt.y >= node.y && pt.y <= node.y + node.h
      ) || null
    );
  }

  /**
   * Decide qué pasaría al soltar el nodo arrastrado en `pt`: reparentar sobre
   * otra caja (banda central), reordenar entre hermanas (bandas de borde o
   * huecos de la misma fila/columna) o nada.
   */
  function resolveCanvasTarget(pt, dragId) {
    const dragged = findNodeOf(current, dragId);
    if (!dragged || !previewLayout) return null;
    const orientation = current.orientation === 'vertical' ? 'vertical' : 'horizontal';
    const hovered = layoutNodeAtPoint(pt);
    if (hovered && hovered.id === dragId) return null;
    if (hovered && hovered.id !== dragId) {
      const hoveredNode = findNodeOf(current, hovered.id);
      if (!hoveredNode) return null;
      if (isDescendantOf(dragId, hovered.id)) return { type: 'invalid' };
      const rel =
        orientation === 'vertical'
          ? (pt.x - hovered.x) / Math.max(1, hovered.w)
          : (pt.y - hovered.y) / Math.max(1, hovered.h);
      const edge = rel < 0.24 || rel > 0.76;
      if (edge) {
        if ((hoveredNode.parentId || null) !== (dragged.parentId || null)) return null;
        const siblings = siblingsOf(dragged.parentId).filter((node) => node.id !== dragId);
        const hoverIndex = siblings.findIndex((node) => node.id === hovered.id);
        if (hoverIndex < 0) return null;
        const before = rel <= 0.5;
        const line =
          orientation === 'vertical'
            ? {
                x1: hovered.x + (before ? 0 : hovered.w),
                y1: hovered.y - 8,
                x2: hovered.x + (before ? 0 : hovered.w),
                y2: hovered.y + hovered.h + 8,
              }
            : {
                x1: hovered.x - 10,
                y1: hovered.y + (before ? 0 : hovered.h),
                x2: hovered.x + hovered.w + 10,
                y2: hovered.y + (before ? 0 : hovered.h),
              };
        return { type: 'reorder', index: hoverIndex + (before ? 0 : 1), parentId: dragged.parentId, line };
      }
      return { type: 'reparent', targetId: hovered.id };
    }

    // Hueco entre hermanas del mismo padre.
    if (!dragged.parentId) return null;
    const siblings = siblingsOf(dragged.parentId).filter((node) => node.id !== dragId);
    const rects = siblings
      .map((node) => layoutNode(previewLayout, node.id))
      .filter((node) => !!node);
    if (!rects.length) return null;
    const laneMin = orientation === 'vertical'
      ? Math.min(...rects.map((node) => node.x))
      : Math.min(...rects.map((node) => node.y));
    const laneMax = orientation === 'vertical'
      ? Math.max(...rects.map((node) => node.x + node.w))
      : Math.max(...rects.map((node) => node.y + node.h));
    const perpendicular = orientation === 'vertical' ? pt.y : pt.x;
    if (perpendicular < laneMin - 34 || perpendicular > laneMax + 34) return null;
    const main = orientation === 'vertical' ? pt.x : pt.y;
    let best = null;
    for (let i = 0; i <= rects.length; i += 1) {
      let boundary;
      if (i === 0) boundary = orientation === 'vertical' ? rects[0].x : rects[0].y;
      else if (i === rects.length) {
        boundary = orientation === 'vertical'
          ? rects[i - 1].x + rects[i - 1].w
          : rects[i - 1].y + rects[i - 1].h;
      } else {
        boundary = orientation === 'vertical'
          ? (rects[i - 1].x + rects[i - 1].w + rects[i].x) / 2
          : (rects[i - 1].y + rects[i - 1].h + rects[i].y) / 2;
      }
      const dist = Math.abs(main - boundary);
      if (!best || dist < best.dist) best = { dist, boundary, index: i };
    }
    if (!best || best.dist > 140) return null;
    const line = orientation === 'vertical'
      ? {
          x1: best.boundary,
          y1: Math.min(...rects.map((node) => node.y)) - 6,
          x2: best.boundary,
          y2: Math.max(...rects.map((node) => node.y + node.h)) + 6,
        }
      : {
          x1: Math.min(...rects.map((node) => node.x)) - 6,
          y1: best.boundary,
          x2: Math.max(...rects.map((node) => node.x + node.w)) + 6,
          y2: best.boundary,
        };
    return { type: 'reorder', index: best.index, parentId: dragged.parentId, line };
  }

  function clearCanvasOverlay() {
    previewEl.querySelectorAll('[data-tr-overlay]').forEach((node) => node.remove());
  }

  function drawCanvasOverlay(target) {
    clearCanvasOverlay();
    if (!target || target.type === 'invalid') return;
    const svg = previewEl.querySelector('svg');
    if (!svg) return;
    const ox = previewDims.offsetX || 0;
    const oy = previewDims.headerTop || 0;
    const NS = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-tr-overlay', '1');
    group.setAttribute('pointer-events', 'none');
    if (target.type === 'reparent') {
      const targetNode = layoutNode(previewLayout, target.targetId);
      if (targetNode) {
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', String(targetNode.x + ox));
        rect.setAttribute('y', String(targetNode.y + oy));
        rect.setAttribute('width', String(targetNode.w));
        rect.setAttribute('height', String(targetNode.h));
        rect.setAttribute('rx', '9');
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#9ae63f');
        rect.setAttribute('stroke-width', '2.5');
        rect.setAttribute('stroke-dasharray', '7 5');
        group.append(rect);
      }
    }
    if (target.type === 'reorder' && target.line) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(target.line.x1 + ox));
      line.setAttribute('y1', String(target.line.y1 + oy));
      line.setAttribute('x2', String(target.line.x2 + ox));
      line.setAttribute('y2', String(target.line.y2 + oy));
      line.setAttribute('stroke', '#9ae63f');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('stroke-linecap', 'round');
      group.append(line);
    }
    svg.append(group);
  }

  function startNodeDrag(event, nodeId) {
    const node = findNodeOf(current, nodeId);
    if (!node || !node.parentId || !previewLayout) return;
    drag = {
      kind: 'node',
      nodeId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      target: null,
    };
    previewEl.classList.add('is-dragging');
    try {
      previewEl.setPointerCapture(event.pointerId);
    } catch {
      /* eventos sintéticos sin captura */
    }
    event.preventDefault();
  }

  function startRouteDrag(event, nodeId, index, points, startPoints) {
    const nodeLayout = layoutNode(previewLayout, nodeId);
    if (!nodeLayout || !nodeLayout.editOrigin || !nodeLayout.editScale) return;
    drag = {
      kind: 'route',
      nodeId,
      index,
      points: points.map((p) => ({ ...p })),
      startPoints: startPoints.map((p) => ({ ...p })),
      nodeLayout,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    previewEl.classList.add('is-dragging');
    try {
      previewEl.setPointerCapture(event.pointerId);
    } catch {
      /* eventos sintéticos sin captura */
    }
    event.preventDefault();
  }

  function onPreviewPointerDown(event) {
    if (destroyed || !previewLayout) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    suppressPreviewClick = false;
    const handleEl = event.target.closest?.('[data-route-handle]');
    const areaEl = event.target.closest?.('[data-route-area]');
    const nodeEl = event.target.closest?.('[data-node-id]');
    if (!nodeEl) return;
    const nodeId = nodeEl.getAttribute('data-node-id');
    if (!nodeId) return;
    if (editRouteMode && selectedId === nodeId && handleEl) {
      const index = Number(handleEl.getAttribute('data-route-handle'));
      let points = [];
      try {
        points = nodeRouteYards(current, selectedId).map((p) => ({ ...p }));
      } catch {
        points = [];
      }
      if (event.altKey) {
        event.preventDefault();
        deleteRoutePoint(index);
        return;
      }
      if (!Number.isFinite(index) || index < 0 || index >= points.length) return;
      startRouteDrag(event, nodeId, index, points, points);
      return;
    }
    if (editRouteMode && selectedId === nodeId && areaEl) {
      const pt = clientToLayout(event.clientX, event.clientY);
      if (!pt) return;
      const nodeLayout = layoutNode(previewLayout, nodeId);
      if (!nodeLayout || !nodeLayout.editOrigin) return;
      const yards = routePointToYards(nodeLayout, pt);
      let points = [];
      try {
        points = nodeRouteYards(current, selectedId).map((p) => ({ ...p }));
      } catch {
        points = [];
      }
      startRouteDrag(event, nodeId, points.length, [...points, yards], points);
      return;
    }
    startNodeDrag(event, nodeId);
  }

  function onPreviewPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    if (drag.kind === 'node') {
      const pt = clientToLayout(event.clientX, event.clientY);
      if (!pt) return;
      const target = resolveCanvasTarget(pt, drag.nodeId);
      drag.target = target;
      drawCanvasOverlay(target);
    } else if (drag.kind === 'route') {
      const pt = clientToLayout(event.clientX, event.clientY);
      if (!pt) return;
      const yards = routePointToYards(drag.nodeLayout, pt);
      drag.points = drag.points.map((point, index) => (index === drag.index ? yards : point));
      try {
        routePreviewTree = setNodeRoute(current, selectedId, drag.points);
      } catch {
        routePreviewTree = null;
      }
      if (bigEditor) bigEditor.draw(drag.points);
      schedulePreview();
    }
  }

  function finishPreviewDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const session = drag;
    drag = null;
    previewEl.classList.remove('is-dragging');
    clearCanvasOverlay();
    try {
      previewEl.releasePointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
    if (session.kind === 'route') {
      const isHandleClick = session.index < session.startPoints.length && !session.moved;
      if (isHandleClick) {
        routePreviewTree = null;
        schedulePreview();
        return;
      }
      suppressPreviewClick = true;
      routePreviewTree = null;
      let next = null;
      try {
        next = setNodeRoute(current, selectedId, session.points);
      } catch {
        next = null;
      }
      if (next) current = next;
      rerenderPropsPreservingScroll();
      schedulePreview();
      commitNow();
      return;
    }
    if (!session.moved) return; // clic simple: que lo gestione el click de selección
    suppressPreviewClick = true;
    const target = session.target;
    if (!target || target.type === 'invalid') {
      if (target && target.type === 'invalid') {
        toast('No se puede mover un nodo dentro de sí mismo', 'error', 2200);
      }
      return;
    }
    if (target.type === 'reparent') {
      let next = null;
      try {
        next = reparentNode(current, session.nodeId, target.targetId);
      } catch {
        toast('No se puede mover un nodo dentro de sí mismo', 'error', 2200);
        return;
      }
      if (next) applyStructuralTree(next, session.nodeId);
      return;
    }
    if (target.type === 'reorder') {
      let next = null;
      try {
        next = reorderNode(current, session.nodeId, target.index);
      } catch {
        return;
      }
      if (next) applyStructuralTree(next, session.nodeId);
    }
  }

  function cancelPreviewDrag() {
    if (!drag) return;
    const wasRoute = drag.kind === 'route';
    drag = null;
    previewEl.classList.remove('is-dragging');
    clearCanvasOverlay();
    if (wasRoute) {
      routePreviewTree = null;
      if (bigEditor) bigEditor.draw();
      schedulePreview();
    }
    suppressPreviewClick = true;
  }

  // ==========================================================================
  // Plantillas y árbol nuevo
  // ==========================================================================
  function openPresets() {
    const presets = Array.isArray(PRESET_TREES) ? PRESET_TREES : [];
    const items = presets.map((preset) => ({
      label: preset.name || preset.id,
      hint: preset.desc ? String(preset.desc).slice(0, 30) : '',
      icon: 'layers',
      onClick: () => loadPreset(preset),
    }));
    if (!items.length) items.push({ label: 'No hay plantillas disponibles', onClick: () => {} });
    popupMenu(presetButton, items, { label: 'Plantillas' });
  }

  async function loadPreset(preset) {
    if (current.nodes.length > 1) {
      const confirmed = await confirmDialog({
        title: 'Cargar plantilla',
        message: `Se sustituirá «${current.name || 'el árbol actual'}» por «${preset.name || 'la plantilla'}».`,
        confirmLabel: 'Cargar',
      });
      if (!confirmed || destroyed) return;
    }
    let built;
    try {
      built = typeof preset.build === 'function' ? preset.build() : buildPresetTree(preset.id);
    } catch (error) {
      console.error('tree-ui: plantilla ilegible', error);
      toast('No se pudo cargar la plantilla', 'error');
      return;
    }
    try {
      current = normalizeTree(built);
    } catch (error) {
      console.error('tree-ui: plantilla inválida', error);
      toast('La plantilla no es válida', 'error');
      return;
    }
    selectedId = rootId(current);
    zoomMode = 'fit';
    syncControls();
    renderAll();
    if (isMobile()) setPanel('outline');
    commitNow();
    toast(`Plantilla «${preset.name || preset.id}» cargada`, 'ok', 1600);
  }

  async function newTree() {
    if (current.nodes.length > 1) {
      const confirmed = await confirmDialog({
        title: 'Nuevo árbol',
        message: 'Se vaciará el árbol actual y se empezará de cero.',
        confirmLabel: 'Crear',
      });
      if (!confirmed || destroyed) return;
    }
    let built;
    try {
      built = createTree(current.kind || 'passing', 'Nuevo árbol');
    } catch {
      built = createTree('passing', 'Nuevo árbol');
    }
    try {
      current = normalizeTree(built);
    } catch {
      current = built;
    }
    selectedId = rootId(current);
    zoomMode = 'fit';
    syncControls();
    renderAll();
    if (isMobile()) setPanel('outline');
    commitNow();
    toast('Árbol nuevo', 'ok', 1300);
  }

  // ==========================================================================
  // Acciones de la barra superior
  // ==========================================================================
  function exportPdf() {
    if (typeof onExportPdf !== 'function') {
      toast('La exportación a PDF no está disponible', 'error', 1800);
      return;
    }
    try {
      onExportPdf(current);
    } catch (error) {
      console.error('tree-ui: onExportPdf ha lanzado un error', error);
      toast('No se pudo exportar el árbol', 'error', 1800);
    }
  }

  function printTree() {
    try {
      window.print();
    } catch {
      /* sin ventana de impresión: no es crítico */
    }
  }

  function closeEditor() {
    if (destroyed) return;
    if (typeof onClose === 'function') {
      try {
        onClose();
      } catch (error) {
        console.error('tree-ui: onClose ha lanzado un error', error);
      }
    } else {
      destroy();
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function renderAll() {
    resolveSelection();
    renderStats();
    renderOutline();
    renderPreview();
    renderProps();
  }

  function renderStats() {
    let stats;
    try {
      stats = treeStats(current);
    } catch {
      stats = { nodes: current.nodes.length, leaves: 0, maxDepth: 0, branches: 0, totalYards: 0 };
    }
    const plural = (value, one, many) => (Number(value) === 1 ? one : many);
    const items = [
      [plural(stats.nodes, 'nodo', 'nodos'), stats.nodes],
      [plural(stats.branches, 'rama', 'ramas'), stats.branches],
      [plural(stats.leaves, 'hoja', 'hojas'), stats.leaves],
      [plural(stats.maxDepth, 'nivel', 'niveles'), stats.maxDepth],
      ['yd', stats.totalYards],
    ];
    statsEl.replaceChildren(
      ...items.map(([label, value]) =>
        h(
          'span',
          { class: 'tr-stat' },
          h('b', { class: 'mono', text: String(value === null || value === undefined ? 0 : value) }),
          h('span', { text: label })
        )
      )
    );
  }

  function renderOutline() {
    const hadFocus = outlineEl.contains(document.activeElement);
    let rows;
    try {
      rows = outlineToRows(treeOutline(current), selectedId);
    } catch (error) {
      console.error('tree-ui: no se pudo leer el esquema', error);
      rows = [];
    }
    countEl.textContent = String(rows.length);
    if (!rows.length) {
      outlineEl.replaceChildren(
        h('p', { class: 'tr-outline-empty', text: 'El árbol no tiene nodos.' })
      );
      return;
    }
    const anySelected = rows.some((row) => row.isSelected);
    outlineEl.replaceChildren(
      ...rows.map((row, index) => buildOutlineRow(row, row.isSelected || (!anySelected && index === 0)))
    );
    if (hadFocus) focusOutlineSelected();
  }

  function buildOutlineRow(row, tabbable) {
    const node = findNodeOf(current, row.id) || {};
    const isRoot = !node.parentId;
    const title = String(node.title || '').trim() || '(sin título)';
    const number = String(node.number || '').trim() || '·';
    let sibIndex = -1;
    try {
      sibIndex = siblingIndex(current, row.id);
    } catch {
      sibIndex = -1;
    }
    const siblingCount = current.nodes.filter(
      (item) => (item.parentId || null) === (node.parentId || null)
    ).length;
    const upDisabled = isRoot || sibIndex <= 0;
    const downDisabled = isRoot || sibIndex < 0 || sibIndex >= siblingCount - 1;
    const main = h(
      'button',
      {
        class: 'tr-row-main',
        type: 'button',
        role: 'treeitem',
        'aria-level': String(row.indent + 1),
        'aria-selected': row.isSelected ? 'true' : 'false',
        'aria-label': `Seleccionar nodo ${row.label}`,
        tabindex: tabbable ? '0' : '-1',
      },
      h('span', { class: 'tr-num mono', text: number }),
      node.color ? h('span', { class: 'tr-dot', style: `--tr-dot:${node.color}` }) : null,
      h('span', { class: 'tr-label', text: title }),
      row.hasChildren ? h('span', { class: 'tr-branch', text: '+' }) : null
    );
    const upButton = h('button', {
      class: 'tr-act',
      type: 'button',
      title: upDisabled ? 'Ya es el primer hermano' : `Subir ${title}`,
      'aria-label': upDisabled ? `No se puede subir ${title}` : `Subir ${title}`,
      html: icon('chevron-up', { size: 13 }),
      dataset: { act: 'up', nodeId: row.id },
      disabled: upDisabled,
    });
    const downButton = h('button', {
      class: 'tr-act',
      type: 'button',
      title: downDisabled ? 'Ya es el último hermano' : `Bajar ${title}`,
      'aria-label': downDisabled ? `No se puede bajar ${title}` : `Bajar ${title}`,
      html: icon('chevron-down', { size: 13 }),
      dataset: { act: 'down', nodeId: row.id },
      disabled: downDisabled,
    });
    const addButton = h('button', {
      class: 'tr-act',
      type: 'button',
      title: `Añadir hijo a ${title}`,
      'aria-label': `Añadir hijo a ${title}`,
      html: icon('plus', { size: 13 }),
      dataset: { act: 'add', nodeId: row.id },
    });
    const removeButton = h('button', {
      class: 'tr-act tr-act-del',
      type: 'button',
      title: isRoot ? 'La raíz no se puede borrar' : `Borrar ${title} y su subárbol`,
      'aria-label': isRoot ? 'La raíz no se puede borrar' : `Borrar ${title} y su subárbol`,
      html: icon('trash', { size: 13 }),
      dataset: { act: 'remove', nodeId: row.id },
      disabled: isRoot,
    });
    return h(
      'div',
      {
        class: `tr-row${row.isSelected ? ' is-active' : ''}${isRoot ? ' is-root' : ''}`,
        role: 'none',
        'data-node-id': row.id,
        style: `--tr-indent:${row.indent}`,
        draggable: isRoot ? null : 'true',
        'aria-label': `Fila ${row.label}${isRoot ? ' (raíz)' : ''}`,
      },
      main,
      h('span', { class: 'tr-row-acts' }, upButton, downButton, addButton, removeButton)
    );
  }

  // ---------------------------- Vista previa y zoom -------------------------
  /** Escala que hace que el diagrama entero quepa en la vista (nunca > 1). */
  function fitScale() {
    const { naturalW, naturalH, availW, availH } = previewDims;
    if (!naturalW || !naturalH) return 1;
    return Math.min(1, availW / naturalW, availH / naturalH);
  }

  function updateZoomControls() {
    const scale = previewDims.scale || 1;
    zoomValueEl.textContent = `${Math.round(scale * 100)} %`;
    zoomOutButton.disabled = scale <= ZOOM_MIN + 1e-6;
    zoomInButton.disabled = scale >= ZOOM_MAX - 1e-6;
    const floorActive = zoomMode === 'fit' && previewDims.fit < MIN_FIT_SCALE;
    zoomNoteEl.hidden = !floorActive;
    zoomFitButton.classList.toggle('is-active', zoomMode === 'fit');
    zoomFitButton.setAttribute('aria-pressed', zoomMode === 'fit' ? 'true' : 'false');
  }

  /** Aplica `zoomMode` («fit» o escala numérica) al SVG ya montado. */
  function applyPreviewScale() {
    const { naturalW, naturalH, availW, availH } = previewDims;
    if (!naturalW || !naturalH) return;
    const fit = fitScale();
    previewDims.fit = Number.isFinite(fit) && fit > 0 ? fit : 1;
    let scale = zoomMode === 'fit' ? previewDims.fit : Number(zoomMode);
    // Si el árbol es enorme, «ajustar» deja de reducir en MIN_FIT_SCALE: se
    // mantiene el scroll y se avisa con una nota.
    if (zoomMode === 'fit' && previewDims.fit < MIN_FIT_SCALE) scale = MIN_FIT_SCALE;
    if (!Number.isFinite(scale) || scale <= 0) scale = previewDims.fit;
    scale = clamp(scale, ZOOM_MIN, ZOOM_MAX);
    previewDims.scale = scale;
    const graphic = previewEl.querySelector('svg');
    if (graphic) {
      graphic.style.width = `${Math.max(1, Math.round(naturalW * scale))}px`;
      graphic.style.height = `${Math.max(1, Math.round(naturalH * scale))}px`;
    }
    const displayW = naturalW * scale;
    const displayH = naturalH * scale;
    const fits = displayW <= availW + 1 && displayH <= availH + 1;
    previewEl.classList.toggle('is-fit', fits);
    previewEl.classList.toggle('is-scroll', !fits);
    updateZoomControls();
  }

  function setZoomFit() {
    zoomMode = 'fit';
    applyPreviewScale();
    previewEl.scrollLeft = 0;
    previewEl.scrollTop = 0;
  }

  function stepZoom(direction) {
    const base = previewDims.scale || 1;
    const factor = direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomMode = clamp(Math.round(base * factor * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    applyPreviewScale();
  }

  function previewAvail() {
    const rect = previewEl.getBoundingClientRect();
    const width = rect.width - 2;
    const height = rect.height - 2;
    return {
      availW: width >= 140 ? width : PREVIEW_FALLBACK_WIDTH,
      availH: height >= 140 ? height : 640,
    };
  }

  /**
   * Alto de cabecera que dibujará `renderTreeSVG` para este árbol. Siempre hay
   * subtítulo (estadísticas); el título solo aparece si el nombre no está vacío.
   */
  function previewHeaderTop(tree = current) {
    return String(tree && tree.name ? tree.name : '').trim() ? SVG_HEADER_H : SVG_HEADER_H - 28;
  }

  /**
   * Elige la disposición de la vista previa. Para árboles en estrella (raíz +
   * hojas, tipo 1-9) le pide a route-tree que reparta los hermanos en columnas
   * (horizontal) o filas (vertical) con `maxColumnHeight`/`maxRowWidth`; así un
   * árbol vertical larguísimo ocupa 2 columnas y «Ajustar» sube de escala.
   *
   * El límite depende de la escala de ajuste (`altoDisponible / escala`) y la
   * escala depende del reparto, así que se itera hasta estabilizar (2-3 vueltas).
   * En árboles con ramas internas la opción es no-op, como documenta route-tree.
   */
  function layoutForPreview(tree, orientation, availW, availH, editRouteId) {
    const headerTop = previewHeaderTop(tree);
    let scaleGuess = 1;
    let best = null;
    for (let pass = 0; pass < 4; pass += 1) {
      const opts = { orientation };
      if (editRouteId) opts.editRouteId = editRouteId;
      if (orientation === 'vertical') opts.maxRowWidth = Math.max(40, availW / scaleGuess);
      else opts.maxColumnHeight = Math.max(40, availH / scaleGuess);
      const layout = layoutTree(tree, opts);
      const contentW = Math.max(Number(layout.width) || 0, 640);
      const contentH = Math.max(1, (Number(layout.height) || 0) + headerTop + SVG_BOTTOM_PAD);
      const rawScale = Math.min(1, availW / contentW, availH / contentH);
      const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
      const candidate = { layout, opts, contentW, contentH, scale };
      // En lienzos pequeños el reparto puede oscilar entre 1 y 2 vueltas: nos
      // quedamos con la disposición que deja mayor escala de ajuste.
      if (!best || candidate.scale > best.scale + 1e-4) best = candidate;
      if (Math.abs(scale - scaleGuess) < 0.01) break;
      scaleGuess = scale;
    }
    return best;
  }

  function renderPreview() {
    if (destroyed) return;
    const { availW, availH } = previewAvail();
    const keepX = previewEl.scrollLeft;
    const keepY = previewEl.scrollTop;
    previewLayout = null;
    let chosen = null;
    let svg;
    // Durante el arrastre de un punto se dibuja el árbol provisional; así el
    // cambio no se confirma en onChange hasta soltar.
    const tree = routePreviewTree || current;
    const editRouteId = editRouteMode && selectedId ? selectedId : null;
    try {
      const orientation = tree.orientation === 'vertical' ? 'vertical' : 'horizontal';
      chosen = layoutForPreview(tree, orientation, availW, availH, editRouteId);
      previewLayout = chosen.layout;
      svg = renderTreeSVG(tree, {
        ...chosen.opts,
        width: Math.max(360, Math.round(chosen.contentW)),
        theme: 'dark',
        selectedId,
        editRouteId,
        showLegend: false,
      });
    } catch (error) {
      console.error('tree-ui: no se pudo dibujar la vista previa', error);
      previewEl.classList.remove('is-fit', 'is-scroll');
      previewEl.replaceChildren(
        h('p', { class: 'tr-preview-error', text: 'No se ha podido dibujar el árbol.' })
      );
      return;
    }
    previewEl.innerHTML = svg || '';
    const graphic = previewEl.querySelector('svg');
    const naturalW = Number(graphic && graphic.getAttribute('width'));
    const naturalH = Number(graphic && graphic.getAttribute('height'));
    previewDims = {
      naturalW: Number.isFinite(naturalW) && naturalW > 0 ? naturalW : chosen.contentW,
      naturalH: Number.isFinite(naturalH) && naturalH > 0 ? naturalH : chosen.contentH,
      availW,
      availH,
      fit: 1,
      scale: 1,
      offsetX: Math.max(0, (chosen.contentW - chosen.layout.width) / 2),
      headerTop: previewHeaderTop(tree),
    };
    applyPreviewScale();
    if (!previewEl.classList.contains('is-fit')) {
      previewEl.scrollLeft = keepX;
      previewEl.scrollTop = keepY;
    }
  }

  function schedulePreview() {
    if (previewQueued || destroyed) return;
    previewQueued = true;
    requestAnimationFrame(() => {
      previewQueued = false;
      if (!destroyed) renderPreview();
    });
  }

  function renderProps() {
    propsRefs = { routeCards: [], swatches: [] };
    bigEditor = null;
    propsEl.replaceChildren();
    const node = findNodeOf(current, selectedId);
    if (!node) {
      propsEl.append(emptyProps());
      return;
    }
    const form = nodeFormDefaults(node);
    const kindLabel = NODE_KINDS[node.kind] || 'Nodo';
    const header = h(
      'header',
      { class: 'tr-props-head' },
      h(
        'div',
        { class: 'tr-props-headtext' },
        h('div', { class: 'tr-props-title', text: 'Propiedades del nodo' }),
        h('div', { class: 'tr-props-sub', text: nodePath(node) || 'Nodo raíz' })
      ),
      h('span', { class: 'tr-kind', text: kindLabel })
    );
    const scroll = h('div', { class: 'tr-props-scroll' });

    // --- Identificación -----------------------------------------------------
    const numberInput = h('input', {
      class: 'input mono',
      type: 'text',
      maxlength: '4',
      value: form.number,
      placeholder: '1',
      'aria-label': 'Número del nodo',
    });
    numberInput.addEventListener('input', () => patchSelected({ number: numberInput.value }));
    numberInput.addEventListener('change', commitNow);

    const titleInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '80',
      value: form.title,
      placeholder: 'Rueda exterior',
      'aria-label': 'Título del nodo',
    });
    titleInput.addEventListener('input', () => patchSelected({ title: titleInput.value }));
    titleInput.addEventListener('change', commitNow);

    const subtitleInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '120',
      value: form.subtitle,
      placeholder: 'Profundidad 12 yd · banda derecha',
      'aria-label': 'Subtítulo del nodo',
    });
    subtitleInput.addEventListener('input', () => patchSelected({ subtitle: subtitleInput.value }));
    subtitleInput.addEventListener('change', commitNow);

    const fields = h(
      'div',
      { class: 'tr-fields' },
      h('label', { class: 'tr-field tr-field-num' }, h('span', { class: 'lbl', text: 'Número' }), numberInput),
      h('label', { class: 'tr-field tr-field-title' }, h('span', { class: 'lbl', text: 'Título' }), titleInput),
      h(
        'label',
        { class: 'tr-field tr-field-wide' },
        h('span', { class: 'lbl', text: 'Subtítulo' }),
        subtitleInput
      )
    );
    scroll.append(fields);

    // --- Editor de ruta grande ---------------------------------------------
    scroll.append(
      group(
        h('span', { class: 'tr-group-title', text: 'Editor de ruta' }),
        h('span', { class: 'tr-group-note', text: '6 px/yd' }),
        buildRouteEditor(node)
      )
    );

    // --- Rutas --------------------------------------------------------------
    const routesGrid = h('div', {
      class: 'tr-routes',
      role: 'group',
      'aria-label': 'Plantillas de ruta',
    });
    // Primero las rutas propias del usuario, después las plantillas.
    const propias = customRoutes().map((r) => ({ ...r, builtin: false }));
    const disponibles = [...propias, ...ROUTES];
    if (propias.length) {
      routesGrid.append(
        h('div', { class: 'tr-routes-note', text: `Incluye tus ${propias.length} ruta${propias.length === 1 ? '' : 's'} de la sección Rutas` })
      );
    }
    for (const route of disponibles) {
      const active = node.routeId === route.id;
      const card = h(
        'button',
        {
          class: `tr-route-card${active ? ' is-active' : ''}`,
          type: 'button',
          title: route.builtin === false ? `${route.name} (ruta propia)` : route.desc || route.name,
          'aria-label': `Ruta ${route.name}`,
          'aria-pressed': active ? 'true' : 'false',
          dataset: { routeId: route.id },
        },
        h('span', { class: 'tr-route-thumb', html: routeCardThumb(route) }),
        h('span', { class: 'tr-route-name', text: route.name }),
        route.builtin === false ? h('span', { class: 'tr-route-badge', text: 'propia' }) : null
      );
      card.addEventListener('click', () => {
        const live = selectedNode();
        const nextRouteId = live && live.routeId === route.id ? null : route.id;
        patchSelected({ routeId: nextRouteId });
        rerenderPropsPreservingScroll();
        const focused = propsEl.querySelector(`.tr-route-card[data-route-id="${CSS.escape(route.id)}"]`);
        if (focused) focused.focus({ preventScroll: true });
      });
      propsRefs.routeCards.push(card);
      routesGrid.append(card);
    }
    scroll.append(
      group(
        h('span', { class: 'tr-group-title', text: 'Ruta' }),
        h('span', { class: 'tr-group-note', text: `${ROUTES.length} plantillas` }),
        routesGrid
      )
    );

    // --- Profundidad --------------------------------------------------------
    const depthValue = h('span', { class: 'tr-group-note mono', text: `${form.depth} yd` });
    const depthInput = h('input', {
      class: 'range',
      type: 'range',
      min: String(DEPTH_MIN),
      max: String(DEPTH_MAX),
      step: '1',
      value: String(form.depth),
      'aria-label': 'Profundidad del nodo en yardas',
    });
    depthInput.addEventListener('input', () => {
      const depth = clamp(Math.round(Number(depthInput.value) || 0), DEPTH_MIN, DEPTH_MAX);
      depthValue.textContent = `${depth} yd`;
      patchSelected({ depth });
    });
    depthInput.addEventListener('change', commitNow);
    scroll.append(
      group(
        h('span', { class: 'tr-group-title', text: 'Profundidad' }),
        depthValue,
        h(
          'div',
          { class: 'tr-depth' },
          depthInput,
          h(
            'div',
            { class: 'tr-depth-scale' },
            h('span', { text: '0' }),
            h('span', { text: '15' }),
            h('span', { text: '30 yd' })
          )
        )
      )
    );

    // --- Notas --------------------------------------------------------------
    const notes = h('textarea', {
      class: 'input tr-notes',
      rows: '3',
      placeholder: 'Lectura, condición, aviso…',
      'aria-label': 'Notas del nodo',
    });
    notes.value = form.notes;
    notes.addEventListener('input', () => patchSelected({ notes: notes.value }));
    notes.addEventListener('change', commitNow);
    scroll.append(group(h('span', { class: 'tr-group-title', text: 'Notas' }), notes));

    // --- Color --------------------------------------------------------------
    const swatchesEl = h('div', {
      class: 'tr-swatches',
      role: 'group',
      'aria-label': 'Color del nodo',
    });
    for (const swatch of COLOR_SWATCHES) {
      const active = form.color === swatch.value;
      const button = h('button', {
        class: `tr-swatch${active ? ' is-active' : ''}`,
        type: 'button',
        title: `Color ${swatch.label}`,
        'aria-label': `Color ${swatch.label}`,
        'aria-pressed': active ? 'true' : 'false',
        dataset: { color: swatch.value },
        style: `--tr-swatch:${swatch.value}`,
      });
      button.addEventListener('click', () => paintColor(swatch.value));
      propsRefs.swatches.push(button);
      swatchesEl.append(button);
    }
    const autoSwatch = h('button', {
      class: `tr-swatch tr-swatch-auto${form.color ? '' : ' is-active'}`,
      type: 'button',
      title: 'Color automático',
      'aria-label': 'Color automático',
      'aria-pressed': form.color ? 'false' : 'true',
      dataset: { color: '' },
      text: 'Auto',
    });
    autoSwatch.addEventListener('click', () => paintColor(null));
    propsRefs.swatches.push(autoSwatch);
    swatchesEl.append(autoSwatch);
    scroll.append(group(h('span', { class: 'tr-group-title', text: 'Color' }), swatchesEl));

    propsEl.append(header, scroll);
  }

  // ---------------------------- Editor de ruta grande ----------------------
  function bigRoutePoint(yd) {
    return {
      x: BIG_ROUTE_W / 2 + yd.x * BIG_ROUTE_SCALE,
      y: BIG_ROUTE_ORIGIN_Y - yd.y * BIG_ROUTE_SCALE,
    };
  }

  function bigRouteArrow(tip, prev) {
    const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
    const size = 9;
    const a1 = angle + Math.PI * 0.82;
    const a2 = angle - Math.PI * 0.82;
    const p1 = { x: tip.x + Math.cos(a1) * size, y: tip.y + Math.sin(a1) * size };
    const p2 = { x: tip.x + Math.cos(a2) * size, y: tip.y + Math.sin(a2) * size };
    return `<path class="tre-arrow" d="M ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} Z"/>`;
  }

  /** SVG del editor de ruta grande: rejilla, LOS, ruta, flecha y asas. */
  function bigRouteSVG(points) {
    const list = Array.isArray(points)
      ? points.filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
      : [];
    const W = BIG_ROUTE_W;
    const parts = [];
    parts.push(`<rect class="tre-bg" x="1" y="1" width="${W - 2}" height="${BIG_ROUTE_H - 2}" rx="8"/>`);
    parts.push(
      `<rect class="tre-area" data-big-area="1" x="1" y="1" width="${W - 2}" height="${BIG_ROUTE_H - 2}" fill="transparent"/>`
    );
    for (let yards = 5; yards <= 30; yards += 5) {
      const y = BIG_ROUTE_ORIGIN_Y - yards * BIG_ROUTE_SCALE;
      if (y < 16) break;
      parts.push(
        `<line class="tre-grid" x1="8" y1="${y.toFixed(1)}" x2="${W - 8}" y2="${y.toFixed(1)}"/>`
      );
      parts.push(`<text class="tre-grid-label" x="9" y="${(y - 3).toFixed(1)}">${yards}</text>`);
    }
    parts.push(
      `<line class="tre-los" x1="8" y1="${BIG_ROUTE_ORIGIN_Y}" x2="${W - 8}" y2="${BIG_ROUTE_ORIGIN_Y}"/>`
    );
    parts.push(
      `<text class="tre-los-label" x="${W - 10}" y="${BIG_ROUTE_ORIGIN_Y - 6}" text-anchor="end">LOS</text>`
    );
    const origin = bigRoutePoint({ x: 0, y: 0 });
    const svgPoints = [origin, ...list.map(bigRoutePoint)];
    if (list.length) {
      parts.push(
        `<polyline class="tre-line" points="${svgPoints
          .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
          .join(' ')}"/>`
      );
      if (svgPoints.length >= 2) parts.push(bigRouteArrow(svgPoints[svgPoints.length - 1], svgPoints[svgPoints.length - 2]));
    } else {
      parts.push(
        `<text class="tre-empty" x="${W / 2}" y="${BIG_ROUTE_ORIGIN_Y - 34}" text-anchor="middle">Toca la zona para añadir puntos</text>`
      );
    }
    parts.push(`<circle class="tre-origin" cx="${origin.x.toFixed(1)}" cy="${origin.y.toFixed(1)}" r="3.2"/>`);
    list.forEach((point, index) => {
      const p = bigRoutePoint(point);
      parts.push(
        `<circle class="tre-handle" data-big-handle="${index}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5.2"/>`
      );
    });
    return `<svg viewBox="0 0 ${W} ${BIG_ROUTE_H}" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
  }

  function mutateNodeRoute(mutator) {
    if (!selectedId) return;
    let next;
    try {
      next = mutator(current, selectedId);
    } catch {
      return;
    }
    if (!next) return;
    current = next;
    rerenderPropsPreservingScroll();
    schedulePreview();
    commitNow();
  }

  function deleteRoutePoint(index) {
    if (!selectedId) return;
    let points;
    try {
      points = nodeRouteYards(current, selectedId);
    } catch {
      return;
    }
    if (!Number.isFinite(index) || index < 0 || index >= points.length) return;
    // La ruta puede quedarse con un único punto, pero no con cero por borrado.
    if (points.length <= 1) return;
    mutateNodeRoute((tree, id) => setNodeRoute(tree, id, points.filter((_, i) => i !== index)));
  }

  function focusRouteTemplates() {
    const scrollEl = propsEl.querySelector('.tr-props-scroll');
    const routesGrid = propsEl.querySelector('.tr-routes');
    if (scrollEl && routesGrid) {
      const delta =
        routesGrid.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
      scrollEl.scrollTop += delta - 14;
    }
    const firstCard = propsEl.querySelector('.tr-route-card');
    if (firstCard) firstCard.focus({ preventScroll: true });
  }

  function buildRouteEditor(node) {
    const wrap = h('div', {
      class: 'tr-route-editor',
      role: 'group',
      'aria-label': `Editor de ruta de ${node.title || 'el nodo'}`,
    });
    if (node.color) wrap.style.setProperty('--tre-route', node.color);
    const canvas = h('div', { class: 'tr-route-editor-canvas' });
    const draw = (points) => {
      let live = points;
      if (!live) {
        try {
          live = nodeRouteYards(current, node.id);
        } catch {
          live = [];
        }
      }
      canvas.innerHTML = bigRouteSVG(live);
    };
    draw();
    const actions = h('div', { class: 'tr-route-editor-actions' });
    actions.append(
      h('button', {
        class: 'btn sm tr-re-btn',
        type: 'button',
        title: 'Limpiar la ruta del nodo',
        'aria-label': 'Limpiar la ruta del nodo',
        html: `${icon('trash', { size: 12 })}<span>Limpiar</span>`,
        onclick: () => mutateNodeRoute(clearNodeRoute),
      }),
      h('button', {
        class: 'btn sm tr-re-btn',
        type: 'button',
        title: 'Invertir la ruta en horizontal',
        'aria-label': 'Invertir la ruta en horizontal',
        html: `${icon('flip', { size: 12 })}<span>Invertir</span>`,
        onclick: () => mutateNodeRoute(mirrorNodeRoute),
      }),
      h('button', {
        class: 'btn sm tr-re-btn tr-re-btn-wide',
        type: 'button',
        title: 'Ir a las plantillas de ruta',
        'aria-label': 'Usar una plantilla de la rejilla',
        html: `${icon('layers', { size: 12 })}<span>Usar plantilla</span>`,
        onclick: focusRouteTemplates,
      })
    );
    attachRouteEditorEvents(canvas, node.id);
    wrap.append(canvas, actions);
    bigEditor = { nodeId: node.id, host: wrap, canvas, draw };
    return wrap;
  }

  function attachRouteEditorEvents(canvas, nodeId) {
    let session = null;

    const pointFromEvent = (event) => {
      const svg = canvas.querySelector('svg');
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const box = svg.viewBox && svg.viewBox.baseVal;
      const vw = box && box.width ? box.width : BIG_ROUTE_W;
      const vh = box && box.height ? box.height : BIG_ROUTE_H;
      const vx = box && box.width ? box.x : 0;
      const vy = box && box.height ? box.y : 0;
      return {
        x: vx + ((event.clientX - rect.left) / rect.width) * vw,
        y: vy + ((event.clientY - rect.top) / rect.height) * vh,
      };
    };

    const yardsFromEvent = (event) => {
      const pt = pointFromEvent(event);
      if (!pt) return null;
      return {
        x: (pt.x - BIG_ROUTE_W / 2) / BIG_ROUTE_SCALE,
        y: (BIG_ROUTE_ORIGIN_Y - pt.y) / BIG_ROUTE_SCALE,
      };
    };

    const livePoints = () => {
      try {
        return nodeRouteYards(current, nodeId).map((p) => ({ ...p }));
      } catch {
        return [];
      }
    };

    const begin = (event) => {
      if (!selectedId || selectedId !== nodeId) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const handleEl = event.target.closest?.('[data-big-handle]');
      const areaEl = event.target.closest?.('[data-big-area]');
      if (!handleEl && !areaEl) return;
      event.preventDefault();
      const points = livePoints();
      if (handleEl) {
        const index = Number(handleEl.getAttribute('data-big-handle'));
        if (event.altKey) {
          deleteRoutePoint(index);
          return;
        }
        if (!Number.isFinite(index) || index < 0 || index >= points.length) return;
        session = { index, points, pointerId: event.pointerId };
      } else {
        const yards = yardsFromEvent(event);
        if (!yards) return;
        session = { index: points.length, points: [...points, yards], pointerId: event.pointerId };
      }
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* captura no disponible (eventos sintéticos) */
      }
      canvas.innerHTML = bigRouteSVG(session.points);
    };

    const move = (event) => {
      if (!session) return;
      const yards = yardsFromEvent(event);
      if (!yards) return;
      event.preventDefault();
      session.points = session.points.map((p, i) => (i === session.index ? yards : p));
      canvas.innerHTML = bigRouteSVG(session.points);
      try {
        routePreviewTree = setNodeRoute(current, selectedId, session.points);
      } catch {
        routePreviewTree = null;
      }
      schedulePreview();
    };

    const finish = (event) => {
      if (!session) return;
      const points = session.points;
      session = null;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
      routePreviewTree = null;
      let next = null;
      try {
        next = setNodeRoute(current, selectedId, points);
      } catch {
        next = null;
      }
      if (next) current = next;
      rerenderPropsPreservingScroll();
      schedulePreview();
      commitNow();
    };

    const cancel = () => {
      if (!session) return;
      session = null;
      routePreviewTree = null;
      schedulePreview();
    };

    const onDoubleClick = (event) => {
      const handleEl = event.target.closest?.('[data-big-handle]');
      if (!handleEl) return;
      event.preventDefault();
      deleteRoutePoint(Number(handleEl.getAttribute('data-big-handle')));
    };

    canvas.addEventListener('pointerdown', begin);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('dblclick', onDoubleClick);
  }

  function rerenderPropsPreservingScroll() {
    const scrollEl = propsEl.querySelector('.tr-props-scroll');
    const top = scrollEl ? scrollEl.scrollTop : 0;
    renderProps();
    const next = propsEl.querySelector('.tr-props-scroll');
    if (next) next.scrollTop = top;
  }

  /**
   * Sección del panel de propiedades. La nota (opcional) vive en la cabecera:
   * `group(título, nota, cuerpo)` o `group(título, cuerpo)`.
   */
  function group(titleNode, noteOrBody, maybeBody) {
    let body = noteOrBody;
    const head = h('div', { class: 'tr-group-head' }, titleNode);
    if (noteOrBody && noteOrBody.classList && noteOrBody.classList.contains('tr-group-note')) {
      head.append(noteOrBody);
      body = maybeBody;
    }
    return h('section', { class: 'tr-group' }, head, body || null);
  }

  function paintColor(color) {
    patchSelected({ color: color || null });
    for (const swatch of propsRefs.swatches) {
      const value = swatch.dataset.color || null;
      const on = value === (color || null);
      swatch.classList.toggle('is-active', on);
      swatch.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function emptyProps() {
    return h(
      'div',
      { class: 'tr-empty' },
      h('span', { class: 'tr-empty-ic', html: icon('cursor', { size: 22 }) }),
      h('div', { class: 'tr-empty-title', text: 'Ningún nodo seleccionado' }),
      h(
        'p',
        { class: 'tr-empty-text' },
        'Elige un nodo en el esquema o en la vista previa para editar su número, su ruta y su profundidad.'
      ),
      h(
        'div',
        { class: 'tr-empty-hint' },
        h('span', { class: 'kbd', text: 'Esc' }),
        h('span', { text: ' cierra el editor' })
      )
    );
  }

  function nodePath(node) {
    const parts = [];
    let cursor = node;
    let guard = 0;
    while (cursor && guard < 40) {
      parts.unshift(String(cursor.number || cursor.title || '·'));
      cursor = cursor.parentId ? findNodeOf(current, cursor.parentId) : null;
      guard += 1;
    }
    return parts.join(' › ');
  }

  // ==========================================================================
  // Eventos globales
  // ==========================================================================
  function observeResize() {
    if (typeof ResizeObserver === 'function') {
      previewObserver = new ResizeObserver(() => schedulePreview());
      previewObserver.observe(previewEl);
    }
    window.addEventListener('resize', schedulePreview);
  }

  function onKeyDown(event) {
    if (destroyed) return;
    if (event.key === 'Escape') {
      if (typeof isMenuOpen === 'function' && isMenuOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      if (drag) {
        cancelPreviewDrag();
        return;
      }
      if (editRouteMode) {
        setEditRouteMode(false);
        return;
      }
      closeEditor();
      return;
    }    const target = event.target;
    const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable)) {
      return;
    }
    const inside = (target && shell.contains(target)) || target === document.body;
    if (!inside) return;
    switch (event.key) {
      case 'Delete':
        event.preventDefault();
        deleteSelected();
        break;
      case 'ArrowDown':
        event.preventDefault();
        stepSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        stepSelection(-1);
        break;
      case 'Home':
        event.preventDefault();
        stepSelection(-outlineIds().length);
        break;
      case 'End':
        event.preventDefault();
        stepSelection(outlineIds().length);
        break;
      case 'ArrowRight':
        event.preventDefault();
        selectFirstChild();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        selectParent();
        break;
      default:
        break;
    }
  }

  /**
   * Escape en fase de captura: el wrapper de la app también escucha Escape para
   * cerrar el editor. Si estamos arrastrando o en modo ruta, primero salimos
   * del modo sin cerrar la ventana.
   */
  function onEscapeCapture(event) {
    if (destroyed || event.key !== 'Escape') return;
    if (typeof isMenuOpen === 'function' && isMenuOpen()) return;
    if (typeof hasOpenModal === 'function' && hasOpenModal()) return;
    if (!drag && !editRouteMode) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag) cancelPreviewDrag();
    else setEditRouteMode(false);
  }

  // Cableado de controles estáticos
  nameInput.addEventListener('input', () => renameTree(nameInput.value));
  nameInput.addEventListener('change', commitNow);
  kindSelect.addEventListener('change', () => setKind(kindSelect.value));
  orientHorizontal.addEventListener('click', () => setOrientation('horizontal'));
  orientVertical.addEventListener('click', () => setOrientation('vertical'));
  presetButton.addEventListener('click', openPresets);
  newTreeButton.addEventListener('click', newTree);
  editRouteButton.addEventListener('click', toggleEditRoute);

  outlineEl.addEventListener('click', (event) => {
    const action = event.target.closest?.('[data-act]');
    if (action) {
      const id = action.dataset.nodeId;
      if (action.dataset.act === 'add') addChild(id);
      else if (action.dataset.act === 'remove') deleteNode(id);
      else if (action.dataset.act === 'up') reorderSibling(id, -1);
      else if (action.dataset.act === 'down') reorderSibling(id, 1);
      return;
    }
    const row = event.target.closest?.('[data-node-id]');
    if (row) selectNode(row.getAttribute('data-node-id'));
  });

  // Arrastrar y soltar filas del esquema: solo entre hermanos del mismo padre.
  let outlineDragId = null;
  const clearDropMarks = () => {
    outlineEl
      .querySelectorAll('.tr-row.is-drop-before, .tr-row.is-drop-after')
      .forEach((row) => row.classList.remove('is-drop-before', 'is-drop-after'));
  };
  const dropIndexFor = (draggedId, targetId, before) => {
    const dragged = findNodeOf(current, draggedId);
    const target = findNodeOf(current, targetId);
    if (!dragged || !target || dragged.id === target.id) return -1;
    if ((target.parentId || null) !== (dragged.parentId || null)) return -1;
    const siblings = siblingsOf(dragged.parentId).filter((node) => node.id !== draggedId);
    const hoverIndex = siblings.findIndex((node) => node.id === target.id);
    if (hoverIndex < 0) return -1;
    return hoverIndex + (before ? 0 : 1);
  };
  outlineEl.addEventListener('dragstart', (event) => {
    const row = event.target.closest?.('.tr-row');
    if (!row) return;
    const id = row.getAttribute('data-node-id');
    const node = findNodeOf(current, id);
    if (!node || !node.parentId) {
      event.preventDefault();
      return;
    }
    outlineDragId = id;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'move';
    }
    row.classList.add('is-dragging');
  });
  outlineEl.addEventListener('dragover', (event) => {
    if (!outlineDragId) return;
    const row = event.target.closest?.('.tr-row');
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    const index = dropIndexFor(outlineDragId, row.getAttribute('data-node-id'), before);
    if (index < 0) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    row.classList.add(before ? 'is-drop-before' : 'is-drop-after');
  });
  outlineEl.addEventListener('dragleave', (event) => {
    const row = event.target.closest?.('.tr-row');
    if (row) row.classList.remove('is-drop-before', 'is-drop-after');
  });
  outlineEl.addEventListener('drop', (event) => {
    const draggedId = outlineDragId;
    outlineDragId = null;
    const row = event.target.closest?.('.tr-row');
    if (!draggedId || !row) return;
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    const index = dropIndexFor(draggedId, row.getAttribute('data-node-id'), before);
    clearDropMarks();
    if (index < 0) return;
    let next = null;
    try {
      next = reorderNode(current, draggedId, index);
    } catch {
      return;
    }
    applyStructuralTree(next, draggedId, { focusRow: true });
  });
  outlineEl.addEventListener('dragend', () => {
    outlineDragId = null;
    clearDropMarks();
    outlineEl.querySelectorAll('.tr-row.is-dragging').forEach((row) => row.classList.remove('is-dragging'));
  });

  previewEl.addEventListener('pointerdown', onPreviewPointerDown);
  previewEl.addEventListener('pointermove', onPreviewPointerMove);
  previewEl.addEventListener('pointerup', finishPreviewDrag);
  previewEl.addEventListener('pointercancel', cancelPreviewDrag);
  previewEl.addEventListener('dblclick', (event) => {
    if (!editRouteMode) return;
    const handleEl = event.target.closest?.('[data-route-handle]');
    if (!handleEl) return;
    event.preventDefault();
    deleteRoutePoint(Number(handleEl.getAttribute('data-route-handle')));
  });

  /**
   * Selección por coordenadas: si `renderTreeSVG` no marca los nodos con
   * `data-node-id`, se traduce el clic al espacio del layout y se busca el
   * rectángulo que lo contiene. Es solo un respaldo: la vía normal es el
   * atributo del SVG.
   */
  function nodeAtPoint(clientX, clientY) {
    if (!previewLayout || !Array.isArray(previewLayout.nodes)) return null;
    const pt = clientToLayout(clientX, clientY);
    if (!pt) return null;
    const hit = previewLayout.nodes.find(
      (node) => pt.x >= node.x && pt.x <= node.x + node.w && pt.y >= node.y && pt.y <= node.y + node.h
    );
    return hit ? hit.id : null;
  }

  previewEl.addEventListener('click', (event) => {
    if (suppressPreviewClick) {
      suppressPreviewClick = false;
      return;
    }
    const hit = event.target.closest?.('[data-node-id]');
    if (hit) {
      selectNode(hit.getAttribute('data-node-id'));
      return;
    }
    const byPoint = nodeAtPoint(event.clientX, event.clientY);
    if (byPoint) {
      selectNode(byPoint);
      return;
    }
    selectNode(null);
  });

  document.addEventListener('keydown', onEscapeCapture, true);
  document.addEventListener('keydown', onKeyDown);

  // ==========================================================================
  // Ciclo de vida
  // ==========================================================================
  function render() {
    if (destroyed) return;
    syncControls();
    renderAll();
  }

  function setTree(tree) {
    if (destroyed) return;
    try {
      current = normalizeTree(tree);
    } catch {
      return;
    }
    selectedId = rootId(current);
    zoomMode = 'fit';
    syncControls();
    renderAll();
    if (isMobile()) setPanel('outline');
  }

  function getTree() {
    return current;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    drag = null;
    routePreviewTree = null;
    bigEditor = null;
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    document.removeEventListener('keydown', onEscapeCapture, true);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', schedulePreview);
    teardownMobile();
    if (previewObserver) {
      previewObserver.disconnect();
      previewObserver = null;
    }
    container.replaceChildren();
  }

  return { render, destroy, getTree, setTree };
}


