// Puente con la app Android (y utilidades para la versión web).
// Cuando FlagPlays se ejecuta dentro del WebView de la app, `window.AndroidBridge`
// expone guardar ficheros, imprimir y compartir. En el navegador todo esto
// funciona con las APIs habituales, así que el resto del código no cambia.
import { toast } from './ui.js';

/** @returns {any|null} */
export function bridge() {
  return typeof window !== 'undefined' ? window.AndroidBridge || null : null;
}

/** Puente de la app de escritorio de Windows (WebView2). */
export function winBridge() {
  if (typeof window === 'undefined') return null;
  const w = window.chrome && window.chrome.webview;
  return w && typeof w.postMessage === 'function' ? w : null;
}

export const isAndroidApp = () => !!bridge();
export const isWindowsApp = () => !!winBridge();
/** true si corre dentro de una app de escritorio o móvil (no en un navegador). */
export const isDesktopApp = () => isWindowsApp() || isAndroidApp();

/** Convierte un Blob a base64 (sin el prefijo data:). */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el fichero'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Guarda un fichero: en Android lo escribe en Descargas; en el navegador lo descarga.
 * @returns {Promise<boolean>}
 */
export async function saveBlob(blob, filename) {
  const win = winBridge();
  if (win) {
    try {
      const base64 = await blobToBase64(blob);
      win.postMessage({ type: 'saveFile', filename: String(filename), base64, mime: blob.type || '' });
      return true;
    } catch (err) {
      console.error('[native] windows saveFile', err);
      toast('No se pudo guardar el fichero', 'error');
      return false;
    }
  }
  const native = bridge();
  if (native && typeof native.saveFile === 'function') {
    try {
      const base64 = await blobToBase64(blob);
      native.saveFile(String(filename), base64, blob.type || 'application/octet-stream');
      return true;
    } catch (err) {
      console.error('[native] saveFile', err);
      toast('No se pudo guardar el fichero', 'error');
      return false;
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (err) {
    console.error('[native] descarga', err);
    return false;
  }
}

/** Guarda un texto como fichero. */
export function saveText(text, filename, mime = 'application/json') {
  return saveBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** Comparte un texto con el selector del sistema (o copia si no hay app). */
export function shareText(text, title = 'FlagPlays') {
  const win = winBridge();
  if (win) {
    win.postMessage({ type: 'copyText', text: String(text) });
    return true;
  }
  const native = bridge();
  if (native && typeof native.shareText === 'function') {
    native.shareText(String(text));
    return true;
  }
  if (navigator.share) {
    navigator.share({ title, text }).catch(() => {});
    return true;
  }
  return false;
}

/** Vibración corta (solo en la app). */
export function vibrate(ms = 12) {
  const native = bridge();
  if (native && typeof native.vibrate === 'function') native.vibrate(ms);
  return false;
}

/** Versión de la app Android, si existe. */
export function appVersion() {
  const native = bridge();
  try {
    return native && typeof native.getVersion === 'function' ? String(native.getVersion()) : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Integración con el entorno Android
// ---------------------------------------------------------------------------

const PRINT_FALLBACK_CSS = 'print.css';
const PRINT_UI_CSS = 'print-ui.css';

async function collectStyles() {
  const sheets = [];
  for (const name of [PRINT_FALLBACK_CSS, PRINT_UI_CSS]) {
    try {
      const res = await fetch(`./styles/${name}`, { cache: 'no-store' });
      if (res.ok) sheets.push(await res.text());
    } catch {
      /* si no se puede leer, seguimos sin esa hoja */
    }
  }
  return sheets.join('\n');
}

/**
 * Sustituye `window.print()` por la impresión nativa de Android, que sí ofrece
 * «Guardar como PDF». Se inyectan las hojas de impresión para que la hoja salga
 * exactamente igual que en el escritorio.
 */
export function installNativePrint() {
  const win = winBridge();
  if (win) {
    window.print = () => {
      win.postMessage({ type: 'print' });
      return true;
    };
    return true;
  }

  const native = bridge();
  if (!native || typeof native.printHtml !== 'function') return false;

  window.print = async () => {
    const root = document.getElementById('print-root');
    const sheet = root && root.innerHTML.trim() ? root.innerHTML : document.body.innerHTML;
    const css = await collectStyles();
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${css}</style>
      <style>html,body{background:#fff;margin:0;padding:0}#print-root{display:block !important}
      .pr-page{margin:0 auto;box-shadow:none}</style>
      </head><body><div id="print-root">${sheet}</div></body></html>`;
    native.printHtml(html);
    return true;
  };
  return true;
}

/**
 * Botón atrás de Android: cierra lo que haya abierto y, si no hay nada,
 * deja que la app se cierre (con confirmación).
 * @returns {boolean} true si la web ha consumido el evento
 */
export function installBackHandler({ store, actions }) {
  if (typeof window === 'undefined') return false;
  window.__androidBack = () => {
    try {
      const { hasOpenModal, closeTopModal, isMenuOpen, closeMenu } = actions;
      const sidebar = document.getElementById('sidebar');
      const inspector = document.getElementById('inspector');
      if (actions.isTreeOpen && actions.isTreeOpen()) {
        actions.closeTree();
        return true;
      }
      if (hasOpenModal && hasOpenModal()) {
        // Si es un diálogo bloqueante (términos), el botón atrás no lo cierra:
        // se consume para que la app no se cierre por detrás.
        closeTopModal();
        return true;
      }
      if (isMenuOpen && isMenuOpen()) {
        closeMenu();
        return true;
      }
      if (inspector && inspector.classList.contains('open')) {
        inspector.classList.remove('open');
        return true;
      }
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        return true;
      }
      if (actions.editor && actions.editor.getTool() === 'route') {
        actions.editor.finishDrawing();
        return true;
      }
      if (store && store.state.selection.ids.length) {
        store.selectPlayers([]);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[native] back', err);
      return false;
    }
  };
  return true;
}

/** Ajustes de viewport para la app (altura real y clases de plataforma). */
export function applyPlatformClasses() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isAndroidApp()) root.classList.add('is-android-app');
  if (isWindowsApp()) root.classList.add('is-windows-app');
  const setVh = () => {
    root.style.setProperty('--app-vh', `${window.innerHeight * 0.01}px`);
  };
  setVh();
  window.addEventListener('resize', setVh);
  window.addEventListener('orientationchange', () => setTimeout(setVh, 120));
}

/** Arranque del entorno nativo. Devuelve true si corre dentro de la app. */
export function initNative(options = {}) {
  applyPlatformClasses();

  // --- App de escritorio (Windows / WebView2) ---
  const win = winBridge();
  if (win) {
    installNativePrint();
    win.addEventListener('message', (ev) => {
      const msg = ev && ev.data ? ev.data : null;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'saved') {
        toast(msg.path ? `Guardado en ${msg.path}` : 'Fichero guardado', 'ok', 3200);
      } else if (msg.type === 'error') {
        toast(String(msg.message || 'No se pudo completar la acción'), 'error', 4000);
      } else if (msg.type === 'shortcut' && msg.action === 'new-play' && options.store) {
        options.store.actions.addPlay('offense');
      }
    });
    return true;
  }

  // --- App Android ---
  const inApp = isAndroidApp();
  if (inApp) {
    installNativePrint();
    installBackHandler(options);
  }
  return inApp;
}
