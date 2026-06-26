// Genererer src/data/depGraph.json: et grupperet afhængighedsdiagram ud fra de
// faktiske relative imports i src/ og functions/. Kør via npm run test:report.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Find alle kildefiler (ikke tests, ikke data)
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'data') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) acc.push(p);
  }
  return acc;
}

const files = [
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'functions')).filter((f) => /index\.js$|scoring\.js$|standings\.js$/.test(f)),
];

// Kort en filsti til en gruppe + lag (til layout)
function groupOf(absPath) {
  const rel = absPath.slice(ROOT.length + 1).replaceAll('\\', '/');
  if (rel.startsWith('functions/')) return { id: 'Cloud Functions', layer: 1 };
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

const importRe = /import\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

const nodes = new Map(); // id -> {id, layer, files, tests?}
const edges = new Map(); // "from→to" -> count

function addNode(g) {
  if (!nodes.has(g.id)) nodes.set(g.id, { id: g.id, layer: g.layer, files: 0 });
  nodes.get(g.id).files += 1;
}

for (const file of files) {
  const fromG = groupOf(file);
  addNode(fromG);
  const src = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = importRe.exec(src))) {
    const target = path.resolve(path.dirname(file), m[1]);
    // gæt filendelse hvis nødvendigt
    let resolved = target;
    if (!fs.existsSync(resolved)) {
      const cand = ['.js', '.jsx', '/index.js', '/index.jsx'].map((s) => target + s).find((p) => fs.existsSync(p));
      if (cand) resolved = cand;
    }
    const toG = groupOf(resolved);
    if (toG.id === fromG.id) continue;
    const key = `${fromG.id}→${toG.id}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
}

const graph = {
  generatedAt: new Date().toISOString(),
  nodes: [...nodes.values()].sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id)),
  edges: [...edges.entries()].map(([k, count]) => {
    const [from, to] = k.split('→');
    return { from, to, count };
  }),
};

fs.mkdirSync(path.join(ROOT, 'src', 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'depGraph.json'), JSON.stringify(graph, null, 2));
console.log('Skrev src/data/depGraph.json:', { noder: graph.nodes.length, kanter: graph.edges.length });
