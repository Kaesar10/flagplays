// Apertura de la sección «Carpetas» a pantalla completa.
// El editor vive en folders-ui.js; aquí solo se monta y se cierra.
import { h, toast } from './ui.js';

let overlay = null;
let editor = null;

/** ¿Está abierta la sección de carpetas? */
export function isFoldersOpen() {
  return !!overlay;
}

/**
 * @param {{store:any, onClose?:Function, onEdit?:(playId:string)=>void}} opts
 */
export async function openFoldersEditor({ store, onClose, onEdit, onPrint }) {
  if (overlay) return;
  const mod = await import('./folders-ui.js').catch((e) => (console.warn('[carpetas]', e), null));
  if (!mod || typeof mod.createFoldersEditor !== 'function') {
    toast('La sección de carpetas no está disponible', 'error', 3200);
    return;
  }

  overlay = h('div', {
    class: 'section-overlay section-folders',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Carpetas',
  });
  document.body.append(overlay);

  const cerrar = () => {
    try {
      editor?.destroy?.();
    } catch (err) {
      console.warn('[carpetas] destroy', err);
    }
    editor = null;
    overlay?.remove();
    overlay = null;
    onClose?.();
  };

  editor = mod.createFoldersEditor({
    store,
    mount: overlay,
    onClose: cerrar,
    onEdit: (playId) => {
      cerrar();
      onEdit?.(playId);
    },
    onPrint: (plays, nombre) => {
      cerrar();
      onPrint?.(plays, nombre);
    },
  });
}

/** Cierra la sección si está abierta. */
export function closeFoldersEditor() {
  if (!overlay) return;
  try {
    editor?.destroy?.();
  } catch {
    /* noop */
  }
  editor = null;
  overlay.remove();
  overlay = null;
}
