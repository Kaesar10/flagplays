// Sección «Información legal» de la app: privacidad, términos, aviso legal,
// licencia y declaración de datos. Los textos viven en legal-texts.js.
import { h, modal, escapeHTML, toast } from './ui.js';
import { icon } from './icons.js';
import { LEGAL_DOCS, LEGAL_TITULAR, LEGAL_UPDATED, legalDocToText } from './legal-texts.js';

function bloquesHTML(doc) {
  return doc.blocks
    .map((block) => {
      if (block.t === 'h') return `<h4 class="legal-h">${escapeHTML(block.text)}</h4>`;
      if (block.t === 'p') return `<p class="terms-p">${escapeHTML(block.text)}</p>`;
      if (block.t === 'note') return `<p class="terms-p legal-note">${escapeHTML(block.text)}</p>`;
      if (block.t === 'ul') {
        const items = block.items.map((item) => `<li>${escapeHTML(item)}</li>`).join('');
        return `<ul class="legal-ul">${items}</ul>`;
      }
      return '';
    })
    .join('');
}

/**
 * Abre el diálogo de información legal.
 * @param {{docId?:string}} opts  documento inicial (por defecto, privacidad)
 */
export function openLegalDialog(opts = {}) {
  let activo = LEGAL_DOCS.some((d) => d.id === opts.docId) ? opts.docId : LEGAL_DOCS[0].id;

  const tabs = h('div', { class: 'legal-tabs', role: 'tablist', 'aria-label': 'Documentos legales' });
  const body = h('div', { class: 'terms-body legal-body', tabindex: '0', 'aria-label': 'Texto legal' });

  const botones = new Map();
  for (const doc of LEGAL_DOCS) {
    const btn = h('button', {
      class: 'legal-tab',
      type: 'button',
      role: 'tab',
      'aria-selected': 'false',
      html:
        `<span class="legal-tab-t">${escapeHTML(doc.title)}</span>` +
        `<span class="legal-tab-s">${escapeHTML(doc.summary)}</span>`,
      onclick: () => pintar(doc.id),
    });
    botones.set(doc.id, btn);
    tabs.append(btn);
  }

  function pintar(id) {
    activo = id;
    for (const [key, btn] of botones) {
      btn.setAttribute('aria-selected', String(key === id));
      btn.classList.toggle('is-active', key === id);
    }
    const doc = LEGAL_DOCS.find((d) => d.id === id);
    if (!doc) return;
    body.innerHTML =
      `<h3 class="legal-title">${escapeHTML(doc.title)}</h3>` +
      `<p class="legal-when">Actualizado el ${escapeHTML(doc.updated)}</p>` +
      bloquesHTML(doc);
    body.scrollTop = 0;
  }

  const wrap = h('div', { class: 'legal' }, tabs, body);

  const dialog = modal({
    title: 'Información legal',
    subtitle: `Textos de ${LEGAL_TITULAR.app} · contacto ${LEGAL_TITULAR.email}`,
    size: 'lg',
    body: wrap,
    actions: [
      {
        label: 'Copiar este texto',
        onClick: () => {
          const doc = LEGAL_DOCS.find((d) => d.id === activo);
          const texto = legalDocToText(doc);
          if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(texto).then(
              () => toast('Texto copiado al portapapeles', 'ok', 1600),
              () => toast('No se pudo copiar', 'error', 2200)
            );
          } else {
            toast('El portapapeles no está disponible', 'error', 2200);
          }
        },
      },
      { label: 'Cerrar', onClick: (close) => close() },
    ],
  });

  pintar(activo);
  setTimeout(() => body.focus?.(), 80);
  return dialog;
}

/** Texto plano de todos los documentos (para exportar o imprimir). */
export function todosLosTextos() {
  return LEGAL_DOCS.map((doc) => legalDocToText(doc)).join('\n\n' + '='.repeat(70) + '\n\n');
}

export const LEGAL_INFO = { LEGAL_DOCS, LEGAL_TITULAR, LEGAL_UPDATED };
