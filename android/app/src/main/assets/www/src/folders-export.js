// Exportar una carpeta concreta: su propio «playbook» para imprimir o compartir.
import { downloadBlob } from './ui.js';

/**
 * Convierte una carpeta en un playbook mínimo (name + plays en su orden).
 * Es lo que se le pasa a la impresión y a la exportación JSON.
 * @returns {{name:string, plays:any[]}|null}
 */
export function folderAsPlaybook(store, folderId) {
  const carpeta = store.getFolder?.(folderId);
  if (!carpeta) return null;
  return {
    name: carpeta.name,
    plays: store.getPlaysInFolder(folderId),
    folders: [{ id: carpeta.id, name: carpeta.name, color: carpeta.color, playIds: [...carpeta.playIds] }],
  };
}

/** Descarga la carpeta como libreta JSON (se puede volver a importar). */
export function exportFolderJSON(store, folderId) {
  const libro = folderAsPlaybook(store, folderId);
  if (!libro) return false;
  const completo = {
    ...store.getPlaybook(),
    name: libro.name,
    plays: libro.plays,
    folders: libro.folders,
    trees: [],
    customRoutes: [],
    roster: store.getPlaybook().roster || [],
  };
  const nombre = `FlagPlays - ${libro.name}.json`.replace(/[\\/:*?"<>|]/g, '-');
  const blob = new Blob([JSON.stringify(completo, null, 2)], { type: 'application/json' });
  downloadBlob(blob, nombre);
  return true;
}
