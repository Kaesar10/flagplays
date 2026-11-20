// Abre una URL en Chrome headless con depuración y evalúa JavaScript dentro.
// Uso: node tools/cdp.mjs <url> <archivo-con-expresion>
const PORT = 9333;
const [url, exprFile] = process.argv.slice(2);
if (!url) {
  console.error('Uso: node tools/cdp.mjs <url> [exprFile]');
  process.exit(1);
}
const { spawn } = await import('node:child_process');
const fs = await import('node:fs');
const chrome =
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const perfil = `.cache\\cdp-profile`;
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${perfil}`,
    '--window-size=420,1020',
    url,
  ],
  { stdio: 'ignore', detached: false }
);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 40; i++) {
  await esperar(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:5173'));
    if (target) break;
  } catch {}
}
if (!target) {
  console.error('no se pudo conectar al navegador');
  proc.kill();
  process.exit(1);
}
await esperar(3500);
const ws = await new Promise((res, rej) => {
  const s = new WebSocket(target.webSocketDebuggerUrl);
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

if (exprFile) {
  const expr = fs.readFileSync(exprFile, 'utf8');
  const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) console.error('EXCEPCIÓN:', r.exceptionDetails.exception?.description);
  else console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 1));
}
ws.close();
proc.kill();
