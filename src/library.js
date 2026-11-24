// Panel de la libreta: búsqueda, filtros y lista de jugadas.
import { playThumbSVG } from './renderer.js';
import { playSubtitle } from './model.js';
import { icon } from './icons.js';
import { h, escapeHTML, popupMenu, confirmDialog, promptDialog, toast } from './ui.js';
import { openFolderMenu, crearCarpetaConJugadas, makeDropTarget, makeDraggablePlay } from './folder-picker.js';

export function createLibrary({ root, store, actions }) {
  let query = '';
  let filter = 'all';
let filterFolder = null; // id de carpeta activa en la libreta
let folderBar = null; // barra de carpetas (se crea en buildShell)
  let shellBuilt = false;
  let els = {};

  function buildShell() {
    root.innerHTML = '';
    const head = h(
      'div',
      { class: 'sb-head' },
      h('span', { class: 'sb-title', text: 'Libreta' }),
      h('span', { class: 'sb-count', text: '0' }),
      h('button', {
        class: 'btn icon sm',
        title: 'Añadir jugada',
        'aria-label': 'Añadir jugada',
        html: icon('plus', { size: 15 }),
        onclick: (e) => openAddMenu(e.currentTarget),
      })
    );
    const searchWrap = h('div', { class: 'sb-search' });
    searchWrap.innerHTML = icon('search', { size: 13 });
    const input = h('input', {
      type: 'search',
      placeholder: 'Buscar jugadas…',
      'aria-label': 'Buscar jugadas',
      spellcheck: 'false',
    });
    input.addEventListener('input', () => {
      query = input.value.trim().toLowerCase();
      renderList();
    });
    searchWrap.append(input);

    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar' });
  folderBar = h('div', { class: 'sb-folders', role: 'group', 'aria-label': 'Carpetas' });
    for (const [id, label] of [
      ['all', 'Todas'],
      ['offense', 'Ofensiva'],
      ['defense', 'Defensiva'],
    ]) {
      chips.append(
        h('button', {
          class: `chip ${id === 'all' ? 'is-active' : ''}`,
          text: label,
          dataset: { filter: id },
          onclick: () => {
            filter = id;
            for (const c of chips.children) c.classList.toggle('is-active', c.dataset.filter === id);
            renderList();
          },
        })
      );
    }

    const list = h('div', { class: 'play-list', role: 'listbox', 'aria-label': 'Jugadas' });
    const foot = h('div', { class: 'sb-foot' });
    foot.append(
      h('span', { class: 'sb-total', text: '' }),
      h('button', {
        class: 'btn sm ghost',
        title: 'Importar libreta o jugada (.json)',
        html: icon('upload', { size: 13 }) + '<span>Importar</span>',
        onclick: () => actions.onImport?.(),
      })
    );

    root.append(head, searchWrap, chips, folderBar, list, foot);
    els = { head, count: head.querySelector('.sb-count'), input, list, foot, total: foot.querySelector('.sb-total') };
    shellBuilt = true;
  }

  function openAddMenu(anchor) {
    popupMenu(anchor, [
      {
        label: 'Nueva jugada de pase',
        icon: 'route',
        onClick: () => store.actions.addPlay('offense'),
      },
      {
        label: 'Nueva jugada de carrera',
        icon: 'spring',
        onClick: () => store.actions.addPlay('offense', { category: 'Carrera', name: 'Carrera nueva' }),
      },
      {
        label: 'Nueva defensa',
        icon: 'layers',
        onClick: () => store.actions.addPlay('defense'),
      },
      '-',
      {
        label: 'Duplicar jugada actual',
        icon: 'copy',
        hint: 'Ctrl+D',
        onClick: () => {
          const id = store.state.playId;
          if (id) store.actions.duplicatePlay(id);
        },
      },
    ]);
  }

  function itemMenu(anchor, play) {
    popupMenu(anchor, [
      { label: 'Renombrar', icon: 'pen', onClick: () => rename(play) },
      { label: 'Duplicar', icon: 'copy', onClick: () => store.actions.duplicatePlay(play.id) },
      {
        label: 'Añadir a carpeta…',
        icon: 's-folder',
        onClick: () => openFolderMenu({ store, playIds: [play.id], anchor }),
      },
      { label: 'Subir', icon: 'chevron-up', onClick: () => move(play, -1) },
      { label: 'Bajar', icon: 'chevron-down', onClick: () => move(play, 1) },
      '-',
      { label: 'Exportar PNG', icon: 'camera', onClick: () => actions.onExportPNG?.(play) },
      { label: 'Enlace para compartir', icon: 'link', onClick: () => actions.onShare?.(play) },
      '-',
      { label: 'Eliminar', icon: 'trash', danger: true, onClick: () => remove(play) },
    ]);
  }

  async function rename(play) {
    const name = await promptDialog({ title: 'Renombrar jugada', value: play.name, label: 'Nombre de la jugada' });
    if (!name) return;
    if (play.id === store.state.playId) store.actions.updatePlay({ name });
    else {
      store.update((s) => {
        const p = s.playbook.plays.find((x) => x.id === play.id);
        if (p) p.name = name;
      }, { reason: 'plays' });
    }
  }

  function move(play, delta) {
    const idx = store.getPlaybook().plays.findIndex((p) => p.id === play.id);
    if (idx < 0) return;
    store.actions.reorderPlay(play.id, idx + delta);
  }

  async function remove(play) {
    const ok = await confirmDialog({
      title: 'Eliminar jugada',
      message: `¿Eliminar «${play.name}»? Se puede deshacer con Ctrl+Z.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    store.actions.removePlay(play.id);
  }

  /** Barra de carpetas de la libreta: filtra al pulsar y acepta jugadas arrastradas. */
  function renderFolders() {
    if (!shellBuilt) return;
    folderBar.replaceChildren();
    const carpetas = store.getFolders();
    const todas = h('button', {
      class: `sb-folder sb-folder-all${filterFolder === null ? ' is-active' : ''}`,
      type: 'button',
      text: 'Todas',
      title: 'Ver todas las jugadas',
      onclick: () => {
        filterFolder = null;
        renderList();
        renderFolders();
      },
    });
    folderBar.append(todas);
    for (const f of carpetas) {
      const chip = h(
        'button',
        {
          class: `sb-folder${filterFolder === f.id ? ' is-active' : ''}`,
          type: 'button',
          title: `Carpeta ${f.name} (${f.playIds.length}) — arrastra jugadas aquí`,
          style: `--f:${f.color || '#5b8cff'}`,
          onclick: () => {
            filterFolder = filterFolder === f.id ? null : f.id;
            renderList();
            renderFolders();
          },
        },
        h('span', { class: 'sb-folder-dot' }),
        h('span', { class: 'sb-folder-name', text: f.name }),
        h('span', { class: 'sb-folder-n', text: String(f.playIds.length) })
      );
      makeDropTarget(chip, (ids) => {
        const n = store.actions.addToFolder(f.id, ids);
        toast(n ? `${n} jugada${n === 1 ? '' : 's'} a «${f.name}»` : `Ya estaban en «${f.name}»`);
        renderFolders();
      });
      folderBar.append(chip);
    }
    folderBar.append(
      h('button', {
        class: 'sb-folder sb-folder-new',
        type: 'button',
        title: 'Nueva carpeta',
        html: icon('plus', { size: 13 }),
        onclick: () => crearCarpetaConJugadas({ store, onDone: () => (renderFolders(), renderList()) }),
      })
    );
  }

  function renderList() {
    if (!shellBuilt) return;
    const book = store.getPlaybook();
    const carpetaActiva = filterFolder ? store.getFolder(filterFolder) : null;
    const plays = book.plays.filter((p) => {
      if (filter !== 'all' && p.type !== filter) return false;
      if (carpetaActiva && !carpetaActiva.playIds.includes(p.id)) return false;
      if (!query) return true;
      const hay = `${p.name} ${p.category} ${(p.tags || []).join(' ')} ${p.formation}`.toLowerCase();
      return hay.includes(query);
    });
    // El contador da un pequeño salto cuando cambia (micro-interacción).
    const nuevoTotal = String(book.plays.length);
    if (els.count.textContent !== nuevoTotal) {
      els.count.textContent = nuevoTotal;
      els.count.classList.remove('is-bump');
      void els.count.offsetWidth;
      els.count.classList.add('is-bump');
    }
    els.total.textContent = `${book.plays.length} jugada${book.plays.length === 1 ? '' : 's'} · guardado local`;
    renderFolders();
    els.list.innerHTML = '';

    if (!plays.length) {
      els.list.append(
        h(
          'div',
          { class: 'empty-state' },
          h('span', { html: icon('search', { size: 26 }) }),
          h('div', { class: 'es-title', text: query ? 'Sin resultados' : 'Libreta vacía' }),
          h('div', {
            class: 'es-text',
            text: query
              ? 'Prueba con otro nombre, categoría o etiqueta.'
              : 'Crea tu primera jugada o carga las jugadas de ejemplo.',
          }),
          !query &&
            h('button', {
              class: 'btn sm',
              text: 'Añadir jugada',
              onclick: () => store.actions.addPlay('offense'),
            })
        )
      );
      return;
    }

    for (const play of plays) {
      const active = play.id === store.state.playId;
      const item = h('div', {
        class: `play-item ${active ? 'is-active' : ''}`,
        role: 'option',
        'aria-selected': active ? 'true' : 'false',
        tabindex: '0',
        dataset: { playId: play.id },
      });
      item.innerHTML = `
        <div class="pi-thumb">${playThumbSVG(play, 48 * 2, 36 * 2)}</div>
        <div class="pi-main">
          <div class="pi-name">${escapeHTML(play.name)}</div>
          <div class="pi-meta">
            <span class="type-dot ${play.type === 'defense' ? 'is-def' : 'is-off'}" title="${play.type === 'defense' ? 'Defensiva' : 'Ofensiva'}"></span>
            <span>${escapeHTML(playSubtitle(play))}</span>
          </div>
        </div>
        <div class="pi-actions"></div>`;
      const moreBtn = h('button', {
        class: 'pi-btn',
        title: 'Opciones de la jugada',
        'aria-label': 'Opciones de ' + play.name,
        html: icon('more', { size: 14 }),
        onclick: (e) => {
          e.stopPropagation();
          itemMenu(e.currentTarget, play);
        },
      });
      makeDraggablePlay(item, () => {
        const sel = store.state.selection.ids || [];
        return sel.includes(play.id) && sel.length > 1 ? sel : [play.id];
      });
      item.querySelector('.pi-actions').append(moreBtn);
      item.addEventListener('click', () => store.selectPlay(play.id));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          store.selectPlay(play.id);
        }
      });
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        itemMenu(item, play);
      });
      els.list.append(item);
    }
  }

  function render() {
    buildShell();
    renderList();
  }

  function focusSearch() {
    els.input?.focus();
    els.input?.select();
  }

  return { render, focusSearch, renderList };
}
