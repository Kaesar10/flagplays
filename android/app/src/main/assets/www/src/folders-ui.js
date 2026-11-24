// Sección «Carpetas»: colecciones propias de jugadas.
//
// Una carpeta guarda ids de jugadas: valen tanto las que ya trae la app
// (añadidas desde el catálogo a la libreta) como las que crea el usuario.
// Aquí se crean, renombran, colorean, se les añaden jugadas y se abren.
import { h, escapeHTML, toast, modal, confirmDialog, promptDialog } from './ui.js';
import { icon } from './icons.js';
import { playThumbSVG, playToSVG } from './renderer.js';
import { FOLDER_COLORS } from './state.js';
import { makeDropTarget, makeDraggablePlay } from './folder-picker.js';

const NOMBRE_SECCION = 'Carpetas';

/** Miniatura oscura, como el campo del editor (las de papel blanco desentonan). */
function miniatura(play) {
  try {
    return playToSVG(play, {
      width: 240,
      height: 150,
      mode: 'editor',
      appearance: { theme: 'night' },
      showLabels: false,
      showCaption: false,
      padding: 8,
    });
  } catch {
    return playThumbSVG(play, 240, 150);
  }
}

/**
 * Monta la sección dentro de un contenedor a pantalla completa.
 * @param {{store:any, onClose?:Function, onEdit?:(id:string)=>void, mount:HTMLElement}} opts
 */
export function createFoldersEditor({ store, mount, onClose, onEdit }) {
  let seleccionada = null; // id de carpeta abierta
  let filtro = '';
  let unsubscribe = null;

  const raiz = h('section', { class: 'fo-shell', id: 'fo-shell' });
  mount.append(raiz);

  // ---------------------------------------------------------------- cabecera
  const btnVolver = h('button', {
    class: 'fo-back',
    type: 'button',
    title: 'Volver a las jugadas',
    html: `${icon('chevron-left', { size: 16 })}<span>Volver</span>`,
    onclick: () => onClose?.(),
  });
  const btnNueva = h('button', {
    class: 'btn primary fo-new',
    type: 'button',
    html: `${icon('plus', { size: 15 })}<span>Nueva carpeta</span>`,
    onclick: () => nuevaCarpeta(),
  });
  const contadorEl = h('span', { class: 'fo-count' });
  const cabecera = h(
    'header',
    { class: 'fo-top' },
    btnVolver,
    h('div', { class: 'fo-ident' }, h('h1', { class: 'fo-title', text: NOMBRE_SECCION }), contadorEl),
    h('span', { class: 'fo-spacer' }),
    btnNueva
  );

  // ---------------------------------------------------------------- columnas
  const listaEl = h('div', { class: 'fo-list', role: 'listbox', 'aria-label': 'Carpetas' });
  const lado = h(
    'aside',
    { class: 'fo-side' },
    h('div', { class: 'fo-side-title', text: 'Mis carpetas' }),
    listaEl
  );

  const tituloEl = h('h2', { class: 'fo-stage-title' });
  const subEl = h('span', { class: 'fo-stage-sub' });
  const btnAñadir = h('button', {
    class: 'btn fo-add',
    type: 'button',
    html: `${icon('plus', { size: 15 })}<span>Añadir jugadas</span>`,
    onclick: () => añadirJugadas(),
  });
  const btnBorrar = h('button', {
    class: 'btn fo-del',
    type: 'button',
    title: 'Borrar carpeta',
    html: `${icon('trash', { size: 15 })}`,
    onclick: () => borrarCarpeta(),
  });
  const gridEl = h('div', { class: 'fo-grid', role: 'list' });
  const vacioEl = h('div', { class: 'fo-empty' });
  const cuerpo = h(
    'div',
    { class: 'fo-body' },
    lado,
    h(
      'main',
      { class: 'fo-stage' },
      h('div', { class: 'fo-stage-head' }, h('div', { class: 'fo-stage-titles' }, tituloEl, subEl), btnAñadir, btnBorrar),
      vacioEl,
      gridEl
    )
  );

  raiz.append(cabecera, cuerpo);

  // ------------------------------------------------------------------- datos
  const carpetas = () => store.getFolders();
  const todasLasJugadas = () => store.getPlaybook().plays || [];

  // ------------------------------------------------------------------ pintado
  function pintar() {
    const lista = carpetas().filter((f) =>
      !filtro ? true : f.name.toLowerCase().includes(filtro.toLowerCase())
    );
    contadorEl.textContent = `${carpetas().length} ${carpetas().length === 1 ? 'carpeta' : 'carpetas'}`;

    if (seleccionada && !carpetas().some((f) => f.id === seleccionada)) seleccionada = null;
    if (!seleccionada && carpetas().length) seleccionada = carpetas()[0].id;

    // --- lista de carpetas
    listaEl.replaceChildren();
    if (!carpetas().length) {
      listaEl.append(
        h(
          'div',
          { class: 'fo-side-empty' },
          h('span', { html: icon('s-folder', { size: 26 }) }),
          h('b', { text: 'Sin carpetas' }),
          h('button', { class: 'btn primary sm', type: 'button', text: 'Crear la primera', onclick: () => nuevaCarpeta() })
        )
      );
    }
    for (const f of lista) {
      const total = store.getPlaysInFolder(f.id).length;
      const activa = f.id === seleccionada;
      const fila = h(
          'button',
          {
            class: `fo-item${activa ? ' is-active' : ''}`,
            type: 'button',
            'aria-selected': String(activa),
            style: `--fo-color:${f.color || FOLDER_COLORS[0]}`,
            onclick: () => {
              seleccionada = f.id;
              pintar();
            },
            ondblclick: () => renombrar(f),
          },
          h('span', { class: 'fo-item-dot' }),
          h('span', { class: 'fo-item-name', text: f.name }),
          h('span', { class: 'fo-item-count', text: String(total) }),
          h('button', {
            class: 'fo-item-more',
            type: 'button',
            'aria-label': `Opciones de ${f.name}`,
            html: icon('more', { size: 14 }),
            onclick: (e) => {
              e.stopPropagation();
              menuCarpeta(e.currentTarget, f);
            },
          })
        );
      // Soltar aquí una jugada la mueve a esta carpeta.
      makeDropTarget(fila, (ids) => {
        const origen = seleccionada;
        store.actions.addToFolder(f.id, ids);
        if (origen && origen !== f.id) {
          for (const id of ids) store.actions.removeFromFolder(origen, id);
        }
        seleccionada = f.id;
        pintar();
        toast(`${ids.length} jugada${ids.length === 1 ? '' : 's'} en «${f.name}»`);
      });
      listaEl.append(fila);
    }

    // --- contenido de la carpeta
    const carpeta = carpetas().find((f) => f.id === seleccionada) || null;
    const hayCarpetas = carpetas().length > 0;
    btnAñadir.hidden = !carpeta;
    btnBorrar.hidden = !carpeta;
    gridEl.replaceChildren();
    vacioEl.replaceChildren();
    vacioEl.hidden = true;

    if (!carpeta) {
      tituloEl.textContent = hayCarpetas ? 'Elige una carpeta' : 'Sin carpetas todavía';
      subEl.textContent = hayCarpetas
        ? ''
        : 'Crea una carpeta y mete dentro las jugadas que quieras: tuyas o del catálogo.';
      return;
    }

    const dentro = store.getPlaysInFolder(carpeta.id);
    tituloEl.textContent = carpeta.name;
    subEl.textContent = `${dentro.length} ${dentro.length === 1 ? 'jugada' : 'jugadas'}`;
    raiz.style.setProperty('--fo-color', carpeta.color || FOLDER_COLORS[0]);

    if (!dentro.length) {
      vacioEl.hidden = false;
      vacioEl.append(
        h('span', { class: 'fo-empty-ic', html: icon('s-folder', { size: 30 }) }),
        h('b', { text: 'Carpeta vacía' }),
        h('span', { class: 'fo-empty-text', text: 'Añade jugadas de tu libreta o del catálogo.' }),
        h('button', {
          class: 'btn primary',
          type: 'button',
          html: `${icon('plus', { size: 15 })}<span>Añadir jugadas</span>`,
          onclick: () => añadirJugadas(),
        })
      );
      return;
    }

    for (const play of dentro) {
      const tarjeta = h(
          'article',
          { class: 'fo-card', role: 'listitem', title: 'Arrastra a otra carpeta para moverla' },
          h('button', {
            class: 'fo-card-open',
            type: 'button',
            title: `Abrir ${play.name}`,
            onclick: () => {
              store.selectPlay(play.id);
              onEdit?.(play.id);
            },
            html: `<span class="fo-card-thumb">${miniatura(play)}</span>
              <span class="fo-card-name">${escapeHTML(play.name)}</span>
              <span class="fo-card-meta">${escapeHTML(play.formation || '')}${
                play.type === 'defense' ? ' · Defensiva' : ''
              }</span>`,
          }),
          h('button', {
            class: 'fo-card-x',
            type: 'button',
            title: 'Quitar de la carpeta',
            'aria-label': `Quitar ${play.name} de la carpeta`,
            html: icon('x', { size: 14 }),
            onclick: () => {
              store.actions.removeFromFolder(carpeta.id, play.id);
              toast('Quitada de la carpeta');
            },
          })
        );
      makeDraggablePlay(tarjeta, () => [play.id]);
      gridEl.append(tarjeta);
    }
  }

  // ------------------------------------------------------------------ acciones
  async function nuevaCarpeta() {
    let color = FOLDER_COLORS[carpetas().length % FOLDER_COLORS.length];
    const nombre = await promptDialog({
      title: 'Nueva carpeta',
      label: 'Nombre de la carpeta',
      placeholder: 'Ej. Partidos de zona, Tercer down…',
      value: '',
      confirmText: 'Crear',
      body: (() => {
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
        return fila;
      })(),
    });
    if (nombre === null || nombre === undefined) return;
    const texto = String(nombre).trim();
    if (!texto) return;
    const f = store.actions.addFolder(texto, color);
    seleccionada = f.id;
    pintar();
    toast(`Carpeta «${f.name}» creada`);
  }

  async function renombrar(f) {
    const nombre = await promptDialog({
      title: 'Renombrar carpeta',
      label: 'Nombre',
      value: f.name,
      confirmText: 'Guardar',
    });
    if (nombre === null || nombre === undefined) return;
    if (!String(nombre).trim()) return;
    store.actions.renameFolder(f.id, String(nombre).trim());
    pintar();
  }

  async function borrarCarpeta() {
    const f = carpetas().find((x) => x.id === seleccionada);
    if (!f) return;
    const ok = await confirmDialog({
      title: 'Borrar carpeta',
      message: `¿Borrar «${f.name}»? Las jugadas seguirán en tu libreta.`,
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    store.actions.removeFolder(f.id);
    seleccionada = null;
    pintar();
    toast('Carpeta borrada');
  }

  function menuCarpeta(ancla, f) {
    const items = [
      { label: 'Añadir jugadas', icon: 'plus', onClick: () => ((seleccionada = f.id), pintar(), añadirJugadas()) },
      { label: 'Renombrar', icon: 'edit', onClick: () => renombrar(f) },
    ];
    for (const c of FOLDER_COLORS.slice(0, 6)) {
      items.push({
        label: `Color ${c}`,
        swatch: c,
        onClick: () => {
          store.actions.setFolderColor(f.id, c);
          pintar();
        },
      });
    }
    items.push({ label: 'Borrar carpeta', icon: 'trash', danger: true, onClick: () => ((seleccionada = f.id), borrarCarpeta()) });
    // popupMenu: se importa de forma diferida para no cargar el módulo entero al inicio
    import('./ui.js').then((ui) => ui.popupMenu(ancla, items));
  }

  /** Selector de jugadas para meter en la carpeta (de la libreta). */
  function añadirJugadas() {
    const carpeta = carpetas().find((x) => x.id === seleccionada);
    if (!carpeta) return;
    const jugadas = todasLasJugadas();
    const dentro = new Set(store.getPlaysInFolder(carpeta.id).map((p) => p.id));
    const marcadas = new Set();

    const lista = h('div', { class: 'fo-pick-list' });
    const buscar = h('input', { class: 'input fo-pick-search', type: 'search', placeholder: 'Buscar jugada…' });
    const pieInfo = h('span', { class: 'fo-pick-info', text: '0 seleccionadas' });

    function pintarLista() {
      const q = buscar.value.trim().toLowerCase();
      lista.replaceChildren();
      const visibles = jugadas.filter(
        (p) => !q || `${p.name} ${p.formation || ''} ${p.category || ''}`.toLowerCase().includes(q)
      );
      if (!visibles.length) {
        lista.append(h('div', { class: 'fo-pick-empty', text: 'No hay jugadas con ese nombre.' }));
        return;
      }
      for (const p of visibles) {
        const yaEsta = dentro.has(p.id);
        const check = h('input', { type: 'checkbox', checked: yaEsta || marcadas.has(p.id) });
        check.disabled = yaEsta;
        check.addEventListener('change', () => {
          if (check.checked) marcadas.add(p.id);
          else marcadas.delete(p.id);
          pieInfo.textContent = `${marcadas.size} seleccionada${marcadas.size === 1 ? '' : 's'}`;
        });
        lista.append(
          h(
            'label',
            { class: `fo-pick-item${yaEsta ? ' is-in' : ''}` },
            check,
            h('span', { class: 'fo-pick-thumb', html: playThumbSVG(p, 96, 60) }),
            h('span', { class: 'fo-pick-txt' }, h('b', { text: p.name }), h('small', { text: p.formation || '' })),
            yaEsta ? h('span', { class: 'fo-pick-tag', text: 'Ya está' }) : null
          )
        );
      }
      pieInfo.textContent = `${marcadas.size} seleccionada${marcadas.size === 1 ? '' : 's'}`;
    }
    buscar.addEventListener('input', pintarLista);
    pintarLista();

    modal({
      title: `Añadir a «${carpeta.name}»`,
      size: 'md',
      body: h('div', { class: 'fo-pick' }, buscar, lista),
      footer: [pieInfo],
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        {
          label: 'Añadir',
          kind: 'primary',
          onClick: (close) => {
            const n = store.actions.addToFolder(carpeta.id, [...marcadas]);
            pintar();
            toast(n ? `${n} jugada${n === 1 ? '' : 's'} añadida${n === 1 ? '' : 's'}` : 'No había nada nuevo');
            close();
          },
        },
      ],
    });
  }

  // ------------------------------------------------------------------ arranque
  unsubscribe = store.subscribe((_s, reason) => {
    if (reason === 'folders' || reason === 'plays' || reason === 'playbook') pintar();
  });
  pintar();

  return {
    destroy() {
      try {
        unsubscribe?.();
      } catch {
        /* noop */
      }
      raiz.remove();
    },
    /** Recarga manual (por si el store cambia fuera de los eventos). */
    refresh: pintar,
  };
}
