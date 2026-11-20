// Arrastre REAL con eventos de CDP (ratón de verdad) dentro de la app de Windows.
// Uso: node tools/win-drag.mjs x1 y1 x2 y2   (coordenadas CSS relativas al viewport)
const PORT = 9222;
const [x1, y1, x2, y2] = process.argv.slice(2).map(Number);
if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) {
  console.error('Uso: node tools/win-drag.mjs x1 y1 x2 y2');
  process.exit(1);
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page') || list[0];
const ws = await new Promise((res, rej) => {
  const s = new WebSocket(page.webSocketDebuggerUrl);
  s.onopen = () => res(s);
  s.onerror = rej;
});

let id = 0;
const call = (method, params = {}) =>
  new Promise((res, rej) => {
    const msgId = ++id;
    const onMsg = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id !== msgId) return;
      ws.removeEventListener('message', onMsg);
      d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = { button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' };

await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1, buttons: 0, pointerType: 'mouse' });
await sleep(120);
await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, ...base });
await sleep(140);
const steps = 10;
for (let i = 1; i <= steps; i++) {
  const t = i / steps;
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: x1 + (x2 - x1) * t,
    y: y1 + (y2 - y1) * t,
    buttons: 1,
    button: 'left',
    pointerType: 'mouse',
  });
  await sleep(70);
}
await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, ...base, buttons: 0 });
await sleep(400);
console.log(`arrastre ${x1},${y1} → ${x2},${y2}`);
ws.close();
