// Términos y condiciones de FlagPlays.
// Se muestran obligatoriamente la primera vez que se abre la app (en cualquier
// plataforma: navegador, Windows y Android) y después solo desde el menú.
import { h, modal, escapeHTML, toast } from './ui.js';
import { icon } from './icons.js';

/** Si cambias los términos, sube este número: volverá a pedir la aceptación. */
export const TERMS_VERSION = 1;

const STORAGE_KEY = 'flagplays.terms.v1';

/** Texto de los términos, tal y como lo redactó el autor. */
export const TERMS_PARAGRAPHS = [
  'Esta app ha sido desarrollada por César E. Frías Ramos con la ayuda de la IA.',
  'César es conocido por jugar en tackle en Sevilla Linces durante los años 2005-2008 y estos últimos años por entrenar y jugar en Huelva Sailors y Aljarafe Harriers. Es conocido en redes como Kaesar (@kaesar10).',
  'Esta app es de caracter gratuito para los equipos de flag inscritos en la federación andaluza de futbol americano. Se les concede derecho de uso y distribución.',
  'Queda prohibido el uso a cualquier equipo que no pertenezca a dicha federación andaluza.',
  'Esta app es de codigo libre. Si te interesa modificarla, puedes solicitar el repositorio a su creador. Además, tiene app de móvil. Si te interesa tenerla, hay que solicitarla en el siguiente correo: kaesar10@gmail.com',
  'Esta app está en versión beta, si ves cualquier fallo, algo que falte o funcionalidad que te gustaría que tuviera, no dudes en decírselo a su creador.',
  'Esta app se instala en local, no se sube nada a ninguna base de datos ni servidor, así que puedes estar seguro que nadie va a ver tus jugadas.',
  'Por último, para usarla, deberás aceptar estas condiciones:',
];

/** Condición que hay que marcar para aceptar. */
export const TERMS_ACCEPTANCE =
  'Aljarafe Harriers es el mejor equipo que ha tenido Andalucía. Y espero que vuelvan más pronto que tarde. Lo reconozco y acepto.';

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

/** ¿El usuario ya aceptó estos términos (esta versión)? */
export function isAccepted() {
  const data = readState();
  return !!data && data.accepted === true && Number(data.version) >= TERMS_VERSION;
}

/** Fecha legible de la aceptación, si la hay. */
export function acceptedAt() {
  const data = readState();
  if (!data || !data.accepted) return '';
  try {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }).format(
      new Date(data.date)
    );
  } catch {
    return '';
  }
}

function persistAcceptance() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accepted: true, version: TERMS_VERSION, date: new Date().toISOString() })
    );
    return true;
  } catch (err) {
    console.warn('[terms] no se pudo guardar la aceptación', err);
    return false;
  }
}

/** Cuerpo con el texto. `withCheck` añade la casilla obligatoria. */
function buildBody({ withCheck, onCheckChange }) {
  const wrap = h('div', { class: 'terms' });
  const body = h('div', { class: 'terms-body', tabindex: '0', 'aria-label': 'Texto de los términos y condiciones' });

  for (const paragraph of TERMS_PARAGRAPHS) {
    const p = h('p', { class: 'terms-p' });
    p.innerHTML = escapeHTML(paragraph)
      .replace(/(kaesar10@gmail\.com)/g, '<b class="terms-mail">$1</b>')
      .replace(/(@kaesar10)/g, '<b class="terms-handle">$1</b>');
    body.append(p);
  }
  if (!withCheck) {
    const when = acceptedAt();
    if (when) body.append(h('p', { class: 'terms-when', text: `Aceptado el ${when}.` }));
  }
  wrap.append(body);

  if (!withCheck) return { wrap, input: null };

  const id = 'terms-accept-check';
  const input = h('input', { type: 'checkbox', id, class: 'terms-input' });
  const label = h(
    'label',
    { class: 'terms-accept', for: id },
    input,
    h('span', { class: 'terms-checkmark', 'aria-hidden': 'true', html: icon('check', { size: 13 }) }),
    h('span', { class: 'terms-accept-text', text: TERMS_ACCEPTANCE })
  );
  input.addEventListener('change', () => onCheckChange?.(input.checked));
  wrap.append(h('div', { class: 'terms-sep' }), label);
  // Enlace a los textos legales completos (no forma parte del texto aceptado).
  wrap.append(
    h(
      'p',
      { class: 'terms-legal' },
      'Al aceptar también puedes consultar la ',
      h('a', {
        href: '#',
        class: 'terms-link',
        'data-legal-doc': 'privacidad',
        text: 'política de privacidad',
      }),
      ', el ',
      h('a', { href: '#', class: 'terms-link', 'data-legal-doc': 'aviso-legal', text: 'aviso legal' }),
      ' y la ',
      h('a', { href: '#', class: 'terms-link', 'data-legal-doc': 'licencia', text: 'licencia de uso' }),
      '.'
    )
  );
  return { wrap, input };
}

/**
 * Abre el diálogo de términos.
 * @param {{mode?:'first-run'|'view'}} opts
 */
export function openTermsDialog(opts = {}) {
  const firstRun = opts.mode !== 'view';
  return new Promise((resolve) => {
    let accepted = false;
    let dialog = null;
    let acceptBtn = null;

    const actions = [];

    if (!firstRun) {
      actions.push({
        label: 'Cerrar',
        onClick: (close) => {
          close();
          resolve(false);
        },
      });
    }

    const { wrap, input } = buildBody({
      withCheck: firstRun,
      onCheckChange: (checked) => {
        if (acceptBtn) acceptBtn.disabled = !checked;
      },
    });

    if (firstRun) {
      acceptBtn = h('button', {
        class: 'btn primary',
        text: 'Aceptar y continuar',
        disabled: true,
        onclick: () => {
          if (!input || !input.checked) {
            toast('Marca la casilla para poder continuar', 'error', 2400);
            return;
          }
          accepted = persistAcceptance();
          if (!accepted) {
            toast('No se ha podido guardar la aceptación', 'error', 3200);
            return;
          }
          dialog.close();
          resolve(true);
        },
      });
      actions.push({
        label: 'Aceptar y continuar',
        variant: 'primary',
        onClick: () => acceptBtn.click(),
      });
    }

    dialog = modal({
      title: 'Términos y condiciones',
      subtitle: firstRun
        ? 'Antes de empezar, lee y acepta estas condiciones.'
        : 'Condiciones de uso de FlagPlays.',
      size: 'lg',
      body: wrap,
      dismissable: !firstRun && opts.closable !== false,
      actions,
      onClose: () => {
        if (!firstRun) resolve(false);
        else resolve(accepted);
      },
    });

    // El botón real del pie: se sustituye el generado por el de las acciones para
    // poder deshabilitarlo hasta que se marque la casilla.
    if (firstRun) {
      const foot = dialog.box.querySelector('.modal-foot');
      const generic = foot && foot.lastElementChild;
      if (generic) {
        generic.replaceWith(acceptBtn);
      } else if (foot) {
        foot.append(acceptBtn);
      }
    }

    setTimeout(() => {
      const scroller = wrap.querySelector('.terms-body');
      if (scroller) scroller.scrollTop = 0;
      (input || acceptBtn || scroller)?.focus?.();
    }, 60);
  });
}

/**
 * Garantiza que los términos están aceptados. Si no lo están, muestra el diálogo
 * bloqueante. Devuelve true cuando ya están aceptados.
 */
export function ensureTermsAccepted() {
  if (isAccepted()) return Promise.resolve(true);
  return openTermsDialog({ mode: 'first-run' });
}

/** Abre los términos en modo consulta (desde el menú). */
export function viewTerms() {
  return openTermsDialog({ mode: 'view' });
}
