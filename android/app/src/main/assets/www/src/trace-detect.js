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

/**
 * Detecta fichas circulares.
 * @param {{data:Uint8ClampedArray|number[], ancho:number, alto:number}} imagen
 * @param {{umbral?:number, minLado?:number, maxLado?:number}} opts
 * @returns {{x:number,y:number,r:number}[]} centros en píxeles de la imagen
 */
export function detectarFichas(imagen, opts = {}) {
  const { data, ancho, alto } = imagen;
  if (!data || !ancho || !alto) return [];
  const umbral = opts.umbral ?? 70;
  const paso = Math.max(1, Math.round(Math.max(ancho, alto) / 260));
  const w = Math.floor(ancho / paso);
  const h = Math.floor(alto / paso);
  const fondo = colorDominante(data, ancho, alto);

  // máscara de "no fondo"
  const mascara = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = ((y * paso) * ancho + x * paso) * 4;
      const dr = data[i] - fondo.r;
      const dg = data[i + 1] - fondo.g;
      const db = data[i + 2] - fondo.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > umbral) mascara[y * w + x] = 1;
    }
  }

  // componentes conexas (4 vecinos)
  const visto = new Uint8Array(w * h);
  const fichas = [];
  const pila = [];
  const minLado = opts.minLado ?? 5;
  const maxLado = opts.maxLado ?? 60;

  for (let y0 = 0; y0 < h; y0 += 1) {
    for (let x0 = 0; x0 < w; x0 += 1) {
      const idx0 = y0 * w + x0;
      if (!mascara[idx0] || visto[idx0]) continue;
      let minX = x0;
      let maxX = x0;
      let minY = y0;
      let maxY = y0;
      let n = 0;
      pila.length = 0;
      pila.push(idx0);
      visto[idx0] = 1;
      while (pila.length) {
        const idx = pila.pop();
        const x = idx % w;
        const y = (idx / w) | 0;
        n += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const vecinos = [
          x > 0 ? idx - 1 : -1,
          x < w - 1 ? idx + 1 : -1,
          y > 0 ? idx - w : -1,
          y < h - 1 ? idx + w : -1,
        ];
        for (const v of vecinos) {
          if (v >= 0 && mascara[v] && !visto[v]) {
            visto[v] = 1;
            pila.push(v);
          }
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw < minLado || bh < minLado || bw > maxLado || bh > maxLado) continue;
      const aspecto = bw / bh;
      if (aspecto < 0.55 || aspecto > 1.8) continue;
      const relleno = n / (bw * bh);
      if (relleno < 0.55) continue;
      fichas.push({
        x: (minX + bw / 2) * paso,
        y: (minY + bh / 2) * paso,
        r: ((bw + bh) / 4) * paso,
      });
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
