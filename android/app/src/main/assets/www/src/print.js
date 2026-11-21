// ============================================================================
// FlagPlays — material de impresión para entrenadores de flag football.
//
//   · Muñequeras recortables (varias tarjetas por hoja, N jugadas por tarjeta)
//   · Call sheet por categorías con columna «vs» para anotar la defensa
//   · Hoja de jugada (1 por página) con notas y zona rayada de anotaciones
//   · Tarjetas de bolsillo (8 por hoja A4, 2 × 4)
//
// Los generadores `render*` son funciones PURAS: reciben datos y devuelven
// HTML. No tocan el DOM, así que se pueden testear en Node.
// La UI (`openPrintDialog`, `printNow`, `installPrintStyles`) sí usa DOM y
// lleva guardas `typeof document !== 'undefined'`.
//
// Dependencia: `src/renderer.js` (del Lead). Se importa de forma guardada para
// que este módulo y sus tests funcionen aunque el renderer todavía no exista:
// en ese caso las hojas salen sin diagrama.
// ============================================================================

let RT = null;
try {
  // Import dinámico guardado: renderer.js puede no existir aún.
  RT = await import('./renderer.js');
} catch {
  RT = null;
}

// ---------------------------------------------------------------------------
// Constantes y utilidades puras
// ---------------------------------------------------------------------------

const IN_MM = 25.4; // 1 pulgada en mm
const PAGE_MARGIN_MM = 8; // margen de @page (físico)
const SVG_RATIO = 150 / 110; // proporción interna de los diagramas de tarjeta

/** Tamaños de papel disponibles. Medidas en mm (retrato). */
const PAPERS = {
  A4: { key: 'A4', label: 'A4', w: 210, h: 297, css: 'A4 portrait' },
  Letter: { key: 'Letter', label: 'Carta', w: 215.9, h: 279.4, css: 'Letter portrait' },
};

/** Tamaños de tarjeta de muñequera en pulgadas (ancho × alto). */
const CARD_SIZE_IN = {
  '3x5': { w: 3, h: 5 },
  '3.5x5': { w: 3.5, h: 5 },
  '4x6': { w: 4, h: 6 },
};

/** Jugadas por tarjeta de muñequera admitidas. */
const WRISTBAND_COUNTS = [1, 2, 4, 6, 12];

/** Orden de categorías en el call sheet. */
const CATEGORY_ORDER = [
  'Pase corto',
  'Pase medio',
  'Pase profundo',
  'Carrera',
  'Conversión',
  'Juego de engaño',
  'Zona',
  'Hombre',
  'Presión',
];

// Alturas de fila del call sheet (mm) usadas para paginar.
const CALL_HEAD_MM = 26;
const CALL_CAT_MM = 8;
const CALL_ROW_MM = 15;

const ESC_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa texto para insertarlo en HTML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Número -> "12.4mm" (nunca NaN ni undefined). */
function mm(value) {
  return `${round2(value)}mm`;
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function optBool(opts, keys, fallback) {
  const o = opts || {};
  for (const key of keys) {
    if (typeof o[key] === 'boolean') return o[key];
  }
  return fallback;
}

/** Corta un texto y añade puntos suspensivos. */
function clip(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function chunk(list, size) {
  const out = [];
  const n = Math.max(1, Math.floor(size) || 1);
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** Número con coma decimal (es-ES). */
function esNumber(value, decimals = 1) {
  const n = num(value, 0);
  return n.toFixed(decimals).replace('.', ',');
}

/** Acepta array de jugadas o un objeto con `.plays`. */
function normalizePlays(input) {
  const arr = Array.isArray(input)
    ? input
    : input && Array.isArray(input.plays)
      ? input.plays
      : [];
  return arr.filter((p) => p && typeof p === 'object');
}

/** Paper de las opciones: 'A4' | 'Letter' (acepta también 'Carta'). */
function paperOf(opts) {
  const raw = String((opts && opts.paper) || 'A4').trim();
  if (/letter|carta/i.test(raw)) return PAPERS.Letter;
  return PAPERS.A4;
}

/** Tamaño físico de la tarjeta de muñequera: {wMM, hMM}. */
function cardSize(opts) {
  const o = opts || {};
  const raw = String(o.size || o.cardSize || '3.5x5')
    .toLowerCase()
    .replace(/\s+/g, '');
  let inches = CARD_SIZE_IN[raw];
  if (raw === 'custom' || raw === 'personalizado') {
    // Se mide en centímetros, que es como se pide una muñequera de verdad.
    const wCm = num(o.cardWcm ?? o.customWcm, NaN);
    const hCm = num(o.cardHcm ?? o.customHcm, NaN);
    if (Number.isFinite(wCm) || Number.isFinite(hCm)) {
      const w = clamp(Number.isFinite(wCm) ? wCm : 7.6, 1, 40);
      const h = clamp(Number.isFinite(hCm) ? hCm : 12.7, 1, 40);
      return { wMM: round2(w * 10), hMM: round2(h * 10) };
    }
    // Compatibilidad con las medidas antiguas en pulgadas.
    inches = {
      w: clamp(num(o.cardWidth ?? o.customWidth, 3.5), 1, 12),
      h: clamp(num(o.cardHeight ?? o.customHeight, 5), 1, 12),
    };
  }
  if (!inches) inches = CARD_SIZE_IN['3.5x5'];
  return { wMM: round2(inches.w * IN_MM), hMM: round2(inches.h * IN_MM) };
}

/** Jugadas por tarjeta de muñequera, siempre de la lista admitida. */
function playsPerCardOf(opts) {
  const raw = num(opts && opts.playsPerCard, 4);
  if (WRISTBAND_COUNTS.includes(raw)) return raw;
  return WRISTBAND_COUNTS.reduce(
    (best, candidate) => (Math.abs(candidate - raw) < Math.abs(best - raw) ? candidate : best),
    4
  );
}

/**
 * Rejilla física de la muñequera que cabe en el papel elegido.
 * @returns {{paper:string, cardW:number, cardH:number, cols:number, rows:number,
 *   cardsPerPage:number, playsPerCard:number}}
 */
export function wristbandLayout(opts = {}) {
  const paper = paperOf(opts);
  const card = cardSize(opts);
  const per = playsPerCardOf(opts);
  const contentW = paper.w - PAGE_MARGIN_MM * 2;
  const contentH = paper.h - PAGE_MARGIN_MM * 2;

  // Columnas y filas: si el usuario las fija, mandan ellas y la celda se encoge
  // hasta caber. Si van a 0 (automático), se usa la rejilla que quepa entera.
  const fitCols = Math.max(1, Math.floor((contentW + 0.05) / card.wMM));
  const fitRows = Math.max(1, Math.floor((contentH + 0.05) / card.hMM));
  const askedCols = clampInt(opts.cols, 0, 12, 0);
  const askedRows = clampInt(opts.rows, 0, 12, 0);
  const cols = askedCols > 0 ? askedCols : fitCols;
  const rows = askedRows > 0 ? askedRows : fitRows;

  // Tamaño real de la celda: el pedido, recortado a lo que deja la rejilla.
  const cellW = Math.min(card.wMM, contentW / cols);
  const cellH = Math.min(card.hMM, contentH / rows);
  return {
    paper: paper.key,
    cardW: round2(cellW),
    cardH: round2(cellH),
    requestedW: round2(card.wMM),
    requestedH: round2(card.hMM),
    shrunk: cellW < card.wMM - 0.01 || cellH < card.hMM - 0.01,
    autoCols: askedCols === 0,
    autoRows: askedRows === 0,
    fitCols,
    fitRows,
    playsPerCard: per,
    cols,
    rows,
    cardsPerPage: cols * rows,
  };
}

/** Fecha formateada en es-ES; por defecto, hoy. */
function formatDate(value) {
  let date = null;
  if (value instanceof Date) date = value;
  else if (value !== undefined && value !== null && String(value).trim()) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return esc(String(value));
    date = parsed;
  } else {
    date = new Date();
  }
  try {
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  }
}

/** "trips_right" -> "Trips right". */
function formationLabel(id) {
  const s = String(id ?? '').trim();
  if (!s) return '';
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\p{L}/u, (c) => c.toUpperCase());
}

/** Duración de la jugada usando el renderer, si está disponible. */
function durationOf(play) {
  const fn = RT && RT.computePlayDuration;
  if (typeof fn !== 'function' || !play) return null;
  try {
    const d = Number(fn(play));
    return Number.isFinite(d) && d > 0 ? d : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Diagramas (delegados en el renderer, modo 'print' = fondo claro)
// ---------------------------------------------------------------------------

function svgFor(play, width, height, extra = {}) {
  const fn = RT && RT.playToSVG;
  if (typeof fn !== 'function' || !play) return '';
  try {
    const svg = fn(play, {
      width,
      height,
      mode: 'print',
      showLabels: true,
      showDefense: true,
      showRoutes: true,
      bg: true,
      padding: 10,
      ...extra,
    });
    return typeof svg === 'string' ? svg : '';
  } catch {
    return '';
  }
}

function diagramHTML(play, className, width = 150, height = 110, extra = {}) {
  const svg = svgFor(play, width, height, extra);
  return `<div class="${className}${svg ? '' : ' pr-dg-empty'}">${svg}</div>`;
}

// ---------------------------------------------------------------------------
// Estructura de página
// ---------------------------------------------------------------------------

function pageShell(paper, extraClass, innerHTML, extraStyle = '') {
  const cls = [
    'pr-page',
    paper.key === 'Letter' ? 'pr-page--letter' : 'pr-page--a4',
    extraClass || '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = `--pr-page-w:${mm(paper.w)};--pr-page-h:${mm(paper.h)};${extraStyle || ''}`;
  return `<section class="${cls}" style="${style}" data-paper="${paper.key}">${innerHTML}</section>`;
}

function cropMarks() {
  return '<div class="pr-crop" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
}

// ===========================================================================
// A. Generadores de HTML (puros)
// ===========================================================================

/**
 * Muñequera: rejilla de tarjetas recortables; cada tarjeta dividida en
 * `playsPerCard` filas con número de llamada, diagrama y nombre corto.
 * @param {Array} plays
 * @param {object} opts
 * @returns {string} HTML
 */
export function renderWristbandSheet(plays, opts = {}) {
  const o = opts || {};
  const list = normalizePlays(plays);
  const paper = paperOf(o);
  const layout = wristbandLayout(o);
  const per = layout.playsPerCard;
  const { cols, rows } = layout;
  const perPage = layout.cardsPerPage;
  const showNumber = optBool(o, ['showNumber', 'showNumbers'], true);
  const showName = optBool(o, ['showName'], true);
  const showDiagram = optBool(o, ['showDiagram'], true);
  const showNotes = optBool(o, ['showNotes'], false);
  const cutLines = optBool(o, ['cutLines'], true);
  const showDefense = optBool(o, ['showDefense'], true);
  const startNumber = Math.round(num(o.startNumber, 1));

  // Medidas internas de la tarjeta (en mm) para que el contenido quepa siempre.
  const pad = per >= 8 ? 1.1 : 1.4;
  const innerW = Math.max(6, layout.cardW - pad * 2);
  const innerH = Math.max(6, layout.cardH - pad * 2);
  const rowH = innerH / per;
  const gap = Math.min(1.2, Math.max(0.4, rowH * 0.08));
  const numW = showNumber ? clamp(rowH * 0.9, 5, Math.max(6, innerW * 0.2)) : 0;
  let dgH = Math.min(rowH - gap * 2, 34);
  let dgW = Math.max(2, dgH * SVG_RATIO);
  const dgMaxW = innerW * (per === 1 ? 1 : 0.52);
  if (dgW > dgMaxW) {
    dgW = dgMaxW;
    dgH = dgW / SVG_RATIO;
  }
  dgH = Math.max(2, dgH);
  dgW = Math.max(2, dgW);
  const numFs = clamp(rowH * 0.42, 2.6, 9);
  const nameFs = clamp(Math.min(rowH * 0.24, 3.2), 1.6, 3.2);
  const noteFs = clamp(nameFs * 0.76, 1.3, 2.6);

  // Las variables van en la hoja (no en cada tarjeta) para que la rejilla
  // `grid-template-columns: repeat(N, var(--pr-card-w))` las herede.
  const cardVars = [
    `--pr-cols:${cols}`,
    `--pr-card-w:${mm(layout.cardW)}`,
    `--pr-card-h:${mm(layout.cardH)}`,
    `--pr-pad:${mm(pad)}`,
    `--pr-per:${per}`,
    `--pr-gap:${mm(gap)}`,
    `--pr-num-w:${mm(numW)}`,
    `--pr-dg-w:${mm(dgW)}`,
    `--pr-dg-h:${mm(dgH)}`,
    `--pr-num-fs:${mm(numFs)}`,
    `--pr-name-fs:${mm(nameFs)}`,
    `--pr-note-fs:${mm(noteFs)}`,
  ].join(';');
  const cardCut = cutLines ? ' pr-cut' : '';

  function cardHTML(card) {
    const rowClass = `pr-wb-row${per === 1 ? ' pr-wb-row--solo' : ''}`;
    const rowsHTML = [];
    for (let i = 0; i < per; i += 1) {
      const play = card.plays[i];
      if (!play) {
        rowsHTML.push('<div class="pr-wb-row pr-wb-row--empty" aria-hidden="true"></div>');
        continue;
      }
      const callNo = card.firstNo + i;
      const info = [
        showName ? `<div class="pr-wb-name">${esc(play.name || 'Jugada')}</div>` : '',
        showNotes && play.notes ? `<div class="pr-wb-note">${esc(clip(play.notes, 120))}</div>` : '',
      ].join('');
      rowsHTML.push(
        `<div class="${rowClass}">` +
          (showNumber ? `<div class="pr-wb-no">${callNo}</div>` : '') +
          (showDiagram ? diagramHTML(play, 'pr-wb-dg', 150, 110, { showDefense }) : '') +
          (info ? `<div class="pr-wb-info">${info}</div>` : '') +
          '</div>'
      );
    }
    return `<article class="pr-wb-card${cardCut}"><div class="pr-wb-rows">${rowsHTML.join('')}</div></article>`;
  }

  // Una tarjeta por bloque de `per` jugadas.
  const cards = [];
  for (let i = 0; i < list.length; i += per) {
    cards.push({ plays: list.slice(i, i + per), firstNo: startNumber + i });
  }
  if (!cards.length) cards.push({ plays: [], firstNo: startNumber });

  const pages = chunk(cards, perPage);
  const sheetWidth = mm(cols * layout.cardW);
  return pages
    .map((pageCards) => {
      const grid = pageCards.map(cardHTML).join('');
      const sheetStyle = `width:${sheetWidth};${cardVars};`;
      return pageShell(
        paper,
        'pr-wb-page',
        `<div class="pr-wb-sheet" style="${sheetStyle}"><div class="pr-wb-grid" style="grid-template-columns:repeat(${cols},var(--pr-card-w));">${grid}</div>${cutLines ? cropMarks() : ''}</div>`
      );
    })
    .join('\n');
}

/**
 * Call sheet del entrenador: tabla numerada de llamadas agrupada por categoría,
 * minidiagrama a la derecha y columna «vs» para apuntar la defensa.
 * @param {object} playbook  Libreta ({name, plays, ...}) o array de jugadas.
 * @param {object} opts
 * @returns {string} HTML
 */
export function renderCallSheet(playbook, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const book = Array.isArray(playbook)
    ? { plays: playbook }
    : playbook && typeof playbook === 'object'
      ? playbook
      : {};
  const list = normalizePlays(Array.isArray(o.plays) ? o.plays : book.plays);
  const paper = paperOf(o);
  const showDiagram = optBool(o, ['showDiagram'], true);
  const showNotes = optBool(o, ['showNotes'], false);
  const showName = optBool(o, ['showName'], true);
  const startNumber = Math.round(num(o.startNumber, 1));
  const bookName = String(o.bookName || o.title || book.name || 'Mi libreta');
  const team = String(o.team || book.team || '');
  const dateStr = formatDate(o.date);
  const contentH = paper.h - PAGE_MARGIN_MM * 2;

  if (!list.length) {
    return pageShell(
      paper,
      'pr-call-page',
      `<header class="pr-call-head"><div class="pr-call-head-left"><h1 class="pr-doc-title">Call sheet</h1><p class="pr-doc-sub">${esc(bookName)}</p></div></header><p class="pr-empty">No hay jugadas seleccionadas.</p>`
    );
  }

  const numbered = list.map((play, i) => ({ play, callNo: startNumber + i }));
  const groups = groupByCategory(numbered);
  const pagesHTML = paginateCallSheet(groups, contentH);
  const colCount = 3 + (showNotes ? 1 : 0) + (showDiagram ? 1 : 0);

  return pagesHTML
    .map((page, index) => {
      const rowsHTML = page.rows
        .map((row) => {
          if (row.kind === 'cat') {
            const count = row.count ? ` <span class="pr-cat-count">${row.count}</span>` : '';
            const cont = row.cont ? ' (cont.)' : '';
            return `<tr class="pr-cat-row"><th class="pr-cat-name" colspan="${colCount}">${esc(row.name)}${count}${cont}</th></tr>`;
          }
          const play = row.play;
          const sub = formationLabel(play.formation);
          return (
            '<tr class="pr-call-row">' +
            `<td class="pr-c-num">${row.callNo}</td>` +
            `<td class="pr-c-call">${
              showName ? `<span class="pr-call-name">${esc(play.name || 'Jugada')}</span>` : ''
            }${sub ? `<span class="pr-call-sub">${esc(sub)}</span>` : ''}</td>` +
            (showNotes ? `<td class="pr-c-notes">${esc(clip(play.notes || '', 90))}</td>` : '') +
            '<td class="pr-c-vs"></td>' +
            (showDiagram ? `<td class="pr-c-dg">${diagramHTML(play, 'pr-call-dg', 160, 112, { showDefense: optBool(o, ['showDefense'], true) })}</td>` : '') +
            '</tr>'
          );
        })
        .join('');

      const colgroup = [
        '<colgroup>',
        '<col style="width:11mm">',
        '<col>',
        showNotes ? '<col style="width:34mm">' : '',
        '<col style="width:22mm">',
        showDiagram ? '<col style="width:27mm">' : '',
        '</colgroup>',
      ].join('');

      const head = `<header class="pr-call-head">
        <div class="pr-call-head-left">
          <h1 class="pr-doc-title">Call sheet</h1>
          <p class="pr-doc-sub">${esc(bookName)}${team ? ` · ${esc(team)}` : ''}</p>
        </div>
        <div class="pr-call-head-right">
          <div class="pr-meta-row"><span class="pr-meta-k">Equipo</span><span class="pr-meta-v">${team ? esc(team) : ''}</span><span class="pr-meta-line"></span></div>
          <div class="pr-meta-row"><span class="pr-meta-k">Fecha</span><span class="pr-meta-v">${dateStr}</span></div>
          <div class="pr-meta-row"><span class="pr-meta-k">Rival</span><span class="pr-meta-line"></span></div>
          <div class="pr-meta-row"><span class="pr-meta-k">Página</span><span class="pr-meta-v">${index + 1} / ${pagesHTML.length}</span></div>
        </div>
      </header>`;

      return pageShell(
        paper,
        'pr-call-page',
        `${head}<table class="pr-call-table">${colgroup}<thead><tr><th class="pr-c-num">N.º</th><th class="pr-c-call">Llamada</th>${
          showNotes ? '<th class="pr-c-notes">Notas</th>' : ''
        }<th class="pr-c-vs">vs</th>${
          showDiagram ? '<th class="pr-c-dg">Diagrama</th>' : ''
        }</tr></thead><tbody>${rowsHTML}</tbody></table>`
      );
    })
    .join('\n');
}

/**
 * Hoja de jugada: una jugada por página, diagrama grande (60% de la hoja),
 * datos, notas del entrenador y espacio rayado para anotaciones.
 * @param {object} play
 * @param {object} opts
 * @returns {string} HTML
 */
export function renderPlaySheet(play, opts = {}) {
  const o = opts || {};
  const paper = paperOf(o);
  if (!play || typeof play !== 'object') {
    return pageShell(paper, 'pr-play-page', '<p class="pr-empty">Jugada no disponible.</p>');
  }
  const showDiagram = optBool(o, ['showDiagram'], true);
  const showName = optBool(o, ['showName'], true);
  const showNumber = optBool(o, ['showNumber', 'showNumbers'], true);
  const showNotes = optBool(o, ['showNotes'], true);
  const callNo = Math.round(num(o.callNumber ?? o.number, num(o.startNumber, 1)));
  const duration = durationOf(play);
  const formation = formationLabel(play.formation);
  const team = String(o.team || '').trim();
  const category = String(play.category || '').trim();

  const chips = [
    category ? `<span class="pr-chip">${esc(category)}</span>` : '',
    formation ? `<span class="pr-chip">Formación: ${esc(formation)}</span>` : '',
    duration ? `<span class="pr-chip">Duración: ${esNumber(duration, 1)} s</span>` : '',
    play.type === 'defense' ? '<span class="pr-chip">Defensa</span>' : '',
  ]
    .filter(Boolean)
    .join('');

  const notesText = showNotes && play.notes ? String(play.notes).trim() : '';
  const notesBody = notesText
    ? `<p class="pr-play-text">${esc(notesText)}</p>`
    : `<div class="pr-lines">${'<span class="pr-line"></span>'.repeat(4)}</div>`;

  const header = `<header class="pr-play-head">
    <div class="pr-play-head-main">
      ${showNumber ? `<div class="pr-play-no">N.º ${callNo}</div>` : ''}
      ${showName ? `<h1 class="pr-play-name">${esc(play.name || 'Jugada sin nombre')}</h1>` : ''}
      ${chips ? `<div class="pr-play-chips">${chips}</div>` : ''}
    </div>
    <div class="pr-play-sign">
      <span class="pr-play-sign-k">Equipo</span>
      ${team ? `<span class="pr-play-sign-v">${esc(team)}</span>` : '<span class="pr-play-sign-line"></span>'}
    </div>
  </header>`;

  const diagram = showDiagram
    ? `<div class="pr-play-dg">${svgFor(play, 640, 480, { showDefense: optBool(o, ['showDefense'], true) })}</div>`
    : '';

  const bottom = `<div class="pr-play-bottom">
    <section class="pr-play-box pr-play-notes">
      <h2 class="pr-play-box-title">Notas del entrenador</h2>
      ${notesBody}
    </section>
    <section class="pr-play-box pr-play-annot">
      <h2 class="pr-play-box-title">Anotaciones</h2>
      <div class="pr-lines">${'<span class="pr-line"></span>'.repeat(7)}</div>
    </section>
  </div>`;

  return pageShell(
    paper,
    `pr-play-page${showDiagram ? '' : ' pr-play-page--nodg'}`,
    `${header}${diagram}${bottom}`
  );
}

/**
 * Tarjetas de bolsillo: 8 por hoja A4 (2 × 4), ~90 × 65 mm cada una.
 * @param {Array} plays
 * @param {object} opts
 * @returns {string} HTML
 */
export function renderPocketCards(plays, opts = {}) {
  const o = opts || {};
  const list = normalizePlays(plays);
  const paper = paperOf(o);
  const showNumber = optBool(o, ['showNumber', 'showNumbers'], true);
  const showName = optBool(o, ['showName'], true);
  const showDiagram = optBool(o, ['showDiagram'], true);
  const cutLines = optBool(o, ['cutLines'], true);
  const startNumber = Math.round(num(o.startNumber, 1));
  const COLS = 2;
  const ROWS = 4;
  const PER_PAGE = COLS * ROWS;
  const cardCut = cutLines ? ' pr-cut' : '';

  const cards = list.map((play, i) => ({ play, callNo: startNumber + i }));
  if (!cards.length) cards.push({ play: null, callNo: startNumber });

  function cardHTML(card) {
    if (!card.play) return `<article class="pr-pc-card${cardCut}"></article>`;
    const head = [
      showNumber ? `<span class="pr-pc-no">${card.callNo}</span>` : '',
      showName ? `<span class="pr-pc-name">${esc(card.play.name || 'Jugada')}</span>` : '',
    ].join('');
    return (
      `<article class="pr-pc-card${cardCut}">` +
      (head ? `<header class="pr-pc-head">${head}</header>` : '') +
      (showDiagram ? diagramHTML(card.play, 'pr-pc-dg', 160, 112, { showDefense: optBool(o, ['showDefense'], true) }) : '') +
      '</article>'
    );
  }

  const pages = chunk(cards, PER_PAGE);
  return pages
    .map((pageCards) => {
      const grid = pageCards.map(cardHTML).join('');
      return pageShell(
        paper,
        'pr-pc-page',
        `<div class="pr-pc-sheet"><div class="pr-pc-grid">${grid}</div>${cutLines ? cropMarks() : ''}</div>`
      );
    })
    .join('\n');
}

/**
 * Extra (rejilla configurable): N jugadas por hoja en cuadrícula.
 * Se usa desde el modal cuando se elige más de 1 jugada por hoja.
 * @param {Array} plays
 * @param {object} opts
 * @returns {string} HTML
 */
export function renderPlayGridSheet(plays, opts = {}) {
  const o = opts || {};
  const list = normalizePlays(plays);
  const paper = paperOf(o);
  const showNumber = optBool(o, ['showNumber', 'showNumbers'], true);
  const showName = optBool(o, ['showName'], true);
  const showDiagram = optBool(o, ['showDiagram'], true);
  const cutLines = optBool(o, ['cutLines'], true);
  const startNumber = Math.round(num(o.startNumber, 1));
  const cols = clampInt(o.cols, 1, 4, 2);
  const rows = clampInt(o.rows, 1, 5, 2);
  const perPage = cols * rows;
  const contentW = paper.w - PAGE_MARGIN_MM * 2;
  const contentH = paper.h - PAGE_MARGIN_MM * 2;
  const cellW = contentW / cols;
  const cellH = contentH / rows;
  const cellCut = cutLines ? ' pr-cut' : '';

  const cards = list.map((play, i) => ({ play, callNo: startNumber + i }));
  if (!cards.length) cards.push({ play: null, callNo: startNumber });

  function cellHTML(card) {
    if (!card.play) {
      return `<article class="pr-grid-cell${cellCut}" style="width:${mm(cellW)};height:${mm(cellH)}"></article>`;
    }
    const head = [
      showNumber ? `<span class="pr-grid-no">${card.callNo}</span>` : '',
      showName ? `<span class="pr-grid-name">${esc(card.play.name || 'Jugada')}</span>` : '',
    ].join('');
    return (
      `<article class="pr-grid-cell${cellCut}" style="width:${mm(cellW)};height:${mm(cellH)}">` +
      (head ? `<header class="pr-grid-head">${head}</header>` : '') +
      (showDiagram ? diagramHTML(card.play, 'pr-grid-dg', 320, 240, { showDefense: optBool(o, ['showDefense'], true) }) : '') +
      '</article>'
    );
  }

  const pages = chunk(cards, perPage);
  return pages
    .map((pageCards) => {
      const grid = pageCards.map(cellHTML).join('');
      return pageShell(
        paper,
        'pr-grid-page',
        `<div class="pr-grid" style="grid-template-columns:repeat(${cols},${mm(cellW)});grid-template-rows:repeat(${rows},${mm(cellH)});">${grid}</div>`
      );
    })
    .join('\n');
}

// --- Call sheet: agrupación y paginación -----------------------------------

function catRank(category) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index < 0 ? 500 : index;
}

function groupByCategory(numbered) {
  const map = new Map();
  for (const item of numbered) {
    const category = String(item.play.category || '').trim() || 'Sin categoría';
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(item);
  }
  const keys = [...map.keys()].sort(
    (a, b) => catRank(a) - catRank(b) || a.localeCompare(b, 'es')
  );
  return keys.map((name) => ({ name, plays: map.get(name) }));
}

function paginateCallSheet(groups, contentH) {
  const available = Math.max(60, contentH - CALL_HEAD_MM - 4);
  const pages = [];
  let current = { rows: [], used: 0 };
  let lastCategory = '';

  for (const group of groups) {
    // Cabecera de categoría con al menos una fila asegurada.
    if (current.rows.length && current.used + CALL_CAT_MM + CALL_ROW_MM > available) {
      pages.push(current);
      current = { rows: [], used: 0 };
    }
    current.rows.push({ kind: 'cat', name: group.name, count: group.plays.length });
    current.used += CALL_CAT_MM;
    lastCategory = group.name;

    for (const item of group.plays) {
      if (current.used + CALL_ROW_MM > available && current.rows.length) {
        pages.push(current);
        current = { rows: [], used: 0 };
        if (lastCategory) {
          current.rows.push({ kind: 'cat', name: lastCategory, count: 0, cont: true });
          current.used += CALL_CAT_MM;
        }
      }
      current.rows.push({ kind: 'play', play: item.play, callNo: item.callNo });
      current.used += CALL_ROW_MM;
    }
  }
  if (current.rows.length) pages.push(current);
  return pages;
}

// ===========================================================================
// B. Impresión real (DOM)
// ===========================================================================

let lastPaper = 'A4';
let restoreTimer = 0;
let restoreFn = null;

function ensurePrintRoot() {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  } else if (root.parentElement !== document.body) {
    // La regla de impresión oculta todo `body > *:not(#print-root)`.
    document.body.appendChild(root);
  }
  return root;
}

/** Añade los <link> de estilos de impresión si la página no los tiene. */
function ensureStylesheets() {
  if (typeof document === 'undefined') return;
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map(
    (link) => link.getAttribute('href') || ''
  );
  const has = (name) => links.some((href) => new RegExp(`(^|/)${name}(\\?|#|$)`).test(href));
  const needed = [];
  if (!has('print\\.css')) needed.push('styles/print.css');
  if (!has('print-ui\\.css')) needed.push('styles/print-ui.css');
  for (const href of needed) {
    if (links.some((h) => h === href)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

/**
 * Inyecta (o actualiza) el <style> con la regla @page que toca según el papel.
 * Es idempotente: siempre hay un único bloque dinámico.
 * @param {{paper?: 'A4'|'Letter'|string, margin?: number}} [opts]
 * @returns {HTMLStyleElement|null}
 */
export function installPrintStyles(opts = {}) {
  if (typeof document === 'undefined' || !document.head) return null;
  const o = opts && typeof opts === 'object' ? opts : {};
  const paper = paperOf(o);
  lastPaper = paper.key;
  ensureStylesheets();
  const STYLE_ID = 'pr-page-style';
  let tag = document.getElementById(STYLE_ID);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = STYLE_ID;
    document.head.appendChild(tag);
  }
  const margin = clamp(num(o.margin, PAGE_MARGIN_MM), 4, 20);
  const pageHeight = `calc(var(--pr-page-h) - ${round2(margin * 2 + 0.2)}mm)`;
  tag.textContent = `@page { size: ${paper.css}; margin: ${round2(margin)}mm; }
@media print {
  /* La hoja ocupa el área útil exacta (@page se come los márgenes): así la
     vista previa y el papel coinciden al milímetro. */
  #print-root .pr-page { height: ${pageHeight}; }
}`;
  return tag;
}

/**
 * Coloca la hoja en `#print-root` y lanza el diálogo del navegador
 * (Imprimir / Guardar PDF). Restaura el estado al cerrarse el diálogo.
 * @param {string} html
 * @param {{paper?: string}} [opts]
 * @returns {boolean} true si se ha lanzado (false sin DOM)
 */
export function printNow(html, opts = {}) {
  if (typeof document === 'undefined' || !document.body) return false;
  // Cancela una restauración pendiente de una impresión anterior.
  if (restoreFn) {
    try {
      restoreFn();
    } catch {
      /* noop */
    }
  }
  installPrintStyles(opts && typeof opts === 'object' ? opts : {});
  const root = ensurePrintRoot();
  const previous = root.innerHTML;
  root.innerHTML = String(html || '');
  document.body.classList.add('pr-is-printing');

  const cleanup = () => {
    if (restoreTimer) {
      clearTimeout(restoreTimer);
      restoreTimer = 0;
    }
    root.innerHTML = previous;
    document.body.classList.remove('pr-is-printing');
    window.removeEventListener('afterprint', cleanup);
    if (restoreFn === cleanup) restoreFn = null;
  };
  restoreFn = cleanup;
  window.addEventListener('afterprint', cleanup);
  restoreTimer = setTimeout(() => {
    if (restoreFn === cleanup) cleanup();
  }, 120000);

  // Fuerza el layout antes de abrir el diálogo del sistema.
  void root.offsetHeight;
  const run = () => {
    try {
      window.print();
    } catch {
      /* el navegador puede bloquearlo; la hoja ya está lista */
    }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
  return true;
}

// ===========================================================================
// C. Modal de configuración + vista previa en vivo
// ===========================================================================

/** Tipos de salida que ofrece el modal. */
export const PRINT_OUTPUT_TYPES = [
  {
    id: 'wristband',
    label: 'Muñequera',
    desc: '',
  },
  {
    id: 'sheet',
    label: 'Hoja de jugadas',
    desc: '',
  },
  {
    id: 'callsheet',
    label: 'Call sheet del entrenador',
    desc: '',
  },
  {
    id: 'pockets',
    label: 'Tarjetas de bolsillo',
    desc: '',
  },
];

const ICON = {
  close:
    '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true" focusable="false"><path d="M2.2 2.2l9.6 9.6M11.8 2.2L2.2 11.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  up: '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false"><path d="M6 9.6V2.8M2.8 6L6 2.6 9.2 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false"><path d="M6 2.4v6.8M2.8 6L6 9.4 9.2 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wristband:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false"><rect x="3" y="5" width="14" height="10" rx="2"/><path d="M7 8h6M7 11h4" stroke-linecap="round"/></svg>',
  sheet:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false"><rect x="4" y="2.5" width="12" height="15" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h4" stroke-linecap="round"/></svg>',
  callsheet:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false"><rect x="2.5" y="4" width="15" height="12" rx="1.5"/><path d="M2.5 8h15M8 8v8M13 8v8"/></svg>',
  pockets:
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1"/><rect x="11" y="11" width="6.5" height="6.5" rx="1"/></svg>',
};

const TYPE_ICON = {
  wristband: ICON.wristband,
  sheet: ICON.sheet,
  callsheet: ICON.callsheet,
  pockets: ICON.pockets,
};

const SIZE_OPTIONS = [
  { value: '3x5', label: '7,6 × 12,7 cm' },
  { value: '3.5x5', label: '8,9 × 12,7 cm' },
  { value: '4x6', label: '10,2 × 15,2 cm' },
  { value: 'custom', label: 'En cm…' },
];

/** Opciones de la rejilla: 0 = la que quepa sola. */
function gridOptions(count) {
  const list = [{ value: '0', label: 'Auto' }];
  for (let i = 1; i <= count; i += 1) list.push({ value: String(i), label: String(i) });
  return list;
}

const PER_CARD_OPTIONS = WRISTBAND_COUNTS.map((n) => ({ value: String(n), label: String(n) }));

const MODAL_TEMPLATE = `
<div class="pr-overlay" data-pr-overlay>
  <div class="pr-panel" role="dialog" aria-modal="true" aria-labelledby="pr-dialog-title" tabindex="-1">
    <header class="pr-head">
      <div class="pr-head-text">
        <h2 class="pr-title" id="pr-dialog-title">Imprimir material</h2>
        
      </div>
      <button type="button" class="pr-x" data-pr-close aria-label="Cerrar el diálogo de impresión">${ICON.close}</button>
    </header>

    <div class="pr-body">
      <aside class="pr-side" aria-label="Opciones de impresión">
        <section class="pr-group">
          <h3 class="pr-label">Tipo de salida</h3>
          <div class="pr-types" role="radiogroup" aria-label="Tipo de salida"></div>
        </section>

        <section class="pr-group">
          <h3 class="pr-label">Papel</h3>
          <select class="pr-select" data-pr-field="paper" aria-label="Tamaño de papel">
            <option value="A4">A4 · 210 × 297 mm</option>
            <option value="Letter">Carta · 8,5 × 11 in</option>
          </select>
        </section>

        <section class="pr-group" data-pr-when="wristband">
          <h3 class="pr-label">Tamaño de la muñequera</h3>
          <div class="pr-seg" data-pr-field="size" role="group" aria-label="Tamaño de la muñequera"></div>
          <div class="pr-custom" data-pr-custom hidden>
            <label class="pr-field"><span>Ancho (cm)</span><input type="number" class="pr-input" data-pr-field="customWcm" min="2" max="30" step="0.1" inputmode="decimal"></label>
            <label class="pr-field"><span>Alto (cm)</span><input type="number" class="pr-input" data-pr-field="customHcm" min="2" max="30" step="0.1" inputmode="decimal"></label>
          </div>
          <p class="pr-hint" data-pr-fit="wristband"></p>
        </section>

        <section class="pr-group" data-pr-when="wristband">
          <h3 class="pr-label">Jugadas por celda</h3>
          <div class="pr-seg" data-pr-field="playsPerCard" role="group" aria-label="Jugadas por celda"></div>
          <p class="pr-hint">Una jugada por celda: cada recuadro lleva su diagrama y su nombre.</p>
        </section>

        <section class="pr-group" data-pr-when="wristband">
          <h3 class="pr-label">Cuadrícula de la hoja</h3>
          <div class="pr-row pr-row-2">
            <label class="pr-field"><span>Columnas</span>
              <select class="pr-select" data-pr-field="colsW" aria-label="Columnas de la hoja"></select>
            </label>
            <label class="pr-field"><span>Filas</span>
              <select class="pr-select" data-pr-field="rowsW" aria-label="Filas de la hoja"></select>
            </label>
          </div>
          <p class="pr-hint" data-pr-grid="wristband"></p>
        </section>

        <section class="pr-group" data-pr-when="sheet">
          <h3 class="pr-label">Jugadas por hoja (rejilla)</h3>
          <div class="pr-row pr-row-2">
            <label class="pr-field"><span>Columnas</span>
              <select class="pr-select" data-pr-field="cols" aria-label="Columnas por hoja">
                <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
              </select>
            </label>
            <label class="pr-field"><span>Filas</span>
              <select class="pr-select" data-pr-field="rows" aria-label="Filas por hoja">
                <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
              </select>
            </label>
          </div>
          <p class="pr-hint" data-pr-fit="sheet"></p>
        </section>

        <section class="pr-group">
          <h3 class="pr-label">Contenido</h3>
          <label class="pr-check"><input type="checkbox" data-pr-field="showDiagram"><span>Mostrar diagrama</span></label>
          <label class="pr-check"><input type="checkbox" data-pr-field="showDefense"><span>Mostrar defensas</span></label>
          <label class="pr-check"><input type="checkbox" data-pr-field="showName"><span>Mostrar nombre</span></label>
          <label class="pr-check"><input type="checkbox" data-pr-field="showNumber"><span>Mostrar número de llamada</span></label>
          <label class="pr-check"><input type="checkbox" data-pr-field="showNotes"><span>Mostrar notas y consejos</span></label>
          <label class="pr-check"><input type="checkbox" data-pr-field="cutLines"><span>Líneas de corte</span></label>
        </section>

        <section class="pr-group">
          <h3 class="pr-label">Numeración</h3>
          <label class="pr-field pr-field-inline"><span>Numerar desde</span>
            <input type="number" class="pr-input pr-input-sm" data-pr-field="startNumber" min="0" max="999" step="1" inputmode="numeric">
          </label>
        </section>

        <section class="pr-group pr-group-plays">
          <div class="pr-group-head">
            <h3 class="pr-label">Jugadas</h3>
            <div class="pr-mini-btns">
              <button type="button" class="pr-mini" data-pr-all>Todas</button>
              <button type="button" class="pr-mini" data-pr-none>Ninguna</button>
            </div>
          </div>
          <ul class="pr-plays" data-pr-plays></ul>
        </section>
      </aside>

      <div class="pr-main">
        <div class="pr-main-head">
          <h3 class="pr-label">Vista previa</h3>
          <span class="pr-preview-info" data-pr-pages aria-live="polite"></span>
        </div>
        <div class="pr-preview" data-pr-preview>
          <div class="pr-scale-wrap" data-pr-wrap>
            <div class="pr-scale" data-pr-scale>
              <div class="pr-sheet" data-pr-sheet></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="pr-foot">
      <span class="pr-foot-info" data-pr-summary aria-live="polite"></span>
      <span class="pr-foot-actions">
        <button type="button" class="btn ghost" data-pr-close>Cancelar</button>
        <button type="button" class="btn primary" data-pr-print>Imprimir / Guardar PDF</button>
      </span>
    </footer>
  </div>
</div>`;

let currentDialog = null;

/** Compatibilidad con `openPrintDialog(state, opts)` y `openPrintDialog({playbook, plays, defaults})`. */
function resolveDialogArgs(input, extra) {
  const src = input && typeof input === 'object' ? input : {};
  const o = extra && typeof extra === 'object' ? extra : {};
  const book = o.playbook || src.playbook || src.book || null;
  const playsInput =
    o.plays ||
    src.plays ||
    (book && Array.isArray(book.plays) ? book.plays : null) ||
    (src.play ? [src.play] : []) ||
    (src.currentPlay ? [src.currentPlay] : []);
  const defaults = { ...(src.defaults || src.printDefaults || {}), ...(o.defaults || {}) };
  for (const [key, value] of Object.entries(o)) {
    if (key !== 'playbook' && key !== 'plays' && key !== 'defaults') defaults[key] = value;
  }
  if (book && book.name && !defaults.bookName) defaults.bookName = book.name;
  if (book && book.team && !defaults.team) defaults.team = book.team;
  if (book && Array.isArray(book.roster) && !defaults.roster) defaults.roster = book.roster;
  return {
    playbook: book,
    plays: normalizePlays(playsInput),
    defaults,
  };
}

function initialConfig(defaults) {
  const d = defaults && typeof defaults === 'object' ? defaults : {};
  const type = PRINT_OUTPUT_TYPES.some((t) => t.id === d.type) ? d.type : 'wristband';
  const size = CARD_SIZE_IN[d.size] ? d.size : d.size === 'custom' ? 'custom' : '3.5x5';
  return {
    type,
    paper: /letter|carta/i.test(String(d.paper || '')) ? 'Letter' : 'A4',
    size,
    customW: clamp(num(d.customW ?? d.cardWidth, 3.5), 1, 12),
    customH: clamp(num(d.customH ?? d.cardHeight, 5), 1, 12),
    customWcm: clamp(num(d.customWcm ?? d.cardWcm, 7.6), 1, 40),
    customHcm: clamp(num(d.customHcm ?? d.cardHcm, 12.7), 1, 40),
    // Por defecto, una jugada por celda.
    playsPerCard: WRISTBAND_COUNTS.includes(num(d.playsPerCard, 0)) ? num(d.playsPerCard, 1) : 1,
    cols: clampInt(d.cols, 0, 12, 0),
    rows: clampInt(d.rows, 0, 12, 0),
    showDiagram: d.showDiagram !== false,
    showName: d.showName !== false,
    showNumber: d.showNumber !== false && d.showNumbers !== false,
    showNotes: d.showNotes === true,
    showDefense: d.showDefense !== false,
    cutLines: d.cutLines !== false,
    startNumber: Math.round(clamp(num(d.startNumber, 1), 0, 999)),
  };
}

/**
 * Abre el modal de impresión con vista previa real y configuración completa.
 *
 * Acepta las dos firmas del proyecto:
 *   openPrintDialog({ playbook, plays, defaults })
 *   openPrintDialog(state, opts)
 *
 * @param {object} input
 * @param {object} [extra]
 * @returns {{close: () => void, element: HTMLElement} | null} null sin DOM
 */
export function openPrintDialog(input = {}, extra = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  if (currentDialog) {
    try {
      currentDialog.close();
    } catch {
      /* noop */
    }
  }
  ensureStylesheets();

  const resolved = resolveDialogArgs(input, extra);
  const playbook = resolved.playbook || { name: resolved.defaults.bookName || 'Mi libreta', plays: resolved.plays };
  const ui = initialConfig(resolved.defaults);
  const plays = resolved.plays.map((play, index) =>
    play.id ? play : { ...play, id: `pr_auto_${index}` }
  );
  ui.order = plays.slice();
  ui.selected = new Set(plays.map((play) => play.id));

  const host = document.createElement('div');
  host.className = 'pr-modal';
  host.innerHTML = MODAL_TEMPLATE;
  // La sección «Muñequeras» monta el mismo panel dentro de la app, sin flotar.
  const contenedor = (extra && extra.container) || null;
  if (contenedor) {
    host.classList.add('pr-embedded');
    contenedor.appendChild(host);
  } else {
    document.body.appendChild(host);
  }

  const panel = host.querySelector('.pr-panel');
  const overlay = host.querySelector('[data-pr-overlay]');
  const typesEl = host.querySelector('.pr-types');
  const sizeSegEl = host.querySelector('[data-pr-field="size"]');
  const perCardSegEl = host.querySelector('[data-pr-field="playsPerCard"]');
  const customBox = host.querySelector('[data-pr-custom]');
  const playListEl = host.querySelector('[data-pr-plays]');
  const previewEl = host.querySelector('[data-pr-preview]');
  const wrapEl = host.querySelector('[data-pr-wrap]');
  const scaleEl = host.querySelector('[data-pr-scale]');
  const sheetEl = host.querySelector('[data-pr-sheet]');
  const summaryEl = host.querySelector('[data-pr-summary]');
  const pagesEl = host.querySelector('[data-pr-pages]');
  const printBtn = host.querySelector('[data-pr-print]');
  const fitWristband = host.querySelector('[data-pr-fit="wristband"]');
  const fitGrid = host.querySelector('[data-pr-grid="wristband"]');
  const fitSheet = host.querySelector('[data-pr-fit="sheet"]');

  const previousFocus = document.activeElement;
  let lastHTML = '';
  let previewRaf = 0;
  let closed = false;

  // --- construcción de controles -------------------------------------------

  for (const type of PRINT_OUTPUT_TYPES) {
    const label = document.createElement('label');
    label.className = 'pr-type';
    const inputEl = document.createElement('input');
    inputEl.type = 'radio';
    inputEl.name = 'pr-output-type';
    inputEl.value = type.id;
    inputEl.checked = ui.type === type.id;
    inputEl.addEventListener('change', () => {
      if (!inputEl.checked) return;
      ui.type = type.id;
      refresh();
    });
    const body = document.createElement('span');
    body.className = 'pr-type-body';
    body.innerHTML = `<span class="pr-type-icon">${TYPE_ICON[type.id] || ''}</span><span class="pr-type-text"><span class="pr-type-name">${type.label}</span><span class="pr-type-desc">${type.desc}</span></span>`;
    label.append(inputEl, body);
    typesEl.appendChild(label);
  }

  function buildSegment(container, field, options) {
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pr-seg-btn';
      button.dataset.value = option.value;
      button.setAttribute('aria-pressed', 'false');
      button.textContent = option.label;
      container.appendChild(button);
    }
    container.dataset.prField = field;
  }
  buildSegment(sizeSegEl, 'size', SIZE_OPTIONS);
  for (const field of ['colsW', 'rowsW']) {
    const select = host.querySelector(`[data-pr-field="${field}"]`);
    if (!select) continue;
    for (const option of gridOptions(12)) {
      const el = document.createElement('option');
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    }
  }
  buildSegment(perCardSegEl, 'playsPerCard', PER_CARD_OPTIONS);

  // Lista de jugadas (nombre + categoría + orden).
  function moveButton(direction, ariaLabel, icon) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pr-move';
    button.dataset.move = String(direction);
    button.setAttribute('aria-label', ariaLabel);
    button.innerHTML = icon;
    return button;
  }

  function createPlayItem(play) {
    const li = document.createElement('li');
    li.className = 'pr-item';
    li.dataset.id = play.id;

    const label = document.createElement('label');
    label.className = 'pr-item-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = ui.selected.has(play.id);
    checkbox.setAttribute('aria-label', `Incluir «${play.name || 'Jugada'}»`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) ui.selected.add(play.id);
      else ui.selected.delete(play.id);
      refresh();
    });
    const badge = document.createElement('span');
    badge.className = 'pr-item-num';
    badge.setAttribute('aria-hidden', 'true');
    label.append(checkbox, badge);

    const name = document.createElement('span');
    name.className = 'pr-item-name';
    name.textContent = play.name || 'Jugada sin nombre';

    const category = document.createElement('span');
    category.className = 'pr-item-cat';
    category.textContent = play.category || '';

    const move = document.createElement('span');
    move.className = 'pr-item-move';
    move.append(
      moveButton(-1, 'Subir esta jugada', ICON.up),
      moveButton(1, 'Bajar esta jugada', ICON.down)
    );

    li.append(label, name, category, move);
    return li;
  }

  for (const play of ui.order) playListEl.appendChild(createPlayItem(play));

  // --- estado de la interfaz ------------------------------------------------

  /** Opciones que resumen el tamaño de la muñequera y su cuadrícula. */
  function wristbandOpts() {
    return {
      paper: ui.paper,
      size: ui.size,
      customWidth: ui.customW,
      customHeight: ui.customH,
      customWcm: ui.customWcm,
      customHcm: ui.customHcm,
      cols: ui.cols,
      rows: ui.rows,
      playsPerCard: ui.playsPerCard,
    };
  }

  function applyVisibility() {
    for (const section of host.querySelectorAll('[data-pr-when]')) {
      section.hidden = section.dataset.prWhen !== ui.type;
    }
    customBox.hidden = ui.size !== 'custom';
    if (fitWristband) {
      const layout = wristbandLayout(wristbandOpts());
      const cm = (mm) => (mm / 10).toFixed(1).replace('.', ',');
      fitWristband.textContent =
        `${layout.cols} × ${layout.rows} = ${layout.cardsPerPage} celdas por hoja · ` +
        `cada una de ${cm(layout.cardW)} × ${cm(layout.cardH)} cm`;
    }
    if (fitGrid) {
      const layout = wristbandLayout(wristbandOpts());
      const cm = (mm) => (mm / 10).toFixed(1).replace('.', ',');
      if (layout.shrunk) {
        fitGrid.textContent =
          `Para que quepan ${layout.cols} × ${layout.rows} en el papel, cada celda se reduce a ` +
          `${cm(layout.cardW)} × ${cm(layout.cardH)} cm.`;
        fitGrid.classList.add('is-warning');
      } else {
        fitGrid.textContent = `Cada celda mide ${cm(layout.cardW)} × ${cm(layout.cardH)} cm.`;
        fitGrid.classList.remove('is-warning');
      }
    }
    if (fitSheet) {
      const per = Math.max(1, ui.cols) * Math.max(1, ui.rows);
      fitSheet.textContent =
        per <= 1 ? '1 jugada por hoja (una por página)' : `${per} jugadas por hoja`;
    }
  }

  function syncSegments() {
    for (const container of host.querySelectorAll('.pr-seg')) {
      const field = container.dataset.prField;
      const value = String(ui[field]);
      for (const button of container.querySelectorAll('.pr-seg-btn')) {
        button.setAttribute('aria-pressed', String(button.dataset.value === value));
      }
    }
  }

  function syncInputs() {
    const paperSelect = host.querySelector('[data-pr-field="paper"]');
    if (paperSelect) paperSelect.value = ui.paper;
    const colsSelect = host.querySelector('[data-pr-field="cols"]');
    if (colsSelect) colsSelect.value = String(ui.cols);
    const rowsSelect = host.querySelector('[data-pr-field="rows"]');
    if (rowsSelect) rowsSelect.value = String(ui.rows);
    const startInput = host.querySelector('[data-pr-field="startNumber"]');
    if (startInput) startInput.value = String(ui.startNumber);
    const cw = host.querySelector('[data-pr-field="customW"]');
    if (cw) cw.value = String(ui.customW);
    const ch = host.querySelector('[data-pr-field="customH"]');
    if (ch) ch.value = String(ui.customH);
    const cwCm = host.querySelector('[data-pr-field="customWcm"]');
    if (cwCm) cwCm.value = String(ui.customWcm);
    const chCm = host.querySelector('[data-pr-field="customHcm"]');
    if (chCm) chCm.value = String(ui.customHcm);
    const colsW = host.querySelector('[data-pr-field="colsW"]');
    if (colsW) colsW.value = String(ui.cols);
    const rowsW = host.querySelector('[data-pr-field="rowsW"]');
    if (rowsW) rowsW.value = String(ui.rows);
    for (const select of host.querySelectorAll('[data-pr-field="cols"], [data-pr-field="rows"]')) {
      if (select.tagName === 'SELECT' && select.value !== String(ui[select.dataset.prField])) {
        select.value = String(ui[select.dataset.prField]);
      }
    }
    for (const checkbox of host.querySelectorAll('input[type="checkbox"][data-pr-field]')) {
      checkbox.checked = ui[checkbox.dataset.prField] !== false;
    }
    syncSegments();
  }

  function refreshNumbers() {
    let callNo = ui.startNumber;
    for (const li of playListEl.children) {
      const id = li.dataset.id;
      const included = ui.selected.has(id);
      const badge = li.querySelector('.pr-item-num');
      if (included) {
        badge.textContent = String(callNo);
        callNo += 1;
      } else {
        badge.textContent = '—';
      }
      li.classList.toggle('pr-item--off', !included);
    }
    // Flechas deshabilitadas en los extremos.
    const items = [...playListEl.children];
    items.forEach((li, index) => {
      const up = li.querySelector('[data-move="-1"]');
      const down = li.querySelector('[data-move="1"]');
      if (up) up.disabled = index === 0;
      if (down) down.disabled = index === items.length - 1;
    });
  }

  function selectedPlays() {
    return ui.order.filter((play) => ui.selected.has(play.id));
  }

  function callNumberOf(target) {
    let callNo = ui.startNumber;
    for (const play of ui.order) {
      if (play.id === target.id) return callNo;
      if (ui.selected.has(play.id)) callNo += 1;
    }
    return ui.startNumber;
  }

  function buildOpts() {
    const opts = {
      size: ui.size,
      cardWidth: ui.customW,
      cardHeight: ui.customH,
      cardWcm: ui.customWcm,
      cardHcm: ui.customHcm,
      paper: ui.paper,
      playsPerCard: ui.playsPerCard,
      showDiagram: ui.showDiagram,
      showName: ui.showName,
      showNumber: ui.showNumber,
      showNotes: ui.showNotes,
      showDefense: ui.showDefense,
      cutLines: ui.cutLines,
      startNumber: ui.startNumber,
      title: resolved.defaults.title || '',
      team: resolved.defaults.team || '',
      bookName: resolved.defaults.bookName || playbook.name,
      date: resolved.defaults.date,
    };
    // La rejilla elegida manda en la muñequera (con la celda ajustándose) y en
    // la hoja de jugadas; en las tarjetas de bolsillo el tamaño se calcula solo.
    if (ui.type === 'wristband') {
      opts.cols = ui.cols;
      opts.rows = ui.rows;
    } else if (ui.type === 'sheet') {
      opts.cols = ui.cols || 2;
      opts.rows = ui.rows || 2;
    }
    return opts;
  }

  function buildSheetHTML() {
    const chosen = selectedPlays();
    if (!chosen.length) return '';
    const opts = buildOpts();
    switch (ui.type) {
      case 'wristband':
        return renderWristbandSheet(chosen, opts);
      case 'sheet':
        if (ui.cols * ui.rows > 1) return renderPlayGridSheet(chosen, opts);
        return chosen
          .map((play) => renderPlaySheet(play, { ...opts, callNumber: callNumberOf(play) }))
          .join('\n');
      case 'callsheet':
        return renderCallSheet(playbook, { ...opts, plays: chosen });
      case 'pockets':
        return renderPocketCards(chosen, opts);
      default:
        return '';
    }
  }

  function countPages(html) {
    return (String(html || '').match(/<section class="pr-page/g) || []).length;
  }

  // --- vista previa ---------------------------------------------------------

  function updateScale() {
    if (closed) return;
    const pageEl = sheetEl.querySelector('.pr-page');
    if (!pageEl) {
      scaleEl.style.transform = '';
      scaleEl.style.width = '';
      scaleEl.style.height = '';
      wrapEl.style.width = '';
      wrapEl.style.height = '';
      return;
    }
    const naturalW = sheetEl.offsetWidth || pageEl.offsetWidth || 1;
    const naturalH = sheetEl.offsetHeight || pageEl.offsetHeight || 1;
    const available = Math.max(120, previewEl.clientWidth - 36);
    const scale = Math.min(1, Math.max(0.12, available / naturalW));
    scaleEl.style.transformOrigin = 'top left';
    scaleEl.style.transform = `scale(${scale})`;
    scaleEl.style.width = `${naturalW}px`;
    scaleEl.style.height = `${naturalH}px`;
    wrapEl.style.width = `${Math.ceil(naturalW * scale)}px`;
    wrapEl.style.height = `${Math.ceil(naturalH * scale)}px`;
  }

  function scheduleInject() {
    const inject = () => {
      previewRaf = 0;
      if (closed) return;
      if (!lastHTML) {
        sheetEl.innerHTML =
          '<p class="pr-preview-empty">Selecciona al menos una jugada para ver la vista previa.</p>';
      } else {
        sheetEl.innerHTML = lastHTML;
      }
      requestAnimationFrame(updateScale);
    };
    if (typeof requestAnimationFrame !== 'function') {
      inject();
      return;
    }
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(inject);
  }

  function refresh() {
    applyVisibility();
    syncSegments();
    refreshNumbers();
    lastHTML = buildSheetHTML();
    const pageCount = countPages(lastHTML);
    const chosen = selectedPlays();
    const pageWord = pageCount === 1 ? 'página' : 'páginas';
    pagesEl.textContent = pageCount ? `${pageCount} ${pageWord}` : '';
    summaryEl.textContent = chosen.length
      ? `${chosen.length} ${chosen.length === 1 ? 'jugada seleccionada' : 'jugadas seleccionadas'} · ${pageCount} ${pageWord}`
      : 'Ninguna jugada seleccionada';
    printBtn.disabled = !lastHTML;
    scheduleInject();
  }

  // --- eventos --------------------------------------------------------------

  function onPanelClick(event) {
    const target = event.target.closest('[data-pr-close]');
    if (target) {
      close();
      return;
    }
    if (event.target.closest('[data-pr-print]')) {
      doPrint();
      return;
    }
    if (event.target.closest('[data-pr-all]')) {
      for (const play of ui.order) ui.selected.add(play.id);
      for (const li of playListEl.children) {
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = true;
      }
      refresh();
      return;
    }
    if (event.target.closest('[data-pr-none]')) {
      ui.selected.clear();
      for (const li of playListEl.children) {
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = false;
      }
      refresh();
      return;
    }
    const move = event.target.closest('[data-move]');
    if (move) {
      const li = move.closest('.pr-item');
      const index = ui.order.findIndex((play) => play.id === li.dataset.id);
      const delta = Number(move.dataset.move);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= ui.order.length) return;
      const [moved] = ui.order.splice(index, 1);
      ui.order.splice(next, 0, moved);
      if (delta < 0) playListEl.insertBefore(li, li.previousElementSibling);
      else playListEl.insertBefore(li.nextElementSibling, li);
      refresh();
      return;
    }
    const segment = event.target.closest('.pr-seg-btn');
    if (segment) {
      const field = segment.parentElement.dataset.prField;
      const raw = segment.dataset.value;
      ui[field] = field === 'playsPerCard' ? Number(raw) : raw;
      refresh();
    }
  }

  function onPanelChange(event) {
    const field = event.target.dataset.prField;
    if (!field) return;
    if (event.target.type === 'checkbox') {
      ui[field] = event.target.checked;
    } else if (field === 'paper') {
      ui.paper = event.target.value === 'Letter' ? 'Letter' : 'A4';
    } else if (field === 'cols' || field === 'rows') {
      ui[field] = clampInt(event.target.value, 1, 8, ui[field]);
    } else if (field === 'colsW' || field === 'rowsW') {
      const key = field === 'colsW' ? 'cols' : 'rows';
      ui[key] = clampInt(event.target.value, 0, 12, 0);
    } else if (field === 'size') {
      ui.size = event.target.value;
    } else if (field === 'startNumber') {
      ui.startNumber = Math.round(clamp(event.target.value, 0, 999));
    } else if (field === 'customW' || field === 'customH') {
      ui[field] = clamp(event.target.value, 1, 12);
    } else if (field === 'customWcm' || field === 'customHcm') {
      ui[field] = clamp(event.target.value, 1, 40);
    }
    refresh();
  }

  function onPanelInput(event) {
    const field = event.target.dataset.prField;
    const conocidos = ['customW', 'customH', 'customWcm', 'customHcm', 'startNumber'];
    if (!conocidos.includes(field)) return;
    if (field === 'startNumber') ui.startNumber = Math.round(clamp(event.target.value, 0, 999));
    else if (field === 'customWcm' || field === 'customHcm') ui[field] = clamp(event.target.value, 1, 40);
    else ui[field] = clamp(event.target.value, 1, 12);
    refresh();
  }

  function doPrint() {
    if (!lastHTML) return;
    installPrintStyles({ paper: ui.paper });
    printNow(lastHTML, { paper: ui.paper });
    close();
  }

  // --- accesibilidad: foco atrapado y teclado -------------------------------

  function focusable() {
    return [...panel.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(
      (element) => !element.disabled && element.getClientRects().length > 0
    );
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !panel.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !panel.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  function onBackdropClick(event) {
    if (event.target === overlay) close();
  }

  function onResize() {
    if (closed) return;
    requestAnimationFrame(updateScale);
  }

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize);
    if (previewRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(previewRaf);
    if (resizeObserver) resizeObserver.disconnect();
    host.remove();
    if (currentDialog && currentDialog.element === host) currentDialog = null;
    try {
      if (extra && typeof extra.onClose === 'function') extra.onClose();
    } catch (e) {
      console.warn('[imprimir] onClose', e);
    }
    if (previousFocus && typeof previousFocus.focus === 'function') {
      try {
        previousFocus.focus();
      } catch {
        /* noop */
      }
    }
  }

  // --- arranque -------------------------------------------------------------

  panel.addEventListener('click', onPanelClick);
  panel.addEventListener('change', onPanelChange);
  panel.addEventListener('input', onPanelInput);
  overlay.addEventListener('mousedown', onBackdropClick);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);

  let resizeObserver = null;
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => updateScale());
    resizeObserver.observe(previewEl);
  }

  syncInputs();
  refresh();

  const initialFocus =
    host.querySelector('input[type="radio"]:checked') ||
    host.querySelector('input, select, button') ||
    panel;
  requestAnimationFrame(() => {
    if (!closed) initialFocus.focus();
  });

  currentDialog = { close, element: host };
  return currentDialog;
}
