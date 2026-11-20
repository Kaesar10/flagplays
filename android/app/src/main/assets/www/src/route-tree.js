// ============================================================================
// FlagPlays · src/route-tree.js — modelo, disposición y dibujo del árbol de rutas
// ----------------------------------------------------------------------------
// Un ÁRBOL DE RUTAS es un diagrama de árbol donde cada nodo es una ruta (o una
// lectura) y cada arista marca la progresión: «si la primera no está, paso a la
// segunda». Sirve para el árbol de pases clásico numerado 1-9, para una
// progresión del mariscal o para un árbol de decisión contra coberturas.
//
// DOS CONSUMIDORES DEL MISMO LAYOUT:
//   1. `renderTreeSVG` dibuja el árbol en pantalla (editor de tree-ui).
//   2. `layoutTree` es la fuente de verdad para el PDF vectorial: devuelve
//      posiciones ABSOLUTAS en unidades abstractas (~pt), con `routePoints` ya
//      transformados y `edges[].points` listos para trazar. Ni un solo dato
//      depende de un `transform` de SVG: todo vive en coordenadas absolutas.
//
// SISTEMA DE COORDENADAS: igual que el resto de la app (yardas). Para el
// mini-diagrama de cada nodo, el punto (0, 0) es la alineación del receptor y
// +y es campo profundo. La ruta se dibuja desde el borde inferior del recuadro.
//
// REGLAS: cero dependencias, funciones puras, importable en Node sin DOM,
// español de España, sin emojis. NO se importa `renderer.js` (solo se copia su
// lenguaje visual: polilínea fina, punta de flecha rellena, línea de scrimmage
// tenue).
//
// CONVENCIÓN DE MUTABILIDAD: `addNode`, `removeNode`, `updateNode` y `moveNode`
// son INMUTABLES: devuelven un árbol nuevo y nunca modifican el de entrada.
// ============================================================================

import { uid } from './model.js';
import { getRoute } from './presets.js';

/** Reexportado del modelo para que los consumidores no importen dos módulos. */
export { uid };

/**
 * @typedef {{x:number, y:number}} Pt
 * @typedef {{
 *   id:string, parentId:string|null,
 *   number:string, title:string, subtitle:string,
 *   kind:'root'|'route'|'read'|'concept',
 *   routeId:string|null, points:Pt[], depth:number,
 *   notes:string, color:string|null
 * }} TreeNode
 * @typedef {{
 *   id:string, name:string, kind:'passing'|'progression'|'concept'|'coverage',
 *   orientation:'horizontal'|'vertical', nodes:TreeNode[], notes:string,
 *   meta:{createdAt:number, updatedAt:number}
 * }} RouteTree
 */

// ---------------------------------------------------------------------------
// 1. Constantes de dominio
// ---------------------------------------------------------------------------

/** Tipos de árbol y su orientación por defecto. */
export const TREE_KINDS = {
  passing: {
    label: 'Árbol de pases',
    desc: 'Árbol de pases numerado: lectura de dentro hacia fuera; si una ruta no está, se pasa a la siguiente.',
    orientation: 'horizontal',
    defaultName: 'Árbol de pases',
  },
  progression: {
    label: 'Progresión del mariscal',
    desc: 'Lecturas ordenadas del QB: de la más larga a la válvula, con la condición que abre cada rama.',
    orientation: 'vertical',
    defaultName: 'Progresión del QB',
  },
  concept: {
    label: 'Árbol de concepto',
    desc: 'Variantes del mismo concepto contra hombre y contra zona, con sus ajustes.',
    orientation: 'vertical',
    defaultName: 'Árbol de concepto',
  },
  coverage: {
    label: 'Árbol contra coberturas',
    desc: 'Árbol de decisión por cobertura: primero se lee hombre o zona y después la respuesta.',
    orientation: 'vertical',
    defaultName: 'Árbol contra coberturas',
  },
};

/** Paleta de los dos temas obligatorios. Colores inline: no dependen del CSS. */
export const TREE_THEMES = {
  dark: {
    bg: '#070b0e',
    surface: '#0b1116',
    node: '#0f191f',
    border: '#1f303a',
    borderStrong: '#2a3f4b',
    ink: '#eef6f2',
    inkSoft: '#b9cbd3',
    muted: '#7d939e',
    faint: '#566b75',
    accent: '#9ae63f',
    accentInk: '#0a1206',
    edge: '#2f4a3c',
    edgeArrow: '#4d7a3f',
    route: '#f0fff6',
    los: '#eafff2',
    routeArea: 'rgba(240,255,246,0.03)',
    routeAreaBorder: 'rgba(240,255,246,0.08)',
    selection: '#9ae63f',
    kind: { root: '#9ae63f', route: '#8ee6ff', read: '#ffd166', concept: '#d7a8ff' },
    kindInk: { root: '#0a1206', route: '#06141a', read: '#1a1206', concept: '#140a1e' },
  },
  print: {
    bg: '#ffffff',
    surface: '#ffffff',
    node: '#ffffff',
    border: '#111827',
    borderStrong: '#111827',
    ink: '#111827',
    inkSoft: '#1f2937',
    muted: '#4b5563',
    faint: '#6b7280',
    accent: '#111827',
    accentInk: '#ffffff',
    edge: '#111827',
    edgeArrow: '#111827',
    route: '#111827',
    los: '#111827',
    routeArea: '#f9fafb',
    routeAreaBorder: '#111827',
    selection: '#111827',
    kind: { root: '#111827', route: '#111827', read: '#111827', concept: '#111827' },
    kindInk: { root: '#ffffff', route: '#ffffff', read: '#ffffff', concept: '#ffffff' },
  },
};

const NODE_KIND_LIST = ['root', 'route', 'read', 'concept'];
const ORIENTATIONS = ['horizontal', 'vertical'];

// Métricas tipográficas internas (unidades abstractas, ~pt; independientes del CSS).
const TITLE_FONT = 11;
const TITLE_LINE = 12;
const SUB_FONT = 8.5;
const SUB_LINE = 10.5;
const NOTE_FONT = 8;
const NOTE_LINE = 9.5;
const MAX_TITLE_LINES = 2;
const MAX_SUB_LINES = 2;
const MAX_NOTE_LINES = 3;
const CHAR_W = 0.54; // anchura media estimada de carácter / tamaño de fuente
const NODE_TEXT_PAD = 12;
const NODE_BOTTOM_PAD = 12;
const ROUTE_TEXT_GAP = 6; // aire mínimo entre la última línea de texto y el routeBox
const FONT_STACK = "Inter, 'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// ---------------------------------------------------------------------------
// 2. Utilidades numéricas y de saneado
// ---------------------------------------------------------------------------

const r2 = (value) => {
  const n = Math.round(Number(value) * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
};

const finite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function sanitizeColor(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return HEX_RE.test(clean) ? clean.toLowerCase() : null;
}

function sanitizeKind(value, fallback = 'route') {
  return NODE_KIND_LIST.includes(value) ? value : fallback;
}

function resolveRouteId(value) {
  const route = getRoute(value);
  return route ? route.id : null;
}

function sanitizePoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
    .map((p) => ({ x: r2(Number(p.x)), y: r2(Number(p.y)) }));
}

/** Puntos de ruta de un nodo: routeId tiene prioridad sobre `points`. */
function resolveNodePoints(node) {
  const target = typeof node === 'string' ? { routeId: node } : node;
  if (!target || typeof target !== 'object') return [];
  const route = getRoute(target.routeId);
  if (route) return route.points.map((p) => ({ x: r2(p.x), y: r2(p.y) }));
  return sanitizePoints(target.points);
}

function maxRouteDepth(route) {
  if (!route || !Array.isArray(route.points) || !route.points.length) return 0;
  return Math.max(...route.points.map((p) => finite(p.y, 0)));
}

function compareText(a, b) {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function compareNumbers(a, b) {
  const na = parseInt(String(a ?? ''), 10);
  const nb = parseInt(String(b ?? ''), 10);
  const fa = Number.isFinite(na);
  const fb = Number.isFinite(nb);
  if (fa && fb && na !== nb) return na - nb;
  if (fa && !fb) return -1;
  if (!fa && fb) return 1;
  return compareText(a, b);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ellipsize(text, maxChars) {
  const clean = String(text ?? '');
  if (clean.length <= maxChars) return clean;
  if (maxChars <= 1) return '…';
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Parte un texto en líneas de como mucho `maxChars` caracteres (estimación por
 * anchura media de carácter, suficiente y determinista sin DOM). Si no cabe en
 * `maxLines`, la última línea termina en puntos suspensivos.
 */
function wrapText(text, maxChars, maxLines = 1) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const limit = Math.max(4, Math.floor(maxChars));
  const words = [];
  for (const raw of clean.split(' ')) {
    if (raw.length <= limit) {
      words.push(raw);
      continue;
    }
    let rest = raw;
    while (rest.length > limit) {
      words.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    if (rest) words.push(rest);
  }
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = ellipsize(lines[maxLines - 1], limit);
      return lines;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = ellipsize(lines[maxLines - 1], limit);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 3. Índice del árbol (padres, hijos, raíz)
// ---------------------------------------------------------------------------

function treeNodes(tree) {
  return tree && Array.isArray(tree.nodes) ? tree.nodes : [];
}

function findNode(tree, id) {
  return treeNodes(tree).find((node) => node.id === id) || null;
}

function findRoot(tree) {
  const nodes = treeNodes(tree);
  return nodes.find((node) => !node.parentId) || nodes[0] || null;
}

function indexTree(tree) {
  const nodes = treeNodes(tree);
  const byId = new Map();
  const children = new Map();
  for (const node of nodes) {
    byId.set(node.id, node);
    children.set(node.id, []);
  }
  let root = null;
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (!parent || parent === node) {
      if (!root) root = node;
      continue;
    }
    children.get(parent.id).push(node);
  }
  if (!root && nodes.length) root = nodes[0];
  return { nodes, byId, children, root };
}

function assertTreeUsable(tree, who) {
  if (!tree || typeof tree !== 'object' || !Array.isArray(tree.nodes)) {
    throw new Error(`${who}: árbol inválido`);
  }
  if (!findRoot(tree)) throw new Error(`${who}: el árbol no tiene raíz`);
}

// ---------------------------------------------------------------------------
// 4. Creación, clonado y normalización
// ---------------------------------------------------------------------------

function rootNode(kind, notes) {
  return {
    id: uid('n'),
    parentId: null,
    number: '0',
    title: 'Inicio',
    subtitle: 'Punto de partida del árbol',
    kind: 'root',
    routeId: null,
    points: [],
    depth: 0,
    notes: notes || '',
    color: null,
  };
}

/** Crea un árbol vacío (solo con el nodo raíz). */
export function createTree(kind = 'passing', name) {
  const info = TREE_KINDS[kind] || TREE_KINDS.passing;
  const resolvedKind = TREE_KINDS[kind] ? kind : 'passing';
  const now = Date.now();
  return {
    id: uid('tree'),
    name: String(name ?? info.defaultName).trim() || info.defaultName,
    kind: resolvedKind,
    orientation: info.orientation,
    nodes: [rootNode(resolvedKind, info.desc)],
    notes: info.desc,
    meta: { createdAt: now, updatedAt: now },
  };
}

/** Copia profunda de un árbol (conserva ids y metadatos; no reindexa nada). */
export function cloneTree(tree) {
  const src = tree && typeof tree === 'object' ? tree : {};
  const nodes = treeNodes(src).map((node) => ({
    ...node,
    points: Array.isArray(node.points) ? node.points.map((p) => ({ x: finite(p.x), y: finite(p.y) })) : [],
  }));
  const meta = src.meta && typeof src.meta === 'object' ? src.meta : {};
  return {
    ...src,
    nodes,
    meta: { createdAt: finite(meta.createdAt, Date.now()), updatedAt: finite(meta.updatedAt, Date.now()) },
  };
}

/**
 * Valida y migra datos que vienen de disco o de la URL. Lanza si el objeto es
 * irreconocible. Es idempotente: `normalizeTree(normalizeTree(x))` ===
 * `normalizeTree(x)`. Los nodos huérfanos o con ciclos se reenganchan a la raíz
 * para que el árbol nunca pueda colgar una disposición.
 */
export function normalizeTree(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Árbol inválido: se esperaba un objeto');
  if (!Array.isArray(raw.nodes)) throw new Error('Árbol inválido: falta la lista de nodos');
  if (!raw.nodes.length) throw new Error('Árbol inválido: no tiene nodos');

  const rawNodes = raw.nodes;
  const count = rawNodes.length;
  const ids = [];
  const seen = new Set();
  for (let i = 0; i < count; i += 1) {
    const item = rawNodes[i];
    let id = item && typeof item.id === 'string' && item.id.trim() ? item.id.trim() : uid('n');
    while (seen.has(id)) id = uid('n');
    seen.add(id);
    ids.push(id);
  }

  const firstIndexById = new Map();
  for (let i = 0; i < count; i += 1) {
    const original = rawNodes[i] && typeof rawNodes[i].id === 'string' ? rawNodes[i].id.trim() : '';
    if (original && !firstIndexById.has(original)) firstIndexById.set(original, i);
  }

  let rootIndex = rawNodes.findIndex((item) => !item || !item.parentId);
  if (rootIndex < 0) rootIndex = 0;
  const rootId = count ? ids[rootIndex] : null;

  const kind = TREE_KINDS[raw.kind] ? raw.kind : 'passing';
  const orientation = ORIENTATIONS.includes(raw.orientation) ? raw.orientation : TREE_KINDS[kind].orientation;
  const now = Date.now();

  const parentIndexes = new Array(count).fill(-1);
  for (let i = 0; i < count; i += 1) {
    if (i === rootIndex) continue;
    const item = rawNodes[i] || {};
    const rawParent = typeof item.parentId === 'string' ? item.parentId.trim() : '';
    const parentIndex = rawParent ? firstIndexById.get(rawParent) : undefined;
    if (parentIndex === undefined || parentIndex === i) {
      parentIndexes[i] = rootIndex;
    } else {
      parentIndexes[i] = parentIndex;
    }
  }

  // Rompe ciclos: si subiendo por los padres se vuelve al nodo, se engancha a la raíz.
  for (let i = 0; i < count; i += 1) {
    if (i === rootIndex) continue;
    const visited = new Set([i]);
    let cursor = parentIndexes[i];
    while (cursor >= 0 && cursor !== rootIndex) {
      if (visited.has(cursor)) {
        parentIndexes[i] = rootIndex;
        break;
      }
      visited.add(cursor);
      cursor = parentIndexes[cursor];
    }
  }

  const nodes = rawNodes.map((item, index) => {
    const src = item && typeof item === 'object' ? item : {};
    const isRoot = index === rootIndex;
    const routeId = resolveRouteId(src.routeId);
    const route = routeId ? getRoute(routeId) : null;
    const depthFallback = route ? maxRouteDepth(route) : 0;
    const parentIndex = parentIndexes[index];
    return {
      id: ids[index],
      parentId: isRoot || parentIndex < 0 ? null : ids[parentIndex],
      number: String(src.number ?? '').trim(),
      title: String(src.title ?? '').trim() || (isRoot && count ? 'Inicio' : 'Nodo'),
      subtitle: String(src.subtitle ?? '').trim(),
      kind: sanitizeKind(src.kind, isRoot ? 'root' : 'route'),
      routeId,
      points: sanitizePoints(src.points),
      depth: r2(clamp(finite(src.depth, depthFallback), 0, 60)),
      notes: String(src.notes ?? ''),
      color: sanitizeColor(src.color),
    };
  });

  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const createdAt = finite(meta.createdAt, now);
  const updatedAt = finite(meta.updatedAt, createdAt);

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : uid('tree'),
    name: String(raw.name ?? TREE_KINDS[kind].defaultName).trim() || TREE_KINDS[kind].defaultName,
    kind,
    orientation,
    nodes,
    notes: String(raw.notes ?? ''),
    meta: { createdAt, updatedAt },
  };
}

// ---------------------------------------------------------------------------
// 5. Estadísticas y esquema
// ---------------------------------------------------------------------------

/** Resumen numérico del árbol. `maxDepth` son niveles (la raíz cuenta como 1). */
export function treeStats(tree) {
  const nodes = treeNodes(tree);
  const { children, root } = indexTree(tree);
  const depths = new Map();
  if (root) {
    const walk = (node, level) => {
      if (depths.has(node.id)) return;
      depths.set(node.id, level);
      for (const child of children.get(node.id) || []) walk(child, level + 1);
    };
    walk(root, 1);
  }
  let leaves = 0;
  let branches = 0;
  let maxDepth = 0;
  let totalYards = 0;
  for (const node of nodes) {
    const kids = children.get(node.id) || [];
    if (!kids.length) leaves += 1;
    if (kids.length >= 2) branches += 1;
    const level = depths.get(node.id) || 0;
    if (level > maxDepth) maxDepth = level;
    if (node.parentId) totalYards += finite(node.depth, 0);
  }
  return { nodes: nodes.length, leaves, maxDepth, branches, totalYards: r2(totalYards) };
}

/** Esquema en orden de recorrido previo: número, título y si tiene hijos. */
export function treeOutline(tree) {
  const { children, root } = indexTree(tree);
  const outline = [];
  if (!root) return outline;
  const visited = new Set();
  const walk = (node, level) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    outline.push({
      id: node.id,
      depth: level,
      number: node.number,
      title: node.title,
      hasChildren: (children.get(node.id) || []).length > 0,
    });
    for (const child of children.get(node.id) || []) walk(child, level + 1);
  };
  walk(root, 1);
  return outline;
}

/** Puntos de ruta de un nodo (acepta el nodo o su id). Yardas relativas. */
export function nodeRoute(tree, node) {
  const target = typeof node === 'string' ? findNode(tree, node) : node;
  return resolveNodePoints(target);
}

// ---------------------------------------------------------------------------
// 6. Edición inmutable
// ---------------------------------------------------------------------------

function bump(tree) {
  const next = cloneTree(tree);
  next.meta = { ...next.meta, updatedAt: Date.now() };
  return next;
}

function nextNumber(siblings) {
  let max = 0;
  for (const sibling of siblings) {
    const value = parseInt(String(sibling.number ?? ''), 10);
    if (Number.isFinite(value)) max = Math.max(max, value);
  }
  return String(max + 1);
}

/**
 * Añade un nodo hijo. `partial` puede traer number, title, subtitle, kind,
 * routeId, points, depth, notes y color; lo que falte se deduce de la ruta.
 * Devuelve `{ tree, node }` con el árbol NUEVO (no muta el original).
 */
export function addNode(tree, parentId, partial = {}) {
  assertTreeUsable(tree, 'addNode');
  const parent = findNode(tree, parentId);
  if (!parent) throw new Error(`addNode: no existe el nodo padre «${parentId}»`);
  const src = partial && typeof partial === 'object' ? partial : {};
  const siblings = treeNodes(tree).filter((node) => node.parentId === parentId);
  const routeId = resolveRouteId(src.routeId);
  const route = routeId ? getRoute(routeId) : null;
  const points = sanitizePoints(src.points);
  const depthFallback = route ? maxRouteDepth(route) : points.length ? Math.max(...points.map((p) => p.y)) : 12;
  const depth = r2(clamp(finite(src.depth, depthFallback), 0, 60));
  const node = {
    id: uid('n'),
    parentId,
    number: src.number != null && String(src.number).trim() ? String(src.number).trim() : nextNumber(siblings),
    title: String(src.title ?? '').trim() || 'Ruta nueva',
    subtitle: String(src.subtitle ?? '').trim() || (route ? `${r2(depth)} yd · ${route.name}` : ''),
    kind: sanitizeKind(src.kind, 'route'),
    routeId,
    points,
    depth,
    notes: String(src.notes ?? ''),
    color: sanitizeColor(src.color),
  };
  const next = bump(tree);
  next.nodes.push(node);
  return { tree: next, node };
}

/** Elimina un nodo y todo su subárbol. La raíz no se puede eliminar. */
export function removeNode(tree, id) {
  assertTreeUsable(tree, 'removeNode');
  const root = findRoot(tree);
  if (!id) throw new Error('removeNode: hace falta el id del nodo');
  if (root && root.id === id) throw new Error('removeNode: no se puede eliminar la raíz del árbol');
  if (!findNode(tree, id)) return cloneTree(tree);
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of treeNodes(tree)) {
      if (node.parentId && doomed.has(node.parentId) && !doomed.has(node.id)) {
        doomed.add(node.id);
        grew = true;
      }
    }
  }
  const next = bump(tree);
  next.nodes = next.nodes.filter((node) => !doomed.has(node.id));
  return next;
}

/** Actualiza campos editables de un nodo. Los campos vacíos se sanean. */
export function updateNode(tree, id, patch = {}) {
  assertTreeUsable(tree, 'updateNode');
  const next = bump(tree);
  const index = next.nodes.findIndex((node) => node.id === id);
  if (index < 0) throw new Error(`updateNode: no existe el nodo «${id}»`);
  const node = next.nodes[index];
  const src = patch && typeof patch === 'object' ? patch : {};
  if (src.number !== undefined) node.number = String(src.number ?? '').trim();
  if (src.title !== undefined) node.title = String(src.title ?? '').trim() || 'Nodo';
  if (src.subtitle !== undefined) node.subtitle = String(src.subtitle ?? '').trim();
  if (src.kind !== undefined) node.kind = sanitizeKind(src.kind, node.kind);
  if (src.routeId !== undefined) node.routeId = resolveRouteId(src.routeId);
  if (src.points !== undefined) node.points = sanitizePoints(src.points);
  if (src.depth !== undefined) node.depth = r2(clamp(finite(src.depth, node.depth), 0, 60));
  if (src.notes !== undefined) node.notes = String(src.notes ?? '');
  if (src.color !== undefined) node.color = sanitizeColor(src.color);
  next.nodes[index] = node;
  return next;
}

/**
 * Mueve un nodo (con su subárbol) a otro padre. Evita ciclos: mover un nodo
 * dentro de su propio subárbol lanza un error; moverlo a su mismo padre es
 * un no-op que devuelve una copia.
 */
export function moveNode(tree, id, newParentId) {
  assertTreeUsable(tree, 'moveNode');
  if (!id || !newParentId) throw new Error('moveNode: hacen falta el nodo y el nuevo padre');
  const root = findRoot(tree);
  if (root && root.id === id) throw new Error('moveNode: la raíz no se puede mover');
  const node = findNode(tree, id);
  if (!node) throw new Error(`moveNode: no existe el nodo «${id}»`);
  if (!findNode(tree, newParentId)) throw new Error(`moveNode: no existe el nodo padre «${newParentId}»`);
  if (newParentId === id) throw new Error('moveNode: un nodo no puede ser su propio padre');
  const parentOf = new Map(treeNodes(tree).map((n) => [n.id, n.parentId]));
  const seen = new Set();
  let cursor = newParentId;
  while (cursor) {
    if (cursor === id) throw new Error('moveNode: no se puede mover un nodo dentro de su propio subárbol');
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = parentOf.get(cursor) || null;
  }
  if (node.parentId === newParentId) return cloneTree(tree);
  const next = bump(tree);
  const moved = next.nodes.find((n) => n.id === id);
  moved.parentId = newParentId;
  return next;
}

// ---------------------------------------------------------------------------
// 6 bis. Edición de la estructura desde la interfaz: orden de hermanos,
//        cambio de padre y edición de la ruta del nodo punto a punto.
//        El orden de los hijos lo marca el orden del array `nodes`.
// ---------------------------------------------------------------------------

/** Hermanos de un nodo (o hijos de un padre) en el orden del array. */
function siblingsList(tree, parentId) {
    const list = treeNodes(tree).filter((node) => (node.parentId || null) === (parentId || null));
    return list;
}

/** Índice del nodo dentro de la lista de sus hermanos, o -1. */
export function siblingIndex(tree, id) {
    assertTreeUsable(tree, 'siblingIndex');
    const node = findNode(tree, id);
    if (!node) return -1;
    return siblingsList(tree, node.parentId).findIndex((n) => n.id === id);
}

/** Mueve el nodo a una posición concreta entre sus hermanos (0 = primero). */
export function reorderNode(tree, id, targetIndex) {
    assertTreeUsable(tree, 'reorderNode');
    const node = findNode(tree, id);
    if (!node) throw new Error(`reorderNode: no existe el nodo «${id}»`);
    if (!node.parentId) return cloneTree(tree); // la raíz manda siempre
    const siblings = siblingsList(tree, node.parentId);
    const from = siblings.findIndex((n) => n.id === id);
    if (from < 0) return cloneTree(tree);
    const to = Math.max(0, Math.min(siblings.length - 1, Math.round(Number(targetIndex) || 0)));
    if (to === from) return cloneTree(tree);

    const next = bump(tree);
    const arrayIndex = next.nodes.findIndex((n) => n.id === id);
    const [moved] = next.nodes.splice(arrayIndex, 1);
    // Posición en el array del hermano que debe quedar justo después del movido.
    const ordered = siblings.filter((n) => n.id !== id);
    const anchorNode = ordered[to] || null;
    if (anchorNode) {
        const anchorIndex = next.nodes.findIndex((n) => n.id === anchorNode.id);
        next.nodes.splice(anchorIndex, 0, moved);
    } else {
        // Va al final: después del último hermano.
        const last = ordered[ordered.length - 1];
        const lastIndex = last ? next.nodes.findIndex((n) => n.id === last.id) : next.nodes.length - 1;
        next.nodes.splice(lastIndex + 1, 0, moved);
    }
    return next;
}

/** Sube el nodo una posición entre sus hermanos. */
export function moveNodeUp(tree, id) {
    const index = siblingIndex(tree, id);
    if (index <= 0) return cloneTree(tree);
    return reorderNode(tree, id, index - 1);
}

/** Baja el nodo una posición entre sus hermanos. */
export function moveNodeDown(tree, id) {
    const index = siblingIndex(tree, id);
    if (index < 0) return cloneTree(tree);
    const total = siblingsList(tree, findNode(tree, id).parentId).length;
    if (index >= total - 1) return cloneTree(tree);
    return reorderNode(tree, id, index + 1);
}

/** Cambia un nodo de padre y, opcionalmente, de posición entre sus nuevos hermanos. */
export function reparentNode(tree, id, newParentId, targetIndex = -1) {
    assertTreeUsable(tree, 'reparentNode');
    if (!newParentId) throw new Error('reparentNode: hace falta el nuevo padre');
    const moved = moveNode(tree, id, newParentId); // ya valida ciclos y existencia
    if (targetIndex < 0) return moved;
    return reorderNode(moved, id, targetIndex);
}

/** Ruta del nodo en YARDAS locales (relativas a su origen), resueltas desde routeId o points. */
export function nodeRouteYards(tree, nodeOrId) {
    const node = typeof nodeOrId === 'string' ? findNode(tree, nodeOrId) : nodeOrId;
    return sanitizePoints(resolveNodePoints(node));
}

/** Escribe la ruta del nodo en yardas locales. Deja de usar la plantilla (routeId). */
export function setNodeRoute(tree, id, points, extra = {}) {
    assertTreeUsable(tree, 'setNodeRoute');
    const node = findNode(tree, id);
    if (!node) throw new Error(`setNodeRoute: no existe el nodo «${id}»`);
    const next = bump(tree);
    const target = next.nodes.find((n) => n.id === id);
    target.points = sanitizePoints(points);
    target.routeId = null;
    if (extra && typeof extra === 'object') {
        if (extra.depth !== undefined) target.depth = Math.max(0, Math.min(60, Number(extra.depth) || 0));
    }
    return next;
}

/** Añade un punto al final de la ruta (en yardas locales). */
export function appendRoutePoint(tree, id, point) {
    const current = nodeRouteYards(tree, id);
    return setNodeRoute(tree, id, [...current, { x: Number(point.x) || 0, y: Number(point.y) || 0 }]);
}

/** Borra la ruta del nodo (queda «Sin ruta», sin plantilla). */
export function clearNodeRoute(tree, id) {
    return setNodeRoute(tree, id, []);
}

/** Voltea la ruta del nodo en horizontal (espejo). */
export function mirrorNodeRoute(tree, id) {
    const current = nodeRouteYards(tree, id);
    return setNodeRoute(tree, id, current.map((p) => ({ x: -p.x, y: p.y })));
}

// ---------------------------------------------------------------------------
// 7. Disposición (layout): árbol ordenado, sin solapes, en coordenadas absolutas
// ---------------------------------------------------------------------------

const LAYOUT_DEFAULTS = {
  nodeW: 170,
  nodeH: 112,
  gapX: 56,
  gapY: 26,
  padding: 26,
  routeArea: { x: 10, y: 40, w: 150, h: 60 },
};

const ELBOW_EPS = 0.01;

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Reparte `total` elementos en `groups` grupos lo más iguales posible. */
function distributeGroups(total, groups) {
  const out = [];
  const base = Math.floor(total / groups);
  const extra = total % groups;
  let index = 0;
  for (let g = 0; g < groups; g += 1) {
    const size = base + (g < extra ? 1 : 0);
    const list = [];
    for (let k = 0; k < size; k += 1) list.push(index++);
    out.push(list);
  }
  return out;
}

/**
 * Plan de reparto de un árbol en estrella (raíz + hojas) en varias columnas
 * (horizontal) o filas (vertical). Solo se usa cuando las hojas son hijas
 * directas de la raíz: así ninguna rama puede chocar con la columna siguiente.
 *
 * - `limit`: altura máxima de columna (`maxColumnHeight`) o anchura máxima de
 *   fila (`maxRowWidth`).
 * - `forcedGroups`: número explícito de columnas/filas (`columns`).
 * - `groupSize`: hojas por columna/fila (`rowsPerColumn`).
 */
function planStarGroups({ root, kids, orientation, metrics, nodeW, gapX, gapY, padding, limit, forcedGroups, groupSize, groupGap }) {
  const total = kids.length;
  if (total < 2) return null;
  const horizontal = orientation === 'horizontal';
  const stackGap = horizontal ? gapY : gapX; // separación entre hojas apiladas
  const sizes = kids.map((kid) => (horizontal ? metrics.get(kid.id).h : nodeW));
  const natural = sizes.reduce((sum, size) => sum + size, 0) + stackGap * (total - 1);

  let groups = null;
  if (forcedGroups) {
    const count = Math.max(1, Math.min(total, Math.round(forcedGroups)));
    if (count < 2) return null;
    groups = distributeGroups(total, count);
  } else if (groupSize) {
    const perGroup = Math.max(1, Math.min(total, Math.round(groupSize)));
    if (perGroup >= total) return null;
    groups = [];
    for (let i = 0; i < total; i += perGroup) {
      const list = [];
      for (let k = i; k < Math.min(total, i + perGroup); k += 1) list.push(k);
      groups.push(list);
    }
    if (groups.length < 2) return null;
  } else if (limit) {
    if (natural <= limit + 1e-9) return null;
    const count = Math.max(2, Math.min(total, Math.round(natural / limit)));
    groups = distributeGroups(total, count);
  } else {
    return null;
  }
  if (!groups || groups.length < 2) return null;

  const rootH = metrics.get(root.id).h;
  const gapGroup = Math.max(8, groupGap || (horizontal ? gapX : gapY));
  const positions = new Map();
  const groupOf = new Map();

  if (horizontal) {
    const extents = groups.map(
      (list) => list.reduce((sum, index) => sum + sizes[index], 0) + stackGap * (list.length - 1)
    );
    const block = Math.max(rootH, ...extents);
    positions.set(root.id, { x: padding, y: padding + block / 2 - rootH / 2 });
    groups.forEach((list, groupIndex) => {
      const x = padding + nodeW + gapX + groupIndex * (nodeW + gapGroup);
      let cursor = padding + (block - extents[groupIndex]) / 2;
      for (const index of list) {
        const height = metrics.get(kids[index].id).h;
        positions.set(kids[index].id, { x, y: cursor });
        groupOf.set(kids[index].id, groupIndex);
        cursor += height + stackGap;
      }
    });
    return {
      positions,
      groupOf,
      orientation,
      contentW: nodeW + gapX + groups.length * nodeW + (groups.length - 1) * gapGroup,
      contentH: block + gapY / 2,
      midX: padding + nodeW + gapX / 2,
      routeY: padding + block + gapY / 2,
      groupGap: gapGroup,
    };
  }

  const rowWidths = groups.map((list) => list.length * nodeW + stackGap * (list.length - 1));
  const block = Math.max(nodeW, ...rowWidths);
  positions.set(root.id, { x: padding + block / 2 - nodeW / 2, y: padding });
  const rowTop = [];
  const aisleY = [];
  let cursorY = padding + rootH + gapY;
  groups.forEach((list, groupIndex) => {
    const rowH = Math.max(...list.map((index) => metrics.get(kids[index].id).h));
    rowTop.push(cursorY);
    aisleY.push(groupIndex === 0 ? cursorY : cursorY - gapGroup / 2);
    let cursorX = padding + (block - rowWidths[groupIndex]) / 2;
    for (const index of list) {
      positions.set(kids[index].id, { x: cursorX, y: cursorY });
      groupOf.set(kids[index].id, groupIndex);
      cursorX += nodeW + stackGap;
    }
    cursorY += rowH + gapGroup;
  });
  return {
    positions,
    groupOf,
    orientation,
    contentW: block + gapX / 2,
    contentH: cursorY - gapGroup - padding,
    midY: padding + rootH + gapY / 2,
    routeX: padding + block + gapX / 2,
    aisleY,
    groupGap,
  };
}

/** Arista de la raíz a una hoja en un reparto multicolumna/multifila. */
function starEdgePoints(plan, parent, child, gapX, gapY) {
  const groupIndex = plan.groupOf.get(child.id) || 0;
  if (groupIndex === 0) return elbowPoints(parent, child, plan.orientation, gapX, gapY);
  if (plan.orientation === 'horizontal') {
    const exit = { x: parent.x + parent.w, y: parent.y + parent.h / 2 };
    const entry = { x: child.x, y: child.y + child.h / 2 };
    const routeX = child.x - plan.groupGap / 2;
    return [
      exit,
      { x: plan.midX, y: exit.y },
      { x: plan.midX, y: plan.routeY },
      { x: routeX, y: plan.routeY },
      { x: routeX, y: entry.y },
      entry,
    ];
  }
  const exit = { x: parent.x + parent.w / 2, y: parent.y + parent.h };
  const entry = { x: child.x + child.w / 2, y: child.y };
  const aisle = plan.aisleY[groupIndex];
  return [
    exit,
    { x: exit.x, y: plan.midY },
    { x: plan.routeX, y: plan.midY },
    { x: plan.routeX, y: aisle },
    { x: entry.x, y: aisle },
    entry,
  ];
}

function elbowPoints(parent, child, orientation, gapX, gapY) {
  if (orientation === 'horizontal') {
    const exit = { x: parent.x + parent.w, y: parent.y + parent.h / 2 };
    const entry = { x: child.x, y: child.y + child.h / 2 };
    if (Math.abs(exit.y - entry.y) < ELBOW_EPS) return [exit, entry];
    const midX = exit.x + gapX / 2;
    return [exit, { x: midX, y: exit.y }, { x: midX, y: entry.y }, entry];
  }
  const exit = { x: parent.x + parent.w / 2, y: parent.y + parent.h };
  const entry = { x: child.x + child.w / 2, y: child.y };
  if (Math.abs(exit.x - entry.x) < ELBOW_EPS) return [exit, entry];
  const midY = exit.y + gapY / 2;
  return [exit, { x: exit.x, y: midY }, { x: entry.x, y: midY }, entry];
}

/**
 * Calcula la disposición del árbol. Las hojas se apilan sin solaparse y cada
 * padre queda centrado respecto de sus hijos. Todo son coordenadas absolutas
 * dentro del diagrama: `routePoints` y `edges[].points` se pueden trazar tal
 * cual en un PDF vectorial. `legend` es datos (sin geometría) para que el
 * consumidor la coloque donde quiera debajo del árbol.
 */
export function layoutTree(tree, opts = {}) {
  const source = normalizeTree(tree);
  const options = opts && typeof opts === 'object' ? opts : {};
  const nodeW = Math.max(80, finite(options.nodeW, LAYOUT_DEFAULTS.nodeW));
  const nodeH = Math.max(60, finite(options.nodeH, LAYOUT_DEFAULTS.nodeH));
  const gapX = Math.max(8, finite(options.gapX, LAYOUT_DEFAULTS.gapX));
  const gapY = Math.max(8, finite(options.gapY, LAYOUT_DEFAULTS.gapY));
  const padding = Math.max(0, finite(options.padding, LAYOUT_DEFAULTS.padding));
  const showNotes = options.showNotes === true;
  const sortChildren = options.sortChildren === true;
    // Nodo cuya ruta se está editando: se dibuja con una escala FIJA para que
    // arrastrar un punto no reencuadre el dibujo en cada movimiento.
    const editRouteId = options.editRouteId ? String(options.editRouteId) : null;
    const forcedEditScale = Number(options.editScale) > 0 ? Number(options.editScale) : null;
  const orientation = ORIENTATIONS.includes(options.orientation)
    ? options.orientation
    : ORIENTATIONS.includes(source.orientation)
      ? source.orientation
      : 'horizontal';

  const rawArea = options.routeArea && typeof options.routeArea === 'object' ? options.routeArea : LAYOUT_DEFAULTS.routeArea;
  const areaW = clamp(finite(rawArea.w, 150), 24, Math.max(24, nodeW - 8));
  const areaX = clamp(finite(rawArea.x, 10), 2, Math.max(2, nodeW - areaW - 2));
  const areaY = Math.max(8, finite(rawArea.y, 40));
  const areaH = Math.max(24, finite(rawArea.h, 60));
  const routeArea = { x: areaX, y: areaY, w: areaW, h: areaH };

  const nodes = source.nodes;
  const { children, root } = indexTree(source);
  if (!root) throw new Error('layoutTree: el árbol no tiene raíz');

  if (sortChildren) {
    for (const list of children.values()) {
      list.sort((a, b) => compareNumbers(a.number, b.number) || compareText(a.title, b.title));
    }
  }

  // Niveles (BFS desde la raíz; la raíz es el nivel 1).
  const levelOf = new Map([[root.id, 1]]);
  const queue = [root];
  while (queue.length) {
    const current = queue.shift();
    for (const child of children.get(current.id) || []) {
      if (levelOf.has(child.id)) continue;
      levelOf.set(child.id, levelOf.get(current.id) + 1);
      queue.push(child);
    }
  }

  // Métricas de texto y altura de cada caja (las notas, si se muestran, empujan
  // hacia abajo la zona de la ruta y la caja crece).
  const metrics = new Map();
  const innerW = nodeW - 20;
  const maxCharsTitle = Math.max(8, Math.floor((innerW - 26) / (TITLE_FONT * CHAR_W)));
  const maxCharsSub = Math.max(10, Math.floor((innerW - 26) / (SUB_FONT * CHAR_W)));
  const maxCharsNote = Math.max(10, Math.floor((innerW - 24) / (NOTE_FONT * CHAR_W)));
  for (const node of nodes) {
    const labelLines = wrapText(node.title, maxCharsTitle, MAX_TITLE_LINES);
    const subLines = wrapText(node.subtitle, maxCharsSub, MAX_SUB_LINES);
    const noteLines = showNotes ? wrapText(node.notes, maxCharsNote, MAX_NOTE_LINES) : [];
    const titleBlock = 9 + labelLines.length * TITLE_LINE;
    const subTop = titleBlock + 2;
    const subBottom = subLines.length ? subTop + subLines.length * SUB_LINE : titleBlock;
    const noteTop = subBottom + (subLines.length ? 2 : 0);
    const textBottom = noteLines.length ? noteTop + noteLines.length * NOTE_LINE : subBottom;
    // Hueco real bajo el texto: la caja del mini-diagrama nunca puede pisar la
    // última línea del subtítulo (se mide desde la línea base, no desde el tope).
    const subBaselineGap = subLines.length
      ? subTop + SUB_FONT + subLines.length * SUB_LINE + ROUTE_TEXT_GAP
      : 0;
    const routeRelY = Math.max(routeArea.y, textBottom + 8, subBaselineGap);
    const h = Math.max(nodeH, routeRelY + routeArea.h + NODE_BOTTOM_PAD);
    metrics.set(node.id, {
      labelLines,
      subLines,
      noteLines,
      subTop,
      noteTop,
      routeRelY,
      h,
      labelLinesCount: labelLines.length,
    });
  }

  // Recorrido previo: orden estable de nodos y aristas.
  const ordered = [];
  const walk = (node) => {
    ordered.push(node);
    for (const child of children.get(node.id) || []) walk(child);
  };
  walk(root);

  // Reparto opcional en varias columnas (horizontal) o filas (vertical) para
  // árboles en estrella (raíz + hojas): es el caso de los árboles anchos tipo
  // 1-9. Solo se aplica cuando ninguna hoja tiene hijos, para que las ramas de
  // una columna no puedan invadir la siguiente.
  const rootKids = children.get(root.id) || [];
  const isStar = rootKids.length > 1 && rootKids.every((kid) => (children.get(kid.id) || []).length === 0);
  const splitLimit =
    orientation === 'horizontal'
      ? positiveNumber(options.maxColumnHeight) ?? positiveNumber(options.maxRowWidth)
      : positiveNumber(options.maxRowWidth) ?? positiveNumber(options.maxColumnHeight);
  const forcedGroups = positiveNumber(options.columns);
  const groupSize = positiveNumber(options.rowsPerColumn);
  const groupGapOpt = positiveNumber(options.groupGap);
  const starPlan =
    isStar && (splitLimit || (forcedGroups && forcedGroups >= 2) || groupSize)
      ? planStarGroups({
          root,
          kids: rootKids,
          orientation,
          metrics,
          nodeW,
          gapX,
          gapY,
          padding,
          limit: splitLimit,
          forcedGroups,
          groupSize,
          groupGap: groupGapOpt,
        })
      : null;

  const posOf = new Map();
  let contentW;
  let contentH;
  if (starPlan) {
    contentW = starPlan.contentW;
    contentH = starPlan.contentH;
    for (const [id, point] of starPlan.positions) posOf.set(id, point);
  } else {
    // Extensión de cada subárbol sobre el eje de apilado.
    const horizontal = orientation === 'horizontal';
    const mainSizeOf = (node) => (horizontal ? metrics.get(node.id).h : nodeW);
    const gapMain = horizontal ? gapY : gapX;
    const extent = new Map();
    const measure = (node) => {
      if (extent.has(node.id)) return extent.get(node.id);
      const kids = children.get(node.id) || [];
      const own = mainSizeOf(node);
      if (!kids.length) {
        extent.set(node.id, own);
        return own;
      }
      let total = 0;
      for (let i = 0; i < kids.length; i += 1) {
        total += measure(kids[i]);
        if (i) total += gapMain;
      }
      const value = Math.max(own, total);
      extent.set(node.id, value);
      return value;
    };
    measure(root);

    // Centros en el eje principal: hojas consecutivas y padre centrado en su bloque.
    const centerOf = new Map();
    const place = (node, start) => {
      const kids = children.get(node.id) || [];
      const ext = extent.get(node.id) || mainSizeOf(node);
      let center;
      if (!kids.length) {
        center = start + ext / 2;
      } else {
        let total = 0;
        for (let i = 0; i < kids.length; i += 1) {
          total += extent.get(kids[i].id);
          if (i) total += gapMain;
        }
        let cursor = start + (ext - total) / 2;
        const childCenters = [];
        for (const child of kids) {
          place(child, cursor);
          childCenters.push(centerOf.get(child.id));
          cursor += extent.get(child.id) + gapMain;
        }
        center = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
      }
      centerOf.set(node.id, center);
    };
    place(root, padding);

    const maxLevel = Math.max(1, ...levelOf.values());
    let rowTop = null;
    if (horizontal) {
      contentW = (maxLevel - 1) * (nodeW + gapX) + nodeW;
      contentH = extent.get(root.id) || metrics.get(root.id).h;
    } else {
      const rowHeight = new Array(maxLevel + 1).fill(0);
      for (const node of ordered) {
        const level = levelOf.get(node.id) || 1;
        rowHeight[level] = Math.max(rowHeight[level], metrics.get(node.id).h);
      }
      rowTop = new Array(maxLevel + 1).fill(padding);
      for (let level = 2; level <= maxLevel; level += 1) {
        rowTop[level] = rowTop[level - 1] + rowHeight[level - 1] + gapY;
      }
      contentW = extent.get(root.id) || nodeW;
      contentH = rowTop[maxLevel] + rowHeight[maxLevel] - padding;
    }

    for (const node of ordered) {
      const meta = metrics.get(node.id);
      const level = levelOf.get(node.id) || 1;
      let x;
      let y;
      if (horizontal) {
        x = padding + (level - 1) * (nodeW + gapX);
        y = centerOf.get(node.id) - meta.h / 2;
      } else {
        x = centerOf.get(node.id) - nodeW / 2;
        y = rowTop[level];
      }
      posOf.set(node.id, { x, y });
    }
  }

  const width = padding * 2 + contentW;
  const height = padding * 2 + contentH;

  const outNodes = [];
  const outById = new Map();
  for (const node of ordered) {
    const meta = metrics.get(node.id);
    const level = levelOf.get(node.id) || 1;
    const position = posOf.get(node.id) || { x: padding, y: padding };
    const x = position.x;
    const y = position.y;
    const routeBox = {
      x: r2(x + routeArea.x),
      y: r2(y + meta.routeRelY),
      w: r2(routeArea.w),
      h: r2(routeArea.h),
    };
    let routePoints;
    let editOrigin = null;
    let editScale = null;
    if (editRouteId && editRouteId === node.id) {
        // Escala fija: unidad = yarda, origen en el centro-abajo de la caja.
        const scale =
            forcedEditScale ||
            Math.min(routeBox.h / 24, routeBox.w / 2 / 18);
        editScale = r2(scale);
        editOrigin = { x: r2(routeBox.x + routeBox.w / 2), y: r2(routeBox.y + routeBox.h) };
        routePoints = [{ x: 0, y: 0 }, ...resolveNodePoints(node)].map((p) => ({
            x: r2(editOrigin.x + p.x * scale),
            y: r2(editOrigin.y - p.y * scale),
        }));
    } else {
        routePoints = routeToBox(resolveNodePoints(node), routeBox).map((p) => ({ x: r2(p.x), y: r2(p.y) }));
    }
    const out = {
      id: node.id,
      x: r2(x),
      y: r2(y),
      w: r2(nodeW),
      h: r2(meta.h),
      number: node.number,
      title: node.title,
      subtitle: node.subtitle,
      kind: node.kind,
      color: node.color || null,
      depth: node.depth,
      notes: node.notes,
      level,
      routePoints,
      routeBox,
      editOrigin,
      editScale,
      labelLines: meta.labelLines,
      subLines: meta.subLines,
      noteLines: meta.noteLines,
      labelX: r2(x + 36),
      labelY: r2(y + 9 + TITLE_FONT),
      labelLineHeight: TITLE_LINE,
      subX: r2(x + 36),
      subY: r2(y + meta.subTop + SUB_FONT),
      subLineHeight: SUB_LINE,
      noteX: r2(x + NODE_TEXT_PAD),
      noteY: r2(y + meta.noteTop + NOTE_FONT),
      noteLineHeight: NOTE_LINE,
      hasChildren: (children.get(node.id) || []).length > 0,
    };
    outNodes.push(out);
    outById.set(out.id, out);
  }

  const edges = [];
  for (const node of ordered) {
    const parent = outById.get(node.id);
    for (const child of children.get(node.id) || []) {
      const childOut = outById.get(child.id);
      const points = starPlan
        ? starEdgePoints(starPlan, parent, childOut, gapX, gapY)
        : elbowPoints(parent, childOut, orientation, gapX, gapY);
      edges.push({
        fromId: node.id,
        toId: child.id,
        points: points.map((p) => ({ x: r2(p.x), y: r2(p.y) })),
      });
    }
  }

  const legend = outNodes
    .filter((node) => node.id !== root.id)
    .map((node) => ({ id: node.id, number: node.number, title: node.title, depth: node.depth, notes: node.notes }));

  return {
    width: r2(width),
    height: r2(height),
    orientation,
    nodes: outNodes,
    edges,
    legend,
    bounds: { x: 0, y: 0, width: r2(width), height: r2(height) },
  };
}

/**
 * Coloca una polilínea de ruta (yardas, origen en la alineación) dentro del
 * recuadro del mini-diagrama. La ruta arranca en el borde inferior (o justo por
 * encima si la plantilla empieza por detrás de la línea) y se centra en el
 * recuadro dejando margen. Devuelve el origen incluido como primer punto.
 */
function routeToBox(points, box) {
  const source = sanitizePoints(points);
  const pts = [{ x: 0, y: 0 }, ...source];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const inset = 7;
  const topMargin = 8;
  const availW = Math.max(4, box.w - inset * 2);
  const availH = Math.max(4, box.h - topMargin - 2);
  let fitScale = Infinity;
  if (spanX > 1e-9) fitScale = Math.min(fitScale, availW / spanX);
  if (spanY > 1e-9) fitScale = Math.min(fitScale, availH / spanY);
  if (!Number.isFinite(fitScale) || fitScale <= 0) fitScale = 1;
  // Tope de escala: la miniatura NUNCA agranda por encima de ~24 yardas de alto.
  // Así una ruta corta se ve corta (antes se estiraba y parecía otra ruta).
  const honestScale = Math.min(availH, availW) / 24;
  const scale = Math.min(fitScale, honestScale);
  const bottom = box.y + box.h;
  const centerX = box.x + box.w / 2;
  const boundsCenterX = (minX + maxX) / 2;
  return pts.map((p) => ({
    x: centerX + (p.x - boundsCenterX) * scale,
    y: bottom - (p.y - minY) * scale,
  }));
}

// ---------------------------------------------------------------------------
// 8. Temas y dibujo SVG
// ---------------------------------------------------------------------------

function mergeTheme(base, custom) {
  if (!custom || typeof custom !== 'object') return base;
  return {
    ...base,
    ...custom,
    kind: { ...base.kind, ...(custom.kind || {}) },
    kindInk: { ...base.kindInk, ...(custom.kindInk || {}) },
  };
}

function themeOf(theme) {
  if (typeof theme === 'string' && TREE_THEMES[theme]) return TREE_THEMES[theme];
  if (theme && typeof theme === 'object') return mergeTheme(TREE_THEMES.dark, theme);
  return TREE_THEMES.dark;
}

function arrowSvg(tip, angle, size, color) {
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  const p1 = { x: tip.x + Math.cos(a1) * size, y: tip.y + Math.sin(a1) * size };
  const p2 = { x: tip.x + Math.cos(a2) * size, y: tip.y + Math.sin(a2) * size };
  return `<path d="M ${r2(tip.x)} ${r2(tip.y)} L ${r2(p1.x)} ${r2(p1.y)} L ${r2(p2.x)} ${r2(p2.y)} Z" fill="${color}"/>`;
}

function drawRoute(box, routePoints, color, theme, emptyLabel = 'Sin ruta', forceEmpty = false) {
  const parts = [];
  parts.push(
    `<rect x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}" rx="5" fill="${theme.routeArea}" stroke="${theme.routeAreaBorder}" stroke-width="1" stroke-opacity="0.55"/>`
  );
  const start = routePoints.length ? routePoints[0] : { x: box.x + box.w / 2, y: box.y + box.h };
  const losY = routePoints.length ? start.y : box.y + box.h;
  parts.push(
    `<line x1="${r2(box.x + 6)}" y1="${r2(losY)}" x2="${r2(box.x + box.w - 6)}" y2="${r2(losY)}" stroke="${theme.los}" stroke-width="1" stroke-opacity="0.4" stroke-dasharray="4 3"/>`
  );
  if (routePoints.length < 2 || forceEmpty) {
    parts.push(
      `<text x="${r2(box.x + box.w / 2)}" y="${r2(box.y + box.h / 2 + 3)}" text-anchor="middle" font-size="8" fill="${theme.faint}">${esc(emptyLabel)}</text>`
    );
    return parts.join('');
  }
  const d = routePoints.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');
  parts.push(
    `<polyline points="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  );
  parts.push(`<circle cx="${r2(start.x)}" cy="${r2(start.y)}" r="1.8" fill="${color}"/>`);
  const tip = routePoints[routePoints.length - 1];
  const prev = routePoints[routePoints.length - 2];
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  parts.push(arrowSvg(tip, angle, 4.4, color));
  return parts.join('');
}

function drawNode(node, offsetX, offsetY, theme, selected, showNotes, editRoute) {
  const x = node.x + offsetX;
  const y = node.y + offsetY;
  const w = node.w;
  const h = node.h;
  const kind = theme.kind[node.kind] ? node.kind : 'route';
  const badgeColor = node.color || theme.kind[kind];
  const badgeInk = node.color ? theme.bg : theme.kindInk[kind] || theme.kindInk.route;
  const routeColor = node.color || theme.route;
  const isRoot = node.kind === 'root';
  const parts = [];
  parts.push(`<g data-node-id="${esc(node.id)}">`);
  parts.push(
    `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="9" fill="${isRoot ? theme.surface : theme.node}" stroke="${selected ? theme.selection : theme.border}" stroke-width="${selected ? 2 : 1}"/>`
  );
  parts.push(
    `<rect x="${r2(x + 1)}" y="${r2(y + 10)}" width="3" height="${r2(Math.max(4, h - 20))}" rx="1.5" fill="${badgeColor}" opacity="${isRoot ? 1 : 0.85}"/>`
  );

  const badgeX = x + 20;
  const badgeY = y + 18;
  const badgeR = 10.5;
  const badgeText = String(node.number ?? '').trim() || '·';
  const badgeFont = badgeText.length > 1 ? 9 : 11;
  parts.push(`<circle cx="${r2(badgeX)}" cy="${r2(badgeY)}" r="${r2(badgeR)}" fill="${badgeColor}"/>`);
  parts.push(
    `<text x="${r2(badgeX)}" y="${r2(badgeY + badgeFont * 0.36)}" text-anchor="middle" font-size="${badgeFont}" font-weight="700" fill="${badgeInk}">${esc(badgeText)}</text>`
  );

  node.labelLines.forEach((line, index) => {
    parts.push(
      `<text x="${r2(node.labelX + offsetX)}" y="${r2(node.labelY + offsetY + index * node.labelLineHeight)}" font-size="${TITLE_FONT}" font-weight="600" fill="${theme.ink}">${esc(line)}</text>`
    );
  });
  node.subLines.forEach((line, index) => {
    parts.push(
      `<text x="${r2(node.subX + offsetX)}" y="${r2(node.subY + offsetY + index * node.subLineHeight)}" font-size="${SUB_FONT}" fill="${theme.muted}">${esc(line)}</text>`
    );
  });
  if (showNotes) {
    node.noteLines.forEach((line, index) => {
      parts.push(
        `<text x="${r2(node.noteX + offsetX)}" y="${r2(node.noteY + offsetY + index * node.noteLineHeight)}" font-size="${NOTE_FONT}" font-style="italic" fill="${theme.faint}">${esc(line)}</text>`
      );
    });
  }

  const box = {
    x: node.routeBox.x + offsetX,
    y: node.routeBox.y + offsetY,
    w: node.routeBox.w,
    h: node.routeBox.h,
  };
  const routePoints = node.routePoints.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
  // ¿Tiene recorrido de verdad? Si no, se avisa en vez de dibujar algo que no es.
  let hasTravel = false;
  for (const pt of routePoints) {
    if (Math.abs(pt.x - routePoints[0].x) > 1.5 || Math.abs(pt.y - routePoints[0].y) > 1.5) hasTravel = true;
  }
  const sinRecorrido = routePoints.length >= 2 && !hasTravel;
  const emptyLabel = isRoot ? 'Inicio' : sinRecorrido ? 'Sin dibujar' : 'Sin ruta';
  // Zona de captura para añadir puntos con un clic (solo mientras se edita).
  if (editRoute) {
    parts.push(
      `<rect data-route-area="1" data-node-id="${esc(node.id)}" x="${r2(box.x)}" y="${r2(box.y)}" width="${r2(box.w)}" height="${r2(box.h)}" fill="transparent" style="cursor:crosshair"/>`
    );
  }
  parts.push(drawRoute(box, routePoints, routeColor, theme, emptyLabel, sinRecorrido));
  if (editRoute) {
    // Asas: una por punto de la ruta (la 0 es el jugador, no se arrastra).
    for (let i = 1; i < routePoints.length; i++) {
      const pt = routePoints[i];
      parts.push(
        `<circle data-route-handle="${i - 1}" data-node-id="${esc(node.id)}" cx="${r2(pt.x)}" cy="${r2(pt.y)}" r="4.8" fill="${theme.surface}" stroke="${theme.selection}" stroke-width="1.8" style="cursor:grab"/>`
      );
    }
  }
  parts.push('</g>');
  return parts.join('');
}

function drawEdge(edge, offsetX, offsetY, theme) {
  if (!edge.points || edge.points.length < 2) return '';
  const pts = edge.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
  const d = pts.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  return (
    `<polyline points="${d}" fill="none" stroke="${theme.edge}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` +
    arrowSvg(tip, angle, 4, theme.edgeArrow)
  );
}

function legendColumns(contentW) {
  const margin = 26;
  const usable = Math.max(200, contentW - margin * 2);
  return Math.max(1, Math.min(4, Math.floor((usable + 14) / 224)));
}

function truncateToWidth(text, maxChars) {
  return ellipsize(String(text ?? ''), Math.max(4, Math.floor(maxChars)));
}

function drawLegend(entries, layoutNodes, contentW, top, theme) {
  const margin = 26;
  const cols = legendColumns(contentW);
  const cellW = (contentW - margin * 2) / cols;
  const rows = Math.ceil(entries.length / cols);
  const byId = new Map(layoutNodes.map((node) => [node.id, node]));
  const parts = [];
  parts.push(
    `<line x1="${r2(margin)}" y1="${r2(top + 6)}" x2="${r2(contentW - margin)}" y2="${r2(top + 6)}" stroke="${theme.border}" stroke-width="1" stroke-opacity="0.6"/>`
  );
  parts.push(
    `<text x="${r2(margin)}" y="${r2(top + 25)}" font-size="9" font-weight="700" letter-spacing="1.4" fill="${theme.muted}">LEYENDA</text>`
  );
  const titleChars = Math.max(8, Math.floor((cellW - 78) / (10.5 * CHAR_W)));
  entries.forEach((entry, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = margin + col * cellW;
    const cy = top + 44 + row * 30;
    const node = byId.get(entry.id);
    const kind = node && theme.kind[node.kind] ? node.kind : 'route';
    const color = (node && node.color) || theme.kind[kind];
    const ink = node && node.color ? theme.bg : theme.kindInk[kind] || theme.kindInk.route;
    const number = String(entry.number ?? '').trim() || '·';
    parts.push(`<circle cx="${r2(cx + 9)}" cy="${r2(cy)}" r="8.5" fill="${color}"/>`);
    parts.push(
      `<text x="${r2(cx + 9)}" y="${r2(cy + 3.4)}" text-anchor="middle" font-size="${number.length > 1 ? 8 : 9.5}" font-weight="700" fill="${ink}">${esc(number)}</text>`
    );
    parts.push(
      `<text x="${r2(cx + 22)}" y="${r2(cy + 3.6)}" font-size="10.5" fill="${theme.inkSoft}">${esc(truncateToWidth(entry.title, titleChars))}</text>`
    );
    parts.push(
      `<text x="${r2(cx + cellW - 10)}" y="${r2(cy + 3.6)}" text-anchor="end" font-size="9.5" fill="${theme.muted}">${esc(`${r2(entry.depth)} yd`)}</text>`
    );
  });
  return { svg: parts.join(''), height: 44 + rows * 30 + 8 };
}

/**
 * Dibuja el árbol como SVG autocontenido (sin CSS externo, colores inline).
 * Las coordenadas del layout se trasladan solo para dejar sitio a la cabecera:
 * el layout en sí nunca lleva `transform`.
 */
export function renderTreeSVG(tree, opts = {}) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const theme = themeOf(options.theme);
  const nodeScaleRaw = Number(options.nodeScale);
  const nodeScale = Number.isFinite(nodeScaleRaw) && nodeScaleRaw > 0.2 ? Math.min(4, nodeScaleRaw) : 1;
  const showNotes = options.showNotes === true;
  // Nodo cuya ruta se está editando: se dibujan asas y zona de clic.
  const editRouteId = options.editRouteId ? String(options.editRouteId) : null;
  const layout = layoutTree(tree, {
    editRouteId,
    editScale: options.editScale,
    nodeW: LAYOUT_DEFAULTS.nodeW * nodeScale,
    nodeH: LAYOUT_DEFAULTS.nodeH * nodeScale,
    routeArea: {
      x: LAYOUT_DEFAULTS.routeArea.x * nodeScale,
      y: LAYOUT_DEFAULTS.routeArea.y * nodeScale,
      w: LAYOUT_DEFAULTS.routeArea.w * nodeScale,
      h: LAYOUT_DEFAULTS.routeArea.h * nodeScale,
    },
    showNotes,
    orientation: options.orientation,
    sortChildren: options.sortChildren === true,
    maxColumnHeight: options.maxColumnHeight,
    maxRowWidth: options.maxRowWidth,
    columns: options.columns,
    rowsPerColumn: options.rowsPerColumn,
    groupGap: options.groupGap,
  });

  const treeKind = tree && TREE_KINDS[tree.kind] ? tree.kind : 'passing';
  const stats = treeStats(tree || { nodes: [] });
  const titleText = options.title != null ? String(options.title) : String(tree && tree.name ? tree.name : '');
  const defaultSubtitle = `${TREE_KINDS[treeKind].label} · ${stats.nodes} nodos · ${stats.maxDepth} niveles · ${r2(stats.totalYards)} yd`;
  const subtitleText = options.subtitle != null ? String(options.subtitle) : defaultSubtitle;
  const footerText = options.footer != null ? String(options.footer) : '';
  const watermarkText = options.watermark != null ? String(options.watermark) : '';
  const selectedId = options.selectedId != null ? String(options.selectedId) : '';

  const M = 26;
  const titleY = M + 21;
  const subY = titleY + 18;
  const showTitle = !!titleText.trim();
  const showSubtitle = !!subtitleText.trim();
  let headerH = M;
  if (showTitle && showSubtitle) headerH = subY + 15;
  else if (showTitle) headerH = titleY + 15;
  else if (showSubtitle) headerH = M + 26;

  const contentW = Math.max(layout.width, 640);
  const offsetX = (contentW - layout.width) / 2;
  const treeTop = headerH;

  const showLegend = options.showLegend !== false && layout.legend.length > 0;
  let legendTop = headerH + layout.height;
  let legendHeight = 0;
  let legendSvg = '';
  if (showLegend) {
    const legend = drawLegend(layout.legend, layout.nodes, contentW, legendTop, theme);
    legendSvg = legend.svg;
    legendHeight = legend.height;
  }

  let contentH = headerH + layout.height + legendHeight;
  let footerY = 0;
  if (footerText.trim()) {
    footerY = contentH + 20;
    contentH += 30;
  }
  contentH += 12;

  const widthOpt = Number(options.width);
  const svgWidth = Number.isFinite(widthOpt) && widthOpt > 0 ? widthOpt : 1100;
  const svgHeight = Math.max(40, Math.round((svgWidth * contentH) / contentW));

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(svgWidth)}" height="${r2(svgHeight)}" viewBox="0 0 ${r2(contentW)} ${r2(contentH)}" role="img" aria-label="${esc(titleText || 'Árbol de rutas')}" font-family="${FONT_STACK}">`
  );
  parts.push(`<title>${esc(titleText || 'Árbol de rutas')}</title>`);
  parts.push(
    `<desc>${esc(`${TREE_KINDS[treeKind].label}: ${stats.nodes} nodos, ${stats.maxDepth} niveles`)}</desc>`
  );
  parts.push(`<rect x="0" y="0" width="${r2(contentW)}" height="${r2(contentH)}" fill="${theme.bg}"/>`);

  if (watermarkText.trim()) {
    parts.push(
      `<text x="${r2(contentW / 2)}" y="${r2(contentH / 2)}" text-anchor="middle" font-size="${r2(Math.max(28, contentW / 16))}" font-weight="700" fill="${theme.ink}" opacity="0.05" transform="rotate(-26 ${r2(contentW / 2)} ${r2(contentH / 2)})">${esc(watermarkText)}</text>`
    );
  }

  if (showTitle) {
    parts.push(
      `<text x="${r2(M)}" y="${r2(titleY)}" font-size="19" font-weight="700" fill="${theme.ink}">${esc(titleText)}</text>`
    );
  }
  if (showSubtitle) {
    parts.push(
      `<text x="${r2(M)}" y="${r2(showTitle ? subY : M + 18)}" font-size="11.5" fill="${theme.muted}">${esc(subtitleText)}</text>`
    );
  }
  if (showTitle || showSubtitle) {
    parts.push(
      `<line x1="${r2(M)}" y1="${r2(headerH - 9)}" x2="${r2(contentW - M)}" y2="${r2(headerH - 9)}" stroke="${theme.border}" stroke-width="1" stroke-opacity="0.6"/>`
    );
  }

  parts.push('<g>');
  for (const edge of layout.edges) parts.push(drawEdge(edge, offsetX, treeTop, theme));
  for (const node of layout.nodes) {
    parts.push(
      drawNode(node, offsetX, treeTop, theme, node.id === selectedId, showNotes, node.id === editRouteId)
    );
  }
  parts.push('</g>');

  if (showLegend) parts.push(legendSvg);
  if (footerText.trim()) {
    parts.push(
      `<text x="${r2(M)}" y="${r2(footerY)}" font-size="10" fill="${theme.faint}">${esc(footerText)}</text>`
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Mini SVG de una ruta, para listas y tarjetas (acepta un nodo o un id de ruta). */
/**
 * Convierte un punto del SVG (unidades de layout) a yardas locales del nodo.
 * Solo tiene sentido con el layout en modo edición de ese nodo.
 */
export function routePointToYards(nodeLayout, pt) {
    if (!nodeLayout || !nodeLayout.editOrigin || !nodeLayout.editScale) return { x: 0, y: 0 };
    return {
        x: (Number(pt.x) - nodeLayout.editOrigin.x) / nodeLayout.editScale,
        y: (nodeLayout.editOrigin.y - Number(pt.y)) / nodeLayout.editScale,
    };
}

/** Inversa de `routePointToYards`. */
export function yardsToRoutePoint(nodeLayout, yd) {
    if (!nodeLayout || !nodeLayout.editOrigin || !nodeLayout.editScale) return { x: 0, y: 0 };
    return {
        x: nodeLayout.editOrigin.x + Number(yd.x) * nodeLayout.editScale,
        y: nodeLayout.editOrigin.y - Number(yd.y) * nodeLayout.editScale,
    };
}

/** Nodo del layout por id (atajo para la interfaz). */
export function layoutNode(layout, id) {
    if (!layout || !Array.isArray(layout.nodes)) return null;
    return layout.nodes.find((n) => n.id === id) || null;
}

/** Ruta del nodo en unidades de layout, incluyendo el origen (índice 0 = jugador). */
export function routePointsOf(layout, id) {
    const node = layoutNode(layout, id);
    return node && Array.isArray(node.routePoints) ? node.routePoints : [];
}

export function renderNodeThumb(node, opts = {}) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const theme = themeOf(options.theme);
  const width = Math.max(40, finite(options.width, 120));
  const height = Math.max(28, finite(options.height, 78));
  const pad = Math.max(3, Math.min(14, finite(options.padding, 6)));
  const drawBackground = options.background !== false;
  const points = resolveNodePoints(typeof node === 'string' ? { routeId: node } : node || {});
  const box = { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 };
  const routePoints = routeToBox(points, box).map((p) => ({ x: r2(p.x), y: r2(p.y) }));
  const color = (node && node.color) || options.color || theme.route;
  const svgW = r2(width);
  const svgH = r2(height);

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="Miniatura de ruta" font-family="${FONT_STACK}">`
  );
  if (drawBackground) {
    parts.push(
      `<rect x="0.5" y="0.5" width="${r2(width - 1)}" height="${r2(height - 1)}" rx="6" fill="${theme.surface}" stroke="${theme.border}" stroke-width="1"/>`
    );
  }
  parts.push(drawRoute(box, routePoints, color, theme));
  parts.push('</svg>');
  return parts.join('');
}

// ---------------------------------------------------------------------------
// 8. Plantillas de árbol (contenido de entrenador)
// ---------------------------------------------------------------------------

const PRESET_TS = 1735689600000; // 2025-01-01T00:00:00Z, fijo para builds deterministas

/** Azúcar para declarar nodos de plantilla con todos los campos del contrato. */
function n(id, parentId, number, title, subtitle, kind, routeId, depth, notes, color = null) {
  return {
    id,
    parentId,
    number,
    title,
    subtitle,
    kind,
    routeId,
    points: [],
    depth,
    notes,
    color,
  };
}

function preset(meta, root, children, notes) {
  return {
    id: `tree-${meta.id}`,
    name: meta.name,
    kind: meta.kind,
    orientation: meta.orientation,
    notes,
    nodes: [root, ...children],
    meta: { createdAt: PRESET_TS, updatedAt: PRESET_TS },
  };
}

// --- 1. Árbol de pases clásico 1-9 -----------------------------------------
function buildClassic9() {
  const root = n(
    'c9-root',
    null,
    '0',
    'Progresión 1-9',
    'De dentro hacia fuera',
    'root',
    null,
    0,
    'Lee de dentro hacia fuera. El 1 y el 2 llegan antes que el rush, el 3 y el 4 atacan el hueco entre el linebacker y el profundo, y del 5 al 9 abren el campo profundo. Si la defensa enseña un solo profundo, el 6 y el 7 son la respuesta; con dos profundos, ataca el 4 y el 5.'
  );
  const children = [
    n('c9-1', 'c9-root', '1', 'Corte al interior', '6 yd · ventana interior', 'route', 'slant', 6,
      'Contra press es la lectura más rápida: el receptor gana la posición interior con dos pasos y el balón sale antes de que el esquinero gire. No fuerces el pase si el linebacker se queda en el hueco.'),
    n('c9-2', 'c9-root', '2', 'Salida exterior', '7 yd · plana exterior', 'route', 'out', 7,
      'Ataca la plana por delante del esquinero; el receptor debe salir perpendicular, no redondear hacia arriba. Si el esquinero juega por fuera, el 1 vuelve a ser la primera lectura.'),
    n('c9-3', 'c9-root', '3', 'Gancho corto', '10 yd · hueco blando', 'route', 'curl', 10,
      'Se asienta entre la plana y el profundo: espera a que el receptor muestre el pecho al mariscal. Contra zona blanda es el pase más seguro del árbol.'),
    n('c9-4', 'c9-root', '4', 'Dig interior', '11 yd · tras el linebacker', 'route', 'in', 11,
      'Dig detrás del linebacker; el receptor no empieza el corte hasta haber pasado la cara del linebacker. La ventana es corta, hay que lanzar con anticipación.'),
    n('c9-5', 'c9-root', '5', 'Costura interior', '20 yd · entre profundos', 'route', 'seam', 20,
      'Ataca la costura entre los dos profundos de Cover 2. Si las dos mitades se abren, el balón va al hueco; si una se cierra, cambia al 6 del lado opuesto.'),
    n('c9-6', 'c9-root', '6', 'Poste al centro', '23 yd · banda interior', 'route', 'post', 23,
      'Banda interior profunda entre los dos profundos; el corte empieza a 12 yardas y el receptor ataca el poste del safety. Solo contra un solo profundo o cuando el safety se ha comprometido con el 5.'),
    n('c9-7', 'c9-root', '7', 'Esquina exterior', '22 yd · ventana exterior', 'route', 'corner', 22,
      'Ventana exterior de Cover 2: el corte a la esquina busca el hueco detrás del esquinero y delante del safety. Necesita el drop profundo del mariscal.'),
    n('c9-8', 'c9-root', '8', 'Rueda exterior', '15 yd · banda derecha', 'route', 'wheel', 15,
      'La rueda empieza hacia el exterior y sube pegada a la banda: se usa como segunda lectura cuando el safety se queda en el centro. El receptor no puede salir con piernas cruzadas.'),
    n('c9-9', 'c9-root', '9', 'Vertical larga', '21 yd · amenaza larga', 'route', 'go', 21,
      'Vertical pura para obligar al profundo a girar y liberar todo lo de dentro. Es la lectura de castigo: no se lanza si el safety no ha mordido antes.'),
  ];
  return preset(
    { id: 'classic-9', name: 'Árbol de pases 1-9', kind: 'passing', orientation: 'horizontal' },
    root,
    children,
    'El árbol clásico de pases: nueve rutas numeradas que se leen de dentro hacia fuera. Sirve como base para cualquier formación spread y como vocabulario común del equipo.'
  );
}

// --- 2. Progresión del QB de tres lecturas ---------------------------------
function buildQbProgression() {
  const root = n(
    'qp-root',
    null,
    '0',
    'Previa: cobertura',
    'Cuenta profundos',
    'root',
    null,
    0,
    'Cuenta los profundos antes del snap: dos profundos, ataca la costura y la banda; uno solo, ataca al medio. La progresión va de la lectura más larga a la más corta, pero el balón sale al primero que esté abierto.',
    null
  );
  const children = [
    n('qp-r1', 'qp-root', '1', 'Vertical del X', '1.ª lectura · go', 'read', 'go', 21,
      'Primera lectura: el go del X contra el esquinero. Si el safety no ayuda, el receptor gana la banda; si el safety llega, ya sabes que el medio está abierto para el 2.'),
    n('qp-r1h', 'qp-r1', '1H', 'Si hombre: fade', '20 yd · hombro exterior', 'route', 'fade', 20,
      'Con hombre encima, el fade por fuera del hombro exterior es la ventana. Lanza antes del tercer paso del receptor, cuando el esquinero todavía no ha girado la cabeza.'),
    n('qp-r1z', 'qp-r1', '1Z', 'Si zona: post', '23 yd · entre profundos', 'route', 'post', 23,
      'Contra zona, el post ataca el hueco entre los dos profundos. La lectura es el safety: si se abre al go del X, el post queda solo por dentro.'),
    n('qp-r2', 'qp-root', '2', 'Rueda del slot', '2.ª lectura · safety rota', 'read', 'wheel', 15,
      'Segunda lectura: la rueda del slot. Solo si el safety ha rotado al lado del X; el receptor vende el corte interior antes de subir por la banda.'),
    n('qp-r2h', 'qp-r2', '2H', 'Si hombre: wheel', '15 yd · por detrás', 'route', 'wheel', 15,
      'Contra hombre, el receptor gana por detrás del flat defender; el balón va con anticipación y por fuera, no al cuerpo.'),
    n('qp-r2z', 'qp-r2', '2Z', 'Si zona: comeback', '11 yd · vuelta al exterior', 'route', 'comeback', 11,
      'Contra zona, la rueda no llega: el receptor se asienta a 12 y vuelve al exterior. La ventana es entre la plana y el profundo.'),
    n('qp-r3', 'qp-root', '3', 'Válvula al flat', '3.ª lectura · check-down', 'read', 'flat', 2,
      'Tercera lectura: la válvula al flat. Si las dos primeras no están, el balón sale ya y se gana el primer down con los pies. No te quedes esperando la ventana grande.'),
    n('qp-r3h', 'qp-r3', '3H', 'Si hombre: swing', '2 yd · en carrera', 'route', 'swing', 2,
      'Contra hombre, el swing al corredor es la válvula más limpia: recibe en carrera y ataca el borde.'),
    n('qp-r3z', 'qp-r3', '3Z', 'Si zona: curl bajo', '10 yd · delante del safety', 'route', 'curl', 10,
      'Contra zona, el curl bajo el linebacker es la última ventana: el receptor se sienta delante del safety y el mariscal lanza al primer movimiento.'),
  ];
  return preset(
    { id: 'qb-progression', name: 'Progresión del QB', kind: 'progression', orientation: 'vertical' },
    root,
    children,
    'Tres lecturas con su condición: primero la vertical, después la rueda y por último la válvula. Cada rama dice qué hacer contra hombre y contra zona, para que el mariscal no improvise.'
  );
}

// --- 3. Árbol de concepto: la malla ----------------------------------------
function buildConceptMesh() {
  const root = n(
    'cm-root',
    null,
    '0',
    'Concepto: la malla',
    'Tres variantes',
    'root',
    null,
    0,
    'La malla cruza dos drags por debajo del linebacker: contra hombre generas tráfico legal, contra zona generas dos ventanas cortas. El mariscal lanza con tres pasos, antes de que los cruces se junten.'
  );
  const children = [
    n('cm-v1', 'cm-root', 'A', 'Malla pura', 'Dos cruces a 2 yd', 'concept', 'drag', 2,
      'Malla pura: dos receptores cruzan a 2 yardas en sentidos opuestos. Contra hombre, el defensor se queda atascado; contra zona, uno de los dos aparece detrás del linebacker.'),
    n('cm-v1h', 'cm-v1', 'A1', 'Contra hombre: rub', '4 yd · roce del center', 'route', 'rub', 4,
      'El center se cruza en la cara del esquinero para liberar al drag de dentro. En flag es roce legal, nunca contacto.'),
    n('cm-v1z', 'cm-v1', 'A2', 'Contra zona: curl', '10 yd · hueco blando', 'route', 'curl', 10,
      'Si el linebacker salta el cruce, el curl se asienta en el hueco por detrás y delante del safety.'),
    n('cm-v2', 'cm-root', 'B', 'Malla con rueda', 'Cruce y rueda exterior', 'concept', 'wheel', 15,
      'Malla con rueda: el cruce arrastra la mirada del linebacker y la rueda ataca el exterior por detrás del flat defender.'),
    n('cm-v2h', 'cm-v2', 'B1', 'Contra hombre: rueda', '15 yd · hombro exterior', 'route', 'wheel', 15,
      'Contra hombre, la rueda va por fuera del hombro del esquinero. El receptor sube pegando a la banda y el mariscal lanza al punto, no al cuerpo.'),
    n('cm-v2z', 'cm-v2', 'B2', 'Contra zona: post', '23 yd · hueco interior', 'route', 'post', 23,
      'Si el safety se queda con la rueda, el post del X ataca el hueco interior. La lectura es el safety, no el esquinero.'),
    n('cm-v3', 'cm-root', 'C', 'Malla con pantalla', 'Pantalla al slot', 'concept', 'screen', 0,
      'Malla con pantalla: el cruce vende la ruta y el pase sale rápido al slot por detrás de la línea. El mínimo riesgo contra rush.'),
    n('cm-v3h', 'cm-v3', 'C1', 'Contra hombre: slant', '6 yd · por dentro', 'route', 'slant', 6,
      'Contra press, la pantalla tarda en desarrollarse: si el esquinero del slot presiona, el slant por dentro es la respuesta inmediata.'),
    n('cm-v3z', 'cm-v3', 'C2', 'Zona: pantalla', 'Detrás de la línea', 'route', 'screen', 0,
      'Contra zona blanda, la pantalla al slot gana el borde con la obstrucción de los cruces. Hay que atrapar por delante del bloqueador.'),
  ];
  return preset(
    { id: 'concept-mesh', name: 'Concepto: malla', kind: 'concept', orientation: 'vertical' },
    root,
    children,
    'Tres variantes del mismo concepto de malla, cada una con su ajuste contra hombre y contra zona. Ideal para instalar el concepto en una sesión y añadir variantes sin cambiar el vocabulario.'
  );
}

// --- 4. Árbol de decisión contra coberturas --------------------------------
function buildCoverageTree() {
  const root = n(
    'ct-root',
    null,
    '0',
    'Lectura de cobertura',
    'Hombre o zona',
    'root',
    null,
    0,
    'Antes del snap identifica la cobertura: cuenta los profundos, mira la leverage del esquinero y busca al safety. Hombre o zona decide media respuesta; la otra media la decide la técnica del defensor.'
  );
  const children = [
    n('ct-man', 'ct-root', 'H', 'Hombre: gana dentro', 'Slant del slot · 6 yd', 'read', 'slant', 6,
      'Si hombre, gana por dentro: el slant es la ruta más difícil de cubrir porque no necesita que el receptor se separe. El mariscal lanza al primer paso del corte.'),
    n('ct-man-press', 'ct-man', 'H1', 'Contra press: fade', '20 yd · hombro exterior', 'route', 'fade', 20,
      'Contra press, el esquinero agrede arriba: el fade por fuera del hombro es la ventana y el balón sale antes del tercer paso.'),
    n('ct-man-off', 'ct-man', 'H2', 'Contra off: slant', '6 yd · posición interior', 'route', 'slant', 6,
      'Contra hombre con el esquinero retrasado, el slant por dentro gana la posición sin necesidad de dobles movimientos.'),
    n('ct-man-high', 'ct-man', 'H3', 'Safety alto: seam', '20 yd · costura', 'route', 'seam', 20,
      'Si el safety se queda alto cubriendo tu profundidad, ataca la costura por dentro: llega tarde a la ventana entre él y el esquinero.'),
    n('ct-zone', 'ct-root', 'Z', 'Zona: ataca el hueco', 'Curl en la ventana blanda · 10 yd', 'read', 'curl', 10,
      'Si zona, ataca el hueco: la zona regala el pase corto y la costura profunda. Elige la ruta que se sienta entre dos defensores, no la que más te guste.'),
    n('ct-zone-2', 'ct-zone', 'Z1', 'Cover 2: corner', '22 yd · ventana exterior', 'route', 'corner', 22,
      'Contra Cover 2, el corner ataca la ventana exterior entre el esquinero y el safety. Necesita paciencia y un drop profundo.'),
    n('ct-zone-3', 'ct-zone', 'Z2', 'Cover 3: curl', '10 yd · delante del safety', 'route', 'curl', 10,
      'Contra Cover 3, el curl se sienta en el hueco delante del safety y detrás del linebacker; el balón sale al primer paso del asentamiento.'),
    n('ct-zone-4', 'ct-zone', 'Z3', 'Cover 4: drag', '2 yd · ventana corta', 'route', 'drag', 2,
      'Contra Cover 4, los profundos cierran por fuera: el drag cruza la ventana corta y aparece por delante del safety. Es la ruta de castigo al Cover 4.'),
  ];
  return preset(
    { id: 'coverage-tree', name: 'Árbol contra coberturas', kind: 'coverage', orientation: 'vertical' },
    root,
    children,
    'Árbol de decisión de dos niveles: primero se diagnostica hombre o zona y después se elige la ruta según la técnica del defensor. Repásalo antes de cada partido hasta que la lectura sea automática.'
  );
}

/** Catálogo de plantillas disponibles. */
export const PRESET_TREES = [
  {
    id: 'classic-9',
    name: 'Árbol de pases 1-9',
    desc: 'Nueve rutas numeradas con la progresión clásica de dentro hacia fuera.',
    build: buildClassic9,
  },
  {
    id: 'qb-progression',
    name: 'Progresión del QB',
    desc: 'Tres lecturas con su condición contra hombre y contra zona.',
    build: buildQbProgression,
  },
  {
    id: 'concept-mesh',
    name: 'Concepto: malla',
    desc: 'Tres variantes del concepto de malla con sus ajustes.',
    build: buildConceptMesh,
  },
  {
    id: 'coverage-tree',
    name: 'Árbol contra coberturas',
    desc: 'Decisión hombre o zona y respuesta concreta por cobertura.',
    build: buildCoverageTree,
  },
];

/** Construye una plantilla por id. Lanza si el id no existe. */
export function buildPresetTree(id) {
  const found = PRESET_TREES.find((item) => item.id === id);
  if (!found) throw new Error(`buildPresetTree: plantilla desconocida «${id}»`);
  return found.build();
}
