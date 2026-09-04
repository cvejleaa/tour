// Måler, hvad fladedæknings-tappen (src/test/setup.js) koster i kørselstid:
// hele frontend-suiten én gang UDEN EVNE_LOG og én gang MED. Printer
// sekunder, Vitests egen Duration og antallet af logposter (interaktioner
// og render-poster hver for sig).
//
// Findes, fordi et tal uden kode er en påstand: PR'en, der indførte
// render-tappen (MutationObserver på document.body), skulle skrive før/efter-
// tal i teksten, og de skal kunne genmåles med præcis denne kommando:
//
//   node scripts/maal-koeretid.mjs            # begge kørsler (~5 min)
//   node scripts/maal-koeretid.mjs --kun-tap  # kun kørslen med tap
//
// Målt 4/9 2026 på sessionens container (efter `npm ci`, uden anden last):
// se tabellen i PR'en for tre statusser (opgave #15). Kør ALDRIG andet
// CPU-tungt samtidig — så måler du lasten, ikke tappen.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laesLog, antalInteraktioner } from './lib/fladeDaekning.mjs';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG = path.join(ROD, '.evne-log-maal');

function koer(env) {
  const start = Date.now();
  let ud = '';
  try {
    ud = execSync('npx vitest run --silent', { cwd: ROD, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    ud = `${e.stdout || ''}${e.stderr || ''}`;
  }
  const sek = (Date.now() - start) / 1000;
  const m = /Duration\s+([\d.]+)s/.exec(ud);
  return { sek: Math.round(sek), duration: m ? Number(m[1]) : null, groen: /Tests\s+\d+ passed/.test(ud) && !/failed/.test(ud) };
}

function poster() {
  if (!fs.existsSync(LOG)) return { linjer: 0, interaktioner: 0, render: 0, bytes: 0 };
  const filer = fs.readdirSync(LOG).filter((f) => f.endsWith('.ndjson'));
  const alle = filer.flatMap((f) => laesLog(fs.readFileSync(path.join(LOG, f), 'utf8')));
  const bytes = filer.reduce((n, f) => n + fs.statSync(path.join(LOG, f)).size, 0);
  return { linjer: alle.length, interaktioner: antalInteraktioner(alle), render: alle.filter((p) => p.type === 'render').length, bytes };
}

const kunTap = process.argv.includes('--kun-tap');
const rapport = {};
if (!kunTap) {
  rapport.udenTap = koer({ EVNE_LOG: '' });
}
fs.rmSync(LOG, { recursive: true, force: true });
rapport.medTap = { ...koer({ EVNE_LOG: LOG }), log: poster() };
fs.rmSync(LOG, { recursive: true, force: true });
console.log(JSON.stringify(rapport, null, 2));
