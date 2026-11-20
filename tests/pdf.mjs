// tests/pdf.mjs — Batería de pruebas de src/pdf.js
// Uso: node tests/pdf.mjs
//
// Comprueba la estructura del PDF (xref, objetos, trailer), la codificación
// WinAnsi/CP1252, las métricas de texto y las primitivas vectoriales.
// Además genera qa/pdf-sample.pdf para revisión visual con PyMuPDF.

import assert from 'node:assert/strict';
import { writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPdf, PAGE_SIZES, encodeWinAnsi } from '../src/pdf.js';
import { encodedWidth } from '../src/afm.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const qaDir = join(root, 'qa');

// --- mini arnés -------------------------------------------------------------

let asserts = 0;

function check(condition, message = 'assert') {
  asserts += 1;
  assert.ok(condition, message);
}

function eq(actual, expected, message = 'assert') {
  asserts += 1;
  assert.deepEqual(actual, expected, message);
}

function near(actual, expected, tolerance, message = 'assert') {
  asserts += 1;
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} no está a ${tolerance} de ${expected}`,
  );
}

function throws(fn, matcher, message = 'assert.throws') {
  asserts += 1;
  assert.throws(fn, matcher, message);
}

// --- utilidades de inspección ----------------------------------------------

/** Texto "binario" (charCode = byte) del PDF serializado. */
function pdfText(pdf) {
  return Buffer.from(pdf.bytes()).toString('latin1');
}

/** Mapa número de objeto -> cuerpo del objeto. */
function objectsOf(pdf) {
  const text = pdfText(pdf);
  const objects = new Map();
  const re = /(\d+) 0 obj\n([\s\S]*?)\nendobj\n/g;
  let match;
  while ((match = re.exec(text)) !== null) objects.set(Number(match[1]), match[2]);
  return objects;
}

/** Content streams en orden de página. */
function streamsOf(pdf) {
  const text = pdfText(pdf);
  return [...text.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((match) => match[1]);
}

/** Posiciones `Tm` (x, y PDF) de un content stream. */
function tmPositions(stream) {
  return [...stream.matchAll(/1 0 0 1 (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Tm/g)].map(
    (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
  );
}

/** Extrae la tabla xref de un PDF recién serializado. */
function xrefOf(pdf) {
  const text = pdfText(pdf);
  const startxref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  if (!startxref) throw new Error('sin startxref');
  const xrefOffset = Number(startxref[1]);
  const header = /^xref\s+(\d+)\s+(\d+)\s*\n/.exec(text.slice(xrefOffset));
  if (!header) throw new Error('startxref no apunta a xref');
  const first = Number(header[1]);
  const total = Number(header[2]);
  const entries = [];
  for (let i = 0; i < total; i++) {
    const start = xrefOffset + header[0].length + i * 20;
    const line = text.slice(start, start + 20);
    const entry = /^(\d{10}) (\d{5}) ([nf]) \n$/.exec(line);
    if (!entry) throw new Error(`entrada xref ${i} mal formada: ${JSON.stringify(line)}`);
    entries.push({ offset: Number(entry[1]), type: entry[3] });
  }
  return { text, xrefOffset, first, total, entries };
}

// =============================================================================
// 1. Tamaños de página y construcción
// =============================================================================

eq(PAGE_SIZES.A4.width, 595.28, 'A4 ancho');
eq(PAGE_SIZES.A4.height, 841.89, 'A4 alto');
eq(PAGE_SIZES.Letter.width, 612, 'Letter ancho');
eq(PAGE_SIZES.Letter.height, 792, 'Letter alto');
check(PAGE_SIZES.A3.width > PAGE_SIZES.A4.width, 'A3 es más ancho que A4');
check(PAGE_SIZES.A3.height > PAGE_SIZES.A4.height, 'A3 es más alto que A4');

const empty = createPdf();
check(empty.pageCount === 1, 'createPdf arranca con 1 página');
check(empty.width === PAGE_SIZES.A4.width && empty.height === PAGE_SIZES.A4.height, 'dimensiones A4');
check(empty.margin === 36, 'margen por defecto');

const custom = createPdf({ size: { width: 300, height: 400 }, margin: 12 });
check(custom.width === 300 && custom.height === 400, 'tamaño personalizado');
check(custom.margin === 12, 'margen personalizado');

const landscape = createPdf({ size: 'Letter', landscape: true });
check(landscape.width === 792 && landscape.height === 612, 'Letter horizontal');
check(pdfText(landscape).includes('/MediaBox [0 0 792 612]'), 'MediaBox horizontal exacto');

const twoPages = createPdf();
eq(twoPages.addPage({ margin: 20 }), 2, 'addPage devuelve 2');
check(twoPages.pageCount === 2 && twoPages.margin === 20, 'margen de la nueva página');
twoPages.setPage(1);
check(twoPages.margin === 36, 'setPage restaura el margen de la página 1');

// =============================================================================
// 2. Estructura del fichero: cabecera, objetos, xref, trailer
// =============================================================================

const doc = createPdf({ size: 'A4', margin: 44, title: 'Memoria — ñandú', author: 'FlagPlays', subject: 'Pruebas' });
doc.text('Árbol de rutas — ñandú ¿qué?', 60, 70, { font: 'bold', size: 18 });
doc.rect(60, 110, 160, 70, { fill: '#f1f5f9', stroke: '#334155', radius: 8 });
doc.circle(300, 140, 32, { fill: '#a3e635', opacity: 0.5 });
doc.polyline(
  [
    { x: 60, y: 240 },
    { x: 160, y: 200 },
    { x: 260, y: 260 },
  ],
  { stroke: '#0ea5e9', lineWidth: 2.5, arrowEnd: true },
);
doc.line(60, 300, 400, 300, { stroke: '#111827', dash: '6 4' });
doc.text('Columna izquierda', 60, 340, { size: 10 });
doc.text('Centro', 60, 370, { size: 10, align: 'center', maxWidth: 340 });
doc.text('Derecha', 60, 400, { size: 10, align: 'right', maxWidth: 340 });

const bytes = doc.bytes();
check(bytes instanceof Uint8Array, 'bytes() devuelve Uint8Array');
check(bytes.length > 1000, 'el PDF tiene contenido');
check(String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-', 'cabecera %PDF-');
check(pdfText(doc).startsWith('%PDF-1.4'), 'versión 1.4');
check(/%%EOF\s*$/.test(pdfText(doc)), 'termina en %%EOF');

const { text, xrefOffset, first, total, entries } = xrefOf(doc);
check(first === 0, 'la tabla xref empieza en 0');
check(text.slice(xrefOffset, xrefOffset + 4) === 'xref', 'startxref apunta a la tabla xref');
eq(entries[0].type, 'f', 'entrada 0 libre');
eq(entries[0].offset, 0, 'offset de la entrada libre es 0');
let offsetsOk = true;
for (let n = 1; n < total; n++) {
  if (!text.startsWith(`${n} 0 obj`, entries[n].offset)) offsetsOk = false;
}
check(offsetsOk, 'todos los offsets xref apuntan a "N 0 obj"');
check(total > 5, 'la tabla tiene varios objetos');

const objects = objectsOf(doc);
const trailer = text.slice(text.indexOf('trailer'), text.indexOf('startxref'));
check(/\/Size\s+\d+/.test(trailer), 'trailer con /Size');
check(/\/Root\s+\d+\s+0\s+R/.test(trailer), 'trailer con /Root');
check(/\/Info\s+\d+\s+0\s+R/.test(trailer), 'trailer con /Info');
const sizeMatch = /\/Size\s+(\d+)/.exec(trailer);
eq(Number(sizeMatch[1]), objects.size + 1, '/Size = número de objetos + 1');

const catalog = [...objects.values()].find((body) => body.includes('/Type /Catalog'));
check(!!catalog, 'existe el catálogo');
const pagesBody = [...objects.values()].find((body) => body.includes('/Type /Pages'));
check(/\/Kids\s*\[/.test(pagesBody), '/Pages tiene /Kids');
check(/\/Count 1/.test(pagesBody), '/Count coincide con las páginas');
const pageObjects = [...objects.values()].filter((body) => /\/Type \/Page(?!s)/.test(body));
eq(pageObjects.length, 1, 'un solo objeto /Page');

const allText = pdfText(doc);
check((allText.match(/\/BaseFont \/Helvetica /g) || []).length === 1, 'incluye Helvetica');
check((allText.match(/\/BaseFont \/Helvetica-Bold /g) || []).length === 1, 'incluye Helvetica-Bold');
check((allText.match(/\/BaseFont \/Helvetica-Oblique /g) || []).length === 1, 'incluye Helvetica-Oblique');
check(
  (allText.match(/\/BaseFont \/Helvetica-BoldOblique /g) || []).length === 1,
  'incluye Helvetica-BoldOblique',
);
check((allText.match(/\/BaseFont \/Helvetica/g) || []).length === 4, 'cuatro fuentes Helvetica');
check((allText.match(/\/Encoding \/WinAnsiEncoding/g) || []).length === 4, 'las cuatro con WinAnsiEncoding');

// =============================================================================
// 3. Codificación WinAnsi / CP1252
// =============================================================================

const specials = [
  ['Á', 0xc1], ['á', 0xe1], ['É', 0xc9], ['é', 0xe9], ['Í', 0xcd], ['í', 0xed],
  ['Ó', 0xd3], ['ó', 0xf3], ['Ú', 0xda], ['ú', 0xfa], ['ñ', 0xf1], ['Ñ', 0xd1],
  ['ü', 0xfc], ['Ü', 0xdc], ['ç', 0xe7], ['¿', 0xbf], ['¡', 0xa1], ['º', 0xba],
  ['ª', 0xaa], ['«', 0xab], ['»', 0xbb], ['°', 0xb0], ['€', 0x80], ['—', 0x97],
  ['–', 0x96], ['…', 0x85], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95],
  ['™', 0x99], ['œ', 0x9c], ['Ÿ', 0x9f],
];
let encodingOk = true;
for (const [char, byte] of specials) {
  if (encodeWinAnsi(char)[0] !== byte) encodingOk = false;
}
check(encodingOk, 'mapa CP1252 completo (tildes, ñ, ü, ¿, ¡, º, ª, «, », °, €, …)');
eq(encodeWinAnsi('→')[0], 0x3f, 'carácter no representable -> ?');
eq(encodeWinAnsi('a\nb')[1], 0x20, 'salto de línea se aplana a espacio');
eq(encodeWinAnsi('')[0], undefined, 'cadena vacía -> sin códigos');

const accentText = 'Árbol de rutas — ñandú ¿qué? ¡Olé! «diseño» º ª 20 °C 12 €';
const accentCodes = encodeWinAnsi(accentText);
check(accentCodes.length === accentText.length, 'una entrada WinAnsi por carácter');
check(accentCodes.includes(0xf1), 'incluye ñ (0xF1)');
check(accentCodes.includes(0xc1), 'incluye Á (0xC1)');
check(accentCodes.includes(0xbf), 'incluye ¿ (0xBF)');
check(accentCodes.includes(0x80), 'incluye € (0x80)');

// La prueba clave: el stream contiene los BYTES CP1252, no entidades.
const accentedDoc = createPdf();
accentedDoc.text('Árbol de rutas — ñandú ¿qué? ¡Olé! «diseño»', 40, 60, { size: 12 });
const accentedStream = streamsOf(accentedDoc)[0];
check(accentedStream.includes('\xC1rbol'), 'el stream contiene 0xC1 de Á');
check(accentedStream.includes('\xF1and'), 'el stream contiene 0xF1 de ñ');
check(accentedStream.includes('\xBFqu'), 'el stream contiene 0xBF de ¿');
check(accentedStream.includes('\x97'), 'el stream contiene 0x97 de —');
check(accentedStream.includes('\xA1Ol'), 'el stream contiene 0xA1 de ¡');
check(accentedStream.includes('\xABdise'), 'el stream contiene 0xAB de «');

// =============================================================================
// 4. Métricas de texto (afm.js)
// =============================================================================

const metricsDoc = createPdf();
const sampleText = 'Árbol de rutas — ñandú ¿qué?';
const expectedWidth = (encodedWidth(encodeWinAnsi(sampleText), 'Helvetica') / 1000) * 11;
near(metricsDoc.measureText(sampleText), expectedWidth, 1e-9, 'measureText == encodedWidth de afm.js');
near(
  metricsDoc.measureText(sampleText, { size: 22 }),
  expectedWidth * 2,
  1e-9,
  'measureText escala con size',
);
check(
  metricsDoc.measureText('juego', { font: 'bold' }) !== metricsDoc.measureText('juego'),
  'bold usa la tabla Helvetica-Bold',
);
near(
  metricsDoc.measureText('juego', { font: 'italic' }),
  (encodedWidth(encodeWinAnsi('juego'), 'Helvetica-Oblique') / 1000) * 11,
  1e-9,
  'italic usa Helvetica-Oblique',
);
near(
  metricsDoc.measureText('juego', { font: 'bolditalic' }),
  (encodedWidth(encodeWinAnsi('juego'), 'Helvetica-BoldOblique') / 1000) * 11,
  1e-9,
  'bolditalic usa Helvetica-BoldOblique',
);

// =============================================================================
// 5. Escapado de cadenas PDF
// =============================================================================

const escapeDoc = createPdf();
escapeDoc.text('A (B) \\ C', 40, 60);
const escapeStream = streamsOf(escapeDoc)[0];
check(escapeStream.includes('A \\(B\\) \\\\ C'), 'escapa ( ) \\ dentro de la cadena PDF');
check(escapeStream.includes('Tj'), 'usa el operador Tj');

// =============================================================================
// 6. wrapText / textBlock / fits
// =============================================================================

const wrapDoc = createPdf();
const longText =
  'El quarterback lee primero al esquinero y después al profundo; si la cobertura es de hombre, busca el poste exterior.';
const wrapped = wrapDoc.wrapText(longText, 110, { size: 10 });
check(wrapped.length > 2, 'wrapText parte en varias líneas');
let wrapFits = true;
for (const line of wrapped) {
  if (wrapDoc.measureText(line, { size: 10 }) > 110 + 1e-6) wrapFits = false;
}
check(wrapFits, 'ninguna línea de wrapText excede maxWidth');
check(
  wrapped.join(' ').replace(/\s+/g, ' ') === longText,
  'wrapText conserva todas las palabras',
);
check(wrapDoc.wrapText('', 100).length === 1, 'wrapText de cadena vacía -> [""]');
const longWord = wrapDoc.wrapText('supercalifragilisticoespialidoso', 40, { size: 10 });
check(longWord.length > 1, 'wrapText parte palabras más anchas que la caja');
let longWordFits = true;
for (const line of longWord) {
  if (wrapDoc.measureText(line, { size: 10 }) > 40 + 1e-6) longWordFits = false;
}
check(longWordFits, 'las palabras partidas respetan maxWidth');
check(wrapDoc.fits('Hola', 60), 'fits true si cabe');
check(!wrapDoc.fits('Hola mundo', 20), 'fits false si no cabe');
check(wrapDoc.fits('Hola', null), 'fits sin maxWidth siempre true');

const blockDoc = createPdf();
const blockText = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce';
const blockStyle = { size: 10, maxWidth: 80, lineHeight: 1.4 };
const blockLines = blockDoc.wrapText(blockText, 80, blockStyle);
const blockHeight = blockDoc.textBlock(blockText, 40, 60, blockStyle);
near(blockHeight, blockLines.length * 10 * 1.4, 1e-9, 'textBlock devuelve alto consumido');

// =============================================================================
// 7. Alineación (izquierda / centro / derecha)
// =============================================================================

function alignmentDoc(align) {
  const pdf = createPdf();
  pdf.text('Hola mundo', 100, 100, { font: 'bold', size: 16, align, maxWidth: 200 });
  return pdf;
}
const leftPdf = alignmentDoc('left');
const centerPdf = alignmentDoc('center');
const rightPdf = alignmentDoc('right');
const widthWord = leftPdf.measureText('Hola mundo', { font: 'bold', size: 16 });
const leftPos = tmPositions(streamsOf(leftPdf)[0])[0];
const centerPos = tmPositions(streamsOf(centerPdf)[0])[0];
const rightPos = tmPositions(streamsOf(rightPdf)[0])[0];
near(leftPos.x, 100, 0.01, 'align left empieza en x');
near(centerPos.x, 100 + (200 - widthWord) / 2, 0.01, 'align center = x + (maxWidth - width)/2');
near(rightPos.x, 100 + 200 - widthWord, 0.01, 'align right termina en x + maxWidth');
const emptyPagePositions = tmPositions(streamsOf(createPdf())[0] || '');
eq(emptyPagePositions.length, 0, 'documento sin texto no tiene operador Tm');
const baselinePdf = createPdf();
baselinePdf.text('x', 10, 100, { size: 10 });
const baselinePos = tmPositions(streamsOf(baselinePdf)[0])[0];
near(baselinePos.y, PAGE_SIZES.A4.height - (100 + 10 * 0.718), 0.01, 'baseline top usa ascendente');
const middlePdf = createPdf();
middlePdf.text('x', 10, 100, { size: 10, baseline: 'middle' });
const middlePos = tmPositions(streamsOf(middlePdf)[0])[0];
near(middlePos.y, PAGE_SIZES.A4.height - (100 + 10 * 0.2555), 0.01, 'baseline middle centra la caja');

// =============================================================================
// 8. Primitivas vectoriales
// =============================================================================

const rectDoc = createPdf();
rectDoc.rect(20, 30, 100, 40, { fill: '#ff0000' });
const rectStream = streamsOf(rectDoc)[0];
check(rectStream.includes(' re'), 'rect sin radio usa el operador re');
check(rectStream.includes('1 0 0 rg'), 'fill #ff0000 -> 1 0 0 rg');
check(rectStream.trimEnd().endsWith('f'), 'rect relleno termina en f');

const roundDoc = createPdf();
roundDoc.rect(20, 30, 120, 60, { fill: '#e2e8f0', stroke: '#0f172a', radius: 12 });
const roundStream = streamsOf(roundDoc)[0];
check(!roundStream.includes(' re'), 'rect con radio no usa re');
check((roundStream.match(/ c\n/g) || []).length >= 4, 'rect redondeado usa curvas de Bézier');
check(roundStream.includes('B'), 'relleno + contorno usan B');
const clampDoc = createPdf();
let clamped = true;
try {
  clampDoc.rect(0, 0, 10, 10, { radius: 500 });
} catch {
  clamped = false;
}
check(clamped, 'el radio se recorta sin lanzar');

const circleDoc = createPdf();
circleDoc.circle(100, 100, 40, { fill: '#22c55e', stroke: '#14532d' });
const circleStream = streamsOf(circleDoc)[0];
eq((circleStream.match(/ c\n/g) || []).length, 4, 'circle == 4 curvas de Bézier');
check(circleStream.includes('\nh\n'), 'circle cierra el camino');
const ellipseDoc = createPdf();
ellipseDoc.ellipse(100, 100, 60, 20, { fill: '#f59e0b' });
check((streamsOf(ellipseDoc)[0].match(/ c\n/g) || []).length === 4, 'ellipse == 4 curvas');

const polyDoc = createPdf();
polyDoc.polyline(
  [
    { x: 10, y: 10 },
    { x: 60, y: 30 },
    { x: 110, y: 10 },
  ],
  { stroke: '#0f172a', lineWidth: 2 },
);
const polyStream = streamsOf(polyDoc)[0];
eq((polyStream.match(/ l\n/g) || []).length, 2, 'polyline con 3 puntos -> 2 l');
check(polyStream.includes('2 w'), 'lineWidth 2 -> 2 w');
check(polyStream.trimEnd().endsWith('S'), 'polyline abierta termina en S');

const polygonDoc = createPdf();
polygonDoc.polygon(
  [
    { x: 10, y: 10 },
    { x: 60, y: 30 },
    { x: 110, y: 10 },
  ],
  { fill: '#a3e635', stroke: '#3f6212' },
);
const polygonStream = streamsOf(polygonDoc)[0];
check(polygonStream.includes('\nh\n'), 'polygon cierra con h');
check(polygonStream.includes('B'), 'polygon relleno + contorno');

const arrowDoc = createPdf();
arrowDoc.polyline(
  [
    { x: 10, y: 10 },
    { x: 100, y: 10 },
  ],
  { stroke: '#0f172a', lineWidth: 2, arrowEnd: true },
);
const arrowStream = streamsOf(arrowDoc)[0];
check(arrowStream.includes('f'), 'arrowEnd añade una punta rellena');
check(arrowStream.includes('l'), 'la punta se compone de segmentos');

// --- guionado, extremos y uniones ---

const dashDoc = createPdf();
dashDoc.line(10, 10, 200, 10, { stroke: '#111827', dash: '6 4' });
const dashStream = streamsOf(dashDoc)[0];
check(dashStream.includes('[6 4] 0 d'), "dash '6 4' -> [6 4] 0 d");
const dashDoc2 = createPdf();
dashDoc2.line(10, 10, 200, 10, { stroke: '#111827', dash: '6 4' });
dashDoc2.line(10, 20, 200, 20, { stroke: '#111827' });
check(streamsOf(dashDoc2)[0].includes('[] 0 d'), 'la línea sólida posterior resetea el dash');
const dashArrayDoc = createPdf();
dashArrayDoc.line(10, 10, 200, 10, { stroke: '#111827', dash: [3, 2] });
check(streamsOf(dashArrayDoc)[0].includes('[3 2] 0 d'), 'dash con array de números');

const capDoc = createPdf();
capDoc.line(10, 10, 200, 10, { stroke: '#111827', lineCap: 'round', lineJoin: 'bevel' });
const capStream = streamsOf(capDoc)[0];
check(capStream.includes('1 J'), 'lineCap round -> 1 J');
check(capStream.includes('2 j'), 'lineJoin bevel -> 2 j');

// --- colores ---

const colorDoc = createPdf();
colorDoc.rect(10, 10, 20, 20, { fill: '#0f0' });
colorDoc.rect(40, 10, 20, 20, { fill: [0, 0, 255] });
colorDoc.rect(70, 10, 20, 20, { fill: 'not-a-color' });
const colorStream = streamsOf(colorDoc)[0];
check(colorStream.includes('0 1 0 rg'), '#0f0 -> 0 1 0 rg');
check(colorStream.includes('0 0 1 rg'), '[0,0,255] -> 0 0 1 rg');
check(colorStream.includes('0.067 0.094 0.153 rg'), 'color inválido cae a la tinta por defecto');
const strokeColorDoc = createPdf();
strokeColorDoc.line(10, 10, 100, 10, { stroke: '#ff0000' });
check(streamsOf(strokeColorDoc)[0].includes('1 0 0 RG'), 'stroke usa el operador RG');

// --- opacidad ---

const opacityDoc = createPdf();
opacityDoc.rect(10, 10, 100, 50, { fill: '#0ea5e9', opacity: 0.5 });
opacityDoc.rect(10, 80, 100, 50, { fill: '#0ea5e9', opacity: 0.5 });
const opacityStream = streamsOf(opacityDoc)[0];
check(opacityStream.includes('/GS2 gs'), 'opacidad usa un recurso /ExtGState');
check(opacityStream.includes(' gs\n'), 'el recurso se activa con gs');
const opacityObjects = [...objectsOf(opacityDoc).values()];
check(
  opacityObjects.filter((body) => body.includes('/Type /ExtGState /ca 0.5 /CA 0.5')).length === 1,
  'las opacidades iguales reutilizan el mismo /ExtGState',
);
check(opacityObjects.some((body) => body.includes('/ca 1 /CA 1')), 'existe el estado por defecto');
const splitOpacityDoc = createPdf();
splitOpacityDoc.rect(10, 10, 100, 50, {
  fill: '#0f172a',
  stroke: '#ef4444',
  fillOpacity: 0.25,
  strokeOpacity: 0.75,
});
check(
  [...objectsOf(splitOpacityDoc).values()].some((body) => body.includes('/ca 0.25 /CA 0.75')),
  'fillOpacity y strokeOpacity se registran por separado',
);
const textOpacityDoc = createPdf();
textOpacityDoc.text('tenue', 10, 10, { opacity: 0.4 });
check(/\/GS\d+ gs/.test(streamsOf(textOpacityDoc)[0]), 'el texto también admite opacidad');

// =============================================================================
// 9. Estado gráfico, transformaciones y páginas
// =============================================================================

const stateDoc = createPdf();
stateDoc.saveState();
stateDoc.rect(10, 10, 20, 20);
stateDoc.restoreState();
const stateStream = streamsOf(stateDoc)[0];
eq(stateStream.split('\n').filter((op) => op === 'q').length, 1, 'saveState emite q');
eq(stateStream.split('\n').filter((op) => op === 'Q').length, 1, 'restoreState emite Q');
throws(() => createPdf().restoreState(), /saveState/, 'restoreState sin saveState lanza');

const transformDoc = createPdf();
transformDoc.translate(10, 20);
transformDoc.rotate(90);
const transformStream = streamsOf(transformDoc)[0];
check(transformStream.includes('1 0 0 1 10 -20 cm'), 'translate usa cm con la y invertida');
check(transformStream.includes('0 -1 1 0 0 0 cm'), 'rotate 90 grados genera la matriz correcta');

const multiDoc = createPdf();
multiDoc.text('primera', 40, 40);
multiDoc.addPage();
multiDoc.text('segunda', 40, 40);
multiDoc.setPage(1);
multiDoc.text('tercera', 40, 80);
const multiStreams = streamsOf(multiDoc);
check(multiStreams.length === 2, 'dos páginas -> dos content streams');
check(multiStreams[0].includes('primera') && multiStreams[0].includes('tercera'), 'setPage no pierde contenido');
check(!multiStreams[1].includes('tercera'), 'setPage escribe en la página correcta');
throws(() => multiDoc.setPage(0), RangeError, 'setPage(0) lanza');
throws(() => multiDoc.setPage(3), RangeError, 'setPage(3) lanza');
eq(multiDoc.pageCount, 2, 'pageCount correcto');

// =============================================================================
// 10. Metadatos, blob, idempotencia
// =============================================================================

const metaDoc = createPdf({ title: 'Memoria — ñandú', author: 'FlagPlays', subject: 'Prueba', creator: 'FlagPlays QA' });
const metaText = pdfText(metaDoc);
check(/\/Title <FEFF[0-9A-F]+>/.test(metaText), 'Info con /Title en UTF-16BE');
const titleMatch = /\/Title (<FEFF[0-9A-F]+>)/.exec(metaText);
check(!!titleMatch, 'se puede extraer el título Unicode');
const titleHex = titleMatch ? titleMatch[1].slice(5, -1) : '';
check(titleHex.includes('2014'), 'el título conserva la raya U+2014');
check(titleHex.includes('00F1'), 'el título conserva ñ U+00F1');
check(metaText.includes('/Author (FlagPlays)'), 'Info con /Author ASCII literal');
check(metaText.includes('/Subject (Prueba)'), 'Info con /Subject ASCII literal');
check(metaText.includes('/Creator (FlagPlays QA)'), 'Info con /Creator');
check(metaText.includes('/Producer (FlagPlays)'), 'Info con /Producer');
check(metaText.includes('/CreationDate (D:'), 'Info con /CreationDate');

const idemDoc = createPdf();
idemDoc.text('x', 10, 10);
const idemA = idemDoc.bytes();
const idemB = idemDoc.bytes();
check(Buffer.compare(Buffer.from(idemA), Buffer.from(idemB)) === 0, 'bytes() es determinista');
check(idemDoc.pageCount === 1, 'bytes() no altera el número de páginas');

const blob = idemDoc.blob();
check(typeof Blob !== 'undefined' && blob instanceof Blob, 'blob() devuelve un Blob');
eq(blob.type, 'application/pdf', 'blob() con tipo application/pdf');
throws(() => idemDoc.download('x.pdf'), /DOM/, 'download() está guardado fuera del navegador');

// =============================================================================
// 11. validate()
// =============================================================================

const validDoc = createPdf({ title: 'Validación' });
validDoc.text('Texto con tildes: Árbol, ñandú, ¿qué?', 40, 60, { size: 12 });
validDoc.rect(40, 100, 200, 80, { fill: '#f1f5f9', stroke: '#334155', radius: 10 });
validDoc.circle(300, 140, 36, { fill: '#a3e635', opacity: 0.5 });
validDoc.polyline(
  [
    { x: 40, y: 240 },
    { x: 140, y: 210 },
    { x: 240, y: 260 },
  ],
  { stroke: '#0ea5e9', lineWidth: 2, arrowEnd: true },
);
validDoc.line(40, 300, 400, 300, { stroke: '#111827', dash: '6 4' });
validDoc.addPage();
validDoc.text('Segunda página', 40, 60);
validDoc.addPage();
validDoc.text('Tercera página', 40, 60);
const validReport = validDoc.validate();
check(validReport.ok === true, 'validate() ok:true');
eq(validReport.errors, [], 'validate() sin errores');
eq(validDoc.pageCount, 3, 'validate() no altera el documento');

const corrupted = new Uint8Array(validDoc.bytes());
const corruptedXref = xrefOf(validDoc);
const firstEntry = corruptedXref.xrefOffset + /^xref\s+\d+\s+\d+\s*\n/.exec(pdfText(validDoc).slice(corruptedXref.xrefOffset))[0].length + 20;
corrupted[firstEntry + 9] = corrupted[firstEntry + 9] === 0x39 ? 0x38 : 0x39;
const corruptedReport = validDoc.validate(corrupted);
check(corruptedReport.ok === false, 'validate() detecta un xref corrupto');
check(corruptedReport.errors.length > 0, 'validate() informa de los errores');

const truncatedReport = validDoc.validate(validDoc.bytes().slice(0, 120));
check(truncatedReport.ok === false, 'validate() detecta un PDF truncado');

// =============================================================================
// 12. PDF de muestra para revisión visual (qa/pdf-sample.pdf)
// =============================================================================

function drawFooter(pdf, page, total) {
  const width = pdf.width;
  const margin = pdf.margin;
  pdf.line(margin, pdf.height - 44, width - margin, pdf.height - 44, {
    stroke: '#cbd5e1',
    lineWidth: 0.8,
  });
  pdf.text('FlagPlays — qa/pdf-sample.pdf', margin, pdf.height - 36, {
    size: 8,
    color: '#64748b',
  });
  pdf.text(`Página ${page} de ${total}`, margin, pdf.height - 36, {
    size: 8,
    color: '#64748b',
    align: 'right',
    maxWidth: width - margin * 2,
    opacity: 0.7,
  });
}

function buildSamplePdf() {
  const W = PAGE_SIZES.A4.width;
  const H = PAGE_SIZES.A4.height;
  const M = 44;
  const pdf = createPdf({
    size: 'A4',
    margin: M,
    title: 'Muestra de PDF — FlagPlays',
    author: 'FlagPlays · pdf-writer',
    subject: 'Primitivas vectoriales y texto WinAnsi',
    creator: 'FlagPlays',
  });
  const contentWidth = W - M * 2;

  // ---- Página 1 -----------------------------------------------------------
  pdf.rect(0, 0, W, 118, { fill: '#0f172a' });
  pdf.text('Árbol de rutas — FlagPlays', M, 28, {
    font: 'bold',
    size: 25,
    color: '#f8fafc',
    align: 'center',
    maxWidth: contentWidth,
  });
  pdf.text('Generador de PDF propio · ñandú ¿qué? ¡Olé! · «sin dependencias» · 20 °C · 12 €', M, 67, {
    size: 10.5,
    color: '#cbd5e1',
    align: 'center',
    maxWidth: contentWidth,
  });
  pdf.rect(W / 2 - 60, 92, 120, 3, { fill: '#a3e635', radius: 1.5 });

  pdf.text('MÉTRICAS Y ALINEACIÓN', M, 146, { font: 'bold', size: 9, color: '#64748b' });
  const cardGap = 16;
  const cardW = (contentWidth - cardGap * 2) / 3;
  const cards = [
    { value: '3', label: 'páginas generadas' },
    { value: '18', label: 'objetos PDF' },
    { value: '€ 0', label: 'dependencias' },
  ];
  cards.forEach((card, index) => {
    const x = M + index * (cardW + cardGap);
    const y = 164;
    pdf.rect(x, y, cardW, 96, { fill: '#f1f5f9', stroke: '#cbd5e1', radius: 10 });
    pdf.text(card.value, x, y + 16, {
      font: 'bold',
      size: 26,
      color: '#0f172a',
      align: 'center',
      maxWidth: cardW,
    });
    pdf.text(card.label, x, y + 56, {
      size: 9,
      color: '#475569',
      align: 'center',
      maxWidth: cardW,
    });
    pdf.line(x + 18, y + 78, x + cardW - 18, y + 78, {
      stroke: '#94a3b8',
      lineWidth: 0.8,
      dash: '3 3',
    });
  });

  pdf.text('TEXTO JUSTIFICADO', M, 292, { font: 'bold', size: 9, color: '#64748b' });
  const colGap = 14;
  const colW = (contentWidth - colGap * 2) / 3;
  const columnStyle = { size: 9, lineHeight: 1.5, color: '#334155', maxWidth: colW };
  pdf.textBlock(
    'Alineado a la izquierda: el texto empieza en el margen de la caja y fluye hasta el ancho máximo disponible en cada línea.',
    M,
    312,
    columnStyle,
  );
  pdf.textBlock(
    'Centrado de verdad: cada línea se recoloca con su anchura real, medida con encodedWidth de src/afm.js.',
    M + colW + colGap,
    312,
    { ...columnStyle, align: 'center' },
  );
  pdf.textBlock(
    'Alineado a la derecha: la última letra termina justo en el borde derecho de su caja de texto.',
    M + (colW + colGap) * 2,
    312,
    { ...columnStyle, align: 'right' },
  );

  pdf.line(M, 396, W - M, 396, { stroke: '#cbd5e1', lineWidth: 1, dash: '5 4' });

  pdf.text('VECTORES Y OPACIDAD', M, 420, { font: 'bold', size: 9, color: '#64748b' });
  pdf.circle(M + 52, 486, 34, { fill: '#a3e635', stroke: '#3f6212', lineWidth: 2 });
  pdf.circle(M + 132, 486, 34, { fill: '#22c55e', opacity: 0.45 });
  pdf.circle(M + 212, 486, 34, { fill: '#0ea5e9', fillOpacity: 0.35, stroke: '#0369a1', lineWidth: 2 });
  pdf.ellipse(M + 320, 486, 50, 28, { fill: '#f59e0b', opacity: 0.4, stroke: '#b45309', lineWidth: 1.2 });
  pdf.rect(430, 446, 112, 80, {
    fill: '#ef4444',
    opacity: 0.22,
    radius: 14,
    stroke: '#b91c1c',
    lineWidth: 1.5,
  });
  pdf.text('20 · 24 · 40 · 60 · 80 · 100 %', 430, 532, { size: 8, color: '#64748b' });

  pdf.text('LÍNEAS DISCONTINUAS Y FLECHAS', M, 566, { font: 'bold', size: 9, color: '#64748b' });
  pdf.line(M, 590, W - M, 590, { stroke: '#334155', lineWidth: 1.5, dash: '10 5' });
  pdf.line(M, 604, W - M, 604, { stroke: '#64748b', lineWidth: 1, dash: '2 3', lineCap: 'round' });
  pdf.line(M, 618, W - M, 618, { stroke: '#0ea5e9', lineWidth: 2, dash: '1 4', lineCap: 'round' });

  pdf.polyline(
    [
      { x: M, y: 676 },
      { x: M + 120, y: 646 },
      { x: M + 250, y: 700 },
      { x: M + 360, y: 660 },
    ],
    {
      stroke: '#0f172a',
      lineWidth: 2.5,
      lineCap: 'round',
      lineJoin: 'round',
      arrowEnd: true,
      arrowSize: 11,
    },
  );
  pdf.polyline(
    [
      { x: M + 30, y: 730 },
      { x: M + 90, y: 690 },
      { x: M + 170, y: 726 },
    ],
    { stroke: '#a3e635', lineWidth: 2, arrowEnd: true },
  );
  pdf.text('Ruta con flecha (polyline + arrowEnd)', M, 748, { size: 8, color: '#64748b' });
  pdf.text('Opacidades con /ExtGState · colores #rrggbb y [r,g,b] · guiones con d', M, 762, {
    size: 8,
    color: '#64748b',
  });
  drawFooter(pdf, 1, 3);

  // ---- Página 2 -----------------------------------------------------------
  pdf.addPage();
  pdf.text('Pizarra de jugada — «Spider 2 Y Banana»', M, 32, {
    font: 'bold',
    size: 18,
    color: '#0f172a',
    align: 'center',
    maxWidth: contentWidth,
  });
  pdf.text('Polilíneas con flecha, arcos, guiones y opacidades', M, 60, {
    size: 9.5,
    color: '#64748b',
    align: 'center',
    maxWidth: contentWidth,
  });

  const fieldX = M;
  const fieldY = 88;
  const fieldW = contentWidth;
  const fieldH = 440;
  pdf.rect(fieldX, fieldY, fieldW, fieldH, { fill: '#14532d', radius: 12 });
  pdf.rect(fieldX, fieldY, fieldW, 72, { fill: '#166534', radius: 12, opacity: 0.9 });
  pdf.rect(fieldX, fieldY, fieldW, fieldH, { stroke: '#86efac', lineWidth: 1.4, radius: 12 });
  for (let i = 0; i < 5; i++) {
    const y = fieldY + 92 + i * 62;
    pdf.line(fieldX + 10, y, fieldX + fieldW - 10, y, {
      stroke: '#4ade80',
      lineWidth: 0.8,
      dash: '2 6',
    });
    pdf.text(String(i * 5 + 5), fieldX + 14, y - 14, { size: 7, color: '#86efac', opacity: 0.8 });
  }
  const losY = fieldY + 154;
  pdf.line(fieldX + 8, losY, fieldX + fieldW - 8, losY, {
    stroke: '#facc15',
    lineWidth: 2,
    dash: '7 5',
  });
  pdf.text('LOS', fieldX + fieldW - 34, losY + 4, { font: 'bold', size: 7, color: '#facc15' });

  const offense = [
    { label: 'QB', fx: 0.16 },
    { label: 'C', fx: 0.3 },
    { label: 'X', fx: 0.44 },
    { label: 'Y', fx: 0.58 },
    { label: 'Z', fx: 0.72 },
  ].map((player) => ({ ...player, x: fieldX + fieldW * player.fx, y: fieldY + 130 }));
  offense.forEach((player) => {
    pdf.circle(player.x, player.y, 10, { fill: '#a3e635', stroke: '#1a2e05', lineWidth: 1.5 });
    pdf.text(player.label, player.x - 10, player.y, {
      font: 'bold',
      size: 6.5,
      color: '#0f172a',
      align: 'center',
      maxWidth: 20,
      baseline: 'middle',
    });
  });
  const routes = [
    { from: 2, points: [[18, 48], [44, 108]], color: '#facc15' },
    { from: 3, points: [[-10, 38], [58, 84], [92, 112]], color: '#38bdf8' },
    { from: 4, points: [[36, 28], [24, 96], [-16, 130]], color: '#f472b6' },
    { from: 1, points: [[0, 36], [6, 72]], color: '#e2e8f0' },
  ];
  routes.forEach((route) => {
    const origin = offense[route.from];
    const points = [{ x: origin.x, y: origin.y }].concat(
      route.points.map(([dx, dy]) => ({ x: origin.x + dx, y: origin.y + dy })),
    );
    pdf.polyline(points, {
      stroke: route.color,
      lineWidth: 2.2,
      lineCap: 'round',
      lineJoin: 'round',
      arrowEnd: true,
      arrowSize: 9,
    });
  });
  [0.22, 0.36, 0.52, 0.66, 0.8].forEach((fx, index) => {
    const y = fieldY + 210 + (index % 2) * 26;
    pdf.circle(fieldX + fieldW * fx, y, 8, {
      fill: '#f87171',
      stroke: '#7f1d1d',
      lineWidth: 1,
      opacity: 0.9,
    });
  });
  pdf.circle(offense[0].x + 14, offense[0].y, 4, { fill: '#fbbf24', stroke: '#78350f', lineWidth: 1 });

  const legend = [
    ['#facc15', 'Ruta 1 — poste exterior'],
    ['#38bdf8', 'Ruta 2 — rueda corta'],
    ['#f472b6', 'Ruta 3 — drag interior'],
  ];
  legend.forEach(([color, label], index) => {
    const y = 552 + index * 20;
    pdf.line(M, y, M + 24, y, { stroke: color, lineWidth: 3, lineCap: 'round' });
    pdf.text(label, M + 32, y - 5, { size: 9, color: '#334155' });
  });
  drawFooter(pdf, 2, 3);

  // ---- Página 3 -----------------------------------------------------------
  pdf.addPage();
  pdf.text('Resumen de lecturas', M, 34, {
    font: 'bold',
    size: 20,
    color: '#0f172a',
    align: 'center',
    maxWidth: contentWidth,
  });
  pdf.text('Alineaciones izquierda, centro y derecha con las métricas reales de afm.js', M, 64, {
    size: 9.5,
    color: '#64748b',
    align: 'center',
    maxWidth: contentWidth,
  });

  const tableX = M;
  const tableY = 100;
  const tableW = contentWidth;
  const headerH = 26;
  const rowH = 32;
  pdf.rect(tableX, tableY, tableW, headerH, { fill: '#0f172a', radius: 6 });
  const numberColX = tableX + 12;
  const numberColW = 36;
  const titleColX = tableX + 62;
  const rightColW = 110;
  const rightColX = tableX + tableW - 12 - rightColW;
  pdf.text('#', numberColX, tableY + 7, {
    font: 'bold',
    size: 9,
    color: '#f8fafc',
    align: 'center',
    maxWidth: numberColW,
  });
  pdf.text('Lectura', titleColX, tableY + 7, { font: 'bold', size: 9, color: '#f8fafc' });
  pdf.text('Profundidad', rightColX, tableY + 7, {
    font: 'bold',
    size: 9,
    color: '#f8fafc',
    align: 'right',
    maxWidth: rightColW,
  });

  const rows = [
    ['1', 'Poste exterior', '12 yd'],
    ['2', 'Rueda corta', '8 yd'],
    ['3', 'Drag interior', '6 yd'],
    ['4', 'Corner profundo', '18 yd'],
    ['5', 'Seam por el centro', '14 yd'],
    ['6', 'Flat a la banda', '5 yd'],
    ['7', 'Check and go', '16 yd'],
    ['8', 'Screen al RB', '2 yd'],
  ];
  rows.forEach((row, index) => {
    const y = tableY + headerH + index * rowH;
    if (index % 2 === 0) pdf.rect(tableX, y, tableW, rowH, { fill: '#f1f5f9', opacity: 0.75 });
    pdf.line(tableX, y + rowH, tableX + tableW, y + rowH, {
      stroke: '#e2e8f0',
      lineWidth: 0.8,
      dash: '2 2',
    });
    pdf.text(row[0], numberColX, y + 10, {
      font: 'bold',
      size: 9.5,
      color: '#0f172a',
      align: 'center',
      maxWidth: numberColW,
    });
    pdf.text(row[1], titleColX, y + 10, { size: 9.5, color: '#334155' });
    pdf.text(row[2], rightColX, y + 10, {
      size: 9.5,
      color: '#334155',
      align: 'right',
      maxWidth: rightColW,
    });
  });

  const afterTable = tableY + headerH + rows.length * rowH;
  pdf.text('NOTAS DE LA LECTURA', M, afterTable + 24, {
    font: 'bold',
    size: 9,
    color: '#64748b',
  });
  pdf.textBlock(
    'Contra cobertura de hombre, la primera lectura es el poste exterior; si el esquinero se queda por dentro, el QB sube al seam. Frente a zona de dos profundo, la rueda corta ataca el hueco entre el linebacker y el profundo. «Spider 2 Y Banana» mantiene siempre una válvula al RB.',
    M,
    afterTable + 44,
    { size: 9, maxWidth: contentWidth, lineHeight: 1.5, color: '#334155' },
  );

  const ladderY = afterTable + 150;
  for (let i = 0; i < 6; i++) {
    pdf.circle(M + 36 + i * 54, ladderY, 18, {
      fill: '#0ea5e9',
      opacity: (i + 1) / 8,
      stroke: '#0f172a',
      lineWidth: 1,
    });
  }
  pdf.text('Escala de opacidad: /ca de 0.125 a 0.75', M, ladderY + 30, {
    size: 8,
    color: '#64748b',
  });
  drawFooter(pdf, 3, 3);

  return pdf;
}

const sample = buildSamplePdf();
check(sample.pageCount === 3, 'el PDF de muestra tiene 3 páginas');
const sampleReport = sample.validate();
check(sampleReport.ok === true, 'el PDF de muestra valida correctamente');
eq(sampleReport.errors, [], 'el PDF de muestra no tiene errores estructurales');
const sampleStreams = streamsOf(sample);
check(sampleStreams.length === 3, 'el PDF de muestra tiene 3 content streams');
check(sampleStreams.every((stream) => stream.length > 400), 'las páginas no están vacías');
check(sampleStreams[0].includes('\xC1rbol'), 'la página 1 incluye Árbol con 0xC1');
check(sampleStreams[0].includes('\xF1'), 'la página 1 incluye ñ con 0xF1');
check(sampleStreams[0].includes('\x80'), 'la página 1 incluye € con 0x80');
check(sampleStreams[0].includes('\xB0'), 'la página 1 incluye ° con 0xB0');
const sampleBytes = sample.bytes();
if (!existsSync(qaDir)) throw new Error('falta el directorio qa/');
writeFileSync(join(qaDir, 'pdf-sample.pdf'), sampleBytes);
check(existsSync(join(qaDir, 'pdf-sample.pdf')), 'qa/pdf-sample.pdf escrito');
check(statSync(join(qaDir, 'pdf-sample.pdf')).size === sampleBytes.length, 'tamaño del PDF de muestra correcto');
check(sampleBytes.length > 6000, 'el PDF de muestra tiene contenido suficiente');

// =============================================================================
// Resumen
// =============================================================================

console.log(`tests/pdf.mjs OK — ${asserts} asserts — qa/pdf-sample.pdf (${sampleBytes.length} bytes, 3 páginas)`);
