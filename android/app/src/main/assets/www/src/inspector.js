// Inspector: propiedades de la jugada, de los jugadores y de las rutas.
import { ROLES, P_CATEGORIES, validatePlay, countByTeam } from './model.js';
import { FORMATS } from './field.js';
import { computePlayDuration } from './renderer.js';
import {
  DEFAULT_APPEARANCE,
  FIELD_THEMES,
  PALETTE,
  ROUTE_STYLES,
  SHAPES,
  contrastInk,
  normalizeAppearance,
  normalizePlayerStyle,
} from './appearance.js';
import { icon } from './icons.js';
import { h, escapeHTML, toast, confirmDialog } from './ui.js';

const collapsed = new Set(['field', 'stats']);

export function createInspector({ root, store, presets, actions }) {
  let tab = 'offense';
  let lastPlayId = null;

  // ---------- helpers de UI ----------
  function sec(key, title, children, opts = {}) {
    const isCollapsed = collapsed.has(key);
    const wrap = h('section', { class: `sec ${isCollapsed ? 'is-collapsed' : ''}` });
    const head = h(
      'button',
      { class: 'sec-head', type: 'button', 'aria-expanded': isCollapsed ? 'false' : 'true' },
      h('span', { class: 'sec-title', text: title }),
      h('span', { html: icon('chevron-down', { size: 13 }) })
    );
    head.addEventListener('click', () => {
      if (collapsed.has(key)) collapsed.delete(key);
      else collapsed.add(key);
      wrap.classList.toggle('is-collapsed');
      head.setAttribute('aria-expanded', wrap.classList.contains('is-collapsed') ? 'false' : 'true');
    });
    const body = h('div', { class: 'sec-body' });
    for (const c of children.flat(3)) if (c) body.append(c.nodeType ? c : h('div', { text: String(c) }));
    wrap.append(head, body);
    return wrap;
  }

  function row(label, control, opts = {}) {
    return h(
      'div',
      { class: `row ${opts.wide ? 'wide' : ''}` },
      label ? h('label', { class: 'lbl', text: label }) : null,
      control
    );
  }

  function input(field, opts = {}) {
    const node = h('input', {
      class: `input ${opts.mono ? 'mono' : ''}`,
      value: opts.value ?? '',
      type: opts.type || 'text',
      placeholder: opts.placeholder || '',
      maxlength: opts.maxlength || 120,
      'aria-label': opts.label || field,
    });
    node.addEventListener('input', () => {
      if (opts.transform) node.value = opts.transform(node.value);
      opts.onInput?.(node.value, node);
    });
    if (opts.onEnter) node.addEventListener('keydown', (e) => e.key === 'Enter' && opts.onEnter(node.value));
    return node;
  }

  function select(options, value, onChange, opts = {}) {
    const node = h('select', { class: 'select', 'aria-label': opts.label || '' });
    for (const o of options) {
      const op = h('option', { value: o.value, text: o.label });
      if (String(o.value) === String(value)) op.selected = true;
      node.append(op);
    }
    node.addEventListener('change', () => onChange(node.value));
    return node;
  }

  function chipsFor(play, team) {
    const wrap = h('div', { class: 'player-chips' });
    const list = play.players.filter((p) => p.team === team);
    if (!list.length) {
      wrap.append(h('span', { class: 'hint', text: 'Sin jugadores' }));
    }
    for (const p of list) {
      const isSel = store.state.selection.ids.includes(p.id);
      const chip = h('button', {
        class: `pchip ${team === 'offense' ? 'is-off' : 'is-def'} ${isSel ? 'is-selected' : ''}`,
        type: 'button',
        title: `${ROLES[p.role]?.label || p.role}${p.assignment?.type ? ' · ' + labelAssignment(p) : ''}`,
      });
      chip.innerHTML = `<span class="pc-dot">${escapeHTML(play.ball?.targetId === p.id ? '•' : p.label)}</span><span>${escapeHTML(
        p.label
      )}</span>`;
      chip.addEventListener('click', (e) => {
        if (e.shiftKey) {
          const ids = store.state.selection.ids.slice();
          const i = ids.indexOf(p.id);
          if (i >= 0) ids.splice(i, 1);
          else ids.push(p.id);
          store.selectPlayers(ids);
        } else store.selectPlayers([p.id]);
      });
      wrap.append(chip);
    }
    return wrap;
  }

  function labelAssignment(p) {
    const a = p.assignment;
    if (!a) return '';
    if (a.type === 'man') {
      const play = store.getPlay();
      const t = play?.players.find((x) => x.id === a.targetId);
      return `Hombre sobre ${t?.label || '?'}`;
    }
    if (a.type === 'zone') return `Zona (${Math.round(a.depth)} yd)`;
    if (a.type === 'rush') return 'Rush al QB';
    return a.type;
  }

  function routePreviewSVG(points, w = 44, h = 26) {
    if (!points?.length) return '';
    const xs = [0, ...points.map((p) => p.x)];
    const ys = [0, ...points.map((p) => p.y)];
    const minX = Math.min(...xs) - 1;
    const maxX = Math.max(...xs) + 1;
    const minY = Math.min(...ys) - 1;
    const maxY = Math.max(...ys) + 1;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const s = Math.min((w - 8) / spanX, (h - 8) / spanY);
    const tx = (x) => 4 + (x - minX) * s;
    const ty = (y) => h - 4 - (y - minY) * s;
    const d = 'M ' + [tx(0), ty(0), ...points.map((p) => `L ${tx(p.x)} ${ty(p.y)}`)].join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/><circle cx="${tx(points[points.length - 1].x)}" cy="${ty(
      points[points.length - 1].y
    )}" r="2.4" fill="currentColor" stroke="none"/></svg>`;
  }

  // ---------- acciones ----------
  /** Todas las rutas disponibles: las propias primero y luego las plantillas. */
  function allRoutes() {
    const custom = (store.getCustomRoutes ? store.getCustomRoutes() : []).map((r) => ({ ...r, builtin: false }));
    const builtin = (presets?.ROUTES || []).map((r) => ({ ...r, builtin: true }));
    return [...custom, ...builtin];
  }

  function applyRouteTemplate(routeId) {
    const sel = store.state.selection.ids;
    const play = store.getPlay();
    if (!play) return;
    const route = allRoutes().find((r) => r.id === routeId);
    if (!route) return;
    const ids = sel.length ? sel : play.players.filter((p) => p.team === 'offense' && p.role !== 'qb').map((p) => p.id);
    store.update((s) => {
      const p = s.playbook.plays.find((x) => x.id === s.playId);
      for (const id of ids) {
        const pl = p.players.find((x) => x.id === id);
        if (!pl) continue;
        // Las plantillas vienen en deltas desde el receptor; el modelo guarda
        // puntos ABSOLUTOS (el renderer pinta [pos, ...path]).
        pl.path = route.points.map((pt) => ({
          x: Math.round((pl.pos.x + pt.x) * 100) / 100,
          y: Math.round((pl.pos.y + pt.y) * 100) / 100,
          curve: pt.curve || 'line',
        }));
        pl.pathType = 'route';
      }
    }, { reason: 'route' });
    toast(`Ruta «${route.name}» aplicada`, 'ok', 1300);
  }

  function mirrorRoute() {
    const ids = store.state.selection.ids;
    const play = store.getPlay();
    if (!ids.length || !play) return;
    store.update((s) => {
      const p = s.playbook.plays.find((x) => x.id === s.playId);
      for (const pl of p.players) {
        if (!ids.includes(pl.id) || !pl.path) continue;
        // Los puntos son absolutos: se reflejan alrededor del jugador.
        pl.path = pl.path.map((pt) => ({ ...pt, x: Math.round((2 * pl.pos.x - pt.x) * 100) / 100 }));
      }
    }, { reason: 'route' });
  }

  function mirrorPlay() {
    store.update((s) => {
      const p = s.playbook.plays.find((x) => x.id === s.playId);
      if (!p) return;
      for (const pl of p.players) {
        pl.pos = { x: -pl.pos.x, y: pl.pos.y };
        if (pl.path) pl.path = pl.path.map((pt) => ({ ...pt, x: -pt.x }));
      }
    }, { reason: 'mirror' });
    toast('Jugada espejada', 'ok', 1200);
  }

  function clearRoutes() {
    const ids = store.state.selection.ids;
    store.update((s) => {
      const p = s.playbook.plays.find((x) => x.id === s.playId);
      if (!p) return;
      for (const pl of p.players) {
        if (ids.length && !ids.includes(pl.id)) continue;
        if (!ids.length && pl.team !== 'offense') continue;
        pl.path = null;
      }
    }, { reason: 'route' });
  }

  function applyFormation(formationId) {
    const formation = presets?.FORMATIONS?.find((f) => f.id === formationId);
    const play = store.getPlay();
    if (!formation || !play) return;
    store.update((s) => {
      const p = s.playbook.plays.find((x) => x.id === s.playId);
      if (!p) return;
      p.formation = formation.id;
      const existing = new Map(p.players.filter((x) => x.team === 'offense').map((x) => [x.label, x]));
      const used = new Set();
      const next = p.players.filter((x) => x.team === 'defense');
      for (const spec of formation.players) {
        const old = existing.get(spec.label) || [...existing.values()].find((e) => !used.has(e.id) && e.role === spec.role);
        if (old) {
          used.add(old.id);
          next.push({ ...old, pos: { x: spec.x, y: spec.y }, role: spec.role, label: spec.label });
        } else {
          next.push({
            id: `p_${Math.random().toString(36).slice(2, 9)}`,
            team: 'offense',
            pos: { x: spec.x, y: spec.y },
            label: spec.label,
            role: spec.role,
            number: '',
            path: null,
            pathType: 'route',
            assignment: null,
          });
        }
      }
      // ofensiva primero
      p.players = [...next.filter((x) => x.team === 'offense'), ...next.filter((x) => x.team === 'defense')];
    }, { reason: 'formation' });
  }

  function applyDefensePreset(defenseId) {
    const def = presets?.DEFENSES?.find((d) => d.id === defenseId);
    const play = store.getPlay();
    if (!def || !play) return;
    store.update((s) => {
      const p = s.playbook.plays.find((x) => x.id === s.playId);
      if (!p) return;
      const offense = p.players.filter((x) => x.team === 'offense');
      // presets.buildDefensePlayers resuelve markLabel -> targetId y genera los
      // caminos de rush; si no está disponible, caemos a un ruso genérico.
      let defenders = [];
      if (typeof presets.buildDefensePlayers === 'function') {
        defenders = presets.buildDefensePlayers(defenseId, p);
      } else if (typeof presets.buildDefenseFromPreset === 'function') {
        const built = presets.buildDefenseFromPreset(defenseId, p);
        defenders = built?.players?.filter((x) => x.team === 'defense') || [];
      }
      if (!defenders.length) {
        defenders = def.players.map((spec, i) => ({
          id: `p_${Math.random().toString(36).slice(2, 9)}`,
          team: 'defense',
          pos: { x: spec.x, y: spec.y },
          label: spec.label,
          role: spec.role,
          number: String(i + 1),
          path: null,
          pathType: 'rush',
          assignment: { type: 'rush', lane: 1 },
        }));
      }
      p.players = [...offense, ...defenders.map((d) => ({ ...d, team: 'defense' }))];
    }, { reason: 'defense' });
    toast(`Defensa «${def.name}» aplicada`, 'ok', 1400);
  }

  // ---------- secciones ----------
  function offenseSection(play) {
    const out = [];
    const sel = store.state.selection.ids;
    const selected = play.players.filter((p) => p.team === 'offense' && sel.includes(p.id));

    const offFormations = (presets?.FORMATIONS || []).filter((f) => f.type === 'offense');
    if (offFormations.length) {
      const opts = [{ value: '', label: '— Elegir formación —' }, ...offFormations.map((f) => ({ value: f.id, label: f.name }))];
      out.push(
        sec(
          'formation',
          'Formación',
          [row('Plantilla', select(opts, play.formation, (v) => v && applyFormation(v), { label: 'Formación' }))]
        )
      );
    }

    out.push(
      sec('off-players', 'Jugadores ofensivos', [
        chipsFor(play, 'offense'),
        
      ])
    );

    if (selected.length) {
      const p = selected[0];
      const routeSec = [];
      routeSec.push(
        row(
          'Etiqueta',
          input('label', {
            value: p.label,
            maxlength: 3,
            label: 'Etiqueta',
            onInput: (v) => store.actions.updatePlayer(p.id, { label: v.toUpperCase().slice(0, 3) }, { silent: true, history: false }),
          })
        ),
        row(
          'Dorsal',
          input('number', {
            value: p.number,
            maxlength: 3,
            mono: true,
            label: 'Dorsal',
            onInput: (v) => store.actions.updatePlayer(p.id, { number: v.replace(/\D/g, '').slice(0, 3) }, { silent: true, history: false }),
          })
        ),
        row(
          'Rol',
          select(
            Object.entries(ROLES)
              .filter(([, r]) => r.offense)
              .map(([k, r]) => ({ value: k, label: r.label })),
            p.role,
            (v) => store.actions.updatePlayer(p.id, { role: v }),
            { label: 'Rol' }
          )
        )
      );
      out.push(sec('off-player', `Jugador · ${p.label}`, routeSec));
      out.push(playerStyleSection(p));

      // Rutas
      const routeWrap = [];
      const routes = allRoutes();
      if (routes.length) {
        const grouped = {};
        for (const r of routes) (grouped[r.category || 'Otras'] ||= []).push(r);
        for (const [cat, list] of Object.entries(grouped)) {
          routeWrap.push(
            h('div', { class: 'hint route-cat' }, h('span', { text: cat }), h('span', { class: 'route-cat-count', text: String(list.length) }))
          );
          const grid = h('div', { class: 'route-grid' });
          for (const r of list) {
            const card = h('button', {
              class: `route-card ${r.builtin ? '' : 'is-custom'}`,
              type: 'button',
              title: r.builtin ? r.desc || r.name : `${r.name} (ruta propia)`,
            });
            card.innerHTML = `${routePreviewSVG(r.points)}<span>${escapeHTML(r.name)}</span>`;
            card.addEventListener('click', () => applyRouteTemplate(r.id));
            grid.append(card);
          }
          routeWrap.push(grid);
        }
        // Acceso directo a la sección de rutas para crear o editar las propias.
        routeWrap.push(
          h('button', {
            class: 'btn sm ghost route-manage',
            html: icon('route', { size: 13 }) + '<span>Gestionar todas las rutas…</span>',
            onclick: () => actions.onManageRoutes?.(),
          })
        );
      } else {
        routeWrap.push(h('div', { class: 'hint', text: 'Cargando…' }));
      }
      const btnRow = h('div', { class: 'btn-row' });
      btnRow.append(
        h('button', {
          class: 'btn sm',
          html: icon('route', { size: 13 }) + '<span>Dibujar ruta</span>',
          onclick: () => {
            actions.onDrawRoute?.(p.id);
          },
        }),
        h('button', {
          class: 'btn sm',
          html: icon('flip', { size: 13 }) + '<span>Invertir</span>',
          onclick: mirrorRoute,
        }),
        h('button', {
          class: 'btn sm',
          html: icon('x', { size: 13 }) + '<span>Borrar</span>',
          onclick: () => store.actions.updatePlayer(p.id, { path: null }),
        })
      );
      routeWrap.unshift(btnRow);
      out.push(sec('routes', 'Ruta y biblioteca', routeWrap));
    }

    // Balón
    const offPlayers = play.players.filter((p) => p.team === 'offense' && p.role !== 'qb');
    const ballSec = [
      row(
        'Receptor',
        select(
          [{ value: '', label: '— Sin lanzamiento —' }, ...offPlayers.map((p) => ({ value: p.id, label: `${p.label} · ${ROLES[p.role]?.label || ''}` }))],
          play.ball?.targetId || '',
          (v) => store.actions.setBall({ targetId: v || null }),
          { label: 'Receptor del balón' }
        )
      ),
    ];
    const releaseRow = h('div', { class: 'slider-row' });
    const releaseVal = h('span', { class: 'slider-val mono', text: `${Number(play.ball?.releaseAt || 0.9).toFixed(1)}s` });
    const range = h('input', {
      type: 'range',
      class: 'range',
      min: '0.2',
      max: '4',
      step: '0.1',
      value: String(play.ball?.releaseAt || 0.9),
      'aria-label': 'Momento del lanzamiento',
    });
    range.addEventListener('input', () => {
      releaseVal.textContent = `${Number(range.value).toFixed(1)}s`;
      store.actions.setBall({ releaseAt: Number(range.value) }, { silent: true, history: false });
    });
    range.addEventListener('change', () => store.actions.setBall({ releaseAt: Number(range.value) }));
    releaseRow.append(h('label', { class: 'lbl', text: 'Lanzamiento' }), range, releaseVal);
    ballSec.push(releaseRow);
    out.push(sec('ball', 'Balón', ballSec));

    return out;
  }

  function defenseSection(play) {
    const out = [];
    const sel = store.state.selection.ids;
    const selected = play.players.filter((p) => p.team === 'defense' && sel.includes(p.id));

    const defPresets = presets?.DEFENSES || [];
    if (defPresets.length) {
      out.push(
        sec('def-preset', 'Cobertura', [
          row(
            'Plantilla',
            select(
              [{ value: '', label: '— Elegir cobertura —' }, ...defPresets.map((d) => ({ value: d.id, label: d.name }))],
              '',
              (v) => v && applyDefensePreset(v),
              { label: 'Cobertura' }
            )
          ),
          
        ])
      );
    }

    const defChips = chipsFor(play, 'defense');
    const defenders = play.players.filter((x) => x.team === 'defense');
    if (defenders.length) {
      defChips.append(
        h('div', { class: 'btn-row', style: 'margin-top:8px' },
          h('button', {
            class: 'btn sm',
            html: icon('trash', { size: 13 }) + '<span>Quitar todos los defensas</span>',
            title: 'Deja la jugada sin defensa (los dibujos y las impresiones saldrán solo con la ofensiva)',
            onclick: async () => {
              const ok = await confirmDialog({
                title: '¿Quitar la defensa?',
                message: `Se eliminarán los ${defenders.length} defensas de esta jugada. Podrás volver a ponerlos eligiendo una cobertura.`,
                confirmLabel: 'Quitar defensa',
                danger: true,
              });
              if (!ok) return;
              store.actions.removePlayers(defenders.map((d) => d.id));
              toast('Defensa quitada', 'ok', 1600);
            },
          })
        )
      );
    }
    out.push(sec('def-players', 'Defensas', [defChips]));

    if (selected.length) {
      const p = selected[0];
      const a = p.assignment || { type: 'rush', lane: 1 };
      const rows = [
        row(
          'Etiqueta',
          input('label', {
            value: p.label,
            maxlength: 3,
            label: 'Etiqueta',
            onInput: (v) => store.actions.updatePlayer(p.id, { label: v.toUpperCase().slice(0, 3) }, { silent: true, history: false }),
          })
        ),
        row(
          'Rol',
          select(
            Object.entries(ROLES)
              .filter(([, r]) => !r.offense)
              .map(([k, r]) => ({ value: k, label: r.label })),
            p.role,
            (v) => store.actions.updatePlayer(p.id, { role: v }),
            { label: 'Rol' }
          )
        ),
        row(
          'Asignación',
          select(
            [
              { value: 'man', label: 'Marcaje individual' },
              { value: 'zone', label: 'Zona' },
              { value: 'rush', label: 'Rush al mariscal' },
            ],
            a.type,
            (v) => {
              const rec = play.players.find((x) => x.team === 'offense' && x.role !== 'qb' && !play.players.some((d) => d.assignment?.targetId === x.id));
              const next =
                v === 'man'
                  ? { type: 'man', targetId: rec?.id || null }
                  : v === 'zone'
                  ? { type: 'zone', landmark: { x: p.pos.x, y: p.pos.y + 8 }, depth: 8 }
                  : { type: 'rush', lane: 1 };
              store.actions.updatePlayer(p.id, { assignment: next });
            },
            { label: 'Asignación' }
          )
        ),
      ];
      if (a.type === 'man') {
        rows.push(
          row(
            'Cubre a',
            select(
              [{ value: '', label: '— Elegir receptor —' }, ...play.players.filter((x) => x.team === 'offense' && x.role !== 'qb').map((x) => ({ value: x.id, label: `${x.label}` }))],
              a.targetId || '',
              (v) => store.actions.updatePlayer(p.id, { assignment: { type: 'man', targetId: v || null } }),
              { label: 'Cubre a' }
            )
          )
        );
      }
      if (a.type === 'zone') {
        const depthRow = h('div', { class: 'slider-row' });
        const dv = h('span', { class: 'slider-val mono', text: `${Math.round(a.depth || 8)} yd` });
        const r2 = h('input', { type: 'range', class: 'range', min: '2', max: '22', step: '1', value: String(a.depth || 8), 'aria-label': 'Profundidad de zona' });
        r2.addEventListener('input', () => (dv.textContent = `${r2.value} yd`));
        r2.addEventListener('change', () =>
          store.actions.updatePlayer(p.id, {
            assignment: { ...a, depth: Number(r2.value), landmark: { x: p.pos.x, y: p.pos.y + Number(r2.value) } },
          })
        );
        depthRow.append(h('label', { class: 'lbl', text: 'Profundidad' }), r2, dv);
        rows.push(depthRow);
      }
      if (a.type === 'rush') {
        rows.push(
          row(
            'Carril',
            select(
              [
                { value: '0', label: 'Exterior izquierdo' },
                { value: '1', label: 'Centro' },
                { value: '2', label: 'Exterior derecho' },
              ],
              String(a.lane ?? 1),
              (v) => store.actions.updatePlayer(p.id, { assignment: { type: 'rush', lane: Number(v) } }),
              { label: 'Carril de rush' }
            )
          )
        );
      }
      rows.push(
        h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn sm',
            html: icon('trash', { size: 13 }) + '<span>Quitar este defensa</span>',
            onclick: () => {
              store.actions.removePlayers([p.id]);
              toast(`Defensa ${p.label} quitado`, 'ok', 1400);
            },
          })
        )
      );
      out.push(sec('def-player', `Defensa · ${p.label}`, rows));
      out.push(playerStyleSection(p));
    } else {
      
    }
    return out;
  }

  function playSection(play) {
    const out = [];
    const val = validatePlay(play);
    const counts = countByTeam(play);
    const dur = computePlayDuration(play);

    const nameInput = input('name', {
      value: play.name,
      label: 'Nombre de la jugada',
      onInput: (v) => {
        store.actions.updatePlay({ name: v }, { silent: true, history: false });
        actions.onTextEdit?.();
      },
      onEnter: () => store.actions.updatePlay({ name: store.getPlay().name }),
    });
    nameInput.addEventListener('change', () => store.actions.updatePlay({ name: nameInput.value }));

    const catSelect = select(
      P_CATEGORIES.map((c) => ({ value: c, label: c })),
      play.category,
      (v) => store.actions.updatePlay({ category: v }),
      { label: 'Categoría' }
    );

    const tagsInput = input('tags', {
      value: (play.tags || []).join(', '),
      label: 'Etiquetas',
      placeholder: 'zona, 3ª y corta, conversión',
      onInput: (v) => store.actions.updatePlay({ tags: v.split(',').map((s) => s.trim()).filter(Boolean) }, { silent: true, history: false }),
    });
    tagsInput.addEventListener('change', () =>
      store.actions.updatePlay({ tags: tagsInput.value.split(',').map((s) => s.trim()).filter(Boolean) })
    );

    const notes = h('textarea', { class: 'input', rows: '4', 'aria-label': 'Notas del entrenador', placeholder: 'Lectura del mariscal, timing, avisos…' });
    notes.value = play.notes || '';
    notes.addEventListener('input', () => {
      store.actions.updatePlay({ notes: notes.value }, { silent: true, history: false });
      actions.onTextEdit?.();
    });
    notes.addEventListener('change', () => store.actions.updatePlay({ notes: notes.value }));

    out.push(
      sec('meta', 'Identificación', [
        row('Nombre', nameInput, { wide: true }),
        row('Categoría', catSelect),
        row('Etiquetas', tagsInput, { wide: true }),
        row('Notas', notes, { wide: true }),
      ])
    );

    const fmt = Object.entries(FORMATS).map(([k, f]) => ({ value: k, label: f.label }));
    const closest = Object.entries(FORMATS).find(([, f]) => Math.abs(f.width - play.field.width) < 3)?.[0] || '5';
    out.push(
      sec('field', 'Campo', [
        row(
          'Formato',
          select(
            fmt,
            closest,
            (v) => {
              const f = FORMATS[v];
              store.actions.updatePlay({ field: { width: f.width, depth: f.depth, ez: f.ez } });
            },
            { label: 'Formato de campo' }
          )
        ),
        h('div', { class: 'hint', text: `${play.field.width} × ${play.field.depth} yardas + ${play.field.ez} de end zone.` }),
      ])
    );

    out.push(
      sec('stats', 'Resumen', [
        h('div', { class: 'stat-row' }, [
          h('div', { class: 'stat' }, h('b', { text: String(counts.offense) }), h('span', { text: 'Ofensiva' })),
          h('div', { class: 'stat' }, h('b', { text: String(counts.defense) }), h('span', { text: 'Defensa' })),
          h('div', { class: 'stat' }, h('b', { text: dur.toFixed(1) }), h('span', { text: 'Seg.' })),
        ]),
        h('div', { class: 'kv' }, h('span', { text: 'Rutas dibujadas' }), h('span', { text: String(play.players.filter((p) => p.path?.length).length) })),
        val.ok
          ? h('div', { class: 'banner' }, h('span', { html: icon('check', { size: 13 }) }), h('span', { text: 'Jugada lista para animar, simular e imprimir.' }))
          : h(
              'div',
              { class: 'banner warn' },
              h('span', { html: icon('alert', { size: 13 }) }),
              h('span', { text: val.errors.join(' · ') })
            ),
      ])
    );

    const actionsRow = h('div', { class: 'btn-row' });
    actionsRow.append(
      h('button', { class: 'btn sm', html: icon('copy', { size: 13 }) + '<span>Duplicar</span>', onclick: () => store.actions.duplicatePlay(play.id) }),
      h('button', { class: 'btn sm', html: icon('flip', { size: 13 }) + '<span>Espejar</span>', onclick: mirrorPlay }),
      h('button', {
        class: 'btn sm danger',
        html: icon('trash', { size: 13 }) + '<span>Eliminar</span>',
        onclick: async () => {
          if (await confirmDialog({ title: 'Eliminar jugada', message: `¿Eliminar «${play.name}»?`, confirmLabel: 'Eliminar' })) {
            store.actions.removePlay(play.id);
          }
        },
      })
    );
    out.push(sec('actions', 'Acciones', [actionsRow]));

    return out;
  }


  // ---------- personalización ----------
  function ap() {
    return normalizeAppearance(store.getPlaybook().appearance);
  }

  /** Cambia la apariencia. live = no registra historial (arrastrando un slider). */
  function applyAp(patch, live = false) {
    store.actions.setAppearance(patch, live ? { history: false, silent: false } : {});
  }

  function styleOf(player) {
    return normalizePlayerStyle(player?.style);
  }

  function applyStyle(ids, patch) {
    store.actions.setPlayerStyle(ids, patch);
  }

  /** Fila de color: swatches + selector nativo + botón «auto». */
  function colorRow(label, value, onChange, opts = {}) {
    const wrap = h('div', { class: 'color-field' });
    if (label) wrap.append(h('label', { class: 'lbl', text: label }));
    const grid = h('div', { class: 'swatch-grid' });
    for (const color of PALETTE.slice(0, opts.max || 12)) {
      const b = h('button', {
        class: `swatch ${value && value.toLowerCase() === color.toLowerCase() ? 'is-active' : ''}`,
        type: 'button',
        title: color,
        'aria-label': `Color ${color}`,
        style: { background: color },
        onclick: () => onChange(color),
      });
      grid.append(b);
    }
    const custom = h('input', {
      type: 'color',
      class: 'color-input',
      value: value || '#9ae63f',
      'aria-label': `${label || 'Color'} personalizado`,
      title: 'Color personalizado',
    });
    custom.addEventListener('input', () => onChange(custom.value));
    grid.append(custom);
    if (opts.auto !== false) {
      grid.append(
        h('button', {
          class: `swatch swatch-auto ${value ? '' : 'is-active'}`,
          type: 'button',
          title: 'Automático (según el tema)',
          'aria-label': 'Automático',
          text: 'A',
          onclick: () => onChange(null),
        })
      );
    }
    wrap.append(grid);
    return wrap;
  }

  function toggleRow(label, checked, onChange, hint) {
    const id = `tg_${Math.random().toString(36).slice(2, 8)}`;
    const input = h('input', { type: 'checkbox', id, class: 'switch-input' });
    input.checked = !!checked;
    input.addEventListener('change', () => onChange(input.checked));
    const sw = h('label', { class: 'switch', for: id }, input, h('span', { class: 'switch-track' }));
    const row = h('div', { class: 'toggle-row' }, h('div', { class: 'toggle-labels' }, h('span', { class: 'lbl', text: label }), hint && h('span', { class: 'hint', text: hint })), sw);
    return row;
  }

  function sliderRow(label, value, min, max, step, onChange, format) {
    const out = h('span', { class: 'slider-val mono', text: format ? format(value) : String(value) });
    const input = h('input', { type: 'range', class: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
    input.addEventListener('input', () => {
      out.textContent = format ? format(Number(input.value)) : input.value;
      onChange(Number(input.value), true);
    });
    input.addEventListener('change', () => onChange(Number(input.value), false));
    return h('div', { class: 'slider-row' }, h('label', { class: 'lbl', text: label }), input, out);
  }

  function themeCards() {
    const current = ap().theme;
    const grid = h('div', { class: 'theme-grid' });
    for (const [id, t] of Object.entries(FIELD_THEMES)) {
      const card = h('button', {
        class: `theme-card ${id === current ? 'is-active' : ''}`,
        type: 'button',
        title: t.desc,
        onclick: () => applyAp({ theme: id }),
      });
      card.innerHTML = `
        <span class="tc-preview" style="background:${t.fieldA};border-color:${t.line}">
          <i style="background:${t.fieldB}"></i>
          <i class="tc-off" style="background:${t.offFill}"></i>
          <i class="tc-def" style="background:${t.defFill}"></i>
          <i class="tc-route" style="background:${t.route}"></i>
        </span>
        <span class="tc-name">${escapeHTML(t.label)}</span>`;
      grid.append(card);
    }
    return grid;
  }

  function shapePicker(current, onPick) {
    const grid = h('div', { class: 'shape-grid' });
    for (const [id, label] of Object.entries(SHAPES)) {
      const btn = h('button', {
        class: `shape-btn ${id === current ? 'is-active' : ''}`,
        type: 'button',
        title: label,
        'aria-label': label,
      });
      const path =
        id === 'x'
          ? 'M -7 -7 L 7 7 M 7 -7 L -7 7'
          : id === 'square'
          ? 'M -7.5 -7.5 H 7.5 V 7.5 H -7.5 Z'
          : id === 'triangle'
          ? 'M 0 -8 L 8 7 L -8 7 Z'
          : id === 'diamond'
          ? 'M 0 -8.5 L 8.5 0 L 0 8.5 L -8.5 0 Z'
          : id === 'star'
          ? 'M 0 -9 L 2.6 -2.8 L 9 -2.8 L 3.9 1.3 L 5.6 7.6 L 0 3.9 L -5.6 7.6 L -3.9 1.3 L -9 -2.8 L -2.6 -2.8 Z'
          : 'M 0 -8.5 A 8.5 8.5 0 1 0 0.1 -8.5';
      btn.innerHTML = `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${path}" fill="${id === 'x' ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
      btn.addEventListener('click', () => onPick(id));
      grid.append(btn);
    }
    return grid;
  }

  function styleSection(play) {
    const a = ap();
    const out = [];
    const sel = store.state.selection.ids;
    const selPlayers = play.players.filter((p) => sel.includes(p.id));

    out.push(sec('ap-theme', 'Tema del campo', [
      themeCards(),
      
    ]));

    out.push(sec('ap-players', 'Jugadores', [
      h('div', { class: 'row wide' }, h('label', { class: 'lbl', text: 'Forma' }), shapePicker(a.shape, (v) => applyAp({ shape: v }))),
      sliderRow('Tamaño', a.playerSize, 0.6, 1.6, 0.05, (v, live) => applyAp({ playerSize: v }, live), (v) => `${Math.round(v * 100)}%`),
      sliderRow('Grosor del borde', a.ringWidth, 0, 3, 0.1, (v, live) => applyAp({ ringWidth: v }, live), (v) => v.toFixed(1)),
      toggleRow('Mostrar etiquetas', a.showLabels, (v) => applyAp({ showLabels: v })),
      toggleRow('Mostrar dorsales', a.showNumbers, (v) => applyAp({ showNumbers: v })),
      colorRow('Color de la ofensiva', a.offenseColor, (v) => applyAp({ offenseColor: v })),
      colorRow('Color de la defensa', a.defenseColor, (v) => applyAp({ defenseColor: v })),
      colorRow('Color del texto', a.labelColor, (v) => applyAp({ labelColor: v })),
    ]));

    out.push(sec('ap-routes', 'Rutas', [
      colorRow('Color de las rutas', a.routeColor, (v) => applyAp({ routeColor: v })),
      sliderRow('Grosor', a.routeWidth, 0.6, 2.2, 0.05, (v, live) => applyAp({ routeWidth: v }, live), (v) => `${v.toFixed(1)}×`),
      h('div', { class: 'row wide' }, h('label', { class: 'lbl', text: 'Estilo de línea' }),
        h('div', { class: 'seg-inline' }, ...Object.entries(ROUTE_STYLES).map(([id, st]) =>
          h('button', {
            class: `seg ${id === a.routeStyle ? 'is-active' : ''}`,
            type: 'button',
            text: st.label,
            onclick: () => applyAp({ routeStyle: id }),
          })
        ))
      ),
      toggleRow('Puntas de flecha', a.arrows, (v) => applyAp({ arrows: v })),
    ]));

    out.push(sec('ap-field', 'Campo', [
      toggleRow('Números de yarda', a.showYardNumbers, (v) => applyAp({ showYardNumbers: v })),
      toggleRow('Hachas', a.showHashes, (v) => applyAp({ showHashes: v })),
      toggleRow('Línea de scrimmage', a.showLOS, (v) => applyAp({ showLOS: v })),
      toggleRow('Zonas de defensa', a.showZones, (v) => applyAp({ showZones: v })),
      toggleRow('End zone', a.showEndzone, (v) => applyAp({ showEndzone: v })),
      colorRow('Color de la línea de scrimmage', a.losColor, (v) => applyAp({ losColor: v })),
    ]));

    out.push(sec('ap-ball', 'Balón', [
      colorRow('Color del balón', a.ballColor, (v) => applyAp({ ballColor: v })),
      toggleRow('Línea de lanzamiento', a.showThrowLine, (v) => store.setUI({ showThrowLine: v })),
    ]));

    out.push(sec('ap-actions', 'Acciones', [
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn sm',
          html: icon('users', { size: 13 }) + '<span>Color por rol</span>',
          title: 'Da a cada jugador el color de su rol (mariscal, receptor, corredor…)',
          onclick: () => store.actions.colorByRole(),
        }),
        h('button', {
          class: 'btn sm',
          html: icon('x', { size: 13 }) + '<span>Quitar colores</span>',
          onclick: () => store.actions.clearAllPlayerColors(),
        }),
        h('button', {
          class: 'btn sm',
          html: icon('undo', { size: 13 }) + '<span>Apariencia por defecto</span>',
          onclick: () => store.actions.resetAppearance(),
        }),
        selPlayers.length
          ? h('button', {
              class: 'btn sm',
              html: icon('users', { size: 13 }) + '<span>Estilo al equipo</span>',
              onclick: () => store.actions.applyStyleToTeam(selPlayers[0].id, selPlayers[0].team),
            })
          : null,
        selPlayers.length
          ? h('button', {
              class: 'btn sm',
              html: icon('x', { size: 13 }) + '<span>Quitar estilo propio</span>',
              onclick: () => store.actions.clearPlayerStyle(sel),
            })
          : null
      ),
      
    ]));

    return out;
  }

  /** Sección de estilo propio dentro de la pestaña del jugador. */
  function playerStyleSection(player) {
    const st = styleOf(player);
    const ids = store.state.selection.ids.includes(player.id) ? store.state.selection.ids : [player.id];
    return sec('player-style', 'Personalización del jugador', [
      colorRow('Color', st.color, (v) => applyStyle(ids, { color: v })),
      h('div', { class: 'row wide' }, h('label', { class: 'lbl', text: 'Forma propia' }),
        shapePicker(st.shape || '', (v) => applyStyle(ids, { shape: v === (st.shape || '') ? null : v }))
      ),
      colorRow('Color de su ruta', st.routeColor, (v) => applyStyle(ids, { routeColor: v })),
      sliderRow('Tamaño propio', st.size ?? 1, 0.6, 1.8, 0.05, (v) => applyStyle(ids, { size: v }), (v) => `${Math.round(v * 100)}%`),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn sm',
          html: icon('users', { size: 13 }) + '<span>Igual que todo el equipo</span>',
          onclick: () => store.actions.applyStyleToTeam(player.id, player.team),
        }),
        st.color || st.shape
          ? h('button', {
              class: 'btn sm',
              html: icon('x', { size: 13 }) + '<span>Quitar estilo</span>',
              onclick: () => store.actions.clearPlayerStyle(ids),
            })
          : null
      ),
      
    ]);
  }

  // ---------- render ----------
  function render() {
    const play = store.getPlay();
    if (play && play.id !== lastPlayId) {
      lastPlayId = play.id;
      // Las jugadas defensivas abren directamente la pestaña de defensa
      tab = play.type === 'defense' ? 'defense' : 'offense';
    }
    root.innerHTML = '';
    if (!play) {
      root.append(h('div', { class: 'empty-state' }, h('div', { class: 'es-title', text: 'Sin jugada' })));
      return;
    }
    const tabs = h('div', { class: 'insp-tabs', role: 'tablist' });
    const offCount = play.players.filter((p) => p.team === 'offense').length;
    const defCount = play.players.filter((p) => p.team === 'defense').length;
    for (const [id, label, count] of [
      ['offense', 'Ofensiva', offCount],
      ['defense', 'Defensa', defCount],
      ['play', 'Jugada', 0],
      ['style', 'Estilo', 0],
    ]) {
      const b = h('button', { class: `insp-tab ${tab === id ? 'is-active' : ''}`, role: 'tab', 'aria-selected': tab === id ? 'true' : 'false' });
      b.append(h('span', { text: label }));
      if (count) b.append(h('span', { class: 'tab-count', text: String(count) }));
      b.addEventListener('click', () => {
        tab = id;
        render();
      });
      tabs.append(b);
    }
    const scroll = h('div', { class: 'insp-scroll' });
    const content =
      tab === 'offense'
        ? offenseSection(play)
        : tab === 'defense'
        ? defenseSection(play)
        : tab === 'style'
        ? styleSection(play)
        : playSection(play);
    for (const node of content) scroll.append(node);
    root.append(tabs, scroll);
  }

  return { render, setTab: (t) => ((tab = t), render()) };
}
