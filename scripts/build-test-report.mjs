// Genererer src/data/testReport.json fra den faktiske test-suite (frontend +
// functions). Kør med: npm run test:report
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FE = path.join(ROOT, '.report-fe.json');
const FN = path.join(ROOT, 'functions', '.report-fn.json');

function run(cmd, cwd) {
  try { execSync(cmd, { cwd, stdio: 'ignore' }); }
  catch { /* vitest exit-kode != 0 ved fejlende tests — vi læser rapporten alligevel */ }
}

console.log('Kører frontend-tests…');
run(`npx vitest run --reporter=json --outputFile=${FE}`, ROOT);
console.log('Kører functions-tests…');
run(`npx vitest run --reporter=json --outputFile=${FN}`, path.join(ROOT, 'functions'));

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

const suites = [...load(FE, 'frontend'), ...load(FN, 'functions')]
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
fs.rmSync(FE, { force: true });
fs.rmSync(FN, { force: true });
console.log('Skrev src/data/testReport.json:', report.totals);

// Opdater også afhængighedsdiagrammet
execSync('node scripts/build-dep-graph.mjs', { cwd: ROOT, stdio: 'inherit' });
