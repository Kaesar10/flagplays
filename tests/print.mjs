// Tests de src/print.js — generadores de HTML puros (sin DOM).
// Ejecutar: node tests/print.mjs
import assert from 'node:assert/strict';
import { createPlay, createPlayer } from '../src/model.js';
import {
  renderWristbandSheet,
  renderCallSheet,
  renderPlaySheet,
  renderPocketCards,
  renderPlayGridSheet,
  wristbandLayout,
  installPrintStyles,
  printNow,
  openPrintDialog,
} from '../src/print.js';

let passed = 0;

function ok(condition, message) {
  passed += 1;
  assert.ok(condition, message);
}

function eq(actual, expected, message) {
  passed += 1;
  assert.deepEqual(actual, expected, message);
}

function count(html, regex) {
  return (String(html).match(regex) || []).length;
}

function pages(html) {
  return count(html, /<section class="pr-page/g);
}

function wbCards(html) {
  return count(html, /<article class="pr-wb-card/g);
}

function wbRows(html) {
  return count(html, /<div class="pr-wb-row[ "]/g);
}

function wbNumbers(html) {
  return [...String(html).matchAll(/<div class="pr-wb-no">(\d+)<\/div>/g)].map((m) => Number(m[1]));
}

function pcCards(html) {
  return count(html, /<article class="pr-pc-card/g);
}

function gridCells(html) {
  return count(html, /<article class="pr-grid-cell/g);
}

function noBugs(html, label) {
  ok(!/undefined/.test(String(html)), `${label}: el HTML no contiene "undefined"`);
  ok(!/NaN/.test(String(html)), `${label}: el HTML no contiene "NaN"`);
}

// --- Datos de prueba -------------------------------------------------------

function makePlay(name, category, notes = '') {
  const qb = createPlayer({
    team: 'offense',
    role: 'qb',
    label: 'QB',
    number: '1',
    pos: { x: 0, y: -4 },
    path: [{ x: 0, y: 1, curve: 'line' }],
  });
  const wr = createPlayer({
    team: 'offense',
    role: 'wr',
    label: 'X',
    number: '3',
    pos: { x: -12, y: 0 },
    path: [
      { x: -9, y: 7, curve: 'line' },
      { x: -3, y: 12, curve: 'smooth' },
    ],
  });
  const db = createPlayer({
    team: 'defense',
    role: 'db',
    label: 'CB',
    number: '2',
    pos: { x: -12, y: 6 },
  });
  return createPlay({
    name,
    category,
    notes,
    formation: 'trips',
    players: [qb, wr, db],
    ball: { targetId: wr.id, releaseAt: 1.1 },
  });
}

const plays = [
  makePlay('Corto lateral', 'Pase corto', 'Busca el hueco por dentro.'),
  makePlay('Medio al poste', 'Pase medio', 'Ojo al safety.'),
  makePlay('Bomba a la esquina', 'Pase profundo', 'Protección máxima.'),
  makePlay('Carrera exterior', 'Carrera', 'Si la defensa se abre.'),
  makePlay('Conversión de 2', 'Conversión', 'Pase rápido al centro.'),
];
const playsSnapshot = JSON.stringify(plays);

// --- A. API y pureza ------------------------------------------------------

for (const fn of [
  renderWristbandSheet,
  renderCallSheet,
  renderPlaySheet,
  renderPocketCards,
  installPrintStyles,
  printNow,
  openPrintDialog,
]) {
  ok(typeof fn === 'function', 'la API exporta todas las funciones del contrato');
}

ok(typeof renderPlayGridSheet === 'function', 'renderPlayGridSheet es exportada (rejilla extra)');
ok(typeof wristbandLayout === 'function', 'wristbandLayout es exportada (cálculo de rejilla)');

// --- B. Muñequera ---------------------------------------------------------

const wbSolo = renderWristbandSheet(plays, { size: '3.5x5', playsPerCard: 1 });
ok(typeof wbSolo === 'string', 'la muñequera devuelve un string');
eq(pages(wbSolo), 2, 'muñequera 3,5×5 a 1 jugada/tarjeta: 4 tarjetas por hoja ⇒ 2 páginas');
eq(wbCards(wbSolo), 5, 'la muñequera contiene tantas tarjetas como jugadas');
eq(wbRows(wbSolo), 5, 'a 1 jugada por tarjeta hay una fila por tarjeta');
eq(wbNumbers(wbSolo), [1, 2, 3, 4, 5], 'los números de llamada son 1..5');
ok(wbSolo.includes('pr-wb-card'), 'usa la tarjeta recortable de muñequera');
ok(wbSolo.includes('pr-cut'), 'por defecto dibuja bordes de corte');

const wbFour = renderWristbandSheet(plays, { size: '3.5x5', playsPerCard: 4 });
eq(wbCards(wbFour), 2, 'a 4 jugadas por tarjeta, 5 jugadas ocupan 2 tarjetas');
eq(wbRows(wbFour), wbCards(wbFour) * 4, 'cada tarjeta tiene exactamente 4 filas');

const wbTwelve = renderWristbandSheet(plays, { size: '4x6', playsPerCard: 12 });
eq(wbCards(wbTwelve), 1, 'a 12 jugadas por tarjeta solo hace falta 1 tarjeta');
eq(wbRows(wbTwelve), 12, 'con playsPerCard:12 hay 12 filas por tarjeta');

const wbStart = renderWristbandSheet(plays, { size: '3.5x5', playsPerCard: 1, startNumber: 5 });
eq(wbNumbers(wbStart), [5, 6, 7, 8, 9], 'numerar desde 5 asigna 5..9');

const wbNoNumber = renderWristbandSheet(plays, {
  size: '3.5x5',
  playsPerCard: 1,
  showNumber: false,
});
ok(!wbNoNumber.includes('pr-wb-no'), 'showNumber:false oculta los números de llamada');

const wbNoDiagram = renderWristbandSheet(plays, {
  size: '3.5x5',
  playsPerCard: 1,
  showDiagram: false,
});
ok(!wbNoDiagram.includes('pr-wb-dg'), 'showDiagram:false no genera diagramas');

const wbNoCut = renderWristbandSheet(plays, { size: '3.5x5', playsPerCard: 1, cutLines: false });
ok(!wbNoCut.includes('pr-cut'), 'cutLines:false no dibuja líneas de corte');

const wbNotes = renderWristbandSheet(plays, {
  size: '3.5x5',
  playsPerCard: 1,
  showNotes: true,
});
ok(wbNotes.includes('Busca el hueco por dentro.'), 'showNotes:true incluye las notas');

const wbCustom = renderWristbandSheet(plays, {
  size: 'custom',
  cardWidth: 3.25,
  cardHeight: 4.5,
});
ok(wbCustom.includes('82.55mm'), 'el tamaño personalizado 3,25 in equivale a 82,55 mm');
ok(wbCustom.includes('114.3mm'), 'el tamaño personalizado 4,5 in equivale a 114,3 mm');

const wbLetter = renderWristbandSheet(plays, { paper: 'Letter', size: '3.5x5', playsPerCard: 1 });
ok(wbLetter.includes('pr-page--letter'), 'el papel Carta marca la hoja como Letter');

const layoutA4 = wristbandLayout({ size: '3.5x5', paper: 'A4' });
eq([layoutA4.cols, layoutA4.rows, layoutA4.cardsPerPage], [2, 2, 4], '3,5×5 en A4: rejilla 2×2');
const layout46 = wristbandLayout({ size: '4x6', paper: 'A4' });
eq(layout46.cardsPerPage, 1, '4×6 en A4 sólo admite 1 tarjeta por hoja (cabe de verdad)');

noBugs(wbSolo, 'muñequera');
noBugs(wbTwelve, 'muñequera 12');
noBugs(wbCustom, 'muñequera personalizada');

// --- C. Hoja de jugada ----------------------------------------------------

const sheet = renderPlaySheet(plays[0], {});
ok(typeof sheet === 'string', 'la hoja de jugada devuelve un string');
eq(pages(sheet), 1, 'la hoja de jugada ocupa exactamente 1 página');
ok(sheet.includes('Corto lateral'), 'la hoja incluye el nombre de la jugada');
ok(sheet.includes('Busca el hueco por dentro.'), 'la hoja incluye las notas del entrenador');
ok(sheet.includes('Pase corto'), 'la hoja incluye la categoría');
ok(sheet.includes('Formación: Trips'), 'la hoja muestra la formación legible');
ok(sheet.includes('N.º 1'), 'la hoja muestra el número de llamada');
ok(sheet.includes('pr-play-dg'), 'la hoja incluye el hueco del diagrama grande');
ok(sheet.includes('Notas del entrenador'), 'la hoja incluye el bloque de notas');
ok(sheet.includes('Anotaciones'), 'la hoja incluye el espacio de anotaciones');

const sheetNoNotes = renderPlaySheet(plays[0], { showNotes: false });
ok(!sheetNoNotes.includes('Busca el hueco por dentro.'), 'showNotes:false omite las notas');

const sheetNoDiagram = renderPlaySheet(plays[0], { showDiagram: false });
ok(!sheetNoDiagram.includes('pr-play-dg'), 'showDiagram:false omite el diagrama');

const sheetNoName = renderPlaySheet(plays[0], { showName: false });
ok(!sheetNoName.includes('class="pr-play-name"'), 'showName:false omite el nombre');
noBugs(sheet, 'hoja de jugada');

// --- D. Call sheet --------------------------------------------------------

const book = { name: 'Libreta Tigres', plays, roster: [], settings: { field: 5 } };
const callSheet = renderCallSheet(book, { date: '2026-11-20', team: 'Tigres' });
ok(typeof callSheet === 'string', 'el call sheet devuelve un string');
eq(pages(callSheet), 1, 'un call sheet de 5 jugadas cabe en 1 hoja');
ok(callSheet.includes('Call sheet'), 'el call sheet lleva su título');
ok(callSheet.includes('Libreta Tigres'), 'la cabecera incluye el nombre de la libreta');
ok(callSheet.includes('20/11/2026'), 'la cabecera incluye la fecha formateada');
ok(callSheet.includes('Tigres'), 'la cabecera incluye el equipo');
ok(callSheet.includes('>vs<'), 'la tabla tiene la columna «vs» para apuntar la defensa');

const catNames = [...callSheet.matchAll(/<th class="pr-cat-name"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
  m[1]
    .replace(/<span class="pr-cat-count">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
);
eq(
  catNames,
  ['Pase corto', 'Pase medio', 'Pase profundo', 'Carrera', 'Conversión'],
  'el call sheet agrupa por categoría en el orden de juego'
);

const csNumbers = [...callSheet.matchAll(/<td class="pr-c-num">(\d+)<\/td>/g)].map((m) =>
  Number(m[1])
);
eq(csNumbers, [1, 2, 3, 4, 5], 'el call sheet numera las llamadas en orden');

const csNotes = renderCallSheet(book, { date: '2026-11-20', showNotes: true });
ok(csNotes.includes('pr-c-notes'), 'showNotes:true añade la columna de notas');
ok(csNotes.includes('Ojo al safety.'), 'showNotes:true incluye el texto de las notas');

const csNoDiagram = renderCallSheet(book, { date: '2026-11-20', showDiagram: false });
ok(!csNoDiagram.includes('pr-call-dg'), 'showDiagram:false omite los minidiagramas');

const categories = ['Pase corto', 'Pase medio', 'Pase profundo', 'Carrera', 'Conversión'];
const manyPlays = Array.from({ length: 20 }, (_, i) =>
  makePlay(`Jugada ${i + 1}`, categories[i % categories.length], 'nota')
);
const bigCallSheet = renderCallSheet({ name: 'Libreta grande', plays: manyPlays }, {});
const bigPages = pages(bigCallSheet);
ok(bigPages >= 1 && bigPages <= 2, 'un call sheet de 20 jugadas cabe en 1-2 hojas');
noBugs(callSheet, 'call sheet');
noBugs(bigCallSheet, 'call sheet grande');

// --- E. Tarjetas de bolsillo ---------------------------------------------

const pockets = renderPocketCards(plays, {});
ok(typeof pockets === 'string', 'las tarjetas de bolsillo devuelven un string');
eq(pcCards(pockets), 5, 'se genera una tarjeta de bolsillo por jugada');
eq(pages(pockets), 1, '5 tarjetas caben en una hoja');

const manyPockets = renderPocketCards(manyPlays, {});
eq(pcCards(manyPockets), 20, '20 jugadas generan 20 tarjetas de bolsillo');
eq(pages(manyPockets), 3, '8 tarjetas por hoja: 20 jugadas ocupan 3 hojas');
const pocketPages = manyPockets.split('<section class="pr-page').slice(1);
eq(pcCards(pocketPages[0]), 8, 'la primera hoja lleva 8 tarjetas (2 × 4)');
noBugs(pockets, 'tarjetas de bolsillo');
noBugs(manyPockets, 'tarjetas de bolsillo 20');

// --- F. Rejilla extra de jugadas -----------------------------------------

const grid = renderPlayGridSheet(plays, { cols: 2, rows: 2 });
eq(pages(grid), 2, 'rejilla 2×2 con 5 jugadas: 2 páginas');
eq(gridCells(grid), 5, 'la rejilla renderiza una celda por jugada');
ok(grid.includes('pr-grid-dg'), 'la rejilla incluye diagramas');
noBugs(grid, 'rejilla');

// --- G. Escapado y casos límite ------------------------------------------

const evil = makePlay('<b>Peligro</b> & "x"', 'Carrera', 'nota <i>');
const evilHTML = renderWristbandSheet([evil], { size: '3.5x5', playsPerCard: 1 });
ok(
  evilHTML.includes('&lt;b&gt;Peligro&lt;/b&gt; &amp; &quot;x&quot;'),
  'el nombre de la jugada se escapa en el HTML'
);
ok(!evilHTML.includes('<b>Peligro</b>'), 'no se cuela HTML del usuario sin escapar');
noBugs(evilHTML, 'jugada con HTML');

const emptyWristband = renderWristbandSheet([], {});
ok(emptyWristband.includes('pr-page'), 'la muñequera vacía devuelve una hoja válida');
noBugs(emptyWristband, 'muñequera vacía');

const emptyCallSheet = renderCallSheet({ name: 'Vacía', plays: [] });
ok(emptyCallSheet.includes('pr-page'), 'el call sheet vacío devuelve una hoja válida');
ok(emptyCallSheet.includes('No hay jugadas seleccionadas'), 'avisa cuando no hay jugadas');
noBugs(emptyCallSheet, 'call sheet vacío');

const emptyPockets = renderPocketCards([]);
ok(emptyPockets.includes('pr-page'), 'las tarjetas vacías devuelven una hoja válida');
noBugs(emptyPockets, 'tarjetas vacías');

const nullSheet = renderPlaySheet(null);
ok(nullSheet.includes('pr-page'), 'la hoja de jugada con datos nulos no rompe');
noBugs(nullSheet, 'hoja nula');

// --- H. Guardas sin DOM (Node) -------------------------------------------

eq(installPrintStyles(), null, 'installPrintStyles no toca el DOM en Node');
eq(printNow('<p>x</p>'), false, 'printNow no imprime en Node');
eq(openPrintDialog({}), null, 'openPrintDialog no abre nada en Node');

// --- I. Pending: renderer.js ---------------------------------------------

let rendererReady = false;
try {
  const renderer = await import('../src/renderer.js');
  rendererReady = typeof renderer.playToSVG === 'function';
} catch {
  rendererReady = false;
}

if (rendererReady) {
  const wbSvg = renderWristbandSheet(plays, { size: '3.5x5', playsPerCard: 1 });
  ok(wbSvg.includes('<svg'), 'con renderer.js la muñequera incrusta diagramas SVG');
  ok(!wbSvg.includes('pr-dg-empty'), 'con renderer.js no quedan huecos de diagrama');

  const csSvg = renderCallSheet(book, { date: '2026-11-20' });
  eq(count(csSvg, /<svg/g), 5, 'el call sheet incrusta un minidiagrama por jugada');

  const sheetSvg = renderPlaySheet(plays[0], {});
  ok(sheetSvg.includes('<svg'), 'la hoja de jugada incrusta el diagrama grande');

  console.log('· renderer.js disponible: asertos de diagrama incluidos.');
} else {
  console.log('· renderer.js no disponible todavía: se omiten los asertos de diagrama.');
}

// --- J. Pureza ------------------------------------------------------------

eq(JSON.stringify(plays), playsSnapshot, 'los generadores no mutan las jugadas de entrada');

console.log(`\nprint.mjs OK — ${passed} asertos superados.`);
