// Ejecuta JavaScript dentro de la app de Windows en modo --dev (CDP, puerto 9222).
// Uso: node tools/win-eval.mjs "expression"
//      node tools/win-eval.mjs --shot qa/pantalla.png
const PORT = 9222;

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error('no se pudo conectar: ' + e.message));
  });
}

let id = 0;
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    const onMsg = (ev) => {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (data.id === msgId) {
        ws.removeEventListener('message', onMsg);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

const shotIdx = process.argv.indexOf('--shot');
const fileIdx = process.argv.indexOf('--file');
let arg = process.argv[2] || '';
if (fileIdx > 0) {
  const { readFileSync } = await import('node:fs');
  arg = readFileSync(process.argv[fileIdx + 1], 'utf8');
}

const list = await targets();
const page = list.find((t) => t.type === 'page' && /appassets|localhost|127\.0\.0\.1/.test(t.url || '')) || list[0];
if (!page) {
  console.error('No hay ninguna página depurable. ¿Está la app abierta con --dev?');
  process.exit(1);
}

const ws = await connect(page.webSocketDebuggerUrl);
await send(ws, 'Runtime.enable');

if (shotIdx > 0) {
  const file = process.argv[shotIdx + 1];
  await new Promise((r) => setTimeout(r, 600));
  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`captura → ${file}`);
} else if (arg && !arg.startsWith('--')) {
  const res = await send(ws, 'Runtime.evaluate', {
    expression: arg,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = res?.result?.value;
  if (res?.exceptionDetails) {
    console.error('Excepción:', JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails));
    process.exitCode = 1;
  } else {
    console.log(typeof value === 'string' ? value : JSON.stringify(value));
  }
}

ws.close();
