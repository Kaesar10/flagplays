// Apertura del editor de árboles de rutas y exportación a PDF.
// El editor en sí vive en tree-ui.js y el modelo en route-tree.js.
import { h, toast, confirmDialog, promptDialog, escapeHTML } from './ui.js';
import { icon } from './icons.js';

let overlay = null;
let editor = null;
let mods = null;

async function loadMods() {
  if (mods) return mods;
  const [treeMod, uiMod, pdfMod] = await Promise.all([
    import('./route-tree.js').catch((e) => (console.warn('[árbol] route-tree', e), null)),
    import('./tree-ui.js').catch((e) => (console.warn('[árbol] tree-ui', e), null)),
    import('./tree-pdf.js').catch((e) => (console.warn('[árbol] tree-pdf', e), null)),
  ]);
  mods = { treeMod, uiMod, pdfMod };
  return mods;
}

/** Abre el editor de árboles a pantalla completa. */
export async function openTreeEditor(store) {
  if (overlay) return;
  const { treeMod, uiMod } = await loadMods();
  if (!treeMod || !uiMod) {
    toast('El módulo de árboles de rutas no está disponible', 'error', 4000);
    return;
  }

  let trees = store.getTrees().slice();
  if (!trees.length) {
    const built = treeMod.buildPresetTree ? treeMod.buildPresetTree('classic-9') : treeMod.createTree('passing');
    if (built) {
      store.actions.saveTree(built);
      trees = [built];
    }
  }
  if (!trees.length) {
    toast('No se pudo crear el árbol inicial', 'error');
    return;
  }

  let currentTree = trees[0];

  // ---------- estructura ----------
  overlay = h('div', {
    class: 'tree-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Árbol de rutas',
  });

  const sel = h('select', { class: 'select tree-select', 'aria-label': 'Árbol guardado' });
  const host = h('div', { class: 'tree-host' });

  // Estado de guardado: los cambios se guardan solos, pero el usuario necesita verlo.
  const statusEl = h('span', { class: 'tb-status', 'aria-live': 'polite' });
  let statusTimer = null;
  let savedAt = Date.now();

  function setStatus(kind, text) {
    statusEl.className = `tb-status is-${kind}`;
    statusEl.innerHTML = `${icon(kind === 'saved' ? 'check' : kind === 'saving' ? 'save' : 'info', { size: 12 })}<span>${escapeHTML(text)}</span>`;
  }

  function markDirty() {
    setStatus('saving', 'Guardando…');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => markSaved(false), 420);
  }

  function markSaved(showToast) {
    clearTimeout(statusTimer);
    savedAt = Date.now();
    const t = new Date(savedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    setStatus('saved', `Guardado a las ${t}`);
    if (showToast) toast('Árbol guardado', 'ok', 1600);
  }

  // Guarda de verdad (la libreta se escribe en localStorage con un pequeño retardo).
  function saveNow(showToast = true) {
    try {
      if (currentTree) store.actions.saveTree(currentTree);
      store.persist();
      markSaved(showToast);
      return true;
    } catch (err) {
      console.error('[árbol] guardar', err);
      setStatus('error', 'No se pudo guardar');
      toast('No se pudo guardar el árbol', 'error', 3000);
      return false;
    }
  }

  const backBtn = h('button', {
    class: 'btn sm tb-back',
    title: 'Volver a la app (Esc)',
    'aria-label': 'Volver a la app',
    html: icon('chevron-left', { size: 15 }) + '<span>Volver</span>',
    onclick: () => close(),
  });

  const saveBtn = h('button', {
    class: 'btn sm tb-save',
    title: 'Guardar ahora (Ctrl+S)',
    'aria-label': 'Guardar el árbol',
    html: icon('save', { size: 14 }) + '<span>Guardar</span>',
    onclick: () => saveNow(true),
  });

  const bar = h('div', { class: 'tree-bar' },
    backBtn,
    h('span', { class: 'tb-brand', html: icon('tree', { size: 15 }) }),
    h('span', { class: 'tb-title', text: 'Árboles de rutas' }),
    sel,
    h('button', {
      class: 'btn sm',
      html: icon('plus', { size: 13 }) + '<span>Nuevo</span>',
      title: 'Crear un árbol nuevo a partir de una plantilla',
      onclick: () => createTree(),
    }),
    h('button', {
      class: 'btn sm',
      html: icon('copy', { size: 13 }) + '<span>Duplicar</span>',
      title: 'Duplicar el árbol actual',
      onclick: () => duplicateTree(),
    }),
    h('button', {
      class: 'btn sm danger',
      html: icon('trash', { size: 13 }) + '<span>Eliminar</span>',
      title: 'Eliminar el árbol actual',
      onclick: () => removeTree(),
    }),
    h('div', { class: 'tb-spacer' }),
    statusEl,
    saveBtn
  );

  overlay.append(bar, host);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);

  refreshSelect();
  setStatus('saved', 'Todos los cambios guardados');
  mount(currentTree);
  markSaved(false);

  // ---------- piezas ----------
  function refreshSelect() {
    sel.innerHTML = '';
    for (const t of trees) {
      const opt = h('option', { value: t.id, text: t.name });
      if (currentTree && t.id === currentTree.id) opt.selected = true;
      sel.append(opt);
    }
  }

  function mount(tree) {
    if (editor) {
      try {
        editor.destroy();
      } catch (err) {
        console.warn('[árbol] destroy', err);
      }
      editor = null;
    }
    host.innerHTML = '';
    currentTree = tree;
    editor = uiMod.createTreeEditor({
      root: host,
      tree,
      onChange: (next) => {
        currentTree = next;
        const i = trees.findIndex((t) => t.id === next.id);
        if (i >= 0) trees[i] = next;
        else trees.push(next);
        store.actions.saveTree(next);
        refreshSelect();
        markDirty();
      },
      onExportPdf: () => exportPdf(),
      onClose: () => close(),
    });
    if (editor && typeof editor.render === 'function') editor.render();
    refreshSelect();
  }

  sel.addEventListener('change', () => {
    const found = trees.find((t) => t.id === sel.value);
    if (found) mount(found);
  });

  /** Clona un árbol con ids nuevos (nodos y raíz) para poder convivir duplicados. */
  function cloneWithNewIds(treeMod, source, name) {
    const copy = JSON.parse(JSON.stringify(source));
    const idBase = treeMod.uid ? treeMod.uid('tree') : `tree_${Date.now()}`;
    if (treeMod.uid) {
      const map = new Map();
      for (const node of copy.nodes || []) {
        const nid = treeMod.uid('n');
        map.set(node.id, nid);
        node.id = nid;
      }
      for (const node of copy.nodes || []) {
        if (node.parentId && map.has(node.parentId)) node.parentId = map.get(node.parentId);
      }
      if (copy.rootId && map.has(copy.rootId)) copy.rootId = map.get(copy.rootId);
    }
    copy.id = idBase;
    copy.name = name;
    copy.meta = { createdAt: Date.now(), updatedAt: Date.now() };
    return copy;
  }

  async function createTree() {
    const { treeMod } = await loadMods();
    const presets = treeMod.PRESET_TREES || [];
    const name = await promptDialog({
      title: 'Nuevo árbol de rutas',
      label: 'Nombre',
      value: 'Árbol nuevo',
      confirmLabel: 'Crear',
    });
    if (!name) return;
    let tree = null;
    if (presets.length && treeMod.buildPresetTree) {
      const base = treeMod.buildPresetTree(presets[0].id);
      if (base) tree = cloneWithNewIds(treeMod, base, name);
    }
    if (!tree && treeMod.createTree) {
      tree = treeMod.createTree('passing', name);
      if (tree) tree.name = name;
    }
    if (!tree) {
      toast('No se pudo crear el árbol', 'error');
      return;
    }
    trees.push(tree);
    store.actions.saveTree(tree);
    mount(tree);
    toast('Árbol creado', 'ok', 1600);
  }

  async function duplicateTree() {
    const { treeMod } = await loadMods();
    const copy = cloneWithNewIds(treeMod, currentTree, `${currentTree.name} (copia)`);
    trees.push(copy);
    store.actions.saveTree(copy);
    mount(copy);
    toast('Árbol duplicado', 'ok', 1600);
  }

  async function removeTree() {
    if (trees.length <= 1) {
      toast('Debe quedar al menos un árbol', 'error');
      return;
    }
    const ok = await confirmDialog({
      title: 'Eliminar árbol',
      message: `¿Eliminar «${currentTree.name}»? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const idx = trees.findIndex((t) => t.id === currentTree.id);
    trees = trees.filter((t) => t.id !== currentTree.id);
    store.actions.removeTree(currentTree.id);
    mount(trees[Math.max(0, Math.min(idx, trees.length - 1))]);
    toast('Árbol eliminado', 'ok', 1600);
  }

  async function exportPdf() {
    const { pdfMod } = await loadMods();
    if (!pdfMod || !pdfMod.exportTreePdf) {
      toast('La exportación a PDF no está disponible', 'error', 3600);
      return null;
    }
    try {
      toast('Generando PDF…', 'info', 1400);
      const bytes = pdfMod.exportTreePdf(currentTree, { download: true });
      toast(`PDF generado (${Math.max(1, Math.round((bytes?.length || 0) / 1024))} KB)`, 'ok', 2600);
      return bytes;
    } catch (err) {
      console.error('[árbol] pdf', err);
      toast('No se pudo generar el PDF', 'error', 3600);
      return null;
    }
  }

  function onKey(e) {
    // Ctrl+S / Cmd+S: guardar sin salir.
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      e.stopPropagation();
      saveNow(true);
      return;
    }
    if (e.key === 'Escape' && !document.querySelector('.modal-backdrop')) {
      e.stopPropagation();
      close();
    }
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    if (editor) {
      try {
        editor.destroy();
      } catch (err) {
        console.warn(err);
      }
      editor = null;
    }
    overlay?.remove();
    overlay = null;
    mods = null;
  }

  // Expuesto para el arnés de pruebas
  if (typeof window !== 'undefined') window.__treeEditor = { get tree() { return currentTree; }, exportPdf, close };
}

/** Cierra el editor de árboles si está abierto (botón atrás de Android, Esc…). */
export function closeTreeEditor() {
  if (!overlay) return false;
  const btn = overlay.querySelector('[aria-label="Cerrar el editor de árboles"], .tr-close, [data-close]');
  if (btn) {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }
  overlay.remove();
  overlay = null;
  if (editor) {
    try {
      editor.destroy();
    } catch {
      /* nada */
    }
    editor = null;
  }
  return true;
}

export function isTreeEditorOpen() {
  return !!overlay;
}
