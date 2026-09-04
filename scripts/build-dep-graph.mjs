// Genererer src/data/depGraph.json: afhængighedsdiagrammet på Admin → Tests →
// Afhængigheder, ud fra de faktiske relative imports (og require i functions)
// i src/, functions/ og functions-platform/. Kør via npm run test:report,
// eller alene: node scripts/build-dep-graph.mjs.
//
// TO NIVEAUER, ÉN KILDE. Fil-niveauet (`filer`, `filKanter`) er det målte;
// gruppe-niveauet (`nodes`, `edges`) er AFLEDT af det i samme funktion, så
// diagrammets kasser og de udfoldede filer aldrig kan være uenige. En test
// asserterer pariteten på den rigtige JSON. Fil-niveauet findes, fordi
// ejeren vil kunne dobbeltklikke en kasse (fx pages) og se de enkelte filer
// med deres afhængigheder tegnet ind (4/9 2026).
//
// FØR: kun gruppe-niveau, og «Cloud Functions» var én fil uden kanter, fordi
// filtret pegede på functions/scoring.js og standings.js, som ikke findes
// mere — og functions-platform/ var slet ikke med. Nu tælles alle
// kildefiler i begge functions-mapper (require-sætninger inkl.).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Alle kildefiler under `dir` (ikke tests, ikke data, ikke node_modules). */
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'data' || e.name === 'test') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Gruppe + lag for en fil (relativ sti med /). Laget styrer layoutet: 0 = fundament, 4 = app-skal. */
export function groupOf(rel) {
  if (rel.startsWith('functions-platform/')) return { id: 'Cloud Functions (platform)', layer: 1 };
  if (rel.startsWith('functions/')) return { id: 'Cloud Functions (Tour)', layer: 1 };
  if (/^src\/firebase\.js$/.test(rel)) return { id: 'firebase', layer: 0 };
  if (/^src\/(App|main)\.jsx$/.test(rel)) return { id: 'app-skal', layer: 4 };
  if (rel.startsWith('src/pages/')) return { id: 'pages', layer: 3 };
  const fe = rel.match(/^src\/features\/([^/]+)\//);
  if (fe) return { id: `features/${fe[1]}`, layer: 2 };
  if (rel.startsWith('src/components/')) return { id: 'components', layer: 2 };
  if (rel.startsWith('src/context/')) return { id: 'context', layer: 1 };
  if (rel.startsWith('src/lib/')) return { id: 'lib (kerne)', layer: 0 };
  return { id: 'app-skal', layer: 4 };
}

// `import x from './y'`, `import './y'`, `export … from './y'` og `require('./y')`.
const IMPORT_RE = /(?:\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?|\brequire\s*\(\s*)['"](\.[^'"]+)['"]/g;

/** Opløser en relativ import til en eksisterende fil, eller null. */
function opløs(fraFil, spec) {
  const target = path.resolve(path.dirname(fraFil), spec);
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  for (const s of ['.js', '.jsx', '.mjs', '/index.js', '/index.jsx']) {
    if (fs.existsSync(target + s)) return target + s;
  }
  return null;
}

/**
 * Bygger grafen for en rod-mappe. Ren funktion over filsystemet — testbar
 * med en fixture-mappe.
 * `filKanter` er par af INDEKSER i `filer` ([fra, til]) — ikke stier: 855
 * kanter som stier var 60 KB i den bundlede JSON, som indekser 9 KB.
 * @returns {{ generatedAt, nodes, edges, filer, filKanter }}
 */
export function bygGraf(rod, nu = new Date()) {
  const files = [
    ...walk(path.join(rod, 'src')),
    ...walk(path.join(rod, 'functions')),
    ...walk(path.join(rod, 'functions-platform')),
  ];
  const rel = (abs) => abs.slice(rod.length + 1).replaceAll('\\', '/');
  const kendte = new Set(files.map(rel));

  const filer = files.map(rel).sort().map((id) => ({ id, gruppe: groupOf(id).id }));
  const indeks = new Map(filer.map((f, i) => [f.id, i]));
  const filKanter = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = IMPORT_RE.exec(src))) {
      const to = opløs(file, m[1]);
      if (!to) continue;
      const toRel = rel(to);
      if (!kendte.has(toRel)) continue; // fx en testfil eller data — ikke en kildefil
      filKanter.push([indeks.get(rel(file)), indeks.get(toRel)]);
    }
  }
  filKanter.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Gruppe-niveauet afledes.
  const nodes = new Map();
  for (const f of filer) {
    const g = groupOf(f.id);
    if (!nodes.has(g.id)) nodes.set(g.id, { id: g.id, layer: g.layer, files: 0 });
    nodes.get(g.id).files += 1;
  }
  return {
    generatedAt: nu.toISOString(),
    nodes: [...nodes.values()].sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id)),
    edges: aggregerKanter(filer, filKanter),
    filer,
    filKanter,
  };
}

/**
 * Gruppe-kanter regnet ud af fil-kanterne — brugt af bygGraf OG af
 * paritetstesten mod den skrevne JSON (samme funktion, så de ikke kan drive).
 */
export function aggregerKanter(filer, filKanter) {
  const edges = new Map();
  for (const [i, j] of filKanter) {
    const a = filer[i].gruppe;
    const b = filer[j].gruppe;
    if (a === b) continue;
    const key = `${a}→${b}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  return [...edges.entries()].map(([k, count]) => { const [from, to] = k.split('→'); return { from, to, count }; });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const graph = bygGraf(ROOT);
  fs.mkdirSync(path.join(ROOT, 'src', 'data'), { recursive: true });
  // Kompakt: fil-kanterne som [i,j]-par på få linjer, resten indrykket.
  const tekst = JSON.stringify({ ...graph, filKanter: '__K__' }, null, 1)
    .replace('"__K__"', `[\n${graph.filKanter.map((p) => JSON.stringify(p)).join(',')}\n]`);
  fs.writeFileSync(path.join(ROOT, 'src', 'data', 'depGraph.json'), tekst);
  console.log('Skrev src/data/depGraph.json:', { noder: graph.nodes.length, kanter: graph.edges.length, filer: graph.filer.length, filKanter: graph.filKanter.length });
}
