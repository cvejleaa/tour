import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bygGraf, aggregerKanter, groupOf } from './build-dep-graph.mjs';
import rigtig from '../src/data/depGraph.json';

/** En lille kodebase i en temp-mappe. */
function fixture(filer) {
  const rod = fs.mkdtempSync(path.join(os.tmpdir(), 'depgraph-'));
  for (const [rel, indhold] of Object.entries(filer)) {
    const p = path.join(rod, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, indhold);
  }
  return rod;
}

describe('bygGraf — fil-niveauet er det målte, gruppe-niveauet afledes', () => {
  it('opløser relative imports (import, export-from, require) til filer og aggregerer pr. gruppe', () => {
    const rod = fixture({
      'src/pages/A.jsx': "import { x } from '../lib/b';\nimport C from '../components/C.jsx';\nimport { y } from '../lib/b.js';\nimport json from '../data/x.json';\nimport ekstern from 'react';\n",
      'src/lib/b.js': "export const x = 1;\n",
      'src/components/C.jsx': "export { x } from '../lib/b';\nimport D from './D';\n",
      'src/components/D.jsx': "export default 1;\n",
      'src/pages/A.test.jsx': "import A from './A';\n",
      'src/data/x.json': '{}',
      'functions-platform/index.js': "const { f } = require('./forladSpil');\nconst x = require('firebase-admin');\n",
      'functions-platform/forladSpil.js': "module.exports = {};\n",
    });
    const g = bygGraf(rod, new Date('2026-09-04T12:00:00Z'));
    fs.rmSync(rod, { recursive: true, force: true });
    expect(g.generatedAt).toBe('2026-09-04T12:00:00.000Z');
    // Testfiler og data er ikke kildefiler — og en ukendt pakke ('react') opløses ikke.
    expect(g.filer.map((f) => f.id)).toEqual([
      'functions-platform/forladSpil.js', 'functions-platform/index.js',
      'src/components/C.jsx', 'src/components/D.jsx', 'src/lib/b.js', 'src/pages/A.jsx',
    ]);
    expect(g.filer.find((f) => f.id === 'src/pages/A.jsx').gruppe).toBe('pages');
    const navn = (i) => g.filer[i].id;
    const kanter = g.filKanter.map(([i, j]) => `${navn(i)} → ${navn(j)}`);
    expect(kanter).toEqual([
      'functions-platform/index.js → functions-platform/forladSpil.js',
      'src/components/C.jsx → src/components/D.jsx',
      'src/components/C.jsx → src/lib/b.js',
      'src/pages/A.jsx → src/components/C.jsx',
      'src/pages/A.jsx → src/lib/b.js',
      'src/pages/A.jsx → src/lib/b.js', // to import-sætninger = to kanter (count 2, som før)
    ]);
    // Gruppe-niveau: samme-gruppe-kanter (C → D, index → forladSpil) er IKKE gruppekanter.
    expect(g.edges).toEqual([
      { from: 'components', to: 'lib (kerne)', count: 1 },
      { from: 'pages', to: 'components', count: 1 },
      { from: 'pages', to: 'lib (kerne)', count: 2 },
    ]);
    expect(g.nodes).toEqual([
      { id: 'lib (kerne)', layer: 0, files: 1 },
      { id: 'Cloud Functions (platform)', layer: 1, files: 2 },
      { id: 'components', layer: 2, files: 2 },
      { id: 'pages', layer: 3, files: 1 },
    ]);
  });

  it('groupOf: begge functions-mapper er hver sin kasse; ukendt src-sti falder i app-skal', () => {
    expect(groupOf('functions/index.js').id).toBe('Cloud Functions (Tour)');
    expect(groupOf('functions-platform/forladSpil.js').id).toBe('Cloud Functions (platform)');
    expect(groupOf('src/features/games/useGame.js')).toEqual({ id: 'features/games', layer: 2 });
    expect(groupOf('src/noget/andet.js')).toEqual({ id: 'app-skal', layer: 4 });
  });
});

describe('den RIGTIGE depGraph.json — paritet mellem niveauerne', () => {
  it('gruppe-kanterne er præcis aggregeringen af fil-kanterne, og hver fil-kant peger på en kendt fil', () => {
    expect(rigtig.filer.length).toBeGreaterThan(200);
    expect(rigtig.filKanter.length).toBeGreaterThan(500);
    for (const [i, j] of rigtig.filKanter) {
      expect(rigtig.filer[i]).toBeDefined();
      expect(rigtig.filer[j]).toBeDefined();
    }
    const sortér = (l) => [...l].sort((a, b) => `${a.from}→${a.to}`.localeCompare(`${b.from}→${b.to}`));
    expect(sortér(rigtig.edges)).toEqual(sortér(aggregerKanter(rigtig.filer, rigtig.filKanter)));
    // Kassernes filtal er antallet af filer i gruppen.
    for (const n of rigtig.nodes) {
      expect(rigtig.filer.filter((f) => f.gruppe === n.id).length).toBe(n.files);
    }
    // Begge functions-mapper er med — «Cloud Functions» var før én fil uden kanter.
    expect(rigtig.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['Cloud Functions (platform)', 'Cloud Functions (Tour)']));
    expect(rigtig.filKanter.some(([i]) => rigtig.filer[i].id.startsWith('functions-platform/'))).toBe(true);
  });
});
