// Detección de fichas (jugadores) en una imagen, sin IA: se busca lo que
// contrasta con el fondo (el césped) y tiene forma de círculo.
//
// Trabaja sobre los píxeles ya deformados al campo, así que las coordenadas
// detectadas se pueden pasar directamente a yardas.

/** Color más repetido (cuantizado) = fondo de la imagen. */
function colorDominante(data, ancho, alto) {
  const cuenta = new Map();
  for (let y = 0; y < alto; y += 2) {
    for (let x = 0; x < ancho; x += 2) {
      const i = (y * ancho + x) * 4;
      const clave = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
    }
  }
  let mejor = 0;
  let mejorClave = 0;
  for (const [clave, n] of cuenta) {
    if (n > mejor) {
      mejor = n;
      mejorClave = clave;
    }
  }
  return { r: ((mejorClave >> 8) & 15) * 16 + 8, g: ((mejorClave >> 4) & 15) * 16 + 8, b: (mejorClave & 15) * 16 + 8 };
}

/** Distancia de cada píxel de la máscara al fondo más cercano (chamfer 3-4). */
function mapaDistancias(mascara, w, h) {
  const INF = 1e6;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) d[i] = mascara[i] ? INF : 0;
  const A = 3;
  const B = 4;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!mascara[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + A);
      if (y > 0) v = Math.min(v, d[i - w] + A);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + B);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + B);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      if (!mascara[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + A);
      if (y < h - 1) v = Math.min(v, d[i + w] + A);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + B);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + B);
      d[i] = v;
    }
  }
  for (let i = 0; i < w * h; i += 1) d[i] = d[i] / 3; // vuelve a píxeles
  return d;
}

/**
 * Detecta fichas circulares.
 * Usa el grosor (mapa de distancias): una ficha es "gorda", una ruta es fina,
 * así no se confunden aunque la ruta salga del propio jugador.
 */
export function detectarFichas(imagen, opts = {}) {
  const { data, ancho, alto } = imagen;
  if (!data || !ancho || !alto) return [];
  const umbral = opts.umbral ?? 70;
  const { mascara, w, h, paso } = mascaraDeFondo(data, ancho, alto, umbral);
  const dist = mapaDistancias(mascara, w, h);
  // grosor mínimo para considerar "ficha" (en píxeles de la rejilla)
  const grosorMin = Math.max(3.2, Math.min(w, h) * 0.018);

  const nucleo = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) nucleo[i] = dist[i] >= grosorMin ? 1 : 0;

  const visto = new Uint8Array(w * h);
  const fichas = [];
  for (let y0 = 0; y0 < h; y0 += 1) {
    for (let x0 = 0; x0 < w; x0 += 1) {
      const idx0 = y0 * w + x0;
      if (!nucleo[idx0] || visto[idx0]) continue;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let grosor = 0;
      const pila = [idx0];
      visto[idx0] = 1;
      while (pila.length) {
        const idx = pila.pop();
        const x = idx % w;
        const y = (idx / w) | 0;
        n += 1;
        sx += x;
        sy += y;
        if (dist[idx] > grosor) grosor = dist[idx];
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const v = ny * w + nx;
            if (nucleo[v] && !visto[v]) {
              visto[v] = 1;
              pila.push(v);
            }
          }
        }
      }
      if (n < 2) continue;
      const cx = sx / n;
      const cy = sy / n;
      const radio = (grosor + grosorMin) * paso;
      if (radio < 4 || radio > 60) continue;
      fichas.push({ x: cx * paso, y: cy * paso, r: radio });
    }
  }
  // quita duplicados muy juntos
  const limpias = [];
  for (const f of fichas) {
    if (limpias.some((o) => Math.hypot(o.x - f.x, o.y - f.y) < Math.max(o.r, f.r) * 1.2)) continue;
    limpias.push(f);
  }
  return limpias.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Pasa centros detectados (en píxeles de la imagen) a yardas del campo.
 * La imagen ocupa exactamente el rectángulo del campo que pinta el renderer.
 * @param {{x:number,y:number}[]} puntos
 * @param {{ancho:number, alto:number}} imagen
 * @param {{x:number,y:number,w:number,h:number}} rect rect del campo en px del SVG
 * @param {(px:{x:number,y:number})=>{x:number,y:number}} pxToField
 */
export function puntosAYardas(puntos, imagen, rect, pxToField) {
  return puntos.map((p) => {
    const svgX = rect.x + (p.x / imagen.ancho) * rect.w;
    const svgY = rect.y + (p.y / imagen.alto) * rect.h;
    return pxToField({ x: svgX, y: svgY });
  });
}

/** Rejilla de trabajo común: máscara de lo que no es césped. */
function mascaraDeFondo(data, ancho, alto, umbral) {
  const paso = Math.max(1, Math.round(Math.max(ancho, alto) / 260));
  const w = Math.floor(ancho / paso);
  const h = Math.floor(alto / paso);
  const fondo = colorDominante(data, ancho, alto);
  const mascara = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y * paso) * ancho + x * paso) * 4;
      const dr = data[i] - fondo.r;
      const dg = data[i + 1] - fondo.g;
      const db = data[i + 2] - fondo.b;
      if (Math.sqrt(dr * dr + dg * dg + db * db) > umbral) mascara[y * w + x] = 1;
    }
  }
  return { mascara, w, h, paso };
}

/** Simplifica una polilínea (Douglas–Peucker). */
export function simplificar(puntos, epsilon = 2) {
  if (puntos.length < 3) return puntos.slice();
  const [primero, ultimo] = [puntos[0], puntos[puntos.length - 1]];
  let maxDist = 0;
  let indice = 0;
  for (let i = 1; i < puntos.length - 1; i += 1) {
    const p = puntos[i];
    const dx = ultimo.x - primero.x;
    const dy = ultimo.y - primero.y;
    const norma = Math.hypot(dx, dy) || 1;
    const dist = Math.abs(dy * (p.x - primero.x) - dx * (p.y - primero.y)) / norma;
    if (dist > maxDist) {
      maxDist = dist;
      indice = i;
    }
  }
  if (maxDist <= epsilon) return [primero, ultimo];
  const izq = simplificar(puntos.slice(0, indice + 1), epsilon);
  const der = simplificar(puntos.slice(indice), epsilon);
  return [...izq.slice(0, -1), ...der];
}

/** Recorre una componente y devuelve la polilínea más larga (extremos + camino). */
function trazarComponente(pixeles, w, h) {
  const set = new Set(pixeles);
  const bfs = (inicio) => {
    const dist = new Map([[inicio, 0]]);
    const padre = new Map();
    const cola = [inicio];
    let lejos = inicio;
    while (cola.length) {
      const actual = cola.shift();
      const d = dist.get(actual);
      if (d > dist.get(lejos)) lejos = actual;
      const x = actual % w;
      const y = (actual / w) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const v = ny * w + nx;
          if (!set.has(v) || dist.has(v)) continue;
          dist.set(v, d + 1);
          padre.set(v, actual);
          cola.push(v);
        }
      }
    }
    return { lejos, padre, dist };
  };
  const primero = bfs(pixeles[0]);
  const segundo = bfs(primero.lejos);
  const camino = [];
  let actual = segundo.lejos;
  while (actual !== undefined) {
    camino.push(actual);
    actual = segundo.padre.get(actual);
  }
  return camino.reverse();
}

/**
 * Detecta rutas (líneas) en la imagen ya deformada.
 * Descarta fichas, líneas de yarda y manchas: solo devuelve trazos alargados.
 * @returns {{puntos:{x:number,y:number}[], largo:number, ini:{x:number,y:number}, fin:{x:number,y:number}}[]}
 */
export function detectarRutas(imagen, fichas = [], opts = {}) {
  const { data, ancho, alto } = imagen;
  if (!data || !ancho || !alto) return [];
  const umbral = opts.umbral ?? 70;
  const { mascara, w, h, paso } = mascaraDeFondo(data, ancho, alto, umbral);

  // fuera las fichas (los jugadores no son rutas)
  for (const f of fichas) {
    const cx = f.x / paso;
    const cy = f.y / paso;
    const r = Math.max(3, (f.r * 1.35) / paso);
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x += 1) {
        if (Math.hypot(x - cx, y - cy) <= r) mascara[y * w + x] = 0;
      }
    }
  }

  const visto = new Uint8Array(w * h);
  const rutas = [];
  const minPix = Math.max(24, Math.round(0.0011 * w * h));

  for (let y0 = 0; y0 < h; y0 += 1) {
    for (let x0 = 0; x0 < w; x0 += 1) {
      const idx0 = y0 * w + x0;
      if (!mascara[idx0] || visto[idx0]) continue;
      const pixeles = [];
      const pila = [idx0];
      visto[idx0] = 1;
      let minX = x0;
      let maxX = x0;
      let minY = y0;
      let maxY = y0;
      while (pila.length) {
        const idx = pila.pop();
        pixeles.push(idx);
        const x = idx % w;
        const y = (idx / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const v = ny * w + nx;
            if (mascara[v] && !visto[v]) {
              visto[v] = 1;
              pila.push(v);
            }
          }
        }
      }

      if (pixeles.length < minPix) continue;
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const largo = Math.max(bw, bh);
      const corto = Math.max(1, Math.min(bw, bh));
      // líneas de yarda: muy anchas y casi planas
      if (bw > w * 0.55 && bh < 14) continue;
      if (largo / corto > 12) continue;
      // trazos finos: si llena su caja es una mancha, no una línea
      if (pixeles.length / (bw * bh) > 0.72) continue;

      const camino = trazarComponente(pixeles, w, h);
      if (camino.length < 12) continue;
      const puntos = camino.map((idx) => ({ x: (idx % w) * paso, y: ((idx / w) | 0) * paso }));
      const simplificada = simplificar(puntos, Math.max(2, paso * 1.8));
      if (simplificada.length < 2) continue;
      const ini = simplificada[0];
      const fin = simplificada[simplificada.length - 1];
      const recorrido = Math.hypot(fin.x - ini.x, fin.y - ini.y);
      if (recorrido < Math.max(22, ancho * 0.028)) continue; // trazos diminutos
      rutas.push({ puntos: simplificada, largo: recorrido, ini, fin });
    }
  }

  // rutas más largas primero (las cortas suelen ser ruido)
  return rutas.sort((a, b) => b.largo - a.largo).slice(0, 12);
}
