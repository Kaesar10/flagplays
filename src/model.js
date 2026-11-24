// Modelo de datos de FlagPlays: creación, normalización, validación y serialización.
// Este módulo NO toca el DOM (se puede importar en Node).
import { DEFAULT_FIELD, FORMATS } from './field.js';
import { DEFAULT_APPEARANCE, normalizeAppearance, normalizePlayerStyle } from './appearance.js';

let counter = 0;
export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Roles y su presentación. */
export const ROLES = {
  qb: { label: 'Mariscal', short: 'QB', offense: true, colorVar: '--role-qb' },
  c: { label: 'Center', short: 'C', offense: true, colorVar: '--role-c' },
  wr: { label: 'Receptor', short: 'WR', offense: true, colorVar: '--role-wr' },
  rb: { label: 'Corredor', short: 'RB', offense: true, colorVar: '--role-rb' },
  te: { label: 'Ala cerrada', short: 'TE', offense: true, colorVar: '--role-te' },
  dl: { label: 'Rusher', short: 'RUS', offense: false, colorVar: '--role-dl' },
  lb: { label: 'Linebacker', short: 'LB', offense: false, colorVar: '--role-lb' },
  db: { label: 'Esquinero', short: 'CB', offense: false, colorVar: '--role-db' },
  s: { label: 'Safety', short: 'S', offense: false, colorVar: '--role-s' },
};

export const P_CATEGORIES = [
  'Pase corto',
  'Pase medio',
  'Pase profundo',
  'Carrera',
  'Juego de engaño',
  'Conversión',
  'Zona',
  'Hombre',
  'Presión',
];

export const PATH_TYPES = {
  route: { label: 'Ruta', dash: null },
  motion: { label: 'Movimiento', dash: '6 5' },
  rush: { label: 'Rush', dash: null },
  zone: { label: 'Zona', dash: '4 4' },
  block: { label: 'Bloqueo', dash: '2 4' },
  handoff: { label: 'Entrega', dash: '10 4' },
};

export function defaultField(format = 7) {
  const f = FORMATS[format] || FORMATS[7];
  return { width: f.width, depth: f.depth, ez: f.ez };
}

export function createPlayer(partial = {}) {
  const role = partial.role || (partial.team === 'defense' ? 'db' : 'wr');
  return {
    id: partial.id || uid('p'),
    team: partial.team || 'offense',
    pos: { x: Number(partial.pos?.x ?? 0), y: Number(partial.pos?.y ?? 0) },
    label: partial.label ?? ROLES[role]?.short ?? 'X',
    role,
    number: partial.number ?? '',
    path: Array.isArray(partial.path) && partial.path.length ? partial.path.map(normPt) : null,
    pathType: partial.pathType || (partial.team === 'defense' ? 'rush' : 'route'),
    assignment: partial.assignment ?? null,
    style: compactStyle(partial.style),
  };
}

/** Devuelve null si el estilo no aporta nada (para no engordar el JSON). */
export function compactStyle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const st = normalizePlayerStyle(raw);
  const empty = !st.color && !st.ink && !st.shape && st.size == null && !st.routeColor && !st.routeStyle;
  return empty ? null : st;
}

function normPt(p) {
  return {
    x: Number(p.x) || 0,
    y: Number(p.y) || 0,
    curve: p.curve === 'smooth' ? 'smooth' : 'line',
  };
}

export function createPlay(partial = {}) {
  const now = Date.now();
  const format = partial.format || 7;
  return {
    id: partial.id || uid('play'),
    name: partial.name || 'Jugada sin nombre',
    type: partial.type === 'defense' ? 'defense' : 'offense',
    formation: partial.formation || '',
    category: partial.category || 'Pase corto',
    tags: Array.isArray(partial.tags) ? partial.tags.slice(0, 12) : [],
    notes: partial.notes || '',
    field: { ...defaultField(format), ...(partial.field || {}) },
    players: Array.isArray(partial.players) ? partial.players.map(createPlayer) : [],
    ball: {
      targetId: partial.ball?.targetId ?? null,
      releaseAt: Math.max(0, Number(partial.ball?.releaseAt ?? 0.9)),
    },
    meta: {
      createdAt: partial.meta?.createdAt || now,
      updatedAt: now,
      version: 1,
    },
  };
}

/** Jugada de prueba vacía: 5 jugadores de ofensiva en formación básica. */
export function blankPlay(type = 'offense') {
  const field = defaultField(5);
  if (type === 'defense') {
    return createPlay({
      name: 'Defensa nueva',
      type: 'defense',
      field,
      players: [
        createPlayer({ team: 'defense', role: 'dl', label: 'R1', number: '1', pos: { x: -1.5, y: 1 } }),
        createPlayer({ team: 'defense', role: 'lb', label: 'M', number: '2', pos: { x: 0, y: 6 } }),
        createPlayer({ team: 'defense', role: 'db', label: 'CB', number: '3', pos: { x: -12, y: 6 } }),
        createPlayer({ team: 'defense', role: 'db', label: 'CB', number: '4', pos: { x: 12, y: 6 } }),
        createPlayer({ team: 'defense', role: 's', label: 'S', number: '5', pos: { x: 0, y: 14 } }),
      ],
    });
  }
  return createPlay({
    name: 'Jugada nueva',
    type: 'offense',
    field,
    players: [
      createPlayer({ team: 'offense', role: 'qb', label: 'QB', number: '1', pos: { x: 0, y: -4 } }),
      createPlayer({ team: 'offense', role: 'c', label: 'C', number: '2', pos: { x: 0, y: -1 } }),
      createPlayer({ team: 'offense', role: 'wr', label: 'X', number: '3', pos: { x: -14, y: 0 } }),
      createPlayer({ team: 'offense', role: 'wr', label: 'Y', number: '4', pos: { x: 10, y: 0 } }),
      createPlayer({ team: 'offense', role: 'rb', label: 'R', number: '5', pos: { x: 5, y: -2 } }),
    ],
  });
}

function normalizeBall(ball) {
  return {
    targetId: ball?.targetId ?? null,
    releaseAt: Math.max(0, Number(ball?.releaseAt ?? 0.9)),
  };
}

/** Migra y valida datos que vienen de disco / URL. Lanza si es irreconocible. */
export function normalizePlay(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Jugada inválida');
  const players = (Array.isArray(raw.players) ? raw.players : []).map((p) =>
    createPlayer({
      ...p,
      pos: p.pos || { x: 0, y: 0 },
      team: p.team === 'defense' ? 'defense' : 'offense',
    })
  );
  const ids = new Set(players.map((p) => p.id));
  const play = createPlay({
    ...raw,
    players,
    field: { ...DEFAULT_FIELD, ...(raw.field || {}) },
    meta: { createdAt: raw.meta?.createdAt || Date.now(), updatedAt: Date.now(), version: 1 },
  });
  play.ball = ids.has(raw.ball?.targetId) ? normalizeBall(raw.ball) : { targetId: null, releaseAt: 0.9 };
  return play;
}

export function clonePlay(play, nameSuffix = ' (copia)') {
  const now = Date.now();
  const idMap = new Map();
  const players = play.players.map((p) => {
    const nid = uid('p');
    idMap.set(p.id, nid);
    return createPlayer({
      ...p,
      id: nid,
      pos: { ...p.pos },
      path: p.path ? p.path.map((pt) => ({ ...pt })) : null,
      assignment: p.assignment ? remapAssignment(p.assignment, idMap) : null,
      style: p.style ? { ...p.style } : null,
    });
  });
  // Reasigna referencias man-to-man con el mapa completo
  for (const p of players) {
    if (p.assignment?.type === 'man' && p.assignment.targetId) {
      p.assignment = {
        ...p.assignment,
        targetId: idMap.get(p.assignment.targetId) || p.assignment.targetId,
      };
    }
  }
  return {
    ...structuredCloneish(play),
    id: uid('play'),
    name: play.name + nameSuffix,
    players,
    ball: { ...play.ball, targetId: play.ball?.targetId ? idMap.get(play.ball.targetId) || null : null },
    meta: { createdAt: now, updatedAt: now, version: 1 },
  };
}

function remapAssignment(a, map) {
  if (a?.type === 'man' && a.targetId) return { ...a, targetId: map.get(a.targetId) || a.targetId };
  return a ? { ...a } : null;
}

function structuredCloneish(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function validatePlay(play) {
  const errors = [];
  if (!play || typeof play !== 'object') return { ok: false, errors: ['Jugada vacía'] };
  if (!play.name || !String(play.name).trim()) errors.push('Falta el nombre');
  if (!Array.isArray(play.players) || play.players.length === 0) errors.push('No hay jugadores');
  const off = (play.players || []).filter((p) => p.team === 'offense').length;
  const def = (play.players || []).filter((p) => p.team === 'defense').length;
  if (!off) errors.push('Falta la ofensiva');
  if (play.type === 'offense' && !play.players?.some((p) => p.role === 'qb'))
    errors.push('La ofensiva no tiene mariscal');
  if (play.type === 'offense' && !play.players?.some((p) => p.path?.length))
    errors.push('Ninguna ruta dibujada');
  return { ok: errors.length === 0, errors, off, def };
}

export function playToJSON(play) {
  return JSON.stringify(play);
}

export function playFromJSON(str) {
  return normalizePlay(JSON.parse(str));
}

/** Ruta propia (creada o duplicada por el usuario). Coordenadas en yardas locales. */
export function createRoute(partial = {}) {
  const pts = (Array.isArray(partial.points) ? partial.points : [])
    .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map((p) => ({ x: Math.round(Number(p.x) * 10) / 10, y: Math.round(Number(p.y) * 10) / 10 }))
    .slice(0, 16);
  return {
    id: partial.id || uid('route'),
    name: String(partial.name || 'Ruta nueva').slice(0, 60),
    category: String(partial.category || 'Corta').slice(0, 30),
    desc: String(partial.desc || '').slice(0, 200),
    mirror: partial.mirror === true,
    builtin: false,
    points: pts.length ? pts : [{ x: 3, y: 8 }],
    meta: { createdAt: partial.meta?.createdAt || Date.now(), updatedAt: Date.now() },
  };
}

export function normalizeRoute(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const route = createRoute(raw);
  route.builtin = false;
  return route;
}

export function emptyPlaybook(name = 'Mi libreta') {
  return {
    id: uid('book'),
    name,
    version: 1,
    plays: [],
    folders: [
      { id: 'f_off', name: 'Ofensiva', color: '#b4f13f', playIds: [] },
      { id: 'f_def', name: 'Defensiva', color: '#ff8a6a', playIds: [] },
    ],
    roster: [],
    seeded: false,
    appearance: { ...DEFAULT_APPEARANCE },
    trees: [],
    customRoutes: [],
    settings: { field: 5, units: 'yd', showDefense: true, theme: 'turf' },
  };
}

export function normalizePlaybook(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Libreta inválida');
  const book = emptyPlaybook(raw.name || 'Mi libreta');
  book.id = raw.id || book.id;
  book.plays = (Array.isArray(raw.plays) ? raw.plays : []).map((p) => normalizePlay(p));
  if (Array.isArray(raw.folders) && raw.folders.length) {
    const validos = new Set(book.plays.map((p) => p.id));
    book.folders = raw.folders
      .filter((f) => f && f.id && f.name)
      .map((f) => ({
        id: f.id,
        name: String(f.name),
        color: f.color || '#b4f13f',
        // Solo ids que existan en esta libreta: si no, la carpeta queda vacía.
        playIds: (Array.isArray(f.playIds) ? f.playIds : []).filter((id) => validos.has(id)),
      }));
  }
  book.roster = (Array.isArray(raw.roster) ? raw.roster : [])
    .filter((r) => r && r.name)
    .map((r) => ({ id: r.id || uid('r'), name: String(r.name), number: String(r.number ?? '') }));
  book.settings = { ...book.settings, ...(raw.settings || {}) };
  book.seeded = !!raw.seeded;
  book.appearance = normalizeAppearance(raw.appearance);
  book.trees = Array.isArray(raw.trees) ? raw.trees.filter((t) => t && t.nodes).slice(0, 40) : [];
  book.customRoutes = (Array.isArray(raw.customRoutes) ? raw.customRoutes : [])
    .map(normalizeRoute)
    .filter(Boolean)
    .slice(0, 120);
  book.version = 1;
  return book;
}

/** Cuántos jugadores tiene cada tipo en una jugada. */
export function countByTeam(play) {
  const off = play.players.filter((p) => p.team === 'offense');
  const def = play.players.filter((p) => p.team === 'defense');
  return { offense: off.length, defense: def.length };
}

/** Etiqueta corta de la jugada: "5v5 · Pase corto". */
export function playSubtitle(play) {
  const f = play.field?.width || 40;
  const closest = Object.values(FORMATS).find((x) => Math.abs(x.width - f) < 3);
  return `${closest ? closest.label : `${countByTeam(play).offense}`} · ${play.category}`;
}
