// tests/route-tree.mjs — verificación de src/route-tree.js
// Ejecutar con: node tests/route-tree.mjs
// Solo node:assert/strict; no requiere DOM ni dependencias.
import assert from 'node:assert/strict';
import {
  TREE_KINDS,
  TREE_THEMES,
  PRESET_TREES,
  addNode,
  buildPresetTree,
  cloneTree,
  createTree,
  layoutTree,
  moveNode,
  nodeRoute,
  normalizeTree,
  removeNode,
  renderNodeThumb,
  renderTreeSVG,
  treeOutline,
  treeStats,
  uid,
  updateNode,
} from '../src/route-tree.js';
import { ROUTES, getRoute } from '../src/presets.js';

let checks = 0;
function ok(value, message) {
  checks += 1;
  assert.ok(value, message);
}
function eq(actual, expected, message) {
  checks += 1;
  assert.equal(actual, expected, message);
}
function notEq(actual, expected, message) {
  checks += 1;
  assert.notEqual(actual, expected, message);
}
function deepEq(actual, expected, message) {
  checks += 1;
  assert.deepEqual(actual, expected, message);
}
function throws(fn, message) {
  checks += 1;
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert.ok(threw, message);
}
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

function overlaps(a, b) {
  return a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
}

function pointInsideRect(point, rect, eps = 0.5) {
  return (
    point.x > rect.x + eps &&
    point.x < rect.x + rect.w - eps &&
    point.y > rect.y + eps &&
    point.y < rect.y + rect.h - eps
  );
}

/** Comprueba finitud, no-solape, bounds, aristas y orientación de un layout. */
function checkLayoutIntegrity(layout, tree, label) {
  ok(layout.width > 0, `${label}: width > 0`);
  ok(layout.height > 0, `${label}: height > 0`);
  eq(layout.nodes.length, tree.nodes.length, `${label}: un nodo de layout por nodo del árbol`);
  eq(layout.edges.length, tree.nodes.length - 1, `${label}: una arista por padre-hijo`);
  for (const node of layout.nodes) {
    ok(
      [node.x, node.y, node.w, node.h].every(isFiniteNumber),
      `${label}/${node.id}: coordenadas finitas (${node.x}, ${node.y}, ${node.w}, ${node.h})`
    );
    ok(layout.bounds.x <= node.x && layout.bounds.y <= node.y, `${label}/${node.id}: dentro de bounds (origen)`);
    ok(
      node.x + node.w <= layout.bounds.x + layout.bounds.width + 0.01 &&
        node.y + node.h <= layout.bounds.y + layout.bounds.height + 0.01,
      `${label}/${node.id}: dentro de bounds (extremo)`
    );
  }
  for (const edge of layout.edges) {
    for (const point of edge.points) {
      ok(isFiniteNumber(point.x) && isFiniteNumber(point.y), `${label}/${edge.fromId}->${edge.toId}: punto finito`);
    }
    ok(edge.points.length >= 2, `${label}/${edge.fromId}->${edge.toId}: al menos 2 puntos`);
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      ok(
        Math.abs(a.x - b.x) < 0.02 || Math.abs(a.y - b.y) < 0.02,
        `${label}/${edge.fromId}->${edge.toId}: tramo ortogonal`
      );
    }
  }
  for (let i = 0; i < layout.nodes.length; i += 1) {
    for (let j = i + 1; j < layout.nodes.length; j += 1) {
      ok(!overlaps(layout.nodes[i], layout.nodes[j]), `${label}: sin solape ${layout.nodes[i].id}/${layout.nodes[j].id}`);
    }
  }
}

const PRESET_IDS = ['classic-9', 'qb-progression', 'concept-mesh', 'coverage-tree'];

// ===========================================================================
// 1. Constantes de dominio
// ===========================================================================
deepEq(Object.keys(TREE_KINDS).sort(), ['concept', 'coverage', 'passing', 'progression'], 'TREE_KINDS tiene los 4 tipos');
for (const [id, kind] of Object.entries(TREE_KINDS)) {
  ok(typeof kind.label === 'string' && kind.label.length > 3, `${id}: label presente`);
  ok(typeof kind.desc === 'string' && kind.desc.length > 20, `${id}: descripción de entrenador`);
  ok(['horizontal', 'vertical'].includes(kind.orientation), `${id}: orientación válida`);
}
for (const themeName of ['dark', 'print']) {
  ok(!!TREE_THEMES[themeName], `tema ${themeName} presente`);
}
eq(TREE_THEMES.print.bg, '#ffffff', 'print: fondo blanco');
eq(TREE_THEMES.print.ink, '#111827', 'print: tinta #111827');
eq(TREE_THEMES.print.border, '#111827', 'print: líneas #111827');
eq(TREE_THEMES.print.route, '#111827', 'print: rutas #111827');
ok(TREE_THEMES.dark.bg.startsWith('#'), 'dark: fondo hex');
eq(typeof uid, 'function', 'uid es función');
ok(uid('nodo').startsWith('nodo_'), 'uid usa el prefijo recibido');
notEq(uid('n'), uid('n'), 'uid no repite ids');

// ===========================================================================
// 2. createTree
// ===========================================================================
const fresh = createTree();
eq(fresh.kind, 'passing', 'createTree: tipo por defecto passing');
eq(fresh.orientation, 'horizontal', 'createTree: passing es horizontal');
eq(fresh.nodes.length, 1, 'createTree: solo la raíz');
const freshRoot = fresh.nodes[0];
eq(freshRoot.kind, 'root', 'createTree: la raíz es kind root');
eq(freshRoot.parentId, null, 'createTree: la raíz no tiene padre');
eq(freshRoot.depth, 0, 'createTree: profundidad 0');
ok(Array.isArray(freshRoot.points) && freshRoot.points.length === 0, 'createTree: raíz sin ruta propia');
ok(fresh.meta.createdAt > 0 && fresh.meta.updatedAt > 0, 'createTree: meta con fechas');
eq(createTree('progression').orientation, 'vertical', 'createTree: progresión vertical');
eq(createTree('concept', 'Mi malla').name, 'Mi malla', 'createTree: nombre personalizado');
eq(createTree('inventado').kind, 'passing', 'createTree: tipo desconocido cae en passing');

function sampleTree() {
  let tree = createTree('passing', 'Prueba');
  const rootId = tree.nodes[0].id;
  let result = addNode(tree, rootId, { number: '1', title: 'Uno', routeId: 'slant' });
  tree = result.tree;
  const one = result.node;
  result = addNode(tree, rootId, { number: '2', title: 'Dos', routeId: 'out' });
  tree = result.tree;
  const two = result.node;
  result = addNode(tree, one.id, { number: '1A', title: 'Uno A', routeId: 'in' });
  tree = result.tree;
  const oneA = result.node;
  return { tree, rootId, one, two, oneA };
}

// ===========================================================================
// 3. addNode / updateNode / removeNode / moveNode (inmutables)
// ===========================================================================
{
  const base = createTree('passing', 'Base');
  const rootId = base.nodes[0].id;
  const snapshot = JSON.stringify(base);
  const added = addNode(base, rootId, { number: '1', title: 'Uno', routeId: 'post' });
  ok(added && typeof added === 'object', 'addNode: devuelve un objeto');
  ok(!!added.tree && !!added.node, 'addNode: devuelve { tree, node }');
  eq(JSON.stringify(base), snapshot, 'addNode: no muta el árbol de entrada');
  eq(added.tree.nodes.length, 2, 'addNode: añade un nodo');
  eq(added.node.parentId, rootId, 'addNode: parentId correcto');
  eq(added.node.number, '1', 'addNode: conserva el número dado');
  eq(added.node.kind, 'route', 'addNode: kind por defecto route');
  eq(added.node.routeId, 'post', 'addNode: routeId resuelto');
  eq(added.node.depth, 23, 'addNode: profundidad deducida de la ruta');
  ok(added.node.subtitle.includes('23'), 'addNode: subtítulo con la profundidad');

  const second = addNode(added.tree, rootId, { title: 'Dos' });
  eq(second.node.number, '2', 'addNode: numeración automática correlativa');
  const third = addNode(second.tree, rootId, { number: '10' });
  const fourth = addNode(third.tree, rootId, {});
  eq(fourth.node.number, '11', 'addNode: numeración automática tras 10');
  eq(fourth.node.title, 'Ruta nueva', 'addNode: título por defecto');
  eq(fourth.node.depth, 12, 'addNode: profundidad por defecto');

  throws(() => addNode(base, 'no-existe', {}), 'addNode: padre desconocido lanza');
}

{
  const { tree, rootId, one } = sampleTree();
  const updated = updateNode(tree, one.id, { title: 'Renombrada', depth: '14', color: '#ABCDEF' });
  deepEq(
    { title: updated.nodes.find((n) => n.id === one.id).title, depth: updated.nodes.find((n) => n.id === one.id).depth, color: updated.nodes.find((n) => n.id === one.id).color },
    { title: 'Renombrada', depth: 14, color: '#abcdef' },
    'updateNode: aplica y sanea campos'
  );
  eq(tree.nodes.find((n) => n.id === one.id).title, 'Uno', 'updateNode: no muta el árbol original');
  eq(updateNode(tree, one.id, { color: 'rojo' }).nodes.find((n) => n.id === one.id).color, null, 'updateNode: color inválido a null');
  eq(updateNode(tree, one.id, { routeId: 'no-existe' }).nodes.find((n) => n.id === one.id).routeId, null, 'updateNode: ruta inválida a null');
  throws(() => updateNode(tree, 'no-existe', {}), 'updateNode: nodo desconocido lanza');
}

{
  const { tree, rootId, one, oneA } = sampleTree();
  const pruned = removeNode(tree, one.id);
  ok(!pruned.nodes.some((n) => n.id === one.id), 'removeNode: elimina el nodo');
  ok(!pruned.nodes.some((n) => n.id === oneA.id), 'removeNode: elimina el subárbol');
  eq(pruned.nodes.length, 2, 'removeNode: quedan raíz y el hermano');
  eq(tree.nodes.length, 4, 'removeNode: no muta el original');
  deepEq(removeNode(tree, 'no-existe'), tree, 'removeNode: id desconocido devuelve copia sin cambios');
  throws(() => removeNode(tree, rootId), 'removeNode: la raíz no se puede eliminar');
  eq(removeNode(pruned, pruned.nodes[1].id).nodes.length, 1, 'removeNode: deja solo la raíz');
}

{
  const { tree, rootId, one, two, oneA } = sampleTree();
  const moved = moveNode(tree, oneA.id, two.id);
  eq(moved.nodes.find((n) => n.id === oneA.id).parentId, two.id, 'moveNode: cambia de padre');
  eq(tree.nodes.find((n) => n.id === oneA.id).parentId, one.id, 'moveNode: no muta el original');
  deepEq(moveNode(tree, oneA.id, one.id), tree, 'moveNode: mismo padre es no-op');
  throws(() => moveNode(tree, one.id, oneA.id), 'moveNode: no se puede mover dentro de su subárbol');
  throws(() => moveNode(tree, one.id, one.id), 'moveNode: un nodo no puede ser su propio padre');
  throws(() => moveNode(tree, one.id, 'no-existe'), 'moveNode: padre desconocido lanza');
  throws(() => moveNode(tree, rootId, one.id), 'moveNode: la raíz no se mueve');
}

{
  const { tree } = sampleTree();
  const stats = treeStats(tree);
  function assertIntegrity(candidate, label) {
    const ids = new Set(candidate.nodes.map((n) => n.id));
    eq(ids.size, candidate.nodes.length, `${label}: ids únicos`);
    eq(candidate.nodes.filter((n) => !n.parentId).length, 1, `${label}: una sola raíz`);
    for (const node of candidate.nodes) {
      if (node.parentId) ok(ids.has(node.parentId), `${label}/${node.id}: padre existente`);
      let cursor = node;
      let steps = 0;
      while (cursor.parentId && steps <= candidate.nodes.length) {
        cursor = candidate.nodes.find((n) => n.id === cursor.parentId);
        steps += 1;
      }
      ok(steps <= candidate.nodes.length && cursor && !cursor.parentId, `${label}/${node.id}: sin ciclos`);
    }
  }
  assertIntegrity(tree, 'sample');
  assertIntegrity(addNode(tree, tree.nodes[1].id, {}).tree, 'tras addNode');
  assertIntegrity(removeNode(tree, tree.nodes[1].id), 'tras removeNode');
  assertIntegrity(moveNode(tree, tree.nodes[3].id, tree.nodes[2].id), 'tras moveNode');
  eq(stats.nodes, 4, 'treeStats: cuenta nodos');
  eq(stats.leaves, 2, 'treeStats: cuenta hojas');
  eq(stats.branches, 1, 'treeStats: cuenta ramificaciones');
  eq(stats.maxDepth, 3, 'treeStats: niveles máximos');
  eq(stats.totalYards, 24, 'treeStats: suma de yardas al break');
}

// ===========================================================================
// 4. cloneTree / normalizeTree
// ===========================================================================
{
  const { tree } = sampleTree();
  const copy = cloneTree(tree);
  deepEq(copy, tree, 'cloneTree: misma estructura');
  notEq(copy, tree, 'cloneTree: objeto distinto');
  notEq(copy.nodes[1], tree.nodes[1], 'cloneTree: nodos distintos');
  notEq(copy.nodes[1].points, tree.nodes[1].points, 'cloneTree: puntos distintos');
  copy.nodes[1].title = 'Cambiada';
  eq(tree.nodes[1].title, 'Uno', 'cloneTree: mutar la copia no afecta al original');

  const roundtrip = normalizeTree(JSON.parse(JSON.stringify(tree)));
  deepEq(roundtrip.nodes.map((n) => n.id), tree.nodes.map((n) => n.id), 'normalizeTree: conserva ids y orden');
  deepEq(roundtrip, tree, 'normalizeTree: árbol ya normalizado es idempotente');
  deepEq(normalizeTree(roundtrip), roundtrip, 'normalizeTree: idempotente al segundo pase');

  throws(() => normalizeTree(null), 'normalizeTree: rechaza null');
  throws(() => normalizeTree('texto'), 'normalizeTree: rechaza un string');
  throws(() => normalizeTree({}), 'normalizeTree: rechaza sin lista de nodos');
  throws(() => normalizeTree({ nodes: [] }), 'normalizeTree: rechaza lista vacía');

  const migrated = normalizeTree({
    name: 'Migrado',
    nodes: [
      { id: 'a' },
      { id: 'b', parentId: 'a', routeId: 'no-existe', color: 'rojo', kind: 'raro', depth: '12' },
      { id: 'c', parentId: 'b', number: 3, title: 'Tres' },
    ],
  });
  eq(migrated.nodes.length, 3, 'normalizeTree: migra todos los nodos');
  eq(migrated.nodes[0].kind, 'root', 'normalizeTree: el primero sin padre es la raíz');
  eq(migrated.nodes[1].routeId, null, 'normalizeTree: routeId inválido a null');
  eq(migrated.nodes[1].color, null, 'normalizeTree: color inválido a null');
  eq(migrated.nodes[1].kind, 'route', 'normalizeTree: kind inválido a route');
  eq(migrated.nodes[1].depth, 12, 'normalizeTree: profundidad numérica');
  eq(migrated.nodes[2].number, '3', 'normalizeTree: número a string');
  eq(migrated.orientation, TREE_KINDS.passing.orientation, 'normalizeTree: orientación por defecto');
  ok(migrated.meta.createdAt > 0, 'normalizeTree: meta generada');

  const forest = normalizeTree({ nodes: [{ id: 'r' }, { id: 'x', parentId: null }, { id: 'y', parentId: null }] });
  eq(forest.nodes.filter((n) => !n.parentId).length, 1, 'normalizeTree: un solo bosque se convierte en un árbol');
  eq(forest.nodes[1].parentId, 'r', 'normalizeTree: huérfano reenganchado a la raíz');

  const cyclic = normalizeTree({
    nodes: [{ id: 'a' }, { id: 'b', parentId: 'c' }, { id: 'c', parentId: 'b' }],
  });
  eq(cyclic.nodes.filter((n) => !n.parentId).length, 1, 'normalizeTree: rompe ciclos (una raíz)');
  ok(cyclic.nodes.some((n) => n.id === 'b' && n.parentId === 'a'), 'normalizeTree: nodo cíclico reenganchado');

  const duplicates = normalizeTree({ nodes: [{ id: 'x' }, { id: 'x' }, { id: 'x', parentId: 'x' }] });
  eq(new Set(duplicates.nodes.map((n) => n.id)).size, 3, 'normalizeTree: ids duplicados se separan');
  eq(duplicates.nodes.filter((n) => !n.parentId).length, 1, 'normalizeTree: sigue habiendo una raíz');
}

// ===========================================================================
// 5. treeOutline y nodeRoute
// ===========================================================================
{
  const { tree } = sampleTree();
  const outline = treeOutline(tree);
  eq(outline.length, tree.nodes.length, 'treeOutline: recorre todos los nodos');
  eq(outline[0].id, tree.nodes[0].id, 'treeOutline: empieza por la raíz');
  deepEq(outline.map((row) => row.depth), [1, 2, 3, 2], 'treeOutline: niveles en recorrido previo');
  eq(outline[0].hasChildren, true, 'treeOutline: la raíz tiene hijos');
  eq(outline[1].hasChildren, true, 'treeOutline: el nodo 1 tiene hijo');
  eq(outline[2].hasChildren, false, 'treeOutline: la hoja no tiene hijos');
  deepEq(outline.map((row) => row.number), ['0', '1', '1A', '2'], 'treeOutline: conserva el orden de los hijos');
  deepEq(createTree().nodes.length, 1, 'createTree: un nodo');
  eq(treeOutline(createTree()).length, 1, 'treeOutline: árbol recién creado');

  for (const route of ROUTES) {
    const points = nodeRoute(tree, { routeId: route.id });
    deepEq(points, route.points, `nodeRoute: ${route.id} coincide con la plantilla`);
    ok(points.length >= 2, `nodeRoute: ${route.id} tiene al menos 2 puntos`);
    const first = points[0];
    first.x = 9999;
    deepEq(nodeRoute(tree, { routeId: route.id }), route.points, `nodeRoute: ${route.id} devuelve copias`);
  }
  const custom = { routeId: null, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
  deepEq(nodeRoute(tree, custom), custom.points, 'nodeRoute: usa points si no hay routeId');
  eq(nodeRoute(tree, 'no-existe').length, 0, 'nodeRoute: nodo desconocido devuelve []');
  const rootNode = tree.nodes[0];
  eq(nodeRoute(tree, rootNode.id).length, 0, 'nodeRoute: la raíz no tiene ruta');
  deepEq(nodeRoute(tree, tree.nodes[1].id), getRoute('slant').points, 'nodeRoute: acepta el id del nodo');
}

// ===========================================================================
// 6. Presets
// ===========================================================================
eq(PRESET_TREES.length, 4, 'PRESET_TREES: cuatro plantillas');
deepEq(PRESET_TREES.map((preset) => preset.id), PRESET_IDS, 'PRESET_TREES: ids esperados');
for (const preset of PRESET_TREES) {
  ok(preset.name.length > 3, `preset ${preset.id}: nombre`);
  ok(preset.desc.length > 20, `preset ${preset.id}: descripción`);
  eq(typeof preset.build, 'function', `preset ${preset.id}: build es función`);
}

const PRESET_KIND = {
  'classic-9': 'passing',
  'qb-progression': 'progression',
  'concept-mesh': 'concept',
  'coverage-tree': 'coverage',
};

for (const id of PRESET_IDS) {
  const tree = buildPresetTree(id);
  const label = `preset ${id}`;
  eq(tree.kind, PRESET_KIND[id], `${label}: tipo de árbol`);
  ok(['horizontal', 'vertical'].includes(tree.orientation), `${label}: orientación válida`);
  ok(tree.nodes.length >= 5, `${label}: al menos 5 nodos`);
  const stats = treeStats(tree);
  ok(stats.maxDepth >= 2, `${label}: al menos 2 niveles`);
  eq(stats.nodes, tree.nodes.length, `${label}: stats.nodes coherente`);
  eq(new Set(tree.nodes.map((n) => n.id)).size, tree.nodes.length, `${label}: ids únicos`);
  eq(tree.nodes.filter((n) => !n.parentId).length, 1, `${label}: una sola raíz`);
  const ids = new Set(tree.nodes.map((n) => n.id));
  for (const node of tree.nodes) {
    if (node.parentId) ok(ids.has(node.parentId), `${label}/${node.id}: padre existente`);
    ok(typeof node.title === 'string' && node.title.length > 0, `${label}/${node.id}: título`);
    ok(typeof node.subtitle === 'string' && node.subtitle.length > 0, `${label}/${node.id}: subtítulo`);
    ok(typeof node.notes === 'string' && node.notes.length > 10, `${label}/${node.id}: nota de entrenador`);
    ok(isFiniteNumber(node.depth) && node.depth >= 0 && node.depth <= 60, `${label}/${node.id}: profundidad`);
    if (node.parentId) {
      ok(!!getRoute(node.routeId), `${label}/${node.id}: routeId válido`);
      ok(nodeRoute(tree, node).length >= 2, `${label}/${node.id}: ruta con al menos 2 puntos`);
    }
  }
  ok(tree.notes.length > 30, `${label}: notas del árbol`);
  const normalized = normalizeTree(JSON.parse(JSON.stringify(tree)));
  deepEq(normalized, tree, `${label}: ya está normalizado`);
  const rebuilt = buildPresetTree(id);
  notEq(rebuilt, tree, `${label}: build devuelve un árbol nuevo`);
  deepEq(rebuilt, tree, `${label}: build es determinista`);
}

{
  const classic = buildPresetTree('classic-9');
  eq(classic.nodes.length, 10, 'classic-9: raíz + 9 rutas');
  const numbers = classic.nodes
    .filter((n) => n.parentId)
    .map((n) => Number(n.number))
    .sort((a, b) => a - b);
  deepEq(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9], 'classic-9: numeración 1-9');
  eq(classic.nodes.filter((n) => n.parentId === classic.nodes[0].id).length, 9, 'classic-9: las 9 rutas cuelgan de la raíz');
  eq(new Set(classic.nodes.filter((n) => n.parentId).map((n) => n.routeId)).size, 9, 'classic-9: nueve rutas distintas');

  const qb = buildPresetTree('qb-progression');
  eq(qb.nodes[0].kind, 'root', 'qb-progression: raíz');
  eq(qb.nodes.filter((n) => n.parentId === qb.nodes[0].id).length, 3, 'qb-progression: tres lecturas');
  eq(treeStats(qb).leaves, 6, 'qb-progression: seis respuestas finales');
  eq(qb.nodes.filter((n) => n.kind === 'read').length, 3, 'qb-progression: tres nodos de lectura');
  ok(qb.nodes.some((n) => n.title.startsWith('Si hombre')), 'qb-progression: condiciones de hombre');
  ok(qb.nodes.some((n) => n.title.startsWith('Si zona')), 'qb-progression: condiciones de zona');

  const mesh = buildPresetTree('concept-mesh');
  const variants = mesh.nodes.filter((n) => n.kind === 'concept');
  eq(variants.length, 3, 'concept-mesh: tres variantes del concepto');
  deepEq(variants.map((n) => n.number), ['A', 'B', 'C'], 'concept-mesh: variantes A/B/C');

  const coverage = buildPresetTree('coverage-tree');
  const rootChildren = coverage.nodes.filter((n) => n.parentId === coverage.nodes[0].id);
  eq(rootChildren.length, 2, 'coverage-tree: dos ramas (hombre/zona)');
  deepEq(rootChildren.map((n) => n.number), ['H', 'Z'], 'coverage-tree: ramas H y Z');
  for (const branch of rootChildren) {
    ok(coverage.nodes.filter((n) => n.parentId === branch.id).length >= 2, `coverage-tree: rama ${branch.number} con respuestas`);
  }

  throws(() => buildPresetTree('no-existe'), 'buildPresetTree: plantilla desconocida lanza');
}

// ===========================================================================
// 7. layoutTree: integridad, finitud, no-solape, determinismo
// ===========================================================================
for (const id of PRESET_IDS) {
  const tree = buildPresetTree(id);
  for (const orientation of ['horizontal', 'vertical']) {
    const label = `${id}/${orientation}`;
    const treeSnapshot = JSON.stringify(tree);
    const layout = layoutTree(tree, { orientation });
    checkLayoutIntegrity(layout, tree, label);
    eq(JSON.stringify(tree), treeSnapshot, `${label}: layout no muta el árbol`);
    deepEq(layoutTree(tree, { orientation }), layout, `${label}: layout determinista`);
    eq(layout.orientation, orientation, `${label}: respeta la orientación pedida`);
    const root = layout.nodes.find((node) => !tree.nodes.find((n) => n.id === node.id).parentId);
    const rootTree = tree.nodes[0];
    const children = layout.edges.filter((edge) => edge.fromId === rootTree.id);
    for (const edge of children) {
      const child = layout.nodes.find((node) => node.id === edge.toId);
      if (orientation === 'horizontal') {
        ok(child.x > root.x + root.w - 0.01, `${label}: hijo a la derecha de la raíz`);
      } else {
        ok(child.y > root.y + root.h - 0.01, `${label}: hijo debajo de la raíz`);
      }
    }
    ok(root, `${label}: raíz encontrada en el layout`);
    eq(layout.legend.length, tree.nodes.length - 1, `${label}: leyenda con todos los nodos menos la raíz`);
  }
}

{
  const tree = buildPresetTree('classic-9');
  const layout = layoutTree(tree);
  eq(layout.width, 448, 'classic-9: ancho por defecto (sin columnas)');
  ok(layout.nodes.every((node) => Number.isFinite(node.y)), 'classic-9: ninguna y NaN');
  const root = layout.nodes[0];
  for (const edge of layout.edges) {
    const child = layout.nodes.find((node) => node.id === edge.toId);
    ok(Math.abs(child.x - (root.x + root.w + 56)) < 0.01, 'classic-9: hijos en la columna siguiente');
  }

  // Sin opción de columnas, un árbol en estrella mantiene una sola columna de hojas.
  const columnsOf = (value) => [...new Set(value.nodes.filter((node) => node.id !== layout.nodes[0].id).map((node) => node.x))];
  eq(columnsOf(layout).length, 1, 'classic-9: una columna de hijos por defecto');
  eq(layout.width, 448, 'classic-9: bounds por defecto');

  const split = layoutTree(tree, { maxColumnHeight: 620 });
  checkLayoutIntegrity(split, tree, 'classic-9/maxColumnHeight');
  eq(columnsOf(split).length, 2, 'maxColumnHeight: reparte los hijos en 2 columnas');
  const firstColumn = split.nodes.filter((node) => Math.abs(node.x - (split.nodes[0].x + split.nodes[0].w + 56)) < 0.01);
  const secondColumn = split.nodes.filter((node) => !firstColumn.includes(node) && node.id !== split.nodes[0].id);
  eq(firstColumn.length, 5, 'maxColumnHeight: 5 hijos en la primera columna');
  eq(secondColumn.length, 4, 'maxColumnHeight: 4 hijos en la segunda columna');
  ok(split.width > 448 && split.height < layout.height, 'maxColumnHeight: menos alto y más ancho');
  ok(split.height <= 800, 'maxColumnHeight: alto contenido para una hoja A4');
  deepEq(layoutTree(tree, { maxColumnHeight: 620 }), split, 'maxColumnHeight: determinista');

  // La raíz se centra respecto del bloque entero de hojas.
  const kids = split.nodes.filter((node) => node.id !== split.nodes[0].id);
  const top = Math.min(...kids.map((node) => node.y));
  const bottom = Math.max(...kids.map((node) => node.y + node.h));
  ok(Math.abs(split.nodes[0].y + split.nodes[0].h / 2 - (top + bottom) / 2) < 0.02, 'maxColumnHeight: raíz centrada en el bloque');

  // Las aristas a la segunda columna rodean la primera columna, sin pisar cajas.
  const secondIds = new Set(secondColumn.map((node) => node.id));
  const firstRight = Math.max(...firstColumn.map((node) => node.x + node.w));
  const blockBottom = Math.max(...kids.map((node) => node.y + node.h));
  for (const edge of split.edges.filter((item) => secondIds.has(item.toId))) {
    const routed = edge.points.some((point) => point.y > blockBottom - 0.01 && point.y > firstRight - 999999);
    ok(routed, 'maxColumnHeight: arista de segunda columna rodea el bloque');
    ok(edge.points.some((point) => point.y > blockBottom - 0.01), 'maxColumnHeight: arista pasa por debajo del último hijo');
    for (let i = 1; i < edge.points.length; i += 1) {
      const a = edge.points[i - 1];
      const b = edge.points[i];
      for (let step = 1; step < 10; step += 1) {
        const sample = { x: a.x + ((b.x - a.x) * step) / 10, y: a.y + ((b.y - a.y) * step) / 10 };
        for (const node of split.nodes) {
          ok(!pointInsideRect(sample, node, 0.51), 'maxColumnHeight: arista sin cruzar cajas');
        }
      }
    }
  }

  const forced = layoutTree(tree, { columns: 2 });
  eq(columnsOf(forced).length, 2, 'columns: fuerza 2 columnas');
  deepEq(forced, split, 'columns: 2 equivale al reparto por altura');
  const perGroup = layoutTree(tree, { rowsPerColumn: 5 });
  eq(columnsOf(perGroup).length, 2, 'rowsPerColumn: 5 hojas por columna');
  eq(perGroup.nodes.filter((node) => node.id !== perGroup.nodes[0].id && node.x === firstColumn[0].x).length, 5, 'rowsPerColumn: primera columna de 5');
  deepEq(layoutTree(tree, { rowsPerColumn: 5 }), perGroup, 'rowsPerColumn: determinista');
  eq(layoutTree(tree, { columns: 1 }).width, 448, 'columns: 1 equivale a no repartir');
  deepEq(layoutTree(tree, { maxColumnHeight: 5000 }), layout, 'maxColumnHeight: si cabe, no reparte');
}

{
  // Las columnas no deben aplicarse a árboles que no son una estrella.
  const qb = buildPresetTree('qb-progression');
  deepEq(layoutTree(qb, { maxRowWidth: 200 }), layoutTree(qb), 'columnas: no toca árboles con ramas internas');
  // Los árboles verticales pueden repartirse por filas.
  const classic = buildPresetTree('classic-9');
  const vertical = layoutTree(classic, { orientation: 'vertical', maxRowWidth: 1000 });
  checkLayoutIntegrity(vertical, classic, 'classic-9/vertical/maxRowWidth');
  const rowYs = [...new Set(vertical.nodes.filter((node) => node.id !== vertical.nodes[0].id).map((node) => node.y))];
  ok(rowYs.length === 2, 'maxRowWidth: reparte las hojas en 2 filas');
  ok(vertical.width < layoutTree(classic, { orientation: 'vertical' }).width, 'maxRowWidth: menos ancho');
  deepEq(layoutTree(classic, { orientation: 'vertical', maxRowWidth: 1000 }), vertical, 'maxRowWidth: determinista');
}

{
  // Nodos con notas: crecen y no se solapan.
  const tree = buildPresetTree('coverage-tree');
  const plain = layoutTree(tree);
  const notes = layoutTree(tree, { showNotes: true });
  checkLayoutIntegrity(notes, tree, 'coverage-tree/showNotes');
  ok(notes.height >= plain.height, 'showNotes: el árbol crece en vertical');
  for (const node of notes.nodes) ok(Array.isArray(node.noteLines), 'showNotes: noteLines presentes');
  ok(notes.nodes.some((node) => node.noteLines.length > 0), 'showNotes: alguna nota partida en líneas');
  ok(notes.height > plain.height, 'showNotes: altura mayor');
}

{
  // Árbol de un solo nodo y opciones de tamaño.
  const single = createTree();
  const layout = layoutTree(single);
  eq(layout.nodes.length, 1, 'layout de un nodo: un nodo');
  eq(layout.edges.length, 0, 'layout de un nodo: sin aristas');
  eq(layout.legend.length, 0, 'layout de un nodo: sin leyenda');
  ok(layout.width > 0 && layout.height > 0, 'layout de un nodo: tamaño válido');

  const custom = layoutTree(buildPresetTree('classic-9'), { nodeW: 200, nodeH: 120, gapX: 70, gapY: 30 });
  checkLayoutIntegrity(custom, buildPresetTree('classic-9'), 'opciones de tamaño');
  eq(custom.nodes[0].w, 200, 'opciones de tamaño: nodeW aplicado');
  ok(custom.nodes[0].h >= 120, 'opciones de tamaño: nodeH mínimo aplicado');
}

// ===========================================================================
// 8. layoutTree: mini-diagramas y textos
// ===========================================================================
for (const id of PRESET_IDS) {
  const tree = buildPresetTree(id);
  const layout = layoutTree(tree);
  for (const node of layout.nodes) {
    ok(Array.isArray(node.labelLines) && node.labelLines.length > 0, `${id}/${node.id}: labelLines`);
    ok(Array.isArray(node.subLines), `${id}/${node.id}: subLines`);
    ok(node.labelLines.every((line) => typeof line === 'string'), `${id}/${node.id}: líneas de título`);
    ok(isFiniteNumber(node.labelX) && isFiniteNumber(node.labelY), `${id}/${node.id}: posición de título`);
    ok(isFiniteNumber(node.labelLineHeight), `${id}/${node.id}: interlineado de título`);
    ok(node.subY >= node.labelY, `${id}/${node.id}: subtítulo bajo el título`);
    ok(
      node.routeBox.x >= node.x - 0.01 &&
        node.routeBox.y >= node.y - 0.01 &&
        node.routeBox.x + node.routeBox.w <= node.x + node.w + 0.01 &&
        node.routeBox.y + node.routeBox.h <= node.y + node.h + 0.01,
      `${id}/${node.id}: routeBox dentro del nodo`
    );
    if (node.subLines.length > 0) {
      const needed = node.subY + node.subLines.length * node.subLineHeight;
      ok(node.routeBox.y >= needed + 6 - 0.02, `${id}/${node.id}: hueco suficiente bajo el subtítulo`);
    }
    if (node.routePoints.length) {
      for (const point of node.routePoints) {
        ok(isFiniteNumber(point.x) && isFiniteNumber(point.y), `${id}/${node.id}: punto de ruta finito`);
        ok(
          point.x >= node.routeBox.x - 0.01 &&
            point.x <= node.routeBox.x + node.routeBox.w + 0.01 &&
            point.y >= node.routeBox.y - 0.01 &&
            point.y <= node.routeBox.y + node.routeBox.h + 0.01,
          `${id}/${node.id}: ruta dentro del routeBox`
        );
      }
      const routePoint = nodeRoute(tree, tree.nodes.find((n) => n.id === node.id));
      const minYardY = Math.min(0, ...routePoint.map((point) => point.y));
      eq(node.routePoints.length, routePoint.length + 1, `${id}/${node.id}: origen incluido en routePoints`);
      if (minYardY >= 0) {
        ok(
          Math.abs(node.routePoints[0].y - (node.routeBox.y + node.routeBox.h)) < 0.02,
          `${id}/${node.id}: la ruta arranca en el borde inferior`
        );
      } else {
        ok(node.routePoints[0].y < node.routeBox.y + node.routeBox.h, `${id}/${node.id}: ruta con origen dentro`);
      }
    } else {
      eq(node.routePoints.length, 0, `${id}/${node.id}: sin ruta, sin puntos`);
    }
  }
}

// ===========================================================================
// 9. renderTreeSVG
// ===========================================================================
for (const id of PRESET_IDS) {
  const tree = buildPresetTree(id);
  const snapshot = JSON.stringify(tree);
  const layout = layoutTree(tree);
  for (const theme of ['dark', 'print']) {
    const svg = renderTreeSVG(tree, { width: 1200, theme });
    const label = `${id}/${theme}`;
    ok(svg.startsWith('<svg'), `${label}: empieza por <svg`);
    ok(svg.endsWith('</svg>'), `${label}: cierra </svg>`);
    ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), `${label}: xmlns`);
    ok(/viewBox="0 0 [\d.]+ [\d.]+"/.test(svg), `${label}: viewBox`);
    ok(svg.includes('width="1200"'), `${label}: respeta opts.width`);
    ok(!svg.includes('NaN'), `${label}: sin NaN`);
    ok(!svg.includes('undefined'), `${label}: sin undefined`);
    const textCount = (svg.match(/<text /g) || []).length;
    ok(textCount >= layout.nodes.length, `${label}: al menos un <text> por nodo`);
    ok((svg.match(/<g/g) || []).length === (svg.match(/<\/g>/g) || []).length, `${label}: grupos equilibrados`);
    ok((svg.match(/<text /g) || []).length === (svg.match(/<\/text>/g) || []).length, `${label}: textos equilibrados`);
    for (const node of layout.nodes) {
      ok(svg.includes(`data-node-id="${node.id}"`), `${label}: data-node-id de ${node.id}`);
    }
  }
  eq(JSON.stringify(tree), snapshot, `${id}: renderTreeSVG no muta el árbol`);
}

{
  const tree = buildPresetTree('classic-9');
  const first = tree.nodes.find((node) => node.parentId);
  const selected = renderTreeSVG(tree, { selectedId: first.id, theme: 'dark' });
  ok(selected.includes(`data-node-id="${first.id}"`), 'selectedId: el nodo existe');
  ok(selected.includes('stroke="#9ae63f" stroke-width="2"'), 'selectedId: resaltado con el color de selección');
  const notSelected = renderTreeSVG(tree, { selectedId: 'no-existe' });
  ok(!notSelected.includes('stroke="#9ae63f" stroke-width="2"'), 'selectedId: id desconocido no resalta nada');

  const printSvg = renderTreeSVG(tree, { theme: 'print' });
  ok(printSvg.includes('fill="#ffffff"'), 'print: fondo blanco en el SVG');
  ok(printSvg.includes('#111827'), 'print: tinta #111827 en el SVG');
  const darkSvg = renderTreeSVG(tree, { theme: 'dark' });
  ok(darkSvg.includes(`fill="${TREE_THEMES.dark.bg}"`), 'dark: fondo del tema turf');
  ok(!darkSvg.includes('LEYENDA') === false, 'dark: leyenda visible por defecto');

  const custom = renderTreeSVG(tree, {
    width: 800,
    title: 'Mi árbol <uno> & dos',
    subtitle: 'Subtítulo',
    footer: 'Pie de página',
    watermark: 'BORRADOR',
  });
  ok(custom.includes('Mi árbol &lt;uno&gt; &amp; dos'), 'título escapado en el SVG');
  ok(!custom.includes('<uno>'), 'título no inyecta etiquetas');
  ok(custom.includes('Subtítulo'), 'subtitle opcional');
  ok(custom.includes('Pie de página'), 'footer opcional');
  ok(custom.includes('BORRADOR'), 'watermark opcional');
  ok(custom.includes('width="800"'), 'ancho personalizado');

  ok(!renderTreeSVG(tree, { showLegend: false }).includes('LEYENDA'), 'showLegend:false oculta la leyenda');
  ok(renderTreeSVG(tree, { showLegend: false }).length < darkSvg.length, 'showLegend:false acorta el SVG');
  ok(renderTreeSVG(tree, { nodeScale: 1.25 }).startsWith('<svg'), 'nodeScale: SVG válido');
  ok(!renderTreeSVG(tree, { nodeScale: 1.25 }).includes('NaN'), 'nodeScale: sin NaN');

  const columnsSvg = renderTreeSVG(tree, { width: 1200, maxColumnHeight: 620 });
  ok(columnsSvg.startsWith('<svg') && !columnsSvg.includes('NaN'), 'maxColumnHeight: SVG válido sin NaN');
  ok(columnsSvg.length > 1000, 'maxColumnHeight: contenido generado');

  const notesSvg = renderTreeSVG(tree, { showNotes: true });
  ok(notesSvg.startsWith('<svg') && !notesSvg.includes('NaN'), 'showNotes: SVG válido');
}

// ===========================================================================
// 10. renderNodeThumb
// ===========================================================================
{
  const slant = renderNodeThumb({ routeId: 'slant' }, { width: 120, height: 80 });
  ok(slant.startsWith('<svg'), 'thumb: empieza por <svg');
  ok(slant.endsWith('</svg>'), 'thumb: cierra </svg>');
  ok(slant.includes('xmlns="http://www.w3.org/2000/svg"'), 'thumb: xmlns');
  ok(slant.includes('<polyline'), 'thumb: dibuja la ruta');
  ok(!slant.includes('NaN') && !slant.includes('undefined'), 'thumb: sin NaN ni undefined');
  ok(slant.includes('width="120"'), 'thumb: ancho solicitado');
  const go = renderNodeThumb({ routeId: 'go' }, { width: 120, height: 80 });
  notEq(slant, go, 'thumb: rutas distintas generan SVG distintos');
  const custom = renderNodeThumb({ points: [{ x: 0, y: 5 }, { x: 9, y: 9 }] });
  ok(custom.includes('<polyline'), 'thumb: acepta points');
  ok(renderNodeThumb('screen').includes('<polyline'), 'thumb: acepta un id de ruta');
  ok(!renderNodeThumb('no-existe').includes('<polyline'), 'thumb: ruta inexistente sin ruta');
  const printThumb = renderNodeThumb({ routeId: 'post' }, { theme: 'print' });
  ok(printThumb.includes('#111827'), 'thumb: tema print');
}

// ===========================================================================
// Resumen
// ===========================================================================
console.log(`route-tree: ${checks} comprobaciones en verde.`);
