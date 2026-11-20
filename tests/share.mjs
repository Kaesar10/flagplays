// ============================================================================
// FlagPlays · tests/share.mjs
// Pruebas de src/share.js. Todo se ejecuta en Node: las funciones puras de
// verdad (compresor, enlaces, minificado y JSON) y, al final, la exportación
// PNG con un DOM mínimo simulado (canvas/Image falsos). No usa red ni ficheros.
// ============================================================================

import assert from 'node:assert/strict';
import { createPlay, createPlayer, normalizePlaybook } from '../src/model.js';
import * as share from '../src/share.js';

let count = 0;
const ok = (value, msg) => {
  assert.ok(value, msg);
  count++;
};
const eq = (actual, expected, msg) => {
  assert.equal(actual, expected, msg);
  count++;
};
const deep = (actual, expected, msg) => {
  assert.deepEqual(actual, expected, msg);
  count++;
};
const throws = (fn, pattern, msg) => {
  assert.throws(fn, pattern, msg);
  count++;
};
const section = (title) => console.log(`\n· ${title}`);

/* ---------------------------------------------------------------------------
 * Jugada de prueba realista (7v7 con defensa, rutas, asignaciones y balón)
 * ------------------------------------------------------------------------- */

const receiverX = createPlayer({
  team: 'offense',
  role: 'wr',
  label: 'X',
  number: '3',
  pos: { x: -14.04, y: 0 },
  path: [
    { x: -16, y: 6 },
    { x: -12, y: 12, curve: 'smooth' },
    { x: -6, y: 18 },
  ],
});
const receiverY = createPlayer({
  team: 'offense',
  role: 'wr',
  label: 'Y',
  number: '4',
  pos: { x: 10, y: 0 },
  path: [
    { x: 12, y: 5 },
    { x: 14, y: 10 },
  ],
});
const qb = createPlayer({ team: 'offense', role: 'qb', label: 'QB', number: '1', pos: { x: 0, y: -4 } });
const center = createPlayer({ team: 'offense', role: 'c', label: 'C', number: '2', pos: { x: 0, y: -1 } });
const rb = createPlayer({
  team: 'offense',
  role: 'rb',
  label: 'R',
  number: '5',
  pos: { x: 5, y: -2 },
  path: [
    { x: 7, y: 1 },
    { x: 9, y: 3 },
  ],
  pathType: 'motion',
});
const corner = createPlayer({
  team: 'defense',
  role: 'db',
  label: 'CB',
  pos: { x: -10, y: 6 },
  assignment: { type: 'man', targetId: receiverX.id },
});
const linebacker = createPlayer({
  team: 'defense',
  role: 'lb',
  label: 'M',
  pos: { x: 0, y: 8 },
  assignment: { type: 'zone', landmark: { x: 2, y: 12 }, depth: 8 },
});
const rusher = createPlayer({
  team: 'defense',
  role: 'dl',
  label: 'RUS',
  pos: { x: -1.5, y: 1 },
  assignment: { type: 'rush', lane: 1 },
});
const safety = createPlayer({
  team: 'defense',
  role: 's',
  label: 'S',
  pos: { x: 0, y: 14 },
  assignment: { type: 'cover1' },
});

const play = createPlay({
  name: 'Trips Derecha / Rueda #2',
  formation: 'trips',
  category: 'Pase profundo',
  tags: ['7v7', 'pase'],
  notes: 'Rueda de X tras el motion. Ojo al safety.',
  players: [qb, center, receiverX, receiverY, rb, corner, linebacker, rusher, safety],
  ball: { targetId: receiverX.id, releaseAt: 1.3 },
});
const playJson = JSON.stringify(play);
const findPlayer = (p, label) => p.players.find((x) => x.label === label);

/* ---------------------------------------------------------------------------
 * 1. Compresor
 * ------------------------------------------------------------------------- */
section('Compresor LZ + Base64 URI-safe');

eq(share.compressToB64(null), '', 'compressToB64(null) devuelve cadena vacía');
eq(share.decompressFromB64(share.compressToB64('')), '', 'round-trip de cadena vacía');
ok(share.compressToB64('').length > 0, 'la cadena vacía también produce payload válido');

const ascii = 'FlagPlays 7v7: QB keeper por el lado débil.';
eq(share.decompressFromB64(share.compressToB64(ascii)), ascii, 'round-trip ASCII');

const unicode = 'Añadir jugada de engaño: recepción rápida, € 12 — ¡ñandú!';
eq(share.decompressFromB64(share.compressToB64(unicode)), unicode, 'round-trip tildes/ñ/€');

const large = ('Jugada de pase profundo con ruta de rueda y bloqueo de la línea; ' +
  'el mariscal lee al safety antes de lanzar. Número 7v7 ñ €. ').repeat(400).slice(0, 20000);
eq(large.length, 20000, 'texto largo de exactamente 20 KB');
const compressedLarge = share.compressToB64(large);
eq(share.decompressFromB64(compressedLarge), large, 'round-trip de 20 KB');
ok(compressedLarge.length < large.length, 'un texto repetitivo de 20 KB comprime menos que el original');

const payloads = ['', 'a', ascii, unicode, compressedLarge, playJson].map((s) => share.compressToB64(s));
ok(
  payloads.every((p) => !/[+/=]/.test(p)),
  'todas las salidas son URI-safe (sin +, / ni =)'
);
ok(payloads.every((p) => /^[A-Za-z0-9_-]*$/.test(p)), 'la salida sólo usa el alfabeto Base64 URI-safe');

throws(() => share.decompressFromB64('basura'), /No se pudo descomprimir/, 'decompressFromB64("basura") lanza');
throws(() => share.decompressFromB64(''), /No se pudo descomprimir/, 'decompressFromB64("") lanza');
throws(() => share.decompressFromB64('***'), /No se pudo descomprimir/, 'caracteres no válidos lanzan');
throws(() => share.decompressFromB64('AAAA'), /No se pudo descomprimir/, 'Base64 válido pero ajeno lanza');
const truncated = compressedLarge.slice(0, Math.floor(compressedLarge.length / 2));
throws(() => share.decompressFromB64(truncated), /No se pudo descomprimir/, 'un flujo truncado lanza');

/* ---------------------------------------------------------------------------
 * 2. Minificado / expansión de jugadas
 * ------------------------------------------------------------------------- */
section('minifyPlay / expandPlay');

const mini = share.minifyPlay(play);
const miniJson = JSON.stringify(mini);
const expanded = share.expandPlay(JSON.parse(miniJson));

eq(expanded.name, play.name, 'se conserva el nombre');
eq(expanded.players.length, play.players.length, 'se conserva el número de jugadores');
eq(expanded.formation, 'trips', 'se conserva la formación');
eq(expanded.category, 'Pase profundo', 'se conserva la categoría');
deep(expanded.tags, ['7v7', 'pase'], 'se conservan las etiquetas');
eq(expanded.notes, play.notes, 'se conservan las notas');
deep(expanded.field, { width: 40, depth: 26, ez: 10 }, 'el campo por defecto se recompone');

const expandedX = findPlayer(expanded, 'X');
ok(!!expandedX, 'el receptor X existe tras expandir');
eq(expandedX.pos.x, -14, 'las yardas se redondean a 0,1 al minificar');
eq(expandedX.path.length, 3, 'se conservan los puntos de ruta');
deep(expandedX.path[0], { x: -16, y: 6, curve: 'line' }, 'primer punto de ruta conservado');
deep(expandedX.path[1], { x: -12, y: 12, curve: 'smooth' }, 'curva suave conservada');
eq(expandedX.number, '3', 'se conserva el dorsal');
eq(findPlayer(expanded, 'QB').path, null, 'un jugador sin ruta sigue sin ruta');

eq(expanded.ball.releaseAt, 1.3, 'se conserva releaseAt del balón');
ok(!!expanded.ball.targetId, 'el balón apunta a un jugador');
eq(expanded.ball.targetId, expandedX.id, 'targetId del balón apunta al receptor correcto');

const expandedCB = findPlayer(expanded, 'CB');
eq(expandedCB.assignment.type, 'man', 'cobertura individual conservada');
eq(expandedCB.assignment.targetId, expandedX.id, 'targetId de la cobertura individual se remapea');
const expandedM = findPlayer(expanded, 'M');
eq(expandedM.assignment.type, 'zone', 'zona conservada');
deep(expandedM.assignment.landmark, { x: 2, y: 12 }, 'landmark de zona conservado');
eq(expandedM.assignment.depth, 8, 'profundidad de zona conservada');
eq(findPlayer(expanded, 'RUS').assignment.lane, 1, 'carril del rush conservado');
eq(findPlayer(expanded, 'S').assignment.type, 'cover1', 'cover1 conservado');
eq(findPlayer(expanded, 'RUS').pathType, 'rush', 'tipo de ruta por defecto de la defensa se recompone');
eq(findPlayer(expanded, 'R').pathType, 'motion', 'pathType no por defecto conservado');

ok(miniJson.length < playJson.length, 'la jugada minificada ocupa menos que el JSON completo');
ok(!miniJson.includes(play.id), 'el id de la jugada no viaja (se regenera al importar)');
ok(!miniJson.includes('"meta"'), 'la meta (fechas/versión) no viaja');

const rawExpanded = share.expandPlay(JSON.parse(playJson));
eq(rawExpanded.name, play.name, 'expandPlay acepta también una jugada normal');
eq(rawExpanded.players.length, play.players.length, 'expandPlay normaliza una jugada normal');

throws(() => share.minifyPlay(null), /Jugada inválida/, 'minifyPlay(null) lanza');
throws(() => share.minifyPlay({}), /Jugada inválida/, 'minifyPlay sin jugadores lanza');
throws(() => share.expandPlay('texto'), /inválida/, 'expandPlay con basura lanza');
throws(() => share.expandPlay({ version: 99 }), /versión/, 'expandPlay rechaza versiones futuras');

// Casos límite del minificado.
const emptyPlay = createPlay({ name: 'Vacía', players: [] });
const emptyBack = share.expandPlay(JSON.parse(JSON.stringify(share.minifyPlay(emptyPlay))));
eq(emptyBack.name, 'Vacía', 'jugada sin jugadores: nombre conservado');
eq(emptyBack.players.length, 0, 'jugada sin jugadores: sin jugadores');
eq(emptyBack.ball.targetId, null, 'jugada sin jugadores: sin balón');

const defensePlay = createPlay({
  name: 'Cobertura 1',
  type: 'defense',
  category: 'Hombre',
  players: [
    createPlayer({ team: 'defense', role: 'db', label: 'CB', pos: { x: -8, y: 5 } }),
    createPlayer({ team: 'defense', role: 's', label: 'S', pos: { x: 0, y: 12 }, assignment: { type: 'cover1' } }),
  ],
  field: { width: 30, depth: 24, ez: 10 },
});
const defenseBack = share.expandPlay(JSON.parse(JSON.stringify(share.minifyPlay(defensePlay))));
eq(defenseBack.type, 'defense', 'se conserva el tipo defensa');
deep(defenseBack.field, { width: 30, depth: 24, ez: 10 }, 'campo no estándar conservado');
eq(defenseBack.players.length, 2, 'defensa: jugadores conservados');
eq(findPlayer(defenseBack, 'S').assignment.type, 'cover1', 'defensa: cover1 conservado');
eq(defenseBack.ball.targetId, null, 'sin target: el balón queda a null');

const defaultNamePlay = createPlay({ players: [createPlayer({ role: 'qb', label: 'QB' })] });
const defaultNameBack = share.expandPlay(JSON.parse(JSON.stringify(share.minifyPlay(defaultNamePlay))));
eq(defaultNameBack.name, 'Jugada sin nombre', 'el nombre por defecto se recompone');

/* ---------------------------------------------------------------------------
 * 3. Enlaces compartibles
 * ------------------------------------------------------------------------- */
section('playToShareURL / playFromLocationHash');

globalThis.location = { origin: 'http://x', pathname: '/y', hash: '' };
const url = share.playToShareURL(play);
ok(url.startsWith('http://x/y#p='), 'la URL usa origin + pathname + #p=');
const hashPart = url.split('#p=')[1];
ok(!/[+/=]/.test(hashPart), 'el hash es URI-safe (sin +, / ni =)');

globalThis.location.hash = url.slice(url.indexOf('#'));
const fromHash = share.playFromLocationHash();
ok(!!fromHash, 'se recupera la jugada del hash');
eq(fromHash.name, play.name, 'el enlace devuelve el mismo nombre');
eq(fromHash.players.length, play.players.length, 'el enlace devuelve los mismos jugadores');
eq(fromHash.ball.targetId, findPlayer(fromHash, 'X').id, 'el enlace conserva el target del balón');
eq(share.playFromLocationHash(globalThis.location.hash).name, play.name, 'acepta un hash explícito');

eq(share.playFromLocationHash('#p=basura'), null, 'hash corrupto devuelve null');
eq(share.playFromLocationHash(`#p=${share.compressToB64('esto no es JSON')}`), null, 'JSON corrupto devuelve null');
eq(share.playFromLocationHash('#x=abc'), null, 'hash con otro prefijo devuelve null');
eq(share.playFromLocationHash(''), null, 'hash vacío devuelve null');
eq(share.playFromLocationHash(null), null, 'hash null devuelve null');
eq(share.playFromLocationHash(42), null, 'hash no textual devuelve null');

const book = normalizePlaybook({
  id: 'book_test',
  name: 'Libreta de prueba',
  plays: [JSON.parse(playJson)],
  folders: [{ id: 'f1', name: 'Ofensiva', color: '#9ae63f' }],
  roster: [{ id: 'r1', name: 'Ana', number: '7' }],
  settings: { field: 5, units: 'yd', showDefense: true, theme: 'turf' },
});
const bookUrl = share.playbookToShareURL(book);
ok(bookUrl.startsWith('http://x/y#b='), 'la URL de libreta usa #b=');
globalThis.location.hash = bookUrl.slice(bookUrl.indexOf('#'));
const fromBookHash = share.playbookFromLocationHash();
ok(!!fromBookHash, 'se recupera la libreta del hash');
eq(fromBookHash.name, 'Libreta de prueba', 'nombre de libreta conservado');
eq(fromBookHash.plays.length, 1, 'jugadas de la libreta conservadas');
eq(fromBookHash.roster.length, 1, 'roster de la libreta conservado');
eq(share.playbookFromLocationHash('#b=basura'), null, 'libreta corrupta devuelve null');
eq(share.playbookFromLocationHash('#p=abc'), null, 'prefijo equivocado devuelve null');

const fullBytes = Buffer.byteLength(playJson, 'utf8');
const payloadBytes = Buffer.byteLength(url.split('#p=')[1], 'utf8');
console.log(
  `  ratio: JSON ${fullBytes} B -> minificado ${Buffer.byteLength(miniJson, 'utf8')} B ` +
    `-> enlace ${payloadBytes} chars (${Math.round((payloadBytes / fullBytes) * 100)}% del JSON)`
);

/* ---------------------------------------------------------------------------
 * 4. fileSafeName y descargas
 * ------------------------------------------------------------------------- */
section('fileSafeName / descargas');

eq(share.fileSafeName('Trips Derecha / Rueda #2'), 'Trips-Derecha-Rueda-2', 'slug a partir del nombre');
ok(/^[A-Za-z0-9._-]+$/.test(share.fileSafeName('Trips Derecha / Rueda #2')), 'sin caracteres inválidos');
eq(share.fileSafeName('Ruta de Ñandú'), 'Ruta-de-Nandu', 'sin tildes y sin ñ');
eq(share.fileSafeName(''), 'flagplays', 'nombre vacío usa fallback');
eq(share.fileSafeName('   ---   '), 'flagplays', 'sólo signos usa fallback');
ok(share.fileSafeName('x'.repeat(200)).length <= 64, 'longitud máxima de 64');

throws(() => share.downloadBlob({}, 'a.png'), /navegador/, 'downloadBlob lanza fuera del navegador');
throws(() => share.downloadText('a', 'a.txt'), /navegador/, 'downloadText lanza fuera del navegador');
throws(() => share.exportPlaybookJSON(book), /navegador/, 'exportPlaybookJSON lanza fuera del navegador');
throws(() => share.exportPlayJSON(play), /navegador/, 'exportPlayJSON lanza fuera del navegador');

/* ---------------------------------------------------------------------------
 * 5. Importación JSON
 * ------------------------------------------------------------------------- */
section('importPlaybookFromText / importPlaybookFile');

const wrapper = JSON.stringify({
  app: 'flagplays',
  version: 1,
  exportedAt: new Date().toISOString(),
  playbook: JSON.parse(playJson),
});
const importedWrapper = share.importPlaybookFromText(wrapper);
eq(importedWrapper.plays.length, 1, 'importa el envoltorio {app, playbook}');
eq(importedWrapper.plays[0].name, play.name, 'la jugada importada conserva el nombre');

const importedDirect = share.importPlaybookFromText(JSON.stringify(book));
eq(importedDirect.name, 'Libreta de prueba', 'importa una libreta directa');
eq(importedDirect.plays.length, 1, 'la libreta directa trae su jugada');

const importedArray = share.importPlaybookFromText(JSON.stringify([JSON.parse(playJson)]));
eq(importedArray.plays.length, 1, 'importa un array de jugadas');
eq(importedArray.name, 'Libreta importada', 'el array recibe un nombre por defecto');

const importedPlayWrapper = share.importPlaybookFromText(
  JSON.stringify({ app: 'flagplays', version: 1, play: JSON.parse(playJson) })
);
eq(importedPlayWrapper.plays.length, 1, 'importa una jugada suelta con envoltorio');

throws(() => share.importPlaybookFromText('esto no es json'), /FlagPlays/, 'texto no JSON lanza en español');
throws(() => share.importPlaybookFromText(''), /FlagPlays/, 'texto vacío lanza');
throws(() => share.importPlaybookFromText('{"app":"otra-app"}'), /FlagPlays/, 'app ajena lanza');
throws(() => share.importPlaybookFromText('{"foo":1}'), /FlagPlays/, 'objeto sin jugadas lanza');
throws(() => share.importPlaybookFromText('{"app":"flagplays","playbook":null}'), /FlagPlays/, 'playbook nulo lanza');

const fakeFile = { size: wrapper.length, text: async () => wrapper };
const importedFile = await share.importPlaybookFile(fakeFile);
eq(importedFile.plays.length, 1, 'importPlaybookFile lee un File-like');
eq(importedFile.plays[0].name, play.name, 'el File importado conserva la jugada');
const importedString = await share.importPlaybookFile(wrapper);
eq(importedString.plays.length, 1, 'importPlaybookFile acepta un string');

await assert.rejects(share.importPlaybookFile(null), /fichero/i);
count++;
eq(await share.copyPlayImage(play), false, 'copyPlayImage devuelve false sin portapapeles');
await assert.rejects(share.copyShareLink(play), /portapapeles/i);
count++;

/* ---------------------------------------------------------------------------
 * 6. Superficie de API
 * ------------------------------------------------------------------------- */
section('Superficie de API');
const apiNames = [
  'compressToB64',
  'decompressFromB64',
  'minifyPlay',
  'expandPlay',
  'minifyPlaybook',
  'expandPlaybook',
  'playToShareURL',
  'playFromLocationHash',
  'playbookToShareURL',
  'playbookFromLocationHash',
  'exportPNG',
  'exportSequencePNG',
  'copyPlayImage',
  'exportSVG',
  'copyShareLink',
  'downloadBlob',
  'downloadText',
  'exportPlaybookJSON',
  'exportPlayJSON',
  'importPlaybookFile',
  'importPlaybookFromText',
  'playbookFromJSON',
  'fileSafeName',
];
for (const name of apiNames) ok(typeof share[name] === 'function', `share.${name} es función`);

const svg = share.exportSVG(JSON.parse(playJson), { width: 640, height: 480 });
ok(svg.startsWith('<svg'), 'exportSVG devuelve un SVG');
ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'el SVG lleva xmlns');
ok(svg.includes('width="640"'), 'el SVG respeta el ancho pedido');
ok(svg.includes('height="480"'), 'el SVG respeta el alto pedido');

/* ---------------------------------------------------------------------------
 * 7. Exportación PNG con un DOM mínimo simulado
 * ------------------------------------------------------------------------- */
section('exportPNG / exportSequencePNG (DOM simulado)');

const fake = installFakeDom();
try {
  fake.calls.fillText.length = 0;
  const png = await share.exportPNG(play, { width: 800, height: 600, scale: 2 });
  ok(png instanceof Blob, 'exportPNG devuelve un Blob');
  eq(png.type, 'image/png', 'el Blob es image/png');
  ok(png.size > 0, 'el PNG tiene contenido');
  const drawArgs = fake.calls.drawImage[0];
  eq(drawArgs[3], 1600, 'el canvas usa width * scale');
  eq(drawArgs[4], 1200, 'el canvas usa height * scale');
  ok(fake.calls.fillText.some((t) => t.includes('FlagPlays')), 'el pie lleva la marca FlagPlays');
  ok(fake.calls.fillText.some((t) => t.includes('Trips Derecha')), 'el pie lleva el nombre de la jugada');

  fake.calls.fillText.length = 0;
  await share.exportPNG(play, { width: 400, height: 300, scale: 1, name: 'Nombre a medida' });
  ok(fake.calls.fillText.some((t) => t.includes('Nombre a medida')), 'opts.name sustituye el nombre del pie');

  const frames = await share.exportSequencePNG(play, { width: 400, height: 300, scale: 1, frames: 3 });
  eq(Array.isArray(frames), true, 'exportSequencePNG devuelve un array');
  eq(frames.length, 3, 'exportSequencePNG genera los fotogramas pedidos');
  ok(frames.every((b) => b instanceof Blob), 'cada fotograma es un Blob');
} finally {
  fake.restore();
}

/**
 * DOM mínimo para probar la tubería SVG -> Image -> canvas -> Blob en Node.
 * Sustituye `document`, `Image` y `getComputedStyle` y los restaura al final.
 */
function installFakeDom() {
  const saved = {
    document: globalThis.document,
    Image: globalThis.Image,
    getComputedStyle: globalThis.getComputedStyle,
  };
  const calls = { fillRect: [], drawImage: [], fillText: [] };

  const makeContext = () => ({
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
    save() {},
    restore() {},
    fillRect(...args) {
      calls.fillRect.push(args);
    },
    drawImage(...args) {
      calls.drawImage.push(args);
    },
    fillText(text) {
      calls.fillText.push(String(text));
    },
    measureText(text) {
      return { width: String(text).length * 9 };
    },
  });

  const createCanvas = () => {
    const ctx = makeContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: (type) => (type === '2d' ? ctx : null),
      toBlob: (cb, type) => cb(new Blob(['fake-png'], { type: type || 'image/png' })),
      toDataURL: () => 'data:image/png;base64,eA==',
    };
    ctx.canvas = canvas;
    return canvas;
  };

  globalThis.document = {
    documentElement: { appendChild() {} },
    body: { appendChild() {} },
    createElement(tag) {
      if (String(tag).toLowerCase() === 'canvas') return createCanvas();
      return {
        style: {},
        setAttribute() {},
        appendChild() {},
        remove() {},
        click() {},
        select() {},
        setSelectionRange() {},
      };
    },
    execCommand: () => false,
  };
  globalThis.Image = class FakeImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.decoding = '';
      this._src = '';
    }
    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        if (this.onload) this.onload();
      });
    }
    get src() {
      return this._src;
    }
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

  return {
    calls,
    restore() {
      if (saved.document === undefined) delete globalThis.document;
      else globalThis.document = saved.document;
      if (saved.Image === undefined) delete globalThis.Image;
      else globalThis.Image = saved.Image;
      if (saved.getComputedStyle === undefined) delete globalThis.getComputedStyle;
      else globalThis.getComputedStyle = saved.getComputedStyle;
    },
  };
}

/* ------------------------------------------------------------------------- */
console.log(`\nOK: ${count} asserts pasados (tests/share.mjs).`);

