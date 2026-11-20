// Tests de los textos legales: estructura, contenido obligatorio y generación.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LEGAL_DOCS, LEGAL_TITULAR, LEGAL_UPDATED, getLegalDoc, legalDocToText } from '../src/legal-texts.js';

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

const root = path.resolve(import.meta.dirname, '..');

// ---------- estructura ----------
ok(LEGAL_DOCS.length === 5, 'hay cinco documentos legales');
ok(
  LEGAL_DOCS.map((d) => d.id).join(',') === 'privacidad,terminos,aviso-legal,licencia,datos-play',
  'los identificadores son los esperados'
);
ok(LEGAL_TITULAR.email.includes('@'), 'el titular tiene un correo de contacto válido');
ok(LEGAL_UPDATED.length > 5, 'los documentos llevan fecha de actualización');

for (const doc of LEGAL_DOCS) {
  ok(!!doc.title && doc.title.length > 5, `${doc.id}: título`);
  ok(!!doc.summary && doc.summary.length > 10, `${doc.id}: resumen`);
  ok(Array.isArray(doc.blocks) && doc.blocks.length >= 4, `${doc.id}: al menos cuatro bloques`);
  ok(
    doc.blocks.every((b) => ['h', 'p', 'ul', 'note'].includes(b.t)),
    `${doc.id}: tipos de bloque válidos`
  );
  ok(
    doc.blocks.every((b) => (b.t === 'ul' ? Array.isArray(b.items) && b.items.length > 0 : typeof b.text === 'string' && b.text.length > 0)),
    `${doc.id}: bloques con contenido`
  );
  const texto = legalDocToText(doc);
  ok(texto.length > 400, `${doc.id}: el texto tiene entidad (${texto.length} caracteres)`);
  ok(!/undefined|NaN/.test(texto), `${doc.id}: el texto no tiene huecos`);
}

// ---------- contenido obligatorio ----------
const privacidad = getLegalDoc('privacidad');
const textoPriv = legalDocToText(privacidad).toLowerCase();
ok(textoPriv.includes('no recoge') || textoPriv.includes('ninguno'), 'la privacidad dice que no se recogen datos');
ok(textoPriv.includes(LEGAL_TITULAR.email.toLowerCase()), 'la privacidad da un correo de contacto');
ok(textoPriv.includes('rgpd'), 'la privacidad menciona el RGPD');

const terminos = legalDocToText(getLegalDoc('terminos')).toLowerCase();
ok(terminos.includes('federación andaluza'), 'los términos recogen la condición de la federación');
ok(terminos.includes('código libre'), 'los términos recogen el código libre');

const aviso = legalDocToText(getLegalDoc('aviso-legal')).toLowerCase();
ok(aviso.includes('lssi'), 'el aviso legal cita la LSSI');

// ---------- páginas publicadas ----------
for (const doc of LEGAL_DOCS) {
  const file = path.join(root, 'docs', `${doc.id}.html`);
  ok(fs.existsSync(file), `página publicada: docs/${doc.id}.html`);
  const html = fs.readFileSync(file, 'utf8');
  ok(html.includes(doc.title), `${doc.id}.html contiene el título`);
  ok(html.includes('<!doctype html>'), `${doc.id}.html es un documento HTML`);
}
ok(fs.existsSync(path.join(root, 'docs', 'legal.html')), 'hay índice legal publicado');
ok(fs.existsSync(path.join(root, 'docs', 'privacidad.html')), 'la política de privacidad tiene URL propia');

// ---------- JSON para el documento de Drive ----------
const jsonFile = path.join(root, 'docs', 'legal.json');
ok(fs.existsSync(jsonFile), 'existe docs/legal.json');
const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
ok(data.docs.length === LEGAL_DOCS.length, 'el JSON trae todos los documentos');
ok(data.titular.email === LEGAL_TITULAR.email, 'el JSON lleva los datos del titular');
ok(data.docs.every((d) => d.text && d.text.length > 400), 'cada documento del JSON tiene su texto');

console.log(`OK: ${n} comprobaciones de los textos legales (tests/legal.mjs).`);
