// Utilidades compartidas de carpetas: el menú «Añadir a carpeta» y el diálogo
// para crear una carpeta nueva sobre la marcha.
//
// Lo usan la libreta, el catálogo y la sección de carpetas, para que el gesto
// sea el mismo en todas partes.
import { h, popupMenu, promptDialog, toast } from './ui.js';
import { FOLDER_COLORS } from './state.js';

/**
 * Menú de carpetas para una o varias jugadas.
 * Cada carpeta aparece marcada si TODAS las jugadas ya están dentro; al pulsar
 * se añaden las que falten (o se quitan todas si ya estaban).
 *
 * @param {{store:any, playIds:string[], anchor:HTMLElement, onDone?:Function}} opts
 */
export function openFolderMenu({ store, playIds, anchor, onDone }) {
  const ids = (Array.isArray(playIds) ? playIds : [playIds]).filter(Boolean);
  if (!ids.length) return;
  const carpetas = store.getFolders();

  const items = carpetas.map((f) => {
    const dentro = ids.filter((id) => f.playIds.includes(id)).length;
    const todas = dentro === ids.length;
    return {
      label: f.name,
      hint: todas ? 'quitar' : dentro ? `${dentro}/${ids.length}` : `${f.playIds.length}`,
      checked: todas,
      onClick: () => {
        if (todas) {
          for (const id of ids) store.actions.removeFromFolder(f.id, id);
          toast(`Quitada${ids.length === 1 ? '' : 's'} de «${f.name}»`);
        } else {
          const n = store.actions.addToFolder(f.id, ids);
          toast(n ? `Añadida${n === 1 ? '' : 's'} a «${f.name}»` : `Ya estaban en «${f.name}»`);
        }
        onDone?.();
      },
    };
  });

  popupMenu(anchor, [
    ...(items.length ? items : [{ label: 'Todavía no hay carpetas', disabled: true, onClick: () => {} }]),
    '-',
    {
      label: 'Nueva carpeta…',
      icon: 'plus',
      onClick: () => crearCarpetaConJugadas({ store, playIds: ids, onDone }),
    },
  ]);
}

/** Pide nombre y color, crea la carpeta y mete dentro las jugadas. */
export async function crearCarpetaConJugadas({ store, playIds = [], onDone }) {
  let color = FOLDER_COLORS[store.getFolders().length % FOLDER_COLORS.length];
  const fila = h('div', { class: 'fo-colors', role: 'group', 'aria-label': 'Color' });
  for (const c of FOLDER_COLORS) {
    const b = h('button', {
      class: `fo-color${c === color ? ' is-active' : ''}`,
      type: 'button',
      'aria-label': `Color ${c}`,
      style: `background:${c}`,
      onclick: () => {
        color = c;
        for (const otro of fila.children) otro.classList.toggle('is-active', otro === b);
      },
    });
    fila.append(b);
  }
  const nombre = await promptDialog({
    title: 'Nueva carpeta',
    label: 'Nombre de la carpeta',
    placeholder: 'Ej. Tercer down, Zona roja…',
    confirmText: 'Crear',
    body: fila,
  });
  if (nombre === null || nombre === undefined) return null;
  const texto = String(nombre).trim();
  if (!texto) return null;
  const f = store.actions.addFolder(texto, color);
  if (playIds.length) store.actions.addToFolder(f.id, playIds);
  toast(
    playIds.length
      ? `Carpeta «${f.name}» con ${playIds.length} jugada${playIds.length === 1 ? '' : 's'}`
      : `Carpeta «${f.name}» creada`
  );
  onDone?.();
  return f;
}

/**
 * Zona de destino reutilizable: resalta al arrastrar una jugada encima.
 * @param {HTMLElement} el
 * @param {(ids:string[])=>void} onDrop
 */
export function makeDropTarget(el, onDrop) {
  const dentro = (e) => {
    if (!e.dataTransfer) return false;
    return [...(e.dataTransfer.types || [])].includes('text/plain');
  };
  el.addEventListener('dragenter', (e) => {
    if (!dentro(e)) return;
    e.preventDefault();
    el.classList.add('is-drop');
  });
  el.addEventListener('dragover', (e) => {
    if (!dentro(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    el.classList.add('is-drop');
  });
  el.addEventListener('dragleave', (e) => {
    if (el.contains(e.relatedTarget)) return;
    el.classList.remove('is-drop');
  });
  el.addEventListener('drop', (e) => {
    if (!dentro(e)) return;
    e.preventDefault();
    el.classList.remove('is-drop');
    const crudo = e.dataTransfer.getData('text/plain') || '';
    const ids = crudo
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) onDrop(ids);
  });
  return () => el.classList.remove('is-drop');
}

/** Marca una tarjeta de jugada como arrastrable con sus ids. */
export function makeDraggablePlay(el, getIds) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    const ids = getIds();
    if (!ids.length) {
      e.preventDefault();
      return;
    }
    try {
      e.dataTransfer.setData('text/plain', ids.join(','));
      e.dataTransfer.effectAllowed = 'copy';
    } catch {
      /* navegadores sin dataTransfer */
    }
    el.classList.add('is-dragging');
    document.body.classList.add('is-dragging-play');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-play');
  });
}
