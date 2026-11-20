// Tests de las operaciones de edición del árbol de rutas:
// reordenar hermanos, cambiar de padre y editar la ruta punto a punto.
import assert from 'node:assert/strict';
import { getRoute, registerCustomRoutes, isCustomRoute } from '../src/presets.js';
import {
  buildPresetTree,
  layoutNode,
  layoutTree,
  mirrorNodeRoute,
  moveNodeDown,
  moveNodeUp,
  nodeRouteYards,
  renderTreeSVG,
  reorderNode,
  reparentNode,
  routePointToYards,
  routePointsOf,
  setNodeRoute,
  siblingIndex,
  addNode,
  appendRoutePoint,
  clearNodeRoute,
  yardsToRoutePoint,
} from '../src/route-tree.js';

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

const tree = buildPresetTree('classic-9');
const root = tree.nodes.find((x) => !x.parentId);
const kids = () => tree.nodes.filter((x) => x.parentId === root.id);
const order = (t) => t.nodes.filter((x) => x.parentId === root.id).map((x) => x.number);
const initial = order(tree);

ok(kids().length === 9, 'el árbol de prueba tiene 9 hijos');
ok(initial.join(',') === '1,2,3,4,5,6,7,8,9', 'orden inicial 1..9');
ok(siblingIndex(tree, kids()[3].id) === 3, 'siblingIndex devuelve la posición');

// ---------- no mutación ----------
moveNodeDown(tree, kids()[0].id);
ok(order(tree).join(',') === initial.join(','), 'las operaciones no mutan el árbol original');

// ---------- moveNodeUp / moveNodeDown ----------
const down1 = moveNodeDown(tree, kids()[0].id);
ok(order(down1).join(',') === '2,1,3,4,5,6,7,8,9', 'moveNodeDown baja el primero');
const up1 = moveNodeUp(down1, kids()[0].id);
ok(order(up1).join(',') === '1,2,3,4,5,6,7,8,9', 'moveNodeUp lo devuelve a su sitio');
ok(order(moveNodeUp(tree, kids()[0].id)).join(',') === initial.join(','), 'subir el primero es no-op');
ok(order(moveNodeDown(tree, kids()[8].id)).join(',') === initial.join(','), 'bajar el último es no-op');
ok(order(moveNodeUp(tree, root.id)).join(',') === initial.join(','), 'la raíz no se mueve');

// ---------- reorderNode ----------
ok(order(reorderNode(tree, kids()[8].id, 0)).join(',') === '9,1,2,3,4,5,6,7,8', 'mover el último al principio');
ok(order(reorderNode(tree, kids()[0].id, 8)).join(',') === '2,3,4,5,6,7,8,9,1', 'mover el primero al final');
ok(order(reorderNode(tree, kids()[4].id, 2)).join(',') === '1,2,5,3,4,6,7,8,9', 'mover el 5º al índice 2');
ok(order(reorderNode(tree, kids()[3].id, 99)).join(',') === '1,2,3,5,6,7,8,9,4', 'índice fuera de rango se acota');
ok(order(reorderNode(tree, kids()[3].id, 3)).join(',') === initial.join(','), 'mover a su misma posición no cambia nada');

// ---------- reparentNode ----------
const child = kids()[1];
const newParent = kids()[4];
const re = reparentNode(tree, child.id, newParent.id);
ok(re.nodes.find((x) => x.id === child.id).parentId === newParent.id, 'reparentNode cambia el padre');
ok(!re.nodes.filter((x) => x.parentId === root.id).some((x) => x.id === child.id), 'ya no es hijo de la raíz');
ok(
  re.nodes.filter((x) => x.parentId === newParent.id).map((x) => x.id).includes(child.id),
  'aparece como hijo del nuevo padre'
);
ok(re.nodes.length === tree.nodes.length, 'no se pierden nodos al re-parentar');
// Ahora `child` es hijo de `newParent`: meter el padre dentro del hijo es un ciclo.
assert.throws(
  () => reparentNode(re, newParent.id, child.id),
  'meter un nodo dentro de su propio descendiente lanza error'
);
ok(true, 'ciclo detectado');

const reIndexed = reparentNode(tree, kids()[3].id, newParent.id, 0);
ok(
  reIndexed.nodes.filter((x) => x.parentId === newParent.id)[0].id === kids()[3].id,
  'reparentNode admite índice entre los nuevos hermanos'
);

// ---------- ruta del nodo ----------
const nodeA = kids()[0];
const template = nodeRouteYards(tree, nodeA.id);
ok(template.length >= 2, 'la ruta de plantilla tiene al menos 2 puntos');

const custom = setNodeRoute(tree, nodeA.id, [
  { x: 3, y: 6 },
  { x: 10, y: 7 },
]);
const customNode = custom.nodes.find((x) => x.id === nodeA.id);
ok(customNode.routeId === null, 'al escribir puntos se suelta la plantilla');
ok(JSON.stringify(nodeRouteYards(custom, nodeA.id)) === JSON.stringify([{ x: 3, y: 6 }, { x: 10, y: 7 }]), 'los puntos se guardan');
ok(nodeRouteYards(tree, nodeA.id).length === template.length, 'el árbol original mantiene su ruta de plantilla');

const bad = setNodeRoute(tree, nodeA.id, [{ x: 'x', y: 2 }, { x: 5, y: 5 }, { x: Infinity, y: 1 }]);
ok(nodeRouteYards(bad, nodeA.id).length === 1, 'los puntos inválidos se descartan');

const appended = appendRoutePoint(custom, nodeA.id, { x: 14, y: 9 });
ok(nodeRouteYards(appended, nodeA.id).length === 3, 'appendRoutePoint añade un punto');
ok(nodeRouteYards(appended, nodeA.id)[2].x === 14, 'el punto añadido es el último');

const cleared = clearNodeRoute(tree, nodeA.id);
ok(nodeRouteYards(cleared, nodeA.id).length === 0, 'clearNodeRoute deja la ruta vacía');

const mirrored = mirrorNodeRoute(custom, nodeA.id);
ok(nodeRouteYards(mirrored, nodeA.id)[0].x === -3, 'mirrorNodeRoute invierte la x');

// ---------- layout en modo edición ----------
const L = layoutTree(tree, { editRouteId: nodeA.id });
const edited = layoutNode(L, nodeA.id);
const plain = layoutNode(L, kids()[1].id);
ok(!!edited.editOrigin && edited.editScale > 0, 'el nodo en edición tiene origen y escala');
ok(edited.editOrigin && Number.isFinite(edited.editOrigin.x), 'el origen es finito');
ok(edited.editScale > 0.4 && edited.editScale < 12, 'la escala de edición es razonable');
ok(!plain.editOrigin && !plain.editScale, 'los demás nodos no llevan modo edición');
ok(routePointsOf(L, nodeA.id).length === template.length + 1, 'routePoints incluye el origen del jugador');

const L2 = layoutTree(tree, { editRouteId: nodeA.id });
ok(JSON.stringify(L.nodes.map((x) => [x.id, x.x, x.y])) === JSON.stringify(L2.nodes.map((x) => [x.id, x.x, x.y])), 'el layout en edición es determinista');

// La escala es fija: mover un punto no cambia el origen.
const moved = setNodeRoute(tree, nodeA.id, [{ x: 2, y: 4 }, { x: 8, y: 12 }]);
const editedMoved = layoutNode(layoutTree(moved, { editRouteId: nodeA.id }), nodeA.id);
ok(
  Math.abs(editedMoved.editOrigin.x - edited.editOrigin.x) < 0.01 &&
    Math.abs(editedMoved.editOrigin.y - edited.editOrigin.y) < 0.01,
  'el origen de edición no se mueve al cambiar la ruta'
);
ok(editedMoved.editScale === edited.editScale, 'la escala de edición se mantiene');

// ---------- conversión de coordenadas ----------
const yd = { x: 5.5, y: 9 };
const px = yardsToRoutePoint(edited, yd);
const back = routePointToYards(edited, px);
ok(Math.abs(back.x - yd.x) < 0.01 && Math.abs(back.y - yd.y) < 0.01, 'ida y vuelta yardas <-> layout');

// ---------- SVG con asas ----------
const svg = renderTreeSVG(tree, { width: 1000, editRouteId: nodeA.id });
ok((svg.match(/data-route-handle=/g) || []).length === template.length, 'una asa por punto editable');
ok(svg.includes('data-route-area="1"'), 'hay zona de clic para añadir puntos');
ok(!/NaN|undefined/.test(svg), 'el SVG de edición no contiene NaN ni undefined');
const svgPlain = renderTreeSVG(tree, { width: 1000 });
ok(!svgPlain.includes('data-route-handle='), 'sin modo edición no hay asas');

// ---------- añadir un nodo nuevo con ruta propia ----------
let grown = tree;
const added = addNode(grown, kids()[2].id, { title: 'Ruta nueva', number: '10' });
grown = added.tree || added;
const newId = (added.node && added.node.id) || grown.nodes[grown.nodes.length - 1].id;
const withRoute = setNodeRoute(grown, newId, [{ x: 4, y: 8 }, { x: 12, y: 10 }]);
ok(nodeRouteYards(withRoute, newId).length === 2, 'un nodo nuevo puede tener ruta propia');
const layNew = layoutTree(withRoute, { editRouteId: newId });
ok(!!layoutNode(layNew, newId).editOrigin, 'el nodo nuevo se puede editar');

// ---------- miniaturas honestas: no agrandan rutas cortas ----------
{
  const corta = { id: 'route_corta', name: 'Corta', category: 'Corta', points: [{ x: 0, y: 4 }] };
  const larga = { id: 'route_larga', name: 'Larga', category: 'Profunda', points: [{ x: 0, y: 20 }] };
  registerCustomRoutes([corta, larga]);
  const base = buildPresetTree('classic-9');
  const root = base.nodes.find((n) => !n.parentId);
  const hijo = base.nodes.find((n) => n.parentId === root.id);
  const conRuta = (routeId) => ({
    ...base,
    nodes: base.nodes.map((n) => (n.id === hijo.id ? { ...n, routeId, points: [] } : n)),
  });
  const Lc = layoutTree(conRuta('route_corta'));
  const Ll = layoutTree(conRuta('route_larga'));
  const alto = (L) => {
    const pts = layoutNode(L, hijo.id).routePoints;
    return Math.abs(pts[pts.length - 1].y - pts[0].y);
  };
  ok(alto(Ll) > alto(Lc) * 3, 'una ruta de 20 yd se dibuja mucho más alta que una de 4 yd');
  ok(alto(Lc) < 20, 'la ruta corta no se estira hasta llenar el recuadro');

  // Ruta degenerada: se avisa en vez de dibujar una ruta falsa.
  const vacia = { id: 'route_vacia', name: 'Vacia', category: 'Corta', points: [{ x: 0, y: 0.1 }, { x: 0, y: 0.3 }] };
  registerCustomRoutes([vacia]);
  const svgVacia = renderTreeSVG(conRuta('route_vacia'), { width: 900 });
  ok(/Sin dibujar/.test(svgVacia), 'una ruta sin recorrido muestra «Sin dibujar»');
  ok(!/Sin dibujar/.test(renderTreeSVG(conRuta('route_larga'), { width: 900 })), 'una ruta con recorrido no lo muestra');
  registerCustomRoutes([]);
}

// ---------- rutas propias visibles en el árbol ----------
const propia = { id: 'route_propia_1', name: 'Mi ruta', category: 'Corta', points: [{ x: 4, y: 7 }, { x: 11, y: 8 }] };
registerCustomRoutes([propia]);
ok(getRoute('route_propia_1') !== null, 'getRoute encuentra una ruta propia');
ok(JSON.stringify(getRoute('route_propia_1').points) === JSON.stringify(propia.points), 'devuelve sus puntos');
ok(isCustomRoute('route_propia_1') === true, 'se marca como propia');
ok(isCustomRoute('slant') === false, 'las plantillas no son propias');
ok(getRoute('slant') !== null, 'las plantillas siguen resolviéndose');
registerCustomRoutes([]);
ok(getRoute('route_propia_1') === null, 'al vaciar el registro desaparecen');

// Un nodo del árbol que use una ruta propia tiene que dibujarla.
registerCustomRoutes([propia]);
const conPropia = setNodeRoute(tree, kids()[0].id, []);
const conRouteId = {
  ...conPropia,
  nodes: conPropia.nodes.map((nd) => (nd.id === kids()[0].id ? { ...nd, routeId: 'route_propia_1', points: [] } : nd)),
};
const layPropia = layoutTree(conRouteId, { editRouteId: kids()[0].id });
ok(layoutNode(layPropia, kids()[0].id).routePoints.length === propia.points.length + 1, 'el nodo dibuja la ruta propia');
const svgPropia = renderTreeSVG(conRouteId, { width: 900, editRouteId: kids()[0].id });
ok(!/NaN|undefined/.test(svgPropia), 'el SVG con ruta propia es válido');
registerCustomRoutes([]);

console.log(`OK: ${n} comprobaciones de edición del árbol (tests/route-tree-edit.mjs).`);
