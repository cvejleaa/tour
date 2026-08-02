// Forside-kort: de seneste afgjorte etaper med de point brugeren fik på hver.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { recentResults } from './dashboardStats';
import { prettyTeam } from '../../data/tourTeams2026';

function PointsBadge({ points, noTip }) {
  if (points == null) return <span className="badge badge--muted" style={{ fontSize: '0.66rem' }}>intet tip</span>;
  if (noTip) return <span className="badge badge--red" style={{ fontSize: '0.66rem' }}>intet tip · {points}</span>;
  const cls = points > 0 ? 'badge--green' : 'badge--muted';
  return <span className={`badge ${cls}`} style={{ fontSize: '0.68rem' }}>{points} point</span>;
}

export default function RecentResultsCard({ stages, bets, points = {}, limit = 5 }) {
  const rows = useMemo(
    () => recentResults(stages, bets, points, limit),
    [stages, bets, points, limit],
  );
  if (rows.length === 0) return null;

  return (
    <div className="card" data-testid="recent-results-card" style={{ marginBottom: '1rem' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
        <h2 className="card__title" style={{ margin: 0 }}>Seneste resultater</h2>
        <Link to="/etaper" className="badge badge--blue" style={{ textDecoration: 'none' }}>Etaper →</Link>
      </div>
      {rows.map(({ stage, points: pts, bet }) => (
        <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.1rem', borderBottom: '1px solid var(--c-border)', fontSize: '0.86rem' }}>
          <span style={{ fontWeight: 700, minWidth: 78 }}>Etape {stage.number}</span>
          <span style={{ flex: 1, minWidth: 0, color: 'var(--c-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            🏆 {prettyTeam(stage.result?.winnerTeam) || '—'}
          </span>
          <span style={{ minWidth: 64, textAlign: 'right' }}><PointsBadge points={pts} noTip={!bet} /></span>
        </div>
      ))}
    </div>
  );
}
