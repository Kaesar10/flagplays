// Maquetas de móvil (390x844): una plantilla, tres paletas.
// Uso: node tools/mockups-mobile.mjs
import fs from 'node:fs';

const CAMPOS = {
  A: 'campo-night.svg',
  B: 'campo-paper.svg',
  C: 'campo-blueprint.svg',
};

const PALETAS = {
  A: {
    fondo: 'radial-gradient(120% 80% at 50% -10%,#0d1a22,#05080b 70%)',
    top: '#0a1218',
    linea: '#1b3340',
    tarjeta: '#0e1a22',
    tarjetaOn: '#132530',
    texto: '#f2fbf5',
    texto2: '#a9c3ce',
    texto3: '#6a8a97',
    acento: '#c6f432',
    tinta: '#08120a',
    tabActivo: 'var(--acento)',
    tabInactivo: '#6a8a97',
    radio: '9px',
    fuente: '"Archivo","Inter",system-ui,sans-serif',
    brillo: '0 6px 18px rgba(0,0,0,.5)',
    bordeActivo: '1px solid var(--acento)',
  },
  B: {
    fondo: '#f7f4ec',
    top: '#f7f4ec',
    linea: '#d8d1c0',
    tarjeta: '#fffdf8',
    tarjetaOn: '#fffdf8',
    texto: '#14181b',
    texto2: '#4c565c',
    texto3: '#8b979c',
    acento: '#cf3f2b',
    tinta: '#f7f4ec',
    tabActivo: '#14181b',
    tabInactivo: '#8b979c',
    radio: '2px',
    fuente: '"Inter",system-ui,sans-serif',
    brillo: 'none',
    bordeActivo: '3px solid #cf3f2b',
  },
  C: {
    fondo: '#0a0e11',
    top: 'rgba(10,14,17,.72)',
    linea: 'rgba(255,255,255,.1)',
    tarjeta: 'rgba(255,255,255,.035)',
    tarjetaOn: 'rgba(180,241,63,.1)',
    texto: '#f4f8f6',
    texto2: '#a8bcb6',
    texto3: '#6d8480',
    acento: '#b4f13f',
    tinta: '#08120a',
    tabActivo: 'linear-gradient(140deg,#c9fa52,#8ed12e)',
    tabInactivo: '#6d8480',
    radio: '12px',
    fuente: '"Inter",system-ui,sans-serif',
    brillo: '0 8px 22px rgba(180,241,63,.3)',
    bordeActivo: '1px solid rgba(180,241,63,.45)',
  },
};

const JUGADAS = [
  ['Trips Drch 1', 'Pase profundo'],
  ['Spread 2', 'Pase corto'],
  ['Bunch Drch 3', 'Pase corto'],
  ['Stack 4', 'Engaño'],
];

function tira(acento, radio) {
  return JUGADAS.map(
    ([n, c], i) => `<div class="card${i === 0 ? ' on' : ''}">
      <div class="thumb"><svg viewBox="0 0 60 34"><path d="M14 26v-8l7-5" stroke="${acento}" stroke-width="1.7" fill="none"/><path d="M30 26v-12" stroke="${acento}" stroke-width="1.7"/><circle cx="14" cy="26" r="2.4" fill="${acento}"/><circle cx="30" cy="26" r="2.4" fill="${acento}"/><circle cx="46" cy="26" r="2.4" fill="${acento}"/></svg></div>
      <b>${n}</b><span>${c}</span></div>`
  ).join('');
}

function html(d) {
  const p = PALETAS[d];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Móvil ${d}</title><style>
*{box-sizing:border-box;margin:0}
body{background:${p.fondo};color:${p.texto};font-family:${p.fuente};height:100vh;overflow:hidden}
.app{display:grid;grid-template-rows:54px 88px minmax(0,1fr) 56px;height:100vh}
.top{display:flex;align-items:center;gap:8px;padding:0 9px;background:${p.top};border-bottom:1px solid ${p.linea};backdrop-filter:blur(12px)}
.hamb{display:grid;place-items:center;width:42px;height:42px;font-size:19px;color:${p.texto2}}
.seg{display:flex;gap:2px;margin:0 auto;border:1px solid ${p.linea};border-radius:999px;padding:3px;background:rgba(127,127,127,.08)}
.seg>*{font-size:11.5px;font-weight:650;padding:7px 12px;border-radius:999px;color:${p.tabInactivo}}
.seg>.on{background:${p.tabActivo};color:${p.tinta};font-weight:750;box-shadow:${p.brillo}}
.dots{width:42px;height:42px;display:grid;place-items:center;color:${p.texto2};font-size:18px}
.strip{display:flex;gap:8px;padding:7px 8px 9px;overflow:hidden;background:${p.top};border-bottom:1px solid ${p.linea}}
.card{flex:none;width:114px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 4px 5px;border-radius:${p.radio};background:${p.tarjeta};border:1px solid transparent}
.card.on{background:${p.tarjetaOn};border:${p.bordeActivo}}
.card .thumb{width:100%;height:48px;border-radius:calc(${p.radio} / 1.5);overflow:hidden;background:rgba(0,0,0,.22)}
.card .thumb svg{width:100%;height:100%;display:block}
.card b{font-size:10px;text-align:center;color:${p.texto}}
.card span{font-size:8px;text-align:center;color:${p.texto3}}
.card.on b{color:${p.acento}}
.campo{padding:7px;border-bottom:1px solid ${p.linea};min-height:0;display:grid;place-items:center;background:${p.top}}
.campo{background-size:contain;background-position:center;background-repeat:no-repeat;padding:10px 6px}
.fab{position:fixed;right:13px;bottom:78px;width:48px;height:48px;border-radius:50%;border:0;background:${p.acento};color:${p.tinta};font-size:19px;box-shadow:${p.brillo}}
.tl{display:flex;align-items:center;gap:9px;padding:0 10px;border-top:1px solid ${p.linea};background:${p.top}}
.tl .pl{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:${p.acento};color:${p.tinta};font-size:12px;box-shadow:${p.brillo}}
.tl .bar{flex:1;height:5px;border-radius:3px;background:rgba(127,127,127,.22);position:relative}
.tl .bar i{position:absolute;left:0;top:0;height:100%;width:20%;border-radius:3px;background:${p.acento}}
.tl .t{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10.5px;color:${p.texto2}}
.tl b{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10.5px;padding:5px 8px;border-radius:8px;border:1px solid ${p.linea};color:${p.texto2}}
</style></head><body>
<div class="app">
  <header class="top"><span class="hamb">☰</span>
    <div class="seg"><b class="on">Editar</b><span>Animar</span><span>Simular</span></div>
    <span class="dots">···</span></header>
  <div class="strip">${tira(p.acento, p.radio)}</div>
  <main class="campo" style="background-image:url('${CAMPOS[d]}')"></main>
  <button class="fab">⚙</button>
  <footer class="tl"><span class="pl">▶</span><div class="bar"><i></i></div><span class="t">0,00 s</span><b>1×</b></footer>
</div></body></html>`;
}

for (const d of ['A', 'B', 'C']) {
  fs.writeFileSync(`qa/mock/movil-${d}.html`, html(d), 'utf8');
  console.log(`movil-${d}.html listo`);
}

