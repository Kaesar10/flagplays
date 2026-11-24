// Calcar una jugada desde una foto o un fotograma de vídeo.
//
// Flujo: elegir archivo → marcar las 4 esquinas del campo → deformar la foto al
// rectángulo del campo → devolver la imagen lista para usar como fondo.
// Todo ocurre en el dispositivo: la imagen no sale de aquí.
import { h, toast, modal } from './ui.js';
import { icon } from './icons.js';
import { orderCorners, quadArea, fitSize } from './trace-math.js';
import { detectarFichas, detectarRutas } from './trace-detect.js';

const MAX_VISTA = 760; // tamaño máximo de la foto en pantalla
export const SALIDA_ANCHO = 1000; // tamaño de la imagen deformada que se guarda
export const SALIDA_ALTO = 800;

/** Carga un archivo de imagen como HTMLImageElement + su URL temporal. */
export function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

/**
 * Deforma el cuadrilátero marcado en la foto al rectángulo del campo.
 * Canvas solo hace transformaciones afines, así que se pinta en dos triángulos.
 * @returns {string} dataURL JPEG comprimido
 */
export function deformarConCanvas(img, esquinas) {
  const orden = orderCorners(esquinas) || esquinas;
  const out = document.createElement('canvas');
  out.width = SALIDA_ANCHO;
  out.height = SALIDA_ALTO;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#0b1418';
  ctx.fillRect(0, 0, out.width, out.height);

  const dst = [
    { x: 0, y: 0 },
    { x: out.width, y: 0 },
    { x: out.width, y: out.height },
    { x: 0, y: out.height },
  ];
  for (const [i, j, k] of [
    [0, 1, 2],
    [0, 2, 3],
  ]) {
    const s = [orden[i], orden[j], orden[k]];
    const d = [dst[i], dst[j], dst[k]];
    const det = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y);
    if (Math.abs(det) < 0.5) continue;
    const a = ((d[1].x - d[0].x) * (s[2].y - s[0].y) - (d[2].x - d[0].x) * (s[1].y - s[0].y)) / det;
    const b = ((d[1].y - d[0].y) * (s[2].y - s[0].y) - (d[2].y - d[0].y) * (s[1].y - s[0].y)) / det;
    const c = ((d[2].x - d[0].x) * (s[1].x - s[0].x) - (d[1].x - d[0].x) * (s[2].x - s[0].x)) / det;
    const e = ((d[2].y - d[0].y) * (s[1].x - s[0].x) - (d[1].y - d[0].y) * (s[2].x - s[0].x)) / det;
    const f = d[0].x - a * s[0].x - c * s[0].y;
    const g = d[0].y - b * s[0].x - e * s[0].y;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d[0].x, d[0].y);
    ctx.lineTo(d[1].x, d[1].y);
    ctx.lineTo(d[2].x, d[2].y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, e, f, g);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  return { dataUrl: out.toDataURL('image/jpeg', 0.72), canvas: out };
}

/** Solo la imagen deformada (atajo). */
export function deformarACampo(img, esquinas) {
  return deformarConCanvas(img, esquinas).dataUrl;
}

/** Deja elegir el fotograma de un vídeo y lo devuelve como imagen. */
export function fotogramaDeVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo abrir el vídeo'));
    };

    video.onloadedmetadata = () => {
      const lienzo = document.createElement('canvas');
      const vista = h('canvas', { class: 'tr-video-canvas' });
      const rango = h('input', { class: 'range', type: 'range', min: '0', max: '1000', value: '0', 'aria-label': 'Fotograma' });

      const pintar = () => {
        const dur = video.duration || 1;
        video.currentTime = (Number(rango.value) / 1000) * dur;
      };
      const dibujar = () => {
        lienzo.width = video.videoWidth || 640;
        lienzo.height = video.videoHeight || 360;
        lienzo.getContext('2d').drawImage(video, 0, 0, lienzo.width, lienzo.height);
        const tam = fitSize(lienzo.width, lienzo.height, 700);
        vista.width = tam.w;
        vista.height = tam.h;
        vista.getContext('2d').drawImage(lienzo, 0, 0, tam.w, tam.h);
      };
      video.addEventListener('seeked', dibujar);
      video.addEventListener('loadeddata', () => {
        video.currentTime = 0.05;
        setTimeout(dibujar, 250);
      });
      rango.addEventListener('input', pintar);

      modal({
        title: 'Elegir el fotograma',
        size: 'md',
        body: h('div', { class: 'tr-video' }, vista, rango),
        actions: [
          { label: 'Cancelar', variant: 'ghost' },
          {
            label: 'Usar este fotograma',
            variant: 'primary',
            onClick: (close) => {
              const img = new Image();
              img.onload = () => {
                URL.revokeObjectURL(url);
                close();
                resolve(img);
              };
              img.src = lienzo.toDataURL('image/jpeg', 0.85);
            },
          },
        ],
      });
    };
  });
}

/**
 * Asistente de calco.
 * @returns {Promise<{dataUrl:string,ancho:number,alto:number}|{quitar:true}|null>}
 */
export function abrirCalco() {
  return new Promise((resolve) => {
    let img = null;
    let urlTemp = null;
    let esquinas = [];
    let resultado = null;
    let escala = { w: 1, h: 1 };
    let opacidad = 45; // % de la foto de fondo
    let fichas = []; // jugadores detectados en la foto
    let colocarFichas = true;
    let rutas = []; // rutas (líneas) detectadas
    let aplicarRutas = true;
    const cuerpo = h('div', { class: 'tr' });

    modal({
      title: 'Calcar desde una foto',
      size: 'lg',
      body: cuerpo,
      actions: [
        { label: 'Cancelar', variant: 'ghost', onClick: (close) => (close(), fin(null)) },
        { label: 'Quitar la foto', variant: 'ghost', onClick: (close) => (close(), fin({ quitar: true })) },
        {
          label: 'Usar esta foto',
          variant: 'primary',
          onClick: (close) => {
            if (!resultado) return toast('Marca primero las 4 esquinas del campo', 'error');
            close();
            fin(resultado);
          },
        },
      ],
    });

    function fin(valor) {
      if (urlTemp) URL.revokeObjectURL(urlTemp);
      resolve(valor);
    }

    // ---------------------------------------------------------------- paso 1
    function pintarArchivo() {
      resultado = null;
      esquinas = [];
      cuerpo.replaceChildren();
      const entrada = h('input', {
        type: 'file',
        accept: 'image/*,video/*',
        class: 'tr-file',
        'aria-label': 'Elegir foto o vídeo',
      });
      entrada.addEventListener('change', async () => {
        const file = entrada.files?.[0];
        if (!file) return;
        try {
          if (file.type.startsWith('video/')) {
            const capturada = await fotogramaDeVideo(file);
            img = capturada;
            urlTemp = null;
          } else {
            const { img: imagen, url } = await cargarImagen(file);
            img = imagen;
            urlTemp = url;
          }
          pintarEsquinas();
        } catch (err) {
          console.error('[calco]', err);
          toast('No se pudo leer ese archivo', 'error');
        }
      });

      cuerpo.append(
        h(
          'label',
          { class: 'tr-drop' },
          h('span', { class: 'tr-drop-ic', html: icon('camera', { size: 26 }) }),
          h('b', { text: 'Elegir foto o vídeo' }),
          h('span', { class: 'tr-drop-sub', text: 'Foto de la pizarra, captura o vídeo: eliges el fotograma y marcas el campo.' }),
          entrada
        ),
        h('p', { class: 'tr-note', text: 'La imagen no sale de tu dispositivo: se guarda comprimida dentro de esta jugada.' })
      );
    }

    // ---------------------------------------------------------------- paso 2
    function pintarEsquinas() {
      const tam = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_VISTA);
      escala = tam;
      const lienzo = h('canvas', { class: 'tr-canvas', width: String(tam.w), height: String(tam.h) });
      lienzo.getContext('2d').drawImage(img, 0, 0, tam.w, tam.h);
      const capa = h('div', { class: 'tr-pins-layer' });
      const estado = h('span', { class: 'tr-pins', text: '0 de 4' });
      const marco = h('div', { class: 'tr-stage' }, lienzo, capa);

      // Las esquinas ya puestas se pueden arrastrar para corregirlas.
      let arrastrePin = null;
      const recalcular = () => {
        if (esquinas.length < 4) return;
        const orden = orderCorners(esquinas);
        if (!orden || quadArea(orden) < 1500) return;
        const deformada = deformarConCanvas(img, orden);
        fichas = [];
        try {
          const ctx = deformada.canvas.getContext('2d');
          const pixeles = ctx.getImageData(0, 0, deformada.canvas.width, deformada.canvas.height);
          const imagenDet = { data: pixeles.data, ancho: deformada.canvas.width, alto: deformada.canvas.height };
          fichas = detectarFichas(imagenDet).slice(0, 24);
          rutas = detectarRutas(imagenDet, fichas).slice(0, 12);
        } catch (err) {
          console.warn('[calco] detección', err);
        }
        resultado = {
          dataUrl: deformada.dataUrl,
          ancho: SALIDA_ANCHO,
          alto: SALIDA_ALTO,
          opacity: opacidad / 100,
          get fichas() {
            return colocarFichas ? fichas : [];
          },
          get rutas() {
            return aplicarRutas ? rutas : [];
          },
        };
        pintarDeteccion();
      };

      const repintarPines = () => {
        capa.replaceChildren();
        esquinas.forEach((p, i) => {
          const pin = h('span', {
            class: 'tr-pin',
            style: `left:${(p.x / tam.w) * 100}%;top:${(p.y / tam.h) * 100}%`,
            text: String(i + 1),
          });
          pin.addEventListener('pointerdown', (evt) => {
            evt.preventDefault();
            evt.stopPropagation();
            arrastrePin = i;
            pin.setPointerCapture?.(evt.pointerId);
          });
          pin.addEventListener('pointermove', (evt) => {
            if (arrastrePin !== i) return;
            const r = lienzo.getBoundingClientRect();
            esquinas[i] = {
              x: Math.max(0, Math.min(tam.w, ((evt.clientX - r.left) / r.width) * tam.w)),
              y: Math.max(0, Math.min(tam.h, ((evt.clientY - r.top) / r.height) * tam.h)),
            };
            repintarPines();
          });
          pin.addEventListener('pointerup', () => {
            if (arrastrePin === i) {
              arrastrePin = null;
              recalcular();
            }
          });
          capa.append(pin);
        });
        estado.textContent = esquinas.length === 4 ? 'Listo: pulsa «Usar esta foto»' : `${esquinas.length} de 4`;
      };

      const avisoFichas = h('label', { class: 'tr-detect' });
      const pintarDeteccion = () => {
        avisoFichas.replaceChildren();
        if (!fichas.length) return;
        const check = h('input', { type: 'checkbox', checked: colocarFichas });
        check.addEventListener('change', () => {
          colocarFichas = check.checked;
        });
        avisoFichas.append(
          check,
          h('span', { text: `${fichas.length} jugador${fichas.length === 1 ? '' : 'es'} detectado${fichas.length === 1 ? '' : 's'}: colocarlos en la jugada` })
        );
        avisoFichas.hidden = false;
        pintarRutas();
      };

      const avisoRutas = h('label', { class: 'tr-detect tr-detect-rutas' });
      const pintarRutas = () => {
        avisoRutas.replaceChildren();
        if (!rutas.length) {
          avisoRutas.hidden = true;
          return;
        }
        const check = h('input', { type: 'checkbox', checked: aplicarRutas });
        check.addEventListener('change', () => {
          aplicarRutas = check.checked;
        });
        avisoRutas.append(
          check,
          h('span', {
            text: `${rutas.length} ruta${rutas.length === 1 ? '' : 's'} detectada${rutas.length === 1 ? '' : 's'}: proponerlas a los jugadores más cercanos`,
          })
        );
        avisoRutas.hidden = false;
      };

      marco.addEventListener('pointerdown', (evt) => {
        if (esquinas.length >= 4) return;
        const r = lienzo.getBoundingClientRect();
        esquinas.push({
          x: ((evt.clientX - r.left) / r.width) * tam.w,
          y: ((evt.clientY - r.top) / r.height) * tam.h,
        });
        if (esquinas.length === 4) {
          const orden = orderCorners(esquinas);
          if (!orden || quadArea(orden) < 1500) {
            toast('Esas esquinas no forman el campo: vuelve a marcarlas', 'error');
            esquinas = [];
            resultado = null;
            fichas = [];
          } else {
            recalcular();
          }
        } else {
          resultado = null;
          fichas = [];
          pintarDeteccion();
        }
        repintarPines();
      });

      const controlOpacidad = h('input', {
        class: 'range',
        type: 'range',
        min: '15',
        max: '85',
        value: String(opacidad),
        'aria-label': 'Opacidad de la foto',
      });
      const textoOpacidad = h('span', { class: 'tr-op', text: `${opacidad}%` });
      controlOpacidad.addEventListener('input', () => {
        opacidad = Number(controlOpacidad.value);
        textoOpacidad.textContent = `${opacidad}%`;
      });

      cuerpo.replaceChildren(
        h(
          'div',
          { class: 'tr-guide' },
          h('b', { text: 'Marca las 4 esquinas del campo' }),
          h('span', { text: '1 arriba-izquierda · 2 arriba-derecha · 3 abajo-derecha · 4 abajo-izquierda' }),
          estado
        ),
        marco,
        h(
          'div',
          { class: 'tr-tools' },
          h('button', {
            class: 'btn sm',
            type: 'button',
            html: `${icon('undo', { size: 13 })}<span>Deshacer esquina</span>`,
            onclick: () => {
              esquinas.pop();
              resultado = null;
              repintarPines();
            },
          }),
          h('button', {
            class: 'btn sm',
            type: 'button',
            html: `${icon('x', { size: 13 })}<span>Otra imagen</span>`,
            onclick: () => pintarArchivo(),
          }),
          h('label', { class: 'tr-op-wrap' }, h('span', { text: 'Opacidad' }), controlOpacidad, textoOpacidad)
        ),
        avisoFichas,
        avisoRutas
      );
      repintarPines();
    }

    pintarArchivo();
  });
}
