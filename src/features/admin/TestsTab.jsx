// Admin-fane: grafisk oversigt over alle gennemførte tests + afhængighedsdiagram.
// Data genereres fra den faktiske suite via `npm run test:report`.
import { useState } from 'react';
import report from '../../data/testReport.json';
import depGraph from '../../data/depGraph.json';
import DepGraph from './DepGraph';

// ÉT NAVN PR. SERVER. Der er to: Tourens `functions/` og platformens
// `functions-platform/`. Da kun den første var med, stod dens tal under den
// generiske overskrift "Cloud Functions" — som om der kun fandtes én. Nu hvor
// begge tælles med, skal begge sige HVILKEN.
const AREA_LABELS = {
  frontend: 'Frontend (UI)',
  functions: 'Cloud Functions (Tour)',
  platform: 'Cloud Functions (platform)',
};
const SUB = { OVERVIEW: 'overview', DEPS: 'deps', DETAILS: 'details' };

// --- Er tallene forældede? -------------------------------------------------
//
// Fanen viser et ØJEBLIKSBILLEDE, ikke en måling af suiten lige nu: to
// committede JSON-filer, skrevet af `npm run test:report`. Bliver de ikke
// genskabt, står tallene og lyver stille. Det gjorde de i to måneder — siden
// viste 73 testfiler, mens suiten var vokset til over 200 — og intet på
// skærmen antydede det. Det er præcis den fejl, CLAUDE.md kalder "et spejl af
// levende data er en løgn med forsinkelse".
//
// GRÆNSEN ER BUNDET TIL SKEMAET, ikke til en fornemmelse. Workflowet
// `test-report.yml` kører hver mandag, så 14 dage betyder, at MINDST TO
// planlagte kørsler er udeblevet. Én kan være et udfald; to er, at det er
// holdt op med at virke.
export const FORAELDET_DAGE = 14;

/** Alder i dage, eller null hvis datoen ikke kan læses. */
export function alderIDage(iso, nu = Date.now()) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (nu - t) / 86_400_000 : null;
}

/**
 * Den ÆLDSTE af datoerne — den, der afgør om fanen er forældet.
 *
 * De to filer skrives normalt i samme kørsel, men de ER to filer og kan komme
 * fra hver sin. Målte vi på testrapporten alene, ville en frisk rapport kunne
 * skjule et forældet diagram bag sin egen dato.
 *
 * Returnerer null, hvis bare én dato ikke kan læses — kalderen skal da larme,
 * ikke gætte.
 */
export function aeldsteDato(isoListe, nu = Date.now()) {
  let vaerst = null;
  for (const iso of isoListe) {
    const alder = alderIDage(iso, nu);
    if (alder == null) return null;
    if (!vaerst || alder > vaerst.alder) vaerst = { iso, alder };
  }
  return vaerst;
}

/**
 * Er rapporten forældet?
 *
 * EN ULÆSELIG DATO TÆLLER SOM FORÆLDET. Vagten skal fejle ÅBENT: en tom eller
 * ødelagt `generatedAt` er ikke et bevis på, at tallene er friske.
 */
export function erForaeldet(isoListe, nu = Date.now()) {
  const aeldste = aeldsteDato(isoListe, nu);
  if (!aeldste) return true;
  return aeldste.alder > FORAELDET_DAGE;
}

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(iso));
  } catch { return iso; }
}

// Donut der viser bestået-andel
function Donut({ passed, failed }) {
  const total = passed + failed || 1;
  const pct = Math.round((passed / total) * 100);
  const R = 52, C = 2 * Math.PI * R;
  const ok = (passed / total) * C;
  return (
    <svg viewBox="0 0 130 130" width="130" height="130" role="img" aria-label={`${pct}% bestået`}>
      <circle cx="65" cy="65" r={R} fill="none" stroke="var(--c-border)" strokeWidth="13" />
      <circle cx="65" cy="65" r={R} fill="none" stroke={failed ? 'var(--c-err)' : 'var(--c-ok)'} strokeWidth="13"
        strokeDasharray={`${ok} ${C - ok}`} strokeDashoffset={C / 4} strokeLinecap="round"
        transform="rotate(-0 65 65)" />
      <text x="65" y="61" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--c-text)">{pct}%</text>
      <text x="65" y="80" textAnchor="middle" fontSize="11" fill="var(--c-muted)">bestået</text>
    </svg>
  );
}

function OverviewTab() {
  const { totals, suites } = report;
  const areas = [...new Set(suites.map((s) => s.area))];
  const areaCounts = areas.map((a) => ({
    area: a,
    tests: suites.filter((s) => s.area === a).reduce((n, s) => n + s.tests.length, 0),
  }));
  const maxArea = Math.max(...areaCounts.map((a) => a.tests), 1);
  // Top filer efter antal tests
  const topFiles = [...suites].sort((a, b) => b.tests.length - a.tests.length).slice(0, 8);
  const maxFile = Math.max(...topFiles.map((s) => s.tests.length), 1);

  return (
    <div>
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <Donut passed={totals.passed} failed={totals.failed} />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge badge--blue" style={{ fontSize: '0.85rem' }}>{totals.tests} tests</span>
          <span className="badge badge--muted" style={{ fontSize: '0.85rem' }}>{totals.files} filer</span>
          <span className={`badge ${totals.failed === 0 ? 'badge--green' : 'badge--red'}`} style={{ fontSize: '0.85rem' }}>
            {totals.failed === 0 ? `✓ ${totals.passed} bestået` : `${totals.failed} fejlede`}
          </span>
        </div>
      </div>

      {/* Pr. område */}
      <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.9rem' }}>Tests pr. område</h4>
      {areaCounts.map((a) => (
        <div key={a.area} style={{ marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
            <span>{AREA_LABELS[a.area] ?? a.area}</span><strong>{a.tests}</strong>
          </div>
          <div style={{ height: 10, background: 'var(--c-bg)', borderRadius: 99, border: '1px solid var(--c-border)', overflow: 'hidden' }}>
            <div style={{ width: `${(a.tests / maxArea) * 100}%`, height: '100%', background: 'var(--c-pitch)' }} />
          </div>
        </div>
      ))}

      {/* Største testfiler */}
      <h4 style={{ margin: '1rem 0 0.4rem', fontSize: '0.9rem' }}>Største testfiler</h4>
      {topFiles.map((s) => (
        <div key={s.file} style={{ marginBottom: '0.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', gap: '0.5rem' }}>
            <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.file}</code>
            <strong>{s.tests.length}</strong>
          </div>
          <div style={{ height: 8, background: 'var(--c-bg)', borderRadius: 99, border: '1px solid var(--c-border)', overflow: 'hidden' }}>
            <div style={{ width: `${(s.tests.length / maxFile) * 100}%`, height: '100%', background: 'var(--c-ok)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailsTab() {
  const { suites } = report;
  const areas = [...new Set(suites.map((s) => s.area))];
  return (
    <div>
      {areas.map((area) => (
        <div key={area} style={{ marginTop: '0.75rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem' }}>{AREA_LABELS[area] ?? area}</h4>
          {suites.filter((s) => s.area === area).map((s) => (
            <details key={s.file} style={{ borderBottom: '1px solid var(--c-border)', padding: '0.4rem 0' }}>
              <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className={`badge ${s.failed === 0 ? 'badge--green' : 'badge--red'}`}>
                  {s.failed === 0 ? `✓ ${s.passed}` : `${s.passed}/${s.passed + s.failed}`}
                </span>
                <code style={{ fontSize: '0.82rem' }}>{s.file}</code>
              </summary>
              <ul style={{ margin: '0.5rem 0 0.25rem', paddingLeft: '1.25rem', listStyle: 'none' }}>
                {s.tests.map((t, i) => (
                  <li key={i} style={{ fontSize: '0.84rem', padding: '0.1rem 0', color: t.status === 'passed' ? 'var(--c-text)' : 'var(--c-err)' }}>
                    <span style={{ color: t.status === 'passed' ? 'var(--c-ok)' : 'var(--c-err)' }}>{t.status === 'passed' ? '✓' : '✗'}</span>{' '}
                    {t.name}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function TestsTab() {
  const [sub, setSub] = useState(SUB.OVERVIEW);
  // TO DATOER, IKKE ÉN. Linjen stod før over underfanerne og sagde "Senest
  // opdateret" om dem alle — men hentede kun testrapportens dato.
  // Afhængighedsdiagrammet er en SELVSTÆNDIG fil (depGraph.json), og et
  // diagram fra en anden kørsel ville have båret en dato, der ikke var dets.
  const datoer = [report.generatedAt, depGraph.generatedAt];
  const gammel = erForaeldet(datoer);
  // ADVARSLEN SKAL NAVNGIVE DEN FIL, DER UDLØSTE DEN. Skrev den altid
  // testrapportens dato, kunne den sige "16 dage", mens den fyrede, fordi
  // diagrammet var 40 dage gammelt — en alarm, der peger på det forkerte.
  const aeldste = aeldsteDato(datoer);
  return (
    <div>
      {/* Husets advarsels-flade i admin er `badge badge--yellow` som blok
          (TeamStylesTab.jsx:119) — ikke en `notice`-klasse. Den findes ikke i
          theme.css, og et opdigtet klassenavn ville rendere HELT uden farve og
          fejle tavst. Samme fælde som `--c-danger`. */}
      {gammel && (
        <p className="badge badge--yellow mb-2" style={{ display: 'block' }} data-testid="rapport-forældet">
          <strong>⚠️ Tallene her er forældede.</strong>{' '}
          {aeldste
            ? `Det ældste af de to øjebliksbilleder er fra ${formatDate(aeldste.iso)}, altså ${Math.floor(aeldste.alder)} dage gammelt.`
            : 'Mindst én af de to filer har en dato, der ikke kan læses — de kan ikke bruges.'}
          {' '}Suiten er sandsynligvis vokset siden — antal tests, filer og
          bestået-andel passer ikke med koden, som den ser ud nu.
          {' '}Kør <strong>Actions → «Opdatér test-rapporten»</strong> og deploy
          derefter platformen; tallene bages ind i bundtet og skifter først ved
          et deploy.
        </p>
      )}

      <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', margin: '0 0 0.75rem' }}>
        Tests-tallene: {formatDate(report.generatedAt)}
        {' · '}Afhængighedsdiagrammet: {formatDate(depGraph.generatedAt)}
        {' · '}opdateres med <code>npm run test:report</code>
      </p>

      <div className="tabs" role="tablist" style={{ marginBottom: '1rem' }}>
        <button role="tab" className={`tab${sub === SUB.OVERVIEW ? ' tab--active' : ''}`} onClick={() => setSub(SUB.OVERVIEW)} data-testid="subtab-overview">📊 Oversigt</button>
        <button role="tab" className={`tab${sub === SUB.DEPS ? ' tab--active' : ''}`} onClick={() => setSub(SUB.DEPS)} data-testid="subtab-deps">🕸️ Afhængigheder</button>
        <button role="tab" className={`tab${sub === SUB.DETAILS ? ' tab--active' : ''}`} onClick={() => setSub(SUB.DETAILS)} data-testid="subtab-details">📋 Detaljer</button>
      </div>

      {sub === SUB.OVERVIEW && <OverviewTab />}
      {sub === SUB.DEPS && <DepGraph />}
      {sub === SUB.DETAILS && <DetailsTab />}
    </div>
  );
}
