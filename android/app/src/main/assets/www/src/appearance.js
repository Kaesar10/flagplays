// Sistema de apariencia y personalización de FlagPlays.
// Define los temas de campo, los valores por defecto y la resolución de estilos
// (tema -> jugador -> ruta), incluyendo colores por jugador.
// Sin DOM: se puede importar en Node.

/**
 * Temas de campo. Cada tema es una paleta completa que consume el renderer.
 * `light: true` significa fondo claro (apto para imprimir).
 */
export const FIELD_THEMES = {
  turf: {
    label: 'Césped nocturno',
    desc: 'El clásico: verde profundo y líneas de luz.',
    light: false,
    apron: '#070d10',
    apronLine: '#132229',
    fieldA: '#154429',
    fieldB: '#103821',
    ezA: '#12432a',
    ezB: '#0e3720',
    line: '#eafff2',
    lineOp: 0.17,
    lineStrongOp: 0.36,
    yardText: 'rgba(230,255,240,0.42)',
    los: '#eafff2',
    losOp: 0.5,
    offFill: '#f0fbf4',
    offInk: '#08120c',
    offRing: 'rgba(8,18,12,0.35)',
    qbRing: '#9ae63f',
    defFill: '#ff7a5c',
    defInk: '#180a07',
    defRing: 'rgba(24,10,7,0.35)',
    route: 'rgba(240,255,246,0.94)',
    routeDim: 'rgba(240,255,246,0.55)',
    defRoute: 'rgba(255,140,116,0.9)',
    ball: '#e8a33d',
    ballStripe: '#7a4d10',
    zone: 'rgba(255,122,92,0.03)',
    zoneStroke: 'rgba(255,122,92,0.18)',
    throwLine: 'rgba(255,201,77,0.55)',
    select: '#9ae63f',
    handle: '#0b1116',
    text: '#08120c',
    oob: 'rgba(3,8,5,0.5)',
  },
  night: {
    label: 'Noche de estadio',
    desc: 'Azul marino bajo los focos.',
    light: false,
    apron: '#060a14',
    apronLine: '#101a2e',
    fieldA: '#0f2135',
    fieldB: '#0b1b2c',
    ezA: '#0e2740',
    ezB: '#0a1f33',
    line: '#dff1ff',
    lineOp: 0.16,
    lineStrongOp: 0.34,
    yardText: 'rgba(215,238,255,0.4)',
    los: '#dff1ff',
    losOp: 0.5,
    offFill: '#eaf6ff',
    offInk: '#06111f',
    offRing: 'rgba(6,17,31,0.35)',
    qbRing: '#63c8ff',
    defFill: '#ff9d43',
    defInk: '#1a0d02',
    defRing: 'rgba(26,13,2,0.35)',
    route: 'rgba(226,244,255,0.94)',
    routeDim: 'rgba(226,244,255,0.55)',
    defRoute: 'rgba(255,157,67,0.9)',
    ball: '#ffd166',
    ballStripe: '#7a5a10',
    zone: 'rgba(99,200,255,0.04)',
    zoneStroke: 'rgba(99,200,255,0.2)',
    throwLine: 'rgba(255,209,102,0.55)',
    select: '#63c8ff',
    handle: '#060a14',
    text: '#06111f',
    oob: 'rgba(2,5,10,0.5)',
  },
  slate: {
    label: 'Pizarra gris',
    desc: 'Neutro, para proyectar en clase.',
    light: false,
    apron: '#0c0f12',
    apronLine: '#1b2126',
    fieldA: '#242a30',
    fieldB: '#1d2328',
    ezA: '#2a3138',
    ezB: '#20262b',
    line: '#eef4f8',
    lineOp: 0.16,
    lineStrongOp: 0.34,
    yardText: 'rgba(238,244,248,0.4)',
    los: '#eef4f8',
    losOp: 0.55,
    offFill: '#f4f7fa',
    offInk: '#0d1216',
    offRing: 'rgba(13,18,22,0.4)',
    qbRing: '#9ae63f',
    defFill: '#ff7a5c',
    defInk: '#160a07',
    defRing: 'rgba(22,10,7,0.4)',
    route: 'rgba(245,250,253,0.94)',
    routeDim: 'rgba(245,250,253,0.55)',
    defRoute: 'rgba(255,140,116,0.9)',
    ball: '#e8a33d',
    ballStripe: '#7a4d10',
    zone: 'rgba(255,122,92,0.035)',
    zoneStroke: 'rgba(255,122,92,0.18)',
    throwLine: 'rgba(255,201,77,0.55)',
    select: '#9ae63f',
    handle: '#0c0f12',
    text: '#0d1216',
    oob: 'rgba(0,0,0,0.4)',
  },
  blueprint: {
    label: 'Plano técnico',
    desc: 'Azul cianotipo, estilo plano.',
    light: false,
    apron: '#061426',
    apronLine: '#123654',
    fieldA: '#0b2545',
    fieldB: '#092039',
    ezA: '#0d2c52',
    ezB: '#0a2745',
    line: '#7fd4ff',
    lineOp: 0.22,
    lineStrongOp: 0.45,
    yardText: 'rgba(127,212,255,0.55)',
    los: '#7fd4ff',
    losOp: 0.7,
    offFill: '#e8fbff',
    offInk: '#04202c',
    offRing: 'rgba(4,32,44,0.4)',
    qbRing: '#7fd4ff',
    defFill: '#ffd166',
    defInk: '#2a1d00',
    defRing: 'rgba(42,29,0,0.4)',
    route: 'rgba(200,240,255,0.95)',
    routeDim: 'rgba(200,240,255,0.55)',
    defRoute: 'rgba(255,209,102,0.95)',
    ball: '#ffb347',
    ballStripe: '#6b4400',
    zone: 'rgba(127,212,255,0.05)',
    zoneStroke: 'rgba(127,212,255,0.25)',
    throwLine: 'rgba(255,179,71,0.6)',
    select: '#7fd4ff',
    handle: '#061426',
    text: '#04202c',
    oob: 'rgba(0,8,18,0.45)',
  },
  paper: {
    label: 'Papel blanco',
    desc: 'Tinta negra sobre blanco: máxima legibilidad.',
    light: true,
    apron: '#ffffff',
    apronLine: '#dfe6e3',
    fieldA: '#fbfdfc',
    fieldB: '#eef4f0',
    ezA: '#e9f1ec',
    ezB: '#e2ece6',
    line: '#0f1d16',
    lineOp: 0.3,
    lineStrongOp: 0.55,
    yardText: 'rgba(15,29,22,0.55)',
    los: '#0f1d16',
    losOp: 0.7,
    offFill: '#111f18',
    offInk: '#ffffff',
    offRing: 'rgba(0,0,0,0.2)',
    qbRing: '#4d8a0d',
    defFill: '#ffffff',
    defInk: '#c8452a',
    defRing: '#c8452a',
    route: '#0f1d16',
    routeDim: 'rgba(15,29,22,0.55)',
    defRoute: '#c8452a',
    ball: '#7a4d10',
    ballStripe: '#e8a33d',
    zone: 'rgba(200,69,42,0.03)',
    zoneStroke: 'rgba(200,69,42,0.25)',
    throwLine: 'rgba(122,77,16,0.5)',
    select: '#4d8a0d',
    handle: '#ffffff',
    text: '#0f1d16',
    oob: 'none',
  },
  sand: {
    label: 'Arena',
    desc: 'Beige cálido, se imprime bien en blanco y negro.',
    light: true,
    apron: '#fffdf8',
    apronLine: '#e2d9c6',
    fieldA: '#f7f1e4',
    fieldB: '#efe7d6',
    ezA: '#f0e6d3',
    ezB: '#e9dcc4',
    line: '#3a3220',
    lineOp: 0.28,
    lineStrongOp: 0.5,
    yardText: 'rgba(58,50,32,0.55)',
    los: '#3a3220',
    losOp: 0.7,
    offFill: '#2b2416',
    offInk: '#ffffff',
    offRing: 'rgba(0,0,0,0.2)',
    qbRing: '#8a6d00',
    defFill: '#ffffff',
    defInk: '#a5432b',
    defRing: '#a5432b',
    route: '#2b2416',
    routeDim: 'rgba(43,36,22,0.55)',
    defRoute: '#a5432b',
    ball: '#6b4400',
    ballStripe: '#c08a2a',
    zone: 'rgba(165,67,43,0.035)',
    zoneStroke: 'rgba(165,67,43,0.22)',
    throwLine: 'rgba(107,68,0,0.45)',
    select: '#8a6d00',
    handle: '#fffdf8',
    text: '#2b2416',
    oob: 'none',
  },
};

export const THEME_IDS = Object.keys(FIELD_THEMES);

/** Formas de jugador disponibles. */
export const SHAPES = {
  circle: 'Círculo',
  square: 'Cuadrado',
  triangle: 'Triángulo',
  diamond: 'Rombo',
  x: 'Aspa (X)',
  star: 'Estrella',
};
export const SHAPE_IDS = Object.keys(SHAPES);

/** Paleta de colores para jugadores y rutas. */
export const PALETTE = [
  '#f0fbf4',
  '#ffffff',
  '#9ae63f',
  '#57d98a',
  '#63c8ff',
  '#8ee6ff',
  '#ffd166',
  '#ff9d43',
  '#ff7a5c',
  '#ff5d8f',
  '#d7a8ff',
  '#c07cff',
  '#111f18',
  '#4b5563',
  '#a3b8c2',
  '#e8a33d',
];

export const ROUTE_STYLES = {
  solid: { label: 'Continua', dash: null },
  dashed: { label: 'Discontinua', dash: '7 5' },
  dotted: { label: 'Punteada', dash: '2 4' },
};

export const DEFAULT_APPEARANCE = {
  theme: 'turf',
  // jugadores
  shape: 'circle',
  playerSize: 1,
  ringWidth: 1,
  showLabels: true,
  showNumbers: false,
  offenseColor: null,
  defenseColor: null,
  labelColor: null,
  // rutas
  routeColor: null,
  routeWidth: 1,
  routeStyle: 'solid',
  arrows: true,
  // campo
  showYardNumbers: true,
  showHashes: true,
  showLOS: true,
  showZones: true,
  showEndzone: false,
  losColor: null,
  // balón
  ballColor: null,
  showThrowLine: true,
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value) {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

/** Normaliza un color: hex válido o null. */
export function normColor(value) {
  if (!isHex(value)) return null;
  let v = value.trim().toLowerCase();
  if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  return v;
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : min));

/** Completa y valida un objeto de apariencia. */
export function normalizeAppearance(raw) {
  const a = { ...DEFAULT_APPEARANCE, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    theme: FIELD_THEMES[a.theme] ? a.theme : DEFAULT_APPEARANCE.theme,
    shape: SHAPES[a.shape] ? a.shape : 'circle',
    playerSize: clamp(a.playerSize, 0.6, 1.6),
    ringWidth: clamp(a.ringWidth, 0, 3),
    showLabels: !!a.showLabels,
    showNumbers: !!a.showNumbers,
    offenseColor: normColor(a.offenseColor),
    defenseColor: normColor(a.defenseColor),
    labelColor: normColor(a.labelColor),
    routeColor: normColor(a.routeColor),
    routeWidth: clamp(a.routeWidth, 0.6, 2.2),
    routeStyle: ROUTE_STYLES[a.routeStyle] ? a.routeStyle : 'solid',
    arrows: !!a.arrows,
    showYardNumbers: !!a.showYardNumbers,
    showHashes: !!a.showHashes,
    showLOS: a.showLOS !== false,
    showZones: a.showZones !== false,
    showEndzone: !!a.showEndzone,
    losColor: normColor(a.losColor),
    ballColor: normColor(a.ballColor),
    showThrowLine: a.showThrowLine !== false,
  };
}

/** Estilo propio de un jugador. Todo `null` = heredar de la apariencia global. */
export function normalizePlayerStyle(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    color: normColor(s.color),
    ink: normColor(s.ink),
    shape: SHAPES[s.shape] ? s.shape : null,
    size: s.size == null ? null : clamp(s.size, 0.6, 1.8),
    routeColor: normColor(s.routeColor),
    routeStyle: ROUTE_STYLES[s.routeStyle] ? s.routeStyle : null,
  };
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

/** Luminancia relativa 0..1 de un color hex. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Color de texto con contraste suficiente sobre un fondo hex. */
export function contrastInk(hex, light = '#ffffff', dark = '#08120c') {
  return luminance(hex) > 0.45 ? dark : light;
}

/** Mezcla dos colores hex (t = 0 -> a, 1 -> b). */
export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Paleta final del campo: tema elegido + ajustes del usuario.
 * En impresión (`mode` print/card) se fuerza un tema claro para que el papel salga bien.
 */
export function resolveTheme(appearance, mode = 'editor') {
  const ap = normalizeAppearance(appearance);
  let base = FIELD_THEMES[ap.theme] || FIELD_THEMES.turf;
  const wantsPrint = mode === 'print' || mode === 'card';
  if (wantsPrint && !base.light) base = FIELD_THEMES.paper;
  const th = { ...base, light: !!base.light, themeId: ap.theme };

  // En fondos claros, un color propio demasiado luminoso dejaría a los jugadores
  // invisibles sobre el césped. Se descarta y se usa el del tema.
  const usableOnLight = (hex) => !th.light || luminance(hex) <= 0.72;

  if (ap.offenseColor && usableOnLight(ap.offenseColor)) {
    th.offFill = ap.offenseColor;
    th.offInk = ap.labelColor || contrastInk(ap.offenseColor);
  }
  if (ap.defenseColor && usableOnLight(ap.defenseColor)) {
    th.defFill = ap.defenseColor;
    th.defInk = ap.labelColor || contrastInk(ap.defenseColor);
  }
  if (ap.labelColor) {
    th.offInk = ap.labelColor;
    th.defInk = ap.labelColor;
  }
  if (ap.routeColor && usableOnLight(ap.routeColor)) {
    th.route = ap.routeColor;
    th.routeDim = ap.routeColor;
  }
  if (ap.losColor) th.los = ap.losColor;
  if (ap.ballColor) {
    th.ball = ap.ballColor;
    th.ballStripe = mixHex(ap.ballColor, '#000000', 0.45);
  }
  if (ap.showZones === false) {
    th.zone = 'none';
    th.zoneStroke = 'none';
  }
  return th;
}

/**
 * Aspecto final de un jugador: mezcla apariencia global con su estilo propio.
 * @returns {{shape:string,size:number,fill:string,ink:string,ring:string,ringWidth:number,isOffense:boolean}}
 */
export function resolvePlayerVisual(player, appearance, theme) {
  const ap = normalizeAppearance(appearance);
  const st = normalizePlayerStyle(player?.style);
  const isOffense = (player?.team || 'offense') !== 'defense';
  const baseFill = isOffense ? theme.offFill : theme.defFill;
  const baseInk = isOffense ? theme.offInk : theme.defInk;
  const baseRing = isOffense ? theme.offRing : theme.defRing;

  const fill = st.color || baseFill;
  // El color de texto se recalcula si el jugador tiene color propio y no se fijó uno global.
  const ink = st.ink || (st.color && !ap.labelColor ? contrastInk(fill) : baseInk);

  return {
    shape: st.shape || ap.shape || 'circle',
    size: (st.size ?? ap.playerSize) || 1,
    fill,
    ink,
    ring: baseRing,
    ringWidth: Math.max(0, ap.ringWidth),
    isOffense,
  };
}

/** Estilo de ruta final (global + override del jugador). */
export function resolveRouteStyle(player, appearance, isDefense = false) {
  const ap = normalizeAppearance(appearance);
  const st = normalizePlayerStyle(player?.style);
  const styleId = st.routeStyle || ap.routeStyle;
  const style = ROUTE_STYLES[styleId] || ROUTE_STYLES.solid;
  const color = st.routeColor || (isDefense ? null : ap.routeColor) || null;
  return {
    dash: style.dash,
    width: ap.routeWidth,
    arrows: ap.arrows,
    color,
  };
}

/** Todas las formas como markup SVG reutilizable (para la paleta de la UI). */
export function shapePreviewPath(shape) {
  switch (shape) {
    case 'square':
      return 'M -8 -8 H 8 V 8 H -8 Z';
    case 'triangle':
      return 'M 0 -9 L 9 8 L -9 8 Z';
    case 'diamond':
      return 'M 0 -9 L 9 0 L 0 9 L -9 0 Z';
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 9 : 3.8;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`);
      }
      return 'M ' + pts.join(' L ') + ' Z';
    }
    case 'x':
      return 'M -8 -8 L 8 8 M 8 -8 L -8 8';
    default:
      return 'M 0 -9 A 9 9 0 1 0 0.1 -9';
  }
}
