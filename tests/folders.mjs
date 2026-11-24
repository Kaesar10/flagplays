// Pruebas del modelo de carpetas: crear, añadir, quitar, borrar y deshacer.
// Nota: una libreta nueva ya trae dos carpetas de serie (Ofensiva/Defensiva),
// así que las pruebas guardan la referencia de las carpetas que crean.
import assert from 'node:assert/strict';
import { createStore, FOLDER_COLORS } from '../src/state.js';

let ok = 0;
const prueba = (nombre, fn) => {
  fn();
  ok += 1;
  console.log('  ok', nombre);
};

const store = createStore();
const store2 = createStore();
const inicial = store.getFolders().length;

prueba('la libreta trae su lista de carpetas', () => {
  assert.ok(Array.isArray(store.getFolders()));
  assert.ok(inicial >= 0);
});

prueba('crear carpeta vacía con color de la paleta', () => {
  const f = store.actions.addFolder('Partidos de zona');
  assert.equal(f.name, 'Partidos de zona');
  assert.ok(FOLDER_COLORS.includes(f.color));
  assert.deepEqual(f.playIds, []);
  assert.equal(store.getFolders().length, inicial + 1);
  assert.equal(store.getFolder(f.id).name, 'Partidos de zona');
});

prueba('los nombres de carpeta no se repiten', () => {
  const f2 = store.actions.addFolder('Partidos de zona');
  assert.equal(f2.name, 'Partidos de zona 2');
  store.actions.removeFolder(f2.id);
});

prueba('añadir jugadas de la libreta y evitar duplicados', () => {
  const f = store.actions.addFolder('Prueba de contenido');
  const jugadas = store.getPlaybook().plays;
  const ids = jugadas.slice(0, Math.min(3, jugadas.length)).map((p) => p.id);
  assert.equal(store.actions.addToFolder(f.id, ids), ids.length);
  assert.equal(store.actions.addToFolder(f.id, ids), 0, 'no debe repetir');
  assert.equal(store.getPlaysInFolder(f.id).length, ids.length);
  store.actions.removeFolder(f.id);
});

prueba('una jugada sabe en qué carpetas está', () => {
  const f = store.actions.addFolder('Con una jugada');
  const id = store.getPlaybook().plays[0].id;
  store.actions.addToFolder(f.id, [id]);
  assert.equal(store.getFoldersOfPlay(id).length, 1);
  assert.equal(store.getPlaysInFolder(f.id)[0].id, id);
  store.actions.removeFolder(f.id);
});

prueba('quitar una jugada de la carpeta', () => {
  const f = store.actions.addFolder('Quitar');
  const id = store.getPlaybook().plays[0].id;
  store.actions.addToFolder(f.id, [id]);
  store.actions.removeFromFolder(f.id, id);
  assert.equal(store.getPlaysInFolder(f.id).length, 0);
  assert.equal(store.getFoldersOfPlay(id).length, 0);
  store.actions.removeFolder(f.id);
});

prueba('borrar una jugada la quita de todas las carpetas', () => {
  const f = store.actions.addFolder('Huérfanas');
  const jugada = store.getPlaybook().plays[0];
  store.actions.addToFolder(f.id, [jugada.id]);
  store.actions.removePlay(jugada.id);
  assert.equal(store.getPlaysInFolder(f.id).includes(jugada.id), false);
  assert.ok(
    store.getFolders().every((c) => !c.playIds.includes(jugada.id)),
    'ninguna carpeta conserva el id borrado'
  );
  store.actions.removeFolder(f.id);
});

prueba('renombrar y recolorear', () => {
  const f = store.actions.addFolder('Antes');
  store.actions.renameFolder(f.id, 'Zona roja');
  store.actions.setFolderColor(f.id, FOLDER_COLORS[3]);
  const leida = store.getFolder(f.id);
  assert.equal(leida.name, 'Zona roja');
  assert.equal(leida.color, FOLDER_COLORS[3]);
  store.actions.removeFolder(f.id);
});

prueba('borrar la carpeta no borra sus jugadas', () => {
  const f = store.actions.addFolder('Temporal');
  const jugadas2 = store.getPlaybook().plays;
  const ids = jugadas2.slice(0, Math.min(2, jugadas2.length)).map((p) => p.id);
  store.actions.addToFolder(f.id, ids);
  const antes = store.getPlaybook().plays.length;
  store.actions.removeFolder(f.id);
  assert.equal(store.getFolder(f.id), null);
  assert.equal(store.getPlaybook().plays.length, antes);
});

prueba('deshacer recupera la carpeta borrada', () => {
  const f = store.actions.addFolder('Para deshacer');
  store.actions.removeFolder(f.id);
  assert.equal(store.getFolder(f.id), null);
  store.undo();
  assert.ok(store.getFolder(f.id), 'la carpeta vuelve con el historial');
});

prueba('las carpetas de serie se rellenan por tipo', () => {
  const ofensiva = store2.getFolders().find((f) => f.name === 'Ofensiva');
  if (ofensiva) {
    const dentro = store2.getPlaysInFolder(ofensiva.id);
    assert.ok(dentro.every((p) => p.type !== 'defense'), 'Ofensiva no lleva defensas');
  }
});

prueba('una carpeta vacía y un id inexistente devuelven lista vacía', () => {
  const f = store2.actions.addFolder('Vacía');
  assert.deepEqual(store2.getPlaysInFolder(f.id), []);
  assert.deepEqual(store2.getFoldersOfPlay('no_existe'), []);
  assert.deepEqual(store2.getPlaysInFolder('no_existe'), []);
});

prueba('añadir una jugada inexistente no hace nada', () => {
  const f = store2.actions.addFolder('Sin fantasmas');
  assert.equal(store2.actions.addToFolder(f.id, ['no_existe']), 0);
  assert.equal(store2.getPlaysInFolder(f.id).length, 0);
});

prueba('duplicar una carpeta copia nombre y jugadas', () => {
  const f = store.actions.addFolder('Original');
  const ids = store.getPlaybook().plays.slice(0, 2).map((p) => p.id);
  store.actions.addToFolder(f.id, ids);
  const copia = store.actions.duplicateFolder(f.id);
  assert.ok(copia, 'devuelve la copia');
  assert.notEqual(copia.id, f.id);
  assert.match(copia.name, /copia/);
  assert.equal(copia.playIds.length, f.playIds.length);
  assert.equal(copia.color, f.color);
  // la copia va justo después
  const lista = store.getFolders();
  assert.equal(lista.findIndex((x) => x.id === copia.id), lista.findIndex((x) => x.id === f.id) + 1);
  store.actions.removeFolder(copia.id);
  store.actions.removeFolder(f.id);
});

prueba('vaciar la carpeta no borra las jugadas', () => {
  const f = store.actions.addFolder('Para vaciar');
  const ids = store.getPlaybook().plays.slice(0, 2).map((p) => p.id);
  store.actions.addToFolder(f.id, ids);
  const antes = store.getPlaybook().plays.length;
  store.actions.clearFolder(f.id);
  assert.equal(store.getPlaysInFolder(f.id).length, 0);
  assert.equal(store.getPlaybook().plays.length, antes);
  store.actions.removeFolder(f.id);
});

prueba('reordenar dentro de la carpeta', () => {
  const f = store.actions.addFolder('Orden');
  const ids = store.getPlaybook().plays.slice(0, 3).map((p) => p.id);
  store.actions.addToFolder(f.id, ids);
  if (ids.length < 2) return;
  store.actions.moveInFolder(f.id, ids[0], ids.length - 1);
  assert.equal(store.getFolder(f.id).playIds[ids.length - 1], ids[0]);
  const primera = store.getFolder(f.id).playIds[0];
  store.actions.reorderPlayInFolder(f.id, 0, 1);
  assert.equal(store.getFolder(f.id).playIds[1], primera);
  store.actions.removeFolder(f.id);
});

prueba('duplicar una carpeta inexistente no rompe', () => {
  assert.equal(store.actions.duplicateFolder('no_existe'), null);
});

console.log(`\nCarpetas: ${ok} pruebas en verde.`);

