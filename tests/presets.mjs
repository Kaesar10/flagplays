// tests/presets.mjs — verificación de src/presets.js
// Ejecutar con: node tests/presets.mjs
// No requiere DOM ni dependencias: solo node:assert/strict.
import assert from 'node:assert/strict';
import {
  FORMATIONS,
  ROUTES,
  DEFENSES,
  STARTER_PLAYS,
  CONCEPTS,
  ROUTE_CATEGORIES,
  getFormation,
  getRoute,
  getDefense,
  listRoutesByCategory,
  routeTemplatePoints,
  buildDefensePlayers,
  buildDefenseFromPreset,
  buildPlayFromConcept,
  applyFormation,
} from '../src/presets.js';
import { FORMATS } from '../src/field.js';
import { ROLES, P_CATEGORIES, validatePlay } from '../src/model.js';

let checks = 0;
function ok(value, message) {
  checks += 1;
  assert.ok(value, message);
}
function eq(actual, expected, message) {
  checks += 1;
  assert.equal(actual, expected, message);
}
function notEq(actual, expected, message) {
  checks += 1;
  assert.notEqual(actual, expected, message);
}
function deepEq(actual, expected, message) {
  checks += 1;
  assert.deepEqual(actual, expected, message);
}
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isOffense = (player) => player.team === 'offense';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function formatOfPlay(play) {
  const entry = Object.entries(FORMATS).find(([, field]) => field.width === play.field.width);
  return entry ? Number(entry[0]) : null;
}

// ===========================================================================
// 1. FORMACIONES
// ===========================================================================
ok(Array.isArray(FORMATIONS), 'FORMATIONS es un array');
ok(FORMATIONS.length >= 20, `FORMATIONS incluye ofensivas y defensivas (${FORMATIONS.length})`);

const offenseFormations = FORMATIONS.filter((formation) => formation.type === 'offense');
const defenseFormations = FORMATIONS.filter((formation) => formation.type === 'defense');
ok(offenseFormations.length >= 12, `hay al menos 12 formaciones ofensivas (${offenseFormations.length})`);
ok(defenseFormations.length >= 8, `hay al menos 8 formaciones defensivas (${defenseFormations.length})`);
eq(new Set(FORMATIONS.map((formation) => formation.id)).size, FORMATIONS.length, 'ids de formación únicos');

for (const formation of FORMATIONS) {
  const field = FORMATS[formation.format];
  ok(!!field, `${formation.id}: formato ${formation.format} válido`);
  eq(formation.players.length, field.players, `${formation.id}: número correcto de jugadores`);
  eq(
    new Set(formation.players.map((player) => player.label)).size,
    formation.players.length,
    `${formation.id}: etiquetas de jugador únicas`
  );
  ok(typeof formation.desc === 'string' && formation.desc.length > 20, `${formation.id}: descripción de entrenador`);
  for (const player of formation.players) {
    ok(!!ROLES[player.role], `${formation.id}/${player.label}: rol válido (${player.role})`);
    ok(isNumber(player.x) && isNumber(player.y), `${formation.id}/${player.label}: coordenadas numéricas`);
    ok(Math.abs(player.x) <= field.width / 2 - 1, `${formation.id}/${player.label}: dentro del ancho del campo`);
    ok(player.y >= -8 && player.y <= field.depth, `${formation.id}/${player.label}: profundidad coherente`);
  }
  if (formation.type === 'offense') {
    eq(formation.players.filter((player) => player.role === 'qb').length, 1, `${formation.id}: un mariscal`);
    eq(formation.players.filter((player) => player.role === 'c').length, 1, `${formation.id}: un center elegible`);
  }
  // Sin solapes absurdos: dos jugadores de la misma formación nunca comparten sitio.
  for (let i = 0; i < formation.players.length; i += 1) {
    for (let j = i + 1; j < formation.players.length; j += 1) {
      ok(
        distance(formation.players[i], formation.players[j]) > 0.75,
        `${formation.id}: ${formation.players[i].label} y ${formation.players[j].label} no se solapan`
      );
    }
  }
}

for (const requiredId of [
  'spread-5',
  'trips-right-5',
  'trips-left-5',
  'bunch-right-5',
  'double-slot-5',
  'empty-5',
  'stack-5',
  'twins-5',
  'conversion-5',
  'trey-7',
  'four-open-rb-7',
  'pistol-7',
]) {
  ok(getFormation(requiredId)?.type === 'offense', `formación ofensiva exigida: ${requiredId}`);
}
for (const requiredId of ['cover-0', 'cover-1', 'cover-2', 'cover-3', 'cover-4', 'blitz-2', 'zone-23', 'man-press']) {
  ok(getFormation(requiredId)?.type === 'defense', `formación defensiva exigida: ${requiredId}`);
}
eq(getFormation('no-existe'), null, 'getFormation devuelve null si no existe');

// Las formaciones defensivas se derivan de DEFENSES sin duplicar posiciones.
for (const defense of DEFENSES) {
  const formation = getFormation(defense.id);
  ok(!!formation && formation.type === 'defense', `${defense.id}: formación defensiva correspondiente`);
  eq(formation.players.length, defense.players.length, `${defense.id}: jugadores coinciden con el preset`);
  formation.players.forEach((slot, index) => {
    const spec = defense.players[index];
    eq(slot.label, spec.label, `${defense.id}: etiqueta de defensa`);
    eq(slot.x, spec.x, `${defense.id}/${spec.label}: x`);
    eq(slot.y, spec.y, `${defense.id}/${spec.label}: y`);
  });
}

// ===========================================================================
// 2. RUTAS
// ===========================================================================
ok(ROUTES.length >= 24, `hay al menos 24 rutas (${ROUTES.length})`);
eq(new Set(ROUTES.map((route) => route.id)).size, ROUTES.length, 'ids de ruta únicos');

const allowedCategories = new Set(ROUTE_CATEGORIES);
for (const route of ROUTES) {
  ok(allowedCategories.has(route.category), `${route.id}: categoría válida (${route.category})`);
  ok(Array.isArray(route.points) && route.points.length >= 2 && route.points.length <= 5, `${route.id}: 2-5 puntos`);
  for (const point of route.points) {
    ok(isNumber(point.x) && isNumber(point.y), `${route.id}: punto numérico`);
  }
  ok(typeof route.desc === 'string' && route.desc.length > 20, `${route.id}: descripción`);
  if ('mirror' in route) eq(typeof route.mirror, 'boolean', `${route.id}: mirror booleano`);
}

for (const requiredId of [
  'slant',
  'out',
  'in',
  'post',
  'corner',
  'go',
  'curl',
  'comeback',
  'drag',
  'wheel',
  'flat',
  'screen',
  'swing',
  'seam',
  'fade',
  'zigzag',
  'post-corner',
  'double-move',
  'pivot',
  'chair',
  'return',
  'block',
  'motion',
  'handoff',
]) {
  ok(!!getRoute(requiredId), `ruta exigida: ${requiredId}`);
}
eq(getRoute('no-existe'), null, 'getRoute devuelve null si no existe');

// Geometría de referencia (yardas): documenta que los puntos son deltas reales.
eq(getRoute('slant').points.at(-1).y, 6, 'slant: sube 2 y corta en diagonal hasta 6');
eq(getRoute('slant').points.at(-1).x, 4.5, 'slant: corta 4.5 al interior');
eq(getRoute('out').points.at(-1).x, -5.5, 'out: corta 5.5 al exterior');
eq(getRoute('out').points[0].y, 7, 'out: siete yardas verticales antes del corte');
eq(getRoute('in').points.at(-1).y, 11, 'in/dig: corte a 11 yardas');
eq(getRoute('in').points.at(-1).x, 12, 'in/dig: corta 12 al interior');
eq(getRoute('post').points.at(-1).y, 23, 'post: profundidad de 23 yardas');
eq(getRoute('corner').points.at(-1).x, -9.5, 'corner: 9.5 yardas a la esquina');
eq(getRoute('go').points.at(-1).y >= 20, true, 'go: vertical de 20+ yardas');
eq(getRoute('curl').points.at(-1).y, 8, 'curl: sube 10 y vuelve 2');
eq(getRoute('comeback').points.at(-1).x, -3, 'comeback: vuelve 3 yardas al exterior');
eq(getRoute('drag').points.at(-1).x >= 15, true, 'drag: cruza al menos 15 yardas');
eq(getRoute('wheel').points.at(-1).y, 15, 'wheel: vertical de 15 tras salir al exterior');
eq(getRoute('flat').points.at(-1).x, -5.5, 'flat: plana al exterior');
eq(getRoute('screen').points.at(-1).y < 0, true, 'screen: recibe por detrás de la línea');
eq(getRoute('seam').points.at(-1).y >= 19, true, 'seam: costura profunda');
eq(getRoute('post-corner').points.at(-1).y >= 22, true, 'post-corner: doble corte profundo');
eq(getRoute('handoff').category, 'Carrera', 'handoff: categoría Carrera');
eq(getRoute('jet').category, 'Carrera', 'jet: categoría Carrera');
eq(getRoute('double-move').category, 'Engaño', 'double-move: categoría Engaño');
eq(getRoute('slant').mirror, true, 'slant admite espejo');
notEq(getRoute('go').mirror, true, 'go no necesita espejo');
ok(getRoute('block').desc.includes('no hay bloqueo'), 'block documenta que en flag no se bloquea');

// routeTemplatePoints devuelve copias y refleja solo si la ruta admite espejo.
const slantCopy = routeTemplatePoints('slant');
slantCopy[0].x = 999;
notEq(getRoute('slant').points[0].x, 999, 'routeTemplatePoints no expone referencias internas');
const mirroredSlant = routeTemplatePoints('slant', true);
eq(mirroredSlant[1].x, -4.5, 'routeTemplatePoints espeja la x');
ok(mirroredSlant[0].x === 0, 'el punto del eje queda en el eje al espejar');
deepEq(
  routeTemplatePoints('go', true),
  getRoute('go').points.map((point) => ({ x: point.x, y: point.y })),
  'routeTemplatePoints no espeja rutas sin mirror'
);

const groupedRoutes = listRoutesByCategory();
deepEq(Object.keys(groupedRoutes), ROUTE_CATEGORIES, 'listRoutesByCategory respeta el orden de categorías');
let groupedTotal = 0;
for (const [category, list] of Object.entries(groupedRoutes)) {
  ok(Array.isArray(list), `categoría ${category}: array`);
  ok(list.length > 0, `categoría ${category}: tiene rutas`);
  for (const route of list) {
    eq(route.category, category, `${route.id}: clasificada en ${category}`);
    groupedTotal += 1;
  }
}
eq(groupedTotal, ROUTES.length, 'todas las rutas aparecen una sola vez agrupadas');

// ===========================================================================
// 3. DEFENSAS
// ===========================================================================
ok(DEFENSES.length >= 8 && DEFENSES.length <= 10, `hay 8-10 defensas (${DEFENSES.length})`);
eq(new Set(DEFENSES.map((defense) => defense.id)).size, DEFENSES.length, 'ids de defensa únicos');
eq(getDefense('no-existe'), null, 'getDefense devuelve null si no existe');

for (const defense of DEFENSES) {
  const field = FORMATS[defense.format];
  ok(!!field, `${defense.id}: formato de defensa válido`);
  eq(defense.type, 'defense', `${defense.id}: type defense`);
  eq(defense.players.length, field.players, `${defense.id}: número de defensas del formato`);
  eq(
    new Set(defense.players.map((player) => player.label)).size,
    defense.players.length,
    `${defense.id}: etiquetas de defensa únicas`
  );
  ok(typeof defense.desc === 'string' && defense.desc.length > 20, `${defense.id}: descripción`);
  ok(P_CATEGORIES.includes(defense.category), `${defense.id}: categoría de jugada válida`);
  if (defense.format === 5) {
    const rushers = defense.players.filter((player) => player.assignment.type === 'rush').length;
    ok(rushers >= 1 && rushers <= 2, `${defense.id}: defensa 5v5 con 1-2 rushers`);
    ok(
      defense.players.length - rushers >= 3 && defense.players.length - rushers <= 4,
      `${defense.id}: defensa 5v5 con 3-4 en cobertura`
    );
  }
  for (const spec of defense.players) {
    ok(!!ROLES[spec.role] && ROLES[spec.role].offense === false, `${defense.id}/${spec.label}: rol defensivo`);
    ok(Math.abs(spec.x) <= field.width / 2 - 1, `${defense.id}/${spec.label}: dentro del ancho`);
    ok(!!spec.assignment && typeof spec.assignment === 'object', `${defense.id}/${spec.label}: assignment`);
    const assignment = spec.assignment;
    ok(['man', 'zone', 'rush'].includes(assignment.type), `${defense.id}/${spec.label}: tipo de assignment`);
    if (assignment.type === 'man') {
      ok(typeof assignment.markLabel === 'string' && assignment.markLabel.length > 0, `${defense.id}: man con markLabel`);
    }
    if (assignment.type === 'zone') {
      ok(isNumber(assignment.depth) && assignment.depth > 0, `${defense.id}: zona con depth positivo`);
      ok(isNumber(assignment.landmark?.x) && isNumber(assignment.landmark?.y), `${defense.id}: zona con landmark`);
    }
    if (assignment.type === 'rush') {
      ok([0, 1, 2].includes(assignment.lane), `${defense.id}: rush con lane 0-2`);
    }
  }
}

const manPressUnresolved = buildDefensePlayers('man-press');
eq(manPressUnresolved.length, 5, 'buildDefensePlayers: 5 jugadores sin ofensiva');
for (const player of manPressUnresolved) {
  eq(player.team, 'defense', 'buildDefensePlayers: equipo defensa');
  ok(!!ROLES[player.role], `buildDefensePlayers: rol ${player.role}`);
  if (player.assignment.type === 'man') {
    eq(player.assignment.targetId, null, 'buildDefensePlayers sin ofensiva: man sin targetId');
    ok(typeof player.assignment.markLabel === 'string', 'buildDefensePlayers conserva markLabel');
  }
}

const blitzPlayers = buildDefensePlayers('blitz-2');
const blitzRushers = blitzPlayers.filter((player) => player.assignment.type === 'rush');
eq(blitzRushers.length, 2, 'buildDefensePlayers: blitz de 2 con dos rushers');
ok(blitzRushers.every((player) => player.path?.length === 1 && player.pathType === 'rush'), 'los rushers llevan ruta de rush');

const samplePlay = STARTER_PLAYS.find((play) => play.id === 'play_spread_slant_out');
ok(!!samplePlay, 'jugada de muestra disponible para resolver hombres');
const sampleOffenseIds = new Set(samplePlay.players.filter(isOffense).map((player) => player.id));
const resolvedDefense = buildDefensePlayers('man-press', samplePlay);
for (const player of resolvedDefense) {
  if (player.assignment.type === 'man') {
    ok(
      sampleOffenseIds.has(player.assignment.targetId),
      `buildDefensePlayers: ${player.label} cubre a un receptor real (${player.assignment.markLabel})`
    );
  }
}

eq(buildDefenseFromPreset('no-existe'), null, 'buildDefenseFromPreset devuelve null si no existe');
const defensePlay = buildDefenseFromPreset('man-press', samplePlay);
ok(!!defensePlay, 'buildDefenseFromPreset construye una jugada');
eq(defensePlay.type, 'defense', 'la jugada construida es defensiva');
eq(defensePlay.formation, 'man-press', 'la jugada conserva la formación defensiva');
eq(defensePlay.players.filter((player) => player.team === 'defense').length, 5, 'defensa completa');
eq(defensePlay.players.filter(isOffense).length, 5, 'conserva la ofensiva de la jugada original');
eq(defensePlay.field.width, 30, 'conserva el campo de la jugada original');
eq(defensePlay.ball.targetId, samplePlay.ball.targetId, 'conserva el objetivo del pase');
ok(validatePlay(defensePlay).ok, 'la jugada defensiva construida valida');
for (const player of defensePlay.players.filter((p) => p.team === 'defense')) {
  if (player.assignment.type === 'man') {
    ok(!!player.assignment.targetId, `buildDefenseFromPreset resuelve el hombre de ${player.label}`);
  }
}

const fallbackDefense = buildDefenseFromPreset('cover-3');
ok(!!fallbackDefense, 'buildDefenseFromPreset sin ofensiva usa la formación de referencia');
ok(validatePlay(fallbackDefense).ok, 'la jugada defensiva de referencia valida');
eq(fallbackDefense.players.filter(isOffense).length, 5, 'coloca la ofensiva de referencia');
const sevenDefense = buildDefenseFromPreset('cover-3-7');
ok(!!sevenDefense, 'buildDefenseFromPreset 7v7');
eq(sevenDefense.players.filter((player) => player.team === 'defense').length, 7, 'defensa 7v7 completa');
eq(sevenDefense.field.width, 40, 'campo 7v7 de 40 yardas');

// ===========================================================================
// 4. STARTER_PLAYS
// ===========================================================================
ok(STARTER_PLAYS.length >= 14, `hay al menos 14 jugadas iniciales (${STARTER_PLAYS.length})`);
const offensePlays = STARTER_PLAYS.filter((play) => play.type === 'offense');
const defensePlays = STARTER_PLAYS.filter((play) => play.type === 'defense');
ok(offensePlays.length >= 10, `hay al menos 10 jugadas ofensivas (${offensePlays.length})`);
ok(defensePlays.length >= 4, `hay al menos 4 jugadas defensivas (${defensePlays.length})`);
eq(new Set(STARTER_PLAYS.map((play) => play.id)).size, STARTER_PLAYS.length, 'ids de jugada únicos');

for (const play of STARTER_PLAYS) {
  const validation = validatePlay(play);
  ok(validation.ok, `${play.id}: validatePlay -> ${validation.errors.join(', ')}`);
  const format = formatOfPlay(play);
  ok(!!format, `${play.id}: campo reconocible (${play.field.width} yd)`);
  const expectedPlayers = FORMATS[format].players;
  const offense = play.players.filter(isOffense);
  const defense = play.players.filter((player) => player.team === 'defense');
  eq(offense.length, expectedPlayers, `${play.id}: ofensiva completa`);
  eq(defense.length, expectedPlayers, `${play.id}: defensa esperada completa`);
  eq(play.field.width, FORMATS[format].width, `${play.id}: ancho de campo coherente`);
  eq(play.field.depth, FORMATS[format].depth, `${play.id}: fondo de campo coherente`);
  ok(P_CATEGORIES.includes(play.category), `${play.id}: categoría válida (${play.category})`);
  ok(Array.isArray(play.tags) && play.tags.length >= 1, `${play.id}: tiene tags`);
  ok(typeof play.notes === 'string' && play.notes.length > 60, `${play.id}: notas de entrenador`);
  ok(play.notes.split(/[.!?]/).filter((sentence) => sentence.trim()).length >= 2, `${play.id}: al menos 2 consejos`);
  ok(play.ball.releaseAt >= 0.7 && play.ball.releaseAt <= 2.4, `${play.id}: releaseAt realista (${play.ball.releaseAt})`);
  ok(typeof play.ball.targetId === 'string' && play.ball.targetId.length > 0, `${play.id}: targetId del pase`);
  const target = play.players.find((player) => player.id === play.ball.targetId);
  ok(!!target && target.team === 'offense', `${play.id}: el objetivo es un receptor ofensivo`);
  ok(target.path?.length >= 2, `${play.id}: el objetivo tiene ruta dibujada`);
  eq(new Set(play.players.map((player) => player.id)).size, play.players.length, `${play.id}: ids de jugador únicos`);
  eq(new Set(offense.map((player) => player.label)).size, offense.length, `${play.id}: etiquetas ofensivas únicas`);
  eq(offense.filter((player) => player.role === 'qb').length, 1, `${play.id}: exactamente un mariscal`);
  ok(!!getFormation(play.formation), `${play.id}: formación existente (${play.formation})`);
  if (play.type === 'defense') {
    ok(!!getDefense(play.formation), `${play.id}: la formación defensiva tiene preset`);
  } else {
    ok(getFormation(play.formation).type === 'offense', `${play.id}: la formación ofensiva es de ataque`);
  }

  for (const player of offense) {
    if (player.role === 'qb') {
      eq(player.path, null, `${play.id}: el mariscal no tiene ruta de receptor`);
      continue;
    }
    ok(
      Array.isArray(player.path) && player.path.length >= 2 && player.path.length <= 5,
      `${play.id}/${player.label}: ruta de 2-5 puntos`
    );
    eq(player.pathType, 'route', `${play.id}/${player.label}: pathType route`);
    for (const point of player.path) {
      ok(isNumber(point.x) && isNumber(point.y), `${play.id}/${player.label}: punto de ruta numérico`);
      ok(Math.abs(point.x) <= play.field.width / 2, `${play.id}/${player.label}: la ruta no se sale de banda`);
      ok(
        point.y >= -6 && point.y <= play.field.depth + play.field.ez,
        `${play.id}/${player.label}: la ruta no se sale del fondo`
      );
    }
  }

  const playOffenseIds = new Set(offense.map((player) => player.id));
  for (const defender of defense) {
    ok(
      !!defender.assignment && ['man', 'zone', 'rush'].includes(defender.assignment.type),
      `${play.id}/${defender.label}: assignment real`
    );
    if (defender.assignment.type === 'man') {
      ok(
        playOffenseIds.has(defender.assignment.targetId),
        `${play.id}/${defender.label}: hombre apunta a un receptor real`
      );
    }
    if (defender.assignment.type === 'zone') {
      ok(defender.assignment.depth > 0, `${play.id}/${defender.label}: zona con profundidad`);
    }
  }

  if (play.id === 'play_spread_slant_out') {
    eq(target.label, 'X', 'Spread - Slant y Out: el pase va al slant de X');
  }
}

const playCategories = new Set(offensePlays.map((play) => play.category));
for (const category of ['Pase corto', 'Pase medio', 'Pase profundo', 'Carrera', 'Juego de engaño', 'Conversión']) {
  ok(playCategories.has(category), `variedad de jugadas: categoría ${category}`);
}
ok(offensePlays.some((play) => formatOfPlay(play) === 5), 'hay jugadas 5v5');
ok(offensePlays.some((play) => formatOfPlay(play) === 7), 'hay jugadas 7v7');
ok(offensePlays.some((play) => play.ball.releaseAt <= 1), 'hay pases/entregas rápidas (releaseAt <= 1 s)');
ok(offensePlays.some((play) => play.ball.releaseAt >= 2), 'hay pases profundos (releaseAt >= 2 s)');
ok(
  STARTER_PLAYS.slice(0, 12).some((play) => play.type === 'defense'),
  'la libreta inicial (12 jugadas) incluye defensas'
);

// ===========================================================================
// 5. CONCEPTOS
// ===========================================================================
ok(CONCEPTS.length >= 10, `hay al menos 10 conceptos (${CONCEPTS.length})`);
eq(new Set(CONCEPTS.map((concept) => concept.id)).size, CONCEPTS.length, 'ids de concepto únicos');
for (const requiredId of [
  'mesh',
  'smash',
  'flood',
  'stick',
  'dagger',
  'four-verticals',
  'curl-flat',
  'spot',
  'rub',
  'screen',
]) {
  ok(CONCEPTS.some((concept) => concept.id === requiredId), `concepto exigido: ${requiredId}`);
}

for (const concept of CONCEPTS) {
  const formation = getFormation(concept.formationId);
  ok(!!formation && formation.type === 'offense', `${concept.id}: formación ofensiva existente`);
  ok(!!getDefense(concept.defenseId), `${concept.id}: defensa esperada existente`);
  ok(P_CATEGORIES.includes(concept.category), `${concept.id}: categoría válida`);
  ok(Array.isArray(concept.tags) && concept.tags.length >= 1, `${concept.id}: tags`);
  ok(typeof concept.desc === 'string' && concept.desc.length > 30, `${concept.id}: descripción de concepto`);
  ok(!!concept.routes && typeof concept.routes === 'object', `${concept.id}: mapa de rutas`);
  const labels = new Set(formation.players.map((player) => player.label));
  for (const [label, routeSpec] of Object.entries(concept.routes)) {
    ok(labels.has(label), `${concept.id}: la etiqueta ${label} existe en la formación`);
    const routeId = typeof routeSpec === 'string' ? routeSpec : routeSpec.id;
    ok(!!getRoute(routeId), `${concept.id}: la ruta ${routeId} existe`);
  }
  for (const slot of formation.players.filter((player) => player.role !== 'qb')) {
    ok(
      Object.prototype.hasOwnProperty.call(concept.routes, slot.label),
      `${concept.id}: ruta definida para ${slot.label}`
    );
  }
  ok(labels.has(concept.targetLabel), `${concept.id}: targetLabel existe en la formación`);
  ok(concept.releaseAt >= 0.7 && concept.releaseAt <= 2.4, `${concept.id}: releaseAt realista`);
}

for (const concept of CONCEPTS) {
  const play = buildPlayFromConcept(concept.id);
  ok(!!play, `${concept.id}: buildPlayFromConcept devuelve jugada`);
  const validation = validatePlay(play);
  ok(validation.ok, `${concept.id}: jugada jugable -> ${validation.errors.join(', ')}`);
  eq(play.name, concept.name, `${concept.id}: conserva el nombre del concepto`);
  eq(play.formation, concept.formationId, `${concept.id}: conserva la formación del concepto`);
  ok(!!play.ball.targetId, `${concept.id}: jugada con objetivo de pase`);
  const target = play.players.find((player) => player.id === play.ball.targetId);
  ok(!!target && target.team === 'offense', `${concept.id}: el objetivo es ofensivo`);
  eq(
    play.players.filter((player) => player.team === 'defense').length,
    FORMATS[formatOfPlay(play)].players,
    `${concept.id}: defensa completa`
  );
  for (const player of play.players.filter((p) => p.team === 'offense' && p.role !== 'qb')) {
    ok(Array.isArray(player.path) && player.path.length >= 2, `${concept.id}/${player.label}: ruta dibujada`);
  }
}

eq(buildPlayFromConcept('no-existe'), null, 'buildPlayFromConcept devuelve null si no existe');
const firstMesh = buildPlayFromConcept('mesh');
const secondMesh = buildPlayFromConcept('mesh');
notEq(firstMesh.id, secondMesh.id, 'cada concepto genera una jugada nueva con id único');
const relocatedConcept = buildPlayFromConcept('mesh', { formationId: 'spread-5' });
ok(!!relocatedConcept, 'buildPlayFromConcept acepta otra formación');
eq(relocatedConcept.formation, 'spread-5', 'apply-opts: formación override');
ok(validatePlay(relocatedConcept).ok, 'la jugada con formación override valida');

// ===========================================================================
// 6. applyFormation
// ===========================================================================
const basePlay = STARTER_PLAYS.find((play) => play.id === 'play_spread_slant_out');
ok(!!basePlay, 'applyFormation: jugada base disponible');
const originalOffenseSnapshot = JSON.stringify(
  basePlay.players.filter(isOffense).map((player) => ({ id: player.id, pos: player.pos, path: player.path }))
);
const movedPlay = applyFormation(basePlay, 'trips-right-5');
ok(movedPlay !== basePlay, 'applyFormation devuelve una jugada nueva');
eq(movedPlay.formation, 'trips-right-5', 'applyFormation actualiza la formación');
const movedOffense = movedPlay.players.filter(isOffense);
eq(movedOffense.length, 5, 'applyFormation conserva el número de jugadores ofensivos');
const tripsFormation = getFormation('trips-right-5');
for (const slot of tripsFormation.players) {
  const player = movedOffense.find((candidate) => candidate.label === slot.label);
  ok(!!player, `applyFormation coloca a ${slot.label}`);
  eq(player.pos.x, slot.x, `applyFormation: x de ${slot.label}`);
  eq(player.pos.y, slot.y, `applyFormation: y de ${slot.label}`);
}
const movedValidation = validatePlay(movedPlay);
ok(movedValidation.ok, `applyFormation: jugada válida -> ${movedValidation.errors.join(', ')}`);
eq(movedPlay.ball.targetId, basePlay.ball.targetId, 'applyFormation conserva el objetivo si su receptor sigue');
ok(movedOffense.find((player) => player.label === 'X').path?.length >= 2, 'applyFormation conserva la ruta de X');
eq(movedPlay.players.filter((player) => player.team === 'defense').length, 5, 'applyFormation conserva la defensa');
eq(
  JSON.stringify(basePlay.players.filter(isOffense).map((player) => ({ id: player.id, pos: player.pos, path: player.path }))),
  originalOffenseSnapshot,
  'applyFormation no muta la jugada original'
);
for (const player of movedOffense) {
  for (const point of player.path || []) {
    ok(Math.abs(point.x) <= movedPlay.field.width / 2, `applyFormation: ruta de ${player.label} dentro de banda`);
    ok(
      point.y >= -6 && point.y <= movedPlay.field.depth + movedPlay.field.ez,
      `applyFormation: ruta de ${player.label} dentro del fondo`
    );
  }
}
const movedTo7 = applyFormation(basePlay, 'spread-7');
eq(movedTo7.field.width, 40, 'applyFormation cambia el campo al pasar a 7v7');
eq(movedTo7.players.filter(isOffense).length, 7, 'applyFormation coloca 7 jugadores en 7v7');
ok(validatePlay(movedTo7).ok, 'applyFormation 7v7 produce jugada válida');
eq(applyFormation(basePlay, 'no-existe'), basePlay, 'applyFormation ignora formaciones inexistentes');
eq(applyFormation(basePlay, 'cover-2'), basePlay, 'applyFormation ignora formaciones defensivas');

// ===========================================================================
// Resumen
// ===========================================================================
ok(checks >= 20, `se han ejecutado al menos 20 asserts (${checks})`);
console.log(
  `presets OK · ${FORMATIONS.length} formaciones (${offenseFormations.length} ofensivas / ${defenseFormations.length} defensivas) · ` +
    `${ROUTES.length} rutas · ${DEFENSES.length} defensas · ${STARTER_PLAYS.length} jugadas ` +
    `(${offensePlays.length} ofensivas / ${defensePlays.length} defensivas) · ${CONCEPTS.length} conceptos · ` +
    `${checks} comprobaciones`
);
