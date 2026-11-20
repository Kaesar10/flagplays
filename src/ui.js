// Utilidades de interfaz: DOM, toasts, modales, menús. Sin dependencias.
import { icon } from './icons.js';

/** Escapa texto para insertarlo en HTML. */
export function escapeHTML(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Crea un elemento HTML desde una cadena. */
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

/** Crea un elemento con atributos e hijos. */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function debounce(fn, ms = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function rafThrottle(fn) {
  let queued = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

let toastHost = null;
/** Aviso flotante. type: 'ok' | 'error' | 'info' */
export function toast(message, type = 'info', ms = 2600) {
  if (typeof document === 'undefined') return;
  if (!toastHost) {
    toastHost = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const icons = { ok: 'check', error: 'alert', info: 'info' };
  const node = h(
    'div',
    { class: `toast toast-${type}` },
    h('span', { class: 'toast-ic', html: icon(icons[type] || 'info', { size: 14 }) }),
    h('span', { text: message })
  );
  toastHost.append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 220);
  }, ms);
}

const openModals = [];

/** Modal genérico. Devuelve { root, close }. */
export function modal(opts = {}) {
  const { title = '', subtitle = '', body = null, actions = [], size = 'md', onClose = null, dismissable = true } = opts;
  const root = h('div', { class: 'modal-backdrop', role: 'presentation' });
  const box = h('div', {
    class: `modal modal-${size}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title || 'Diálogo',
  });
  const head = h(
    'header',
    { class: 'modal-head' },
    h('div', { class: 'modal-titles' }, h('h2', { class: 'modal-title', text: title }), subtitle && h('p', { class: 'modal-sub', text: subtitle })),
    dismissable &&
      h('button', { class: 'btn icon ghost modal-x', 'aria-label': 'Cerrar', html: icon('x', { size: 16 }), onclick: () => close() })
  );
  const bodyWrap = h('div', { class: 'modal-body' });
  if (body) bodyWrap.append(body.nodeType ? body : h('div', { html: body }));
  const footer = actions.length ? h('footer', { class: 'modal-foot' }) : null;
  for (const a of actions) {
    footer.append(
      h('button', {
        class: `btn ${a.variant || ''}`.trim(),
        text: a.label,
        onclick: () => a.onClick?.(close, box),
      })
    );
  }
  box.append(head, bodyWrap);
  if (footer) box.append(footer);
  root.append(box);

  function close() {
    root.classList.remove('in');
    removeFromStack();
    setTimeout(() => root.remove(), 160);
    onClose?.();
  }
  function removeFromStack() {
    const i = openModals.indexOf(entry);
    if (i >= 0) openModals.splice(i, 1);
  }
  // `locked` = no se puede cerrar por fuera (términos en el primer arranque).
  const entry = { close, root, locked: !dismissable };
  openModals.push(entry);

  if (dismissable) {
    root.addEventListener('mousedown', (e) => {
      if (e.target === root) close();
    });
  }
  document.body.append(root);
  requestAnimationFrame(() => {
    root.classList.add('in');
    const focusable = box.querySelector(
      'input:not([type=hidden]), textarea, select, button:not(.modal-x), [tabindex]:not([tabindex="-1"])'
    );
    (focusable || box).focus?.();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      close();
    }
    if (e.key === 'Tab') trapTab(e, box);
  });
  return { root, box, body: bodyWrap, close };
}

/** Confirma una acción. Devuelve Promise<boolean>. */
export function confirmDialog(opts = {}) {
  const { title = '¿Seguro?', message = '', confirmLabel = 'Confirmar', danger = true } = opts;
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      size: 'sm',
      body: h('p', { class: 'modal-text', text: message }),
      actions: [
        { label: 'Cancelar', onClick: (close) => close() },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: (close) => ((done = true), resolve(true), close()) },
      ],
      onClose: () => {
        if (!done) resolve(false);
      },
    });
    m.box.focus();
  });
}

/** Pide un texto. Devuelve Promise<string|null>. */
export function promptDialog(opts = {}) {
  const { title = 'Introduce un nombre', value = '', label = 'Nombre', confirmLabel = 'Guardar', placeholder = '' } = opts;
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { class: 'input', value, placeholder, 'aria-label': label, maxlength: 80 });
    const form = h('form', { class: 'stack-8' }, h('label', { class: 'lbl', text: label }), input);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      done = true;
      resolve(input.value.trim());
      m.close();
    });
    const m = modal({
      title,
      size: 'sm',
      body: form,
      actions: [
        { label: 'Cancelar', onClick: (close) => close() },
        {
          label: confirmLabel,
          variant: 'primary',
          onClick: () => {
            done = true;
            const v = input.value.trim();
            resolve(v);
            m.close();
          },
        },
      ],
      onClose: () => {
        if (!done) resolve(null);
      },
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 40);
  });
}

/** Menú contextual/popover anclado a un elemento. */
export function popupMenu(anchor, items, opts = {}) {
  closeMenu();
  const menu = h('div', { class: 'popmenu', role: 'menu' });
  for (const it of items) {
    if (it === '-' || it.sep) {
      menu.append(h('div', { class: 'popmenu-sep' }));
      continue;
    }
    const row = h('button', {
      class: `popmenu-item ${it.danger ? 'is-danger' : ''}`,
      role: 'menuitem',
      type: 'button',
    });
    if (it.icon) row.insertAdjacentHTML('beforeend', icon(it.icon, { size: 14 }));
    row.append(h('span', { class: 'popmenu-label', text: it.label }));
    if (it.hint) row.append(h('span', { class: 'popmenu-hint', text: it.hint }));
    if (it.checked) row.insertAdjacentHTML('beforeend', icon('check', { size: 14 }));
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      it.onClick?.();
    });
    menu.append(row);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 6;
  if (left + mr.width > innerWidth - 8) left = innerWidth - mr.width - 8;
  if (top + mr.height > innerHeight - 8) top = r.top - mr.height - 6;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  requestAnimationFrame(() => menu.classList.add('in'));
  const onDoc = (e) => {
    if (!menu.contains(e.target)) closeMenu();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') closeMenu();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
  }, 0);
  menu._cleanup = () => {
    document.removeEventListener('mousedown', onDoc);
    document.removeEventListener('keydown', onKey);
  };
  currentMenu = menu;
  return menu;
}

let currentMenu = null;
export function closeMenu() {
  if (!currentMenu) return;
  currentMenu._cleanup?.();
  currentMenu.remove();
  currentMenu = null;
}
export function isMenuOpen() {
  return !!currentMenu;
}

function trapTab(e, container) {
  const nodes = Array.from(
    container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter((n) => n.offsetParent !== null || n === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Cierra el modal superior si lo hay. Devuelve true si cerró algo.
 *  Los modales bloqueantes (términos del primer arranque) no se cierran así. */
export function closeTopModal() {
  const top = openModals[openModals.length - 1];
  if (!top) return false;
  if (top.locked) return false;
  top.close();
  return true;
}

/** ¿El modal superior es de los que no se pueden cerrar sin aceptar? */
export function hasLockedModal() {
  const top = openModals[openModals.length - 1];
  return !!top && !!top.locked;
}
export function hasOpenModal() {
  return openModals.length > 0;
}

/** Copia texto al portapapeles con fallback. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function fmtTime(t, decimals = 1) {
  return `${Number(t).toFixed(decimals)}s`;
}

export function fmtDate(ts) {
  try {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(new Date(ts));
  } catch {
    return '';
  }
}

/** Descarga un Blob (en la app Android lo guarda en Descargas). */
export function downloadBlob(blob, filename) {
  // Puente nativo instalado por native.js cuando corre dentro de la app.
  const nativeSave = typeof window !== 'undefined' ? window.__flagplaysSave : null;
  if (typeof nativeSave === 'function') return nativeSave(blob, filename);
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Rango de valores con label. */
export function slider(opts) {
  const { min = 0, max = 100, step = 1, value = 0, onInput, label = '', suffix = '' } = opts;
  const out = h('span', { class: 'slider-val mono', text: `${value}${suffix}` });
  const input = h('input', { type: 'range', class: 'range', min, max, step, value, 'aria-label': label });
  input.addEventListener('input', () => {
    out.textContent = `${input.value}${suffix}`;
    onInput?.(Number(input.value));
  });
  return h('div', { class: 'slider-row' }, label && h('label', { class: 'lbl', text: label }), input, out);
}
