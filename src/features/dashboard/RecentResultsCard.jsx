// Forside-kort: de seneste afsluttede kampe med de point brugeren fik på hver.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { recentResults } from './dashboardStats';
import { teamName } from '../../lib/teams';
import Flag from '../../components/Flag';
import TeamLink from '../../components/TeamLink';

function PointsBadge({ points }) {
  if (points == null) return <span className="badge badge--muted" style={{ fontSize: '0.66rem' }}>intet tip</span>;
  const cls = points > 0 ? 'badge--green' : 'badge--muted';
  return <span className={`badge ${cls}`} style={{ fontSize: '0.68rem' }}>{points} point</span>;
}

export default function RecentResultsCard({ matches, bets, limit = 5 }) {
  const rows = useMemo(() => recentResults(matches, bets, limit), [matches, bets, limit]);
  if (rows.length === 0) return null;

  return (
    <div className="card" data-testid="recent-results-card" style={{ marginBottom: '1rem' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
        <h2 className="card__title" style={{ margin: 0 }}>Seneste resultater</h2>
        <Link to="/statistik" className="badge badge--blue" style={{ textDecoration: 'none' }}>Statistik →</Link>
      </div>
      {rows.map(({ match, points }) => (
        <div key={match.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.1rem', borderBottom: '1px solid var(--c-border)', fontSize: '0.86rem' }}>
          <TeamLink code={match.homeTeam} style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamName(match.homeTeam)}</span>
            {match.homeTeam ? <Flag code={match.homeTeam} size={18} /> : null}
          </TeamLink>
          <strong style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {match.result.home}–{match.result.away}
          </strong>
          <TeamLink code={match.awayTeam} style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            {match.awayTeam ? <Flag code={match.awayTeam} size={18} /> : null}
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamName(match.awayTeam)}</span>
          </TeamLink>
          <span style={{ minWidth: 64, textAlign: 'right' }}><PointsBadge points={points} /></span>
        </div>
      ))}
    </div>
  );
}
