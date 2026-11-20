// Tests de src/tree-ui.js — solo funciones puras (sin DOM).
// Ejecutar: node tests/tree-ui.mjs
//
// `createTreeEditor` necesita un navegador, así que aquí solo se comprueba que
// se exporta; el editor se valida a mano con qa/tree-demo.html.
import assert from 'node:assert/strict';
import { nodeFormDefaults, outlineToRows, createTreeEditor } from '../src/tree-ui.js';

let passed = 0;

function ok(condition, message) {
  passed += 1;
  assert.ok(condition, message);
}

function eq(actual, expected, message) {
  passed += 1;
  assert.deepEqual(actual, expected, message);
}

// --- A. Superficie de la API ----------------------------------------------

ok(typeof createTreeEditor === 'function', 'createTreeEditor se exporta y es una función');
ok(typeof nodeFormDefaults === 'function', 'nodeFormDefaults se exporta y es una función');
ok(typeof outlineToRows === 'function', 'outlineToRows se exporta y es una función');

// --- B. nodeFormDefaults --------------------------------------------------

const fullNode = {
  id: 'n3',
  parentId: 'n1',
  number: '  3  ',
  title: '  Rueda exterior  ',
  subtitle: '  Profundidad 12 yd · banda derecha  ',
  kind: 'route',
  routeId: 'wheel',
  points: [{ x: 0, y: 0 }, { x: -2, y: 15 }],
  depth: 12,
  notes: 'Sale por detrás del flat defender.\nOjo al safety.',
  color: '#63c8ff',
};

const full = nodeFormDefaults(fullNode);
eq(
  full,
  {
    number: '3',
    title: 'Rueda exterior',
    subtitle: 'Profundidad 12 yd · banda derecha',
    depth: 12,
    color: '#63c8ff',
    notes: 'Sale por detrás del flat defender.\nOjo al safety.',
  },
  'nodeFormDefaults normaliza y recorta los textos del nodo completo'
);
eq(
  Object.keys(full),
  ['number', 'title', 'subtitle', 'depth', 'color', 'notes'],
  'nodeFormDefaults devuelve exactamente las seis claves del formulario'
);

const empty = nodeFormDefaults(null);
eq(empty.number, '', 'sin nodo, el número queda vacío');
eq(empty.title, '', 'sin nodo, el título queda vacío');
eq(empty.subtitle, '', 'sin nodo, el subtítulo queda vacío');
eq(empty.depth, 0, 'sin nodo, la profundidad es 0');
eq(empty.color, null, 'sin nodo, el color es automático (null)');
eq(empty.notes, '', 'sin nodo, las notas quedan vacías');

const undefinedForm = nodeFormDefaults(undefined);
eq(undefinedForm.depth, 0, 'nodeFormDefaults tolera undefined');
eq(undefinedForm.color, null, 'nodeFormDefaults(null) devuelve color null');

eq(nodeFormDefaults({ depth: -9 }).depth, 0, 'la profundidad negativa se recorta a 0');
eq(nodeFormDefaults({ depth: 41 }).depth, 30, 'la profundidad por encima de 30 se recorta a 30');
eq(nodeFormDefaults({ depth: 11.6 }).depth, 12, 'la profundidad se redondea al entero más cercano');
eq(nodeFormDefaults({ depth: '8' }).depth, 8, 'la profundidad acepta cadenas numéricas');
eq(nodeFormDefaults({ depth: 'no' }).depth, 0, 'una profundidad ilegible cae a 0');
eq(nodeFormDefaults({ depth: Infinity }).depth, 0, 'una profundidad infinita cae a 0');

eq(nodeFormDefaults({ number: 7 }).number, '7', 'un número numérico se convierte a texto');
eq(nodeFormDefaults({ color: '   ' }).color, null, 'un color en blanco es automático');
eq(nodeFormDefaults({ color: ' #9ae63f ' }).color, '#9ae63f', 'el color se recorta');
eq(nodeFormDefaults({ notes: 0 }).notes, '0', 'las notas 0 se conservan como texto');

const noMutateInput = { number: '1', title: 'In', depth: 3, notes: 'x' };
const snapshot = JSON.stringify(noMutateInput);
nodeFormDefaults(noMutateInput);
eq(JSON.stringify(noMutateInput), snapshot, 'nodeFormDefaults no muta el nodo de entrada');

// --- C. outlineToRows -----------------------------------------------------

const outline = [
  { id: 'root', depth: 0, number: '1', title: 'Árbol de pases', hasChildren: true },
  { id: 'a', depth: 1, number: '2', title: 'Out', hasChildren: false },
  { id: 'b', depth: 2, number: '3', title: 'Rueda', hasChildren: false },
];

const rows = outlineToRows(outline);
eq(rows.length, 3, 'outlineToRows conserva el número de filas del esquema');
eq(
  rows.map((row) => row.id),
  ['root', 'a', 'b'],
  'outlineToRows conserva el orden del esquema'
);
eq(rows[0].label, '1 · Árbol de pases', 'la etiqueta combina número y título');
eq(rows[0].indent, 0, 'la raíz no lleva sangría');
eq(rows[2].indent, 2, 'la sangría sigue la profundidad del esquema');
eq(rows[0].hasChildren, true, 'hasChildren se copia de la raíz');
eq(rows[1].hasChildren, false, 'hasChildren se copia de la hoja');

eq(rows[0].isSelected, false, 'sin selección, ninguna fila está marcada');
eq(rows.every((row) => row.isSelected === false), true, 'sin selección no hay filas activas');

const withSelection = outlineToRows(outline, 'b');
eq(
  withSelection.map((row) => row.isSelected),
  [false, false, true],
  'selectedId marca exactamente una fila'
);

const withFlag = outlineToRows([
  { id: 'x', depth: 1, number: 'A', title: 'Post', hasChildren: false, selected: true },
  { id: 'y', depth: 1, number: 'B', title: 'Corner', hasChildren: false },
]);
eq(
  withFlag.map((row) => row.isSelected),
  [true, false],
  'si no se pasa selectedId se respeta la marca «selected» de route-tree'
);

eq(
  outlineToRows([{ id: 'z', depth: 0, number: '', title: 'Solo título', hasChildren: false }])[0].label,
  'Solo título',
  'sin número, la etiqueta es el título'
);
eq(
  outlineToRows([{ id: 'z', depth: 0, number: '9', title: '   ', hasChildren: false }])[0].label,
  '9',
  'sin título, la etiqueta es el número'
);
eq(
  outlineToRows([{ id: 'z', depth: 0, hasChildren: false }])[0].label,
  '(sin título)',
  'sin número ni título hay una etiqueta de reserva'
);

const degenerate = outlineToRows([
  { id: 'n', depth: -3, number: '1', title: 'In' },
  { id: 'm', depth: 2.9, number: '2', title: 'Out' },
  { id: 'o', depth: undefined, number: '3', title: 'Go' },
]);
eq(degenerate[0].indent, 0, 'una profundidad negativa no genera sangría');
eq(degenerate[1].indent, 2, 'una profundidad decimal se trunca para la sangría');
eq(degenerate[2].indent, 0, 'una profundidad indefinida no genera sangría');

// treeOutline numera los niveles desde 1: la raíz debe quedar a ras igualmente.
const treeOutlineShape = outlineToRows([
  { id: 'root', depth: 1, number: '0', title: 'Inicio', hasChildren: true },
  { id: 'a', depth: 2, number: '1', title: 'In', hasChildren: false },
  { id: 'b', depth: 2, number: '2', title: 'Out', hasChildren: false },
]);
eq(
  treeOutlineShape.map((row) => row.indent),
  [0, 1, 1],
  'la sangría es relativa al nivel menos profundo (treeOutline empieza en 1)'
);

const deepTree = outlineToRows([
  { id: 'r', depth: 3, number: '0', title: 'Inicio', hasChildren: true },
  { id: 'c', depth: 5, number: '1', title: 'In', hasChildren: false },
]);
eq(
  deepTree.map((row) => row.indent),
  [0, 2],
  'una raíz que no está en el nivel 1 tampoco se sangra'
);

const numericId = outlineToRows([{ id: 42, depth: 0, number: '1', title: 'In' }]);
eq(numericId[0].id, '42', 'los id numéricos se normalizan a texto');

eq(outlineToRows([]), [], 'un esquema vacío devuelve un array vacío');
eq(outlineToRows(null), [], 'outlineToRows tolera null');
eq(outlineToRows(undefined), [], 'outlineToRows tolera undefined');

const outlineSnapshot = JSON.stringify(outline);
outlineToRows(outline, 'a');
eq(JSON.stringify(outline), outlineSnapshot, 'outlineToRows no muta el esquema de entrada');

const shapes = outlineToRows(outline);
eq(
  Object.keys(shapes[0]).sort(),
  ['hasChildren', 'id', 'indent', 'isSelected', 'label'],
  'las filas solo contienen las cinco claves esperadas'
);

console.log(`\ntree-ui.mjs OK — ${passed} asertos superados.`);
