// Genererer src/data/testReport.json fra den faktiske test-suite. Kør med:
// npm run test:report — eller Actions → "Opdatér test-rapporten".
//
// TRE SUITER, IKKE TO. `functions-platform/` manglede, fra fanen blev bygget:
// scriptet kørte rod-projektet og `functions/`, altså frontend og TOURENS
// server. Hele platform-serveren — den, dette spil faktisk kører på — har
// aldrig været talt med, og fanen sagde "Cloud Functions" om Tourens tal, som
// om der kun fandtes én server. Derfor er området nu navngivet pr. app.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanTrae } from './scan-flade.mjs';
import { flet, laesLog } from './lib/fladeDaekning.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FE = path.join(ROOT, '.report-fe.json');
const FN = path.join(ROOT, 'functions', '.report-fn.json');
const PF = path.join(ROOT, 'functions-platform', '.report-pf.json');
// Tappen i src/test/setup.js skriver én NDJSON pr. worker hertil, når
// EVNE_LOG er sat. Mappen tømmes før kørslen, så en gammel log ikke
// krediterer elementer, ingen test rører længere.
const EVNE = path.join(ROOT, '.evne-log');
// E2E-klik (Playwright mod emulatorerne) logges i sin egen mappe, så en tom
// E2E-log kan skelnes fra en tom Vitest-log — de fejler hver for sig.
const EVNE_E2E = path.join(ROOT, '.evne-log-e2e');

function run(cmd, cwd, env = {}) {
  try { execSync(cmd, { cwd, stdio: 'ignore', env: { ...process.env, ...env } }); return true; }
  catch { return false; /* vitest exit-kode != 0 ved fejlende tests — vi læser rapporten alligevel */ }
}

fs.rmSync(EVNE, { recursive: true, force: true });
fs.rmSync(EVNE_E2E, { recursive: true, force: true });
console.log('Kører frontend-tests…');
run(`npx vitest run --reporter=json --outputFile=${FE}`, ROOT, { EVNE_LOG: EVNE });
// E2E TÆLLER MED — og kørslen SKAL lykkes. 1X2-knapperne i tip-fladen klikkes
// kun af e2e/platform/tip.spec.js; uden denne kørsel stod spillets vigtigste
// knap som urørt på fanen. Fejler Playwright (rød test, emulator der ikke
// kom op), skrives rapporten ikke: en halv E2E-log ville sætte e2eMedregnet
// og lyve om, hvad der er talt med.
console.log('Kører E2E (Playwright mod emulatorerne) med tappen…');
const e2eOk = run('npm run test:e2e:emu', ROOT, { EVNE_LOG: EVNE_E2E });
if (!e2eOk) {
  console.error('E2E-kørslen fejlede — ingen af rapportfilerne er skrevet. Læs playwright-report/ (lokalt, eller artefaktet fra kørslen i Actions), eller kør `EVNE_LOG=$PWD/.evne-log-e2e npm run test:e2e:emu` igen.');
  process.exit(1);
}
console.log('Kører functions-tests (Tour)…');
run(`npx vitest run --reporter=json --outputFile=${FN}`, path.join(ROOT, 'functions'));
// KØRES FRA MAPPEN, ikke med --config fra roden. `npx vitest run --config
// functions-platform/vitest.config.js` fra roden giver "No test files found":
// include-listen i konfigurationen er relativ til dens egen mappe.
console.log('Kører functions-tests (platform)…');
run(`npx vitest run --reporter=json --outputFile=${PF}`, path.join(ROOT, 'functions-platform'));

function load(file, area) {
  if (!fs.existsSync(file)) return [];
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (j.testResults || []).map((tr) => {
    const rel = tr.name.startsWith(ROOT) ? tr.name.slice(ROOT.length + 1) : tr.name;
    const tests = (tr.assertionResults || []).map((a) => ({
      name: [...(a.ancestorTitles || []), a.title].filter(Boolean).join(' › '),
      status: a.status,
    }));
    return {
      file: rel, area,
      passed: tests.filter((t) => t.status === 'passed').length,
      failed: tests.filter((t) => t.status !== 'passed').length,
      tests,
    };
  });
}

const suites = [...load(FE, 'frontend'), ...load(FN, 'functions'), ...load(PF, 'platform')]
  .sort((a, b) => a.area.localeCompare(b.area) || a.file.localeCompare(b.file));
const all = suites.flatMap((s) => s.tests);
const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    files: suites.length,
    tests: all.length,
    passed: all.filter((t) => t.status === 'passed').length,
    failed: all.filter((t) => t.status !== 'passed').length,
  },
  suites,
};

fs.mkdirSync(path.join(ROOT, 'src', 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'testReport.json'), JSON.stringify(report, null, 2));

// --- Fladedækning: inventar ⋈ tappens log -----------------------------------
// Samme generatedAt som testrapporten: de to filer er ét øjebliksbillede af
// samme kørsel, og fanens forældelses-vagt sammenligner datoerne.
const laesMappe = (dir) => (fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.ndjson'))
    .flatMap((f) => laesLog(fs.readFileSync(path.join(dir, f), 'utf8')))
  : []);
const logposter = laesMappe(EVNE);
const e2ePoster = laesMappe(EVNE_E2E);
// NUL LOGPOSTER ER EN FEJL, IKKE ET RESULTAT. Suiten har over 500
// interaktioner; en tom log betyder, at tappen ikke kørte (EVNE_LOG nåede
// ikke frem, setup.js er ændret, React-internals har skiftet navn). Skrev vi
// filen alligevel, ville fanen vise 0 % og lyve om, at ingen knap er testet.
if (logposter.length === 0) {
  console.error('Fladedækning: Vitest-tappen loggede ingen interaktioner — fladeDaekning.json er IKKE skrevet.');
  process.exit(1);
}
// Samme vagt for E2E: en grøn Playwright-kørsel uden logposter betyder, at
// fixturen ikke var koblet på (EVNE_LOG nåede ikke frem, dev-bygget udeblev,
// en spec importerer @playwright/test direkte) — ikke at ingen klikkede.
if (e2ePoster.length === 0) {
  console.error('Fladedækning: E2E-tappen loggede ingen interaktioner — fladeDaekning.json er IKKE skrevet.');
  process.exit(1);
}
const daekning = flet(scanTrae(ROOT), [...logposter, ...e2ePoster], { generatedAt: report.generatedAt, e2eMedregnet: true });
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'fladeDaekning.json'), JSON.stringify(daekning, null, 1));
fs.rmSync(EVNE, { recursive: true, force: true });
fs.rmSync(EVNE_E2E, { recursive: true, force: true });
console.log('Skrev src/data/fladeDaekning.json:', daekning.totals, `(heraf ${e2ePoster.length} E2E-logposter)`);
fs.rmSync(FE, { force: true });
fs.rmSync(FN, { force: true });
fs.rmSync(PF, { force: true });
console.log('Skrev src/data/testReport.json:', report.totals);

// Opdater også afhængighedsdiagrammet
execSync('node scripts/build-dep-graph.mjs', { cwd: ROOT, stdio: 'inherit' });
