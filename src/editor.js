// Editor interactivo del campo: selección, arrastre, dibujo de rutas y atajos.
import { fieldToPx, makeView, pxToField, clampToField, snapYard } from './field.js';
import { playToSVG, computePlayDuration } from './renderer.js';
import { createPlayer, ROLES } from './model.js';
import { h, toast, popupMenu, escapeHTML, promptDialog } from './ui.js';
import { getRoute, ROUTES } from './presets.js';
import { icon } from './icons.js';

const SNAP_GRID = 0.5;

export function createEditor({ svg, stage, store, onSelectionChange }) {
  let tool = 'select'; // select | route
  let size = { w: 900, h: 620 };
  let view = null;
  let drag = null; // { kind:'player'|'handle'|'marquee', ... }
  let drawing = null; // { playerId }
  let preview = null; // {x,y} yardas
  let clipboard = null;
  let override = null; // { positions, ballPos, ballAngle } para simulación

  const hint = document.createElement('div');
  hint.className = 'draw-hint';
  hint.hidden = true;
  stage.append(hint);

  // Barra contextual: las acciones de lo que tengas delante, sin buscarlas.
  let selectedBall = false;
  const ctxBar = document.createElement('div');
  ctxBar.className = 'ctx-bar';
  ctxBar.setAttribute('role', 'toolbar');
  ctxBar.setAttribute('aria-label', 'Acciones del jugador');
  ctxBar.hidden = true;
  stage.append(ctxBar);
  let ctxAnchor = null; // { x, y } en px del stage

  // ---------- tamaño ----------
  function measure() {
    const r = stage.getBoundingClientRect();
    const pad = 20;
    size = { w: Math.max(320, Math.floor(r.width - pad)), h: Math.max(260, Math.floor(r.height - pad)) };
  }

  function currentView() {
    const play = store.getPlay();
    const field = play?.field || { width: 40, depth: 26, ez: 10 };
    return makeView({ field, width: size.w, height: size.h, padding: 16, flipped: store.state.ui.flipped });
  }

  function toField(evt) {
    const rect = svg.getBoundingClientRect();
    const px = { x: ((evt.clientX - rect.left) / rect.width) * size.w, y: ((evt.clientY - rect.top) / rect.height) * size.h };
    return pxToField(px, view);
  }

  function maybeSnap(pt, evt) {
    if (!store.state.ui.snap || evt?.altKey) return pt;
    return { x: snapYard(pt.x), y: snapYard(pt.y) };
  }

  function capture(evt) {
    try {
      svg.setPointerCapture(evt.pointerId);
    } catch {
      /* eventos sintéticos o puntero no activo */
    }
  }

  // ---------- render ----------
  function render() {
    const play = store.getPlay();
    if (!play) {
      svg.innerHTML = '';
      return;
    }
    measure();
    view = currentView();
    const ui = store.state.ui;
    const sel = store.state.selection;
    const html = playToSVG(play, {
      width: size.w,
      height: size.h,
      mode: 'editor',
      showDefense: ui.showDefense,
      showRoutes: ui.showRoutes,
      showLabels: ui.showLabels,
      showZones: ui.showZones,
      showThrowLine: ui.showThrowLine,
      selected: sel.ids,
      editingRoute: sel.ids.length === 1 ? sel.ids[0] : null,
      highlight: ui.highlight || [],
      time: ui.mode === 'edit' ? 0 : ui.playhead || 0,
      duration: computePlayDuration(play),
      positions: override?.positions || null,
      ballPos: override?.ballPos || null,
      ballAngle: override?.ballAngle || 0,
      padding: 16,
    });
    svg.setAttribute('width', size.w);
    svg.setAttribute('height', size.h);
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    svg.innerHTML = html;
    svg.classList.toggle('tool-route', tool === 'route');
    renderOverlay();
    updateContextBar();
  }

  function renderOverlay() {
    if (!svg.querySelector('.ovl')) {
      svg.insertAdjacentHTML('beforeend', '<g class="ovl" pointer-events="none"></g>');
    }
    const ovl = svg.querySelector('.ovl');
    if (!ovl) return;
    const out = [];
    if (drawing && preview && view) {
      const play = store.getPlay();
      const p = play?.players.find((x) => x.id === drawing.playerId);
      if (p) {
        const last = p.path?.length ? p.path[p.path.length - 1] : p.pos;
        const a = fieldToPx(last, view);
        const b = fieldToPx(preview, view);
        out.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#9ae63f" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" opacity="0.9"/>`
        );
        out.push(`<circle cx="${b.x}" cy="${b.y}" r="4.5" fill="#9ae63f" opacity="0.9"/>`);
        out.push(
          `<circle cx="${a.x}" cy="${a.y}" r="7" fill="none" stroke="#9ae63f" stroke-width="1.6" opacity="0.7"/>`
        );
      }
    }
    if (drag?.kind === 'marquee' && view) {
      const x = Math.min(drag.startPx.x, drag.curPx.x);
      const y = Math.min(drag.startPx.y, drag.curPx.y);
      const w = Math.abs(drag.curPx.x - drag.startPx.x);
      const h = Math.abs(drag.curPx.y - drag.startPx.y);
      out.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(154,230,63,0.09)" stroke="#9ae63f" stroke-width="1" stroke-dasharray="4 3"/>`
      );
    }
    ovl.innerHTML = out.join('');
  }

  /** Botón de la barra contextual. */
  function ctxBtn({ label, icono, onClick, primary, danger, title }) {
    return h('button', {
      class: `ctx-btn${primary ? ' is-primary' : ''}${danger ? ' is-danger' : ''}`,
      type: 'button',
      title: title || label,
      'aria-label': title || label,
      html: `${icon(icono, { size: 15 })}<span>${escapeHTML(label)}</span>`,
      onclick: onClick,
    });
  }

  /** Receptor del pase: menú con los jugadores de ataque. */
  function menuReceptor(anclaEl) {
    const play = store.getPlay();
    const actual = play.ball?.targetId || null;
    const receptores = play.players.filter((p) => p.team === 'offense' && p.role !== 'qb');
    popupMenu(anclaEl, [
      ...receptores.map((p) => ({
        label: `${p.label}${p.role === 'rb' ? ' (RB)' : ''}`,
        checked: p.id === actual,
        onClick: () => store.actions.setBall({ targetId: p.id }),
      })),
      '-',
      {
        label: 'Sin pase',
        icon: 'x',
        onClick: () => store.actions.setBall({ targetId: null }),
      },
    ]);
  }

  /** Momento del lanzamiento. */
  function menuLanzamiento(anclaEl) {
    const actual = Number(store.getPlay().ball?.releaseAt ?? 0.9);
    popupMenu(
      anclaEl,
      [0.5, 0.9, 1.2, 1.5, 2, 2.5].map((t) => ({
        label: `${t.toString().replace('.', ',')} s`,
        checked: Math.abs(t - actual) < 0.01,
        onClick: () => store.actions.setBall({ releaseAt: t }),
      }))
    );
  }

  /** Coloca la barra junto al jugador (o arriba si hay varios). */
  function colocarBarra(ids) {
    if (!view) return;
    const play = store.getPlay();
    const primero = play?.players.find((p) => p.id === ids[0]);
    const r = stage.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    if (!primero || ids.length !== 1) {
      ctxAnchor = { x: Math.max(12, r.width / 2), y: 14, centrado: true };
      return;
    }
    const px = fieldToPx(primero.pos, view);
    const escala = sr.width / Math.max(1, size.w);
    ctxAnchor = {
      x: Math.min(Math.max(90, px.x * escala), r.width - 90),
      y: Math.max(10, px.y * escala - 78),
      centrado: true,
    };
  }

  /** Vuelve a dibujar la barra contextual según lo que haya delante. */
  function updateContextBar() {
    const play = store.getPlay();
    const ids = store.state.selection.ids || [];
    ctxBar.replaceChildren();
    if (!play) {
      ctxBar.hidden = true;
      return;
    }

    const cerrar = () => {
      ctxBar.hidden = true;
      selectedBall = false;
    };

    // --- dibujando una ruta o un motion
    if (drawing) {
      const player = play.players.find((p) => p.id === drawing.playerId);
      ctxBar.classList.add('is-drawing');
      ctxBar.append(
        h('span', { class: 'ctx-tag', text: `${player?.label || ''} · ${player?.path?.length || 0} puntos` }),
        ctxBtn({ label: 'Terminar', icono: 'check', primary: true, onClick: () => finishDrawing() }),
        ctxBtn({ label: 'Deshacer punto', icono: 'undo', onClick: () => removeLastPoint() }),
        ctxBtn({ label: 'Cancelar', icono: 'x', onClick: () => setTool('select') })
      );
      ctxBar.hidden = false;
      colocarBarra([drawing.playerId]);
      posicionarBarra();
      return;
    }

    // --- el balón
    if (selectedBall) {
      const target = play.players.find((p) => p.id === play.ball?.targetId);
      ctxBar.classList.remove('is-drawing');
      ctxBar.append(
        h('span', { class: 'ctx-tag', text: 'Pase' }),
        ctxBtn({
          label: target ? `Receptor: ${target.label}` : 'Elegir receptor',
          icono: 'target',
          primary: !target,
          onClick: (e) => menuReceptor(e.currentTarget),
        }),
        ctxBtn({
          label: `Sale a ${Number(play.ball?.releaseAt ?? 0.9).toString().replace('.', ',')} s`,
          icono: 'timer',
          onClick: (e) => menuLanzamiento(e.currentTarget),
        }),
        target
          ? ctxBtn({ label: 'Quitar pase', icono: 'x', danger: true, onClick: () => store.actions.setBall({ targetId: null }) })
          : null,
        ctxBtn({ label: 'Cerrar', icono: 'x', onClick: cerrar })
      );
      ctxBar.hidden = false;
      ctxAnchor = { x: Math.max(12, stage.getBoundingClientRect().width / 2), y: 14 };
      posicionarBarra();
      return;
    }

    // --- sin selección
    if (!ids.length) {
      ctxBar.hidden = true;
      return;
    }

    const jugadores = play.players.filter((p) => ids.includes(p.id));
    const uno = jugadores.length === 1 ? jugadores[0] : null;

    // --- varios jugadores
    if (!uno) {
      ctxBar.classList.remove('is-drawing');
      ctxBar.append(
        h('span', { class: 'ctx-tag', text: `${jugadores.length} jugadores` }),
        ctxBtn({ label: 'Mover', icono: 'cursor', primary: true, onClick: () => setTool('select') }),
        ctxBtn({
          label: 'Color',
          icono: 'palette',
          onClick: () => menuColorMultiple(jugadores.map((p) => p.id)),
        }),
        ctxBtn({
          label: 'Duplicar',
          icono: 'copy',
          onClick: () => {
            for (const p of jugadores) duplicatePlayer(p.id);
          },
        }),
        ctxBtn({
          label: 'Eliminar',
          icono: 'trash',
          danger: true,
          onClick: () => store.actions.removePlayers(ids),
        })
      );
      ctxBar.hidden = false;
      colocarBarra(ids);
      posicionarBarra();
      return;
    }

    // --- un jugador
    const esOff = uno.team === 'offense';
    const esObjetivo = play.ball?.targetId === uno.id;
    ctxBar.classList.remove('is-drawing');
    ctxBar.append(
      h('span', { class: 'ctx-tag', text: uno.label || (esOff ? 'Jugador' : 'Defensa') })
    );
    if (esOff) {
      ctxBar.append(
        ctxBtn({ label: 'Mover', icono: 'cursor', onClick: () => setTool('select') }),
        ctxBtn({
          label: uno.pathType === 'motion' && uno.path?.length ? 'Motion' : 'Ruta',
          icono: 'route',
          primary: !uno.path?.length,
          onClick: () => {
            store.actions.updatePlayer(uno.id, { pathType: 'route' });
            setTool('route');
            startDrawing(uno.id);
          },
        }),
        ctxBtn({
          label: 'Motion',
          icono: 'redo',
          title: 'Dibujar el movimiento antes del snap',
          onClick: () => {
            store.actions.updatePlayer(uno.id, { pathType: 'motion', path: null });
            setTool('route');
            startDrawing(uno.id);
          },
        }),
        ctxBtn({
          label: esObjetivo ? 'Pase ✓' : 'Pase',
          icono: 'target',
          title: esObjetivo ? 'Este jugador recibe el pase' : 'Hacer que reciba el pase',
          onClick: () => store.actions.setBall({ targetId: esObjetivo ? null : uno.id }),
        })
      );
      if (uno.path?.length) {
        ctxBar.append(
          ctxBtn({
            label: 'Espejar',
            icono: 'flip',
            title: 'Voltear la ruta a la otra banda',
            onClick: () => {
              const pts = uno.path.map((pt) => ({ ...pt, x: Math.round((2 * uno.pos.x - pt.x) * 100) / 100 }));
              store.actions.updatePlayer(uno.id, { path: pts });
            },
          })
        );
      }
    } else {
      ctxBar.append(
        ctxBtn({ label: 'Mover', icono: 'cursor', onClick: () => setTool('select') }),
        ctxBtn({
          label: 'Cobertura',
          icono: 'target',
          onClick: (e) => {
            const items = playerActionItems(uno.id, e.currentTarget) || [];
            popupMenu(e.currentTarget, items.filter((it) => it === '-' || /receptor|rush|zona/i.test(it.label || '')));
          },
        })
      );
    }
    ctxBar.append(
      ctxBtn({
        label: 'Más',
        icono: 'more',
        title: 'Todas las opciones del jugador',
        onClick: (e) => {
          const items = playerActionItems(uno.id, e.currentTarget);
          if (items) popupMenu(e.currentTarget, items);
        },
      })
    );
    ctxBar.hidden = false;
    colocarBarra(ids);
    posicionarBarra();
  }

  /** Coloca la barra en píxeles dentro del escenario. */
  function posicionarBarra() {
    if (!ctxAnchor) return;
    const ancho = ctxBar.offsetWidth || 0;
    const left = ctxAnchor.centrado ? ctxAnchor.x - ancho / 2 : ctxAnchor.x;
    ctxBar.style.left = `${Math.max(8, Math.min(left, stage.clientWidth - ancho - 8))}px`;
    ctxBar.style.top = `${Math.max(8, ctxAnchor.y)}px`;
  }

  /** Color rápido para varias jugadas seleccionadas. */
  function menuColorMultiple(ids) {
    const colores = [
      ['Lima', '#b4f13f'],
      ['Cian', '#45d9e8'],
      ['Violeta', '#a78bfa'],
      ['Ámbar', '#ffb020'],
      ['Rosa', '#ff6b9a'],
      ['Blanco', '#f4f8f6'],
      ['Equipo', null],
    ];
    popupMenu(
      ctxBar.querySelector('.ctx-btn'),
      colores.map(([nombre, color]) => ({
        label: nombre,
        onClick: () => {
          for (const id of ids) {
            const play = store.getPlay();
            const player = play?.players.find((p) => p.id === id);
            if (!player) continue;
            const estilo = { ...(player.style || {}) };
            if (color) estilo.color = color;
            else delete estilo.color;
            store.actions.updatePlayer(id, { style: Object.keys(estilo).length ? estilo : null });
          }
        },
      }))
    );
  }

  function updateHint() {
    const play = store.getPlay();
    const p = play?.players.find((x) => x.id === drawing?.playerId);
    if (!drawing || !p) {
      hint.hidden = true;
      return;
    }
    const pts = p.path?.length || 0;
    hint.hidden = false;
    hint.innerHTML = `<b>${escapeHTML(p.label)}</b> · ${pts} punto${pts === 1 ? '' : 's'} — clic para añadir · <span class="kbd">Enter</span> terminar · <span class="kbd">Supr</span> deshacer punto`;
  }

  // ---------- selección ----------
  function selectPlayers(ids, opts = {}) {
    store.selectPlayers(ids, opts);
    onSelectionChange?.(ids);
  }

  function toggleSelect(id, additive) {
    const cur = store.state.selection.ids.slice();
    if (additive) {
      const i = cur.indexOf(id);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(id);
    } else {
      cur.length = 0;
      cur.push(id);
    }
    selectPlayers(cur);
  }

  // ---------- interacción ----------
  function onPointerDown(evt) {
    if (evt.button !== 0) return;
    const play = store.getPlay();
    if (!play) return;
    const target = evt.target.closest('[data-player-id]');
    const handle = evt.target.closest('[data-handle]');
    const isHandle = handle && handle.hasAttribute('data-handle');
    const enBalon = !!evt.target.closest('[data-ball]');
    const enRuta = evt.target.closest('[data-route-player]');
    if (enRuta && !target) {
      evt.preventDefault();
      selectPlayers([enRuta.dataset.routePlayer]);
      render();
      return;
    }

    if (enBalon && !isHandle) {
      evt.preventDefault();
      selectedBall = true;
      if (store.state.selection.ids.length) selectPlayers([]);
      render();
      return;
    }
    if (selectedBall && !target) {
      selectedBall = false;
      render();
    }

    svg.focus?.();

    if (isHandle) {
      evt.preventDefault();
      const playerId = handle.dataset.playerId;
      const index = Number(handle.dataset.handle);
      drag = { kind: 'handle', playerId, index, moved: false };
      store.begin();
      capture(evt);
      return;
    }

    if (target) {
      const id = target.dataset.playerId;
      const player = play.players.find((p) => p.id === id);
      if (!player) return;
      evt.preventDefault();
      const already = store.state.selection.ids.includes(id);

      if (tool === 'route') {
        // Clic en un jugador: seleccionarlo y empezar a dibujar su ruta
        if (!already) selectPlayers([id]);
        startDrawing(id);
        capture(evt);
        return;
      }

      if (!already) toggleSelect(id, evt.shiftKey);
      else if (evt.shiftKey) toggleSelect(id, true);

      drag = {
        kind: 'player',
        playerId: id,
        startField: toField(evt),
        startPos: { ...player.pos },
        moved: false,
        ids: store.state.selection.ids.slice(),
        startPositions: new Map(
          play.players.filter((p) => store.state.selection.ids.includes(p.id)).map((p) => [p.id, { ...p.pos }])
        ),
      };
      store.begin();
      capture(evt);
      return;
    }

    // Fondo del campo
    if (tool === 'route' && drawing && store.state.selection.ids.length === 1) {
      evt.preventDefault();
      appendPoint(store.state.selection.ids[0], toField(evt));
      return;
    }

    drag = {
      kind: 'marquee',
      startPx: { x: (evt.clientX - svg.getBoundingClientRect().left) * (size.w / svg.getBoundingClientRect().width), y: (evt.clientY - svg.getBoundingClientRect().top) * (size.h / svg.getBoundingClientRect().height) },
      curPx: null,
      additive: evt.shiftKey,
    };
    drag.curPx = { ...drag.startPx };
    svg.setPointerCapture(evt.pointerId);
  }

  function onPointerMove(evt) {
    if (!view) return;
    if (drawing) {
      preview = toField(evt);
      renderOverlay();
    }
    if (!drag) return;

    if (drag.kind === 'player') {
      const now = toField(evt);
      const dx = now.x - drag.startField.x;
      const dy = now.y - drag.startField.y;
      if (!drag.moved && Math.hypot(dx, dy) < 0.35) return;
      drag.moved = true;
      svg.classList.add('is-dragging');
      const play = store.getPlay();
      store.update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        for (const [id, start] of drag.startPositions) {
          const pl = p.players.find((x) => x.id === id);
          if (!pl) continue;
          const raw = { x: start.x + dx, y: start.y + dy };
          const snapped = maybeSnap(raw, evt);
          pl.pos = clampToField(snapped, p.field);
        }
      }, { history: false, silent: true, reason: 'drag' });
      render();
      onSelectionChange?.(store.state.selection.ids);
      return;
    }

    if (drag.kind === 'handle') {
      drag.moved = true;
      const pt = maybeSnap(toField(evt), evt);
      store.update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        const pl = p?.players.find((x) => x.id === drag.playerId);
        if (!pl || !pl.path?.[drag.index]) return;
        pl.path[drag.index] = { ...pl.path[drag.index], x: pt.x, y: pt.y };
      }, { history: false, silent: true, reason: 'drag' });
      render();
      return;
    }

    if (drag.kind === 'marquee') {
      const rect = svg.getBoundingClientRect();
      drag.curPx = {
        x: (evt.clientX - rect.left) * (size.w / rect.width),
        y: (evt.clientY - rect.top) * (size.h / rect.height),
      };
      renderOverlay();
    }
  }

  function onPointerUp(evt) {
    if (drawing) {
      // sigue en modo dibujo
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    svg.classList.remove('is-dragging');
    try {
      svg.releasePointerCapture(evt.pointerId);
    } catch {}

    if (d.kind === 'player') {
      if (d.moved) store.end('move');
      else store.cancel();
      render();
      return;
    }
    if (d.kind === 'handle') {
      if (d.moved) store.end('route');
      else store.cancel();
      render();
      return;
    }
    if (d.kind === 'marquee') {
      const x1 = Math.min(d.startPx.x, d.curPx.x);
      const x2 = Math.max(d.startPx.x, d.curPx.x);
      const y1 = Math.min(d.startPx.y, d.curPx.y);
      const y2 = Math.max(d.startPx.y, d.curPx.y);
      const play = store.getPlay();
      if (play && (x2 - x1 > 6 || y2 - y1 > 6)) {
        const hits = play.players
          .filter((p) => {
            const c = fieldToPx(p.pos, view);
            return c.x >= x1 && c.x <= x2 && c.y >= y1 && c.y <= y2;
          })
          .map((p) => p.id);
        const cur = d.additive ? store.state.selection.ids : [];
        selectPlayers([...new Set([...cur, ...hits])]);
      } else if (!d.additive) {
        selectPlayers([]);
      }
      render();
    }
  }

  function onDoubleClick(evt) {
    const target = evt.target.closest('[data-player-id]');
    if (target) {
      const id = target.dataset.playerId;
      selectPlayers([id], { editing: id });
      if (tool !== 'route') startDrawing(id);
      return;
    }
    // Doble clic sobre una ruta ya dibujada -> nada por ahora
  }

  /** Redondeo suave de coordenadas al aplicar rutas de la biblioteca. */
  function r2(n) {
    return Math.round(n * 100) / 100;
  }

  /** Aplica una ruta de la biblioteca (plantillas y propias) a un jugador. */
  function aplicarRutaBiblioteca(playerId, routeId) {
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === playerId);
    const route = getRoute(routeId);
    if (!player || !route || !Array.isArray(route.points) || !route.points.length) {
      return toast('Esa ruta no está disponible', 'error');
    }
    // Las rutas de la biblioteca son relativas al receptor.
    const path = route.points.map((pt) => ({
      x: r2(player.pos.x + Number(pt.x || 0)),
      y: r2(player.pos.y + Number(pt.y || 0)),
      ...(pt.curve ? { curve: pt.curve } : {}),
    }));
    store.actions.updatePlayer(playerId, { path, pathType: 'route' });
    toast(`Ruta «${route.name}» aplicada`);
  }

  /** Espeja la ruta del jugador respecto a su posición (derecha ↔ izquierda). */
  function espejarRutaJugador(playerId) {
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === playerId);
    if (!player || !player.path?.length) return toast('Ese jugador no tiene ruta', 'error');
    const path = player.path.map((pt) => ({ ...pt, x: r2(2 * player.pos.x - pt.x) }));
    store.actions.updatePlayer(playerId, { path });
  }

  /** Cambia la etiqueta corta (X, Y, Z, R1, CB1…). */
  async function cambiarEtiqueta(playerId) {
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === playerId);
    if (!player) return;
    const valor = await promptDialog({
      title: 'Etiqueta del jugador',
      label: 'Nombre corto en el campo',
      value: player.label || '',
      confirmText: 'Guardar',
      maxLength: 6,
    });
    if (valor === null || valor === undefined) return;
    const limpio = String(valor).trim().slice(0, 6);
    if (!limpio) return;
    store.actions.updatePlayer(playerId, { label: limpio });
  }

  /** Colores rápidos para el jugador seleccionado. */
  function menuColorJugador(ancla, playerId) {
    const colores = [
      ['Lima', '#b4f13f'],
      ['Cian', '#45d9e8'],
      ['Violeta', '#a78bfa'],
      ['Ámbar', '#ffb020'],
      ['Rosa', '#ff6b9a'],
      ['Rojo', '#ff6b5c'],
      ['Blanco', '#f4f8f6'],
      ['Equipo', null],
    ];
    popupMenu(
      ancla,
      colores.map(([nombre, color]) => ({
        label: nombre,
        hint: color || '',
        onClick: () => {
          const play = store.getPlay();
          const player = play?.players.find((p) => p.id === playerId);
          if (!player) return;
          const estilo = { ...(player.style || {}) };
          if (color) estilo.color = color;
          else delete estilo.color;
          store.actions.updatePlayer(playerId, { style: Object.keys(estilo).length ? estilo : null });
        },
      }))
    );
  }

  /** Acciones disponibles para un jugador (menú y barra contextual). */
  function playerActionItems(id, ancla) {
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === id);
    if (!player) return null;
    const isOff = player.team === 'offense';
    const esObjetivo = play.ball?.targetId === id;
    const tieneRuta = !!player.path?.length;
    const esMotion = player.pathType === 'motion';

    const items = [
      {
        label: esMotion ? 'Seguir dibujando el motion' : tieneRuta ? 'Seguir dibujando la ruta' : 'Dibujar ruta',
        icon: 'route',
        hint: 'R',
        onClick: () => {
          store.actions.updatePlayer(id, { pathType: isOff ? 'route' : 'rush' });
          setTool('route');
          startDrawing(id);
        },
      },
      isOff
        ? {
            label: 'Dibujar motion',
            icon: 'flip',
            hint: 'antes del snap',
            onClick: () => {
              store.actions.updatePlayer(id, { pathType: 'motion', path: null });
              setTool('route');
              startDrawing(id);
              toast('Dibuja el movimiento previo al snap');
            },
          }
        : null,
      isOff
        ? {
            label: esObjetivo ? 'Quitar el pase' : 'Dibujar pase a este jugador',
            icon: 'target',
            checked: esObjetivo,
            onClick: () => store.actions.setBall({ targetId: esObjetivo ? null : id }),
          }
        : null,
      isOff
        ? {
            label: 'Ruta de la biblioteca…',
            icon: 'layers',
            onClick: () => {
              const propias = store.getCustomRoutes?.() || [];
              const filas = [
                ...propias.map((r) => ({ label: r.name, hint: 'propia', onClick: () => aplicarRutaBiblioteca(id, r.id) })),
                ...(propias.length ? ['-'] : []),
                ...ROUTES.map((r) => ({ label: r.name, onClick: () => aplicarRutaBiblioteca(id, r.id) })),
              ];
              popupMenu(ancla, filas);
            },
          }
        : null,
      tieneRuta
        ? {
            label: 'Espejar ruta',
            icon: 'flip',
            onClick: () => espejarRutaJugador(id),
          }
        : null,
      tieneRuta
        ? {
            label: 'Borrar ruta',
            icon: 'x',
            onClick: () => store.actions.updatePlayer(id, { path: null }),
          }
        : null,
      '-',
      isOff && player.role !== 'qb'
        ? {
            label: 'Marcar como QB',
            icon: 'target',
            onClick: () => {
              const anteriores = store.getPlay().players.filter((p) => p.role === 'qb' && p.id !== id);
              for (const p of anteriores) store.actions.updatePlayer(p.id, { role: 'wr', label: p.label === 'QB' ? 'X' : p.label });
              store.actions.updatePlayer(id, { role: 'qb', label: 'QB' });
            },
          }
        : null,
      {
        label: 'Cambiar etiqueta…',
        icon: 'edit',
        onClick: () => cambiarEtiqueta(id),
      },
      {
        label: 'Color del jugador…',
        icon: 'palette',
        onClick: () => menuColorJugador(target, id),
      },
      '-',
      {
        label: 'Duplicar jugador',
        icon: 'copy',
        onClick: () => duplicatePlayer(id),
      },
      ...(isOff
        ? []
        : [
            '-',
            {
              label: 'Asignar a receptor…',
              icon: 'target',
              onClick: () => startManAssign(id),
            },
            {
              label: 'Ruta de rush',
              onClick: () => store.actions.updatePlayer(id, { assignment: { type: 'rush', lane: 1 } }),
            },
            {
              label: 'Zona (drop profundo)',
              onClick: () =>
                store.actions.updatePlayer(id, {
                  assignment: { type: 'zone', landmark: { x: player.pos.x, y: player.pos.y + 8 }, depth: 8 },
                }),
            },
          ]),
      '-',
      {
        label: 'Eliminar jugador',
        icon: 'trash',
        danger: true,
        onClick: () => store.actions.removePlayers([id]),
      },
    ].filter(Boolean);

    return items;
  }

  function onContextMenu(evt) {
    const target = evt.target.closest('[data-player-id]');
    if (!target) return;
    evt.preventDefault();
    const id = target.dataset.playerId;
    if (!store.state.selection.ids.includes(id)) selectPlayers([id]);
    const items = playerActionItems(id, target);
    if (items) popupMenu(evt.target, items);
  }

  function startManAssign(defenderId) {
    const play = store.getPlay();
    const receivers = play.players.filter((p) => p.team === 'offense' && p.role !== 'qb');
    if (!receivers.length) return toast('No hay receptores', 'error');
    const menu = document.createElement('div');
    menu.className = 'popmenu in';
    menu.style.position = 'fixed';
    menu.style.left = '50%';
    menu.style.top = '30%';
    menu.style.transform = 'translateX(-50%)';
    menu.innerHTML =
      `<div class="popmenu-sep"></div>` +
      receivers
        .map(
          (r) =>
            `<button class="popmenu-item" data-target="${escapeHTML(r.id)}"><span class="popmenu-label">${escapeHTML(
              r.label
            )} · ${escapeHTML(ROLES[r.role]?.label || '')}</span></button>`
        )
        .join('');
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-target]');
      if (!btn) return;
      store.actions.updatePlayer(defenderId, { assignment: { type: 'man', targetId: btn.dataset.target } });
      menu.remove();
      toast('Marcaje asignado', 'ok');
    });
    document.body.append(menu);
    setTimeout(() => {
      const off = () => {
        menu.remove();
        document.removeEventListener('mousedown', off);
      };
      document.addEventListener('mousedown', off);
    }, 0);
  }

  function duplicatePlayer(id) {
    const play = store.getPlay();
    const src = play?.players.find((p) => p.id === id);
    if (!src) return;
    const copy = createPlayer({
      ...src,
      id: undefined,
      pos: { x: src.pos.x + 1.5, y: src.pos.y },
      path: src.path ? src.path.map((p) => ({ ...p })) : null,
      assignment: src.assignment ? { ...src.assignment } : null,
    });
    store.actions.addPlayer(copy);
  }

  // ---------- dibujo de rutas ----------
  function startDrawing(playerId) {
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === playerId);
    if (!player) return;
    store.begin();
    if (!player.path || player.path.length === 0) {
      store.actions.updatePlayer(playerId, { path: [] }, { history: false });
    }
    drawing = { playerId };
    preview = null;
    selectPlayers([playerId]);
    updateHint();
    render();
  }

  function appendPoint(playerId, rawPt) {
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === playerId);
    if (!player) return;
    const pt = maybeSnap(rawPt);
    const path = player.path ? player.path.slice() : [];
    const prev = path.length ? path[path.length - 1] : player.pos;
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    if (Math.hypot(dx, dy) < 0.4) return;
    // Curva suave si el giro es pronunciado: mejora la pinta del diagrama
    if (path.length && Math.hypot(dx, dy) > 1.2) {
      const lastIdx = path.length - 1;
      const before = lastIdx === 0 ? player.pos : path[lastIdx - 1];
      const prevDx = path[lastIdx].x - before.x;
      const prevDy = path[lastIdx].y - before.y;
      const angle = Math.abs(Math.atan2(prevDx * dy - prevDy * dx, prevDx * dx + prevDy * dy));
      if (angle > 0.75) path[lastIdx] = { ...path[lastIdx], curve: 'smooth' };
    }
    path.push({ x: pt.x, y: pt.y, curve: 'line' });
    store.actions.updatePlayer(playerId, { path }, { history: false });
    render();
    updateHint();
  }

  function removeLastPoint() {
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === drawing?.playerId);
    if (!player?.path?.length) return;
    const path = player.path.slice(0, -1);
    store.actions.updatePlayer(player.id, { path }, { history: false });
    render();
    updateHint();
  }

  function finishDrawing() {
    if (!drawing) return;
    const id = drawing.playerId;
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === id);
    drawing = null;
    preview = null;
    updateHint();
    if (player && (!player.path || player.path.length === 0)) {
      store.actions.updatePlayer(id, { path: null }, { history: false });
    }
    // Autoselecciona al receptor si es una jugada de pase y no hay target
    if (player && play && !play.ball?.targetId && player.team === 'offense' && player.role !== 'qb') {
      store.actions.setBall({ targetId: player.id }, { history: false });
    }
    store.end('route');
    setTool('select');
    render();
  }

  // ---------- herramienta ----------
  function setTool(t) {
    tool = t;
    selectedBall = false;
    if (t !== 'route') {
      drawing = null;
      preview = null;
      updateHint();
    }
    svg.classList.toggle('tool-route', tool === 'route');
    render();
    onSelectionChange?.(store.state.selection.ids);
  }

  function getTool() {
    return tool;
  }

  // ---------- atajos de teclado ----------
  function onKeyDown(e) {
    const tag = (e.target?.tagName || '').toLowerCase();
    const isField = ['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable;
    if (isField) return;
    const meta = e.ctrlKey || e.metaKey;

    if (drawing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishDrawing();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finishDrawing();
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeLastPoint();
        return;
      }
    }

    if (e.key === 'v' || e.key === 'V') return setTool('select');
    if (e.key === 'r' || e.key === 'R') {
      const sel = store.state.selection.ids;
      if (sel.length === 1) {
        setTool('route');
        startDrawing(sel[0]);
      } else {
        setTool('route');
        toast('Selecciona un jugador y pulsa R para dibujar su ruta', 'info');
      }
      return;
    }
    if (e.key === 'Escape') {
      if (store.state.selection.ids.length) selectPlayers([]);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const ids = store.state.selection.ids;
      if (ids.length) {
        e.preventDefault();
        store.actions.removePlayers(ids);
      }
      return;
    }
    if (meta && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      const ids = store.state.selection.ids;
      for (const id of ids) duplicatePlayer(id);
      return;
    }
    if (meta && (e.key === 'c' || e.key === 'C')) {
      const sel = store.getSelectedPlayers();
      if (sel.length) {
        clipboard = JSON.parse(JSON.stringify(sel));
        toast(`${sel.length} jugador${sel.length > 1 ? 'es' : ''} copiado${sel.length > 1 ? 's' : ''}`, 'ok', 1400);
      }
      return;
    }
    if (meta && (e.key === 'v' || e.key === 'V')) {
      // pegar
      if (clipboard?.length) {
        e.preventDefault();
        for (const p of clipboard) {
          store.actions.addPlayer(
            createPlayer({ ...p, id: undefined, pos: { x: p.pos.x + 2, y: p.pos.y + 2 }, path: p.path ? p.path.map((q) => ({ ...q })) : null })
          );
        }
        toast('Pegado', 'ok', 1200);
      }
      return;
    }
    // Nudge con flechas
    if (e.key.startsWith('Arrow')) {
      const ids = store.state.selection.ids;
      if (!ids.length) return;
      e.preventDefault();
      const step = e.shiftKey ? 5 : meta ? 0.5 : 1;
      const d = { x: 0, y: 0 };
      if (e.key === 'ArrowLeft') d.x = -step;
      if (e.key === 'ArrowRight') d.x = step;
      if (e.key === 'ArrowUp') d.y = step;
      if (e.key === 'ArrowDown') d.y = -step;
      store.update((s) => {
        const p = s.playbook.plays.find((x) => x.id === s.playId);
        if (!p) return;
        for (const pl of p.players) {
          if (!ids.includes(pl.id)) continue;
          pl.pos = clampToField({ x: pl.pos.x + d.x, y: pl.pos.y + d.y }, p.field);
        }
      }, { history: true, reason: 'nudge' });
      return;
    }
  }

  // ---------- listeners ----------
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('dblclick', onDoubleClick);
  svg.addEventListener('contextmenu', onContextMenu);
  svg.addEventListener('pointerleave', () => {
    if (drawing) {
      preview = null;
      renderOverlay();
    }
  });

  const ro = new ResizeObserver(() => {
    render();
  });
  ro.observe(stage);

  return {
    render,
    destroy() {
      ro.disconnect();
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerUp);
      svg.removeEventListener('dblclick', onDoubleClick);
      svg.removeEventListener('contextmenu', onContextMenu);
    },
    setTool,
    getTool,
    startDrawing,
    finishDrawing,
    onKeyDown,
    getView: () => view,
    getSize: () => size,
    setOverride(o) {
      override = o;
      render();
    },
  };
}
