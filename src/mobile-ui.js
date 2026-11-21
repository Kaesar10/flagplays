// Interfaz específica del móvil: barra mínima con menú desplegable, tira de
// jugadas siempre visible y herramientas flotantes. En escritorio no hace nada.
//
// Se monta una sola vez desde main.js con `mountMobileUI({ store, actions })`.
import { h, escapeHTML, toast } from './ui.js';
import { icon } from './icons.js';
import { playThumbSVG } from './renderer.js';

const esMovil = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;

let stripEl = null;
let sheetEl = null;
let fabEl = null;
let storeRef = null;
let actionsRef = null;
let sheetOpen = false;

/** Secciones y acciones del menú desplegable (☰). */
const SECCIONES = [
  { id: 'plays', label: 'Jugadas', icon: 's-grid' },
  { id: 'catalog', label: 'Catálogo', icon: 's-catalog' },
  { id: 'routes', label: 'Rutas', icon: 's-routes' },
  { id: 'tree', label: 'Árbol', icon: 's-tree' },
  { id: 'wrist', label: 'Muñequeras', icon: 's-wrist' },
];

const ACCIONES = [
  { id: 'analyze', label: 'Analizar jugada', icon: 'chart' },
  { id: 'export', label: 'Exportar', icon: 'download' },
  { id: 'inspector', label: 'Propiedades', icon: 'sliders' },
  { id: 'terms', label: 'Términos y condiciones', icon: 'file' },
  { id: 'legal', label: 'Información legal', icon: 'file' },
];

function normaliza(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ---------------------------------------------------------------------------
// Tira de jugadas
// ---------------------------------------------------------------------------
function crearTira() {
  const wrap = h('div', {
    class: 'play-strip',
    id: 'playStrip',
    role: 'listbox',
    'aria-label': 'Jugadas de la libreta',
  });
  document.querySelector('.app-nav')?.after(wrap);
  return wrap;
}

function pintarTira() {
  if (!stripEl || !storeRef) return;
  const plays = storeRef.getPlaybook().plays || [];
  const actual = storeRef.getPlay();
  const activo = actual ? actual.id : null;
  stripEl.replaceChildren();
  stripEl.scrollLeft = 0;

  for (const play of plays) {
    const isActive = play.id === activo;
    const card = h('button', {
      class: `ps-card${isActive ? ' is-active' : ''}`,
      type: 'button',
      role: 'option',
      'aria-selected': String(isActive),
      'aria-label': `${play.name || 'Jugada'}${isActive ? ' (actual)' : ''}`,
      onclick: () => {
        if (play.id !== activo) actionsRef.selectPlay?.(play.id);
      },
    });
    let thumb = '';
    try {
      thumb = playThumbSVG(play, 108, 66);
    } catch {
      thumb = '';
    }
    card.innerHTML =
      `<span class="ps-thumb">${thumb}</span>` +
      `<span class="ps-name">${escapeHTML(play.name || 'Jugada')}</span>` +
      (play.category ? `<span class="ps-cat">${escapeHTML(play.category)}</span>` : '');
    stripEl.append(card);
  }

  // Tarjeta para crear una jugada nueva.
  const nueva = h('button', {
    class: 'ps-card ps-new',
    type: 'button',
    'aria-label': 'Nueva jugada',
    html: `${icon('plus', { size: 20 })}<span class="ps-name">Nueva</span>`,
    onclick: () => actionsRef.newPlay?.(),
  });
  stripEl.append(nueva);

  // Deja la jugada actual a la vista.
  requestAnimationFrame(() => {
    const el = stripEl.querySelector('.ps-card.is-active');
    if (el && stripEl.scrollWidth > stripEl.clientWidth) {
      stripEl.scrollLeft = Math.max(0, el.offsetLeft - 12);
    }
  });
}

// ---------------------------------------------------------------------------
// Menú desplegable (hoja inferior)
// ---------------------------------------------------------------------------
function crearHoja() {
  const backdrop = h('div', { class: 'msheet-backdrop', onclick: () => cerrarHoja() });
  const panel = h('div', {
    class: 'msheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Menú',
  });
  backdrop.append(panel);
  backdrop.hidden = true;
  document.body.append(backdrop);
  return { backdrop, panel };
}

function pintarHoja() {
  if (!sheetEl) return;
  const { panel } = sheetEl;
  panel.replaceChildren();

  // Cabecera con el nombre de la libreta y el modo
  panel.append(
    h(
      'div',
      { class: 'msheet-head' },
      h('span', { class: 'msheet-title', text: 'Menú' }),
      h('button', {
        class: 'btn icon ghost',
        'aria-label': 'Cerrar menú',
        html: icon('x', { size: 18 }),
        onclick: () => cerrarHoja(),
      })
    )
  );

  // Secciones
  const grid = h('div', { class: 'msheet-sections' });
  for (const seccion of SECCIONES) {
    grid.append(
      h(
        'button',
        {
          class: 'msheet-sec' + (seccion.id === 'plays' ? ' is-current' : ''),
          type: 'button',
          onclick: () => {
            cerrarHoja();
            actionsRef.openSection?.(seccion.id);
          },
        },
        h('span', { class: 'msheet-sec-ic', html: icon(seccion.icon || 'grid', { size: 24 }) }),
        h('span', { class: 'msheet-sec-txt' }, h('b', { text: seccion.label }))
      )
    );
  }
  panel.append(grid);

  // Acciones sueltas
  const acciones = h('div', { class: 'msheet-actions' });
  for (const accion of ACCIONES) {
    acciones.append(
      h('button', {
        class: 'msheet-action',
        type: 'button',
        html: `${icon(accion.icon || 'file', { size: 17 })}<span>${escapeHTML(accion.label)}</span>`,
        onclick: () => {
          cerrarHoja();
          actionsRef.action?.(accion.id);
        },
      })
    );
  }
  panel.append(acciones);

  // Pie: versión legal y ajustes rápidos
  panel.append(
    h(
      'div',
      { class: 'msheet-foot' },
      h('button', {
        class: 'btn sm ghost',
        html: `${icon('sliders', { size: 14 })}<span>Apariencia</span>`,
        onclick: () => {
          cerrarHoja();
          actionsRef.inspector?.('estilo');
        },
      }),
      h('button', {
        class: 'btn sm ghost',
        html: `${icon('layers', { size: 14 })}<span>Libreta</span>`,
        onclick: () => {
          cerrarHoja();
          actionsRef.drawer?.('library');
        },
      })
    )
  );
}

function abrirHoja() {
  if (!sheetEl) return;
  pintarHoja();
  sheetEl.backdrop.hidden = false;
  requestAnimationFrame(() => sheetEl.backdrop.classList.add('in'));
  sheetOpen = true;
  document.body.classList.add('msheet-open');
}

function cerrarHoja() {
  if (!sheetEl || !sheetOpen) return;
  sheetEl.backdrop.classList.remove('in');
  document.body.classList.remove('msheet-open');
  sheetOpen = false;
  setTimeout(() => {
    if (!sheetOpen) sheetEl.backdrop.hidden = true;
  }, 180);
}

// ---------------------------------------------------------------------------
// Herramientas flotantes
// ---------------------------------------------------------------------------
function crearFab() {
  const fab = h('button', {
    class: 'tools-fab',
    type: 'button',
    'aria-label': 'Mostrar u ocultar las herramientas del campo',
    'aria-expanded': 'false',
    html: icon('sliders', { size: 20 }),
    onclick: () => {
      const abierto = document.body.classList.toggle('tools-open');
      fab.setAttribute('aria-expanded', String(abierto));
    },
  });
  document.body.append(fab);
  return fab;
}

// ---------------------------------------------------------------------------
// Montaje
// ---------------------------------------------------------------------------
export function mountMobileUI({ store, actions }) {
  try {
  storeRef = store;
  actionsRef = actions;
  if (!storeRef) return;

  if (!document.getElementById('mobileNavBtn')) {
    const navBtn = h('button', {
      class: 'btn icon ghost mobile-nav-btn',
      id: 'mobileNavBtn',
      type: 'button',
      'aria-label': 'Abrir el menú',
      'aria-expanded': 'false',
      html: icon('menu', { size: 20 }),
      onclick: () => abrirHoja(),
    });
    const topbar = document.querySelector('.topbar');
    // Se coloca como primer hijo de la barra (el botón ⋯ puede estar anidado).
    if (topbar) topbar.prepend(navBtn);
  }

  if (!stripEl) stripEl = crearTira();
  if (!sheetEl) sheetEl = crearHoja();
  if (!fabEl) fabEl = crearFab();

  pintarTira();

  store.subscribe((_state, reason) => {
    if (reason === 'select-play' || reason === 'plays' || reason === 'load' || reason === 'save') {
      if (esMovil()) pintarTira();
    }
  });

  // Al cambiar de tamaño, refresca la tira y cierra la hoja si se pasa a escritorio.
  let t = null;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (esMovil()) pintarTira();
      else {
        cerrarHoja();
        document.body.classList.remove('tools-open');
      }
    }, 180);
  });
  } catch (err) {
    window.__mobileUiError = String(err && err.stack ? err.stack : err);
    console.error('[móvil] no se pudo montar la interfaz', err);
  }
}

/** ¿Hay una hoja de menú abierta? (para el botón atrás de Android) */
export function isMobileSheetOpen() {
  return sheetOpen;
}

/** Cierra la hoja del menú. */
export function closeMobileSheet() {
  if (!sheetOpen) return false;
  cerrarHoja();
  return true;
}

/** Cierra las herramientas flotantes si están abiertas. */
export function closeMobileTools() {
  if (!document.body.classList.contains('tools-open')) return false;
  document.body.classList.remove('tools-open');
  fabEl?.setAttribute('aria-expanded', 'false');
  return true;
}
