// Pruebas del detector de fichas (sin IA, por contraste y forma).
import assert from 'node:assert/strict';
import { detectarFichas, puntosAYardas } from '../src/trace-detect.js';

let ok = 0;
const prueba = (nombre, fn) => {
  fn();
  ok += 1;
  console.log('  ok', nombre);
};

const ANCHO = 200;
const ALTO = 160;

/** Lienzo sintético verde con círculos dibujados. */
function lienzo(circulos = []) {
  const data = new Uint8ClampedArray(ANCHO * ALTO * 4);
  for (let i = 0; i < ANCHO * ALTO; i += 1) {
    data[i * 4] = 34;
    data[i * 4 + 1] = 102;
    data[i * 4 + 2] = 54;
    data[i * 4 + 3] = 255;
  }
  for (const c of circulos) {
    for (let y = Math.floor(c.y - c.r); y <= c.y + c.r; y += 1) {
      for (let x = Math.floor(c.x - c.r); x <= c.x + c.r; x += 1) {
        if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) continue;
        if (Math.hypot(x - c.x, y - c.y) > c.r) continue;
        const i = (y * ANCHO + x) * 4;
        data[i] = c.color?.[0] ?? 250;
        data[i + 1] = c.color?.[1] ?? 250;
        data[i + 2] = c.color?.[2] ?? 250;
        data[i + 3] = 255;
      }
    }
  }
  return { data, ancho: ANCHO, alto: ALTO };
}

prueba('detecta un círculo blanco sobre césped', () => {
  const img = lienzo([{ x: 60, y: 50, r: 9 }]);
  const fichas = detectarFichas(img);
  assert.equal(fichas.length, 1);
  assert.ok(Math.abs(fichas[0].x - 60) <= 4, `x=${fichas[0].x}`);
  assert.ok(Math.abs(fichas[0].y - 50) <= 4, `y=${fichas[0].y}`);
});

prueba('detecta cinco fichas separadas', () => {
  const img = lienzo([
    { x: 30, y: 30, r: 8 },
    { x: 80, y: 30, r: 8, color: [20, 20, 20] },
    { x: 130, y: 40, r: 9, color: [255, 120, 80] },
    { x: 60, y: 100, r: 8 },
    { x: 150, y: 110, r: 8, color: [240, 220, 60] },
  ]);
  const fichas = detectarFichas(img);
  assert.equal(fichas.length, 5, `detectadas ${fichas.length}`);
});

prueba('no inventa fichas en un campo vacío', () => {
  const img = lienzo([]);
  assert.equal(detectarFichas(img).length, 0);
});

prueba('ignora una línea larga (una ruta no es una ficha)', () => {
  const img = lienzo([]);
  const { data } = img;
  for (let x = 20; x < 180; x += 1) {
    const y = 80;
    const i = (y * ANCHO + x) * 4;
    data[i] = 250;
    data[i + 1] = 250;
    data[i + 2] = 250;
  }
  assert.equal(detectarFichas(img).length, 0);
});

prueba('las fichas salen ordenadas de arriba abajo', () => {
  const img = lienzo([
    { x: 100, y: 120, r: 8 },
    { x: 100, y: 40, r: 8 },
  ]);
  const fichas = detectarFichas(img);
  assert.equal(fichas.length, 2);
  assert.ok(fichas[0].y < fichas[1].y);
});

prueba('las coordenadas se pasan a yardas con el rectángulo del campo', () => {
  const rect = { x: 100, y: 50, w: 1000, h: 800 };
  const aYardas = (px) => ({ x: (px.x - 100) / 100, y: (px.y - 50) / 100 });
  const yardas = puntosAYardas(
    [
      { x: 0, y: 0 },
      { x: 1000, y: 800 },
    ],
    { ancho: 1000, alto: 800 },
    rect,
    aYardas
  );
  assert.ok(Math.abs(yardas[0].x) < 1e-9 && Math.abs(yardas[0].y) < 1e-9);
  assert.equal(yardas[1].x, 10);
  assert.equal(yardas[1].y, 8);
});

console.log(`\nDetección de fichas: ${ok} pruebas en verde.`);
