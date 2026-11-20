// Lanzador de la batería de pruebas de FlagPlays.
// Uso: node tests/run.mjs
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && f !== 'run.mjs')
  .sort();

if (!files.length) {
  console.error('No hay tests.');
  process.exit(1);
}

let failed = 0;
const results = [];

for (const f of files) {
  const start = Date.now();
  const res = spawnSync(process.execPath, [join(here, f)], { encoding: 'utf8' });
  const ms = Date.now() - start;
  const ok = res.status === 0;
  if (!ok) failed++;
  const tail = `${res.stdout || ''}${res.stderr || ''}`.trim().split('\n').slice(-3).join(' ').trim();
  results.push({ f, ok, ms, tail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(18)} ${String(ms).padStart(5)} ms  ${ok ? '' : tail}`);
}

console.log('');
if (failed) {
  console.error(`${failed} fichero(s) de test fallan.`);
  process.exit(1);
}
console.log(`Todo en verde: ${files.length} ficheros de test.`);
