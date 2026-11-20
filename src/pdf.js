// =============================================================================
// src/pdf.js — Escritor de PDF 1.4 desde cero, sin dependencias.
//
// Genera documentos PDF válidos con primitivas vectoriales y texto, usando las
// fuentes estándar 14 (Helvetica y variantes) con codificación WinAnsi/CP1252.
//
// Sistema de coordenadas de la API:
//   - origen arriba a la izquierda, `y` crece hacia abajo, unidades en puntos.
//   - internamente se invierte a coordenadas PDF (origen abajo a la izquierda).
//
// El documento se escribe sin compresión (streams sin /Filter) para poder
// auditar el contenido con tests.
// =============================================================================

import { encodedWidth } from './afm.js';

/** Tamaños de página en puntos (1 pt = 1/72 pulgada). */
export const PAGE_SIZES = Object.freeze({
  A4: Object.freeze({ width: 595.28, height: 841.89 }),
  Letter: Object.freeze({ width: 612, height: 792 }),
  A3: Object.freeze({ width: 841.89, height: 1190.55 }),
});

/** Tinta por defecto de la app (mismo gris que el tema claro de FlagPlays). */
const DEFAULT_INK = '#111827';

// --- Fuentes estándar 14: subconjunto Helvetica -----------------------------

/** Alias cortos de la API -> nombre de fuente estándar. */
const FONT_ALIASES = Object.freeze({
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  bolditalic: 'Helvetica-BoldOblique',
});

/** Orden fijo de las fuentes; el índice define el recurso /F1../F4. */
const FONT_ORDER = Object.freeze([
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
]);

// Métricas tipográficas de Helvetica (AFM de Adobe), en fracción de em.
const ASCENT = 0.718;
const DESCENT = 0.207;

/** Constante de aproximación de cuartos de círculo con curvas de Bézier cúbicas. */
const CIRCLE_K = 0.5522847498307936;

// --- Mapa explícito CP1252 / WinAnsi ---------------------------------------

// CP1252 coincide con Latin-1 salvo el bloque 0x80..0x9F, que se mapea desde
// estos puntos de código Unicode. Lo no listado se escribe como `?` (0x3F).
const CP1252_SPECIAL = Object.freeze({
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02c6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8a, // Š
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x017d: 0x8e, // Ž
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9a, // š
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
  0x017e: 0x9e, // ž
  0x0178: 0x9f, // Ÿ
});

const CP1252_MAP = (() => {
  const map = new Map();
  for (let code = 0x20; code <= 0x7e; code++) map.set(code, code);
  for (let code = 0xa0; code <= 0xff; code++) map.set(code, code);
  for (const [unicode, byte] of Object.entries(CP1252_SPECIAL)) {
    map.set(Number(unicode), byte);
  }
  return map;
})();

/**
 * Codifica una cadena a WinAnsi/CP1252.
 * Devuelve un array de códigos de byte (0..255). Lo no representable -> 0x3F.
 * @param {string} str
 * @returns {number[]}
 */
export function encodeWinAnsi(str) {
  const text = str == null ? '' : String(str);
  const codes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    // Saltos de línea y tabuladores se aplanan a espacio: una línea = una cadena PDF.
    if (cp === 0x0a || cp === 0x0d || cp === 0x09) {
      codes.push(0x20);
      continue;
    }
    const byte = CP1252_MAP.get(cp);
    codes.push(byte === undefined ? 0x3f : byte);
  }
  return codes;
}

/** Escapa una cadena ya codificada para poder escribirla dentro de `( ... )`. */
function escapePdfBytes(codes) {
  let out = '';
  for (const byte of codes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      // ( ) \ -> escapados con barra invertida
      out += '\\' + String.fromCharCode(byte);
    } else if (byte < 0x20 || byte === 0x7f) {
      // Caracteres de control -> octal (no deberían llegar, se filtran antes).
      out += '\\' + byte.toString(8).padStart(3, '0');
    } else {
      // El resto se emite tal cual: los bytes altos son válidos en una cadena PDF
      // y la fuente los interpreta con /WinAnsiEncoding.
      out += String.fromCharCode(byte);
    }
  }
  return out;
}

/** Cadena PDF literal (con paréntesis) a partir de texto Unicode. */
function pdfString(str) {
  return '(' + escapePdfBytes(encodeWinAnsi(str)) + ')';
}

/**
 * Cadena para el diccionario /Info. Las cadenas de texto del documento se
 * interpretan como PDFDocEncoding, no como WinAnsi, así que fuera de ASCII se
 * usa una cadena hexadecimal UTF-16BE con BOM (admitida desde PDF 1.4).
 */
function pdfInfoString(str) {
  const text = String(str == null ? '' : str);
  if (/^[\x20-\x7e]*$/.test(text)) return pdfString(text);
  let hex = 'FEFF';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xffff) {
      hex += cp.toString(16).toUpperCase().padStart(4, '0');
    } else {
      const value = cp - 0x10000;
      hex += (0xd800 + (value >> 10)).toString(16).toUpperCase().padStart(4, '0');
      hex += (0xdc00 + (value & 0x3ff)).toString(16).toUpperCase().padStart(4, '0');
    }
  }
  return `<${hex}>`;
}

// --- Utilidades internas ----------------------------------------------------

/** Convierte una cadena "binaria" (charCode = byte) a Uint8Array. */
function latin1Bytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

/** Convierte bytes a cadena con charCode = byte (para inspeccionar el PDF). */
function latin1String(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Número para el stream: máximo 3 decimales, sin notación científica. */
function fmt(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`valor numérico no finito: ${value}`);
  }
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Número obligatorio (lanza si no es finito). */
function requireNumber(value, label) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label}: se esperaba un número finito`);
  }
  return number;
}

/** Número opcional con valor por defecto. */
function optionalNumber(value, fallback, label) {
  if (value == null) return fallback;
  return requireNumber(value, label);
}

/** Redondea a 3 decimales (para reutilizar recursos de opacidad). */
function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/** `fill`/`stroke` con valor falsy o 'none' se interpreta como "sin pintar". */
function paintValue(value) {
  if (value == null || value === false) return null;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '' || normalized === 'none' || normalized === 'transparent') {
      return null;
    }
  }
  return value;
}

// --- Tamaño, márgenes, fuentes ---------------------------------------------

function resolvePageSize(size, landscape) {
  let width;
  let height;
  if (typeof size === 'string') {
    const found = PAGE_SIZES[size] || PAGE_SIZES[size.toUpperCase()] || null;
    if (!found) throw new RangeError(`tamaño de página desconocido: ${size}`);
    width = found.width;
    height = found.height;
  } else if (size && typeof size === 'object') {
    width = requireNumber(size.width, 'size.width');
    height = requireNumber(size.height, 'size.height');
    if (!(width > 0) || !(height > 0)) {
      throw new RangeError('size.width y size.height deben ser positivos');
    }
  } else if (size == null) {
    width = PAGE_SIZES.A4.width;
    height = PAGE_SIZES.A4.height;
  } else {
    throw new TypeError('size no válido: usa un nombre de PAGE_SIZES o {width,height}');
  }
  if (landscape && height > width) {
    const tmp = width;
    width = height;
    height = tmp;
  }
  return { width, height };
}

function resolveMargin(margin, fallback) {
  const value = optionalNumber(margin, fallback, 'margin');
  if (value < 0) throw new RangeError('margin no puede ser negativo');
  return value;
}

function fontName(font) {
  if (!font) return 'Helvetica';
  if (FONT_ALIASES[font]) return FONT_ALIASES[font];
  if (FONT_ORDER.includes(font)) return font;
  return 'Helvetica';
}

function fontResource(name) {
  const index = FONT_ORDER.indexOf(name);
  return `F${index < 0 ? 1 : index + 1}`;
}

// --- Estilos -----------------------------------------------------------------

/** Normaliza un estilo de texto y valida sus números. */
function textStyle(style) {
  const s = style && typeof style === 'object' ? style : {};
  const size = optionalNumber(s.size, 11, 'text.size');
  if (!(size > 0)) throw new RangeError('text.size debe ser mayor que 0');
  // `s.name` hace que textStyle sea idempotente (text() mide con el estilo ya normalizado).
  const name = FONT_ORDER.includes(s.name) ? s.name : fontName(s.font);
  const align = s.align === 'center' || s.align === 'right' ? s.align : 'left';
  const baseline = ['top', 'middle', 'bottom', 'alphabetic'].includes(s.baseline)
    ? s.baseline
    : 'top';
  let maxWidth = null;
  if (s.maxWidth != null) {
    maxWidth = s.maxWidth === Infinity ? Infinity : optionalNumber(s.maxWidth, null, 'text.maxWidth');
    if (maxWidth != null && maxWidth < 0) throw new RangeError('text.maxWidth no puede ser negativo');
  }
  const lineHeight = optionalNumber(s.lineHeight, 1.35, 'text.lineHeight');
  if (!(lineHeight > 0)) throw new RangeError('text.lineHeight debe ser mayor que 0');
  let maxLines = null;
  if (s.maxLines != null) {
    maxLines = Math.floor(optionalNumber(s.maxLines, 0, 'text.maxLines'));
    if (!(maxLines >= 1)) throw new RangeError('text.maxLines debe ser >= 1');
  }
  return {
    name,
    resource: fontResource(name),
    size,
    color: paintValue(s.color) ?? DEFAULT_INK,
    align,
    baseline,
    maxWidth,
    lineHeight,
    maxLines,
    opacity: s.opacity,
    fillOpacity: s.fillOpacity,
    strokeOpacity: s.strokeOpacity,
  };
}

/** Estilo de relleno/contorno con los valores por defecto de la primitiva. */
function resolveShapeStyle(style, defaults) {
  const s = style && typeof style === 'object' ? style : {};
  const explicitFill = paintValue(s.fill);
  const explicitStroke = paintValue(s.stroke);
  const hasExplicitPaint = explicitFill != null || explicitStroke != null;
  return {
    ...s,
    fill: hasExplicitPaint ? explicitFill : defaults.fill,
    stroke: hasExplicitPaint ? explicitStroke : defaults.stroke,
    lineWidth: optionalNumber(s.lineWidth, defaults.lineWidth ?? 1, 'lineWidth'),
  };
}

/** Estilo de trazo (líneas abiertas): `fill` no pinta área por defecto. */
function resolveStrokeStyle(style, defaults) {
  const s = style && typeof style === 'object' ? style : {};
  return {
    ...s,
    fill: paintValue(s.fill),
    stroke:
      s.stroke === undefined ? (defaults.stroke ?? null) : paintValue(s.stroke),
    lineWidth: optionalNumber(s.lineWidth, defaults.lineWidth ?? 1, 'lineWidth'),
  };
}

// --- Color -------------------------------------------------------------------

/** Convierte '#rgb', '#rrggbb' o [r,g,b] (0-255) a [r,g,b] normalizado. */
function parseColor(color) {
  if (Array.isArray(color) && color.length >= 3) {
    return color.slice(0, 3).map((channel) => {
      const value = requireNumber(channel, 'color[]');
      return Math.min(255, Math.max(0, value)) / 255;
    });
  }
  if (typeof color === 'string') {
    let hex = color.trim();
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    }
  }
  return null;
}

/** Operador de color listo para el stream: `r g b` (sin el `rg`/`RG` final). */
function colorKey(color) {
  const rgb = parseColor(color) || parseColor(DEFAULT_INK);
  return `${fmt(rgb[0])} ${fmt(rgb[1])} ${fmt(rgb[2])}`;
}

// --- Guionado (dash) ---------------------------------------------------------

/** Normaliza `dash` a la lista de números del operador `d`; '' = línea sólida. */
function dashSpec(dash) {
  if (dash == null || dash === false) return '';
  if (typeof dash === 'string') {
    const normalized = dash.trim().toLowerCase();
    if (normalized === '' || normalized === 'none' || normalized === 'solid' || normalized === '[] 0') {
      return '';
    }
  }
  let parts;
  if (Array.isArray(dash)) {
    parts = dash.map((value) => requireNumber(value, 'dash[]'));
  } else if (typeof dash === 'string') {
    parts = dash
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((value) => requireNumber(value, 'dash'));
  } else {
    return '';
  }
  parts = parts.filter((value) => value >= 0).map(round3);
  if (!parts.length || parts.every((value) => value === 0)) return '';
  return parts.map(fmt).join(' ');
}

const CAP_CODES = Object.freeze({ butt: 0, round: 1, square: 2 });
const JOIN_CODES = Object.freeze({ miter: 0, round: 1, bevel: 2 });

// --- Estado gráfico ----------------------------------------------------------

/** Estado gráfico inicial de un content stream (coincide con los valores PDF). */
function initialGraphicsState() {
  return {
    fill: '0 0 0',
    stroke: '0 0 0',
    lineWidth: 1,
    cap: 0,
    join: 0,
    dash: '',
    gs: 0,
    font: null,
  };
}

// --- Texto -------------------------------------------------------------------

/** Posición vertical (coordenada de API) de la línea base del texto. */
function baselineY(y, style) {
  switch (style.baseline) {
    case 'top':
      return y + style.size * ASCENT;
    case 'middle':
      // Centro de la caja tipográfica (ascendente + descendente) sobre `y`.
      return y + (style.size * (ASCENT - DESCENT)) / 2;
    case 'bottom':
      return y - style.size * DESCENT;
    case 'alphabetic':
    default:
      return y;
  }
}

/** Anchura de un texto en puntos, con las métricas reales de afm.js. */
function measureText(str, style) {
  const s = textStyle(style);
  const codes = encodeWinAnsi(str == null ? '' : str);
  return (encodedWidth(codes, s.name) / 1000) * s.size;
}

/** Parte un texto en líneas que no superen `maxWidth` (medido con measureText). */
function wrapText(str, maxWidth, style) {
  const s = textStyle(style);
  const content = str == null ? '' : String(str);
  let limit = Infinity;
  if (maxWidth != null && maxWidth !== Infinity) {
    limit = requireNumber(maxWidth, 'wrapText.maxWidth');
  }
  const paragraphs = content.split(/\r\n|\r|\n/);
  if (limit === Infinity) return paragraphs.slice();
  if (!(limit > 0)) return [content];

  const measure = (text) => measureText(text, s);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (measure(candidate) <= limit + 1e-9) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = '';
      }
      if (measure(word) <= limit + 1e-9) {
        current = word;
        continue;
      }
      // Palabra más ancha que la caja: se parte por puntos de código.
      let chunk = '';
      for (const ch of word) {
        const test = chunk + ch;
        if (!chunk || measure(test) <= limit + 1e-9) {
          chunk = test;
        } else {
          lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

/** ¿Cabe `str` en `maxWidth` con el estilo indicado? */
function fits(str, maxWidth, style) {
  if (maxWidth == null || maxWidth === Infinity) return true;
  const limit = requireNumber(maxWidth, 'fits.maxWidth');
  return measureText(str, style) <= limit + 1e-6;
}

// =============================================================================
// Documento
// =============================================================================

class PdfDocument {
  /** @param {object} [options] */
  constructor(options = {}) {
    const o = options && typeof options === 'object' ? options : {};
    this._meta = {
      title: o.title == null ? '' : String(o.title),
      author: o.author == null ? '' : String(o.author),
      subject: o.subject == null ? '' : String(o.subject),
      creator: o.creator == null ? 'FlagPlays' : String(o.creator),
    };
    this._creationDate = buildPdfDate(new Date());
    this._defaultSize = o.size == null ? 'A4' : o.size;
    this._defaultLandscape = !!o.landscape;
    this._defaultMargin = resolveMargin(o.margin, 36);
    /** @type {{size:{width:number,height:number}, margin:number, ops:string[], state:object}[]} */
    this._pages = [];
    this._current = 0;
    // Recursos /ExtGState: índice 0 = opacidad total (estado por defecto).
    this._gsStates = [{ ca: 1, CA: 1 }];
    this._gsLookup = new Map([['1/1', 0]]);
    this._stateStack = [];
    const size = resolvePageSize(this._defaultSize, this._defaultLandscape);
    this._pages.push(this._createPage(size, this._defaultMargin));
  }

  get pageCount() {
    return this._pages.length;
  }

  get width() {
    return this._page().size.width;
  }

  get height() {
    return this._page().size.height;
  }

  get margin() {
    return this._page().margin;
  }

  // -- páginas ---------------------------------------------------------------

  /** Añade una página y la activa. Devuelve su número (1-based). */
  addPage(opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const size = resolvePageSize(
      o.size == null ? this._defaultSize : o.size,
      o.landscape == null ? this._defaultLandscape : !!o.landscape,
    );
    const margin = resolveMargin(o.margin, this._defaultMargin);
    this._pages.push(this._createPage(size, margin));
    this._current = this._pages.length - 1;
    this._stateStack = [];
    return this._pages.length;
  }

  /** Activa una página existente (1-based). */
  setPage(n) {
    if (!Number.isInteger(n) || n < 1 || n > this._pages.length) {
      throw new RangeError(`setPage: página fuera de rango (${n}); hay ${this._pages.length}`);
    }
    this._current = n - 1;
    this._stateStack = [];
    return this;
  }

  // -- estado gráfico --------------------------------------------------------

  /** Guarda el estado gráfico actual (operador `q`). */
  saveState() {
    this._stateStack.push({ ...this._page().state });
    this._page().ops.push('q');
    return this;
  }

  /** Restaura el último estado guardado (operador `Q`). */
  restoreState() {
    if (!this._stateStack.length) {
      throw new Error('restoreState() sin un saveState() previo');
    }
    const state = this._stateStack.pop();
    this._page().ops.push('Q');
    Object.assign(this._page().state, state);
    return this;
  }

  /** Traslada el sistema de coordenadas actual; `y` crece hacia abajo. */
  translate(x, y) {
    const dx = requireNumber(x, 'translate.x');
    const dy = requireNumber(y, 'translate.y');
    this._page().ops.push(`1 0 0 1 ${fmt(dx)} ${fmt(-dy)} cm`);
    return this;
  }

  /** Rota el sistema actual `deg` grados (positivo = sentido horario visual). */
  rotate(deg, cx, cy) {
    const angle = requireNumber(deg, 'rotate.deg');
    const page = this._page();
    const rad = (angle * Math.PI) / 180;
    const a = Math.cos(rad);
    const b = -Math.sin(rad);
    const c = Math.sin(rad);
    const d = Math.cos(rad);
    let e = 0;
    let f = 0;
    if (cx != null || cy != null) {
      const apiCx = requireNumber(cx, 'rotate.cx');
      const apiCy = requireNumber(cy, 'rotate.cy');
      const px = apiCx;
      const py = page.size.height - apiCy;
      e = px - (a * px + c * py);
      f = py - (b * px + d * py);
    }
    page.ops.push(`${fmt(a)} ${fmt(b)} ${fmt(c)} ${fmt(d)} ${fmt(e)} ${fmt(f)} cm`);
    return this;
  }

  // -- primitivas ------------------------------------------------------------

  /** Rectángulo desde su esquina superior izquierda; admite radio y opacidad. */
  rect(x, y, width, height, style) {
    const s = resolveShapeStyle(style, { fill: DEFAULT_INK, stroke: null });
    this._applyPaintStyles(s);
    const x0 = requireNumber(x, 'rect.x');
    const y0 = requireNumber(y, 'rect.y');
    const w = requireNumber(width, 'rect.width');
    const h = requireNumber(height, 'rect.height');
    const radius = Math.max(0, optionalNumber(s.radius, 0, 'rect.radius'));
    const left = Math.min(x0, x0 + w);
    const right = Math.max(x0, x0 + w);
    const top = Math.min(y0, y0 + h);
    const bottom = Math.max(y0, y0 + h);
    const r = Math.min(radius, (right - left) / 2, (bottom - top) / 2);
    if (r > 0) {
      this._roundedRectPath(left, top, right, bottom, r);
    } else {
      const page = this._page();
      page.ops.push(
        `${fmt(left)} ${fmt(page.size.height - bottom)} ${fmt(right - left)} ${fmt(bottom - top)} re`,
      );
    }
    this._paint(s);
    return this;
  }

  /** Círculo centrado en (cx, cy). */
  circle(cx, cy, r, style) {
    const radius = Math.abs(requireNumber(r, 'circle.r'));
    return this.ellipse(cx, cy, radius, radius, style);
  }

  /** Elipse centrada en (cx, cy) con radios rx/ry. */
  ellipse(cx, cy, rx, ry, style) {
    const s = resolveShapeStyle(style, { fill: DEFAULT_INK, stroke: null });
    this._applyPaintStyles(s);
    const cxN = requireNumber(cx, 'ellipse.cx');
    const cyN = requireNumber(cy, 'ellipse.cy');
    const rxN = Math.abs(requireNumber(rx, 'ellipse.rx'));
    const ryN = Math.abs(requireNumber(ry, 'ellipse.ry'));
    const kx = rxN * CIRCLE_K;
    const ky = ryN * CIRCLE_K;
    this._moveTo(cxN + rxN, cyN);
    this._curveTo(cxN + rxN, cyN - ky, cxN + kx, cyN - ryN, cxN, cyN - ryN);
    this._curveTo(cxN - kx, cyN - ryN, cxN - rxN, cyN - ky, cxN - rxN, cyN);
    this._curveTo(cxN - rxN, cyN + ky, cxN - kx, cyN + ryN, cxN, cyN + ryN);
    this._curveTo(cxN + kx, cyN + ryN, cxN + rxN, cyN + ky, cxN + rxN, cyN);
    this._closePath();
    this._paint(s);
    return this;
  }

  /** Segmento recto. */
  line(x1, y1, x2, y2, style) {
    const s = resolveStrokeStyle(style, { stroke: DEFAULT_INK });
    this._applyPaintStyles(s);
    const ax = requireNumber(x1, 'line.x1');
    const ay = requireNumber(y1, 'line.y1');
    const bx = requireNumber(x2, 'line.x2');
    const by = requireNumber(y2, 'line.y2');
    this._moveTo(ax, ay);
    this._lineTo(bx, by);
    this._paint(s);
    if (s.arrowEnd) this._drawArrow(bx, by, ax, ay, s);
    return this;
  }

  /** Polilínea abierta; admite `close`, `arrowEnd` y relleno opcional. */
  polyline(points, style) {
    const list = normalizePoints(points);
    if (list.length < 2) return this;
    const s = style && style.close
      ? resolveShapeStyle(style, { fill: DEFAULT_INK, stroke: null })
      : resolveStrokeStyle(style, { stroke: DEFAULT_INK });
    this._applyPaintStyles(s);
    this._moveTo(list[0].x, list[0].y);
    for (let i = 1; i < list.length; i++) this._lineTo(list[i].x, list[i].y);
    if (style && style.close) this._closePath();
    this._paint(s);
    if (s.arrowEnd && !(style && style.close)) {
      const tip = list[list.length - 1];
      const prev = list[list.length - 2];
      this._drawArrow(tip.x, tip.y, prev.x, prev.y, s);
    }
    return this;
  }

  /** Polígono cerrado. */
  polygon(points, style) {
    return this.polyline(points, { ...(style || {}), close: true });
  }

  // -- texto -----------------------------------------------------------------

  /**
   * Dibuja una línea de texto. `y` es la referencia vertical según `baseline`
   * ('top' por defecto) y `maxWidth` define la caja de alineación.
   * Devuelve la anchura medida del texto en puntos.
   */
  text(str, x, y, style) {
    const s = textStyle(style);
    const content = str == null ? '' : String(str);
    const page = this._page();
    const width = measureText(content, s);
    const boxWidth = s.maxWidth ?? width;
    let startX = requireNumber(x, 'text.x');
    if (s.align === 'center') startX += (boxWidth - width) / 2;
    else if (s.align === 'right') startX += boxWidth - width;
    const baseY = baselineY(requireNumber(y, 'text.y'), s);
    this._applyOpacity(s);
    this._ensureColor('fill', s.color);
    page.ops.push('BT');
    this._ensureFont(s);
    page.ops.push(`1 0 0 1 ${fmt(startX)} ${fmt(page.size.height - baseY)} Tm`);
    page.ops.push(`(${escapePdfBytes(encodeWinAnsi(content))}) Tj`);
    page.ops.push('ET');
    return width;
  }

  /** Anchura en puntos de un texto con el estilo indicado. */
  measureText(str, style) {
    return measureText(str, style);
  }

  /** Divide un texto en líneas que caben en `maxWidth`. */
  wrapText(str, maxWidth, style) {
    return wrapText(str, maxWidth, style);
  }

  /** ¿Cabe el texto en el ancho indicado? */
  fits(str, maxWidth, style) {
    return fits(str, maxWidth, style);
  }

  /**
   * Dibuja un bloque de texto multilínea. Devuelve el alto consumido en puntos
   * (`lineas * size * lineHeight`).
   */
  textBlock(str, x, y, style) {
    const s = textStyle(style);
    const lineAdvance = s.size * s.lineHeight;
    let lines = wrapText(str, s.maxWidth ?? Infinity, s);
    if (s.maxLines != null && lines.length > s.maxLines) lines = lines.slice(0, s.maxLines);
    const x0 = requireNumber(x, 'textBlock.x');
    const y0 = requireNumber(y, 'textBlock.y');
    const lineStyle = {
      font: s.name,
      size: s.size,
      color: s.color,
      align: s.align,
      baseline: 'top',
      maxWidth: s.maxWidth,
      opacity: s.opacity,
      fillOpacity: s.fillOpacity,
      strokeOpacity: s.strokeOpacity,
    };
    for (let i = 0; i < lines.length; i++) {
      this.text(lines[i], x0, y0 + i * lineAdvance, lineStyle);
    }
    return lines.length * lineAdvance;
  }

  // -- salida ----------------------------------------------------------------

  /** Serializa el documento a bytes (Uint8Array). */
  bytes() {
    return this._serialize();
  }

  /** Blob 'application/pdf'. */
  blob() {
    if (typeof Blob === 'undefined') {
      throw new Error('blob(): Blob no está disponible en este entorno');
    }
    return new Blob([this.bytes()], { type: 'application/pdf' });
  }

  /** Descarga el PDF con un <a download>; requiere DOM. */
  download(filename = 'flagplays.pdf') {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      throw new Error('download(): requiere un entorno con DOM');
    }
    const blob = this.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Comprobación estructural del PDF generado (xref, objetos, páginas, streams).
   * @param {Uint8Array|string} [data] PDF alternativo (para auditar ficheros).
   * @returns {{ok:boolean, errors:string[]}}
   */
  validate(data) {
    const errors = [];
    let bytes;
    if (data == null) {
      bytes = this.bytes();
    } else if (typeof data === 'string') {
      bytes = latin1Bytes(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else {
      return { ok: false, errors: ['validate(): se esperaba Uint8Array o string'] };
    }
    const text = latin1String(bytes);
    if (!text.startsWith('%PDF-')) errors.push('falta la cabecera %PDF-');
    if (!/%%EOF\s*$/.test(text)) errors.push('falta el marcador %%EOF al final');

    const startxref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
    if (!startxref) {
      errors.push('no se encuentra startxref');
      return { ok: false, errors };
    }
    const xrefOffset = Number(startxref[1]);
    if (!(xrefOffset > 0 && xrefOffset < text.length)) {
      errors.push(`startxref fuera del fichero (${xrefOffset})`);
      return { ok: false, errors };
    }
    const header = /^xref\s+(\d+)\s+(\d+)\s*\n/.exec(text.slice(xrefOffset));
    if (!header) {
      errors.push('startxref no apunta a una tabla xref');
      return { ok: false, errors };
    }
    const first = Number(header[1]);
    const total = Number(header[2]);
    if (first !== 0) errors.push('la tabla xref debe empezar en 0');
    const offsets = new Array(total).fill(-1);
    let cursor = xrefOffset + header[0].length;
    for (let n = 0; n < total; n++) {
      const entry = /^(\d{10}) (\d{5}) ([nf]) \n$/.exec(text.slice(cursor, cursor + 20));
      if (!entry) {
        errors.push(`entrada xref ${n} mal formada`);
        break;
      }
      offsets[n] = Number(entry[1]);
      if (n === 0 && entry[3] !== 'f') errors.push('la entrada 0 del xref debe ser libre');
      if (n > 0 && entry[3] !== 'n') errors.push(`la entrada ${n} del xref está marcada como libre`);
      cursor += 20;
    }

    const trailerIndex = text.indexOf('trailer', cursor);
    if (trailerIndex < 0) {
      errors.push('no se encuentra el trailer');
      return { ok: false, errors };
    }
    const trailerText = text.slice(trailerIndex, trailerIndex + 400);
    const sizeMatch = /\/Size\s+(\d+)/.exec(trailerText);
    const rootMatch = /\/Root\s+(\d+)\s+0\s+R/.exec(trailerText);
    if (!sizeMatch) errors.push('el trailer no tiene /Size');
    if (!rootMatch) errors.push('el trailer no tiene /Root');
    if (sizeMatch && Number(sizeMatch[1]) !== total) {
      errors.push(`/Size ${sizeMatch[1]} no coincide con la tabla xref (${total})`);
    }

    for (let n = 1; n < total; n++) {
      if (offsets[n] < 0) continue;
      if (!text.startsWith(`${n} 0 obj`, offsets[n])) {
        errors.push(`el offset del objeto ${n} no apunta a "${n} 0 obj"`);
      }
    }

    const bodyOf = (n) => {
      const start = offsets[n];
      if (start < 0) return '';
      const end = n + 1 < total ? offsets[n + 1] : xrefOffset;
      return text.slice(start, end);
    };

    const catalogBody = rootMatch ? bodyOf(Number(rootMatch[1])) : '';
    if (!catalogBody.includes('/Type /Catalog')) errors.push('el catálogo no es /Type /Catalog');
    const pagesRef = /\/Pages\s+(\d+)\s+0\s+R/.exec(catalogBody);
    if (!pagesRef) {
      errors.push('el catálogo no referencia /Pages');
    } else {
      const pagesBody = bodyOf(Number(pagesRef[1]));
      if (!pagesBody.includes('/Type /Pages')) errors.push('/Pages no es /Type /Pages');
      const kidsMatch = /\/Kids\s*\[([^\]]*)\]/.exec(pagesBody);
      const countMatch = /\/Count\s+(\d+)/.exec(pagesBody);
      if (!kidsMatch) errors.push('/Pages no tiene /Kids');
      if (!countMatch) errors.push('/Pages no tiene /Count');
      const pageObjects = [];
      for (let n = 1; n < total; n++) {
        const body = bodyOf(n);
        if (/\/Type\s+\/Page(?!s)/.test(body)) pageObjects.push(n);
      }
      if (countMatch && Number(countMatch[1]) !== pageObjects.length) {
        errors.push(`/Count ${countMatch[1]} no coincide con las páginas reales (${pageObjects.length})`);
      }
      for (const n of pageObjects) {
        const body = bodyOf(n);
        const contents = /\/Contents\s+(\d+)\s+0\s+R/.exec(body);
        if (!contents) {
          errors.push(`la página (objeto ${n}) no tiene /Contents`);
          continue;
        }
        const streamBody = bodyOf(Number(contents[1]));
        const lengthMatch = /\/Length\s+(\d+)/.exec(streamBody);
        if (!lengthMatch) {
          errors.push(`el stream ${contents[1]} no tiene /Length`);
          continue;
        }
        if (streamBody.includes('/Filter')) {
          errors.push(`el stream ${contents[1]} está comprimido (no permitido)`);
        }
        const streamIndex = streamBody.indexOf('stream\n');
        const endIndex = streamBody.indexOf('\nendstream', streamIndex);
        if (streamIndex < 0 || endIndex < 0) {
          errors.push(`el stream ${contents[1]} está mal delimitado`);
          continue;
        }
        const streamData = streamBody.slice(streamIndex + 7, endIndex);
        if (streamData.length !== Number(lengthMatch[1])) {
          errors.push(
            `/Length del stream ${contents[1]} no coincide (${streamData.length} != ${lengthMatch[1]})`,
          );
        }
      }
    }
    return { ok: errors.length === 0, errors };
  }

  // -- internos --------------------------------------------------------------

  _page() {
    return this._pages[this._current];
  }

  _createPage(size, margin) {
    return {
      size: { width: size.width, height: size.height },
      margin,
      ops: [],
      state: initialGraphicsState(),
    };
  }

  _registerGs(ca, CA) {
    const key = `${ca}/${CA}`;
    const existing = this._gsLookup.get(key);
    if (existing !== undefined) return existing;
    const index = this._gsStates.length;
    this._gsStates.push({ ca, CA });
    this._gsLookup.set(key, index);
    return index;
  }

  _applyOpacity(style) {
    const page = this._page();
    const base = style.opacity;
    const ca = clamp01(
      round3(style.fillOpacity != null ? style.fillOpacity : base != null ? base : 1),
    );
    const CA = clamp01(
      round3(style.strokeOpacity != null ? style.strokeOpacity : base != null ? base : 1),
    );
    const index = this._registerGs(ca, CA);
    if (page.state.gs !== index) {
      page.ops.push(`/GS${index + 1} gs`);
      page.state.gs = index;
    }
  }

  _ensureColor(channel, color) {
    const page = this._page();
    const key = colorKey(color);
    if (page.state[channel] !== key) {
      page.ops.push(`${key} ${channel === 'fill' ? 'rg' : 'RG'}`);
      page.state[channel] = key;
    }
  }

  _ensureLine(style) {
    const page = this._page();
    const lineWidth = optionalNumber(style.lineWidth, 1, 'lineWidth');
    if (!(lineWidth >= 0)) throw new RangeError('lineWidth no puede ser negativo');
    if (page.state.lineWidth !== lineWidth) {
      page.ops.push(`${fmt(lineWidth)} w`);
      page.state.lineWidth = lineWidth;
    }
    const cap = CAP_CODES[style.lineCap] ?? 0;
    if (page.state.cap !== cap) {
      page.ops.push(`${cap} J`);
      page.state.cap = cap;
    }
    const join = JOIN_CODES[style.lineJoin] ?? 0;
    if (page.state.join !== join) {
      page.ops.push(`${join} j`);
      page.state.join = join;
    }
    const dash = dashSpec(style.dash);
    if (page.state.dash !== dash) {
      page.ops.push(dash ? `[${dash}] 0 d` : '[] 0 d');
      page.state.dash = dash;
    }
  }

  _ensureFont(style) {
    const page = this._page();
    const key = `${style.resource}/${style.size}`;
    if (page.state.font !== key) {
      page.ops.push(`/${style.resource} ${fmt(style.size)} Tf`);
      page.state.font = key;
    }
  }

  _applyPaintStyles(style) {
    this._applyOpacity(style);
    if (style.fill != null) this._ensureColor('fill', style.fill);
    if (style.stroke != null) this._ensureColor('stroke', style.stroke);
    this._ensureLine(style);
  }

  _paint(style) {
    const page = this._page();
    const hasFill = style.fill != null;
    const hasStroke = style.stroke != null;
    if (hasFill && hasStroke) page.ops.push('B');
    else if (hasFill) page.ops.push('f');
    else if (hasStroke) page.ops.push('S');
    else page.ops.push('n');
  }

  _point(x, y) {
    const page = this._page();
    return `${fmt(x)} ${fmt(page.size.height - y)}`;
  }

  _moveTo(x, y) {
    this._page().ops.push(`${this._point(x, y)} m`);
  }

  _lineTo(x, y) {
    this._page().ops.push(`${this._point(x, y)} l`);
  }

  _curveTo(c1x, c1y, c2x, c2y, x, y) {
    this._page().ops.push(
      `${this._point(c1x, c1y)} ${this._point(c2x, c2y)} ${this._point(x, y)} c`,
    );
  }

  _closePath() {
    this._page().ops.push('h');
  }

  _roundedRectPath(left, top, right, bottom, r) {
    const k = r * CIRCLE_K;
    this._moveTo(left + r, top);
    this._lineTo(right - r, top);
    this._curveTo(right - r + k, top, right, top + r - k, right, top + r);
    this._lineTo(right, bottom - r);
    this._curveTo(right, bottom - r + k, right - r + k, bottom, right - r, bottom);
    this._lineTo(left + r, bottom);
    this._curveTo(left + r - k, bottom, left, bottom - r + k, left, bottom - r);
    this._lineTo(left, top + r);
    this._curveTo(left, top + r - k, left + r - k, top, left + r, top);
    this._closePath();
  }

  _drawArrow(tipX, tipY, fromX, fromY, style) {
    const dx = tipX - fromX;
    const dy = tipY - fromY;
    const length = Math.hypot(dx, dy);
    if (!(length > 0.001)) return;
    const lineWidth = optionalNumber(style.lineWidth, 1, 'arrow.lineWidth');
    const size = style.arrowSize == null
      ? Math.max(5, lineWidth * 3.5)
      : requireNumber(style.arrowSize, 'arrowSize');
    const half = size * 0.45;
    const ux = dx / length;
    const uy = dy / length;
    const baseX = tipX - ux * size;
    const baseY = tipY - uy * size;
    const color = paintValue(style.arrowFill) ?? paintValue(style.stroke) ?? DEFAULT_INK;
    this._applyOpacity(style);
    this._ensureColor('fill', color);
    this._moveTo(tipX, tipY);
    this._lineTo(baseX - uy * half, baseY + ux * half);
    this._lineTo(baseX + uy * half, baseY - ux * half);
    this._closePath();
    this._paint({ fill: color, stroke: null });
  }

  _serialize() {
    const pages = this._pages;
    let next = 1;
    const catalogNum = next++;
    const pagesNum = next++;
    const fontNums = FONT_ORDER.map(() => next++);
    const infoNum = next++;
    const gsNums = this._gsStates.map(() => next++);
    const pageEntries = pages.map(() => ({ page: next++, content: next++ }));
    const total = next - 1;
    const body = new Array(total + 1);

    body[catalogNum] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
    body[pagesNum] =
      `<< /Type /Pages /Kids [${pageEntries.map((e) => `${e.page} 0 R`).join(' ')}]` +
      ` /Count ${pages.length} >>`;
    FONT_ORDER.forEach((name, index) => {
      body[fontNums[index]] =
        `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
    });
    body[infoNum] = this._infoDict();
    this._gsStates.forEach((state, index) => {
      body[gsNums[index]] =
        `<< /Type /ExtGState /ca ${fmt(state.ca)} /CA ${fmt(state.CA)} >>`;
    });
    const fontResources = FONT_ORDER.map(
      (name, index) => `/${fontResource(name)} ${fontNums[index]} 0 R`,
    ).join(' ');
    const gsResources = gsNums.map((num, index) => `/GS${index + 1} ${num} 0 R`).join(' ');
    pageEntries.forEach((entry, index) => {
      const page = pages[index];
      body[entry.page] =
        `<< /Type /Page /Parent ${pagesNum} 0 R` +
        ` /MediaBox [0 0 ${fmt(page.size.width)} ${fmt(page.size.height)}]` +
        ` /Resources << /Font << ${fontResources} >> /ExtGState << ${gsResources} >> >>` +
        ` /Contents ${entry.content} 0 R >>`;
      const data = page.ops.join('\n');
      body[entry.content] = `<< /Length ${data.length} >>\nstream\n${data}\nendstream`;
    });

    let out = '%PDF-1.4\n';
    // Comentario binario: marca el fichero como binario para herramientas externas.
    out += '%\xE2\xE3\xCF\xD3\n';
    const offsets = new Array(total + 1).fill(0);
    for (let n = 1; n <= total; n++) {
      offsets[n] = out.length;
      out += `${n} 0 obj\n${body[n]}\nendobj\n`;
    }
    const xrefStart = out.length;
    out += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= total; n++) {
      out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    }
    out +=
      `trailer\n<< /Size ${total + 1} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\n` +
      `startxref\n${xrefStart}\n%%EOF\n`;
    return latin1Bytes(out);
  }

  _infoDict() {
    const entries = [];
    if (this._meta.title) entries.push(`/Title ${pdfInfoString(this._meta.title)}`);
    if (this._meta.author) entries.push(`/Author ${pdfInfoString(this._meta.author)}`);
    if (this._meta.subject) entries.push(`/Subject ${pdfInfoString(this._meta.subject)}`);
    if (this._meta.creator) entries.push(`/Creator ${pdfInfoString(this._meta.creator)}`);
    entries.push(`/Producer ${pdfInfoString('FlagPlays')}`);
    entries.push(`/CreationDate (${this._creationDate})`);
    return `<< ${entries.join(' ')} >>`;
  }
}

/** Fecha PDF (D:AAAAMMDDHHmmSS) en hora local. */
function buildPdfDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `D:${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Normaliza una lista de puntos [{x,y}] validando sus coordenadas. */
function normalizePoints(points) {
  if (!Array.isArray(points)) throw new TypeError('points debe ser un array de {x,y}');
  return points.map((point, index) => {
    if (!point || typeof point !== 'object') {
      throw new TypeError(`points[${index}] debe ser un objeto {x,y}`);
    }
    return {
      x: requireNumber(point.x, `points[${index}].x`),
      y: requireNumber(point.y, `points[${index}].y`),
    };
  });
}

/**
 * Crea un documento PDF.
 * @param {{size?:string|{width:number,height:number}, landscape?:boolean, margin?:number,
 *          title?:string, author?:string, subject?:string, creator?:string, compress?:boolean}} [options]
 * @returns {PdfDocument}
 */
export function createPdf(options = {}) {
  return new PdfDocument(options);
}
