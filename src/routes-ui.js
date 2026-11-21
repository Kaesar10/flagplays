// ============================================================================
// FlagPlays · src/routes-ui.js — sección «Rutas»: biblioteca + editor
// ----------------------------------------------------------------------------
// Pantalla completa dentro de `root` (sin position:fixed). Tres zonas:
//   · izquierda: buscador, categorías y lista de todas las rutas (presets +
//     propias) con miniatura y acciones.
//   · centro: lienzo grande de edición punto a punto (8 px/yd ajustable).
//   · derecha: propiedades de la ruta seleccionada.
// Los cambios son locales hasta pulsar «Guardar»; entonces se persisten con
// store.actions.saveRoute / duplicateRoute / removeRoute.
//
// API: createRoutesEditor({ root, store, presets, onClose })
//        -> { render(), destroy() }
// ============================================================================
import { icon } from './icons.js';
import { h, toast, confirmDialog, isMenuOpen, hasOpenModal } from './ui.js';
import { createRoute, normalizeRoute } from './model.js';
import { renderNodeThumb } from './route-tree.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const MOBILE_QUERY = '(max-width: 900px)';
const PANELS = [
  { id: 'list', label: 'Rutas' },
  { id: 'editor', label: 'Editor' },
  { id: 'props', label: 'Propiedades' },
];
const FALLBACK_CATEGORIES = ['Corta', 'Media', 'Profunda', 'Carrera', 'Engaño'];
const FIELD_HALF = 18; // media anchura jugable en yardas
const FIELD_DEPTH = 24; // profundidad jugable en yardas
const MAX_POINTS = 16;
const SAVE_TOAST_MS = 220;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundYd(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function fmtYd(value) {
  return (Math.round((Number(value) || 0) * 10) / 10).toFixed(1).replace('.', ',');
}

function cloneRoute(route) {
  if (!route) return null;
  return {
    ...route,
    mirror: route.mirror === true,
    builtin: route.builtin === true,
    points: (Array.isArray(route.points) ? route.points : []).map((point) => ({
      x: roundYd(point && point.x),
      y: roundYd(point && point.y),
    })),
  };
}

function routeSignature(route) {
  if (!route) return '';
  return JSON.stringify({
    name: String(route.name || ''),
    category: String(route.category || ''),
    desc: String(route.desc || ''),
    mirror: route.mirror === true,
    points: (route.points || []).map((point) => [roundYd(point.x), roundYd(point.y)]),
  });
}

function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Mini SVG de respaldo si renderNodeThumb no puede dibujar la ruta. */
function fallbackThumb(points, width = 60, height = 36) {
  const pts = [{ x: 0, y: 0 }, ...(Array.isArray(points) ? points : [])].filter(
    (point) => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))
  );
  const xs = pts.map((point) => Number(point.x));
  const ys = pts.map((point) => Number(point.y));
  const minX = Math.min(...xs, 0) - 1;
  const maxX = Math.max(...xs, 0) + 1;
  const minY = Math.min(...ys, 0) - 1;
  const maxY = Math.max(...ys, 0) + 1;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - 8) / spanX, (height - 8) / spanY);
  const tx = (x) => 4 + (x - minX) * scale;
  const ty = (y) => height - 4 - (y - minY) * scale;
  const d = pts
    .map((point, index) => `${index ? 'L' : 'M'} ${tx(point.x).toFixed(1)} ${ty(point.y).toFixed(1)}`)
    .join(' ');
  return (
    `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">` +
    `<path d="${d}"/></svg>`
  );
}

function routeThumb(route) {
  try {
    const node = {
      routeId: route && route.builtin ? route.id : null,
      points: route && Array.isArray(route.points) ? route.points : [],
      color: null,
    };
    const svg = renderNodeThumb(node, {
      width: 60,
      height: 36,
      theme: 'dark',
      background: false,
      padding: 3,
    });
    if (svg && /<svg/i.test(svg)) return svg;
  } catch {
    /* respaldo local */
  }
  return fallbackThumb(route && route.points, 60, 36);
}

// ============================================================================
// Editor
// ============================================================================
export function createRoutesEditor(options = {}) {
  const container =
    typeof options.root === 'string' ? document.querySelector(options.root) : options.root;
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('createRoutesEditor: hace falta un contenedor «root» válido');
  }
  const store = options.store;
  const presets = options.presets && typeof options.presets === 'object' ? options.presets : {};
  const onClose = options.onClose;
  if (!store || typeof store.getCustomRoutes !== 'function' || !store.actions) {
    throw new Error('createRoutesEditor: store inválido (faltan getCustomRoutes/actions)');
  }

  // ---------- estado ----------
  let routes = [];
  let categories = [];
  let selectedId = null;
  let draft = null;
  let baseline = null;
  let isNew = false;
  let dirty = false;
  let saveState = 'saved'; // saved | dirty | saving
  let filterCategory = 'Todas';
  let search = '';
  let panel = 'list';
  let destroyed = false;
  let saveTimer = null;
  let drawQueued = false;
  let canvasInfo = null;
  let canvasDrag = null;
  let mobileQuery = null;
  let mobileHandler = null;
  let canvasObserver = null;
  let propActions = {};
  const panelButtons = {};

  // ---------- referencias ----------
  const shell = h('div', { class: 'rt-shell', role: 'region', 'aria-label': 'Editor de rutas' });
  const countEl = h('span', { class: 'rt-count mono', text: '0' });
  const saveStateEl = h('span', {
    class: 'rt-save-state',
    role: 'status',
    'aria-live': 'polite',
    text: 'Guardado',
  });
  const saveButton = h('button', {
    class: 'btn primary rt-save',
    type: 'button',
    'aria-label': 'Guardar los cambios de la ruta',
    html: `${icon('save', { size: 14 })}<span>Guardar</span>`,
  });
  const backButton = h('button', {
    class: 'btn ghost rt-back',
    type: 'button',
    'aria-label': 'Volver atrás',
    html: `${icon('chevron-left', { size: 15 })}<span>Volver</span>`,
  });
  const searchInput = h('input', {
    class: 'input rt-search-input',
    type: 'search',
    placeholder: 'Buscar ruta…',
    'aria-label': 'Buscar ruta por nombre, categoría o descripción',
    autocomplete: 'off',
  });
  const newButton = h('button', {
    class: 'btn rt-new',
    type: 'button',
    html: `${icon('plus', { size: 14 })}<span>Nueva ruta</span>`,
  });
  const chipsEl = h('div', { class: 'rt-chips', role: 'group', 'aria-label': 'Filtrar por categoría' });
  const listEl = h('div', { class: 'rt-list', role: 'listbox', 'aria-label': 'Lista de rutas' });
  const canvasTitleEl = h('div', { class: 'rt-canvas-title', text: 'Rutas' });
  const canvasSubEl = h('div', { class: 'rt-canvas-sub', text: '' });
  const metricsEl = h('div', { class: 'rt-metrics', 'aria-live': 'polite' });
  const canvasWrap = h('div', { class: 'rt-canvas' });
  const canvasSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  canvasSvg.setAttribute('class', 'rt-canvas-svg');
  canvasSvg.setAttribute('viewBox', '0 0 640 420');
  canvasSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  canvasSvg.setAttribute('role', 'img');
  canvasSvg.setAttribute('aria-label', 'Lienzo de edición de la ruta');
  canvasWrap.append(canvasSvg);
  const readOnlyOverlay = h(
    'div',
    { class: 'rt-readonly', hidden: true },
    
    
    h('button', {
      class: 'btn primary rt-readonly-btn',
      type: 'button',
      html: `${icon('copy', { size: 13 })}<span>Duplicar y editar</span>`,
    })
  );
  canvasWrap.append(readOnlyOverlay);
  const canvasHintEl = h('div', {
    class: 'rt-canvas-hint',
    text: 'Arrastra los puntos · clic en la zona añade · Alt+clic o doble clic borra',
  });
  /** Aviso destacado cuando la ruta existe pero no tiene recorrido. */
  function updateCanvasHint() {
    const vacia = draft && !draft.builtin && !hasTravel(draft.points);
    canvasHintEl.textContent = vacia
      ? 'Sin recorrido: arrastra un punto para dibujarla'
      : 'Arrastra los puntos · clic en la zona añade · Alt+clic o doble clic borra';
    canvasHintEl.classList.toggle('is-warning', !!vacia);
  }
  const propsEl = h('aside', { class: 'rt-props', id: 'rt-panel-props', 'aria-label': 'Propiedades de la ruta' });
  const tabsEl = h('nav', { class: 'rt-tabs', role: 'tablist', 'aria-label': 'Paneles del editor de rutas' });
  for (const def of PANELS) {
    const button = h('button', {
      class: 'rt-tab',
      type: 'button',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': `rt-panel-${def.id}`,
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

  buildShell();
  container.replaceChildren(shell);
  setupMobile();
  refreshRoutes();
  ensureSelection();
  renderAll();
  observeCanvas();
  setPanel(panel);
  document.addEventListener('keydown', onKeyDownCapture, true);
  saveButton.addEventListener('click', saveCurrent);
  backButton.addEventListener('click', tryClose);
  newButton.addEventListener('click', createNewRoute);
  readOnlyOverlay.querySelector('.rt-readonly-btn').addEventListener('click', duplicateCurrent);
  searchInput.addEventListener('input', () => {
    search = searchInput.value;
    renderList();
  });
  listEl.addEventListener('keydown', (event) => {
    const current = event.target.closest?.('.rt-row');
    if (!current) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const rows = Array.from(listEl.querySelectorAll('.rt-row'));
      const index = rows.indexOf(current);
      const next = rows[clamp(index + (event.key === 'ArrowDown' ? 1 : -1), 0, rows.length - 1)];
      if (next && next !== current) {
        event.preventDefault();
        next.focus();
      }
    }
  });
  attachCanvasEvents();

  // ==========================================================================
  // Construcción del armazón
  // ==========================================================================
  function buildShell() {
    const topbar = h(
      'header',
      { class: 'rt-top' },
      backButton,
      h(
        'div',
        { class: 'rt-ident' },
        h('h1', { class: 'rt-title', text: 'Rutas' }),
        countEl
      ),
      saveStateEl,
      h('span', { class: 'rt-top-spacer' }),
      saveButton
    );

    const side = h(
      'aside',
      { class: 'rt-side', id: 'rt-panel-list', 'aria-label': 'Biblioteca de rutas' },
      h(
        'div',
        { class: 'rt-side-head' },
        h('div', { class: 'rt-search' }, searchInput),
        newButton,
        chipsEl
      ),
      h('div', { class: 'rt-side-title' }, h('span', { class: 'rt-side-titletext', text: 'Todas las rutas' })),
      listEl
    );

    const stage = h(
      'main',
      { class: 'rt-stage', id: 'rt-panel-editor', 'aria-label': 'Editor de la ruta' },
      h(
        'div',
        { class: 'rt-canvas-head' },
        h('div', { class: 'rt-canvas-titles' }, canvasTitleEl, canvasSubEl),
        metricsEl
      ),
      canvasWrap,
      canvasHintEl
    );

    shell.append(topbar, tabsEl, h('div', { class: 'rt-body' }, side, stage, propsEl));
  }

  // ==========================================================================
  // Datos
  // ==========================================================================
  function refreshRoutes() {
    const presetRoutes = Array.isArray(presets.ROUTES) ? presets.ROUTES : [];
    const customRoutes = typeof store.getCustomRoutes === 'function' ? store.getCustomRoutes() || [] : [];
    // Primero las rutas propias (las usa el entrenador a diario) y después la
    // biblioteca de plantillas.
    routes = [
      ...customRoutes.map((route) => ({ ...route, builtin: false, points: cloneRoutePoints(route.points) })),
      ...presetRoutes.map((route) => ({ ...route, builtin: true, points: cloneRoutePoints(route.points) })),
    ];
    const baseCategories =
      Array.isArray(presets.ROUTE_CATEGORIES) && presets.ROUTE_CATEGORIES.length
        ? presets.ROUTE_CATEGORIES
        : FALLBACK_CATEGORIES;
    const extra = [];
    for (const route of routes) {
      const category = String(route.category || '').trim();
      if (category && !baseCategories.includes(category) && !extra.includes(category)) extra.push(category);
    }
    categories = [...baseCategories, ...extra];
  }

  function cloneRoutePoints(points) {
    return (Array.isArray(points) ? points : []).map((point) => ({
      x: roundYd(point && point.x),
      y: roundYd(point && point.y),
    }));
  }

  function ensureSelection() {
    if (draft && routes.some((route) => route.id === draft.id)) return;
    if (draft && isNew) return;
    const first = routes[0] || null;
    selectedId = first ? first.id : null;
    draft = first ? cloneRoute(first) : null;
    baseline = first ? cloneRoute(first) : null;
    isNew = false;
    dirty = false;
    saveState = 'saved';
  }

  function selectedRoute() {
    return routes.find((route) => route.id === selectedId) || null;
  }

  function isEditable() {
    return !!draft && draft.builtin !== true;
  }

  function isDirty() {
    return isNew || (!!draft && routeSignature(draft) !== routeSignature(baseline));
  }

  function filteredRoutes() {
    const term = fold(search);
    return routes.filter((route) => {
      if (filterCategory !== 'Todas' && route.category !== filterCategory) return false;
      if (!term) return true;
      return (
        fold(route.name).includes(term) ||
        fold(route.category).includes(term) ||
        fold(route.desc).includes(term)
      );
    });
  }

  function uniqueName(base) {
    const names = new Set(routes.map((route) => route.name));
    if (!names.has(base)) return base;
    let index = 2;
    while (names.has(`${base} (${index})`)) index += 1;
    return `${base} (${index})`;
  }

  // ==========================================================================
  // Selección y ciclo de guardado
  // ==========================================================================
  async function confirmDiscard() {
    if (!isDirty()) return true;
    return confirmDialog({
      title: 'Cambios sin guardar',
      message: 'Hay cambios en la ruta que no se han guardado. ¿Salir sin guardarlos?',
      confirmLabel: 'Salir sin guardar',
    });
  }

  function loadRoute(route, opts = {}) {
    const source = cloneRoute(route);
    selectedId = source.id;
    draft = cloneRoute(source);
    baseline = cloneRoute(source);
    isNew = opts.isNew === true;
    dirty = isNew;
    saveState = dirty ? 'dirty' : 'saved';
    renderAll();
    if (isMobile()) setPanel('editor');
  }

  async function selectRoute(id, opts = {}) {
    if (!id || id === selectedId) return;
    const route = routes.find((item) => item.id === id);
    if (!route) return;
    if (!opts.force && isDirty()) {
      const ok = await confirmDiscard();
      if (!ok || destroyed) return;
    }
    loadRoute(route);
  }

  async function createNewRoute() {
    if (!(await confirmDiscard()) || destroyed) return;
    const name = uniqueName('Ruta nueva');
    const category = filterCategory !== 'Todas' ? filterCategory : 'Corta';
    const route = createRoute({
      name,
      category,
      desc: '',
      mirror: false,
      points: [
        { x: 0, y: 5 },
        { x: 6, y: 11 },
      ],
    });
    selectedId = route.id;
    draft = cloneRoute(route);
    baseline = cloneRoute(route);
    isNew = true;
    dirty = true;
    saveState = 'dirty';
    filterCategory = 'Todas';
    search = '';
    searchInput.value = '';
    refreshRoutes();
    renderAll();
    if (isMobile()) setPanel('editor');
    const nameInput = propsEl.querySelector('[data-field="name"]');
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }

  function setSaveState(next) {
    saveState = next;
    renderSaveState();
  }

  function markDirty() {
    const next = isDirty();
    if (next === dirty) {
      renderSaveState();
      return;
    }
    dirty = next;
    saveState = dirty ? 'dirty' : 'saved';
    renderSaveState();
  }

  /** ¿La ruta tiene recorrido real? (si no, es un punto suelto en la línea) */
  function hasTravel(points) {
    const list = Array.isArray(points) ? points : [];
    if (list.length < 1) return false;
    return list.some((p) => Math.abs(Number(p.x) || 0) > 0.4 || Math.abs(Number(p.y) || 0) > 0.8);
  }

  function saveCurrent() {
    if (!draft) return;
    if (draft.builtin) {
      toast('Duplica la plantilla para guardarla como ruta propia', 'info', 2000);
      return;
    }
    if (!hasTravel(draft.points)) {
      toast('La ruta no tiene recorrido: arrastra los puntos para dibujarla antes de guardar', 'error', 3800);
      return;
    }
    if (!isDirty()) {
      setSaveState('saved');
      return;
    }
    let saved = null;
    try {
      saved = store.actions.saveRoute(cloneRoute({ ...draft, builtin: false }));
    } catch (error) {
      console.error('[rutas] saveRoute', error);
      toast('No se pudo guardar la ruta', 'error');
      return;
    }
    if (!saved) {
      toast('No se pudo guardar la ruta', 'error');
      return;
    }
    const normalized = normalizeRoute(saved) || saved;
    selectedId = normalized.id;
    draft = cloneRoute({ ...normalized, builtin: false });
    baseline = cloneRoute({ ...normalized, builtin: false });
    isNew = false;
    dirty = false;
    saveState = 'saving';
    refreshRoutes();
    renderAll();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (destroyed) return;
      saveState = 'saved';
      renderSaveState();
    }, 640);
  }

  function revertCurrent() {
    if (!draft || draft.builtin) return;
    draft = cloneRoute(baseline);
    dirty = isDirty();
    saveState = dirty ? 'dirty' : 'saved';
    renderAll();
  }

  async function duplicateCurrent() {
    if (!draft) return;
    let copy = null;
    try {
      copy = store.actions.duplicateRoute(cloneRoute({ ...draft, builtin: false }), ' (copia)');
    } catch (error) {
      console.error('[rutas] duplicateRoute', error);
    }
    if (!copy) {
      toast('No se pudo duplicar la ruta', 'error');
      return;
    }
    refreshRoutes();
    const found = routes.find((route) => route.id === copy.id) || { ...copy, builtin: false };
    selectedId = found.id;
    draft = cloneRoute({ ...found, builtin: false });
    baseline = cloneRoute({ ...found, builtin: false });
    isNew = false;
    dirty = false;
    saveState = 'saved';
    renderAll();
    if (isMobile()) setPanel('editor');
    toast('Ruta duplicada', 'ok', 1500);
  }

  async function duplicateById(id) {
    const route = routes.find((item) => item.id === id);
    if (!route) return;
    if (isDirty() && id !== selectedId) {
      const ok = await confirmDiscard();
      if (!ok || destroyed) return;
    }
    let copy = null;
    try {
      copy = store.actions.duplicateRoute(cloneRoute(route), ' (copia)');
    } catch (error) {
      console.error('[rutas] duplicateRoute', error);
    }
    if (!copy) {
      toast('No se pudo duplicar la ruta', 'error');
      return;
    }
    refreshRoutes();
    const found = routes.find((item) => item.id === copy.id) || { ...copy, builtin: false };
    selectedId = found.id;
    draft = cloneRoute({ ...found, builtin: false });
    baseline = cloneRoute({ ...found, builtin: false });
    isNew = false;
    dirty = false;
    saveState = 'saved';
    renderAll();
    if (isMobile()) setPanel('editor');
    toast('Ruta duplicada', 'ok', 1400);
  }

  async function removeById(id) {
    const route = routes.find((item) => item.id === id);
    if (!route) {
      // Ruta nueva todavía sin guardar: el botón Eliminar la descarta.
      if (isNew && selectedId === id) {
        selectedId = null;
        draft = null;
        baseline = null;
        isNew = false;
        dirty = false;
        saveState = 'saved';
        ensureSelection();
        renderAll();
        toast('Ruta descartada', 'info', 1400);
      }
      return;
    }
    if (route.builtin) return;
    const ok = await confirmDialog({
      title: 'Eliminar ruta',
      message: `¿Eliminar «${route.name}»? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok || destroyed) return;
    try {
      store.actions.removeRoute(id);
    } catch (error) {
      console.error('[rutas] removeRoute', error);
      toast('No se pudo eliminar la ruta', 'error');
      return;
    }
    refreshRoutes();
    const wasSelected = selectedId === id;
    if (wasSelected) {
      const next = routes.find((item) => !item.builtin) || routes[0] || null;
      selectedId = next ? next.id : null;
      draft = next ? cloneRoute(next) : null;
      baseline = next ? cloneRoute(next) : null;
      isNew = false;
      dirty = false;
      saveState = 'saved';
    }
    renderAll();
    toast('Ruta eliminada', 'info', 1400);
  }

  async function tryClose() {
    if (!(await confirmDiscard()) || destroyed) return;
    if (typeof onClose === 'function') onClose();
  }

  // ==========================================================================
  // Render general
  // ==========================================================================
  function renderAll() {
    if (!draft && routes.length) ensureSelection();
    renderTopbar();
    renderChips();
    renderList();
    renderCanvasPanel();
    renderProps();
  }

  function renderTopbar() {
    countEl.textContent = String(routes.length);
    renderSaveState();
  }

  function renderSaveState() {
    if (typeof updateCanvasHint === 'function') updateCanvasHint();
    const labels = { saved: 'Guardado', dirty: 'Sin guardar', saving: 'Guardando…' };
    saveStateEl.textContent = labels[saveState] || 'Guardado';
    saveStateEl.classList.toggle('is-dirty', saveState === 'dirty');
    saveStateEl.classList.toggle('is-saving', saveState === 'saving');
    saveStateEl.classList.toggle('is-saved', saveState === 'saved');
    saveButton.disabled = !draft || draft.builtin || saveState === 'saving' || !dirty;
    if (propActions.save) {
      propActions.save.disabled = !draft || draft.builtin || saveState === 'saving' || !dirty;
    }
    if (propActions.revert) {
      propActions.revert.disabled = !draft || draft.builtin || !dirty;
    }
  }

  function renderChips() {
    const items = [{ id: 'Todas', label: 'Todas' }, ...categories.map((category) => ({ id: category, label: category }))];
    chipsEl.replaceChildren(
      ...items.map((item) => {
        const active = filterCategory === item.id;
        return h('button', {
          class: `chip rt-chip${active ? ' is-active' : ''}`,
          type: 'button',
          'aria-pressed': active ? 'true' : 'false',
          text: item.label,
          dataset: { category: item.id },
          onclick: () => {
            filterCategory = item.id;
            renderChips();
            renderList();
          },
        });
      })
    );
  }

  function buildRow(route) {
    const selected = route.id === selectedId;
    const row = h('div', {
      class: `rt-row${selected ? ' is-active' : ''}`,
      role: 'option',
      'aria-selected': selected ? 'true' : 'false',
      'aria-label': `${route.name}${route.builtin ? ' (plantilla)' : ' (propia)'}`,
      tabindex: selected ? '0' : '-1',
      dataset: { routeId: route.id, category: route.category || '' },
    });
    const main = h(
      'button',
      {
        class: 'rt-row-main',
        type: 'button',
        tabindex: '-1',
        'aria-label': `Seleccionar ${route.name}`,
      },
      h('span', { class: 'rt-thumb', html: routeThumb(route) }),
      h(
        'span',
        { class: 'rt-row-text' },
        h('span', { class: 'rt-row-name', text: route.name }),
        h(
          'span',
          { class: 'rt-row-meta' },
          h('span', { text: route.category || 'Sin categoría' }),
          h('span', { class: 'rt-dot', 'aria-hidden': 'true' }),
          route.builtin
            ? h('span', { class: 'rt-tag', text: 'plantilla' })
            : h('span', { class: 'rt-tag rt-tag-own', text: 'propia' })
        )
      )
    );
    main.addEventListener('click', () => {
      void selectRoute(route.id);
    });
    row.append(main);
    const acts = h('span', { class: 'rt-row-acts' });
    const duplicateButton = h('button', {
      class: 'rt-act',
      type: 'button',
      title: `Duplicar ${route.name}`,
      'aria-label': `Duplicar ${route.name}`,
      html: icon('copy', { size: 13 }),
      dataset: { action: 'duplicate', routeId: route.id },
    });
    duplicateButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (route.id === selectedId) void duplicateCurrent();
      else void duplicateById(route.id);
    });
    acts.append(duplicateButton);
    if (!route.builtin) {
      const removeButton = h('button', {
        class: 'rt-act rt-act-del',
        type: 'button',
        title: `Eliminar ${route.name}`,
        'aria-label': `Eliminar ${route.name}`,
        html: icon('trash', { size: 13 }),
        dataset: { action: 'remove', routeId: route.id },
      });
      removeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        void removeById(route.id);
      });
      acts.append(removeButton);
    }
    row.append(acts);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('.rt-act')) return;
      event.preventDefault();
      void selectRoute(route.id);
    });
    row.addEventListener('dblclick', (event) => {
      if (event.target.closest('.rt-act')) return;
      void selectRoute(route.id);
    });
    return row;
  }

  function renderList() {
    const list = filteredRoutes();
    if (!list.length) {
      listEl.replaceChildren(
        h(
          'div',
          { class: 'rt-empty' },
          h('span', { class: 'rt-empty-title', text: 'Sin resultados' }),
          h('span', { class: 'rt-empty-text', text: 'Prueba con otra búsqueda o categoría.' })
        )
      );
      return;
    }
    listEl.replaceChildren(...list.map(buildRow));
  }

  // ==========================================================================
  // Lienzo
  // ==========================================================================
  function renderCanvasPanel() {
    const route = draft;
    const builtin = !!route && route.builtin === true;
    canvasTitleEl.textContent = route ? route.name : 'Sin ruta';
    canvasSubEl.textContent = route
      ? `${route.category || 'Sin categoría'}`
      : 'Selecciona o crea una ruta';
    readOnlyOverlay.hidden = !builtin;
    canvasWrap.classList.toggle('is-readonly', builtin);
    canvasHintEl.hidden = builtin || !route;
    updateMetrics();
    drawCanvas();
  }

  function routeMetrics(points) {
    const list = Array.isArray(points) ? points : [];
    let depth = 0;
    let length = 0;
    let prev = { x: 0, y: 0 };
    for (const point of list) {
      const current = { x: Number(point.x) || 0, y: Number(point.y) || 0 };
      depth = Math.max(depth, current.y);
      length += Math.hypot(current.x - prev.x, current.y - prev.y);
      prev = current;
    }
    return { depth, length, count: list.length };
  }

  function updateMetrics() {
    if (!draft) {
      metricsEl.replaceChildren();
      return;
    }
    const metrics = routeMetrics(draft.points);
    metricsEl.replaceChildren(
      h('span', { class: 'rt-metric' }, 'Profundidad ', h('b', { class: 'mono', text: `${fmtYd(metrics.depth)} yd` })),
      h('span', { class: 'rt-metric' }, 'Longitud ', h('b', { class: 'mono', text: `${fmtYd(metrics.length)} yd` })),
      h('span', { class: 'rt-metric' }, h('b', { class: 'mono', text: String(metrics.count) }), ' puntos')
    );
  }

  function canvasSize() {
    const rect = canvasWrap.getBoundingClientRect();
    const width = rect.width >= 200 ? rect.width : 640;
    const height = rect.height >= 160 ? rect.height : 420;
    return { width: Math.round(width), height: Math.round(height) };
  }

  function canvasGeometry(width, height) {
    const padX = 28;
    const padTop = 18;
    let scale = Math.min(
      Math.max(120, width - padX * 2) / (FIELD_HALF * 2),
      Math.max(80, height - padTop - 34) / FIELD_DEPTH
    );
    scale = clamp(scale, 3, 30);
    // Centra el campo en vertical dejando sitio para el rótulo LOS.
    const depthPx = FIELD_DEPTH * scale;
    const bottomPad = Math.max(34, (height - depthPx) / 2);
    const origin = { x: width / 2, y: height - bottomPad };
    return { width, height, origin, scale, padX, padTop, bottomPad };
  }

  function svgPoint(geometry, point) {
    return {
      x: geometry.origin.x + (Number(point.x) || 0) * geometry.scale,
      y: geometry.origin.y - (Number(point.y) || 0) * geometry.scale,
    };
  }

  function arrowMarkup(tip, prev) {
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Punta por delante del punto: el asa tapa la base de la flecha.
    const head = { x: tip.x + ux * 15, y: tip.y + uy * 15 };
    const left = { x: tip.x - uy * 6, y: tip.y + ux * 6 };
    const right = { x: tip.x + uy * 6, y: tip.y - ux * 6 };
    return `M ${left.x.toFixed(1)} ${left.y.toFixed(1)} L ${head.x.toFixed(1)} ${head.y.toFixed(1)} L ${right.x.toFixed(1)} ${right.y.toFixed(1)} Z`;
  }

  function drawCanvas() {
    if (destroyed || !canvasSvg) return;
    const { width, height } = canvasSize();
    const geometry = canvasGeometry(width, height);
    canvasInfo = geometry;
    const editable = isEditable();
    const points = draft && Array.isArray(draft.points) ? draft.points : [];
    const origin = geometry.origin;
    const svgPoints = points.map((point) => svgPoint(geometry, point));
    const all = [origin, ...svgPoints];
    const parts = [];

    parts.push(
      `<rect x="0" y="0" width="${width}" height="${height}" fill="#070d10"/>`
    );
    if (editable) {
      parts.push(
        `<rect data-rt-area="1" x="0" y="0" width="${width}" height="${height}" fill="transparent" style="cursor:crosshair"/>`
      );
    }
    // Rejilla cada 5 yardas + línea de scrimmage.
    for (let yards = 5; yards <= FIELD_DEPTH + 2; yards += 5) {
      const y = origin.y - yards * geometry.scale;
      if (y < geometry.padTop - 6) break;
      parts.push(
        `<line class="rt-grid-line" x1="${geometry.padX - 10}" y1="${y.toFixed(1)}" x2="${width - geometry.padX + 10}" y2="${y.toFixed(1)}"/>`
      );
      parts.push(
        `<text class="rt-grid-label" x="${geometry.padX - 14}" y="${(y + 3).toFixed(1)}" text-anchor="end">${yards}</text>`
      );
    }
    // Líneas verticales cada 5 yardas (laterales), de la línea de fondo al LOS.
    const depthPx = FIELD_DEPTH * geometry.scale;
    for (let lateral = 5; lateral < FIELD_HALF; lateral += 5) {
      for (const sign of [-1, 1]) {
        const x = origin.x + sign * lateral * geometry.scale;
        parts.push(
          `<line class="rt-grid-line" x1="${x.toFixed(1)}" y1="${(origin.y - depthPx).toFixed(1)}" x2="${x.toFixed(1)}" y2="${origin.y}"/>`
        );
      }
    }
    parts.push(
      `<line class="rt-sideline" x1="${(origin.x - FIELD_HALF * geometry.scale).toFixed(1)}" y1="${(origin.y - depthPx).toFixed(1)}" x2="${(origin.x - FIELD_HALF * geometry.scale).toFixed(1)}" y2="${origin.y}"/>`
    );
    parts.push(
      `<line class="rt-sideline" x1="${(origin.x + FIELD_HALF * geometry.scale).toFixed(1)}" y1="${(origin.y - depthPx).toFixed(1)}" x2="${(origin.x + FIELD_HALF * geometry.scale).toFixed(1)}" y2="${origin.y}"/>`
    );
    parts.push(
      `<line class="rt-field-line" x1="${origin.x}" y1="${geometry.padTop}" x2="${origin.x}" y2="${origin.y}"/>`
    );
    parts.push(
      `<line class="rt-los" x1="${geometry.padX - 10}" y1="${origin.y}" x2="${width - geometry.padX + 10}" y2="${origin.y}"/>`
    );
    parts.push(
      `<text class="rt-los-label" x="${width - geometry.padX + 10}" y="${geometry.origin.y - 6}" text-anchor="end">LOS</text>`
    );
    // Ruta.
    if (all.length >= 2) {
      parts.push(
        `<polyline class="rt-route-line" points="${all
          .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
          .join(' ')}"/>`
      );
      parts.push(
        `<path class="rt-route-arrow" d="${arrowMarkup(all[all.length - 1], all[all.length - 2])}"/>`
      );
    }
    parts.push(`<circle class="rt-origin" cx="${origin.x}" cy="${origin.y}" r="3.6"/>`);
    if (!points.length) {
      parts.push(
        `<text class="rt-canvas-empty" x="${width / 2}" y="${geometry.padTop + 28}" text-anchor="middle">Toca el lienzo para empezar la ruta</text>`
      );
    }
    if (editable) {
      points.forEach((point, index) => {
        const svg = svgPoints[index];
        parts.push(
          `<circle class="rt-handle" data-rt-handle="${index}" cx="${svg.x.toFixed(1)}" cy="${svg.y.toFixed(1)}" r="6.5"/>`
        );
      });
    }
    canvasSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    canvasSvg.innerHTML = parts.join('');
  }

  function scheduleDraw() {
    if (drawQueued || destroyed) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      if (!destroyed) drawCanvas();
    });
  }

  function observeCanvas() {
    if (typeof ResizeObserver === 'function') {
      canvasObserver = new ResizeObserver(() => scheduleDraw());
      canvasObserver.observe(canvasWrap);
    }
    window.addEventListener('resize', scheduleDraw);
  }

  // ------------------------------ Gestos del lienzo -------------------------
  function canvasYardsFromEvent(event) {
    if (!canvasInfo) return null;
    const rect = canvasSvg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const box = canvasSvg.viewBox && canvasSvg.viewBox.baseVal;
    const viewW = box && box.width ? box.width : canvasInfo.width;
    const viewH = box && box.height ? box.height : canvasInfo.height;
    const x = (box && box.width ? box.x : 0) + ((event.clientX - rect.left) / rect.width) * viewW;
    const y = (box && box.height ? box.y : 0) + ((event.clientY - rect.top) / rect.height) * viewH;
    return {
      x: roundYd(clamp((x - canvasInfo.origin.x) / canvasInfo.scale, -FIELD_HALF, FIELD_HALF)),
      y: roundYd(clamp((canvasInfo.origin.y - y) / canvasInfo.scale, 0, FIELD_DEPTH)),
    };
  }

  function deletePoint(index) {
    if (!isEditable() || !draft) return;
    const points = Array.isArray(draft.points) ? draft.points : [];
    if (!Number.isFinite(index) || index < 0 || index >= points.length) return;
    if (points.length <= 1) return;
    draft.points = points.filter((_, position) => position !== index);
    markDirty();
    drawCanvas();
    updateMetrics();
  }

  function attachCanvasEvents() {
    canvasWrap.addEventListener('pointerdown', (event) => {
      if (!draft) return;
      if (draft.builtin) {
        if (event.target.closest?.('[data-rt-handle]')) {
          toast('Duplica la plantilla para editar sus puntos', 'info', 1900);
        }
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const handleEl = event.target.closest?.('[data-rt-handle]');
      const areaEl = event.target.closest?.('[data-rt-area]');
      if (!handleEl && !areaEl) return;
      event.preventDefault();
      const points = (draft.points || []).map((point) => ({ ...point }));
      if (handleEl) {
        const index = Number(handleEl.getAttribute('data-rt-handle'));
        if (event.altKey) {
          deletePoint(index);
          return;
        }
        if (!Number.isFinite(index) || index < 0 || index >= points.length) return;
        canvasDrag = {
          index,
          points,
          startPoints: points.map((point) => ({ ...point })),
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
      } else {
        if (points.length >= MAX_POINTS) {
          toast(`Máximo ${MAX_POINTS} puntos por ruta`, 'info', 1800);
          return;
        }
        const yards = canvasYardsFromEvent(event);
        if (!yards) return;
        points.push(yards);
        canvasDrag = {
          index: points.length - 1,
          points,
          startPoints: points.slice(0, -1).map((point) => ({ ...point })),
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
      }
      try {
        canvasWrap.setPointerCapture(event.pointerId);
      } catch {
        /* eventos sintéticos sin captura */
      }
      canvasWrap.classList.add('is-dragging');
      draft.points = points.map((point) => ({ ...point }));
      drawCanvas();
      updateMetrics();
    });

    canvasWrap.addEventListener('pointermove', (event) => {
      if (!canvasDrag || event.pointerId !== canvasDrag.pointerId) return;
      const dx = event.clientX - canvasDrag.startX;
      const dy = event.clientY - canvasDrag.startY;
      if (!canvasDrag.moved && Math.hypot(dx, dy) < 4) return;
      canvasDrag.moved = true;
      const yards = canvasYardsFromEvent(event);
      if (!yards) return;
      event.preventDefault();
      canvasDrag.points = canvasDrag.points.map((point, index) =>
        index === canvasDrag.index ? yards : point
      );
      if (!draft) return;
      draft.points = canvasDrag.points.map((point) => ({ ...point }));
      drawCanvas();
      updateMetrics();
      markDirty();
    });

    const finishDrag = (event) => {
      if (!canvasDrag || event.pointerId !== canvasDrag.pointerId) return;
      const moved = canvasDrag.moved;
      canvasDrag = null;
      canvasWrap.classList.remove('is-dragging');
      try {
        canvasWrap.releasePointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
      markDirty();
      updateMetrics();
      drawCanvas();
      if (moved) renderSaveState();
    };

    canvasWrap.addEventListener('pointerup', finishDrag);
    canvasWrap.addEventListener('pointercancel', (event) => {
      if (!canvasDrag || event.pointerId !== canvasDrag.pointerId) return;
      canvasDrag = null;
      canvasWrap.classList.remove('is-dragging');
      if (draft) draft.points = (baseline && baseline.points ? baseline.points : []).map((p) => ({ ...p }));
      drawCanvas();
      updateMetrics();
    });
    canvasWrap.addEventListener('dblclick', (event) => {
      const handleEl = event.target.closest?.('[data-rt-handle]');
      if (!handleEl || !isEditable()) return;
      event.preventDefault();
      deletePoint(Number(handleEl.getAttribute('data-rt-handle')));
    });
  }

  // ==========================================================================
  // Propiedades
  // ==========================================================================
  function renderProps() {
    propActions = {};
    propsEl.replaceChildren();
    if (!draft) {
      propsEl.append(
        h(
          'div',
          { class: 'rt-empty' },
          h('span', { class: 'rt-empty-ic', html: icon('route', { size: 22 }) }),
          h('span', { class: 'rt-empty-title', text: 'Ninguna ruta seleccionada' }),
          h('span', { class: 'rt-empty-text', text: 'Elige una ruta de la lista o crea una nueva.' })
        )
      );
      return;
    }
    const builtin = draft.builtin === true;
    const header = h(
      'header',
      { class: 'rt-props-head' },
      h(
        'div',
        { class: 'rt-props-headtext' },
        h('div', { class: 'rt-props-title', text: 'Propiedades de la ruta' }),
        h('div', { class: 'rt-props-sub', text: builtin ? 'Plantilla · solo lectura' : 'Ruta propia · editable' })
      ),
      h('span', { class: 'rt-tag rt-tag-strong', text: builtin ? 'plantilla' : 'propia' })
    );
    const scroll = h('div', { class: 'rt-props-scroll' });

    const nameInput = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '60',
      value: draft.name || '',
      disabled: builtin,
      'aria-label': 'Nombre de la ruta',
      dataset: { field: 'name' },
    });
    nameInput.addEventListener('input', () => {
      if (!draft || draft.builtin) return;
      draft.name = nameInput.value.slice(0, 60);
      markDirty();
      renderList();
      renderCanvasPanelLight();
    });

    const categorySelect = h('select', { class: 'select', disabled: builtin, 'aria-label': 'Categoría de la ruta' });
    const categoryOptions = [...new Set([...(draft.category ? [draft.category] : []), ...categories])];
    for (const category of categoryOptions) {
      const option = h('option', { value: category, text: category });
      if (category === draft.category) option.selected = true;
      categorySelect.append(option);
    }
    const customCategory = h('input', {
      class: 'input rt-category-custom',
      type: 'text',
      maxlength: '30',
      value: draft.category || '',
      placeholder: 'Nueva categoría',
      disabled: builtin,
      hidden: true,
      'aria-label': 'Categoría personalizada',
    });
    categorySelect.append(h('option', { value: '__custom', text: 'Otra categoría…' }));
    if (!categoryOptions.includes(draft.category)) categorySelect.value = '__custom';
    const syncCategoryMode = () => {
      const custom = categorySelect.value === '__custom';
      customCategory.hidden = !custom;
      if (custom) {
        customCategory.focus();
      } else {
        draft.category = categorySelect.value;
        customCategory.value = categorySelect.value;
        markDirty();
        renderList();
      }
    };
    categorySelect.addEventListener('change', syncCategoryMode);
    customCategory.addEventListener('input', () => {
      if (!draft || draft.builtin) return;
      draft.category = customCategory.value.slice(0, 30) || 'Corta';
      markDirty();
      renderList();
    });

    const descInput = h('textarea', {
      class: 'input rt-desc',
      rows: '3',
      maxlength: '200',
      disabled: builtin,
      'aria-label': 'Descripción de la ruta',
      placeholder: 'Cuándo usarla, lectura del mariscal…',
    });
    descInput.value = draft.desc || '';
    descInput.addEventListener('input', () => {
      if (!draft || draft.builtin) return;
      draft.desc = descInput.value.slice(0, 200);
      markDirty();
    });

    const mirrorInput = h('input', { type: 'checkbox', disabled: builtin, 'aria-label': 'La ruta admite espejo' });
    mirrorInput.checked = draft.mirror === true;
    mirrorInput.addEventListener('change', () => {
      if (!draft || draft.builtin) return;
      draft.mirror = mirrorInput.checked;
      markDirty();
    });

    scroll.append(
      field('Nombre', nameInput),
      field('Categoría', h('div', { class: 'rt-category-row' }, categorySelect, customCategory)),
      field('Descripción', descInput),
      h(
        'label',
        { class: 'sim-check rt-mirror-check' },
        mirrorInput,
        h('span', { text: 'La ruta admite espejo (izquierda/derecha)' })
      )
    );

    if (builtin) {
      scroll.append(
        h(
          'div',
          { class: 'banner rt-template-note' },
          h('span', { html: icon('info', { size: 13 }) }),
          h('span', {
            text: 'Es una plantilla de la biblioteca: solo lectura. Duplícala para editar sus puntos, nombre y descripción.',
          })
        ),
        h(
          'div',
          { class: 'rt-actions rt-actions-single' },
          h('button', {
            class: 'btn primary rt-btn-wide',
            type: 'button',
            'aria-label': 'Duplicar la plantilla y editarla',
            html: `${icon('copy', { size: 13 })}<span>Duplicar y editar</span>`,
            dataset: { rtAction: 'duplicate' },
            onclick: duplicateCurrent,
          })
        )
      );
    } else {
      const saveAction = h('button', {
        class: 'btn primary rt-btn',
        type: 'button',
        'aria-label': 'Guardar la ruta',
        html: `${icon('save', { size: 13 })}<span>Guardar</span>`,
        dataset: { rtAction: 'save' },
        onclick: saveCurrent,
        disabled: !dirty || saveState === 'saving',
      });
      const revertAction = h('button', {
        class: 'btn rt-btn',
        type: 'button',
        'aria-label': 'Revertir los cambios',
        html: `${icon('undo', { size: 13 })}<span>Revertir</span>`,
        dataset: { rtAction: 'revert' },
        onclick: revertCurrent,
        disabled: !dirty,
      });
      propActions.save = saveAction;
      propActions.revert = revertAction;
      scroll.append(
        h(
          'div',
          { class: 'rt-actions' },
          saveAction,
          revertAction,
          h('button', {
            class: 'btn rt-btn',
            type: 'button',
            'aria-label': 'Duplicar la ruta',
            html: `${icon('copy', { size: 13 })}<span>Duplicar</span>`,
            dataset: { rtAction: 'duplicate' },
            onclick: duplicateCurrent,
          }),
          h('button', {
            class: 'btn danger rt-btn',
            type: 'button',
            'aria-label': 'Eliminar la ruta',
            html: `${icon('trash', { size: 13 })}<span>Eliminar</span>`,
            dataset: { rtAction: 'remove' },
            onclick: () => removeById(selectedId),
          })
        )
      );
    }
    propsEl.append(header, scroll);
    renderSaveState();
  }

  function field(label, control) {
    return h(
      'label',
      { class: 'rt-field' },
      h('span', { class: 'lbl', text: label }),
      control
    );
  }

  function renderCanvasPanelLight() {
    canvasTitleEl.textContent = draft ? draft.name : 'Sin ruta';
    drawCanvas();
  }

  // ==========================================================================
  // Móvil
  // ==========================================================================
  function isMobile() {
    return mobileQuery ? mobileQuery.matches : false;
  }

  function setupMobile() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    mobileQuery = window.matchMedia(MOBILE_QUERY);
    mobileHandler = () => {
      if (destroyed) return;
      if (panel === 'editor') scheduleDraw();
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

  function setPanel(id, opts = {}) {
    const valid = PANELS.some((def) => def.id === id) ? id : 'list';
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
    if (valid === 'editor') scheduleDraw();
    if (opts.focusTab) panelButtons[valid]?.focus();
  }

  // ==========================================================================
  // Eventos globales y ciclo de vida
  // ==========================================================================
  function onKeyDownCapture(event) {
    if (destroyed) return;
    if (typeof hasOpenModal === 'function' && hasOpenModal()) return;
    if (typeof isMenuOpen === 'function' && isMenuOpen()) return;
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') {
      event.preventDefault();
      event.stopPropagation();
      saveCurrent();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      void tryClose();
    }
  }

  function render() {
    if (destroyed) return;
    refreshRoutes();
    ensureSelection();
    renderAll();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKeyDownCapture, true);
    window.removeEventListener('resize', scheduleDraw);
    teardownMobile();
    if (canvasObserver) {
      canvasObserver.disconnect();
      canvasObserver = null;
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    canvasDrag = null;
    container.replaceChildren();
  }

  return { render, destroy };
}

