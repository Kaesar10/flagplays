// FlagPlays — arranque de la aplicación y cableado de la interfaz.
import { createStore, seedWithPresets } from './state.js';
import { createEditor } from './editor.js';
import { createLibrary } from './library.js';
import { createInspector } from './inspector.js';
import { createPlayback } from './playback.js';
import { icon } from './icons.js';
import {
  h,
  toast,
  modal,
  popupMenu,
  confirmDialog,
  promptDialog,
  closeTopModal,
  hasOpenModal,
  isMenuOpen,
  closeMenu,
  escapeHTML,
  downloadBlob,
} from './ui.js';
import { blankPlay, createPlayer, createPlay, validatePlay } from './model.js';
import { FORMATS } from './field.js';
import { computePlayDuration, setActiveAppearance } from './renderer.js';
import { openTreeEditor, isTreeEditorOpen, closeTreeEditor } from './trees.js';
import { openRoutesEditor, isRoutesEditorOpen, closeRoutesEditor } from './routes-open.js';
import { openCatalogEditor, isCatalogOpen, closeCatalogEditor } from './catalog-open.js';
import { initNative, isAndroidApp, isWindowsApp, shareText } from './native.js';
import { ensureTermsAccepted, viewTerms, isAccepted, openTermsDialog } from './terms.js';
import { registerCustomRoutes } from './presets.js';

const $ = (sel) => document.querySelector(sel);

// Módulos opcionales escritos por el equipo (carga tolerante a fallos).
const safeImport = async (path) => {
  try {
    return await import(path);
  } catch (err) {
    console.warn(`[FlagPlays] módulo no disponible: ${path}`, err);
    return null;
  }
};
const presets = await safeImport('./presets.js');
const sim = await safeImport('./sim.js');
const printMod = await safeImport('./print.js');
const shareMod = await safeImport('./share.js');

// ---------- estado ----------
const store = createStore();
const app = {
  store,
  presets,
  sim,
  printMod,
  shareMod,
};

// ---------- iconos estáticos ----------
function paintIcons() {
  for (const slot of document.querySelectorAll('[data-ic]')) {
    slot.innerHTML = icon(slot.dataset.ic, { size: 15 });
    slot.classList.add('ic-slot');
  }
  $('#undoBtn').innerHTML = icon('undo', { size: 16 });
  $('#redoBtn').innerHTML = icon('redo', { size: 16 });
  $('#menuBtn').innerHTML = icon('more', { size: 16 });
  $('#helpBtn').innerHTML = icon('info', { size: 16 });
  $('#libToggleBtn').innerHTML = icon('layers', { size: 16 });
  $('#inspToggleBtn').innerHTML = icon('sliders', { size: 16 });
}

// ---------- editor ----------
const editor = createEditor({
  svg: $('#fieldSvg'),
  stage: $('#stage'),
  store,
  onSelectionChange: () => {
    scheduleRender({ inspector: true });
    announceSelection();
  },
});

// ---------- paneles ----------
const library = createLibrary({
  root: $('#sidebarRoot'),
  store,
  actions: {
    onImport: () => pickImportFile(),
    onExportPNG: (play) => exportPlayPNG(play),
    onShare: (play) => sharePlay(play),
  },
});

let inspector = null;
inspector = createInspector({
  root: $('#inspectorRoot'),
  store,
  presets,
  actions: {
    onDrawRoute: (id) => {
      editor.setTool('route');
      editor.startDrawing(id);
      syncTools();
    },
    onTextEdit: () => scheduleRender({ library: true, field: true }),
    onManageRoutes: () => openSection('routes'),
  },
});

// ---------- reproducción ----------
const TOTAL = { t: 0, dur: 2, frames: null };
const playback = createPlayback({
  root: $('#timeline'),
  store,
  onFrame: (t, dur) => {
    TOTAL.t = t;
    TOTAL.dur = dur;
    store.state.ui.playhead = t;
    if (store.state.ui.mode === 'sim' && TOTAL.frames) {
      applySimFrame(t);
    } else if (TOTAL.overrideOn) {
      TOTAL.overrideOn = false;
      editor.setOverride(null);
    } else {
      editor.render();
    }
    updateSimResult(t);
  },
});
playback.mount();

// ---------- render ----------
let pending = { all: false, library: false, inspector: false, field: false, tools: false };
let rafQueued = false;

function scheduleRender(opts = {}) {
  if (opts.all) pending.all = true;
  if (opts.library) pending.library = true;
  if (opts.inspector) pending.inspector = true;
  if (opts.field) pending.field = true;
  if (opts.tools) pending.tools = true;
  if (rafQueued) return;
  rafQueued = true;
  // setTimeout(0) coalesce los cambios del mismo tick y no depende de que el
  // navegador programe un frame (más robusto que requestAnimationFrame).
  setTimeout(() => {
    rafQueued = false;
    flushRender();
  }, 0);
}

function flushRender() {
  // La apariencia activa la consume también la impresión y la exportación PNG.
  setActiveAppearance(store.getAppearance());
  const p = pending;
  pending = { all: false, library: false, inspector: false, field: false, tools: false };
  const play = store.getPlay();
  if (p.all || p.library) library.render();
  if (p.all || p.inspector) inspector.render();
  if (p.all || p.field) editor.render();
  if (p.all || p.tools) syncTools();
  playback.renderMarks(play);
  const dur = computePlayDuration(play);
  playback.setDuration(store.state.ui.mode === 'sim' && TOTAL.frames ? TOTAL.frames.duration : dur);
  $('#bookName').textContent = store.getPlaybook().name;
  $('#undoBtn').disabled = !store.canUndo();
  $('#redoBtn').disabled = !store.canRedo();
  const emptyEl = $('#stageEmpty');
  emptyEl.hidden = !!play;
  if (!play) {
    emptyEl.innerHTML =
      '<div class="se-inner"><b>No hay ninguna jugada abierta</b><span>Crea una jugada nueva para empezar a dibujar.</span><button class="btn primary" type="button">Nueva jugada</button></div>';
    const b = emptyEl.querySelector('button');
    if (b && !b.dataset.wired) {
      b.dataset.wired = '1';
      b.addEventListener('click', () => store.actions.addPlay('offense'));
    }
  }
  document.title = play ? `${play.name} — FlagPlays` : 'FlagPlays — Pizarra de jugadas de flag football';
}

store.subscribe((state, reason) => {
  if (reason === 'drag') {
    scheduleRender({ field: true });
    return;
  }
  scheduleRender({ all: true });
});

function announceSelection() {
  const sel = store.getSelectedPlayers();
  const lr = $('#live-region');
  if (!sel.length) lr.textContent = 'Selección vacía';
  else if (sel.length === 1) lr.textContent = `${sel[0].label} seleccionado`;
  else lr.textContent = `${sel.length} jugadores seleccionados`;
}

// ---------- barra de herramientas del campo ----------
const TOOLS = [
  { group: 'tool', id: 'select', label: 'Seleccionar', icon: 'cursor', hint: 'V' },
  { group: 'tool', id: 'route', label: 'Ruta', icon: 'route', hint: 'R' },
];

function syncTools() {
  const root = $('#canvasTools');
  if (!root.dataset.built) {
    root.innerHTML = '';
    const g = h('div', { class: 'tool-group' });
    for (const t of TOOLS) {
      const btn = h('button', {
        class: 'tool-btn',
        'data-tool': t.id,
        title: `${t.label} (${t.hint})`,
        html: `${icon(t.icon, { size: 14 })}<span>${t.label}</span>`,
        onclick: () => {
          editor.setTool(t.id);
          syncTools();
        },
      });
      g.append(btn);
    }
    root.append(g);

    const g2 = h('div', { class: 'tool-group' });
    const addBtn = h('button', {
      class: 'tool-btn icon-only',
      title: 'Añadir jugador',
      'aria-label': 'Añadir jugador',
      html: icon('plus', { size: 15 }),
      onclick: (e) => addPlayerMenu(e.currentTarget),
    });
    g2.append(addBtn);
    root.append(g2);

    root.append(h('div', { class: 'sep' }));

    const toggles = h('div', { class: 'tool-group' });
    for (const [key, label, ic] of [
      ['showDefense', 'Defensa', 'layers'],
      ['showRoutes', 'Rutas', 'route'],
      ['showLabels', 'Nombres', 'pen'],
      ['showZones', 'Zonas', 'grid'],
    ]) {
      const btn = h('button', {
        class: 'tool-btn',
        'data-toggle': key,
        title: `Mostrar/ocultar ${label.toLowerCase()}`,
        html: `${icon(ic, { size: 14 })}<span>${label}</span>`,
        onclick: () => {
          store.setUI({ [key]: !store.state.ui[key] });
          syncTools();
          editor.render();
        },
      });
      toggles.append(btn);
    }
    root.append(toggles);

    const flipBtn = h('button', {
      class: 'tool-btn icon-only',
      title: 'Ver desde la defensa',
      'aria-label': 'Ver desde la defensa',
      html: icon('flip', { size: 15 }),
      onclick: () => {
        store.setUI({ flipped: !store.state.ui.flipped });
        editor.render();
        syncTools();
      },
    });
    const snapBtn = h('button', {
      class: 'tool-btn icon-only',
      title: 'Ajustar a media yarda',
      'aria-label': 'Ajustar a media yarda',
      html: icon('target', { size: 15 }),
      onclick: () => {
        store.setUI({ snap: !store.state.ui.snap });
        syncTools();
      },
    });
    root.append(flipBtn, snapBtn);
    root.append(h('div', { class: 'tools-spacer' }));
    // Deshacer / rehacer a mano, junto al campo (además de los de la barra superior).
    const undoBtn = h('button', {
      class: 'tool-btn',
      'data-undo': '1',
      title: 'Deshacer (Ctrl+Z)',
      'aria-label': 'Deshacer',
      html: icon('undo', { size: 14 }) + '<span>Deshacer</span>',
      onclick: () => store.undo(),
    });
    const redoBtn = h('button', {
      class: 'tool-btn icon-only',
      'data-redo': '1',
      title: 'Rehacer (Ctrl+Y)',
      'aria-label': 'Rehacer',
      html: icon('redo', { size: 14 }),
      onclick: () => store.redo(),
    });
    const undoGroup = h('div', { class: 'tool-group undo-group' }, undoBtn, redoBtn);
    root.append(undoGroup);
    root.append(
      h('button', {
        class: 'tool-btn icon-only only-mobile',
        title: 'Propiedades de la jugada',
        'aria-label': 'Propiedades',
        html: icon('sliders', { size: 15 }),
        onclick: () => openInspector(null),
      })
    );
    const tag = h('div', { class: 'play-tag', title: 'Jugada actual' });
    tag.id = 'playTag';
    root.append(tag);

    // Controles de simulación (solo en modo Simular)
    const simTools = h('div', { class: 'tool-group sim-tools', id: 'simTools', hidden: true });
    const levelSel = h('select', {
      class: 'select sim-level',
      'aria-label': 'Nivel de la defensa',
      title: 'Nivel de la defensa rival',
    });
    for (const [val, label] of [
      ['youth', 'Juvenil'],
      ['rec', 'Recreativa'],
      ['competitive', 'Competitiva'],
    ]) {
      const opt = h('option', { value: val, text: label });
      if ((store.state.ui.simLevel || 'rec') === val) opt.selected = true;
      levelSel.append(opt);
    }
    levelSel.addEventListener('change', () => {
      store.setUI({ simLevel: levelSel.value });
      if (store.state.ui.mode === 'sim') runSimulation();
    });
    const qbLabel = h('label', { class: 'sim-check', title: 'El mariscal lanza al receptor más abierto' });
    const qbInput = h('input', { type: 'checkbox', 'aria-label': 'El QB decide' });
    qbInput.checked = store.state.ui.qbReads !== false;
    qbInput.addEventListener('change', () => {
      store.setUI({ qbReads: qbInput.checked });
      if (store.state.ui.mode === 'sim') runSimulation();
    });
    qbLabel.append(qbInput, h('span', { text: 'QB decide' }));
    const replayBtn = h('button', {
      class: 'tool-btn icon-only',
      title: 'Repetir simulación',
      'aria-label': 'Repetir simulación',
      html: icon('undo', { size: 14 }),
      onclick: () => runSimulation(),
    });
    simTools.append(levelSel, qbLabel, replayBtn);
    root.append(simTools);
    root.dataset.built = '1';
  }
  const ui = store.state.ui;
  for (const btn of root.querySelectorAll('[data-tool]')) {
    btn.classList.toggle('is-active', btn.dataset.tool === editor.getTool());
  }
  for (const btn of root.querySelectorAll('[data-toggle]')) {
    btn.classList.toggle('is-active', !!ui[btn.dataset.toggle]);
  }
  const undoBtn = root.querySelector('[data-undo]');
  const redoBtn = root.querySelector('[data-redo]');
  if (undoBtn) undoBtn.disabled = !store.canUndo();
  if (redoBtn) redoBtn.disabled = !store.canRedo();
  const simTools = root.querySelector('#simTools');
  if (simTools) simTools.hidden = store.state.ui.mode !== 'sim';
  const tagEl = root.querySelector('#playTag');
  if (tagEl) tagEl.hidden = store.state.ui.mode === 'sim';
  const tag = root.querySelector('#playTag');
  const play = store.getPlay();
  if (tag && play) {
    const counts = play.players.filter((p) => p.team === 'offense').length;
    tag.innerHTML = `<span class="pt-name">${escapeHTML(play.name)}</span><span class="pt-meta">${escapeHTML(
      play.type === 'defense' ? 'Defensiva' : `${counts}v · ${play.category}`
    )}</span>`;
    tag.title = play.name;
  }
  const flipBtn = root.querySelector('[aria-label="Ver desde la defensa"]');
  flipBtn?.classList.toggle('is-active', !!ui.flipped);
  const snapBtn = root.querySelector('[aria-label="Ajustar a mitad de yarda"], [aria-label="Ajustar a media yarda"]');
  snapBtn?.classList.toggle('is-active', !!ui.snap);
}

function addPlayerMenu(anchor) {
  const play = store.getPlay();
  if (!play) return;
  popupMenu(anchor, [
    {
      label: 'Receptor (WR)',
      onClick: () => addPlayer({ role: 'wr', label: nextLabel('WR'), team: 'offense' }),
    },
    {
      label: 'Corredor (RB)',
      onClick: () => addPlayer({ role: 'rb', label: nextLabel('RB'), team: 'offense' }),
    },
    {
      label: 'Ala cerrada (TE)',
      onClick: () => addPlayer({ role: 'te', label: nextLabel('TE'), team: 'offense' }),
    },
    '-',
    { label: 'Defensa (esquinero)', onClick: () => addPlayer({ role: 'db', label: 'CB', team: 'defense' }) },
    { label: 'Defensa (linebacker)', onClick: () => addPlayer({ role: 'lb', label: 'LB', team: 'defense' }) },
    { label: 'Defensa (safety)', onClick: () => addPlayer({ role: 's', label: 'S', team: 'defense' }) },
  ]);
}

function nextLabel(rolePrefix) {
  const play = store.getPlay();
  const used = new Set(play.players.map((p) => p.label));
  const seq = rolePrefix === 'WR' ? ['X', 'Y', 'Z', 'W', 'A', 'B'] : rolePrefix === 'RB' ? ['R', 'F', 'H'] : ['T', 'U', 'V'];
  for (const l of seq) if (!used.has(l)) return l;
  return `${rolePrefix[0]}${used.size + 1}`;
}

function addPlayer({ role, label, team }) {
  const play = store.getPlay();
  if (!play) return;
  const off = play.players.filter((p) => p.team === 'offense');
  const wid = Math.max(3, play.field.width);
  const pos =
    team === 'offense'
      ? { x: Math.max(-wid / 2 + 2, Math.min(wid / 2 - 2, -wid / 2 + 2 + off.length * 2.5)), y: 0 }
      : { x: 0, y: 8 };
  const p = createPlayer({ team, role, label, pos, path: null, pathType: team === 'offense' ? 'route' : 'rush' });
  store.actions.addPlayer(p, {});
  toast(`${label} añadido`, 'ok', 1200);
}

// ---------- modos ----------
function setMode(mode) {
  store.state.ui.mode = mode;
  for (const b of document.querySelectorAll('#modeSeg .seg')) {
    const active = b.dataset.mode === mode;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  $('#timeline').hidden = false;
  if (mode === 'edit') {
    playback.pause();
    playback.seek(0);
    TOTAL.frames = null;
    TOTAL.overrideOn = false;
    editor.setOverride(null);
    const b = document.getElementById('simBanner');
    if (b) b.hidden = true;
  }
  if (mode === 'animate') {
    TOTAL.frames = null;
    editor.setOverride(null);
    const play = store.getPlay();
    playback.setDuration(computePlayDuration(play), { reset: true });
    setTimeout(() => playback.play(), 60);
  }
  if (mode === 'sim') {
    runSimulation();
  }
  editor.render();
  syncTools();
}

// ---------- simulación ----------
let simResult = null;
let simFramesRef = null;

function runSimulation() {
  const play = store.getPlay();
  if (!play) return;
  if (!sim) {
    toast('El motor de simulación no está disponible', 'error');
    setMode('edit');
    return;
  }
  const val = validatePlay(play);
  if (!val.ok) {
    toast(val.errors[0], 'error');
    setMode('edit');
    return;
  }
  const defense = play.players.some((p) => p.team === 'defense' && p.assignment)
    ? null
    : null;
  let result;
  try {
    result = sim.simulate(play, { qbReads: store.state.ui.qbReads !== false, level: store.state.ui.simLevel || 'rec' });
  } catch (err) {
    console.error(err);
    toast('No se pudo simular la jugada', 'error');
    setMode('edit');
    return;
  }
  if (!result || !result.frames?.length) {
    toast('La simulación no ha producido fotogramas', 'error');
    setMode('edit');
    return;
  }
  simResult = result;
  simFramesRef = result.frames;
  TOTAL.frames = result;
  playback.setDuration(result.duration || computePlayDuration(play), { reset: true });
  playback.seek(0);
  showSimBanner(result);
  setTimeout(() => playback.play(), 120);
}

function applySimFrame(t) {
  const fr = TOTAL.frames;
  if (!fr) return;
  const frames = fr.frames;
  const idx = Math.max(0, Math.min(frames.length - 1, Math.round((t / Math.max(0.001, fr.duration)) * (frames.length - 1))));
  const frame = frames[idx];
  if (!frame) return;
  TOTAL.overrideOn = true;
  editor.setOverride({
    positions: frame.positions,
    ballPos: frame.ball ? { x: frame.ball.x, y: frame.ball.y } : null,
  });
}

function showSimBanner(result) {
  let banner = document.getElementById('simBanner');
  if (!banner) {
    banner = h('div', { id: 'simBanner', class: 'sim-banner' });
    $('#stage').append(banner);
  }
  const res = result.outcome || {};
  const map = {
    touchdown: { label: 'TOUCHDOWN', cls: 'good' },
    catch: { label: 'COMPLETADO', cls: 'good' },
    covered: { label: 'CUBIERTO', cls: 'warn' },
    incomplete: { label: 'INCOMPLETO', cls: 'warn' },
    sack: { label: 'SACK', cls: 'bad' },
  };
  const m = map[res.result] || { label: 'SIMULACIÓN', cls: 'warn' };
  banner.className = `sim-banner ${m.cls}`;
  banner.innerHTML = `<b>${m.label}</b><span>${escapeHTML(res.reason || '')}</span>`;
  banner.hidden = true;
}

function updateSimResult(t) {
  const banner = document.getElementById('simBanner');
  if (!banner) return;
  if (store.state.ui.mode !== 'sim' || !TOTAL.frames) {
    banner.hidden = true;
    return;
  }
  const done = t >= (TOTAL.frames.duration || 0) - 0.06;
  banner.hidden = !done;
  banner.classList.toggle('in', done);
}

// ---------- análisis ----------
function openAnalysis() {
  const play = store.getPlay();
  if (!play) return;
  if (!sim) return toast('El motor de simulación no está disponible', 'error');
  const defenses = store.getPlaybook().plays.filter((p) => p.type === 'defense');
  if (!defenses.length) {
    toast('Crea primero alguna jugada defensiva para comparar', 'error', 3200);
    return;
  }
  const body = h('div', { class: 'analysis' });
  body.innerHTML = '<div class="hint">Ejecutando simulaciones…</div>';
  const m = modal({
    title: 'Análisis de la jugada',
    subtitle: `«${play.name}» contra ${defenses.length} defensa${defenses.length === 1 ? '' : 's'} y 3 niveles de dificultad.`,
    size: 'lg',
    body,
  });
  setTimeout(() => {
    let report;
    try {
      report = sim.analyzePlay(play, defenses, {});
    } catch (err) {
      console.error(err);
      body.innerHTML = '<div class="banner danger">No se pudo analizar la jugada.</div>';
      return;
    }
    body.innerHTML = '';
    const sum = report.summary || { strong: 0, ok: 0, tough: 0, verdict: '' };
    const total = Math.max(1, sum.strong + sum.ok + sum.tough);
    body.append(
      h('div', { class: 'analysis-summary' }, [
        h('div', { class: 'as-grade strong' }, h('b', { text: String(sum.strong) }), h('span', { text: 'Fuertes' })),
        h('div', { class: 'as-grade ok' }, h('b', { text: String(sum.ok) }), h('span', { text: 'Correctas' })),
        h('div', { class: 'as-grade tough' }, h('b', { text: String(sum.tough) }), h('span', { text: 'Duras' })),
        h('div', { class: 'as-bar' }, [
          h('i', { class: 'b-strong', style: `width:${(sum.strong / total) * 100}%` }),
          h('i', { class: 'b-ok', style: `width:${(sum.ok / total) * 100}%` }),
          h('i', { class: 'b-tough', style: `width:${(sum.tough / total) * 100}%` }),
        ]),
      ]),
      h('p', { class: 'analysis-verdict', text: sum.verdict || '' })
    );
    const table = h('table', { class: 'analysis-table' });
    table.innerHTML = `<thead><tr><th>Defensa</th><th>Nivel</th><th>Resultado</th><th>Motivo</th></tr></thead>`;
    const tbody = h('tbody');
    const labels = { strong: 'Fuerte', ok: 'Correcta', tough: 'Dura' };
    const levelLabels = { youth: 'Juvenil', rec: 'Recreativo', competitive: 'Competitivo' };
    for (const r of report.rows || []) {
      const tr = h('tr', {});
      tr.innerHTML = `<td>${escapeHTML(r.defenseName)}</td><td class="mono">${escapeHTML(levelLabels[r.level] || r.level || '')}</td><td><span class="grade ${
        r.grade
      }">${labels[r.grade] || r.grade}</span></td><td class="reason">${escapeHTML(r.reason || '')}</td>`;
      tbody.append(tr);
    }
    table.append(tbody);
    body.append(table);
  }, 30);
}

// ---------- exportar ----------
function exportMenu(anchor) {
  const play = store.getPlay();
  popupMenu(anchor, [
    {
      label: 'Imagen PNG de la jugada',
      icon: 'camera',
      onClick: () => exportPlayPNG(play),
    },
    {
      label: 'Copiar imagen al portapapeles',
      icon: 'copy',
      onClick: () => copyPlayImage(play),
    },
    '-',
    {
      label: 'Enlace para compartir la jugada',
      icon: 'link',
      onClick: () => sharePlay(play),
    },
    {
      label: 'Exportar libreta (.json)',
      icon: 'download',
      onClick: () => exportPlaybook(),
    },
    {
      label: 'Importar libreta…',
      icon: 'upload',
      onClick: () => pickImportFile(),
    },
    '-',
    {
      label: 'Imprimir muñequeras / hojas',
      icon: 'printer',
      onClick: () => openPrint(),
    },
  ]);
}

async function exportPlayPNG(play = store.getPlay()) {
  if (!play) return;
  if (!shareMod?.exportPNG) return toast('Exportación no disponible', 'error');
  try {
    toast('Generando imagen…', 'info', 1200);
    const blob = await shareMod.exportPNG(play, { width: 1600, height: 1200 });
    const name = play.name.replace(/[^\w\sÁÉÍÓÚáéíóúÑñ-]/g, '').trim() || 'jugada';
    downloadBlob(blob, `flagplays-${name}.png`);
    toast('Imagen descargada', 'ok');
  } catch (err) {
    console.error(err);
    toast('No se pudo exportar la imagen', 'error');
  }
}

async function copyPlayImage(play) {
  if (!shareMod?.copyPlayImage) return toast('Exportación no disponible', 'error');
  const ok = await shareMod.copyPlayImage(play, { width: 1400, height: 1050 });
  toast(ok ? 'Imagen copiada al portapapeles' : 'Tu navegador no permite copiar imágenes', ok ? 'ok' : 'error');
}

async function sharePlay(play) {
  if (!shareMod?.playToShareURL) return toast('No disponible', 'error');
  const url = shareMod.playToShareURL(play);
  if (isAndroidApp() || isWindowsApp()) {
    if (shareText(url, play.name)) {
      toast('Enlace copiado al portapapeles', 'ok', 2200);
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Enlace copiado al portapapeles', 'ok', 2600);
  } catch {
    modal({
      title: 'Enlace para compartir',
      size: 'md',
      body: h('div', { class: 'stack-8' }, h('p', { class: 'modal-text', text: 'Copia este enlace y mándalo a tu equipo:' }), h('input', { class: 'input mono', value: url, readonly: true, onclick: (e) => e.target.select() })),
    });
  }
}

async function exportPlaybook() {
  if (!shareMod?.exportPlaybookJSON) return toast('No disponible', 'error');
  shareMod.exportPlaybookJSON(store.getPlaybook());
  toast('Libreta exportada', 'ok');
}

function pickImportFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const book = await shareMod.importPlaybookFile(file);
      const total = book.plays?.length || 0;
      if (!total) return toast('El fichero no contiene jugadas', 'error');
      const ok = await confirmDialog({
        title: 'Importar libreta',
        message: `Se van a añadir ${total} jugada${total === 1 ? '' : 's'} a tu libreta actual. ¿Continuar?`,
        confirmLabel: 'Importar',
        danger: false,
      });
      if (!ok) return;
      store.update((s) => {
        s.playbook.plays.push(...book.plays);
      }, { reason: 'import' });
      toast(`${total} jugadas importadas`, 'ok');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Fichero no válido', 'error', 3200);
    }
    input.remove();
  });
  document.body.append(input);
  input.click();
}

// ---------- impresión ----------
function openPrint() {
  if (!printMod?.openPrintDialog) return toast('Impresión no disponible', 'error');
  const book = store.getPlaybook();
  printMod.openPrintDialog({
    playbook: book,
    plays: book.plays,
    defaults: { current: store.state.playId },
  });
}

// ---------- ayuda ----------
function openHelp() {
  const body = h('div', { class: 'help-grid' });
  const rows = [
    ['Dibujar', 'Elegir jugador → clic en el campo para añadir puntos de ruta', 'R'],
    ['Terminar ruta', 'Cierra la ruta y selecciona el jugador como receptor del balón', 'Enter'],
    ['Deshacer punto', 'Borra el último punto de la ruta en curso', 'Retroceso'],
    ['Seleccionar varios', 'Shift + clic sobre jugadores o arrastra un rectángulo', 'Shift'],
    ['Mover jugador', 'Arrastra; Alt desactiva el ajuste a media yarda', '—'],
    ['Mover con teclado', 'Mueve 1 yarda (Shift = 5 yardas)', '↑ ↓ ← →'],
    ['Duplicar', 'Duplica los jugadores seleccionados', 'Ctrl + D'],
    ['Copiar / Pegar', 'Copia y pega jugadores', 'Ctrl + C / V'],
    ['Eliminar', 'Elimina los jugadores seleccionados', 'Supr'],
    ['Deshacer / Rehacer', 'Historial de la libreta', 'Ctrl + Z / Ctrl + Y'],
    ['Reproducir', 'Anima la jugada', 'Espacio'],
    ['Buscar', 'Enfoca el buscador de la libreta', 'Ctrl + F'],
    ['Ayuda', 'Este panel', '?'],
  ];
  body.innerHTML = `<table class="help-table">${rows
    .map((r) => `<tr><td class="help-k">${r[0]}</td><td>${r[1]}</td><td class="help-s">${r[2]}</td></tr>`)
    .join('')}</table>`;
  modal({
    title: 'Cómo usar FlagPlays',
    subtitle: 'Atajos y conceptos básicos del editor.',
    size: 'lg',
    body,
    actions: [{ label: 'Entendido', variant: 'primary', onClick: (close) => close() }],
  });
}

// ---------- navegación por secciones ----------
const SECTIONS = ['plays', 'catalog', 'routes', 'tree', 'wrist'];

function setNavActive(section) {
  for (const btn of document.querySelectorAll('#appNav .nav-tab')) {
    const active = btn.dataset.section === section;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
  const ctx = document.getElementById('navContext');
  if (ctx) {
    const play = store.getPlay();
    ctx.textContent = section === 'plays' && play ? play.name : '';
  }
}

async function openSection(section) {
  switch (section) {
    case 'plays':
      closeCatalogEditor();
      closeRoutesEditor();
      if (isTreeEditorOpen()) closeTreeEditor();
      setNavActive('plays');
      break;
    case 'catalog':
      setNavActive('catalog');
      await openCatalogEditor({
        store,
        onClose: () => setNavActive('plays'),
        onEdit: (created) => {
          setNavActive('plays');
          scheduleRender({ library: true, field: true, inspector: true });
          if (created) store.selectPlay(created.id);
        },
        onWristband: () => {
          setNavActive('plays');
          setTimeout(() => openPrint(), 120);
        },
      });
      if (!isCatalogOpen()) setNavActive('plays');
      break;
    case 'routes':
      setNavActive('routes');
      await openRoutesEditor({
        store,
        presets,
        onClose: () => setNavActive('plays'),
      });
      if (!isRoutesEditorOpen()) setNavActive('plays');
      break;
    case 'tree':
      setNavActive('tree');
      await openTreeEditor(store);
      // openTreeEditor no devuelve promesa de cierre: vigilamos cuándo desaparece.
      const waitTree = setInterval(() => {
        if (!isTreeEditorOpen()) {
          clearInterval(waitTree);
          if (!isRoutesEditorOpen()) setNavActive('plays');
        }
      }, 300);
      break;
    case 'wrist':
      setNavActive('wrist');
      openPrint();
      setTimeout(() => setNavActive('plays'), 400);
      break;
    default:
      setNavActive('plays');
  }
}

function wireNav() {
  for (const btn of document.querySelectorAll('#appNav .nav-tab')) {
    btn.addEventListener('click', () => openSection(btn.dataset.section));
  }
  setNavActive('plays');
  // El contexto de la barra se actualiza con la jugada actual.
  store.subscribe((state, reason) => {
    if (reason === 'select-play' || reason === 'play' || reason === 'plays') {
      const ctx = document.getElementById('navContext');
      if (ctx) ctx.textContent = store.getPlay()?.name || '';
    }
  });
}

// ---------- paneles laterales (drawer en móvil) ----------
function closeDrawers() {
  $('#sidebar').classList.remove('open');
  $('#inspector').classList.remove('open');
  document.getElementById('drawerBackdrop')?.remove();
}

function openDrawer(which) {
  const side = $('#sidebar');
  const insp = $('#inspector');
  if (which === 'library') {
    side.classList.toggle('open');
    insp.classList.remove('open');
  } else {
    insp.classList.toggle('open');
    side.classList.remove('open');
  }
  const open = side.classList.contains('open') || insp.classList.contains('open');
  let backdrop = document.getElementById('drawerBackdrop');
  if (open && window.innerWidth <= 1060) {
    if (!backdrop) {
      backdrop = h('div', { class: 'drawer-backdrop', id: 'drawerBackdrop', 'aria-hidden': 'true' });
      backdrop.addEventListener('pointerdown', closeDrawers);
      document.body.append(backdrop);
    }
  } else if (backdrop) {
    backdrop.remove();
  }
}

function openInspector(tab) {
  closeDrawers();
  if (tab) inspector.setTab(tab);
  $('#inspector').classList.add('open');
  if (window.innerWidth <= 1060) {
    const backdrop = h('div', { class: 'drawer-backdrop', id: 'drawerBackdrop', 'aria-hidden': 'true' });
    backdrop.addEventListener('pointerdown', closeDrawers);
    document.body.append(backdrop);
  }
}

// ---------- menú principal ----------
function openMainMenu(anchor) {
  popupMenu(anchor, [
    {
      label: 'Renombrar libreta',
      icon: 'pen',
      onClick: async () => {
        const name = await promptDialog({ title: 'Renombrar libreta', value: store.getPlaybook().name, label: 'Nombre' });
        if (name) store.actions.renamePlaybook(name);
      },
    },
    { label: 'Propiedades de la jugada', icon: 'sliders', onClick: () => openInspector('play') },
    { label: 'Apariencia y colores', icon: 'pen', onClick: () => openInspector('style') },
    '-',
    { label: 'Sección: Catálogo de jugadas', icon: 'grid', onClick: () => openSection('catalog') },
    { label: 'Sección: Rutas', icon: 'route', onClick: () => openSection('routes') },
    { label: 'Sección: Árbol de rutas', icon: 'tree', onClick: () => openSection('tree') },
    '-',
    { label: 'Configuración del campo', icon: 'sliders', onClick: () => inspector.setTab('play') },
    '-',
    { label: 'Analizar la jugada', icon: 'chart', onClick: openAnalysis },
    { label: 'Exportar / compartir', icon: 'download', onClick: () => exportMenu(document.getElementById('exportBtn')) },
    { label: 'Imprimir muñequeras', icon: 'printer', onClick: openPrint },
    { label: 'Animar la jugada', icon: 'play', onClick: () => setMode('animate') },
    { label: 'Simular la jugada', icon: 'zap', onClick: () => setMode('sim') },
    '-',
    { label: 'Términos y condiciones', icon: 'file', onClick: () => viewTerms() },
    { label: 'Ayuda y atajos', icon: 'info', hint: '?', onClick: openHelp },
    {
      label: 'Cargar jugadas de ejemplo',
      icon: 'zap',
      onClick: async () => {
        const added = await loadPresets(true);
        toast(added ? 'Jugadas de ejemplo cargadas' : 'No hay presets disponibles', added ? 'ok' : 'error');
      },
    },
    '-',
    {
      label: 'Borrar todo y empezar de cero',
      icon: 'trash',
      danger: true,
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Borrar todo',
          message: 'Se eliminarán todas las jugadas guardadas en este navegador. Esta acción no se puede deshacer.',
          confirmLabel: 'Borrar todo',
        });
        if (ok) {
          store.actions.resetAll();
          toast('Libreta reiniciada', 'ok');
        }
      },
    },
  ]);
}

// ---------- presets ----------
async function loadPresets(append = false) {
  try {
    const mod = presets || (await safeImport('./presets.js'));
    if (!mod?.STARTER_PLAYS?.length) return false;
    const { clonePlay } = await import('./model.js');
    const plays = mod.STARTER_PLAYS.map((p) => clonePlay(p, ''));
    store.update((s) => {
      if (append) s.playbook.plays.push(...plays);
      else {
        s.playbook.plays = plays;
        s.playId = plays[0].id;
      }
      s.playbook.seeded = true;
      s.selection = { ids: [], editing: null };
    }, { history: true, reason: 'seed' });
    return true;
  } catch (err) {
    console.warn('[FlagPlays] presets', err);
    return false;
  }
}

// ---------- atajos globales ----------
document.addEventListener('keydown', (e) => {
  if (isTreeEditorOpen()) return;
  const tag = (e.target?.tagName || '').toLowerCase();
  const typing = ['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable;
  const meta = e.ctrlKey || e.metaKey;

  if (e.key === 'Escape') {
    if (hasOpenModal()) {
      closeTopModal();
      return;
    }
  }
  if (meta && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    library.focusSearch();
    return;
  }
  if (meta && e.key.toLowerCase() === 's') {
    e.preventDefault();
    exportPlaybook();
    return;
  }
  if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    store.undo();
    return;
  }
  if ((meta && e.key.toLowerCase() === 'y') || (meta && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault();
    store.redo();
    return;
  }
  if (typing) return;

  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (store.state.ui.mode === 'edit') setMode('animate');
    else playback.toggle();
    return;
  }
  if (e.key === '?') {
    e.preventDefault();
    openHelp();
    return;
  }
  if (meta && e.key.toLowerCase() === 'd') {
    if (!store.state.selection.ids.length) {
      e.preventDefault();
      const id = store.state.playId;
      if (id) store.actions.duplicatePlay(id);
      return;
    }
  }
  // Deja que el editor procese el resto
  editor.onKeyDown(e);
});

// ---------- cableado de la barra superior ----------
function wireTopbar() {
  $('#undoBtn').addEventListener('click', () => store.undo());
  $('#redoBtn').addEventListener('click', () => store.redo());
  $('#bookNameBtn').addEventListener('click', async () => {
    const name = await promptDialog({ title: 'Renombrar libreta', value: store.getPlaybook().name, label: 'Nombre de la libreta' });
    if (name) store.actions.renamePlaybook(name);
  });
  for (const b of document.querySelectorAll('#modeSeg .seg')) {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  }
  $('#treeBtn')?.addEventListener('click', () => openTreeEditor(store));
  $('#analyzeBtn').addEventListener('click', openAnalysis);
  $('#exportBtn').addEventListener('click', (e) => exportMenu(e.currentTarget));
  $('#printBtn').addEventListener('click', openPrint);
  $('#menuBtn').addEventListener('click', (e) => openMainMenu(e.currentTarget));
  $('#helpBtn').addEventListener('click', openHelp);

  const libToggle = $('#libToggleBtn');
  const inspToggle = $('#inspToggleBtn');
  libToggle?.addEventListener('click', () => openDrawer('library'));
  inspToggle?.addEventListener('click', () => openDrawer('inspector'));
  // cerrar drawers al elegir jugada en móvil
  store.subscribe((s, reason) => {
    if (reason === 'select-play' && window.innerWidth <= 1060) {
      closeDrawers();
    }
  });
}

// ---------- arranque ----------
async function boot() {
  paintIcons();
  wireTopbar();
  wireNav();

  // Puente con la app Android (guardar en Descargas, imprimir, botón atrás…).
  initNative({
    store,
    actions: {
      hasOpenModal,
      closeTopModal,
      isMenuOpen,
      closeMenu,
      editor,
      isTreeOpen: isTreeEditorOpen,
      closeTree: closeTreeEditor,
      closeDrawers,
    },
  });

  let imported = null;
  try {
    const sharedPlay = shareMod?.playFromLocationHash?.() || null;
    const sharedBook = !sharedPlay ? shareMod?.playbookFromLocationHash?.() || null : null;
    if (sharedPlay?.players) {
      store.update((s) => {
        s.playbook.plays.unshift(sharedPlay);
        s.playId = sharedPlay.id;
        s.selection = { ids: [], editing: null };
      }, { history: false, reason: 'hash' });
      imported = 'Jugada compartida cargada';
    } else if (sharedBook?.plays?.length) {
      store.update((s) => {
        s.playbook.plays.push(...sharedBook.plays);
        s.playId = sharedBook.plays[0].id;
        s.selection = { ids: [], editing: null };
      }, { history: false, reason: 'hash' });
      imported = `Libreta compartida cargada (${sharedBook.plays.length} jugadas)`;
    }
  } catch (err) {
    console.warn('[FlagPlays] enlace no válido', err);
  }
  if (imported) toast(imported, 'ok', 3200);
  else if (!presets && !store.getPlaybook().plays.length) store.actions.addPlay('offense');

  scheduleRender({ all: true });
  setMode('edit');

  if (!store.getPlaybook().seeded && store.getPlaybook().plays.length <= 1 && presets) {
    const ok = await loadPresets(false);
    if (ok) {
      scheduleRender({ all: true });
      toast('Jugadas de ejemplo cargadas — cámbialas o crea las tuyas', 'info', 3600);
    }
  }

  // Redimensionado
  window.addEventListener('resize', () => scheduleRender({ field: true }));

  // Aviso de guardado
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) store.persist();
  });

  // Las rutas propias tienen que ser visibles en todas las vistas (árbol, PDF…).
  registerCustomRoutes(store.getCustomRoutes());
  store.subscribe((state, reason) => {
    if (reason === 'routes' || reason === 'load') registerCustomRoutes(store.getCustomRoutes());
  });

  // Supr borra los jugadores seleccionados (ofensivos o defensas), salvo que se
  // esté escribiendo en un campo o dibujando una ruta (ahí Supr quita puntos).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const el = e.target;
    const escribiendo = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (escribiendo) return;
    if (document.querySelector('.modal-backdrop, .tree-overlay, .section-overlay')) return;
    const mode = store.state.mode;
    if (mode && mode !== 'edit') return;
    const ids = store.state.selection.ids.slice();
    if (!ids.length) return;
    if (document.body.classList.contains('is-drawing-route')) return;
    e.preventDefault();
    store.actions.removePlayers(ids);
    toast(ids.length === 1 ? 'Jugador borrado' : `${ids.length} jugadores borrados`, 'ok', 1400);
  });

  // Atajos de sección: Ctrl+1 Jugadas, Ctrl+2 Rutas, Ctrl+3 Árbol, Ctrl+4 Muñequeras
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const map = { '1': 'plays', '2': 'routes', '3': 'tree', '4': 'wrist', '5': 'catalog' };
    const section = map[e.key];
    if (!section) return;
    e.preventDefault();
    e.stopPropagation();
    openSection(section);
  });

  // Términos y condiciones: obligatorios la primera vez que se abre la app
  // (navegador, Windows y Android). Después solo desde el menú.
  if (!isAccepted()) {
    await ensureTermsAccepted();
  }
}

boot().catch((err) => {
  console.error('[FlagPlays] error de arranque', err);
  toast('Error al iniciar la aplicación', 'error', 5000);
});

// Exponer para depuración
window.FlagPlays = { store, editor, library, inspector, playback, setMode, openAnalysis, openTreeEditor, openSection, terms: { ensureTermsAccepted, viewTerms, isAccepted, openTermsDialog } };
