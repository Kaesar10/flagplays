// ============================================================================
// FlagPlays · src/catalog-ui.js — sección «Catálogo»
// ----------------------------------------------------------------------------
// Jugadas predeterminadas del club con filtros por facetas. Tres zonas:
//   · izquierda: buscador (en la barra), resumen y facetas con contadores.
//   · centro: rejilla de tarjetas con miniatura del diagrama.
//   · derecha: detalle de la jugada seleccionada y acciones.
// Los datos y el filtrado viven en src/catalog.js; aquí solo se pinta.
//
// API: createCatalogEditor({ root, store, onClose, onAdd, onEdit, onWristband })
//        -> { render(), destroy() }
// ============================================================================
import { icon } from './icons.js';
import { h, hasOpenModal } from './ui.js';
import {
  allCatalogPlays,
  catalogFacets,
  filterCatalog,
  catalogCounts,
  catalogSummary,
} from './catalog.js';

const MOBILE_QUERY = '(max-width: 900px)';
const PANELS = [
  { id: 'filters', label: 'Filtros' },
  { id: 'results', label: 'Jugadas' },
  { id: 'detail', label: 'Detalle' },
];
const FIELD_HALF = 15;
const FIELD_DEPTH = 24;
const QB_DEPTH = 6;

function createEmptyFilters(facets) {
  const filters = { q: '' };
  for (const facet of facets) filters[facet.id] = [];
  return filters;
}

function countActive(filters, facets) {
  let total = String(filters.q || '').trim() ? 1 : 0;
  for (const facet of facets) total += (filters[facet.id] || []).length;
  return total;
}

function hasActiveFilters(filters, facets) {
  return countActive(filters, facets) > 0;
}

/** Mini diagrama de la jugada: campo, LOS, rutas y jugadores. */
function playThumbSVG(item) {
  const play = item && item.play ? item.play : null;
  const width = 100;
  const height = 64;
  const centerX = width / 2;
  const bottom = height - 7;
  const scale = Math.min((width - 10) / (FIELD_HALF * 2), (height - 12) / (FIELD_DEPTH + QB_DEPTH));
  const toX = (x) => centerX + (Number(x) || 0) * scale;
  const toY = (y) => bottom - ((Number(y) || 0) + QB_DEPTH) * scale;
  const parts = [];
  parts.push(`<rect class="ct-field" x="1" y="1" width="${width - 2}" height="${height - 2}" rx="5"/>`);
  parts.push(
    `<line class="ct-los" x1="${toX(-FIELD_HALF).toFixed(1)}" y1="${toY(0).toFixed(1)}" x2="${toX(FIELD_HALF).toFixed(1)}" y2="${toY(0).toFixed(1)}"/>`
  );
  const players = play && Array.isArray(play.players) ? play.players.filter((p) => p.team !== 'defense') : [];
  const targetId = play && play.ball ? play.ball.targetId : null;
  for (const player of players) {
    if (!player || !player.pos) continue;
    const pos = { x: Number(player.pos.x) || 0, y: Number(player.pos.y) || 0 };
    if (Array.isArray(player.path) && player.path.length) {
      // `path` ya viene en coordenadas absolutas (arranca en la posición del jugador).
      const points = [pos, ...player.path.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))];
      const d = points
        .map((point, index) => `${index ? 'L' : 'M'} ${toX(point.x).toFixed(1)} ${toY(point.y).toFixed(1)}`)
        .join(' ');
      const run = player.pathType === 'run';
      parts.push(`<path class="ct-route${run ? ' ct-run' : ''}" d="${d}"/>`);
    }
  }
  for (const player of players) {
    if (!player || !player.pos) continue;
    const x = toX(player.pos.x).toFixed(1);
    const y = toY(player.pos.y).toFixed(1);
    const isTarget = player.id === targetId;
    if (isTarget) parts.push(`<circle class="ct-target-ring" cx="${x}" cy="${y}" r="3.1"/>`);
    parts.push(`<circle class="${isTarget ? 'ct-target' : 'ct-player'}" cx="${x}" cy="${y}" r="${isTarget ? 1.9 : 1.6}"/>`);
  }
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}

function tagText(value) {
  return String(value || '').trim();
}

// ============================================================================
// Editor
// ============================================================================
export function createCatalogEditor(options = {}) {
  const container =
    typeof options.root === 'string' ? document.querySelector(options.root) : options.root;
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('createCatalogEditor: hace falta un contenedor «root» válido');
  }
  const store = options.store || null;
  const { onClose, onAdd, onEdit, onWristband } = options;

  const items = allCatalogPlays();
  const facets = catalogFacets(items);
  const counts = catalogCounts(items);
  let filters = createEmptyFilters(facets);
  let filtered = filterCatalog(filters, items);
  let selectedCid = null;
  let panel = 'results';
  let destroyed = false;
  let mobileQuery = null;
  let mobileHandler = null;
  let gridScrollTop = 0;
  let facetsScrollTop = 0;
  const panelButtons = {};

  // ---------- referencias ----------
  const shell = h('div', { class: 'cat-shell', role: 'region', 'aria-label': 'Catálogo de jugadas' });
  const backButton = h('button', {
    class: 'btn ghost cat-back',
    type: 'button',
    'aria-label': 'Volver atrás',
    html: `${icon('chevron-left', { size: 15 })}<span>Volver</span>`,
  });
  const countEl = h('span', { class: 'cat-count', text: `${items.length} jugadas` });
  const clearButton = h('button', {
    class: 'btn ghost cat-clear',
    type: 'button',
    hidden: true,
    html: `${icon('x', { size: 13 })}<span>Limpiar filtros</span>`,
  });
  const searchInput = h('input', {
    class: 'input cat-search-input',
    type: 'search',
    placeholder: 'Buscar jugada…',
    'aria-label': 'Buscar jugada por nombre, formación, lectura o concepto',
    autocomplete: 'off',
  });
  const searchWrap = h(
    'div',
    { class: 'cat-search' },
    h('span', { class: 'cat-search-ic', html: icon('search', { size: 13 }) }),
    searchInput
  );
  const tabsEl = h('nav', { class: 'cat-tabs', role: 'tablist', 'aria-label': 'Paneles del catálogo' });
  for (const def of PANELS) {
    const button = h('button', {
      class: 'cat-tab',
      type: 'button',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': `cat-panel-${def.id}`,
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
  const summaryEl = h('div', { class: 'cat-summary', 'aria-live': 'polite' });
  const facetsScrollEl = h('div', { class: 'cat-facets' });
  const gridEl = h('div', { class: 'cat-grid', role: 'group', 'aria-label': 'Jugadas del catálogo' });
  const detailEl = h('aside', { class: 'cat-detail', id: 'cat-panel-detail', 'aria-label': 'Detalle de la jugada' });

  buildShell();
  container.replaceChildren(shell);
  setupMobile();
  renderAll();
  setPanel(panel);
  document.addEventListener('keydown', onKeyDownCapture, true);
  backButton.addEventListener('click', () => runClose());
  clearButton.addEventListener('click', clearFilters);
  searchInput.addEventListener('input', () => {
    filters.q = searchInput.value;
    applyFilters();
  });

  // ==========================================================================
  // Armazón
  // ==========================================================================
  function buildShell() {
    const topbar = h(
      'header',
      { class: 'cat-top' },
      backButton,
      h('div', { class: 'cat-ident' }, h('h1', { class: 'cat-title', text: 'Catálogo' }), countEl),
      h('span', { class: 'cat-top-spacer' }),
      clearButton,
      searchWrap
    );
    const side = h(
      'aside',
      { class: 'cat-side', id: 'cat-panel-filters', 'aria-label': 'Filtros del catálogo' },
      h('div', { class: 'cat-side-head' }, summaryEl),
      facetsScrollEl
    );
    const results = h(
      'main',
      { class: 'cat-results', id: 'cat-panel-results', 'aria-label': 'Jugadas del catálogo' },
      gridEl
    );
    shell.append(topbar, tabsEl, h('div', { class: 'cat-body' }, side, results, detailEl));
  }

  // ==========================================================================
  // Filtros y selección
  // ==========================================================================
  function applyFilters() {
    filtered = filterCatalog(filters, items);
    if (selectedCid && !filtered.some((item) => item.cid === selectedCid)) {
      selectedCid = null;
    }
    renderSummary();
    renderClearButton();
    renderFacetsPreservingScroll();
    renderGrid();
    renderDetail();
  }

  function toggleFacet(facetId, value) {
    const current = filters[facetId] || [];
    const index = current.indexOf(value);
    if (index >= 0) current.splice(index, 1);
    else current.push(value);
    filters[facetId] = current;
    applyFilters();
  }

  function clearFacet(facetId) {
    filters[facetId] = [];
    applyFilters();
  }

  function clearFilters() {
    filters = createEmptyFilters(facets);
    searchInput.value = '';
    selectedCid = null;
    applyFilters();
  }

  function selectItem(cid) {
    selectedCid = selectedCid === cid ? null : cid;
    renderGrid();
    renderDetail();
    if (isMobile() && selectedCid) setPanel('detail');
  }

  function selectedItem() {
    return items.find((item) => item.cid === selectedCid) || null;
  }

  function isInLibrary(item) {
    if (!item || !store || typeof store.getPlaybook !== 'function') return false;
    try {
      const plays = store.getPlaybook()?.plays || [];
      const name = String(item.name || '');
      return plays.some((play) => String(play && play.name ? play.name : '').replace(/ \(\d+\)$/, '') === name);
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function renderAll() {
    renderSummary();
    renderClearButton();
    renderFacetsPreservingScroll();
    renderGrid();
    renderDetail();
  }

  function renderSummary() {
    summaryEl.replaceChildren(
      h('b', { class: 'cat-summary-n', text: String(filtered.length) }),
      ' de ',
      h('span', { class: 'cat-summary-total mono', text: String(items.length) }),
      ' jugadas'
    );
  }

  function renderClearButton() {
    clearButton.hidden = !hasActiveFilters(filters, facets);
  }

  function renderFacetsPreservingScroll() {
    const scroll = facetsScrollEl.scrollTop;
    renderFacets();
    facetsScrollEl.scrollTop = scroll;
  }

  function renderFacets() {
    facetsScrollEl.replaceChildren(
      ...facets.map((facet) => {
        const activeValues = filters[facet.id] || [];
        const isActive = activeValues.length > 0;
        const group = h('section', { class: 'cat-facet', 'aria-label': facet.label });
        const head = h(
          'div',
          { class: 'cat-facet-head' },
          h('span', { class: 'cat-facet-title', text: facet.label }),
          isActive
            ? h('button', {
                class: 'cat-facet-clear',
                type: 'button',
                'aria-label': `Limpiar el filtro ${facet.label}`,
                text: 'Limpiar',
                onclick: () => clearFacet(facet.id),
              })
            : null
        );
        const chips = h('div', { class: 'cat-chips' });
        for (const value of facet.values) {
          const active = activeValues.includes(value);
          const count = counts[facet.id] ? counts[facet.id][value] : 0;
          chips.append(
            h(
              'button',
              {
                class: `cat-chip${active ? ' is-active' : ''}`,
                type: 'button',
                'aria-pressed': active ? 'true' : 'false',
                'aria-label': `${facet.label}: ${value} (${count} jugadas)`,
                dataset: { facet: facet.id, value },
                onclick: () => toggleFacet(facet.id, value),
              },
              h('span', { class: 'cat-chip-label', text: value }),
              h('span', { class: 'cat-chip-count mono', text: String(count) })
            )
          );
        }
        group.append(head, chips);
        return group;
      })
    );
  }

  function renderGrid() {
    gridScrollTop = gridEl.scrollTop;
    if (!filtered.length) {
      gridEl.replaceChildren(
        h(
          'div',
          { class: 'cat-empty' },
          h('span', { class: 'cat-empty-ic', html: icon('search', { size: 22 }) }),
          h('span', { class: 'cat-empty-title', text: 'Ninguna jugada con esos filtros' }),
          h('span', { class: 'cat-empty-text', text: 'Prueba a quitar algún filtro o a buscar otra cosa.' }),
          h('button', {
            class: 'btn cat-empty-btn',
            type: 'button',
            html: `${icon('x', { size: 13 })}<span>Limpiar filtros</span>`,
            onclick: clearFilters,
          })
        )
      );
      return;
    }
    gridEl.replaceChildren(...filtered.map(buildCard));
    gridEl.scrollTop = gridScrollTop;
  }

  function buildCard(item) {
    const summary = catalogSummary(item);
    const selected = item.cid === selectedCid;
    const tags = h('div', { class: 'cat-card-tags' });
    for (const value of [summary.kind, summary.depth]) {
      if (!tagText(value)) continue;
      tags.append(h('span', { class: 'cat-tag', text: value }));
    }
    for (const value of summary.vs || []) {
      tags.append(h('span', { class: 'cat-tag cat-tag-vs', text: `vs ${value}` }));
    }
    if ((summary.concept || []).length) {
      tags.append(h('span', { class: 'cat-tag cat-tag-soft', text: summary.concept[0] }));
    }
    const card = h(
      'button',
      {
        class: `cat-card${selected ? ' is-active' : ''}`,
        type: 'button',
        'aria-pressed': selected ? 'true' : 'false',
        'aria-label': `${item.name}, ${summary.formation}, ${summary.kind} ${summary.depth}`,
        dataset: { cid: item.cid, name: item.name },
        onclick: () => selectItem(item.cid),
      },
      h('span', { class: 'cat-thumb', html: playThumbSVG(item) }),
      h(
        'span',
        { class: 'cat-card-body' },
        h('span', { class: 'cat-card-name', text: item.name }),
        h('span', { class: 'cat-card-formation', text: summary.formation }),
        tags
      )
    );
    return card;
  }

  function renderDetail() {
    detailEl.replaceChildren();
    const item = selectedItem();
    if (!item) {
      detailEl.append(
        h(
          'div',
          { class: 'cat-empty cat-detail-empty' },
          h('span', { class: 'cat-empty-ic', html: icon('route', { size: 22 }) }),
          h('span', { class: 'cat-empty-title', text: 'Selecciona una jugada' }),
          
        )
      );
      return;
    }
    const summary = catalogSummary(item);
    const inLibrary = isInLibrary(item);
    const tags = h('div', { class: 'cat-detail-tags' });
    const pushTag = (value, cls = '') => {
      if (tagText(value)) tags.append(h('span', { class: `cat-tag ${cls}`.trim(), text: value }));
    };
    pushTag(summary.kind, 'cat-tag-strong');
    pushTag(summary.depth);
    pushTag(summary.side);
    pushTag(summary.zone);
    for (const value of summary.vs || []) pushTag(`vs ${value}`, 'cat-tag-vs');
    for (const value of summary.concept || []) pushTag(value, 'cat-tag-soft');

    const actions = h(
      'div',
      { class: 'cat-actions' },
      h('button', {
        class: 'btn primary cat-action cat-action-add',
        type: 'button',
        'aria-label': `Añadir ${item.name} a mi libreta`,
        html: `${icon('plus', { size: 14 })}<span>Añadir a mi libreta</span>`,
        onclick: () => runAction(onAdd, item),
      }),
      h('button', {
        class: 'btn cat-action cat-action-edit',
        type: 'button',
        'aria-label': `Añadir ${item.name} y editar`,
        html: `${icon('pen', { size: 13 })}<span>Añadir y editar</span>`,
        onclick: () => runAction(onEdit, item),
      }),
      h('button', {
        class: 'btn cat-action cat-action-folder',
        type: 'button',
        'aria-label': `Añadir ${item.name} a una carpeta`,
        html: `${icon('s-folder', { size: 13 })}<span>A la carpeta</span>`,
        onclick: (e) => runAction((it) => onFolder?.(it, e.currentTarget), item),
      }),
      h('button', {
        class: 'btn cat-action cat-action-wrist',
        type: 'button',
        'aria-label': `Enviar ${item.name} a la muñequera`,
        html: `${icon('printer', { size: 13 })}<span>A la muñequera</span>`,
        onclick: () => runAction(onWristband, item),
      })
    );

    detailEl.append(
      h(
        'div',
        { class: 'cat-detail-scroll' },
        h(
          'header',
          { class: 'cat-detail-head' },
          h('h2', { class: 'cat-detail-name', text: item.name }),
          summary.originalName && summary.originalName !== item.name
            ? h('p', { class: 'cat-detail-original', text: `Antes: ${summary.originalName}` })
            : null,
          h('p', { class: 'cat-detail-formation', text: summary.formation })
        ),
        tags,
        inLibrary
          ? h(
              'div',
              { class: 'banner cat-in-library' },
              h('span', { html: icon('check', { size: 13 }) }),
              h('span', { text: 'Ya está en tu libreta' })
            )
          : null,
        block('Lectura del QB', summary.reading || 'Sin lectura anotada.', 'cat-block-reading'),
        block('Truco', summary.tip || 'Sin truco anotado.', 'cat-block-tip'),
        block('Cuándo usarla', summary.when || 'Sin indicación de uso.', 'cat-block-when'),
        actions
      )
    );
  }

  function block(title, text, cls) {
    return h(
      'section',
      { class: `cat-block ${cls}` },
      h('h3', { class: 'cat-block-title', text: title }),
      h('p', { class: 'cat-block-text', text })
    );
  }

  function runAction(callback, item) {
    if (typeof callback !== 'function') return;
    try {
      callback(item);
    } catch (error) {
      console.error('[catálogo] acción', error);
    } finally {
      // El store puede haber cambiado (jugada añadida): refresca la nota.
      window.setTimeout(() => {
        if (!destroyed) renderDetail();
      }, 0);
    }
  }

  function runClose() {
    if (typeof onClose === 'function') onClose();
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
    mobileHandler = () => {};
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
    const valid = PANELS.some((def) => def.id === id) ? id : 'results';
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
    if (opts.focusTab) panelButtons[valid]?.focus();
  }

  // ==========================================================================
  // Eventos y ciclo de vida
  // ==========================================================================
  function onKeyDownCapture(event) {
    if (destroyed || event.key !== 'Escape') return;
    if (typeof hasOpenModal === 'function' && hasOpenModal()) return;
    event.preventDefault();
    event.stopPropagation();
    runClose();
  }

  function render() {
    if (destroyed) return;
    renderAll();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKeyDownCapture, true);
    teardownMobile();
    container.replaceChildren();
  }

  return { render, destroy };
}


