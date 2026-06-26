// Admin-fane: grafisk oversigt over alle gennemførte tests + afhængighedsdiagram.
// Data genereres fra den faktiske suite via `npm run test:report`.
import { useState } from 'react';
import report from '../../data/testReport.json';
import DepGraph from './DepGraph';

const AREA_LABELS = { frontend: 'Frontend (UI)', functions: 'Cloud Functions' };
const SUB = { OVERVIEW: 'overview', DEPS: 'deps', DETAILS: 'details' };

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
  return (
    <div>
      <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', margin: '0 0 0.75rem' }}>
        Senest opdateret: {formatDate(report.generatedAt)} · opdateres med <code>npm run test:report</code>
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
