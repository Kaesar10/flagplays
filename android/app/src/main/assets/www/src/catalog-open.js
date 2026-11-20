// Apertura de la sección «Catálogo» y acciones sobre una jugada del catálogo.
import { h, toast } from './ui.js';

let overlay = null;
let editor = null;
let mod = null;

async function loadMod() {
  if (mod) return mod;
  mod = await import('./catalog-ui.js').catch((e) => (console.warn('[catálogo] catalog-ui', e), null));
  return mod;
}

/** ¿Está abierto el catálogo? */
export function isCatalogOpen() {
  return !!overlay;
}

/**
 * Abre el catálogo a pantalla completa.
 * @param {{store:any, onEdit?:Function, onWristband?:Function, onClose?:Function}} opts
 */
export async function openCatalogEditor({ store, onEdit, onWristband, onClose } = {}) {
  if (overlay) return;
  const mods = await loadMod();
  if (!mods || typeof mods.createCatalogEditor !== 'function') {
    toast('El catálogo todavía no está disponible', 'error', 3200);
    return;
  }

  overlay = h('div', {
    class: 'section-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Catálogo de jugadas',
  });
  document.body.append(overlay);

  const close = () => {
    try {
      editor?.destroy?.();
    } catch (err) {
      console.warn('[catálogo] destroy', err);
    }
    editor = null;
    overlay?.remove();
    overlay = null;
    onClose?.();
  };

  /** Mete una copia de la jugada en la libreta y devuelve la jugada creada. */
  const addToBook = (item) => {
    const base = item.play || {};
    const created = store.actions.addPlay('offense', {
      name: item.name,
      formation: base.formation,
      category: base.category,
      tags: [...(base.tags || []), 'catálogo'],
      notes: base.notes,
      field: base.field,
      players: (base.players || []).map((p) => ({ ...p, path: p.path ? p.path.map((pt) => ({ ...pt })) : null })),
      ball: base.ball ? { ...base.ball } : { targetId: null, releaseAt: 2 },
    });
    return created;
  };

  editor = mods.createCatalogEditor({
    root: overlay,
    store,
    onClose: close,
    onAdd: (item) => {
      addToBook(item);
      toast(`«${item.name}» añadida a tu libreta`, 'ok', 2000);
    },
    onEdit: (item) => {
      const created = addToBook(item);
      close();
      if (created) {
        store.selectPlay?.(created.id);
        toast(`«${item.name}» añadida y abierta para editar`, 'ok', 2400);
        onEdit?.(created);
      }
    },
    onWristband: (item) => {
      const created = addToBook(item);
      close();
      if (created) {
        toast(`«${item.name}» añadida: ya está en la lista de impresión`, 'ok', 2600);
        onWristband?.(created);
      }
    },
  });
  if (editor && typeof editor.render === 'function') editor.render();

  if (typeof window !== 'undefined') window.__catalogEditor = { close, get editor() { return editor; } };
}

/** Cierra el catálogo si está abierto. */
export function closeCatalogEditor() {
  if (!overlay) return false;
  const api = typeof window !== 'undefined' ? window.__catalogEditor : null;
  if (api && typeof api.close === 'function') api.close();
  else {
    overlay.remove();
    overlay = null;
  }
  return true;
}
