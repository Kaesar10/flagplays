// Tests de la muñequera: tamaño en cm, cuadrícula de la hoja y una jugada por celda.
import assert from 'node:assert/strict';
import { renderWristbandSheet, wristbandLayout } from '../src/print.js';

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

const play = (i) => ({
  id: `p${i}`,
  name: `Jugada ${i}`,
  category: 'Ofensiva',
  formation: 'trips_right',
  notes: '',
  players: [
    { id: 'qb', team: 'offense', role: 'qb', label: 'QB', pos: { x: 0, y: -4.5 } },
    { id: 'x', team: 'offense', role: 'wr', label: 'X', pos: { x: -14, y: 0 }, route: { points: [{ x: 0, y: 3 }, { x: 0, y: 8 }] } },
  ],
  ball: { receiverId: 'x', releaseAt: 2 },
});
const plays = Array.from({ length: 17 }, (_, i) => play(i + 1));

// ---------- tamaño en centímetros ----------
const cm = wristbandLayout({ size: 'custom', cardWcm: 9, cardHcm: 6, paper: 'A4' });
ok(Math.abs(cm.requestedW - 90) < 0.01, '9 cm de ancho son 90 mm');
ok(Math.abs(cm.requestedH - 60) < 0.01, '6 cm de alto son 60 mm');

const presets = wristbandLayout({ size: '3x5', paper: 'A4' });
ok(Math.abs(presets.requestedW - 76.2) < 0.1, 'el preset 3×5 in mide 76,2 mm');

// ---------- cuadrícula pedida: manda ella ----------
const g = wristbandLayout({ size: 'custom', cardWcm: 9, cardHcm: 6, cols: 3, rows: 5, paper: 'A4' });
ok(g.cols === 3 && g.rows === 5, 'se respetan las columnas y filas pedidas');
ok(g.cardsPerPage === 15, 'cabecen 15 celdas por hoja');
ok(g.shrunk === true, 'la celda se marca como reducida');
const contentW = 210 - 16;
ok(Math.abs(g.cardW - contentW / 3) < 0.01, 'el ancho de celda se ajusta al ancho útil');
ok(g.cols * g.cardW <= contentW + 0.01, 'la rejilla no se sale del papel');

// Rejilla que cabe sin reducir: la celda mantiene su tamaño.
const holgada = wristbandLayout({ size: 'custom', cardWcm: 6, cardHcm: 4, cols: 2, rows: 3, paper: 'A4' });
ok(holgada.shrunk === false, 'sin reducción cuando cabe');
ok(Math.abs(holgada.cardW - 60) < 0.01, 'la celda mantiene los 6 cm');

// Automático (0) sigue calculando la rejilla que cabe.
const auto = wristbandLayout({ size: '3x5', cols: 0, rows: 0, paper: 'A4' });
ok(auto.cols === auto.fitCols && auto.rows === auto.fitRows, 'con 0 se usa la rejilla automática');
ok(auto.autoCols === true && auto.autoRows === true, 'se marca como automática');

// Límites: no se aceptan rejillas absurdas.
const tope = wristbandLayout({ size: 'custom', cardWcm: 2, cardHcm: 2, cols: 40, rows: 40, paper: 'A4' });
ok(tope.cols <= 12 && tope.rows <= 12, 'la rejilla se limita a 12 como máximo');

// ---------- una jugada por celda ----------
const uno = wristbandLayout({ cols: 3, rows: 5, playsPerCard: 1 });
ok(uno.playsPerCard === 1, 'por defecto se pide una jugada por celda');

const html = renderWristbandSheet(plays, { size: 'custom', cardWcm: 9, cardHcm: 6, cols: 3, rows: 5, playsPerCard: 1, paper: 'A4' });
ok((html.match(/grid-template-columns:repeat\((\d+)/) || [])[1] === '3', 'el HTML usa 3 columnas');
ok((html.match(/--pr-card-w:([\d.]+)mm/) || [])[1] === '64.67', 'la celda del HTML mide 64,67 mm');
ok((html.match(/class="pr-wb-card/g) || []).length === 17, 'una tarjeta por jugada');
ok((html.match(/pr-wb-row--solo/g) || []).length === 17, 'cada tarjeta tiene una sola fila (una jugada)');
ok((html.match(/pr-wb-dg/g) || []).length >= 17, 'cada celda lleva su diagrama');
ok((html.match(/pr-wb-page/g) || []).length === 2, '17 jugadas ocupan 2 hojas a 15 por hoja');
ok(!/NaN|undefined/.test(html), 'el HTML no tiene NaN ni undefined');

// Varias jugadas por celda sigue funcionando.
const varias = renderWristbandSheet(plays.slice(0, 4), { cols: 2, rows: 2, playsPerCard: 4, paper: 'A4' });
ok((varias.match(/class="pr-wb-card/g) || []).length === 1, 'con 4 por tarjeta sale una tarjeta');
ok((varias.match(/pr-wb-row"/g) || []).length === 4, 'y cuatro filas dentro');

// ---------- sin defensas ----------
const conDef = {
  ...play(1),
  players: [
    ...play(1).players,
    { id: 'd1', team: 'defense', role: 'cb', label: 'CB1', pos: { x: -14, y: 8 } },
    { id: 'd2', team: 'defense', role: 'lb', label: 'LB1', pos: { x: 0, y: 10 } },
  ],
};
const normal = renderWristbandSheet([conDef], { playsPerCard: 1 });
const limpio = renderWristbandSheet([conDef], { playsPerCard: 1, showDefense: false });
ok(/CB1/.test(normal), 'por defecto se imprimen los defensas');
ok(!/CB1/.test(limpio) && !/LB1/.test(limpio), 'con «Mostrar defensas» desactivado no salen');
ok(limpio.length < normal.length, 'el resultado es distinto al desactivar la defensa');

console.log(`OK: ${n} comprobaciones de la muñequera (tests/wristband.mjs).`);
