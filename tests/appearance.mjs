// Tests del sistema de apariencia y personalización (sin DOM).
import assert from 'node:assert/strict';
import {
  DEFAULT_APPEARANCE,
  FIELD_THEMES,
  PALETTE,
  SHAPES,
  ROUTE_STYLES,
  THEME_IDS,
  contrastInk,
  isHex,
  luminance,
  mixHex,
  normColor,
  normalizeAppearance,
  normalizePlayerStyle,
  resolvePlayerVisual,
  resolveRouteStyle,
  resolveTheme,
} from '../src/appearance.js';
import { createPlayer } from '../src/model.js';

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

// ---------- temas ----------
ok(THEME_IDS.length >= 6, 'hay al menos 6 temas de campo');
const REQUIRED_KEYS = [
  'apron', 'fieldA', 'fieldB', 'line', 'lineOp', 'los', 'offFill', 'offInk',
  'defFill', 'defInk', 'route', 'ball', 'select', 'oob',
];
for (const id of THEME_IDS) {
  const t = FIELD_THEMES[id];
  for (const k of REQUIRED_KEYS) ok(t[k] !== undefined, `tema ${id} define ${k}`);
  ok(typeof t.light === 'boolean', `tema ${id} declara light`);
  ok(typeof t.label === 'string' && t.label.length > 2, `tema ${id} tiene etiqueta`);
}

// ---------- normalización de apariencia ----------
const ap0 = normalizeAppearance(undefined);
ok(ap0.theme === 'turf', 'tema por defecto turf');
ok(ap0.shape === 'circle', 'forma por defecto círculo');
ok(ap0.showLabels === true, 'etiquetas activas por defecto');
ok(ap0.showNumbers === false, 'dorsales desactivados por defecto');
ok(ap0.offenseColor === null, 'sin color propio de ofensiva');

const apBad = normalizeAppearance({ theme: 'noexiste', shape: 'hexagono', playerSize: 99, routeWidth: -4, routeStyle: 'raro', offenseColor: '#zzz' });
ok(apBad.theme === 'turf', 'tema inválido cae al de por defecto');
ok(apBad.shape === 'circle', 'forma inválida cae a círculo');
ok(apBad.playerSize === 1.6, 'tamaño se acota al máximo');
ok(apBad.routeWidth === 0.6, 'grosor de ruta se acota al mínimo');
ok(apBad.routeStyle === 'solid', 'estilo de ruta inválido cae a continua');
ok(apBad.offenseColor === null, 'color inválido se descarta');

ok(normColor('#ABC') === '#aabbcc', 'hex corto se expande');
ok(normColor('#1F2E3D') === '#1f2e3d', 'hex se normaliza a minúsculas');
ok(normColor('rojo') === null, 'texto no es color');
ok(normColor('rgb(0,0,0)') === null, 'rgb() no se acepta');
ok(isHex('#123456') && !isHex('#12345'), 'isHex distingue longitudes');

// ---------- estilos de jugador ----------
const st = normalizePlayerStyle({ color: '#FF0000', shape: 'square', size: 99, routeStyle: 'dashed' });
ok(st.color === '#ff0000', 'color de jugador normalizado');
ok(st.shape === 'square', 'forma de jugador');
ok(st.size === 1.8, 'tamaño propio acotado');
ok(st.routeStyle === 'dashed', 'estilo de ruta propio');
ok(normalizePlayerStyle(null).color === null, 'estilo nulo no rompe');

// ---------- resolución de temas ----------
const th = resolveTheme(ap0, 'editor');
ok(th.fieldA === FIELD_THEMES.turf.fieldA, 'tema de editor usa la paleta elegida');

const apBlueprint = normalizeAppearance({ theme: 'blueprint', offenseColor: '#ffd166' });
const thB = resolveTheme(apBlueprint, 'editor');
ok(thB.fieldA === FIELD_THEMES.blueprint.fieldA, 'tema blueprint aplicado');
ok(thB.offFill === '#ffd166', 'color de ofensiva sobrescribe el tema');
ok(thB.offInk === contrastInk('#ffd166'), 'color de texto se recalcula por contraste');

const thPrint = resolveTheme(normalizeAppearance({ theme: 'turf' }), 'print');
ok(thPrint.light === true, 'en impresión se fuerza un tema claro');
ok(thPrint.apron === FIELD_THEMES.paper.apron, 'la impresión usa el tema papel');

const apNoZones = normalizeAppearance({ showZones: false });
ok(resolveTheme(apNoZones, 'editor').zone === 'none', 'las zonas se pueden desactivar');

// ---------- resolución por jugador ----------
const off = createPlayer({ team: 'offense', role: 'wr', label: 'X' });
const def = createPlayer({ team: 'defense', role: 'db', label: 'CB' });

const visOff = resolvePlayerVisual(off, ap0, th);
ok(visOff.isOffense === true, 'jugador ofensivo detectado');
ok(visOff.fill === th.offFill, 'sin estilo propio usa el color del equipo');
ok(visOff.shape === 'circle', 'sin estilo propio usa la forma global');

const custom = createPlayer({ team: 'offense', role: 'wr', style: { color: '#ff00ff', shape: 'diamond' } });
const visCustom = resolvePlayerVisual(custom, ap0, th);
ok(visCustom.fill === '#ff00ff', 'el color propio manda');
ok(visCustom.shape === 'diamond', 'la forma propia manda');
ok(visCustom.ink === contrastInk('#ff00ff'), 'el texto se adapta al color propio');

const visDef = resolvePlayerVisual(def, ap0, th);
ok(visDef.isOffense === false, 'jugador defensivo detectado');
ok(visDef.fill === th.defFill, 'defensa usa el color del tema');

const apUni = normalizeAppearance({ shape: 'triangle', playerSize: 1.4 });
const visSize = resolvePlayerVisual(createPlayer({ team: 'offense' }), apUni, th);
ok(visSize.shape === 'triangle', 'la forma global se aplica sin estilo propio');
ok(visSize.size === 1.4, 'el tamaño global se aplica');

// ---------- rutas ----------
const rs = resolveRouteStyle(createPlayer({ team: 'offense' }), ap0, false);
ok(rs.dash === null, 'ruta continua por defecto');
ok(rs.arrows === true, 'flechas activas por defecto');

const apDash = normalizeAppearance({ routeStyle: 'dotted', arrows: false, routeWidth: 2 });
const rsDash = resolveRouteStyle(createPlayer({ team: 'offense' }), apDash, false);
ok(rsDash.dash === ROUTE_STYLES.dotted.dash, 'estilo punteado aplicado');
ok(rsDash.arrows === false, 'flechas desactivadas');
ok(rsDash.width === 2, 'grosor aplicado');

const own = createPlayer({ team: 'offense', style: { routeColor: '#00ff00', routeStyle: 'dashed' } });
const rsOwn = resolveRouteStyle(own, ap0, false);
ok(rsOwn.color === '#00ff00', 'color de ruta propio');
ok(rsOwn.dash === ROUTE_STYLES.dashed.dash, 'estilo de ruta propio en la ruta');

// ---------- utilidades de color ----------
ok(luminance('#ffffff') > 0.9, 'blanco es luminoso');
ok(luminance('#000000') < 0.05, 'negro no es luminoso');
ok(contrastInk('#ffffff') !== contrastInk('#000000'), 'el texto contrasta en fondos opuestos');
ok(mixHex('#000000', '#ffffff', 0.5) === '#808080', 'mezcla al 50%');
ok(mixHex('#000000', '#ffffff', 0) === '#000000', 'mezcla al 0%');
ok(PALETTE.every((c) => isHex(c)), 'toda la paleta son colores válidos');
ok(Object.keys(SHAPES).length === 6, 'hay 6 formas de jugador');
ok(Object.keys(ROUTE_STYLES).length === 3, 'hay 3 estilos de ruta');
ok(DEFAULT_APPEARANCE.theme === 'turf', 'apariencia por defecto estable');

console.log(`OK: ${n} comprobaciones de apariencia (tests/appearance.mjs).`);
