// Editor interactivo del campo: selección, arrastre, dibujo de rutas y atajos.
import { fieldToPx, makeView, pxToField, clampToField, snapYard } from './field.js';
import { playToSVG, computePlayDuration } from './renderer.js';
import { createPlayer, ROLES } from './model.js';
import { toast, popupMenu, escapeHTML } from './ui.js';
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

  function onContextMenu(evt) {
    const target = evt.target.closest('[data-player-id]');
    if (!target) return;
    evt.preventDefault();
    const id = target.dataset.playerId;
    const play = store.getPlay();
    const player = play?.players.find((p) => p.id === id);
    if (!player) return;
    if (!store.state.selection.ids.includes(id)) selectPlayers([id]);
    const isOff = player.team === 'offense';
    popupMenu(evt.target, [
      {
        label: 'Dibujar ruta',
        icon: 'route',
        onClick: () => {
          setTool('route');
          startDrawing(id);
        },
      },
      {
        label: 'Borrar ruta',
        icon: 'x',
        onClick: () => store.actions.updatePlayer(id, { path: null }),
      },
      '-',
      {
        label: 'Duplicar jugador',
        icon: 'copy',
        onClick: () => duplicatePlayer(id),
      },
      ...(isOff
        ? [
            {
              label: player.ballTarget ? 'Quitar como receptor del balón' : 'Lanzar el balón a este jugador',
              icon: 'target',
              checked: !!player.ballTarget,
              onClick: () => {
                const play2 = store.getPlay();
                const isTarget = play2.ball?.targetId === id;
                store.actions.setBall({ targetId: isTarget ? null : id });
              },
            },
          ]
        : [
            {
              label: 'Asignar a receptor…',
              icon: 'target',
              onClick: () => startManAssign(id),
            },
            '-',
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
    ]);
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
