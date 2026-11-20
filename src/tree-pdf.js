// Exportación a PDF de los árboles de rutas.
// Puente entre el layout que produce route-tree.js y el escritor de PDF (pdf.js).
// Genera un PDF vectorial con la portada del árbol y las páginas de detalle.
import { createPdf, PAGE_SIZES } from './pdf.js';
import { layoutTree, treeStats } from './route-tree.js';

const INK = '#111827';
const MUTED = '#4b5563';
const FAINT = '#9ca3af';
const LINE = '#d1d5db';
const BOX_FILL = '#ffffff';
const ACCENT = '#3f6f0a';
const ACCENT_SOFT = '#eef7e2';

const A4 = PAGE_SIZES.A4;

/** Color del nodo (o el de acento de FlagPlays si no tiene). */
function nodeColor(node) {
  return node.color || ACCENT;
}

/** Quita acentos y caracteres raros de un nombre para el fichero. */
function fileSafe(name) {
  return String(name || 'arbol')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s._-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'arbol';
}

/** Cabecera común de cada página. */
function drawHeader(pdf, { title, subtitle, margin, pageLabel }) {
  pdf.text(title, margin, margin - 2, { font: 'bold', size: 15, color: INK });
  if (subtitle) pdf.text(subtitle, margin, margin + 15, { font: 'regular', size: 9, color: MUTED });
  pdf.line(margin, margin + 27, pdf.width - margin, margin + 27, { stroke: LINE, lineWidth: 0.8 });
  if (pageLabel) {
    pdf.text(pageLabel, pdf.width - margin, margin - 2, { font: 'regular', size: 8.5, color: FAINT, align: 'right' });
  }
}

/** Pie común. */
function drawFooter(pdf, { margin, brand = 'FlagPlays · Árbol de rutas' }) {
  const y = pdf.height - margin + 10;
  pdf.line(margin, y - 8, pdf.width - margin, y - 8, { stroke: LINE, lineWidth: 0.6 });
  pdf.text(brand, margin, y, { font: 'regular', size: 7.5, color: FAINT });
  pdf.text(`pág. ${pdf.pageCount}`, pdf.width - margin, y, { font: 'regular', size: 7.5, color: FAINT, align: 'right' });
}

/** Dibuja un layout ya calculado, escalado y trasladado. */
const finitePts = (pts) =>
  Array.isArray(pts)
    ? pts.filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
    : [];

/**
 * Dibuja un layout ya calculado aplicando escala y traslación a mano (el escritor
 * de PDF no expone `scale`, y así controlamos el tamaño de letra resultante).
 */
function drawLayout(pdf, layout, { x, y, scale, showNotes = false }) {
  const bx = layout.bounds?.x || 0;
  const by = layout.bounds?.y || 0;
  const S = (v) => v * scale;
  const TX = (v) => x + (v - bx) * scale;
  const TY = (v) => y + (v - by) * scale;
  // Tamaño de letra resultante: nunca por debajo de 5,4 pt.
  const F = (size) => Math.max(5.4, size * scale);

  // aristas
  for (const edge of layout.edges || []) {
    const pts = finitePts(edge.points).map((pt) => ({ x: TX(pt.x), y: TY(pt.y) }));
    if (pts.length > 1) {
      pdf.polyline(pts, { stroke: LINE, lineWidth: Math.max(0.7, S(1.2)), lineCap: 'round', lineJoin: 'round' });
    }
  }

  // nodos
  for (const node of layout.nodes || []) {
    const color = nodeColor(node);
    pdf.rect(TX(node.x), TY(node.y), S(node.w), S(node.h), {
      fill: BOX_FILL,
      stroke: LINE,
      lineWidth: Math.max(0.6, S(1)),
      radius: S(7),
    });
    pdf.rect(TX(node.x), TY(node.y), Math.max(1.6, S(3.5)), S(node.h), { fill: color, radius: S(1.8) });

    // número
    const bx2 = TX(node.x + 17);
    const by2 = TY(node.y + 17);
    pdf.circle(bx2, by2, Math.max(5.5, S(8.5)), { fill: color });
    pdf.text(String(node.number || ''), bx2, by2, {
      font: 'bold',
      size: Math.max(5.6, S(8.5)),
      color: '#ffffff',
      align: 'center',
      baseline: 'middle',
    });

    // título y subtítulo
    const textX = TX(node.x + 31);
    const maxW = S(node.w - 38);
    const titleLines = (node.labelLines && node.labelLines.length ? node.labelLines : [node.title || '']).slice(0, 2);
    let ty = TY(node.y + 13);
    const titleSize = F(8.6);
    for (const line of titleLines) {
      pdf.text(line, textX, ty, { font: 'bold', size: titleSize, color: INK, maxWidth: maxW });
      ty += titleSize * 1.16;
    }
    const subLines = (node.subLines && node.subLines.length ? node.subLines : [node.subtitle || '']).filter(Boolean).slice(0, 2);
    const subSize = F(7.2);
    for (const line of subLines) {
      pdf.text(line, textX, ty + subSize * 0.15, { font: 'regular', size: subSize, color: MUTED, maxWidth: maxW });
      ty += subSize * 1.17;
    }

    // profundidad
    if (node.depth != null) {
      pdf.text(`${node.depth} yd`, TX(node.x + node.w - 8), TY(node.y + node.h - 7), {
        font: 'regular',
        size: F(6.8),
        color: FAINT,
        align: 'right',
      });
    }

    // mini diagrama de la ruta
    const box = node.routeBox;
    const rp = finitePts(node.routePoints);
    if (box && rp.length > 1) {
      pdf.line(TX(box.x + 4), TY(box.y + box.h - 6), TX(box.x + box.w - 4), TY(box.y + box.h - 6), {
        stroke: '#e5e7eb',
        lineWidth: Math.max(0.6, S(1)),
      });
      const pts = rp.map((pt) => ({ x: TX(pt.x), y: TY(pt.y) }));
      pdf.polyline(pts, {
        stroke: INK,
        lineWidth: Math.max(1, S(1.7)),
        lineCap: 'round',
        lineJoin: 'round',
        arrowEnd: true,
      });
      pdf.circle(pts[0].x, pts[0].y, Math.max(1.2, S(1.7)), { fill: INK });
    }

    if (showNotes && node.notes) {
      pdf.text(node.notes, TX(node.x + 8), TY(node.y + node.h - 6), {
        font: 'regular',
        size: F(6.4),
        color: MUTED,
        maxWidth: S(node.w - 16),
        maxLines: 2,
      });
    }
  }
}

/** Filtra el árbol dejando la raíz y un subconjunto de ramas de primer nivel. */
function pruneBranches(tree, branchIds) {
  const keep = new Set(branchIds);
  const root = tree.nodes.find((n) => !n.parentId);
  if (!root) return tree;
  const children = tree.nodes.filter((n) => n.parentId === root.id);
  const allowedTop = new Set(children.filter((c) => keep.has(c.id)).map((c) => c.id));
  const byParent = new Map();
  for (const node of tree.nodes) {
    if (!node.parentId) continue;
    if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
    byParent.get(node.parentId).push(node);
  }
  const nodes = [root];
  const walk = (parentId) => {
    for (const child of byParent.get(parentId) || []) {
      if (parentId === root.id && !allowedTop.has(child.id)) continue;
      nodes.push(child);
      walk(child.id);
    }
  };
  walk(root.id);
  return { ...tree, nodes };
}

/** Divide las ramas de primer nivel en grupos que quepan en una página. */
function planPages(tree, fit) {
  const root = tree.nodes.find((n) => !n.parentId);
  if (!root) return [{ tree, single: true }];
  const branches = tree.nodes.filter((n) => n.parentId === root.id);
  if (!branches.length) return [{ tree, single: true }];

  const full = fit(tree);
  if (full.scale >= 0.58) return [{ tree, single: true, layout: full.layout, scale: full.scale }];

  // Reparte las ramas en el menor número de páginas con grupos EQUILIBRADOS:
  // primero se prueba 1 página, luego 2, 3… y se queda la primera combinación
  // en la que todos los grupos se imprimen con tamaño legible.
  const fits = (ids) => fit(pruneBranches(tree, ids)).scale >= 0.58;
  for (let parts = 1; parts <= branches.length; parts++) {
    const perPage = Math.ceil(branches.length / parts);
    const groups = [];
    for (let i = 0; i < branches.length; i += perPage) {
      groups.push(branches.slice(i, i + perPage).map((b) => b.id));
    }
    if (groups.length > parts) continue;
    if (!groups.every(fits)) continue;
    return groups.map((ids, i) => {
      const sub = pruneBranches(tree, ids);
      const result = fit(sub);
      return { tree: sub, layout: result.layout, scale: result.scale, part: i + 1, parts: groups.length };
    });
  }
  // Si ni con una rama por página cabe, se usa el reparto de una en una.
  return branches.map((branch, i) => {
    const sub = pruneBranches(tree, [branch.id]);
    const result = fit(sub);
    return { tree: sub, layout: result.layout, scale: result.scale, part: i + 1, parts: branches.length };
  });
}

/** Construye el PDF completo de un árbol. */
export function buildTreePdf(tree, opts = {}) {
  const pageSize = opts.pageSize === 'Letter' ? PAGE_SIZES.Letter : A4;
  const margin = opts.margin ?? 40;
  const stats = treeStats ? treeStats(tree) : { nodes: tree.nodes.length };
  const pdf = createPdf({
    size: pageSize,
    margin,
    title: `Árbol de rutas — ${tree.name}`,
    subject: 'FlagPlays · árbol de rutas',
    author: 'FlagPlays',
    creator: 'FlagPlays',
  });

  const availW = pageSize.width - margin * 2;
  const headerH = 46;
  const footerH = 26;
  const availH = pageSize.height - margin * 2 - headerH - footerH;

  const fit = (t) => {
    // Reparte los hermanos en columnas para que el árbol llene la hoja y no
    // salga una tira larguísima con el texto minúsculo.
    const layout = layoutTree(t, { showNotes: false, maxColumnHeight: 640, maxRowWidth: 780 });
    const w = Math.max(1, layout.bounds?.width || layout.width || 1);
    const h = Math.max(1, layout.bounds?.height || layout.height || 1);
    return { layout, scale: Math.min(availW / w, availH / h, 1.15) };
  };

  const pages = planPages(tree, fit);
  const pageLabelBase = opts.subtitle || '';

  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage();
    const partLabel =
      pages.length > 1 ? `Árbol · parte ${index + 1} de ${pages.length}` : pages.length === 1 ? 'Árbol' : '';
    drawHeader(pdf, {
      title: index === 0 ? tree.name : `${tree.name} (continuación)`,
      subtitle:
        index === 0
          ? [pageLabelBase, `${stats.nodes} nodos · ${stats.leaves} rutas finales · profundidad ${stats.maxDepth}`]
              .filter(Boolean)
              .join(' · ')
          : partLabel,
      margin,
      pageLabel: page.part ? `${page.part}/${page.parts}` : '',
    });

    const layout = page.layout || fit(page.tree).layout;
    const scale = page.scale || fit(page.tree).scale;
    const drawW = (layout.bounds?.width || layout.width) * scale;
    const drawH = (layout.bounds?.height || layout.height) * scale;
    const x = margin + Math.max(0, (availW - drawW) / 2);
    const y = margin + headerH + Math.max(0, (availH - drawH) / 2);
    drawLayout(pdf, layout, { x, y, scale });

    drawFooter(pdf, { margin });
  });

  // ---- páginas de detalle ----
  const detailRows = (layoutTree(tree, { showNotes: true, maxColumnHeight: 640, maxRowWidth: 780 }).legend || []).filter(Boolean);
  if (detailRows.length) {
    const rowH = 14;
    const noteH = 8.5;
    const cols = [
      { key: 'number', x: 0, w: 26, label: 'Nº' },
      { key: 'title', x: 30, w: 150, label: 'Ruta' },
      { key: 'depth', x: 184, w: 42, label: 'Prof.' },
      { key: 'notes', x: 230, w: availW - 230, label: 'Notas' },
    ];

    pdf.addPage();
    drawHeader(pdf, { title: 'Detalle de rutas', subtitle: tree.name, margin });
    let y = margin + headerH;
    // cabecera de tabla
    pdf.rect(margin, y - 2, availW, 13, { fill: ACCENT_SOFT, radius: 2 });
    for (const c of cols) {
      pdf.text(c.label, margin + c.x + 3, y + 6, { font: 'bold', size: 7.4, color: MUTED });
    }
    y += 15;

    for (const row of detailRows) {
      const notes = Array.isArray(row.notes) ? row.notes.join(' ') : row.notes || '';
      const notesLines = notes ? pdf.wrapText(notes, cols[3].w, { font: 'regular', size: 7.4 }) : [];
      const blockH = Math.max(rowH, 12 + notesLines.length * noteH);
      if (y + blockH > pageSize.height - margin - footerH) {
        drawFooter(pdf, { margin });
        pdf.addPage();
        drawHeader(pdf, { title: 'Detalle de rutas (continuación)', subtitle: tree.name, margin });
        y = margin + headerH;
      }
      const color = row.color || ACCENT;
      pdf.circle(margin + 8, y + 5, 7, { fill: color });
      pdf.text(String(row.number || ''), margin + 8, y + 5, {
        font: 'bold',
        size: 7.4,
        color: '#ffffff',
        align: 'center',
        baseline: 'middle',
      });
      pdf.text(row.title || '', margin + cols[1].x + 3, y + 5, {
        font: 'bold',
        size: 8,
        color: INK,
        maxWidth: cols[1].w - 6,
        baseline: 'middle',
      });
      pdf.text(row.depth != null ? `${row.depth} yd` : '', margin + cols[2].x + 3, y + 5, {
        font: 'regular',
        size: 7.6,
        color: MUTED,
        baseline: 'middle',
      });
      let ny = y + 2;
      for (const line of notesLines) {
        pdf.text(line, margin + cols[3].x + 3, ny, { font: 'regular', size: 7.4, color: MUTED });
        ny += noteH;
      }
      pdf.line(margin, y + blockH, margin + availW, y + blockH, { stroke: '#eef0f2', lineWidth: 0.6 });
      y += blockH;
    }
    drawFooter(pdf, { margin });
  }

  if (tree.notes) {
    pdf.addPage();
    drawHeader(pdf, { title: 'Notas del árbol', subtitle: tree.name, margin });
    pdf.textBlock(tree.notes, margin, margin + headerH, {
      font: 'regular',
      size: 9.5,
      color: INK,
      maxWidth: availW,
      lineHeight: 1.5,
    });
    drawFooter(pdf, { margin });
  }

  return pdf;
}

/** Genera el PDF y lo descarga. Devuelve los bytes. */
export function exportTreePdf(tree, opts = {}) {
  const pdf = buildTreePdf(tree, opts);
  const bytes = pdf.bytes();
  if (opts.download !== false) {
    const name = `flagplays-arbol-${fileSafe(tree.name)}.pdf`;
    const nativeSave = typeof window !== 'undefined' ? window.__flagplaysSave : null;
    if (typeof nativeSave === 'function') {
      nativeSave(new Blob([bytes], { type: 'application/pdf' }), name);
    } else if (typeof pdf.download === 'function') pdf.download(name);
    else if (typeof document !== 'undefined') {
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  }
  return bytes;
}
