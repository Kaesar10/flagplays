// Tests de la exportación del árbol de rutas a PDF (sin DOM).
import assert from 'node:assert/strict';
import { buildTreePdf, exportTreePdf } from '../src/tree-pdf.js';
import { buildPresetTree, PRESET_TREES, createTree, addNode, normalizeTree, treeStats } from '../src/route-tree.js';

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

const PRESET_IDS = (PRESET_TREES || []).map((p) => p.id);
ok(PRESET_IDS.length >= 4, 'hay al menos 4 plantillas de árbol');

// ---------- PDF de cada plantilla ----------
for (const id of PRESET_IDS) {
  const tree = buildPresetTree(id);
  ok(!!tree, `${id}: se construye`);
  const pdf = buildTreePdf(tree, {});
  const bytes = pdf.bytes();
  const v = pdf.validate();

  ok(v.ok === true, `${id}: PDF válido (${v.errors.join('; ')})`);
  ok(bytes.length > 2500, `${id}: el PDF tiene contenido (${bytes.length} B)`);
  ok(String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-', `${id}: cabecera %PDF`);
  ok(pdf.pageCount >= 2, `${id}: al menos 2 páginas (portada + detalle)`);
  ok(pdf.pageCount <= 12, `${id}: no genera un PDF desmesurado`);
  // Todas las páginas del PDF están declaradas en el catálogo.
  const text = new TextDecoder('latin1').decode(bytes);
  ok(text.includes('/Type /Pages'), `${id}: catálogo de páginas`);
  ok(/\/Count\s+\d+/.test(text), `${id}: /Count presente`);
  const count = Number((text.match(/\/Count\s+(\d+)/) || [])[1]);
  ok(count === pdf.pageCount, `${id}: /Count (${count}) coincide con pageCount (${pdf.pageCount})`);
  ok(text.includes('%%EOF'), `${id}: termina en %%EOF`);
}

// ---------- portada contiene el nombre y las estadísticas ----------
{
  const tree = buildPresetTree(PRESET_IDS[0]);
  const pdf = buildTreePdf(tree, {});
  const raw = new TextDecoder('latin1').decode(pdf.bytes());
  ok(raw.length > 3000, 'el PDF contiene operadores de dibujo');
  const stats = treeStats(tree);
  ok(stats.nodes === tree.nodes.length, 'treeStats cuenta todos los nodos');
  ok(stats.leaves >= 1, 'el árbol tiene hojas');
}

// ---------- árbol sin notas ni color propio ----------
{
  const tree = createTree('passing', 'Árbol mínimo');
  ok(tree.nodes.length >= 1, 'createTree crea la raíz');
  const pdf = buildTreePdf(normalizeTree(tree), {});
  ok(pdf.validate().ok, 'un árbol mínimo genera PDF válido');
  ok(pdf.pageCount >= 1, 'un árbol mínimo tiene al menos una página');
}

// ---------- árbol grande: se pagina y no explota ----------
{
  const base = buildPresetTree(PRESET_IDS[0]);
  let big = normalizeTree({ ...base, name: 'Árbol grande de prueba' });
  const root = big.nodes.find((x) => !x.parentId);
  for (let i = 0; i < 10; i++) {
    const res = addNode(big, root.id, {
      title: `Ruta extra ${i + 1}`,
      number: String(10 + i),
      depth: 6 + i,
      points: [{ x: 2, y: 6 }, { x: 6 + i, y: 10 }],
    });
    big = res.tree || res;
  }
  const pdf = buildTreePdf(big, {});
  ok(pdf.validate().ok, 'un árbol grande genera PDF válido');
  ok(pdf.pageCount >= 2, 'un árbol grande se reparte en varias páginas');
  ok(pdf.pageCount <= 20, 'un árbol grande no genera infinitas páginas');
}

// ---------- opciones ----------
{
  const tree = buildPresetTree(PRESET_IDS[0]);
  const letter = buildTreePdf(tree, { pageSize: 'Letter' });
  ok(letter.validate().ok, 'tamaño Carta soportado');
  ok(Math.abs(letter.width - 612) < 1, 'ancho Carta (612 pt)');
  const a4 = buildTreePdf(tree, {});
  ok(Math.abs(a4.width - 595.28) < 1, 'ancho A4 (595 pt)');
  // exportTreePdf sin descarga devuelve los bytes
  const bytes = exportTreePdf(tree, { download: false });
  ok(bytes instanceof Uint8Array, 'exportTreePdf devuelve Uint8Array');
  ok(bytes.length > 2500, 'exportTreePdf devuelve contenido');
}

// ---------- robustez ----------
{
  const tree = buildPresetTree(PRESET_IDS[0]);
  // nombres con acentos y caracteres raros no deben romper el PDF
  const weird = normalizeTree({ ...tree, name: 'Árbol ñandú «raro» ¿qué? €' });
  const pdf = buildTreePdf(weird, {});
  ok(pdf.validate().ok, 'nombres con acentos y símbolos generan PDF válido');
}

console.log(`OK: ${n} comprobaciones de tree-pdf (tests/tree-pdf.mjs).`);
