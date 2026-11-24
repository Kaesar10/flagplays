// Renderer SVG de FlagPlays. Genera cadenas SVG puras (sin DOM) para poder
// usarse en el editor, en la exportación a PNG y en la impresión.
import { fieldToPx, makeView, pathLength } from './field.js';
import { PATH_TYPES, ROLES } from './model.js';
import {
  DEFAULT_APPEARANCE,
  FIELD_THEMES,
  normalizeAppearance,
  resolvePlayerVisual,
  resolveRouteStyle,
  resolveTheme,
} from './appearance.js';

// Apariencia activa: la fija main.js cuando el usuario cambia de estilo. Así los
// módulos que no reciben opciones (impresión, exportación PNG) también respetan
// la personalización sin tener que cambiar sus firmas.
let activeAppearance = DEFAULT_APPEARANCE;
export function setActiveAppearance(appearance) {
  activeAppearance = normalizeAppearance(appearance);
  return activeAppearance;
}
export function getActiveAppearance() {
  return activeAppearance;
}

let idc = 0;
const nextId = () => `fp${++idc}`;

const n = (v) => Math.round(v * 10) / 10;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Velocidad de referencia de un jugador en yardas/segundo. */
export const ROUTE_SPEED = 7.5;

export const COLORS = FIELD_THEMES;

/** Paleta resuelta para un modo de dibujo concreto. */
function themeFor(mode, appearance) {
  return resolveTheme(appearance || activeAppearance, mode);
}

/** Duración de la jugada en segundos. */
export function computePlayDuration(play) {
  let maxYards = 0;
  for (const p of play.players || []) {
    if (p.team !== 'offense') continue;
    if (p.path && p.path.length) {
      maxYards = Math.max(maxYards, pathLength(p.path, p.pos));
    }
  }
  if (!maxYards) return 1.8;
  return Math.min(6.5, Math.max(1.8, maxYards / ROUTE_SPEED + 0.5));
}

/** Fracción del recorrido que lleva hecha una ruta en el instante t. */
function progressAt(player, t, duration) {
  const delay = player.team === 'defense' ? 0.25 : 0;
  const span = Math.max(0.2, duration - delay);
  const f = (t - delay) / span;
  if (player.team === 'defense') return Math.max(0, Math.min(1, f * 0.95));
  return Math.max(0, Math.min(1, f));
}

/** Posición de un jugador en el instante t (yardas). */
export function playerAtTime(player, t, duration) {
  if (!player.path || !player.path.length) return { ...player.pos };
  return pointAt(player, progressAt(player, t, duration));
}

/** Punto sobre la ruta del jugador a una fracción 0..1. */
export function pointAt(player, f) {
  const pts = [player.pos, ...player.path];
  if (pts.length < 2) return { ...player.pos };
  const segLens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segLens.push(len);
    total += len;
  }
  if (total === 0) return { ...pts[0] };
  let target = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i];
    if (target <= len || i === segLens.length - 1) {
      const k = len === 0 ? 0 : target / len;
      const a = pts[i];
      const b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    target -= len;
  }
  return { ...pts[pts.length - 1] };
}

/** Puntos de la ruta en píxeles, incluyendo la posición inicial. */
export function pathPointsPx(player, view) {
  const raw = [{ ...player.pos }, ...(player.path || [])];
  return raw.map((p) => fieldToPx(p, view));
}

function polylineD(px) {
  if (!px.length) return '';
  return 'M ' + px.map((p) => `${n(p.x)} ${n(p.y)}`).join(' L ');
}

/** Path con esquinas redondeadas para los tramos marcados como 'smooth'. */
function routeD(px, smoothFlags) {
  if (px.length < 2) return '';
  let d = `M ${n(px[0].x)} ${n(px[0].y)}`;
  for (let i = 1; i < px.length; i++) {
    const p1 = px[i - 1];
    const p2 = px[i];
    if (smoothFlags[i]) {
      const p0 = px[i - 2] || p1;
      const p3 = px[i + 1] || p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p2.x)} ${n(p2.y)}`;
    } else {
      d += ` L ${n(p2.x)} ${n(p2.y)}`;
    }
  }
  return d;
}

function arrowHead(tip, angle, size, color) {
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  const p1 = { x: tip.x + Math.cos(a1) * size, y: tip.y + Math.sin(a1) * size };
  const p2 = { x: tip.x + Math.cos(a2) * size, y: tip.y + Math.sin(a2) * size };
  return `<path d="M ${n(tip.x)} ${n(tip.y)} L ${n(p1.x)} ${n(p1.y)} L ${n(p2.x)} ${n(p2.y)} Z" fill="${color}"/>`;
}

const r1 = (v) => Math.round(v);

/** Dibuja el campo (rectángulos, líneas, números). */
function fieldLayer(view, th, opts) {
  const ap = normalizeAppearance(opts.appearance);
  const { field } = view;
  const parts = [];
  const ppy = view.ppy;
  const halfW = field.width / 2;
  const topY = view.ahead ?? field.depth;
  const hasEZ = !!view.showEZ;
  const ezBottom = hasEZ ? topY + field.ez : topY;

  const tl = fieldToPx({ x: -halfW, y: ezBottom }, view);
  const br = fieldToPx({ x: halfW, y: -view.behind }, view);
  const fx = Math.min(tl.x, br.x);
  const fy = Math.min(tl.y, br.y);
  const fw = Math.abs(br.x - tl.x);
  const fh = Math.abs(br.y - tl.y);

  // Apron
  parts.push(`<rect x="0" y="0" width="${view.width}" height="${view.height}" fill="${th.apron}"/>`);

  // Césped con bandas cada 5 yardas. Ocupa todo el ancho del lienzo para que la
  // vista llene el espacio; después se oscurece lo que queda fuera de las bandas.
  const bands = [];
  let y = -Math.ceil(view.behind);
  const end = ezBottom;
  while (y < end) {
    const y2 = Math.min(end, y + 5);
    const a = fieldToPx({ x: -halfW, y: y2 }, view);
    const b = fieldToPx({ x: halfW, y }, view);
    const isEZ = y2 > topY + 0.001;
    const fill = isEZ
      ? (y % 10 === 0 ? th.ezA : th.ezB)
      : (Math.round((y + view.behind) / 5) % 2 === 0 ? th.fieldA : th.fieldB);
    bands.push(
      `<rect x="0" y="${n(Math.min(a.y, b.y))}" width="${view.width}" height="${n(Math.abs(b.y - a.y))}" fill="${fill}"/>`
    );
    y = y2;
  }
  parts.push(`<g clip-path="url(#clip-${opts.uid})">${bands.join('')}</g>`);

  // Fuera de banda: el mismo césped, más oscuro
  const leftPx = fieldToPx({ x: -halfW, y: 0 }, view);
  const rightPx = fieldToPx({ x: halfW, y: 0 }, view);
  const fxL = Math.min(leftPx.x, rightPx.x);
  const fxR = Math.max(leftPx.x, rightPx.x);
  parts.push(
    `<rect x="0" y="0" width="${n(fxL)}" height="${view.height}" fill="${th.oob}"/>` +
      `<rect x="${n(fxR)}" y="0" width="${n(Math.max(0, view.width - fxR))}" height="${view.height}" fill="${th.oob}"/>`
  );

  // Líneas transversales cada 5 yardas, cada 10 más marcada
  const lines = [];
  for (let yd = -Math.floor(view.behind); yd <= ezBottom; yd += 5) {
    if (yd === 0) continue;
    const a = fieldToPx({ x: -halfW, y: yd }, view);
    const b = fieldToPx({ x: halfW, y: yd }, view);
    const op = yd % 10 === 0 ? th.lineStrongOp : th.lineOp;
    lines.push(
      `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${th.line}" stroke-opacity="${op}" stroke-width="1"/>`
    );
  }
  // Línea de gol
  for (const gy of [0, topY]) {
    const a = fieldToPx({ x: -halfW, y: gy }, view);
    const b = fieldToPx({ x: halfW, y: gy }, view);
    lines.push(
      `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${th.line}" stroke-opacity="${th.lineStrongOp + 0.15}" stroke-width="1.6"/>`
    );
  }
  // Laterales
  for (const sx of [-halfW, halfW]) {
    const a = fieldToPx({ x: sx, y: -view.behind }, view);
    const b = fieldToPx({ x: sx, y: ezBottom }, view);
    lines.push(
      `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${th.line}" stroke-opacity="${th.lineStrongOp + 0.1}" stroke-width="1.6"/>`
    );
  }
  // Hachas
  if (opts.mode !== 'card' && ap.showHashes !== false) {
    const tick = Math.max(3, ppy * 0.45);
    for (let yd = -Math.floor(view.behind); yd <= topY; yd += 1) {
      if (yd % 5 === 0) continue;
      for (const sx of [-halfW, halfW]) {
        const p = fieldToPx({ x: sx, y: yd }, view);
        const dir = sx < 0 ? 1 : -1;
        lines.push(
          `<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(p.x + dir * tick)}" y2="${n(p.y)}" stroke="${th.line}" stroke-opacity="${th.lineOp}" stroke-width="1"/>`
        );
      }
    }
  }
  parts.push(`<g>${lines.join('')}</g>`);

  // Números de yardas (distancia al LOS) en la banda exterior
  if (opts.mode !== 'card' && opts.yardNumbers !== false && ap.showYardNumbers !== false) {
    const nums = [];
    const fs = Math.max(7, Math.min(13, ppy * 0.85));
    for (let yd = 10; yd <= Math.min(topY, 40); yd += 10) {
      for (const sx of [-1, 1]) {
        const p = fieldToPx({ x: sx * (halfW + 1.6), y: yd }, view);
        nums.push(
          `<text x="${n(p.x)}" y="${n(p.y + fs * 0.35)}" font-size="${n(fs)}" font-family="ui-monospace,monospace" fill="${th.yardText}" text-anchor="middle" font-weight="600">${yd}</text>`
        );
      }
    }
    parts.push(`<g>${nums.join('')}</g>`);
  }

  // Línea de scrimmage
  if (ap.showLOS !== false) {
    const lo = fieldToPx({ x: -halfW, y: 0 }, view);
    const ro = fieldToPx({ x: halfW, y: 0 }, view);
    parts.push(
      `<line x1="${n(lo.x)}" y1="${n(lo.y)}" x2="${n(ro.x)}" y2="${n(ro.y)}" stroke="${th.los}" stroke-opacity="${th.losOp}" stroke-width="${Math.max(1.4, ppy * 0.09)}" stroke-dasharray="none"/>`
    );
  }
  if (opts.mode === 'editor' && opts.showLOSLabel !== false && ap.showLOS !== false) {
    const lbl = fieldToPx({ x: halfW, y: 0 }, view);
    const fs = Math.max(7, Math.min(10, ppy * 0.7));
    parts.push(
      `<text x="${n(lbl.x + 4)}" y="${n(lbl.y - 4)}" font-size="${n(fs)}" font-family="ui-monospace,monospace" fill="${th.yardText}" text-anchor="start" letter-spacing="0.5">LOS</text>`
    );
  }

  // Etiqueta de end zone
  if (hasEZ && opts.mode !== 'card') {
    const ezMid = (topY + ezBottom) / 2;
    const c = fieldToPx({ x: 0, y: ezMid }, view);
    const fs = Math.max(8, Math.min(16, ppy * 1.1));
    parts.push(
      `<text x="${n(c.x)}" y="${n(c.y)}" font-size="${n(fs)}" font-family="ui-monospace,monospace" letter-spacing="${n(fs * 0.4)}" fill="${th.yardText}" text-anchor="middle" font-weight="700" opacity="0.75">END ZONE</text>`
    );
  }

  return { markup: parts.join(''), rect: { x: fx, y: fy, w: fw, h: fh } };
}

function zonesLayer(play, view, th, opts) {
  const items = [];
  for (const d of play.players || []) {
    if (d.team !== 'defense' || !d.assignment || d.assignment.type !== 'zone') continue;
    const lm = d.assignment.landmark || { x: d.pos.x, y: d.pos.y + 6 };
    const depth = Number(d.assignment.depth) || 6;
    const p = fieldToPx(lm, view);
    const rx = Math.min(4.5, Math.max(3, depth * 0.3)) * view.ppy;
    const ry = Math.min(6.5, Math.max(3, depth * 0.45)) * view.ppy;
    items.push(
      `<ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${th.zone}" stroke="${th.zoneStroke}" stroke-width="1" stroke-dasharray="3 4"/>`
    );
  }
  return items.join('');
}

function routeLayer(play, view, th, opts) {
  const out = [];
  const ap = normalizeAppearance(opts.appearance);
  const baseW = Math.max(1.6, Math.min(3.4, view.ppy * 0.14));
  const dim = opts.dimRoutes === true;
  for (const p of play.players || []) {
    if (!p.path || !p.path.length) continue;
    const px = pathPointsPx(p, view);
    const flags = [false, ...p.path.map((pt) => pt.curve === 'smooth')];
    const d = routeD(px, flags);
    const isDef = p.team === 'defense';
    const isMotion = p.pathType === 'motion';
    const rs = resolveRouteStyle(p, ap, isDef);
    const sw = n(baseW * (rs.width || 1));

    let color = rs.color || (isDef ? th.defRoute : th.route);
    let dash = '';
    if (isMotion) {
      color = th.routeDim;
      dash = rs.dash ? ` stroke-dasharray="${rs.dash}"` : ' stroke-dasharray="7 5"';
    } else if (rs.dash) {
      dash = ` stroke-dasharray="${rs.dash}"`;
    } else if (isDef) {
      dash = ' stroke-dasharray="6 4"';
    }
    const op = dim ? 0.45 : 1;
    const pulsa = opts.mode === 'editor' ? ` data-route-player="${p.id}" style="cursor:pointer"` : '';
    out.push(
      `<path${pulsa} d="${d}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`
    );
    if (rs.arrows !== false) {
      const last = px[px.length - 1];
      const prev = px[px.length - 2] || px[0];
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
      out.push(arrowHead(last, angle, Math.max(6, Number(sw) * 3.1), color).replace('/>', ` opacity="${op}"/>`));
    }
    out.push(
      `<circle cx="${n(px[0].x)}" cy="${n(px[0].y)}" r="${n(Math.max(1.6, Number(sw) * 0.9))}" fill="${color}" fill-opacity="${op}"/>`
    );
  }
  return out.join('');
}

/** Puntos de una estrella. */
function starPoints(cx, cy, rOuter, rInner, tips = 5) {
  const pts = [];
  for (let i = 0; i < tips * 2; i++) {
    const rad = i % 2 === 0 ? rOuter : rInner;
    const a = (Math.PI / tips) * i - Math.PI / 2;
    pts.push(`${n(cx + Math.cos(a) * rad)},${n(cy + Math.sin(a) * rad)}`);
  }
  return pts.join(' ');
}

/** Marcador de jugador según su forma. */
function shapeMarkup(cx, cy, r, shape, fill, stroke, strokeWidth) {
  const sw = n(Math.max(0.6, strokeWidth));
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"`;
  switch (shape) {
    case 'square':
      return `<rect x="${n(cx - r * 0.9)}" y="${n(cy - r * 0.9)}" width="${n(r * 1.8)}" height="${n(r * 1.8)}" rx="${n(r * 0.24)}" ${common}/>`;
    case 'diamond':
      return `<polygon points="${n(cx)},${n(cy - r * 1.16)} ${n(cx + r * 1.16)},${n(cy)} ${n(cx)},${n(cy + r * 1.16)} ${n(cx - r * 1.16)},${n(cy)}" ${common}/>`;
    case 'triangle':
      return `<polygon points="${n(cx)},${n(cy - r * 1.22)} ${n(cx + r * 1.16)},${n(cy + r * 0.86)} ${n(cx - r * 1.16)},${n(cy + r * 0.86)}" ${common}/>`;
    case 'star':
      return `<polygon points="${starPoints(cx, cy, r * 1.24, r * 0.52, 5)}" ${common}/>`;
    case 'x':
      return `<path d="M ${n(cx - r * 0.74)} ${n(cy - r * 0.74)} L ${n(cx + r * 0.74)} ${n(cy + r * 0.74)} M ${n(cx + r * 0.74)} ${n(cy - r * 0.74)} L ${n(cx - r * 0.74)} ${n(cy + r * 0.74)}" fill="none" stroke="${fill}" stroke-width="${n(Math.max(2, r * 0.5))}" stroke-linecap="round"/>`;
    default:
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${common}/>`;
  }
}

function playerLayer(play, view, th, opts) {
  const out = [];
  const ap = normalizeAppearance(opts.appearance);
  const t = opts.time || 0;
  const dur = opts.duration || computePlayDuration(play);
  const rBase = opts.mode === 'card' ? 0.62 : 0.92;
  const r = Math.max(opts.mode === 'card' ? 5 : 7, Math.min(19, rBase * view.ppy));
  const selected = new Set(opts.selected || []);
  const highlight = new Set(opts.highlight || []);
  const labelsOn = opts.showLabels !== false && ap.showLabels !== false;
  const numbersOn = ap.showNumbers === true;

  for (const p of play.players || []) {
    const at = opts.positions?.[p.id] || (opts.staticPositions ? p.pos : playerAtTime(p, t, dur));
    const c = fieldToPx(at, view);
    const vis = resolvePlayerVisual(p, ap, th);
    const pr = r * vis.size;
    const isQB = p.role === 'qb';
    const isSel = selected.has(p.id);
    const isHi = highlight.has(p.id);
    const hasLabel = labelsOn && pr >= 6.5 && vis.shape !== 'x';
    const fs = pr * 1.08;

    let g = '';
    if (isSel || isHi) {
      g += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(pr + (isSel ? 5 : 3))}" fill="${th.select}" fill-opacity="${isSel ? 0.22 : 0.14}" ${
        isQB ? '' : `stroke="${th.select}" stroke-width="1.5" stroke-opacity="0.9"`
      }/>`;
    }
    if (isQB) {
      g += `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(pr * 0.5)}" fill="none" stroke="${th.qbRing}" stroke-width="${n(Math.max(1.5, pr * 0.22))}"/>`;
    }
    g += shapeMarkup(
      c.x,
      c.y,
      pr,
      vis.shape,
      vis.fill,
      vis.ring === 'none' ? vis.fill : vis.ring,
      Math.max(0.8, pr * 0.16) * (vis.ringWidth || 1)
    );
    if (hasLabel) {
      const txt = String(p.label || ROLES[p.role]?.short || '').slice(0, 3);
      const dy = vis.shape === 'triangle' ? fs * 0.62 : fs * 0.36;
      g += `<text x="${n(c.x)}" y="${n(c.y + dy)}" font-size="${n(fs)}" font-family="Inter,system-ui,sans-serif" font-weight="700" fill="${vis.ink}" text-anchor="middle">${esc(txt)}</text>`;
    }
    if (numbersOn && p.number && pr >= 6) {
      g += `<text x="${n(c.x)}" y="${n(c.y + pr + fs * 0.82)}" font-size="${n(fs * 0.78)}" font-family="ui-monospace,monospace" font-weight="700" fill="${vis.fill}" stroke="${th.apron}" stroke-width="${n(fs * 0.16)}" paint-order="stroke" text-anchor="middle">${esc(p.number)}</text>`;
    }
    out.push(`<g data-player-id="${esc(p.id)}" class="pl">${g}</g>`);
  }
  return out.join('');
}

function routeHandles(play, view, th, opts) {
  const playerId = opts.editingRoute;
  if (!playerId) return '';
  const p = (play.players || []).find((x) => x.id === playerId);
  if (!p || !p.path) return '';
  const px = pathPointsPx(p, view);
  const s = 4.2;
  const parts = [];
  for (let i = 1; i < px.length; i++) {
    parts.push(
      `<rect data-handle="${i - 1}" data-player-id="${esc(p.id)}" x="${n(px[i].x - s)}" y="${n(px[i].y - s)}" width="${n(s * 2)}" height="${n(s * 2)}" rx="2.5" fill="${th.handle}" stroke="${th.select}" stroke-width="1.8"/>`
    );
  }
  return parts.join('');
}

function ballLayer(play, view, th, opts) {
  const t = opts.time || 0;
  const dur = opts.duration || computePlayDuration(play);
  const qb = (play.players || []).find((p) => p.role === 'qb' && p.team === 'offense');
  const targetId = play.ball?.targetId;
  const target = (play.players || []).find((p) => p.id === targetId);
  const release = Number(play.ball?.releaseAt ?? 0.9);
  if (!qb) return '';
  const qbPos = opts.positions?.[qb.id] || playerAtTime(qb, Math.min(t, release), dur);
  const qbPx = fieldToPx(qbPos, view);
  const bs = Math.max(3.2, Math.min(6, view.ppy * 0.3));
  if (!target || opts.showBall === false) {
    return `<ellipse cx="${n(qbPx.x)}" cy="${n(qbPx.y)}" rx="${n(bs)}" ry="${n(bs * 0.62)}" fill="${th.ball}" transform="rotate(-20 ${n(qbPx.x)} ${n(qbPx.y)})"/>`;
  }
  const targetPos = opts.positions?.[target.id] || playerAtTime(target, t, dur);
  const targetPx = fieldToPx(targetPos, view);
  if (opts.ballPos) {
    const bp = fieldToPx(opts.ballPos, view);
    return `<g transform="rotate(${n(opts.ballAngle || 0)} ${n(bp.x)} ${n(bp.y)})"><ellipse cx="${n(bp.x)}" cy="${n(bp.y)}" rx="${n(bs * 1.1)}" ry="${n(bs * 0.6)}" fill="${th.ball}" stroke="${th.ballStripe}" stroke-width="0.8"/></g>`;
  }
  if (t < release) {
    const out = [];
    if (opts.mode === 'editor' && opts.showThrowLine) {
      out.push(
        `<line data-ball="1" x1="${n(qbPx.x)}" y1="${n(qbPx.y)}" x2="${n(targetPx.x)}" y2="${n(targetPx.y)}" stroke="${th.throwLine}" stroke-width="1.4" stroke-dasharray="3 4" style="pointer-events:stroke;cursor:pointer"/>`
      );
    }
    const hit =
      opts.mode === 'editor'
        ? `<circle cx="${n(qbPx.x)}" cy="${n(qbPx.y)}" r="15" fill="transparent" style="pointer-events:all;cursor:pointer"/>`
        : '';
    out.push(
      `<g data-ball="1" style="cursor:pointer">${hit}<ellipse cx="${n(qbPx.x)}" cy="${n(qbPx.y)}" rx="${n(bs)}" ry="${n(bs * 0.62)}" fill="${th.ball}" transform="rotate(-20 ${n(qbPx.x)} ${n(qbPx.y)})"/></g>`
    );
    return out.join('');
  }
  const speed = 22;
  const travel = Math.hypot(targetPx.x - qbPx.x, targetPx.y - qbPx.y) / view.ppy / speed;
  const f = Math.max(0, Math.min(1, (t - release) / Math.max(0.12, travel)));
  const bx = qbPx.x + (targetPx.x - qbPx.x) * f;
  const by = qbPx.y + (targetPx.y - qbPx.y) * f;
  const arc = Math.sin(f * Math.PI) * view.ppy * 1.6;
  const angle = (Math.atan2(targetPx.y - qbPx.y, targetPx.x - qbPx.x) * 180) / Math.PI;
  const parts = [];
  if (f < 1) {
    parts.push(
      `<line x1="${n(qbPx.x)}" y1="${n(qbPx.y)}" x2="${n(bx)}" y2="${n(by)}" stroke="${th.throwLine}" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round" opacity="0.55"/>`
    );
  }
  parts.push(
    `<g transform="rotate(${n(angle)} ${n(bx)} ${n(by)})"><ellipse cx="${n(bx)}" cy="${n(by - arc)}" rx="${n(bs * 1.1)}" ry="${n(bs * 0.6)}" fill="${th.ball}" stroke="${th.ballStripe}" stroke-width="0.8"/></g>`
  );
  return parts.join('');
}

function captionLayer(play, view, th, opts) {
  if (!opts.showCaption) return '';
  const pad = 10;
  const fs = Math.max(9, Math.min(14, view.width * 0.018));
  return [
    `<rect x="${pad}" y="${pad}" width="${n(fs * play.name.length * 0.58 + 16)}" height="${n(fs * 1.9)}" rx="4" fill="${th.apron}" fill-opacity="0.75"/>`,
    `<text x="${pad + 8}" y="${pad + fs * 1.32}" font-size="${n(fs)}" font-family="Inter,system-ui,sans-serif" font-weight="650" fill="${th.line}" fill-opacity="0.9">${esc(play.name)}</text>`,
  ].join('');
}

/** Contenido SVG (sin etiqueta <svg>), para incrustar en otras hojas. */
export function playToSVGInner(play, opts = {}) {
  const o = {
    width: opts.width || 800,
    height: opts.height || 600,
    mode: opts.mode || 'static',
    time: opts.time || 0,
    showDefense: opts.showDefense !== false,
    showRoutes: opts.showRoutes !== false,
    showLabels: opts.showLabels !== false,
    flipped: !!opts.flipped,
    highlight: opts.highlight || [],
    selected: opts.selected || [],
    editingRoute: opts.editingRoute || null,
    showZones: opts.showZones !== false,
    showThrowLine: opts.showThrowLine !== false,
    showCaption: !!opts.showCaption,
    staticPositions: !!opts.staticPositions,
    dimRoutes: !!opts.dimRoutes,
    positions: opts.positions || null,
    ballPos: opts.ballPos || null,
    ballAngle: opts.ballAngle || 0,
    padding: opts.padding ?? 14,
    uid: nextId(),
    appearance: opts.appearance || activeAppearance,
    showEZ: opts.showEZ !== undefined ? !!opts.showEZ : normalizeAppearance(opts.appearance || activeAppearance).showEndzone,
    showNumbers: opts.showNumbers !== undefined ? !!opts.showNumbers : null,
  };
  const field0 = play.field || { width: 40, depth: 26, ez: 10 };
  // En miniaturas se recorta la profundidad para que la jugada se lea de un vistazo.
  const field =
    o.mode === 'card'
      ? { ...field0, depth: o.cardDepth ?? Math.min(field0.depth, 17) }
      : field0;
  const view = makeView({
    field,
    width: o.width,
    height: o.height,
    padding: o.padding,
    flipped: o.flipped,
    showEZ: o.mode === 'card' ? false : !!o.showEZ,
  });
  o.duration = opts.duration || computePlayDuration(play);
  const th = themeFor(o.mode, o.appearance);

  // Subconjunto de jugadores visible según showDefense
  const visible = {
    ...play,
    players: (play.players || []).filter((p) => o.showDefense || p.team !== 'defense'),
  };

  const { markup: fieldMk } = fieldLayer(view, th, o);
  const parts = [];
  parts.push(
    `<defs><clipPath id="clip-${o.uid}"><rect x="0" y="0" width="${o.width}" height="${o.height}" rx="3"/></clipPath></defs>`
  );
  parts.push(fieldMk);
  if (o.showDefense && o.showZones) parts.push(`<g>${zonesLayer(visible, view, th, o)}</g>`);
  if (o.showRoutes) parts.push(`<g>${routeLayer(visible, view, th, o)}</g>`);
  parts.push(`<g>${ballLayer(visible, view, th, o)}</g>`);
  parts.push(`<g>${playerLayer(visible, view, th, o)}</g>`);
  parts.push(`<g>${routeHandles(visible, view, th, o)}</g>`);
  parts.push(captionLayer(visible, view, th, o));
  return parts.join('');
}

/** SVG completo como cadena. */
export function playToSVG(play, opts = {}) {
  const width = opts.width || 800;
  const height = opts.height || 600;
  const mode = opts.mode || 'static';
  const th = themeFor(mode);
  const inner = playToSVGInner(play, { ...opts, width, height, mode });
  const bg = opts.background === false ? '' : `<rect width="${width}" height="${height}" fill="${th.apron}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(
    play.name || 'Jugada'
  )}">${bg}${inner}</svg>`;
}

/** Miniatura para listas (string corto). */
export function playThumbSVG(play, width = 96, height = 72) {
  return playToSVG(play, {
    width,
    height,
    mode: 'card',
    showLabels: false,
    padding: 6,
    showCaption: false,
  });
}

/** Vista del campo para el editor (la usa editor.js/main.js). */
export function editorView(width, height, field, flipped = false) {
  return makeView({ field, width, height, padding: 16, flipped });
}

export { fieldToPx };
