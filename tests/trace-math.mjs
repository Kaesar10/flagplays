// Pruebas de la matemática del calco (homografía, afín, orden de esquinas).
import assert from 'node:assert/strict';
import { homography, projectPoint, affineFromTriangle, orderCorners, quadArea, fitSize, solveLinear } from '../src/trace-math.js';

let ok = 0;
const prueba = (nombre, fn) => {
  fn();
  ok += 1;
  console.log('  ok', nombre);
};

const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const puntoCerca = (p, q, tol = 1e-6) => cerca(p.x, q.x, tol) && cerca(p.y, q.y, tol);

prueba('resolver un sistema sencillo', () => {
  const x = solveLinear(
    [
      [2, 0],
      [0, 4],
    ],
    [6, 8]
  );
  assert.ok(cerca(x[0], 3) && cerca(x[1], 2));
});

prueba('la homografía deja quietos los puntos de origen', () => {
  const src = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ];
  const dst = [
    { x: 10, y: 20 },
    { x: 210, y: 30 },
    { x: 200, y: 130 },
    { x: 20, y: 120 },
  ];
  const H = homography(src, dst);
  for (let i = 0; i < 4; i += 1) {
    assert.ok(puntoCerca(projectPoint(H, src[i]), dst[i], 1e-4), `punto ${i}`);
  }
});

prueba('la homografía proyecta el centro al centro (rectángulo → rectángulo)', () => {
  const src = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 0, y: 100 },
  ];
  const dst = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 200 },
    { x: 0, y: 200 },
  ];
  const H = homography(src, dst);
  assert.ok(puntoCerca(projectPoint(H, { x: 100, y: 50 }), { x: 200, y: 100 }, 1e-4));
});

prueba('cuatro puntos alineados no tienen homografía', () => {
  const linea = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ];
  assert.throws(() => homography(linea, linea));
});

prueba('la afín lleva los vértices del triángulo a su destino', () => {
  const s = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];
  const d = [
    { x: 5, y: 5 },
    { x: 25, y: 5 },
    { x: 5, y: 25 },
  ];
  const { a, b, c, d: e, e: f, f: g } = affineFromTriangle(s, d);
  const aplicar = (p) => ({ x: a * p.x + c * p.y + f, y: b * p.x + e * p.y + g });
  for (let i = 0; i < 3; i += 1) assert.ok(puntoCerca(aplicar(s[i]), d[i], 1e-6));
});

prueba('ordenar esquinas las deja TL, TR, BR, BL', () => {
  const desordenadas = [
    { x: 100, y: 100 }, // BR
    { x: 0, y: 100 }, // BL
    { x: 100, y: 0 }, // TR
    { x: 0, y: 0 }, // TL
  ];
  const [tl, tr, br, bl] = orderCorners(desordenadas);
  assert.deepEqual(tl, { x: 0, y: 0 });
  assert.deepEqual(tr, { x: 100, y: 0 });
  assert.deepEqual(br, { x: 100, y: 100 });
  assert.deepEqual(bl, { x: 0, y: 100 });
});

prueba('esquinas amontonadas no valen', () => {
  const mal = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 10, y: 10 },
  ];
  assert.equal(orderCorners(mal), null);
});

prueba('el área del cuadrilátero se calcula bien', () => {
  const cuadrado = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  assert.ok(cerca(quadArea(cuadrado), 100, 1e-9));
});

prueba('fitSize reduce sin deformar', () => {
  const r = fitSize(2000, 1000, 900);
  assert.equal(r.w, 900);
  assert.equal(r.h, 450);
  assert.equal(fitSize(400, 300, 900).escala, 1);
});

console.log(`\nCalco: ${ok} pruebas en verde.`);
