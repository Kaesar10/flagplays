// Genera las páginas web de los textos legales y un JSON para el documento de
// Drive, a partir de src/legal-texts.js (única fuente de verdad).
// Uso: node tools/build-legal-docs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { LEGAL_DOCS, LEGAL_TITULAR, LEGAL_UPDATED, legalDocToText } from '../src/legal-texts.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const salida = path.join(ROOT, 'docs');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function bloqueHTML(block) {
  if (block.t === 'h') return `<h2>${esc(block.text)}</h2>`;
  if (block.t === 'p') return `<p>${esc(block.text)}</p>`;
  if (block.t === 'note') return `<div class="box"><strong>Resumen:</strong> ${esc(block.text.replace(/^Resumen:\s*/i, ''))}</div>`;
  if (block.t === 'ul') return `<ul>${block.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  return '';
}

function pagina(doc) {
  const nav = LEGAL_DOCS.filter((d) => d.id !== doc.id)
    .map((d) => `<a href="${d.id}.html">${esc(d.title)}</a>`)
    .join(' · ');
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(doc.title)} · FlagPlays</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; padding: 32px 20px 64px; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.65; background: #0b1116; color: #e8f4ec; }
      main { max-width: 760px; margin: 0 auto; }
      h1 { font-size: 1.85rem; margin: 0 0 4px; }
      .sub { color: #94a8a0; margin: 0 0 28px; font-size: 0.95rem; }
      h2 { font-size: 1.1rem; margin: 30px 0 8px; color: #9ae63f; }
      p, li { font-size: 1rem; }
      ul { padding-left: 22px; }
      code { background: #16212a; padding: 1px 6px; border-radius: 4px; font-size: 0.92em; }
      .box { margin: 22px 0; padding: 15px 18px; background: #101a21; border: 1px solid #22333c; border-left: 3px solid #9ae63f; border-radius: 10px; }
      a { color: #9ae63f; }
      .nav { margin-top: 44px; padding-top: 18px; border-top: 1px solid #22333c; font-size: 0.9rem; color: #7d8f88; }
    </style>
  </head>
  <body>
    <main>
      <h1>${esc(doc.title)}</h1>
      <p class="sub">FlagPlays · actualizado el ${esc(LEGAL_UPDATED)}</p>
      ${doc.blocks.map(bloqueHTML).join('\n      ')}
      <div class="nav">
        ${nav} · <a href="./">Inicio</a><br /><br />
        Contacto: <a href="mailto:${esc(LEGAL_TITULAR.email)}">${esc(LEGAL_TITULAR.email)}</a>
      </div>
    </main>
  </body>
</html>
`;
}

let escritos = 0;
for (const doc of LEGAL_DOCS) {
  const file = path.join(salida, `${doc.id}.html`);
  fs.writeFileSync(file, pagina(doc), 'utf8');
  escritos += 1;
}
// La política de privacidad se sirve también en la URL corta que ya usa Play.
fs.writeFileSync(path.join(salida, 'privacidad.html'), pagina(LEGAL_DOCS.find((d) => d.id === 'privacidad')), 'utf8');

// Índice de la sección legal
const indice = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Información legal · FlagPlays</title>
<style>body{margin:0;padding:32px 20px 64px;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.65;background:#0b1116;color:#e8f4ec}main{max-width:760px;margin:0 auto}h1{font-size:1.85rem;margin:0 0 22px}h2{font-size:1.05rem;margin:26px 0 6px;color:#9ae63f}p{color:#b9cdc4;margin:0 0 4px}a{color:#9ae63f}</style>
</head><body><main>
<h1>Información legal de FlagPlays</h1>
${LEGAL_DOCS.map((d) => `<h2><a href="${d.id}.html">${esc(d.title)}</a></h2><p>${esc(d.summary)}</p>`).join('\n')}
<p style="margin-top:32px">Contacto: <a href="mailto:${esc(LEGAL_TITULAR.email)}">${esc(LEGAL_TITULAR.email)}</a> · <a href="./">Inicio</a></p>
</main></body></html>
`;
fs.writeFileSync(path.join(salida, 'legal.html'), indice, 'utf8');

// JSON para el documento de Drive y para pruebas
const json = {
  app: LEGAL_TITULAR.app,
  titular: LEGAL_TITULAR,
  updated: LEGAL_UPDATED,
  docs: LEGAL_DOCS.map((d) => ({ id: d.id, title: d.title, summary: d.summary, text: legalDocToText(d) })),
};
fs.writeFileSync(path.join(salida, 'legal.json'), JSON.stringify(json, null, 2), 'utf8');

console.log(`Páginas generadas: ${escritos} documentos + índice (docs/)`);
console.log(`JSON: docs/legal.json (${LEGAL_DOCS.length} documentos)`);
