// ============================================================================
// FlagPlays · src/presets.js — contenido de dominio (datos puros, sin DOM)
// ----------------------------------------------------------------------------
// SISTEMA DE COORDENADAS (todo en yardas)
//   x = 0 es el centro del campo; +x = derecha de la ofensiva.
//   y = 0 es la línea de scrimmage (LOS); +y = campo profundo.
//   Jugadores y puntos de ruta se guardan relativos al LOS: la misma jugada
//   sirve desde cualquier yarda y solo el renderer convierte a píxeles.
//
// ROUTES: los `points` son DELTAS desde la posición inicial del receptor
//   (0,0 = su alineación en la formación). Por eso la misma plantilla vale
//   para cualquier formación: al montar una jugada se suma la alineación del
//   receptor y se recorta al ancho del campo. `mirror:true` significa que la
//   ruta admite reflejo izquierda/derecha (se niega x); las rutas verticales
//   o simétricas no lo llevan.
//
// FLAG: el center es ELEGIBLE (puede salir de ruta) y no existe el bloqueo;
//   las rutas llamadas "block" son obstrucciones legales / rub para liberar
//   al compañero, nunca contacto.
//
// Reglas de dibujo usadas en todos los presets:
//   · 5v5: ancho jugable 30 yd (x entre -14 y 14), fondo 24 yd.
//   · 7v7: ancho jugable 40 yd (x entre -19 y 19), fondo 26 yd.
//   · QB en escopeta a 4-5 yd del center; receptores abiertos a 10-15 yd del
//     centro y slots a 4-7 yd del center.
// ============================================================================

import { createPlay, createPlayer, defaultField } from './model.js';

/** Orden canónico de las categorías de ruta (se usa también en la UI). */
export const ROUTE_CATEGORIES = ['Corta', 'Media', 'Profunda', 'Carrera', 'Engaño'];

const SLOT_NUMBERS = { QB: '1', C: '2', X: '3', Y: '4', Z: '5', H: '6', R: '7', TE: '8' };
const DEFENSE_FORMAT = 5;
const DEFENSE_FORMAT_7 = 7;

// ---------------------------------------------------------------------------
// 1. ROUTES — plantillas de ruta en yardas, relativas al receptor (deltas)
// ---------------------------------------------------------------------------
export const ROUTES = [
  {
    id: 'slant',
    name: 'Slant / Inclinada',
    category: 'Corta',
    mirror: true,
    desc: 'Dos pasos verticales y corte diagonal al interior: ataca el hueco entre el esquinero y el linebacker.',
    points: [{ x: 0, y: 2 }, { x: 4.5, y: 6 }],
  },
  {
    id: 'out',
    name: 'Out / Salida',
    category: 'Corta',
    mirror: true,
    desc: 'Siete yardas verticales y salida perpendicular al exterior: golpea la zona plana por delante del esquinero.',
    points: [{ x: 0, y: 7 }, { x: -5.5, y: 7 }],
  },
  {
    id: 'in',
    name: 'In / Dig',
    category: 'Media',
    mirror: true,
    desc: 'Once yardas verticales y corte al interior (dig): se sienta detrás del linebacker y delante del safety.',
    points: [{ x: 0, y: 11 }, { x: 12, y: 11 }],
  },
  {
    id: 'post',
    name: 'Post',
    category: 'Profunda',
    mirror: true,
    desc: 'Doce yardas verticales y corte al poste: ataca la banda interior profunda entre los dos profundos.',
    points: [{ x: 0, y: 12 }, { x: 11, y: 23 }],
  },
  {
    id: 'corner',
    name: 'Corner / Esquina',
    category: 'Profunda',
    mirror: true,
    desc: 'Doce yardas verticales y corte a la esquina: busca la ventana exterior profunda de Cover 2.',
    points: [{ x: 0, y: 12 }, { x: -9.5, y: 22 }],
  },
  {
    id: 'go',
    name: 'Go / Fly / Vertical',
    category: 'Profunda',
    desc: 'Ruta vertical de 20-22 yardas: obliga al profundo a respetar la amenaza larga y abre todo lo de dentro.',
    points: [{ x: 0, y: 7 }, { x: 0, y: 21 }],
  },
  {
    id: 'curl',
    name: 'Curl / Gancho',
    category: 'Media',
    desc: 'Diez yardas verticales y vuelta de dos yardas: se sienta en el hueco entre la plana y el profundo.',
    points: [{ x: 0, y: 5 }, { x: 0, y: 10 }, { x: 0, y: 8 }],
  },
  {
    id: 'comeback',
    name: 'Comeback',
    category: 'Media',
    mirror: true,
    desc: 'Catorce yardas verticales y vuelta de tres yardas al exterior: ataca al esquinero que no puede girar.',
    points: [{ x: 0, y: 8 }, { x: 0, y: 14 }, { x: -3, y: 11 }],
  },
  {
    id: 'drag',
    name: 'Drag / Cruzada',
    category: 'Media',
    mirror: true,
    desc: 'Cruce bajo de 20 yardas a 1-2 yardas de profundidad: malla contra hombre y arrastra la mirada del linebacker.',
    points: [{ x: 0, y: 1.5 }, { x: 19, y: 2 }],
  },
  {
    id: 'wheel',
    name: 'Wheel / Rueda',
    category: 'Profunda',
    mirror: true,
    desc: 'Dos yardas al exterior y vertical de 15: la rueda clásica que ataca al flat defender por detrás.',
    points: [{ x: -2, y: 0 }, { x: -2, y: 15 }],
  },
  {
    id: 'flat',
    name: 'Flat / Plana',
    category: 'Corta',
    mirror: true,
    desc: 'Plana de 5-6 yardas al exterior a poca profundidad: válvula del mariscal y ataque directo al flat.',
    points: [{ x: -3, y: 1 }, { x: -5.5, y: 2 }],
  },
  {
    id: 'screen',
    name: 'Screen / Pantalla',
    category: 'Corta',
    mirror: true,
    desc: 'Pantalla: un paso atrás y tres yardas al exterior para recibir por detrás de la línea de scrimmage.',
    points: [{ x: 0, y: -1 }, { x: -3, y: -2 }],
  },
  {
    id: 'swing',
    name: 'Swing',
    category: 'Corta',
    mirror: true,
    desc: 'Balanceo del corredor hacia el exterior: recibe en carrera con espacio por delante.',
    points: [{ x: 0, y: -1 }, { x: -5, y: 1.5 }],
  },
  {
    id: 'seam',
    name: 'Seam / Costura',
    category: 'Profunda',
    desc: 'Costura vertical entre las hashes: ataca el hueco entre los dos profundos de Cover 2.',
    points: [{ x: 0, y: 4 }, { x: 0, y: 20 }],
  },
  {
    id: 'fade',
    name: 'Fade',
    category: 'Profunda',
    mirror: true,
    desc: 'Vertical por el exterior con ligera inclinación a la banda: pase de conversión y de ancho.',
    points: [{ x: 0, y: 5 }, { x: -2, y: 20 }],
  },
  {
    id: 'zigzag',
    name: 'Zig-Zag',
    category: 'Media',
    mirror: true,
    desc: 'Zig-zag: entra cuatro yardas y vuelve a salir al exterior para separarse del esquinero.',
    points: [{ x: 0, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 12 }],
  },
  {
    id: 'post-corner',
    name: 'Post-Corner',
    category: 'Profunda',
    mirror: true,
    desc: 'Doble corte: post a 10 yardas y esquina a 23; el clásico para castigar al safety que se compromete.',
    points: [{ x: 0, y: 10 }, { x: 6, y: 16 }, { x: -2, y: 23 }],
  },
  {
    id: 'double-move',
    name: 'Double Move',
    category: 'Engaño',
    mirror: true,
    desc: 'Doble movimiento (in-and-up): vende el corte interior y sale vertical por fuera cuando el esquinero muerde.',
    points: [{ x: 0, y: 3 }, { x: 4, y: 6 }, { x: 3, y: 20 }],
  },
  {
    id: 'pivot',
    name: 'Pivot',
    category: 'Corta',
    mirror: true,
    desc: 'Cinco yardas y pivote de vuelta al mariscal: se sienta en el hueco corto contra zona blanda.',
    points: [{ x: 0, y: 5 }, { x: 1.5, y: 3 }],
  },
  {
    id: 'chair',
    name: 'Chair',
    category: 'Media',
    mirror: true,
    desc: 'Corte interior a seis yardas y vertical: dibuja una silla para liberar al receptor del slot.',
    points: [{ x: 0, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 14 }],
  },
  {
    id: 'return',
    name: 'Return',
    category: 'Corta',
    desc: 'Seis yardas verticales y vuelta al origen: ruta de asentamiento corta contra zona blanda.',
    points: [{ x: 0, y: 6 }, { x: 0, y: 2 }],
  },
  {
    id: 'block',
    name: 'Block / Obstrucción',
    category: 'Corta',
    desc: 'Obstrucción legal: en flag no hay bloqueo; el receptor se cruza para liberar al compañero (rub/pick) y después suelta.',
    points: [{ x: 0, y: 0.5 }, { x: 0, y: 3 }],
  },
  {
    id: 'motion',
    name: 'Motion / Jet',
    category: 'Engaño',
    mirror: true,
    desc: 'Movimiento previo al snap por detrás de la línea y salida al exterior: base del jet sweep.',
    points: [{ x: 0, y: -3 }, { x: -4, y: -2 }, { x: -6, y: 2 }],
  },
  {
    id: 'handoff',
    name: 'Handoff / Entrega',
    category: 'Carrera',
    mirror: true,
    desc: 'Entrega al corredor: dos pasos de embarque y corte al hueco entre el center y el tackle.',
    points: [{ x: 0, y: 4 }, { x: 2, y: 10 }],
  },
  {
    id: 'rub',
    name: 'Rub / Roce',
    category: 'Engaño',
    mirror: true,
    desc: 'Roce: cruza la cara del defensor para liberar al compañero del stack sin llegar a tocarlo.',
    points: [{ x: 0, y: 2 }, { x: 3, y: 4 }, { x: 6, y: 5 }],
  },
  {
    id: 'arrow',
    name: 'Arrow / Flecha',
    category: 'Corta',
    mirror: true,
    desc: 'Flecha corta: un paso y corte al interior para conversión y zona de gol.',
    points: [{ x: 0, y: 1 }, { x: 3, y: 4 }],
  },
  {
    id: 'cutback',
    name: 'Corte / Cutback',
    category: 'Carrera',
    mirror: true,
    desc: 'Corte interior del corredor: un paso al hueco y cambio de dirección al lado débil.',
    points: [{ x: 0, y: 2 }, { x: 4, y: 9 }],
  },
  {
    id: 'jet',
    name: 'Jet Sweep / Barrido',
    category: 'Carrera',
    mirror: true,
    desc: 'Barrido jet: recibe en movimiento y ataca el borde exterior con la obstrucción del resto de receptores.',
    points: [{ x: -4, y: -2 }, { x: -8, y: 0 }, { x: -8, y: 6 }],
  },
];

// ---------------------------------------------------------------------------
// 2. DEFENSES — defensas completas con asignaciones de preset
//    Assignment de preset: {type:'man', markLabel} | {type:'zone', landmark, depth}
//    | {type:'rush', lane}. buildDefensePlayers() los convierte en Player reales
//    resolviendo 'markLabel' contra la formación ofensiva que se le pase.
// ---------------------------------------------------------------------------
export const DEFENSES = [
  {
    id: 'cover-0',
    name: 'Cover 0 - Hombre a Todo',
    format: DEFENSE_FORMAT,
    category: 'Hombre',
    tags: ['5v5', 'defensa', 'hombre', 'cobertura 0'],
    vsFormation: 'spread-5',
    desc: 'Hombre a todo el campo con un solo rusher y sin ayuda profunda: si el receptor gana por dentro, el castigo es touchdown.',
    players: [
      { label: 'R1', role: 'dl', x: 0, y: 1, assignment: { type: 'rush', lane: 1 } },
      { label: 'CB1', role: 'db', x: -10, y: 1.5, assignment: { type: 'man', markLabel: 'X' } },
      { label: 'CB2', role: 'db', x: 10, y: 1.5, assignment: { type: 'man', markLabel: 'Y' } },
      { label: 'NB', role: 'db', x: 5, y: 2, assignment: { type: 'man', markLabel: 'Z' } },
      { label: 'LB', role: 'lb', x: 0, y: 3, assignment: { type: 'man', markLabel: 'C' } },
    ],
  },
  {
    id: 'cover-1',
    name: 'Cover 1 - Hombre con Safety Libre',
    format: DEFENSE_FORMAT,
    category: 'Hombre',
    tags: ['5v5', 'defensa', 'hombre', 'cobertura 1'],
    vsFormation: 'spread-5',
    desc: 'Cobertura individual por debajo con un safety libre profundo: la cobertura más agresiva que conserva ayuda por detrás.',
    players: [
      { label: 'R1', role: 'dl', x: -1, y: 1, assignment: { type: 'rush', lane: 1 } },
      { label: 'CB1', role: 'db', x: -10, y: 1.5, assignment: { type: 'man', markLabel: 'X' } },
      { label: 'CB2', role: 'db', x: 10, y: 1.5, assignment: { type: 'man', markLabel: 'Y' } },
      { label: 'NB', role: 'db', x: 5, y: 2.5, assignment: { type: 'man', markLabel: 'Z' } },
      { label: 'S', role: 's', x: 0, y: 13, assignment: { type: 'zone', landmark: { x: 0, y: 13 }, depth: 13 } },
    ],
  },
  {
    id: 'cover-2',
    name: 'Cover 2 - Dos Profundos',
    format: DEFENSE_FORMAT,
    category: 'Zona',
    tags: ['5v5', 'defensa', 'zona', 'cobertura 2'],
    vsFormation: 'spread-5',
    desc: 'Dos esquineros en mitades profundas y dos linebackers en las ventanas cortas: la zona clásica contra el pase corto.',
    players: [
      { label: 'R1', role: 'dl', x: -1, y: 1, assignment: { type: 'rush', lane: 1 } },
      { label: 'CB1', role: 'db', x: -11, y: 11, assignment: { type: 'zone', landmark: { x: -12, y: 11 }, depth: 11 } },
      { label: 'CB2', role: 'db', x: 11, y: 11, assignment: { type: 'zone', landmark: { x: 12, y: 11 }, depth: 11 } },
      { label: 'LB1', role: 'lb', x: -5, y: 4.5, assignment: { type: 'zone', landmark: { x: -6, y: 4.5 }, depth: 4.5 } },
      { label: 'LB2', role: 'lb', x: 5, y: 4.5, assignment: { type: 'zone', landmark: { x: 6, y: 4.5 }, depth: 4.5 } },
    ],
  },
  {
    id: 'cover-3',
    name: 'Cover 3 - Tres Profundos',
    format: DEFENSE_FORMAT,
    category: 'Zona',
    tags: ['5v5', 'defensa', 'zona', 'cobertura 3'],
    vsFormation: 'spread-5',
    desc: 'Tres defensas en tercios profundos con el linebacker en el gancho: protege la vertical y deja la plana como ventana.',
    players: [
      { label: 'R1', role: 'dl', x: 0, y: 1, assignment: { type: 'rush', lane: 1 } },
      { label: 'CB1', role: 'db', x: -11, y: 10, assignment: { type: 'zone', landmark: { x: -12, y: 12 }, depth: 12 } },
      { label: 'S', role: 's', x: 0, y: 14, assignment: { type: 'zone', landmark: { x: 0, y: 14 }, depth: 14 } },
      { label: 'CB2', role: 'db', x: 11, y: 10, assignment: { type: 'zone', landmark: { x: 12, y: 12 }, depth: 12 } },
      { label: 'LB', role: 'lb', x: 0, y: 5, assignment: { type: 'zone', landmark: { x: 0, y: 5 }, depth: 5 } },
    ],
  },
  {
    id: 'cover-4',
    name: 'Cover 4 - Cuatro Profundos',
    format: DEFENSE_FORMAT,
    category: 'Zona',
    tags: ['5v5', 'defensa', 'zona', 'cobertura 4'],
    vsFormation: 'spread-5',
    desc: 'Cuatro defensas en cuartos profundos con un rusher: cierra todo por detrás y regala las ventanas cortas.',
    players: [
      { label: 'R1', role: 'dl', x: 0, y: 1, assignment: { type: 'rush', lane: 1 } },
      { label: 'CB1', role: 'db', x: -12, y: 10, assignment: { type: 'zone', landmark: { x: -12, y: 10 }, depth: 10 } },
      { label: 'S1', role: 's', x: -4, y: 13, assignment: { type: 'zone', landmark: { x: -5, y: 13 }, depth: 13 } },
      { label: 'S2', role: 's', x: 4, y: 13, assignment: { type: 'zone', landmark: { x: 5, y: 13 }, depth: 13 } },
      { label: 'CB2', role: 'db', x: 12, y: 10, assignment: { type: 'zone', landmark: { x: 12, y: 10 }, depth: 10 } },
    ],
  },
  {
    id: 'blitz-2',
    name: 'Blitz de 2',
    format: DEFENSE_FORMAT,
    category: 'Presión',
    tags: ['5v5', 'defensa', 'blitz', 'presión'],
    vsFormation: 'trips-left-5',
    desc: 'Dos rushers y cobertura individual sin ayuda profunda: el mariscal tiene que decidir en menos de dos segundos.',
    players: [
      { label: 'R1', role: 'dl', x: -2, y: 1, assignment: { type: 'rush', lane: 0 } },
      { label: 'R2', role: 'dl', x: 2, y: 1, assignment: { type: 'rush', lane: 2 } },
      { label: 'CB1', role: 'db', x: -10, y: 2, assignment: { type: 'man', markLabel: 'X' } },
      { label: 'CB2', role: 'db', x: 10, y: 2, assignment: { type: 'man', markLabel: 'Y' } },
      { label: 'NB', role: 'db', x: 0, y: 3, assignment: { type: 'man', markLabel: 'Z' } },
    ],
  },
  {
    id: 'zone-23',
    name: 'Zona 2-3 Mixta',
    format: DEFENSE_FORMAT,
    category: 'Zona',
    tags: ['5v5', 'defensa', 'zona', 'mixta'],
    vsFormation: 'spread-5',
    desc: 'Shell de dos profundos y tres defensas en la caja: dos cortos en zona y el linebacker del medio rusheando; cierra las ventanas cortas y obliga a decidir rápido.',
    players: [
      { label: 'S1', role: 's', x: -10, y: 12, assignment: { type: 'zone', landmark: { x: -11, y: 12 }, depth: 12 } },
      { label: 'S2', role: 's', x: 10, y: 12, assignment: { type: 'zone', landmark: { x: 11, y: 12 }, depth: 12 } },
      { label: 'LB1', role: 'lb', x: -7, y: 4.5, assignment: { type: 'zone', landmark: { x: -7, y: 4.5 }, depth: 4.5 } },
      { label: 'LB2', role: 'lb', x: 7, y: 4.5, assignment: { type: 'zone', landmark: { x: 7, y: 4.5 }, depth: 4.5 } },
      { label: 'R1', role: 'dl', x: 0, y: 1, assignment: { type: 'rush', lane: 1 } },
    ],
  },
  {
    id: 'man-press',
    name: 'Man Press - Presión en la Línea',
    format: DEFENSE_FORMAT,
    category: 'Hombre',
    tags: ['5v5', 'defensa', 'hombre', 'press'],
    vsFormation: 'spread-5',
    desc: 'Presión individual en la línea: los esquineros agreden en los dos primeros pasos y el único rusher llega con ventaja.',
    players: [
      { label: 'R1', role: 'dl', x: 0, y: 1, assignment: { type: 'rush', lane: 1 } },
      { label: 'CB1', role: 'db', x: -10, y: 1, assignment: { type: 'man', markLabel: 'X' } },
      { label: 'CB2', role: 'db', x: 10, y: 1, assignment: { type: 'man', markLabel: 'Y' } },
      { label: 'NB', role: 'db', x: 5, y: 1, assignment: { type: 'man', markLabel: 'Z' } },
      { label: 'LB', role: 'lb', x: 0, y: 3.5, assignment: { type: 'man', markLabel: 'C' } },
    ],
  },
  {
    id: 'cover-2-7',
    name: 'Cover 2 7v7 - Dos Profundos',
    format: DEFENSE_FORMAT_7,
    category: 'Zona',
    tags: ['7v7', 'defensa', 'zona', 'cobertura 2'],
    vsFormation: 'four-open-rb-7',
    desc: 'Dos mitades profundas y cuatro defensas en las ventanas cortas (plana, gancho y gancho): la base de zona en 7v7.',
    players: [
      { label: 'R1', role: 'dl', x: -1, y: 1, assignment: { type: 'rush', lane: 1 } },
      { label: 'CB1', role: 'db', x: -15, y: 12, assignment: { type: 'zone', landmark: { x: -16, y: 12 }, depth: 12 } },
      { label: 'CB2', role: 'db', x: 15, y: 12, assignment: { type: 'zone', landmark: { x: 16, y: 12 }, depth: 12 } },
      { label: 'LB1', role: 'lb', x: -11, y: 4.5, assignment: { type: 'zone', landmark: { x: -12, y: 4.5 }, depth: 4.5 } },
      { label: 'LB2', role: 'lb', x: -4, y: 5.5, assignment: { type: 'zone', landmark: { x: -4, y: 5.5 }, depth: 5.5 } },
      { label: 'LB3', role: 'lb', x: 4, y: 5.5, assignment: { type: 'zone', landmark: { x: 4, y: 5.5 }, depth: 5.5 } },
      { label: 'LB4', role: 'lb', x: 11, y: 4.5, assignment: { type: 'zone', landmark: { x: 12, y: 4.5 }, depth: 4.5 } },
    ],
  },
  {
    id: 'cover-3-7',
    name: 'Cover 3 7v7 - Tres Profundos',
    format: DEFENSE_FORMAT_7,
    category: 'Zona',
    tags: ['7v7', 'defensa', 'zona', 'cobertura 3'],
    vsFormation: 'four-open-rb-7',
    desc: 'Tres tercios profundos con tres linebackers en las ventanas cortas: la cobertura más segura contra verticales en 7v7.',
    players: [
      { label: 'R1', role: 'dl', x: 0, y: 1, assignment: { type: 'rush', lane: 1 } },
      { label: 'CB1', role: 'db', x: -16, y: 11, assignment: { type: 'zone', landmark: { x: -17, y: 12 }, depth: 12 } },
      { label: 'S', role: 's', x: 0, y: 14, assignment: { type: 'zone', landmark: { x: 0, y: 14 }, depth: 14 } },
      { label: 'CB2', role: 'db', x: 16, y: 11, assignment: { type: 'zone', landmark: { x: 17, y: 12 }, depth: 12 } },
      { label: 'LB1', role: 'lb', x: -10, y: 5, assignment: { type: 'zone', landmark: { x: -10, y: 5 }, depth: 5 } },
      { label: 'LB2', role: 'lb', x: 0, y: 6, assignment: { type: 'zone', landmark: { x: 0, y: 6 }, depth: 6 } },
      { label: 'LB3', role: 'lb', x: 10, y: 5, assignment: { type: 'zone', landmark: { x: 10, y: 5 }, depth: 5 } },
    ],
  },
].map((defense) => ({ ...defense, type: 'defense' }));

// ---------------------------------------------------------------------------
// 3. FORMACIONES OFENSIVAS
//    5v5: 5 jugadores (QB + center elegible + 3 receptores).
//    7v7: 7 jugadores (QB + center + 4 receptores/ala + corredor).
// ---------------------------------------------------------------------------
const OFFENSE_FORMATIONS = [
  {
    id: 'spread-5',
    name: 'Spread 5v5',
    type: 'offense',
    format: 5,
    desc: 'Spread 5v5: center elegible que se suma a la salida, dos receptores abiertos y un slot a 5 yardas; QB en escopeta a 4-5 yardas.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -4.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -11, y: 0 },
      { label: 'Y', role: 'wr', x: 11, y: 0 },
      { label: 'Z', role: 'wr', x: 5, y: 0.5 },
    ],
  },
  {
    id: 'trips-right-5',
    name: 'Trips Derecha 5v5',
    type: 'offense',
    format: 5,
    desc: 'Trips derecha: tres amenazas al lado derecho (center incluido) y un receptor solo al lado débil; obliga a rotar al safety.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -4.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -11, y: 0 },
      { label: 'Y', role: 'wr', x: 5, y: 0 },
      { label: 'Z', role: 'wr', x: 10, y: 1 },
    ],
  },
  {
    id: 'trips-left-5',
    name: 'Trips Izquierda 5v5',
    type: 'offense',
    format: 5,
    desc: 'Trips izquierda: espejo de trips derecha; la tríada ataca la banda izquierda y deja un receptor solo al lado derecho.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -4.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -10, y: 1 },
      { label: 'Y', role: 'wr', x: -5, y: 0 },
      { label: 'Z', role: 'wr', x: 11, y: 0 },
    ],
  },
  {
    id: 'bunch-right-5',
    name: 'Bunch Derecha 5v5',
    type: 'offense',
    format: 5,
    desc: 'Bunch derecha: tres receptores apilados al mismo lado para generar roce y liberar al de dentro; el center es el primero de la agrupación.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -4.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -11, y: 0 },
      { label: 'Y', role: 'wr', x: 5.5, y: 0 },
      { label: 'Z', role: 'wr', x: 7.5, y: 1.5 },
    ],
  },
  {
    id: 'double-slot-5',
    name: 'Doble Slot 5v5',
    type: 'offense',
    format: 5,
    desc: 'Doble slot: dos slots a 5 yardas del center que atacan las costuras y la malla; un único receptor abierto al lado izquierdo.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -4.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -11, y: 0 },
      { label: 'Y', role: 'wr', x: -5, y: 0 },
      { label: 'Z', role: 'wr', x: 5, y: 0 },
    ],
  },
  {
    id: 'empty-5',
    name: 'Empty 5v5 (5 abiertos)',
    type: 'offense',
    format: 5,
    desc: 'Empty 5v5: cuatro receptores abiertos y ningún corredor; el mariscal lee coberturas puras desde la escopeta.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -4.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -11, y: 0 },
      { label: 'Y', role: 'wr', x: -4.5, y: 0.5 },
      { label: 'Z', role: 'wr', x: 11, y: 0 },
    ],
  },
  {
    id: 'stack-5',
    name: 'Stack Derecha 5v5',
    type: 'offense',
    format: 5,
    desc: 'Stack derecha: receptor apilado por detrás del otro para dobles movimientos y ruedas; obliga al esquinero a elegir.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -4.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -11, y: 0 },
      { label: 'Y', role: 'wr', x: 6, y: 0 },
      { label: 'Z', role: 'wr', x: 6, y: -2 },
    ],
  },
  {
    id: 'twins-5',
    name: 'Twins Derecha 5v5',
    type: 'offense',
    format: 5,
    desc: 'Twins derecha: dos receptores juntos al lado derecho y uno solo al izquierdo; el slot ataca la costura y la plana.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -4.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -11, y: 0 },
      { label: 'Y', role: 'wr', x: 10, y: 0 },
      { label: 'Z', role: 'wr', x: 5.5, y: 0 },
    ],
  },
  {
    id: 'conversion-5',
    name: 'Formación de Conversión 5v5',
    type: 'offense',
    format: 5,
    desc: 'Formación de conversión: receptores comprimidos a 4-5 yardas para rub, slant y out; el QB recibe más cerca del center.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -3.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -4.5, y: 0.5 },
      { label: 'Y', role: 'wr', x: 4.5, y: 0.5 },
      { label: 'Z', role: 'wr', x: 0, y: -1.5 },
    ],
  },
  {
    id: 'trey-7',
    name: 'Trey Derecha 7v7',
    type: 'offense',
    format: 7,
    desc: 'Trey 7v7: tres receptores a la derecha, uno solo a la izquierda y corredor en el backfield; la tríada manda.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -16, y: 0 },
      { label: 'H', role: 'wr', x: 4.5, y: 0.5 },
      { label: 'Y', role: 'wr', x: 9, y: 0 },
      { label: 'Z', role: 'wr', x: 14, y: 0.5 },
      { label: 'R', role: 'rb', x: -4, y: -2 },
    ],
  },
  {
    id: 'four-open-rb-7',
    name: 'Cuatro Abiertos + Corredor 7v7',
    type: 'offense',
    format: 7,
    desc: 'Cuatro abiertos + corredor: máxima amplitud con cuatro receptores repartidos y el corredor listo para la válvula.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -17, y: 0 },
      { label: 'Y', role: 'wr', x: 17, y: 0 },
      { label: 'Z', role: 'wr', x: -8, y: 0 },
      { label: 'H', role: 'wr', x: 8, y: 0 },
      { label: 'R', role: 'rb', x: -3, y: -2 },
    ],
  },
  {
    id: 'pistol-7',
    name: 'Pistol 7v7',
    type: 'offense',
    format: 7,
    desc: 'Pistol 7v7: mariscal en escopeta corta y corredor justo detrás; amenaza de entrega y de pase en la misma acción.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -3.5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'R', role: 'rb', x: 0, y: -6.5 },
      { label: 'X', role: 'wr', x: -16, y: 0 },
      { label: 'H', role: 'wr', x: -8, y: 0 },
      { label: 'Z', role: 'wr', x: 8, y: 0 },
      { label: 'Y', role: 'wr', x: 16, y: 0 },
    ],
  },
  {
    id: 'spread-7',
    name: 'Spread 7v7',
    type: 'offense',
    format: 7,
    desc: 'Spread 7v7: cuatro receptores abiertos, ala cerrada y corredor; la formación más equilibrada para leer la defensa.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -17, y: 0 },
      { label: 'Y', role: 'wr', x: 17, y: 0 },
      { label: 'Z', role: 'wr', x: -7, y: 0 },
      { label: 'TE', role: 'te', x: 7, y: 0 },
      { label: 'R', role: 'rb', x: -3, y: -2 },
    ],
  },
  {
    id: 'bunch-7',
    name: 'Bunch Derecha 7v7',
    type: 'offense',
    format: 7,
    desc: 'Bunch 7v7: tres receptores apilados a la derecha más corredor; juego de roce, rueda y play-action.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -16, y: 0 },
      { label: 'Y', role: 'wr', x: 6, y: 0 },
      { label: 'Z', role: 'wr', x: 8, y: 1.5 },
      { label: 'H', role: 'wr', x: 7, y: -2 },
      { label: 'R', role: 'rb', x: -4, y: -2 },
    ],
  },
  {
    id: 'trips-left-7',
    name: 'Trips Izquierda 7v7',
    type: 'offense',
    format: 7,
    desc: 'Trips izquierda 7v7: tríada a la izquierda y receptor solo a la derecha para atacar el lado débil con el corredor.',
    players: [
      { label: 'QB', role: 'qb', x: 0, y: -5 },
      { label: 'C', role: 'c', x: 0, y: 0 },
      { label: 'X', role: 'wr', x: -14, y: 0.5 },
      { label: 'H', role: 'wr', x: -9, y: 0 },
      { label: 'Y', role: 'wr', x: -4.5, y: 0.5 },
      { label: 'Z', role: 'wr', x: 16, y: 0 },
      { label: 'R', role: 'rb', x: 4, y: -2 },
    ],
  },
];

/**
 * FORMACIONES: ofensivas + defensivas en una sola lista (contrato de la app).
 * Las defensivas se derivan de DEFENSES para que posición y asignación no se
 * dupliquen a mano.
 */
export const FORMATIONS = [
  ...OFFENSE_FORMATIONS,
  ...DEFENSES.map((defense) => ({
    id: defense.id,
    name: defense.name,
    type: 'defense',
    format: defense.format,
    desc: defense.desc,
    players: defense.players.map((player) => ({
      label: player.label,
      role: player.role,
      x: player.x,
      y: player.y,
    })),
  })),
];

// ---------------------------------------------------------------------------
// Helpers de búsqueda y de plantillas
// ---------------------------------------------------------------------------

export function getFormation(id) {
  return FORMATIONS.find((formation) => formation.id === id) || null;
}

/**
 * Rutas propias de la libreta. Se registran al arrancar (y al cambiar) para que
 * cualquier vista que resuelva un `routeId` las encuentre: editor de árbol,
 * miniaturas, PDF…
 */
const CUSTOM_ROUTES = new Map();

/** Sustituye el conjunto de rutas propias disponibles a nivel global. */
export function registerCustomRoutes(list) {
  CUSTOM_ROUTES.clear();
  for (const route of Array.isArray(list) ? list : []) {
    if (route && route.id) CUSTOM_ROUTES.set(route.id, route);
  }
  return CUSTOM_ROUTES.size;
}

/** Todas las rutas propias registradas. */
export function customRoutes() {
  return [...CUSTOM_ROUTES.values()];
}

/** Ruta por id: primero las propias y si no, las plantillas. */
export function getRoute(id) {
  if (!id) return null;
  if (CUSTOM_ROUTES.has(id)) return CUSTOM_ROUTES.get(id);
  return ROUTES.find((route) => route.id === id) || null;
}

/** ¿Esa ruta es propia (no plantilla)? */
export function isCustomRoute(id) {
  return CUSTOM_ROUTES.has(id);
}

export function getDefense(id) {
  return DEFENSES.find((defense) => defense.id === id) || null;
}

/** Devuelve las rutas agrupadas por categoría, en el orden canónico. */
export function listRoutesByCategory() {
  const grouped = {};
  for (const category of ROUTE_CATEGORIES) grouped[category] = [];
  for (const route of ROUTES) {
    if (!grouped[route.category]) grouped[route.category] = [];
    grouped[route.category].push(route);
  }
  return grouped;
}

/**
 * Puntos de una plantilla de ruta (copias, nunca referencias internas).
 * `mirror` solo refleja las rutas marcadas con mirror:true: las verticales y
 * las simétricas se devuelven tal cual.
 */
export function routeTemplatePoints(routeId, mirror = false) {
  const route = getRoute(routeId);
  if (!route) return [];
  const flip = mirror === true && route.mirror === true;
  return route.points.map((point) => ({ x: flip ? -point.x : point.x, y: point.y }));
}

// ---------------------------------------------------------------------------
// Geometría auxiliar
// ---------------------------------------------------------------------------
function clampX(x, field) {
  const half = field.width / 2 - 0.5;
  return Math.max(-half, Math.min(half, x));
}

function clampRoutePoint(point, field) {
  return {
    x: clampX(point.x, field),
    y: Math.max(-5, Math.min(field.depth, point.y)),
  };
}

function resolveAssignment(spec, byLabel) {
  if (!spec || typeof spec !== 'object') {
    return { type: 'zone', landmark: { x: 0, y: 6 }, depth: 6 };
  }
  if (spec.type === 'man') {
    const markLabel = spec.markLabel ?? '';
    return {
      type: 'man',
      targetId: byLabel.get(markLabel) || null,
      markLabel,
    };
  }
  if (spec.type === 'zone') {
    return {
      type: 'zone',
      landmark: { x: Number(spec.landmark?.x) || 0, y: Number(spec.landmark?.y) || 0 },
      depth: Number(spec.depth) || 0,
    };
  }
  if (spec.type === 'rush') {
    return { type: 'rush', lane: spec.lane === 0 || spec.lane === 2 ? spec.lane : 1 };
  }
  if (spec.type === 'cover0' || spec.type === 'cover1' || spec.type === 'cover2' || spec.type === 'cover3') {
    return { type: spec.type };
  }
  return { type: 'zone', landmark: { x: 0, y: 6 }, depth: 6 };
}

function rushTargetPoint(assignment, field) {
  const lane = assignment?.lane ?? 1;
  const half = field.width / 2 - 4;
  const x = lane === 0 ? -half * 0.75 : lane === 2 ? half * 0.75 : 0;
  return { x, y: Math.min(6, field.depth - 4), curve: 'line' };
}

/**
 * Convierte los assignments de preset de una defensa en Player reales.
 * Si se pasa `offensePlay` (o un objeto con `players`), las asignaciones
 * `man` resuelven `markLabel` al id del receptor correspondiente.
 */
export function buildDefensePlayers(defenseId, offensePlay = null) {
  const defense = getDefense(defenseId);
  if (!defense) return [];
  const byLabel = new Map();
  const offensePlayers = Array.isArray(offensePlay?.players) ? offensePlay.players : [];
  for (const player of offensePlayers) {
    if (player.team === 'offense') byLabel.set(player.label, player.id);
  }
  const field = defaultField(defense.format);
  return defense.players.map((spec, index) => {
    const assignment = resolveAssignment(spec.assignment, byLabel);
    const path = assignment.type === 'rush' ? [rushTargetPoint(assignment, field)] : null;
    const pathType = assignment.type === 'rush' ? 'rush' : assignment.type === 'zone' ? 'zone' : 'route';
    return createPlayer({
      team: 'defense',
      role: spec.role,
      label: spec.label,
      number: spec.number || String(index + 1),
      pos: { x: clampX(spec.x, field), y: spec.y },
      path,
      pathType,
      assignment,
    });
  });
}

/**
 * Construye una jugada defensiva completa a partir de un preset. Si se pasa
 * `offensePlay`, conserva la ofensiva de esa jugada (con sus rutas) y resuelve
 * los hombres contra sus ids; si no, coloca la ofensiva de referencia del
 * preset para que el diagrama sea legible.
 */
export function buildDefenseFromPreset(defenseId, offensePlay = null) {
  const defense = getDefense(defenseId);
  if (!defense) return null;

  const sourceOffense = Array.isArray(offensePlay?.players)
    ? offensePlay.players.filter((player) => player.team === 'offense')
    : [];

  let offensePlayers;
  let field;
  if (sourceOffense.length) {
    field = { ...(offensePlay.field || defaultField(defense.format)) };
    offensePlayers = sourceOffense.map((player) =>
      createPlayer({
        ...player,
        pos: { ...player.pos },
        path: Array.isArray(player.path) ? player.path.map((point) => ({ ...point })) : null,
        assignment: null,
      })
    );
  } else {
    const formation = getFormation(defense.vsFormation) || OFFENSE_FORMATIONS[0];
    field = defaultField(formation.format);
    offensePlayers = formation.players.map((slot, index) =>
      createPlayer({
        team: 'offense',
        role: slot.role,
        label: slot.label,
        number: SLOT_NUMBERS[slot.label] || String(index + 1),
        pos: { x: slot.x, y: slot.y },
      })
    );
  }

  const defensePlayers = buildDefensePlayers(defenseId, { players: offensePlayers });
  const play = createPlay({
    name: defense.name,
    type: 'defense',
    formation: defenseId,
    category: defense.category || 'Zona',
    tags: Array.isArray(defense.tags) ? defense.tags.slice() : ['defensa'],
    notes: defense.desc || '',
    field,
    players: [...offensePlayers, ...defensePlayers],
    ball: {
      targetId: offensePlay?.ball?.targetId ?? null,
      releaseAt: offensePlay?.ball?.releaseAt ?? 1.2,
    },
  });
  if (play.ball.targetId && !play.players.some((player) => player.id === play.ball.targetId)) {
    play.ball.targetId = null;
  }
  return play;
}

// ---------------------------------------------------------------------------
// Construcción de jugadas ofensivas a partir de formación + rutas por etiqueta
// ---------------------------------------------------------------------------
function resolveRouteSpec(spec, slot) {
  const routeId = typeof spec === 'string' ? spec : spec?.id;
  const route = getRoute(routeId);
  if (!route) return null;
  const explicitMirror = typeof spec === 'object' && spec !== null ? spec.mirror : undefined;
  const mirror = explicitMirror == null ? route.mirror === true && slot.x > 0.5 : !!explicitMirror;
  return { route, mirror };
}

function buildRoutePath(slot, spec, field) {
  const resolved = resolveRouteSpec(spec, slot);
  if (!resolved) return null;
  const points = routeTemplatePoints(resolved.route.id, resolved.mirror);
  return points.map((point) => {
    const moved = clampRoutePoint({ x: slot.x + point.x, y: slot.y + point.y }, field);
    return { x: moved.x, y: moved.y, curve: 'line' };
  });
}

function makeOffensePlayer(slot, spec, field, index) {
  return createPlayer({
    team: 'offense',
    role: slot.role,
    label: slot.label,
    number: SLOT_NUMBERS[slot.label] || String(index + 1),
    pos: { x: slot.x, y: slot.y },
    path: spec ? buildRoutePath(slot, spec, field) : null,
    pathType: 'route',
  });
}

function pickTarget(players, label) {
  if (label) {
    const exact = players.find((player) => player.team === 'offense' && player.label === label);
    if (exact) return exact;
  }
  const withPath = players
    .filter((player) => player.team === 'offense' && player.role !== 'qb' && Array.isArray(player.path) && player.path.length)
    .sort((a, b) => b.path[b.path.length - 1].y - a.path[a.path.length - 1].y);
  return withPath[0] || null;
}

/**
 * `makeStarterPlay` es la fábrica local de jugadas: recibe una formación, las
 * rutas por etiqueta de receptor y la defensa esperada, y monta un Play
 * completo y validable. Evita escribir a mano cientos de líneas de coordenadas.
 *
 * config = {
 *   id?, name, type='offense', formationId, defenseId='cover-2',
 *   routes: { [label]: routeId | {id, mirror} }, targetLabel, releaseAt,
 *   category, tags, notes
 * }
 */
function makeStarterPlay(config) {
  const formation = getFormation(config.formationId);
  if (!formation || formation.type !== 'offense') {
    throw new Error(`makeStarterPlay: formación ofensiva desconocida "${config.formationId}"`);
  }
  const wantsDefense = config.defenseId !== null;
  const defense = wantsDefense ? getDefense(config.defenseId || 'cover-2') : null;
  if (wantsDefense && !defense) {
    throw new Error(`makeStarterPlay: defensa desconocida "${config.defenseId}"`);
  }

  const field = defaultField(formation.format);
  const routes = config.routes || {};
  const offensePlayers = formation.players.map((slot, index) =>
    makeOffensePlayer(slot, routes[slot.label], field, index)
  );
  const target = pickTarget(offensePlayers, config.targetLabel);
  const defensePlayers = defense ? buildDefensePlayers(defense.id, { players: offensePlayers }) : [];
  const type = config.type === 'defense' ? 'defense' : 'offense';

  return createPlay({
    id: config.id,
    name: config.name,
    type,
    formation: type === 'defense' && defense ? defense.id : formation.id,
    category: config.category,
    tags: config.tags,
    notes: config.notes,
    field,
    players: [...offensePlayers, ...defensePlayers],
    ball: {
      targetId: target ? target.id : null,
      releaseAt: Math.min(2.4, Math.max(0.7, Number(config.releaseAt ?? 1.2))),
    },
  });
}

// ---------------------------------------------------------------------------
// 4. STARTER_PLAYS — jugadas completas y jugables (ofensiva + defensa)
//    Variedad: corto, medio, profundo, carrera/jet, pantalla, conversión y engaño,
//    en 5v5 y 7v7.
// ---------------------------------------------------------------------------
const OFFENSE_STARTER_PLAYS = [
  makeStarterPlay({
    id: 'play_trips_wheel',
    name: 'Trips Derecha - Rueda y Vertical',
    formationId: 'trips-right-5',
    defenseId: 'cover-2',
    routes: { X: 'in', Y: 'wheel', Z: 'go', C: { id: 'flat', mirror: true } },
    targetLabel: 'Y',
    releaseAt: 2,
    category: 'Pase profundo',
    tags: ['5v5', 'trips', 'rueda', 'profundo'],
    notes: 'La rueda del slot ataca la banda exterior de Cover 2: si el esquinero se queda con el go de Z, Y sale sola por detrás. El mariscal abre con el pase corto al flat del center para que el linebacker muerda y después sube la mirada a la rueda. Tiempo de lanzamiento: dos segundos; si la presión llega antes, el dig de X por dentro es la válvula.',
  }),
  makeStarterPlay({
    id: 'play_spread_slant_out',
    name: 'Spread - Slant y Out',
    formationId: 'spread-5',
    defenseId: 'cover-3',
    routes: { X: 'slant', Y: 'curl', Z: 'out', C: 'flat' },
    targetLabel: 'X',
    releaseAt: 1.1,
    category: 'Pase corto',
    tags: ['5v5', 'spread', 'slant', 'out'],
    notes: 'Contra Cover 3 el slant de X se sienta justo delante del safety y detrás del esquinero: es el pase de tres pasos. El out de Z a siete yardas ataca al lateral que se abre demasiado; el mariscal lee al linebacker exterior. Si el esquinero de X presiona, el slant es todavía mejor porque el receptor gana la posición interior. El center en la plana izquierda es la válvula si la ventana se cierra.',
  }),
  makeStarterPlay({
    id: 'play_bunch_rub',
    name: 'Bunch Derecha - Roce y Gancho',
    formationId: 'bunch-right-5',
    defenseId: 'cover-1',
    routes: { X: 'post', Y: 'rub', Z: 'curl', C: 'block' },
    targetLabel: 'Z',
    releaseAt: 1.2,
    category: 'Pase corto',
    tags: ['5v5', 'bunch', 'roce', 'hombre'],
    notes: 'El rub de Y libera al gancho de Z contra hombre: el esquinero tiene que pelear el tráfico y llega tarde. El mariscal espera el segundo paso de Z y lanza a la ventana interior, no a la banda. Si la defensa cambia a zona, el curl de Z sigue siendo válido pero hay que esperar a que se asiente. El post de X es el castigo si el safety se queda mirando el bunch.',
  }),
  makeStarterPlay({
    id: 'play_stack_double_move',
    name: 'Stack - Doble Movimiento y Vertical',
    formationId: 'stack-5',
    defenseId: 'man-press',
    routes: { X: 'post', Y: 'double-move', Z: 'wheel', C: 'flat' },
    targetLabel: 'Y',
    releaseAt: 2.2,
    category: 'Juego de engaño',
    tags: ['5v5', 'stack', 'doble movimiento', 'press'],
    notes: 'Contra man press, el doble movimiento de Y vende el corte interior y sale vertical cuando el esquinero se compromete. El mariscal no debe lanzar antes del segundo corte: la ventana aparece a 18-20 yardas. La rueda de Z desde el stack mantiene ocupado al safety por fuera; si el safety se gira, el post de X está abierto. El center al flat es la válvula si la presión es inmediata.',
  }),
  makeStarterPlay({
    id: 'play_double_slot_mesh',
    name: 'Doble Slot - Malla',
    formationId: 'double-slot-5',
    defenseId: 'cover-2',
    routes: { X: 'go', Y: 'drag', Z: 'drag', C: 'flat' },
    targetLabel: 'Y',
    releaseAt: 1.3,
    category: 'Pase corto',
    tags: ['5v5', 'mesh', 'malla', 'zona'],
    notes: 'La malla cruza a Y y Z por debajo en sentidos opuestos: contra hombre el defensor no puede seguir al receptor a través del tráfico. El mariscal lee al linebacker del lado hacia el que corre el pase; si salta, el otro cruce queda libre. Hay que lanzar con el drop de tres pasos, antes de que los cruces se junten. El go de X estira la defensa y evita que el safety se meta en la malla.',
  }),
  makeStarterPlay({
    id: 'play_empty_verticals',
    name: 'Empty - Cuatro Verticales',
    formationId: 'empty-5',
    defenseId: 'cover-4',
    routes: { X: 'go', Y: 'seam', Z: 'fade', C: 'block' },
    targetLabel: 'Z',
    releaseAt: 2.2,
    category: 'Pase profundo',
    tags: ['5v5', 'empty', 'verticales', 'profundo'],
    notes: 'Cuatro verticales contra Cover 4 busca la costura entre el profundo y el esquinero: elige el lado donde el safety se abre más tarde. El fade de Z ataca la banda exterior y obliga al esquinero a girar los hombros; si lo hace, el pase va por fuera. El mariscal necesita el drop profundo y lanzar con anticipación a un punto, no al receptor. La obstrucción del center es la válvula si la presión llega con cuatro.',
  }),
  makeStarterPlay({
    id: 'play_conversion_rub',
    name: 'Conversión - Rub y Slant',
    formationId: 'conversion-5',
    defenseId: 'cover-0',
    routes: { X: 'slant', Y: 'out', Z: 'rub', C: 'flat' },
    targetLabel: 'X',
    releaseAt: 1,
    category: 'Conversión',
    tags: ['5v5', 'conversión', '2 puntos', 'rub'],
    notes: 'Desde la cinco, el rub de Z sobre el esquinero libera el slant de X: dos yardas de ventaja son suficientes. El mariscal lee el primer movimiento del esquinero; si se abre al out de Y, lanza al interior. No hace falta el pase heroico: la conversión se gana con el primer corte y el balón fuera rápido. Si la defensa juega zona, el out de Y a siete yardas es el pase más limpio.',
  }),
  makeStarterPlay({
    id: 'play_trips_screen',
    name: 'Trips Izquierda - Pantalla a Z',
    formationId: 'trips-left-5',
    defenseId: 'blitz-2',
    routes: { X: 'in', Y: 'slant', Z: 'screen', C: { id: 'flat', mirror: true } },
    targetLabel: 'Z',
    releaseAt: 0.8,
    category: 'Pase corto',
    tags: ['5v5', 'pantalla', 'presión', 'blitz'],
    notes: 'Contra blitz de dos, la pantalla a Z es la respuesta más rápida: el mariscal no espera y lanza al primer paso del receptor. Los receptores de dentro venden la ruta media para que el linebacker se retire antes de ir a obstruir. La pantalla necesita que Z atrape el balón por delante del bloqueador, no pegado a la banda. Si la defensa no presiona, la pantalla sigue siendo un pase de alta probabilidad.',
  }),
  makeStarterPlay({
    id: 'play_jet_sweep',
    name: 'Spread - Jet Sweep',
    formationId: 'spread-5',
    defenseId: 'cover-3',
    routes: { X: 'go', Y: 'post-corner', Z: 'jet', C: 'block' },
    targetLabel: 'Z',
    releaseAt: 0.8,
    category: 'Carrera',
    tags: ['5v5', 'carrera', 'jet', 'movimiento'],
    notes: 'Z llega en movimiento y recibe el balón en el cruce con el mariscal; el punto de entrega son dos yardas por detrás del center. El mariscal no bloquea: lee el borde y decide si la entrega va al exterior o si el receptor del lado contrario (X en el go) está solo. La carrera gana con el primer paso del receptor hacia dentro y el corte al borde después. Contra zona, el jet sweep obliga al linebacker a correr de espaldas y abre el play-action.',
  }),
  makeStarterPlay({
    id: 'play_trey_verticals',
    name: 'Trey Derecha - Verticales',
    formationId: 'trey-7',
    defenseId: 'cover-2-7',
    routes: { X: 'go', H: 'seam', Y: 'post', Z: 'fade', R: 'swing', C: 'block' },
    targetLabel: 'H',
    releaseAt: 2.4,
    category: 'Pase profundo',
    tags: ['7v7', 'trey', 'verticales', 'profundo'],
    notes: 'En 7v7 la costura de H ataca el hueco entre los dos profundos de Cover 2; el mariscal lanza cuando el safety del lado débil gira al post de Y. El fade de Z mantiene al esquinero abierto y aparta al safety de la ventana interior. El swing de R es la válvula si la presión llega. Si los dos profundos se abren, el pase va a la costura con anticipación.',
  }),
  makeStarterPlay({
    id: 'play_four_open_flood',
    name: 'Cuatro Abiertos + Corredor - Flood Derecha',
    formationId: 'four-open-rb-7',
    defenseId: 'cover-3-7',
    routes: { X: 'post', Y: 'go', Z: 'drag', H: 'out', R: 'flat', C: 'block' },
    targetLabel: 'H',
    releaseAt: 1.6,
    category: 'Pase medio',
    tags: ['7v7', 'flood', 'ribera', 'zona'],
    notes: 'El flood ataca Cover 3 con tres niveles al mismo lado: plana de R, out de H y go de Y. El mariscal lee al linebacker exterior: si se queda en la plana, el out queda abierto; si sube, la plana está libre. Hay que lanzar el out a la ventana entre el linebacker y el esquinero, con anticipación. El drag de Z cruza la defensa y aparece como segunda lectura si el flood se cierra.',
  }),
  makeStarterPlay({
    id: 'play_pistol_run',
    name: 'Pistol - Carrera al Lado Débil',
    formationId: 'pistol-7',
    defenseId: 'cover-3-7',
    routes: { X: 'go', H: 'in', Z: 'comeback', Y: 'fade', R: 'cutback', C: 'block' },
    targetLabel: 'R',
    releaseAt: 0.7,
    category: 'Carrera',
    tags: ['7v7', 'pistol', 'carrera', 'cutback'],
    notes: 'El corredor recibe a la altura del mariscal y ataca el lado débil con corte interior: la ventaja está en el primer hueco, no en el borde. Los receptores estiran la defensa con X en el go y Y en el fade para que los linebackers no se metan en el hueco. El mariscal sigue la carrera con los ojos; si el linebacker se cierra, se queda el balón y busca el comeback de Z. Si la defensa carga el lado fuerte, el corte interior del corredor llega antes que el rush.',
  }),
  makeStarterPlay({
    id: 'play_bunch_7_playaction',
    name: 'Bunch 7 - Play Action y Rueda',
    formationId: 'bunch-7',
    defenseId: 'cover-2-7',
    routes: { X: 'go', Y: 'slant', Z: 'return', H: 'wheel', R: 'flat', C: 'block' },
    targetLabel: 'H',
    releaseAt: 2,
    category: 'Juego de engaño',
    tags: ['7v7', 'bunch', 'play action', 'rueda'],
    notes: 'La finta de entrega al corredor congela a los linebackers un segundo, justo lo que tarda H en salir por la rueda. La rueda del receptor más profundo del bunch ataca al flat defender por detrás mientras Y y Z cruzan por dentro. El mariscal vende la entrega, se gira y busca a H: si el safety ayuda al medio, la rueda está sola. La plana de R es la válvula si la presión no se detiene con la finta.',
  }),
];

const DEFENSE_STARTER_PLAYS = [
  makeStarterPlay({
    id: 'play_def_cover2',
    name: 'Cover 2 - Dos Profundos',
    type: 'defense',
    formationId: 'spread-5',
    defenseId: 'cover-2',
    routes: { X: 'slant', Y: 'curl', Z: 'out', C: 'flat' },
    targetLabel: 'X',
    releaseAt: 1.1,
    category: 'Zona',
    tags: ['5v5', 'defensa', 'zona', 'cobertura 2'],
    notes: 'Los dos esquineros son responsables de su mitad profunda: nada por detrás de ellos. El linebacker del lado del pase ataca la plana y el otro se queda en el gancho. Contra el slant hay que esperar el segundo paso del receptor antes de romper al balón. Si el mariscal corre, el rush lo persigue por dentro y los esquineros salen con el pase.',
  }),
  makeStarterPlay({
    id: 'play_def_cover3',
    name: 'Cover 3 - Tres Profundos',
    type: 'defense',
    formationId: 'trips-right-5',
    defenseId: 'cover-3',
    routes: { X: 'post', Y: 'wheel', Z: 'go', C: { id: 'flat', mirror: true } },
    targetLabel: 'Z',
    releaseAt: 2,
    category: 'Zona',
    tags: ['5v5', 'defensa', 'zona', 'cobertura 3'],
    notes: 'Tres profundos: esquineros a las terceras exteriores y safety al centro, ninguno se compromete con el play-action. El linebacker del medio cierra la costura y el de la derecha ataca la rueda. Contra trips, el safety rota al lado de la tríada y el esquinero del lado débil se queda solo. La regla es simple: nadie profundo persigue al corredor detrás de la línea.',
  }),
  makeStarterPlay({
    id: 'play_def_man_press',
    name: 'Man Press - Presión en la Línea',
    type: 'defense',
    formationId: 'spread-5',
    defenseId: 'man-press',
    routes: { X: 'go', Y: 'comeback', Z: 'slant', C: 'flat' },
    targetLabel: 'Z',
    releaseAt: 1.6,
    category: 'Hombre',
    tags: ['5v5', 'defensa', 'hombre', 'press'],
    notes: 'Presión en la línea: el esquinero agrede al receptor en los dos primeros pasos para retrasar su ruta y arruinar el timing. No hay safety libre, así que si el receptor gana por dentro el castigo es doble. La técnica es espejo de pies, nunca manos: en flag tocar arriba es penalización. Si el mariscal lanza fuera del número, el esquinero tiene que jugar el balón, no la bandera.',
  }),
  makeStarterPlay({
    id: 'play_def_cover3_7',
    name: 'Cover 3 7v7 - Tres Profundos',
    type: 'defense',
    formationId: 'four-open-rb-7',
    defenseId: 'cover-3-7',
    routes: { X: 'post', Y: 'go', Z: 'drag', H: 'out', R: 'flat', C: 'block' },
    targetLabel: 'H',
    releaseAt: 1.6,
    category: 'Zona',
    tags: ['7v7', 'defensa', 'zona', 'cobertura 3'],
    notes: 'En 7v7 los tres profundos se reparten el campo en tercios y los linebackers cubren las ventanas cortas a 5 yardas. La clave es no vaciar la zona del drag: el linebacker del lado débil llega siempre un paso tarde si se gira. Contra el flood, el esquinero del lado de la tríada se queda en la esquina y el safety cierra el out. El rush debe llegar con las manos arriba para tapar la línea de pase del mariscal.',
  }),
];

/**
 * Orden de la libreta de arranque: primero las jugadas 5v5 (ataque), después
 * las cuatro defensas y por último el resto de ataque 5v5/7v7. Así la libreta
 * inicial sembrada por `state.seedWithPresets` incluye los dos lados del balón.
 */
export const STARTER_PLAYS = [
  ...OFFENSE_STARTER_PLAYS.slice(0, 8),
  ...DEFENSE_STARTER_PLAYS,
  ...OFFENSE_STARTER_PLAYS.slice(8),
];

// ---------------------------------------------------------------------------
// 5. CONCEPTS — conceptos de pase reutilizables (formación + rutas por etiqueta)
// ---------------------------------------------------------------------------
export const CONCEPTS = [
  {
    id: 'mesh',
    name: 'Malla (Mesh)',
    desc: 'Dos receptoras cruzan por debajo en sentidos opuestos con un go por fuera: la malla clásica contra hombre y contra zona de dos profundos.',
    tags: ['concepto', 'malla', 'pase corto'],
    formationId: 'double-slot-5',
    routes: { X: 'go', Y: 'drag', Z: 'drag', C: 'flat' },
    targetLabel: 'Y',
    releaseAt: 1.3,
    category: 'Pase corto',
    defenseId: 'cover-2',
    notes: 'La malla cruza a Y y Z por debajo en sentidos opuestos: contra hombre el defensor no puede seguir al receptor a través del tráfico. El mariscal lee al linebacker del lado hacia el que corre el pase; si salta, el otro cruce queda libre. Hay que lanzar con el drop de tres pasos, antes de que los cruces se junten.',
  },
  {
    id: 'smash',
    name: 'Smash',
    desc: 'Curl del receptor abierto y corner del slot para atacar la ventana exterior de Cover 2: dos niveles en la misma banda.',
    tags: ['concepto', 'smash', 'cobertura 2'],
    formationId: 'spread-5',
    routes: { X: 'post', Y: 'curl', Z: 'corner', C: 'flat' },
    targetLabel: 'Z',
    releaseAt: 1.8,
    category: 'Pase medio',
    defenseId: 'cover-2',
    notes: 'Contra Cover 2, el esquinero se queda con el curl y el corner ataca la ventana entre el esquinero y el safety. El mariscal lee al esquinero: si sube al curl, lanza el corner por detrás. El post de X es el castigo si el safety se abre demasiado al corner.',
  },
  {
    id: 'flood',
    name: 'Flood / Ribera',
    desc: 'Tres niveles a la misma banda (plana, out y go) para ahogar la zona: el quarterback elige la capa que la defensa deja libre.',
    tags: ['concepto', 'flood', 'ribera', 'zona'],
    formationId: 'trips-right-5',
    routes: { X: 'in', Y: 'out', Z: 'go', C: { id: 'flat', mirror: true } },
    targetLabel: 'Y',
    releaseAt: 1.5,
    category: 'Pase corto',
    defenseId: 'cover-3',
    notes: 'El flood ataca Cover 3 con plana, out y go al mismo lado. El mariscal lee al linebacker exterior: si se queda en la plana, el out queda abierto; si sube, la plana está libre. Hay que lanzar el out a la ventana entre el linebacker y el esquinero, con anticipación.',
  },
  {
    id: 'stick',
    name: 'Stick / Palo',
    desc: 'Receptor que se asienta a cinco yardas rodeado de una vertical por fuera y una plana por dentro: el pase de zona por excelencia.',
    tags: ['concepto', 'stick', 'zona'],
    formationId: 'twins-5',
    routes: { X: 'in', Y: 'go', Z: 'return', C: 'flat' },
    targetLabel: 'Z',
    releaseAt: 1.2,
    category: 'Pase corto',
    defenseId: 'cover-3',
    notes: 'El stick del slot se asienta en el hueco entre el linebacker y el esquinero. El go de Y despeja la ventana por fuera y la plana del center es la válvula. El mariscal lanza cuando el receptor muestra el pecho, no antes.',
  },
  {
    id: 'dagger',
    name: 'Daga (Dagger)',
    desc: 'Dig profundo del receptor de fuera detrás de una vertical de claro del slot: ataca el hueco delante del safety.',
    tags: ['concepto', 'dagger', 'daga', 'pase medio'],
    formationId: 'spread-5',
    routes: { X: 'in', Y: 'comeback', Z: 'fade', C: 'flat' },
    targetLabel: 'X',
    releaseAt: 1.8,
    category: 'Pase medio',
    defenseId: 'cover-2',
    notes: 'La vertical/fade de Z despeja al safety y el dig de X aparece detrás del linebacker. El mariscal lanza a la ventana delante del safety en cuanto X cruza la cara del linebacker. El comeback de Y es la válvula si la ventana se cierra.',
  },
  {
    id: 'four-verticals',
    name: 'Cuatro Verticales',
    desc: 'Cuatro rutas verticales repartidas por el ancho para atacar cualquier cobertura de dos profundos y castigar la rotación.',
    tags: ['concepto', 'verticales', 'profundo'],
    formationId: 'empty-5',
    routes: { X: 'go', Y: 'seam', Z: 'fade', C: 'go' },
    targetLabel: 'Y',
    releaseAt: 2.2,
    category: 'Pase profundo',
    defenseId: 'cover-4',
    notes: 'Cuatro verticales contra cualquier shell de dos profundos. El mariscal busca la costura que el safety deja libre. Si la defensa rota a tres profundos, el fade exterior queda uno contra uno. El go del center por el medio es la válvula si la presión llega con cuatro.',
  },
  {
    id: 'curl-flat',
    name: 'Curl-Flat',
    desc: 'Curl del receptor abierto y plana del slot a la misma banda: la combinación de alta porcentaje contra Cover 2 y Cover 3.',
    tags: ['concepto', 'curl', 'plana', 'zona'],
    formationId: 'twins-5',
    routes: { X: 'in', Y: 'curl', Z: 'flat', C: 'block' },
    targetLabel: 'Y',
    releaseAt: 1.4,
    category: 'Pase corto',
    defenseId: 'cover-3',
    notes: 'El curl se sienta delante del profundo y la plana ataca por debajo del esquinero. El mariscal lee al esquinero: si sube al curl, lanza la plana. Si se queda, el curl está abierto detrás de él.',
  },
  {
    id: 'spot',
    name: 'Spot / Punto',
    desc: 'Curl de un lado, corner del slot y plana de válvula: el concepto de punto que ataca la ventana de Cover 2.',
    tags: ['concepto', 'spot', 'punto'],
    formationId: 'spread-5',
    routes: { X: 'curl', Y: 'go', Z: 'corner', C: 'flat' },
    targetLabel: 'Z',
    releaseAt: 1.8,
    category: 'Pase medio',
    defenseId: 'cover-2',
    notes: 'Contra Cover 2, el corner del slot ataca la ventana entre el esquinero y el safety. El go de Y mantiene abierto al esquinero por fuera. El curl de X es la lectura de seguridad si el safety rota al corner.',
  },
  {
    id: 'rub',
    name: 'Rub / Roce',
    desc: 'Roce del receptor de dentro para liberar al gancho del stack: la respuesta de hombre cuando la defensa presiona.',
    tags: ['concepto', 'rub', 'roce', 'hombre'],
    formationId: 'bunch-right-5',
    routes: { X: 'post', Y: 'rub', Z: 'curl', C: 'flat' },
    targetLabel: 'Z',
    releaseAt: 1.2,
    category: 'Pase corto',
    defenseId: 'man-press',
    notes: 'El rub de Y libera al gancho de Z contra hombre: el esquinero pelea el tráfico y llega tarde. El mariscal espera el segundo paso de Z y lanza a la ventana interior. El post de X castiga al safety que se queda mirando el bunch.',
  },
  {
    id: 'screen',
    name: 'Pantalla',
    desc: 'Pantalla al receptor del lado débil con los de dentro vendiendo la ruta profunda: la respuesta más rápida a la presión.',
    tags: ['concepto', 'pantalla', 'presión'],
    formationId: 'trips-left-5',
    routes: { X: 'block', Y: 'slant', Z: 'screen', C: { id: 'flat', mirror: true } },
    targetLabel: 'Z',
    releaseAt: 0.8,
    category: 'Pase corto',
    defenseId: 'blitz-2',
    notes: 'La pantalla a Z es la respuesta más rápida contra blitz de dos. El mariscal no espera y lanza al primer paso del receptor. Los de dentro venden la ruta profunda para que el linebacker se retire antes de obstruir.',
  },
  {
    id: 'snag',
    name: 'Snag / Enganche',
    desc: 'Pivote del slot con slant del receptor de fuera y plana del center: concepto de triángulo corto contra hombre y zona.',
    tags: ['concepto', 'snag', 'enganche'],
    formationId: 'bunch-right-5',
    routes: { X: 'post', Y: 'pivot', Z: 'slant', C: 'flat' },
    targetLabel: 'Y',
    releaseAt: 1.2,
    category: 'Pase corto',
    defenseId: 'cover-1',
    notes: 'El pivote de Y se asienta en el hueco corto mientras Z ataca el interior con el slant. El mariscal lanza al primer corte del pivote, antes de que el esquinero reaccione. El post de X es el castigo si el safety se queda en el medio.',
  },
];

/**
 * Construye una jugada nueva y jugable a partir de un concepto.
 * opts: { name?, formationId?, defenseId?, routes?, targetLabel?, releaseAt?,
 *         category?, tags?, notes? }
 */
export function buildPlayFromConcept(conceptId, opts = {}) {
  const concept = CONCEPTS.find((item) => item.id === conceptId);
  if (!concept) return null;
  const formationId = opts.formationId || concept.formationId;
  const routes = { ...concept.routes, ...(opts.routes || {}) };
  const defenseId = 'defenseId' in opts ? opts.defenseId : concept.defenseId;
  const targetLabel = opts.targetLabel || concept.targetLabel;
  return makeStarterPlay({
    name: opts.name || concept.name,
    formationId,
    defenseId,
    routes,
    targetLabel,
    releaseAt: opts.releaseAt ?? concept.releaseAt ?? 1.2,
    category: opts.category || concept.category || 'Pase corto',
    tags: Array.isArray(opts.tags) ? opts.tags : concept.tags || [],
    notes: opts.notes || concept.notes || concept.desc,
  });
}

// ---------------------------------------------------------------------------
// 6. applyFormation — recoloca la ofensiva conservando rutas por etiqueta
// ---------------------------------------------------------------------------
/**
 * Devuelve una jugada NUEVA con la ofensiva recolocada en `formationId`.
 * Se conservan por etiqueta (y si no, por rol) el id, el número y la ruta de
 * cada jugador; la ruta se desplaza con el jugador para no desengancharla del
 * diagrama. El objetivo del pase se mantiene si su receptor sigue existiendo.
 */
export function applyFormation(play, formationId) {
  if (!play || !Array.isArray(play.players)) return play;
  const formation = getFormation(formationId);
  if (!formation || formation.type !== 'offense') return play;

  const field = defaultField(formation.format);
  const oldOffense = play.players.filter((player) => player.team === 'offense');
  const used = new Set();

  const takePrevious = (slot) => {
    let index = oldOffense.findIndex((player, i) => !used.has(i) && player.label === slot.label);
    if (index < 0) {
      index = oldOffense.findIndex((player, i) => !used.has(i) && player.role === slot.role);
    }
    if (index < 0) return null;
    used.add(index);
    return oldOffense[index];
  };

  const offense = formation.players.map((slot) => {
    const previous = takePrevious(slot);
    const pos = { x: slot.x, y: slot.y };
    let path = null;
    if (previous && Array.isArray(previous.path) && previous.path.length) {
      const dx = pos.x - previous.pos.x;
      const dy = pos.y - previous.pos.y;
      path = previous.path.map((point) => {
        const moved = clampRoutePoint({ x: point.x + dx, y: point.y + dy }, field);
        return { x: moved.x, y: moved.y, curve: point.curve || 'line' };
      });
    }
    return createPlayer({
      id: previous?.id,
      team: 'offense',
      role: slot.role,
      label: slot.label,
      number: previous?.number || SLOT_NUMBERS[slot.label] || '',
      pos,
      path,
      pathType: previous?.pathType || 'route',
    });
  });

  const defense = play.players
    .filter((player) => player.team === 'defense')
    .map((player) =>
      createPlayer({
        ...player,
        pos: { ...player.pos },
        path: Array.isArray(player.path) ? player.path.map((point) => ({ ...point })) : null,
        assignment: player.assignment ? JSON.parse(JSON.stringify(player.assignment)) : null,
      })
    );

  const offenseIds = new Set(offense.map((player) => player.id));
  for (const defender of defense) {
    if (
      defender.assignment?.type === 'man' &&
      defender.assignment.targetId &&
      !offenseIds.has(defender.assignment.targetId)
    ) {
      defender.assignment = {
        type: 'man',
        targetId: null,
        markLabel: defender.assignment.markLabel,
      };
    }
  }

  const previousTarget = play.ball?.targetId ?? null;
  const ball = {
    targetId: offenseIds.has(previousTarget) ? previousTarget : null,
    releaseAt: Math.max(0.7, Number(play.ball?.releaseAt ?? 1.2)),
  };

  return createPlay({
    ...play,
    formation: play.type === 'defense' ? play.formation : formation.id,
    field,
    players: [...offense, ...defense],
    ball,
  });
}
