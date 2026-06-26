// Søjlediagram: hvornår scores der mest (mål pr. minut-interval).
import { computeGoalsByInterval } from './statsUtils';

export default function GoalIntervalCard({ matches }) {
  const { bins, total, peak } = computeGoalsByInterval(matches);
  if (total === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.15rem' }}>⏱️ Mål pr. minut-interval</h2>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-muted)', marginBottom: '0.6rem' }}>
        {total} mål i alt{peak ? ` · der scores mest i ${peak.label}'` : ''}.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {bins.map((b) => (
          <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '3.2rem 1fr 2.6rem', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>{b.label}&apos;</span>
            <div style={{ height: 12, background: 'var(--c-bg)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--c-border)' }}>
              <div style={{
                width: `${peak.count ? Math.round((b.count / peak.count) * 100) : 0}%`,
                height: '100%', background: b.label === peak.label ? 'var(--c-pitch)' : 'var(--c-accent, #6aa84f)',
                transition: 'width .3s',
              }} />
            </div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
              {b.count} <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>({b.pct}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
