// Store central de FlagPlays: estado, mutaciones, historial (undo/redo) y persistencia.
import { emptyPlaybook, normalizePlaybook, createPlay, clonePlay, uid, blankPlay, compactStyle, createRoute, normalizeRoute } from './model.js';
import { DEFAULT_APPEARANCE, normalizeAppearance, normalizePlayerStyle } from './appearance.js';

const KEY = 'flagplays.v1';
const MAX_HISTORY = 100;

export const DEFAULT_UI = {
  showDefense: true,
  showRoutes: true,
  showLabels: true,
  showZones: true,
  showThrowLine: true,
  snap: true,
  flipped: false,
  zoom: 1,
  tab: 'offense', // pestaña del inspector: offense | defense | play
  mode: 'edit', // edit | animate | sim
};

function loadPersisted() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.playbook) return null;
    const pb = normalizePlaybook(parsed.playbook);
    return { playbook: pb, playId: parsed.playId || null, ui: { ...DEFAULT_UI, ...(parsed.ui || {}) } };
  } catch {
    return null;
  }
}

/** Paleta de carpetas: se usa en la libreta y en el catálogo. */
export const FOLDER_COLORS = ['#45d9e8', '#b4f13f', '#ffb020', '#a78bfa', '#ff6b9a', '#ff8a6a'];

export function createStore() {
  const persisted = typeof localStorage !== 'undefined' ? loadPersisted() : null;
  const playbook = persisted?.playbook || seedPlaybook();
  // Las libretas antiguas no tienen carpetas: se añade la lista vacía.
  if (!Array.isArray(playbook.folders)) playbook.folders = [];
  // Las carpetas antiguas no guardaban sus jugadas: se rellenan una vez.
  for (const f of playbook.folders) {
    if (!Array.isArray(f.playIds) || (f.playIds.length === 0 && !f.touched)) {
      if (f.name === 'Ofensiva') {
        f.playIds = playbook.plays.filter((p) => p.type !== 'defense').map((p) => p.id);
      } else if (f.name === 'Defensiva') {
        f.playIds = playbook.plays.filter((p) => p.type === 'defense').map((p) => p.id);
      } else {
        f.playIds = f.playIds || [];
      }
    }
  }
  const state = {
    playbook,
    playId: persisted?.playId || playbook.plays[0]?.id || null,
    selection: { ids: [], editing: null },
    ui: { ...DEFAULT_UI, ...(persisted?.ui || {}) },
    dirty: false,
  };
  if (!state.playId) {
    const p = createPlay({ name: 'Jugada nueva', ...blankPlay('offense') });
    playbook.plays.push(p);
    state.playId = p.id;
  }

  const subs = new Set();
  let past = [];
  let future = [];
  let pendingSnapshot = null;
  let saveTimer = null;

  function emit(reason = 'change') {
    for (const fn of subs) {
      try {
        fn(state, reason);
      } catch (err) {
        console.error('[store] subscriber error', err);
      }
    }
  }

  function persist() {
    if (typeof localStorage === 'undefined') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ playbook: state.playbook, playId: state.playId, ui: state.ui })
        );
      } catch (err) {
        console.warn('[store] no se pudo guardar', err);
      }
    }, 350);
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(state.playbook));
  }

  function pushHistory(snap) {
    past.push(snap);
    if (past.length > MAX_HISTORY) past.shift();
    future = [];
  }

  /** Aplica una mutación. history=true registra un paso de deshacer. */
  function update(fn, opts = {}) {
    const { history = true, silent = false, reason = 'change' } = opts;
    const before = history ? snapshot() : null;
    fn(state);
    state.dirty = true;
    if (history && before) pushHistory(before);
    persist();
    if (!silent) emit(reason);
  }

  /** Inicio de una interacción continua (drag): no registra historial todavía. */
  function begin() {
    if (!pendingSnapshot) pendingSnapshot = snapshot();
  }

  /** Fin de la interacción: registra un único paso de deshacer. */
  function end(reason = 'commit') {
    if (pendingSnapshot) {
      pushHistory(pendingSnapshot);
      pendingSnapshot = null;
      persist();
    }
    emit(reason);
  }

  function cancel() {
    if (pendingSnapshot) {
      state.playbook = pendingSnapshot;
      pendingSnapshot = null;
      emit('cancel');
    }
  }

  function undo() {
    if (!past.length) return false;
    const snap = past.pop();
    future.push(snapshot());
    state.playbook = snap;
    ensureValidSelection();
    persist();
    emit('undo');
    return true;
  }

  function redo() {
    if (!future.length) return false;
    const snap = future.pop();
    past.push(snapshot());
    state.playbook = snap;
    ensureValidSelection();
    persist();
    emit('redo');
    return true;
  }

  function canUndo() {
    return past.length > 0;
  }
  function canRedo() {
    return future.length > 0;
  }

  function ensureValidSelection() {
    const play = getPlay();
    if (!play) {
      state.playId = state.playbook.plays[0]?.id || null;
      state.selection = { ids: [], editing: null };
      return;
    }
    const ids = new Set(play.players.map((p) => p.id));
    state.selection.ids = state.selection.ids.filter((id) => ids.has(id));
    if (state.selection.editing && !ids.has(state.selection.editing)) state.selection.editing = null;
  }

  function getPlay() {
    return state.playbook.plays.find((p) => p.id === state.playId) || null;
  }

  function selectPlay(id) {
    if (state.playId === id) return;
    state.playId = id;
    state.selection = { ids: [], editing: null };
    persist();
    emit('select-play');
  }

  function selectPlayers(ids, opts = {}) {
    state.selection.ids = Array.from(new Set(ids));
    if (opts.editing !== undefined) state.selection.editing = opts.editing;
    else if (state.selection.ids.length !== 1) state.selection.editing = null;
    emit('select');
  }

  function getSelectedPlayers() {
    const play = getPlay();
    if (!play) return [];
    const ids = new Set(state.selection.ids);
    return play.players.filter((p) => ids.has(p.id));
  }

  function setUI(patch, reason = 'ui') {
    Object.assign(state.ui, patch);
    persist();
    emit(reason);
  }

  // ---- Acciones de alto nivel -------------------------------------------
  const actions = {
    addPlay(type = 'offense', partial = {}) {
      const play = createPlay({ ...blankPlay(type), ...partial });
      play.name = uniqueName(play.name);
      update((s) => {
        s.playbook.plays.push(play);
        s.playId = play.id;
        s.selection = { ids: [], editing: null };
      }, { reason: 'plays' });
      return play;
    },
    duplicatePlay(id) {
      const src = state.playbook.plays.find((p) => p.id === id);
      if (!src) return null;
      const copy = clonePlay(src);
      copy.name = uniqueName(copy.name);
      update((s) => {
        const idx = s.playbook.plays.findIndex((p) => p.id === id);
        s.playbook.plays.splice(idx + 1, 0, copy);
        s.playId = copy.id;
        s.selection = { ids: [], editing: null };
      }, { reason: 'plays' });
      return copy;
    },
    removePlay(id) {
      const idx = state.playbook.plays.findIndex((p) => p.id === id);
      if (idx < 0) return;
      update((s) => {
        s.playbook.plays.splice(idx, 1);
        // Ninguna carpeta debe quedarse con un id que ya no existe.
        for (const f of s.playbook.folders || []) {
          f.playIds = f.playIds.filter((x) => x !== id);
        }
        if (s.playId === id) {
          s.playId = s.playbook.plays[Math.min(idx, s.playbook.plays.length - 1)]?.id || null;
          s.selection = { ids: [], editing: null };
        }
        if (!s.playId) {
          const p = createPlay({ ...blankPlay('offense'), name: 'Jugada nueva' });
          s.playbook.plays.push(p);
          s.playId = p.id;
        }
      }, { reason: 'plays' });
    },
    // ---------- carpetas (colecciones propias de jugadas) ----------
    renameFolder(id, name) {
      const limpio = String(name || '').trim();
      if (!limpio) return;
      update((s) => {
        const f = s.playbook.folders.find((x) => x.id === id);
        if (f) f.name = limpio;
      }, { reason: 'folders' });
    },
    setFolderColor(id, color) {
      update((s) => {
        const f = s.playbook.folders.find((x) => x.id === id);
        if (f) f.color = color;
      }, { reason: 'folders' });
    },
    addToFolder(folderId, playIds) {
      const ids = Array.isArray(playIds) ? playIds : [playIds];
      const validos = ids.filter((id) => state.playbook.plays.some((p) => p.id === id));
      if (!validos.length) return 0;
      let añadidas = 0;
      update((s) => {
        const f = s.playbook.folders.find((x) => x.id === folderId);
        if (!f) return;
        for (const id of validos) {
          if (!f.playIds.includes(id)) {
            f.playIds.push(id);
            añadidas += 1;
          }
        }
      }, { reason: 'folders' });
      return añadidas;
    },
    removeFromFolder(folderId, playId) {
      update((s) => {
        const f = s.playbook.folders.find((x) => x.id === folderId);
        if (f) f.playIds = f.playIds.filter((id) => id !== playId);
      }, { reason: 'folders' });
    },
    reorderPlayInFolder(folderId, fromIndex, toIndex) {
      update((s) => {
        const f = s.playbook.folders.find((x) => x.id === folderId);
        if (!f) return;
        const [item] = f.playIds.splice(fromIndex, 1);
        if (item) f.playIds.splice(Math.max(0, Math.min(f.playIds.length, toIndex)), 0, item);
      }, { reason: 'folders' });
    },

    reorderPlay(fromId, toIndex) {
      update((s) => {
        const from = s.playbook.plays.findIndex((p) => p.id === fromId);
        if (from < 0) return;
        const [item] = s.playbook.plays.splice(from, 1);
        s.playbook.plays.splice(Math.max(0, Math.min(s.playbook.plays.length, toIndex)), 0, item);
      }, { reason: 'plays' });
    },
    updatePlay(patch, opts = {}) {
      const play = getPlay();
      if (!play) return;
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        Object.assign(p, patch);
        p.meta = { ...p.meta, updatedAt: Date.now() };
      }, { history: opts.history !== false, silent: opts.silent, reason: 'play' });
    },
    addPlayer(player, opts = {}) {
      const play = getPlay();
      if (!play) return null;
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        p.players.push(player);
        s.selection = { ids: [player.id], editing: null };
      }, { history: opts.history !== false, reason: 'players' });
      return player;
    },
    removePlayers(ids) {
      const play = getPlay();
      if (!play) return;
      const set = new Set(ids);
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        p.players = p.players.filter((pl) => !set.has(pl.id));
        // limpia asignaciones man que apuntaban a los eliminados
        for (const pl of p.players) {
          if (pl.assignment?.type === 'man' && set.has(pl.assignment.targetId)) {
            pl.assignment = { type: 'zone', landmark: { x: pl.pos.x, y: pl.pos.y + 6 }, depth: 6 };
          }
        }
        if (p.ball?.targetId && set.has(p.ball.targetId)) p.ball.targetId = null;
        s.selection = { ids: [], editing: null };
      }, { reason: 'players' });
    },
    updatePlayer(id, patch, opts = {}) {
      update((s) => {
        const p = getPlay() && s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        const pl = p.players.find((x) => x.id === id);
        if (!pl) return;
        Object.assign(pl, patch);
        p.meta.updatedAt = Date.now();
      }, { history: opts.history !== false, silent: opts.silent, reason: opts.reason || 'player' });
    },
    updateSelected(patch, opts = {}) {
      const ids = state.selection.ids.slice();
      if (!ids.length) return;
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        for (const pl of p.players) if (ids.includes(pl.id)) Object.assign(pl, patch);
      }, { history: opts.history !== false, silent: opts.silent, reason: opts.reason || 'player' });
    },
    setPath(playerId, path, opts = {}) {
      actions.updatePlayer(playerId, { path }, opts);
    },
    setAssignment(playerId, assignment, opts = {}) {
      actions.updatePlayer(playerId, { assignment }, opts);
    },
    setBall(patch, opts = {}) {
      const play = getPlay();
      if (!play) return;
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        p.ball = { ...p.ball, ...patch };
      }, { history: opts.history !== false, silent: opts.silent, reason: 'ball' });
    },
    /** Cambia la apariencia global (campo, jugadores, rutas). */
    setAppearance(patch, opts = {}) {
      update((s) => {
        s.playbook.appearance = normalizeAppearance({ ...s.playbook.appearance, ...patch });
      }, { history: opts.history !== false, silent: opts.silent, reason: 'appearance' });
    },
    resetAppearance() {
      update((s) => {
        s.playbook.appearance = { ...DEFAULT_APPEARANCE };
      }, { reason: 'appearance' });
    },
    /** Aplica un estilo a uno o varios jugadores. patch con null limpia el valor. */
    setPlayerStyle(ids, patch, opts = {}) {
      const list = Array.isArray(ids) ? ids : [ids];
      if (!list.length) return;
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        for (const pl of p.players) {
          if (!list.includes(pl.id)) continue;
          const merged = normalizePlayerStyle({ ...(pl.style || {}), ...patch });
          pl.style = compactStyle(merged);
        }
        p.meta.updatedAt = Date.now();
      }, { history: opts.history !== false, silent: opts.silent, reason: 'style' });
    },
    /** Quita todo el estilo propio de los jugadores indicados. */
    clearPlayerStyle(ids) {
      const list = Array.isArray(ids) ? ids : [ids];
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        for (const pl of p.players) if (list.includes(pl.id)) pl.style = null;
      }, { reason: 'style' });
    },
    /** Asigna a cada jugador el color de su rol (mariscal, receptor, corredor…). */
    colorByRole() {
      const ROLE_COLORS = {
        qb: '#9ae63f',
        c: '#a3b8c2',
        wr: '#8ee6ff',
        rb: '#ffd166',
        te: '#d7a8ff',
        dl: '#ff7a5c',
        lb: '#ff9d43',
        db: '#ff6b9d',
        s: '#c07cff',
      };
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        for (const pl of p.players) {
          const color = ROLE_COLORS[pl.role];
          if (!color) continue;
          pl.style = compactStyle({ ...(pl.style || {}), color, ink: null });
        }
      }, { reason: 'style' });
    },
    /** Quita el color propio de todos los jugadores de la jugada. */
    clearAllPlayerColors() {
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        for (const pl of p.players) {
          if (!pl.style) continue;
          pl.style = compactStyle({ ...pl.style, color: null, ink: null });
        }
      }, { reason: 'style' });
    },
    /** Copia el estilo de un jugador a todos los del mismo equipo (o a todos). */
    applyStyleToTeam(sourceId, team) {
      update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        const src = p.players.find((x) => x.id === sourceId);
        if (!src) return;
        for (const pl of p.players) {
          if (team && pl.team !== team) continue;
          pl.style = src.style ? { ...src.style } : null;
        }
      }, { reason: 'style' });
    },
    renamePlaybook(name) {
      update((s) => {
        s.playbook.name = name;
      }, { reason: 'playbook' });
    },
    addFolder(name, color) {
      const limpio = String(name || '').trim() || 'Carpeta';
      const f = {
        id: uid('f'),
        name: uniqueFolderName(limpio),
        color: color || FOLDER_COLORS[0],
        playIds: [],
        createdAt: Date.now(),
      };
      update((s) => s.playbook.folders.push(f), { reason: 'folders' });
      return f;
    },
    removeFolder(id) {
      update((s) => {
        s.playbook.folders = s.playbook.folders.filter((f) => f.id !== id);
      }, { reason: 'folders' });
    },
    setRoster(roster) {
      update((s) => {
        s.playbook.roster = roster;
      }, { reason: 'roster' });
    },
    /** Guarda (o crea) una ruta propia de la libreta. */
    saveRoute(route) {
      if (!route) return null;
      const clean = normalizeRoute(route);
      if (!clean) return null;
      update((s) => {
        if (!Array.isArray(s.playbook.customRoutes)) s.playbook.customRoutes = [];
        const i = s.playbook.customRoutes.findIndex((r) => r.id === clean.id);
        if (i >= 0) s.playbook.customRoutes[i] = clean;
        else s.playbook.customRoutes.push(clean);
      }, { reason: 'routes' });
      return clean;
    },
    removeRoute(id) {
      update((s) => {
        s.playbook.customRoutes = (s.playbook.customRoutes || []).filter((r) => r.id !== id);
      }, { reason: 'routes' });
    },
    /** Crea una ruta propia a partir de una plantilla (o vacía). */
    duplicateRoute(source, nameSuffix = ' (copia)') {
      const base = source
        ? { name: String(source.name || 'Ruta') + nameSuffix, category: source.category, desc: source.desc, points: source.points, mirror: source.mirror }
        : { name: 'Ruta nueva' };
      const route = createRoute({ ...base, id: undefined });
      update((s) => {
        if (!Array.isArray(s.playbook.customRoutes)) s.playbook.customRoutes = [];
        s.playbook.customRoutes.push(route);
      }, { reason: 'routes' });
      return route;
    },
    /** Guarda (o crea) un árbol de rutas en la libreta. */
    saveTree(tree) {
      if (!tree || !tree.id) return null;
      update((s) => {
        if (!Array.isArray(s.playbook.trees)) s.playbook.trees = [];
        const i = s.playbook.trees.findIndex((t) => t.id === tree.id);
        if (i >= 0) s.playbook.trees[i] = tree;
        else s.playbook.trees.push(tree);
      }, { reason: 'trees' });
      return tree;
    },
    removeTree(id) {
      update((s) => {
        s.playbook.trees = (s.playbook.trees || []).filter((t) => t.id !== id);
      }, { reason: 'trees' });
    },
    replacePlaybook(book, opts = {}) {
      update((s) => {
        s.playbook = normalizePlaybook(book);
        s.playId = s.playbook.plays[0]?.id || null;
        s.selection = { ids: [], editing: null };
      }, { history: opts.history !== false, reason: 'replace' });
    },
    resetAll() {
      past = [];
      future = [];
      update((s) => {
        s.playbook = seedPlaybook();
        s.playId = s.playbook.plays[0].id;
        s.selection = { ids: [], editing: null };
      }, { reason: 'replace' });
    },
  };


  /** Nombre de carpeta sin repetir: «Plantilla», «Plantilla 2»… */
  function uniqueFolderName(base) {
    const existentes = new Set((state.playbook.folders || []).map((f) => f.name));
    if (!existentes.has(base)) return base;
    let n = 2;
    while (existentes.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
  }

  function uniqueName(base) {
    const names = new Set(state.playbook.plays.map((p) => p.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (${i})`)) i++;
    return `${base} (${i})`;
  }

  return {
    state,
    getPlay,
    getPlaybook: () => state.playbook,
    getAppearance: () => normalizeAppearance(state.playbook.appearance),
    getTrees: () => state.playbook.trees || [],
    getFolders: () => state.playbook.folders || [],
    getFolder(id) {
      return (state.playbook.folders || []).find((f) => f.id === id) || null;
    },
    /** Jugadas de una carpeta, en su orden y sin ids huérfanos. */
    getPlaysInFolder(id) {
      const f = (state.playbook.folders || []).find((x) => x.id === id);
      if (!f) return [];
      const byId = new Map(state.playbook.plays.map((p) => [p.id, p]));
      return f.playIds.map((pid) => byId.get(pid)).filter(Boolean);
    },
    /** Carpetas a las que pertenece una jugada. */
    getFoldersOfPlay(playId) {
      return (state.playbook.folders || []).filter((f) => f.playIds.includes(playId));
    },
    getCustomRoutes: () => state.playbook.customRoutes || [],
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    emit,
    update,
    begin,
    end,
    cancel,
    undo,
    redo,
    canUndo,
    canRedo,
    selectPlay,
    selectPlayers,
    getSelectedPlayers,
    setUI,
    actions,
    persist,
    _snapshot: snapshot,
  };
}

/** Libreta de arranque: usa los presets si están disponibles. */
function seedPlaybook() {
  const book = emptyPlaybook('Mi libreta');
  return book;
}

/** Rellena una libreta vacía con jugadas de ejemplo (asíncrono, desde presets). */
export async function seedWithPresets(store) {
  if (store.getPlaybook().plays.length > 0) return false;
  try {
    const { STARTER_PLAYS } = await import('./presets.js');
    if (!Array.isArray(STARTER_PLAYS) || !STARTER_PLAYS.length) return false;
    const plays = STARTER_PLAYS.slice(0, 12).map((p) => clonePlay(p, ''));
    store.update((s) => {
      s.playbook.plays = plays;
      s.playId = plays[0].id;
      s.selection = { ids: [], editing: null };
    }, { history: false, reason: 'seed' });
    return true;
  } catch (err) {
    console.warn('[store] sin presets', err);
    return false;
  }
}
