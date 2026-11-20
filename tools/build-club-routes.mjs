// Convierte lo extraído de los PDFs del club en jugadas usables para la app.
// - Ajusta cada ruta dibujada a la plantilla de ruta más parecida de las 28.
// - Reconstruye la jugada con las posiciones de los jugadores detectadas.
// - Escribe src/club-plays.js
import fs from 'node:fs';
import { ROUTES } from '../src/presets.js';

const ENTRADA = 'qa/club-extraido.json';
const SALIDA = 'src/club-plays.js';

const raw = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));

/** Remuestrea una polilínea a N puntos equidistantes por longitud de arco. */
function resample(points, n = 12) {
  if (!points.length) return [];
  const pts = [{ x: 0, y: 0 }, ...points];
  const segLens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segLens.push(d);
    total += d;
  }
  if (total < 0.001) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const out = [];
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    let acc = 0;
    let i = 1;
    while (i < segLens.length && acc + segLens[i - 1] < target) {
      acc += segLens[i - 1];
      i++;
    }
    const seg = segLens[i - 1] || total;
    const t = seg > 0 ? (target - acc) / seg : 0;
    out.push({
      x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
      y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
    });
  }
  return out;
}

/** Distancia de forma entre dos rutas, normalizadas por su profundidad. */
function shapeDistance(a, b) {
  const ra = resample(a);
  const rb = resample(b);
  const scale = (arr) => {
    const depth = Math.max(1, Math.max(...arr.map((p) => Math.abs(p.y))));
    return arr.map((p) => ({ x: p.x / depth, y: p.y / depth }));
  };
  const na = scale(ra);
  const nb = scale(rb);
  let sum = 0;
  for (let i = 0; i < na.length; i++) sum += Math.hypot(na[i].x - nb[i].x, na[i].y - nb[i].y);
  return sum / na.length;
}

/** Plantilla de ruta más parecida a una polilínea (yardas). */
function nearestRoute(points) {
  let best = null;
  let bestDist = Infinity;
  for (const route of ROUTES) {
    const d = shapeDistance(points, route.points);
    if (d < bestDist) {
      bestDist = d;
      best = route;
    }
  }
  return { route: best, dist: bestDist };
}

const UMBRAL = 0.34; // por encima, la ruta no se parece a ninguna plantilla
let totalRutas = 0;
let asignadas = 0;
const porPlantilla = {};
const jugadasSalida = [];
const sinAjustar = [];

for (const jugada of raw) {
  const jugadores = [];
  const rutas = {};
  for (const punto of jugada.jugadores) {
    if (jugadores.some((p) => p.label === punto.label)) continue;
    jugadores.push(punto);
  }
  for (const ruta of jugada.rutas) {
    totalRutas++;
    const { route, dist } = nearestRoute(ruta.puntos);
    if (!route || dist > UMBRAL) {
      sinAjustar.push({ jugada: `${jugada.pdf} ${jugada.titulo}`, label: ruta.label, tipo: ruta.tipo, dist });
      continue;
    }
    asignadas++;
    porPlantilla[route.id] = (porPlantilla[route.id] || 0) + 1;
    rutas[ruta.label] = route.id;
  }
  const conRuta = Object.keys(rutas).length;
  if (conRuta < 2) continue;
  jugadasSalida.push({
    id: `club-${jugadasSalida.length + 1}`,
    name: `${jugada.pdf.replace(/^Playbook\s*/i, '')} ${jugada.titulo || jugadasSalida.length + 1}`,
    players: jugadores,
    routes: rutas,
    source: jugada.pdf,
  });
}

console.log(`rutas dibujadas: ${totalRutas} | ajustadas a plantilla: ${asignadas} (${Math.round((asignadas / totalRutas) * 100)}%)`);
console.log('plantillas más usadas:', Object.entries(porPlantilla).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}:${v}`).join(', '));
console.log(`jugadas reconstruidas: ${jugadasSalida.length}`);
console.log(`rutas fuera de catálogo: ${sinAjustar.length}`);

const lineas = [
  '// Jugadas del club reconstruidas desde los playbooks PDF (vectoriales).',
  '// Generado por tools/build-club-routes.mjs: no editar a mano.',
  '// Cada jugada se declara con la formación de la app más parecida, las',
  '// posiciones detectadas y la plantilla de ruta asignada a cada jugador.',
  '',
  'export const CLUB_PLAYS = [',
];
for (const j of jugadasSalida) {
  const jug = j.players
    .map((p) => `{ label: '${p.label}', x: ${Number(p.x).toFixed(1)}, y: ${Math.max(0, Number(p.y)).toFixed(1)} }`)
    .join(', ');
  const rutas = Object.entries(j.routes)
    .map(([label, id]) => `${label}: '${id}'`)
    .join(', ');
  lineas.push('  {');
  lineas.push(`    id: '${j.id}',`);
  lineas.push(`    name: ${JSON.stringify(j.name)},`);
  lineas.push(`    source: ${JSON.stringify(j.source)},`);
  lineas.push(`    players: [${jug}],`);
  lineas.push(`    routes: { ${rutas} },`);
  lineas.push('  },');
}
lineas.push('];');
lineas.push('');
fs.writeFileSync(SALIDA, lineas.join('\n'), 'utf8');
console.log(`escrito ${SALIDA} (${fs.statSync(SALIDA).size} bytes)`);
