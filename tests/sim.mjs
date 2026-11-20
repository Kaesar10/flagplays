// Tests de src/sim.js — motor de simulación y análisis.
// Ejecutar con: node tests/sim.mjs
import assert from 'node:assert/strict';
import { createPlay, createPlayer } from '../src/model.js';
import {
  LEVELS,
  analyzePlay,
  expandAssignments,
  gradeMatchup,
  interpolate,
  openness,
  playDuration,
  simulate,
} from '../src/sim.js';

const LEVEL_KEYS = ['youth', 'rec', 'competitive'];
let checks = 0;

function ok(cond, msg) {
  assert.ok(cond, msg);
  checks += 1;
}
function eq(actual, expected, msg) {
  assert.equal(actual, expected, msg);
  checks += 1;
}
function eqD(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg} (${actual} vs ${expected})`);
  checks += 1;
}

// ---------------------------------------------------------------------------
// Constructores de jugadas sintéticas
// ---------------------------------------------------------------------------

function offensePlay(players, ball = {}) {
  return createPlay({ type: 'offense', name: 'Test', players, ball });
}
function defensePlay(players, name = 'Defensa') {
  return createPlay({ type: 'defense', name, players });
}
function qbPlayer(x = 0, y = -4) {
  return createPlayer({ team: 'offense', role: 'qb', label: 'QB', number: '1', pos: { x, y } });
}
function centerPlayer() {
  return createPlayer({ team: 'offense', role: 'c', label: 'C', number: '55', pos: { x: 0, y: -1 } });
}
function receiver({ x = 0, y = 0, route = [{ x: 0, y: 30 }], label = 'X', number = '11' } = {}) {
  return createPlayer({
    team: 'offense',
    role: 'wr',
    label,
    number,
    pos: { x, y },
    path: route,
    pathType: 'route',
  });
}
function combined(play, def) {
  return { ...play, players: [...play.players, ...def.players] };
}

/** Comprueba que no hay NaN en frames ni trayectorias. */
function assertFiniteSim(sim, label) {
  let points = 0;
  for (const f of sim.frames) {
    for (const id of Object.keys(f.positions)) {
      const p = f.positions[id];
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${label}: posición no finita en ${id}`);
      points += 1;
    }
    if (f.ball) {
      assert.ok(Number.isFinite(f.ball.x) && Number.isFinite(f.ball.y), `${label}: balón no finito`);
      assert.equal(typeof f.ball.inAir, 'boolean', `${label}: inAir debe ser boolean`);
    }
    for (const o of f.open) {
      assert.ok(Number.isFinite(o.sep), `${label}: sep no finito`);
      assert.ok(['open', 'tight', 'covered'].includes(o.state), `${label}: estado inválido`);
    }
  }
  for (const id of Object.keys(sim.players)) {
    for (const p of sim.players[id]) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${label}: trayectoria no finita en ${id}`);
      points += 1;
    }
  }
  ok(points > 0, `${label}: se han comprobado posiciones finitas`);
}

// ---------------------------------------------------------------------------
// 1. playDuration
// ---------------------------------------------------------------------------

{
  const long = receiver({ route: [{ x: 0, y: 30 }] });
  const vertical = offensePlay([qbPlayer(), centerPlayer(), long], { targetId: long.id, releaseAt: 3.2 });
  eqD(playDuration(vertical), 4, 1e-9, 'ruta de 30 yd => 4 s');

  const short = receiver({ route: [{ x: 0, y: 3 }] });
  eqD(playDuration(offensePlay([qbPlayer(), short])), 1.5, 1e-9, 'ruta corta => mínimo 1.5 s');

  const bomb = receiver({ route: [{ x: 0, y: 60 }] });
  eqD(playDuration(offensePlay([qbPlayer(), bomb])), 5, 1e-9, 'ruta larga => máximo 5 s');

  eqD(playDuration(offensePlay([qbPlayer(), centerPlayer()])), 1.5, 1e-9, 'sin rutas => 1.5 s');
}

// ---------------------------------------------------------------------------
// 2. interpolate
// ---------------------------------------------------------------------------

{
  const qb = qbPlayer();
  const wr = receiver({ route: [{ x: 0, y: 30 }] });
  const cb = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'CB',
    pos: { x: 5, y: 0 },
    path: [{ x: 5, y: 10 }],
    pathType: 'zone',
  });
  const play = combined(offensePlay([qb, wr], { targetId: wr.id }), defensePlay([cb]));

  const at0 = interpolate(play, 0);
  eq(Object.keys(at0).length, play.players.length, 'interpolate devuelve todos los jugadores');
  eqD(at0[wr.id].x, 0, 1e-9, 'receptor x en t=0');
  eqD(at0[wr.id].y, 0, 1e-9, 'receptor y en t=0');
  eqD(at0[qb.id].y, -4, 1e-9, 'el QB sin ruta se queda quieto');

  const at2 = interpolate(play, 2);
  eqD(at2[wr.id].y, 15, 1e-6, 'receptor a 7.5 yd/s => 15 yd en 2 s');

  // Defensa: retardo 0.28 s y velocidad 7.5 * 0.93 = 6.975 yd/s.
  const at1 = interpolate(play, 1, { level: 'rec' });
  eqD(at1[cb.id].y, (1 - LEVELS.rec.reactDelay) * 7.5 * LEVELS.rec.speed, 0.02, 'defensa ajustada por nivel');
  eqD(at1[cb.id].y, 5.02, 0.03, 'defensa ~5.0 yd en t=1 (rec)');

  const atEarly = interpolate(play, 0.1, { level: 'rec' });
  eqD(atEarly[cb.id].y, 0, 1e-9, 'la defensa no se mueve antes de reactDelay');

  // Determinismo.
  eq(JSON.stringify(interpolate(play, 1.5)), JSON.stringify(interpolate(play, 1.5)), 'interpolate determinista');
}

// ---------------------------------------------------------------------------
// 3. openness
// ---------------------------------------------------------------------------

{
  const open = openness([{ playerId: 'a', x: 0, y: 0 }], [{ playerId: 'd', x: 0, y: 5 }], 0);
  eq(open.length, 1, 'openness devuelve una entrada por atacante');
  eq(open[0].playerId, 'a', 'openness conserva el playerId');
  eq(open[0].state, 'open', '5 yd de separación => open');
  eqD(open[0].sep, 5, 1e-9, 'sep = distancia al defensor más cercano');

  eq(openness([{ playerId: 'a', x: 0, y: 0 }], [{ playerId: 'd', x: 0, y: 1.0 }], 0)[0].state, 'tight', '1 yd => tight');
  eq(openness([{ playerId: 'a', x: 0, y: 0 }], [{ playerId: 'd', x: 0.3, y: 0 }], 0)[0].state, 'covered', '0.3 yd => covered');

  const noDef = openness([{ playerId: 'a', x: 0, y: 0 }], [], 0);
  ok(noDef[0].sep >= 20 && Number.isFinite(noDef[0].sep), 'sin defensores: separación centinela finita');
  eq(noDef[0].state, 'open', 'sin defensores => open');

  // Acepta jugadores del modelo y usa su ruta en t.
  const routeWr = receiver({ route: [{ x: 0, y: 10 }] });
  const fromPlayers = openness([routeWr], [{ x: 0, y: 7.5 }], 1);
  eq(fromPlayers[0].playerId, routeWr.id, 'openness con jugador del modelo');
  eq(fromPlayers[0].state, 'covered', 'ruta a 7.5 yd coincide con el defensor en t=1');

  // Varios atacantes: cada uno con su defensor más cercano.
  const many = openness(
    [
      { playerId: 'a', x: 0, y: 0 },
      { playerId: 'b', x: 10, y: 0 },
    ],
    [
      { playerId: 'd1', x: 0, y: 4 },
      { playerId: 'd2', x: 10, y: 4 },
    ],
    0
  );
  eq(many.length, 2, 'openness con varios atacantes');
  eqD(many[1].sep, 4, 1e-9, 'cada atacante usa su defensor más cercano');
}

// ---------------------------------------------------------------------------
// 4. expandAssignments
// ---------------------------------------------------------------------------

const wrA = receiver({ x: -10, label: 'A', route: [{ x: -10, y: 12 }] });
const wrB = receiver({ x: 0, label: 'B', route: [{ x: 0, y: 18 }] });
const wrC = receiver({ x: 10, label: 'C', route: [{ x: 10, y: 9 }] });
const offCore = offensePlay([qbPlayer(), centerPlayer(), wrA, wrB, wrC], { targetId: wrB.id, releaseAt: 1.2 });

{
  const cover3 = defensePlay(
    [0, 1, 2, 3, 4].map((i) =>
      createPlayer({
        team: 'defense',
        role: i < 2 ? 's' : 'db',
        label: `D${i}`,
        pos: { x: -12 + i * 6, y: 8 },
        assignment: { type: 'cover3' },
      })
    )
  );
  const exp = expandAssignments(combined(offCore, cover3), 'rec');
  eq(Object.keys(exp).length, 5, 'cover3 expande a todos los defensores');
  eq(Object.values(exp).filter((e) => e.type === 'deep').length, 3, 'cover3 => 3 zonas profundas');
  eq(Object.values(exp).filter((e) => e.type === 'man').length, 2, 'cover3 => 2 en hombre');
  const deeps = Object.values(exp).filter((e) => e.type === 'deep');
  ok(deeps.every((e) => e.depth >= 15), 'las zonas profundas de cover3 están a 15+ yardas');

  const cover2 = defensePlay(
    [0, 1, 2, 3, 4].map((i) =>
      createPlayer({
        team: 'defense',
        role: i < 2 ? 's' : 'db',
        label: `S${i}`,
        pos: { x: -10 + i * 5, y: 7 },
        assignment: { type: 'cover2' },
      })
    )
  );
  const exp2 = expandAssignments(combined(offCore, cover2), 'rec');
  eq(Object.values(exp2).filter((e) => e.type === 'deep').length, 2, 'cover2 => 2 safeties profundos');
  ok(
    Object.values(exp2)
      .filter((e) => e.type === 'deep')
      .every((e) => e.depth >= 15 && Math.abs(e.center.x) > 1),
    'cover2 => mitad de campo y 15+ yardas'
  );

  const cover4 = defensePlay(
    [0, 1, 2, 3, 4, 5].map((i) =>
      createPlayer({
        team: 'defense',
        role: 'db',
        label: `Q${i}`,
        pos: { x: -15 + i * 6, y: 9 },
        assignment: { type: 'cover4' },
      })
    )
  );
  eq(
    Object.values(expandAssignments(combined(offCore, cover4), 'rec')).filter((e) => e.type === 'deep').length,
    4,
    'cover4 => 4 zonas profundas'
  );

  const cover1Def = createPlayer({
    team: 'defense',
    role: 's',
    label: 'FS',
    pos: { x: 0, y: 12 },
    assignment: { type: 'cover1' },
  });
  const exp1 = expandAssignments(combined(offCore, defensePlay([cover1Def])), 'rec');
  eq(exp1[cover1Def.id].type, 'deep', 'cover1 => safety profundo');
  ok(exp1[cover1Def.id].depth >= 15, 'cover1 => safety a 15+ yardas');

  const manDef = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'CB',
    pos: { x: -11, y: 6 },
    assignment: { type: 'man', targetId: wrA.id },
  });
  const expMan = expandAssignments(combined(offCore, defensePlay([manDef])), 'rec');
  eq(expMan[manDef.id].type, 'man', 'man se expande a man');
  eq(expMan[manDef.id].targetId, wrA.id, 'man respeta el targetId explícito');

  const rushDef = createPlayer({
    team: 'defense',
    role: 'dl',
    label: 'R',
    pos: { x: 4, y: 1 },
    assignment: { type: 'rush', lane: 2 },
  });
  const expRush = expandAssignments(combined(offCore, defensePlay([rushDef])), 'rec');
  eq(expRush[rushDef.id].type, 'rush', 'rush se expande a rush');
  eq(expRush[rushDef.id].lane, 2, 'rush respeta el carril');

  const pathDef = createPlayer({
    team: 'defense',
    role: 'lb',
    label: 'P',
    pos: { x: 0, y: 4 },
    path: [{ x: 6, y: 4 }],
    pathType: 'zone',
  });
  const expPath = expandAssignments(combined(offCore, defensePlay([pathDef])), 'rec');
  eq(expPath[pathDef.id].type, 'path', 'sin assignment pero con ruta => path');
  const expRespect = expandAssignments(combined(offCore, defensePlay([pathDef])), 'rec', {
    respectDefensePaths: true,
  });
  eq(expRespect[pathDef.id].type, 'path', 'respectDefensePaths respeta la ruta dibujada');

  const expEmpty = expandAssignments(offCore, 'rec');
  eq(Object.keys(expEmpty).length, 0, 'sin defensa no hay asignaciones');
}

// ---------------------------------------------------------------------------
// 5. simulate: ruta vertical contra defensa vacía
// ---------------------------------------------------------------------------

const verticalWr = receiver({ label: 'X', route: [{ x: 0, y: 30 }] });
const verticalPlay = offensePlay([qbPlayer(), centerPlayer(), verticalWr], {
  targetId: verticalWr.id,
  releaseAt: 3.2,
});
const verticalSim = simulate(verticalPlay, { level: 'competitive' });

{
  eq(verticalSim.level, 'competitive', 'el resultado lleva el nivel');
  eqD(verticalSim.duration, 4, 1e-9, 'simulate usa playDuration');
  eq(verticalSim.frames.length, 121, '4 s a 30 fps => 121 frames (incluye t=0)');
  ok(verticalSim.frames.length <= 151, 'nunca más de ~150 frames');

  eq(verticalSim.outcome.result, 'touchdown', 'ruta vertical libre con lanzamiento profundo => touchdown');
  eq(verticalSim.outcome.targetId, verticalWr.id, 'outcome.targetId es el receptor');
  ok(verticalSim.outcome.reason.length > 10, 'outcome.reason en español y no vacío');
  ok(Number.isFinite(verticalSim.outcome.separation) && verticalSim.outcome.separation > 2, 'separación amplia');
  ok(verticalSim.outcome.openAt !== null && verticalSim.outcome.openAt >= 0, 'openAt informado');
  ok(
    Number.isFinite(verticalSim.outcome.at) &&
      verticalSim.outcome.at >= 0 &&
      verticalSim.outcome.at <= verticalSim.duration,
    'el instante decisivo (at) está dentro de la jugada'
  );

  // t creciente y frame completo.
  for (let i = 1; i < verticalSim.frames.length; i += 1) {
    ok(verticalSim.frames[i].t > verticalSim.frames[i - 1].t, `t creciente en frame ${i}`);
  }
  for (const f of verticalSim.frames) {
    for (const p of verticalPlay.players) {
      ok(!!f.positions[p.id], `el frame incluye a ${p.id}`);
    }
  }

  // Ciclo de vida del balón.
  ok(verticalSim.frames.some((f) => f.ball === null), 'antes del lanzamiento no hay balón');
  ok(verticalSim.frames.some((f) => f.ball && f.ball.inAir === true), 'el balón viaja en el aire');
  const lastFrame = verticalSim.frames[verticalSim.frames.length - 1];
  ok(!!lastFrame.ball && lastFrame.ball.inAir === false, 'el balón termina atrapado/posado');

  // open: un receptor elegible por frame y estados coherentes con sep.
  let openChecks = 0;
  for (const f of verticalSim.frames) {
    eq(f.open.length, 1, 'open solo incluye receptores elegibles');
    const o = f.open[0];
    eq(o.playerId, verticalWr.id, 'id del receptor en open');
    eq(o.state === 'open', o.sep >= 1.5, 'state open coherente con sep >= 1.5');
    openChecks += 1;
  }
  ok(openChecks === verticalSim.frames.length, 'open presente en todos los frames');

  // Trayectorias: un punto por frame y por jugador.
  for (const p of verticalPlay.players) {
    eq(verticalSim.players[p.id].length, verticalSim.frames.length, `trayectoria de ${p.id} con 1 punto/frame`);
  }
  eqD(verticalSim.players[verticalWr.id][60].y, 15, 1e-6, 'receptor a 7.5 yd/s (frame 60 = 2 s)');
  eqD(verticalSim.players[verticalWr.id][0].y, 0, 1e-9, 'receptor empieza en el LOS');

  assertFiniteSim(verticalSim, 'vertical');

  // Determinismo exacto.
  const again = simulate(verticalPlay, { level: 'competitive' });
  eq(JSON.stringify(verticalSim), JSON.stringify(again), 'simulate es determinista');
  ok(
    JSON.stringify(simulate(verticalPlay, { level: 'youth' })) ===
      JSON.stringify(simulate(verticalPlay, { level: 'youth' })),
    'determinismo también en juvenil'
  );

  // Los niveles cambian la simulación (la defensa reacciona distinto).
  const withDef = combosWithDefense(verticalPlay);
  const youthSim = simulate(withDef, { level: 'youth' });
  const compSim = simulate(withDef, { level: 'competitive' });
  ok(JSON.stringify(youthSim.frames) !== JSON.stringify(compSim.frames), 'el nivel afecta a la animación');

  // Ningún frame con NaN (adicional para todas las trayectorias).
  ok(
    verticalSim.frames.every((f) => Object.values(f.positions).every((p) => Number.isFinite(p.x + p.y))),
    'sin NaN en posiciones'
  );

  // simulate no debe mutar la jugada original.
  const snapshot = JSON.stringify(verticalPlay);
  simulate(verticalPlay, { level: 'youth' });
  eq(JSON.stringify(verticalPlay), snapshot, 'simulate no muta la jugada');
}

// Lectura del QB: con qbReads elige la ventana; sin qbReads respeta el targetId.
{
  const leftWr = receiver({ x: -15, label: 'L', route: [{ x: -15, y: 10 }] });
  const rightWr = receiver({ x: 15, label: 'R', route: [{ x: 15, y: 30 }] });
  const readPlay = offensePlay([qbPlayer(), leftWr, rightWr], {
    targetId: rightWr.id,
    releaseAt: 2.2,
  });
  const readsOn = simulate(readPlay, { level: 'rec', qbReads: true });
  eq(readsOn.outcome.targetId, leftWr.id, 'qbReads=true elige la mejor ventana');
  const readsOff = simulate(readPlay, { level: 'rec', qbReads: false });
  eq(readsOff.outcome.targetId, rightWr.id, 'qbReads=false respeta play.ball.targetId');
  ok(
    ['touchdown', 'catch'].includes(readsOff.outcome.result),
    'el tiro designado a un receptor libre se completa'
  );
}

function combosWithDefense(play) {
  const def = defensePlay([
    createPlayer({
      team: 'defense',
      role: 'db',
      label: 'CB',
      pos: { x: 8, y: 6 },
      assignment: { type: 'man', targetId: verticalWr.id },
    }),
  ]);
  return combined(play, def);
}

// ---------------------------------------------------------------------------
// 6. simulate: catch limpio e incompleto contestado
// ---------------------------------------------------------------------------

{
  // Ruta de 20 yd con lanzamiento rápido: se atrapa antes de la end zone.
  const catchWr = receiver({ label: 'C', route: [{ x: 0, y: 20 }] });
  const catchPlay = offensePlay([qbPlayer(), catchWr], { targetId: catchWr.id, releaseAt: 0.9 });
  const catchSim = simulate(catchPlay, { level: 'rec' });
  eq(catchSim.outcome.result, 'catch', 'recepción limpia sin defensa => catch');
  ok(catchSim.outcome.reason.includes('completa'), 'reason de catch en español');
  eq(catchSim.outcome.separation, 99, 'sin defensor la separación es la centinela');
  ok(catchSim.outcome.at > 0.9 && catchSim.outcome.at < 2.5, 'el pase llega en un tiempo razonable');
  assertFiniteSim(catchSim, 'catch');

  // Defensa de zona sentada justo en el punto de recepción: rompe el pase.
  const coveredWr = receiver({ label: 'I', route: [{ x: 0, y: 20 }] });
  const offInc = offensePlay([qbPlayer(), coveredWr], { targetId: coveredWr.id, releaseAt: 0.9 });
  const ballHawk = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'CB',
    pos: { x: 3, y: 12 },
    assignment: { type: 'zone', landmark: { x: 0, y: 12 }, depth: 12 },
  });
  const incSim = simulate(combined(offInc, defensePlay([ballHawk], 'Zona al punto')), { level: 'rec' });
  eq(incSim.outcome.result, 'incomplete', 'defensor en el punto de recepción => incomplete');
  ok(incSim.outcome.separation < 1, 'el pase incompleto se juega con el defensor encima');
  assertFiniteSim(incSim, 'incomplete');
}

// ---------------------------------------------------------------------------
// 7. simulate: ruta corta con defensa encima => covered
// ---------------------------------------------------------------------------

{
  const shortWr = receiver({ label: 'S', route: [{ x: 0, y: 5 }] });
  const offShort = offensePlay([qbPlayer(), shortWr], { targetId: shortWr.id, releaseAt: 1.3 });
  const zoneOnTop = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'CB',
    number: '2',
    pos: { x: 6, y: 5 },
    assignment: { type: 'zone', landmark: { x: 0, y: 5 }, depth: 5 },
  });
  const shortSim = simulate(combined(offShort, defensePlay([zoneOnTop], 'Zona encima')), { level: 'rec' });

  eq(shortSim.outcome.result, 'covered', 'ruta corta con defensa encima => covered');
  ok(shortSim.outcome.reason.length > 10, 'reason de cobertura no vacío');
  ok(
    shortSim.frames[shortSim.frames.length - 1].positions[zoneOnTop.id] !== undefined,
    'los frames incluyen a la defensa'
  );
  eq(shortSim.frames[shortSim.frames.length - 1].open[0].state, 'covered', 'receptor tapado al final');
  assertFiniteSim(shortSim, 'covered');
}

// ---------------------------------------------------------------------------
// 8. simulate: el rush llega antes del lanzamiento => sack
// ---------------------------------------------------------------------------

{
  const deepWr = receiver({ label: 'D', route: [{ x: 0, y: 22 }] });
  const offSack = offensePlay([qbPlayer(), deepWr], { targetId: deepWr.id, releaseAt: 2.0 });
  const rusher = createPlayer({
    team: 'defense',
    role: 'dl',
    label: 'R',
    number: '9',
    // Rusher sin bloqueo en la cara del QB: llega antes de que el QB pueda
    // leer la presión (hot read), así que el sack es inmediato.
    pos: { x: 0, y: -3 },
    assignment: { type: 'rush', lane: 1 },
  });
  const sackSim = simulate(combined(offSack, defensePlay([rusher], 'Rush')), { level: 'rec' });

  eq(sackSim.outcome.result, 'sack', 'el rusher llega antes del lanzamiento => sack');
  ok(sackSim.outcome.reason.includes('rush'), 'reason del sack menciona el rush');
  assertFiniteSim(sackSim, 'sack');
}

// ---------------------------------------------------------------------------
// 9. gradeMatchup
// ---------------------------------------------------------------------------

{
  const strongGrade = gradeMatchup(verticalPlay, defensePlay([], 'Vacía'));
  eq(strongGrade.grade, 'strong', 'TD/catch abierto contra defensa vacía => strong');
  ok(strongGrade.reason.length > 10, 'reason de gradeMatchup no vacío');
  ok(!!strongGrade.sim && Array.isArray(strongGrade.sim.frames), 'gradeMatchup devuelve la simulación');
  ok(strongGrade.reason.includes('X'), 'la razón menciona al receptor');

  const zoneOnTop = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'CB',
    pos: { x: 0, y: 8 },
    assignment: { type: 'zone', landmark: { x: 0, y: 6 }, depth: 6 },
  });
  const shortWr = receiver({ label: 'S', route: [{ x: 0, y: 5 }] });
  const offShort = offensePlay([qbPlayer(), shortWr], { targetId: shortWr.id, releaseAt: 1.3 });
  const midGrade = gradeMatchup(offShort, defensePlay([zoneOnTop], 'Zona'));
  eq(midGrade.grade, 'tough', 'zona encima de una ruta corta => tough');
  ok(midGrade.reason.length > 10, 'reason del matchup cubierto no vacío');

  // defense = null => usa la defensa embebida en la jugada.
  const embedded = combined(offShort, defensePlay([zoneOnTop], 'Propia'));
  const ownGrade = gradeMatchup(embedded, null);
  ok(ownGrade.sim.frames[0].positions[zoneOnTop.id] !== undefined, 'usa la defensa propia de la jugada');
  ok(['strong', 'ok', 'tough'].includes(ownGrade.grade), 'grade con defensa propia');

  // defense = {players:[...]}.
  const objGrade = gradeMatchup(offShort, { players: [zoneOnTop] });
  ok(['strong', 'ok', 'tough'].includes(objGrade.grade), 'acepta {players:[...]} como defensa');

  // Sack => tough si nadie está abierto, ok si hay ventana.
  const rusher = createPlayer({
    team: 'defense',
    role: 'dl',
    label: 'R',
    pos: { x: 0, y: -3 },
    assignment: { type: 'rush', lane: 1 },
  });
  const sackGrade = gradeMatchup(offSackCombo(), defensePlay([rusher], 'Presión'));
  ok(['ok', 'tough'].includes(sackGrade.grade), 'sack se traduce a ok/tough');
  ok(sackGrade.reason.toLowerCase().includes('rush'), 'la razón del sack menciona el rush');

  // Sack + receptor tapado desde el inicio => tough.
  const coveredWr = receiver({ label: 'T', route: [{ x: 0, y: 5 }] });
  const offTough = offensePlay([qbPlayer(), coveredWr], { targetId: coveredWr.id, releaseAt: 1.4 });
  const tightZone = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'CB',
    pos: { x: 2, y: 5 },
    assignment: { type: 'zone', landmark: { x: 0, y: 5 }, depth: 5 },
  });
  const quickRush = createPlayer({
    team: 'defense',
    role: 'dl',
    label: 'R2',
    pos: { x: 0, y: -3 },
    assignment: { type: 'rush', lane: 1 },
  });
  const toughGrade = gradeMatchup(offTough, defensePlay([tightZone, quickRush], 'Pressión total'));
  ok(['ok', 'tough'].includes(toughGrade.grade), 'sack con receptor tapado => ok/tough');
}

function offSackCombo() {
  const deepWr = receiver({ label: 'D', route: [{ x: 0, y: 22 }] });
  return offensePlay([qbPlayer(), deepWr], { targetId: deepWr.id, releaseAt: 2.0 });
}

// ---------------------------------------------------------------------------
// 10. Integración con jugadas del libro (defensa con ofensiva de referencia)
// ---------------------------------------------------------------------------

{
  // Igual que los presets: la jugada defensiva incluye la ofensiva de referencia.
  const refQb = qbPlayer();
  const refWr = receiver({ x: -11, label: 'X', route: [{ x: -11, y: 6 }] });
  const bookDefense = createPlay({
    type: 'defense',
    name: 'Cover 2',
    players: [
      refQb,
      centerPlayer(),
      refWr,
      createPlayer({
        team: 'defense',
        role: 'db',
        label: 'CB1',
        pos: { x: -11, y: 11 },
        assignment: { type: 'zone', landmark: { x: -12, y: 11 }, depth: 11 },
      }),
      createPlayer({
        team: 'defense',
        role: 'db',
        label: 'CB2',
        pos: { x: 11, y: 11 },
        assignment: { type: 'zone', landmark: { x: 12, y: 11 }, depth: 11 },
      }),
      createPlayer({
        team: 'defense',
        role: 'dl',
        label: 'R1',
        pos: { x: 0, y: 1 },
        path: [{ x: 0, y: 6 }],
        pathType: 'rush',
        assignment: { type: 'rush', lane: 1 },
      }),
    ],
  });
  const cb1 = bookDefense.players.find((p) => p.label === 'CB1');
  const bookGrade = gradeMatchup(verticalPlay, bookDefense);
  const frameIds = Object.keys(bookGrade.sim.frames[0].positions);
  ok(!frameIds.includes(refQb.id), 'la ofensiva de referencia de la defensa no entra al matchup');
  ok(!frameIds.includes(refWr.id), 'los receptores de referencia tampoco');
  ok(frameIds.includes(cb1.id), 'la defensa del libro sí entra');
  for (const p of verticalPlay.players) {
    ok(frameIds.includes(p.id), 'la ofensiva analizada se conserva');
  }
  ok(['strong', 'ok', 'tough'].includes(bookGrade.grade), 'grade válido contra una defensa del libro');

  // Los presets de defensa usan markLabel en lugar de targetId.
  const xWr = receiver({ x: -10, label: 'X', route: [{ x: -10, y: 10 }] });
  const yWr = receiver({ x: 10, label: 'Y', route: [{ x: 10, y: 10 }] });
  const labelsPlay = offensePlay([qbPlayer(), xWr, yWr], { targetId: xWr.id, releaseAt: 1.2 });
  const markDef = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'CB',
    pos: { x: 10, y: 2 },
    assignment: { type: 'man', markLabel: 'Y' },
  });
  const expMark = expandAssignments(combined(labelsPlay, defensePlay([markDef])), 'rec');
  eq(expMark[markDef.id].type, 'man', 'man con markLabel');
  eq(expMark[markDef.id].targetId, yWr.id, 'man resuelve markLabel contra los receptores de la jugada');
}

// ---------------------------------------------------------------------------
// 11. analyzePlay
// ---------------------------------------------------------------------------

{
  const defenses = [
    defensePlay([], 'Vacía'),
    defensePlay(
      [
        createPlayer({
          team: 'defense',
          role: 'db',
          label: 'CB',
          pos: { x: 8, y: 6 },
          assignment: { type: 'man', targetId: verticalWr.id },
        }),
      ],
      'Hombre'
    ),
  ];
  const analysis = analyzePlay(verticalPlay, defenses);

  eq(analysis.rows.length, 6, 'rows = defensas (2) x niveles (3)');
  for (const row of analysis.rows) {
    ok(typeof row.defenseId === 'string' && row.defenseId.length > 0, 'row.defenseId');
    ok(typeof row.defenseName === 'string' && row.defenseName.length > 0, 'row.defenseName');
    ok(LEVEL_KEYS.includes(row.level), 'row.level es una clave de LEVELS');
    ok(['strong', 'ok', 'tough'].includes(row.grade), 'row.grade válido');
    ok(typeof row.reason === 'string' && row.reason.length > 5, 'row.reason no vacío');
  }

  const { summary } = analysis;
  eq(summary.strong + summary.ok + summary.tough, 6, 'el summary suma todas las filas');
  ok(typeof summary.verdict === 'string' && summary.verdict.length > 5, 'veredicto no vacío');
  ok(summary.verdict.includes('contra'), 'el veredicto menciona las defensas');

  eq(Object.keys(analysis.byLevel).length, 3, 'byLevel tiene los 3 niveles');
  for (const key of LEVEL_KEYS) {
    const b = analysis.byLevel[key];
    ok(!!b && b.strong + b.ok + b.tough === defenses.length, `byLevel.${key} suma las defensas`);
  }
  eq(Object.keys(analysis.byDefense).length, 2, 'byDefense tiene una entrada por defensa');
  for (const entry of Object.values(analysis.byDefense)) {
    ok(entry.strong + entry.ok + entry.tough === 3, 'byDefense suma los niveles');
    ok(['strong', 'ok', 'tough'].includes(entry.grade), 'byDefense.grade agregado');
  }
  ok(analysis.summary.byLevel === analysis.byLevel, 'el summary también expone byLevel');
  ok(analysis.summary.byDefense === analysis.byDefense, 'el summary también expone byDefense');

  // Con nombres tipo "Hombre" / "Zona profunda" el veredicto es legible.
  const named = analyzePlay(verticalPlay, [
    defensePlay([], 'Hombre'),
    defensePlay(
      [
        createPlayer({
          team: 'defense',
          role: 'db',
          label: 'CB',
          pos: { x: 0, y: 8 },
          assignment: { type: 'zone', landmark: { x: 0, y: 6 }, depth: 6 },
        }),
      ],
      'Zona profunda'
    ),
  ]);
  ok(named.summary.verdict.includes('contra'), 'veredicto con nombres de defensa');
  ok(/hombre|zona/i.test(named.summary.verdict), 'el veredicto cita el tipo de defensa');

  const onlyYouth = analyzePlay(verticalPlay, defenses, { levels: ['youth'] });
  eq(onlyYouth.rows.length, 2, 'opts.levels limita las filas');
  ok(onlyYouth.rows.every((r) => r.level === 'youth'), 'solo el nivel pedido');

  const empty = analyzePlay(verticalPlay, []);
  eq(empty.rows.length, 0, 'sin defensas no hay filas');
  eq(empty.summary.strong + empty.summary.ok + empty.summary.tough, 0, 'summary a cero');
  ok(empty.summary.verdict.length > 0, 'veredicto por defecto no vacío');

  eq(
    JSON.stringify(analyzePlay(verticalPlay, defenses)),
    JSON.stringify(analyzePlay(verticalPlay, defenses)),
    'analyzePlay determinista'
  );
}

// ---------------------------------------------------------------------------
// 12. Diferenciación entre defensas y niveles (regresión del bug del análisis)
// ---------------------------------------------------------------------------

{
  const qb = qbPlayer();
  const xWr = receiver({ x: -12, label: 'X', route: [{ x: -12, y: 8 }, { x: -4, y: 12 }] });
  const yWr = receiver({ x: 0, label: 'Y', route: [{ x: 0, y: 16 }] });
  const zWr = receiver({ x: 12, label: 'Z', route: [{ x: 12, y: 10 }, { x: 8, y: 14 }] });
  const play = offensePlay([qb, centerPlayer(), xWr, yWr, zWr], {
    targetId: yWr.id,
    releaseAt: 1.6,
  });

  const twoRush = defensePlay(
    [
      createPlayer({
        team: 'defense',
        role: 'dl',
        label: 'R1',
        pos: { x: 0, y: 1 },
        assignment: { type: 'rush', lane: 1 },
      }),
      createPlayer({
        team: 'defense',
        role: 'dl',
        label: 'R2',
        pos: { x: 2, y: 1 },
        assignment: { type: 'rush', lane: 2 },
      }),
    ],
    'Doble rush'
  );
  const cover3 = defensePlay(
    [
      createPlayer({
        team: 'defense',
        role: 's',
        label: 'S1',
        pos: { x: -13, y: 8 },
        assignment: { type: 'cover3' },
      }),
      createPlayer({
        team: 'defense',
        role: 's',
        label: 'S2',
        pos: { x: 0, y: 10 },
        assignment: { type: 'cover3' },
      }),
      createPlayer({
        team: 'defense',
        role: 's',
        label: 'S3',
        pos: { x: 13, y: 8 },
        assignment: { type: 'cover3' },
      }),
    ],
    'Cover 3 profundo'
  );
  const manPress = defensePlay(
    [
      createPlayer({
        team: 'defense',
        role: 'db',
        label: 'CB1',
        pos: { x: -12, y: 1.5 },
        assignment: { type: 'man', targetId: xWr.id },
      }),
      createPlayer({
        team: 'defense',
        role: 'db',
        label: 'CB2',
        pos: { x: 0, y: 1.5 },
        assignment: { type: 'man', targetId: yWr.id },
      }),
      createPlayer({
        team: 'defense',
        role: 'db',
        label: 'CB3',
        pos: { x: 12, y: 1.5 },
        assignment: { type: 'man', targetId: zWr.id },
      }),
    ],
    'Man Press'
  );

  const report = analyzePlay(play, [twoRush, cover3, manPress], {});
  eq(report.rows.length, 9, '3 defensas x 3 niveles => 9 filas');
  const reasons = new Set(report.rows.map((r) => r.reason));
  ok(reasons.size >= 2, `los motivos distinguen defensas/niveles (${reasons.size} distintos de 9)`);
  ok(
    new Set(report.rows.map((r) => r.grade)).size >= 2,
    'los grados también varían entre defensas'
  );
  ok(report.summary.verdict.length > 10, 'el veredicto del análisis no está vacío');

  // La defensa pasada sustituye por completo a la defensa incrustada.
  const embedded = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'EMB',
    pos: { x: 0, y: 14 },
    assignment: { type: 'zone', landmark: { x: 0, y: 14 }, depth: 14 },
  });
  const playWithOwn = combined(play, defensePlay([embedded], 'Propia'));
  const swapped = gradeMatchup(playWithOwn, manPress);
  const frameIds = Object.keys(swapped.sim.frames[0].positions);
  ok(!frameIds.includes(embedded.id), 'gradeMatchup quita la defensa incrustada');
  ok(
    frameIds.includes(manPress.players.find((p) => p.label === 'CB1').id),
    'gradeMatchup usa la defensa pasada'
  );
  ok(swapped.sim.frames.some((f) => f.ball !== null), 'con la defensa correcta el balón llega a salir');

  // El nivel cambia de verdad el resultado (reactDelay/speed del motor).
  const youth = gradeMatchup(play, manPress, { level: 'youth' }).sim.outcome;
  const comp = gradeMatchup(play, manPress, { level: 'competitive' }).sim.outcome;
  ok(
    !(youth.separation === comp.separation && youth.openAt === comp.openAt),
    'juvenil y competitivo no dan separation/openAt idénticos'
  );
  ok(
    youth.at !== comp.at || youth.separation !== comp.separation,
    'la jugada se decide de forma distinta por nivel'
  );

  // Hot read: con rush y receptor abierto el balón sale antes del releaseAt.
  const hotSim = simulate(combined(play, twoRush), { level: 'rec' });
  const firstBall = hotSim.frames.findIndex((f) => f.ball !== null);
  ok(firstBall > 0, 'el QB suelta el balón pese a la presión');
  ok(hotSim.frames[firstBall].t < 1.6, 'lo suelta antes del releaseAt programado (hot read)');

  // Regresión exacta del bug reportado: presets reales.
  let presets = null;
  try {
    presets = await import('../src/presets.js');
  } catch {
    presets = null;
  }
  if (presets && Array.isArray(presets.STARTER_PLAYS)) {
    const offenseWithDefense = presets.STARTER_PLAYS.find(
      (p) => p.type === 'offense' && p.players.some((x) => x.team === 'defense')
    );
    const presetDefenses = presets.STARTER_PLAYS.filter((p) => p.type === 'defense');
    if (offenseWithDefense && presetDefenses.length >= 2) {
      const presetReport = analyzePlay(offenseWithDefense, presetDefenses, {});
      const presetReasons = new Set(presetReport.rows.map((r) => r.reason));
      ok(
        presetReasons.size >= 2,
        `con presets reales el análisis da ${presetReasons.size} motivos distintos (antes: 1)`
      );
      ok(
        !presetReport.rows.every((r) => r.reason.startsWith('El rush llega')),
        'no todos los emparejamientos con presets terminan en sack'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 13. Límites de duración y frames
// ---------------------------------------------------------------------------

{
  const bomb = receiver({ route: [{ x: 0, y: 60 }] });
  const bombPlay = offensePlay([qbPlayer(), bomb], { targetId: bomb.id, releaseAt: 0.9 });
  const bombSim = simulate(bombPlay);
  eqD(bombSim.duration, 5, 1e-9, 'duración máxima 5 s');
  eq(bombSim.frames.length, 151, '5 s => 151 frames');
  ok(bombSim.frames.length <= 151, 'tope de frames');
  assertFiniteSim(bombSim, 'bomb');

  const shortPlay = offensePlay([qbPlayer(), receiver({ route: [{ x: 0, y: 2 }] })]);
  const shortSim = simulate(shortPlay);
  ok(shortSim.frames.length >= 45 && shortSim.frames.length <= 47, 'jugada corta ~46 frames');
  ok(shortSim.frames.every((f) => Number.isFinite(f.t)), 't finito');
}

// ---------------------------------------------------------------------------
// 14. Rendimiento
// ---------------------------------------------------------------------------

{
  const pwr1 = receiver({ x: -12, label: 'X1', route: [{ x: -12, y: 8 }, { x: -4, y: 12 }] });
  const pwr2 = receiver({ x: 12, label: 'X2', route: [{ x: 12, y: 20 }] });
  const pwr3 = receiver({ x: 6, label: 'X3', route: [{ x: 6, y: 6 }, { x: -2, y: 6 }] });
  const prb = createPlayer({
    team: 'offense',
    role: 'rb',
    label: 'R',
    pos: { x: 3, y: -2 },
    path: [{ x: 8, y: 2 }],
    pathType: 'route',
  });
  const pte = createPlayer({
    team: 'offense',
    role: 'te',
    label: 'T',
    pos: { x: -6, y: 0 },
    path: [{ x: -6, y: 10 }],
    pathType: 'route',
  });
  const perfOff = offensePlay(
    [qbPlayer(), centerPlayer(), pwr1, pwr2, pwr3, prb, pte],
    { targetId: pwr2.id, releaseAt: 1.2 }
  );

  const perfDef = defensePlay(
    [
      createPlayer({
        team: 'defense',
        role: 'dl',
        label: 'R1',
        pos: { x: 0, y: 1 },
        assignment: { type: 'rush', lane: 1 },
      }),
      createPlayer({
        team: 'defense',
        role: 'lb',
        label: 'M',
        pos: { x: 0, y: 6 },
        assignment: { type: 'zone', landmark: { x: 0, y: 8 }, depth: 8 },
      }),
      createPlayer({
        team: 'defense',
        role: 'db',
        label: 'C1',
        pos: { x: -12, y: 5 },
        assignment: { type: 'man', targetId: pwr1.id },
      }),
      createPlayer({
        team: 'defense',
        role: 'db',
        label: 'C2',
        pos: { x: 12, y: 5 },
        assignment: { type: 'man', targetId: pwr2.id },
      }),
      createPlayer({
        team: 'defense',
        role: 'db',
        label: 'C3',
        pos: { x: 6, y: 5 },
        assignment: { type: 'man', targetId: pwr3.id },
      }),
      createPlayer({
        team: 'defense',
        role: 's',
        label: 'S1',
        pos: { x: 0, y: 14 },
        assignment: { type: 'zone', landmark: { x: 0, y: 15 }, depth: 15 },
      }),
      createPlayer({
        team: 'defense',
        role: 's',
        label: 'S2',
        pos: { x: 8, y: 15 },
        assignment: { type: 'zone', landmark: { x: 8, y: 15 }, depth: 15 },
      }),
    ],
    'Mixta'
  );

  const perfPlay = combined(perfOff, perfDef);
  const warmup = simulate(perfPlay, { level: 'rec' });
  assertFiniteSim(warmup, 'warmup');
  ok(warmup.frames.length > 1, 'la simulación de rendimiento produce frames');

  const started = performance.now();
  for (let i = 0; i < 100; i += 1) {
    simulate(perfPlay, { level: LEVEL_KEYS[i % 3] });
  }
  const elapsed = performance.now() - started;
  ok(elapsed < 400, `100 simulaciones deben tardar < 400 ms (tardaron ${elapsed.toFixed(1)} ms)`);
  console.log(`\n100 simulaciones de 7v7 en ${elapsed.toFixed(1)} ms (${(elapsed / 100).toFixed(2)} ms/sim)`);
}

// ---------------------------------------------------------------------------

console.log(`\n${checks} aserciones OK — tests de sim.js`);
