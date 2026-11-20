// Motor de simulación y análisis de jugadas de flag football.
// Módulo puro ES: sin DOM, sin dependencias. Importable en Node.
//
// Coordenadas en yardas: x=0 centro, +x derecha de la ofensiva; y=0 línea de
// scrimmage (LOS), +y campo profundo (hacia la defensa).
//
// La simulación es determinista: mismo input + mismo nivel => mismo output.
// No hay Math.random en ningún sitio; el "ruido" humano sale de un hash del
// índice del jugador y de funciones seno del tiempo.

export const LEVELS = {
  youth: { label: 'Juvenil', reactDelay: 0.42, speed: 0.82, aggression: 0.55 },
  rec: { label: 'Recreativo', reactDelay: 0.28, speed: 0.93, aggression: 0.75 },
  competitive: { label: 'Competitivo', reactDelay: 0.16, speed: 1.0, aggression: 0.95 },
};

const LEVEL_KEYS = ['youth', 'rec', 'competitive'];
const DEFAULT_FIELD = { width: 40, depth: 26, ez: 10 };

const DT = 1 / 30; // paso fijo de la simulación
const MAX_DURATION = 5; // techo de duración en segundos
const MAX_FRAMES = 151; // ~5 s a 30 fps (incluye el frame t=0)
const OFF_SPEED = 7.5; // yardas/s de los receptores (velocidad de ruta)
const BALL_SPEED = 22; // yardas/s del pase
const CATCH_RADIUS = 1.3; // radio de captura (define "abierto")
const OPEN_SEP = 1.5; // separación mínima para considerar abierto
const TIGHT_SEP = 0.8; // por debajo: tapado
const CONTEST_SEP = 1.0; // por debajo: la defensa rompe el pase
const SACK_RADIUS = 1.1; // radio de sack
const PRESSURE_RADIUS = 2.2; // yd: presión inminente => el QB suelta el balón (hot read)
const HOT_READ_MIN_T = 0.35; // s mínimos de drop para leer la presión
const NO_DEFENDER_SEP = 99; // separación centinela si no hay defensores (JSON-safe)
const QR_EARLY_DELAY = 0.3; // s de lectura antes de lanzar a la ventana alternativa
const MAX_RELEASE_AT = 4.99;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function fmtYd(v) {
  const r = Math.round(v * 10) / 10;
  return String(r);
}

/** Segundos con un decimal y coma decimal ("1,4 s"). */
function fmtSecs(v) {
  const r = Math.round(num(v) * 10) / 10;
  return String(r).replace('.', ',');
}

/** Hash determinista 0..1 a partir de un entero (para el "estilo" de cada jugador). */
function hash01(n) {
  const s = Math.sin((Number(n) + 1) * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function resolveLevel(level) {
  if (level && typeof level === 'object') {
    const key =
      (typeof level.key === 'string' && level.key) ||
      (typeof level.id === 'string' && level.id) ||
      LEVEL_KEYS.find((k) => LEVELS[k] === level) ||
      'custom';
    return {
      key,
      label: level.label || 'Personalizado',
      reactDelay: num(level.reactDelay, LEVELS.rec.reactDelay),
      speed: num(level.speed, LEVELS.rec.speed),
      aggression: num(level.aggression, LEVELS.rec.aggression),
    };
  }
  const key = LEVEL_KEYS.includes(level) ? level : 'rec';
  return { key, ...LEVELS[key] };
}

function levelKey(level) {
  return typeof level === 'string' ? (LEVELS[level] ? level : 'rec') : resolveLevel(level).key;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

/** Prepara una ruta (polilínea desde pos) con longitudes acumuladas. */
function buildRoute(player) {
  const start = { x: num(player?.pos?.x), y: num(player?.pos?.y) };
  const pts = [start];
  const cum = [0];
  let total = 0;
  for (const raw of Array.isArray(player?.path) ? player.path : []) {
    const pt = { x: num(raw?.x), y: num(raw?.y) };
    const prev = pts[pts.length - 1];
    total += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    pts.push(pt);
    cum.push(total);
  }
  return { pts, cum, total };
}

/** Punto a una distancia recorrida (yardas) sobre la ruta. Se detiene al final. */
function routePos(route, travel) {
  if (!route || !route.pts.length) return { x: 0, y: 0 };
  const first = route.pts[0];
  if (travel <= 0 || route.total <= 1e-9) return { x: first.x, y: first.y };
  if (travel >= route.total) {
    const last = route.pts[route.pts.length - 1];
    return { x: last.x, y: last.y };
  }
  let i = 1;
  while (i < route.pts.length - 1 && route.cum[i] < travel) i += 1;
  const a = route.pts[i - 1];
  const b = route.pts[i];
  const segLen = route.cum[i] - route.cum[i - 1];
  const f = segLen > 1e-9 ? (travel - route.cum[i - 1]) / segLen : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Duración de la jugada: la ruta más larga / 7.5 yd/s, acotada a [1.5, 5]. */
export function playDuration(play) {
  const players = Array.isArray(play?.players) ? play.players : [];
  let maxYds = 0;
  for (const p of players) {
    if (!p || !Array.isArray(p.path) || !p.path.length) continue;
    const yds = buildRoute(p).total;
    if (yds > maxYds) maxYds = yds;
  }
  return clamp(Math.max(1.5, maxYds / OFF_SPEED), 1.5, MAX_DURATION);
}

// ---------------------------------------------------------------------------
// Interpolación simple
// ---------------------------------------------------------------------------

/**
 * Posición de cada jugador en el instante `t` siguiendo exclusivamente su ruta.
 * Ofensiva: 7.5 yd/s desde el snap. Defensa: velocidad y retardo del nivel.
 * opts.level es opcional (por compatibilidad con la firma de 2 argumentos).
 */
export function interpolate(play, t, opts = {}) {
  const positions = {};
  const players = Array.isArray(play?.players) ? play.players : [];
  const level = resolveLevel(opts.level);
  const time = Math.max(0, num(t));
  for (const p of players) {
    if (!p || !p.id) continue;
    const route = Array.isArray(p.path) && p.path.length ? buildRoute(p) : null;
    if (route && route.total > 0) {
      const isDefense = p.team === 'defense';
      const delay = isDefense ? level.reactDelay : 0;
      const speed = isDefense ? OFF_SPEED * level.speed : OFF_SPEED;
      positions[p.id] = routePos(route, speed * Math.max(0, time - delay));
    } else {
      positions[p.id] = { x: num(p?.pos?.x), y: num(p?.pos?.y) };
    }
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Apertura (openness)
// ---------------------------------------------------------------------------

function normalizeUnits(list, t) {
  const out = [];
  const items = Array.isArray(list) ? list : [];
  for (const item of items) {
    if (!item) continue;
    const id = item.playerId || item.id || `p${out.length}`;
    if (Number.isFinite(item.x) && Number.isFinite(item.y)) {
      out.push({ playerId: id, x: item.x, y: item.y });
      continue;
    }
    const base = item.pos || { x: 0, y: 0 };
    if (Array.isArray(item.path) && item.path.length) {
      const route = buildRoute(item);
      const delay = item.team === 'defense' ? LEVELS.rec.reactDelay : 0;
      const speed = item.team === 'defense' ? OFF_SPEED * LEVELS.rec.speed : OFF_SPEED;
      const pt = routePos(route, speed * Math.max(0, num(t) - delay));
      out.push({ playerId: id, x: pt.x, y: pt.y });
    } else {
      out.push({ playerId: id, x: num(base.x), y: num(base.y) });
    }
  }
  return out;
}

/**
 * Apertura de cada atacante en el instante `t`.
 * Acepta jugadores del modelo (pos/path) o puntos {playerId,x,y} ya resueltos.
 * state: 'open' (sep >= 1.5) | 'tight' (0.8..1.5) | 'covered' (< 0.8).
 */
export function openness(attackers, defenders, t = 0) {
  const atk = normalizeUnits(attackers, t);
  const def = normalizeUnits(defenders, t);
  const out = new Array(atk.length);
  for (let i = 0; i < atk.length; i += 1) {
    const a = atk[i];
    let sep = NO_DEFENDER_SEP;
    for (let j = 0; j < def.length; j += 1) {
      const d = Math.hypot(a.x - def[j].x, a.y - def[j].y);
      if (d < sep) sep = d;
    }
    out[i] = {
      playerId: a.playerId,
      sep,
      // Abierto = el defensor más cercano está fuera del radio de captura y a 1.5+ yd.
      state:
        sep > CATCH_RADIUS && sep >= OPEN_SEP ? 'open' : sep >= TIGHT_SEP ? 'tight' : 'covered',
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Asignaciones defensivas
// ---------------------------------------------------------------------------

const COVERAGE_DEPTH = { cover0: 0, cover1: 1, cover2: 2, cover3: 3, cover4: 4 };
// Velocidad relativa por rol. Los rushers de línea son lentos (tienen que
// superar el tráfico de la línea), los LBs presionan más rápido y los DBs
// corren casi como un receptor.
const ROLE_SPEED = { dl: 0.5, lb: 0.78, db: 0.98, s: 0.94 };

function roleSpeed(role) {
  return ROLE_SPEED[role] ?? 0.9;
}

function eligibleReceivers(offense) {
  const list = (Array.isArray(offense) ? offense : []).filter(Boolean);
  const elig = list.filter((p) => p.role === 'wr' || p.role === 'te' || p.role === 'rb');
  return elig.length ? elig : list.filter((p) => p.role !== 'qb' && p.role !== 'c');
}

function nearestTo(point, receivers, exclude) {
  let best = null;
  let bestD = Infinity;
  for (const r of receivers) {
    if (!r || (exclude && exclude.has(r.id))) continue;
    const d = dist(point, r.pos || { x: 0, y: 0 });
    if (d < bestD - 1e-9) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/**
 * Resuelve a quién cubre un defensor en hombre.
 * Prioridad: targetId -> markLabel de los presets ("X", "Y", "Z", "C") -> receptor libre más cercano.
 */
function manTargetFor(defender, assignment, offensePlayers, receivers, used) {
  const a = assignment;
  if (a && a.targetId) {
    const hit =
      receivers.find((r) => r.id === a.targetId) || offensePlayers.find((p) => p.id === a.targetId);
    if (hit) return hit;
  }
  if (a && a.markLabel) {
    const hit =
      receivers.find((r) => r.label === a.markLabel) ||
      offensePlayers.find((p) => p.label === a.markLabel);
    if (hit) return hit;
  }
  return (
    nearestTo(defender.pos, receivers, used) ||
    nearestTo(defender.pos, receivers, null) ||
    null
  );
}

function laneOf(defender) {
  const x = num(defender?.pos?.x);
  if (x < -3) return 0;
  if (x > 3) return 2;
  return 1;
}

function zoneFromAssignment(defender, assignment, field) {
  const depth = num(assignment?.depth, num(assignment?.landmark?.y, 8));
  const center = {
    x: num(assignment?.landmark?.x, num(defender?.pos?.x)),
    y: num(assignment?.landmark?.y, depth),
  };
  return { type: 'zone', center, depth: Math.max(depth, center.y), area: 7 };
}

function defaultAssignment(defender, receivers, field) {
  const pos = { x: num(defender?.pos?.x), y: num(defender?.pos?.y) };
  const role = defender?.role;
  if (role === 'dl') return { type: 'rush', lane: laneOf(defender) };
  if (role === 'lb') {
    const depth = Math.max(5, pos.y);
    return { type: 'zone', center: { x: pos.x, y: depth }, depth, area: 7 };
  }
  if (role === 'db') {
    const target = nearestTo(pos, receivers, null);
    return { type: 'man', targetId: target ? target.id : null };
  }
  if (role === 's') {
    const depth = Math.max(14, num(field.depth, 26) * 0.62);
    return { type: 'deep', center: { x: pos.x * 0.4, y: depth }, depth, area: 9 };
  }
  const depth = Math.max(6, pos.y);
  return { type: 'zone', center: { x: pos.x, y: depth }, depth, area: 7 };
}

function coverageCenters(type, field, level) {
  const w = num(field.width, 40);
  const d = num(field.depth, 26);
  const spread = 1 + (level.speed - 0.93) * 0.2; // zonas algo más anchas a más nivel
  const deep = (frac, min) => Math.max(min, d * frac);
  switch (type) {
    case 'cover1':
      return [{ x: 0, y: deep(0.62, 16), area: 9 * spread }];
    case 'cover2': {
      const y = deep(0.58, 15);
      return [
        { x: -w / 4, y, area: 8 * spread },
        { x: w / 4, y, area: 8 * spread },
      ];
    }
    case 'cover3': {
      const y = deep(0.62, 16);
      return [-w / 3, 0, w / 3].map((x) => ({ x, y, area: 7.5 * spread }));
    }
    case 'cover4': {
      const y = deep(0.7, 18);
      return [-w * 0.375, -w * 0.125, w * 0.125, w * 0.375].map((x) => ({
        x,
        y,
        area: 6.5 * spread,
      }));
    }
    default:
      return [];
  }
}

function pickDeepDefenders(pool, count) {
  if (count <= 0) return [];
  const rank = { s: 0, db: 1, lb: 2, dl: 3 };
  const sorted = [...pool].sort(
    (a, b) =>
      (rank[a.role] ?? 4) - (rank[b.role] ?? 4) ||
      num(b?.pos?.y) - num(a?.pos?.y) ||
      String(a.id).localeCompare(String(b.id))
  );
  return sorted.slice(0, count);
}

/**
 * Expande las asignaciones de la defensa a movimientos concretos por jugador.
 * cover1..cover4 se reparten entre los defensores disponibles:
 *   cover1 = 1 safety profundo + hombre al resto
 *   cover2 = 2 safeties a mitad de campo (profundidad 15+)
 *   cover3 = 3 zonas profundas, cover4 = 4 zonas profundas
 * Devuelve un mapa {playerId: {type:'man'|'zone'|'deep'|'rush'|'path', ...}}.
 * Si `opts.respectDefensePaths`, los defensores con ruta dibujada la respetan.
 */
export function expandAssignments(play, level = 'rec', opts = {}) {
  const lvl = resolveLevel(level);
  const players = Array.isArray(play?.players) ? play.players : [];
  const offense = players.filter((p) => p && p.team !== 'defense');
  const defenses = players.filter((p) => p && p.team === 'defense');
  const receivers = eligibleReceivers(offense);
  const field = { ...DEFAULT_FIELD, ...(play?.field || {}) };
  const map = {};
  if (!defenses.length) return map;

  const respectPaths = !!opts.respectDefensePaths;
  const hasPath = (d) => Array.isArray(d.path) && d.path.length > 0;
  const coverageEntry = defenses.find((d) => d.assignment && COVERAGE_DEPTH[d.assignment.type] !== undefined);

  if (coverageEntry) {
    const covType = coverageEntry.assignment.type;
    const deepCount = COVERAGE_DEPTH[covType] || 0;
    const rushers = defenses.filter((d) => d.assignment?.type === 'rush');
    const pool = defenses.filter((d) => !rushers.includes(d));
    const used = new Set();

    for (const d of rushers) {
      map[d.id] = respectPaths && hasPath(d) ? { type: 'path' } : { type: 'rush', lane: laneOf(d) };
    }

    const deepDefs = pickDeepDefenders(pool, deepCount);
    const deepIds = new Set(deepDefs.map((d) => d.id));
    const centers = coverageCenters(covType, field, lvl);
    const deepSorted = [...deepDefs].sort(
      (a, b) => num(a?.pos?.x) - num(b?.pos?.x) || String(a.id).localeCompare(String(b.id))
    );
    for (let i = 0; i < deepSorted.length; i += 1) {
      const d = deepSorted[i];
      const c = centers[Math.min(i, Math.max(0, centers.length - 1))];
      if (!c) map[d.id] = { type: 'man', targetId: nearestTo(d.pos, receivers)?.id ?? null };
      else map[d.id] = { type: 'deep', center: { x: c.x, y: c.y }, depth: c.y, area: c.area };
    }

    const remaining = pool.filter((d) => !deepIds.has(d.id));
    for (const d of remaining) {
      if (respectPaths && hasPath(d)) {
        map[d.id] = { type: 'path' };
        continue;
      }
      const a = d.assignment;
      if (a?.type === 'zone') {
        map[d.id] = zoneFromAssignment(d, a, field);
        continue;
      }
      const target = manTargetFor(d, a, offense, receivers, used);
      if (target) used.add(target.id);
      map[d.id] = { type: 'man', targetId: target ? target.id : null };
    }
    // Cualquier defensa sin resolver cae a su comportamiento por rol.
    for (const d of defenses) {
      if (!map[d.id]) map[d.id] = defaultAssignment(d, receivers, field);
    }
    return map;
  }

  for (const d of defenses) {
    if (respectPaths && hasPath(d)) {
      map[d.id] = { type: 'path' };
      continue;
    }
    const a = d.assignment;
    if (a?.type === 'man') {
      const target = manTargetFor(d, a, offense, receivers, null);
      map[d.id] = { type: 'man', targetId: target ? target.id : null };
    } else if (a?.type === 'zone') {
      map[d.id] = zoneFromAssignment(d, a, field);
    } else if (a?.type === 'rush') {
      map[d.id] = { type: 'rush', lane: num(a.lane, laneOf(d)) };
    } else if (hasPath(d)) {
      map[d.id] = { type: 'path' };
    } else {
      map[d.id] = defaultAssignment(d, receivers, field);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Motor por frames
// ---------------------------------------------------------------------------

function clampField(pt, field) {
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return { x: 0, y: 0 };
  const hw = num(field.width, 40) / 2;
  const maxY = num(field.depth, 26) + num(field.ez, 10);
  return { x: clamp(pt.x, -hw - 2, hw + 2), y: clamp(pt.y, -8, maxY) };
}

function moveToward(cur, target, maxStep) {
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const d = Math.hypot(dx, dy);
  if (!Number.isFinite(d) || d < 1e-6) return { x: cur.x, y: cur.y };
  const step = Math.min(d, Math.max(0, maxStep));
  return { x: cur.x + (dx / d) * step, y: cur.y + (dy / d) * step };
}

function nearestDefenderSep(point, defenders) {
  let best = NO_DEFENDER_SEP;
  for (const d of defenders) {
    const v = dist(point, d.pos);
    if (v < best) best = v;
  }
  return best;
}

/** Distancia del rusher más cercano al QB (Infinity si no hay rushers). */
function nearestRusherDistance(defenders, qbPos) {
  let best = Infinity;
  for (const d of defenders) {
    if (!d.canSack) continue;
    const v = dist(d.pos, qbPos);
    if (v < best) best = v;
  }
  return best;
}

function copyPositions(positions) {
  const out = {};
  for (const id of Object.keys(positions)) {
    out[id] = { x: positions[id].x, y: positions[id].y };
  }
  return out;
}

function candidateList(open, offAtT, qbPos) {
  const out = [];
  for (const o of open) {
    const p = offAtT.get(o.playerId);
    if (!p) continue;
    const dQb = dist(qbPos, p);
    out.push({
      playerId: o.playerId,
      sep: o.sep,
      state: o.state,
      score: o.sep / (1 + dQb / 40), // separación normalizada por la distancia al QB
    });
  }
  return out;
}

function bestOpenCandidate(list, excludeId) {
  let best = null;
  for (const c of list) {
    if (c.playerId === excludeId || c.state !== 'open') continue;
    if (!best || c.score > best.score) best = c;
  }
  return best;
}

function bestCandidate(list, excludeId) {
  let best = null;
  for (const c of list) {
    if (c.playerId === excludeId) continue;
    if (!best || c.score > best.score) best = c;
  }
  return best;
}

/** Calcula el punto de encuentro del pase (con adelanto) y el tiempo de vuelo. */
function planThrow(qbPos, receiver, tThrow, duration, posOf) {
  const at = (tt) => posOf(receiver, Math.min(MAX_RELEASE_AT, Math.max(0, tt)));
  let aim = at(tThrow);
  let eta = Math.max(0.05, dist(qbPos, aim) / BALL_SPEED);
  for (let i = 0; i < 3; i += 1) {
    eta = Math.max(0.05, dist(qbPos, aim) / BALL_SPEED);
    aim = at(tThrow + eta);
  }
  const maxEta = Math.max(0.08, duration - tThrow);
  if (eta > maxEta) {
    eta = maxEta;
    aim = at(tThrow + eta);
  }
  return { aim: { x: aim.x, y: aim.y }, eta };
}

function updateDefense(defenders, ctx) {
  const { t, qbPos, duration, field, ball, ballAim, recs, posAt } = ctx;
  const ballInAir = !!ball && ball.inAir;
  for (const st of defenders) {
    const exp = st.exp;
    if (exp.type === 'path') {
      if (st.pathRoute) {
        st.pos = routePos(st.pathRoute, ctx.pathSpeed * Math.max(0, t - ctx.reactDelay));
      }
      continue;
    }
    if (t + 1e-9 < ctx.reactDelay) continue; // aún no ha reaccionado al snap

    let target = st.start;
    let speedFactor = 1;

    if (exp.type === 'man') {
      if (ballInAir) {
        target = ballAim || ball; // rompe al balón
        speedFactor = 1.02;
      } else if (exp.targetId) {
        const recNow = posAt(exp.targetId, t);
        if (recNow) {
          const recLag = posAt(exp.targetId, Math.max(0, t - st.manLag)) || recNow;
          const recPrev = posAt(exp.targetId, Math.max(0, t - 0.12)) || recNow;
          const vy = (recNow.y - recPrev.y) / 0.12;
          const progress = clamp(t / Math.max(0.001, duration), 0, 1);
          const cushion = Math.max(0.45, st.cushion0 * (1 - 0.6 * progress));
          const deepSide = st.pos.y > recLag.y + 1.2;
          if (deepSide && vy > 0.3) {
            // Ya está por encima: mantiene la cobertura profunda.
            target = { x: recLag.x + (st.pos.x - recLag.x) * 0.25, y: recLag.y + 0.7 + cushion * 0.5 };
          } else {
            // Entre el receptor y el QB, con cojín que se cierra.
            const dx = qbPos.x - recLag.x;
            const dy = qbPos.y - recLag.y;
            const len = Math.hypot(dx, dy) || 1;
            target = { x: recLag.x + (dx / len) * cushion, y: recLag.y + (dy / len) * cushion };
          }
          if (dist(st.pos, recNow) > 5) speedFactor = 1.06;
        }
      }
    } else if (exp.type === 'zone' || exp.type === 'deep') {
      const c = exp.center || st.start;
      const area = num(exp.area, 7);
      if (ballInAir) {
        target = ballAim || ball; // rompe al balón
      } else if (dist(st.pos, c) > 1.2) {
        target = c; // drop a su landmark
      } else {
        // Shuffle lateral hacia el receptor más peligroso dentro del área.
        let best = null;
        let bestScore = -Infinity;
        for (const r of recs) {
          const dC = dist(r.pos, c);
          if (dC > area + 2) continue;
          const score = area - dC + (r.pos.y - c.y) * 0.15;
          if (score > bestScore) {
            bestScore = score;
            best = r;
          }
        }
        if (best) {
          target = {
            x: clamp(best.pos.x, c.x - area, c.x + area),
            y: c.y + (best.pos.y - c.y) * 0.25,
          };
        } else {
          target = c;
        }
        speedFactor = 0.82;
      }
    } else if (exp.type === 'rush') {
      if (ballInAir) {
        target = ballAim || ball; // va a por el balón
      } else {
        const laneOff = exp.lane === 0 ? -1.4 : exp.lane === 2 ? 1.4 : 0;
        const dQb = dist(st.pos, qbPos);
        const arc = laneOff * clamp(dQb / 10, 0, 1); // ligera curvatura según lane
        target = { x: qbPos.x + arc, y: qbPos.y };
      }
    }

    // Ruido determinista basado en el índice del jugador (no aleatorio).
    target = {
      x: target.x + Math.sin(t * 1.9 + st.phase) * 0.14,
      y: target.y + Math.cos(t * 1.4 + st.phase * 1.3) * 0.14,
    };
    const step = st.baseSpeed * speedFactor * DT;
    st.pos = moveToward(st.pos, clampField(target, field), step);
  }
}

/**
 * Simula la jugada completa.
 * opts: { level='rec', qbReads=true, duration?, respectDefensePaths? }
 */
export function simulate(play, opts = {}) {
  const level = resolveLevel(opts.level);
  const players = Array.isArray(play?.players) ? play.players.filter(Boolean) : [];
  const field = { ...DEFAULT_FIELD, ...(play?.field || {}) };
  const offense = players.filter((p) => p.team !== 'defense');
  const defense = players.filter((p) => p.team === 'defense');
  const duration = clamp(num(opts.duration, playDuration(play)), 1.5, MAX_DURATION);
  const frameCount = Math.min(MAX_FRAMES, Math.max(2, Math.round(duration / DT) + 1));
  const times = new Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) times[i] = i === frameCount - 1 ? duration : i * DT;

  // Rutas precalculadas (coste O(1) por consulta).
  const routes = new Map();
  for (const p of players) {
    if (Array.isArray(p.path) && p.path.length) {
      const r = buildRoute(p);
      if (r.total > 0) routes.set(p.id, r);
    }
  }
  const posOf = (p, t) => {
    const r = routes.get(p.id);
    return r ? routePos(r, OFF_SPEED * Math.max(0, t)) : { x: num(p?.pos?.x), y: num(p?.pos?.y) };
  };
  const offById = new Map(offense.map((p) => [p.id, p]));
  const posAt = (id, t) => {
    const p = offById.get(id);
    return p ? posOf(p, t) : null;
  };

  const eligible = eligibleReceivers(offense);
  const designatedId = play?.ball?.targetId ?? null;
  const qb = offense.find((p) => p.role === 'qb') || offense[0] || null;
  const qbReads = opts.qbReads !== false;
  const releaseAt = clamp(num(play?.ball?.releaseAt, 0.9), 0, Math.max(0, duration - DT * 0.5));

  const expMap = expandAssignments(play, level, { respectDefensePaths: !!opts.respectDefensePaths });
  const defenders = defense.map((p, idx) => {
    const exp = expMap[p.id] || defaultAssignment(p, eligible, field);
    return {
      player: p,
      exp,
      start: { x: num(p?.pos?.x), y: num(p?.pos?.y) },
      pos: { x: num(p?.pos?.x), y: num(p?.pos?.y) },
      baseSpeed: OFF_SPEED * level.speed * roleSpeed(p.role) * (0.97 + 0.06 * hash01(idx)),
      manLag: 0.05 + level.reactDelay * 0.45,
      cushion0: clamp(3.2 - level.aggression, 1.8, 3.0),
      pathRoute: routes.get(p.id) || null,
      canSack: exp.type === 'rush' || (exp.type === 'path' && (p.role === 'dl' || p.assignment?.type === 'rush')),
      phase: idx * 1.7,
    };
  });

  const frames = [];
  const trajectories = {};
  for (const p of players) trajectories[p.id] = [];
  const openHistory = new Map();

  let ball = null;
  let throwInfo = null;
  let outcome = null;
  let coveredSince = null;

  for (let fi = 0; fi < frameCount; fi += 1) {
    const t = times[fi];
    const positions = {};
    const offAtT = new Map();
    for (const p of offense) {
      const pos = posOf(p, t);
      offAtT.set(p.id, pos);
      positions[p.id] = { x: pos.x, y: pos.y };
    }
    const qbPos = qb ? offAtT.get(qb.id) || { x: 0, y: 0 } : { x: 0, y: 0 };
    const recs = eligible.map((p) => ({
      id: p.id,
      pos: offAtT.get(p.id) || { x: num(p?.pos?.x), y: num(p?.pos?.y) },
    }));

    updateDefense(defenders, {
      t,
      qbPos,
      duration,
      field,
      ball,
      ballAim: throwInfo ? throwInfo.aim : null,
      recs,
      posAt,
      reactDelay: level.reactDelay,
      pathSpeed: OFF_SPEED * level.speed,
    });
    for (const d of defenders) positions[d.player.id] = { x: d.pos.x, y: d.pos.y };

    const atkPts = recs.map((r) => ({ playerId: r.id, x: r.pos.x, y: r.pos.y }));
    const defPts = defenders.map((d) => ({ playerId: d.player.id, x: d.pos.x, y: d.pos.y }));
    const open = openness(atkPts, defPts, t);
    for (const o of open) {
      const prev = openHistory.get(o.playerId);
      if (!prev || o.sep > prev.maxSep) openHistory.set(o.playerId, { maxSep: o.sep, t });
    }

    if (!outcome && !throwInfo && recs.length) {
      const cands = candidateList(open, offAtT, qbPos);

      // Lectura temprana: el objetivo designado está tapado y hay otra ventana.
      if (qbReads && designatedId && t < releaseAt) {
        const dest = cands.find((c) => c.playerId === designatedId);
        if (dest && dest.state === 'covered') {
          if (coveredSince === null) coveredSince = t;
          const alt = bestOpenCandidate(cands, designatedId);
          if (alt && t - coveredSince >= QR_EARLY_DELAY) {
            const pr = planThrow(qbPos, offById.get(alt.playerId), t, duration, posOf);
            throwInfo = { t, targetId: alt.playerId, qbPos: { ...qbPos }, aim: pr.aim, eta: pr.eta };
            ball = { x: qbPos.x, y: qbPos.y, inAir: true };
          }
        } else {
          coveredSince = null;
        }
      }

      // Hot read por presión: si el rush llega encima y hay ventana, el QB
      // suelta el balón antes del releaseAt programado. Sin esto, cualquier
      // defensa con un rusher decidiría la jugada por sack y la cobertura no
      // llegaría a influir en el resultado.
      if (!throwInfo && !outcome && t < releaseAt && t + 1e-9 >= HOT_READ_MIN_T) {
        const pressure = nearestRusherDistance(defenders, qbPos);
        if (pressure <= PRESSURE_RADIUS) {
          let hot = null;
          if (qbReads) {
            hot = bestOpenCandidate(cands, null);
          } else {
            const dest = cands.find((c) => c.playerId === designatedId);
            hot = dest && dest.state === 'open' ? dest : null;
          }
          if (hot) {
            const pr = planThrow(qbPos, offById.get(hot.playerId), t, duration, posOf);
            throwInfo = { t, targetId: hot.playerId, qbPos: { ...qbPos }, aim: pr.aim, eta: pr.eta };
            ball = { x: qbPos.x, y: qbPos.y, inAir: true };
          }
        }
      }

      if (!throwInfo && !outcome && t + 1e-9 >= releaseAt) {
        let chosen = null;
        if (qbReads) {
          chosen = bestOpenCandidate(cands, null) || bestCandidate(cands, null);
        } else {
          chosen =
            cands.find((c) => c.playerId === designatedId) ||
            bestOpenCandidate(cands, null) ||
            bestCandidate(cands, null);
        }
        if (!chosen) {
          outcome = { result: 'incomplete', targetId: null, separation: 0, atT: t };
        } else if (chosen.state === 'covered') {
          outcome = { result: 'covered', targetId: chosen.playerId, separation: chosen.sep, atT: t };
        } else {
          const pr = planThrow(qbPos, offById.get(chosen.playerId), t, duration, posOf);
          throwInfo = { t, targetId: chosen.playerId, qbPos: { ...qbPos }, aim: pr.aim, eta: pr.eta };
          ball = { x: qbPos.x, y: qbPos.y, inAir: true };
        }
      }
    }

    // El balón viaja en línea recta a ~22 yd/s hasta el punto de encuentro.
    if (throwInfo && !outcome) {
      const u = throwInfo.eta <= 1e-6 ? 1 : (t - throwInfo.t) / throwInfo.eta;
      if (u >= 1 - 1e-9) {
        ball = { x: throwInfo.aim.x, y: throwInfo.aim.y, inAir: false };
        const recPos = offAtT.get(throwInfo.targetId) || throwInfo.aim;
        const sepNow = nearestDefenderSep(recPos, defenders);
        const inEndZone = recPos.y >= num(field.depth, 26) - 0.05;
        const result = sepNow < CONTEST_SEP ? 'incomplete' : inEndZone ? 'touchdown' : 'catch';
        outcome = { result, targetId: throwInfo.targetId, separation: sepNow, atT: t };
      } else {
        ball = {
          x: throwInfo.qbPos.x + (throwInfo.aim.x - throwInfo.qbPos.x) * u,
          y: throwInfo.qbPos.y + (throwInfo.aim.y - throwInfo.qbPos.y) * u,
          inAir: true,
        };
      }
    }

    // Sack: un rusher llega al QB antes de que salga el balón.
    if (!throwInfo && !outcome) {
      for (const d of defenders) {
        if (!d.canSack) continue;
        if (dist(d.pos, qbPos) <= SACK_RADIUS) {
          const targetSep = designatedId
            ? open.find((o) => o.playerId === designatedId)?.sep ?? 0
            : open.reduce((m, o) => Math.max(m, o.sep), 0);
          outcome = { result: 'sack', targetId: designatedId || null, separation: targetSep, atT: t };
          break;
        }
      }
    }

    frames.push({
      t,
      positions: copyPositions(positions),
      ball: ball ? { x: ball.x, y: ball.y, inAir: !!ball.inAir } : null,
      open: open.map((o) => ({ playerId: o.playerId, sep: round2(o.sep), state: o.state })),
    });
    for (const p of players) {
      const pos = positions[p.id] || { x: 0, y: 0 };
      trajectories[p.id].push({ x: pos.x, y: pos.y });
    }
  }

  // Resolución de la jugada si no terminó durante el bucle.
  if (!outcome) {
    if (throwInfo) {
      const last = frames[frames.length - 1];
      const recPos = last.positions[throwInfo.targetId] || throwInfo.aim;
      const sepLast = nearestDefenderSep(recPos, defenders);
      const inEndZone = recPos.y >= num(field.depth, 26) - 0.05;
      const result = sepLast < CONTEST_SEP ? 'incomplete' : inEndZone ? 'touchdown' : 'catch';
      outcome = { result, targetId: throwInfo.targetId, separation: sepLast, atT: last.t };
      last.ball = { x: throwInfo.aim.x, y: throwInfo.aim.y, inAir: false };
    } else if (!eligible.length) {
      outcome = { result: 'incomplete', targetId: null, separation: 0, atT: duration };
    } else {
      const lastFrame = frames[frames.length - 1];
      const lastOpen = lastFrame ? lastFrame.open : [];
      const dest = designatedId ? lastOpen.find((o) => o.playerId === designatedId) : null;
      const pick = dest || lastOpen.reduce((a, b) => (!a || b.sep > a.sep ? b : a), null);
      const result = pick && pick.state === 'covered' ? 'covered' : 'incomplete';
      outcome = { result, targetId: pick ? pick.playerId : null, separation: pick ? pick.sep : 0, atT: duration };
    }
  }

  const targetId = outcome.targetId ?? null;
  const hist = targetId ? openHistory.get(targetId) : null;
  const separation = round2(Number.isFinite(outcome.separation) ? outcome.separation : 0);
  const at = round2(Number.isFinite(outcome.atT) ? outcome.atT : duration);
  const reason = buildReason(outcome.result, players, targetId, separation, at);

  return {
    duration,
    level: level.key,
    frames,
    outcome: {
      result: outcome.result,
      targetId,
      openTargetId: targetId,
      reason,
      openAt: hist ? round2(hist.t) : null,
      separation,
      // Segundo en el que se decide la jugada (lanzamiento, llegada o sack).
      at,
    },
    players: trajectories,
  };
}

// ---------------------------------------------------------------------------
// Textos (castellano de España)
// ---------------------------------------------------------------------------

function playerLabel(players, id) {
  const p = (players || []).find((x) => x && x.id === id);
  if (!p) return null;
  return p.label || p.number || p.id;
}

function ventanaTxt(sep) {
  return sep >= 20 ? 'sin un defensor cerca' : `con ${fmtYd(sep)} yardas de ventana`;
}

function buildReason(result, players, targetId, separation, at) {
  const label = playerLabel(players, targetId) || 'el receptor';
  const qbPlayer = (players || []).find((p) => p && p.team !== 'defense' && p.role === 'qb');
  const qbLabel = playerLabel(players, qbPlayer?.id) || 'el mariscal';
  switch (result) {
    case 'touchdown':
      return `${label} llega a la end zone ${ventanaTxt(separation)} y anota.`;
    case 'catch':
      return `${label} queda abierto ${ventanaTxt(separation)} y completa el pase.`;
    case 'covered':
      return `${label} está tapado a los ${fmtSecs(at)} s: la defensa cierra la ventana y el mariscal no lanza.`;
    case 'sack':
      return `El rush llega a los ${fmtSecs(at)} s, antes del lanzamiento, y derriba a ${qbLabel}.`;
    case 'incomplete':
      return `El pase busca a ${label} y la defensa lo rompe a los ${fmtSecs(at)} s.`;
    default:
      return 'La jugada termina sin un resultado claro.';
  }
}

// ---------------------------------------------------------------------------
// Análisis de enfrentamientos
// ---------------------------------------------------------------------------

function composeMatchup(play, defense) {
  const base = play && typeof play === 'object' ? play : {};
  const own = Array.isArray(base.players) ? base.players.filter(Boolean) : [];
  let candidates = [];
  if (defense && Array.isArray(defense.players)) candidates = defense.players.filter(Boolean);
  else if (Array.isArray(defense)) candidates = defense.filter(Boolean);
  else candidates = own.filter((p) => p.team === 'defense');

  // Una jugada defensiva del libro suele incluir también la ofensiva de
  // referencia (para dibujar el diagrama): esa ofensiva no juega en el matchup.
  const explicitDefense = candidates.filter((p) => p.team === 'defense');
  const defensePlayers = explicitDefense.length
    ? explicitDefense
    : candidates.filter((p) => p.team !== 'offense');

  const seen = new Set();
  const offense = own.filter((p) => p.team !== 'defense');
  for (const p of offense) seen.add(p.id);
  const composed = [...offense];
  for (const p of defensePlayers) {
    if (!p || !p.id) continue;
    if (seen.has(p.id)) continue; // evita ids duplicados entre ofensiva y defensa
    seen.add(p.id);
    composed.push({
      ...p,
      team: 'defense',
      pos: { x: num(p?.pos?.x), y: num(p?.pos?.y) },
      path: Array.isArray(p.path) && p.path.length ? p.path.map((pt) => ({ ...pt })) : null,
      assignment: p.assignment ? { ...p.assignment } : null,
    });
  }
  return {
    ...base,
    players: composed,
    field: { ...DEFAULT_FIELD, ...(base.field || {}) },
    ball: {
      targetId: base.ball?.targetId ?? null,
      releaseAt: Math.max(0, num(base.ball?.releaseAt, 0.9)),
    },
  };
}

/**
 * ¿Había alguna ventana abierta en el momento decisivo de la jugada?
 * Se mira una ventana corta alrededor del instante del lanzamiento / llegada /
 * sack: al inicio del snap todo el mundo está "abierto", así que contar toda la
 * jugada no informaría de nada.
 */
function wasAnyoneOpen(sim) {
  const frames = sim.frames || [];
  if (!frames.length) return false;
  const at = num(sim.outcome?.at, frames[frames.length - 1].t);
  const from = at - 0.35;
  const to = at + 0.15;
  let seen = false;
  for (const f of frames) {
    if (f.t < from || f.t > to) continue;
    seen = true;
    if ((f.open || []).some((o) => o.state === 'open')) return true;
  }
  if (seen) return false;
  return frames.some((f) => (f.open || []).some((o) => o.state === 'open'));
}

/**
 * Enfrenta la ofensiva de `play` contra `defense` (Play de tipo defense,
 * {players}, array o null para usar la defensa propia de la jugada).
 * Devuelve { grade:'strong'|'ok'|'tough', reason, sim }.
 */
export function gradeMatchup(play, defense, opts = {}) {
  const composed = composeMatchup(play, defense);
  // Las asignaciones mandan; las rutas dibujadas se respetan para defensores
  // sin assignment (y para todos si opts.respectDefensePaths === true).
  const sim = simulate(composed, { ...opts, respectDefensePaths: !!opts.respectDefensePaths });
  const o = sim.outcome;
  const sep = num(o.separation, 0);
  const label = playerLabel(composed.players, o.targetId) || 'el receptor';
  const qbPlayer = composed.players.find((p) => p.team !== 'defense' && p.role === 'qb');
  const qbLabel = playerLabel(composed.players, qbPlayer?.id) || 'el mariscal';
  const open = wasAnyoneOpen(sim);
  let grade;
  let reason;

  switch (o.result) {
    case 'touchdown':
      grade = 'strong';
      reason = `${label} llega a la end zone ${ventanaTxt(sep)}: la defensa no llega a tiempo.`;
      break;
    case 'catch':
      if (sep >= 2) {
        grade = 'strong';
        reason = `${label} queda abierto ${ventanaTxt(sep)} y completa el pase.`;
      } else {
        grade = 'ok';
        reason = `${label} completa el pase, pero ${ventanaTxt(sep)}: la defensa estaba encima.`;
      }
      break;
    case 'sack':
      if (open) {
        grade = 'ok';
        reason = `El rush llega a los ${fmtSecs(o.at)} s, antes del lanzamiento, pero ${label} ya estaba abierto en la ventana.`;
      } else {
        grade = 'tough';
        reason = `El rush llega a los ${fmtSecs(o.at)} s, antes del lanzamiento, y derriba a ${qbLabel} sin ninguna ventana abierta.`;
      }
      break;
    case 'covered':
      if (open) {
        grade = 'ok';
        reason = `La defensa tapa a ${label} a los ${fmtSecs(o.at)} s, aunque otro receptor queda abierto: hay lectura.`;
      } else {
        grade = 'tough';
        reason = `La defensa cubre a ${label} a los ${fmtSecs(o.at)} s sin dejar ninguna ventana abierta.`;
      }
      break;
    default:
      if (open) {
        grade = 'ok';
        reason = `El pase busca a ${label} y la defensa lo rompe a los ${fmtSecs(o.at)} s.`;
      } else {
        grade = 'tough';
        reason = `El pase a ${label} queda incompleto a los ${fmtSecs(o.at)} s: la defensa cierra todas las ventanas.`;
      }
      break;
  }
  return { grade, reason, sim };
}

function normalizeLevelList(levels) {
  if (levels == null) return LEVEL_KEYS.slice();
  const arr = Array.isArray(levels) ? levels : [levels];
  const out = arr.filter(Boolean).map((l) => (typeof l === 'string' ? (LEVELS[l] ? l : 'rec') : l));
  return out.length ? out : LEVEL_KEYS.slice();
}

function countGrade(counts, grade) {
  if (grade === 'strong') counts.strong += 1;
  else if (grade === 'ok') counts.ok += 1;
  else counts.tough += 1;
}

function buildVerdict(rows, byDefense) {
  if (!rows.length) return 'No hay defensas para analizar.';
  const scoreOf = (d) => (d.strong * 2 + d.ok) / Math.max(1, d.strong + d.ok + d.tough);
  const defs = Object.values(byDefense);
  const best = [...defs].sort(
    (a, b) => scoreOf(b) - scoreOf(a) || String(a.defenseName).localeCompare(String(b.defenseName))
  )[0];
  const worst = [...defs].sort(
    (a, b) => scoreOf(a) - scoreOf(b) || String(a.defenseName).localeCompare(String(b.defenseName))
  )[0];
  const avg =
    rows.reduce((s, r) => s + (r.grade === 'strong' ? 2 : r.grade === 'ok' ? 1 : 0), 0) / rows.length;
  const base = avg >= 1.6 ? 'Play sólida' : avg >= 0.9 ? 'Play competitiva' : 'Play exigente';
  if (defs.length === 1) return `${base} contra ${best.defenseName}.`;
  if (best.defenseId === worst.defenseId || Math.abs(scoreOf(best) - scoreOf(worst)) < 0.25) {
    return `${base} contra ${best.defenseName} y ${worst.defenseName}.`;
  }
  return `${base} contra ${best.defenseName}, sufre contra ${worst.defenseName}.`;
}

/**
 * Prueba la jugada contra cada defensa y cada nivel.
 * opts.levels: array de claves de LEVELS (default los 3).
 * Devuelve { rows, summary:{strong,ok,tough,verdict}, byLevel, byDefense }.
 */
export function analyzePlay(play, defenses, opts = {}) {
  const list = (Array.isArray(defenses) ? defenses : []).filter(Boolean);
  const levels = normalizeLevelList(opts.levels);
  const rows = [];
  const byLevel = {};
  const byDefense = {};
  const totals = { strong: 0, ok: 0, tough: 0 };

  list.forEach((defense, i) => {
    const defenseId = defense?.id || `def_${i + 1}`;
    const defenseName = defense?.name || defense?.label || `Defensa ${i + 1}`;
    byDefense[defenseId] = byDefense[defenseId] || {
      defenseId,
      defenseName,
      strong: 0,
      ok: 0,
      tough: 0,
    };
    for (const lvl of levels) {
      const key = levelKey(lvl);
      const grade = gradeMatchup(play, defense, { ...opts, level: lvl });
      rows.push({ defenseId, defenseName, level: key, grade: grade.grade, reason: grade.reason });
      countGrade(totals, grade.grade);
      byLevel[key] = byLevel[key] || {
        label: LEVELS[key]?.label || resolveLevel(lvl).label || key,
        strong: 0,
        ok: 0,
        tough: 0,
      };
      countGrade(byLevel[key], grade.grade);
      countGrade(byDefense[defenseId], grade.grade);
    }
  });

  for (const entry of Object.values(byDefense)) {
    entry.grade =
      entry.strong >= entry.ok && entry.strong >= entry.tough
        ? 'strong'
        : entry.ok >= entry.tough
          ? 'ok'
          : 'tough';
  }

  return {
    rows,
    summary: {
      strong: totals.strong,
      ok: totals.ok,
      tough: totals.tough,
      verdict: buildVerdict(rows, byDefense),
      // Agregados también dentro del summary, por comodidad de los consumidores.
      byLevel,
      byDefense,
    },
    byLevel,
    byDefense,
  };
}
