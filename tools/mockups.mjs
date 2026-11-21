// Genera tres maquetas de la pantalla principal de FlagPlays con lenguajes
// visuales distintos, para comparar propuestas de diseño.
// Uso: node tools/mockups.mjs  -> qa/mock/diseno-A|B|C.html
import fs from 'node:fs';

const campoNight = fs.readFileSync('qa/mock/campo-night.svg', 'utf8');
const campoPaper = fs.readFileSync('qa/mock/campo-paper.svg', 'utf8');
const campoBlue = fs.readFileSync('qa/mock/campo-blueprint.svg', 'utf8');

const bandera = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3v18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M5 4.5c4-1.6 6 2 10 .4V13c-4 1.6-6-2-10-.4z" fill="currentColor"/></svg>`;
const jugadaMini = (color) => `<svg viewBox="0 0 60 40" aria-hidden="true"><rect width="60" height="40" rx="4" fill="rgba(255,255,255,.04)"/><path d="M6 30h48" stroke="rgba(255,255,255,.18)"/><path d="M14 30v-9l8-6" stroke="${color}" stroke-width="1.6" fill="none"/><path d="M30 30v-14" stroke="${color}" stroke-width="1.6"/><circle cx="14" cy="30" r="2.4" fill="${color}"/><circle cx="30" cy="30" r="2.4" fill="${color}"/><circle cx="46" cy="30" r="2.4" fill="${color}"/></svg>`;

const PLAYAS = [
  ['Trips Derecha - Rueda', 'Ofensiva · 5v5 · profundo'],
  ['Spread - Slant y Out', 'Ofensiva · 5v5 · corto'],
  ['Bunch Derecha - Roce', 'Ofensiva · 5v5 · corto'],
  ['Stack - Doble Movimiento', 'Ofensiva · 5v5 · engaño'],
  ['Cover 3 - Tres Profundos', 'Defensiva · 5v7 · zona'],
  ['Spread - Jet Sweep', 'Ofensiva · 5v5 · carrera'],
];

function tarjetas(acento, mini) {
  return PLAYAS.map(
    ([n, m], i) => `<div class="pc${i === 0 ? ' on' : ''}">
      <div class="thumb">${jugadaMini(i === 4 ? '#ff8a6a' : acento)}</div>
      <div class="pc-t"><b>${n}</b><span>${m}</span></div>
    </div>`
  ).join('');
}

const secciones = (clase) =>
  ['Jugadas', 'Rutas', 'Catálogo', 'Árbol', 'Muñequeras']
    .map((s, i) => `<i class="${i === 0 ? 'on' : ''} ${clase}${i}">${s}</i>`)
    .join('');

const herramientas = (activo) =>
  ['Seleccionar', 'Ruta', '+', 'Defensa', 'Rutas', 'Nombres', 'Zonas']
    .map((t, i) => `<b class="${i === 0 ? 'on' : i === 2 ? 'plus' : ''}">${t}</b>`)
    .join('');

function maquetaA() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>A · Sideline</title>
<style>
:root{--bg:#05080b;--s1:#0a1218;--s2:#0e1a22;--s3:#132530;--ln:#1b3340;--ln2:#25485a;--tx:#f2fbf5;--tx2:#a9c3ce;--tx3:#6a8a97;--ac:#c6f432;--ac2:#2f7dff;--ink:#08120a;--r:8px;
--font:"Archivo","Inter",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}
*{box-sizing:border-box;margin:0}
body{background:radial-gradient(120% 90% at 50% -20%,#0d1a22,#05080b 70%);color:var(--tx);font-family:var(--font);height:100vh;overflow:hidden}
.app{display:grid;grid-template-rows:56px 1fr 58px;grid-template-columns:290px 1fr 330px;height:100vh;grid-template-areas:"top top top" "side stage insp" "tl tl tl"}
.top{grid-area:top;display:flex;align-items:center;gap:10px;padding:0 14px;background:linear-gradient(180deg,#0c1620,#0a1218);border-bottom:1px solid var(--ln)}
.brand{display:flex;align-items:center;gap:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;font-size:14px}
.mark{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--ac);color:var(--ink)}
.chip{font-size:12px;color:var(--tx2);border:1px solid var(--ln);border-radius:999px;padding:6px 12px}
.sp{flex:1}
.seg{display:flex;gap:2px;background:#081118;border:1px solid var(--ln);border-radius:999px;padding:3px}
.seg>*{font-size:12px;padding:6px 14px;border-radius:999px;color:var(--tx3);font-weight:700}
.seg>.on{background:var(--ac);color:var(--ink)}
.sections{display:flex;gap:4px}
.sections i{font-style:normal;font-size:12px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;padding:7px 12px;border-radius:6px;color:var(--tx3);border:1px solid transparent}
.sections i.on{color:var(--ink);background:var(--ac);box-shadow:0 2px 0 #7ea317}
.acts{display:flex;gap:6px}
.acts b{font-size:12px;font-weight:700;padding:8px 12px;border-radius:6px;background:var(--s3);border:1px solid var(--ln2);color:var(--tx)}
.side{grid-area:side;background:var(--s1);border-right:1px solid var(--ln);display:flex;flex-direction:column;min-height:0}
.side-h{display:flex;justify-content:space-between;align-items:center;padding:14px 14px 8px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--tx3);font-weight:800}
.side-h span{color:var(--ac);font-family:var(--mono)}
.search{margin:0 12px 10px;padding:9px 12px;border-radius:6px;background:#081118;border:1px solid var(--ln);color:var(--tx3);font-size:12px}
.playcards{overflow:hidden;padding:0 10px;display:flex;flex-direction:column;gap:6px}
.pc{display:grid;grid-template-columns:64px 1fr;gap:9px;align-items:center;padding:7px;border-radius:var(--r);border:1px solid transparent}
.pc .thumb svg{width:64px;height:40px;display:block;border-radius:5px}
.pc-t{display:flex;flex-direction:column;gap:2px;min-width:0}
.pc-t b{font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-t span{font-size:10.5px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc.on{background:var(--s3);border-color:var(--ac)}
.pc.on .pc-t b{color:var(--ac)}
.stage{grid-area:stage;display:flex;flex-direction:column;min-width:0;padding:10px;gap:8px}
.tools{display:flex;gap:5px}
.tools b{font-size:11.5px;font-weight:700;padding:7px 11px;border-radius:6px;background:var(--s2);border:1px solid var(--ln);color:var(--tx2)}
.tools b.on{background:var(--ac);color:var(--ink);border-color:var(--ac)}
.tools b.plus{color:var(--ac);border-color:var(--ln2)}
.field{flex:1;border-radius:10px;overflow:hidden;border:1px solid var(--ln2);box-shadow:0 18px 50px rgba(0,0,0,.55), inset 0 0 0 1px rgba(198,244,50,.06)}
.field svg{width:100%;height:100%;display:block}
.insp{grid-area:insp;background:var(--s1);border-left:1px solid var(--ln);display:flex;flex-direction:column;min-height:0}
.tabs{display:flex;gap:2px;padding:10px 10px 0}
.tabs>*{font-size:12px;font-weight:700;padding:8px 12px;color:var(--tx3);border-radius:6px 6px 0 0}
.tabs>.on{color:var(--ac);background:var(--s2);border-bottom:2px solid var(--ac)}
.grp{padding:14px 14px 6px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--tx3);font-weight:800}
.formation{margin:0 14px;padding:10px 12px;border-radius:6px;background:var(--s2);border:1px solid var(--ln2);font-size:12.5px;font-weight:650}
.chips{display:flex;gap:6px;padding:8px 14px}
.chips b{font-family:var(--mono);font-size:11px;padding:5px 9px;border-radius:999px;background:var(--s3);border:1px solid var(--ln2);color:var(--tx2)}
.row{display:flex;justify-content:space-between;align-items:center;padding:7px 14px;font-size:12px;color:var(--tx2)}
.row b{color:var(--tx);font-weight:650}
.tr{margin:0 14px;height:4px;border-radius:2px;background:var(--s3);position:relative}
.tr i{position:absolute;left:38%;top:-4px;width:12px;height:12px;border-radius:50%;background:var(--ac);box-shadow:0 0 0 3px rgba(198,244,50,.18)}
.tl{grid-area:tl;display:flex;align-items:center;gap:12px;padding:0 14px;background:#081118;border-top:1px solid var(--ln)}
.tl .pl{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--ac);color:var(--ink);font-size:14px}
.tl .bar{flex:1;height:4px;border-radius:2px;background:var(--s3);position:relative}
.tl .bar i{position:absolute;left:0;top:0;width:22%;height:100%;border-radius:2px;background:var(--ac)}
.tl span{font-family:var(--mono);font-size:11.5px;color:var(--tx2)}
.tl b{font-size:11.5px;padding:5px 9px;border-radius:5px;background:var(--s3);border:1px solid var(--ln2)}
</style></head><body>
<div class="app">
  <header class="top">
    <div class="brand"><span class="mark">${bandera}</span> FlagPlays</div>
    <div class="chip">Mi libreta ▾</div><div class="sp"></div>
    <div class="seg"><b class="on">Editar</b><span>Animar</span><span>Simular</span></div><div class="sp"></div>
    <nav class="sections">${secciones('s')}</nav>
    <div class="acts"><b>Analizar</b><b>Exportar</b></div>
  </header>
  <aside class="side">
    <div class="side-h">Libreta <span>17</span></div>
    <div class="search">Buscar jugada…</div>
    <div class="playcards">${tarjetas('#c6f432')}</div>
  </aside>
  <main class="stage">
    <div class="tools">${herramientas()}</div>
    <div class="field">${campoNight}</div>
  </main>
  <aside class="insp">
    <div class="tabs"><b class="on">Ofensiva</b><span>Defensa</span><span>Jugada</span><span>Estilo</span></div>
    <div class="grp">Formación</div><div class="formation">Trips Derecha 5v5</div>
    <div class="grp">Jugadores ofensivos</div><div class="chips"><b>QB</b><b>C</b><b>X</b><b>Y</b><b>Z</b></div>
    <div class="grp">Balón</div><div class="row">Receptor <b>Y</b></div><div class="row">Lanzamiento <b>2,0 s</b></div><div class="tr"><i></i></div>
  </aside>
  <footer class="tl"><span class="pl">▶</span><div class="bar"><i></i></div><span>0,00 s / 3,57 s</span><b>1×</b></footer>
</div></body></html>`;
}

function maquetaB() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>B · Editorial</title>
<style>
:root{--paper:#f7f4ec;--paper2:#efeade;--ink:#14181b;--ink2:#4c565c;--ink3:#8b979c;--ln:#d8d1c0;--roj:#cf3f2b;--azu:#1e5fbf;--ver:#2b7a45;
--font:Georgia,"Iowan Old Style",serif;--sans:"Inter",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}
*{box-sizing:border-box;margin:0}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);height:100vh;overflow:hidden}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(20,24,27,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(20,24,27,.045) 1px,transparent 1px);background-size:24px 24px}
.app{position:relative;display:grid;grid-template-rows:58px 1fr 56px;grid-template-columns:284px 1fr 326px;grid-template-areas:"top top top" "side stage insp" "tl tl tl";height:100vh}
.top{grid-area:top;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:2px solid var(--ink);background:var(--paper)}
.brand{display:flex;align-items:center;gap:10px;font-family:var(--font);font-size:21px;font-weight:700;letter-spacing:-.01em}
.mark{display:grid;place-items:center;width:30px;height:30px;border:2px solid var(--ink);border-radius:50%;color:var(--roj)}
.chip{font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:5px 10px;border:1px solid var(--ln);border-radius:2px;color:var(--ink2);background:var(--paper2)}
.sp{flex:1}
.seg{display:flex;border:2px solid var(--ink);border-radius:2px;overflow:hidden}
.seg>*{font-size:11px;text-transform:uppercase;letter-spacing:.09em;font-weight:700;padding:7px 13px;color:var(--ink2)}
.seg>.on{background:var(--ink);color:var(--paper)}
.sections{display:flex;gap:8px}
.sections i{font-style:normal;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--ink2);padding:6px 2px;border-bottom:2px solid transparent}
.sections i.on{border-bottom-color:var(--roj);color:var(--ink)}
.acts b{font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:7px 10px;border:1px solid var(--ln);border-radius:2px;color:var(--ink2);background:var(--paper2)}
.side{grid-area:side;border-right:1px solid var(--ln);background:var(--paper);display:flex;flex-direction:column;min-height:0}
.side-h{display:flex;justify-content:space-between;padding:16px 16px 10px;font-family:var(--font);font-size:15px;font-weight:700;border-bottom:1px solid var(--ln)}
.side-h span{font-family:var(--mono);font-size:11px;color:var(--ink3)}
.search{margin:12px;padding:9px 12px;border:1px solid var(--ln);background:#fffdf8;color:var(--ink3);font-size:12px;border-radius:2px}
.playcards{overflow:hidden;padding:0 12px;display:flex;flex-direction:column;gap:8px}
.pc{display:grid;grid-template-columns:62px 1fr;gap:10px;align-items:center;padding:6px;border-left:3px solid transparent}
.pc .thumb svg{width:62px;height:38px;display:block;border:1px solid var(--ln);border-radius:2px;background:#fffdf8}
.pc-t b{display:block;font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-t span{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3)}
.pc.on{border-left-color:var(--roj);background:#fffdf8}
.stage{grid-area:stage;display:flex;flex-direction:column;padding:14px;gap:10px;min-width:0}
.tools{display:flex;gap:6px;flex-wrap:wrap}
.tools b{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;padding:7px 11px;border:1px solid var(--ln);border-radius:2px;color:var(--ink2);background:#fffdf8}
.tools b.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.tools b.plus{color:var(--roj);border-color:var(--roj)}
.field{flex:1;border:2px solid var(--ink);border-radius:3px;overflow:hidden;box-shadow:6px 6px 0 rgba(20,24,27,.12);background:#fffdf8}
.field svg{width:100%;height:100%;display:block}
.insp{grid-area:insp;border-left:1px solid var(--ln);display:flex;flex-direction:column;min-height:0}
.tabs{display:flex;border-bottom:2px solid var(--ink)}
.tabs>*{flex:1;text-align:center;font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;padding:11px 4px;color:var(--ink3)}
.tabs>.on{color:var(--ink);background:#fffdf8;box-shadow:inset 0 -2px 0 var(--roj)}
.grp{padding:14px 16px 6px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);font-weight:700}
.formation{margin:0 16px;padding:10px 12px;border:1px solid var(--ln);background:#fffdf8;font-family:var(--font);font-size:14px}
.chips{display:flex;gap:6px;padding:10px 16px}
.chips b{font-family:var(--mono);font-size:11px;padding:5px 9px;border-radius:999px;border:1px solid var(--ink2);color:var(--ink)}
.row{display:flex;justify-content:space-between;padding:8px 16px;font-size:12px;color:var(--ink2);border-bottom:1px dotted var(--ln)}
.row b{color:var(--ink);font-family:var(--mono)}
.tr{margin:10px 16px;height:3px;background:var(--ln);position:relative}
.tr i{position:absolute;left:38%;top:-5px;width:13px;height:13px;border-radius:50%;background:var(--roj);border:2px solid var(--paper)}
.tl{grid-area:tl;display:flex;align-items:center;gap:14px;padding:0 16px;border-top:2px solid var(--ink);background:var(--paper2)}
.tl .pl{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--ink);color:var(--paper);font-size:13px}
.tl .bar{flex:1;height:3px;background:var(--ln);position:relative}
.tl .bar i{position:absolute;left:0;top:0;height:100%;width:22%;background:var(--ink)}
.tl span{font-family:var(--mono);font-size:11px;color:var(--ink2)}
.tl b{font-family:var(--mono);font-size:11px;padding:4px 8px;border:1px solid var(--ln);background:#fffdf8}
</style></head><body>
<div class="app">
  <header class="top">
    <div class="brand"><span class="mark">${bandera}</span> FlagPlays</div>
    <div class="chip">Mi libreta</div><div class="sp"></div>
    <div class="seg"><b class="on">Editar</b><span>Animar</span><span>Simular</span></div><div class="sp"></div>
    <nav class="sections">${secciones('t')}</nav>
    <div class="acts"><b>Analizar</b><b>Exportar</b></div>
  </header>
  <aside class="side">
    <div class="side-h">Libreta <span>17 jugadas</span></div>
    <div class="search">Buscar jugada…</div>
    <div class="playcards">${tarjetas('#cf3f2b')}</div>
  </aside>
  <main class="stage">
    <div class="tools">${herramientas()}</div>
    <div class="field">${campoPaper}</div>
  </main>
  <aside class="insp">
    <div class="tabs"><b class="on">Ofensiva</b><span>Defensa</span><span>Jugada</span><span>Estilo</span></div>
    <div class="grp">Formación</div><div class="formation">Trips Derecha 5v5</div>
    <div class="grp">Jugadores ofensivos</div><div class="chips"><b>QB</b><b>C</b><b>X</b><b>Y</b><b>Z</b></div>
    <div class="grp">Balón</div><div class="row">Receptor <b>Y</b></div><div class="row">Lanzamiento <b>2,0 s</b></div><div class="tr"><i></i></div>
  </aside>
  <footer class="tl"><span class="pl">▶</span><div class="bar"><i></i></div><span>0,00 s / 3,57 s</span><b>1×</b></footer>
</div></body></html>`;
}

function maquetaC() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>C · Neo-turf</title>
<style>
:root{--bg:#0a0e11;--glass:rgba(255,255,255,.045);--glass2:rgba(255,255,255,.075);--ln:rgba(255,255,255,.09);--tx:#f4f8f6;--tx2:#a8bcb6;--tx3:#6d8480;
--jugadas:#b4f13f;--rutas:#45d9e8;--catalogo:#a78bfa;--arbol:#ffb020;--mune:#ff6b9a;--ink:#08120a;--r:14px;
--font:"Inter",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--tx);font-family:var(--font);height:100vh;overflow:hidden}
body::before{content:"";position:fixed;inset:-30% -10% auto -10%;height:80%;background:
radial-gradient(40% 60% at 18% 0%,rgba(180,241,63,.16),transparent 70%),
radial-gradient(35% 55% at 62% -10%,rgba(167,139,250,.14),transparent 70%),
radial-gradient(30% 50% at 92% 0%,rgba(69,217,232,.12),transparent 70%);pointer-events:none}
.app{position:relative;display:grid;grid-template-rows:60px 1fr 58px;grid-template-columns:288px 1fr 328px;grid-template-areas:"top top top" "side stage insp" "tl tl tl";height:100vh;gap:0}
.top{grid-area:top;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--ln);background:rgba(10,14,17,.72);backdrop-filter:blur(14px)}
.brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:14.5px;letter-spacing:-.01em}
.mark{display:grid;place-items:center;width:33px;height:33px;border-radius:10px;background:linear-gradient(140deg,#c9fa52,#7cc42a);color:var(--ink);box-shadow:0 6px 18px rgba(180,241,63,.28)}
.chip{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--tx2);background:var(--glass);border:1px solid var(--ln);border-radius:999px;padding:7px 13px}
.sp{flex:1}
.seg{display:flex;gap:2px;background:var(--glass);border:1px solid var(--ln);border-radius:999px;padding:3px}
.seg>*{font-size:12px;padding:6px 14px;border-radius:999px;color:var(--tx3);font-weight:650}
.seg>.on{background:linear-gradient(140deg,#c9fa52,#8ed12e);color:var(--ink);font-weight:750;box-shadow:0 2px 10px rgba(180,241,63,.3)}
.sections{display:flex;gap:4px}
.sections i{display:flex;align-items:center;gap:6px;font-style:normal;font-size:12px;font-weight:650;padding:7px 11px;border-radius:10px;color:var(--tx3);border:1px solid transparent}
.sections i::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.85}
.sections i.s0{color:var(--jugadas);background:rgba(180,241,63,.12);border-color:rgba(180,241,63,.35)}
.sections i.s1{color:var(--rutas)} .sections i.s2{color:var(--catalogo)} .sections i.s3{color:var(--arbol)} .sections i.s4{color:var(--mune)}
.acts{display:flex;gap:7px}
.acts b{font-size:12px;font-weight:650;padding:8px 13px;border-radius:10px;background:var(--glass);border:1px solid var(--ln);color:var(--tx)}
.side{grid-area:side;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--ln);background:var(--glass)}
.side-h{display:flex;justify-content:space-between;align-items:center;padding:15px 14px 9px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--tx3);font-weight:750}
.side-h span{color:var(--jugadas);font-family:var(--mono);font-size:11px}
.search{margin:0 12px 10px;padding:10px 13px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid var(--ln);color:var(--tx3);font-size:12px}
.playcards{overflow:hidden;padding:0 10px;display:flex;flex-direction:column;gap:7px}
.pc{display:grid;grid-template-columns:66px 1fr;gap:10px;align-items:center;padding:7px;border-radius:12px;border:1px solid transparent}
.pc .thumb svg{width:66px;height:41px;display:block;border-radius:8px}
.pc-t b{display:block;font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc-t span{font-size:10.5px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pc.on{background:linear-gradient(100deg,rgba(180,241,63,.16),rgba(180,241,63,.04));border-color:rgba(180,241,63,.45)}
.pc.on .pc-t b{color:var(--jugadas)}
.stage{grid-area:stage;display:flex;flex-direction:column;padding:12px;gap:9px;min-width:0}
.tools{display:flex;gap:6px;flex-wrap:wrap}
.tools b{font-size:11.5px;font-weight:650;padding:8px 13px;border-radius:11px;background:var(--glass);border:1px solid var(--ln);color:var(--tx2)}
.tools b.on{background:linear-gradient(140deg,#c9fa52,#8ed12e);color:var(--ink);border-color:transparent;font-weight:750}
.tools b.plus{color:var(--jugadas);border-color:rgba(180,241,63,.35)}
.field{flex:1;border-radius:16px;overflow:hidden;border:1px solid var(--ln);box-shadow:0 24px 60px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.03)}
.field svg{width:100%;height:100%;display:block}
.insp{grid-area:insp;display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--ln);background:var(--glass)}
.tabs{display:flex;gap:3px;padding:11px 11px 0}
.tabs>*{font-size:12px;font-weight:650;padding:9px 12px;color:var(--tx3);border-radius:11px 11px 0 0}
.tabs>.on{color:var(--jugadas);background:rgba(180,241,63,.1);box-shadow:inset 0 -2px 0 var(--jugadas)}
.grp{padding:15px 14px 6px;font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--tx3);font-weight:750}
.formation{margin:0 14px;display:flex;justify-content:space-between;align-items:center;padding:11px 13px;border-radius:11px;background:rgba(255,255,255,.055);border:1px solid var(--ln);font-size:12.5px;font-weight:650}
.chips{display:flex;gap:7px;padding:9px 14px}
.chips b{font-family:var(--mono);font-size:11px;padding:6px 10px;border-radius:9px;background:rgba(255,255,255,.06);border:1px solid var(--ln);color:var(--tx2)}
.chips b.on{background:rgba(180,241,63,.16);border-color:rgba(180,241,63,.45);color:var(--jugadas)}
.row{display:flex;justify-content:space-between;padding:8px 14px;font-size:12px;color:var(--tx2)}
.row b{color:var(--tx);font-weight:650}
.tr{margin:6px 14px;height:5px;border-radius:3px;background:rgba(255,255,255,.09);position:relative}
.tr i{position:absolute;left:38%;top:-4px;width:13px;height:13px;border-radius:50%;background:linear-gradient(140deg,#c9fa52,#8ed12e);box-shadow:0 0 0 4px rgba(180,241,63,.16)}
.tl{grid-area:tl;display:flex;align-items:center;gap:13px;padding:0 14px;border-top:1px solid var(--ln);background:rgba(10,14,17,.72);backdrop-filter:blur(14px)}
.tl .pl{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:linear-gradient(140deg,#c9fa52,#8ed12e);color:var(--ink);box-shadow:0 6px 18px rgba(180,241,63,.3)}
.tl .bar{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.09);position:relative}
.tl .bar i{position:absolute;left:0;top:0;height:100%;width:22%;border-radius:3px;background:linear-gradient(90deg,#8ed12e,#c9fa52)}
.tl span{font-family:var(--mono);font-size:11.5px;color:var(--tx2)}
.tl b{font-family:var(--mono);font-size:11.5px;padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid var(--ln)}
</style></head><body>
<div class="app">
  <header class="top">
    <div class="brand"><span class="mark">${bandera}</span> FlagPlays</div>
    <div class="chip">Mi libreta • 17</div><div class="sp"></div>
    <div class="seg"><b class="on">Editar</b><span>Animar</span><span>Simular</span></div><div class="sp"></div>
    <nav class="sections">${secciones('n')}</nav>
    <div class="acts"><b>Analizar</b><b>Exportar</b></div>
  </header>
  <aside class="side">
    <div class="side-h">Libreta <span>17</span></div>
    <div class="search">Buscar jugada…</div>
    <div class="playcards">${tarjetas('#b4f13f')}</div>
  </aside>
  <main class="stage">
    <div class="tools">${herramientas()}</div>
    <div class="field">${campoBlue}</div>
  </main>
  <aside class="insp">
    <div class="tabs"><b class="on">Ofensiva</b><span>Defensa</span><span>Jugada</span><span>Estilo</span></div>
    <div class="grp">Formación</div><div class="formation">Trips Derecha 5v5 <span style="color:#6d8480">▾</span></div>
    <div class="grp">Jugadores ofensivos</div><div class="chips"><b class="on">QB</b><b>C</b><b>X</b><b>Y</b><b>Z</b></div>
    <div class="grp">Balón</div><div class="row">Receptor <b>Y</b></div><div class="row">Lanzamiento <b>2,0 s</b></div><div class="tr"><i></i></div>
  </aside>
  <footer class="tl"><span class="pl">▶</span><div class="bar"><i></i></div><span>0,00 s / 3,57 s</span><b>1×</b></footer>
</div></body></html>`;
}

const salida = [
  ['diseno-A.html', maquetaA()],
  ['diseno-B.html', maquetaB()],
  ['diseno-C.html', maquetaC()],
];
for (const [nombre, html] of salida) {
  fs.writeFileSync(`qa/mock/${nombre}`, html, 'utf8');
  console.log(nombre, '->', html.length, 'bytes');
}
