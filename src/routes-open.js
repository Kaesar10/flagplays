// Apertura de la sección «Rutas» (editor de rutas propias + biblioteca).
// El editor vive en routes-ui.js; aquí solo se monta a pantalla completa.
import { h, toast } from './ui.js';

let overlay = null;
let editor = null;
let mod = null;

async function loadMod() {
  if (mod) return mod;
  mod = await import('./routes-ui.js').catch((e) => (console.warn('[rutas] routes-ui', e), null));
  return mod;
}

/** ¿Está abierta la sección de rutas? */
export function isRoutesEditorOpen() {
  return !!overlay;
}

/**
 * Abre el editor de rutas a pantalla completa.
 * @param {{store:any, presets:any, onClose?:Function}} opts
 */
export async function openRoutesEditor({ store, presets, onClose }) {
  if (overlay) return;
  const mods = await loadMod();
  if (!mods || typeof mods.createRoutesEditor !== 'function') {
    toast('La sección de rutas todavía no está disponible', 'error', 3200);
    return;
  }

  overlay = h('div', { class: 'section-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Rutas' });
  document.body.append(overlay);

  const close = () => {
    try {
      editor?.destroy?.();
    } catch (err) {
      console.warn('[rutas] destroy', err);
    }
    editor = null;
    overlay?.remove();
    overlay = null;
    mod = null;
    onClose?.();
  };

  editor = mods.createRoutesEditor({
    root: overlay,
    store,
    presets,
    onClose: close,
  });
  if (editor && typeof editor.render === 'function') editor.render();

  if (typeof window !== 'undefined') window.__routesEditor = { close, get editor() { return editor; } };
}

/** Cierra la sección de rutas si está abierta. */
export function closeRoutesEditor() {
  if (!overlay) return false;
  const api = typeof window !== 'undefined' ? window.__routesEditor : null;
  if (api && typeof api.close === 'function') api.close();
  else {
    overlay.remove();
    overlay = null;
  }
  return true;
}
