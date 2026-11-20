// ============================================================================
// FlagPlays · src/share.js
// Compartir jugadas y libretas: compresor propio (LZ-String), enlaces,
// exportación PNG/SVG/JSON, portapapeles y descargas. Sin dependencias.
//
// Las funciones puras (compresor, minificado, enlaces y JSON) se pueden usar
// en Node. Las que tocan DOM (canvas, portapapeles, descargas) se comprueban
// antes de usarse y nunca se ejecutan al importar el módulo.
// ============================================================================

import { DEFAULT_FIELD } from './field.js';
import { ROLES, createPlayer, normalizePlay, normalizePlaybook, compactStyle } from './model.js';
import { DEFAULT_APPEARANCE, normalizeAppearance } from './appearance.js';
import { computePlayDuration, playToSVG } from './renderer.js';

/* ----------------------------------------------------------------------------
 * 1. COMPRESOR propio tipo LZ-String
 * ----------------------------------------------------------------------------
 * Diccionario deslizante (LZW) con códigos de longitud variable que se empaquetan
 * en caracteres de 6 bits (alfabeto Base64). Salida URI-safe: `+` -> `-`,
 * `/` -> `_` y sin relleno `=`, para poder meterla en un hash sin escapar.
 *
 * Se comprime `MARCA + texto` y al descomprimir se exige esa marca: así cualquier
 * cadena corrupta o ajena se detecta y lanza un Error claro. Los caracteres se
 * tratan como unidades UTF-16, por lo que tildes, ñ, € o emoji hacen round-trip
 * exacto sin conversiones de codificación.
 */

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Map([...B64_ALPHABET].map((ch, i) => [ch, i]));
const MARKER = '\u0001'; // marca de integridad del flujo comprimido

/**
 * Empaqueta bits en caracteres de `bitsPerChar` bits (LSB primero), igual que
 * el algoritmo clásico de LZ-String.
 */
function compressBits(input, bitsPerChar) {
  const out = [];
  let dataVal = 0;
  let dataPos = 0;

  /** Escribe `nbits` bits de `value`, empezando por el menos significativo. */
  const emit = (value, nbits) => {
    let v = value;
    for (let i = 0; i < nbits; i++) {
      dataVal = (dataVal << 1) | (v & 1);
      if (dataPos === bitsPerChar - 1) {
        out.push(dataVal);
        dataVal = 0;
        dataPos = 0;
      } else {
        dataPos++;
      }
      v >>= 1;
    }
  };

  const dictionary = new Map(); // cadena -> código
  const toCreate = new Set(); // caracteres que hay que escribir literalmente
  let dictSize = 3; // 0, 1 y 2 están reservados (literal 8 bits, literal 16 bits, fin)
  let numBits = 2;
  let enlargeIn = 2;
  let w = '';

  /** Escribe un carácter nuevo como literal (8 o 16 bits) y ajusta el contador. */
  const emitChar = (ch) => {
    const code = ch.charCodeAt(0);
    if (code < 256) {
      emit(0, numBits);
      emit(code, 8);
    } else {
      emit(1, numBits);
      emit(code, 16);
    }
    enlargeIn--;
    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits++;
    }
    toCreate.delete(ch);
  };

  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i);
    if (!dictionary.has(c)) {
      dictionary.set(c, dictSize++);
      toCreate.add(c);
    }
    const wc = w + c;
    if (dictionary.has(wc)) {
      w = wc;
      continue;
    }
    if (toCreate.has(w)) emitChar(w);
    else emit(dictionary.get(w), numBits);
    enlargeIn--;
    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits++;
    }
    dictionary.set(wc, dictSize++);
    w = c;
  }

  // Última entrada pendiente.
  if (w !== '') {
    if (toCreate.has(w)) emitChar(w);
    else emit(dictionary.get(w), numBits);
    enlargeIn--;
    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits++;
    }
  }

  // Marca de fin de flujo.
  emit(2, numBits);
  // Vaciado: completa el último carácter con ceros.
  for (;;) {
    dataVal <<= 1;
    if (dataPos === bitsPerChar - 1) {
      out.push(dataVal);
      break;
    }
    dataPos++;
  }
  return out;
}

/**
 * Descomprime una lista de valores de `bitsPerChar` bits. Devuelve `null` si el
 * flujo es inválido o está truncado.
 */
function decompressBits(values) {
  if (!values.length) return null;
  let idx = 0;
  let dataVal = values[0];
  let dataPos = 32; // 6 bits por carácter
  let overrun = false;

  /** Lee `nbits` bits; si se acaban los datos marca `overrun`. */
  const read = (nbits) => {
    let bits = 0;
    let power = 1;
    for (let i = 0; i < nbits; i++) {
      if (overrun) return bits;
      const bit = (dataVal & dataPos) !== 0 ? 1 : 0;
      dataPos >>= 1;
      bits |= bit * power;
      power <<= 1;
      if (dataPos === 0) {
        dataPos = 32;
        idx++;
        if (idx >= values.length) {
          overrun = true;
          dataVal = 0;
        } else {
          dataVal = values[idx];
        }
      }
    }
    return bits;
  };

  const dictionary = [];
  for (let i = 0; i < 3; i++) dictionary[i] = i;
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let c = '';

  const first = read(2);
  if (overrun) return null;
  if (first === 0) {
    c = String.fromCharCode(read(8));
    if (overrun) return null;
  } else if (first === 1) {
    c = String.fromCharCode(read(16));
    if (overrun) return null;
  } else if (first === 2) {
    return '';
  } else {
    return null;
  }

  dictionary[3] = c;
  let w = c;
  const result = [c];

  for (;;) {
    const code = read(numBits);
    if (overrun) return null;
    let entry;
    if (code === 0) {
      entry = String.fromCharCode(read(8));
      if (overrun) return null;
      dictionary[dictSize++] = entry;
      enlargeIn--;
      c = dictSize - 1;
    } else if (code === 1) {
      entry = String.fromCharCode(read(16));
      if (overrun) return null;
      dictionary[dictSize++] = entry;
      enlargeIn--;
      c = dictSize - 1;
    } else if (code === 2) {
      return result.join('');
    } else {
      c = code;
    }

    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits++;
    }
    if (dictionary[c] !== undefined) entry = dictionary[c];
    else if (c === dictSize) entry = w + w.charAt(0);
    else return null;

    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits++;
    }
  }
}

/** Comprime un texto y lo devuelve en Base64 URI-safe (sin `=`, con `-` y `_`). */
export function compressToB64(str) {
  if (str === null || str === undefined) return '';
  const payload = MARKER + String(str);
  const bits = compressBits(payload, 6);
  const chars = new Array(bits.length);
  for (let i = 0; i < bits.length; i++) chars[i] = B64_ALPHABET.charAt(bits[i]);
  return chars.join('').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Descomprime una cadena de `compressToB64`. Lanza Error si no es válida. */
export function decompressFromB64(s) {
  const input = typeof s === 'string' ? s.trim() : '';
  if (!input) throw new Error('No se pudo descomprimir: la cadena está vacía.');
  const values = new Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    const normalized = ch === '-' ? '+' : ch === '_' ? '/' : ch;
    const value = B64_LOOKUP.get(normalized);
    if (value === undefined) {
      throw new Error('No se pudo descomprimir: la cadena contiene caracteres no válidos.');
    }
    values[i] = value;
  }
  const payload = decompressBits(values);
  if (payload === null || payload === '') {
    throw new Error('No se pudo descomprimir: los datos están corruptos o incompletos.');
  }
  if (payload.charAt(0) !== MARKER) {
    throw new Error('No se pudo descomprimir: los datos no son de FlagPlays o están corruptos.');
  }
  return payload.slice(1);
}

/* ----------------------------------------------------------------------------
 * 2. MINIFICADO de jugadas y libretas
 * ----------------------------------------------------------------------------
 * Formato de jugada minificada (versión 1):
 *   {
 *     version: 1,
 *     name?, type?:'defense', formation?, category?, tags?, notes?,
 *     field?: {width, depth, ez},           // sólo si difiere del campo por defecto
 *     players: [{
 *       role, team?:'defense', x, y,
 *       label?,                             // sólo si difiere de la etiqueta del rol
 *       num?,                               // sólo si tiene dorsal
 *       path?: [[x,y] | [x,y,1]],           // 1 = curva suave; coordenadas a 0,1 yd
 *       pathType?,                          // sólo si difiere del tipo por defecto
 *       assignment?: ['man', índice] | ['zone', [x,y], depth]
 *                  | ['rush', lane] | 'cover0'|'cover1'|'cover2'|'cover3'
 *     }],
 *     ball?: [índiceJugador, releaseAt]     // sólo si hay balón dirigido a alguien
 *   }
 * Los ids se regeneran al expandir (evita colisiones al importar) y las
 * referencias (balón, hombre a hombre) se guardan por índice de jugador.
 * Los puntos de ruta se redondean a 0,1 yd para no engordar el enlace.
 */

const MINIFY_VERSION = 1;
const DEFAULT_RELEASE_AT = 0.9;
const DEFAULT_CATEGORY = 'Pase corto';
const DEFAULT_PLAY_NAME = 'Jugada sin nombre';
const COVER_TYPES = new Set(['cover0', 'cover1', 'cover2', 'cover3']);

/** Redondea yardas a 0,1 (y convierte a número seguro). */
function r1(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 10) / 10;
}

function isDefaultField(field) {
  if (!field || typeof field !== 'object') return true;
  return (
    r1(field.width) === r1(DEFAULT_FIELD.width) &&
    r1(field.depth) === r1(DEFAULT_FIELD.depth) &&
    r1(field.ez) === r1(DEFAULT_FIELD.ez)
  );
}

function defaultPathType(team) {
  return team === 'defense' ? 'rush' : 'route';
}

/** Compacta un `Assignment` del modelo. */
function minifyAssignment(assignment, indexById) {
  if (!assignment || typeof assignment !== 'object' || !assignment.type) return null;
  switch (assignment.type) {
    case 'man': {
      const idx = indexById.has(assignment.targetId) ? indexById.get(assignment.targetId) : null;
      return ['man', idx];
    }
    case 'zone':
      return [
        'zone',
        [r1(assignment.landmark?.x), r1(assignment.landmark?.y)],
        r1(assignment.depth ?? 6),
      ];
    case 'rush': {
      const lane = Number(assignment.lane);
      return ['rush', Number.isFinite(lane) ? lane : 1];
    }
    case 'cover0':
    case 'cover1':
    case 'cover2':
    case 'cover3':
      return assignment.type;
    default:
      return null;
  }
}

function minifyPlayer(player, indexById) {
  const team = player?.team === 'defense' ? 'defense' : 'offense';
  const role = ROLES[player?.role] ? player.role : team === 'defense' ? 'db' : 'wr';
  const out = {
    role,
    x: r1(player?.pos?.x),
    y: r1(player?.pos?.y),
  };
  if (team === 'defense') out.team = 'defense';

  const defaultLabel = ROLES[role]?.short ?? '';
  if (player?.label && String(player.label) !== defaultLabel) out.label = String(player.label);
  if (player?.number !== undefined && player?.number !== null && String(player.number) !== '') {
    out.num = String(player.number);
  }
  if (Array.isArray(player?.path) && player.path.length) {
    out.path = player.path.map((pt) =>
      pt?.curve === 'smooth' ? [r1(pt.x), r1(pt.y), 1] : [r1(pt.x), r1(pt.y)]
    );
  }
  const pathType = player?.pathType || defaultPathType(team);
  if (pathType !== defaultPathType(team)) out.pathType = String(pathType);

  const assignment = minifyAssignment(player?.assignment, indexById);
  if (assignment) out.assignment = assignment;

  // Personalización del jugador (color, forma, tamaño, ruta propia).
  const style = compactStyle(player?.style);
  if (style) {
    const st = {};
    for (const k of ['color', 'ink', 'shape', 'size', 'routeColor', 'routeStyle']) {
      if (style[k] !== null && style[k] !== undefined && style[k] !== '') st[k] = style[k];
    }
    if (Object.keys(st).length) out.st = st;
  }
  return out;
}

/** Reduce una `Play` a la forma compacta que viaja en los enlaces. */
export function minifyPlay(play) {
  if (!play || typeof play !== 'object' || !Array.isArray(play.players)) {
    throw new Error('Jugada inválida para compartir.');
  }
  const indexById = new Map(play.players.map((p, i) => [p.id, i]));
  const out = { version: MINIFY_VERSION };

  if (play.name && String(play.name) !== DEFAULT_PLAY_NAME) out.name = String(play.name);
  if (play.type === 'defense') out.type = 'defense';
  if (play.formation) out.formation = String(play.formation);
  if (play.category && String(play.category) !== DEFAULT_CATEGORY) {
    out.category = String(play.category);
  }
  if (Array.isArray(play.tags) && play.tags.length) out.tags = play.tags.map(String).slice(0, 12);
  if (play.notes) out.notes = String(play.notes);
  if (!isDefaultField(play.field)) {
    const field = play.field || {};
    out.field = { width: r1(field.width), depth: r1(field.depth), ez: r1(field.ez) };
  }

  out.players = play.players.map((p) => minifyPlayer(p, indexById));

  const targetId = play.ball?.targetId ?? null;
  const targetIndex = indexById.has(targetId) ? indexById.get(targetId) : -1;
  if (targetIndex >= 0) {
    out.ball = [targetIndex, r1(play.ball?.releaseAt ?? DEFAULT_RELEASE_AT)];
  }
  return out;
}

/** Detecta si el objeto ya es una jugada "normal" (no minificada). */
function looksLikeRawPlay(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.players)) return false;
  if (obj.players.length === 0) return true;
  const first = obj.players[0];
  return !!first && typeof first === 'object' && !!first.pos && typeof first.pos === 'object';
}

function expandPlayer(compact) {
  const team = compact?.team === 'defense' ? 'defense' : 'offense';
  const role = ROLES[compact?.role] ? compact.role : team === 'defense' ? 'db' : 'wr';
  const path = Array.isArray(compact?.path)
    ? compact.path
        .filter((pt) => Array.isArray(pt))
        .map((pt) => ({
          x: Number(pt[0]) || 0,
          y: Number(pt[1]) || 0,
          curve: pt[2] ? 'smooth' : 'line',
        }))
    : null;
  return {
    role,
    team,
    pos: { x: Number(compact?.x) || 0, y: Number(compact?.y) || 0 },
    label: compact?.label ?? ROLES[role]?.short ?? '',
    number: compact?.num ?? '',
    path,
    pathType: compact?.pathType,
    assignment: null, // se rellena después, cuando ya existen los ids
    style: compact?.st && typeof compact.st === 'object' ? { ...compact.st } : null,
  };
}

function expandAssignment(compact, ids) {
  if (!compact) return null;
  if (typeof compact === 'string') {
    return COVER_TYPES.has(compact) ? { type: compact } : null;
  }
  if (!Array.isArray(compact)) return null;
  const [kind] = compact;
  if (kind === 'man') {
    const index = compact[1];
    return {
      type: 'man',
      targetId: Number.isInteger(index) && ids[index] ? ids[index] : null,
    };
  }
  if (kind === 'zone') {
    const landmark = Array.isArray(compact[1]) ? compact[1] : [0, 0];
    return {
      type: 'zone',
      landmark: { x: Number(landmark[0]) || 0, y: Number(landmark[1]) || 0 },
      depth: Number(compact[2]) || 6,
    };
  }
  if (kind === 'rush') {
    const lane = Number(compact[1]);
    return { type: 'rush', lane: Number.isFinite(lane) ? lane : 0 };
  }
  return null;
}

/** Expande la forma compacta y devuelve una `Play` normalizada (pasa por `normalizePlay`). */
export function expandPlay(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Jugada compartida inválida.');
  if (looksLikeRawPlay(obj)) return normalizePlay(obj);

  const version = Number(obj.version ?? MINIFY_VERSION);
  if (version > MINIFY_VERSION) {
    throw new Error('Esta jugada se compartió con una versión más nueva de FlagPlays.');
  }
  if (!Array.isArray(obj.players)) throw new Error('Jugada compartida inválida.');

  // Primero se materializan los jugadores para tener ids reales...
  const players = obj.players.map((compact) => createPlayer(expandPlayer(compact)));
  const ids = players.map((p) => p.id);
  // ...y después se resuelven las referencias por índice.
  players.forEach((player, i) => {
    player.assignment = expandAssignment(obj.players[i]?.assignment, ids);
  });

  const ball = Array.isArray(obj.ball) && Number.isInteger(obj.ball[0]) && ids[obj.ball[0]]
    ? { targetId: ids[obj.ball[0]], releaseAt: Number(obj.ball[1]) }
    : undefined;

  return normalizePlay({
    name: obj.name,
    type: obj.type === 'defense' ? 'defense' : 'offense',
    formation: obj.formation || '',
    category: obj.category,
    tags: Array.isArray(obj.tags) ? obj.tags : [],
    notes: obj.notes || '',
    field: obj.field && typeof obj.field === 'object' ? obj.field : undefined,
    players,
    ball,
  });
}

/** Reduce una `Playbook` a la forma compacta que viaja en los enlaces `#b=`. */
export function minifyPlaybook(playbook) {
  if (!playbook || typeof playbook !== 'object' || !Array.isArray(playbook.plays)) {
    throw new Error('Libreta inválida para compartir.');
  }
  const out = {
    version: MINIFY_VERSION,
    name: playbook.name || 'Mi libreta',
    plays: playbook.plays.map(minifyPlay),
  };
  const folders = (Array.isArray(playbook.folders) ? playbook.folders : [])
    .filter((f) => f && f.id && f.name)
    .map((f) => [String(f.id), String(f.name), String(f.color || '#9ae63f')]);
  if (folders.length) out.folders = folders;
  const roster = (Array.isArray(playbook.roster) ? playbook.roster : [])
    .filter((r) => r && r.name)
    .map((r) => [String(r.id || ''), String(r.name), String(r.number ?? '')]);
  if (roster.length) out.roster = roster;
  if (playbook.settings && typeof playbook.settings === 'object') {
    out.settings = { ...playbook.settings };
  }
  // Apariencia: sólo las claves que difieren de los valores por defecto.
  const appearance = normalizeAppearance(playbook.appearance);
  const appearanceDiff = {};
  for (const [k, v] of Object.entries(appearance)) {
    if (v !== DEFAULT_APPEARANCE[k]) appearanceDiff[k] = v;
  }
  if (Object.keys(appearanceDiff).length) out.appearance = appearanceDiff;
  if (Array.isArray(playbook.trees) && playbook.trees.length) out.trees = playbook.trees;
  return out;
}

function looksLikeRawPlaybook(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.plays)) return false;
  if (obj.plays.length === 0) {
    return !!(obj.id || obj.folders || obj.roster || (obj.settings && !obj.settings.version));
  }
  return looksLikeRawPlay(obj.plays[0]);
}

/** Expande una libreta compartida y la normaliza (pasa por `normalizePlaybook`). */
export function expandPlaybook(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Libreta compartida inválida.');
  if (looksLikeRawPlaybook(obj)) return normalizePlaybook(obj);
  if (!Array.isArray(obj.plays)) throw new Error('Libreta compartida inválida.');

  const raw = {
    name: obj.name || 'Libreta compartida',
    plays: obj.plays.map(expandPlay),
    folders: Array.isArray(obj.folders)
      ? obj.folders.map((f) =>
          Array.isArray(f) ? { id: f[0], name: f[1], color: f[2] } : f
        )
      : undefined,
    roster: Array.isArray(obj.roster)
      ? obj.roster.map((r) =>
          Array.isArray(r) ? { id: r[0] || undefined, name: r[1], number: r[2] ?? '' } : r
        )
      : undefined,
    settings: obj.settings && typeof obj.settings === 'object' ? obj.settings : undefined,
    appearance:
      obj.appearance && typeof obj.appearance === 'object'
        ? normalizeAppearance({ ...DEFAULT_APPEARANCE, ...obj.appearance })
        : undefined,
    trees: Array.isArray(obj.trees) ? obj.trees : undefined,
  };
  return normalizePlaybook(raw);
}

/* ----------------------------------------------------------------------------
 * 3. ENLACES COMPARTIBLES (#p= jugada, #b= libreta)
 * ----------------------------------------------------------------------------
 * El enlace se abre en una pestaña nueva y funciona sin cuenta: todo el
 * contenido viaja comprimido dentro del hash (nunca llega al servidor).
 */

function locationBase() {
  const loc = globalThis.location;
  if (!loc || typeof loc.origin !== 'string' || typeof loc.pathname !== 'string') return '';
  return `${loc.origin}${loc.pathname}`;
}

/** Lee el hash actual (o uno dado) y extrae el payload que sigue a `prefix`. */
function readShareHash(prefix, hash) {
  try {
    // Sin argumento se usa `location.hash`; si se pasa algo que no es texto, se ignora.
    const h = hash === undefined ? globalThis.location?.hash : hash;
    if (typeof h !== 'string' || !h) return null;
    if (h.charAt(0) !== '#') h = `#${h}`;
    const start = h.indexOf(prefix);
    if (start < 0) return null;
    let payload = h.slice(start + prefix.length);
    const amp = payload.indexOf('&');
    if (amp >= 0) payload = payload.slice(0, amp);
    return payload || null;
  } catch {
    return null;
  }
}

/** Enlace compartible de una jugada: `.../index.html#p=<comprimido>`. */
export function playToShareURL(play) {
  const payload = compressToB64(JSON.stringify(minifyPlay(play)));
  return `${locationBase()}#p=${payload}`;
}

/** Recupera la jugada del hash actual. Devuelve `null` si no hay o está corrupto. */
export function playFromLocationHash(hash) {
  try {
    const payload = readShareHash('#p=', hash);
    if (!payload) return null;
    return expandPlay(JSON.parse(decompressFromB64(payload)));
  } catch {
    return null;
  }
}

/** Enlace compartible de una libreta entera: `.../index.html#b=<comprimido>`. */
export function playbookToShareURL(playbook) {
  const payload = compressToB64(JSON.stringify(minifyPlaybook(playbook)));
  return `${locationBase()}#b=${payload}`;
}

/** Recupera la libreta del hash actual. Devuelve `null` si no hay o está corrupta. */
export function playbookFromLocationHash(hash) {
  try {
    const payload = readShareHash('#b=', hash);
    if (!payload) return null;
    return expandPlaybook(JSON.parse(decompressFromB64(payload)));
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------------
 * 4. PNG EN CANVAS (usa renderer.playToSVG)
 * ----------------------------------------------------------------------------
 * El SVG se convierte en imagen con una URL de datos y se pinta en un canvas
 * de `width*scale` x `height*scale`. Encima se dibuja un pie con el nombre de
 * la jugada y la marca FlagPlays.
 */

/** Crea un `<a download>` temporal y revoca la URL al terminar. */
export function downloadBlob(blob, filename = 'descarga') {
  const nativeSave = typeof window !== 'undefined' ? window.__flagplaysSave : null;
  if (typeof nativeSave === 'function') return nativeSave(blob, filename);

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error('Las descargas sólo están disponibles en el navegador.');
  }
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Este navegador no permite preparar descargas.');
  }
  const safeName = sanitizeFileName(filename, 'descarga');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.rel = 'noopener';
  link.style.display = 'none';
  const host = document.body || document.documentElement;
  if (!host) {
    URL.revokeObjectURL(url);
    throw new Error('No se pudo preparar la descarga.');
  }
  host.appendChild(link);
  try {
    link.click();
  } finally {
    setTimeout(() => {
      try {
        link.remove();
      } catch {
        if (link.parentNode) link.parentNode.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 1500);
  }
  return safeName;
}

/** Descarga un texto con nombre y tipo MIME. */
export function downloadText(text, filename, mime = 'text/plain;charset=utf-8') {
  if (typeof Blob === 'undefined') {
    throw new Error('Este navegador no permite crear ficheros descargables.');
  }
  const blob = new Blob([String(text ?? '')], { type: mime });
  return downloadBlob(blob, filename);
}

function sanitizeFileName(name, fallback) {
  const clean = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || fallback;
}

/** Nombre de fichero seguro a partir de un título: `Trips Derecha / Rueda #2` -> `Trips-Derecha-Rueda-2`. */
export function fileSafeName(str) {
  const slug = String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes: Ñandú -> Nandu
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 64)
    .replace(/^[-_.]+|[-_.]+$/g, '');
  return slug || 'flagplays';
}

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function cssVar(name, fallback) {
  try {
    if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return String(value || '').trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Garantiza que el SVG lleva `xmlns` (necesario para cargarlo como imagen). */
function ensureSvgMarkup(svg) {
  let out = String(svg ?? '').trim();
  const open = out.indexOf('>');
  if (out.charAt(0) === '<' && open > 0 && !/\bxmlns\s*=/.test(out.slice(0, open + 1))) {
    out = out.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return out;
}

function svgDataURL(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ensureSvgMarkup(svg))}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('La exportación a PNG necesita un navegador con soporte de imagen.'));
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo convertir la jugada en imagen.'));
    img.src = src;
  });
}

function dataURLToBlob(dataURL) {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataURL));
  if (!match) throw new Error('No se pudo generar el PNG.');
  const mime = match[1] || 'image/png';
  const isBase64 = !!match[2];
  const raw = isBase64 ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('No se pudo generar el PNG.'));
        },
        type,
        quality
      );
      return;
    }
    // Fallback: algunos navegadores antiguos no tienen canvas.toBlob.
    try {
      const dataURL = canvas.toDataURL(type, quality);
      resolve(dataURLToBlob(dataURL));
    } catch (err) {
      reject(err instanceof Error ? err : new Error('No se pudo generar el PNG.'));
    }
  });
}

/** Recorta un texto para que quepa en `maxWidth` px. */
function fitText(ctx, text, maxWidth, fontSize) {
  const value = String(text ?? '');
  if (typeof ctx.measureText === 'function' && maxWidth > fontSize * 2) {
    if (ctx.measureText(value).width <= maxWidth) return value;
    let cut = value;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
    return `${cut}…`;
  }
  return value.slice(0, 48);
}

/** Pie del PNG: nombre de la jugada a la izquierda y marca FlagPlays a la derecha. */
function drawBrandFooter(ctx, width, height, name, scale) {
  const bandH = Math.max(Math.round(26 * scale), Math.round(height * 0.055));
  const top = height - bandH;
  const accent = cssVar('--accent', '#9ae63f');
  const ink = cssVar('--text', '#eafff2');
  const fontSize = Math.max(11, Math.round(bandH * 0.42));
  const pad = Math.max(10, Math.round(bandH * 0.45));

  ctx.save();
  ctx.fillStyle = cssVar('--panel', 'rgba(7, 13, 16, 0.88)');
  ctx.fillRect(0, top, width, bandH);
  ctx.fillStyle = accent;
  ctx.fillRect(0, top, width, Math.max(2, Math.round(2 * scale)));

  ctx.textBaseline = 'middle';
  const midY = top + bandH / 2 + Math.round(scale);

  ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = accent;
  const brand = 'FlagPlays';
  const brandWidth = typeof ctx.measureText === 'function' ? ctx.measureText(brand).width : fontSize * 6;
  ctx.textAlign = 'right';
  ctx.fillText(brand, width - pad, midY);

  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  const roomForName = width - pad * 2 - brandWidth;
  ctx.fillText(fitText(ctx, name, roomForName, fontSize), pad, midY);
  ctx.restore();
}

/**
 * Exporta una jugada a PNG.
 * opts: { width=1600, height=1200, scale=2, showDefense=true, showLabels=true,
 *         background=true, name=play.name }.
 */
export async function exportPNG(play, opts = {}) {
  if (!play || typeof play !== 'object') throw new Error('No hay jugada para exportar.');
  const o = {
    width: 1600,
    height: 1200,
    scale: 2,
    showDefense: true,
    showLabels: true,
    background: true,
    ...opts,
  };
  const width = Math.max(160, Math.round(Number(o.width) || 1600));
  const height = Math.max(120, Math.round(Number(o.height) || 1200));
  const scale = Math.min(4, Math.max(0.5, Number(o.scale) || 2));
  const name = o.name !== undefined && o.name !== null ? String(o.name) : String(play.name || 'Jugada');

  const svg = playToSVG(play, {
    ...o,
    width,
    height,
    mode: 'static',
    showDefense: o.showDefense !== false,
    showLabels: o.showLabels !== false,
    background: o.background !== false,
    bg: o.background !== false,
  });

  const img = await loadImage(svgDataURL(svg));
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw new Error('La exportación a PNG necesita un navegador.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador no permite dibujar en canvas 2D.');

  if (o.background !== false) {
    ctx.fillStyle = cssVar('--turf', '#070d10');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if ('imageSmoothingEnabled' in ctx) ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawBrandFooter(ctx, canvas.width, canvas.height, name, scale);

  return canvasToBlob(canvas, 'image/png');
}

/**
 * Exporta N fotogramas de la jugada a lo largo de su duración.
 * opts.frames = número de fotogramas (1..24, por defecto 8).
 * Devuelve `Blob[]` en orden temporal.
 */
export async function exportSequencePNG(play, opts = {}) {
  const frames = Math.max(1, Math.min(24, Math.round(Number(opts.frames) || 8)));
  const duration = Number(opts.duration) || computePlayDuration(play);
  if (frames === 1) return [await exportPNG(play, { ...opts, time: 0 })];
  const blobs = [];
  for (let i = 0; i < frames; i++) {
    const time = (duration * i) / (frames - 1);
    blobs.push(await exportPNG(play, { ...opts, time }));
  }
  return blobs;
}

/** Copia el PNG de la jugada al portapapeles. `false` si no está soportado. */
export async function copyPlayImage(play, opts = {}) {
  try {
    const ClipboardItemCtor = globalThis.ClipboardItem;
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof ClipboardItemCtor !== 'function' || !clipboard || typeof clipboard.write !== 'function') {
      return false;
    }
    const blob = await exportPNG(play, opts);
    try {
      await clipboard.write([new ClipboardItemCtor({ 'image/png': blob })]);
    } catch {
      // Algunos navegadores (Safari) exigen un Promise en el constructor.
      await clipboard.write([new ClipboardItemCtor({ 'image/png': Promise.resolve(blob) })]);
    }
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------------------
 * 5. JSON (exportar / importar libretas y jugadas)
 * ----------------------------------------------------------------------------
 * Envoltorio de exportación: { app:'flagplays', version:1, exportedAt, playbook }.
 * La importación acepta ese envoltorio, una libreta directa, un array de
 * jugadas o una sola jugada (con o sin envoltorio).
 */

function exportFileName(label) {
  return `flagplays-${fileSafeName(label)}-${dateStamp()}.json`;
}

function buildPlaybookPayload(playbook) {
  const book = normalizePlaybook(playbook);
  return {
    app: 'flagplays',
    version: 1,
    exportedAt: new Date().toISOString(),
    playbook: book,
  };
}

/** Descarga la libreta como `flagplays-<slug>-<fecha>.json`. */
export function exportPlaybookJSON(playbook) {
  const payload = buildPlaybookPayload(playbook);
  const filename = exportFileName(payload.playbook.name || 'libreta');
  downloadText(JSON.stringify(payload, null, 2), filename, 'application/json;charset=utf-8');
  return filename;
}

/** Descarga una sola jugada como JSON con el mismo envoltorio. */
export function exportPlayJSON(play) {
  const normalized = normalizePlay(play);
  const payload = {
    app: 'flagplays',
    version: 1,
    exportedAt: new Date().toISOString(),
    play: normalized,
  };
  const filename = exportFileName(normalized.name || 'jugada');
  downloadText(JSON.stringify(payload, null, 2), filename, 'application/json;charset=utf-8');
  return filename;
}

/** Convierte un objeto JSON ya parseado (de cualquier importación) en `Playbook`. */
export function playbookFromJSON(data) {
  let raw = data;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.app !== undefined && raw.app !== 'flagplays') {
      throw new Error('El fichero no es una libreta de FlagPlays.');
    }
    if (raw.playbook && typeof raw.playbook === 'object') raw = raw.playbook;
    else if (raw.play && typeof raw.play === 'object') raw = { name: 'Libreta importada', plays: [raw.play] };
    else if (raw.playbook === null) throw new Error('El fichero no es una libreta de FlagPlays.');
  }
  if (Array.isArray(raw)) raw = { name: 'Libreta importada', plays: raw };
  if (!raw || typeof raw !== 'object') {
    throw new Error('El fichero no es una libreta de FlagPlays.');
  }
  if (!Array.isArray(raw.plays)) {
    if (Array.isArray(raw.players)) {
      raw = { name: 'Libreta importada', plays: [raw] };
    } else {
      throw new Error('El fichero no contiene jugadas de FlagPlays.');
    }
  }
  try {
    return normalizePlaybook(raw);
  } catch (err) {
    throw new Error(
      `El fichero no es una libreta de FlagPlays: ${err instanceof Error ? err.message : 'datos inválidos'}.`
    );
  }
}

/** Importa una libreta desde texto JSON. Lanza Error con mensaje en español si no vale. */
export function importPlaybookFromText(text) {
  if (text === null || text === undefined || String(text).trim() === '') {
    throw new Error('El fichero está vacío: no parece una libreta de FlagPlays.');
  }
  let data;
  try {
    data = JSON.parse(String(text));
  } catch {
    throw new Error('El fichero no es una libreta de FlagPlays: el JSON no es válido.');
  }
  return playbookFromJSON(data);
}

/** Importa una libreta desde un `File` (o desde un string). Devuelve `Promise<Playbook>`. */
export async function importPlaybookFile(file) {
  if (typeof file === 'string') return importPlaybookFromText(file);
  if (!file) throw new Error('No se ha seleccionado ningún fichero.');
  if (typeof file.size === 'number' && file.size > 8 * 1024 * 1024) {
    throw new Error('El fichero es demasiado grande para ser una libreta de FlagPlays.');
  }
  if (typeof file.text === 'function') {
    return importPlaybookFromText(await file.text());
  }
  // Fallback para navegadores sin `File.text()`.
  const text = await new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('Este navegador no puede leer el fichero seleccionado.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('No se pudo leer el fichero.'));
    reader.readAsText(file);
  });
  return importPlaybookFromText(text);
}

/* ----------------------------------------------------------------------------
 * 6. SVG y PORTAPAPELES
 * ----------------------------------------------------------------------------
 */

/** Devuelve el SVG de la jugada como cadena lista para descargar. */
export function exportSVG(play, opts = {}) {
  const o = { width: 1600, height: 1200, mode: 'static', ...opts };
  return ensureSvgMarkup(playToSVG(play, { ...o, width: o.width, height: o.height }));
}

/** Copia el enlace compartible de la jugada. Devuelve la URL copiada. */
export async function copyShareLink(play) {
  const url = playToShareURL(play);
  const copied = await copyTextToClipboard(url);
  if (!copied) throw new Error('No se pudo copiar el enlace al portapapeles.');
  return url;
}

async function copyTextToClipboard(text) {
  const value = String(text ?? '');
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(value);
      return true;
    }
  } catch {
    // Sin permisos de portapapeles: se intenta el fallback clásico.
  }
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    (document.body || document.documentElement).appendChild(textarea);
    textarea.select();
    if (typeof textarea.setSelectionRange === 'function') textarea.setSelectionRange(0, value.length);
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    textarea.remove();
    return !!ok;
  } catch {
    return false;
  }
}
