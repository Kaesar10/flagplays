// Matemática del calco: llevar las 4 esquinas del campo de una foto a un
// rectángulo. Sin dependencias y sin DOM, para poder probarla en Node.

/** Resuelve A·x = b por eliminación gaussiana con pivoteo parcial. */
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivote = col;
    for (let f = col + 1; f < n; f += 1) {
      if (Math.abs(M[f][col]) > Math.abs(M[pivote][col])) pivote = f;
    }
    if (Math.abs(M[pivote][col]) < 1e-12) throw new Error('Sistema degenerado');
    [M[col], M[pivote]] = [M[pivote], M[col]];
    const p = M[col][col];
    for (let j = col; j <= n; j += 1) M[col][j] /= p;
    for (let f = 0; f < n; f += 1) {
      if (f === col) continue;
      const factor = M[f][col];
      if (!factor) continue;
      for (let j = col; j <= n; j += 1) M[f][j] -= factor * M[col][j];
    }
  }
  return M.map((fila) => fila[n]);
}

/**
 * Homografía que lleva `src` (4 puntos) a `dst` (4 puntos).
 * Devuelve la matriz 3x3 en fila (h33 = 1) lista para `projectPoint`.
 */
export function homography(src, dst) {
  if (src.length !== 4 || dst.length !== 4) throw new Error('Hacen falta 4 puntos');
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/** Aplica una homografía a un punto. */
export function projectPoint(H, p) {
  const d = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / d, y: (H[3] * p.x + H[4] * p.y + H[5]) / d };
}

/**
 * Transformación afín que lleva el triángulo `s` al triángulo `d`.
 * Canvas solo sabe hacer afines, así que el calco se pinta en dos triángulos.
 * Devuelve { a, b, c, d, e, f } con la convención de canvas (setTransform).
 */
export function affineFromTriangle(s, d) {
  const [s0, s1, s2] = s;
  const [d0, d1, d2] = d;
  const det = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(det) < 1e-9) throw new Error('Triángulo degenerado');
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / det;
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / det;
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / det;
  const e = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / det;
  const f = d0.x - a * s0.x - c * s0.y;
  const g = d0.y - b * s0.x - e * s0.y;
  return { a, b, c, d: e, e: f, f: g };
}

/**
 * Ordena 4 puntos como arriba-izquierda, arriba-derecha, abajo-derecha,
 * abajo-izquierda (por suma y diferencia de coordenadas).
 */
export function orderCorners(puntos) {
  if (!Array.isArray(puntos) || puntos.length !== 4) return null;
  const suma = puntos.map((p) => p.x + p.y);
  const dif = puntos.map((p) => p.y - p.x);
  const iTL = suma.indexOf(Math.min(...suma));
  const iBR = suma.indexOf(Math.max(...suma));
  const iTR = dif.indexOf(Math.min(...dif));
  const iBL = dif.indexOf(Math.max(...dif));
  const unicos = new Set([iTL, iTR, iBR, iBL]);
  if (unicos.size !== 4) return null; // puntos amontonados
  return [puntos[iTL], puntos[iTR], puntos[iBR], puntos[iBL]];
}

/** ¿El cuadrilátero tiene área suficiente para calcar? */
export function quadArea(puntos) {
  let a = 0;
  for (let i = 0; i < puntos.length; i += 1) {
    const p = puntos[i];
    const q = puntos[(i + 1) % puntos.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Reduce un tamaño para que quepa en `max` sin deformar. */
export function fitSize(w, h, max) {
  const lado = Math.max(w, h);
  if (lado <= max) return { w, h, escala: 1 };
  const escala = max / lado;
  return { w: Math.round(w * escala), h: Math.round(h * escala), escala };
}
