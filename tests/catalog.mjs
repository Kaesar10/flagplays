// Tests del catálogo de jugadas predeterminadas: construcción y filtrado.
import assert from 'node:assert/strict';
import {
  allCatalogPlays,
  buildCatalogPlay,
  catalogCounts,
  catalogFacets,
  catalogSummary,
  filterCatalog,
  normalizeText,
} from '../src/catalog.js';
import { CATALOG_PLAYS, CATALOG_FORMATIONS } from '../src/catalog-data.js';

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

const items = allCatalogPlays();

// ---------- datos ----------
ok(CATALOG_PLAYS.length === 20, 'el playbook aporta 20 jugadas');
ok(items.length === 104, 'el catálogo construye 20 del Sub15 + 84 del club');
ok(new Set(items.map((i) => i.cid)).size === 104, 'los identificadores son únicos');
ok(new Set(items.map((i) => i.name)).size === 104, 'los nombres son únicos');
ok(items.every((i) => /^[A-Za-zÁÉÍÓÚÑ ]+ \d+$/.test(i.name)), 'todos siguen el patrón «formación + número»');
ok(items.every((i) => i.originalName), 'se conserva el nombre original de cada jugada');
ok(items.filter((i) => i.source === 'Playbook Sub15').every((i) => CATALOG_FORMATIONS[i.formation]), 'las del Sub15 usan formación conocida');
ok(items.filter((i) => i.source === 'Club (PDF)').every((i) => i.formationLabel), 'las del club tienen formación legible');
ok(items.every((i) => i.reading && i.when), 'todas traen lectura y cuándo usarla');

// ---------- jugadas construidas ----------
for (const item of items.filter((i) => i.source === 'Playbook Sub15')) {
  const play = item.play;
  ok(play.players.length === 5, `${item.name}: cinco jugadores`);
  ok(play.players.filter((p) => p.path && p.path.length).length >= 3, `${item.name}: al menos tres rutas`);
  ok(!!play.players.find((p) => p.id === play.ball.targetId), `${item.name}: el balón va a un jugador`);
  ok(play.notes.length > 20, `${item.name}: lleva notas`);
  ok(play.tags.length >= 2, `${item.name}: lleva etiquetas`);
  ok(Number.isFinite(play.ball.releaseAt), `${item.name}: tiempo de lanzamiento válido`);
  ok(
    play.players.every((p) => Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y)),
    `${item.name}: posiciones numéricas`
  );
  ok(
    play.players.every((p) => !p.path || p.path.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))),
    `${item.name}: puntos de ruta numéricos`
  );
}

// Cada construcción es independiente (no comparte objetos).
const a = buildCatalogPlay(CATALOG_PLAYS[0]);
const b = buildCatalogPlay(CATALOG_PLAYS[0]);
a.players[0].pos.x = 999;
ok(b.players[0].pos.x !== 999, 'las jugadas construidas son independientes');

// ---------- facetas ----------
const facets = catalogFacets();
ok(facets.length === 7, 'hay siete grupos de filtros');
ok(facets.map((f) => f.id).join(',') === 'kind,depth,side,vs,zone,formation,concept', 'los grupos son los esperados');
ok(!facets.some((f) => f.id === 'source'), 'ya no hay filtro por origen (club/sub15)');
ok(facets.every((f) => f.label && f.values && f.values.length), 'cada grupo tiene etiqueta y valores');
ok(facets.find((f) => f.id === 'formation').values.includes('Slot derecha'), 'la formación aparece como valor');

// ---------- filtros ----------
ok(filterCatalog({}).length === 104, 'sin filtros salen todas');
ok(filterCatalog({ kind: ['Pase'] }).length === 100, '100 de pase');
ok(filterCatalog({ kind: ['Carrera'] }).length === 3, '3 de carrera');
ok(filterCatalog({ kind: ['Engaño'] }).length === 1, '1 de engaño');
ok(filterCatalog({ depth: ['Profunda'] }).length >= 6, 'hay profundas');
ok(filterCatalog({ depth: ['Corta'] }).length >= 3, 'hay jugadas cortas');
ok(filterCatalog({ vs: ['Hombre'] }).length >= 9, 'hay jugadas contra hombre');
ok(filterCatalog({ vs: ['Zona'] }).length > 0, 'hay jugadas contra zona');
ok(filterCatalog({ zone: ['Zona roja'] }).length === 1, '1 pensada para zona roja');
ok(filterCatalog({ side: ['Derecha'] }).length > 0, 'hay jugadas al lado derecho');
ok(filterCatalog({ formation: ['Trips derecha'] }).length >= 3, 'hay de trips derecha');
ok(
  filterCatalog({ concept: ['cruce'] }).every((i) => i.concept.includes('cruce')),
  'el filtro de concepto solo devuelve cruces'
);

// Combinación: los filtros son AND
const combi = filterCatalog({ kind: ['Carrera'], vs: ['Zona'] });
ok(combi.length === 3, 'carrera + zona da 3');
ok(combi.every((i) => i.kind === 'Carrera' && i.vs.includes('Zona')), 'la combinación respeta ambos filtros');

// Búsqueda sin tildes
ok(normalizeText('ANÉMONA') === 'anemona', 'normalizeText quita tildes');
ok(filterCatalog({ q: 'anemona' }).length === 1, 'la búsqueda ignora tildes');
ok(filterCatalog({ q: 'post' }).length >= 4, 'buscar «post» encuentra varias');
ok(filterCatalog({ q: 'zzzz' }).length === 0, 'sin resultados devuelve vacío');

// ---------- contadores ----------
const counts = catalogCounts();
ok(counts.kind.Pase === 100 && counts.kind.Carrera === 3, 'los contadores cuadran con los filtros');
ok(counts.depth.Profunda === filterCatalog({ depth: ['Profunda'] }).length, 'contador = resultado del filtro');

// ---------- resumen ----------
const res = catalogSummary(items[0]);
ok(/^Slot Drch \d+$/.test(res.name) && res.formation === 'Slot derecha', 'el resumen trae nombre y formación');
ok(res.originalName === 'ANTONI', 'el resumen conserva el nombre original');
ok(Array.isArray(res.vs) && Array.isArray(res.concept), 'el resumen trae listas');

console.log(`OK: ${n} comprobaciones del catálogo (tests/catalog.mjs).`);
