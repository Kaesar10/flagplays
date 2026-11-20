// Genera src/afm.js con las anchuras (1/1000 em) de Helvetica para los códigos
// WinAnsi 32..255. Se ejecuta a mano: node tools/gen-afm.mjs
import { readFileSync, writeFileSync } from 'node:fs';

// Glyph name -> código WinAnsi para los caracteres que no traen código en el AFM.
const WINANSI = {
  32: 'space', 33: 'exclam', 34: 'quotedbl', 35: 'numbersign', 36: 'dollar', 37: 'percent',
  38: 'ampersand', 39: 'quotesingle', 40: 'parenleft', 41: 'parenright', 42: 'asterisk',
  43: 'plus', 44: 'comma', 45: 'hyphen', 46: 'period', 47: 'slash', 48: 'zero', 49: 'one',
  50: 'two', 51: 'three', 52: 'four', 53: 'five', 54: 'six', 55: 'seven', 56: 'eight',
  57: 'nine', 58: 'colon', 59: 'semicolon', 60: 'less', 61: 'equal', 62: 'greater',
  63: 'question', 64: 'at', 91: 'bracketleft', 92: 'backslash', 93: 'bracketright',
  94: 'asciicircum', 95: 'underscore', 96: 'grave', 123: 'braceleft', 124: 'bar',
  125: 'braceright', 126: 'asciitilde',
  128: 'Euro', 130: 'quotesinglbase', 131: 'florin', 132: 'quotedblbase', 133: 'ellipsis',
  134: 'dagger', 135: 'daggerdbl', 136: 'circumflex', 137: 'perthousand', 138: 'Scaron',
  139: 'guilsinglleft', 140: 'OE', 142: 'Zcaron', 145: 'quoteleft', 146: 'quoteright',
  147: 'quotedblleft', 148: 'quotedblright', 149: 'bullet', 150: 'endash', 151: 'emdash',
  152: 'tilde', 153: 'trademark', 154: 'scaron', 155: 'guilsinglright', 156: 'oe',
  158: 'zcaron', 159: 'Ydieresis', 160: 'space',
  161: 'exclamdown', 162: 'cent', 163: 'sterling', 164: 'currency', 165: 'yen',
  166: 'brokenbar', 167: 'section', 168: 'dieresis', 169: 'copyright', 170: 'ordfeminine',
  171: 'guillemotleft', 172: 'logicalnot', 173: 'hyphen', 174: 'registered', 175: 'macron',
  176: 'degree', 177: 'plusminus', 178: 'twosuperior', 179: 'threesuperior', 180: 'acute',
  181: 'mu', 182: 'paragraph', 183: 'periodcentered', 184: 'cedilla', 185: 'onesuperior',
  186: 'ordmasculine', 187: 'guillemotright', 188: 'onequarter', 189: 'onehalf',
  190: 'threequarters', 191: 'questiondown',
  192: 'Agrave', 193: 'Aacute', 194: 'Acircumflex', 195: 'Atilde', 196: 'Adieresis',
  197: 'Aring', 198: 'AE', 199: 'Ccedilla', 200: 'Egrave', 201: 'Eacute', 202: 'Ecircumflex',
  203: 'Edieresis', 204: 'Igrave', 205: 'Iacute', 206: 'Icircumflex', 207: 'Idieresis',
  208: 'Eth', 209: 'Ntilde', 210: 'Ograve', 211: 'Oacute', 212: 'Ocircumflex', 213: 'Otilde',
  214: 'Odieresis', 215: 'multiply', 216: 'Oslash', 217: 'Ugrave', 218: 'Uacute',
  219: 'Ucircumflex', 220: 'Udieresis', 221: 'Yacute', 222: 'Thorn', 223: 'germandbls',
  224: 'agrave', 225: 'aacute', 226: 'acircumflex', 227: 'atilde', 228: 'adieresis',
  229: 'aring', 230: 'ae', 231: 'ccedilla', 232: 'egrave', 233: 'eacute', 234: 'ecircumflex',
  235: 'edieresis', 236: 'igrave', 237: 'iacute', 238: 'icircumflex', 239: 'idieresis',
  240: 'eth', 241: 'ntilde', 242: 'ograve', 243: 'oacute', 244: 'ocircumflex', 245: 'otilde',
  246: 'odieresis', 247: 'divide', 248: 'oslash', 249: 'ugrave', 250: 'uacute',
  251: 'ucircumflex', 252: 'udieresis', 253: 'yacute', 254: 'thorn', 255: 'ydieresis',
};

const files = {
  Helvetica: 'tools/Helvetica.afm',
  'Helvetica-Bold': 'tools/Helvetica-Bold.afm',
  'Helvetica-Oblique': 'tools/Helvetica-Oblique.afm',
};

const out = {};
for (const [fontName, path] of Object.entries(files)) {
  const text = readFileSync(path, 'utf8');
  const byName = {};
  const byCode = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^C\s+(-?\d+)\s*;\s*WX\s+(-?\d+)\s*;\s*N\s+(\S+)\s*;/);
    if (!m) continue;
    const code = Number(m[1]);
    const wx = Number(m[2]);
    const name = m[3];
    byName[name] = wx;
    if (code >= 0) byCode[code] = wx;
  }
  const widths = {};
  let missing = [];
  for (let code = 32; code <= 255; code++) {
    // OJO: los códigos del AFM son AdobeStandardEncoding, no WinAnsi (p.ej. 241
    // es "ae" en el AFM y "ñ" en WinAnsi). Por eso manda el nombre del glifo.
    let w;
    const name = WINANSI[code];
    if (name && byName[name] !== undefined) w = byName[name];
    else w = byCode[code];
    if (w === undefined) {
      missing.push(code);
      w = 500;
    }
    widths[code] = w;
  }
  out[fontName] = widths;
  console.log(`${fontName}: ${Object.keys(byName).length} glifos, huecos=${missing.length}${missing.length ? ' -> ' + missing.slice(0, 12) : ''}`);
}

const body = Object.entries(out)
  .map(([font, widths]) => {
    const entries = Object.entries(widths).map(([c, w]) => `${c}:${w}`).join(',');
    return `  '${font}': {${entries}},`;
  })
  .join('\n');

const ts = `// Generado por tools/gen-afm.mjs a partir de las métricas AFM de Adobe Helvetica.
// Anchuras de glifo en milésimas de em (1/1000) indexadas por código WinAnsi.
// NO EDITAR A MANO.

export const FONT_ENCODING = 'WinAnsiEncoding';

/** @type {Record<string, Record<number, number>>} */
export const AFM_WIDTHS = {
${body}
};

const DEFAULT_WIDTH = 500;

/** Anchura de un carácter en milésimas de em. */
export function charWidth(code, font = 'Helvetica') {
  const table = AFM_WIDTHS[font] || AFM_WIDTHS.Helvetica;
  return table[code] ?? DEFAULT_WIDTH;
}

/** Anchura de una cadena ya codificada a WinAnsi (array de códigos). */
export function encodedWidth(codes, font = 'Helvetica') {
  let total = 0;
  for (const code of codes) total += charWidth(code, font);
  return total;
}
`;

writeFileSync('src/afm.js', ts);
console.log('escrito src/afm.js', ts.length, 'bytes');
