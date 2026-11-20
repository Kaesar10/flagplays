// Catálogo de jugadas: construcción de jugadas completas a partir de las
// definiciones cortas y filtrado por categorías.
import { CATALOG_FORMATIONS, CATALOG_PLAYS } from './catalog-data.js';
import { CLUB_PLAYS } from './club-plays.js';
import { ROUTES, FORMATIONS } from './presets.js';

/** Formación de la app que mejor representa cada formación del playbook. */
const APP_FORMATION = {
  'slot-right': 'spread-5',
  'slot-left': 'spread-5',
  'trips-right': 'trips-right-5',
  'bunch-right': 'bunch-right-5',
  cerrada: 'conversion-5',
  india: 'double-slot-5',
};

const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));

let seq = 0;
function nextId(prefix) {
  seq += 1;
  return `${prefix}_${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Convierte la ruta declarada (en DELTAS desde el receptor, como las plantillas
 * de `presets.js`) al `path` ABSOLUTO del modelo, que arranca en la posición
 * del jugador. El renderer pinta `[pos, ...path]` tal cual.
 */
function pathFor(spec, pos) {
  if (!spec) return null;
  const base = { x: Number(pos && pos.x) || 0, y: Number(pos && pos.y) || 0 };
  // Las plantillas están dibujadas para un receptor de la izquierda: si el
  // jugador va por la derecha, se espeja el eje X (in/out/flat quedan bien).
  const flip = base.x > 0 ? -1 : 1;
  const toAbsolute = (points, mirror) =>
    points.map((p) => ({
      x: r2(base.x + (mirror ? flip * Number(p.x) : Number(p.x))),
      y: r2(base.y + Number(p.y)),
      curve: 'line',
    }));
  if (typeof spec === 'string') {
    const route = ROUTE_BY_ID.get(spec);
    if (!route) return null;
    return toAbsolute(route.points, true);
  }
  // Las carreras y las rutas a medida ya vienen con su dirección pensada.
  if (spec.type === 'run') return toAbsolute(spec.points || [], false);
  if (Array.isArray(spec.points)) return toAbsolute(spec.points, false);
  return null;
}

/** Categoría de libreta a partir del tipo del catálogo. */
function categoryOf(entry) {
  if (entry.kind === 'Carrera') return 'Carrera';
  if (entry.depth === 'Profunda') return 'Pase profundo';
  if (entry.depth === 'Media') return 'Pase medio';
  return 'Pase corto';
}

/**
 * Construye una jugada completa y editable a partir de una entrada del catálogo.
 * @param {object} entry
 * @returns {object} jugada del modelo
 */
export function buildCatalogPlay(entry) {
  const formation = CATALOG_FORMATIONS[entry.formation] || CATALOG_FORMATIONS['slot-right'];
  const players = formation.players.map((spec, index) => {
    const meta = entry.meta && entry.meta[spec.label];
    const path = pathFor(entry.routes && entry.routes[spec.label], spec);
    return {
      id: nextId('p'),
      team: 'offense',
      pos: { x: spec.x, y: spec.y },
      label: spec.label,
      role: spec.role,
      number: String(index + 1),
      path: path || null,
      pathType: entry.run ? 'run' : 'route',
      assignment: null,
      style: null,
      ...(meta || {}),
    };
  });

  const targetLabel = entry.ball || 'X';
  const target = players.find((p) => p.label === targetLabel) || players.find((p) => p.role === 'wr');

  return {
    id: nextId('play'),
    name: entry.name,
    type: 'offense',
    formation: APP_FORMATION[entry.formation] || 'spread-5',
    category: categoryOf(entry),
    tags: [...new Set([...(entry.concept || []), entry.kind, entry.depth].filter(Boolean))],
    notes: [entry.reading ? `Lectura: ${entry.reading}` : '', entry.tip ? `Truco: ${entry.tip}` : '', entry.when ? `Cuándo: ${entry.when}` : '']
      .filter(Boolean)
      .join(' '),
    field: { width: 30, depth: 24, ez: 10 },
    players,
    ball: { targetId: target ? target.id : null, releaseAt: entry.run ? 0.4 : 2 },
    catalog: {
      id: entry.id,
      source: 'Playbook Harriers Sub15',
      kind: entry.kind,
      depth: entry.depth,
      side: entry.side,
      vs: [...(entry.vs || [])],
      zone: entry.zone,
      concept: [...(entry.concept || [])],
      formation: formation.name,
      reading: entry.reading || '',
      tip: entry.tip || '',
      when: entry.when || '',
    },
    meta: { createdAt: Date.now(), updatedAt: Date.now() },
  };
}

/** Nombre corto de formación para bautizar las jugadas: «Slot Drch 1». */
const SHORT_FORMATION = [
  [/^slot derecha/i, 'Slot Drch'],
  [/^slot izquierda/i, 'Slot Izq'],
  [/^trips derecha/i, 'Trips Drch'],
  [/^trips izquierda/i, 'Trips Izq'],
  [/^bunch derecha/i, 'Bunch Drch'],
  [/^bunch izquierda/i, 'Bunch Izq'],
  [/^doble slot/i, 'Doble Slot'],
  [/^cerrada/i, 'Cerrada'],
  [/^india/i, 'India'],
  [/^spread/i, 'Spread'],
  [/^empty/i, 'Empty'],
  [/^stack/i, 'Stack'],
  [/^twins/i, 'Twins'],
];

/** «Trips Derecha 5v5» → «Trips Drch». */
function shortFormation(label) {
  const texto = String(label || '').trim();
  for (const [re, corto] of SHORT_FORMATION) if (re.test(texto)) return corto;
  return texto || 'Jugada';
}

/** Posición por defecto de los jugadores que no aparecen en el dibujo. */
const DEFAULT_SLOTS = {
  QB: { role: 'qb', x: 0, y: -4.5 },
  C: { role: 'c', x: 0, y: 0 },
  X: { role: 'wr', x: -11, y: 0 },
  Y: { role: 'wr', x: 5, y: 0 },
  Z: { role: 'wr', x: 9, y: 0 },
};

/** Formación de la app que mejor encaja con las posiciones detectadas. */
const FORMATION_NAME = new Map((FORMATIONS || []).map((f) => [f.id, f.name]));

function formationOfClub(players) {
  const ws = players.filter((p) => p.label !== 'QB' && p.label !== 'C');
  const derecha = ws.filter((p) => p.x > 3).length;
  const izquierda = ws.filter((p) => p.x < -3).length;
  if (derecha >= 2 && izquierda >= 1) return 'trips-right-5';
  if (izquierda >= 2 && derecha >= 1) return 'trips-left-5';
  if (derecha >= 2) return 'bunch-right-5';
  return 'spread-5';
}

/** Convierte una jugada extraída del club en una entrada del catálogo. */
function clubEntry(clubPlay, index) {
  const detectados = new Map();
  for (const p of clubPlay.players) {
    if (!DEFAULT_SLOTS[p.label] || detectados.has(p.label)) continue;
    detectados.set(p.label, p);
  }
  const labels = ['QB', 'C', 'X', 'Y', 'Z'];
  const players = labels.map((label) => {
    const detectado = detectados.get(label);
    const base = DEFAULT_SLOTS[label];
    return { label, role: base.role, x: detectado ? Number(detectado.x) : base.x, y: detectado ? Number(detectado.y) : base.y };
  });

  // Metadatos a partir de las rutas asignadas.
  const routeIds = Object.values(clubPlay.routes || {});
  const profundidades = [];
  const concept = new Set();
  for (const id of routeIds) {
    const route = ROUTE_BY_ID.get(id);
    if (!route) continue;
    concept.add(id);
    profundidades.push(Math.max(...route.points.map((pt) => Number(pt.y) || 0)));
  }
  // La profundidad de la jugada es la mediana de sus rutas (una vertical suelta
  // no convierte toda la jugada en profunda).
  profundidades.sort((a, b) => a - b);
  const depthYd = profundidades.length ? profundidades[Math.floor(profundidades.length / 2)] : 0;
  const depth = depthYd >= 12 ? 'Profunda' : depthYd >= 7 ? 'Media' : 'Corta';
  const conRuta = players.filter((p) => clubPlay.routes && clubPlay.routes[p.label]);
  const mediaX = conRuta.length ? conRuta.reduce((acc, p) => acc + p.x, 0) / conRuta.length : 0;
  const side = Math.abs(mediaX) < 3 ? 'Centro' : mediaX > 0 ? 'Derecha' : 'Izquierda';

  return {
    id: clubPlay.id,
    name: String(clubPlay.name || `Club ${index + 1}`).toUpperCase(),
    formation: 'club',
    formationLabel: FORMATION_NAME.get(formationOfClub(players)) || 'Spread 5v5',
    kind: 'Pase',
    depth,
    side,
    vs: ['Hombre', 'Zona'],
    zone: 'Campo',
    concept: [...concept],
    source: 'Club (PDF)',
    routes: {},
    ball: conRuta[0] ? conRuta[0].label : 'X',
    reading: 'Jugada reconstruida del playbook del club (dibujo vectorial del PDF).',
    tip: 'Las rutas se han ajustado a las plantillas de la app: revísala antes de usarla en partido.',
    when: `Aparece en «${clubPlay.source}».`,
    club: {
      players,
      routes: clubPlay.routes || {},
      source: clubPlay.source,
    },
  };
}

/** Construye la jugada completa de una entrada del club. */
function buildClubPlay(entry) {
  const players = entry.club.players.map((spec, index) => {
    const routeId = entry.club.routes[spec.label];
    const path = pathFor(routeId, spec);
    return {
      id: nextId('p'),
      team: 'offense',
      pos: { x: r2(spec.x), y: r2(spec.y) },
      label: spec.label,
      role: spec.role,
      number: String(index + 1),
      path: path || null,
      pathType: 'route',
      assignment: null,
      style: null,
    };
  });
  const target = players.find((p) => p.label === entry.ball) || players.find((p) => p.path);
  return {
    id: nextId('play'),
    name: entry.name,
    type: 'offense',
    formation: entry.formationLabel,
    category: entry.depth === 'Profunda' ? 'Pase profundo' : entry.depth === 'Media' ? 'Pase medio' : 'Pase corto',
    tags: [...new Set([...entry.concept, 'club'])],
    notes: `${entry.reading} ${entry.tip} ${entry.when}`.trim(),
    field: { width: 30, depth: 24, ez: 10 },
    players,
    ball: { targetId: target ? target.id : null, releaseAt: 2 },
    catalog: {
      id: entry.id,
      source: entry.source,
      kind: entry.kind,
      depth: entry.depth,
      side: entry.side,
      vs: [...entry.vs],
      zone: entry.zone,
      concept: [...entry.concept],
      formation: entry.formationLabel,
      reading: entry.reading,
      tip: entry.tip,
      when: entry.when,
    },
    meta: { createdAt: Date.now(), updatedAt: Date.now() },
  };
}

/** Todas las jugadas del catálogo ya construidas (se cachean). */
let cache = null;
export function allCatalogPlays() {
  if (cache) return cache;
  const base = CATALOG_PLAYS.map((entry) => {
    const play = buildCatalogPlay(entry);
    return {
      ...entry,
      source: 'Playbook Sub15',
      play,
      formationLabel: (CATALOG_FORMATIONS[entry.formation] || {}).name || entry.formation,
      cid: entry.id,
    };
  });
  const club = CLUB_PLAYS.map((clubPlay, index) => {
    const entry = clubEntry(clubPlay, index);
    return { ...entry, play: buildClubPlay(entry), cid: entry.id };
  });

  // Bautizo sistemático: «formación corta + número» por formación.
  const contador = new Map();
  cache = [...base, ...club].map((item) => {
    const corto = shortFormation(item.formationLabel);
    const numero = (contador.get(corto) || 0) + 1;
    contador.set(corto, numero);
    const nombre = `${corto} ${numero}`;
    item.originalName = item.name;
    item.name = nombre;
    item.formationShort = corto;
    if (item.play) item.play.name = nombre;
    return item;
  });
  return cache;
}

/** Valor de un campo del catálogo (sirve tanto para entradas como para jugadas). */
function fieldOf(item, key) {
  if (key === 'formation') {
    return item.formationLabel || (item.catalog ? item.catalog.formation : item.formation);
  }
  if (item.catalog) return item.catalog[key];
  return item[key];
}

/** Facetas de filtrado con sus valores posibles. */
export function catalogFacets(items = allCatalogPlays()) {
  const uniq = (values) => [...new Set(values.flat().filter(Boolean))];
  return [
    { id: 'kind', label: 'Tipo', values: ['Pase', 'Carrera', 'Engaño'] },
    { id: 'depth', label: 'Distancia', values: ['Corta', 'Media', 'Profunda'] },
    { id: 'side', label: 'Zona que ataca', values: ['Izquierda', 'Centro', 'Derecha', 'Ambos lados'] },
    { id: 'vs', label: 'Contra defensa', values: ['Hombre', 'Zona'], multi: true },
    { id: 'zone', label: 'Situación', values: ['Campo', 'Zona roja'] },
    { id: 'formation', label: 'Formación', values: uniq(items.map((i) => i.formationLabel || '')) },
    { id: 'concept', label: 'Concepto', values: uniq(items.map((i) => i.concept || [])), multi: true },
  ];
}

/** Normaliza el texto para buscar sin tildes ni mayúsculas. */
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filtra el catálogo.
 * @param {object} filters  { kind:[], depth:[], side:[], vs:[], zone:[], formation:[], concept:[], q:'' }
 * @param {Array} items
 */
export function filterCatalog(filters = {}, items = allCatalogPlays()) {
  const activos = Object.entries(filters || {}).filter(
    ([key, value]) => key !== 'q' && Array.isArray(value) && value.length
  );
  const q = normalizeText(filters.q || '');
  return items.filter((item) => {
    for (const [key, values] of activos) {
      const raw = fieldOf(item, key);
      const propios = Array.isArray(raw) ? raw : [raw];
      if (!values.some((v) => propios.includes(v))) return false;
    }
    if (q) {
      const texto = normalizeText(
        [item.name, item.originalName, item.formationLabel, fieldOf(item, 'kind'), fieldOf(item, 'depth'), fieldOf(item, 'side'), item.when, item.reading, item.tip]
          .concat(fieldOf(item, 'concept') || [])
          .filter(Boolean)
          .join(' ')
      );
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

/** Cuántas jugadas hay de cada valor (para los contadores de los chips). */
export function catalogCounts(items = allCatalogPlays()) {
  const counts = {};
  for (const facet of catalogFacets(items)) {
    counts[facet.id] = {};
    for (const value of facet.values) counts[facet.id][value] = 0;
  }
  for (const item of items) {
    for (const facet of catalogFacets(items)) {
      const raw = fieldOf(item, facet.id);
      const propios = Array.isArray(raw) ? raw : [raw];
      for (const value of propios) {
        if (counts[facet.id][value] !== undefined) counts[facet.id][value] += 1;
      }
    }
  }
  return counts;
}

/** Resumen de una jugada del catálogo para tarjetas y tooltips. */
export function catalogSummary(item) {
  return {
    id: item.cid,
    name: item.name,
    originalName: item.originalName || '',
    formationShort: item.formationShort || '',
    formation: item.formationLabel,
    kind: fieldOf(item, 'kind'),
    depth: fieldOf(item, 'depth'),
    side: fieldOf(item, 'side'),
    vs: fieldOf(item, 'vs') || [],
    zone: fieldOf(item, 'zone'),
    concept: fieldOf(item, 'concept') || [],
    when: item.when || '',
    reading: item.reading || '',
    tip: item.tip || '',
  };
}
