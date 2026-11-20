// Geometría del campo de flag football. Todo en yardas.
// x: 0 = centro, + = derecha de la ofensiva.
// y: 0 = línea de scrimmage, + = campo profundo (hacia la defensa).

/** Formatos de juego. width = ancho jugable, depth = fondo que se dibuja sobre el LOS. */
export const FORMATS = {
  4: { players: 4, width: 25, depth: 22, ez: 10, label: '4v4' },
  5: { players: 5, width: 30, depth: 24, ez: 10, label: '5v5' },
  6: { players: 6, width: 35, depth: 24, ez: 10, label: '6v6' },
  7: { players: 7, width: 40, depth: 26, ez: 10, label: '7v7' },
  8: { players: 8, width: 45, depth: 26, ez: 10, label: '8v8' },
};

export const DEFAULT_FIELD = { width: 40, depth: 26, ez: 10 };

/** Píxeles por yarda cuando el campo se dibuja a un ancho dado. */
export function pxPerYard(view) {
  const usable = view.width - view.padding * 2;
  return usable / view.field.width;
}

/**
 * Crea la transformación campo <-> píxeles.
 * El viewport incluye un poco de campo detrás del LOS (para el QB) y la end zone
 * sólo si `showEZ`.
 */
export function makeView(opts) {
  const field = opts.field || DEFAULT_FIELD;
  const width = opts.width || 800;
  const height = opts.height || 600;
  const padding = opts.padding ?? 14;
  const losY = opts.losY ?? 0.22; // fracción de la altura donde cae el LOS
  const flipped = !!opts.flipped;
  const showEZ = opts.showEZ ?? true;
  const ez = field.ez;
  // Cuántas yardas se ven por encima y por debajo del LOS.
  const behind = Math.min(5, field.depth * 0.3);
  const ahead = field.depth;
  const view = { field, width, height, padding, losY, flipped, showEZ, ez, behind, ahead, ppy: 1 };
  const ppyH = (height - padding * 2) / (ahead + behind + (showEZ ? ez : 0));
  const ppyW = (width - padding * 2) / field.width;
  if (ppyW <= ppyH) {
    // La anchura manda: alargamos la profundidad visible para llenar el alto y
    // no dejar franjas vacías en pantallas estrechas o verticales.
    view.ppy = ppyW;
    const available = (height - padding * 2) / view.ppy;
    const needed = available - behind - (showEZ ? ez : 0);
    view.ahead = Math.min(Math.max(field.depth, needed), opts.maxAhead ?? 48);
    if (view.ahead > field.depth + 0.01) view.showEZ = false;
  } else {
    view.ppy = ppyH;
  }
  view.originX = width / 2;
  // El LOS queda cerca del borde inferior: por delante está el campo profundo
  // (hacia arriba en pantalla) y por detrás un pequeño margen para el QB.
  // Si sobra alto, centramos el bloque de campo para que el marco quede simétrico.
  const drawn = view.ahead + behind + (view.showEZ ? ez : 0);
  const available = (height - padding * 2) / view.ppy;
  const spare = Math.max(0, available - drawn) * view.ppy;
  view.offset = spare / 2;
  view.originY = padding + view.offset + (view.ahead + (view.showEZ ? ez : 0)) * view.ppy;
  view.spanX = (width - padding * 2) / view.ppy;
  view.spanY = (height - padding * 2) / view.ppy;
  return view;
}

/** Yardas (relativas al LOS) -> píxeles */
export function fieldToPx(pt, view) {
  const x = view.flipped ? -pt.x : pt.x;
  return {
    x: view.originX + x * view.ppy,
    y: view.originY - pt.y * view.ppy,
  };
}

/** Píxeles -> yardas relativas al LOS */
export function pxToField(px, view) {
  let x = (px.x - view.originX) / view.ppy;
  if (view.flipped) x = -x;
  return { x, y: (view.originY - px.y) / view.ppy };
}

export function clampToField(pt, field) {
  const hw = (field.width || 40) / 2;
  return {
    x: Math.max(-hw, Math.min(hw, pt.x)),
    y: Math.max(-6, Math.min((field.depth || 26) + (field.ez || 10), pt.y)),
  };
}

export const SNAP = 0.5;
export function snapYard(v) {
  return Math.round(v / SNAP) * SNAP;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpPt(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Longitud total de una ruta en yardas. */
export function pathLength(points, start) {
  if (!points || !points.length) return 0;
  let total = 0;
  let prev = start;
  for (const p of points) {
    total += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return total;
}

/**
 * Punto sobre una polilínea (con tramos suaves aproximados) a una fracción 0..1.
 * Devuelve también el ángulo para orientar la punta de flecha.
 */
export function pointAtFraction(start, points, f) {
  const pts = [start, ...points];
  if (pts.length < 2) return { x: start.x, y: start.y, angle: -Math.PI / 2 };
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segs.push({ a: pts[i - 1], b: pts[i], len });
    total += len;
  }
  if (total === 0) return { x: start.x, y: start.y, angle: -Math.PI / 2 };
  let target = Math.max(0, Math.min(1, f)) * total;
  for (const s of segs) {
    if (target <= s.len || s === segs[segs.length - 1]) {
      const t = s.len === 0 ? 0 : target / s.len;
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      return { x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t), angle: Math.atan2(dy, dx) };
    }
    target -= s.len;
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

/** Punto medio de un polígono cerrado (para etiquetas de zona). */
export function centroid(points) {
  if (!points.length) return { x: 0, y: 0 };
  const s = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / points.length, y: s.y / points.length };
}

/** Redondea a la yarda más cercana para mostrar al usuario. */
export function fmtYard(v) {
  const half = Math.round(v * 2) / 2;
  return `${half > 0 ? '+' : ''}${half} yd`;
}
