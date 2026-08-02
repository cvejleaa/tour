// Forside-kort: brugerens egen statistik (tippede etaper, point, træfsikkerhed).
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { computeMyStats } from './dashboardStats';

function Stat({ value, label, color }) {
  return (
    <div style={{ flex: '1 1 5rem', minWidth: '5rem' }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: color || 'var(--c-pitch)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.74rem', color: 'var(--c-muted)' }}>{label}</div>
    </div>
  );
}

export default function MyStatsCard({ stages, bets, points = {} }) {
  const s = useMemo(() => computeMyStats(stages, bets, points), [stages, bets, points]);
  if (s.tips === 0) return null;

  return (
    <div className="card" data-testid="my-stats-card" style={{ marginBottom: '1rem' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.6rem' }}>
        <h2 className="card__title" style={{ margin: 0 }}>Din statistik</h2>
        <Link to="/mine-tips" className="badge badge--blue" style={{ textDecoration: 'none' }}>Mine tips →</Link>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <Stat value={s.points} label="point i alt" />
        <Stat value={s.tips} label="tippede etaper" color="var(--c-text)" />
        <Stat value={`${s.hitPct}%`} label={`podietræf (${s.hits})`} color="var(--c-ok)" />
        <Stat value={s.avgPoints} label="point/etape" color="var(--c-warn)" />
      </div>
    </div>
  );
}
